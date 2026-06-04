# Assignment 8 — Part C: Frontend Role
**Name:** Charles  
**Role:** Frontend  
**Project:** Shadowdark Procedural Dungeon Generator  

---

### 1. Security headers — pick three, explain what each does, what attack it mitigates, and what would break if set too strictly

**Strict-Transport-Security (HSTS): `max-age=31536000`**

This header tells the browser "only ever connect to this domain over HTTPS — for the next year, don't even try HTTP." It mitigates SSL stripping attacks, where an attacker intercepts the initial HTTP request and downgrades the connection before the user reaches HTTPS. In our project, without HSTS a man-in-the-middle at a coffee shop could intercept a player's first visit to the dungeon generator and steal their session cookie before the HTTPS redirect happens.

What breaks if too strict: adding `includeSubDomains` or `preload` before you're ready would force HTTPS on every subdomain. If we had a staging server on `staging.ourdomain.com` without a valid cert, it would become completely unreachable. For our `localhost` self-signed setup this isn't an issue, but on a real domain you can't easily undo `preload` — Chrome hardcodes it.

**X-Frame-Options: `DENY`**

This prevents any site from embedding our dungeon generator in an `<iframe>`. Without it, an attacker could build a malicious page that loads our app in a transparent iframe, then overlay invisible buttons so the user clicks "Delete Run" or "Logout" thinking they're clicking something else — a classic clickjacking attack. For a game UI with lots of buttons (generate dungeon, save, load, defeat monster, pick lock), clickjacking is a real vector.

What breaks if too strict: `DENY` is already the strictest setting and it's fine for us — we have no legitimate reason to iframe our own app. If we later wanted to embed the dungeon map in another page (a portfolio site, a wiki), we'd need to relax this to `SAMEORIGIN`, which allows framing only from the same domain.

**X-Content-Type-Options: `nosniff`**

This prevents the browser from MIME-sniffing response bodies. Without it, if our `/api/random-tables` endpoint returned malformed JSON that looked like HTML, the browser might interpret it as a web page and execute any `<script>` tags inside. With `nosniff`, the browser strictly trusts the `Content-Type: application/json` header and renders it as data, not code.

What breaks if too strict: `nosniff` is binary — on or off — so there's no "too strict" scenario. The only risk is if we served a file with the wrong `Content-Type` header (e.g., serving `styles.css` as `text/plain`), the browser would refuse to use it as a stylesheet. But nginx's MIME type detection handles this correctly for our static assets.

### 2. Static assets — what changes when nginx serves them instead of Flask

Before the production stack, Flask served everything. When a player loaded the dungeon map at `/site/`, Flask's built-in file handler read `S3_content/index.html` from disk, loaded `styles.css` (975 lines of dungeon UI styling), and served all 12 JavaScript modules (`main.js`, `render.js`, `characters.js`, `visibility.js`, `interactions.js`, etc.) through Python. Every static file request occupied a gunicorn worker for the duration of the file read and response.

Now nginx serves these directly via two `location` blocks:
- `location /static/` → `alias /app/static/` (Flask's static directory — login/register page assets)
- `location /site/` → `alias /app/S3_content/` (the entire dungeon frontend)

Both directories are mounted read-only into the nginx container via `docker-compose.yml` volumes. Nginx serves them with `expires 30d`, which sets `Cache-Control: max-age=2592000` — the browser caches our map renderer, canvas code, and CSS for a month without re-requesting them.

**Performance argument:** nginx serves static files from kernel-level `sendfile()` — it hands the file descriptor directly to the socket without copying data through userspace. Flask copies file contents into a Python string, then through WSGI, then to the socket. For our `main.js` (2,100+ lines), that's a meaningful difference under load.

**Security argument:** static files never touch the Python process, so a vulnerability in Flask's file serving (path traversal, directory listing) can't be exploited through the static paths. Nginx's `alias` directive confines access to exactly `S3_content/` and `static/` — nothing above those directories is reachable.

### 3. Cookie flags from Week 7, in real life

In Week 7, we set `SESSION_COOKIE_SECURE=True` in `app.py`, but we were running on `http://localhost:5000` — the flag was completely inert. The browser happily sent session cookies over plain HTTP because Flask wasn't actually enforcing HTTPS.

Now with the production stack:
- Nginx terminates TLS on port 443 with our self-signed cert
- Megan's `ProxyFix` middleware tells Flask the original request was HTTPS (via `X-Forwarded-Proto`)
- `FLASK_ENV=production` in `docker-compose.yml` activates `SESSION_COOKIE_SECURE=True`

The session cookie now has the `Secure` flag set for real. The browser will only send it over HTTPS connections — if someone accesses `http://localhost` (port 80), nginx redirects to HTTPS, but even if a request somehow reached Flask over plain HTTP, the browser would refuse to attach the session cookie. The user would appear logged out.

**What would have broken in dev if we'd set this earlier:** everything. Our Week 5–7 development used `http://localhost:5000` directly. With `Secure` active, the session cookie would never be sent, so every `@login_required` route would redirect to login, OAuth callbacks would lose the session, and the save/load workflow would fail silently because the user appeared anonymous after every redirect.

### 4. Debugging "I keep getting logged out after every redirect"

**First check: the browser's DevTools → Application → Cookies tab.** I'd look at the session cookie's flags. If `Secure` is set but the page loaded over HTTP, the cookie isn't being sent — that's the #1 cause of "logged out after redirect" in our stack. The redirect from HTTP to HTTPS drops the cookie because the browser hasn't received the HTTPS response that sets it yet.

**Second check: DevTools → Network tab.** Filter by the redirect chain. If `/login/github` → GitHub → `/auth/github/callback` → `/` shows the callback setting a `Set-Cookie` header but the final `/` redirect doesn't include the cookie in its request, the `SameSite=Lax` or `Secure` flag is blocking it. `SameSite=Lax` allows cookies on top-level navigations (like our OAuth redirect), so if it's not arriving, `Secure` over HTTP is the likely culprit.

**Third check: ProxyFix.** If `ProxyFix` isn't installed or configured with the wrong `x_proto` value, Flask thinks the request came over HTTP even though nginx handled it over HTTPS. Flask then refuses to set `Secure` cookies because `request.is_secure` returns `False`. This is the composition problem — my frontend redirect hits nginx over HTTPS, nginx proxies to gunicorn over a Unix socket (no TLS), and Flask needs ProxyFix to know the original was HTTPS.

**What the LLM is useful for:** explaining the interaction between `SameSite`, `Secure`, and redirect chains — the specification is complex and the LLM can explain which combinations of flags cause which behaviors. **What it's not useful for:** knowing whether *our* ProxyFix is configured correctly, whether *our* nginx is setting `X-Forwarded-Proto`, or what *our* redirect chain actually looks like. That requires reading our `nginx.conf` and `app.py`, which the LLM hasn't seen unless I paste them in.

### 5. Have the LLM security-test your frontend layer

See `llm_probe_frontend.md` for the full conversation and reflection.
