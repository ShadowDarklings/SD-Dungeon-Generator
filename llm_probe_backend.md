# LLM Security Audit Probe — Backend Layer (Megan)

This document contains the transcript of the production-readiness security audit performed on the Python process layer configurations for the Shadowdark Dungeon Generator project, followed by engineering reflections.

## Part 1: The Audit Prompt & Input Configs

### Prompt Supplied to Audit Engine:
"I'm hardening the Python process layer of a Flask app. Here's our gunicorn.conf.py: [pasted below]. Here's our Flask production config and entry points: [pasted below]. Audit for production readiness: (a) wrong or absent settings, (b) information-leakage paths (tracebacks, error messages, default endpoints), (c) anything that would behave correctly under flask run but break under gunicorn or vice versa. Tell me what you'd change and why."

### Input Configurations Evaluated:
1. **`gunicorn.conf.py`**: Configured with Unix socket binding (`unix:/tmp/gunicorn.sock`), dynamic worker count, `preload_app = True`, and a `post_fork` hook to run `engine.dispose()`.
2. **`app.py` Boundary Sections**: Configured with Werkzeug `ProxyFix(..., x_for=1, x_proto=1, x_host=1, x_prefix=1)`, `SESSION_COOKIE_SECURE` dependent on `FLASK_ENV == "production"`, and `debug=not is_prod` on the local execution block.

---

## Part 2: Automated Audit Response

### (a) Analysis of Settings (Wrong or Absent)
* **ProxyFix Forwarding Depth Security:** Your configuration uses `x_for=1`. This is completely correct *only* if Nginx is the single, direct proxy sitting immediately in front of Gunicorn. If your application is later deployed to an environment utilizing an additional upstream load balancer (such as an AWS Application Load Balancer or Cloudflare CDN), `x_for=1` will cause Flask to mistakenly trust a spoofed, untrusted client IP header rather than the true gateway IP. 
* **Absence of Server Header Obfuscation:** Gunicorn by default injects a `Server: gunicorn` signature into HTTP response packets. While not an exploit on its own, it leaks software stack details to scanners and should be actively suppressed.

### (b) Information Leakage Paths
* **Development Fallback Block:** Your trailing entry block safely turns off `debug` when `FLASK_ENV == "production"`. However, if an unhandled internal exception occurs inside your SQLModel database execution routines (e.g., a query constraint error on `/api/runs`), Flask's default fallback behavior is to render an inert `500 Internal Server Error` page. While safe from code leakage, you lack an explicit, global `@app.errorhandler(500)` block to force a standard JSON message format across your database API endpoints.

### (c) Gunicorn vs. Dev Server Dissimilarities
* **The Preload / SQLModel Import Trap:** Your inclusion of `preload_app = True` and the `post_fork` cleanup hook is excellent. Under `flask run`, memory is isolated to a single thread, so connection pooling collisions never surface. Under Gunicorn's multi-process model, if `engine.dispose()` were absent, worker threads attempting to concurrently write to Postgres would share file descriptors, corrupting the database socket pipeline instantly. Your code handles this perfectly.
* **Static Asset Handling Performance Degrade:** If the application relies on the Python process to serve files within `S3_content/` or traditional `/static/` directories using Flask's `send_from_directory`, Gunicorn's synchronous workers will become blocked handling static file delivery streams rather than executing application code. This work must be completely offloaded to Nginx.

---

## Part 3: Engineering Reflection and Responses

Following the audit results, here is my evaluation of the findings, including what I will implement, what I will push back on, and what structural choices were validated:

1.  **What I am actively changing:** I will explicitly coordinate with the Database/Security role to verify that Nginx is our sole reverse proxy so that our `ProxyFix` configuration depth (`x_for=1`) remains perfectly secure and immune to header spoofing. I will also ensure a generic global `500 Error` response format is declared to shield internal system state from API consumers.
2.  **What I am pushing back on:** The audit recommended moving away from the synchronous worker model (`worker_class = "sync"`). For our specific traffic pattern—which consists mostly of lightweight database mutations for saving runs and simple schema lookups—the synchronous model is stable, highly predictable, and entirely production-ready. We do not need asynchronous worker models like `gevent` unless we introduce websockets or streaming endpoints.
3.  **What surprised me:** I was fascinated by the security rationale behind `ProxyFix` header depths. It highlights that hardening a backend python process is never done in isolation—it depends entirely on understanding every single network hop between the client's browser and our internal containers.