import numpy as np
from scipy.signal import find_peaks
from . import ssa_service

def calculate_cycle_position(component_values):
    """(Moved from routes.py to be reusable)"""
    if len(component_values) < 5: return 50, 'flat'
    
    peaks, _ = find_peaks(component_values, height=0)
    avg_res = np.mean(component_values[peaks]) if len(peaks) > 0 else max(np.max(component_values), 0.0001)
    
    valleys, _ = find_peaks(-component_values, height=0)
    avg_sup = np.mean(component_values[valleys]) if len(valleys) > 0 else min(np.min(component_values), -0.0001)
    
    rng = avg_res - avg_sup
    if rng == 0: rng = 1.0
    
    pos = ((component_values[-1] - avg_sup) / rng) * 100
    return int(round(pos))

def analyze_market_snapshot(close_prices, L_param=30, use_adaptive=True):
    """
    Returns the signal status for a specific set of price data.
    """
    N = len(close_prices)
    L = 39 if use_adaptive else min(L_param, N // 2)
    
    try:
        # Perform SSA
        components = ssa_service.ssa_decomposition(close_prices, L)
        trend = components[0]
        cyclic = components[1:min(3, L)].sum(axis=0)
        noise = components[min(3, L):min(6, L)].sum(axis=0)
        reconstructed = trend + cyclic
        
        # Current & Previous values
        curr_price = close_prices[-1]
        curr_trend = trend[-1]
        
        curr_recon = reconstructed[-1]
        curr_noise = noise[-1]
        prev_noise = noise[-2]
        
        # Calculate Stats
        cyc_pos = calculate_cycle_position(cyclic)
        fast_pos = calculate_cycle_position(noise)

        # Logic
        is_hot_buy = (curr_recon < curr_trend) and (curr_price < curr_recon)
        is_hot_sell = (curr_recon > curr_trend) and (curr_price > curr_recon)
        is_noise_buy = (curr_noise < 0) and (curr_noise >= prev_noise)
        is_noise_sell = (curr_noise > 0) and (curr_noise <= prev_noise)
        
        signal = None
        if is_hot_buy and is_noise_buy:
            signal = "BUY"
        elif is_hot_sell and is_noise_sell:
            signal = "SELL"
            
        return {
            "signal": signal,
            "price": curr_price,
            "trend": curr_trend,
            "cycle_pct": cyc_pos,
            "fast_pct": fast_pos
        }
    except Exception as e:
        print(f"Signal Engine Error: {e}")
        return None