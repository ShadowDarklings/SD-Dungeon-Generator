# Week 6 Assignment — Contracts and the External World

Due: Friday end-of-week, before the Week 6 session. Weight: 10 marks total — 5 individual + 5 group.

In Week 5 you each built the same skeleton. This week, your team builds something specific to your project — agreed in advance via a contracts document, enforced by tests, and integrated as a team.

    Where to look things up: This assignment runs on the Week 6 lecture (slide numbers referenced inline) and the Week 6 study guide (linked from the module page). The worked example — the Brew Crew / StudySpot example walked through in lecture — is in the course materials and is the model for what your team produces. You're doing what Brew Crew did, for your project.

## The shape of this week

The work breaks into three phases. The order matters; the days of the week are up to your team.

Agree first. The coordinator runs an LLM session and produces CONTRACTS.md and four failing test files. All tests fail by design. The team reviews and merges this in a single PR before any role-implementation work starts.

Build second. Each role implements their slice. Tests gradually go green. CI runs on every PR. Cross-role coordination happens through the contract, not through ad-hoc messaging.

Integrate together. All tests pass. The team designs and runs an end-to-end walk for the whole system, against real services, and documents what was found.

This is a real software discipline. Agree first, build second. The contract is the team's word; the tests verify the word was kept. If your team skips the agreement step, integration will fall apart.

## Setup (do this before any role work starts)

### Step 1 — Confirm your team's project repo exists

If your team doesn't already have a shared project repo from Week 4's team assignment, your coordinator creates one now:

    From lhhunghimself/week_5_506_starter on GitHub, click Use this template → Create a new repository
    Name it after your project (e.g., studyspot, book-tracker, whatever your About page named)
    Owner: your team's GitHub org or the coordinator's account
    Add all teammates as collaborators with write access
    The default branch is main

This repo lives for the rest of the course. It's the team's project, not just Week 6's.

### Step 2 — Each member clones the team repo to their own EC2

```bash
git clone https://github.com/<team-org>/<project-name>.git
cd <project-name>
docker compose up -d
```

The skeleton from Week 5 is already there — the home page, /site/, the auth flow, all of it. You should be able to log in and click around just like Week 5.

### Step 3 — Re-enable the CI workflow

The skeleton ships with .github/workflows/test.yml set to manual-trigger only. Week 6 turns it back on.

In your team's project repo, edit .github/workflows/test.yml. Find this section near the top:

```yaml
"on":
  workflow_dispatch:    # manual trigger only — Week 5
  # Week 6 will switch to:
  # pull_request:
  #   branches: [main, master]
  # push:
  #   branches: [main, master]
```

Replace it with:

```yaml
"on":
  pull_request:
    branches: [main, master]
  push:
    branches: [main, master]
```

Listing both branch names means the workflow fires whether your repo defaults to main (GitHub's default since 2020) or master (older convention). Use whichever your team's repo actually has — you don't need to rename anything.

Commit this change directly to your default branch as part of your Week 6 setup.

### Step 4 — Configure branch protection on your default branch

Once CI is running, lock the merge button behind passing CI. In GitHub:

    Repo Settings → Branches → Add branch protection rule
    Branch name pattern: your default branch (main or master — check Settings → General to confirm)
    Check "Require status checks to pass before merging"
    Search for the test check (the job name from the workflow file) and require it
    Optionally check "Require a pull request before merging" (recommended)
    Save

Now any PR to your default branch shows the CI status; if CI is red, the merge button is disabled. The lecture's slide on CI gating covers what this means in detail.

## Part 1 — Group: The Coordinator-LLM Session (3 marks)

Before any role-implementation work begins, your team's coordinator runs an LLM session and commits these artifacts to the team repo:

    CONTRACTS.md in the repo root — your team's agreed spec
    coord_session.md in the repo root — your transcript of the LLM session, lightly cleaned up
    Four test files in tests/ — one per role, all initially failing

The coordinator does this work in a single PR titled "Week 6 contracts" and merges it before role-implementation work starts. Teammates can review the PR, but the coordinator is the author.

    Note: The Brew Crew worked-example repo includes CONTRACTS.md but does not include a coord_session.md. We don't ship a fictional example transcript — simulated AI dialogue would undermine trust. Your transcript is the real artifact; produce one and commit it. I read it as part of grading.

### What CONTRACTS.md must include

Modeled on the Brew Crew example. Required sections:

Section 	What goes there
Schema 	Tables, columns, types, constraints, foreign keys. Include any new tables this week and any changes to skeleton tables.
Endpoint contracts 	For each new route: HTTP method, path, auth requirement, request shape, response shape, error cases (status codes + envelope).
External API contract 	Your project's data source. Endpoint URL, auth (key or none), rate limits, response shape, what your code does when it fails (timeout, rate-limit, malformed).
Authorization rules 	Who can read what, who can write what, and what response code a non-authorized user gets. Include the OWASP-style 404-for-not-yours rule if your project has ownership-restricted resources.
Role boundaries 	What files each role owns and what they don't touch.
Known limitations (deliberate) 	Things you're explicitly punting to a later week, with reasons. Required, even if the list is short.

Format: prose with markdown tables. Length: probably 100–300 lines. Less than 100 is too sparse; more than 300 means you're over-specifying.

### What the four test files must do

Modeled on Brew Crew's four test files. The coordinator commits all four, all initially failing.

    tests/test_<role1>_<purpose>.py for server-side — assertions on endpoint request/response shapes; mock external API with responses library
    tests/test_<role2>_<purpose>.py for db-and-security — assertions on schema (tables, columns, FKs, constraints) and auth behavior (login required, ownership rules)
    tests/test_<role3>_<purpose>.py for client-side — Flask test client + BeautifulSoup, assertions on form structure and selectors (NOT text content — let the client-side person change copy freely)
    tests/test_integration.py for the coordinator — end-to-end flow that exercises every other role's work; passes only when all three teammates have shipped

Each test file's docstring identifies its owner by name and role.

### What the coord_session.md transcript must show

Edit your transcript for clarity (remove typos, off-topic asides) but keep the structure: questions asked, decisions made, places where you pushed back on the LLM, places where you pinged teammates for input. I read this to verify the coordinator wasn't doing all the work themselves.

If your transcript shows the coordinator dictating decisions and the LLM rubber-stamping, you didn't do the assignment. The session is supposed to surface things you didn't know.

### Group rubric (3 marks)

Criterion 	Marks
All required CONTRACTS.md sections present and concrete 	1
Four test files committed, all initially failing as expected 	1
coord_session.md shows real engagement — questions, pushback, teammate consultation 	1

## Part 2 — Individual: Implement Your Slice + E2E Walk (5 marks)

By the team's submission deadline, your role's tests pass and you've designed and run an end-to-end walk for your slice.

The exact scope depends on which role you signed up for in your team's About page. Below are the four role lanes — find yours.

### What's an "e2e walk for your slice"?

The lecture's live demo showed why: unit tests pass while user-visible behavior breaks, because synthetic test fixtures don't exercise what real systems actually do. That failure mode is called truthy fixtures — the mock looks right but isn't verified against reality.

Your individual e2e walk is the discipline that catches this for your slice. Each role's walk is different because each role exercises different surfaces. Per-role guidance below.

The deliverable for each role: a section in your repo's e2e.md (or a per-role file under e2e/<role>.md) that has:

    Definition — what does end-to-end mean for your slice? (1-2 sentences)
    Walk — numbered steps that exercise your slice against real conditions. Each step says exactly what to do and what should happen.
    Pass criteria — for each step, what specifically counts as "this worked." Distinguish "appeared to work" from "actually worked correctly."
    Execution log — what happened when you ran it. Pass/fail per step. Honest findings score higher than clean runs. If you discover a contract gap or a real bug, document it, fix it, link the fix commit. That's worth more than "all 8 steps passed."

Format: markdown, 30-80 lines per role. Less than 30 is too sparse; more than 80 means you're writing prose, not a checklist.

### Server-side role

Implement the routes in CONTRACTS.md.

    New routes go in app.py (or a routes.py if your team prefers — but get the coordinator's sign-off if so)
    At least one route uses the requests library to call your external API
    Handle the failure modes named in the contract (timeout, rate-limit, malformed)
    Pass tests/test_<your_test_file>.py

Your e2e walk: hit your routes against the deployed app, with all external services live. Use curl or a Python script with requests, not pytest. Each route gets exercised with at least one realistic input and one error case. For external-API integrations (geocoder, books API, etc.), your walk must hit the real service — that's the whole point.

Example walk steps for a typical project:

    "POST /register with realistic data → expect 302 redirect, user row in DB"
    "GET /<your-search-route>?q=<realistic-query> → expect 200, JSON has results, results match expected shape"
    "GET /<your-search-route>?q=<weird-query-the-API-might-trip-on> → document what comes back; is it what the contract expects?"
    "GET /<your-detail-route>/<id> with non-existent id → expect 404"

The third bullet is where truthy fixtures get caught. Pick a query you wouldn't have thought to mock for, and see what real API does.

### Client-side role

Build the templates that consume the routes.

    New templates in templates/
    Bootstrap-styled (use the same classes from Week 5)
    Updates to templates/base.html if your project's navigation needs new entries
    Forms that POST to the routes match what the server-side role implemented (cross-check with them)
    Pass tests/test_<your_test_file>.py

Your e2e walk: open your templates in a real browser against the deployed app. Click through every form, every link, every state. Verify the rendered behavior matches what the contract describes. Pytest with BeautifulSoup verifies HTML structure; the browser verifies that humans can actually use it.

Example walk steps:

    "Open /<your-list-page> in browser, anonymously. Verify navbar, search form, empty-state message all render."
    "Submit the search form with realistic input. Verify results appear. Click into a result."
    "Log in. Return to the list page. Verify navbar changes (logged-in state)."
    "Open a detail page and submit the relevant form. Verify success flash. Verify the page reflects the change."
    "Try the form with invalid input. Verify error flash, form re-renders with values preserved."

Browser testing surfaces things pytest never will: visual layout breaking, JavaScript errors in the console, forms that submit to wrong URLs, flash messages that get swallowed by template logic.

### DB-and-security role

Land the schema and refactor auth.

    New SQLModel models matching CONTRACTS.md schema section
    Refactor auth from raw session["user_id"] to Flask-Login (login_user, logout_user, current_user, @login_required)
    Set up LoginManager and the user-loader callback in app.py
    Verify ownership rules in your tests (e.g., 404 when non-owner attempts edit)
    Pass tests/test_<your_test_file>.py

The Flask-Login refactor is real work — it's not just "add the import." Lecture slides on Flask-Login walk the actual diff.

Your e2e walk: verify the schema and auth behavior in the deployed Postgres, not just in pytest's fixtures. Pytest uses ephemeral state; production has real constraints firing under real load.

Example walk steps:

    "Exec into Postgres: docker compose exec db psql -U app -d app. Run \\d <your-tables>. Verify schema matches CONTRACTS.md exactly: column types, NOT NULL constraints, foreign keys, UNIQUE constraints."
    "Try to insert a duplicate via SQL: INSERT INTO ratings (user_id, cafe_id, ...) VALUES (1, 1, ...) twice. Verify the UNIQUE constraint actually rejects the second one. Don't trust SQLModel's ORM-level enforcement; verify the database does it."
    "Verify ON DELETE CASCADE: delete a user, verify their ratings disappear too. (Don't actually do this in production data — use test rows.)"
    "Browser walk of auth flow: register, log in, log out, log back in, verify Flask-Login's _user_id is in the session cookie (use browser dev tools)."
    "Direct ownership probe: log in as user A, attempt to edit user B's rating via direct URL. Verify 404 (not 403)."

The second bullet is where many bugs hide. ORMs sometimes fudge constraints in ways the database doesn't.

### Coordinator role

You commit CONTRACTS.md and the four test files first, before role-implementation work begins. Once that's merged, your job is:

    Make tests/test_integration.py pass (it goes green only when all three teammates' tests pass)
    Help unblock teammates: if a teammate hits a question about whether a route's response shape is right, you're the keeper of "what we agreed."
    If the contract genuinely needs to change mid-week, run a small follow-up LLM session and commit the updated CONTRACTS.md + updated tests in a PR titled "Contract revision: <reason>".

If you finish early, pick up whichever role is most behind and pair with them.

Your e2e walk: the whole-system walk that gets folded into the team's e2e.md (Part 3 deliverable). You're the one running CONTRACTS.md section 7 end-to-end against the deployed app, with all external services live, before the team submits. Your walk is what catches truthy fixtures across role boundaries — bugs that no individual role's slice can surface alone.

Your e2e.md contribution is the team's combined walk, not just your slice's. See Part 3 for the structure.

### Each role's individual rubric (5 marks)

Criterion 	Marks
Code committed and merged via PR (CI green at merge time) 	1
Implementation matches CONTRACTS.md specification 	2
Your role's test file is all-green at end of week 	1
E2E walk for your slice — designed, run, documented honestly in e2e.md 	1

    A note on CI debugging. If your workflow fails and you want to debug without making fake commits, you can re-run a workflow from the Actions tab — manually, with optional debug logging. Manual re-runs don't appear in your git history; they're a debugging tool, not a deliverable mechanism. The study guide's CI/CD section walks the procedure (manual trigger, debug logging, the gh CLI). Use it freely — debugging CI by re-running rather than by spamming commits is the better engineering habit.

The 1 mark for the e2e walk is small but load-bearing. Honest findings score higher than clean runs. If your walk surfaces a contract gap and you fix it (revising CONTRACTS.md + tests + code), document it in your execution log and link the fix commit — that's full marks. If your walk reports "all 8 steps passed, no issues" — that's worth investigating before you submit. Real e2e walks against real services almost always surface something. Clean walks usually mean either you didn't actually hit the real service or you're not looking carefully.

## Part 3 — Group: Whole-system E2E (2 marks)

By the team's submission deadline, your team commits an e2e.md to the repo root (or e2e/whole_system.md if you prefer subdirectories). This is the team's end-to-end test definition for the whole project.

Why we're not having me walk through your demo live: because watching me walk through it makes the e2e an evaluation exercise, not an engineering exercise. I want you to learn the discipline of defining what to test and running it yourself. The e2e doc is graded; I read it instead of replicating it.

### What e2e.md must include

    Definition — one paragraph. What does end-to-end mean for this project? Name the boundaries: browser → Flask → Postgres → which external services. (5-8 sentences)
    The walk — numbered list of steps that exercises the system end-to-end. Has to cover your main user flows. Has to hit each external integration at least once with realistic data. Each step says exactly what to do and what should happen.
    Pass criteria — for each step, what counts as "this worked." Specific. "User sees results" is not enough; "user sees results that are actually relevant to the query (not unrelated entities), with names, addresses, and other expected fields populated" is.
    Execution log — what happened when the team ran it. Pass/fail per step. What did you find? A team that walks their e2e and discovers one or two real issues, fixes them, and documents the fix — that's the assignment done well. A team that reports "all green, no findings" is suspicious by default. I will spot-check by running one step from your walk and comparing what I see to what your log claims.
    Per-role contributions — short note showing which role contributed which steps. (The team's e2e is composed of overlapping individual walks; this section just says who owned what.)

A complete worked example of e2e.md lives in the demo repo at https://github.com/lhhunghimself/study_spot_demo/blob/master/e2e.md — read it to see what a thorough one looks like, including a real finding documented end-to-end. Don't copy it; your project's flows and external services are different.

The template below gives you the skeleton to fill in for your own project. Copy it into a new e2e.md at the root of your team's repo and replace the bracketed placeholders.

```md
# [Project name] — End-to-End Walk

**Team:** [team name]
**Coordinator:** [name]

## 1. Definition

[One or two paragraphs. What does end-to-end mean for *your* project? Name
the boundaries: browser ↔ Flask ↔ Postgres ↔ [external service, if any].
If your project has no external API, the walk is the full UI flow plus
session lifecycle. Either is fine — be specific about what your system
spans and what your walk has to exercise.]

## 2. The walk

[Numbered steps. 6 to 15 is typical, depending on project complexity.
Cover your main user flows. **Hit each external integration at least once
with realistic input** — that's where truthy fixtures hide. Each step says
exactly what to do and what should happen.]

### Setup

**Step 1.** [e.g., "Fresh state: `docker compose down -v && docker compose up -d`. Wait. Verify pytest passes." — first step is usually environment.]

### [Group of related steps — e.g., "Anonymous user flow"]

**Step 2.** [...]

**Step 3.** [...]

### [Next group — e.g., "Search via [your external API]"]

**Step N.** [The step that hits your external service with a realistic input.
This is your truthy-fixtures-catching moment.]

### [More groups as needed — authenticated flows, edit/delete, error paths, etc.]

## 3. Pass criteria

[One bullet per step from section 2. Be specific. "User sees results"
is too vague; "User sees results that are *actually relevant to the
query* (not unrelated entities), with names, addresses, and other
contract-specified fields populated" is the right level.]

- **Step 1**: [criterion]
- **Step 2**: [criterion]
- ...

## 4. Execution log

[Document what you observed when you ran it, not what you hoped.
Pass/fail per step. If you found and fixed something, document the
fix with commit hashes. If everything genuinely passed, say so with
evidence — and be a little suspicious of yourself, because clean
e2e walks against real services are rare.]

| Step | Result | Notes |
|------|--------|-------|
| 1    | PASS   | [what you observed] |
| 2    | [PASS/FAIL] | [what you observed; if fail, what you did about it] |
| ...  |        |       |

[Below the table, write up any findings. The worked example shows the
shape; here's the skeleton:]

### Finding [N] — [short title]

**Symptom**: [What was broken in user-visible terms.]

**Root cause**: [Where in the contract → test → code chain the gap
lives. Was it a missing field in the contract? A test fixture that
didn't exercise the real condition? A code-level bug?]

**Fix**: [What changed, with commit hashes. Ideally three commits if
the fix touched contract + tests + code, since fixing at the source
means all three follow.]

**Lesson**: [What this teaches about your system's verification gaps.
This is the part that scores the second mark — engineering reflection,
not just bug-tracking.]

## 5. Per-role contributions

[Show which role contributed which steps. Even on a 3-person team,
this section forces explicit role coverage and makes integration
visible.]

| Role | Contribution to this walk |
|------|--------------------------|
| [Coordinator name] | [e.g., "Steps 1, 9, 10 (integration boundaries); composed the whole walk"] |
| [Server-side name] | [steps owned] |
| [Client-side name] | [steps owned] |
| [DB-and-security name] | [steps owned] |

## 6. What we'd do differently next time

[Optional but encouraged. Honest reflection on your team's process —
what would have caught issues earlier, what tools or practices you'd
want for next week. The worked example shows the shape.]

- [Bullet 1]
- [Bullet 2]
- [Bullet 3]
```

A few notes on filling this in:

    The template is a skeleton, not a script. Add or remove sections if your project genuinely needs different shape. Don't shoehorn a no-external-API project into the "Search via your external API" framing — replace that group with whatever exercises your main user flows.
    Length isn't the criterion. The worked example is ~150 lines; yours might be 80-200 depending on project complexity. A short e2e doc that reflects honest engineering scores better than a long one that pads out the sections.
    You may have zero findings to report. That's possible if your project has no external API and your unit tests already covered the main flows well. If so, your execution log is all PASS, your section 4 says "no findings — here's how we know" with evidence (screenshots of network panel showing real API calls, console output, etc.), and you skip the Finding subsection entirely.
    Per-role contributions don't have to be evenly distributed. Coordinator typically owns the integration-boundary steps; the role with the external API integration typically owns the most steps. Honest distribution beats forced parity.

### How honest findings work for grading

The whole-system e2e mark (2 marks) breaks down:

Criterion 	Marks
e2e.md has all required sections (definition, walk, pass criteria, execution log, per-role contributions) 	1
Execution log shows honest findings — bugs surfaced and fixed or explicit "we ran it cleanly and here's how we know" with evidence 	1

That second mark is the one that rewards engineering judgment. Examples that score full marks on this:

    "Step 3 failed: search for <weird query> returned the wrong type of result. Root cause was a contract gap — section 3 didn't specify result filtering. Revised CONTRACTS.md commit abc123, added test fixture commit def456, applied implementation patch commit ghi789. Step 3 now passes."
    "All 12 steps passed cleanly. Confidence: medium. We hit the real Spoonacular API for steps 4-7 (verified via network panel — see screenshot in e2e/screenshots/). For steps 8-10 we wrote new test fixtures inspired by what real API returned during the walk. Known gap: we didn't load-test step 5 with concurrent requests, so cannot confirm rate-limit handling under realistic load. Filing as known limitation."

Both score full. Both are doing real engineering work — finding things, fixing things, documenting limitations honestly.

What does not score full marks on the second criterion:

    "All 12 steps passed."
    "We tested everything and it works."
    "We did the e2e and it was fine."

These are not engineering reports; they're vibes. The grading criterion is whether the team actually ran the walk and reported what they observed — not whether the run was clean.

## How I grade

Your team's submission is the repo state at the deadline. I grade from the repo — CONTRACTS.md, tests, coord_session.md, e2e.md, commit history — not from a live demo. If you want feedback on your team's work in real-time, post in the team channel; I'll respond there.

The Week 6 session itself is a 60-minute lecture-plus-demo on next week's topics, not an evaluation of your team's project. Your project is graded asynchronously from what you commit.

This is a deliberate shift from the previous version of this assignment. The reason: live-walking each team's project turned out to be the wrong shape of evaluation for this kind of work — it rewarded teams who designed for the demo rather than for the system. The new structure rewards engineering judgment: what e2e means for your project, what you find when you run it, how you fix what you find.

## What to do when you're stuck

In rough order of where to look:

    The Brew Crew worked example. It's the model. If you're confused about what your CONTRACTS.md should look like, read theirs.
    The Week 6 lecture slides. Slide numbers are referenced inline through this doc.
    The Week 6 study guide. Reference for requests library, Flask-Login, branch protection mechanics.
    CONTRACTS.md in your team's repo. If a question is "how should this work," the answer is "what does the contract say?" If the contract is silent, raise it in your team channel.
    Your teammate. If you're server-side and a route isn't behaving as expected, ping the client-side person who's consuming it. Most integration bugs are interface mismatches, and the people on either side of the interface fix them fastest.
    Office hours. Bring the specific failing test, not "my project doesn't work."

Don't spend two hours stuck on something that has a one-line fix. Ask early.

## What success looks like

    CONTRACTS.md committed before role work begins; coord_session.md shows real engagement
    All four test files green at the deadline
    One PR per role (or close to it), merged with green CI
    The team's e2e walk works end-to-end against real services, with honest findings documented in e2e.md
    Each member can explain why the contract has the shape it does — not just what the contract says

This is the discipline that scales to professional software. Teams ship working integrations because they agree first, build second, and verify with tests. The skill is the agreement, not the typing.

## Forward-pointer to Week 7

Next week we add OAuth login (so users can sign in with Google or GitHub) and harden the session model — CSRF tokens, longer-lived sessions, "remember me" cookies. Your CONTRACTS.md will be revised to add the OAuth flow's contract. This builds on Flask-Login, which db-and-security set up this week.

The pattern continues: contract first, test second, code third, integrate together.
