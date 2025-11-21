import numpy as np
import pandas as pd

def forecast_ssa_spectral(components, forecast_steps=40, min_component=1):
    """
    Forecasts using frequency analysis of SSA components.
    
    Uses all available oscillatory components (from component 1 onwards)
    and extracts the top 6 dominant frequencies for sine wave projection.
    """
    
    # Determine the index of the last available component
    max_component_to_use = components.shape[0] - 1
    
    # Validation: ensure min_component is at least 1 (skipping trend at 0)
    min_component = max(1, min(min_component, max_component_to_use))
    
    # Initialize forecast array
    forecast = np.zeros(forecast_steps)
    
    # --- 1. Trend Forecast (Component 0) ---
    if components.shape[0] > 0:
        # Use a linear extrapolation for the trend component
        trend = components[0]
        x = np.arange(len(trend))
        # Use last 20% of points for trend fitting, at least 5 points
        trend_fit_window = max(5, len(trend) // 5)
        coeffs = np.polyfit(x[-trend_fit_window:], trend[-trend_fit_window:], 1)
        x_future = np.arange(len(trend), len(trend) + forecast_steps)
        trend_forecast = np.polyval(coeffs, x_future)
        forecast += trend_forecast
    
    # --- 2. Component Forecast (FFT) ---
    for comp_idx in range(min_component, max_component_to_use + 1):
        if comp_idx >= components.shape[0]:
            continue
            
        component = components[comp_idx]
        n = len(component)
        
        if n < 4:
            continue
            
        # Perform FFT to find dominant frequencies
        fft_vals = np.fft.fft(component)
        freqs = np.fft.fftfreq(n)
        power = np.abs(fft_vals) ** 2
        
        # Identify dominant frequencies (ignoring DC component at index 0)
        pos_freq_indices = np.where(freqs > 0)[0]
        if not len(pos_freq_indices):
            continue
            
        # Sort by power and select top 6 frequencies (as per original script)
        sorted_indices = pos_freq_indices[np.argsort(power[pos_freq_indices])[::-1]]
        top_n = min(6, len(sorted_indices))
        
        # Project forward using sine waves
        component_forecast = np.zeros(forecast_steps)
        for idx in sorted_indices[:top_n]:
            freq = freqs[idx]
            amp = np.abs(fft_vals[idx]) / n  # Scale amplitude
            phase = np.angle(fft_vals[idx])
            
            # Project this frequency forward (using cosine function in the complex exponential form)
            t = np.arange(n, n + forecast_steps)
            # The original script uses `amp * np.sin(...)`, which implicitly converts from the complex FFT result.
            # We stick to the original structure to match the phase/amplitude scaling:
            wave = amp * np.sin(2 * np.pi * freq * t + phase)
            component_forecast += wave
            
        forecast += component_forecast
    
    # --- 3. Anchoring to Total Reconstruction ---
    # Ensure the forecast starts from the sum of ALL historical components.
    if components.shape[0] > 0 and components[0].size > 0:
        # Sum last value of every component (including trend)
        last_actual = sum(comp[-1] for comp in components if comp.size > 0)
        
        first_forecast = forecast[0]
        forecast = forecast + (last_actual - first_forecast)
    
    return forecast

def generate_future_timestamps(last_timestamp, interval_str, steps):
    """
    Generates the next N timestamps based on the interval string.
    """
    mapping = {
        '1min': 60, '5min': 300, '15min': 900, '30min': 1800,
        '1h': 3600, '2h': 7200, '4h': 14400, 
        '1day': 86400, '1week': 604800, '1month': 2592000
    }
    
    step_seconds = mapping.get(interval_str, 86400)
    
    timestamps = []
    current_ts = last_timestamp
    
    for _ in range(steps):
        current_ts += step_seconds
        timestamps.append(current_ts)
        
    return timestamps