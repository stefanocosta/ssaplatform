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

# --- CONFIGURATION ---
# We increase the cooldown to 55s because the daemon runs every 60s.
# We don't want the web-workers fighting the daemon for the same data.
COOLDOWN_1MIN = 55 
FETCH_COOLDOWN = {}

def track_api_call(source="Unknown"):
    global _api_counter, _last_reset_time
    current_time = time.time()
    if current_time - _last_reset_time > 60:
        _api_counter = 0
        _last_reset_time = current_time
    _api_counter += 1
    print(f"💰 [API] Call #{_api_counter}/55 | Source: {source}")

def get_interval_seconds(interval):
    """Returns the duration of an interval in seconds for staleness calculations."""
    mapping = {
        '1min': 60,
        '5min': 300,
        '15min': 900,
        '30min': 1800,
        '1h': 3600,
        '2h': 7200,
        '4h': 14400,
        '1day': 86400,
        '1week': 604800,
        '1month': 2592000
    }
    return mapping.get(interval, 60)

def get_historical_data(symbol, interval, api_key, limit=300):
    # If asset is not tracked, fall back to direct API call
    if symbol not in TRACKED_ASSETS:
        return fetch_from_api(symbol, interval, api_key, limit, source="Custom")

    # 1. Fetch Main History from DB
    data_query = MarketData.query.filter_by(
        symbol=symbol, 
        interval=interval
    ).order_by(MarketData.time.asc()).all()

    db_data = []
    if len(data_query) >= 1: 
        db_data = [row.to_dict() for row in data_query]

    data_map = {d['time']: d for d in db_data}

    # =========================================================
    # UNIVERSAL GAP HEALER (DYNAMIC TOLERANCE)
    # =========================================================
    if db_data:
        last_db_timestamp = data_query[-1].time
        # Calculate how long ago the last candle started
        time_diff = (datetime.utcnow() - last_db_timestamp).total_seconds()
        
        # Determine allowed gap based on interval duration
        interval_secs = get_interval_seconds(interval)
        
        # We allow the gap to be the length of the candle + 5 minutes buffer.
        # e.g., A 1-hour candle is valid for 65 minutes from its start time.
        allowed_gap = interval_secs + 300 
        
        # --- 1. GAP DETECTED (> Allowed Duration) ---
        if time_diff > allowed_gap:
            track_api_call(f"Universal GapRepair {symbol} {interval} (Diff: {int(time_diff)}s > {allowed_gap}s)")
            
            # Fetch 1000 candles to patch the hole
            repair_candles = fetch_from_api(symbol, '1min', api_key, outputsize=1000, source=f"Universal GapRepair {symbol}")
            
            if repair_candles:
                # 1. Save 1min data (Fixes 1min chart)
                save_to_db(symbol, '1min', repair_candles)
                
                # 2. Update the in-memory map if user asked for 1min
                if interval == '1min':
                    for c in repair_candles: data_map[c['time']] = c
                
                # 3. CRITICAL FIX: REPAIR AGGREGATES
                # We must recalculate 5m/15m/1h history using this new data
                repair_aggregates(symbol)
                
                # 4. If user asked for aggregate (e.g. 1h), we must reload DB data
                # because repair_aggregates just saved new 1h candles to DB
                if interval != '1min':
                    new_agg_query = MarketData.query.filter_by(symbol=symbol, interval=interval).order_by(MarketData.time.asc()).all()
                    db_data = [row.to_dict() for row in new_agg_query]
                    data_map = {d['time']: d for d in db_data}

        # --- 2. SYNTHETIC TIP GENERATION ---
        if interval in ['5min', '15min', '30min', '1h', '4h', '1day', '1week']:
            synthetic_candle = generate_synthetic_tip(symbol, interval)
            if synthetic_candle:
                data_map[synthetic_candle['time']] = synthetic_candle
        
        # --- 3. HOT FETCH (1min Only) ---
        # Only run this if the data is slightly old (>65s) AND we haven't fetched recently.
        # The daemon runs every 60s, so normally the DB is fresh enough.
        elif interval == '1min':
            cache_key = f"{symbol}_{interval}"
            current_time = time.time()
            last_fetch = FETCH_COOLDOWN.get(cache_key, 0)
            
            if (current_time - last_fetch > COOLDOWN_1MIN) and (time_diff > 65):
                latest_candles = fetch_from_api(symbol, interval, api_key, outputsize=1, source=f"HotFetch 1m {symbol}")
                FETCH_COOLDOWN[cache_key] = time.time()
                if latest_candles:
                    for candle in latest_candles:
                        data_map[candle['time']] = candle
                    save_to_db(symbol, interval, latest_candles)

    final_data = sorted(data_map.values(), key=lambda x: x['time'])

    if not final_data:
        api_data = fetch_from_api(symbol, interval, api_key, outputsize=limit+50, source="Backfill")
        if api_data:
            save_to_db(symbol, interval, api_data)
            # Initial seed needs aggregate repair too
            repair_aggregates(symbol) 
            return api_data 
        return []

    return final_data[-limit:]

def repair_aggregates(symbol):
    """
    Recalculates 5m, 15m, 30m, 1h history from the last 24h of 1min data.
    This fixes gaps in higher timeframes after a GapRepair.
    """
    try:
        # Load last 24 hours of 1-min data
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
            'open': r.open,
            'high': r.high,
            'low': r.low,
            'close': r.close,
            'volume': r.volume
        } for r in results]

        df = pd.DataFrame(data_list)
        df.set_index('time', inplace=True)

        aggregations = {'5min': '5min', '15min': '15min', '30min': '30min', '1h': '1h'}

        for interval_name, pandas_rule in aggregations.items():
            ohlc_dict = {'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last', 'volume': 'sum'}
            resampled = df.resample(pandas_rule).agg(ohlc_dict).dropna()
            
            to_save = []
            for time_idx, row in resampled.iterrows():
                 to_save.append({
                    "datetime_obj": time_idx, # Naive UTC from Pandas
                    "open": float(row['open']),
                    "high": float(row['high']),
                    "low": float(row['low']),
                    "close": float(row['close']),
                    "volume": float(row['volume'])
                })
            save_to_db(symbol, interval_name, to_save)
    except Exception as e:
        print(f"Aggregate Repair Failed: {e}")

def generate_synthetic_tip(symbol, interval):
    now = datetime.utcnow()
    
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