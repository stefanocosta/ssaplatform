import requests
import calendar
import time
import pandas as pd
from datetime import datetime, timedelta, timezone
from app import db
from app.models import MarketData

# --- DEFINE YOUR ASSETS HERE ---
TRACKED_ASSETS = ['XAU/USD','BTC/USD', 'ETH/USD', 'ADA/USD', 'BNB/USD', 'DOGE/USD', 'XRP/USD', 'SOL/USD', 'FET/USD','ICP/USD',
    'EUR/USD', 'EUR/CAD', 'EUR/AUD','EUR/JPY', 'EUR/GBP','AUD/CAD','AUD/USD','GBP/CAD', 'GBP/USD', 'USD/CAD', 'USD/CHF', 'USD/JPY',
    'AAPL', 'AMZN', 'GOOG', 'MSFT','NVDA', 'META', 'TSLA', 'NFLX']

_api_counter = 0
_last_reset_time = time.time()

def track_api_call(source="Unknown"):
    global _api_counter, _last_reset_time
    current_time = time.time()
    if current_time - _last_reset_time > 60:
        _api_counter = 0
        _last_reset_time = current_time
    _api_counter += 1
    print(f"💰 [API] Call #{_api_counter}/55 | Source: {source}")

def get_historical_data(symbol, interval, api_key, limit=300):
    # 1. NON-TRACKED ASSETS: Fallback to direct API call
    if symbol not in TRACKED_ASSETS:
        return fetch_from_api(symbol, interval, api_key, limit, source="Custom")

    # 2. TRACKED ASSETS: STRICT DB FETCH
    # We rely entirely on the background daemon to populate this data.
    data_query = MarketData.query.filter_by(
        symbol=symbol, 
        interval=interval
    ).order_by(MarketData.time.asc()).all()

    db_data = []
    if len(data_query) >= 1: 
        db_data = [row.to_dict() for row in data_query]

    # Normalize Keys to Unix Timestamp (Int) for consistency
    data_map = {}
    for d in db_data:
        raw_time = d['time']
        if hasattr(raw_time, 'timestamp'):
            ts = int(raw_time.replace(tzinfo=timezone.utc).timestamp())
            d['time'] = ts
            d['datetime_obj'] = raw_time
        else:
            ts = int(raw_time)
            d['time'] = ts
        data_map[ts] = d

    # 3. SYNTHETIC TIP GENERATION
    # Even though we don't fetch new data, we still need to build the
    # "Live Candle" for higher timeframes (15m, 1h, etc.) using the 
    # latest 1-min data available in the DB.
    if interval in ['5min', '15min', '30min', '1h', '4h', '1day', '1week']:
        synthetic_candle = generate_synthetic_tip(symbol, interval)
        if synthetic_candle:
            data_map[synthetic_candle['time']] = synthetic_candle
        
    final_data = sorted(data_map.values(), key=lambda x: x['time'])

    # 4. INITIAL SEEDING (Only if DB is completely empty)
    if not final_data:
        # This only happens once when you add a NEW asset.
        api_data = fetch_from_api(symbol, interval, api_key, outputsize=limit+50, source="Initial Backfill")
        if api_data:
            save_to_db(symbol, interval, api_data)
            # If we just seeded 1min data, we should probably repair aggregates too
            if interval == '1min':
                 repair_aggregates(symbol)
            return api_data 
        return []

    return final_data[-limit:]

def repair_aggregates(symbol):
    """
    Recalculates 5m, 15m, 30m, 1h history from the last 24h of 1min data.
    """
    try:
        since = datetime.utcnow() - timedelta(hours=24)
        stmt = db.select(MarketData).filter(
            MarketData.symbol == symbol,
            MarketData.interval == '1min',
            MarketData.time >= since
        ).order_by(MarketData.time.asc())

        results = db.session.execute(stmt).scalars().all()
        if not results: return

        data_list = [{
            'time': r.time,
            'open': r.open, 'high': r.high, 'low': r.low, 'close': r.close, 'volume': r.volume
        } for r in results]

        df = pd.DataFrame(data_list)
        df.set_index('time', inplace=True)

        aggregations = {'5min': '5min', '15min': '15min', '30min': '30min', '1h': '1h', '4h': '4h'}

        for interval_name, pandas_rule in aggregations.items():
            ohlc_dict = {'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last', 'volume': 'sum'}
            resampled = df.resample(pandas_rule).agg(ohlc_dict).dropna()
            
            to_save = []
            for time_idx, row in resampled.iterrows():
                 to_save.append({
                    "datetime_obj": time_idx,
                    "open": float(row['open']), "high": float(row['high']), "low": float(row['low']),
                    "close": float(row['close']), "volume": float(row['volume'])
                })
            save_to_db(symbol, interval_name, to_save)
    except Exception as e:
        print(f"Aggregate Repair Failed: {e}")

def generate_synthetic_tip(symbol, interval):
    """
    Constructs the latest 'forming' candle for a higher timeframe
    using the raw 1-minute data from the database.
    """
    now = datetime.utcnow()
    
    # Calculate the start time of the current candle
    if interval == '5min':
        minute_block = (now.minute // 5) * 5
        start_time = now.replace(minute=minute_block, second=0, microsecond=0)
    elif interval == '15min':
        minute_block = (now.minute // 15) * 15
        start_time = now.replace(minute=minute_block, second=0, microsecond=0)
    elif interval == '30min':
        minute_block = (now.minute // 30) * 30
        start_time = now.replace(minute=minute_block, second=0, microsecond=0)
    elif interval == '1h':
        start_time = now.replace(minute=0, second=0, microsecond=0)
    elif interval == '4h':
        hour_block = (now.hour // 4) * 4
        start_time = now.replace(hour=hour_block, minute=0, second=0, microsecond=0)
    elif interval == '1day':
        start_time = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif interval == '1week':
        start_time = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        return None

    # Fetch 1-min candles from DB that belong to this timeframe
    candles = MarketData.query.filter(
        MarketData.symbol == symbol,
        MarketData.interval == '1min',
        MarketData.time >= start_time
    ).order_by(MarketData.time.asc()).all()

    if not candles: return None

    open_p = candles[0].open
    high_p = max(c.high for c in candles)
    low_p = min(c.low for c in candles)
    close_p = candles[-1].close
    volume_p = sum((c.volume or 0) for c in candles)
    utc_timestamp = calendar.timegm(start_time.timetuple())

    return { "time": utc_timestamp, "open": open_p, "high": high_p, "low": low_p, "close": close_p, "volume": volume_p }

def fetch_from_api(symbol, interval, api_key, outputsize=500, source="API"):
    track_api_call(f"{source} {symbol} {interval}")
    url = "https://api.twelvedata.com/time_series"
    params = {"symbol": symbol, "interval": interval, "apikey": api_key, "outputsize": outputsize, "order": "ASC"}
    try:
        r = requests.get(url, params=params, timeout=10)
        data = r.json()
        if 'values' in data:
            clean_data = []
            for d in data['values']:
                date_str = d['datetime']
                try:
                    ts = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
                except ValueError:
                    ts = datetime.strptime(date_str, "%Y-%m-%d")
                utc_timestamp = calendar.timegm(ts.timetuple())
                vol = d.get('volume')
                volume_val = float(vol) if vol else 0.0
                clean_data.append({"time": utc_timestamp, "datetime_obj": ts, "open": float(d['open']), "high": float(d['high']), "low": float(d['low']), "close": float(d['close']), "volume": volume_val})
            return clean_data
        else: return None
    except Exception as e:
        print(f"Exception fetching {symbol}: {e}")
        return None

def save_to_db(symbol, interval, data_list):
    try:
        for d in data_list:
            dt_val = d.get('datetime_obj')
            if not dt_val: dt_val = datetime.utcfromtimestamp(d['time'])
            market_data_entry = MarketData(symbol=symbol, interval=interval, time=dt_val, open=d['open'], high=d['high'], low=d['low'], close=d['close'], volume=d['volume'])
            db.session.merge(market_data_entry)
        db.session.commit()
    except Exception as e:
        db.session.rollback()