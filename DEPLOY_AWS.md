# AWS Deployment (Week 5 EC2 Skeleton)

This project now runs as a Week 5 Flask + Postgres walking skeleton. The
recommended class deployment path is Docker Compose on each teammate's EC2
instance.

The dungeon frontend is committed in `S3_content/` and Flask serves it at
`/site/`.

## EC2 Docker Compose Path

1. SSH into EC2.
2. Install Docker and Docker Compose:

```shell
sudo apt update
sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER
```

3. Log out and SSH back in.
4. Clone the repo:

```shell
git clone https://github.com/ShadowDarklings/SD-Dungeon-Generator.git
cd SD-Dungeon-Generator
```

5. Start the stack:

```shell
docker compose up -d
docker compose ps
```

6. From your laptop, open a tunnel:

```shell
ssh -i ~/.ssh/your-key.pem -L 5000:localhost:5000 ubuntu@<EC2-IP>
```

7. Visit `http://localhost:5000`.

## Verification

Run the test suite:

```shell
docker compose exec app pytest -v
```

Verify auth:

```shell
docker compose exec db psql -U app -d app -c "SELECT id, username, created_at FROM users;"
```

## Daily update checklist

Use this when you want to push today's edits back onto EC2 and make sure the
site is serving the latest version.

1. On your laptop, save, commit, and push the files you changed.
2. Run the SSM deploy helper:

```powershell
.\scripts\deploy-ssm.ps1
```

This path does not use inbound SSH, so it does not care if your home/VPN IP
changes. It requires the EC2 instance to be configured as a Systems Manager
managed node. If SSM is not configured yet, use the SSH helper as a temporary
fallback:

```powershell
.\scripts\deploy-ec2.ps1
```

3. Open `https://44-252-95-80.sslip.io/site/` and hard-refresh if the browser
   is holding old static assets.

Use `-NoBuild` only when you changed static frontend files and do not need to
rebuild the Flask image.

The deploy helper reads these optional environment variables:

| Variable | Purpose |
|---|---|
| `SD_DEPLOY_HOST` | SSH host, ideally the Elastic IP |
| `SD_DEPLOY_PUBLIC_HOST` | Public HTTPS hostname used for verification |
| `SD_DEPLOY_KEY` | Private key path |
| `SD_DEPLOY_REMOTE_REPO` | Repo path on EC2 |
| `SD_DEPLOY_BRANCH` | Branch to deploy |
| `SD_DEPLOY_INSTANCE_ID` | EC2 instance id for SSM deploys |
| `AWS_REGION` | AWS region, usually `us-west-2` |

See `scripts/deploy-ec2.config.example.ps1` for a copy/paste template.

If your local AWS CLI is not configured, open AWS CloudShell from the console
and run the bash helper instead:

```bash
cd SD-Dungeon-Generator
bash scripts/deploy-ssm-cloudshell.sh --no-build
```

Do not sync S3 back over `S3_content/` during normal app deployment. In this
repo, nginx serves `S3_content/` from the EC2 checkout. The old S3 sync step is
only for publishing the standalone static S3 copy with
`scripts/s3_sync_publish.py`.

## Quick checks if something looks off

If the home page works but the dungeon content looks stale, rerun the S3 sync.
If login or register fail, check the Flask container logs:

```shell
docker compose logs -f app
```

If you want to verify the auth flow directly, run the tests again:

```shell
docker compose exec app pytest -v
```

## Team SSH access (shared EC2)

Shared Ubuntu host: `ubuntu@44.252.95.80`.

This should be an Elastic IP. If stopping/starting the instance changes the
address, associate an Elastic IP before doing more deployments. Then update
these once:

- `SD_DEPLOY_HOST`
- `SD_DEPLOY_PUBLIC_HOST`
- `nginx/nginx.conf`
- `README.md`
- any OAuth callback URL that includes the old hostname

Elastic IP fixes the server address. It does not fix teammate home IP changes;
those still require updating the security group's SSH source rule.

### Better fix for changing home/VPN IPs: Systems Manager

If your ISP or VPN changes your public IP often, stop depending on SSH inbound
rules for routine deploys. Configure AWS Systems Manager Session Manager / Run
Command for the EC2 instance, then use:

```powershell
.\scripts\deploy-ssm.ps1
```

One-time AWS setup:

1. In EC2, attach an IAM role/instance profile that allows Systems Manager
   managed-instance access, such as the AWS-managed
   `AmazonSSMManagedInstanceCore` policy.
2. Make sure the instance appears in Systems Manager Fleet Manager as a managed
   node. Ubuntu EC2 images usually include SSM Agent; install/start it if it is
   missing.
3. Set your local config:

```powershell
$env:SD_DEPLOY_INSTANCE_ID = "i-..."
$env:AWS_REGION = "us-west-2"
```

After this works, port 22 can stay restricted or even closed for normal
operations. Keep SSH only as a break-glass fallback.

### Security group (inbound SSH)

Each collaborator needs **TCP port 22** allowed from **their current public IPv4**. If SSH times out, add or update an inbound rule for that IP (same fix as when your own IP was not in the group).

| Person | Source CIDR for SSH (port 22) |
|--------|-------------------------------|
| Mario  | `24.16.44.151/32`             |
| Megan  | `44.254.67.209/32`            |

In **AWS Console**: EC2 → **Security Groups** → select the instance’s group → **Edit inbound rules** → **Add rule** per collaborator: Type **SSH**, Port **22**, Source each person’s **`…/32`**.

### `authorized_keys` on the instance

From a session that already has SSH access, append each collaborator’s public key to `~/.ssh/authorized_keys` (new line each; do not remove existing keys). Example `echo` lines:

Mario:

```shell
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMVpHqtItBWM2XNoc9hmSAUjYe44p9itasqo32wC4p2I mrdgx' >> ~/.ssh/authorized_keys
```

Megan:

```shell
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOIFBvBASWRAZSXyec93BAvJQcFomDKc6/2v+lhWMRHe my-ec2-key3' >> ~/.ssh/authorized_keys
```

Then:

```shell
chmod 600 ~/.ssh/authorized_keys
```

### Mario: connect from his laptop

Use the **private** key that matches the public key above (replace the path with wherever Mario saved that key file):

```shell
ssh -i /path/to/mario-private-key ubuntu@44.252.95.80
```

Optional port forward for the app in a browser:

```shell
ssh -i /path/to/mario-private-key -L 5000:localhost:5000 ubuntu@44.252.95.80
```

If Mario’s home IP changes (ISP renewal, different network), update the security group SSH rule to his new public IP.

### Megan: connect from her laptop

Same pattern using the **private** key for `my-ec2-key3`:

```shell
ssh -i /path/to/megan-private-key ubuntu@44.252.95.80
```

Optional tunnel:

```shell
ssh -i /path/to/megan-private-key -L 5000:localhost:5000 ubuntu@44.252.95.80
```

When Megan’s routable IP changes, update her SSH inbound rule the same way.

## Static AWS Option

The standalone dungeon frontend can still be hosted on S3 or CloudFront by
uploading the contents of `S3_content/`. The Week 5 grading skeleton, however,
should be run through Flask on EC2 so login, Postgres, `/about`, and `/site/`
are all available in one app.
