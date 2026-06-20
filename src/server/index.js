'use strict';
// Local entry point: start a listening HTTP server for development.
// On Vercel the app is exported via api/index.js and run as a serverless
// function instead (no app.listen). Schema migration + demo seed run lazily on
// the first request via the init gate in app.js.

const app = require('./app');
const { port } = require('./config');

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`StacksNext running at http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log('Login: /login   ·   Protected: /site-details  /branding  /access  /website/*');
});
