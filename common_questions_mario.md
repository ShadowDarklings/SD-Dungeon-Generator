# Assignment 8 — Part B: Common Questions
**Name:** Mario (DB/Security Role)  
**Project:** Shadowdark Procedural Dungeon Generator  

---

### 1. What does nginx do that your Flask app shouldn't or can't?

Nginx handles three things our Flask process has no business doing. First, it terminates TLS — our self-signed cert lives at `nginx/certs/` and nginx negotiates the HTTPS handshake on port 443, so gunicorn never sees raw TLS traffic. Second, it rate-limits our auth endpoints (`/login`, `/register`, `/login/github`) at 5 requests/minute per IP with `limit_req_zone`, which protects against brute-force credential stuffing without adding middleware to Flask. Third, it serves our static assets directly — the dungeon frontend in `S3_content/` and the Flask `static/` directory are both handled by nginx `location` blocks with `expires 30d`, so our Python workers never waste time on file I/O for CSS, JavaScript, or map assets that don't change between requests.

### 2. What does gunicorn do that flask run doesn't?

`flask run` is single-threaded: if one user's `POST /api/runs` is committing a large dungeon state to Postgres, every other request blocks until that commit finishes. Gunicorn pre-forks `(2 × CPU) + 1` worker processes, so a slow `/api/random-tables` proxy call to our S3 bucket doesn't block someone else loading their saved run on `/api/runs/<id>`. It also isolates crashes — if an unhandled exception kills a worker (say a malformed `state_json` triggers a SQLModel error), gunicorn's master process re-forks a replacement without dropping the site. And it never exposes debug tracebacks to the browser; under `flask run` with `debug=True`, a stack trace leaks our file paths, table names, and SQLModel schema to anyone who triggers an error.

### 3. "Hardening" means making something harder to misuse. What's one specific thing your stack is now harder to misuse than it was last week? Point at something concrete.

Last week the Postgres container had `ports: "5432:5432"` in an earlier draft of our compose file, meaning anyone on the local network could connect directly to our database with the credentials `app:app` and read every user's saved dungeon runs, password hashes, and OAuth identities. Our production `docker-compose.yml` now has **no `ports:` on the `db` service at all** — Postgres is only reachable from the docker network. Combined with nginx on 443/80 as the only published ports, the attack surface for the database dropped from "anyone with a Postgres client" to "someone who already has a shell inside the app container."

### 4. If you wanted to add a load balancer to this picture, where would it go, and what problem would it solve that nginx isn't already solving?

It would sit in front of our nginx container — for example, an AWS Application Load Balancer receiving traffic on port 443 and distributing it across multiple identical nginx→gunicorn→Flask hosts. Our single nginx can proxy and rate-limit, but it can't horizontally scale: if our EC2 instance goes down, the entire dungeon generator is offline. An ALB solves availability (health checks, automatic failover to a healthy host), zero-downtime deploys (drain connections from the old container set before swapping in the new one), and capacity (spread load across replicas when the class runs a load test against our dungeon API).

### 5. What's a single point of failure in your current setup? There's more than one acceptable answer.

The Postgres container. We run a single `postgres:16-alpine` instance with a named volume `pgdata`. If that container crashes, the volume's filesystem gets corrupted, or the host disk fills up, every user loses the ability to save, load, or list their dungeon runs — the entire `/api/runs` surface goes down. There's no replica, no streaming replication, and no automated backup. A `pg_dump` cron job and a standby replica would mitigate this, but both are out of scope for our assignment.

### 6. If someone runs docker-compose down on production, what happens to the data in your database? The answer depends on what your team's compose file looks like — go check.

Our `docker-compose.yml` declares a named volume `pgdata` mounted to `/var/lib/postgresql/data`. Running `docker compose down` stops and removes the containers, but **named volumes survive** — all user accounts, OAuth identities, and saved dungeon runs remain intact on disk. `docker compose up` remounts the same volume and Postgres starts with all data present. However, `docker compose down -v` explicitly deletes volumes, which would destroy everything. The `-v` flag is the difference between a routine restart and a total data loss event.

### 7. What's one thing you learned about your stack from your LLM this week that surprised you, and why?

I was surprised that removing `ports: "5432:5432"` from the `db` service doesn't break anything. I assumed Flask needed a published host port to reach Postgres, but Docker Compose puts all services on the same bridge network by default — our `DATABASE_URL=postgresql://app:app@db:5432/app` uses the service name `db` as a DNS hostname, and Docker resolves it to the container's internal IP. The port is open *inside* the network but invisible from the host. What surprised me is how much security this one omission buys: the entire Postgres attack surface disappears from the host, and it cost zero lines of code — just deleting two lines from the compose file.
