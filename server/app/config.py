# config.py
import os
from dotenv import load_dotenv
from datetime import timedelta

basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, '..', '.env')) # Load .env from parent dir

class Config:
    # Existing Keys
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'you-will-never-guess'
    TWELVE_DATA_API_KEY = os.environ.get('TWELVE_DATA_API_KEY')
    
    # New Database Configuration (for PostgreSQL)
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
        'postgresql://user:password@localhost/ssa_trading_db' 
        # Replace with your actual development PostgreSQL connection string
        
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # JWT Configuration
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or 'super-secret-jwt-key' 
    JWT_TOKEN_LOCATION = ['headers'] # Tokens will be sent in the Authorization header
    # Set the token to expire after 30 minutes of inactivity, for example
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=30)

        # Ensure JWT_SECRET_KEY is set or the app won't run securely
    if not JWT_SECRET_KEY:
        print("WARNING: JWT_SECRET_KEY is not set in environment variables!")
        JWT_SECRET_KEY = 'insecure-default-jwt-key'