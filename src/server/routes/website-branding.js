'use strict';
// Website branding API (logo override + brand colours). Mounted under the
// large body parser because the logo is an image data URL.
//   GET  /api/website/branding -> { defaults, saved }
//   PUT  /api/website/branding -> { saved }

const express = require('express');
const { requireApiAuth } = require('../auth/authGuard');
const { websiteBrandingRepository } = require('../website/WebsiteBrandingRepository');
const { WEBSITE_BRANDING_DEFAULTS, WEBSITE_BRANDING_COLORS } = require('../website/defaults');

const router = express.Router();

const HEX = /^#[0-9a-fA-F]{6}$/;
const LOGO_MAX = Math.ceil(5 * 1024 * 1024 * 1.4); // ~5 MB image as a data URL

const str = (v) => (typeof v === 'string' ? v : '');

function cleanColor(raw, fallback) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const color = HEX.test(str(src.color)) ? str(src.color).toUpperCase() : fallback.color;
  let opacity = Number(src.opacity);
  if (!Number.isFinite(opacity)) opacity = fallback.opacity;
  opacity = Math.max(0, Math.min(100, Math.round(opacity)));
  return { color, opacity };
}

router.get('/', requireApiAuth, (req, res) => {
  res.json({ defaults: WEBSITE_BRANDING_DEFAULTS, saved: websiteBrandingRepository.get(req.session.userId) });
});

router.put('/', requireApiAuth, (req, res) => {
  const b = req.body || {};
  if (b.logo != null && !(typeof b.logo === 'string' && b.logo.startsWith('data:image/') && b.logo.length <= LOGO_MAX)) {
    return res.status(400).json({ error: 'INVALID_LOGO', message: 'Logo must be an image within 5 MB.' });
  }
  const config = { logo: b.logo || null };
  WEBSITE_BRANDING_COLORS.forEach((key) => {
    config[key] = cleanColor(b[key], WEBSITE_BRANDING_DEFAULTS[key]);
  });
  res.json({ saved: websiteBrandingRepository.save(req.session.userId, config) });
});

module.exports = router;
