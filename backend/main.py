import base64
import random
import io
import os
from tempfile import NamedTemporaryFile
from flask import Flask, request, jsonify
import database  # Import database functions
from database import get_doctors_name
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity, get_jwt
import uuid
from database import get_patient_by_id
import pandas as pd
import json
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from dotenv import load_dotenv
from datetime import datetime
import boto3
from botocore.config import Config

load_dotenv()

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
EMAIL_ADDRESS = os.getenv("EMAIL_ADDRESS")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")

import time

app = Flask(__name__)
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY")
jwt = JWTManager(app)

@jwt.token_in_blocklist_loader
def check_if_token_is_revoked(jwt_header, jwt_payload):
    jti = jwt_payload["jti"]
    if database.redis_client:
        token_in_redis = database.redis_client.get(f"blocklist_{jti}")
        return token_in_redis is not None
    return False
CORS(app, supports_credentials=True, resources={r"/*": {"origins": "*"}})

from app.routes.auth_routes import auth_bp
app.register_blueprint(auth_bp)
from app.routes.staff_routes import staff_bp
app.register_blueprint(staff_bp)
from app.routes.inventory_routes import inventory_bp
app.register_blueprint(inventory_bp)
from app.routes.lab_routes import lab_bp
app.register_blueprint(lab_bp)
from app.routes.public_routes import public_bp
app.register_blueprint(public_bp)
from app.routes.patient_routes import patient_bp
app.register_blueprint(patient_bp)
from app.routes.swagger_routes import swagger_bp, swaggerui_blueprint
app.register_blueprint(swagger_bp)
app.register_blueprint(swaggerui_blueprint)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
