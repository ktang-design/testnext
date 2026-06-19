'use strict';
// Read access to the user's pages, plus a one-time demo seed.

const { db } = require('../db/database');
const { DEMO_PAGES } = require('./defaults');

class PagesRepository {
  constructor(database) {
    this.db = database;
    this._byUser = database.prepare(
      'SELECT id, title, slug, status FROM pages WHERE user_id = ? ORDER BY sort, title'
    );
    this._byId = database.prepare(
      'SELECT id, title, slug, status FROM pages WHERE id = ? AND user_id = ?'
    );
    this._count = database.prepare('SELECT COUNT(*) AS n FROM pages WHERE user_id = ?');
    this._insert = database.prepare(
      'INSERT INTO pages (id, user_id, title, slug, status, sort, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
  }

  list(userId) {
    return this._byUser.all(userId);
  }

  listPublished(userId) {
    return this.list(userId).filter((p) => p.status === 'published');
  }

  getById(userId, id) {
    return this._byId.get(id, userId) || null;
  }

  count(userId) {
    return this._count.get(userId).n;
  }

  // Idempotent: only seeds when the user has no pages yet.
  seedDefaults(userId) {
    if (this.count(userId) > 0) return;
    const now = new Date().toISOString();
    DEMO_PAGES.forEach((p, i) => this._insert.run(p.id, userId, p.title, p.slug, p.status, i, now));
  }

  // Guarantee a published Homepage exists (every user's navigation always has
  // one). Returns the page row.
  ensureHome(userId) {
    let home = this.getById(userId, 'page-home');
    if (!home) {
      this._insert.run('page-home', userId, 'Homepage', '/', 'published', -1, new Date().toISOString());
      home = this.getById(userId, 'page-home');
    }
    return home;
  }
}

module.exports = { pagesRepository: new PagesRepository(db), PagesRepository };
