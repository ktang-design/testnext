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
const { BRANDING_DEFAULTS } = require('../settings/defaults');

const router = express.Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const HEX = /^#[0-9a-fA-F]{6}$/;
// ~3 MB raw → ~4.1 MB data URL, under the serverless request body limit.
const LOGO_MAX = Math.ceil(3 * 1024 * 1024 * 1.4);

const str = (v) => (typeof v === 'string' ? v : '');
const cleanOpacity = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
};

const isImageDataUrl = (v) => typeof v === 'string' && v.startsWith('data:image/');

// Website branding inherits from Platform branding: the Platform logo and
// primary / secondary / action colours (and their opacity) seed the Website
// palette, so configuring Platform flows down as the Website defaults. The
// logo is the same one Platform manages — not an independent image — so the
// two pages always show/upload the same file (see syncLogo below).
async function brandingDefaults(userId) {
  const p = (await brandingRepository.get(userId)) || {};
  const primary = HEX.test(str(p.primaryColor)) ? p.primaryColor.toUpperCase() : WEBSITE_BRANDING_DEFAULTS.primary.color;
  const secondary = HEX.test(str(p.secondaryColor)) ? p.secondaryColor.toUpperCase() : WEBSITE_BRANDING_DEFAULTS.secondary.color;
  const action = HEX.test(str(p.actionColor)) ? p.actionColor.toUpperCase() : WEBSITE_BRANDING_DEFAULTS.action.color;
  return {
    logo: isImageDataUrl(p.logo) ? p.logo : null,
    primary: { color: primary, opacity: cleanOpacity(p.primaryOpacity, WEBSITE_BRANDING_DEFAULTS.primary.opacity) },
    secondary: { color: secondary, opacity: cleanOpacity(p.secondaryOpacity, WEBSITE_BRANDING_DEFAULTS.secondary.opacity) },
    action: { color: action, opacity: cleanOpacity(p.actionOpacity, WEBSITE_BRANDING_DEFAULTS.action.opacity) },
    heading: { color: secondary, opacity: 100 },
    body: { color: WEBSITE_BRANDING_DEFAULTS.body.color, opacity: 100 },
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
  const defaults = await brandingDefaults(req.session.userId);
  const saved = await websiteBrandingRepository.get(req.session.userId);
  // Merge over the defaults so a doc saved before a colour (e.g. action)
  // existed still comes back with every field populated — a missing colour
  // would otherwise paint the swatch with an invalid CSS value (transparent).
  // The logo falls back to the live Platform-derived default whenever the
  // saved doc has none — this self-heals accounts saved before the two pages'
  // logos were kept in sync (below), rather than staying permanently blank.
  res.json({
    defaults,
    saved: saved ? { ...defaults, ...saved, logo: saved.logo || defaults.logo } : null,
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
  const saved = await websiteBrandingRepository.save(req.session.userId, config);
  // Push the logo and primary / secondary / action (colour AND opacity) back
  // UP to Platform branding, mirroring the downward sync in routes/branding.js,
  // so the two pages agree whichever one the user edited.
  await brandingRepository.syncLogo(req.session.userId, config.logo, BRANDING_DEFAULTS);
  await brandingRepository.syncBrandColors(
    req.session.userId, config.primary, config.secondary, config.action, BRANDING_DEFAULTS
  );
  res.json({ saved });
}));

module.exports = router;
