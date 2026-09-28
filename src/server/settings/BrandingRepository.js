'use strict';
// BrandingRepository — per-user Branding config persistence (libSQL).
// Stores the whole config (colors, options, alt text, and logo/favicon data
// URLs) as a JSON blob keyed by user id.
//
//   get(userId)            -> Promise<config object | null>
//   save(userId, config)   -> Promise<config object>
  //   syncBrandColors(userId, primary, secondary, action, defaults) -> Promise<config>
  //     (primary/secondary/action are { color, opacity } objects)
  //   syncLogo(userId, logo, defaults) -> Promise<config>

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

  // Mirror of WebsiteBrandingRepository.syncBrandColors, for the other
  // direction: Website branding pushing its primary/secondary/action back up to
  // Platform, so the two stay in step whichever page the user edits.
  //
  // Unlike the downward sync this creates the record when absent: a user who has
  // never opened Platform branding has still now chosen a brand colour, and
  // Platform would otherwise keep serving the factory default. Everything else in
  // the config (logo, favicon, alt text, options) is preserved.
  async syncBrandColors(userId, primary, secondary, action, defaults) {
    const saved = (await this.get(userId)) || defaults || {};
    return this.save(userId, {
      ...saved,
      primaryColor: primary.color,
      primaryOpacity: primary.opacity,
      secondaryColor: secondary.color,
      secondaryOpacity: secondary.opacity,
      actionColor: action.color,
      actionOpacity: action.opacity,
    });
  }

  // Mirror of WebsiteBrandingRepository.syncLogo — the two pages manage the
  // same site logo, not independent images, so uploading or removing it on
  // either page updates both. Same create-if-absent rule as syncBrandColors.
  async syncLogo(userId, logo, defaults) {
    const saved = (await this.get(userId)) || defaults || {};
    return this.save(userId, { ...saved, logo: logo || null });
  }
}

module.exports = {
  brandingRepository: new BrandingRepository(),
  BrandingRepository,
};
