'use strict';
// An express-session store backed by libSQL, so sessions persist across
// restarts/deploys (the table lives in the managed DB). Implements the
// callback-based Store contract over the async DB helpers.

const session = require('express-session');
const { get, run } = require('../db/database');

function expiryOf(sess) {
  // Prefer the cookie's absolute expiry; fall back to maxAge from now.
  const exp = sess && sess.cookie && sess.cookie.expires;
  if (exp) return new Date(exp).getTime();
  const maxAge = sess && sess.cookie && sess.cookie.originalMaxAge;
  return Date.now() + (maxAge || 24 * 60 * 60 * 1000);
}

const UPSERT = `INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?)
  ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires`;

class SqliteSessionStore extends session.Store {
  get(sid, cb) {
    get('SELECT data, expires FROM sessions WHERE sid = ?', [sid])
      .then((row) => {
        if (!row) return cb(null, null);
        if (Number(row.expires) < Date.now()) {
          return run('DELETE FROM sessions WHERE sid = ?', [sid]).then(() => cb(null, null)).catch(() => cb(null, null));
        }
        return cb(null, JSON.parse(row.data));
      })
      .catch((err) => cb(err));
  }

  set(sid, sess, cb) {
    run(UPSERT, [sid, JSON.stringify(sess), expiryOf(sess)])
      .then(() => {
        // Serverless has no reliable background timer, so sweep expired rows
        // opportunistically on a small fraction of writes.
        if (Math.random() < 0.02) run('DELETE FROM sessions WHERE expires < ?', [Date.now()]).catch(() => {});
        cb(null);
      })
      .catch((err) => cb(err));
  }

  touch(sid, sess, cb) {
    run('UPDATE sessions SET expires = ? WHERE sid = ?', [expiryOf(sess), sid]).then(() => cb(null)).catch((err) => cb(err));
  }

  destroy(sid, cb) {
    run('DELETE FROM sessions WHERE sid = ?', [sid]).then(() => cb(null)).catch((err) => cb(err));
  }
}

module.exports = { SqliteSessionStore };
