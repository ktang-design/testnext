'use strict';
// Chooses the active UserRepository implementation. Everything else imports the
// repository from here, so swapping persistence is a one-line change.

const { db } = require('../db/database');
const { SqliteUserRepository } = require('./SqliteUserRepository');

const userRepository = new SqliteUserRepository(db);

module.exports = { userRepository };
