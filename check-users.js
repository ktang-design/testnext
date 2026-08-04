'use strict';
// READ-ONLY: list the user accounts on a given libSQL/Turso database, and flag
// specific emails of interest. Changes nothing. Run once per database.
// Env vars:
//   DB_URL    libsql://... (the database to inspect)
//   DB_TOKEN  that database's auth token (current TURSO_AUTH_TOKEN)
//
//   node check-users.js
// Delete this file when done.

const { createClient } = require('@libsql/client');

const { DB_URL, DB_TOKEN } = process.env;
if (!DB_URL || !DB_TOKEN) {
  console.error('Set DB_URL and DB_TOKEN first.');
  process.exit(1);
}

// Accounts we care about for this incident.
const WATCH = ['kaitlyn@stacksdiscovery.com', 'test@test.com', 'demo@stacksnext.com'];

(async () => {
  const db = createClient({ url: DB_URL, authToken: DB_TOKEN });
  const r = await db.execute('SELECT id, email, name FROM users ORDER BY email');

  console.log(`\nDatabase: ${DB_URL}`);
  console.log(`Total users: ${r.rows.length}\n`);
  r.rows.forEach((u) => console.log(`  - ${u.email}   (${u.name})   id=${u.id}`));

  console.log('\nWatch list:');
  const emails = new Set(r.rows.map((u) => String(u.email).toLowerCase()));
  WATCH.forEach((e) => console.log(`  ${emails.has(e.toLowerCase()) ? '⚠️  PRESENT' : '✓ absent  '}  ${e}`));
  console.log('');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
