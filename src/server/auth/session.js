'use strict';
// express-session configuration. Sessions are stored in the database (libSQL/
// Turso) so they persist across restarts and deploys on serverless.

const session = require('express-session');
const { sessionSecret, sessionMaxAgeMs, isProd } = require('../config');
const { SqliteSessionStore } = require('./SqliteSessionStore');

module.exports = session({
  name: 'sn.sid',
  store: new SqliteSessionStore(),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true, // refresh cookie maxAge on activity
  cookie: {
    httpOnly: true, // not readable by JS — mitigates XSS token theft
    sameSite: 'lax', // mitigates CSRF for top-level navigations
    secure: isProd, // HTTPS-only in production
    maxAge: sessionMaxAgeMs,
  },
});
