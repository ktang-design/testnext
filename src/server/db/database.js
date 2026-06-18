'use strict';
// SQLite database connection + schema, using Node's built-in `node:sqlite`
// (no native dependency / build step). One shared connection for the process.

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

// DB file location (override with DATABASE_FILE; ':memory:' for tests).
const DEFAULT_FILE = path.join(__dirname, '..', '..', '..', 'data', 'stacksnext.db');
const dbFile = process.env.DATABASE_FILE || DEFAULT_FILE;

if (dbFile !== ':memory:') {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
}

const db = new DatabaseSync(dbFile);

// Pragmas: WAL for better concurrency, enforce foreign keys.
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Schema (idempotent).
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id             TEXT PRIMARY KEY,
    email          TEXT NOT NULL UNIQUE,
    name           TEXT NOT NULL,
    password_hash  TEXT NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until   TEXT,
    created_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid     TEXT PRIMARY KEY,
    data    TEXT NOT NULL,
    expires INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);

  CREATE TABLE IF NOT EXISTS site_settings (
    user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS branding_settings (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT NOT NULL,   -- JSON: colors, logo/favicon data URLs, options
    updated_at TEXT NOT NULL
  );
`);

module.exports = { db, dbFile };
