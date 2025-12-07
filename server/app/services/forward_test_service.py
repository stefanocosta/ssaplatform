# Create new file: app/services/forward_test_service.py
from datetime import datetime
from app import db
from app.models import PaperTrade
from app.services.data_manager import get_historical_data
from app.services.signal_engine import analyze_market_snapshot
import pandas as pd

# Hardcoded list for Forward Testing
TEST_ASSETS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'BNB/USD', 'ADA/USD']
INVESTMENT_AMOUNT = 1000.0

def run_forward_test(interval):
    """
    Runs SSA on all test assets for the given interval.
    If Signal found -> Execute Paper Trades.
    """
    print(f"🧪 [ForwardTest] Running for {interval}...")
    
    for symbol in TEST_ASSETS:
        # 1. Get Data (Fast fetch from DB)
        ohlc = get_historical_data(symbol, interval, None, limit=500)
        if not ohlc or len(ohlc) < 50: continue
        
        df = pd.DataFrame(ohlc)
        closes = df['close'].values.flatten()
        last_time = ohlc[-1]['datetime_obj'] # Ensure this is a datetime object
        
        # 2. Analyze
        result = analyze_market_snapshot(closes)
        if not result or not result['signal']:
            continue # No signal, do nothing
            
        signal = result['signal'] # 'BUY' or 'SELL'
        price = result['price']
        
        # 3. Execute Trade Logic
        if signal == 'BUY':
            handle_buy_signal(symbol, interval, price, last_time)
        elif signal == 'SELL':
            handle_sell_signal(symbol, interval, price, last_time)

def handle_buy_signal(symbol, interval, price, time):
    # 1. STOP & REVERSE: Close any OPEN SHORT positions
    open_shorts = PaperTrade.query.filter_by(
        symbol=symbol, interval=interval, direction='SHORT', status='OPEN'
    ).all()
    
    for trade in open_shorts:
        close_trade(trade, price, time)
        print(f"🔄 [ForwardTest] STOP & REVERSE: Closed SHORT for {symbol}")

    # 2. ENTER LONG: Stack a new trade
    # (We enter regardless if we already have longs, as requested)
    new_trade = PaperTrade(
        symbol=symbol,
        interval=interval,
        direction='LONG',
        status='OPEN',
        entry_time=time,
        entry_price=price,
        invested_amount=INVESTMENT_AMOUNT,
        quantity=INVESTMENT_AMOUNT / price
    )
    db.session.add(new_trade)
    db.session.commit()
    print(f"🟢 [ForwardTest] OPEN LONG {symbol} @ {price}")

def handle_sell_signal(symbol, interval, price, time):
    # 1. STOP & REVERSE: Close any OPEN LONG positions
    open_longs = PaperTrade.query.filter_by(
        symbol=symbol, interval=interval, direction='LONG', status='OPEN'
    ).all()
    
    for trade in open_longs:
        close_trade(trade, price, time)
        print(f"🔄 [ForwardTest] STOP & REVERSE: Closed LONG for {symbol}")

    # 2. ENTER SHORT: Stack a new trade
    new_trade = PaperTrade(
        symbol=symbol,
        interval=interval,
        direction='SHORT',
        status='OPEN',
        entry_time=time,
        entry_price=price,
        invested_amount=INVESTMENT_AMOUNT,
        quantity=INVESTMENT_AMOUNT / price
    )
    db.session.add(new_trade)
    db.session.commit()
    print(f"🔴 [ForwardTest] OPEN SHORT {symbol} @ {price}")

def close_trade(trade, exit_price, exit_time):
    trade.status = 'CLOSED'
    trade.exit_price = exit_price
    trade.exit_time = exit_time
    
    # Calculate PnL
    if trade.direction == 'LONG':
        # (Exit - Entry) * Qty
        trade.pnl = (exit_price - trade.entry_price) * trade.quantity
    else:
        # (Entry - Exit) * Qty (Shorting)
        trade.pnl = (trade.entry_price - exit_price) * trade.quantity
        
    trade.pnl_pct = (trade.pnl / trade.invested_amount) * 100
    db.session.merge(trade)
    db.session.commit()