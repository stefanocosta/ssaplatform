import requests
import pandas as pd
import calendar
from datetime import datetime, timezone
from flask import current_app
from app import db
from app.models import MarketData
from app.services.data_manager import save_to_db, TRACKED_ASSETS, track_api_call
from app.services.forward_test_service import run_forward_test 

def update_market_data():
    """
    1. Check Time & Determine Forward Test Triggers (IMMEDIATELY).
    2. Batch fetch 1min data.
    3. Aggregate to higher timeframes.
    4. Execute Forward Testing if triggered.
    """
    # 1. CAPTURE TIME AT START (Fixes the skipping issue)
    now = datetime.utcnow()
    minute = now.minute
    hour = now.hour
    
    # Decide triggers NOW, before the long data fetch begins
    trigger_15m = (minute % 15 == 0)
    trigger_1h = (minute == 0)
    trigger_4h = (minute == 0 and hour % 4 == 0)

    print(f"⏰ Daemon Started at {now.strftime('%H:%M:%S')} | Triggers: 15m={trigger_15m}, 1h={trigger_1h}")

    if not current_app:
        print("❌ [DAEMON ERROR] No active Flask Application Context!")
        return

    api_key = current_app.config.get('TWELVE_DATA_API_KEY')
    if not api_key: return

    # 2. DATA FETCHING LOOP
    chunk_size = 8
    asset_chunks = [TRACKED_ASSETS[i:i + chunk_size] for i in range(0, len(TRACKED_ASSETS), chunk_size)]

    for chunk in asset_chunks:
        symbols_str = ",".join(chunk)
        track_api_call(f"Daemon Batch ({len(chunk)} assets)")

        url = "https://api.twelvedata.com/time_series"
        params = {
            "symbol": symbols_str,
            "interval": "1min",
            "apikey": api_key,
            "outputsize": 30 
        }
        
        try:
            r = requests.get(url, params=params, timeout=10)
            resp = r.json()
            
            if 'code' in resp and isinstance(resp['code'], int) and resp['code'] >= 400:
                print(f"⚠️ API Error: {resp.get('message')}")
                continue

            if len(chunk) == 1: resp = {chunk[0]: resp}

            for sym, data in resp.items():
                if isinstance(data, dict) and 'values' in data:
                    clean_values = []
                    for d in data['values']:
                            vol = d.get('volume')
                            volume_val = float(vol) if vol else 0.0
                            ts = datetime.strptime(d['datetime'], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)

                            clean_values.append({
                            "datetime_obj": ts,
                            "open": float(d['open']),
                            "high": float(d['high']),
                            "low": float(d['low']),
                            "close": float(d['close']),
                            "volume": volume_val
                        })
                    
                    save_to_db(sym, '1min', clean_values)
                    resample_and_save(sym)
                
                elif isinstance(data, dict) and 'code' in data:
                        print(f"⚠️ Error for symbol {sym}: {data.get('message')}")

        except Exception as e:
            print(f"❌ Daemon Batch Failed: {e}")

    # 3. EXECUTE FORWARD TESTS (Based on start time)
    try:
        if trigger_15m:
            print("🚀 Triggering 15m Forward Test...")
            run_forward_test('15min', api_key) # Pass API key for robustness

        if trigger_1h:
            print("🚀 Triggering 1h Forward Test...")
            run_forward_test('1h', api_key)
            
        if trigger_4h:
            print("🚀 Triggering 4h Forward Test...")
            run_forward_test('4h', api_key)
            
    except Exception as e:
        print(f"❌ Forward Test Error: {e}")

    print("✅ [Daemon] Cycle Complete.")

def resample_and_save(symbol):
    try:
        since = datetime.utcnow() - pd.Timedelta(hours=24)
        stmt = db.select(MarketData).filter(
            MarketData.symbol == symbol,
            MarketData.interval == '1min',
            MarketData.time >= since
        ).order_by(MarketData.time.asc())

        results = db.session.execute(stmt).scalars().all()
        if not results: return

        data_list = [{
            'time': r.time, 'open': r.open, 'high': r.high, 'low': r.low, 'close': r.close, 'volume': r.volume
        } for r in results]

        df = pd.DataFrame(data_list)
        df.set_index('time', inplace=True)

        aggregations = {'5min': '5min', '15min': '15min', '30min': '30min', '1h': '1h', '4h': '4h'}

        for interval_name, pandas_rule in aggregations.items():
            ohlc_dict = {'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last', 'volume': 'sum'}
            resampled = df.resample(pandas_rule).agg(ohlc_dict).dropna()

            to_save = []
            for time_idx, row in resampled.tail(1).iterrows(): 
                    to_save.append({
                    "datetime_obj": time_idx.replace(tzinfo=timezone.utc),
                    "open": float(row['open']), "high": float(row['high']), "low": float(row['low']),
                    "close": float(row['close']), "volume": float(row['volume'])
                })
            save_to_db(symbol, interval_name, to_save)
    except Exception as e:
        print(f"❌ Resample Error ({symbol}): {e}")