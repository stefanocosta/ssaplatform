from flask import Flask
from flask_cors import CORS
from .config import Config
from flask_sqlalchemy import SQLAlchemy 
from flask_bcrypt import Bcrypt 
from flask_jwt_extended import JWTManager 

# Initialize extensions globally
db = SQLAlchemy()
bcrypt = Bcrypt()
jwt = JWTManager()

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    #CORS(app, origins=["*"]) 
    # Simplified CORS for development
    CORS(app, 
         resources={r"/api/*": {"origins": "*", "allow_headers": ["Content-Type", "Authorization"]}}, 
         supports_credentials=True)

    # Initialize extensions with the app (deferred initialization)
    db.init_app(app)
    bcrypt.init_app(app)
    jwt.init_app(app)

    # Import and register blueprints/routes here. 
    # This import now works because db, bcrypt, and jwt are defined above.
    from . import routes
    app.register_blueprint(routes.bp)
    
    # We must also import the models so that SQLAlchemy knows about them 
    # when db.create_all() is called.
    from . import models 

    @app.route('/test')
    def test_route():
        return "Server is running!"

    return app