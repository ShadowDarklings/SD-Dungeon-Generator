# gunicorn.conf.py
import multiprocessing

# Bind to a Unix domain socket inside a shared volume with Nginx
bind = "unix:/tmp/gunicorn.sock"

# Standard production worker equation
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = "sync"

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