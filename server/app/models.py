from app import db, bcrypt
from datetime import datetime
import calendar # <--- NEW IMPORT

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
        # --- FIX: NUCLEAR OPTION FOR TIMEZONES ---
        # calendar.timegm ignores local system time and treats the tuple as raw UTC.
        # This guarantees that 10:00 in DB becomes exactly the same integer as 10:00 API.
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