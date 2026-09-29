'use strict';
// One JSON navigation document per user, split into a draft (auto-saved while
// editing) and a published snapshot — mirrors BentoRepository's shape.

const { get, run } = require('../db/database');

function parse(json) {
  if (json == null) return null;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

class NavigationRepository {
  async get(userId) {
    const row = await get('SELECT data, published_data FROM website_navigation WHERE user_id = ?', [userId]);
    if (!row) return { draft: null, published: null };
    return { draft: parse(row.data), published: parse(row.published_data) };
  }

  // Auto-save: upsert the draft only, leaving published_data untouched.
  async saveDraft(userId, items) {
    await run(
      `INSERT INTO website_navigation (user_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      [userId, JSON.stringify(items), new Date().toISOString()]
    );
    return (await this.get(userId)).draft;
  }

  // Promote the current draft to be the published snapshot.
  async publish(userId) {
    const { draft } = await this.get(userId);
    const items = draft || [];
    await run(
      `INSERT INTO website_navigation (user_id, data, published_data, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET published_data = excluded.published_data, updated_at = excluded.updated_at`,
      [userId, JSON.stringify(items), JSON.stringify(items), new Date().toISOString()]
    );
    return items;
  }

  // Revert the draft to whatever is currently published.
  async discard(userId) {
    const { published } = await this.get(userId);
    const items = published || [];
    await run(
      `INSERT INTO website_navigation (user_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      [userId, JSON.stringify(items), new Date().toISOString()]
    );
    return items;
  }
}

module.exports = { navigationRepository: new NavigationRepository(), NavigationRepository };
