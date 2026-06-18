'use strict';
// BrandingRepository — per-user Branding config persistence (node:sqlite).
// Stores the whole config (colors, options, alt text, and logo/favicon data
// URLs) as a JSON blob keyed by user id.
//
//   get(userId)            -> config object | null
//   save(userId, config)   -> config object

const { db } = require('../db/database');

class BrandingRepository {
  constructor(database) {
    this.db = database;
    this._get = database.prepare('SELECT data FROM branding_settings WHERE user_id = ?');
    this._upsert = database.prepare(
      `INSERT INTO branding_settings (user_id, data, updated_at)
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

module.exports = {
  brandingRepository: new BrandingRepository(db),
  BrandingRepository,
};
