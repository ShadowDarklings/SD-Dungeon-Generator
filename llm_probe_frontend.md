# LLM Security Probe — Frontend Layer (Charles)

This document contains the conversation from the LLM security probe of our frontend/nginx security headers and CSP, followed by my engineering reflections.

## Part 1: The Audit Prompt & Input

### Prompt Supplied:

"I'm hardening the frontend of a Flask app — a procedural dungeon generator with a canvas-based map UI. Here's our nginx security header config and CSP. Evaluate against best practices: (a) what's missing for our case, (b) what's too strict and would break us, (c) what an attacker could still do. Tell me what you'd change and why."

### Input Configuration:

**nginx security headers (from `nginx/nginx.conf`):**
```nginx
add_header Strict-Transport-Security "max-age=31536000" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'" always;
```

**Frontend structure:**
- `S3_content/index.html` — main dungeon UI (canvas-based map, character import modal)
- `S3_content/styles.css` — 975 lines of dungeon UI styling (external file, no inline styles)
- `S3_content/src/` — 12 external JavaScript modules (main.js, render.js, characters.js, interactions.js, visibility.js, etc.)
- All JS is loaded via `<script>` tags referencing external files, no inline `<script>` blocks
- One inline `onclick` attribute on a button element
- Flask templates: login, register, base templates use Jinja2

---

## Part 2: LLM Audit Response

### (a) What's missing for our case

1. **`Permissions-Policy` header is absent.** Your dungeon generator doesn't use the camera, microphone, geolocation, or payment APIs, but without `Permissions-Policy` (formerly `Feature-Policy`), a cross-origin iframe (if framing were ever allowed) could request these permissions. Adding `Permissions-Policy: camera=(), microphone=(), geolocation=()` explicitly denies these capabilities.

2. **CSP is incomplete for your actual frontend.** `default-src 'self'` is a strong baseline but you should break it out:
   - `script-src 'self'` — blocks inline scripts (good, since you use external JS files)
   - `style-src 'self'` — blocks inline styles (safe since your CSS is external)
   - `img-src 'self' data:` — your canvas likely uses `toDataURL()` for image export, which generates `data:` URIs
   - `connect-src 'self'` — allows `fetch()`/`XMLHttpRequest` to your own API only
   - `font-src 'self'` — if you use web fonts
   - `frame-ancestors 'none'` — CSP equivalent of `X-Frame-Options: DENY` (more modern)

3. **No `X-Permitted-Cross-Domain-Policies` header.** Prevents Adobe Flash/PDF from loading cross-domain content. Low priority (Flash is dead), but a free defense-in-depth header.

4. **HSTS is missing `includeSubDomains`.** If you ever deploy on a real domain, subdomains without HSTS could be used for cookie injection attacks. For localhost this doesn't matter, but it's best practice to include it.

### (b) What's too strict and would break us

1. **`default-src 'self'` will break inline event handlers.** You mentioned one inline `onclick` attribute on a button. CSP's `script-src 'self'` (inherited from `default-src 'self'`) blocks all inline JavaScript, including `onclick`, `oninput`, `onchange` attributes. The fix is either:
   - Refactor: move the handler to an `addEventListener()` call in your external JS (recommended)
   - Add a `'unsafe-hashes'` directive with the specific hash of the inline handler (partial fix)
   - Add `'unsafe-inline'` to `script-src` (defeats the purpose of CSP)

2. **`Referrer-Policy: strict-origin-when-cross-origin` may over-share on same-origin navigations.** For your dungeon app this is fine — same-origin requests send the full URL (including `/api/runs/123`), but cross-origin requests (like the OAuth redirect to GitHub) only send the origin (`https://localhost`). This is actually the right policy for your OAuth flow.

### (c) What an attacker could still do

1. **XSS through stored dungeon data.** If a user's `state_json` (saved dungeon state) contains malicious content and your frontend renders any of it as HTML (monster names, loot descriptions), CSP won't prevent DOM-based XSS where the script is constructed from trusted `'self'` JavaScript manipulating attacker-controlled data. The fix is output encoding in your rendering code.

2. **Clickjacking via browser extensions.** `X-Frame-Options: DENY` prevents iframe embedding, but a malicious browser extension has full access to the page DOM and can overlay UI elements. No header protects against this.

3. **Session fixation on first visit.** Your HTTP→HTTPS redirect on port 80 briefly exposes the user to an unencrypted connection. An attacker on the same network could inject a session cookie during that brief HTTP window. HSTS mitigates this after the first visit, but the very first request is still vulnerable.

4. **OAuth token theft via open redirect.** If your `/login` or `/register` page accepts a `?next=` parameter for post-login redirect without validating the destination, an attacker could craft a URL like `/login?next=http://evil.com` that steals the OAuth code. CSP and headers don't prevent this — it's an application-layer issue.

---

## Part 3: Engineering Reflection

### What I'm acting on

1. **Refactoring the inline `onclick` handler.** There's only one inline handler in `index.html`. Moving it to an `addEventListener()` in the appropriate JS module is trivial and lets us keep strict CSP without `'unsafe-inline'`. This is the right fix.

2. **Breaking out the CSP directive.** Instead of just `default-src 'self'`, I'd expand to:
   ```
   default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'
   ```
   The `img-src 'self' data:` is important because our canvas renderer might use `toDataURL()` for map screenshots, and a strict `img-src 'self'` would block those.

3. **Adding `Permissions-Policy`.** Free header, no downside. Our dungeon generator has zero reason to access the camera or microphone.

### What I'm pushing back on

1. **`includeSubDomains` on HSTS.** We're on `localhost` with a self-signed cert. Adding `includeSubDomains` has no effect and could confuse future developers who test on subdomains. Not worth the risk for our scope.

2. **`X-Permitted-Cross-Domain-Policies`.** Flash is dead. Adding legacy headers for Flash/PDF cross-domain policies is noise in our config. I'd skip it.

### What surprised me

The XSS-through-stored-data attack was eye-opening. I'd been focused on headers and CSP as the security surface, but the LLM pointed out that our `state_json` travels from user input → API → Postgres → API → frontend rendering. If any of our rendering code uses `innerHTML` with data from `state_json` (like monster names or loot descriptions), CSP doesn't help because the executing script is our own `main.js` — it's "self" and trusted. The attack comes from the data, not the script source. I checked our rendering code and we use `textContent` for most labels, but there are a few places where monster stat blocks build HTML strings. Those need review.

The composition problem between my CSP and the rest of the stack is also clearer now. Mario's nginx sets the headers, but whether `script-src 'self'` works depends entirely on how I write my JavaScript. If I add one `onclick` handler in the HTML, the whole CSP breaks. The header is infrastructure but the constraint is on my code.
