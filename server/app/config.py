import os
from dotenv import load_dotenv

basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, '..', '.env')) # Load .env from parent dir

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'you-will-never-guess'
    TWELVEDATA_API_KEY = os.environ.get('TWELVEDATA_API_KEY')
    # Add database config later