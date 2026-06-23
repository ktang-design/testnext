'use strict';
// StacksNext Express app (exported, no app.listen). Used by:
//   - src/server/index.js   (local: requires this, then listens)
//   - api/index.js          (Vercel: exports this as the serverless handler)
//
// On serverless there is no "boot" step, so an init gate runs the (memoized)
// schema migration + optional demo seed once per cold start before any request
// touches the database.

const path = require('path');
const express = require('express');

const { isProd } = require('./config');
const { ready } = require('./db/database');
const { seed } = require('./seed');
const sessionMiddleware = require('./auth/session');
const authRoutes = require('./routes/auth');
const { requirePageAuth } = require('./auth/authGuard');

const SRC_DIR = path.join(__dirname, '..'); // .../src

const app = express();
if (isProd) app.set('trust proxy', 1); // needed for secure cookies behind a proxy
app.disable('x-powered-by');

// ---- Health check (public, no DB/session) ---------------------------------
app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---- Init gate: ensure schema (+ demo seed) before anything hits the DB ----
let initPromise = null;
function init() {
  if (!initPromise) {
    initPromise = ready.then(() => seed()).catch((err) => { initPromise = null; throw err; });
  }
  return initPromise;
}
app.use((req, res, next) => { init().then(() => next()).catch(next); });

app.use(sessionMiddleware);

// Body parsers are applied per-router: small for auth/settings, large for
// branding (logo data URLs). Kept under Vercel's ~4.5 MB request body limit.
const jsonSmall = express.json({ limit: '10kb' });
const jsonLarge = express.json({ limit: '4mb' });

// ---- Auth API -------------------------------------------------------------
app.use('/api/auth', jsonSmall, authRoutes);

// ---- Settings APIs (per-user) ---------------------------------------------
app.use('/api/site-settings', jsonSmall, require('./routes/settings'));
app.use('/api/branding', jsonLarge, require('./routes/branding'));
// Website branding carries a logo data URL → large parser; mount the specific
// paths before the general /api/website router so they take precedence.
app.use('/api/website/branding', jsonLarge, require('./routes/website-branding'));
// Search carries a background image data URL → large parser; mount before the
// general /api/website router so it takes precedence.
app.use('/api/website/search', jsonLarge, require('./routes/search'));
app.use('/api/website/pages', jsonSmall, require('./routes/pages'));
app.use('/api/website', jsonSmall, require('./routes/website'));

// ---- Page protection ------------------------------------------------------
// The HTML entry points for these sections require a session. Their CSS/JS/
// assets stay public (harmless), which keeps the pages' relative paths working.
const PROTECTED_SECTIONS = new Set([
  '/site-details', '/branding', '/access',
  '/website/pages', '/website/navigation', '/website/header', '/website/footer', '/website/typography', '/website/branding', '/website/search',
]);

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

module.exports = app;
