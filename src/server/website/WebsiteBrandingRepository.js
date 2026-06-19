'use strict';
// One JSON website-branding document per user (logo override + brand colours).

const { db } = require('../db/database');

class WebsiteBrandingRepository {
  constructor(database) {
    this.db = database;
    this._get = database.prepare('SELECT data FROM website_branding WHERE user_id = ?');
    this._upsert = database.prepare(
      `INSERT INTO website_branding (user_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    );
  }

  get(userId) {
    const row = this._get.get(userId);
    if (!row) return null;
    try { return JSON.parse(row.data); } catch (_) { return null; }
  }

  save(userId, config) {
    this._upsert.run(userId, JSON.stringify(config), new Date().toISOString());
    return this.get(userId);
  }
}

module.exports = { websiteBrandingRepository: new WebsiteBrandingRepository(db), WebsiteBrandingRepository };
