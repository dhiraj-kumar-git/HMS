# Base image: Minimal Python runtime
FROM python:3.10-slim

# Set the working directory directly inside the container to /app
WORKDIR /app

# Copy requirement list first to maximize Docker layer caching
COPY requirements.txt .

# Install all python dependencies securely to /app without caching
RUN pip install --no-cache-dir -r requirements.txt

# Copy all the remaining backend python files
COPY . .

# Explicitly expose port 5000 so the host network can reach the API
EXPOSE 5000

# Use Gunicorn (Production web server) instead of the default Flask development server
# The timeout is set to 120s to ensure longer aggregation pipelines function securely
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "3", "--timeout", "120", "main:app"]
