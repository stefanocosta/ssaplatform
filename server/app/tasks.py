import requests
import pandas as pd
import calendar
from datetime import datetime
from app import db, create_app
from app.models import MarketData
# Import the tracker
from app.services.data_manager import save_to_db, TRACKED_ASSETS, track_api_call

app = create_app()

def update_market_data():
    with app.app_context():
        api_key = app.config['TWELVE_DATA_API_KEY']
        if not api_key: return

        chunk_size = 8
        asset_chunks = [TRACKED_ASSETS[i:i + chunk_size] for i in range(0, len(TRACKED_ASSETS), chunk_size)]

        for chunk in asset_chunks:
            symbols_str = ",".join(chunk)
            
            # TRACK THE CALL
            track_api_call(f"Daemon Batch ({len(chunk)} assets)")

            url = "https://api.twelvedata.com/time_series"
            params = {
                "symbol": symbols_str,
                "interval": "1min",
                "apikey": api_key,
                "outputsize": 5 
            }
            
            try:
                r = requests.get(url, params=params)
                resp = r.json()
                if len(chunk) == 1: resp = {chunk[0]: resp}

                for sym, data in resp.items():
                    if 'values' in data:
                        clean_values = []
                        for d in data['values']:
                             vol = d.get('volume')
                             volume_val = float(vol) if vol else 0.0
                             
                             date_str = d['datetime']
                             ts = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")

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

            except Exception as e:
                print(f"Batch update failed: {e}")

def resample_and_save(symbol):
    since = datetime.utcnow() - pd.Timedelta(hours=24)
    
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

    aggregations = {
        '5min': '5min',
        '15min': '15min', 
        '30min': '30min',
        '1h': '1h'
    }

    for interval_name, pandas_rule in aggregations.items():
        ohlc_dict = {
            'open': 'first',
            'high': 'max',
            'low': 'min',
            'close': 'last',
            'volume': 'sum'
        }
        
        resampled = df.resample(pandas_rule).agg(ohlc_dict).dropna()

        to_save = []
        for time_idx, row in resampled.tail(1).iterrows(): 
             to_save.append({
                "datetime_obj": time_idx,
                "open": float(row['open']),
                "high": float(row['high']),
                "low": float(row['low']),
                "close": float(row['close']),
                "volume": float(row['volume'])
            })
        
        save_to_db(symbol, interval_name, to_save)