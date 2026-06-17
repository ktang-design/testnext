'use strict';
// StacksNext application server.
// - Serves the static front-end from /src
// - Exposes the auth API under /api/auth
// - Protects the three settings pages behind a session
// - Leaves the component showcase reachable but unlinked (internal reference)

const path = require('path');
const express = require('express');

const { port, isProd } = require('./config');
const sessionMiddleware = require('./auth/session');
const authRoutes = require('./routes/auth');
const { requirePageAuth } = require('./auth/authGuard');
const { seed } = require('./seed');

const SRC_DIR = path.join(__dirname, '..'); // .../src

const app = express();
if (isProd) app.set('trust proxy', 1); // needed for secure cookies behind a proxy
app.disable('x-powered-by');

app.use(express.json({ limit: '10kb' }));

// ---- Health check (public, no session) ------------------------------------
app.get('/healthz', (req, res) => res.json({ ok: true }));

app.use(sessionMiddleware);

// ---- Auth API -------------------------------------------------------------
app.use('/api/auth', authRoutes);

// ---- Site settings API (per-user) -----------------------------------------
app.use('/api/site-settings', require('./routes/settings'));

// ---- Page protection ------------------------------------------------------
// The HTML entry points for these sections require a session. Their CSS/JS/
// assets stay public (harmless), which keeps the pages' relative paths working.
const PROTECTED_SECTIONS = new Set(['/site-details', '/branding', '/access']);

function sectionOf(reqPath) {
  // Normalize "/branding", "/branding/", "/branding/index.html" -> "/branding"
  const noIndex = reqPath.replace(/\/index\.html$/i, '');
  const noTrailing = noIndex.replace(/\/$/, '');
  return noTrailing === '' ? '/' : noTrailing;
}

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (PROTECTED_SECTIONS.has(sectionOf(req.path))) {
    return requirePageAuth(req, res, next);
  }
  return next();
});

// ---- Static front-end -----------------------------------------------------
app.get('/', (req, res) => res.redirect('/site-details/'));
app.use(express.static(SRC_DIR, { extensions: ['html'] }));

// ---- Fallbacks ------------------------------------------------------------
app.use((req, res) => res.status(404).send('Not found'));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error('[server] unhandled error', err);
  res.status(500).send('Server error');
});

seed()
  .then(() => {
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`StacksNext running at http://localhost:${port}`);
      // eslint-disable-next-line no-console
      console.log('Protected: /site-details  /branding  /access   ·   Login: /login');
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[server] failed to seed/start', err);
    process.exit(1);
  });
