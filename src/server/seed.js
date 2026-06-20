'use strict';
// Seeds a demo user so you can log in immediately in development.
// Replace this with a real sign-up flow / migration for production.

const { createUser } = require('./auth/authService');
const { userRepository } = require('./auth/repository');
const { seedUser, isProd } = require('./config');
const { pagesRepository } = require('./website/PagesRepository');

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
  // Give the demo user some published pages so the "Add page" flow has
  // something to link to. The navigation itself starts empty — only items the
  // user adds appear.
  if (user && user.id) {
    await pagesRepository.seedDefaults(user.id);
  }
  return user;
}

module.exports = { seed };
