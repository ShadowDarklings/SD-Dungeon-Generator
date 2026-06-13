# Deployment Guide — SD Dungeon Generator

**Status (2026-06-12):** ✅ **Deployed.** Live at **<https://44-252-95-80.sslip.io>**
with a Let's Encrypt certificate (sslip.io hostname → Elastic IP). Parts 1–4
below document how it was built and how to rebuild it from scratch; Part 6
covers day-to-day operations until grading. The earlier verification instance
(`54.191.130.99`, `EC2_VERIFICATION_WALKTHROUGH.md`) is superseded.

---

## Part 0 — Hosting choice

The assignment requires the Week 8 stack (nginx + gunicorn + Flask + Postgres,
containerized) reachable at a live URL. That means you need a VM you control —
PaaS hosts (Render, Railway, Heroku) run their own proxy layer and won't let
you ship your own nginx container meaningfully.

| Host | Fit | Notes |
|---|---|---|
| **AWS EC2 (recommended — and already in use)** | Course standard | Pairs with the team's existing S3 bucket. Accounts created **on/after July 15, 2025** get $100 in credits (plus up to $100 more for onboarding tasks) and free-plan eligibility for t3.micro/t3.small and others; **older accounts** get the legacy 750 hrs/month of t2.micro/t3.micro for 12 months. |
| AWS Lightsail | Good simpler alternative | Fixed monthly price, bundled static IP, same AWS account. Less to configure, less to learn. |
| DigitalOcean / Hetzner droplet | Fine | Cheap, simple VMs; same Docker steps apply verbatim. No S3 adjacency. |

Stay on EC2 — it's working, it's the course default, and the remaining work is
DNS + certs, not migration.

---

## Part 1 — EC2 instance configuration (from scratch / reference)

What the existing instance should look like; use this to rebuild or audit.

1. **Region:** `us-west-2` (same as the S3 bucket — keeps table fetches fast).
2. **AMI:** Ubuntu Server 24.04 LTS (x86_64).
3. **Instance type:** `t3.small` (2 vCPU / 2 GB). `t3.micro` (1 GB) can work but
   is tight: gunicorn spawns `2×CPU+1` workers plus Postgres. If you must use
   1 GB, add swap (step 8) and cap workers (`workers = 3` in `gunicorn.conf.py`).
4. **Storage:** 20 GB gp3 (images + pgdata + logs; 8 GB default fills up fast
   with Docker layers).
5. **Key pair:** ED25519, one per teammate who needs SSH. Never share `.pem`s.
6. **Security group** (this is the whole firewall — keep it minimal):

   | Port | Source | Why |
   |---|---|---|
   | 22 | *your IPs only* (not 0.0.0.0/0) | SSH |
   | 80 | 0.0.0.0/0, ::/0 | HTTP→HTTPS redirect + ACME challenge |
   | 443 | 0.0.0.0/0, ::/0 | The app |

   Nothing else. No 5000, no 5432 — Postgres isn't host-exposed anyway
   (CONTRACTS.md §15.8), and the grader connects via 443 only.
7. **Elastic IP:** allocate one and associate it with the instance.
   ⚠️ **Do this even on the existing instance if you haven't** — without it, a
   stop/start changes the public IP, which breaks your DNS record and the
   submitted URL. (Associated Elastic IPs on running instances cost nothing.)
8. **First boot setup:**

   ```shell
   sudo apt update && sudo apt install -y docker.io docker-compose-v2
   sudo usermod -aG docker ubuntu     # log out / back in afterwards
   # Swap (essential on t3.micro, harmless on t3.small):
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
   sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```

---

## Part 2 — App deployment (from scratch / reference)

```shell
git clone https://github.com/ShadowDarklings/SD-Dungeon-Generator.git
cd SD-Dungeon-Generator
cp .env.example .env && nano .env   # real SECRET_KEY, OAuth creds; no dev flags
mkdir -p nginx/certs                # temporary self-signed until Part 4:
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout nginx/certs/key.pem -out nginx/certs/cert.pem \
  -days 365 -subj "/CN=localhost"
docker compose up --build -d
docker compose ps                   # expect nginx, app, db all Up
```

Never set `ALLOW_ANON_SHADOWDARKLINGS_IMPORT` or
`SHADOWDARKLINGS_IMPORT_ENABLED` on this box (SECURITY_ASSESSMENT.md §4a).

---

## Part 3 — Domain + DNS  ← *you are here*

Two good options:

**Option A — DuckDNS (free, 10 minutes, recommended for the deadline).**
1. Sign in at duckdns.org (GitHub login works), claim a subdomain, e.g.
   `shadowdarklings.duckdns.org`.
2. Point it at your Elastic IP in the DuckDNS dashboard (it's one field).
3. Done — verify with `dig +short shadowdarklings.duckdns.org`.

**Option B — Real domain (~$10/yr, nicer for a portfolio).**
1. Buy a domain at Porkbun / Namecheap / Cloudflare Registrar.
2. Create an **A record**: `@` (or `app`) → your Elastic IP, TTL 300.
3. Wait for propagation (`dig +short yourdomain.tld`), usually minutes.

Either way, the domain is what goes in the Canvas submission — graders should
never have to type an IP or click through a cert warning.

---

## Part 4 — Real TLS with Let's Encrypt

The stack mounts certs from `./nginx/certs` (`cert.pem` + `key.pem`), so we
issue with certbot and drop the files in the same place. Standalone mode is the
simplest fit (needs port 80 for ~10 seconds while nginx is stopped):

```shell
cd ~/SD-Dungeon-Generator
export DOMAIN=shadowdarklings.duckdns.org   # ← your domain

# 1. Stop nginx so certbot can bind port 80
docker compose stop nginx

# 2. Issue the certificate (certbot via Docker — nothing to install)
docker run --rm -p 80:80 \
  -v ~/letsencrypt:/etc/letsencrypt \
  certbot/certbot certonly --standalone \
  -d "$DOMAIN" --agree-tos -m mrdgx42@icloud.com --no-eff-email

# 3. Install where the stack expects them
sudo cp ~/letsencrypt/live/$DOMAIN/fullchain.pem nginx/certs/cert.pem
sudo cp ~/letsencrypt/live/$DOMAIN/privkey.pem  nginx/certs/key.pem

# 4. Set the real hostname in nginx (closes the Host-header nit in
#    SECURITY_ASSESSMENT.md §4.3): in nginx/nginx.conf replace BOTH
#    `server_name localhost;` lines with `server_name $DOMAIN;`
sed -i "s/server_name localhost;/server_name $DOMAIN;/g" nginx/nginx.conf

# 5. Restart
docker compose up -d nginx
curl -I https://$DOMAIN        # expect 200/301 with a valid cert, no -k flag
```

**Renewal** (Let's Encrypt certs last 90 days — set this up now, not in 89 days):

```shell
crontab -e
# Renew Mondays 04:17; on success, refresh the mounted certs and reload nginx
17 4 * * 1 cd $HOME/SD-Dungeon-Generator && docker compose stop nginx && docker run --rm -p 80:80 -v $HOME/letsencrypt:/etc/letsencrypt certbot/certbot renew -q && sudo cp $HOME/letsencrypt/live/<DOMAIN>/fullchain.pem nginx/certs/cert.pem && sudo cp $HOME/letsencrypt/live/<DOMAIN>/privkey.pem nginx/certs/key.pem && docker compose up -d nginx
```

**Don't forget the OAuth callback:** in the GitHub OAuth app settings
(github.com/settings/developers), set the callback to
`https://<DOMAIN>/auth/github/callback` — GitHub login will fail against the
new hostname until you do. Update the homepage URL while you're there.

---

## Part 5 — Final verification & submission

1. Run `docs/VERIFICATION_RUNBOOK.md` §7 against `https://<DOMAIN>` (attack
   paths, browser checks, multiplayer smoke — re-test OAuth specifically).
2. Update `README.md`: keep the Live URL current (done for `44-252-95-80.sslip.io`).
3. Commit the `nginx.conf` server_name change + README; push; redeploy
   (`git pull --ff-only && docker compose up -d --build` on the box).
4. Canvas: submit the live URL + repo link; confirm the instructor has repo
   access and PR history is visible.

## Part 6 — Operations until grading day

- **Update workflow:** `git pull --ff-only && docker compose up -d --build` (state survives — pgdata
  is a named volume). Then verify with `docker compose ps`,
  `docker compose logs --tail=50 app`, and `curl -k https://<DOMAIN>/healthz`.
- **Backup before risky changes:**
  `docker compose exec db pg_dump -U app app > backup_$(date +%F).sql`
- **Logs:** `docker compose logs -f app` / `nginx`.
- **Rollback:** `git checkout <last-good-sha> && docker compose up --build -d`.
- Leave the instance running through grading — a stopped instance with no
  Elastic IP changes address, and either way a down URL can't be graded.
