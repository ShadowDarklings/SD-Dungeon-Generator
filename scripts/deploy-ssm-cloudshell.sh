#!/usr/bin/env bash
set -euo pipefail

INSTANCE_ID="${SD_DEPLOY_INSTANCE_ID:-i-0a01e42bfd5eabc0e}"
PUBLIC_URL_HOST="${SD_DEPLOY_PUBLIC_HOST:-44-252-95-80.sslip.io}"
REMOTE_REPO="${SD_DEPLOY_REMOTE_REPO:-/home/ubuntu/SD-Dungeon-Generator}"
BRANCH="${SD_DEPLOY_BRANCH:-main}"
REGION="${AWS_REGION:-us-west-2}"
COMPOSE_COMMAND="docker compose up -d --build"

if [[ "${1:-}" == "--no-build" ]]; then
  COMPOSE_COMMAND="docker compose up -d"
fi

PARAMETERS_FILE="$(mktemp)"
cat > "$PARAMETERS_FILE" <<JSON
{
  "commands": [
    "sudo -H -u ubuntu bash -lc 'set -e && cd '\\''$REMOTE_REPO'\\'' && git fetch origin '\\''$BRANCH'\\'' && git checkout '\\''$BRANCH'\\'' && git pull --ff-only origin '\\''$BRANCH'\\'' && $COMPOSE_COMMAND && docker compose ps && curl -k -fsS -o /dev/null -w '\\''site %{http_code}\\\\n'\\'' '\\''https://$PUBLIC_URL_HOST/site/'\\'''"
  ]
}
JSON

echo "Deploying branch '$BRANCH' to EC2 instance $INSTANCE_ID through AWS SSM."
echo "Public check: https://$PUBLIC_URL_HOST/site/"
COMMAND_ID="$(
  aws ssm send-command \
    --region "$REGION" \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --comment "SD Dungeon Generator deploy" \
    --parameters "file://$PARAMETERS_FILE" \
    --query "Command.CommandId" \
    --output text
)"

echo "SSM command id: $COMMAND_ID"
aws ssm wait command-executed --region "$REGION" --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID"
aws ssm get-command-invocation --region "$REGION" --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" --output text
