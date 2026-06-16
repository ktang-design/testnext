'use strict';
// UserRepository — the data-access layer for users.
//
// This is the "repository" boundary: all auth logic talks to this interface,
// never to a concrete store. Swap the in-memory implementation below for a SQL
// or document-store implementation (same method signatures) and nothing in the
// auth service has to change.
//
// Interface (all async, so a DB-backed impl is a drop-in):
//   findByEmail(email)            -> user | null
//   findById(id)                  -> user | null
//   create({ email, passwordHash, name }) -> user
//   update(id, patch)             -> user
//
// A `user` record:
//   { id, email, name, passwordHash, failedAttempts, lockedUntil, createdAt }

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `u_${idCounter}`;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

class InMemoryUserRepository {
  constructor() {
    /** @type {Map<string, object>} id -> user */
    this._byId = new Map();
    /** @type {Map<string, string>} email -> id */
    this._emailIndex = new Map();
  }

  async findByEmail(email) {
    const id = this._emailIndex.get(normalizeEmail(email));
    return id ? this._clone(this._byId.get(id)) : null;
  }

  async findById(id) {
    return this._byId.has(id) ? this._clone(this._byId.get(id)) : null;
  }

  async create({ email, passwordHash, name }) {
    const normalized = normalizeEmail(email);
    if (this._emailIndex.has(normalized)) {
      throw new Error('A user with that email already exists.');
    }
    const user = {
      id: nextId(),
      email: normalized,
      name: name || normalized,
      passwordHash,
      failedAttempts: 0,
      lockedUntil: null,
      createdAt: new Date().toISOString(),
    };
    this._byId.set(user.id, user);
    this._emailIndex.set(normalized, user.id);
    return this._clone(user);
  }

  async update(id, patch) {
    const user = this._byId.get(id);
    if (!user) throw new Error(`No user with id ${id}`);
    Object.assign(user, patch);
    return this._clone(user);
  }

  // Defensive copy so callers can't mutate stored records directly.
  _clone(user) {
    return user ? { ...user } : user;
  }
}

// Export a singleton instance plus the class (handy for tests / alternative impls).
module.exports = {
  userRepository: new InMemoryUserRepository(),
  InMemoryUserRepository,
  normalizeEmail,
};
