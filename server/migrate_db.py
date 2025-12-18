from app import create_app, db
from sqlalchemy import text, inspect

app = create_app()

def migrate():
    with app.app_context():
        print("🚀 Starting Production Schema Migration (PostgreSQL)...")
        inspector = inspect(db.engine)
        conn = db.engine.connect()
        trans = conn.begin()

        try:
            # --- TASK 1: Update 'paper_trade' table (For Multi-Strategy) ---
            pt_columns = [c['name'] for c in inspector.get_columns('paper_trade')]
            
            if 'strategy' not in pt_columns:
                print("   🛠️  Adding 'strategy' column to 'paper_trade'...")
                # We default existing trades to 'basic' to preserve history context
                conn.execute(text("ALTER TABLE paper_trade ADD COLUMN strategy VARCHAR(10) DEFAULT 'basic'"))
            else:
                print("   ✅ 'paper_trade.strategy' already exists.")

            # --- TASK 2: Update 'market_data' table (For Hidden Backtest Support) ---
            # We add these as NULLABLE columns. This is instant in PostgreSQL and 
            # won't disrupt existing data. We simply won't fill them with historical data yet.
            md_columns = [c['name'] for c in inspector.get_columns('market_data')]
            
            ssa_cols = [
                ("ssa_trend", "FLOAT"),
                ("ssa_cyclic", "FLOAT"),
                ("ssa_noise", "FLOAT"),
                ("ssa_trend_dir", "VARCHAR(10)"),
                ("ssa_cycle_pos", "INTEGER"),
                ("ssa_fast_pos", "INTEGER")
            ]

            for col_name, col_type in ssa_cols:
                if col_name not in md_columns:
                    print(f"   🛠️  Adding '{col_name}' to 'market_data'...")
                    conn.execute(text(f"ALTER TABLE market_data ADD COLUMN {col_name} {col_type} DEFAULT NULL"))
                else:
                    print(f"   ✅ 'market_data.{col_name}' already exists.")

            trans.commit()
            print("\n🎉 Migration Complete! Database is ready for new code.")

        except Exception as e:
            trans.rollback()
            print(f"\n❌ Migration Failed: {e}")
        finally:
            conn.close()

if __name__ == "__main__":
    migrate()