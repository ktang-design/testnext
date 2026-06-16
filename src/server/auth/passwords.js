'use strict';
// Password hashing/verification. Isolated so the algorithm can be changed in
// one place. Uses bcryptjs (pure-JS bcrypt — no native build step).

const bcrypt = require('bcryptjs');
const { bcryptRounds } = require('../config');

// A precomputed hash of a random string. Used to run a real bcrypt comparison
// even when the user does not exist, so login timing does not reveal whether
// an email is registered (mitigates user enumeration).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-constant-time', bcryptRounds);

async function hashPassword(plain) {
  return bcrypt.hash(plain, bcryptRounds);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash || DUMMY_HASH);
}

// Compare against a throwaway hash to keep timing consistent for unknown users.
async function wasteTime() {
  return bcrypt.compare('wrong', DUMMY_HASH);
}

module.exports = { hashPassword, verifyPassword, wasteTime };
