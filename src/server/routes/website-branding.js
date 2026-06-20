'use strict';
// Website branding API (logo override + brand colours). Mounted under the
// large body parser because the logo is an image data URL.
//   GET  /api/website/branding -> { defaults, saved }
//   PUT  /api/website/branding -> { saved }

const express = require('express');
const { requireApiAuth } = require('../auth/authGuard');
const { websiteBrandingRepository } = require('../website/WebsiteBrandingRepository');
const { brandingRepository } = require('../settings/BrandingRepository');
const { WEBSITE_BRANDING_DEFAULTS, WEBSITE_BRANDING_COLORS } = require('../website/defaults');

const router = express.Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const HEX = /^#[0-9a-fA-F]{6}$/;
// ~3 MB raw → ~4.1 MB data URL, under the serverless request body limit.
const LOGO_MAX = Math.ceil(3 * 1024 * 1024 * 1.4);

const str = (v) => (typeof v === 'string' ? v : '');

// Website branding inherits from Platform branding: the Platform primary /
// secondary colours seed the Website palette, so configuring Platform flows
// down as the Website defaults.
async function brandingDefaults(userId) {
  const p = (await brandingRepository.get(userId)) || {};
  const primary = HEX.test(str(p.primaryColor)) ? p.primaryColor.toUpperCase() : WEBSITE_BRANDING_DEFAULTS.primary.color;
  const secondary = HEX.test(str(p.secondaryColor)) ? p.secondaryColor.toUpperCase() : WEBSITE_BRANDING_DEFAULTS.secondary.color;
  return {
    logo: null,
    primary: { color: primary, opacity: 100 },
    secondary: { color: secondary, opacity: 100 },
    heading: { color: secondary, opacity: 100 },
    body: { color: WEBSITE_BRANDING_DEFAULTS.body.color, opacity: 100 },
    link: { color: primary, opacity: 100 },
  };
}

function cleanColor(raw, fallback) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const color = HEX.test(str(src.color)) ? str(src.color).toUpperCase() : fallback.color;
  let opacity = Number(src.opacity);
  if (!Number.isFinite(opacity)) opacity = fallback.opacity;
  opacity = Math.max(0, Math.min(100, Math.round(opacity)));
  return { color, opacity };
}

router.get('/', requireApiAuth, ah(async (req, res) => {
  res.json({
    defaults: await brandingDefaults(req.session.userId),
    saved: await websiteBrandingRepository.get(req.session.userId),
  });
}));

router.put('/', requireApiAuth, ah(async (req, res) => {
  const b = req.body || {};
  if (b.logo != null && !(typeof b.logo === 'string' && b.logo.startsWith('data:image/') && b.logo.length <= LOGO_MAX)) {
    return res.status(400).json({ error: 'INVALID_LOGO', message: 'Logo must be an image within 3 MB.' });
  }
  const config = { logo: b.logo || null };
  WEBSITE_BRANDING_COLORS.forEach((key) => {
    config[key] = cleanColor(b[key], WEBSITE_BRANDING_DEFAULTS[key]);
  });
  res.json({ saved: await websiteBrandingRepository.save(req.session.userId, config) });
}));

module.exports = router;
