from flask import Blueprint, request, jsonify, current_app
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from .services import ssa_service, twelvedata_service
# Remove cache imports if not using cache yet
# from . import db
# from .models import CachedData

bp = Blueprint('api', __name__, url_prefix='/api')

# Remove cache expiry if not using cache
# CACHE_EXPIRY = { ... }

@bp.route('/chart-data', methods=['GET'])
def get_chart_data():
    symbol = request.args.get('symbol', 'BTC/USD')
    interval = request.args.get('interval', '1day')
    use_adaptive_l = request.args.get('adaptive_l', 'true').lower() == 'true'
    try:
        l_param = int(request.args.get('l', 30))
    except ValueError:
        l_param = 30

    # --- Fetching (No Cache Version) ---
    print(f"Fetching FRESH data for {symbol} - {interval}")
    ohlc_data = twelvedata_service.get_twelvedata_ohlc(
        symbol, interval, current_app.config['TWELVE_DATA_API_KEY'], 500
    )
    if ohlc_data is None:
        return jsonify({"error": f"Failed to fetch data for {symbol}"}), 500
    # --- End Fetching ---

    if not ohlc_data:
         return jsonify({"error": "No OHLC data available for SSA"}), 500

    df = pd.DataFrame(ohlc_data)
    if 'close' not in df.columns or df['close'].isnull().all():
         return jsonify({"error": "Close price data missing or invalid after fetch"}), 500

    close_prices = df['close'].values.flatten()
    times = df['time'].values # Keep timestamps

    N = len(close_prices)
    if N < 10:
         return jsonify({"error": f"Insufficient data points ({N}) for SSA"}), 400

    # Determine L
    if use_adaptive_l:
        L = 39 #ssa_service.calculate_adaptive_L(close_prices)
        print(f"Using adaptive L = {L}")
    else:
        L = l_param

    # Validate L
    if L < 2 or L >= N:
        L = max(2, min(N // 2, 30))
        print(f"Adjusted L to {L} due to data length")

    # Perform SSA
    try:
        components = ssa_service.ssa_decomposition(close_prices, L)
        print(f"SSA decomposition successful with L={L}. Components shape: {components.shape}")
    except ValueError as e:
        print(f"SSA Decomposition failed: {e}")
        return jsonify({"error": f"SSA Decomposition failed: {e}"}), 500
    except Exception as e:
        print(f"Unexpected error during SSA: {e}")
        return jsonify({"error": f"Unexpected error during SSA: {e}"}), 500

    # Extract Trend, Cyclic, Noise
    trend = components[0] if components.shape[0] > 0 else np.zeros_like(close_prices)
    cyclic = components[1:min(3, L)].sum(axis=0) if components.shape[0] > 1 and L > 1 else np.zeros_like(close_prices)
    #noise = components[min(3, L):].sum(axis=0) if components.shape[0] >= min(3, L) and L > min(3, L) else np.zeros_like(close_prices)
    noise = components[min(3, L):min(6, L)].sum(axis=0) if components.shape[0] >= min(3, L) and L > min(3, L) else np.zeros_like(close_prices)

    # Prepare SSA data for TradingView (time, value, color format) with JSON serialization fix
    cyclic_data = []
    for i in range(len(times)):
        t = times[i]; v = cyclic[i]; color = 'gray'
        if not np.isnan(v):
            if v > 0: color = '#8B0000' if i > 0 and v > cyclic[i-1] else '#FFA500' # darkred / orange
            elif v < 0: color = '#00FF00' if i > 0 and v > cyclic[i-1] else '#006400' # lime / darkgreen
            cyclic_data.append({"time": int(t), "value": float(v), "color": color})

    noise_data = []
    for i in range(len(times)):
        t = times[i]; v = noise[i]; color = 'gray'
        if not np.isnan(v):
            color = '#DC143C' if v >= 0 else '#228B22' # crimson red / forest green
            noise_data.append({"time": int(t), "value": float(v), "color": color})

    trend_data = [{"time": int(t), "value": float(v)} for t, v in zip(times, trend) if not np.isnan(v)]

    # Ensure ohlc_data uses standard types
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