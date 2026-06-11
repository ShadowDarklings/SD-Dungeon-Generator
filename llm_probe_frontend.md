# LLM Security Probe - Frontend Layer

**Name:** Charles
**Role:** Frontend
**Project:** ShadowSpawner / SD Dungeon Generator

This is a cleaned-up local draft of the frontend LLM probe. It corrects the earlier claim that `S3_content/index.html` had an inline `onclick` handler. I checked the current branch and did not find inline event-handler attributes in the main dungeon page.

## Prompt

I am hardening the frontend of a Flask app. The app is a Shadowdark-inspired procedural dungeon generator. The browser-facing app includes Flask-rendered login/register/about pages and a canvas-heavy dungeon UI under `/site/`.

Here is our nginx security header config:

```nginx
add_header Strict-Transport-Security "max-age=31536000" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'" always;
```

Here is what loads in the browser:

- Flask templates use `/static/css/styles.css` and `/static/js/forms.js`.
- `templates/base.html` loads Bootstrap CSS from `https://cdn.jsdelivr.net`.
- `/site/` serves `S3_content/index.html`, `S3_content/styles.css`, `S3_content/src/main.js`, local JSON data, fonts, and image assets.
- `S3_content/index.html` uses an external module script, not inline scripts.
- The dungeon client uses `addEventListener()` in JavaScript rather than inline `onclick` attributes.
- `S3_content/about.html` has an inline `<style>` block.
- The frontend calls same-origin API routes such as `/api/runs` and `/api/shadowdarklings/import`.

Evaluate against frontend security best practices:

(a) What is missing for our case?
(b) What is too strict and would break us?
(c) What could an attacker still do despite these headers?
Tell me what you would change and why.

## LLM Response Summary

The LLM said the existing headers are a reasonable start, especially HSTS, `X-Frame-Options`, `nosniff`, and `Referrer-Policy`. It recommended making the CSP more explicit instead of relying on `default-src` for every resource type.

Missing or useful additions:

- Add `frame-ancestors 'none'` to CSP as the modern CSP equivalent of `X-Frame-Options: DENY`.
- Add `base-uri 'self'` to reduce the impact of injected `<base>` tags.
- Add `form-action 'self'` so injected forms cannot submit credentials or CSRF tokens to another origin.
- Add `connect-src 'self'` because the client fetches same-origin JSON and API routes.
- Add `Permissions-Policy` to disable browser APIs the app does not use, such as camera, microphone, geolocation, and payment.

Things that were too strict before the fix:

- `default-src 'self'` blocked Bootstrap CSS from `cdn.jsdelivr.net`.
- `default-src 'self'` also blocked inline styles in `S3_content/about.html` because `style-src` fell back to `default-src`.
- A strict `style-src 'self'` would work only after Bootstrap is vendored locally and inline styles are moved into external CSS.

What attackers could still do:

- CSP does not prevent CSRF by itself. Our forms and API routes still need CSRF/session protections.
- CSP does not prevent broken access control, such as a user requesting another user's saved run.
- CSP does not automatically make saved dungeon data safe. If the frontend renders attacker-controlled data with `innerHTML`, same-origin JavaScript can still create DOM-based XSS.
- HSTS does not protect the very first HTTP visit before the browser has learned the HSTS rule.
- Headers do not protect against compromised dependencies or a malicious collaborator changing nginx, compose, or JavaScript code.

## What I Would Change

My preferred production fix is to keep the policy strict and make the frontend match it:

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
```

To make that work, I would vendor Bootstrap locally or replace it with local CSS, and move the inline styles from `S3_content/about.html` into an external stylesheet.

For this branch, I implemented the smallest assignment-safe change first and kept the rest explicit:

```nginx
default-src 'self'; script-src 'self'; style-src 'self' https://cdn.jsdelivr.net; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

I also moved the `S3_content/about.html` inline styles into `S3_content/about.css`, which let the site work without adding `'unsafe-inline'`.

## What I Would Push Back On

I would not add HSTS preload for this assignment. We are using `localhost` and a self-signed certificate. Preload belongs to a real public domain with stable HTTPS and a certificate renewal plan.

I also would not add inline event handlers. The current dungeon UI already uses external JavaScript event listeners, which is better for CSP and easier to audit.

## What Surprised Me

The surprising part was that `default-src 'self'` looks simple and safe, but it quietly breaks real browser assets unless the frontend inventory is accurate. In our case, the main dungeon page was close to CSP-friendly, but the Flask shell still depended on Bootstrap from a CDN and the static about page used inline CSS. The header is set by nginx, but whether it works is very much frontend work, which is why I verified it against the live Docker stack before finalizing the fix.
