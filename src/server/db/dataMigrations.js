'use strict';
// One-time data migrations, run after the schema is ensured. Each runs once
// (recorded in data_migrations) so later user edits are never re-overwritten.
// Used when a change to the defaults must also reach accounts that already hold
// their own saved copy (defaults only apply to accounts with no saved row).

const { RESEARCH_PARTICIPANT_DATABASES_DEFAULTS: GUEST_DB } = require('../features/defaults');

const clone = (v) => JSON.parse(JSON.stringify(v));

// Guest access (Research participant) Databases: CINAHL placeholder became
// MEDLINE Complete, and "Healthcare" joined the Subject vocabulary.
function patchGuestDatabases(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  let changed = false;
  const medline = GUEST_DB.entries.find((e) => e.id === 'dbe_medline_complete');
  if (Array.isArray(cfg.entries) && medline) {
    const i = cfg.entries.findIndex((e) => e && e.id === 'dbe_cinahl' && e.title === 'CINAHL');
    if (i !== -1 && !cfg.entries.some((e) => e && e.id === medline.id)) { cfg.entries[i] = clone(medline); changed = true; }
  }
  const subject = Array.isArray(cfg.categories) && cfg.categories.find((c) => c && c.id === 'cat_subject');
  if (subject && Array.isArray(subject.terms) && !subject.terms.includes('Healthcare') && subject.terms.length < 20) {
    subject.terms.push('Healthcare'); changed = true;
  }
  return changed;
}

const MIGRATIONS = [
  {
    id: '2026-10-guest-databases-medline-healthcare',
    async up({ all, run }) {
      const rows = await all(
        `SELECT d.user_id AS uid, d.data AS data, d.published_data AS pub
           FROM databases_settings d JOIN users u ON u.id = d.user_id
          WHERE u.role = 'Research participant'`
      );
      for (const r of rows) {
        const next = {};
        for (const [col, raw] of [['data', r.data], ['published_data', r.pub]]) {
          if (raw == null) continue;
          let cfg; try { cfg = JSON.parse(raw); } catch (_) { continue; }
          if (patchGuestDatabases(cfg)) next[col] = JSON.stringify(cfg);
        }
        for (const col of Object.keys(next)) {
          await run(`UPDATE databases_settings SET ${col} = ? WHERE user_id = ?`, [next[col], r.uid]);
        }
      }
    },
  },
];

async function runDataMigrations(db) {
  await db.run('CREATE TABLE IF NOT EXISTS data_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  for (const m of MIGRATIONS) {
    if (await db.get('SELECT 1 AS x FROM data_migrations WHERE id = ?', [m.id])) continue;
    await m.up(db);
    await db.run('INSERT INTO data_migrations (id, applied_at) VALUES (?, ?)', [m.id, new Date().toISOString()]);
  }
}

module.exports = { runDataMigrations, patchGuestDatabases };
