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

## Static AWS Option

The standalone dungeon frontend can still be hosted on S3 or CloudFront by
uploading the contents of `S3_content/`. The Week 5 grading skeleton, however,
should be run through Flask on EC2 so login, Postgres, `/about`, and `/site/`
are all available in one app.
