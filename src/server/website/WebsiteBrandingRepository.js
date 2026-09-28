'use strict';
// One JSON website-branding document per user (logo + brand colours). The
// logo is the same file Platform branding manages, not an independent
// override — see syncLogo.

const { get, run } = require('../db/database');

class WebsiteBrandingRepository {
  async get(userId) {
    const row = await get('SELECT data FROM website_branding WHERE user_id = ?', [userId]);
    if (!row) return null;
    try { return JSON.parse(row.data); } catch (_) { return null; }
  }

  async save(userId, config) {
    await run(
      `INSERT INTO website_branding (user_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      [userId, JSON.stringify(config), new Date().toISOString()]
    );
    return this.get(userId);
  }

  // Keep the Website palette's primary / secondary / action (colour AND
  // opacity) in sync when Platform branding changes them (the Website section
  // inherits these brand colours). Only rewrites an existing saved doc — a
  // never-saved Website branding already derives primary / secondary / action
  // from Platform on read (see brandingDefaults). The other colours (heading /
  // body) and the logo are preserved.
  async syncBrandColors(userId, primary, secondary, action) {
    const saved = await this.get(userId);
    if (!saved) return null;
    const next = {
      ...saved,
      primary: { color: primary.color, opacity: primary.opacity },
      secondary: { color: secondary.color, opacity: secondary.opacity },
      action: { color: action.color, opacity: action.opacity },
    };
    return this.save(userId, next);
  }

  // Keep the Website logo in sync when Platform branding changes it. Only
  // rewrites an existing saved doc — a never-saved Website branding already
  // derives its logo from Platform on read (see brandingDefaults).
  async syncLogo(userId, logo) {
    const saved = await this.get(userId);
    if (!saved) return null;
    return this.save(userId, { ...saved, logo: logo || null });
  }
}

module.exports = { websiteBrandingRepository: new WebsiteBrandingRepository(), WebsiteBrandingRepository };
