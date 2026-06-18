'use strict';
// Branding settings API (per authenticated user).
//   GET  /api/branding  -> { defaults, saved }
//   PUT  /api/branding  -> { saved }   (colors, options, alt text, logo/favicon data URLs)

const express = require('express');
const { requireApiAuth } = require('../auth/authGuard');
const { brandingRepository } = require('../settings/BrandingRepository');
const { BRANDING_DEFAULTS, ALT_TEXT_MAX } = require('../settings/defaults');

const router = express.Router();

const HEX = /^#[0-9a-fA-F]{6}$/;
// data URLs are ~4/3 the raw size; cap logo at 5 MB and favicon at 1 MB raw.
const LOGO_MAX = Math.ceil(5 * 1024 * 1024 * 1.4);
const FAVICON_MAX = Math.ceil(1 * 1024 * 1024 * 1.4);

function validImage(v, max) {
  if (v === null || v === undefined) return true;
  return typeof v === 'string' && v.startsWith('data:image/') && v.length <= max;
}

router.get('/', requireApiAuth, (req, res) => {
  res.json({ defaults: BRANDING_DEFAULTS, saved: brandingRepository.get(req.session.userId) });
});

router.put('/', requireApiAuth, (req, res) => {
  const b = req.body || {};
  const primaryColor = typeof b.primaryColor === 'string' ? b.primaryColor : '';
  const secondaryColor = typeof b.secondaryColor === 'string' ? b.secondaryColor : '';
  if (!HEX.test(primaryColor) || !HEX.test(secondaryColor)) {
    return res.status(400).json({ error: 'INVALID_COLOR', message: 'Colors must be hex values.' });
  }
  if (!validImage(b.logo, LOGO_MAX)) {
    return res.status(400).json({ error: 'INVALID_LOGO', message: 'Logo must be an image within 5 MB.' });
  }
  if (!validImage(b.favicon, FAVICON_MAX)) {
    return res.status(400).json({ error: 'INVALID_FAVICON', message: 'Favicon must be an image within 1 MB.' });
  }
  const config = {
    primaryColor: primaryColor.toUpperCase(),
    secondaryColor: secondaryColor.toUpperCase(),
    logo: b.logo || null,
    showSiteName: !!b.showSiteName,
    decorative: !!b.decorative,
    altText: typeof b.altText === 'string' ? b.altText.slice(0, ALT_TEXT_MAX) : '',
    favicon: b.favicon || null,
  };
  res.json({ saved: brandingRepository.save(req.session.userId, config) });
});

module.exports = router;
