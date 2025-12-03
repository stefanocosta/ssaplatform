import requests
import calendar
import time
from datetime import datetime, timedelta
from app import db
from app.models import MarketData

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

FETCH_COOLDOWN = {}
COOLDOWN_1MIN = 10 

def get_historical_data(symbol, interval, api_key, limit=300):
    if symbol not in TRACKED_ASSETS:
        return fetch_from_api(symbol, interval, api_key, limit, source="Custom")

    # 1. Fetch Main History from DB
    # Note: We fetch more than 'limit' to handle synthetic building if needed
    data_query = MarketData.query.filter_by(
        symbol=symbol, 
        interval=interval
    ).order_by(MarketData.time.asc()).all()

    # Special Case: If requesting Aggregate (e.g. 1h) but DB is empty/stale,
    # we might need to check the 1min source data health too. 
    # But simpler strategy: Check the requested interval first.

    db_data = []
    if len(data_query) >= 1: 
        db_data = [row.to_dict() for row in data_query]

    data_map = {d['time']: d for d in db_data}

    # =========================================================
    # UNIVERSAL GAP HEALER & HOT UPDATE
    # =========================================================
    if db_data:
        last_db_timestamp = data_query[-1].time
        time_diff = (datetime.utcnow() - last_db_timestamp).total_seconds()
        
        # --- 1. GAP REPAIR (Any Interval) ---
        # If DB data is older than 5 minutes (300s), something is wrong.
        # We trigger a repair of the SOURCE (1min data) because that feeds everything.
        if time_diff > 300:
            # We fetch 1min data to fill the gap
            # missing_minutes = int(time_diff / 60)
            # fetch_size = min(max(500, missing_minutes + 60), 4800)
            
            # Simplified: Just fetch last 500 1-min candles to patch the recent hole
            # This repairs the underlying data source for all synthetic charts.
            repair_candles = fetch_from_api(symbol, '1min', api_key, outputsize=1000, source="Universal GapRepair")
            if repair_candles:
                save_to_db(symbol, '1min', repair_candles)
                
                # If the user asked for 1min, update map directly
                if interval == '1min':
                    for c in repair_candles: data_map[c['time']] = c
        
        # --- 2. SYNTHETIC GENERATION ---
        # Now that 1min source is potentially repaired, generate the requested tip
        if interval in ['5min', '15min', '30min', '1h', '4h', '1day', '1week']:
            synthetic_candle = generate_synthetic_tip(symbol, interval)
            if synthetic_candle:
                data_map[synthetic_candle['time']] = synthetic_candle
        
        # --- 3. HOT FETCH (1min Only) ---
        elif interval == '1min':
            cache_key = f"{symbol}_{interval}"
            current_time = time.time()
            last_fetch = FETCH_COOLDOWN.get(cache_key, 0)
            
            if (current_time - last_fetch > COOLDOWN_1MIN) and (time_diff > 10):
                latest_candles = fetch_from_api(symbol, interval, api_key, outputsize=1, source="HotFetch 1m")
                FETCH_COOLDOWN[cache_key] = time.time()
                
                if latest_candles:
                    for candle in latest_candles:
                        data_map[candle['time']] = candle
                    save_to_db(symbol, interval, latest_candles)

    final_data = sorted(data_map.values(), key=lambda x: x['time'])

    if not final_data:
        # Initial Backfill
        # If DB is empty, we fetch the requested interval directly (for Seed speed)
        # OR we could fetch 1min and synthesize. 
        # Direct fetch is safer for "First Load".
        api_data = fetch_from_api(symbol, interval, api_key, outputsize=limit+50, source="Backfill")
        if api_data:
            save_to_db(symbol, interval, api_data)
            return api_data 
        return []

    return final_data[-limit:]

def generate_synthetic_tip(symbol, interval):
    # (Same function as before - no changes needed here)
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