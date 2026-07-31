'use strict';
// SqliteUserRepository — persistent implementation of the UserRepository
// interface, backed by libSQL. Drop-in replacement for the in-memory one;
// same async method signatures, so authService never changes.

const crypto = require('crypto');
const { normalizeEmail } = require('./UserRepository');
const { get, all, run } = require('../db/database');

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
    role: row.role || 'Administrator',
    status: row.status || 'active',
    lastAccessedAt: row.last_accessed_at || null,
  };
}
// Public (safe) shape for listings — never includes the password hash.
function rowToPublic(row) {
  const u = rowToUser(row);
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt, lastAccessedAt: u.lastAccessedAt, status: u.status, role: u.role };
}

class SqliteUserRepository {
  async findByEmail(email) {
    return rowToUser(await get('SELECT * FROM users WHERE email = ?', [normalizeEmail(email)]));
  }

  async findById(id) {
    return rowToUser(await get('SELECT * FROM users WHERE id = ?', [id]));
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
      await run(
        `INSERT INTO users (id, email, name, password_hash, failed_attempts, locked_until, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [user.id, user.email, user.name, user.passwordHash, user.failedAttempts, user.lockedUntil, user.createdAt]
      );
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        throw new Error('A user with that email already exists.');
      }
      throw err;
    }
    return user;
  }

  // List accounts for the platform Users/Administrators pages. Optional
  // case-insensitive search over email/name; paginated. Never returns hashes.
  async list({ search = '', limit = 10, offset = 0 } = {}) {
    const like = `%${String(search).trim().toLowerCase()}%`;
    const hasSearch = String(search).trim() !== '';
    const where = hasSearch ? 'WHERE lower(email) LIKE ? OR lower(name) LIKE ?' : '';
    const args = hasSearch ? [like, like] : [];
    const totalRow = await get(`SELECT COUNT(*) AS n FROM users ${where}`, args);
    const rows = await all(
      `SELECT * FROM users ${where} ORDER BY created_at DESC, email ASC LIMIT ? OFFSET ?`,
      args.concat([limit, offset])
    );
    return { total: totalRow ? totalRow.n : 0, users: rows.map(rowToPublic) };
  }

  async setStatus(id, status) {
    await run('UPDATE users SET status = ? WHERE id = ?', [status, id]);
    return this.findById(id);
  }

  // Record a successful sign-in time (best-effort; never blocks auth).
  async touchLastAccessed(id) {
    try { await run('UPDATE users SET last_accessed_at = ? WHERE id = ?', [new Date().toISOString(), id]); } catch (_) {}
  }

  // Partial update by id. Only known columns are written.
  async update(id, patch) {
    const columns = {
      name: 'name',
      passwordHash: 'password_hash',
      failedAttempts: 'failed_attempts',
      lockedUntil: 'locked_until',
      role: 'role',
      status: 'status',
      lastAccessedAt: 'last_accessed_at',
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
      await run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, values);
    }
    return this.findById(id);
  }
}

module.exports = { SqliteUserRepository };
