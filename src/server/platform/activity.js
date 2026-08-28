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

// logActivities(userId, list) — record several entries from one action (e.g. a
// Pages save that changed a few things), resolving the actor once instead of
// per entry. Same best-effort contract as logActivity.
async function logActivities(userId, list) {
  try {
    const parts = (list || []).filter((p) => p && p.pre);
    if (!userId || !parts.length) return;
    const user = await userRepository.findById(userId);
    const actorLabel = (user && (user.name || user.email)) || 'system';
    for (const p of parts) await activityRepository.add(userId, actorLabel, p);
  } catch (_) { /* never block the primary action */ }
}

module.exports = { logActivity, logActivities };
