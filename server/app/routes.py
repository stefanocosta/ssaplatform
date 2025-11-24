from flask import Blueprint, request, jsonify, current_app
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
# Import extensions/models that will be defined in __init__.py and models.py
from . import db 
from app.models import User 
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from sqlalchemy import select 

from .services import ssa_service, twelvedata_service, forecast_service

# The main blueprint for API routes (including trading and auth)
bp = Blueprint('api', __name__, url_prefix='/api')


# --- NEW: User Authentication Routes (PRESERVED) ---

@bp.route('/register', methods=['POST'])
def register():
    """Endpoint for user registration."""
    data = request.get_json()
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')

    if not username or not email or not password:
        return jsonify({"msg": "Missing username, email, or password"}), 400

    # Check for existing user/email (using SQLAlchemy 2.0 style)
    existing_user = db.session.execute(
        db.select(User).filter_by(username=username)
    ).scalar_one_or_none()
    
    existing_email = db.session.execute(
        db.select(User).filter_by(email=email)
    ).scalar_one_or_none()
    
    if existing_user or existing_email:
        return jsonify({"msg": "User or email already exists"}), 409

    new_user = User(username=username, email=email)
    new_user.set_password(password) # Hash the password

    try:
        db.session.add(new_user)
        db.session.commit()
        return jsonify({"msg": "User registered successfully"}), 201
    except Exception as e:
        db.session.rollback()
        # Log the error for debugging
        current_app.logger.error(f"Registration failed for user {username}: {e}")
        return jsonify({"msg": "Registration failed due to server error."}), 500

@bp.route('/login', methods=['POST'])
def login():
    """Endpoint for user login and JWT generation."""
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    # Query user (using SQLAlchemy 2.0 style)
    user = db.session.execute(
        db.select(User).filter_by(username=username)
    ).scalar_one_or_none()

    if user is None or not user.check_password(password):
        return jsonify({"msg": "Bad username or password"}), 401

    # Create a JWT token containing the user's ID as a STRING
    access_token = create_access_token(identity=str(user.id))
    return jsonify(access_token=access_token, username=user.username), 200

@bp.route('/user-info', methods=['GET'])
@jwt_required()
def user_info():
    """Returns basic info for the logged-in user."""
    user_id_str = get_jwt_identity()
    try:
        user_id = int(user_id_str)
    except ValueError:
        return jsonify({"msg": "Invalid user ID in token"}), 401
    
    # Query user (using SQLAlchemy 2.0 style)
    user = db.session.execute(
        db.select(User).filter_by(id=user_id)
    ).scalar_one_or_none()
    
    if user:
        return jsonify(user_id=user.id, username=user.username, email=user.email), 200
    return jsonify({"msg": "User not found"}), 404

# --- END User Authentication Routes ---


# --- TRADING DATA ROUTES (UPDATED) ---

@bp.route('/chart-data', methods=['GET'])
@jwt_required()
def get_chart_data():
    symbol = request.args.get('symbol', 'BTC/USD')
    interval = request.args.get('interval', '1day')
    use_adaptive_l = request.args.get('adaptive_l', 'true').lower() == 'true'
    try:
        l_param = int(request.args.get('l', 30))
    except ValueError:
        l_param = 30

    # --- 1. Fetch Data ---
    print(f"Fetching FRESH data for {symbol} - {interval}")
    ohlc_data = twelvedata_service.get_twelvedata_ohlc(
        symbol, interval, current_app.config['TWELVE_DATA_API_KEY'], 500
    )
    if ohlc_data is None or not ohlc_data:
        return jsonify({"error": f"Failed to fetch data for {symbol}"}), 500

    df = pd.DataFrame(ohlc_data)
    if 'close' not in df.columns or df['close'].isnull().all():
         return jsonify({"error": "Close price data missing or invalid after fetch"}), 500

    # --- FIX 1: CHRONOLOGICAL SORTING ---
    # API returns Newest->Oldest. We MUST sort Ascending (Oldest->Newest) for SSA/Forecast.
    if 'time' in df.columns:
        df['time'] = pd.to_numeric(df['time']) 
        df.sort_values('time', ascending=True, inplace=True)

    close_prices = df['close'].values.flatten()
    times = df['time'].values

    N = len(close_prices)
    if N < 10:
         return jsonify({"error": f"Insufficient data points ({N}) for SSA"}), 400

    # Determine L
    if use_adaptive_l:
        L = 39 
    else:
        L = l_param

    if L < 2 or L >= N:
        L = max(2, min(N // 2, 30))

    # --- 2. Perform SSA ---
    try:
        components = ssa_service.ssa_decomposition(close_prices, L)
    except Exception as e:
        return jsonify({"error": f"Unexpected error during SSA: {e}"}), 500

    # Extract components
    trend = components[0] if components.shape[0] > 0 else np.zeros_like(close_prices)
    cyclic = components[1:min(3, L)].sum(axis=0) if components.shape[0] > 1 and L > 1 else np.zeros_like(close_prices)
    noise = components[min(3, L):min(6, L)].sum(axis=0) if components.shape[0] >= min(3, L) and L > min(3, L) else np.zeros_like(close_prices)

    # --- FIX 2: UNIFIED FORECAST CALCULATION ---
    # Calculate forecast HERE using the same components to avoid double-loading
    forecast_steps = 40
    forecast_payload = []
    try:
        forecast_values = forecast_service.forecast_ssa_spectral(
            components, 
            forecast_steps=forecast_steps, 
            min_component=1
        )
        # Use the last timestamp from the SORTED dataframe
        last_timestamp = int(df['time'].iloc[-1])
        future_times = forecast_service.generate_future_timestamps(last_timestamp, interval, forecast_steps)
        
        for t, v in zip(future_times, forecast_values):
            forecast_payload.append({"time": int(t), "value": float(v)})
            
        print(f"Forecast calculated: {len(forecast_payload)} points")
    except Exception as e:
        print(f"Forecast calculation error: {e}")
        # We continue even if forecast fails, returning empty array
        forecast_payload = []

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
    # Iterate over sorted DF
    for index, row in df.iterrows():
        ohlc_data_serializable.append({
            "time": int(row['time']),
            "open": float(row['open']),
            "high": float(row['high']),
            "low": float(row['low']),
            "close": float(row['close']),
            "volume": float(row['volume'])
        })

    response_data = {
        "ohlc": ohlc_data_serializable,
        "ssa": { "trend": trend_data, "cyclic": cyclic_data, "noise": noise_data },
        "l_used": int(L),
        "forecast": forecast_payload # <-- Unified forecast data
    }

    return jsonify(response_data)

@bp.route('/forecast', methods=['GET'])
def get_forecast():
    # Deprecated: The frontend should now use the 'forecast' field from /chart-data
    return jsonify({"error": "Deprecated. Use /chart-data"}), 410