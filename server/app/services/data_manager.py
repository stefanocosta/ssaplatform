import requests
import calendar
import time
from datetime import datetime, timedelta
from app import db
from app.models import MarketData

# --- DEFINE YOUR ASSETS HERE ---
TRACKED_ASSETS = ['XAU/USD','BTC/USD', 'ETH/USD', 'ADA/USD', 'BNB/USD', 'DOGE/USD', 'XRP/USD', 'SOL/USD', 'FET/USD','ICP/USD',
    'EUR/USD', 'EUR/CAD', 'EUR/AUD','EUR/JPY', 'EUR/GBP','AUD/CAD','AUD/USD','GBP/CAD', 'GBP/USD', 'USD/CAD', 'USD/CHF', 'USD/JPY',
    'AAPL', 'AMZN', 'GOOG', 'MSFT','NVDA', 'META', 'TSLA', 'NFLX']

# --- API USAGE TRACKER ---
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

# --- CACHE CONFIG ---
FETCH_COOLDOWN = {}
COOLDOWN_1MIN = 10 

def get_historical_data(symbol, interval, api_key, limit=300):
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
    # OPTIMIZED HYBRID STRATEGY + SMART GAP HEALER
    # =========================================================
    if db_data:
        if interval in ['5min', '15min', '30min', '1h', '4h', '1day', '1week']:
            synthetic_candle = generate_synthetic_tip(symbol, interval)
            if synthetic_candle:
                data_map[synthetic_candle['time']] = synthetic_candle
        
        elif interval == '1min':
            cache_key = f"{symbol}_{interval}"
            current_time = time.time()
            last_fetch = FETCH_COOLDOWN.get(cache_key, 0)
            
            last_db_timestamp = data_query[-1].time
            time_diff = (datetime.utcnow() - last_db_timestamp).total_seconds()
            
            should_fetch = False
            fetch_size = 1
            fetch_reason = "HotFetch"

            # --- SMART GAP HEALER ---
            # If gap > 5 mins, calculate exactly how much we missed.
            if time_diff > 300:
                should_fetch = True
                missing_candles = int(time_diff / 60)
                # Fetch enough to cover the gap + buffer, but capped at 4800 (API Max is 5000)
                # This auto-heals up to ~3.3 days of downtime automatically.
                fetch_size = min(max(limit, missing_candles + 60), 4800)
                fetch_reason = f"GapRepair ({missing_candles}m)"
            
            # --- STANDARD UPDATE ---
            elif (current_time - last_fetch > COOLDOWN_1MIN) and (time_diff > 10):
                should_fetch = True
                fetch_size = 1
                fetch_reason = "HotFetch"

            if should_fetch:
                latest_candles = fetch_from_api(symbol, interval, api_key, outputsize=fetch_size, source=fetch_reason)
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
            return api_data 
        return []

    return final_data[-limit:]

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

    if not candles:
        return None

    open_p = candles[0].open
    high_p = max(c.high for c in candles)
    low_p = min(c.low for c in candles)
    close_p = candles[-1].close
    volume_p = sum((c.volume or 0) for c in candles)
    
    utc_timestamp = calendar.timegm(start_time.timetuple())

    return {
        "time": utc_timestamp,
        "open": open_p,
        "high": high_p,
        "low": low_p,
        "close": close_p,
        "volume": volume_p
    }

def fetch_from_api(symbol, interval, api_key, outputsize=500, source="API"):
    track_api_call(f"{source} {symbol} {interval}")

    url = "https://api.twelvedata.com/time_series"
    params = {
        "symbol": symbol,
        "interval": interval,
        "apikey": api_key,
        "outputsize": outputsize,
        "order": "ASC"
    }
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

                clean_data.append({
                    "time": utc_timestamp, 
                    "datetime_obj": ts, 
                    "open": float(d['open']),
                    "high": float(d['high']),
                    "low": float(d['low']),
                    "close": float(d['close']),
                    "volume": volume_val
                })
            return clean_data
        else:
            return None
    except Exception as e:
        print(f"Exception fetching {symbol}: {e}")
        return None

def save_to_db(symbol, interval, data_list):
    try:
        for d in data_list:
            dt_val = d.get('datetime_obj')
            if not dt_val:
                 dt_val = datetime.utcfromtimestamp(d['time'])

            market_data_entry = MarketData(
                symbol=symbol,
                interval=interval,
                time=dt_val,
                open=d['open'],
                high=d['high'],
                low=d['low'],
                close=d['close'],
                volume=d['volume']
            )
            db.session.merge(market_data_entry)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        # print(f"Error saving to DB: {e}")