# Assignment 8 — Part B: Common Questions
**Name:** Megan (Backend Role)  
**Project:** Shadowdark Procedural Dungeon Generator  

---

### 1. What does nginx do that your Flask app shouldn't or can't?
Nginx acts as a high-performance reverse proxy at our network edge. It handles heavy architectural burdens that our Flask app shouldn't touch, such as terminating incoming TLS/HTTPS encryption, enforcing strict rate limits on authentication routes, and directly serving static frontend assets (like our map canvas UI inside `S3_content/`). This prevents our Python process from wasting CPU cycles on raw file I/O or malicious traffic.

### 2. What does gunicorn do that flask run doesn't?
The standard `flask run` command relies on a single-threaded development server designed strictly for debugging; it freezes on concurrent requests and crashes completely on unhandled exceptions. Gunicorn is a production-grade WSGI server that implements a pre-forked worker process model. It spins up multiple worker processes to handle concurrent user traffic seamlessly, isolates crashes so an exception on one route doesn't take down the entire application, and manages slow-client network sockets safely.

### 3. "Hardening" means making something harder to misuse. What's one specific thing your stack is now harder to misuse than it was last week? Point at something concrete.
Our tracking cookies are now significantly harder to misuse. Last week, setting `SESSION_COOKIE_SECURE=True` in our code was completely inert because we were developing over plain unencrypted HTTP (`http://localhost`). Now that Nginx terminates actual TLS over HTTPS, this flag is fully activated. This ensures that modern web browsers will strictly refuse to send our session tokens over unencrypted networks, eliminating the risk of a malicious attacker sniffing or hijacking a user's session cookie.

### 4. If you wanted to add a load balancer to this picture, where would it go, and what problem would it solve that nginx isn't already solving?
An external load balancer (like an AWS Application Load Balancer) would sit squarely in front of our Nginx edge proxy. While our single Nginx container optimizes traffic routing *inside* our single server instance, it cannot handle infrastructure-level scaling. An external load balancer solves this by distributing massive incoming user traffic across entirely separate, duplicate container hosts, ensuring high availability and eliminating our single physical server as a single point of failure.

### 5. What's a single point of failure in your current setup? There's more than one acceptable answer.
Our primary single point of failure is our solitary Postgres database container. Because we are running a single database instance with no replica nodes or live-failover mirrors, if that container crashes, its host file volume becomes corrupted, or the database process locks up, our entire application instantly breaks. Users would completely lose the ability to save, update, or load any of their generated dungeon runs[cite: 1].

### 6. If someone runs docker-compose down on production, what happens to the data in your database? The answer depends on what your team's compose file looks like — go check.
Because our team’s `docker-compose.yml` configures a named Docker volume mapped to the Postgres internal storage directory (`/var/lib/postgresql/data`), our data is safe. Running `docker-compose down` stops and destroys the active container instances, but the underlying database tables, user records, and saved dungeon run data remain completely intact on the host disk volume[cite: 1]. When `docker-compose up` is executed again, the new database container mounts that same volume and cleanly restores all state.

### 7. What's one thing you learned about your stack from your LLM this week that surprised you, and why?
I was surprised by how Gunicorn handles global database connection pools when optimization preloading (`preload_app = True`) is enabled. Because our `app.py` instantiates our SQLModel `engine` at import-time, preloading causes the master Gunicorn process to establish the connection pool *before* spawning its children. I learned that all child workers will inherit and try to reuse the exact same database sockets simultaneously—which causes immediate corruption—unless you explicitly clear and isolate the pool inside a Gunicorn `post_fork` hook.