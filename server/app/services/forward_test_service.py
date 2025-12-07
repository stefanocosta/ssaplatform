from datetime import datetime
from app import db
from app.models import PaperTrade
from app.services.data_manager import get_historical_data, TRACKED_ASSETS
from app.services.signal_engine import analyze_market_snapshot
import pandas as pd
import time

# List of assets to Forward Test
#TEST_ASSETS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'BNB/USD', 'ADA/USD']
INVESTMENT_AMOUNT = 1000.0

def run_forward_test(interval, api_key=None):
    """
    Runs SSA on all test assets for the given interval.
    If Signal found -> Execute Paper Trades.
    """
    print(f"🧪 [ForwardTest] Running for {interval} on {len(TRACKED_ASSETS)} assets...")
    
    for symbol in TRACKED_ASSETS:
        # 1. Get Data (Pass API key for safety)
        ohlc = get_historical_data(symbol, interval, api_key, limit=500)
        
        time.sleep(1.5)

        if not ohlc or len(ohlc) < 50:
            print(f"   ⚠️ Skipping {symbol}: Insufficient Data ({len(ohlc) if ohlc else 0})")
            continue
        
        df = pd.DataFrame(ohlc)
        closes = df['close'].values.flatten()
        
        # Ensure we have a valid datetime object for the last candle
        last_candle = ohlc[-1]
        last_time = last_candle.get('datetime_obj')
        if not last_time:
            # Fallback if datetime_obj is missing
            last_time = datetime.utcfromtimestamp(last_candle['time'])
        
        # 2. Analyze
        result = analyze_market_snapshot(closes)
        
        if not result or not result['signal']:
            continue 
            
        signal = result['signal'] 
        price = float(result['price'])
        
        print(f"   ⚡ SIGNAL DETECTED: {symbol} {signal} @ {price}")

        # 3. Execute Trade Logic
        if signal == 'BUY':
            handle_buy_signal(symbol, interval, price, last_time)
        elif signal == 'SELL':
            handle_sell_signal(symbol, interval, price, last_time)

def handle_buy_signal(symbol, interval, price, time):
    # Close Shorts
    open_shorts = PaperTrade.query.filter_by(
        symbol=symbol, interval=interval, direction='SHORT', status='OPEN'
    ).all()
    
    for trade in open_shorts:
        close_trade(trade, price, time)

    # Open Long
    new_trade = PaperTrade(
        symbol=symbol, interval=interval, direction='LONG', status='OPEN',
        entry_time=time, entry_price=price, invested_amount=INVESTMENT_AMOUNT,
        quantity=INVESTMENT_AMOUNT / price
    )
    db.session.add(new_trade)
    db.session.commit()

def handle_sell_signal(symbol, interval, price, time):
    # Close Longs
    open_longs = PaperTrade.query.filter_by(
        symbol=symbol, interval=interval, direction='LONG', status='OPEN'
    ).all()
    
    for trade in open_longs:
        close_trade(trade, price, time)

    # Open Short
    new_trade = PaperTrade(
        symbol=symbol, interval=interval, direction='SHORT', status='OPEN',
        entry_time=time, entry_price=price, invested_amount=INVESTMENT_AMOUNT,
        quantity=INVESTMENT_AMOUNT / price
    )
    db.session.add(new_trade)
    db.session.commit()

def close_trade(trade, exit_price, exit_time):
    trade.status = 'CLOSED'
    trade.exit_price = exit_price
    trade.exit_time = exit_time
    
    if trade.direction == 'LONG':
        trade.pnl = (exit_price - trade.entry_price) * trade.quantity
    else:
        trade.pnl = (trade.entry_price - exit_price) * trade.quantity
        
    trade.pnl_pct = (trade.pnl / trade.invested_amount) * 100
    db.session.merge(trade)
    db.session.commit()