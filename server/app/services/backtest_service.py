import pandas as pd
import numpy as np
from datetime import datetime
from app import db
from app.models import MarketData
from app.services.signal_engine import analyze_market_snapshot

# CONFIG
SSA_WINDOW = 500  
INVESTMENT_AMOUNT = 10000.0
ATR_PERIOD = 14

def calculate_atr(highs, lows, closes, period=14):
    """
    Calculates ATR using Pandas for speed/convenience.
    Returns a numpy array matching the input length.
    """
    if len(closes) == 0: return np.array([])
    
    df = pd.DataFrame({'high': highs, 'low': lows, 'close': closes})
    df['prev_close'] = df['close'].shift(1)
    df['tr1'] = df['high'] - df['low']
    df['tr2'] = (df['high'] - df['prev_close']).abs()
    df['tr3'] = (df['low'] - df['prev_close']).abs()
    df['tr'] = df[['tr1', 'tr2', 'tr3']].max(axis=1)
    
    # Calculate rolling mean (ATR) and backfill initial NaN
    df['atr'] = df['tr'].rolling(window=period).mean().bfill()
    
    return df['atr'].values

def run_backtest(assets, interval, lookback_bars, strategy='BASIC', 
                 use_breakeven=False, be_atr_dist=2.0, 
                 use_tp=False, tp_atr_dist=5.0):
    """
    Simulates trading with support for:
    - Strategies: 'BASIC' vs 'FAST'
    - Management: Breakeven Stop & Take Profit (ATR based)
    """
    print(f"🚀 [Backtest] {strategy} | BE:{use_breakeven}({be_atr_dist}) | TP:{use_tp}({tp_atr_dist})")
    
    all_trades = []
    trade_id_counter = 1

    for symbol in assets:
        # Fetch extra data to ensure "warm up" of counters/averages
        required_limit = lookback_bars + SSA_WINDOW + 50
        
        # 1. Fetch Data
        stmt = db.select(MarketData).filter(
            MarketData.symbol == symbol,
            MarketData.interval == interval
        ).order_by(MarketData.time.desc()).limit(required_limit)
        
        results = db.session.execute(stmt).scalars().all()
        
        if len(results) < 50: continue

        # Reverse to chronological order (Oldest -> Newest)
        full_history = results[::-1]
        
        # 2. Extract Columns
        closes = [r.close for r in full_history]
        highs = [r.high for r in full_history]
        lows = [r.low for r in full_history]
        
        closes_np = np.array(closes, dtype=float)
        atr_series = calculate_atr(highs, lows, closes, ATR_PERIOD)
        
        # Convert objects to dicts
        history_data = []
        for idx, r in enumerate(full_history):
            history_data.append({
                'close': r.close,
                'high': r.high,
                'low': r.low,
                'time': datetime.utcfromtimestamp(r.time) if isinstance(r.time, int) else r.time,
                'atr': atr_series[idx],
                'ssa_trend': r.ssa_trend,
                'ssa_cyclic': r.ssa_cyclic,
                'ssa_noise': r.ssa_noise,
                'ssa_trend_dir': r.ssa_trend_dir,
                'ssa_cycle_pos': r.ssa_cycle_pos,
                'ssa_fast_pos': r.ssa_fast_pos
            })

        # 3. Simulation Loop
        simulation_start_idx = len(history_data) - lookback_bars
        if simulation_start_idx < SSA_WINDOW: simulation_start_idx = SSA_WINDOW

        active_trade = None 
        
        # STATE for Strategies
        fast_up_count = 0
        fast_down_count = 0
        
        # [CRITICAL FIX] Persist the previously calculated noise 
        # so we don't rely on DB 'prev_row' being populated in fallback mode.
        last_iter_noise = 0.0 

        for i in range(SSA_WINDOW, len(history_data)):
            
            row = history_data[i]
            prev_row = history_data[i-1]
            
            # --- 1. GET SSA VALUES ---
            curr_price = row['close']
            curr_trend = 0.0
            curr_cyclic = 0.0
            curr_noise = 0.0
            curr_recon = 0.0
            
            trend_dir = '-'
            forecast_dir = '-'
            cycle_pos = 0
            fast_pos = 0

            # Path A: Use DB Values (Fast)
            if row['ssa_trend'] is not None and row['ssa_noise'] is not None:
                curr_trend = row['ssa_trend']
                curr_cyclic = row['ssa_cyclic']
                curr_noise = row['ssa_noise']
                curr_recon = curr_trend + curr_cyclic
                
                # Meta
                trend_dir = row['ssa_trend_dir']
                cycle_pos = row['ssa_cycle_pos']
                fast_pos = row['ssa_fast_pos']
            
            # Path B: Fallback Calculation (Slow)
            else:
                window_slice = closes_np[i-SSA_WINDOW+1 : i+1]
                if len(window_slice) != SSA_WINDOW: continue
                try:
                    analysis = analyze_market_snapshot(window_slice)
                    if analysis:
                        curr_trend = analysis['raw_trend']
                        curr_cyclic = analysis['raw_cyclic']
                        curr_noise = analysis['raw_noise']
                        curr_recon = curr_trend + curr_cyclic
                        
                        trend_dir = analysis['trend_dir']
                        forecast_dir = analysis['forecast_dir']
                        cycle_pos = analysis['cycle_pct']
                        fast_pos = analysis['fast_pct']
                except:
                    continue

            # --- DETERMINE PREVIOUS NOISE ---
            # 1. Try DB first
            if prev_row['ssa_noise'] is not None:
                prev_noise = prev_row['ssa_noise']
            # 2. Use persistent variable from last loop iteration
            else:
                prev_noise = last_iter_noise

            # Update persistence for NEXT iteration
            last_iter_noise = curr_noise

            # --- SIGNAL LOGIC ---
            signal = None
            
            if strategy == 'BASIC':
                is_hot_buy = (curr_recon < curr_trend) and (curr_price < curr_recon)
                is_hot_sell = (curr_recon > curr_trend) and (curr_price > curr_recon)
                
                # Check turn using robust prev_noise
                is_noise_buy = (curr_noise < 0) and (curr_noise >= prev_noise)
                is_noise_sell = (curr_noise > 0) and (curr_noise <= prev_noise)
                
                if is_hot_buy and is_noise_buy: signal = "BUY"
                elif is_hot_sell and is_noise_sell: signal = "SELL"
                
            elif strategy == 'FAST':
                if curr_noise < 0:
                    fast_up_count = 0
                    if curr_noise < prev_noise:
                        fast_down_count += 1
                        if fast_down_count == 5: signal = "BUY"
                    elif curr_noise > prev_noise:
                        if fast_down_count > 0 and fast_down_count < 5: signal = "BUY"
                        fast_down_count = 0 
                
                elif curr_noise > 0:
                    fast_down_count = 0
                    if curr_noise > prev_noise:
                        fast_up_count += 1
                        if fast_up_count == 5: signal = "SELL"
                    elif curr_noise < prev_noise:
                        if fast_up_count > 0 and fast_up_count < 5: signal = "SELL"
                        fast_up_count = 0

            # --- EXECUTION CHECK ---
            if i < simulation_start_idx:
                continue

            # --- 2. TRADE MANAGEMENT (Exit) ---
            if active_trade:
                exit_triggered = False
                exit_reason = ""
                exit_p = row['close']

                # A. Take Profit
                if use_tp and active_trade['tp_price']:
                    if active_trade['direction'] == 'LONG':
                        if row['high'] >= active_trade['tp_price']:
                            exit_triggered = True; exit_reason = "TP"; exit_p = active_trade['tp_price']
                    else:
                        if row['low'] <= active_trade['tp_price']:
                            exit_triggered = True; exit_reason = "TP"; exit_p = active_trade['tp_price']

                # B. Breakeven
                if not exit_triggered and use_breakeven:
                    if not active_trade['be_active']:
                        if active_trade['direction'] == 'LONG':
                            if row['high'] >= active_trade['be_trigger']: active_trade['be_active'] = True
                        else:
                            if row['low'] <= active_trade['be_trigger']: active_trade['be_active'] = True
                    
                    if active_trade['be_active']:
                        if active_trade['direction'] == 'LONG':
                            if row['low'] <= active_trade['entry_price']:
                                exit_triggered = True; exit_reason = "BE"; exit_p = active_trade['entry_price']
                        else:
                            if row['high'] >= active_trade['entry_price']:
                                exit_triggered = True; exit_reason = "BE"; exit_p = active_trade['entry_price']

                # C. Signal Reversal (Standard Exit)
                if not exit_triggered:
                    if (active_trade['direction'] == 'LONG' and signal == 'SELL') or \
                       (active_trade['direction'] == 'SHORT' and signal == 'BUY'):
                        exit_triggered = True; exit_reason = "Signal"; exit_p = row['close']

                if exit_triggered:
                    pnl = 0
                    if active_trade['direction'] == 'LONG':
                        pnl = (exit_p - active_trade['entry_price']) * active_trade['quantity']
                    else:
                        pnl = (active_trade['entry_price'] - exit_p) * active_trade['quantity']
                    
                    active_trade.update({
                        'status': 'CLOSED',
                        'exit_price': exit_p,
                        'exit_date': row['time'].strftime("%Y-%m-%d %H:%M"),
                        'pnl': round(pnl, 2),
                        'pnl_pct': round((pnl / active_trade['invested']) * 100, 2),
                        'exit_reason': exit_reason
                    })
                    all_trades.append(active_trade)
                    active_trade = None 

            # --- 3. TRADE ENTRY ---
            if not active_trade and (signal == 'BUY' or signal == 'SELL'):
                direction = 'LONG' if signal == 'BUY' else 'SHORT'
                
                current_atr = row['atr']
                tp_price = None
                be_trigger = None
                
                if use_tp:
                    dist = current_atr * tp_atr_dist
                    tp_price = row['close'] + dist if direction == 'LONG' else row['close'] - dist
                
                if use_breakeven:
                    dist = current_atr * be_atr_dist
                    be_trigger = row['close'] + dist if direction == 'LONG' else row['close'] - dist

                active_trade = {
                    'id': trade_id_counter,
                    'symbol': symbol,
                    'interval': interval,
                    'direction': direction,
                    'status': 'OPEN',
                    'entry_date': row['time'].strftime("%Y-%m-%d %H:%M"),
                    'entry_price': row['close'],
                    'invested': INVESTMENT_AMOUNT,
                    'quantity': INVESTMENT_AMOUNT / row['close'],
                    'trend': trend_dir,
                    'forecast': forecast_dir,
                    'cycle': cycle_pos,
                    'fast': fast_pos,
                    'exit_date': '-',
                    'exit_price': None,
                    'pnl': 0,
                    'pnl_pct': 0,
                    'tp_price': tp_price,
                    'be_trigger': be_trigger,
                    'be_active': False
                }
                trade_id_counter += 1

        # Close leftover
        if active_trade:
            last_price = closes[-1]
            pnl = 0
            if active_trade['direction'] == 'LONG':
                pnl = (last_price - active_trade['entry_price']) * active_trade['quantity']
            else:
                pnl = (active_trade['entry_price'] - last_price) * active_trade['quantity']
            
            active_trade['pnl'] = round(pnl, 2)
            active_trade['pnl_pct'] = round((pnl / active_trade['invested']) * 100, 2)
            all_trades.append(active_trade)

    all_trades.sort(key=lambda x: x['entry_date'], reverse=True)
    return all_trades