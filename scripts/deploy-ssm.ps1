param(
  [string]$InstanceId = $env:SD_DEPLOY_INSTANCE_ID,
  [string]$PublicUrlHost = $env:SD_DEPLOY_PUBLIC_HOST,
  [string]$RemoteRepo = $env:SD_DEPLOY_REMOTE_REPO,
  [string]$Branch = $env:SD_DEPLOY_BRANCH,
  [string]$Region = $env:AWS_REGION,
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
  if (-not $InstanceId) {
    throw "Set SD_DEPLOY_INSTANCE_ID to the EC2 instance id, for example i-0123456789abcdef0."
  }
  if (-not $PublicUrlHost) {
    $PublicUrlHost = "44-252-95-80.sslip.io"
  }
  if (-not $RemoteRepo) {
    $RemoteRepo = "/home/ubuntu/SD-Dungeon-Generator"
  }
  if (-not $Branch) {
    $Branch = (git rev-parse --abbrev-ref HEAD).Trim()
  }
  if (-not $Region) {
    $Region = "us-west-2"
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
  $deployCommand = @(
    "set -e",
    "cd $quotedRepo",
    "git fetch origin $quotedBranch",
    "git checkout $quotedBranch",
    "git pull --ff-only origin $quotedBranch",
    $composeCommand,
    "docker compose ps",
    "curl -k -fsS -o /dev/null -w 'site %{http_code}\n' $quotedUrl"
  ) -join " && "
  $commands = @("sudo -H -u ubuntu bash -lc " + (Quote-Remote $deployCommand))

  $parametersFile = Join-Path ([System.IO.Path]::GetTempPath()) "sd-ssm-deploy-parameters.json"
  $parametersJson = @{ commands = $commands } | ConvertTo-Json -Depth 4
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($parametersFile, $parametersJson, $utf8NoBom)

  Write-Host "Deploying branch '$Branch' to EC2 instance $InstanceId through AWS SSM."
  Write-Host "Public check: https://$PublicUrlHost/site/"
  $commandId = aws ssm send-command `
    --region $Region `
    --instance-ids $InstanceId `
    --document-name "AWS-RunShellScript" `
    --comment "SD Dungeon Generator deploy" `
    --parameters "file://$parametersFile" `
    --query "Command.CommandId" `
    --output text

  Write-Host "SSM command id: $commandId"
  aws ssm wait command-executed --region $Region --command-id $commandId --instance-id $InstanceId
  $resultJson = aws ssm get-command-invocation --region $Region --command-id $commandId --instance-id $InstanceId --output json
  $result = $resultJson | ConvertFrom-Json

  if ($result.StandardOutputContent) {
    Write-Host $result.StandardOutputContent
  }
  if ($result.StandardErrorContent) {
    Write-Warning $result.StandardErrorContent
  }
  if ($result.Status -ne "Success") {
    throw "SSM deploy failed with status $($result.Status)."
  }
}
finally {
  Pop-Location
}
