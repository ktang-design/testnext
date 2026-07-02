'use strict';
// One JSON website-branding document per user (logo override + brand colours).

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

  // Keep the Website palette's primary / secondary in sync when Platform
  // branding changes them (the Website section inherits these brand colours).
  // Only rewrites an existing saved doc — a never-saved Website branding already
  // derives its primary / secondary from Platform on read (see brandingDefaults).
  // Opacity and the other colours (heading / body / link / logo) are preserved.
  async syncPrimarySecondary(userId, primaryColor, secondaryColor) {
    const saved = await this.get(userId);
    if (!saved) return null;
    const withColor = (c, color) => ({
      color,
      opacity: c && Number.isFinite(Number(c.opacity)) ? c.opacity : 100,
    });
    const next = {
      ...saved,
      primary: withColor(saved.primary, primaryColor),
      secondary: withColor(saved.secondary, secondaryColor),
    };
    return this.save(userId, next);
  }
}

module.exports = { websiteBrandingRepository: new WebsiteBrandingRepository(), WebsiteBrandingRepository };
