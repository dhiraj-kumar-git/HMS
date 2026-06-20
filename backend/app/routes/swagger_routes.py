from flask import Blueprint, send_from_directory, jsonify
from flask_swagger_ui import get_swaggerui_blueprint
import os

swagger_bp = Blueprint('swagger_bp', __name__)

SWAGGER_URL = '/api/docs'
API_URL = '/static/swagger.json'

swaggerui_blueprint = get_swaggerui_blueprint(
    SWAGGER_URL,
    API_URL,
    config={
        'app_name': "HMS API Documentation"
    }
)

# Route to serve the static swagger.json file
@swagger_bp.route('/static/swagger.json')
def serve_swagger_spec():
    # Construct the path to backend/app/static
    static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static')
    return send_from_directory(static_dir, 'swagger.json')
