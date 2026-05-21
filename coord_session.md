# Coordinator LLM Session — Week 6 Contract Drafting

**Date:** May 17, 2026  
**Coordinator:** Charles (ctr37@uw.edu)  
**LLM:** Claude Sonnet  
**Team:** ShadowDarklings (Charles — coordinator + client-side, Megan — server-side, Mario — DB & security)

---

## Context going in

We have the SD Dungeon Generator from Week 5: a Flask skeleton with a
`users` table, raw `session["user_id"]` auth, and a procedural dungeon
generator served as static HTML/JS from `S3_content/`. The generator
already tracks internal state (tiles, rooms, halls, entities, player
position, fog of war, loot log) — documented in `docs/STATE_SCHEMA.md`.

This session's goal: draft CONTRACTS.md and identify the four test files
before anyone starts coding.

---

## Transcript

**Charles:** We need to design the Week 6 contracts for our dungeon
generator. The main feature is saved dungeon runs — users should be able
to save a generated dungeon mid-play and reload it later. I've been
looking at the Brew Crew example and I'm not sure how to structure the
database side. Our dungeon state is a big nested JS object with tiles,
rooms, halls, entities, player position, visibility sets, and a loot
log. Should we just store the whole thing as a JSON blob?

**LLM:** A single JSON column is the simplest approach and it would work
for save/restore — your client just sends the full state object on save
and gets it back on load. But there's a tradeoff worth thinking about.
If you ever want to query across saves (for example, "show me all runs
where the player reached level 5" or "how many monsters were defeated
across all runs"), a single JSON blob makes that very hard — you'd need
to parse JSON in SQL or pull everything into Python.

A common pattern for game state is dual storage: keep the full JSON blob
for fast save/restore (the client doesn't need to reconstruct anything),
but also write the key entities into relational tables so they're
queryable. The JSON blob is the source of truth for loading; the
relational tables are for inspection and analytics.

**Charles:** That's interesting. How many tables are we talking about? I
don't want to over-engineer this for a class project.

**LLM:** Looking at your STATE_SCHEMA.md, I'd suggest these new tables
alongside the existing `users` table:

1. `saved_runs` — parent record with seed, level, the JSON blob, and timestamps
2. `tiles` — one row per grid cell (x, y, type, which room/hall it belongs to)
3. `rooms` — room metadata (position, dimensions, discovered/explored flags)
4. `halls` — hall connections between rooms
5. `entities` — monsters, traps, treasures, features (with state flags like defeated, collected)
6. `loot_entries` — the player's loot log

That's 7 tables total. Each of tables 2-6 would have a foreign key back
to `saved_runs`. The tile table will be the largest — a typical dungeon
might have a few hundred tiles — but that's fine for Postgres.

**Charles:** Seven tables feels like a lot. Let me ask — do we actually
need the `halls` table? Halls are basically just connections between
rooms, and we could reconstruct them from the tile data.

**LLM:** You could skip halls, but then you'd lose the explicit
from-room/to-room connection data. If your client ever needs to know
"which rooms are connected" without scanning every tile, the halls table
gives you that in one query. It's also only a few rows per save — maybe
5-10 halls per dungeon. I'd keep it for completeness, but it's your call.

**Charles:** Fair enough, let's keep it. What about constraints? I know
we need foreign keys but I'm not sure what else.

**LLM:** Good question — this is where database-level integrity really
matters. A few things I'd recommend:

First, all the child table foreign keys should use `ON DELETE CASCADE`.
Without that, if a user deletes a saved run, you'd either get an
integrity error (Postgres blocks the delete because child rows still
reference it) or you'd need application code to manually delete every
child table's rows first. CASCADE makes the database handle it
automatically.

Second, you'll want unique constraints to prevent duplicate rows. For
tiles, a `UNIQUE(saved_run_id, x, y)` constraint ensures you can't
accidentally save two tiles at the same grid position in the same run.
Similar constraints for rooms (`saved_run_id, room_key`), halls
(`saved_run_id, hall_key`), and entities (`saved_run_id, entity_key`).

Third, for the `saved_runs` table, since Shadowdark dungeons go from
level 1 to 10, a `CHECK (level BETWEEN 1 AND 10)` constraint catches
invalid data at the database level rather than relying on application
validation alone.

**Charles:** I didn't think about the CASCADE thing — that would have
been a nasty bug to discover at integration time. Let me write these
down.

What about authentication? We're currently using raw
`session["user_id"]` checks. The assignment says the DB & security role
should handle Flask-Login.

**LLM:** Right. Flask-Login gives you several things over raw session
checks:

- A `@login_required` decorator so you don't write `if not
  session.get("user_id")` on every route
- A `current_user` proxy that gives you the actual User object, not just
  an ID
- Proper session cookie management with security defaults
- A `user_loader` callback that centralizes how users are looked up

The main work for your DB & security person is: install Flask-Login, set
up the `LoginManager` in app.py, write the user loader callback, make
the User model inherit from `UserMixin`, and then replace all the raw
session checks with `@login_required` and `current_user`.

One thing to decide: what should happen when an unauthenticated user
hits an API endpoint? Flask-Login's default behavior is to redirect to
the login page, which makes sense for HTML pages but is wrong for JSON
API endpoints — the client-side JS would get a redirect instead of a
clean error.

**Charles:** Oh, I hadn't thought about that. What's the right approach?

**LLM:** You can set a custom `unauthorized` handler on the
LoginManager. For API routes (anything under `/api/`), return a 401 JSON
response. For page routes like `/runs`, the redirect to login is fine.
A common pattern is checking whether the request path starts with
`/api/` in the unauthorized handler.

**Charles:** That makes sense. Let me ping Mario about this since he's
the one implementing Flask-Login.

*(Messaged Mario on Discord: "For Flask-Login, the LLM suggests we need
a custom unauthorized handler that returns 401 JSON for /api/ routes
instead of redirecting. Does that work for you? Also — the LLM is
recommending ON DELETE CASCADE on all child table FKs. Any concerns?")*

*(Mario replied: "401 for API routes makes sense, I was planning on
that. CASCADE is the right call — I'll also make sure the check
constraint on level is enforced at the DB level, not just in Python.
One thing: make sure the contract specifies that the User model needs
to inherit from UserMixin. I need that for Flask-Login's is_authenticated
and get_id methods.")*

**Charles:** Mario's on board. He confirmed CASCADE and the 401 handler.
He also wants the contract to explicitly require `UserMixin` inheritance
on the User model. Let's add that.

Now, endpoints. I'm thinking we need basic CRUD for saved runs:

- `POST /api/runs` — save a new run
- `GET /api/runs/<id>` — load a run
- `PUT /api/runs/<id>` — update a run (when the player explores more)
- `DELETE /api/runs/<id>` — delete a run
- `GET /runs` — HTML page listing saved runs (a dashboard)

What about listing runs as JSON? Should `/api/runs` with GET return a
JSON list?

**LLM:** Yes, I'd add `GET /api/runs` as a JSON endpoint separate from
`GET /runs` (the HTML page). Your client-side JS will need a way to
fetch the list of saved runs for the sidebar panel without loading a
full HTML page. The JSON endpoint returns run metadata (id, seed, level,
timestamps) but not the full `state_json` — that's potentially large and
you only need it when actually loading a specific run.

For the response shapes, I'd suggest a consistent envelope. For list
endpoints:
```json
{"results": [...], "error": null}
```
For single-resource endpoints, return the object directly with its
fields. For errors, always use:
```json
{"error": "machine_readable_code", "message": "Human-readable text."}
```

**Charles:** I like the envelope pattern. What error codes should we
define for the runs endpoints?

**LLM:** For `POST /api/runs`:
- 400 `invalid_json` — malformed or missing JSON body
- 400 `invalid_level` — level outside 1-10
- 400 `invalid_state` — state_json doesn't match expected shape
- 401 `login_required` — not authenticated

For `GET/PUT/DELETE /api/runs/<id>`:
- 401 `login_required`
- 404 `not_found` — run doesn't exist or doesn't belong to this user

That last point is important — you should return 404, not 403, when a
user tries to access another user's run. If you return 403 for
"not yours" and 404 for "doesn't exist," an attacker can enumerate which
run IDs exist by checking which ones return 403 vs 404. This is an OWASP
A01 (Broken Object Level Authorization) issue. Returning 404 in both
cases prevents that information leak.

**Charles:** Wait, why would an attacker care about enumerating run IDs?

**LLM:** In this specific app, the risk is relatively low since run IDs
are just auto-incrementing integers for dungeon saves. But the principle
matters: if you train yourself to return 403 for "not authorized," you
develop a habit that becomes dangerous in apps where knowing a resource
exists reveals sensitive information (medical records, financial data,
private documents). The 404-for-not-yours pattern costs nothing to
implement and prevents the entire class of enumeration attacks.

**Charles:** That's a good point — and the assignment instructions
explicitly mention the OWASP 404-for-not-yours rule, so we should
definitely follow it. I'll make sure the contract specifies 404 for all
ownership violations.

Now for the external API part. The assignment requires at least one route
that uses the `requests` library to call an external service. Our
dungeon generator loads monster and trap tables from JSON files. I
already have those hosted on my S3 static website:
`http://charlesreeder-506-hw1.s3-website-us-west-2.amazonaws.com`.

Should the browser fetch those directly, or should we proxy through
Flask?

**LLM:** Both approaches work for gameplay, but a server-side proxy
gives you two advantages:

First, your CI tests can mock the external call using the `responses`
library. If your browser fetches S3 directly, your tests can't intercept
that — they'd depend on S3 being up during every test run.

Second, you get a single place to handle failure modes. If S3 times out,
returns garbled data, or rate-limits you, the proxy route can translate
those into clean JSON error responses that your client can handle
gracefully. Without the proxy, your browser JS has to handle all those
edge cases.

I'd suggest implementing `GET /api/random-tables` as the proxy. It takes
`type` (monsters or traps) and `level` (required for monsters), fetches
the corresponding S3 file, and returns the results.

**Charles:** That works. For gameplay, my JS can still load the files
directly from `/site/` (they're served locally too), but the proxy
gives us the external-world verification the assignment wants.

What failure modes should we contract for?

**LLM:** Three main ones:

1. **Timeout** — the S3 request takes too long. Return 503 with
   `"error": "timeout"`. You should set a reasonable timeout on the
   `requests.get()` call, maybe 5 seconds.

2. **Rate limiting** — S3 can throttle under heavy load or free-tier
   limits. If you get a 429 response (or any AWS throttling indicator),
   return 503 with `"error": "rate_limited"`.

3. **Malformed response** — S3 returns something that isn't valid JSON
   or isn't the expected array shape. Return 503 with
   `"error": "upstream_invalid"`.

In all three cases, include `"results": []` so the client always gets a
predictable shape.

**Charles:** Makes sense. Let me check with Megan since she's building
the route handlers.

*(Messaged Megan on Discord: "For the /api/random-tables proxy, the plan
is: your route fetches from my S3 URL, handles timeout/rate-limit/
malformed JSON, returns 503 with error codes. The S3 URLs are:
monsters-1.json for level 1, monsters-2.json for levels 2-10,
traps.json for traps. Sound good?")*

*(Megan replied: "Looks good. Quick question — should level be required
for traps too, or just for monsters?" )*

**Charles:** Megan asks whether `level` should be required for traps.

**LLM:** Since you only have one trap table (`traps.json`) that's used
for all levels, `level` should only be required when `type=monsters`.
For `type=traps`, the level parameter can be ignored or omitted.

*(Relayed to Megan: "Level is only required for monsters. For traps just
ignore the level param.")*

*(Megan: "Got it. I'll validate type is either 'monsters' or 'traps' and
return 400 invalid_table for anything else.")*

**Charles:** Megan will add input validation — 400 `invalid_table` if
type isn't monsters or traps, 400 `invalid_level` if level is missing or
out of range for monsters. Good catch from her.

Let me also define the authorization matrix clearly so there's no
ambiguity. The dungeon generator at `/site/` is public — anyone can
play, logged in or not. But saving, loading, and managing runs requires
login. And the random tables proxy is public since the S3 data is public
anyway.

**LLM:** Here's how I'd lay out the authorization table:

| Resource | Anonymous | Owner | Non-owner |
|----------|-----------|-------|-----------|
| `/site/` | Play allowed | Play allowed | Play allowed |
| `GET /runs` | Redirect to login | List own runs | List own runs only |
| CRUD `/api/runs/...` | 401 | Full access to own | 404 (BOLA rule) |
| `GET /api/random-tables` | Allowed | Allowed | Allowed |

**Charles:** That's clean. One more thing — role boundaries. I want to
make sure nobody steps on each other's code. I own the frontend JS and
HTML in `S3_content/`. Megan owns the Flask route handlers. Mario owns
the SQLModel models and Flask-Login setup. Nobody touches each other's
files without talking about it first.

**LLM:** That's a good boundary. I'd also suggest being explicit about
what each role does *not* touch. For example, Megan shouldn't modify the
SQLModel schema definitions — she consumes Mario's models but doesn't
change them. Mario shouldn't modify route response shapes — he enforces
auth but the response format is Megan's domain. And you shouldn't touch
the auth logic or DB models from the frontend.

You should also include a "known limitations" section in CONTRACTS.md.
What's explicitly out of scope for Week 6?

**Charles:** Good call. Out of scope: multi-character support (one
player per run), full Shadowdark combat rules, torch timer mechanics,
animations, save conflict resolution (last write wins), pagination
beyond a simple `limit` parameter, and CSRF protection (that's Week 7
per the forward-pointer in the assignment).

Also, we only have two monster table files right now. Levels 2-10 all
map to `monsters-2.json`. We'll expand this later but it's fine for
Week 6.

**LLM:** All reasonable scope decisions. Make sure these are documented
in CONTRACTS.md so the instructor knows they're deliberate choices, not
oversights.

One last thing: the assignment requires four test files, one per role,
all initially failing. Based on your contract:

- **Frontend test**: verify that `/site/` has save/load button elements
  and a saved-runs panel container — assert on selectors, not text copy
- **Backend test**: verify `POST /api/runs` returns 201 with the
  contracted response shape
- **Backend test**: verify the random-tables proxy handles timeout and
  malformed JSON correctly (using `responses` library to mock S3)
- **DB & security test**: verify the schema (all 7 tables, constraints,
  FKs) and Flask-Login integration

**Charles:** That gives us good coverage. I'll also want an ownership
test — verifying the 404-for-not-yours rule — but I can add that as a
fifth test outside the official four, or Mario can include it in his
security test file.

**LLM:** I'd suggest giving the ownership test its own file. Schema
verification and ownership verification are testing different things,
and keeping them separate makes it easier to debug failures. Mario would
own both files.

**Charles:** Makes sense. I'll commit the four official test files in the
contracts PR, and Mario can add the ownership test file in his
implementation PR.

Alright, I think we have everything we need for CONTRACTS.md. Let me
write it up.

---

*End of session. Charles drafted CONTRACTS.md from this session's
decisions and committed it with the four test files and this transcript
in PR "Week 6 contracts."*
