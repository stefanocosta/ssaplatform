from app import db, bcrypt
from datetime import datetime
import calendar

class User(db.Model):
    __tablename__ = 'user' 
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(128), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False) 
    payment_status = db.Column(db.String(20), default='trial', nullable=False)
    subscription_end_date = db.Column(db.DateTime, nullable=True) 

    def __repr__(self):
        return f'<User {self.username}>'

    def set_password(self, password):
        self.password_hash = bcrypt.generate_password_hash(password).decode('utf-8')

    def check_password(self, password):
        return bcrypt.check_password_hash(self.password_hash, password)

    @property
    def is_trial_active(self):
        if not self.created_at: return False
        delta = datetime.utcnow() - self.created_at
        return delta.days < 14

class MarketData(db.Model):
    __tablename__ = 'market_data'
    
    symbol = db.Column(db.String(20), primary_key=True)
    interval = db.Column(db.String(10), primary_key=True) 
    time = db.Column(db.DateTime, primary_key=True)
    
    open = db.Column(db.Float, nullable=False)
    high = db.Column(db.Float, nullable=False)
    low = db.Column(db.Float, nullable=False)
    close = db.Column(db.Float, nullable=False)
    volume = db.Column(db.Float, nullable=True) 
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "time": calendar.timegm(self.time.timetuple()), 
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume or 0
        }

    __table_args__ = (
        db.Index('idx_symbol_interval_time', 'symbol', 'interval', 'time'),
    )

# --- FIX: MOVED TO LEFT MARGIN (Not inside MarketData) ---
class PaperTrade(db.Model):
    __tablename__ = 'paper_trade' # Good practice to name tables explicitly
    id = db.Column(db.Integer, primary_key=True)
    symbol = db.Column(db.String(20), nullable=False)
    interval = db.Column(db.String(10), nullable=False) 
    direction = db.Column(db.String(10), nullable=False) 
    status = db.Column(db.String(10), default='OPEN') 
    
    # Entry Details
    entry_time = db.Column(db.DateTime, nullable=False)
    entry_price = db.Column(db.Float, nullable=False)
    invested_amount = db.Column(db.Float, default=1000.0) 
    quantity = db.Column(db.Float, nullable=False) 
    
    # Exit Details
    exit_time = db.Column(db.DateTime, nullable=True)
    exit_price = db.Column(db.Float, nullable=True)
    pnl = db.Column(db.Float, nullable=True) 
    pnl_pct = db.Column(db.Float, nullable=True)

    trend_snapshot = db.Column(db.String(10), nullable=True)
    forecast_snapshot = db.Column(db.String(10), nullable=True)
    cycle_snapshot = db.Column(db.Integer, nullable=True)
    fast_snapshot = db.Column(db.Integer, nullable=True)