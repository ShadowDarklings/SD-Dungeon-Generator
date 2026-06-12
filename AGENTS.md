# Agent guide: launch the SD site locally on Windows

Use this file when the user asks to **launch**, **start**, **open**, **load**, or
**inspect** the ShadowDarklings SD Dungeon Generator locally.

The goal is simple: get the full Flask site running at:

`http://127.0.0.1:5000/site/`

The dungeon UI is at `/site/`. Do not stop at `http://127.0.0.1:5000/`.

---

## Front-End Typography Rule

Do not use the ShadowSpawner title font (`JBlack`) for new UI text unless the
user explicitly asks for that title/display font.

Default UI text and headings should use the same serif family as the character
sheet `GEAR` heading:

`"Times New Roman", Georgia, serif`

This is especially important for modal titles, section headings, character
sheet text, importer controls, and multiplayer controls.

---

## Fast Path For Agents

When the user says something like **"launch the SD site locally"**, do this:

1. Use the active repo/worktree that contains this `AGENTS.md`.
2. Stop anything already using port `5000`.
3. Start Flask in a real long-lived PowerShell window.
4. Verify `http://127.0.0.1:5000/site/` returns `200`.
5. Tell the user the URL.

Do not use `Start-Job`, hidden `cmd /B`, or a foreground command with a timeout
as the server. Those often start briefly, pass one probe, and then die before
Firefox or the Codex browser can connect.

---

## One-Command Agent Launch

From the directory containing this `AGENTS.md`, run this PowerShell command.
It works from the hardening worktree and uses the shared `SD-website\.venv`.

```powershell
$repo = (Get-Location).Path
$python = "C:\Users\Dungeon Master\Desktop\Coding stuff\GCSDE\506\SD-website\.venv\Scripts\python.exe"
$launcher = Join-Path $env:TEMP "sd-local-launch.ps1"

Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue |
  Where-Object { $_.OwningProcess -gt 0 } |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

@"
Set-Location '$repo'
`$env:SECRET_KEY = 'dev-secret-not-for-production'
`$env:DATABASE_URL = 'sqlite:///dev.db'
`$env:OAUTH_CLIENT_ID = 'dev-client-id'
`$env:OAUTH_CLIENT_SECRET = 'dev-client-secret'
`$env:ALLOW_ANON_SHADOWDARKLINGS_IMPORT = '1'
& '$python' -u -c "from app import app; app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)"
"@ | Set-Content -Path $launcher -Encoding UTF8

Start-Process -FilePath "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" `
  -ArgumentList @("-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $launcher) `
  -WorkingDirectory $repo `
  -WindowStyle Normal `
  -PassThru

Start-Sleep 6
Invoke-WebRequest -Uri "http://127.0.0.1:5000/site/" -UseBasicParsing -TimeoutSec 10
```

Expected result: `StatusCode` is `200`.

If the first probe fails, wait five more seconds and try the same
`Invoke-WebRequest` again. If it still fails, read the visible PowerShell window;
it should show the Flask startup error.

---

## Human Quick Start

If a human is starting the site manually, open PowerShell and run:

```powershell
cd "C:\Users\Dungeon Master\Desktop\Coding stuff\GCSDE\506\SD-website\SD_week_8_hardening\sd-charles-worktree"
$env:SECRET_KEY = "dev-secret-not-for-production"
$env:DATABASE_URL = "sqlite:///dev.db"
$env:OAUTH_CLIENT_ID = "dev-client-id"
$env:OAUTH_CLIENT_SECRET = "dev-client-secret"
$env:ALLOW_ANON_SHADOWDARKLINGS_IMPORT = "1"
& "C:\Users\Dungeon Master\Desktop\Coding stuff\GCSDE\506\SD-website\.venv\Scripts\python.exe" -u -c "from app import app; app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)"
```

Leave that terminal open. Press `Ctrl+C` to stop the server.

---

## URLs After Start

| Page | URL |
|------|-----|
| Dungeon generator | http://127.0.0.1:5000/site/ |
| Home | http://127.0.0.1:5000/ |
| Login | http://127.0.0.1:5000/login |
| Register | http://127.0.0.1:5000/register |
| About | http://127.0.0.1:5000/about |

If Firefox or the in-app browser shows an old connection-refused page, open a
brand-new tab to `http://127.0.0.1:5000/site/`. You can also try
`http://localhost:5000/site/`.

---

## Verify The Server

Use both checks:

```powershell
netstat -ano | findstr :5000
Invoke-WebRequest -Uri "http://127.0.0.1:5000/site/" -UseBasicParsing -TimeoutSec 10
```

The first should show `LISTENING`. The second should return status `200`.

To verify all key pages:

```powershell
@(
  "http://127.0.0.1:5000/",
  "http://127.0.0.1:5000/login",
  "http://127.0.0.1:5000/register",
  "http://127.0.0.1:5000/about",
  "http://127.0.0.1:5000/site/"
) | ForEach-Object {
  try { "$_ -> $((Invoke-WebRequest -Uri $_ -UseBasicParsing -TimeoutSec 5).StatusCode)" }
  catch { "$_ -> FAIL: $($_.Exception.Message)" }
}
```

---

## If You Are In A Different Folder

Prefer the active worktree the user is editing. In this thread that is usually:

`C:\Users\Dungeon Master\Desktop\Coding stuff\GCSDE\506\SD-website\SD_week_8_hardening\sd-charles-worktree`

The older main project copy may also exist here:

`C:\Users\Dungeon Master\Desktop\Coding stuff\GCSDE\506\SD-website\SD-Dungeon-Generator`

If unsure, locate the active copy with:

```powershell
Get-ChildItem "C:\Users\Dungeon Master\Desktop\Coding stuff\GCSDE\506\SD-website" -Recurse -Filter AGENTS.md
```

Then start the copy that contains the files the user wants to edit.

---

## Existing Script

There is a script at:

`scripts\run-assignment.ps1`

It is useful for humans when `.venv` is visible from the repo folder. Some
worktrees only have the shared venv at `SD-website\.venv`, so the one-command
agent launch above is safer for Codex.

The script sets:

- `SECRET_KEY=dev-secret-not-for-production`
- `DATABASE_URL=sqlite:///dev.db`
- `OAUTH_CLIENT_ID=dev-client-id`
- `OAUTH_CLIENT_SECRET=dev-client-secret`
- `S3_CONTENT_DIR=S3_content`
- `ALLOW_ANON_SHADOWDARKLINGS_IMPORT=1`

The first four main env vars are required because [app.py](./app.py) reads them
with `os.environ[...]`. The anonymous ShadowDarklings import bypass is only for
local frontend editing and must not be enabled in production.

---

## Troubleshooting

### Browser says connection refused

The server is not listening anymore. Do not keep refreshing blindly. Run:

```powershell
netstat -ano | findstr :5000
```

If there is no `LISTENING` line, restart with **One-Command Agent Launch**.

### Command returns 200 once, then browser fails

The server process probably died after the agent shell ended or the Flask
debug reloader spawned a child process that did not survive. Restart with the
one-command launch above, which uses `use_reloader=False` and a real PowerShell
window.

### Missing venv

Use the shared venv first:

`C:\Users\Dungeon Master\Desktop\Coding stuff\GCSDE\506\SD-website\.venv\Scripts\python.exe`

If it is missing, create one:

```powershell
cd "C:\Users\Dungeon Master\Desktop\Coding stuff\GCSDE\506\SD-website\SD_week_8_hardening\sd-charles-worktree"
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
```

### Buttons do not work

Make sure the user is on `http://127.0.0.1:5000/site/`, not `file://` and not
only `http://127.0.0.1:5000/`.

Confirm JavaScript modules load:

`http://127.0.0.1:5000/site/src/main.js`

### Port already in use

```powershell
Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue |
  Where-Object { $_.OwningProcess -gt 0 } |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
```

Then restart with **One-Command Agent Launch**.

---

## How To Ask An Agent Next Time

Best prompt:

> Launch the SD site locally from the active worktree using `AGENTS.md`. Use a
> long-lived visible PowerShell process, disable the Flask reloader, verify
> `http://127.0.0.1:5000/site/` returns `200`, and give me the URL.

Short prompt that should also work:

> Launch the SD site locally so I can edit it.

If the agent only starts the Flask home page, remind it that the dungeon UI is
at `/site/`.

---

## Do Not

- Do not open `S3_content/index.html` via `file://`; ES modules and fetches will break.
- Do not assume the dungeon lives at `/`; it lives at `/site/`.
- Do not skip the required env vars.
- Do not use Docker unless the user explicitly asks for container parity.
- Do not declare success until `/site/` returns `200` after the server has been running for a few seconds.
