'use strict';
// Authentication HTTP routes: POST /login, POST /logout, GET /me.

const express = require('express');
const { login, register, getUserById, AuthError } = require('../auth/authService');
const { requireApiAuth } = require('../auth/authGuard');

const router = express.Router();

// Light per-IP throttle on login attempts (complements per-account lockout).
const WINDOW_MS = 1000 * 60; // 1 minute
const MAX_PER_WINDOW = 20;
const hits = new Map(); // ip -> { count, resetAt }

function throttle(req, res, next) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || rec.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }
  rec.count += 1;
  if (rec.count > MAX_PER_WINDOW) {
    return res.status(429).json({ error: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Slow down.' });
  }
  return next();
}

router.post('/login', throttle, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Email and password are required.' });
  }
  try {
    const user = await login(email, password);
    // Prevent session fixation: issue a fresh session on privilege change.
    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({ error: 'SERVER_ERROR', message: 'Could not start session.' });
      }
      req.session.userId = user.id;
      return res.json({ user });
    });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.code === 'ACCOUNT_LOCKED' ? 423 : 401;
      return res.status(status).json({ error: err.code, message: err.message, ...err.meta });
    }
    // eslint-disable-next-line no-console
    console.error('[auth] login error', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Something went wrong.' });
  }
});

router.post('/register', throttle, async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Name, email, and password are required.' });
  }
  try {
    const user = await register({ name, email, password });
    // Auto-login: fresh session to avoid fixation.
    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({ error: 'SERVER_ERROR', message: 'Could not start session.' });
      }
      req.session.userId = user.id;
      return res.status(201).json({ user });
    });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.code === 'EMAIL_TAKEN' ? 409 : 400;
      return res.status(status).json({ error: err.code, message: err.message });
    }
    // eslint-disable-next-line no-console
    console.error('[auth] register error', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Something went wrong.' });
  }
});

router.post('/logout', (req, res) => {
  if (!req.session) return res.status(204).end();
  req.session.destroy(() => {
    res.clearCookie('sn.sid');
    res.status(204).end();
  });
});

router.get('/me', requireApiAuth, async (req, res) => {
  const user = await getUserById(req.session.userId);
  if (!user) {
    return req.session.destroy(() => res.status(401).json({ error: 'UNAUTHENTICATED' }));
  }
  return res.json({ user });
});

module.exports = router;
