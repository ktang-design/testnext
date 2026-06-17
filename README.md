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

## Production notes

- Set `NODE_ENV=production` and a strong `SESSION_SECRET` (the app refuses to
  start in prod without one). `secure` cookies turn on automatically.
- The SQLite store is fine for single-node deployments. For multi-node, move to
  a networked database and a shared session store (e.g. `connect-redis`).
- Serve behind HTTPS; `trust proxy` is enabled in production for correct
  secure-cookie handling behind a load balancer.

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
- Node is pinned to 24 (`NODE_VERSION` in `render.yaml` + `.node-version`) because
  `node:sqlite` is unflagged from Node 24.
- The component showcase ships in the build but stays unlinked/internal.
- SQLite on a single disk fits UAT well. For a high-traffic production tier you'd
  move to Postgres (swap `auth/repository.js`) + a managed session store.
