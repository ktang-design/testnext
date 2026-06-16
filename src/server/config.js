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

  // Seed user for local development (remove/replace for real deployments)
  seedUser: {
    email: 'demo@stacksnext.com',
    password: 'Password123!',
    name: 'Demo Admin',
  },
};
