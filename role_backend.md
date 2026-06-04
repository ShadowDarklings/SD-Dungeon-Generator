# Assignment 8 — Part C: Role-Specific Hardening (Backend)
**Name:** Megan  
**Role:** Backend Engineer  
**Project Configuration:** Shadowdark Procedural Dungeon Generator  

This report outlines the deep hardening implementation at the boundary between our Gunicorn WSGI server and the Flask application process layer.

---

### 1. Why Gunicorn, Concretely
The built-in `flask run` utility relies on the Werkzeug development server. It possesses three production-disqualifying properties, which we have mitigated by shifting to Gunicorn:

* **Single-Threaded Head-of-Line Blocking:**
    * *The Problem:* `flask run` handles exactly one request at a time by default. In our app, if a user hits the `/api/random-tables` route to pull large dungeon asset JSON payloads (monsters/traps) from our external S3 buckets, that proxying request blocks on outbound network I/O. Under `flask run`, every other user attempting to hit `/api/runs` to save or load their map configurations would experience a total freeze until that single I/O transaction finishes.
    * *Gunicorn's Solution:* Gunicorn establishes a master process that manages a pre-forked pool of independent operating system worker processes. If worker #1 blocks on an external S3 request via `/api/random-tables`, the operating system immediately switches execution contexts to worker #2 to handle incoming map-saving payloads on `/api/runs`.
* **Information Leakage via Interactive Debug Traces:**
    * *The Problem:* When `flask run` encounters an unhandled exception (like a database connection timeout or an integrity collision in SQLModel), its development state renders an interactive, browser-facing traceback stack. An attacker can leverage this stack to see our internal file paths, module structures, and SQLModel table definitions.
    * *Gunicorn's Solution:* Gunicorn strictly untethers the execution process from active in-browser debugging monitors. When exceptions occur, Gunicorn catches the process state, returns a clean, uninformative HTTP 500 error code to the client, and diverts the rich stack trace strictly to standard error logs (`stderr`) captured securely by Docker.
* **Fragile Process Management and Collapse Vulnerability:**
    * *The Problem:* If a request triggers a catastrophic failure or an out-of-memory error inside a route under `flask run`, the entire Python process crashes and terminates permanently, dropping the website offline for all users until a developer manually restarts it via a terminal shell.
    * *Gunicorn's Solution:* Gunicorn acts as a vigilant process supervisor. If an unhandled thread crash or segment violation kills an active child worker process, the master process instantly detects the dead process socket, re-forks a fresh worker clone within milliseconds, and maintains 100% application availability.

---

### 2. Worker Model Analysis
Gunicorn provides several worker management classes, primarily `sync` (synchronous), `gthread` (threaded), and `gevent` (asynchronous greenlets). 

* **Our Selection:** I have selected the **Synchronous (`sync`) Worker Class** utilizing the classic performance equation: `(2 * CPU Cores) + 1`. 
* **Engineering Rationale:** Let's look honestly at our traffic patterns. Our app is a procedural utility. Aside from the occasional outbound proxy request on `/api/random-tables`, the vast majority of our requests (such as POST/GET/PUT/DELETE on `/api/runs` and `/api/runs/<int:run_id>`) are highly CPU-efficient text and JSON payloads fetching or storing structured relational maps to Postgres. They complete in milliseconds. Because we do not have thousands of concurrent open connections, long-polling telemetry, or streaming endpoints, the `sync` worker model is the most stable and predictable choice. It avoids the complexity and thread-safety bugs common in asynchronous execution.
* **What Would Change My Mind:** If we later expanded our Shadowdark client application to support real-time collaborative map building—where multiple players are connected to the same dungeon layout simultaneously using WebSockets, Server-Sent Events (SSE), or long-lived HTTP polling loops—the synchronous model would fail. Each open socket would permanently monopolize a worker process. In that scenario, I would immediately switch to the **`gthread`** or **`gevent`** worker class, enabling a single worker process to handle thousands of concurrent, long-lived connections concurrently.

---

### 3. The WSGI Contract
WSGI (Web Server Gateway Interface) is a standardized contract (defined in PEP 3333) that bridges the gap between web servers and Python web frameworks. 

* **What it means for Flask to be a "WSGI App":** To comply with the contract, our Flask framework doesn't need to know anything about network sockets, HTTP parsing, or TLS handshakes. It simply exposes a standardized python callable object (`app.wsgi_app`) that accepts two specific arguments: a dictionary containing all request variables (the WSGI environment) and a callback function used to initiate the HTTP status and headers.
* **Why the contract matters beyond Gunicorn:** This absolute separation of concerns means our application logic is completely decoupled from our server infrastructure. If our team later decided to swap Gunicorn out for another high-performance engine like `uWSGI`, we wouldn't have to alter a single line of our endpoint routing or authentication code. 
* **Switching to ASGI:** If we transitioned our stack to an **ASGI framework** (Asynchronous Server Gateway Interface, like FastAPI or Quart) to leverage Python's `async/await` syntax, our WSGI contract would no longer apply. ASGI handles concurrent connections using an asynchronous event loop rather than individual process threads. We would have to wrap our synchronous code in a WSGI-to-ASGI adapter middleware, or completely rewrite our route definitions (`async def`) and shift to an ASGI runner like `Uvicorn` to handle the asynchronous request pipeline.

---

### 4. ProxyFix and X-Forwarded-Proto
In our production stack, our Nginx container sits directly on the network edge terminating the TLS connection. It receives secure `HTTPS` traffic on port 443, decrypts it, and passes it along to Gunicorn over an unencrypted internal Unix socket file pointer (`/tmp/gunicorn.sock`).

* **What breaks without a fix:** Because the traffic arriving from Gunicorn looks like plain HTTP, Flask's internal context logic remains completely blind to the outer HTTPS wrapping. This breaks our backend security in two catastrophic ways:
    1.  Our dynamic helper `url_for()` calls will generate absolute redirect paths starting with `http://` instead of `https://`, causing mixed-content blocking errors in the user's browser.
    2.  Our hardened cookie configuration `SESSION_COOKIE_SECURE = True` will see an unencrypted request context and **refuse to append the session cookie** to the response header entirely. This traps our users in a broken loop where they are logged out immediately on every single redirect.
* **What the ProxyFix middleware does:** Werkzeug's `ProxyFix` intercepts the incoming request dictionary right as it hits the WSGI layer. It checks for specific headers injected by Nginx—primarily `X-Forwarded-Proto` and `X-Forwarded-For`. If it finds them, it safely rewrites the Flask environment variables so the framework genuinely believes it received a native, secure HTTPS request.
* **Why it is a Flask concern, not an Nginx concern:** Nginx has already fulfilled its responsibility by translating the network packets and explicitly communicating the upstream state via the `X-Forwarded-*` headers. It is fundamentally an *application-layer concern* because only Flask has authority over how its route variables, session cookie delivery systems, and redirection engines evaluate that state to enforce security tracking visibility.