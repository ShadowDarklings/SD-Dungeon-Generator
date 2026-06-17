param(
  [string]$HostName = $env:SD_DEPLOY_HOST,
  [string]$PublicUrlHost = $env:SD_DEPLOY_PUBLIC_HOST,
  [string]$KeyPath = $env:SD_DEPLOY_KEY,
  [string]$RemoteRepo = $env:SD_DEPLOY_REMOTE_REPO,
  [string]$Branch = $env:SD_DEPLOY_BRANCH,
  [switch]$NoBuild,
  [switch]$SkipLocalGitCheck
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Quote-Remote([string]$Value) {
  return "'" + ($Value -replace "'", "'\''") + "'"
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot
try {
  if (-not $HostName) {
    $HostName = "44.252.95.80"
  }
  if (-not $PublicUrlHost) {
    $PublicUrlHost = "44-252-95-80.sslip.io"
  }
  if (-not $KeyPath) {
    $KeyPath = Join-Path $HOME ".ssh\mazekey.pem"
  }
  if (-not $RemoteRepo) {
    $RemoteRepo = "/home/ubuntu/SD-Dungeon-Generator"
  }
  if (-not $Branch) {
    $Branch = (git rev-parse --abbrev-ref HEAD).Trim()
  }

  if (-not $SkipLocalGitCheck) {
    $dirty = git status --porcelain
    if ($dirty) {
      Write-Warning "Local working tree has uncommitted changes. Commit and push before deploying if you want those changes live."
    }
    $unpushed = git log --branches --not --remotes --oneline
    if ($unpushed) {
      Write-Warning "This branch has commits that are not on the remote yet. Push before deploying if you want them live."
    }
  }

  $composeCommand = if ($NoBuild) {
    "docker compose up -d"
  } else {
    "docker compose up -d --build"
  }
  $quotedRepo = Quote-Remote $RemoteRepo
  $quotedBranch = Quote-Remote $Branch
  $quotedUrl = Quote-Remote "https://$PublicUrlHost/site/"
  $remoteCommand = @(
    "set -e",
    "cd $quotedRepo",
    "git fetch origin $quotedBranch",
    "git checkout $quotedBranch",
    "git pull --ff-only origin $quotedBranch",
    $composeCommand,
    "docker compose ps",
    "curl -k -fsS -o /dev/null -w 'site %{http_code}\n' $quotedUrl"
  ) -join " && "

  Write-Host "Deploying branch '$Branch' to ubuntu@${HostName}:$RemoteRepo"
  Write-Host "Public check: https://$PublicUrlHost/site/"
  ssh -i $KeyPath -o BatchMode=yes "ubuntu@$HostName" $remoteCommand
}
finally {
  Pop-Location
}
