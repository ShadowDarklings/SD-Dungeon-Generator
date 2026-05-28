# Course 506 — Week 7 Assignment

Cloud Web Application Engineering with AI • Prof Hung Total: 10 marks • Submission: end of Week 7 (see Canvas for exact deadline/time)

## What this week is about

Week 6 ended on the truthy-fixtures lesson: tests against mocks verify mocks, not reality, and end-to-end tests against real services are the only thing that breaks out of the synthetic stack.

Week 7 makes that lesson operational. You will:

    Integrate a service you didn't build — GitHub OAuth — replacing or augmenting the password login from Week 6.
    Verify it with a tool that drives a real browser — Playwright — because BeautifulSoup tests cannot click a "Login with GitHub" button and follow a redirect.
    Harden the session with cookie flags, CSRF protection, and a sensible session lifetime.

The pedagogical thread: OAuth is the canonical case where you cannot honestly mock the service you depend on. The provider's behavior is not in your repo. Unit tests that pretend to know what GitHub returns are exactly the truthy-fixture hazard Week 6 warned about. Playwright against a representative flow is how you escape it.

## Stack additions

Tool 	Purpose 	Where it sits
Authlib 	OAuth client for Flask 	server-side, adds two routes
Playwright (Python bindings) 	Browser-driven E2E tests 	new tests/e2e/ directory
Flask-WTF 	CSRF token integration 	wraps forms, integrates with Flask-Login
python-dotenv 	Loads OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, SECRET_KEY from a gitignored .env file 	imported once at the top of app.py
GitHub OAuth app 	the provider 	created in your team's GitHub org for the demo

GitHub is the default provider for this assignment. Google works (Authlib supports it identically); the study guide covers the differences. Pick GitHub unless your team has a specific reason.

## Part 1 — Group: Contracts revision for OAuth (2 marks)

The coordinator runs a planning session with the team's LLM-of-choice to revise CONTRACTS.md so it specifies the OAuth flow. Good contracts include the tests that enforce them — how you and the LLM decide to capture those tests in the contract is up to you. This contract is harder than the ones you've written so far, because part of it lives on a server you don't control.

Deliverable: an updated CONTRACTS.md in your repo, plus a short coord_session.md capturing the planning session (raw transcript or honest summary).

The revised contract must specify:

    The two new routes (/login/github, /auth/github/callback) and their inputs/outputs
    What user-info fields you require from the provider and what you do if a field is missing
    The shape of the local user record after a first-time OAuth login
    The link between a local user and an external identity (one user, possibly multiple OAuth identities)
    The session state immediately after a successful callback (what's in the session dict, what cookies are set)
    Logout: what you clear locally, what you do not clear at the provider

What you cannot specify in your contract: GitHub's actual behavior. You can specify what your code does with the response, not what the response will be. Note this honestly in the contract — external_dependency: github.com — see study guide for representative payload shape.

Marking (2 marks total):

    1 mark: contract covers the six items above with concrete types/shapes, not vague prose
    1 mark: coord_session.md shows real engagement with the cross-role implications, not just a divided to-do list

## Part 2 — Individual: Role work + one Playwright test (5 marks)

Each team member implements their role's slice of the OAuth + Playwright + hardening work, then writes one Playwright test that exercises their slice end-to-end through a real browser.

Reuse your Week 6 walkthrough where it fits. You designed a test path last week — it doesn't get thrown away. Take your Week 6 walkthrough, insert the OAuth login step at the top (via the test-login backdoor), and the rest of the walkthrough should already exercise the part of the app your role touches. Hand the updated walkthrough to your LLM with the Playwright prompt template and you've got your Part 2 test. If your Week 6 walkthrough doesn't naturally cover your Week 7 slice (you didn't touch the cafe search this week, etc.), then write a small new walkthrough — the per-role test examples below are the minimum each role's test must verify.

Submit a per-person role_work.md listing files you touched and one paragraph explaining what your Playwright test verifies (and which Week 6 walkthrough you adapted, if applicable). The test itself lives in tests/e2e/.

### Per-role focus

Server-side

    Wire up Authlib with the GitHub provider
    Implement /login/github (initiates the flow) and /auth/github/callback (handles the return)
    Handle the create-or-link logic: new user vs returning user vs existing local user adding GitHub
    Map missing/null provider fields to sensible defaults; never crash on a partial payload
    Your Playwright test: full happy-path login, ending on a page that asserts Logged in as <username> is visible

Client-side

    "Sign in with GitHub" button on the login page; keep the password form alongside (don't delete it yet — Week 8 may revisit)
    Post-login UX: where does the user land? Make this deliberate, not accidental
    "Remember me" toggle wired to the session lifetime config
    Logout button that actually clears state and lands on a sensible page
    Your Playwright test: a logged-out user clicking "Sign in with GitHub", completing login via the test-login backdoor, and seeing their username in the navbar

DB-and-security

    Add an oauth_identity table (or columns) linking external provider IDs to local users
    Migration script if your project uses migrations; otherwise schema update committed cleanly
    Set cookie flags: SESSION_COOKIE_SECURE, SESSION_COOKIE_HTTPONLY, SESSION_COOKIE_SAMESITE='Lax'
    Configure PERMANENT_SESSION_LIFETIME and the "remember me" cookie via Flask-Login
    Wire Flask-WTF CSRF protection to every state-changing form
    Your Playwright test: a protected page is inaccessible without login, accessible after login, and inaccessible again after logout — verified through the rendered DOM

Coordinator

    Drive Part 1's contracts session and produce coord_session.md
    Maintain the integration log: when a teammate's change breaks a contract, note it, surface it to the team, and track the resolution
    Set up the test-login backdoor (see §"The test-login backdoor — code and how to use it" below)
    Set up GitHub OAuth app credentials and document where they live (.env.example, never committed .env)
    Your Playwright test: a smoke test that asserts the app starts, the login page loads, and the GitHub button is present and clickable — the cheapest possible canary

### What "one Playwright test" means

One test function, scoped to one user-visible behavior. It must:

    Use a real browser context (Playwright launches Chromium by default)
    Drive the UI as a user would (click, type, navigate) — not call your Flask routes directly
    Assert against the rendered DOM (expect(page.locator(...)).to_be_visible()), not against your code's internal state
    Run from pytest like the rest of your tests

A template, the backdoor route, and the config wiring are in §"The test-login backdoor — code and how to use it" below.

Marking (5 marks total):

    1 mark: role work is committed, runs, and matches the (possibly-revised) contract
    1 mark: the Playwright test runs and passes against your local stack
    1 mark: the test exercises a real user-visible behavior — clicking real elements, asserting on real rendered output, not bypassing the browser
    1 mark: the test would actually catch a regression in your slice — not a tautological assertion (assert True after a navigation)
    1 mark: role_work.md honestly describes what you did, what the test covers, and any known gaps

## Part 3 — Group: Full-system Playwright suite + team walkthrough (3 marks)

After individual tests land, the team produces (a) a small Playwright suite exercising the full login lifecycle as one user would experience it, and (b) a walkthrough document explaining what the suite verifies. This is the Week 7 analog of Week 6's whole-system narrated walk — now scripted and documented.

The reason this lives in the team part: Playwright is the portable skill from this week. OAuth you'll look up when you need it. Playwright tests you'll write in every web codebase you touch from here on. The walkthrough is how the team demonstrates collective understanding of what its e2e coverage actually buys it.

Deliverables: tests/e2e/test_full_lifecycle.py plus team_walkthrough.md at the repo root.

The suite must include at minimum:

    First-time OAuth login: a user with no existing local account logs in via GitHub (through the test-login backdoor), arrives at the post-login page, and has a row in the oauth_identity table
    Returning OAuth login: the same user, logged out, logs in again; the existing row is reused, not duplicated
    CSRF protection works: a POST to a state-changing endpoint without a token is rejected (use Playwright's request context to send a tokenless POST and assert the response)
    Session expires: with a short test-only PERMANENT_SESSION_LIFETIME, after the lifetime passes (use Playwright's time controls or just sleep in a fast test), the protected page is no longer accessible

team_walkthrough.md is the centerpiece. It must:

    Have one section per test, naming what user-visible behavior is exercised and what specific regression the test would catch ("if someone broke the create-or-link branch by always inserting a new row, this test would fail because the second login would find a duplicate oauth_identity")
    Have a gaps section: what the suite does not cover, with one-line rationale. "We don't drive the actual GitHub redirect — the test-login backdoor stands in for everything after authorize_redirect" is the right kind of disclosure.
    Read as a coherent walk-through, not a per-test bullet list. A new teammate should be able to understand the team's e2e coverage in ten minutes.

Marking (3 marks total):

    1 mark: all four scenarios present, named clearly, pass when run from pytest tests/e2e/test_full_lifecycle.py
    1 mark: team_walkthrough.md walks through each test concretely — the regression it catches and the user-visible behavior it verifies are both named in specifics, not generalities
    1 mark: the walkthrough's gaps section is honest. "We don't test X because Y" is what I'm looking for. "We test everything" is not.

## Secrets management with .env

OAuth gives you two strings that must never reach GitHub: your OAUTH_CLIENT_ID (semi-secret) and your OAUTH_CLIENT_SECRET (very secret — anyone who has it can act as your OAuth app). The Flask SECRET_KEY that signs session cookies is in the same category. None of these belong in the repo.

This setup is standard boilerplate — the design judgment is in the requirements, not the code. Your team's LLM will produce a correct implementation if you give it the requirements cleanly. This is one of the more honest "humans design, AI implements" moments in the assignment: you're specifying the contract, not typing the eight lines of glue.

### What your setup must include

    A .env file in the repo root holding OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, SECRET_KEY, and DATABASE_URL
    .env listed in .gitignore, never committed
    app.py loads .env via python-dotenv before any os.environ lookups
    All secret reads use os.environ["KEY"] (raises on missing) rather than os.environ.get("KEY") — a missing secret should crash the app on startup, not surface as a confusing runtime error two minutes later
    A .env.example checked into the repo documenting the variable names with placeholder values (this is what I clone before grading — if it's missing or incomplete, I can't run your app, and that counts against you)
    python-dotenv added to requirements.txt

### How to get there

Two options. The first is recommended because it lets the LLM adapt the implementation to whatever conventions your team is already using.

Option A — Prompt your LLM (recommended). Adapt the requirements above into a prompt. If your team uses a config.py class pattern, dependency injection, or an init_app factory function, say so in the prompt — the boilerplate should follow your code's conventions, not the assignment's. You can also paste the reference implementation from Option B below into your prompt as a known-good baseline for the LLM to modify ("use this as a starting point, but adapt it to our existing config pattern").

A minimal version of the prompt:

    "In app.py, add startup loading of a .env file via python-dotenv. Load SECRET_KEY, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, and DATABASE_URL. Use os.environ[...] (square brackets, not .get) so missing vars raise on startup. Also: add python-dotenv to requirements.txt, add .env to .gitignore, and produce a .env.example documenting the variable names with placeholder values."

Review the LLM's output against the requirements list. Common things to check: load_dotenv() is called before any os.environ lookup, the example file is named .env.example (not env.example or .example.env), and python-dotenv made it into requirements.txt (not just locally installed).

Option B — Copy the reference implementation directly. It satisfies the requirements as written. Use this if your team doesn't have its own conventions to adapt, or as the baseline for Option A.

### Reference implementation

```python
# .env — gitignored, never committed
OAUTH_CLIENT_ID=Ov23li...
OAUTH_CLIENT_SECRET=ghp_...
SECRET_KEY=<32 bytes of randomness, e.g. python -c 'import secrets; print(secrets.token_hex(32))'>
DATABASE_URL=postgresql://app:app@db:5432/app

# .gitignore
.env

# top of app.py
from dotenv import load_dotenv
load_dotenv()  # MUST come before any os.environ lookups

import os
app.config["SECRET_KEY"] = os.environ["SECRET_KEY"]
OAUTH_CLIENT_ID = os.environ["OAUTH_CLIENT_ID"]
OAUTH_CLIENT_SECRET = os.environ["OAUTH_CLIENT_SECRET"]

# .env.example — committed; documents required variables, no real values
OAUTH_CLIENT_ID=your-github-client-id
OAUTH_CLIENT_SECRET=your-github-client-secret
SECRET_KEY=generate-a-random-32-byte-hex-string
DATABASE_URL=postgresql://app:app@db:5432/app
```

### What this does not protect against

Anyone with shell access to your machine, your CI system, or your production server can read .env. Secrets management at scale uses secret stores (AWS Secrets Manager, HashiCorp Vault, GitHub Actions secrets, etc.). .env is appropriate for development and small deployments. Week 8 talks about handing secrets to a deployed container.

## The test-login backdoor — code and how to use it

OAuth is verified through the actual GitHub redirect manually. Everything after the redirect is verified through the test-login backdoor: a route enabled only when app.config["TESTING"] is true, which logs in a named user and redirects. Production never sets TESTING, so this route is never available outside tests.

This is a mock — and that's fine. Mocking external services is standard practice in any production test suite. The discipline isn't don't mock; it's be explicit about what you've mocked. The "What this does not test" section at the bottom is where we do that naming.

### Step 1 — add the backdoor route to app.py

```python
@app.route("/test/login/<username>")
def test_login(username):
    if not app.config.get("TESTING"):
        abort(404)
    user = db.exec(select(User).where(User.email == f"{username}@test")).first()
    if user is None:
        user = User(email=f"{username}@test", display_name=username)
        db.add(user); db.commit(); db.refresh(user)
    login_user(user)
    return redirect("/dashboard")
```

The 404-when-not-testing guard is the whole safety story. If your production config doesn't set TESTING, the route is unreachable in production.

### Step 2 — enable TESTING in your test fixture

In tests/e2e/conftest.py, set app.config["TESTING"] = True before yielding the live server (your coordinator handles this). Without this, the backdoor returns 404 and your tests fail at the first navigation.

### Step 3 — call the backdoor from your Playwright test

Just navigate to the URL. No UI link is needed — page.goto is enough.

```python
import pytest
from playwright.sync_api import Page, expect

def test_logged_out_user_sees_login_button(page: Page, live_server):
    page.goto(f"{live_server.url}/")
    expect(page.get_by_role("link", name="Sign in with GitHub")).to_be_visible()

def test_dashboard_requires_login(page: Page, live_server):
    # logged out: protected page redirects to /login
    page.goto(f"{live_server.url}/dashboard")
    expect(page).to_have_url(f"{live_server.url}/login")

    # log in via the backdoor — bypasses GitHub entirely
    page.goto(f"{live_server.url}/test/login/alice")

    # logged in: dashboard reachable, username visible
    page.goto(f"{live_server.url}/dashboard")
    expect(page.get_by_text("Logged in as alice")).to_be_visible()

    # log out: back to the redirect behavior
    page.get_by_role("link", name="Log out").click()
    page.goto(f"{live_server.url}/dashboard")
    expect(page).to_have_url(f"{live_server.url}/login")
```

### What this approach does not test

The actual GitHub redirect — the part where your /login/github route hands off to github.com and the user authorizes there — is not exercised by these tests. That's the documented gap. Verify it manually once when you wire it up; document it in team_walkthrough.md as "we don't test the GitHub redirect itself, because the test-login backdoor stands in for everything after the redirect lands back at our callback."

The study guide covers the alternatives (real-provider tests, fake-OAuth-server tests) and why we don't recommend either for this assignment.

## A note on the test database

Your team's running app uses Postgres — both in docker compose up for development and in production. Your Playwright test fixture uses SQLite, on purpose. The conftest.py sets DATABASE_URL to a /tmp/...sqlite file before importing the app, so the test process gets a hermetic SQLite database while the running container's Postgres is left alone.

This is deliberate. Three reasons:

    Hermetic: each test run drops and recreates its tables, so there's no leftover state from earlier runs. No flaky tests because a previous run inserted a row that the current test wasn't expecting.
    No container dependency: the test process spins up its own DB without needing a Postgres container running alongside. Tests are fast and self-contained — pytest works from a clean checkout with no docker setup.
    SQLModel abstracts the SQL: the ORM emits effectively the same SQL for both backends for the operations this app uses, so most behavior is identical on both.

This is the same "honest mock with a named gap" pattern as the test-login backdoor — we're not pretending SQLite is Postgres, we're using a different DB on purpose, with a known limitation. The limitation: SQLite and Postgres differ in some behaviors (JSON column operations, certain constraint semantics, transaction isolation levels). For features that depend on Postgres-specific behavior, you'd want at least one integration test running against real Postgres — testcontainers is the standard Python tool for that. Not in scope this week, but it's the right pattern when you have a Postgres-specific feature you need to verify.

Practical consequence for development: data written by your running app (the Postgres container) and data written by your test runs (SQLite in /tmp) don't see each other. If you manually walk a flow in docker compose up and see weird state in /cafes, that's leftover Postgres data, not test data. Wipe with docker compose down -v to start fresh.

## Submission

    Repo: your team's existing project repo on the demo GitHub org
    Tag the final commit week7-final
    The instructor (I) grade from the tagged commit, not from a live demo
    Per-person role_work.md and the group coord_session.md / team_walkthrough.md live at the repo root
    If something doesn't work, say so in the relevant .md file. Honest known-gaps cost less than masked failures discovered during grading.

## Calibration

The same TDD-in-AI-era framing from Week 6 applies, sharpened for this week:

    Humans design what to test. AI implements the tests fine. The judgment work this week is: which user-visible behaviors deserve a Playwright test? Which can stay BeautifulSoup? Which need both? That decision is yours. Writing the test code, given the decision, is the easy part.

Mocks and workarounds are normal good engineering. Every production test suite has them — payment gateways, email services, SSO providers, third-party APIs. You will use them every day in your career. The test-login backdoor in this assignment is a mock. The discipline isn't don't mock; it's be explicit about what your mock stands in for and what gap that creates. The backdoor's gap — the real GitHub redirect — is named in team_walkthrough.md. That naming is what separates an honest mock from a truthy fixture.

A truthy fixture is the silent version: you mock GitHub's response shape, assert your code handles that mock, and quietly forget you guessed at what GitHub actually returns. A passing test means "my code handles the mock I wrote," which says nothing about whether it handles the real provider. If your AI suggests a test that mocks GitHub's JSON payload and asserts behavior against it, push back. Use the backdoor for everything beneath the OAuth redirect; verify the redirect itself manually (or, Week 9+, in CI against a test GitHub app).
