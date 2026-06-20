'use strict';
// Site details settings API (per authenticated user).
//   GET  /api/site-settings  -> { defaults, saved }   (saved is null until first save)
//   PUT  /api/site-settings  -> { saved }              (persists name + description)

const express = require('express');
const { requireApiAuth } = require('../auth/authGuard');
const { settingsRepository } = require('../settings/SiteSettingsRepository');
const { FACTORY_DEFAULTS, NAME_MAX, DESCRIPTION_MAX } = require('../settings/defaults');

const router = express.Router();

// Forward async errors to the global error handler (Express 4 doesn't auto-catch).
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', requireApiAuth, ah(async (req, res) => {
  const saved = await settingsRepository.get(req.session.userId);
  res.json({ defaults: FACTORY_DEFAULTS, saved });
}));

router.put('/', requireApiAuth, ah(async (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name : '';
  const description = typeof body.description === 'string' ? body.description : '';

  if (!name.trim()) {
    return res.status(400).json({ error: 'NAME_REQUIRED', message: 'Site name cannot be empty.' });
  }
  if (!description.trim()) {
    return res.status(400).json({ error: 'DESCRIPTION_REQUIRED', message: 'Site description cannot be empty.' });
  }
  if (name.length > NAME_MAX || description.length > DESCRIPTION_MAX) {
    return res.status(400).json({
      error: 'TOO_LONG',
      message: `Name must be ≤ ${NAME_MAX} and description ≤ ${DESCRIPTION_MAX} characters.`,
    });
  }

  const saved = await settingsRepository.save(req.session.userId, { name, description });
  res.json({ saved });
}));

module.exports = router;
