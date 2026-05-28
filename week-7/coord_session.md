# Coordinator LLM Session — Week 7 Contract Revision (OAuth + Playwright + Hardening)

**Date:** May 26, 2026  
**Coordinator:** Charles (ctr37@uw.edu)  
**LLM:** Claude Sonnet  
**Team:** ShadowDarklings (Charles — coordinator + client-side, Megan — server-side, Mario — DB & security)

---

## Context going in

Week 6 landed cleanly: 7 SQLModel tables, Flask-Login integration, BOLA 404
rules, and the S3 random-tables proxy. Mario's DB & security slice is fully
verified. Megan and Charles's Week 6 slices are still pending merge but won't
block Week 7 — the schema and auth foundation are in place.

Week 7 adds GitHub OAuth as a login method (Authlib), Playwright browser-driven
tests, session hardening (cookie flags, CSRF, session lifetime), and a `.env`
secrets management pattern. The existing password login stays alongside OAuth.

This session's goal: revise CONTRACTS.md to specify the OAuth flow, session
hardening, and the Playwright test infrastructure before anyone starts coding.

---

## Transcript

**Charles:** Alright, Week 7. The big new thing is GitHub OAuth. I've already
set up a GitHub OAuth app in our org — I have the client ID and secret. The
assignment says we need to specify six things in the contract: the two new
routes, required GitHub fields, local user shape after first login, the
user-to-external-identity link, session state after callback, and logout
behavior. Let's work through them.

First question: where do we store the GitHub identity? Do we add columns
to the `users` table or create a new table?

**LLM:** A separate table is the better design. The assignment explicitly says
"one user, possibly multiple OAuth identities" — that's a one-to-many
relationship, which means a join table. If you put GitHub-specific columns on
`users`, you can't cleanly support a second provider later (Google, for
example) without adding more columns.

I'd suggest an `oauth_identities` table with a foreign key to `users.id`,
a `provider` column (e.g. `"github"`), and the provider's unique user ID.
The unique constraint goes on `(provider, provider_user_id)` — a given
GitHub account can only be linked to one local user.

**Charles:** That makes sense. Mario, you'd own this table since it's schema
work. What columns do we need?

*(Messaged Mario on Discord: "For the OAuth identity table, the LLM suggests:
id, user_id (FK to users), provider (varchar), provider_user_id (varchar),
provider_login (varchar, nullable), created_at. Unique on (provider,
provider_user_id). Thoughts?")*

*(Mario replied: "That's exactly what I was thinking. I'd also want to discuss
the users table — OAuth-only users won't have a password, so password_hash
needs to become nullable. And we should add email and display_name columns
since those come from the GitHub profile. I'll handle the schema update and
make sure the password login route rejects login attempts on null-password
accounts.")*

**Charles:** Mario confirms the table design and raises a good point —
`password_hash` needs to become nullable for OAuth-only users. He also wants
`email` and `display_name` on the `users` table. That's a meaningful schema
change.

**LLM:** That's the right call. A few things to nail down in the contract:

1. `password_hash` becoming nullable is a breaking change for the password login
   route. It needs to check for `NULL` before calling `check_password_hash` —
   otherwise you'd crash or silently let someone in.

2. For `email`, make it `UNIQUE` but nullable. OAuth users might not expose
   their email on GitHub, so you can't require it. But if it's present, it
   should be unique across users.

3. For `display_name`, it's purely informational — nullable, no constraint.
   Fall back to the GitHub `login` if `name` is null from the provider.

4. You need a username generation strategy for new OAuth users to avoid
   collisions with existing password-registered usernames.

**Charles:** Good points. For username generation, what's standard?

**LLM:** A common pattern is prefixing with the provider name:
`github_<github_login>`. This guarantees no collision with manually registered
usernames (unless someone registers as `github_octocat` via the password form,
which you could optionally block). The `display_name` field is what's shown
in the UI, so the auto-generated username is really just an internal identifier.

**Charles:** Let's go with that. Now the routes. Megan, you're implementing
the OAuth routes — let's spec them out.

*(Messaged Megan on Discord: "For OAuth routes, we need two: /login/github
(redirects to GitHub) and /auth/github/callback (handles the return). You'd
wire up Authlib and implement the create-or-link logic. The LLM is suggesting
we use Authlib's GitHub integration. Sound good?")*

*(Megan replied: "Yes, I've used Authlib before — it's straightforward. One
question: what's the create-or-link logic exactly? If someone logs in with
GitHub and we already have a local user with the same email, do we auto-link
or ask the user?")*

**Charles:** Megan asks about the create-or-link logic when a GitHub login
matches an existing local email.

**LLM:** There are three scenarios to handle:

1. **Returning user** — An `oauth_identities` row already exists for this
   GitHub ID → load the linked local user, call `login_user()`, done.

2. **Existing local user adding GitHub** — No `oauth_identities` row, but a
   local user exists with the same email → create the `oauth_identities` row
   linking this GitHub ID to that existing user, call `login_user()`, done.

3. **First-time OAuth user** — No `oauth_identities` row and no email match
   → create a new `User` with `password_hash=NULL`, create the
   `oauth_identities` row, call `login_user()`, done.

Auto-linking on email match is the simpler approach and appropriate for a class
project. In production you'd want to verify email ownership before linking
(send a confirmation email), but that's out of scope here.

*(Relayed the three scenarios to Megan.)*

*(Megan: "Clear. I'll implement all three branches and make sure missing fields
from GitHub don't crash anything — I'll use sensible defaults.")*

**Charles:** Good. Now session state. Mario, what should be in the session
after a successful OAuth callback?

*(Messaged Mario: "After /auth/github/callback succeeds, what's the session
state? The assignment wants us to specify what's in the session dict and what
cookies are set.")*

*(Mario replied: "Flask-Login handles this — after login_user(), the session
contains _user_id (as a string) and _fresh=True. We should NOT manually set
session['user_id'] anymore — that was the Week 5 legacy pattern. I'd also
like to specify the cookie flags in the contract: Secure, HttpOnly,
SameSite=Lax. And we need to talk about CSRF.")*

**Charles:** Mario wants to drop the legacy `session["user_id"]` pattern and
let Flask-Login manage session state exclusively. He also wants cookie flags
and CSRF in the contract. Let's cover those.

**LLM:** Good cleanup. For the contract, the session state section should say:

After `login_user()`, Flask-Login sets `session["_user_id"] = str(user.id)`
and `session["_fresh"] = True`. The application code should not manually set
`session["user_id"]` — that was the Week 5 pattern and it creates a confusing
dual-source-of-truth.

For cookie flags, the three Mario listed are the standard hardening set:
- `SESSION_COOKIE_SECURE = True` — cookie only sent over HTTPS
- `SESSION_COOKIE_HTTPONLY = True` — no JavaScript access to the cookie
- `SESSION_COOKIE_SAMESITE = "Lax"` — browser won't send the cookie on
  cross-origin POST requests

One caveat: `SESSION_COOKIE_SECURE = True` will break local development
over `http://localhost`. Your test fixtures and dev config will need to
set it to `False`.

**Charles:** We should note that in the contract. What about CSRF?

**LLM:** Flask-WTF's `CSRFProtect` is the standard approach. It protects all
forms by default — the template adds a `{{ csrf_token() }}` hidden field,
and Flask-WTF validates it on POST.

The question is whether to also protect your JSON API routes (`/api/*`).
The traditional CSRF attack uses a hidden HTML form to send a cross-origin
POST — but that attack can't send a `Content-Type: application/json` body.
Combined with `SameSite=Lax` on the session cookie, your API routes are
already protected against CSRF without needing a token header.

*(Messaged Mario: "The LLM suggests CSRF tokens on HTML forms (Flask-WTF
handles it), but exempt /api/* JSON routes since SameSite=Lax + JSON
content type already block the CSRF vector. Thoughts?")*

*(Mario: "Agree. In production you'd add X-CSRFToken headers as
defense-in-depth, but SameSite=Lax + JSON-only is correct and sufficient
for this scope. I'll document the rationale in the contract. Also — for
session lifetime, I'm thinking PERMANENT_SESSION_LIFETIME = 2 hours by
default, and REMEMBER_COOKIE_DURATION = 14 days for the 'remember me'
checkbox. Charles, you'll need to wire the remember-me toggle on the login
page.")*

**Charles:** Got it — I'll add the "remember me" checkbox. Now let's talk
about the test infrastructure. The assignment introduces Playwright and a
test-login backdoor.

**LLM:** The test-login backdoor is a route that only works when
`app.config["TESTING"]` is `True`. It creates or finds a user and calls
`login_user()` without going through GitHub. This lets your Playwright tests
log in without needing real GitHub credentials.

You'd set this up in `conftest.py`:
- Set `TESTING = True`
- Point `DATABASE_URL` at a SQLite file so tests don't touch your
  Postgres container
- Set `SESSION_COOKIE_SECURE = False` (the test server is HTTP)
- Start a live Flask server that Playwright can navigate to

**Charles:** I'll own the backdoor route and `conftest.py` since that's
coordinator infrastructure. Each person then writes one Playwright test:

- **Me (coordinator):** Smoke test — app starts, login page loads, GitHub
  button is present and clickable
- **Megan (server-side):** Happy-path login via backdoor, assert
  "Logged in as \<username\>" is visible
- **Mario (DB & security):** Protected page inaccessible without login,
  accessible after login, inaccessible again after logout

*(Messaged the team: "Playwright test assignments above. Each person writes
one test in tests/e2e/. Then for Part 3, we write a group suite with four
scenarios: first-time login, returning login, CSRF protection, and session
expiry. Sound good?")*

*(Megan: "Sounds good. Quick question — my test uses the backdoor, so it
doesn't test the actual GitHub redirect. Should I note that as a gap?")*

*(Mario: "Yes, that's the documented gap from the assignment. The backdoor
stands in for everything after the redirect. We verify the real redirect
manually once. Also — for Part 3's CSRF test, I'll make sure the CSRF
error handler returns a 400 with our standard error envelope.")*

**Charles:** Good. Let me also note the `.env` setup. I've already got `.env`
in `.gitignore`. I need to update `.env.example` with the OAuth variables:

```
OAUTH_CLIENT_ID=your-github-client-id
OAUTH_CLIENT_SECRET=your-github-client-secret
SECRET_KEY=generate-a-random-32-byte-hex-string
DATABASE_URL=postgresql://app:app@db:5432/app
```

And Megan will add `load_dotenv()` at the top of `app.py` before any
`os.environ` lookups. All secrets use `os.environ["KEY"]` with brackets,
not `.get()` — a missing secret should crash on startup.

**LLM:** One more thing for the contract: logout behavior. The assignment
specifically asks what you clear locally vs. what you don't clear at the
provider.

**Charles:** Right. Locally, `logout_user()` clears the Flask session and
removes the remember-me cookie. We do NOT revoke the GitHub token or redirect
to GitHub's logout. The user stays logged into GitHub — that's standard.

The existing `POST /logout` route works for both password and OAuth users
since `logout_user()` doesn't care how the user logged in.

**LLM:** Correct. I'd add one more known limitation to the contract: you
don't test the actual GitHub redirect in your Playwright tests. That's the
honest gap — the backdoor simulates a logged-in state, not the OAuth
handshake.

**Charles:** Already noted. Let me also add: we don't revoke GitHub tokens on
logout, Google OAuth isn't wired (but the schema supports it), and SQLite vs.
Postgres differences in tests are a known gap.

Alright, I think we have everything. Let me write up the contract revision.

---

## Summary of Cross-Role Decisions

| Decision | Who Raised It | Resolution |
|---|---|---|
| Separate `oauth_identities` table vs. columns on `users` | Charles + LLM | Separate table — supports multiple providers |
| `password_hash` becomes nullable | Mario | Yes — OAuth-only users have no password; login route must handle this |
| `email` and `display_name` added to `users` | Mario | `email` is UNIQUE+nullable, `display_name` is nullable |
| Username generation for OAuth users | LLM | `github_<github_login>` to avoid collisions |
| Create-or-link: auto-link on email match? | Megan | Yes — appropriate for class scope; production would verify email first |
| Drop legacy `session["user_id"]` pattern | Mario | Yes — Flask-Login manages `_user_id` exclusively |
| CSRF on JSON API routes | Mario + LLM | Exempt `/api/*` — `SameSite=Lax` + JSON content type is sufficient |
| `SESSION_COOKIE_SECURE` in dev/test | Mario + LLM | Set to `False` in test fixtures and dev config |
| Session lifetime defaults | Mario | 2 hours without remember-me, 14 days with |
| Playwright test-login backdoor | Assignment spec | Charles owns the route and `conftest.py`; documented gap |

---

*End of session. Charles drafted the OAuth contract addendum from this
session's decisions and will commit it with the updated CONTRACTS.md,
coord_session.md, and `.env.example` in the contracts revision PR.*
