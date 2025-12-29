import sys
import os
from datetime import datetime

# Ensure we can import from the app
sys.path.append(os.getcwd())

from app import create_app, db
from app.models import PaperTrade

app = create_app()

def backfill_strategies():
    with app.app_context():
        print("🔄 Starting Backfill: Creating 'basic_s' history from existing 'basic' data...")

        # 1. Fetch all existing BASIC trades
        # We assume any trade with strategy='basic' (or null, which defaults to basic) is our source
        all_basic_trades = PaperTrade.query.filter(
            (PaperTrade.strategy == 'basic') | (PaperTrade.strategy == None)
        ).order_by(
            PaperTrade.symbol, 
            PaperTrade.interval, 
            PaperTrade.entry_time.asc()
        ).all()

        print(f"   📉 Found {len(all_basic_trades)} existing 'basic' trades to process.")

        new_trades_to_add = []
        
        # Group by Symbol + Interval to process sequences correctly
        # Structure: { "BTC/USD-15min": [trade1, trade2...], ... }
        grouped_trades = {}
        for trade in all_basic_trades:
            key = f"{trade.symbol}-{trade.interval}"
            if key not in grouped_trades:
                grouped_trades[key] = []
            grouped_trades[key].append(trade)

        # 2. Process each group to find the "Pivots" (Single Entries)
        count_created = 0
        
        for key, trades in grouped_trades.items():
            last_direction = None
            
            for trade in trades:
                # LOGIC:
                # If the direction changes (e.g. None -> LONG, or SHORT -> LONG), 
                # this is the "Pivot" / "First Entry". We keep it.
                # If direction is same (LONG -> LONG), it's an "Add-on". We skip it.
                
                if trade.direction != last_direction:
                    # This is a PIVOT trade. Duplicate it for 'basic_single'
                    
                    new_trade = PaperTrade(
                        symbol=trade.symbol,
                        interval=trade.interval,
                        direction=trade.direction,
                        status=trade.status,
                        strategy='basic_s', # <--- The New Strategy Name
                        
                        entry_time=trade.entry_time,
                        entry_price=trade.entry_price,
                        invested_amount=trade.invested_amount,
                        quantity=trade.quantity,
                        
                        exit_time=trade.exit_time,
                        exit_price=trade.exit_price,
                        pnl=trade.pnl,
                        pnl_pct=trade.pnl_pct,
                        
                        trend_snapshot=trade.trend_snapshot,
                        forecast_snapshot=trade.forecast_snapshot,
                        cycle_snapshot=trade.cycle_snapshot,
                        fast_snapshot=trade.fast_snapshot
                    )
                    
                    new_trades_to_add.append(new_trade)
                    last_direction = trade.direction
                    count_created += 1
                else:
                    # This is a continuation trade (multiple entry). 
                    # The 'basic_single' strategy ignores these.
                    pass

        # 3. Batch Insert
        if new_trades_to_add:
            print(f"   💾 Saving {len(new_trades_to_add)} new 'basic_s' trades to DB...")
            # Use bulk_save_objects for speed if list is huge, but add_all is safer for signals
            db.session.add_all(new_trades_to_add)
            db.session.commit()
            print("   ✅ Success! History populated.")
        else:
            print("   ⚠️ No trades generated. Check if 'basic' data exists.")

if __name__ == "__main__":
    backfill_strategies()