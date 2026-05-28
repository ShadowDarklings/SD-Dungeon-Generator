# Charles Role Work — Week 7

## Files touched
- `templates/login.html`
- `templates/register.html`
- `templates/base.html`
- `templates/home.html`
- `static/css/styles.css`

## What I changed
I updated the auth UI so the login page keeps the password form and adds a clear GitHub sign-in entry point, plus a remember-me checkbox for the Flask-Login session lifetime flow. I also changed the shared navbar and home page to use the real authenticated state, so the app now shows `Logged in as <username>` only when the user is actually logged in, and the logout button is wired as a POST form with optional CSRF support when Flask-WTF is present.

## What my browser test should verify
My Playwright test will cover the user-visible auth path from the browser: open the login page, confirm the GitHub button is present, log in through the test-login backdoor, confirm the navbar/home page shows the logged-in username, then log out and confirm the UI returns to the logged-out state.

## Known gap
The GitHub redirect itself is still a backend/OAuth concern. My front-end work is ready for Megan's `/login/github` and `/auth/github/callback` routes, but the browser test will need the test-login backdoor and live-server harness that the team is coordinating separately.
