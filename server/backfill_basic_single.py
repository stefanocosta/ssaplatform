import sys
import os
from datetime import datetime

# Ensure we can import from the app
sys.path.append(os.getcwd())

from app import create_app, db
from app.models import PaperTrade
from app.services.backtest_service import run_backtest
from app.services.data_manager import TRACKED_ASSETS

app = create_app()

def backfill_strategies():
    with app.app_context():
        print("\n" + "="*60)
        print("🔄 Starting Granular Backfill for 'basic_s'")
        print("   Logic: Single Entry per Fast Cycle (First Valid)")
        print("="*60 + "\n")

        # 1. CLEANUP
        print("1. Cleaning old data...")
        deleted = PaperTrade.query.filter_by(strategy='basic_s').delete()
        db.session.commit()
        print(f"   🗑️  Cleared {deleted} existing 'basic_s' records.\n")

        intervals = ['15min', '1h', '4h']
        total_global = 0

        # 2. RUN BACKTEST PER ASSET
        for interval in intervals:
            print(f"📊 Processing Interval: {interval}")
            print("-" * 40)
            
            count_for_interval = 0
            
            for i, symbol in enumerate(TRACKED_ASSETS, 1):
                # Print progress without newline initially
                sys.stdout.write(f"   [{i}/{len(TRACKED_ASSETS)}] {symbol:<10} ... ")
                sys.stdout.flush()
                
                try:
                    # Run backtest for just THIS symbol
                    trades = run_backtest(
                        assets=[symbol], 
                        interval=interval, 
                        lookback_bars=500, 
                        strategy='BASIC_S'
                    )
                    
                    # Convert to DB objects
                    db_objects = []
                    for t in trades:
                        if not t.get('entry_date'): continue
                        try:
                            entry_dt = datetime.strptime(t['entry_date'], "%Y-%m-%d %H:%M")
                            exit_dt = datetime.strptime(t['exit_date'], "%Y-%m-%d %H:%M") if t['exit_date'] != '-' else None
                        except ValueError:
                            continue

                        new_trade = PaperTrade(
                            symbol=t['symbol'],
                            interval=t['interval'],
                            direction=t['direction'],
                            status=t['status'],
                            strategy='basic_s',
                            entry_time=entry_dt,
                            entry_price=t['entry_price'],
                            invested_amount=t['invested'],
                            quantity=t['quantity'],
                            exit_time=exit_dt,
                            exit_price=t['exit_price'],
                            pnl=t['pnl'],
                            pnl_pct=t['pnl_pct'],
                            trend_snapshot=t.get('trend', '-'),
                            forecast_snapshot=t.get('forecast', '-'),
                            cycle_snapshot=t.get('cycle', 0),
                            fast_snapshot=t.get('fast', 0)
                        )
                        db_objects.append(new_trade)
                    
                    if db_objects:
                        db.session.add_all(db_objects)
                        db.session.commit()
                        count_for_interval += len(db_objects)
                        print(f"✅ Added {len(db_objects)} trades")
                    else:
                        print("⚪ No trades found")
                        
                except Exception as e:
                    print(f"❌ Error: {str(e)}")

            print(f"   --> Finished {interval}. Total trades: {count_for_interval}\n")
            total_global += count_for_interval

        print("="*60)
        print(f"✅ BACKFILL COMPLETE! Total 'basic_s' trades created: {total_global}")
        print("="*60)

if __name__ == "__main__":
    backfill_strategies()