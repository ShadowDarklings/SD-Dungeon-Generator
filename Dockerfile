FROM python:3.12-slim

WORKDIR /app

# Install dependencies first; Docker caches this layer if requirements don't change.
COPY requirements.txt .
RUN pip install -r requirements.txt requests responses

# Copy the rest of the app.
COPY . .

# Gunicorn binds to a Unix socket shared with nginx (see gunicorn.conf.py).
CMD ["gunicorn", "-c", "gunicorn.conf.py", "app:app"]
