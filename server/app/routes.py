from flask import Blueprint, request, jsonify, current_app
import pandas as pd
import numpy as np
from datetime import datetime, timedelta, timezone
# Import extensions/models
from . import db 
from app.models import User, PaperTrade, MarketData
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from sqlalchemy import select 
from scipy.signal import find_peaks

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

# --- HELPER FUNCTION: CYCLE POSITION ---
def calculate_cycle_position(component_values, component_type='cyclic'):
    """
    Calculate cycle position (0-100%) based on Average Peaks and Valleys.
    0% = Average Valley (Support)
    100% = Average Peak (Resistance)
    Values can exceed 100% or drop below 0% (Overbought/Oversold).
    """
    # Safety check for empty or short data
    if len(component_values) < 5:
        return 50, 'flat', 1.0, -1.0
    
    current_value = component_values[-1]
    
    # 1. Identify Peaks (Resistance) -> Local Maxima > 0
    # We use a simple height=0 to capture all positive local maxima
    peaks_indices, _ = find_peaks(component_values, height=0)
    
    if len(peaks_indices) > 0:
        avg_resistance = np.mean(component_values[peaks_indices])
    else:
        # Fallback: If no distinct peaks found, use the global Max of the data
        # (Ensure it is at least slightly positive to avoid division errors)
        avg_resistance = max(np.max(component_values), 0.0001)

    # 2. Identify Valleys (Support) -> Local Minima < 0
    # We invert the data to find peaks, which corresponds to valleys in original data
    valleys_indices, _ = find_peaks(-component_values, height=0)
    
    if len(valleys_indices) > 0:
        avg_support = np.mean(component_values[valleys_indices])
    else:
        # Fallback: If no distinct valleys found, use the global Min of the data
        # (Ensure it is at least slightly negative)
        avg_support = min(np.min(component_values), -0.0001)
    
    # 3. Calculate Range
    cycle_range = avg_resistance - avg_support
    
    # Safety: Avoid division by zero if flatline
    if cycle_range == 0:
        cycle_range = 1.0

    # 4. Calculate Percentage Position
    # Formula: (Value - Bottom) / (Top - Bottom) * 100
    cycle_position = ((current_value - avg_support) / cycle_range) * 100
    
    # Round for display
    cycle_position = int(round(cycle_position))
    
    # 5. Determine Direction (Slope of last few points)
    direction = 'flat'
    # Look at the last 3 points to determine immediate direction
    if len(component_values) >= 3:
        slope = component_values[-1] - component_values[-2]
        if slope > 0: 
            direction = 'rising'
        elif slope < 0: 
            direction = 'falling'
    
    return cycle_position, direction, avg_resistance, avg_support

# --- CHART DATA ROUTES ---

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

    # --- NEW: Calculate Cycle Stats ---
    cyc_pos, cyc_dir, cyc_res, cyc_sup = calculate_cycle_position(cyclic, 'cyclic')
    noise_pos, noise_dir, noise_res, noise_sup = calculate_cycle_position(noise, 'noise')

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
        "ssa": { 
            "trend": trend_data, 
            "cyclic": cyclic_data, 
            "noise": noise_data,
            # --- SEND STATS TO FRONTEND ---
            "stats": {
                "cyclic": { "pos": cyc_pos, "dir": cyc_dir, "res": cyc_res, "sup": cyc_sup },
                "noise": { "pos": noise_pos, "dir": noise_dir, "res": noise_res, "sup": noise_sup }
            }
        },
        "l_used": int(L),
        "forecast": forecast_payload 
    }

    return jsonify(response_data)

# --- HELPER FOR STALENESS ---
def get_interval_minutes(interval):
    # Added '1week' to the mapping (10080 minutes) to fix scanner filtering
    mapping = { 
        '1min': 1, 
        '5min': 5, 
        '15min': 15, 
        '30min': 30, 
        '1h': 60, 
        '4h': 240, 
        '1day': 1440,
        '1week': 10080 
    }
    return mapping.get(interval, 60)

@bp.route('/scan', methods=['GET'])
@jwt_required()
def scan_market():
    interval = request.args.get('interval', '1day')
    use_adaptive_l = request.args.get('adaptive_l', 'true').lower() == 'true'
    try:
        l_param = int(request.args.get('l', 30))
    except ValueError:
        l_param = 30

    scanner_results = []
    
    # Calculate Max Allowed Delay (Interval + 20 mins buffer)
    interval_mins = get_interval_minutes(interval)
    max_delay_seconds = (interval_mins * 60) + (20 * 60) 
    now_utc = datetime.utcnow()

    # Loop through ALL tracked assets
    for symbol in TRACKED_ASSETS:
        # 1. Fetch Data (Pass None as API Key to force DB-only)
        ohlc_data = get_historical_data(symbol, interval, None, limit=500)
        
        if not ohlc_data or len(ohlc_data) < 60:
            continue

        # --- NEW: STALENESS CHECK ---
        # Check if the last candle is too old (Market Closed or Data Issue)
        last_candle = ohlc_data[-1]
        
        # Handle both Int timestamp and Datetime object
        if 'datetime_obj' in last_candle and last_candle['datetime_obj']:
            last_time = last_candle['datetime_obj']
        else:
            last_time = datetime.utcfromtimestamp(last_candle['time'])
            
        # If data is older than (Interval + 20mins), ignore it.
        # This prevents "Ghost Signals" on weekends for Stocks/Forex.
        if (now_utc - last_time).total_seconds() > max_delay_seconds:
            # Skip this asset because data is stale
            continue
        # ----------------------------

        # 2. Prepare Data
        df = pd.DataFrame(ohlc_data)
        close_prices = df['close'].values.flatten()
        N = len(close_prices)
        
        if use_adaptive_l:
            L = 39 
        else:
            L = min(l_param, N // 2)

        try:
            # 3. Perform SSA
            components = ssa_service.ssa_decomposition(close_prices, L)
            trend = components[0]
            cyclic = components[1:min(3, L)].sum(axis=0)
            noise = components[min(3, L):min(6, L)].sum(axis=0)
            reconstructed = trend + cyclic
            
            # Stats
            cyc_pos, _, _, _ = calculate_cycle_position(cyclic, 'cyclic')
            fast_pos, _, _, _ = calculate_cycle_position(noise, 'noise')
            
            # Directions
            curr_trend = trend[-1]
            prev_trend = trend[-2]
            trend_direction = "UP" if curr_trend > prev_trend else "DOWN"

            forecast_dir = "FLAT"
            try:
                f_vals = forecast_service.forecast_ssa_spectral(components, forecast_steps=20, min_component=1)
                if len(f_vals) > 0:
                    forecast_dir = "UP" if f_vals[-1] > f_vals[0] else "DOWN"
            except:
                pass

            # 4. FIND POSITION STATUS
            active_signal_type = None 
            position_type = "NEUTRAL" 
            bars_ago = 0
            entry_price = 0.0
            pnl_pct = 0.0

            # Check current bar first for immediate signal
            c_price = close_prices[-1]
            c_trend = trend[-1]
            c_recon = reconstructed[-1]
            c_noise = noise[-1]
            p_noise = noise[-2]

            is_hot_buy = (c_recon < c_trend) and (c_price < c_recon)
            is_hot_sell = (c_recon > c_trend) and (c_price > c_recon)
            is_noise_buy = (c_noise < 0) and (c_noise >= p_noise)
            is_noise_sell = (c_noise > 0) and (c_noise <= p_noise)

            if is_hot_buy and is_noise_buy:
                active_signal_type = "BUY"
            elif is_hot_sell and is_noise_sell:
                active_signal_type = "SELL"

            # Lookback loop 
            curr_price = close_prices[-1]
            for i in range(N-1, max(0, N-60), -1):
                p_i = close_prices[i]
                t_i = trend[i]
                r_i = reconstructed[i]
                n_i = noise[i]
                pn_i = noise[i-1]

                ib_hot = (r_i < t_i) and (p_i < r_i)
                is_hot = (r_i > t_i) and (p_i > r_i)
                ib_noise = (n_i < 0) and (n_i >= pn_i)
                is_noise = (n_i > 0) and (n_i <= pn_i)

                if ib_hot and ib_noise:
                    position_type = "LONG"
                    bars_ago = (N - 1) - i
                    entry_price = p_i
                    pnl_pct = ((curr_price - entry_price) / entry_price) * 100
                    break
                elif is_hot and is_noise:
                    position_type = "SHORT"
                    bars_ago = (N - 1) - i
                    entry_price = p_i
                    pnl_pct = ((entry_price - curr_price) / entry_price) * 100
                    break
            
            scanner_results.append({
                "symbol": symbol,
                "price": curr_price,
                "trend_dir": trend_direction,
                "forecast_dir": forecast_dir,
                "cycle_pct": int(cyc_pos),
                "fast_pct": int(fast_pos),
                "signal": active_signal_type, 
                "position": position_type,    
                "bars_ago": bars_ago,         
                "pnl_pct": round(pnl_pct, 2)  
            })

        except Exception as e:
            print(f"Scan error {symbol}: {e}")
            continue

    # Sort Results: Buy/Sell Signals FIRST, then High PnL
    scanner_results.sort(key=lambda x: (
        0 if x['signal'] else 1,  # Puts BUY/SELL at top
        -x['pnl_pct']             # Then sorts by PnL
    ))

    return jsonify(scanner_results)

@bp.route('/analyze', methods=['GET'])
@jwt_required()
def analyze_asset():
    symbol = request.args.get('symbol')
    interval = request.args.get('interval', '1day')
    use_adaptive_l = request.args.get('adaptive_l', 'true').lower() == 'true'
    try:
        l_param = int(request.args.get('l', 30))
    except ValueError:
        l_param = 30

    if not symbol:
        return jsonify({"error": "Symbol required"}), 400

    api_key = current_app.config['TWELVE_DATA_API_KEY']
    ohlc_data = get_historical_data(symbol, interval, api_key, limit=500)
    
    if not ohlc_data or len(ohlc_data) < 50:
        return jsonify({"error": "Insufficient data"}), 400

    df = pd.DataFrame(ohlc_data)
    close_prices = df['close'].values.flatten()
    
    N = len(close_prices)
    if use_adaptive_l:
        L = 39 
    else:
        L = min(l_param, N // 2)

    try:
        components = ssa_service.ssa_decomposition(close_prices, L)
        
        trend = components[0]
        cyclic = components[1:min(3, L)].sum(axis=0)
        noise = components[min(3, L):min(6, L)].sum(axis=0)
        reconstructed = trend + cyclic

        # --- 1. CALCULATE POSITIONS ---
        cyc_pos, _, _, _ = calculate_cycle_position(cyclic, 'cyclic')
        fast_pos, _, _, _ = calculate_cycle_position(noise, 'noise')
        
        # Trend Direction
        curr_trend_val = trend[-1]
        prev_trend_val = trend[-2]
        trend_dir = "Bullish" if curr_trend_val > prev_trend_val else "Bearish"

        # Fast Cycle Direction
        curr_noise = noise[-1]
        prev_noise = noise[-2]
        fast_rising = curr_noise > prev_noise

        # --- 2. FIND CURRENT POSITION (Last Signal) ---
        last_signal = "NEUTRAL"
        days_since_signal = -1
        
        # Look back 60 bars for the most recent valid signal
        for i in range(N-1, N-60, -1):
            c_price = close_prices[i]
            c_trend = trend[i]
            c_recon = reconstructed[i]
            c_noise = noise[i]
            p_noise = noise[i-1]
            
            is_hot_buy = (c_recon < c_trend) and (c_price < c_recon)
            is_hot_sell = (c_recon > c_trend) and (c_price > c_recon)
            is_noise_buy = (c_noise < 0) and (c_noise >= p_noise)
            is_noise_sell = (c_noise > 0) and (c_noise <= p_noise)
            
            if is_hot_buy and is_noise_buy:
                last_signal = "LONG"
                days_since_signal = (N - 1) - i
                break
            elif is_hot_sell and is_noise_sell:
                last_signal = "SHORT"
                days_since_signal = (N - 1) - i
                break

        # --- 3. BUILD FRIENDLY RECOMMENDATION ---
        recs = []

        # A. FAST CYCLE STATUS (Always first)
        fast_status_str = "Rising ↗️" if fast_rising else "Falling ↘️"
        recs.append(f"The Fast Cycle is currently {fast_status_str} (at {int(fast_pos)}%).")

        # B. SLOW CYCLE CONTEXT
        if cyc_pos < 10:
            recs.append("The Cyclic component is extremely oversold (Bottoming).")
        elif cyc_pos > 90:
            recs.append("The Cyclic component is extremely overbought (Peaking).")

        # C. POSITION NARRATIVE
        if last_signal == "LONG":
            base_msg = f"Currently in a LONG position (triggered {days_since_signal} bars ago)."
            if trend_dir == "Bullish":
                recs.append(f"{base_msg} This is a TREND-FOLLOWING trade, as the main trend is up.")
            else:
                recs.append(f"{base_msg} This is a COUNTER-TREND trade. Be cautious as the main trend is down.")

            # Management Logic (Long)
            if fast_pos > 80:
                recs.append("Take note: The Fast Cycle is now Overbought (>80%). Consider taking profits here.")
                if cyc_pos > 50:
                    recs.append("Watch out for a possible SHORT entry if the Fast Cycle turns down.")
            elif not fast_rising and curr_noise > 0:
                 recs.append("Alert: The Fast Cycle has started falling while positive. This is often a profit-taking zone.")

        elif last_signal == "SHORT":
            base_msg = f"Currently in a SHORT position (triggered {days_since_signal} bars ago)."
            if trend_dir == "Bearish":
                recs.append(f"{base_msg} This is a TREND-FOLLOWING trade, as the main trend is down.")
            else:
                recs.append(f"{base_msg} This is a COUNTER-TREND trade. Be cautious as the main trend is up.")

            # Management Logic (Short)
            if fast_pos < 20:
                recs.append("Take note: The Fast Cycle is now Oversold (<20%). Consider taking profits here.")
                if cyc_pos < 50:
                    recs.append("Watch out for a possible LONG entry if the Fast Cycle turns up.")
            elif fast_rising and curr_noise < 0:
                 recs.append("Alert: The Fast Cycle has started rising while negative. This is often a profit-taking zone.")
        
        else:
            recs.append("No active positions were triggered in the last 60 bars.")

        # D. NEUTRAL STATE ADVICE
        if last_signal == "NEUTRAL" or days_since_signal > 15:
            if fast_rising and fast_pos < 20 and cyc_pos < 20:
                recs.append("Setup developing: The market is Oversold. Watch for a Buy trigger soon.")
            elif not fast_rising and fast_pos > 80 and cyc_pos > 80:
                recs.append("Setup developing: The market is Overbought. Watch for a Sell trigger soon.")

        response = {
            "symbol": symbol,
            "trend": trend_dir,
            "status": last_signal, 
            "bars_ago": days_since_signal,
            "cycle_pct": int(cyc_pos),
            "fast_pct": int(fast_pos),
            # Using newlines so the frontend 'pre-line' style renders them nicely
            "recommendation": "\n".join(recs)
        }
        
        return jsonify(response)

    except Exception as e:
        print(f"Analysis error: {e}")
        return jsonify({"error": str(e)}), 500

@bp.route('/forward-test-results', methods=['GET'])
@jwt_required()
def get_forward_results():
    # Fetch all trades ordered by time desc
    trades = PaperTrade.query.order_by(PaperTrade.entry_time.desc()).limit(200).all()
    
    # Pre-fetch latest prices for active symbols to avoid N+1 queries
    # We only need this for OPEN trades
    open_symbols = set((t.symbol, t.interval) for t in trades if t.status == 'OPEN')
    latest_prices = {}
    
    for sym, interval in open_symbols:
        # Get latest closed candle price from DB
        last_candle = MarketData.query.filter_by(symbol=sym, interval=interval)\
            .order_by(MarketData.time.desc()).first()
        if last_candle:
            latest_prices[(sym, interval)] = last_candle.close

    trade_list = []
    total_pnl = 0
    closed_count = 0
    win_count = 0

    for t in trades:
        # Calculate PnL
        final_pnl = t.pnl
        final_pnl_pct = t.pnl_pct

        # If trade is OPEN, calculate Unrealized PnL
        if t.status == 'OPEN':
            current_price = latest_prices.get((t.symbol, t.interval))
            if current_price:
                if t.direction == 'LONG':
                    final_pnl = (current_price - t.entry_price) * t.quantity
                else: # SHORT
                    final_pnl = (t.entry_price - current_price) * t.quantity
                
                final_pnl_pct = (final_pnl / t.invested_amount) * 100
        
        # Stats for CLOSED trades only
        if t.status == 'CLOSED':
            total_pnl += (t.pnl or 0)
            closed_count += 1
            if (t.pnl or 0) > 0:
                win_count += 1

        trade_list.append({
            "id": t.id,
            "symbol": t.symbol,
            "interval": t.interval,
            "direction": t.direction,
            "status": t.status,
            "entry_date": t.entry_time.strftime("%Y-%m-%d %H:%M"),
            "entry_price": t.entry_price,
            "exit_date": t.exit_time.strftime("%Y-%m-%d %H:%M") if t.exit_time else "-",
            "exit_price": t.exit_price,
            # Use the calculated values
            "pnl": round(final_pnl, 2) if final_pnl is not None else 0,
            "pnl_pct": round(final_pnl_pct, 2) if final_pnl_pct is not None else 0,
            
            # Snapshots
            "trend": t.trend_snapshot if hasattr(t, 'trend_snapshot') and t.trend_snapshot else '-',
            "forecast": t.forecast_snapshot if hasattr(t, 'forecast_snapshot') and t.forecast_snapshot else '-',
            "cycle": t.cycle_snapshot if hasattr(t, 'cycle_snapshot') and t.cycle_snapshot is not None else 0,
            "fast": t.fast_snapshot if hasattr(t, 'fast_snapshot') and t.fast_snapshot is not None else 0,
        })

    win_rate = 0
    if closed_count > 0:
        win_rate = round((win_count / closed_count) * 100, 1)

    return jsonify({
        "summary": {
            "total_pnl": round(total_pnl, 2),
            "win_rate": win_rate,
            "total_trades": closed_count
        },
        "trades": trade_list
    })