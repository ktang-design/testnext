'use strict';
// One row per user for the Features > Bento page, split into two JSON docs:
//   data           — the auto-saved draft (edited live, never shown to visitors)
//   published_data — the last-published snapshot; this is what the live site
//                    and its previews actually read, so in-progress edits
//                    never leak out before Publish is clicked.
// Mirrors the platform_settings / website_* repositories, plus the draft/
// published split described in this feature's own plan.

const { get, run } = require('../db/database');
const { BENTO_DEFAULTS } = require('./defaults');

function parse(json, fallback) {
  if (json == null) return fallback;
  try { return JSON.parse(json); } catch (_) { return fallback; }
}

class BentoRepository {
  async get(userId) {
    const row = await get('SELECT data, published_data FROM bento_settings WHERE user_id = ?', [userId]);
    if (!row) return { draft: null, published: null };
    return {
      draft: parse(row.data, null),
      published: parse(row.published_data, null),
    };
  }

  // Auto-save: upsert the draft only, leaving published_data untouched. A
  // fresh row's published_data starts NULL (no history to leak).
  async saveDraft(userId, config) {
    await run(
      `INSERT INTO bento_settings (user_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      [userId, JSON.stringify(config), new Date().toISOString()]
    );
    return (await this.get(userId)).draft;
  }

  // Promote the current draft to be the published snapshot.
  async publish(userId) {
    const { draft } = await this.get(userId);
    const config = draft || BENTO_DEFAULTS;
    await run(
      `INSERT INTO bento_settings (user_id, data, published_data, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET published_data = excluded.published_data, updated_at = excluded.updated_at`,
      [userId, JSON.stringify(config), JSON.stringify(config), new Date().toISOString()]
    );
    return config;
  }

  // Revert the draft to whatever is currently published.
  async discard(userId) {
    const { published } = await this.get(userId);
    const config = published || BENTO_DEFAULTS;
    await run(
      `INSERT INTO bento_settings (user_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      [userId, JSON.stringify(config), new Date().toISOString()]
    );
    return config;
  }
}

module.exports = { bentoRepository: new BentoRepository(), BentoRepository };
