# Run Flask locally with the assignment walking-skeleton frontend at /site/
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Test-Path ".\.venv\Scripts\python.exe")) {
    Write-Error "Missing .venv. Create it with: python -m venv .venv; .\.venv\Scripts\pip install -r requirements.txt"
}

$env:DATABASE_URL = "sqlite:///dev.db"
$env:S3_CONTENT_DIR = "S3_content"

Write-Host "Assignment site: http://127.0.0.1:5000/site/"
Write-Host "Flask home:      http://127.0.0.1:5000/"
Write-Host ""

.\.venv\Scripts\python.exe app.py
