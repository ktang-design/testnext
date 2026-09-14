'use strict';
// Route protection middleware.
//
// requirePageAuth  — for HTML page requests: redirect to /login?next=… when
//                    there is no session.
// requireApiAuth   — for JSON/API requests: respond 401 when there is no session.
// blockResearchParticipantPage / requireNotResearchParticipant — the Users and
//   permissions area (Administrators + Users pages, and their APIs) is hidden
//   from the Research participant role and must not be reachable even by typing
//   the URL directly or calling the API. Chain AFTER requirePageAuth/
//   requireApiAuth, which have already confirmed there is a session.
//
// Role isn't cached in the session (only userId is), so it's looked up fresh on
// each request — a role change takes effect on the user's very next request,
// not just their next login.

const { userRepository } = require('./repository');

const RESEARCH_PARTICIPANT = 'Research participant';

function isAuthenticated(req) {
  return Boolean(req.session && req.session.userId);
}

function requirePageAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  const next_ = encodeURIComponent(req.originalUrl);
  return res.redirect(`/login/?next=${next_}`);
}

function requireApiAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Sign in required.' });
}

async function currentUserRole(req) {
  if (!isAuthenticated(req)) return null;
  const user = await userRepository.findById(req.session.userId);
  return user ? user.role : null;
}

// Page requests get a bare 404, matching app.js's fallback for a route that
// genuinely doesn't exist — a Research participant gets no signal that
// Administrators/Users exists at all, not just a "you can't view this" refusal.
async function blockResearchParticipantPage(req, res, next) {
  try {
    const role = await currentUserRole(req);
    if (role === RESEARCH_PARTICIPANT) return res.status(404).send('Not found');
    next();
  } catch (err) {
    next(err);
  }
}

// API requests get a typed 403, consistent with requireApiAuth's typed 401 for
// the same-shaped "you may not do this" condition.
async function requireNotResearchParticipant(req, res, next) {
  try {
    const role = await currentUserRole(req);
    if (role === RESEARCH_PARTICIPANT) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Your role does not have access to this area.' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  isAuthenticated,
  requirePageAuth,
  requireApiAuth,
  RESEARCH_PARTICIPANT,
  blockResearchParticipantPage,
  requireNotResearchParticipant,
};
