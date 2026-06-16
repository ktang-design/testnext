'use strict';
// express-session configuration. Uses the default in-memory store, which is
// fine for local/dev. For production, swap `store` for a persistent store
// (e.g. connect-redis) — see README.

const session = require('express-session');
const { sessionSecret, sessionMaxAgeMs, isProd } = require('../config');
const { db } = require('../db/database');
const { SqliteSessionStore } = require('./SqliteSessionStore');

module.exports = session({
  name: 'sn.sid',
  store: new SqliteSessionStore(db),
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
