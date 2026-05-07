FROM python:3.12-slim

WORKDIR /app

# Install dependencies first; Docker caches this layer if requirements don't change.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the app.
COPY . .

# Expose Flask's default port.
EXPOSE 5000

# Use Flask's built-in dev server. For production, you'd use gunicorn
# or similar — covered later in the course.
CMD ["python", "app.py"]
