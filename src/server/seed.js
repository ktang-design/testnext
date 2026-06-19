'use strict';
// Seeds a demo user so you can log in immediately in development.
// Replace this with a real sign-up flow / migration for production.

const { createUser } = require('./auth/authService');
const { userRepository } = require('./auth/repository');
const { seedUser, isProd } = require('./config');
const { pagesRepository } = require('./website/PagesRepository');
const { navigationRepository } = require('./website/NavigationRepository');

async function seed() {
  // Never auto-create the public demo account on a production/UAT deployment
  // unless explicitly opted in — it would be a known login on a real domain.
  if (isProd && process.env.SEED_DEMO_USER !== 'true') {
    return null;
  }
  let user = await userRepository.findByEmail(seedUser.email);
  if (!user) {
    await createUser(seedUser);
    user = await userRepository.findByEmail(seedUser.email);
    // eslint-disable-next-line no-console
    console.log(`[seed] created demo user: ${seedUser.email} / ${seedUser.password}`);
  }
  // Give the demo user some published pages + a starter navigation so the
  // Website layer is populated out of the box (both idempotent).
  if (user && user.id) {
    pagesRepository.seedDefaults(user.id);
    navigationRepository.seedDefault(user.id);
  }
  return user;
}

module.exports = { seed };
