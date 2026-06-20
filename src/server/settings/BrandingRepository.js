'use strict';
// BrandingRepository — per-user Branding config persistence (libSQL).
// Stores the whole config (colors, options, alt text, and logo/favicon data
// URLs) as a JSON blob keyed by user id.
//
//   get(userId)            -> Promise<config object | null>
//   save(userId, config)   -> Promise<config object>

const { get, run } = require('../db/database');

class BrandingRepository {
  async get(userId) {
    const row = await get('SELECT data FROM branding_settings WHERE user_id = ?', [userId]);
    if (!row) return null;
    try { return JSON.parse(row.data); } catch (_) { return null; }
  }

  async save(userId, config) {
    await run(
      `INSERT INTO branding_settings (user_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      [userId, JSON.stringify(config), new Date().toISOString()]
    );
    return this.get(userId);
  }
}

module.exports = {
  brandingRepository: new BrandingRepository(),
  BrandingRepository,
};
