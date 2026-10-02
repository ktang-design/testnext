'use strict';
// authService — authentication business logic, independent of HTTP and storage.
// Talks to the UserRepository interface and the password module only.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { userRepository } = require('./repository');
const { hashPassword, verifyPassword, wasteTime } = require('./passwords');
const { validateEmail, validatePassword, validateName } = require('./validators');
const { maxFailedAttempts, lockoutMs } = require('../config');
const { pagesRepository } = require('../website/PagesRepository');
const { brandingRepository } = require('../settings/BrandingRepository');
const { BRANDING_DEFAULTS } = require('../settings/defaults');

// New and guest accounts start with the logo the website canvas already shows,
// saved into Branding (System settings + Page builder share it), and with the
// site name shown beside it.
const DEFAULT_LOGO_FILE = path.join(__dirname, '..', '..', 'website', 'assets', 'stratum-logo.png');
let defaultLogoDataUrl = null;
function getDefaultLogo() {
  if (defaultLogoDataUrl === null) {
    try {
      defaultLogoDataUrl = `data:image/png;base64,${fs.readFileSync(DEFAULT_LOGO_FILE).toString('base64')}`;
    } catch (_) { defaultLogoDataUrl = ''; }
  }
  return defaultLogoDataUrl;
}
async function seedDefaultBranding(userId) {
  const logo = getDefaultLogo();
  if (!logo) return;
  await brandingRepository.save(userId, { ...BRANDING_DEFAULTS, logo, showSiteName: true, altText: 'Stratum' });
}

// A typed error so the HTTP layer can map codes -> status + message.
class AuthError extends Error {
  constructor(code, message, meta = {}) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.meta = meta;
  }
}

// Shape sent to the client — never includes the password hash. role is
// included so client-side nav scripts (platform-nav.js, app-shell.js) can
// hide "Users and permissions" from the Research participant role; the actual
// access gate is server-side (authGuard.js), this is UX only.
function toPublicUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

function isLocked(user) {
  return Boolean(user.lockedUntil) && new Date(user.lockedUntil).getTime() > Date.now();
}

/**
 * Validate credentials and return the public user on success.
 * Throws AuthError('INVALID_CREDENTIALS' | 'ACCOUNT_LOCKED') otherwise.
 */
async function login(email, password) {
  const user = await userRepository.findByEmail(email);

  // Unknown user: run a dummy hash compare to keep response timing uniform,
  // then fail with the same generic error as a wrong password.
  if (!user) {
    await wasteTime();
    throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  if (isLocked(user)) {
    const retryAfterMs = new Date(user.lockedUntil).getTime() - Date.now();
    throw new AuthError('ACCOUNT_LOCKED', 'Account temporarily locked. Try again later.', {
      retryAfterMs,
    });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await registerFailure(user);
    throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  // Success: clear any failure/lock state.
  if (user.failedAttempts !== 0 || user.lockedUntil) {
    await userRepository.update(user.id, { failedAttempts: 0, lockedUntil: null });
  }
  return toPublicUser(user);
}

async function registerFailure(user) {
  const failedAttempts = (user.failedAttempts || 0) + 1;
  const patch = { failedAttempts };
  if (failedAttempts >= maxFailedAttempts) {
    patch.lockedUntil = new Date(Date.now() + lockoutMs).toISOString();
    patch.failedAttempts = 0; // reset the counter once locked
  }
  await userRepository.update(user.id, patch);
}

// Low-level create (used by the seeder). No validation/uniqueness checks here.
async function createUser({ email, password, name }) {
  const passwordHash = await hashPassword(password);
  return userRepository.create({ email, passwordHash, name });
}

/**
 * Register a new account: validate input, enforce unique email, create the
 * user, and return the public user. Throws AuthError on any rule violation.
 */
async function register({ name, email, password }) {
  for (const check of [validateName(name), validateEmail(email), validatePassword(password)]) {
    if (!check.valid) throw new AuthError(check.code, check.message);
  }
  const existing = await userRepository.findByEmail(email);
  if (existing) {
    throw new AuthError('EMAIL_TAKEN', 'An account with that email already exists.');
  }
  try {
    const user = await createUser({ name: name.trim(), email, password });
    // Every new account starts with a single starred Homepage.
    await pagesRepository.seedDefaults(user.id);
    await seedDefaultBranding(user.id);
    return toPublicUser(user);
  } catch (err) {
    // Guard against a race between the check above and insert.
    if (String(err.message).includes('already exists')) {
      throw new AuthError('EMAIL_TAKEN', 'An account with that email already exists.');
    }
    throw err;
  }
}

/**
 * Create a throwaway "Guest access" account. Every guest is a Research
 * participant with their own account (and so their own data), so concurrent
 * guests never see each other's work. The random password is never shown —
 * the caller signs the guest straight in.
 */
async function createGuest() {
  const suffix = crypto.randomBytes(6).toString('hex');
  const user = await createUser({
    name: 'Guest',
    email: `guest-${suffix}@guest.stratum.app`,
    password: crypto.randomBytes(24).toString('base64url'),
  });
  await userRepository.update(user.id, { role: 'Research participant' });
  await pagesRepository.seedDefaults(user.id);
  await seedDefaultBranding(user.id);
  return toPublicUser({ ...user, role: 'Research participant' });
}

async function getUserById(id) {
  const user = await userRepository.findById(id);
  return user ? toPublicUser(user) : null;
}

module.exports = { login, register, createGuest, createUser, getUserById, toPublicUser, AuthError };
