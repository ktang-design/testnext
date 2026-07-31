'use strict';
// Platform settings APIs (per authenticated user):
//   GET/PUT /api/platform/communication    -> { defaults, saved }
//   GET/PUT /api/platform/language-region   -> { defaults, saved }
//   GET/PUT /api/platform/analytics         -> { defaults, saved }

const express = require('express');
const { requireApiAuth } = require('../auth/authGuard');
const { platformSettingsRepository: repo } = require('../platform/PlatformSettingsRepository');
const D = require('../platform/defaults');

const router = express.Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- Communication --------------------------------------------------------
router.get('/communication', requireApiAuth, ah(async (req, res) => {
  res.json({ defaults: D.COMMUNICATION_DEFAULTS, saved: await repo.get(req.session.userId, 'communication') });
}));
router.put('/communication', requireApiAuth, ah(async (req, res) => {
  const b = req.body || {};
  const systemEmail = str(b.systemEmail, D.COMMUNICATION_MAX.systemEmail);
  if (systemEmail && !EMAIL_RE.test(systemEmail)) {
    return res.status(400).json({ error: 'INVALID_EMAIL', message: 'Enter a valid system email address.' });
  }
  const config = {
    systemEmail,
    phone: str(b.phone, D.COMMUNICATION_MAX.phone),
    businessAddress: str(b.businessAddress, D.COMMUNICATION_MAX.businessAddress),
  };
  res.json({ saved: await repo.save(req.session.userId, 'communication', config) });
}));

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
  res.json({ saved: await repo.save(req.session.userId, 'language-region', config) });
}));

// ---- Analytics ------------------------------------------------------------
router.get('/analytics', requireApiAuth, ah(async (req, res) => {
  res.json({ defaults: D.ANALYTICS_DEFAULTS, saved: await repo.get(req.session.userId, 'analytics') });
}));
router.put('/analytics', requireApiAuth, ah(async (req, res) => {
  const b = req.body || {};
  const id = str(b.ga4MeasurementId, D.GA4_MAX);
  if (id && !D.GA4_RE.test(id)) {
    return res.status(400).json({ error: 'INVALID_GA4', message: 'Measurement ID should look like G-XXXXXXXXXX.' });
  }
  res.json({ saved: await repo.save(req.session.userId, 'analytics', { ga4MeasurementId: id.toUpperCase() }) });
}));

module.exports = router;
