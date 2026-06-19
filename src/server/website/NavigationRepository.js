'use strict';
// One JSON navigation document per user (mirrors the branding repository shape).

const { db } = require('../db/database');
const { DEFAULT_NAV } = require('./defaults');

class NavigationRepository {
  constructor(database) {
    this.db = database;
    this._get = database.prepare('SELECT data FROM website_navigation WHERE user_id = ?');
    this._upsert = database.prepare(
      `INSERT INTO website_navigation (user_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    );
  }

  get(userId) {
    const row = this._get.get(userId);
    if (!row) return null;
    try {
      const parsed = JSON.parse(row.data);
      return Array.isArray(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  save(userId, items) {
    this._upsert.run(userId, JSON.stringify(items), new Date().toISOString());
    return this.get(userId);
  }

  // Idempotent: only seeds when the user has no saved navigation yet.
  seedDefault(userId) {
    if (this._get.get(userId)) return;
    this.save(userId, DEFAULT_NAV);
  }
}

module.exports = { navigationRepository: new NavigationRepository(db), NavigationRepository };
