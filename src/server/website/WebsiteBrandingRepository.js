'use strict';
// One JSON website-branding document per user (logo override + brand colours).

const { get, run } = require('../db/database');

class WebsiteBrandingRepository {
  async get(userId) {
    const row = await get('SELECT data FROM website_branding WHERE user_id = ?', [userId]);
    if (!row) return null;
    try { return JSON.parse(row.data); } catch (_) { return null; }
  }

  async save(userId, config) {
    await run(
      `INSERT INTO website_branding (user_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      [userId, JSON.stringify(config), new Date().toISOString()]
    );
    return this.get(userId);
  }
}

module.exports = { websiteBrandingRepository: new WebsiteBrandingRepository(), WebsiteBrandingRepository };
