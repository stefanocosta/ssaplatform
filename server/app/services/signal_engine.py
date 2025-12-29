import numpy as np
from scipy.signal import find_peaks
from . import ssa_service
from . import forecast_service 

def calculate_cycle_position(component_values):
    if len(component_values) < 5: return 50, 'flat'
    peaks, _ = find_peaks(component_values, height=0)
    avg_res = np.mean(component_values[peaks]) if len(peaks) > 0 else max(np.max(component_values), 0.0001)
    valleys, _ = find_peaks(-component_values, height=0)
    avg_sup = np.mean(component_values[valleys]) if len(valleys) > 0 else min(np.min(component_values), -0.0001)
    rng = avg_res - avg_sup
    if rng == 0: rng = 1.0
    pos = ((component_values[-1] - avg_sup) / rng) * 100
    return int(round(pos))

def analyze_market_snapshot(close_prices, L_param=30, use_adaptive=True, strategy='basic'):
    N = len(close_prices)
    L = 39 if use_adaptive else min(L_param, N // 2)
    
    try:
        components = ssa_service.ssa_decomposition(close_prices, L)
        trend = components[0]
        cyclic = components[1:min(3, L)].sum(axis=0)
        noise = components[min(3, L):min(6, L)].sum(axis=0)
        reconstructed = trend + cyclic
        
        curr_price = close_prices[-1]
        curr_trend = trend[-1]
        prev_trend = trend[-2]
        
        curr_recon = reconstructed[-1]
        curr_noise = noise[-1]
        prev_noise = noise[-2]
        prev_prev_noise = noise[-3] if N > 2 else 0
        
        cyc_pos = calculate_cycle_position(cyclic)
        fast_pos = calculate_cycle_position(noise)
        trend_dir = "UP" if curr_trend > prev_trend else "DOWN"
        
        forecast_dir = "FLAT"
        try:
            f_vals = forecast_service.forecast_ssa_spectral(components, forecast_steps=20, min_component=1)
            if len(f_vals) > 0: forecast_dir = "UP" if f_vals[-1] > f_vals[0] else "DOWN"
        except: pass

        signal = None
        
        # --- STRATEGY SELECTION ---
        
        # 1. BASIC (Legacy Multi-Entry Slope Logic)
        if strategy == 'basic':
            is_hot_buy = (curr_recon < curr_trend) and (curr_price < curr_recon)
            is_hot_sell = (curr_recon > curr_trend) and (curr_price > curr_recon)
            
            # Simple Slope check (can trigger multiple times in a row)
            is_noise_buy = (curr_noise < 0) and (curr_noise >= prev_noise)
            is_noise_sell = (curr_noise > 0) and (curr_noise <= prev_noise)
            
            if is_hot_buy and is_noise_buy: signal = "BUY"
            elif is_hot_sell and is_noise_sell: signal = "SELL"

        # 2. BASIC SINGLE (New Pivot Logic)
        elif strategy == 'basic_s':
            is_hot_buy = (curr_recon < curr_trend) and (curr_price < curr_recon)
            is_hot_sell = (curr_recon > curr_trend) and (curr_price > curr_recon)
            
            # Strict Pivot check (V-Shape)
            is_pivot_buy = (curr_noise < 0) and (curr_noise > prev_noise) and (prev_noise <= prev_prev_noise)
            is_pivot_sell = (curr_noise > 0) and (curr_noise < prev_noise) and (prev_noise >= prev_prev_noise)
            
            if is_hot_buy and is_pivot_buy: signal = "BUY"
            elif is_hot_sell and is_pivot_sell: signal = "SELL"
                
        # 3. FAST (Momentum Logic)
        elif strategy == 'fast':
            down_count = 0; up_count = 0
            for k in range(N-10, N): 
                val = noise[k]; prev = noise[k-1]
                triggered_long = False; triggered_short = False
                
                if val < 0:
                    up_count = 0
                    if val < prev: 
                        down_count += 1
                        if down_count == 5: triggered_long = True
                    elif val > prev:
                        if 0 < down_count < 5: triggered_long = True
                        down_count = 0
                elif val > 0:
                    down_count = 0
                    if val > prev: 
                        up_count += 1
                        if up_count == 5: triggered_short = True
                    elif val < prev:
                        if 0 < up_count < 5: triggered_short = True
                        up_count = 0
                else: down_count = 0; up_count = 0
                
                if k == N - 1:
                    if triggered_long: signal = "BUY"
                    elif triggered_short: signal = "SELL"

        return {
            "signal": signal, "price": curr_price, "trend_dir": trend_dir,
            "forecast_dir": forecast_dir, "cycle_pct": cyc_pos, "fast_pct": fast_pos,
            "raw_trend": curr_trend, "raw_cyclic": cyclic[-1], "raw_noise": curr_noise
        }
    except Exception as e:
        print(f"Signal Engine Error: {e}")
        return None