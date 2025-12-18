import requests
import pandas as pd
import numpy as np
import calendar
from datetime import datetime, timezone
from flask import current_app
from app import db
from app.models import MarketData
from app.services.data_manager import save_to_db, TRACKED_ASSETS, track_api_call
from app.services.forward_test_service import run_forward_test 
from app.services.signal_engine import analyze_market_snapshot 

def is_asset_trading(symbol):
    """
    Determines if an asset is currently trading to avoid useless API calls.
    """
    # 1. Crypto is 24/7
    CRYPTO_SYMBOLS = ['BTC', 'ETH', 'ADA', 'BNB', 'DOGE', 'XRP', 'SOL', 'FET', 'ICP']
    is_crypto = any(c in symbol for c in CRYPTO_SYMBOLS)
    if is_crypto: return True
    
    now = datetime.utcnow()
    weekday = now.weekday() # 0=Mon ... 6=Sun
    hour = now.hour
    
    # 2. Stocks (No "/" usually) -> Mon-Fri only
    if '/' not in symbol:
        # Closed Sat (5) and Sun (6)
        if weekday >= 5: return False
        # Closed Friday Night (after 21:00 UTC)
        if weekday == 4 and hour >= 21: return False
        return True
        
    # 3. Forex/Metals (Has "/" but not Crypto) -> Closed Fri 22:00 to Sun 21:00
    # Closed Saturday
    if weekday == 5: return False
    # Closed Friday late (Market closes ~22:00 UTC)
    if weekday == 4 and hour >= 22: return False
    # Closed Sunday early (Market opens ~21:00-22:00 UTC)
    if weekday == 6 and hour < 21: return False 
    
    return True

def enrich_data_with_ssa(symbol, interval, new_candle_dict):
    """
    Fetches historical context, runs SSA, and adds SSA stats to the new_candle_dict.
    
    [PRODUCTION NOTE]: Temporarily DISABLED to save resources. 
    Uncomment the block below to enable SSA caching for Backtesting.
    """
    return new_candle_dict

    # --- SSA LOGIC DISABLED FOR NOW ---
    # try:
    #     # We need ~400-500 bars of history to run a stable SSA
    #     required_history = 500
        
    #     # Fetch recent history from DB (excluding the new candle we are about to save)
    #     stmt = db.select(MarketData.close).filter(
    #         MarketData.symbol == symbol,
    #         MarketData.interval == interval
    #     ).order_by(MarketData.time.desc()).limit(required_history)
        
    #     history_results = db.session.execute(stmt).scalars().all()
        
    #     # Prepare data for SSA (Oldest -> Newest + Current New Candle)
    #     history_closes = list(reversed(history_results))
    #     history_closes.append(new_candle_dict['close'])
        
    #     # If we still don't have enough data (e.g. fresh asset), skip SSA
    #     if len(history_closes) < 50:
    #         return new_candle_dict

    #     # Run Signal Engine Analysis on this snapshot
    #     analysis = analyze_market_snapshot(np.array(history_closes))
        
    #     if analysis:
    #         new_candle_dict['ssa_trend_dir'] = analysis.get('trend_dir')
    #         new_candle_dict['ssa_cycle_pos'] = analysis.get('cycle_pct')
    #         new_candle_dict['ssa_fast_pos'] = analysis.get('fast_pct')
            
    #         if 'raw_trend' in analysis:
    #             new_candle_dict['ssa_trend'] = analysis['raw_trend']
    #             new_candle_dict['ssa_cyclic'] = analysis['raw_cyclic']
    #             new_candle_dict['ssa_noise'] = analysis['raw_noise']
                
    # except Exception as e:
    #     print(f"⚠️ SSA Seed Error ({symbol} {interval}): {e}")
    
    # return new_candle_dict

def update_market_data():
    """
    1. Check Time & Determine Forward Test Triggers (IMMEDIATELY).
    2. Batch fetch 1min data.
    3. Aggregate to higher timeframes (including Weekly from Daily).
    4. Execute Forward Testing if triggered.
    """
    # 1. CAPTURE TIME AT START
    now = datetime.utcnow()
    minute = now.minute
    hour = now.hour
    
    # Decide triggers NOW
    trigger_15m = (minute % 15 == 0)
    trigger_1h = (minute == 0)
    trigger_4h = (minute == 0 and hour % 4 == 0)

    print(f"⏰ Daemon Started at {now.strftime('%H:%M:%S')} | Triggers: 15m={trigger_15m}, 1h={trigger_1h}, 4h={trigger_4h}")

    if not current_app:
        print("❌ [DAEMON ERROR] No active Flask Application Context!")
        return

    api_key = current_app.config.get('TWELVE_DATA_API_KEY')
    if not api_key: return

    # 2. DATA FETCHING LOOP
    chunk_size = 8
    asset_chunks = [TRACKED_ASSETS[i:i + chunk_size] for i in range(0, len(TRACKED_ASSETS), chunk_size)]

    for chunk in asset_chunks:
        # Filter out closed assets
        active_chunk = [s for s in chunk if is_asset_trading(s)]
        
        if not active_chunk:
            continue
            
        symbols_str = ",".join(active_chunk)
        track_api_call(f"Daemon Batch ({len(active_chunk)} assets)")

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

            # Handle single result format vs dictionary
            if len(active_chunk) == 1: 
                if 'code' in resp and resp['code'] >= 400:
                     print(f"⚠️ Error for symbol {active_chunk[0]}: {resp.get('message')}")
                     continue
                resp = {active_chunk[0]: resp}

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
                    
                    # A. Save 1min (Skip SSA for 1min to save resources/time)
                    save_to_db(sym, '1min', clean_values)
                    
                    # B. Build 5m, 15m, 1h, 4h, 1D from 1min (WITH OPTIONAL SSA SEEDING)
                    resample_and_save(sym)
                    
                    # C. Build 1W from 1D (NEW)
                    resample_weekly(sym)
                
                elif isinstance(data, dict) and 'code' in data:
                        print(f"⚠️ Error for symbol {sym}: {data.get('message')}")

        except Exception as e:
            print(f"❌ Daemon Batch Failed: {e}")

    # 3. EXECUTE FORWARD TESTS
    try:
        if trigger_15m:
            print("🚀 Triggering 15m Forward Test...")
            run_forward_test('15min', api_key) 

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
    """
    Aggregates 1min data into 5m, 15m, 30m, 1h, 4h AND 1DAY.
    Optionally calculates SSA for the latest closed candle.
    """
    try:
        # Use last 24h of 1min data
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

        aggregations = {
            '5min': '5min', 
            '15min': '15min', 
            '30min': '30min', 
            '1h': '1h', 
            '4h': '4h',
            '1day': '1D' 
        }

        for interval_name, pandas_rule in aggregations.items():
            ohlc_dict = {'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last', 'volume': 'sum'}
            resampled = df.resample(pandas_rule).agg(ohlc_dict).dropna()

            to_save = []
            for time_idx, row in resampled.tail(1).iterrows(): 
                candle_data = {
                    "datetime_obj": time_idx.replace(tzinfo=timezone.utc),
                    "open": float(row['open']), "high": float(row['high']), "low": float(row['low']),
                    "close": float(row['close']), "volume": float(row['volume'])
                }
                
                # Enrich with SSA (Currently disabled internally)
                candle_data = enrich_data_with_ssa(symbol, interval_name, candle_data)
                
                to_save.append(candle_data)
                
            save_to_db(symbol, interval_name, to_save)
    except Exception as e:
        print(f"❌ Resample Error ({symbol}): {e}")

def resample_weekly(symbol):
    """
    Aggregates 1day data into 1week.
    """
    try:
        # Fetch last 60 days of DAILY data (enough to cover > 8 weeks)
        since = datetime.utcnow() - pd.Timedelta(days=60)
        stmt = db.select(MarketData).filter(
            MarketData.symbol == symbol,
            MarketData.interval == '1day',
            MarketData.time >= since
        ).order_by(MarketData.time.asc())

        results = db.session.execute(stmt).scalars().all()
        if not results: return

        data_list = [{
            'time': r.time, 'open': r.open, 'high': r.high, 'low': r.low, 'close': r.close, 'volume': r.volume
        } for r in results]

        df = pd.DataFrame(data_list)
        df.set_index('time', inplace=True)

        # 'W-MON' ensures weeks start on Monday, matching most financial charts
        ohlc_dict = {'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last', 'volume': 'sum'}
        resampled = df.resample('W-MON', closed='left', label='left').agg(ohlc_dict).dropna()

        to_save = []
        # Update last 2 weeks (Current live week + potentially previous closed week if we missed it)
        for time_idx, row in resampled.tail(2).iterrows(): 
             candle_data = {
                "datetime_obj": time_idx.replace(tzinfo=timezone.utc),
                "open": float(row['open']), "high": float(row['high']), "low": float(row['low']),
                "close": float(row['close']), "volume": float(row['volume'])
            }
             # Enrich weekly data too (Currently disabled)
             candle_data = enrich_data_with_ssa(symbol, '1week', candle_data)
             to_save.append(candle_data)
        
        save_to_db(symbol, '1week', to_save)
    except Exception as e:
        print(f"❌ Weekly Resample Error ({symbol}): {e}")