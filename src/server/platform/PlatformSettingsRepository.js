'use strict';
// One small JSON doc per (user, kind) for the Platform settings pages
// (communication, language-region, analytics). Mirrors the website_* repos.

const { get, run } = require('../db/database');

class PlatformSettingsRepository {
  async get(userId, kind) {
    const row = await get('SELECT data FROM platform_settings WHERE user_id = ? AND kind = ?', [userId, kind]);
    if (!row) return null;
    try { return JSON.parse(row.data); } catch (_) { return null; }
  }

  async save(userId, kind, config) {
    await run(
      `INSERT INTO platform_settings (user_id, kind, data, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, kind) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      [userId, kind, JSON.stringify(config), new Date().toISOString()]
    );
    return this.get(userId, kind);
  }
}

module.exports = { platformSettingsRepository: new PlatformSettingsRepository(), PlatformSettingsRepository };
