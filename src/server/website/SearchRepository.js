'use strict';
// One JSON search-configuration document per user (the search bar shown below
// the site navigation: its background + the list of configured searches),
// split into a draft (auto-saved while editing) and a published snapshot —
// mirrors BentoRepository's shape.

const { get, run } = require('../db/database');

function parse(json) {
  if (json == null) return null;
  try { return JSON.parse(json); } catch (_) { return null; }
}

class SearchRepository {
  async get(userId) {
    const row = await get('SELECT data, published_data FROM website_search WHERE user_id = ?', [userId]);
    if (!row) return { draft: null, published: null };
    return { draft: parse(row.data), published: parse(row.published_data) };
  }

  // Auto-save: upsert the draft only, leaving published_data untouched.
  async saveDraft(userId, config) {
    await run(
      `INSERT INTO website_search (user_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      [userId, JSON.stringify(config), new Date().toISOString()]
    );
    return (await this.get(userId)).draft;
  }

  // Promote the current draft to be the published snapshot.
  async publish(userId) {
    const { draft } = await this.get(userId);
    const config = draft || {};
    await run(
      `INSERT INTO website_search (user_id, data, published_data, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET published_data = excluded.published_data, updated_at = excluded.updated_at`,
      [userId, JSON.stringify(config), JSON.stringify(config), new Date().toISOString()]
    );
    return config;
  }

  // Revert the draft to whatever is currently published.
  async discard(userId) {
    const { published } = await this.get(userId);
    const config = published || {};
    await run(
      `INSERT INTO website_search (user_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      [userId, JSON.stringify(config), new Date().toISOString()]
    );
    return config;
  }
}

module.exports = { searchRepository: new SearchRepository(), SearchRepository };
