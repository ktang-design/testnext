'use strict';
// Central configuration. Secrets come from the environment; dev fallbacks are
// provided so the app runs out of the box, with a warning when they are used.

const isProd = process.env.NODE_ENV === 'production';

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (isProd) {
    throw new Error('SESSION_SECRET must be set in production.');
  }
  sessionSecret = 'dev-only-insecure-secret-change-me';
  // eslint-disable-next-line no-console
  console.warn('[config] SESSION_SECRET not set — using an insecure dev secret.');
}

// Demo/seed account password comes ONLY from the environment — never hardcoded.
// In local dev (non-prod) it falls back to a strong random value (printed once
// by the seeder) so the app still runs out of the box; deployments must set
// SEED_DEMO_PASSWORD explicitly (and only seed when SEED_DEMO_USER=true).
let seedPassword = process.env.SEED_DEMO_PASSWORD || '';
let seedPasswordGenerated = false;
if (!seedPassword && !isProd) {
  seedPassword = require('crypto').randomBytes(18).toString('base64url');
  seedPasswordGenerated = true;
}

module.exports = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  sessionSecret,

  // Session cookie lifetime (ms)
  sessionMaxAgeMs: 1000 * 60 * 60 * 8, // 8 hours

  // Account lockout policy (brute-force mitigation)
  maxFailedAttempts: 5,
  lockoutMs: 1000 * 60 * 15, // 15 minutes

  // bcrypt work factor
  bcryptRounds: 12,

  // Seed/demo account. Password comes from SEED_DEMO_PASSWORD (or a random dev
  // value) — never hardcoded. seedPasswordGenerated marks the random-dev case.
  seedPasswordGenerated,
  seedUser: {
    email: 'demo@stacksnext.com',
    password: seedPassword,
    name: 'Demo Admin',
  },
};
