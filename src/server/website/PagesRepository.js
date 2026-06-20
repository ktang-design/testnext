'use strict';
// Read access to the user's pages, plus a one-time demo seed.

const { get, all, batch } = require('../db/database');
const { DEMO_PAGES } = require('./defaults');

class PagesRepository {
  async list(userId) {
    return all('SELECT id, title, slug, status FROM pages WHERE user_id = ? ORDER BY sort, title', [userId]);
  }

  async listPublished(userId) {
    return (await this.list(userId)).filter((p) => p.status === 'published');
  }

  async getById(userId, id) {
    return get('SELECT id, title, slug, status FROM pages WHERE id = ? AND user_id = ?', [id, userId]);
  }

  async count(userId) {
    const row = await get('SELECT COUNT(*) AS n FROM pages WHERE user_id = ?', [userId]);
    return row ? row.n : 0;
  }

  // Idempotent: only seeds when the user has no pages yet.
  async seedDefaults(userId) {
    if ((await this.count(userId)) > 0) return;
    const now = new Date().toISOString();
    const stmts = DEMO_PAGES.map((p, i) => ({
      sql: 'INSERT INTO pages (id, user_id, title, slug, status, sort, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [p.id, userId, p.title, p.slug, p.status, i, now],
    }));
    if (stmts.length) await batch(stmts, 'write');
  }
}

module.exports = { pagesRepository: new PagesRepository(), PagesRepository };
