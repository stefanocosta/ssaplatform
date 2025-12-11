import sys
import os
import time
import requests
import calendar
import pandas as pd
from datetime import datetime

# Fix path to allow importing from 'server/app'
sys.path.append(os.path.join(os.path.dirname(__file__), 'server'))

from app import create_app, db
from app.models import MarketData
from app.services.data_manager import save_to_db, TRACKED_ASSETS

app = create_app()

def seed_database():
    with app.app_context():
        api_key = app.config['TWELVE_DATA_API_KEY']
        DELAY_PER_ASSET = 8 # Increased slightly to avoid rate limits with larger payloads

        print(f"🌱 Starting Full Database Seed for {len(TRACKED_ASSETS)} assets...")
        print("---------------------------------------------------")

        for index, symbol in enumerate(TRACKED_ASSETS):
            print(f"[{index+1}/{len(TRACKED_ASSETS)}] Processing {symbol}...")

            # --- INCREASED OUTPUT SIZES FOR BACKTESTING ---
            fetch_and_save(symbol, '1month', api_key, outputsize=500)
            fetch_and_save(symbol, '1week', api_key, outputsize=1000) 
            fetch_and_save(symbol, '1day', api_key, outputsize=3000) # Deep history for Daily
            fetch_and_save(symbol, '4h', api_key, outputsize=3000)   # Deep history for 4h
            fetch_and_save(symbol, '1h', api_key, outputsize=3000)   # Deep history for 1h
            fetch_and_save(symbol, '30min', api_key, outputsize=3000) 
            fetch_and_save(symbol, '1min', api_key, outputsize=5000) # Max standard limit

            print(f"   ↳ Generating 5m & 15m aggregates locally...")
            resample_specific_intervals(symbol)

            print(f"   zzz Sleeping {DELAY_PER_ASSET}s...")
            time.sleep(DELAY_PER_ASSET) 

        print("---------------------------------------------------")
        print("✅ Seeding Complete!")

def fetch_and_save(symbol, interval, api_key, outputsize):
    url = "https://api.twelvedata.com/time_series"
    params = {
        "symbol": symbol,
        "interval": interval,
        "apikey": api_key,
        "outputsize": outputsize,
        "order": "ASC"
    }
    try:
        r = requests.get(url, params=params)
        data = r.json()
        
        if 'values' in data:
            clean_values = []
            for d in data['values']:
                date_str = d['datetime']
                try:
                    # Naive Parse
                    ts = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
                except ValueError:
                    ts = datetime.strptime(date_str, "%Y-%m-%d")
                
                # Raw UTC Timestamp
                utc_timestamp = calendar.timegm(ts.timetuple())

                vol = d.get('volume')
                volume_val = float(vol) if vol else 0.0

                clean_values.append({
                    "time": utc_timestamp, 
                    "datetime_obj": ts, # Naive
                    "open": float(d['open']),
                    "high": float(d['high']),
                    "low": float(d['low']),
                    "close": float(d['close']),
                    "volume": volume_val
                })
            
            save_to_db(symbol, interval, clean_values)
            print(f"   ✓ Fetched {len(clean_values)} rows for {interval}")
        elif 'status' in data and data['status'] == 'error':
             print(f"   ❌ API Error for {interval}: {data['message']}")
    except Exception as e:
        print(f"   ❌ Processing Error: {e}")

def resample_specific_intervals(symbol):
    stmt = db.select(MarketData).filter_by(
        symbol=symbol, 
        interval='1min'
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

    aggregations = {'5min': '5min', '15min': '15min'}

    for interval_name, pandas_rule in aggregations.items():
        ohlc_dict = {'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last', 'volume': 'sum'}
        resampled = df.resample(pandas_rule).agg(ohlc_dict).dropna()
        
        to_save = []
        for time_idx, row in resampled.iterrows():
             to_save.append({
                "datetime_obj": time_idx,
                "open": float(row['open']),
                "high": float(row['high']),
                "low": float(row['low']),
                "close": float(row['close']),
                "volume": float(row['volume'])
            })
        save_to_db(symbol, interval_name, to_save)

if __name__ == '__main__':
    seed_database()