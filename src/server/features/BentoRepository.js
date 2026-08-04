'use strict';
// One small JSON doc per user for the Features > Bento page (the search-
// integration flag + the ordered list of bento blocks). Mirrors the
// platform_settings / website_* repositories.

const { get, run } = require('../db/database');

class BentoRepository {
  async get(userId) {
    const row = await get('SELECT data FROM bento_settings WHERE user_id = ?', [userId]);
    if (!row) return null;
    try { return JSON.parse(row.data); } catch (_) { return null; }
  }

  async save(userId, config) {
    await run(
      `INSERT INTO bento_settings (user_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      [userId, JSON.stringify(config), new Date().toISOString()]
    );
    return this.get(userId);
  }
}

module.exports = { bentoRepository: new BentoRepository(), BentoRepository };
