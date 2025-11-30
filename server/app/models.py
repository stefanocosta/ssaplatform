from app import db, bcrypt
from datetime import datetime # <--- NEW IMPORT

class User(db.Model):
    """
    User model for storing user accounts.
    """
    __tablename__ = 'user' 

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(128), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    
    # --- NEW FIELDS ---
    # defaulted to current time when account is created
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False) 
    
    # 'trial', 'active', 'past_due', 'cancelled'
    payment_status = db.Column(db.String(20), default='trial', nullable=False)
    
    # When does their current plan (or trial) expire?
    # Can be null if they have lifetime access, or strictly managed.
    subscription_end_date = db.Column(db.DateTime, nullable=True) 

    def __repr__(self):
        return f'<User {self.username}>'

    def set_password(self, password):
        self.password_hash = bcrypt.generate_password_hash(password).decode('utf-8')

    def check_password(self, password):
        return bcrypt.check_password_hash(self.password_hash, password)

    # --- NEW HELPER METHOD ---
    @property
    def is_trial_active(self):
        """Returns True if user is within the first 14 days."""
        if not self.created_at: return False
        delta = datetime.utcnow() - self.created_at
        return delta.days < 14