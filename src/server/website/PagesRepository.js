'use strict';
// Read + write access to the user's pages, plus a one-time demo seed.
// Pages are saved as a whole ordered set (replaceAll), mirroring the single
// Save action in the Pages builder.

const { get, all, batch } = require('../db/database');
const { DEFAULT_PAGES } = require('./defaults');

// Map a DB row to the shape the API/client use (is_homepage 0/1 -> boolean).
function toPage(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    description: row.description || '',
    isHomepage: !!row.is_homepage,
    sort: row.sort,
  };
}

const SELECT = 'SELECT id, title, slug, status, description, is_homepage, sort FROM pages';

class PagesRepository {
  async list(userId) {
    return (await all(`${SELECT} WHERE user_id = ? ORDER BY sort, title`, [userId])).map(toPage);
  }

  async listPublished(userId) {
    return (await this.list(userId)).filter((p) => p.status === 'published');
  }

  async getById(userId, id) {
    const row = await get(`${SELECT} WHERE id = ? AND user_id = ?`, [id, userId]);
    return row ? toPage(row) : null;
  }

  async count(userId) {
    const row = await get('SELECT COUNT(*) AS n FROM pages WHERE user_id = ?', [userId]);
    return row ? row.n : 0;
  }

  // Replace the user's entire page set in one atomic batch. `pages` must already
  // be validated/normalized (id, title, slug, status, description, isHomepage,
  // sort present). Page ids are preserved so navigation references stay intact.
  async replaceAll(userId, pages) {
    const now = new Date().toISOString();
    const stmts = [{ sql: 'DELETE FROM pages WHERE user_id = ?', args: [userId] }];
    pages.forEach((p, i) => {
      stmts.push({
        sql: 'INSERT INTO pages (id, user_id, title, slug, status, description, is_homepage, sort, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [p.id, userId, p.title, p.slug, p.status, p.description || '', p.isHomepage ? 1 : 0, i, now],
      });
    });
    await batch(stmts, 'write');
    return this.list(userId);
  }

  // Idempotent: only seeds when the user has no pages yet. Every new account
  // starts with a single starred Homepage.
  async seedDefaults(userId) {
    if ((await this.count(userId)) > 0) return;
    const now = new Date().toISOString();
    const stmts = DEFAULT_PAGES.map((p, i) => ({
      sql: 'INSERT INTO pages (id, user_id, title, slug, status, description, is_homepage, sort, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [p.id, userId, p.title, p.slug, p.status, p.description || '', p.isHomepage ? 1 : 0, i, now],
    }));
    if (stmts.length) await batch(stmts, 'write');
  }
}

module.exports = { pagesRepository: new PagesRepository(), PagesRepository };
