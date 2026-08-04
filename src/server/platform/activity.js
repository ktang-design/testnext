'use strict';
// logActivity(userId, parts) — record a tracked action for the account's
// Activity log. Best-effort: any failure is swallowed so logging can never
// break the underlying action. `parts` = { pre, linkLabel?, linkHref?, post? },
// e.g. { pre: 'Updated ', linkLabel: 'site name', linkHref: '/site-details/', post: ' to "Stratum".' }.

const { activityRepository } = require('./ActivityRepository');
const { userRepository } = require('../auth/repository');

async function logActivity(userId, parts) {
  try {
    if (!userId || !parts || !parts.pre) return;
    const user = await userRepository.findById(userId);
    const actorLabel = (user && (user.name || user.email)) || 'system';
    await activityRepository.add(userId, actorLabel, parts);
  } catch (_) { /* never block the primary action */ }
}

module.exports = { logActivity };
