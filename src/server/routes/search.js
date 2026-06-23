'use strict';
// Website search API (the search bar shown below the navigation): its background
// colour + optional background image, plus the list of configured searches.
// Mounted under the large body parser because the background image is a data URL.
//   GET  /api/website/search -> { defaults, saved }
//   PUT  /api/website/search -> { saved }

const express = require('express');
const crypto = require('crypto');
const { requireApiAuth } = require('../auth/authGuard');
const { searchRepository } = require('../website/SearchRepository');
const {
  SEARCH_DEFAULTS, SEARCH_NAME_MAX, SEARCH_LABEL_MAX, SEARCH_BUTTON_MAX, MAX_SEARCHES, URL_MAX,
} = require('../website/defaults');

const router = express.Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const HEX = /^#[0-9a-fA-F]{6}$/;
// ~3 MB raw → ~4.1 MB data URL, under the serverless request body limit.
const IMAGE_MAX = Math.ceil(3 * 1024 * 1024 * 1.4);
const str = (v) => (typeof v === 'string' ? v : '');
const bool = (v) => v === true || v === 'true';

function cleanColor(raw, fallback) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const color = HEX.test(str(src.color)) ? str(src.color).toUpperCase() : fallback.color;
  let opacity = Number(src.opacity);
  if (!Number.isFinite(opacity)) opacity = fallback.opacity;
  opacity = Math.max(0, Math.min(100, Math.round(opacity)));
  return { color, opacity };
}

class ValidationError extends Error {
  constructor(message) { super(message); this.code = 'INVALID_SEARCH'; }
}

function cleanSearch(raw, used) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const type = s.type === 'eds' ? 'eds' : 'custom';
  const name = str(s.name).trim();
  if (!name) throw new ValidationError('Every search needs a name.');
  if (name.length > SEARCH_NAME_MAX) throw new ValidationError(`Names must be ${SEARCH_NAME_MAX} characters or fewer.`);
  const displayLabel = str(s.displayLabel).trim().slice(0, SEARCH_LABEL_MAX);
  const url = str(s.url).trim().slice(0, URL_MAX);
  if (url && !/^https?:\/\//i.test(url)) throw new ValidationError('Search URL must start with http:// or https://.');
  const buttonLabel = str(s.buttonLabel).trim().slice(0, SEARCH_BUTTON_MAX) || 'Search';

  let id = /^[\w-]{1,64}$/.test(str(s.id)) ? str(s.id) : '';
  if (!id || used.has(id)) { do { id = 'search-' + crypto.randomUUID(); } while (used.has(id)); }
  used.add(id);
  return { id, type, name, displayLabel, url, urlencode: s.urlencode == null ? true : bool(s.urlencode), buttonLabel, isDefault: bool(s.isDefault) };
}

function normalize(raw) {
  const b = raw && typeof raw === 'object' ? raw : {};
  const image = b.backgroundImage;
  if (image != null && !(typeof image === 'string' && image.startsWith('data:image/') && image.length <= IMAGE_MAX)) {
    throw new ValidationError('Background image must be an image within 3 MB.');
  }
  const rawList = Array.isArray(b.searches) ? b.searches : [];
  if (rawList.length > MAX_SEARCHES) throw new ValidationError('Too many searches.');
  const used = new Set();
  const searches = rawList.map((s) => cleanSearch(s, used));
  // Exactly one default search (the starred one). Default to the first when none
  // is flagged, so the list always has a default once it is non-empty.
  let di = searches.findIndex((s) => s.isDefault);
  if (di === -1 && searches.length) di = 0;
  searches.forEach((s, i) => { s.isDefault = i === di; });
  return {
    background: cleanColor(b.background, SEARCH_DEFAULTS.background),
    backgroundImage: image || null,
    searches,
  };
}

router.get('/', requireApiAuth, ah(async (req, res) => {
  res.json({ defaults: SEARCH_DEFAULTS, saved: await searchRepository.get(req.session.userId) });
}));

router.put('/', requireApiAuth, ah(async (req, res) => {
  let config;
  try {
    config = normalize(req.body);
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.code, message: err.message });
    throw err;
  }
  res.json({ saved: await searchRepository.save(req.session.userId, config) });
}));

module.exports = router;
