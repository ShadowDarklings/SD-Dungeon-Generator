# Week 7 Submission Checklist — ShadowDarklings

**Assignment:** `week-7/hong-instructions.md` (10 marks total)  
**Grade from:** Git tag `week7-final` on the repo root commit — not a side branch, not a live demo.  
**Last audited:** May 27, 2026 (branch `Charles-smoke-test-etc`)

Use this as the team’s single source of truth before tagging. Check boxes when done on the **integration branch** that will receive `week7-final`.

---

## Quick status

| Part | Marks | Estimate | Blocker |
|------|-------|----------|---------|
| Part 1 — Contracts + coord session | 2 | ~90% | `.env.example` incomplete |
| Part 2 — Individual role work + Playwright | 5 | ~55% | Megan missing; Mario test/doc drift |
| Part 3 — Group lifecycle suite + walkthrough | 3 | ~0% | Not started |
| Submission tag | — | 0% | No `week7-final` yet |

**Verdict:** Not submission-complete. Charles’s UI/smoke slice is done; team integration + Part 3 + tag still required.

---

## Part 1 — Group: Contracts revision (2 marks)

**Owner:** Coordinator (Charles) + team review  
**Deliverables at repo root:** `CONTRACTS.md`, `coord_session.md`

### Contract content (1 mark)

- [x] `CONTRACTS.md` at repo root (OAuth sections: routes, user shape, `oauth_identities`, session, logout)
- [x] `/login/github` and `/auth/github/callback` specified with concrete shapes
- [x] Provider field handling + missing-field behavior documented
- [x] `external_dependency: github.com` / honest limitations section
- [ ] Team agrees root `CONTRACTS.md` matches merged code (re-sync if branches diverged)

### Planning session (1 mark)

- [x] `coord_session.md` at repo root (cross-role decisions, not just a to-do list)
- [x] `week-7/coord_session.md` can stay as reference copy (optional)

### Secrets / clone-and-run (coordinator duty — grading blocker)

- [x] `.env` in `.gitignore`
- [x] `load_dotenv()` before `os.environ[...]` in `app.py`
- [x] `os.environ["KEY"]` (not `.get`) for secrets
- [ ] **`.env.example` documents all required vars with placeholders:**
  - [ ] `SECRET_KEY`
  - [ ] `DATABASE_URL`
  - [ ] `OAUTH_CLIENT_ID`
  - [ ] `OAUTH_CLIENT_SECRET`
- [ ] Coordinator has created GitHub OAuth app; real values only in local `.env` (never committed)

**Verify Part 1**

```bash
# Fresh clone simulation — app should fail loudly without .env, succeed with copied .env.example → .env filled in
cp .env.example .env   # then edit placeholders
python -c "from dotenv import load_dotenv; load_dotenv(); import os; os.environ['OAUTH_CLIENT_ID']"
```

---

## Part 2 — Individual: Role work + one Playwright test (5 marks)

**Each person:** `role_work_<name>.md` at repo root + **one** `test_*` function in `tests/e2e/` that uses Playwright (`page`, real DOM).

### Charles — Client-side + Coordinator

| Item | Status | Notes |
|------|--------|-------|
| `role_work_charles.md` | Done | Replaces old `Charles_Week7_frontend_work.md` |
| Login UI: GitHub button + password form | Done | `templates/login.html` |
| Post-login UX (navbar, landing) | Done | `templates/base.html`, `home.html` |
| Logout clears state in UI | Done | Playwright smoke covers this |
| Remember-me **wired in backend** | **Todo** | Checkbox exists; `app.py` does not pass `remember=` to `login_user` |
| Playwright: `test_charles_auth_smoke_path` | Done | In `tests/e2e/test_security_access.py` |
| Coordinator: `coord_session.md` | Done | See Part 1 |
| Coordinator: `.env.example` | **Todo** | See Part 1 |

**Charles verify**

```bash
pytest tests/e2e/test_security_access.py::test_charles_auth_smoke_path -v
```

### Mario — DB & Security

| Item | Status | Notes |
|------|--------|-------|
| `role_work_mario.md` | Done | |
| `oauth_identities` table + nullable `password_hash` | Done | `app.py` |
| Cookie flags, CSRF, session lifetime config | Done | `app.py` |
| Test-login backdoor `/test/login/<username>` | Done | Guarded by `TESTING` |
| Playwright: `test_protected_page_access_control` | **Mismatch** | Documented in role_work but **not in repo** — implement OR update role_work |
| CSRF on login/register/logout forms | Done | Templates |

**Mario verify (after fix)**

```bash
pytest tests/e2e/test_security_access.py -k "protected or access" -v
# Or whatever test name Mario lands on — must use page + live_server + DOM asserts
```

### Megan — Server-side

| Item | Status | Notes |
|------|--------|-------|
| `role_work_megan.md` | **Missing** | Required at repo root |
| Authlib `/login/github` + `/auth/github/callback` | Done in `app.py` | Confirm Megan’s slice is attributed in role_work |
| Create-or-link logic (new / returning / email link) | Done in `app.py` | |
| Playwright: `tests/e2e/test_server_login.py` | **Missing** | CONTRACTS names this file; happy path ending with logged-in username visible |
| Provider field defaults (no crash on partial payload) | Review | Manual + test coverage |

**Megan verify (after deliverable)**

```bash
pytest tests/e2e/test_server_login.py -v
```

### Part 2 cross-cutting

- [ ] All three Playwright tests pass together: `pytest tests/e2e/ -v`
- [ ] `playwright install chromium` documented in README or team notes (one-time setup)
- [ ] Each `role_work_*.md` has: files touched, what the test verifies, **known gaps** (honest, not “we test everything”)
- [ ] No tautological tests (`assert True` after navigation only)
- [ ] Merge branches (`Charles-smoke-test-etc`, `week7-server-auth`, Megan’s branch) without clobbering e2e files

---

## Part 3 — Group: Full lifecycle suite + walkthrough (3 marks)

**Owners:** Whole team (coordinator drives doc)  
**Deliverables at repo root:** `team_walkthrough.md`  
**Deliverable in tests:** `tests/e2e/test_full_lifecycle.py`

### Resolve design before coding (team decision — document in walkthrough)

The assignment wants `oauth_identity` rows in lifecycle tests; `CONTRACTS.md` says the test backdoor does **not** create them. Pick one approach and name the gap:

- [ ] **Decision recorded** in `team_walkthrough.md` (Option A: extend backdoor in `TESTING` to create/link identity; Option B: mock callback; Option C: DB fixture helper route)

### Four required scenarios in `test_full_lifecycle.py`

- [ ] **1. First-time OAuth login** — new user via backdoor (or agreed path); post-login page; `oauth_identities` row exists
- [ ] **2. Returning OAuth login** — logout + login again; same row reused (no duplicate)
- [ ] **3. CSRF protection** — tokenless POST to state-changing endpoint → rejected (Playwright `request` context OK)
- [ ] **4. Session expires** — short test `PERMANENT_SESSION_LIFETIME`; protected page blocked after expiry

### `team_walkthrough.md` (centerpiece — 1 mark for honest gaps)

- [ ] One section **per test**: user-visible behavior + specific regression it would catch
- [ ] **Gaps section** with one-line rationales, including at minimum:
  - [ ] Real GitHub redirect not driven in CI (backdoor stands in)
  - [ ] SQLite in Playwright vs Postgres in production
  - [ ] Token not revoked on logout
  - [ ] Remember-me / session lifetime scope (what Part 3 covers vs individual tests)
- [ ] Reads as a 10-minute walkthrough for a new teammate (not bullet dump only)

**Verify Part 3**

```bash
pytest tests/e2e/test_full_lifecycle.py -v
```

---

## Manual verification (once per team)

- [ ] Real GitHub OAuth: click “Sign in with GitHub” on running app → authorize → land on expected page
- [ ] Document result in `team_walkthrough.md` gaps (“verified manually on DATE by NAME”)
- [ ] Password login still works for non-OAuth accounts
- [ ] OAuth-only account gets “This account uses GitHub login” on password attempt

---

## Code hygiene before tag

- [ ] `requirements.txt` pins Authlib, Flask-WTF, python-dotenv, playwright, pytest-playwright
- [ ] `tests/conftest.py` or e2e conftest sets test OAuth env vars before `import app`
- [ ] No secrets in git (`git log -p` spot-check for client secrets)
- [ ] `role_work_mario.md` test name matches actual test function name
- [ ] Root docs only for grading paths (assignment: root `CONTRACTS.md`, `coord_session.md`, `team_walkthrough.md`, `role_work_*.md`)

---

## Integration & Git workflow

### Branches to merge (update as you go)

| Branch | Contains | Merge status |
|--------|----------|--------------|
| `Charles-smoke-test-etc` | Charles UI, smoke test, `role_work_charles.md` | Pushed |
| `UI-Front-End-update-Charles` | Earlier Charles work | Review vs smoke-test branch |
| `week7-server-auth` | Megan/server auth engine | [ ] Merged |
| `main` | Production line | [ ] Receives all Week 7 work |

### Pre-tag checklist

- [ ] All Part 1–3 boxes above checked on **one** branch
- [ ] `pytest tests/e2e/ -v` green locally
- [ ] `pytest tests/ -v` green (or document known failures honestly in walkthrough)
- [ ] PR reviewed by at least one teammate not the author
- [ ] Root `.env.example` complete

### Submission (required)

```bash
git checkout <integration-branch>
git pull
pytest tests/e2e/ -v

git tag -a week7-final -m "Week 7 final submission — ShadowDarklings"
git push origin week7-final
```

- [ ] Tag `week7-final` created on final commit
- [ ] Tag pushed to `origin`
- [ ] Canvas submission points to tagged commit (per course instructions)

---

## Assignment rubric map (self-grade)

| # | Deliverable | Points | Done? |
|---|-------------|--------|-------|
| 1 | `CONTRACTS.md` — OAuth | Part 1 | Yes |
| 2 | `coord_session.md` | Part 1 | Yes |
| 3 | `role_work_mario.md` | Part 2 | Yes |
| 4 | `role_work_charles.md` | Part 2 | Yes |
| 5 | `role_work_megan.md` | Part 2 | **No** |
| 6 | `team_walkthrough.md` | Part 3 | **No** |
| 7 | `test_full_lifecycle.py` (4 scenarios) | Part 3 | **No** |
| 8a | Playwright — Mario | Part 2 | **Drift** |
| 8b | Playwright — Megan | Part 2 | **No** |
| 8c | Playwright — Charles | Part 2 | Yes |
| 9 | `.env.example` OAuth vars | Part 1 / clone | **No** |
| 10 | `requirements.txt` stack | — | Yes |
| 11 | Git tag `week7-final` | Submission | **No** |
| 12 | Known gaps documented | All parts | Partial (role_work only; need walkthrough) |

---

## Suggested work order (critical path)

1. **`.env.example`** — fast, unblocks instructor clone (Charles/coordinator)
2. **`role_work_megan.md` + `test_server_login.py`** — unblocks Part 2 marks
3. **Mario Playwright test** — align code with `role_work_mario.md`
4. **Remember-me wiring** — small Charles fix in `app.py`
5. **Team decision** on `oauth_identity` vs backdoor for Part 3
6. **`test_full_lifecycle.py` + `team_walkthrough.md`**
7. **Merge → full e2e run → tag `week7-final`**

---

## References

- Assignment spec: `week-7/hong-instructions.md`
- Contract (grading): `CONTRACTS.md` (repo root)
- Week 7 contract copy: `week-7/CONTRACTS.md`
- Planning transcript: `coord_session.md` (repo root)
