from app import db, bcrypt # Assumes db and bcrypt are initialized in __init__.py

class User(db.Model):
    """
    User model for storing user accounts.
    """
    # Define the table name explicitly
    __tablename__ = 'user' 

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(128), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    
    def __repr__(self):
        return f'<User {self.username}>'

    def set_password(self, password):
        """Hashes the password using Bcrypt and stores the hash."""
        # decode('utf-8') is necessary because generate_password_hash returns bytes
        self.password_hash = bcrypt.generate_password_hash(password).decode('utf-8')

    def check_password(self, password):
        """Checks the stored hash against the provided password."""
        return bcrypt.check_password_hash(self.password_hash, password)