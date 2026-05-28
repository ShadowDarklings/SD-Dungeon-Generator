# Week 7 Individual Contribution Report — Back-End Auth Engine

**Name:** Megan  
**Role:** Back-End / Infrastructure Integration  

## 1. Concrete Accomplishments
- **Authlib Integration & Engine Wire-up:** Integrated the `authlib.integrations.flask_client` framework cleanly into our `app.py` configuration lifecycle. Successfully wired up the external secrets ingestion using strict dictionary parsing loops (`os.environ["..."]`), ensuring immediate application failure if crucial external OAuth keys are absent at initialization time (§12).
- **Three-Tier Account Link Identity Engine:** Structured the precise decision pipeline within the `/auth/github/callback` routine matching the requirements of `CONTRACTS.md`:
  1. *Direct Identity Check:* Scans for existing linked rows in the `oauth_identities` table structure.
  2. *Email Fallback Hook:* Connects external profiles with established local credentials if verified email indicators match (§2, §8).
  3. *Auto-Provisioning Sequence:* Generates brand-new local database `User` records with a unique string fallback protocol to eliminate naming overlaps.
- **Manual Password Interception Logic:** Modified the legacy `/login` routing handler to explicitly capture and reject attempts to use manual forms on passwordless accounts, issuing the mandated flash indicator: `"This account uses GitHub login."` (§1)
- **Automated QA Bypass Sandbox Path:** Developed the production backdoor route `/test/login/<username>` specifically isolated behind strict `TESTING=True` structural guards. This safely permits programmatic user authorization inside CI/CD frameworks without exposing authentication surfaces in production pipelines (§2, §4).
- **End-to-End Automation Assertions:** Wrote `tests/e2e/test_server_login.py` utilizing the Playwright library engine to confirm our backdoor interface maps contexts properly and issues working session tracking flags.

## 2. Rationales and Engineering Trade-Offs
- **Explicit Dictionary Lookups over `.get()` Methods:** When reading configurations from environment run scripts, using `os.environ["KEY"]` was selected over `os.environ.get("KEY")`. This forces an explicit runtime crash immediately at startup if credentials are dead or missing, rather than allowing runtime failures deep inside third-party oauth libraries hours later.
- **Security-First Playwright Backdoor Isolation:** While building the automation backdoor `/test/login/<username>`, we traded away simplicity for airtight environment safety by wrapping the route in an immediate configuration block check (`if not app.config.get("TESTING"): abort(404)`). This absolute guard ensures that even if this route configuration is deployed onto production systems, the endpoint returns an inert `404 Not Found` response unless `TESTING` flag signatures are globally active.