'use strict';
// SqliteUserRepository — persistent implementation of the UserRepository
// interface, backed by node:sqlite. Drop-in replacement for the in-memory one;
// same async method signatures, so authService never changes.

const crypto = require('crypto');
const { normalizeEmail } = require('./UserRepository');

// Map a DB row (snake_case) to the user object the app uses (camelCase).
function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until, // ISO string or null
    createdAt: row.created_at,
  };
}

class SqliteUserRepository {
  constructor(db) {
    this.db = db;
    this._byEmail = db.prepare('SELECT * FROM users WHERE email = ?');
    this._byId = db.prepare('SELECT * FROM users WHERE id = ?');
    this._insert = db.prepare(
      `INSERT INTO users (id, email, name, password_hash, failed_attempts, locked_until, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
  }

  async findByEmail(email) {
    return rowToUser(this._byEmail.get(normalizeEmail(email)));
  }

  async findById(id) {
    return rowToUser(this._byId.get(id));
  }

  async create({ email, passwordHash, name }) {
    const normalized = normalizeEmail(email);
    const user = {
      id: `u_${crypto.randomUUID()}`,
      email: normalized,
      name: name || normalized,
      passwordHash,
      failedAttempts: 0,
      lockedUntil: null,
      createdAt: new Date().toISOString(),
    };
    try {
      this._insert.run(
        user.id, user.email, user.name, user.passwordHash,
        user.failedAttempts, user.lockedUntil, user.createdAt
      );
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        throw new Error('A user with that email already exists.');
      }
      throw err;
    }
    return user;
  }

  // Partial update by id. Only known columns are written.
  async update(id, patch) {
    const columns = {
      name: 'name',
      passwordHash: 'password_hash',
      failedAttempts: 'failed_attempts',
      lockedUntil: 'locked_until',
    };
    const sets = [];
    const values = [];
    for (const [key, col] of Object.entries(columns)) {
      if (key in patch) {
        sets.push(`${col} = ?`);
        values.push(patch[key]);
      }
    }
    if (sets.length) {
      values.push(id);
      this.db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    }
    return this.findById(id);
  }
}

module.exports = { SqliteUserRepository };
