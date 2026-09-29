'use strict';
// One JSON website-branding document per user (logo + brand colours), split
// into a draft (auto-saved while editing) and a published snapshot — mirrors
// BentoRepository's shape. The logo is the same file Platform branding
// manages, not an independent override — see syncLogo.

const { get, run } = require('../db/database');

function parse(json) {
  if (json == null) return null;
  try { return JSON.parse(json); } catch (_) { return null; }
}

class WebsiteBrandingRepository {
  async get(userId) {
    const row = await get('SELECT data, published_data FROM website_branding WHERE user_id = ?', [userId]);
    if (!row) return { draft: null, published: null };
    return { draft: parse(row.data), published: parse(row.published_data) };
  }

  // Auto-save: upsert the draft only, leaving published_data untouched.
  async saveDraft(userId, config) {
    await run(
      `INSERT INTO website_branding (user_id, data, updated_at)
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
      `INSERT INTO website_branding (user_id, data, published_data, updated_at)
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
      `INSERT INTO website_branding (user_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      [userId, JSON.stringify(config), new Date().toISOString()]
    );
    return config;
  }

  // Keep the Website palette's primary / secondary / action (colour AND
  // opacity) in sync when Platform branding changes them (the Website section
  // inherits these brand colours). Only rewrites an existing DRAFT doc — a
  // never-saved Website branding already derives primary / secondary / action
  // from Platform on read (see brandingDefaults). The other colours (heading /
  // body) and the logo are preserved. Applied to the draft; the caller (the
  // System Settings Branding PUT handler) syncs immediately since Platform
  // branding has no draft/publish split of its own.
  async syncBrandColors(userId, primary, secondary, action) {
    const { draft } = await this.get(userId);
    if (!draft) return null;
    const next = {
      ...draft,
      primary: { color: primary.color, opacity: primary.opacity },
      secondary: { color: secondary.color, opacity: secondary.opacity },
      action: { color: action.color, opacity: action.opacity },
    };
    return this.saveDraft(userId, next);
  }

  // Keep the Website logo in sync when Platform branding changes it. Only
  // rewrites an existing DRAFT doc — a never-saved Website branding already
  // derives its logo from Platform on read (see brandingDefaults).
  async syncLogo(userId, logo) {
    const { draft } = await this.get(userId);
    if (!draft) return null;
    return this.saveDraft(userId, { ...draft, logo: logo || null });
  }
}

module.exports = { websiteBrandingRepository: new WebsiteBrandingRepository(), WebsiteBrandingRepository };
