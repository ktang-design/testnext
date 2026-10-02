'use strict';
// Read + write access to the user's pages, plus a one-time demo seed.
// Pages are saved as a whole ordered set (replaceAll) — this IS the
// auto-saved draft. `pages_published` is a parallel table holding the
// last-published snapshot (mirrors the `data`/`published_data` split used by
// the other website_* tables), so in-progress edits never leak out before
// Publish. Not to be confused with the per-page `status` column below, which
// is an unrelated per-page visibility flag.

const { get, all, batch } = require('../db/database');
const { DEFAULT_PAGES } = require('./defaults');

function safeContent(raw) {
  try {
    const c = JSON.parse(raw);
    if (c && Array.isArray(c.sections)) return c;
  } catch (_) { /* fall through */ }
  return { sections: [] };
}

// Map a DB row to the shape the API/client use (is_homepage 0/1 -> boolean).
function toPage(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    description: row.description || '',
    isHomepage: !!row.is_homepage,
    content: safeContent(row.content),
    sort: row.sort,
  };
}

const COLUMNS = 'id, title, slug, status, description, is_homepage, content, sort';
const selectFrom = (table) => `SELECT ${COLUMNS} FROM ${table}`;

class PagesRepository {
  async list(userId) {
    return (await all(`${selectFrom('pages')} WHERE user_id = ? ORDER BY sort, title`, [userId])).map(toPage);
  }

  // The last-published snapshot of the whole Pages list (see file header).
  async listPublished(userId) {
    return (await all(`${selectFrom('pages_published')} WHERE user_id = ? ORDER BY sort, title`, [userId])).map(toPage);
  }

  // Pages that are individually visible (the per-page `status` flag), out of
  // the current draft set — used to build the navigation's page picker.
  async listVisible(userId) {
    return (await this.list(userId)).filter((p) => p.status === 'published');
  }

  async getById(userId, id) {
    const row = await get(`${selectFrom('pages')} WHERE id = ? AND user_id = ?`, [id, userId]);
    return row ? toPage(row) : null;
  }

  async count(userId) {
    const row = await get('SELECT COUNT(*) AS n FROM pages WHERE user_id = ?', [userId]);
    return row ? row.n : 0;
  }

  // Replace a table's entire page set for this user in one atomic batch.
  async replaceTable(table, userId, pages) {
    const now = new Date().toISOString();
    const stmts = [{ sql: `DELETE FROM ${table} WHERE user_id = ?`, args: [userId] }];
    pages.forEach((p, i) => {
      stmts.push({
        sql: `INSERT INTO ${table} (id, user_id, title, slug, status, description, is_homepage, content, sort, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [p.id, userId, p.title, p.slug, p.status, p.description || '', p.isHomepage ? 1 : 0, JSON.stringify(p.content || { sections: [] }), i, now],
      });
    });
    await batch(stmts, 'write');
  }

  // Replace the user's entire DRAFT page set in one atomic batch. `pages` must
  // already be validated/normalized (id, title, slug, status, description,
  // isHomepage, sort present). Page ids are preserved so navigation
  // references stay intact.
  async replaceAll(userId, pages) {
    await this.replaceTable('pages', userId, pages);
    return this.list(userId);
  }

  // Promote the current draft page set to be the published snapshot.
  async publish(userId) {
    const pages = await this.list(userId);
    await this.replaceTable('pages_published', userId, pages);
    return pages;
  }

  // Revert the draft page set to whatever is currently published.
  async discard(userId) {
    const pages = await this.listPublished(userId);
    await this.replaceTable('pages', userId, pages);
    return pages;
  }

  // Idempotent: only seeds when the user has no pages yet. Every new account
  // starts with a single starred Homepage, seeded into BOTH `pages` and
  // `pages_published` so a brand-new account starts clean (no "unpublished
  // changes" before the user has ever touched Page Builder).
  // `homepageContent`, when given, is the starter content for the Homepage.
  async seedDefaults(userId, homepageContent) {
    if ((await this.count(userId)) > 0) return;
    const now = new Date().toISOString();
    const stmts = [];
    ['pages', 'pages_published'].forEach((table) => {
      DEFAULT_PAGES.forEach((p, i) => {
        stmts.push({
          sql: `INSERT INTO ${table} (id, user_id, title, slug, status, description, is_homepage, content, sort, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [p.id, userId, p.title, p.slug, p.status, p.description || '', p.isHomepage ? 1 : 0, JSON.stringify((p.isHomepage && homepageContent) || p.content || { sections: [] }), i, now],
        });
      });
    });
    if (stmts.length) await batch(stmts, 'write');
  }
}

module.exports = { pagesRepository: new PagesRepository(), PagesRepository };
