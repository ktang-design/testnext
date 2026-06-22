'use strict';
// authService — authentication business logic, independent of HTTP and storage.
// Talks to the UserRepository interface and the password module only.

const { userRepository } = require('./repository');
const { hashPassword, verifyPassword, wasteTime } = require('./passwords');
const { validateEmail, validatePassword, validateName } = require('./validators');
const { maxFailedAttempts, lockoutMs } = require('../config');
const { pagesRepository } = require('../website/PagesRepository');

// A typed error so the HTTP layer can map codes -> status + message.
class AuthError extends Error {
  constructor(code, message, meta = {}) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.meta = meta;
  }
}

// Shape sent to the client — never includes the password hash.
function toPublicUser(user) {
  return { id: user.id, email: user.email, name: user.name };
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
    return toPublicUser(user);
  } catch (err) {
    // Guard against a race between the check above and insert.
    if (String(err.message).includes('already exists')) {
      throw new AuthError('EMAIL_TAKEN', 'An account with that email already exists.');
    }
    throw err;
  }
}

async function getUserById(id) {
  const user = await userRepository.findById(id);
  return user ? toPublicUser(user) : null;
}

module.exports = { login, register, createUser, getUserById, toPublicUser, AuthError };
