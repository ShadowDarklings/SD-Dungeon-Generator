# Week 5 Group Setup Notes

This repo now combines the team's SD Dungeon Generator prototype with the Course 506 Week 5 walking skeleton.

## What We Added

- Added the instructor's Flask app structure in `app.py`.
- Added Docker support with `Dockerfile` and `docker-compose.yml`.
- Added Postgres through Docker Compose.
- Added login, register, logout, session handling, and password hashing.
- Added Bootstrap-rendered Flask templates in `templates/`.
- Enabled the JavaScript double-submit guard in `static/js/forms.js`.
- Moved the dungeon prototype into `S3_content/` so Flask serves it at `/site/`.
- Added the shared eight-section About page in `templates/about.html`.
- Added pytest tests in `tests/`.
- Added a manual GitHub Actions workflow in `.github/workflows/test.yml`.

## Repo Layout

```text
app.py                  Flask routes, auth, SQLModel user table, and /site/ serving
docker-compose.yml      Runs Flask app plus Postgres database
Dockerfile              Builds the Flask container
requirements.txt        Python dependencies
templates/              Flask pages: home, login, register, about, placeholder
static/                 Flask CSS and JS, including the enabled JS sliver
S3_content/             Committed dungeon frontend served at /site/
tests/                  Week 5 auth and route tests
docs/                   Project design notes and state schema
WEEK5_GROUP_SETUP.md    These setup notes
```

## EC2 Setup

SSH into your EC2 instance:

```bash
ssh -i ~/.ssh/your-key.pem ubuntu@<EC2-IP>
```

Install Docker and Docker Compose on Ubuntu:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER
```

Log out and SSH back in so the Docker group change takes effect.

Verify Docker:

```bash
docker --version
docker compose version
```

## Clone And Run

Clone the repo:

```bash
git clone https://github.com/ShadowDarklings/SD-Dungeon-Generator.git
cd SD-Dungeon-Generator
```

Start the app:

```bash
docker compose up -d
```

Check containers:

```bash
docker compose ps
```

Follow Flask logs if needed:

```bash
docker compose logs -f app
```

Stop the app:

```bash
docker compose down
```

## Browser Access From Laptop

From your laptop, open an SSH tunnel:

```bash
ssh -i ~/.ssh/your-key.pem -L 5000:localhost:5000 ubuntu@<EC2-IP>
```

Then open:

```text
http://localhost:5000
```

Use the navbar:

- `Home` is the Flask-rendered landing page.
- `My Site` opens `/site/`, the dungeon frontend.
- `About` opens the shared project spec.
- `Register` and `Log in` exercise the auth flow.

## Verify Login Works

In the browser:

1. Click `Register`.
2. Create a username and password with at least 6 characters.
3. Confirm the navbar says `Hello, <username>`.
4. Click `Log out`.
5. Click `Log in` and use the same credentials.

Verify the database row from EC2:

```bash
docker compose exec db psql -U app -d app -c "SELECT id, username, created_at FROM users;"
```

## Verify The JS Sliver

The double-submit fix is enabled in `static/js/forms.js`.

To verify:

1. Open browser dev tools.
2. Go to the Network tab.
3. Open `/login`.
4. Click the submit button rapidly.
5. The button should disable on submit, preventing duplicate form posts.

## Run Tests

Run the Week 5 tests inside the app container:

```bash
docker compose exec app pytest -v
```

Expected result: all 7 tests pass.

## Updating Your Own Version

Each teammate can use this repo as the shared base, then make their own assignment branch:

```bash
git checkout -b customize/about-and-styling
```

Make any required individual styling changes, run tests, then commit and push:

```bash
git add -A
git commit -m "Customize Week 5 skeleton"
git push -u origin customize/about-and-styling
```

Open a pull request into the default branch and merge it after confirming the app still runs.

## Important Notes

- `S3_content/` is committed on purpose so the group can run `/site/` immediately after cloning.
- If the professor expects each student to sync their own S3 bucket, replace `S3_content/` by running:

```bash
aws s3 sync s3://<your-bucket>/ S3_content/
```

- The S3 bucket URL in `templates/about.html` is inferred. Update it if the final team bucket name or AWS region is different.
- The GitHub Actions workflow is manual-trigger only for Week 5, matching the instructor starter.
