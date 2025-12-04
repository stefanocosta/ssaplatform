from flask import Blueprint, request, jsonify, current_app
import pandas as pd
import numpy as np
from datetime import datetime, timedelta, timezone
# Import extensions/models
from . import db 
from app.models import User 
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from sqlalchemy import select 

from .services import ssa_service, forecast_service
from app.services.data_manager import get_historical_data

from app.services.data_manager import TRACKED_ASSETS # Import the list

# The main blueprint for API routes
bp = Blueprint('api', __name__, url_prefix='/api')

# --- AUTHENTICATION ROUTES ---

@bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')

    if not username or not email or not password:
        return jsonify({"msg": "Missing username, email, or password"}), 400

    existing_user = db.session.execute(
        db.select(User).filter_by(username=username)
    ).scalar_one_or_none()
    
    existing_email = db.session.execute(
        db.select(User).filter_by(email=email)
    ).scalar_one_or_none()
    
    if existing_user or existing_email:
        return jsonify({"msg": "User or email already exists"}), 409

    # New users get 'trial' status by default (from model definition)
    new_user = User(username=username, email=email)
    new_user.set_password(password)

    try:
        db.session.add(new_user)
        db.session.commit()
        return jsonify({"msg": "User registered successfully"}), 201
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Registration failed for user {username}: {e}")
        return jsonify({"msg": "Registration failed due to server error."}), 500

@bp.route('/login', methods=['POST'])
def login():
    """Endpoint for user login and JWT generation."""
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    user = db.session.execute(
        db.select(User).filter_by(username=username)
    ).scalar_one_or_none()

    if user is None or not user.check_password(password):
        return jsonify({"msg": "Bad username or password"}), 401

    # --- SUBSCRIPTION CHECK ---
    # If user is NOT active (paid), check if trial is still valid.
    if user.payment_status != 'active':
        if not user.is_trial_active:
            return jsonify({
                "msg": "Your 14-day free trial has expired. Please subscribe to continue using the platform."
            }), 403

    # Calculate remaining days for frontend display
    days_left = 0
    if user.payment_status != 'active':
        delta = datetime.utcnow() - user.created_at
        days_left = max(0, 14 - delta.days)

    access_token = create_access_token(identity=str(user.id))
    
    return jsonify(
        access_token=access_token, 
        username=user.username,
        payment_status=user.payment_status, # Send status to frontend
        days_left=days_left                 # Send countdown to frontend
    ), 200

@bp.route('/user-info', methods=['GET'])
@jwt_required()
def user_info():
    user_id_str = get_jwt_identity()
    try:
        user_id = int(user_id_str)
    except ValueError:
        return jsonify({"msg": "Invalid user ID in token"}), 401
    
    user = db.session.execute(
        db.select(User).filter_by(id=user_id)
    ).scalar_one_or_none()
    
    if user:
        # Recalculate days left for page refreshes
        days_left = 0
        if user.payment_status != 'active':
            delta = datetime.utcnow() - user.created_at
            days_left = max(0, 14 - delta.days)
            
        return jsonify(
            user_id=user.id, 
            username=user.username, 
            email=user.email,
            payment_status=user.payment_status,
            days_left=days_left
        ), 200
    return jsonify({"msg": "User not found"}), 404

# --- CHART DATA ROUTES (UNCHANGED) ---

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

    api_key = current_app.config['TWELVE_DATA_API_KEY']
    ohlc_data = get_historical_data(symbol, interval, api_key, limit=500)
    
    if not ohlc_data:
        return jsonify({"error": f"Failed to fetch data for {symbol}"}), 500

    df = pd.DataFrame(ohlc_data)
    
    if 'time' in df.columns:
        df['time'] = pd.to_numeric(df['time']) 
        df.drop_duplicates(subset=['time'], keep='last', inplace=True)
        df.sort_values('time', ascending=True, inplace=True)

    close_prices = df['close'].values.flatten()
    times = df['time'].values

    N = len(close_prices)
    if N < 10:
         return jsonify({"error": f"Insufficient data points ({N}) for SSA"}), 400

    if use_adaptive_l:
        L = 39 
    else:
        L = l_param

    if L < 2 or L >= N:
        L = max(2, min(N // 2, 30))

    try:
        components = ssa_service.ssa_decomposition(close_prices, L)
    except Exception as e:
        return jsonify({"error": f"Unexpected error during SSA: {e}"}), 500

    trend = components[0] if components.shape[0] > 0 else np.zeros_like(close_prices)
    cyclic = components[1:min(3, L)].sum(axis=0) if components.shape[0] > 1 and L > 1 else np.zeros_like(close_prices)
    noise = components[min(3, L):min(6, L)].sum(axis=0) if components.shape[0] >= min(3, L) and L > min(3, L) else np.zeros_like(close_prices)

    forecast_steps = 40
    forecast_payload = []
    try:
        forecast_values = forecast_service.forecast_ssa_spectral(
            components, 
            forecast_steps=forecast_steps, 
            min_component=1
        )
        last_timestamp = int(df['time'].iloc[-1])
        future_times = forecast_service.generate_future_timestamps(last_timestamp, interval, forecast_steps)
        
        for t, v in zip(future_times, forecast_values):
            forecast_payload.append({"time": int(t), "value": float(v)})
    except Exception as e:
        print(f"Forecast error: {e}")
        forecast_payload = []

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
        "forecast": forecast_payload 
    }

    return jsonify(response_data)

@bp.route('/scan', methods=['GET'])
@jwt_required()
def scan_market():
    interval = request.args.get('interval', '1day')
    # Default parameters matching your frontend defaults
    use_adaptive_l = request.args.get('adaptive_l', 'true').lower() == 'true'
    try:
        l_param = int(request.args.get('l', 30))
    except ValueError:
        l_param = 30

    active_signals = []

    # Loop through ALL tracked assets
    for symbol in TRACKED_ASSETS:
        # 1. Fetch Data from DB (Fast, no API cost)
        ohlc_data = get_historical_data(symbol, interval, None, limit=300)
        
        if not ohlc_data or len(ohlc_data) < 30:
            continue

        # 2. Prepare Data for SSA
        df = pd.DataFrame(ohlc_data)
        close_prices = df['close'].values.flatten()
        
        # 3. Perform SSA (Identical to chart-data logic)
        N = len(close_prices)
        if use_adaptive_l:
            L = 39 
        else:
            L = min(l_param, N // 2)

        try:
            components = ssa_service.ssa_decomposition(close_prices, L)
            
            # Extract components
            trend = components[0]
            # Cyclic is usually components 1 and 2
            cyclic = components[1:min(3, L)].sum(axis=0)
            # Noise is usually components 3, 4, 5
            noise = components[min(3, L):min(6, L)].sum(axis=0)
            
            reconstructed = trend + cyclic
            
            # 4. SIGNAL LOGIC (Ported from TradingChart.js)
            # We check the LAST bar (Current status)
            # Index -1 is the latest bar, -2 is the previous bar
            
            curr_price = close_prices[-1]
            curr_trend = trend[-1]
            prev_trend = trend[-2] # Previous trend value

            curr_recon = reconstructed[-1]
            curr_noise = noise[-1]
            prev_noise = noise[-2]
            
            # --- NEW: Calculate Trend Direction ---
            trend_direction = "UP" if curr_trend > prev_trend else "DOWN"

            # Hotspot Logic
            # Buy Hotspot: Recon < Trend AND Price < Recon
            is_hotspot_buy = (curr_recon < curr_trend) and (curr_price < curr_recon)
            # Sell Hotspot: Recon > Trend AND Price > Recon
            is_hotspot_sell = (curr_recon > curr_trend) and (curr_price > curr_recon)
            
            # Noise Logic (Turning Point)
            # Buy Noise: Noise < 0 AND Noise is rising (or flat) compared to previous
            is_noise_buy = (curr_noise < 0) and (curr_noise >= prev_noise)
            # Sell Noise: Noise > 0 AND Noise is falling (or flat)
            is_noise_sell = (curr_noise > 0) and (curr_noise <= prev_noise)
            
            # Combined Signal
            signal_type = None
            if is_hotspot_buy and is_noise_buy:
                signal_type = "BUY"
            elif is_hotspot_sell and is_noise_sell:
                signal_type = "SELL"
            
            if signal_type:
                active_signals.append({
                    "symbol": symbol,
                    "type": signal_type,
                    "trend_dir": trend_direction,
                    "price": curr_price,
                    "time": ohlc_data[-1]['time']
                })
                
        except Exception as e:
            continue

    return jsonify(active_signals)
