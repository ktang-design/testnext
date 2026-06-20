# StacksNext

A small settings product (Site details / Branding / Access) implemented as
vanilla HTML/CSS/JS pages, served by a Node + Express backend that adds
email/password authentication with httpOnly session cookies and protects the
settings pages.

## Project structure

```
src/
  server/                 # Express backend
    index.js              # app: static serving, page protection, wiring
    config.js             # env-driven config (secrets, lockout policy, seed user)
    seed.js               # seeds a demo user for local dev
    db/database.js        # node:sqlite connection + schema (users, sessions, site_settings)
    routes/auth.js        # POST /api/auth/register | /login | /logout, GET /me
    routes/settings.js    # GET/PUT /api/site-settings (per-user Site details)
    settings/
      defaults.js               # factory Site-details defaults (reset target)
      SiteSettingsRepository.js  # per-user persistence (node:sqlite)
    auth/
      UserRepository.js       # in-memory reference impl + repo interface contract
      SqliteUserRepository.js # persistent impl (node:sqlite) — the active one
      repository.js           # selects the active repository (one-line swap)
      SqliteSessionStore.js   # persistent express-session store (node:sqlite)
      authService.js          # login + register + account lockout (no HTTP/storage deps)
      validators.js           # email / password / name validation
      passwords.js            # bcrypt hash/verify (+ constant-time dummy compare)
      session.js              # express-session config (httpOnly, sameSite, secure)
      authGuard.js            # requirePageAuth / requireApiAuth middleware
  login/                  # public login page (form + error states)
  signup/                 # public sign-up page (registration + validation)
  site-details/  branding/  access/   # protected settings pages
  shared/auth-client.js   # user-menu "Sign out" on protected pages
  components/navigation/  # INTERNAL design-system showcase (not linked in product)
data/stacksnext.db        # SQLite database (created at runtime; gitignored)
```

## Run it

Requires **Node 22+** (uses the built-in `node:sqlite` module — no native
database dependency to compile).

```bash
npm install
# optional but recommended:
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# paste the output as SESSION_SECRET in .env, then:
npm start
```

Open <http://localhost:3000>. You'll be redirected to **/login**.

- Demo account (seeded on first run): `demo@stacksnext.com` / `Password123!`
- Or create your own at **/signup**.

Users and sessions persist in `data/stacksnext.db`, so accounts and logins
survive restarts. Delete that file to reset.

## Accounts (sign-up)

- `/signup` registers a new account (name + email + password), then auto-logs in.
- Password policy: at least 8 characters, including a letter and a number
  (enforced server-side in `auth/validators.js`; mirrored client-side).
- Emails are unique; duplicates return `409 EMAIL_TAKEN`.

## How protection works

- The three settings sections (`/site-details`, `/branding`, `/access`) require a
  session. Unauthenticated requests are redirected to `/login?next=…`.
- Login verifies credentials server-side (bcrypt), then issues a fresh session
  (`req.session.regenerate`) to prevent session fixation. The session id lives in
  an **httpOnly** cookie, so it isn't readable by page JavaScript.
- Sign out (`POST /api/auth/logout`) destroys the session and clears the cookie.
- The component showcase under `src/components/navigation/` is an internal
  reference: it isn't linked from the product and isn't part of the protected app.

## Error states handled

- Empty fields — inline field validation (client).
- Invalid email or password — generic message (no user enumeration).
- Account locked after 5 failed attempts (15 min) — `423` with retry guidance.
- Sign-up: invalid email (`400`), weak password (`400`), email already taken (`409`).
- Too many requests (per-IP throttle) — `429`.
- Network / server unreachable — friendly fallback message.

## Swapping the data store

`authService` depends only on the `UserRepository` interface
(`findByEmail`, `findById`, `create`, `update` — all async). The active
implementation is chosen in `auth/repository.js`; today it's
`SqliteUserRepository` (node:sqlite). To move to Postgres/Mongo, implement the
same four methods and swap that one line — no auth logic changes. An in-memory
reference implementation remains in `UserRepository.js` for tests.

## Database

Data lives in a **libSQL** database via [`@libsql/client`](https://github.com/tursodatabase/libsql-client-ts)
(`src/server/db/database.js`). The connection comes from `TURSO_DATABASE_URL`:

- **Local dev:** a file URL — `TURSO_DATABASE_URL=file:./data/dev.db` (the default).
  Persists to disk; survives restarts.
- **Production:** a remote [Turso](https://turso.tech) database —
  `TURSO_DATABASE_URL=libsql://<db>.turso.io` plus `TURSO_AUTH_TOKEN`.

Same async code path either way. Repositories use the `get/all/run/batch`
helpers; the schema is created on first request (a memoized migration). Sessions
are stored in the DB too, so logins persist across restarts/deploys.

## Production notes

- Set `NODE_ENV=production` and a strong `SESSION_SECRET` (the app refuses to
  start in prod without one). `secure` cookies turn on automatically.
- Serve behind HTTPS; `trust proxy` is enabled in production for correct
  secure-cookie handling behind a load balancer.

## Deploy to Vercel (free) — accounts persist + custom domain

The app runs as a single serverless function: `api/index.js` exports the Express
app and [`vercel.json`](vercel.json) rewrites every request to it (so the page
guard and static serving keep working). Accounts persist because data lives in a
managed **Turso** database, not on the ephemeral filesystem.

1. **Create a free Turso DB** ([turso.tech](https://turso.tech), or the CLI):
   ```sh
   turso db create stacksnext
   turso db show stacksnext --url           # -> libsql://stacksnext-<org>.turso.io
   turso db tokens create stacksnext        # -> auth token
   ```
2. **Push to GitHub**, then in Vercel: **New Project → import the repo** (no build
   command needed — it's a serverless function + static files).
3. **Set env vars** (Vercel → Project → Settings → Environment Variables):
   - `TURSO_DATABASE_URL` = the `libsql://…` URL
   - `TURSO_AUTH_TOKEN` = the token
   - `SESSION_SECRET` = a long random string
     (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - `NODE_ENV` = `production`
   - `SEED_DEMO_USER` = `true` only if you want the demo login seeded
4. **Deploy.** The schema is created automatically on the first request. Create
   accounts via `/signup`; they persist across redeploys.
5. **Custom domain:** Vercel → Project → **Domains → Add** `yourdomain.com`, then
   create the DNS record Vercel shows. TLS is automatic and free on Hobby.

Notes:
- Vercel caps a function's request body at ~4.5 MB, so logo uploads are limited
  to 3 MB (favicon 1 MB).
- `node:sqlite` is no longer used, so the app runs on Node 18+ (Vercel's default).
- `render.yaml` is kept as an alternative host; it is not needed for Vercel.

## Deploy a UAT environment on Render

Config lives in [`render.yaml`](render.yaml). It currently targets the **free
plan** (no card required), so the SQLite database is **ephemeral** — it resets on
each deploy and when the free service sleeps. The demo account is seeded
(`SEED_DEMO_USER=true`) so there's always a login after a reset.

To make accounts **persist**, switch to a paid instance: set `plan: starter` and
add a disk, then point the DB at it:

```yaml
    plan: starter
    envVars:
      - key: DATABASE_FILE
        value: /data/stacksnext.db
      # remove SEED_DEMO_USER for a private UAT
    disk:
      name: sn-data
      mountPath: /data
      sizeGB: 1
```

1. **Push to GitHub** (Render deploys from a repo).
2. In Render: **New → Blueprint**, connect the repo. Render reads `render.yaml`
   and provisions a web service + a 1 GB disk mounted at `/data`, sets
   `NODE_ENV=production` and `DATABASE_FILE=/data/stacksnext.db`, and generates
   `SESSION_SECRET` for you.
3. **Deploy.** Health checks hit `/healthz`. On first boot the database is created
   on the disk. The public demo account is **not** seeded in production — create
   accounts via `/signup` (or set `SEED_DEMO_USER=true` to seed it).
4. **Custom domain:** service **Settings → Custom Domains → Add**
   `uat.yourdomain.com`. Create the **CNAME** it shows you at your DNS provider.
   Render issues a TLS certificate automatically once DNS resolves.
5. Visit `https://uat.yourdomain.com` → you're redirected to `/login`; sign up to
   get in.

Notes:
- The app uses libSQL (`@libsql/client`), so on Render point `TURSO_DATABASE_URL`
  at a disk file (`file:/data/stacksnext.db`) or a remote Turso URL instead of the
  old `DATABASE_FILE`. Runs on Node 18+.
- The component showcase ships in the build but stays unlinked/internal.
