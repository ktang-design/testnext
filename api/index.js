'use strict';
// Vercel serverless entry — exports the Express app as the function handler.
// vercel.json rewrites every request to this function, so Express keeps serving
// the static front-end, the page-protection guard, and the /api routes exactly
// as it does locally.
module.exports = require('../src/server/app');
