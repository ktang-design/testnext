'use strict';
// A minimal express-session store backed by node:sqlite, so sessions persist
// across restarts. Implements get/set/destroy/touch + periodic cleanup.

const session = require('express-session');

function expiryOf(sess) {
  // Prefer the cookie's absolute expiry; fall back to maxAge from now.
  const exp = sess && sess.cookie && sess.cookie.expires;
  if (exp) return new Date(exp).getTime();
  const maxAge = sess && sess.cookie && sess.cookie.originalMaxAge;
  return Date.now() + (maxAge || 24 * 60 * 60 * 1000);
}

class SqliteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    this._get = db.prepare('SELECT data, expires FROM sessions WHERE sid = ?');
    this._upsert = db.prepare(
      `INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?)
       ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires`
    );
    this._touch = db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?');
    this._destroy = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this._sweep = db.prepare('DELETE FROM sessions WHERE expires < ?');

    // Sweep expired sessions hourly (and once at startup).
    this._cleanup();
    this._timer = setInterval(() => this._cleanup(), 60 * 60 * 1000);
    if (this._timer.unref) this._timer.unref();
  }

  _cleanup() {
    try { this._sweep.run(Date.now()); } catch (_) { /* ignore */ }
  }

  get(sid, cb) {
    try {
      const row = this._get.get(sid);
      if (!row) return cb(null, null);
      if (row.expires < Date.now()) {
        this._destroy.run(sid);
        return cb(null, null);
      }
      return cb(null, JSON.parse(row.data));
    } catch (err) {
      return cb(err);
    }
  }

  set(sid, sess, cb) {
    try {
      this._upsert.run(sid, JSON.stringify(sess), expiryOf(sess));
      return cb(null);
    } catch (err) {
      return cb(err);
    }
  }

  touch(sid, sess, cb) {
    try {
      this._touch.run(expiryOf(sess), sid);
      return cb(null);
    } catch (err) {
      return cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      this._destroy.run(sid);
      return cb(null);
    } catch (err) {
      return cb(err);
    }
  }
}

module.exports = { SqliteSessionStore };
