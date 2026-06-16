'use strict';
// Route protection middleware.
//
// requirePageAuth  — for HTML page requests: redirect to /login?next=… when
//                    there is no session.
// requireApiAuth   — for JSON/API requests: respond 401 when there is no session.

function isAuthenticated(req) {
  return Boolean(req.session && req.session.userId);
}

function requirePageAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  const next_ = encodeURIComponent(req.originalUrl);
  return res.redirect(`/login/?next=${next_}`);
}

function requireApiAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Sign in required.' });
}

module.exports = { isAuthenticated, requirePageAuth, requireApiAuth };
