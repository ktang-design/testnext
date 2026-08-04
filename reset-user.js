'use strict';
// One-off helper: reset a user's password + revoke all sessions on a libSQL/
// Turso database. Run it yourself, per DB. NOTHING is hardcoded — every value
// comes from environment variables:
//
//   DB_URL         libsql://... (the database to fix)
//   DB_TOKEN       that database's auth token (current TURSO_AUTH_TOKEN)
//   TARGET_EMAIL   account to reset, e.g. demo@stacksnext.com
//   NEW_PASSWORD   the new password
//
// Usage (from repo root, secrets typed at hidden prompts — see chat):
//   node reset-user.js
// Delete this file when done.

const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

const { DB_URL, DB_TOKEN, TARGET_EMAIL, NEW_PASSWORD } = process.env;

if (!DB_URL || !DB_TOKEN || !TARGET_EMAIL || !NEW_PASSWORD) {
  console.error('Missing env vars. Set DB_URL, DB_TOKEN, TARGET_EMAIL, NEW_PASSWORD first.');
  process.exit(1);
}

(async () => {
  const db = createClient({ url: DB_URL, authToken: DB_TOKEN });

  // Only select columns present in every schema version (older DBs may lack
  // status/role) so this never fails with "no such column".
  const found = await db.execute({
    sql: 'SELECT id, email, name FROM users WHERE email = ?',
    args: [TARGET_EMAIL],
  });
  if (found.rows.length === 0) {
    console.error(`No user "${TARGET_EMAIL}" on this database — wrong environment? Aborting.`);
    process.exit(1);
  }
  console.log('Resetting:', found.rows[0]);

  const hash = await bcrypt.hash(NEW_PASSWORD, 12);
  await db.execute({
    sql: 'UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE email = ?',
    args: [hash, TARGET_EMAIL],
  });
  console.log('✓ Password rotated + lockout cleared.');

  try {
    const sess = await db.execute('DELETE FROM sessions');
    console.log(`✓ Sessions revoked (${sess.rowsAffected} deleted).`);
  } catch (e) {
    console.log('(No sessions table on this DB — skipping session purge.)');
  }
  console.log('Done. The old password no longer works on any deployment using this DB.');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
