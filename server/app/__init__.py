from flask import Flask
from flask_cors import CORS
from .config import Config

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    CORS(app) # Enable Cross-Origin Resource Sharing for React dev server

    # Import and register blueprints/routes here
    from . import routes
    app.register_blueprint(routes.bp)

    @app.route('/test')
    def test_route():
        return "Server is running!"

    return app