'use strict';
// Activity-log entries, one row per tracked action, scoped per account.

const crypto = require('crypto');
const { get, all, run } = require('../db/database');

function rowToEvent(r) {
  return {
    id: r.id,
    actor: r.actor_label,
    pre: r.pre,
    linkLabel: r.link_label || null,
    linkHref: r.link_href || null,
    post: r.post || '',
    createdAt: r.created_at,
  };
}

class ActivityRepository {
  async add(userId, actorLabel, { pre, linkLabel = null, linkHref = null, post = '' }) {
    await run(
      `INSERT INTO activity_events (id, user_id, actor_label, pre, link_label, link_href, post, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [`ae_${crypto.randomUUID()}`, userId, actorLabel, pre, linkLabel, linkHref, post, new Date().toISOString()]
    );
  }

  // Build the WHERE for an optional case-insensitive search across the sentence.
  _where(userId, search) {
    const has = String(search || '').trim() !== '';
    const like = `%${String(search).trim().toLowerCase()}%`;
    return {
      sql: `WHERE user_id = ?${has ? ' AND (lower(pre) LIKE ? OR lower(link_label) LIKE ? OR lower(post) LIKE ? OR lower(actor_label) LIKE ?)' : ''}`,
      args: has ? [userId, like, like, like, like] : [userId],
    };
  }

  async list(userId, { search = '', limit = 10, offset = 0 } = {}) {
    const w = this._where(userId, search);
    const totalRow = await get(`SELECT COUNT(*) AS n FROM activity_events ${w.sql}`, w.args);
    const rows = await all(
      `SELECT * FROM activity_events ${w.sql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      w.args.concat([limit, offset])
    );
    return { total: totalRow ? totalRow.n : 0, events: rows.map(rowToEvent) };
  }

  async listAll(userId, search = '') {
    const w = this._where(userId, search);
    const rows = await all(`SELECT * FROM activity_events ${w.sql} ORDER BY created_at DESC LIMIT 5000`, w.args);
    return rows.map(rowToEvent);
  }
}

module.exports = { activityRepository: new ActivityRepository(), ActivityRepository };
