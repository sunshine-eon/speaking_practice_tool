"""
Configuration file for Speaking Practice Roadmap Tool
"""

import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# ChatGPT API Configuration (for Phase B)
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')

# Typecast.ai API Configuration
TYPECAST_API_KEY = os.getenv('TYPECAST_API_KEY', '')

# File paths
PROGRESS_FILE = 'progress.json'

# Flask configuration
DEBUG = os.getenv('FLASK_DEBUG', 'True').lower() == 'true'
HOST = os.getenv('FLASK_HOST', '0.0.0.0')
PORT = int(os.getenv('FLASK_PORT', 5001))  # Default to 5001 to match app.py

