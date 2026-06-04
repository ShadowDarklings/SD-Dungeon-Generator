# Agent guide: run the SD site locally (Windows)

Use this file when asked to **start, load, or inspect the ShadowDarklings SD Dungeon Generator locally**.

The repo root for all commands below is:

`SD-Dungeon-Generator/` (inside the `SD-website` workspace)

---

## Quick start (preferred for humans)

From PowerShell:

```powershell
cd "c:\Users\Dungeon Master\Desktop\Coding stuff\GCSDE\506\SD-website\SD-Dungeon-Generator"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\run-assignment.ps1"
```

Leave that terminal open. Press **Ctrl+C** to stop the server.

---

## Agent-safe launch (Codex, VS Code, Cursor)

When an LLM agent is asked to launch the site, use a real long-lived PowerShell
window. Do not use `Start-Job`, hidden `cmd /B`, or a foreground tool command
with a timeout; those can briefly return 200 and then die when the agent command
ends.

From the `SD-website` workspace root, run:

```powershell
$dir = "C:\Users\Dungeon Master\Desktop\Coding stuff\GCSDE\506\SD-website\SD-Dungeon-Generator"

Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue |
  Where-Object { $_.OwningProcess -gt 0 } |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

Start-Process -FilePath "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" `
  -ArgumentList @(
    "-NoExit",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "Set-Location '$dir'; .\scripts\run-assignment.ps1"
  ) `
  -WorkingDirectory $dir `
  -PassThru
```

Then verify from the agent shell:

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:5000/site/" -UseBasicParsing -TimeoutSec 10
```

Expect status **200** and a listener like:

```powershell
Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
```

If the in-app browser still shows an old connection-refused page, open a fresh
tab to `http://127.0.0.1:5000/site/` instead of relying on the stale error tab.

### URLs after start

| Page | URL |
|------|-----|
| Home | http://127.0.0.1:5000/ |
| Login | http://127.0.0.1:5000/login |
| About | http://127.0.0.1:5000/about |
| Dungeon generator (main client) | http://127.0.0.1:5000/site/ |

**Important:** The dungeon UI and interactive buttons are at **`/site/`**, not the Flask home page alone.

---

## What `run-assignment.ps1` does

The script:

1. `cd`s to `SD-Dungeon-Generator`
2. Uses `.venv\Scripts\python.exe` (falls back to `..\ .venv` in `SD-website` if needed)
3. Sets required dev environment variables:
   - `SECRET_KEY=dev-secret-not-for-production`
   - `DATABASE_URL=sqlite:///dev.db`
   - `OAUTH_CLIENT_ID=dev-client-id`
   - `OAUTH_CLIENT_SECRET=dev-client-secret`
4. Runs `python app.py` (Flask, port **5000**, debug mode)

No Docker is required for this local workflow.

---

## First-time setup (only if venv is missing)

```powershell
cd "c:\Users\Dungeon Master\Desktop\Coding stuff\GCSDE\506\SD-website\SD-Dungeon-Generator"
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
```

If `.venv` already exists at `SD-website\.venv`, the run script will use that instead.

---

## Verify the server is up

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:5000/site/" -UseBasicParsing -TimeoutSec 5
```

Expect status **200**. Also check:

```powershell
@(
  "http://127.0.0.1:5000/",
  "http://127.0.0.1:5000/login",
  "http://127.0.0.1:5000/about",
  "http://127.0.0.1:5000/site/"
) | ForEach-Object {
  try { "$_ -> $((Invoke-WebRequest -Uri $_ -UseBasicParsing -TimeoutSec 5).StatusCode)" }
  catch { "$_ -> FAIL" }
}
```

---

## Manual start (if the script fails)

```powershell
cd "c:\Users\Dungeon Master\Desktop\Coding stuff\GCSDE\506\SD-website\SD-Dungeon-Generator"
$env:SECRET_KEY = "dev-secret-not-for-production"
$env:DATABASE_URL = "sqlite:///dev.db"
$env:OAUTH_CLIENT_ID = "dev-client-id"
$env:OAUTH_CLIENT_SECRET = "dev-client-secret"
& "c:\Users\Dungeon Master\Desktop\Coding stuff\GCSDE\506\SD-website\.venv\Scripts\python.exe" app.py
```

All four env vars are **required** — `app.py` reads them with `os.environ[...]` and crashes on startup if any are missing.

---

## Project layout (for agents)

| Path | Purpose |
|------|---------|
| `app.py` | Flask app: auth, about, API, serves static dungeon at `/site/` |
| `S3_content/` | Dungeon frontend (`index.html`, `src/*.js`, JSON data) |
| `templates/` | Flask Jinja templates (home, login, register, about) |
| `static/` | Flask CSS/assets for auth pages |
| `scripts/run-assignment.ps1` | **Use this** to run full site locally |
| `scripts/run-mvp.ps1` | Alternate frontend folder (`S3_content_mvp`) — not the default |

---

## Troubleshooting

### Agent shell "stalled" or server not running

Background agent shells often exit before Flask finishes starting. Prefer:

1. Run `.\scripts\run-assignment.ps1` in the **user's own terminal**, or
2. Run the manual start command above in foreground and wait for `Running on http://127.0.0.1:5000`

Then verify with `Invoke-WebRequest` as above.

### Buttons don't work; only "Back to About" / GitHub links work

Those links are plain HTML. Everything else needs JavaScript modules.

Checklist:

1. User must be on **http://127.0.0.1:5000/site/** (not `file://`)
2. Hard refresh: **Ctrl+Shift+R**
3. Open browser DevTools → Console for JS errors
4. Confirm modules load: http://127.0.0.1:5000/site/src/main.js should return **200**

### Dungeon map is blank but page loads

Hand-drawn assets under `S3_content/assets/` may be missing locally. The app falls back to a flat renderer; gameplay should still work. Click **Generate Dungeon**.

### Port already in use

```powershell
Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue |
  Where-Object { $_.OwningProcess -gt 0 } |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
```

Then restart with `.\scripts\run-assignment.ps1`.

### Docker

Docker is **optional** for local dev. The team’s routine Windows workflow is Flask + SQLite via `run-assignment.ps1`. Use `docker compose up` only when Postgres/container parity is explicitly needed.

---

## Frontend-only smoke test (optional)

For **dungeon client only** (no Flask login/about), some sessions used a static server:

```powershell
cd "c:\Users\Dungeon Master\Desktop\Coding stuff\GCSDE\506\SD-website\SD-Dungeon-Generator\S3_content"
& "c:\Users\Dungeon Master\Desktop\Coding stuff\GCSDE\506\SD-website\.venv\Scripts\python.exe" -m http.server 8000
```

Open: http://127.0.0.1:8000/index.html

Save/load API calls will not work on port 8000. Use the Flask workflow above to inspect login, about, and full integration.

---

## Do not

- Open `S3_content/index.html` via `file://` — ES modules and fetches will break
- Assume the dungeon lives at `/` — it is at **`/site/`**
- Commit `.env` or real OAuth secrets
- Skip env vars when starting `app.py` manually
