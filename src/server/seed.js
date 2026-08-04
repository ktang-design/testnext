'use strict';
// Seeds a demo user so you can log in immediately in development.
// Replace this with a real sign-up flow / migration for production.

const { createUser } = require('./auth/authService');
const { hashPassword, verifyPassword } = require('./auth/passwords');
const { userRepository } = require('./auth/repository');
const { seedUser, seedPasswordGenerated, isProd } = require('./config');
const { pagesRepository } = require('./website/PagesRepository');

/* eslint-disable no-console */
async function seed() {
  // Never auto-create the public demo account on a production/UAT deployment
  // unless explicitly opted in — it would be a known login on a real domain.
  if (isProd && process.env.SEED_DEMO_USER !== 'true') {
    return null;
  }
  // No password → don't create a weak/known account. Deployments must set
  // SEED_DEMO_PASSWORD; local dev auto-generates one (see config.js).
  if (!seedUser.password) {
    console.warn('[seed] SEED_DEMO_PASSWORD not set — skipping demo user.');
    return null;
  }
  let user = await userRepository.findByEmail(seedUser.email);
  if (!user) {
    await createUser(seedUser);
    user = await userRepository.findByEmail(seedUser.email);
    // Never log the password. In local dev it's random, so print it once (local
    // console only) so you can sign in; deployments set it via env.
    console.log(`[seed] created demo user: ${seedUser.email}`);
    if (seedPasswordGenerated) console.log(`[seed] demo password (random, dev only): ${seedUser.password}`);
  } else if (!seedPasswordGenerated) {
    // SEED_DEMO_PASSWORD is the source of truth — keep the demo login in sync so
    // changing that env var rotates the account's password on the next boot.
    const matches = await verifyPassword(seedUser.password, user.passwordHash);
    if (!matches) {
      await userRepository.update(user.id, { passwordHash: await hashPassword(seedUser.password) });
      console.log(`[seed] rotated demo user password: ${seedUser.email}`);
    }
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
