'use strict';
// Website layer API: published pages + the navigation tree.
//   GET  /api/website/navigation  -> { navigation, publishedPages }
//   PUT  /api/website/navigation  -> { saved }
// The navigation tree is validated and re-shaped to a canonical form on save;
// on read, page items are annotated with `available` (false when the linked
// page is missing or no longer published) so the client can disable them.

const express = require('express');
const { requireApiAuth } = require('../auth/authGuard');
const { pagesRepository } = require('../website/PagesRepository');
const { navigationRepository } = require('../website/NavigationRepository');
const { headerRepository } = require('../website/HeaderRepository');
const { footerRepository } = require('../website/FooterRepository');
const { typographyRepository } = require('../website/TypographyRepository');
const {
  LABEL_MAX, URL_MAX, MAX_ITEMS, MAX_DEPTH,
  HEADER_DEFAULTS, HEADER_HEADING_MAX, HEADER_DESCRIPTION_MAX,
  FOOTER_DEFAULTS, TYPOGRAPHY_DEFAULTS, TYPOGRAPHY_OPTIONS,
} = require('../website/defaults');

const router = express.Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const str = (v) => (typeof v === 'string' ? v : '');
const HEX = /^#[0-9a-fA-F]{6}$/;

// A custom link may be an absolute http(s) URL, a root-relative path, an
// anchor, or a mailto/tel link. Keep it permissive but bounded.
function validUrl(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (!s || s.length > URL_MAX) return false;
  return /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(s);
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.code = 'INVALID_NAVIGATION';
  }
}

// The user's pages are preloaded once per request into a Map(id -> page), so
// sanitize/annotate stay synchronous (no per-item DB round-trips).
async function loadPageMap(userId) {
  const pages = await pagesRepository.list(userId);
  return { pages, map: new Map(pages.map((p) => [p.id, p])) };
}

// Re-shape arbitrary input into the canonical stored form, validating as we go.
function sanitize(items, pageMap, depth, counter) {
  if (!Array.isArray(items)) throw new ValidationError('Navigation must be a list of items.');
  return items.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new ValidationError('Invalid navigation item.');
    if (++counter.n > MAX_ITEMS) throw new ValidationError('Too many navigation items.');

    const type = raw.type === 'custom' ? 'custom' : 'page';
    const label = str(raw.label).trim();
    if (!label) throw new ValidationError('Every item needs a label.');
    if (label.length > LABEL_MAX) throw new ValidationError(`Labels must be ${LABEL_MAX} characters or fewer.`);

    const item = { id: str(raw.id) || null, type, pageId: null, url: null, label, children: [] };

    if (type === 'page') {
      const page = pageMap.get(str(raw.pageId));
      if (!page) throw new ValidationError('A linked page no longer exists.');
      item.pageId = page.id;
    } else {
      if (!validUrl(raw.url)) throw new ValidationError('Enter a valid URL for the custom link.');
      item.url = str(raw.url).trim();
    }

    if (Array.isArray(raw.children) && raw.children.length) {
      if (depth + 1 >= MAX_DEPTH) throw new ValidationError('Navigation can only nest one level deep.');
      item.children = sanitize(raw.children, pageMap, depth + 1, counter);
    }
    return item;
  });
}

// Annotate page items with the live page title + availability for the client.
function annotate(items, pageMap) {
  return items.map((it) => {
    const out = { ...it, children: annotate(it.children || [], pageMap) };
    if (it.type === 'page') {
      const page = pageMap.get(it.pageId);
      out.available = !!page && page.status === 'published';
      out.pageTitle = page ? page.title : null;
      out.pageStatus = page ? page.status : 'missing';
    } else {
      out.available = true;
    }
    return out;
  });
}

router.get('/navigation', requireApiAuth, ah(async (req, res) => {
  const userId = req.session.userId;
  const { pages, map } = await loadPageMap(userId);
  const saved = (await navigationRepository.get(userId)) || [];
  res.json({
    navigation: annotate(saved, map),
    publishedPages: pages.filter((p) => p.status === 'published').map((p) => ({ id: p.id, title: p.title })),
  });
}));

router.put('/navigation', requireApiAuth, ah(async (req, res) => {
  const userId = req.session.userId;
  const { map } = await loadPageMap(userId);
  let clean;
  try {
    clean = sanitize((req.body || {}).items, map, 0, { n: 0 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.code, message: err.message });
    }
    throw err;
  }
  await navigationRepository.save(userId, clean);
  res.json({ saved: annotate(clean, map) });
}));

// ---------------------------------------------------------------------------
// Header configuration
// ---------------------------------------------------------------------------
function cleanColor(raw, fallback) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const color = HEX.test(str(src.color)) ? str(src.color).toUpperCase() : fallback.color;
  let opacity = Number(src.opacity);
  if (!Number.isFinite(opacity)) opacity = fallback.opacity;
  opacity = Math.max(0, Math.min(100, Math.round(opacity)));
  return { color, opacity };
}

router.get('/header', requireApiAuth, ah(async (req, res) => {
  res.json({ defaults: HEADER_DEFAULTS, saved: await headerRepository.get(req.session.userId) });
}));

router.put('/header', requireApiAuth, ah(async (req, res) => {
  const b = req.body || {};
  const config = {
    logo: b.logo === 'center' ? 'center' : 'left',
    nav: b.nav === 'aligned' ? 'aligned' : 'left',
    background: cleanColor(b.background, HEADER_DEFAULTS.background),
    links: cleanColor(b.links, HEADER_DEFAULTS.links),
    heading: str(b.heading).trim().slice(0, HEADER_HEADING_MAX),
    description: str(b.description).trim().slice(0, HEADER_DESCRIPTION_MAX),
  };
  res.json({ saved: await headerRepository.save(req.session.userId, config) });
}));

// ---------------------------------------------------------------------------
// Footer configuration
// ---------------------------------------------------------------------------
router.get('/footer', requireApiAuth, ah(async (req, res) => {
  res.json({ defaults: FOOTER_DEFAULTS, saved: await footerRepository.get(req.session.userId) });
}));

router.put('/footer', requireApiAuth, ah(async (req, res) => {
  const b = req.body || {};
  const rawLinks = Array.isArray(b.links) ? b.links : [];
  if (rawLinks.length > MAX_ITEMS) {
    return res.status(400).json({ error: 'TOO_MANY', message: 'Too many footer links.' });
  }
  const links = [];
  for (const raw of rawLinks) {
    if (!raw || typeof raw !== 'object') continue;
    const label = str(raw.label).trim();
    if (!label) return res.status(400).json({ error: 'INVALID_FOOTER', message: 'Every link needs a label.' });
    if (label.length > LABEL_MAX) return res.status(400).json({ error: 'INVALID_FOOTER', message: `Labels must be ${LABEL_MAX} characters or fewer.` });
    if (!validUrl(raw.url)) return res.status(400).json({ error: 'INVALID_FOOTER', message: 'Enter a valid URL for the custom link.' });
    links.push({ id: str(raw.id) || null, url: str(raw.url).trim(), label });
  }
  const config = { showLogo: !!b.showLogo, showNavigation: !!b.showNavigation, links };
  res.json({ saved: await footerRepository.save(req.session.userId, config) });
}));

// ---------------------------------------------------------------------------
// Typography configuration
// ---------------------------------------------------------------------------
function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

// Coerce a typography payload to the canonical, validated shape. Used on save and
// on read, so configs saved under the old option set migrate to the new options.
function normalizeTypography(b) {
  b = b || {};
  return {
    fontFamily: str(b.fontFamily).trim().slice(0, 60) || TYPOGRAPHY_DEFAULTS.fontFamily,
    headingSize: pick(str(b.headingSize), TYPOGRAPHY_OPTIONS.headingSize, TYPOGRAPHY_DEFAULTS.headingSize),
    headingWeight: pick(str(b.headingWeight), TYPOGRAPHY_OPTIONS.headingWeight, TYPOGRAPHY_DEFAULTS.headingWeight),
    bodySize: pick(str(b.bodySize), TYPOGRAPHY_OPTIONS.bodySize, TYPOGRAPHY_DEFAULTS.bodySize),
    bodyWeight: pick(str(b.bodyWeight), TYPOGRAPHY_OPTIONS.bodyWeight, TYPOGRAPHY_DEFAULTS.bodyWeight),
  };
}

router.get('/typography', requireApiAuth, ah(async (req, res) => {
  const saved = await typographyRepository.get(req.session.userId);
  res.json({ defaults: TYPOGRAPHY_DEFAULTS, saved: saved ? normalizeTypography(saved) : null });
}));

router.put('/typography', requireApiAuth, ah(async (req, res) => {
  const config = normalizeTypography(req.body);
  res.json({ saved: await typographyRepository.save(req.session.userId, config) });
}));

module.exports = router;
