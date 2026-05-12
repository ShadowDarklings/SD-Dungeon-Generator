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
2. SSH into EC2 and go to the repo:

```shell
ssh -i ~/.ssh/your-key.pem ubuntu@<EC2-IP>
cd ~/week-5-506
```

3. Pull the latest code from GitHub:

```shell
git pull
```

4. Sync the dungeon frontend from S3 into the tracked `S3_content/` folder:

```shell
aws s3 sync s3://<your-bucket>/ S3_content/
```

5. Restart the stack. Use `--build` if you changed the Dockerfile or Python
dependencies; otherwise the normal restart is enough:

```shell
docker compose up -d
docker compose ps
```

Or rebuild when needed:

```shell
docker compose up -d --build
```

6. From your laptop, open the SSH tunnel:

```shell
ssh -i ~/.ssh/your-key.pem -L 5000:localhost:5000 ubuntu@<EC2-IP>
```

7. Visit `http://localhost:5000` and click **My Site** to confirm the synced
   S3 content is showing.

If you are comparing against the local copy, open `S3_content/index.html` from
this repo in a second tab. In this setup, the deployed app is usually reached
through the SSH tunnel rather than by browsing the public EC2 IP directly.

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

Shared Ubuntu host: `ubuntu@44.252.95.80` (if the instance was stopped and started, confirm the **Public IPv4** in EC2 and update this doc and your local commands).

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
