'use strict';
// Seeds a demo user so you can log in immediately in development.
// Replace this with a real sign-up flow / migration for production.

const { createUser } = require('./auth/authService');
const { userRepository } = require('./auth/repository');
const { seedUser, isProd } = require('./config');

async function seed() {
  // Never auto-create the public demo account on a production/UAT deployment
  // unless explicitly opted in — it would be a known login on a real domain.
  if (isProd && process.env.SEED_DEMO_USER !== 'true') {
    return null;
  }
  const existing = await userRepository.findByEmail(seedUser.email);
  if (existing) return existing;
  const user = await createUser(seedUser);
  // eslint-disable-next-line no-console
  console.log(`[seed] created demo user: ${seedUser.email} / ${seedUser.password}`);
  return user;
}

module.exports = { seed };
