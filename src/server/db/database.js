'use strict';
// Database connection + schema, on libSQL (@libsql/client). The same client
// talks to a local file (dev) or a remote Turso database (production) depending
// on TURSO_DATABASE_URL — one async code path everywhere.
//
// Helpers keep the call sites tiny so repositories read almost like the old
// synchronous code, just awaited:
//   await get(sql, args)  -> first row | null
//   await all(sql, args)  -> rows[]
//   await run(sql, args)  -> result
//   await batch(stmts)    -> runs statements atomically (used by the migration)
// `ready` is a memoized promise that ensures the schema exists before any query.

const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');

const url = process.env.TURSO_DATABASE_URL || 'file:./data/dev.db';
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

// For local file: URLs, make sure the directory exists.
if (url.startsWith('file:')) {
  const filePath = url.slice('file:'.length);
  const dir = path.dirname(path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath));
  fs.mkdirSync(dir, { recursive: true });
}

const client = createClient({ url, authToken });

async function get(sql, args = []) {
  const res = await client.execute({ sql, args });
  return res.rows[0] || null;
}
async function all(sql, args = []) {
  const res = await client.execute({ sql, args });
  return res.rows;
}
async function run(sql, args = []) {
  return client.execute({ sql, args });
}
async function batch(statements, mode) {
  return client.batch(statements, mode);
}

// Schema — one statement per array entry (libSQL executes them as a batch).
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id             TEXT PRIMARY KEY,
    email          TEXT NOT NULL UNIQUE,
    name           TEXT NOT NULL,
    password_hash  TEXT NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until   TEXT,
    created_at     TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    sid     TEXT PRIMARY KEY,
    data    TEXT NOT NULL,
    expires INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires)`,
  `CREATE TABLE IF NOT EXISTS site_settings (
    user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS branding_settings (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS pages (
    id         TEXT NOT NULL,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    slug        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'published',
    description TEXT NOT NULL DEFAULT '',
    is_homepage INTEGER NOT NULL DEFAULT 0,
    content     TEXT NOT NULL DEFAULT '{"sections":[]}',
    sort        INTEGER NOT NULL DEFAULT 0,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS website_navigation (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS website_header (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS website_footer (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS website_typography (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS website_branding (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS website_search (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  // Platform settings that are a small JSON doc per (user, kind): communication,
  // language-region, analytics. One row per kind so pages persist independently.
  `CREATE TABLE IF NOT EXISTS platform_settings (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, kind)
  )`,
  // Features > Bento: one JSON doc per user holding the search-integration flag
  // and the ordered list of bento blocks.
  `CREATE TABLE IF NOT EXISTS bento_settings (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  // Activity log entries (one row per tracked action). Scoped per account.
  `CREATE TABLE IF NOT EXISTS activity_events (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    actor_label TEXT NOT NULL,
    pre         TEXT NOT NULL,
    link_label  TEXT,
    link_href   TEXT,
    post        TEXT,
    created_at  TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_activity_user_time ON activity_events(user_id, created_at)`,
];

// Columns introduced after the initial release. CREATE TABLE above already has
// them for fresh databases; these ALTERs add them to databases created earlier
// (the dev file, the deployed Turso DB) without dropping data. Idempotent.
const COLUMN_PATCHES = [
  { table: 'pages', column: 'description', ddl: "ALTER TABLE pages ADD COLUMN description TEXT NOT NULL DEFAULT ''" },
  { table: 'pages', column: 'is_homepage', ddl: 'ALTER TABLE pages ADD COLUMN is_homepage INTEGER NOT NULL DEFAULT 0' },
  { table: 'pages', column: 'content', ddl: 'ALTER TABLE pages ADD COLUMN content TEXT NOT NULL DEFAULT \'{"sections":[]}\'' },
  { table: 'users', column: 'role', ddl: "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'Administrator'" },
  { table: 'users', column: 'status', ddl: "ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'" },
  { table: 'users', column: 'last_accessed_at', ddl: 'ALTER TABLE users ADD COLUMN last_accessed_at TEXT' },
];
async function ensureColumns() {
  for (const p of COLUMN_PATCHES) {
    const cols = await all(`PRAGMA table_info(${p.table})`);
    if (!cols.some((c) => c.name === p.column)) await run(p.ddl);
  }
}

let _ready = null;
function migrate() {
  if (!_ready) {
    _ready = (async () => {
      await client.batch(SCHEMA, 'write');
      await ensureColumns();
    })();
  }
  return _ready;
}
// `ready` resolves once the schema has been ensured (run once per process).
const ready = migrate();

module.exports = { client, get, all, run, batch, migrate, ready };
