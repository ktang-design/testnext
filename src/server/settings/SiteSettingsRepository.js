'use strict';
// SiteSettingsRepository — per-user Site details persistence (node:sqlite).
// Same repository-boundary pattern as UserRepository: swap the storage here
// without touching the routes.
//
//   get(userId)               -> { name, description } | null
//   save(userId, { name, description }) -> { name, description }

const { db } = require('../db/database');

class SiteSettingsRepository {
  constructor(database) {
    this.db = database;
    this._get = database.prepare(
      'SELECT name, description FROM site_settings WHERE user_id = ?'
    );
    this._upsert = database.prepare(
      `INSERT INTO site_settings (user_id, name, description, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         updated_at = excluded.updated_at`
    );
  }

  get(userId) {
    const row = this._get.get(userId);
    return row ? { name: row.name, description: row.description } : null;
  }

  save(userId, { name, description }) {
    this._upsert.run(userId, name, description, new Date().toISOString());
    return this.get(userId);
  }
}

module.exports = {
  settingsRepository: new SiteSettingsRepository(db),
  SiteSettingsRepository,
};
