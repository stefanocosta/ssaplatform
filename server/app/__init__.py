from flask import Flask
from flask_cors import CORS
from .config import Config
from flask_sqlalchemy import SQLAlchemy 
from flask_bcrypt import Bcrypt 
from flask_jwt_extended import JWTManager, get_jwt, create_access_token, get_jwt_identity, verify_jwt_in_request
from datetime import datetime, timezone, timedelta # Import datetime utils

# Initialize extensions globally
db = SQLAlchemy()
bcrypt = Bcrypt()
jwt = JWTManager()

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Simplified CORS for development (Added x-access-token to exposed headers)
    CORS(app, 
         resources={r"/api/*": {"origins": "*", "allow_headers": ["Content-Type", "Authorization"], "expose_headers": ["x-access-token"]}}, 
         supports_credentials=True)

    # Initialize extensions with the app (deferred initialization)
    db.init_app(app)
    bcrypt.init_app(app)
    jwt.init_app(app)

    # Import and register blueprints/routes here. 
    from . import routes
    app.register_blueprint(routes.bp)
    
    # We must also import the models so that SQLAlchemy knows about them 
    # when db.create_all() is called.
    from . import models 

    # --- NEW: SLIDING SESSION LOGIC ---
    @app.after_request
    def refresh_expiring_jwts(response):
        try:
            # Try to verify a JWT exists in the request
            verify_jwt_in_request(optional=True)
            
            # Get the payload
            exp_timestamp = get_jwt()["exp"]
            now = datetime.now(timezone.utc)
            target_timestamp = datetime.timestamp(now + timedelta(minutes=5))
            
            # If the token expires in less than 5 minutes, issue a new one
            if target_timestamp > exp_timestamp:
                identity = get_jwt_identity()
                new_token = create_access_token(identity=identity)
                
                # Add the new token to the response headers
                response.headers['x-access-token'] = new_token
                
        except (RuntimeError, KeyError, Exception):
            # If no valid JWT is present or any other error, just return the response
            return response
            
        return response
    # --- END NEW LOGIC ---

    @app.route('/test')
    def test_route():
        return "Server is running!"

    return app