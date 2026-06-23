'use strict';
// One JSON search-configuration document per user (the search bar shown below
// the site navigation: its background + the list of configured searches).

const { get, run } = require('../db/database');

class SearchRepository {
  async get(userId) {
    const row = await get('SELECT data FROM website_search WHERE user_id = ?', [userId]);
    if (!row) return null;
    try { return JSON.parse(row.data); } catch (_) { return null; }
  }

  async save(userId, config) {
    await run(
      `INSERT INTO website_search (user_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      [userId, JSON.stringify(config), new Date().toISOString()]
    );
    return this.get(userId);
  }
}

module.exports = { searchRepository: new SearchRepository(), SearchRepository };
