'use strict';
// One JSON navigation document per user (mirrors the branding repository shape).

const { get, run } = require('../db/database');

class NavigationRepository {
  async get(userId) {
    const row = await get('SELECT data FROM website_navigation WHERE user_id = ?', [userId]);
    if (!row) return null;
    try {
      const parsed = JSON.parse(row.data);
      return Array.isArray(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  async save(userId, items) {
    await run(
      `INSERT INTO website_navigation (user_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      [userId, JSON.stringify(items), new Date().toISOString()]
    );
    return this.get(userId);
  }
}

module.exports = { navigationRepository: new NavigationRepository(), NavigationRepository };
