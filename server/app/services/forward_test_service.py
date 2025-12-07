from datetime import datetime
import time # Added for safety delay if needed
from app import db
from app.models import PaperTrade, MarketData
# Ensure your model has the new columns before running this!
from app.services.data_manager import get_historical_data, TRACKED_ASSETS
from app.services.signal_engine import analyze_market_snapshot
import pandas as pd

INVESTMENT_AMOUNT = 1000.0

def get_historical_data_from_db(symbol, interval, limit=500):
    """Fetches required historical data from the local database."""
    stmt = db.select(MarketData).filter(
        MarketData.symbol == symbol,
        MarketData.interval == interval,
    ).order_by(MarketData.time.desc()).limit(limit)

    results = db.session.execute(stmt).scalars().all()
    results.reverse() 

    data_list = []
    for r in results:
        data_list.append({
            'time': r.time, 
            'datetime_obj': datetime.utcfromtimestamp(r.time) if isinstance(r.time, int) else r.time,
            'open': r.open, 'high': r.high, 'low': r.low, 'close': r.close, 'volume': r.volume
        })
    return data_list

def run_forward_test(interval, api_key=None):
    print(f"🧪 [ForwardTest] Running for {interval} on {len(TRACKED_ASSETS)} assets...")
    
    for symbol in TRACKED_ASSETS:
        # Use DB data to avoid API limits
        ohlc = get_historical_data_from_db(symbol, interval, limit=500)
        
        if not ohlc or len(ohlc) < 50:
            continue
        
        df = pd.DataFrame(ohlc)
        closes = df['close'].values.flatten()
        
        last_candle = ohlc[-1]
        last_time = last_candle.get('datetime_obj')
        if not last_time:
            last_time = datetime.utcfromtimestamp(last_candle['time'])
        
        # 2. Analyze
        result = analyze_market_snapshot(closes)
        
        if not result or not result['signal']:
            continue 
            
        signal = result['signal'] 
        price = float(result['price'])
        
        # --- NEW: Extract Snapshot Data ---
        snapshot = {
            'trend': result['trend_dir'],
            'forecast': result['forecast_dir'],
            'cycle': result['cycle_pct'],
            'fast': result['fast_pct']
        }
        # ----------------------------------
        
        print(f"   ⚡ SIGNAL DETECTED: {symbol} {signal} @ {price}")

        # 3. Execute Trade Logic (Pass snapshot)
        if signal == 'BUY':
            handle_buy_signal(symbol, interval, price, last_time, snapshot)
        elif signal == 'SELL':
            handle_sell_signal(symbol, interval, price, last_time, snapshot)

def handle_buy_signal(symbol, interval, price, time, snapshot):
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
        quantity=INVESTMENT_AMOUNT / price,
        # --- NEW FIELDS ---
        trend_snapshot=snapshot['trend'],
        forecast_snapshot=snapshot['forecast'],
        cycle_snapshot=snapshot['cycle'],
        fast_snapshot=snapshot['fast']
    )
    db.session.add(new_trade)
    db.session.commit()

def handle_sell_signal(symbol, interval, price, time, snapshot):
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
        quantity=INVESTMENT_AMOUNT / price,
        # --- NEW FIELDS ---
        trend_snapshot=snapshot['trend'],
        forecast_snapshot=snapshot['forecast'],
        cycle_snapshot=snapshot['cycle'],
        fast_snapshot=snapshot['fast']
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