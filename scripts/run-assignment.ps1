# Run Flask locally with the assignment walking-skeleton frontend at /site/
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$python = ".\.venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    $python = "..\.venv\Scripts\python.exe"
}
if (-not (Test-Path $python)) {
    Write-Error "Missing .venv. From SD-Dungeon-Generator run: python -m venv .venv; .\.venv\Scripts\pip install -r requirements.txt"
}

$env:SECRET_KEY = "dev-secret-not-for-production"
$env:DATABASE_URL = "sqlite:///dev.db"
$env:OAUTH_CLIENT_ID = "dev-client-id"
$env:OAUTH_CLIENT_SECRET = "dev-client-secret"
$env:S3_CONTENT_DIR = "S3_content"

Write-Host "Dungeon frontend: http://127.0.0.1:5000/site/"
Write-Host "Flask home/auth:  http://127.0.0.1:5000/"
Write-Host "Press Ctrl+C to stop."
Write-Host ""

& $python app.py
