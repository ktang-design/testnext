'use strict';
// BrandingRepository — per-user Branding config persistence (libSQL).
// Stores the whole config (colors, options, alt text, and logo/favicon data
// URLs) as a JSON blob keyed by user id.
//
//   get(userId)            -> Promise<config object | null>
//   save(userId, config)   -> Promise<config object>
//   syncPrimarySecondary(userId, primary, secondary, defaults) -> Promise<config>

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

  // Mirror of WebsiteBrandingRepository.syncPrimarySecondary, for the other
  // direction: Website branding pushing its primary/secondary back up to
  // Platform, so the two stay in step whichever page the user edits.
  //
  // Unlike the downward sync this creates the record when absent: a user who has
  // never opened Platform branding has still now chosen a brand colour, and
  // Platform would otherwise keep serving the factory default. Everything else in
  // the config (logo, favicon, alt text, options) is preserved.
  async syncPrimarySecondary(userId, primaryColor, secondaryColor, defaults) {
    const saved = (await this.get(userId)) || defaults || {};
    return this.save(userId, {
      ...saved,
      primaryColor: primaryColor,
      secondaryColor: secondaryColor,
    });
  }
}

module.exports = {
  brandingRepository: new BrandingRepository(),
  BrandingRepository,
};
