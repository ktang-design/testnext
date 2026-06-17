'use strict';
// Site details settings API (per authenticated user).
//   GET  /api/site-settings  -> { defaults, saved }   (saved is null until first save)
//   PUT  /api/site-settings  -> { saved }              (persists name + description)

const express = require('express');
const { requireApiAuth } = require('../auth/authGuard');
const { settingsRepository } = require('../settings/SiteSettingsRepository');
const { FACTORY_DEFAULTS, NAME_MAX, DESCRIPTION_MAX } = require('../settings/defaults');

const router = express.Router();

router.get('/', requireApiAuth, (req, res) => {
  const saved = settingsRepository.get(req.session.userId);
  res.json({ defaults: FACTORY_DEFAULTS, saved });
});

router.put('/', requireApiAuth, (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name : '';
  const description = typeof body.description === 'string' ? body.description : '';

  if (!name.trim()) {
    return res.status(400).json({ error: 'NAME_REQUIRED', message: 'Site name is required.' });
  }
  if (name.length > NAME_MAX || description.length > DESCRIPTION_MAX) {
    return res.status(400).json({
      error: 'TOO_LONG',
      message: `Name must be ≤ ${NAME_MAX} and description ≤ ${DESCRIPTION_MAX} characters.`,
    });
  }

  const saved = settingsRepository.save(req.session.userId, { name, description });
  res.json({ saved });
});

module.exports = router;
