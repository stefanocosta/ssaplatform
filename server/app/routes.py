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
from app.services import backtest_service

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
    """
    if len(component_values) < 5:
        return 50, 'flat', 1.0, -1.0
    
    current_value = component_values[-1]
    
    peaks_indices, _ = find_peaks(component_values, height=0)
    avg_resistance = np.mean(component_values[peaks_indices]) if len(peaks_indices) > 0 else max(np.max(component_values), 0.0001)

    valleys_indices, _ = find_peaks(-component_values, height=0)
    avg_support = np.mean(component_values[valleys_indices]) if len(valleys_indices) > 0 else min(np.min(component_values), -0.0001)
    
    cycle_range = avg_resistance - avg_support
    if cycle_range == 0: cycle_range = 1.0

    cycle_position = ((current_value - avg_support) / cycle_range) * 100
    cycle_position = int(round(cycle_position))
    
    direction = 'flat'
    if len(component_values) >= 3:
        slope = component_values[-1] - component_values[-2]
        if slope > 0: direction = 'rising'
        elif slope < 0: direction = 'falling'
    
    return cycle_position, direction, avg_resistance, avg_support

# --- ANALYSIS HELPER ---
def perform_single_analysis(symbol, interval, api_key, strategy='basic'):
    """
    Performs the SSA and Signal analysis for a single timeframe.
    Returns a dictionary of results or None if failed.
    """
    # Fix strategy case sensitivity
    strategy = strategy.lower() if strategy else 'basic'

    ohlc_data = get_historical_data(symbol, interval, api_key, limit=500)
    if not ohlc_data or len(ohlc_data) < 50:
        return None

    df = pd.DataFrame(ohlc_data)
    
    # --- CRITICAL FIX: SORT DATA ---
    # Ensures SSA math is accurate even if DB returns unsorted rows
    if 'time' in df.columns:
        df['time'] = pd.to_numeric(df['time']) 
        df.sort_values('time', ascending=True, inplace=True)
    
    close_prices = df['close'].values.flatten()
    N = len(close_prices)
    
    # Adaptive L
    L = min(39, N // 2)

    try:
        components = ssa_service.ssa_decomposition(close_prices, L)
        trend = components[0]
        cyclic = components[1:min(3, L)].sum(axis=0)
        noise = components[min(3, L):min(6, L)].sum(axis=0)
        reconstructed = trend + cyclic

        # Stats
        cyc_pos, _, _, _ = calculate_cycle_position(cyclic, 'cyclic')
        fast_pos, _, _, _ = calculate_cycle_position(noise, 'noise')
        
        # Directions
        curr_trend_val = trend[-1]
        prev_trend_val = trend[-2]
        trend_dir = "Bullish" if curr_trend_val > prev_trend_val else "Bearish"

        curr_noise = noise[-1]
        prev_noise = noise[-2]
        # Explicit boolean cast for JSON serialization
        fast_rising = bool(curr_noise > prev_noise) 

        # Signal Status
        last_signal = "NEUTRAL"
        days_since_signal = -1
        entry_price = 0.0 
        
        # --- STRATEGY 1: BASIC (Standard SSA Mean Reversion) ---
        if strategy == 'basic':
            for i in range(N-1, max(0, N-60), -1):
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
                    entry_price = c_price
                    break
                elif is_hot_sell and is_noise_sell:
                    last_signal = "SHORT"
                    days_since_signal = (N - 1) - i
                    entry_price = c_price
                    break
        
        # --- STRATEGY 2: FAST (Replicated EXACT Logic from TradingChart.js) ---
        elif strategy == 'fast':
            # We calculate signal state for the whole series first
            signals = np.zeros(N, dtype=int) # 0=None, 1=Long, -1=Short
            down_count = 0
            up_count = 0
            
            for k in range(1, N):
                val = noise[k]
                prev = noise[k-1]
                
                if val < 0:
                    up_count = 0
                    if val < prev: # Descending
                        down_count += 1
                        if down_count == 5:
                            signals[k] = 1 # F5 LONG
                    elif val > prev: # Ascending (Turn)
                        if 0 < down_count < 5:
                            signals[k] = 1 # REV LONG
                        down_count = 0 # Reset
                
                elif val > 0:
                    down_count = 0
                    if val > prev: # Ascending
                        up_count += 1
                        if up_count == 5:
                            signals[k] = -1 # F5 SHORT
                    elif val < prev: # Descending (Turn)
                        if 0 < up_count < 5:
                            signals[k] = -1 # REV SHORT
                        up_count = 0 # Reset
                else:
                    down_count = 0
                    up_count = 0
            
            # Find last signal in window
            for i in range(N-1, max(0, N-60), -1):
                if signals[i] == 1:
                    last_signal = "LONG"
                    days_since_signal = (N - 1) - i
                    entry_price = close_prices[i]
                    break
                elif signals[i] == -1:
                    last_signal = "SHORT"
                    days_since_signal = (N - 1) - i
                    entry_price = close_prices[i]
                    break
        
        return {
            "interval": interval,
            "trend": trend_dir,
            "status": last_signal,
            "bars_ago": days_since_signal,
            "cycle_pct": int(cyc_pos),
            "fast_pct": int(fast_pos),
            "fast_rising": fast_rising,
            "current_price": float(close_prices[-1]), # Return current price
            "entry_price": float(entry_price), # Return entry price for PnL
            "components": components # Return components for Forecast logic (internal use)
        }

    except Exception as e:
        print(f"Error analyzing {interval}: {e}")
        return None

# --- SCANNER HELPER (Uses Core Analysis + Adds Forecast & PnL) ---
def get_asset_scan_data(symbol, interval, strategy, api_key):
    data = perform_single_analysis(symbol, interval, api_key, strategy=strategy)
    
    # Allow NEUTRAL signals to pass through so the frontend can display them and filter them
    if data:
        # PnL Calculation
        pnl_pct = 0.0
        if data['entry_price'] > 0 and data['status'] != 'NEUTRAL':
            if data['status'] == 'LONG':
                pnl_pct = ((data['current_price'] - data['entry_price']) / data['entry_price']) * 100
            elif data['status'] == 'SHORT':
                pnl_pct = ((data['entry_price'] - data['current_price']) / data['entry_price']) * 100

        # Forecast Direction
        forecast_dir = "FLAT"
        try:
            # We used 'components' in perform_single_analysis, passed here
            f_vals = forecast_service.forecast_ssa_spectral(data['components'], forecast_steps=20, min_component=1)
            if len(f_vals) > 0:
                forecast_dir = "UP" if f_vals[-1] > f_vals[0] else "DOWN"
        except:
            pass

        return {
            "symbol": symbol,
            # Set signal to None if Neutral so frontend filter works
            "signal": data['status'] if data['status'] != 'NEUTRAL' else None, 
            "position": data['status'],
            "trend": data['trend'],
            "trend_dir": "UP" if data['trend'] == "Bullish" else "DOWN", # Format for frontend
            "fast_pct": data['fast_pct'],
            "cycle_pct": data['cycle_pct'],
            "fast_rising": data['fast_rising'],
            "bars_ago": data['bars_ago'],
            "price": data['current_price'],
            "pnl_pct": round(pnl_pct, 2),
            "forecast_dir": forecast_dir
        }
    return None

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
            "stats": {
                "cyclic": { "pos": cyc_pos, "dir": cyc_dir, "res": cyc_res, "sup": cyc_sup },
                "noise": { "pos": noise_pos, "dir": noise_dir, "res": noise_res, "sup": noise_sup }
            }
        },
        "l_used": int(L),
        "forecast": forecast_payload 
    }

    return jsonify(response_data)

@bp.route('/scan', methods=['GET'])
@jwt_required()
def scan_market():
    interval = request.args.get('interval', '1day')
    strategy = request.args.get('strategy', 'basic').lower()
    api_key = current_app.config['TWELVE_DATA_API_KEY']
    
    scan_results = []
    
    for symbol in TRACKED_ASSETS:
        result = get_asset_scan_data(symbol, interval, strategy, api_key)
        if result:
            scan_results.append(result)

    scan_results.sort(key=lambda x: x['bars_ago'])

    return jsonify(scan_results)

@bp.route('/analyze', methods=['GET'])
@jwt_required()
def analyze_asset():
    symbol = request.args.get('symbol')
    interval = request.args.get('interval', '1day')
    strategy = request.args.get('strategy', 'basic').lower()
    api_key = current_app.config['TWELVE_DATA_API_KEY']

    if not symbol:
        return jsonify({"error": "Symbol required"}), 400

    # 1. Analyze PRIMARY Timeframe
    primary_data = perform_single_analysis(symbol, interval, api_key, strategy)
    if not primary_data:
        return jsonify({"error": "Insufficient data"}), 400

    # 2. Determine Higher Timeframes (HTF)
    htf_map = {
        '1min':  ['5min', '15min'],
        '5min':  ['15min', '1h'],
        '15min': ['1h', '4h'],
        '30min': ['1h', '4h'],
        '1h':    ['4h', '1day'],
        '4h':    ['1day', '1week'],
        '1day':  ['1week']
    }
    
    htf_list = htf_map.get(interval, [])
    htf_results = []

    # 3. Analyze HTFs
    for htf in htf_list:
        res = perform_single_analysis(symbol, htf, api_key, strategy)
        if res:
            # FIX: Remove non-serializable 'components' array before sending to frontend
            res.pop('components', None)
            htf_results.append(res)

    # 4. Generate Recommendation Text (Based on Primary)
    recs = []
    fast_status_str = "Rising ↗️" if primary_data['fast_rising'] else "Falling ↘️"
    recs.append(f"The Fast Cycle is currently {fast_status_str} (at {primary_data['fast_pct']}%).")
    
    if primary_data['cycle_pct'] < 10: recs.append("The Cyclic component is extremely oversold.")
    elif primary_data['cycle_pct'] > 90: recs.append("The Cyclic component is extremely overbought.")

    if primary_data['status'] == "LONG":
        recs.append(f"Currently in a LONG position (triggered {primary_data['bars_ago']} bars ago).")
    elif primary_data['status'] == "SHORT":
        recs.append(f"Currently in a SHORT position (triggered {primary_data['bars_ago']} bars ago).")
    else:
        recs.append("No active positions were triggered in the last 60 bars.")

    # 5. Build Response
    response = {
        "symbol": symbol,
        "trend": primary_data['trend'],
        "status": primary_data['status'], 
        "bars_ago": primary_data['bars_ago'],
        "cycle_pct": primary_data['cycle_pct'],
        "fast_pct": primary_data['fast_pct'],
        "recommendation": "\n".join(recs),
        "context": htf_results 
    }
    
    return jsonify(response)

@bp.route('/forward-test-results', methods=['GET'])
@jwt_required()
def get_forward_results():
    trades = PaperTrade.query.order_by(PaperTrade.entry_time.desc()).all()
    open_symbols = set((t.symbol, t.interval) for t in trades if t.status == 'OPEN')
    latest_prices = {}
    
    for sym, interval in open_symbols:
        last_candle = MarketData.query.filter_by(symbol=sym, interval=interval)\
            .order_by(MarketData.time.desc()).first()
        if last_candle:
            latest_prices[(sym, interval)] = last_candle.close

    global_stats = {'total_pnl': 0.0, 'win_count': 0, 'loss_count': 0, 'total_trades': 0, 'open_trades': 0, 'sum_wins': 0.0, 'sum_losses': 0.0}
    interval_stats = { k: {'pnl':0.0, 'wins':0, 'closed':0, 'open':0} for k in ['15min', '1h', '4h'] }
    trade_list = []

    for t in trades:
        final_pnl = t.pnl
        final_pnl_pct = t.pnl_pct

        if t.status == 'OPEN':
            current_price = latest_prices.get((t.symbol, t.interval))
            if current_price:
                if t.direction == 'LONG':
                    final_pnl = (current_price - t.entry_price) * t.quantity
                else: # SHORT
                    final_pnl = (t.entry_price - current_price) * t.quantity
                final_pnl_pct = (final_pnl / t.invested_amount) * 100
        
        intv = t.interval
        if intv not in interval_stats:
            interval_stats[intv] = {'pnl':0.0, 'wins':0, 'closed':0, 'open':0}

        if t.status == 'OPEN':
            global_stats['open_trades'] += 1
            interval_stats[intv]['open'] += 1
        else: # CLOSED
            global_stats['total_trades'] += 1
            global_stats['total_pnl'] += (t.pnl or 0)
            interval_stats[intv]['closed'] += 1
            interval_stats[intv]['pnl'] += (t.pnl or 0)
            if (t.pnl or 0) > 0:
                global_stats['win_count'] += 1
                global_stats['sum_wins'] += t.pnl
                interval_stats[intv]['wins'] += 1
            else:
                global_stats['loss_count'] += 1
                global_stats['sum_losses'] += abs(t.pnl or 0)

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
            "pnl": round(final_pnl, 2) if final_pnl is not None else 0,
            "pnl_pct": round(final_pnl_pct, 2) if final_pnl_pct is not None else 0,
            "trend": t.trend_snapshot if hasattr(t, 'trend_snapshot') and t.trend_snapshot else '-',
            "forecast": t.forecast_snapshot if hasattr(t, 'forecast_snapshot') and t.forecast_snapshot else '-',
            "cycle": t.cycle_snapshot if hasattr(t, 'cycle_snapshot') and t.cycle_snapshot is not None else 0,
            "fast": t.fast_snapshot if hasattr(t, 'fast_snapshot') and t.fast_snapshot is not None else 0,
            # Add strategy field
            "strategy": t.strategy if hasattr(t, 'strategy') else 'basic'
        })

    avg_win = global_stats['sum_wins'] / global_stats['win_count'] if global_stats['win_count'] > 0 else 0
    avg_loss = global_stats['sum_losses'] / global_stats['loss_count'] if global_stats['loss_count'] > 0 else 0
    win_rate = (global_stats['win_count'] / global_stats['total_trades'] * 100) if global_stats['total_trades'] > 0 else 0

    final_interval_data = []
    priority = ['15min', '1h', '4h']
    for k in priority + [x for x in interval_stats.keys() if x not in priority]:
        if k not in interval_stats: continue
        s = interval_stats[k]
        wr = (s['wins'] / s['closed'] * 100) if s['closed'] > 0 else 0
        final_interval_data.append({
            'interval': k,
            'pnl': round(s['pnl'], 2),
            'win_rate': round(wr, 1),
            'open': s['open'],
            'closed': s['closed']
        })

    return jsonify({
        "summary": {
            "total_pnl": round(global_stats['total_pnl'], 2),
            "win_rate": round(win_rate, 1),
            "total_trades": global_stats['total_trades'],
            "open_trades": global_stats['open_trades'],
            "avg_win": round(avg_win, 2),
            "avg_loss": round(avg_loss, 2)
        },
        "intervals": final_interval_data,
        "trades": trade_list
    })

@bp.route('/run-backtest', methods=['POST'])
@jwt_required()
def run_backtest_endpoint():
    data = request.get_json()
    assets = data.get('assets', []) 
    interval = data.get('interval', '1day')
    lookback = int(data.get('lookback', 100))
    strategy = data.get('strategy', 'BASIC')
    use_breakeven = data.get('use_breakeven', False)
    be_atr = float(data.get('be_atr', 2.0))
    use_tp = data.get('use_tp', False)
    tp_atr = float(data.get('tp_atr', 5.0))
    
    if not assets:
        return jsonify({"error": "No assets selected"}), 400

    try:
        trades = backtest_service.run_backtest(
            assets, interval, lookback,
            strategy=strategy,
            use_breakeven=use_breakeven, be_atr_dist=be_atr,
            use_tp=use_tp, tp_atr_dist=tp_atr
        )
        
        total_pnl = sum(t['pnl'] for t in trades if t['status'] == 'CLOSED')
        closed_trades = [t for t in trades if t['status'] == 'CLOSED']
        wins = [t for t in closed_trades if t['pnl'] > 0]
        losses = [t for t in closed_trades if t['pnl'] <= 0]
        
        summary = {
            "total_pnl": round(total_pnl, 2),
            "win_rate": round(len(wins) / len(closed_trades) * 100, 1) if closed_trades else 0,
            "total_trades": len(closed_trades),
            "open_trades": len(trades) - len(closed_trades),
            "avg_win": round(sum(t['pnl'] for t in wins) / len(wins), 2) if wins else 0,
            "avg_loss": round(sum(abs(t['pnl']) for t in losses) / len(losses), 2) if losses else 0
        }
        
        intervals = [{
            'interval': interval,
            'pnl': summary['total_pnl'],
            'win_rate': summary['win_rate'],
            'open': summary['open_trades'],
            'closed': summary['total_trades']
        }]

        return jsonify({
            "summary": summary,
            "intervals": intervals,
            "trades": trades
        })

    except Exception as e:
        print(f"Backtest Error: {e}")
        return jsonify({"error": "Backtest failed during execution"}), 500
    
@bp.route('/deep-wave-analyze', methods=['GET'])
@jwt_required()
def deep_wave_analyze():
    symbol = request.args.get('symbol')
    interval = request.args.get('interval', '1day')
    
    # Standard L=39 for deep analysis
    L = 39 

    if not symbol:
        return jsonify({"error": "Symbol required"}), 400

    api_key = current_app.config['TWELVE_DATA_API_KEY']
    ohlc_data = get_historical_data(symbol, interval, api_key, limit=500)
    
    if not ohlc_data or len(ohlc_data) < 100:
        return jsonify({"error": "Insufficient data"}), 400

    df = pd.DataFrame(ohlc_data)
    close_prices = df['close'].values.flatten()
    times = df['time'].values.tolist()

    try:
        # Run Diagnostics
        diag = ssa_service.get_ssa_diagnostics(close_prices, L)
        
        # 1. Trend Analysis (Component 0)
        trend_series = diag['components'][0]
        trend_power = diag['contributions'][0]
        
        # --- NEW: SMARTER TREND DETECTION ---
        # Calculate percent change of the trend component over the last 10 bars
        start_val = trend_series[-10]
        end_val = trend_series[-1]
        
        # Avoid division by zero
        if start_val == 0: start_val = 0.0001
            
        trend_pct_change = abs((end_val - start_val) / start_val) * 100
        
        # Logic: True Trends move. Ranges stall.
        # If the "Trend" component moved less than 0.5% in 10 bars, it's a Range.
        is_ranging = trend_pct_change < 0.5 
        
        if is_ranging:
            trend_dir = "Sideways / Ranging"
            # If it's 100% power but Ranging, it's a "Stable Equilibrium"
            trend_desc = f"The market is in a stable range (High Stability). The 'Trend' component holds {trend_power:.1f}% energy but is flat."
        else:
            trend_slope = end_val - start_val
            trend_dir = "Strongly Bullish" if trend_slope > 0 else "Strongly Bearish"
            trend_desc = f"The trend explains {trend_power:.1f}% of price movement."

        # 2. Cycle Analysis (Components 1-9)
        spectrum_data = []
        for i in range(1, len(diag['contributions'])):
            spectrum_data.append({
                "index": i,
                "power": diag['contributions'][i]
            })

        # 3. Wave Data for Charting (Top 5 Cycles)
        waves = []
        labels = ["Primary Cycle", "Secondary Cycle", "Fast Wave", "Harmonic 1", "Harmonic 2"]
        colors = ["#00e676", "#2979ff", "#ffeb3b", "#ff9100", "#f50057"]
        
        for i in range(1, 6): 
            if i < len(diag['components']):
                waves.append({
                    "name": labels[i-1] if i-1 < len(labels) else f"Comp {i}",
                    "color": colors[i-1] if i-1 < len(colors) else "#888",
                    "data": diag['components'][i][-100:] 
                })
        
        # --- FIX: ADDED PRICES TO RESPONSE ---
        # -------------------------------------
        
        # 4. Generate Strategy Text
        recs = []
        recs.append(f"**Trend Dominance:** {trend_power:.1f}%")
        recs.append(f"**Market Structure:** {trend_dir}")
        
        if is_ranging and trend_power > 90:
             recs.append("⚠️ **Anomaly Detected:** Trend power is maximal (>90%) but price is flat. This indicates a 'coiled spring' or low-volatility consolidation. Expect a breakout soon.")
        
        # Check Primary Cycle
        p_cycle = diag['components'][1]
        p_amp = max(p_cycle[-20:]) - min(p_cycle[-20:])
        
        if p_amp < (close_prices[-1] * 0.001): # Amplitude less than 0.1% of price
             recs.append("Cycles are currently dormant (Low Volatility).")
        else:
            if p_cycle[-1] > 0 and p_cycle[-1] > p_cycle[-2]:
                 recs.append("The **Primary Cycle** is rising (Bullish).")
            elif p_cycle[-1] > 0 and p_cycle[-1] < p_cycle[-2]:
                 recs.append("The **Primary Cycle** is topping out.")
            elif p_cycle[-1] < 0 and p_cycle[-1] < p_cycle[-2]:
                 recs.append("The **Primary Cycle** is falling (Bearish).")
            elif p_cycle[-1] < 0 and p_cycle[-1] > p_cycle[-2]:
                 recs.append("The **Primary Cycle** is bottoming out.")

        # --- FIX: ADDED SYNC CALCULATION ---
        sync_components = diag['components'][1:6]
        pos_count = 0
        neg_count = 0
        for c in sync_components:
            if c[-1] > 0: pos_count += 1
            else: neg_count += 1
            
        sync_status = "BEARISH SYNC" if pos_count >= 4 else ("BULLISH SYNC" if neg_count >= 4 else "Neutral / Mixed")
        sync_color = "#ff3d00" if pos_count >= 4 else ("#00c853" if neg_count >= 4 else "#888")

        response = {
            "symbol": symbol,
            "trend": {
                "power": trend_power,
                "direction": trend_dir,
                "description": trend_desc
            },
            "sync": { # --- ADDED SYNC OBJECT
                "status": sync_status,
                "color": sync_color,
                "pos_count": pos_count,
                "neg_count": neg_count
            },
            "spectrum": spectrum_data[:15], 
            "waves": waves,
            "prices": close_prices[-100:].tolist(), # --- ADDED PRICES
            "times": times[-100:], 
            "summary": "\n\n".join(recs)
        }

        return jsonify(response)

    except Exception as e:
        print(f"Deep Analysis Error: {e}")
        return jsonify({"error": str(e)}), 500