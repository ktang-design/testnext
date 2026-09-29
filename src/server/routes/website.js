'use strict';
// Website layer API: pages + the navigation tree + header/footer/typography,
// plus the three endpoints that drive the shared Page Builder pageactions bar
// (auto-save is per-section, but Publish/Discard always act on every section
// together — see the "Page Builder" plan for the full rationale):
//   GET  /api/website/publish-status -> { dirty }
//   POST /api/website/publish-all    -> { published: { ... } } (one entry per section)
//   POST /api/website/discard-all    -> { draft: { ... } }
//
//   GET  /api/website/navigation  -> { navigation, publishedPages }
//   PUT  /api/website/navigation  -> { saved }   (auto-save only)
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
const { searchRepository } = require('../website/SearchRepository');
const { websiteBrandingRepository } = require('../website/WebsiteBrandingRepository');
const { brandingRepository } = require('../settings/BrandingRepository');
const { logActivity } = require('../platform/activity');
const { BRANDING_DEFAULTS } = require('../settings/defaults');
const {
  LABEL_MAX, URL_MAX, MAX_ITEMS, MAX_DEPTH,
  HEADER_DEFAULTS,
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
  const { draft, published } = await navigationRepository.get(userId);
  res.json({
    navigation: annotate(draft || [], map),
    // The last-published navigation tree — not to be confused with
    // `publishedPages` below (individually-published pages available to link
    // to), used to compute whether this section has unpublished changes.
    publishedNavigation: annotate(published || [], map),
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
  // Auto-save only — no activity log entry here, or editing would spam the
  // log roughly every 2 seconds. The meaningful, logged action is Publish
  // (POST /api/website/publish-all).
  await navigationRepository.saveDraft(userId, clean);
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

// Header/footer background defaults to the brand Primary colour (Branding's
// colour-mapping rule #1) until the user picks their own background.
async function primaryColor(userId) {
  const p = (await brandingRepository.get(userId)) || {};
  return HEX.test(str(p.primaryColor)) ? p.primaryColor.toUpperCase() : BRANDING_DEFAULTS.primaryColor;
}

// ~3 MB raw → ~4.1 MB data URL, under the serverless request body limit.
const HEADER_IMAGE_MAX = Math.ceil(3 * 1024 * 1024 * 1.4);

router.get('/header', requireApiAuth, ah(async (req, res) => {
  const defaults = { ...HEADER_DEFAULTS, background: { color: await primaryColor(req.session.userId), opacity: 100 } };
  const { draft, published } = await headerRepository.get(req.session.userId);
  // Merge over the defaults so a doc saved before a field (e.g. siteName,
  // searchBackground, headerImage) existed still comes back fully populated.
  const merge = (saved) => (saved ? { ...defaults, ...saved } : null);
  res.json({ defaults, saved: merge(draft), draft: merge(draft), published: merge(published) });
}));

router.put('/header', requireApiAuth, ah(async (req, res) => {
  const b = req.body || {};
  if (b.headerImage != null && !(typeof b.headerImage === 'string' && b.headerImage.startsWith('data:image/') && b.headerImage.length <= HEADER_IMAGE_MAX)) {
    return res.status(400).json({ error: 'INVALID_IMAGE', message: 'Header image must be an image within 3 MB.' });
  }
  const config = {
    logo: b.logo === 'center' ? 'center' : 'left',
    nav: b.nav === 'aligned' ? 'aligned' : 'left',
    siteName: cleanColor(b.siteName, HEADER_DEFAULTS.siteName),
    background: cleanColor(b.background, HEADER_DEFAULTS.background),
    searchBackground: cleanColor(b.searchBackground, HEADER_DEFAULTS.searchBackground),
    headerImage: b.headerImage || null,
  };
  // Auto-save only — no activity log entry here, or editing would spam the
  // log roughly every 2 seconds. The meaningful, logged action is Publish
  // (POST /api/website/publish-all).
  res.json({ saved: await headerRepository.saveDraft(req.session.userId, config) });
}));

// ---------------------------------------------------------------------------
// Footer configuration
// ---------------------------------------------------------------------------
router.get('/footer', requireApiAuth, ah(async (req, res) => {
  const defaults = { ...FOOTER_DEFAULTS, background: { color: await primaryColor(req.session.userId), opacity: 100 } };
  const { draft, published } = await footerRepository.get(req.session.userId);
  res.json({ defaults, saved: draft, draft, published });
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
  const config = {
    showLogo: !!b.showLogo,
    showNavigation: !!b.showNavigation,
    background: cleanColor(b.background, FOOTER_DEFAULTS.background),
    text: cleanColor(b.text, FOOTER_DEFAULTS.text),
    link: cleanColor(b.link, FOOTER_DEFAULTS.link),
    links,
  };
  // Auto-save only — see the note on the header PUT above.
  res.json({ saved: await footerRepository.saveDraft(req.session.userId, config) });
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
  const { draft, published } = await typographyRepository.get(req.session.userId);
  const norm = (saved) => (saved ? normalizeTypography(saved) : null);
  res.json({ defaults: TYPOGRAPHY_DEFAULTS, saved: norm(draft), draft: norm(draft), published: norm(published) });
}));

router.put('/typography', requireApiAuth, ah(async (req, res) => {
  const config = normalizeTypography(req.body);
  // Auto-save only — see the note on the header PUT above.
  res.json({ saved: await typographyRepository.saveDraft(req.session.userId, config) });
}));

// ---------------------------------------------------------------------------
// Cross-section publish status + Publish/Discard-all (drives the shared
// Page Builder pageactions bar — Publish and Discard always act on every
// section together, never just the one the user happens to be viewing).
// ---------------------------------------------------------------------------

// Every section this bar covers, each exposing the same {draft, published}
// shape from its own repository's get(). Pages is relational (list/listPublished
// instead of a JSON blob) so it's handled separately below.
const BLOB_SECTIONS = [
  navigationRepository, searchRepository, headerRepository, footerRepository, typographyRepository, websiteBrandingRepository,
];

async function anySectionDirty(userId) {
  for (const repo of BLOB_SECTIONS) {
    const { draft, published } = await repo.get(userId);
    if (JSON.stringify(draft || null) !== JSON.stringify(published || null)) return true;
  }
  const [draftPages, publishedPages] = await Promise.all([pagesRepository.list(userId), pagesRepository.listPublished(userId)]);
  return JSON.stringify(draftPages) !== JSON.stringify(publishedPages);
}

router.get('/publish-status', requireApiAuth, ah(async (req, res) => {
  res.json({ dirty: await anySectionDirty(req.session.userId) });
}));

router.post('/publish-all', requireApiAuth, ah(async (req, res) => {
  const userId = req.session.userId;
  const [pages, navigation, search, header, footer, typography, branding] = await Promise.all([
    pagesRepository.publish(userId),
    navigationRepository.publish(userId),
    searchRepository.publish(userId),
    headerRepository.publish(userId),
    footerRepository.publish(userId),
    typographyRepository.publish(userId),
    websiteBrandingRepository.publish(userId),
  ]);
  // Push the just-published Website Branding logo/colours up to Platform
  // Branding now that they're live, mirroring the sync that used to fire on
  // every save — moved here so an in-progress edit never leaks into System
  // Settings before it's actually published. Only when Website Branding was
  // ever actually saved (publish() on an untouched account returns `{}`, with
  // none of these fields present).
  if (branding.primary && branding.secondary && branding.action) {
    await brandingRepository.syncLogo(userId, branding.logo, BRANDING_DEFAULTS);
    await brandingRepository.syncBrandColors(userId, branding.primary, branding.secondary, branding.action, BRANDING_DEFAULTS);
  }
  await logActivity(userId, { pre: 'Published ', linkLabel: 'Page Builder changes', linkHref: '/website/', post: '.' });
  res.json({ published: { pages, navigation, search, header, footer, typography, branding } });
}));

router.post('/discard-all', requireApiAuth, ah(async (req, res) => {
  const userId = req.session.userId;
  const [pages, navigation, search, header, footer, typography, branding] = await Promise.all([
    pagesRepository.discard(userId),
    navigationRepository.discard(userId),
    searchRepository.discard(userId),
    headerRepository.discard(userId),
    footerRepository.discard(userId),
    typographyRepository.discard(userId),
    websiteBrandingRepository.discard(userId),
  ]);
  res.json({ draft: { pages, navigation, search, header, footer, typography, branding } });
}));

module.exports = router;
