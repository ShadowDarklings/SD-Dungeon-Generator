FROM python:3.12-bookworm

WORKDIR /app

# Install Chromium runtime libraries directly. Playwright's --with-deps fallback
# can break on newer Debian images when distro package names change.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    fonts-unifont \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first; Docker caches this layer if requirements don't change.
COPY requirements.txt .
RUN pip install -r requirements.txt requests responses

# ShadowDarklings import uses Playwright server-side. Production images need
# Chromium available or imports fail after deploy even though tests pass.
RUN python -m playwright install chromium

# Copy the rest of the app.
COPY . .

# Gunicorn binds to a Unix socket shared with nginx (see gunicorn.conf.py).
CMD ["gunicorn", "-c", "gunicorn.conf.py", "app:app"]
