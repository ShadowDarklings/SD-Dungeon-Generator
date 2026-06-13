# gunicorn.conf.py
import os

# Bind to the Unix socket used by nginx and a loopback port for health checks.
bind = ["unix:/tmp/gunicorn.sock", "127.0.0.1:8000"]

# Keep the live EC2 box predictable: a small fixed worker pool is much less
# likely to thrash memory than the default CPU-based formula on a 1-2 GB host.
workers = int(os.environ.get("GUNICORN_WORKERS", "2"))
threads = int(os.environ.get("GUNICORN_THREADS", "2"))
worker_class = "gthread"
timeout = int(os.environ.get("GUNICORN_TIMEOUT", "60"))
graceful_timeout = int(os.environ.get("GUNICORN_GRACEFUL_TIMEOUT", "30"))
keepalive = int(os.environ.get("GUNICORN_KEEPALIVE", "5"))
max_requests = int(os.environ.get("GUNICORN_MAX_REQUESTS", "500"))
max_requests_jitter = int(os.environ.get("GUNICORN_MAX_REQUESTS_JITTER", "50"))

# Production logging setup (stdout/stderr captured by Docker)
accesslog = "-"
errorlog = "-"
loglevel = "info"

# Optimization: Preload application code into the master process memory
preload_app = True

def post_fork(server, worker):
    """
    Megan's Hardening Hook: Database Connection Isolation
    
    Since we preload the Flask app into the master process, our SQLModel 'engine' 
    is initialized once by the parent process. To avoid fatal socket sharing 
    collisions where multiple worker processes try to talk over the exact same 
    database connection pool simultaneously, we must break the inherited pool here.
    
    This forces every individual worker to establish its own safe pool post-fork.
    """
    server.log.info(f"Worker {worker.pid} spawned. Cleaning parent connection pool.")
    try:
        from app import engine
        engine.dispose()
        server.log.info(f"Worker {worker.pid} database engine successfully disposed and isolated.")
    except Exception as e:
        server.log.error(f"Failed to dispose database engine in worker {worker.pid}: {e}")
