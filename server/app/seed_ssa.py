import sys
import os
import time
import numpy as np
from sqlalchemy import func

# Ensure we can import from the app
sys.path.append(os.getcwd())

from app import create_app, db
from app.models import MarketData
from app.services import ssa_service
# IMPORTED: Get the master list of assets from your data manager
from app.services.data_manager import TRACKED_ASSETS

# --- CONFIG ---
# SSA Parameters
L_PARAM = 39        # Fixed Window Length (Embedding Dimension)
MIN_HISTORY = 200   # Minimum required history (Safe for L=39)
MAX_HISTORY = 500   # Ideal history length (Standard stiffness)
BATCH_SIZE = 100    # Commit to DB every N rows

# Intervals to process
TARGET_INTERVALS = ['15min', '1h', '4h', '1day', '1week']

def clean_series(series):
    """
    Replaces NaNs with the last valid observation (Forward Fill).
    Vital for SSA because SVD crashes on NaNs.
    """
    if np.isnan(series).any():
        mask = np.isnan(series)
        idx = np.where(~mask, np.arange(mask.shape[0]), 0)
        np.maximum.accumulate(idx, axis=0, out=idx)
        series = series[idx]
    return series

def calculate_components(series, L):
    """
    Helper to run SSA and extract specific components.
    """
    try:
        # Run Decomposition
        components = ssa_service.ssa_decomposition(series, L)
        
        # Extract Components (Trend=0, Cyclic=1-2, Noise=3-5)
        trend = components[0]
        cyclic = components[1:min(3, L)].sum(axis=0)
        noise = components[min(3, L):min(6, L)].sum(axis=0)
        
        return float(trend[-1]), float(cyclic[-1]), float(noise[-1])
    
    except Exception as e:
        # Return error string to log it
        return None, None, str(e)

def seed_ssa():
    app = create_app()
    with app.app_context():
        print("🚀 Starting SSA Seeding Script (Adaptive Mode)...")
        print(f"🎯 Intervals: {', '.join(TARGET_INTERVALS)}")
        print(f"📋 Assets: {len(TRACKED_ASSETS)} symbols loaded from DataManager.")
        print(f"⚙️  Config: Min History={MIN_HISTORY}, Max History={MAX_HISTORY}, L={L_PARAM}")

        for symbol in TRACKED_ASSETS:
            for interval in TARGET_INTERVALS:
                
                print(f"\nProcessing {symbol} - {interval}...")
                
                # Fetch Data
                candles = MarketData.query.filter_by(
                    symbol=symbol, 
                    interval=interval
                ).order_by(MarketData.time.asc()).all()

                total_candles = len(candles)
                
                # Check Hard Minimum
                if total_candles < MIN_HISTORY:
                    print(f"   ⚠️ Skipping: Not enough data ({total_candles} < {MIN_HISTORY} required)")
                    continue

                # Prepare Data Array
                raw_closes = [c.close if c.close is not None else np.nan for c in candles]
                closes = np.array(raw_closes, dtype=float)
                
                # Clean Data
                if np.isnan(closes).any():
                    closes = clean_series(closes)
                
                updates_count = 0
                skipped_count = 0
                error_count = 0
                last_error = None
                start_time = time.time()

                # --- ADAPTIVE LOOP ---
                # Start at MIN_HISTORY so we guarantee at least that much data exists
                for i in range(MIN_HISTORY - 1, total_candles):
                    
                    # [OPTIMIZATION] Skip if already calculated
                    if candles[i].ssa_trend is not None:
                        skipped_count += 1
                        if i % 500 == 0:
                            sys.stdout.write(f"\r   Scanning: {i}/{total_candles}")
                            sys.stdout.flush()
                        continue

                    # DYNAMIC WINDOW SELECTION
                    # We grab up to MAX_HISTORY bars, ending at i.
                    # e.g., if MAX=500, but we only have 300 bars total so far, we take 300.
                    
                    start_index = max(0, i - MAX_HISTORY + 1)
                    end_index = i + 1
                    
                    window_slice = closes[start_index : end_index]
                    
                    # Double check (Redundant but safe)
                    if len(window_slice) < MIN_HISTORY:
                        continue

                    # Calculate
                    t_val, c_val, n_val = calculate_components(window_slice, L_PARAM)

                    if t_val is not None:
                        candles[i].ssa_trend = t_val
                        candles[i].ssa_cyclic = c_val
                        candles[i].ssa_noise = n_val
                        
                        # Direction Logic
                        prev_trend = candles[i-1].ssa_trend
                        if prev_trend is None: prev_trend = t_val 
                        
                        candles[i].ssa_trend_dir = "UP" if t_val > prev_trend else "DOWN"
                        
                        updates_count += 1
                    else:
                        error_count += 1
                        last_error = n_val

                    # Progress
                    if i % 50 == 0:
                        used_window = len(window_slice)
                        sys.stdout.write(f"\r   Progress: {i}/{total_candles} | WinSize: {used_window} | Errors: {error_count}")
                        sys.stdout.flush()
                    
                    # Batch Commit
                    if updates_count > 0 and updates_count % BATCH_SIZE == 0:
                        db.session.commit()

                # Final Commit
                if updates_count > 0:
                    db.session.commit()
                
                elapsed = time.time() - start_time
                print(f"\r   ✅ Complete. Updated {updates_count}, Skipped {skipped_count}, Errors {error_count} ({elapsed:.1f}s)")
                
                if error_count > 0:
                    print(f"   ⚠️ LAST ERROR for {symbol}: {last_error}")

        print("\n🎉 SSA Seeding Finished!")

if __name__ == "__main__":
    seed_ssa()