'use strict';
// One JSON header-configuration document per user.

const { get, run } = require('../db/database');

class HeaderRepository {
  async get(userId) {
    const row = await get('SELECT data FROM website_header WHERE user_id = ?', [userId]);
    if (!row) return null;
    try { return JSON.parse(row.data); } catch (_) { return null; }
  }

  async save(userId, config) {
    await run(
      `INSERT INTO website_header (user_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      [userId, JSON.stringify(config), new Date().toISOString()]
    );
    return this.get(userId);
  }
}

module.exports = { headerRepository: new HeaderRepository(), HeaderRepository };
