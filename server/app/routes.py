from flask import Blueprint, request, jsonify, current_app
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from .services import ssa_service, twelvedata_service, forecast_service
# --- MODIFIED: Import forecast_service ---

bp = Blueprint('api', __name__, url_prefix='/api')

@bp.route('/chart-data', methods=['GET'])
def get_chart_data():
    symbol = request.args.get('symbol', 'BTC/USD')
    interval = request.args.get('interval', '1day')
    use_adaptive_l = request.args.get('adaptive_l', 'true').lower() == 'true'
    try:
        l_param = int(request.args.get('l', 30))
    except ValueError:
        l_param = 30

    # --- Fetching ---
    print(f"Fetching FRESH data for {symbol} - {interval}")
    ohlc_data = twelvedata_service.get_twelvedata_ohlc(
        symbol, interval, current_app.config['TWELVE_DATA_API_KEY'], 500
    )
    if ohlc_data is None:
        return jsonify({"error": f"Failed to fetch data for {symbol}"}), 500

    if not ohlc_data:
         return jsonify({"error": "No OHLC data available for SSA"}), 500

    df = pd.DataFrame(ohlc_data)
    if 'close' not in df.columns or df['close'].isnull().all():
         return jsonify({"error": "Close price data missing or invalid after fetch"}), 500

    close_prices = df['close'].values.flatten()
    times = df['time'].values 

    N = len(close_prices)
    if N < 10:
         return jsonify({"error": f"Insufficient data points ({N}) for SSA"}), 400

    # Determine L
    if use_adaptive_l:
        L = 39 # Fixed for now based on previous context, or use ssa_service.calculate_adaptive_L(close_prices)
    else:
        L = l_param

    if L < 2 or L >= N:
        L = max(2, min(N // 2, 30))

    # Perform SSA
    try:
        components = ssa_service.ssa_decomposition(close_prices, L)
    except Exception as e:
        return jsonify({"error": f"Unexpected error during SSA: {e}"}), 500

    # Extract components
    trend = components[0] if components.shape[0] > 0 else np.zeros_like(close_prices)
    cyclic = components[1:min(3, L)].sum(axis=0) if components.shape[0] > 1 and L > 1 else np.zeros_like(close_prices)
    noise = components[min(3, L):min(6, L)].sum(axis=0) if components.shape[0] >= min(3, L) and L > min(3, L) else np.zeros_like(close_prices)

    # Prepare data for response
    cyclic_data = []
    for i in range(len(times)):
        t = times[i]; v = cyclic[i]; color = 'gray'
        if not np.isnan(v):
            if v > 0: color = '#8B0000' if i > 0 and v > cyclic[i-1] else '#FFA500'
            elif v < 0: color = '#00FF00' if i > 0 and v > cyclic[i-1] else '#006400'
            cyclic_data.append({"time": int(t), "value": float(v), "color": color})

    noise_data = []
    for i in range(len(times)):
        t = times[i]; v = noise[i]; color = 'gray'
        if not np.isnan(v):
            color = '#DC143C' if v >= 0 else '#228B22'
            noise_data.append({"time": int(t), "value": float(v), "color": color})

    trend_data = [{"time": int(t), "value": float(v)} for t, v in zip(times, trend) if not np.isnan(v)]

    ohlc_data_serializable = []
    for item in ohlc_data:
        ohlc_data_serializable.append({
            "time": int(item.get("time", 0)),
            "open": float(item.get("open", 0.0)),
            "high": float(item.get("high", 0.0)),
            "low": float(item.get("low", 0.0)),
            "close": float(item.get("close", 0.0)),
            "volume": float(item.get("volume", 0.0))
        })

    response_data = {
        "ohlc": ohlc_data_serializable,
        "ssa": { "trend": trend_data, "cyclic": cyclic_data, "noise": noise_data },
        "l_used": int(L)
    }

    return jsonify(response_data)

@bp.route('/forecast', methods=['GET'])
def get_forecast():
    symbol = request.args.get('symbol', 'BTC/USD')
    interval = request.args.get('interval', '1day')
    use_adaptive_l = request.args.get('adaptive_l', 'true').lower() == 'true'
    try:
        l_param = int(request.args.get('l', 30))
    except ValueError:
        l_param = 30
    
    forecast_steps = 40 

    # Fetch Data
    ohlc_data = twelvedata_service.get_twelvedata_ohlc(
        symbol, interval, current_app.config['TWELVE_DATA_API_KEY'], 500
    )
    
    if not ohlc_data:
        return jsonify({"error": "No data for forecast"}), 500

    df = pd.DataFrame(ohlc_data)
    close_prices = df['close'].values.flatten()
    
    # Determine L
    N = len(close_prices)
    if use_adaptive_l:
        L = 39 
    else:
        L = l_param
    L = max(2, min(N // 2, 30)) if (L < 2 or L >= N) else L

    # Perform SSA
    try:
        components = ssa_service.ssa_decomposition(close_prices, L)
    except Exception as e:
        return jsonify({"error": f"SSA failed: {e}"}), 500

    # Generate Forecast
    try:
        # --- MODIFIED: max_component parameter removed ---
        forecast_values = forecast_service.forecast_ssa_spectral(
            components, 
            forecast_steps=forecast_steps, 
            min_component=1
        )
        
        # Generate future timestamps
        last_timestamp = int(df['time'].iloc[-1])
        future_times = forecast_service.generate_future_timestamps(last_timestamp, interval, forecast_steps)
        
        # Format for frontend
        forecast_data = []
        for t, v in zip(future_times, forecast_values):
            forecast_data.append({"time": int(t), "value": float(v)})
            
        return jsonify({"forecast": forecast_data})
        
    except Exception as e:
        print(f"Forecast error: {e}")
        return jsonify({"error": f"Forecast failed: {e}"}), 500