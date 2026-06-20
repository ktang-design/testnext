'use strict';
// SiteSettingsRepository — per-user Site details persistence (libSQL).
// Same repository-boundary pattern as UserRepository: swap the storage here
// without touching the routes.
//
//   get(userId)               -> Promise<{ name, description } | null>
//   save(userId, { name, description }) -> Promise<{ name, description }>

const { get, run } = require('../db/database');

class SiteSettingsRepository {
  async get(userId) {
    const row = await get('SELECT name, description FROM site_settings WHERE user_id = ?', [userId]);
    return row ? { name: row.name, description: row.description } : null;
  }

  async save(userId, { name, description }) {
    await run(
      `INSERT INTO site_settings (user_id, name, description, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         updated_at = excluded.updated_at`,
      [userId, name, description, new Date().toISOString()]
    );
    return this.get(userId);
  }
}

module.exports = {
  settingsRepository: new SiteSettingsRepository(),
  SiteSettingsRepository,
};
