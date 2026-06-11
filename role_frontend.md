# Assignment 8 - Part C: Frontend Role

**Name:** Charles
**Role:** Frontend
**Project:** ShadowSpawner / SD Dungeon Generator

## 1. Security headers

### Strict-Transport-Security: `max-age=31536000`

HSTS tells the browser to use HTTPS for this host after the first successful HTTPS visit. It mitigates SSL-stripping attacks where an attacker tries to keep a user on plain HTTP before the HTTPS redirect happens. For our app, that matters because login sessions protect saved dungeon runs at `/runs` and `/api/runs`.

If we set it too strictly on a real domain with `includeSubDomains` or `preload`, we could break staging or testing subdomains that do not have valid HTTPS certificates yet. For this assignment, `localhost` with a self-signed cert is enough; I would not use preload until we have a real domain and a certificate renewal plan.

### X-Frame-Options: `DENY`

This tells the browser not to allow our pages to be embedded in an iframe. It mitigates clickjacking, where an attacker frames our app, overlays invisible controls, and tricks a user into clicking buttons like Save, Load, Logout, or future destructive controls.

`DENY` is acceptable for our project because ShadowSpawner is meant to be used directly, not embedded inside another site. If we later wanted to embed the dungeon map on a campaign page, portfolio page, or wiki, this would be too strict and we would need to revisit it, probably with a CSP `frame-ancestors` rule.

### Content-Security-Policy: explicit resource policy

CSP controls which scripts, styles, images, fonts, and network connections the browser is allowed to load. It mitigates XSS by making injected scripts harder to execute and by limiting where page code can load resources from. In our project, the main dungeon UI under `/site/` is mostly compatible with a strict CSP because `S3_content/index.html` loads `./styles.css` and `./src/main.js` as external local files.

After live testing, I replaced the overly broad `default-src 'self'` header with an explicit policy:

```nginx
default-src 'self'; script-src 'self'; style-src 'self' https://cdn.jsdelivr.net; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

This version keeps scripts same-origin only, allows the existing Bootstrap stylesheet from `cdn.jsdelivr.net`, keeps API and JSON fetches same-origin with `connect-src 'self'`, and blocks risky resource types like plugins via `object-src 'none'`. I also moved the inline CSS out of `S3_content/about.html` into `S3_content/about.css`, so I did not need to weaken the policy with `'unsafe-inline'`.

## 2. Static assets

Before the production stack, Flask served the dungeon frontend through `send_from_directory()` at `/site/`. That meant Python handled requests for `S3_content/index.html`, `S3_content/styles.css`, JavaScript modules like `S3_content/src/main.js`, map images under `S3_content/assets/`, font files like `JBLACK.TTF`, and local JSON tables such as `traps.json` and `monsters-1.json`.

In the new stack, nginx serves static assets directly:

- `/static/` maps to `/app/static/`, which covers Flask shell CSS and JavaScript such as `static/css/styles.css` and `static/js/forms.js`.
- `/site/` maps to `/app/S3_content/`, which covers the main browser game, canvas renderer, images, JSON data, and client modules.

The performance argument is that nginx is built for static files and can serve them cheaply with cache headers like `expires 30d`, while gunicorn workers stay available for dynamic work like login, OAuth, and saved-run API calls. The security argument is that fewer static requests enter the Python process, which reduces the amount of untrusted browser traffic Flask has to route. The tradeoff is that nginx alias rules must be reviewed carefully so `/site/` cannot escape into files like `app.py` or `.env`.

## 3. Cookie flags from Week 7, in real life

In Week 7, the app had secure cookie settings, but local HTTP development made the most important flag hard to observe. A browser only enforces a `Secure` session cookie over HTTPS. Now nginx listens on 443 with a self-signed certificate, redirects port 80 to HTTPS, and forwards `X-Forwarded-Proto` to gunicorn. Megan's ProxyFix setup lets Flask trust that forwarded scheme.

With `FLASK_ENV=production`, `SESSION_COOKIE_SECURE=True` is active. After login, the browser should send the session cookie to `https://localhost` requests, including `/runs` and `/api/runs`. It should not send that cookie over plain `http://localhost`. If we had enabled that behavior earlier while developing on `http://localhost:5000`, the user would seem logged out after every redirect because the browser would refuse to attach the secure cookie.

## 4. Browser-side debugging: "I keep getting logged out after every redirect"

I would start in browser DevTools, not in Python. First I would inspect the session cookie in the Application tab: is it present, is `Secure` set, what domain/path does it have, and is the browser on `https://localhost` or `http://localhost`? Then I would use the Network tab to follow the redirect chain through `/login`, `/login/github`, `/auth/github/callback`, `/`, and `/runs`. I would check whether the response sets a cookie and whether the next request actually sends it.

If the cookie is set but not sent, the likely issue is the cookie attributes: `Secure`, `SameSite`, domain, path, or an HTTP/HTTPS mismatch. If Flask is generating `http://` redirects behind nginx, I would check `X-Forwarded-Proto` in `nginx/nginx.conf` and ProxyFix in `app.py`. The LLM is useful for explaining how `Secure`, `SameSite=Lax`, OAuth redirects, and ProxyFix interact. It is not useful for seeing our actual browser cookies, our real redirect chain, or whether the current nginx container is sending the header we think it is sending.

## 5. Frontend LLM probe reflection

The existing `llm_probe_frontend.md` needed revision because it said there was an inline `onclick` handler in `S3_content/index.html`. I checked the current file and did not find one. The real CSP problem was different: the old `default-src 'self'` policy blocked the Bootstrap CDN stylesheet in `templates/base.html` and inline styles in `S3_content/about.html`.

What I changed was the explicit CSP, not a broad relaxation. I allowed `https://cdn.jsdelivr.net` only in `style-src`, kept scripts same-origin, added `frame-ancestors 'none'`, `base-uri 'self'`, and `form-action 'self'`, and added a `Permissions-Policy` header for browser APIs we do not use. I also moved the about-page CSS into an external stylesheet so the frontend works without `'unsafe-inline'`. What I would still push back on is adding HSTS preload during a self-signed localhost assignment. That is real production work for a real domain, not a Week 8 local stack.
