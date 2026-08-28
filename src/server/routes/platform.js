'use strict';
// Platform settings APIs (per authenticated user):
//   GET/PUT /api/platform/language-region   -> { defaults, saved }
//   GET/PUT /api/platform/analytics         -> { defaults, saved }
//   GET/PUT /api/platform/eds               -> { defaults, endpoint, saved }

const express = require('express');
const { requireApiAuth } = require('../auth/authGuard');
const { platformSettingsRepository: repo } = require('../platform/PlatformSettingsRepository');
const { userRepository } = require('../auth/repository');
const { activityRepository } = require('../platform/ActivityRepository');
const { register, AuthError } = require('../auth/authService');
const { logActivity } = require('../platform/activity');
const D = require('../platform/defaults');

const router = express.Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const ROLES = ['Administrator', 'Content manager', 'Editor'];
const STATUSES = ['active', 'pending', 'inactive'];
// Parse ?page / ?pageSize into a bounded { limit, offset, page, pageSize }.
function paging(q) {
  const pageSize = Math.min(50, Math.max(1, parseInt(q.pageSize, 10) || 10));
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  return { limit: pageSize, offset: (page - 1) * pageSize, page, pageSize };
}

// ---- Language & region ----------------------------------------------------
router.get('/language-region', requireApiAuth, ah(async (req, res) => {
  res.json({
    defaults: D.LANGUAGE_DEFAULTS,
    options: { timezones: D.TIMEZONES, timeFormats: D.TIME_FORMATS },
    saved: await repo.get(req.session.userId, 'language-region'),
  });
}));
router.put('/language-region', requireApiAuth, ah(async (req, res) => {
  const b = req.body || {};
  const timezone = D.TIMEZONES.includes(b.timezone) ? b.timezone : D.LANGUAGE_DEFAULTS.timezone;
  const timeFormat = D.TIME_FORMATS.includes(b.timeFormat) ? b.timeFormat : D.LANGUAGE_DEFAULTS.timeFormat;
  // defaultLanguage is read-only (set at account setup); never trust the client.
  const config = { timezone, timeFormat, defaultLanguage: D.LANGUAGE_DEFAULTS.defaultLanguage };
  const saved = await repo.save(req.session.userId, 'language-region', config);
  await logActivity(req.session.userId, {
    pre: 'Updated ', linkLabel: 'time format', linkHref: '/language-region/',
    post: ' to "' + (timeFormat === '24h' ? '24-hour (14:30)' : '12-hour (2:30 PM)') + '".',
  });
  res.json({ saved });
}));

// ---- Analytics ------------------------------------------------------------
router.get('/analytics', requireApiAuth, ah(async (req, res) => {
  res.json({ defaults: D.ANALYTICS_DEFAULTS, saved: await repo.get(req.session.userId, 'analytics') });
}));
router.put('/analytics', requireApiAuth, ah(async (req, res) => {
  const b = req.body || {};
  // Cap generously (guard against huge blobs) but DON'T truncate to the exact
  // length — otherwise an over-length ID would be trimmed into a valid one.
  // GA4_RE requires exactly G- + 10 letters/digits.
  const id = str(b.ga4MeasurementId, 64);
  if (id && !D.GA4_RE.test(id)) {
    return res.status(400).json({ error: 'INVALID_GA4', message: 'Measurement ID should look like G-XXXXXXXXXX.' });
  }
  const saved = await repo.save(req.session.userId, 'analytics', { ga4MeasurementId: id.toUpperCase() });
  await logActivity(req.session.userId, { pre: 'Updated ', linkLabel: 'Google Analytics 4 Measurement ID', linkHref: '/analytics/', post: '.' });
  res.json({ saved });
}));

// ---- EBSCO Discovery Service ----------------------------------------------
// The API password is write-only: it is never returned to the client (only a
// hasApiPassword flag), and a save keeps the stored value unless a new one is
// provided. Strips apiPassword from any record before sending it out.
function edsPublic(saved) {
  if (!saved) return saved;
  const out = Object.assign({}, saved);
  out.hasApiPassword = !!(out.apiPassword && String(out.apiPassword).length);
  delete out.apiPassword;
  return out;
}
router.get('/eds', requireApiAuth, ah(async (req, res) => {
  res.json({ defaults: D.EDS_DEFAULTS, endpoint: D.EDS_ENDPOINT, saved: edsPublic(await repo.get(req.session.userId, 'eds')) });
}));
router.put('/eds', requireApiAuth, ah(async (req, res) => {
  const b = req.body || {};
  const current = (await repo.get(req.session.userId, 'eds')) || {};
  const incomingPw = str(b.apiPassword, D.EDS_MAX);
  // OPID must be exactly 6 letters/digits when provided.
  const opid = str(b.opid, 6);
  if (opid && !/^[A-Za-z0-9]{6}$/.test(opid)) {
    return res.status(400).json({ error: 'INVALID_OPID', message: 'OPID must be 6 letters or numbers.' });
  }
  const config = {
    apiUsername: str(b.apiUsername, D.EDS_MAX),
    // Write-only: keep the stored password unless a new, non-empty one is sent.
    apiPassword: incomingPw || (current.apiPassword || ''),
    customerId: str(b.customerId, D.EDS_MAX),
    groupId: str(b.groupId, D.EDS_MAX),
    profile: str(b.profile, D.EDS_MAX),
    opid,
    // authType is optional; fall back to the default when cleared.
    authType: str(b.authType, D.EDS_MAX) || D.EDS_DEFAULTS.authType,
  };
  const saved = await repo.save(req.session.userId, 'eds', config);
  await logActivity(req.session.userId, { pre: 'Updated ', linkLabel: 'EBSCO Discovery Service', linkHref: '/eds/', post: ' integration.' });
  res.json({ saved: edsPublic(saved) });
}));

// ---- Users (accounts that can access the website) -------------------------
router.get('/users', requireApiAuth, ah(async (req, res) => {
  const { limit, offset, page, pageSize } = paging(req.query);
  const { total, users } = await userRepository.list({ search: req.query.q || '', limit, offset });
  res.json({ total, page, pageSize, users });
}));

router.post('/users', requireApiAuth, ah(async (req, res) => {
  const b = req.body || {};
  const name = str(b.name, 120);
  const email = str(b.email, 254);
  const password = typeof b.password === 'string' ? b.password : '';
  const role = ROLES.includes(b.role) ? b.role : 'Administrator';
  try {
    const created = await register({ name, email, password }); // validates + enforces unique email
    await userRepository.update(created.id, { role });
    await logActivity(req.session.userId, { pre: 'Added ', linkLabel: 'user', linkHref: '/users/', post: ' “' + (name || email) + '”.' });
    res.status(201).json({ user: { id: created.id, email: created.email, name: created.name, role, status: 'active' } });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.code === 'EMAIL_TAKEN' ? 409 : 400).json({ error: err.code, message: err.message });
    }
    throw err;
  }
}));

router.patch('/users/:id', requireApiAuth, ah(async (req, res) => {
  const status = (req.body || {}).status;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'INVALID_STATUS', message: 'Unknown status.' });
  const target = await userRepository.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found.' });
  const updated = await userRepository.setStatus(req.params.id, status);
  await logActivity(req.session.userId, { pre: 'Changed ', linkLabel: 'user', linkHref: '/users/', post: ' “' + (target.name || target.email) + '” to ' + status + '.' });
  res.json({ user: { id: updated.id, email: updated.email, name: updated.name, role: updated.role, status: updated.status } });
}));

router.get('/users/export', requireApiAuth, ah(async (req, res) => {
  const { users } = await userRepository.list({ search: req.query.q || '', limit: 5000, offset: 0 });
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = [['User', 'Email', 'Role', 'Account created', 'Last accessed', 'Status'].map(esc).join(',')];
  users.forEach((u) => lines.push([u.name || '', u.email, u.role, u.createdAt, u.lastAccessedAt || '', u.status].map(esc).join(',')));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
  res.send(lines.join('\r\n'));
}));

// ---- Administrators (read-only role view over the same accounts) ----------
router.get('/administrators', requireApiAuth, ah(async (req, res) => {
  const { limit, offset, page, pageSize } = paging(req.query);
  const { total, users } = await userRepository.list({ search: req.query.q || '', limit, offset });
  res.json({ total, page, pageSize, administrators: users });
}));

// ---- Activity log ---------------------------------------------------------
router.get('/activity', requireApiAuth, ah(async (req, res) => {
  const { limit, offset, page, pageSize } = paging(req.query);
  const { total, events } = await activityRepository.list(req.session.userId, { search: req.query.q || '', limit, offset });
  res.json({ total, page, pageSize, events });
}));

router.get('/activity/export', requireApiAuth, ah(async (req, res) => {
  const rows = await activityRepository.listAll(req.session.userId, req.query.q || '');
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = [['Time', 'Activity', 'User'].map(esc).join(',')];
  rows.forEach((e) => {
    const activity = (e.pre + (e.linkLabel || '') + (e.post || '')).trim();
    lines.push([e.createdAt, activity, e.actor].map(esc).join(','));
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="activity-log.csv"');
  res.send(lines.join('\r\n'));
}));

module.exports = router;
