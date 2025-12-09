from datetime import datetime, timedelta
from app import db
from app.models import PaperTrade, MarketData
from app.services.data_manager import TRACKED_ASSETS
from app.services.signal_engine import analyze_market_snapshot
import pandas as pd

INVESTMENT_AMOUNT = 1000.0

def get_interval_minutes(interval):
    """Returns the duration of the interval in minutes."""
    mapping = {
        '15min': 15,
        '30min': 30,
        '1h': 60,
        '4h': 240,
        '1day': 1440
    }
    return mapping.get(interval, 15)

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
    
    interval_mins = get_interval_minutes(interval)
    # Allow a buffer (e.g., 20 mins) for late data or network delays
    # If a 1h candle is > 1h 20m old, the market is likely closed.
    max_delay_minutes = interval_mins + 20 
    
    for symbol in TRACKED_ASSETS:
        # 1. Get Data from DB
        ohlc = get_historical_data_from_db(symbol, interval, limit=500)
        
        if not ohlc or len(ohlc) < 50:
            continue
        
        # 2. Market Closed / Staleness Check
        last_candle = ohlc[-1]
        last_time = last_candle.get('datetime_obj')
        if not last_time:
            last_time = datetime.utcfromtimestamp(last_candle['time'])
            
        # Calculate how old this data is
        now = datetime.utcnow()
        diff = now - last_time
        diff_minutes = diff.total_seconds() / 60
        
        if diff_minutes > max_delay_minutes:
            # print(f"   💤 Skipping {symbol}: Market Closed/Stale (Data is {int(diff_minutes)} min old)")
            continue

        df = pd.DataFrame(ohlc)
        closes = df['close'].values.flatten()
        
        # 3. Analyze
        result = analyze_market_snapshot(closes)
        
        if not result or not result['signal']:
            continue 
            
        signal = result['signal'] 
        price = float(result['price'])
        
        # Extract Snapshot Data
        snapshot = {
            'trend': result['trend_dir'],
            'forecast': result['forecast_dir'],
            'cycle': result['cycle_pct'],
            'fast': result['fast_pct']
        }
        
        print(f"   ⚡ SIGNAL DETECTED: {symbol} {signal} @ {price}")

        # 4. Execute Trade Logic
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