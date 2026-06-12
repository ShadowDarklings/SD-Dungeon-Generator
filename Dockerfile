FROM python:3.12-slim

WORKDIR /app

# Install dependencies first; Docker caches this layer if requirements don't change.
COPY requirements.txt .
RUN pip install -r requirements.txt requests responses

# ShadowDarklings import uses Playwright server-side. Production images need
# Chromium available or imports fail after deploy even though tests pass.
RUN python -m playwright install --with-deps chromium

# Copy the rest of the app.
COPY . .

# Gunicorn binds to a Unix socket shared with nginx (see gunicorn.conf.py).
CMD ["gunicorn", "-c", "gunicorn.conf.py", "app:app"]
