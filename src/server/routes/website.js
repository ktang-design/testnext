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
const { LABEL_MAX, URL_MAX, MAX_ITEMS, MAX_DEPTH } = require('../website/defaults');

const router = express.Router();

const HOME_PAGE_ID = 'page-home';
const HOME_ITEM = () => ({ id: 'nav-home', type: 'page', pageId: HOME_PAGE_ID, url: null, label: 'Homepage', children: [], home: true });

const str = (v) => (typeof v === 'string' ? v : '');

function flattenItems(items, out) {
  out = out || [];
  (items || []).forEach((it) => { out.push(it); flattenItems(it.children, out); });
  return out;
}

// Exactly one item is the homepage (the "star"). Enforce that invariant: keep
// the first starred item, clear any extras, and if none is starred, designate
// one — preferring an existing Homepage page, otherwise prepending a new one.
function ensureOneHome(items) {
  const flat = flattenItems(items);
  const starred = flat.filter((it) => it.home === true);
  if (starred.length === 1) return items;
  if (starred.length > 1) {
    starred.slice(1).forEach((it) => { it.home = false; });
    return items;
  }
  const existing = flat.find((it) => it.type === 'page' && it.pageId === HOME_PAGE_ID);
  if (existing) { existing.home = true; return items; }
  return [HOME_ITEM(), ...items];
}

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

// Re-shape arbitrary input into the canonical stored form, validating as we go.
function sanitize(items, userId, depth, counter) {
  if (!Array.isArray(items)) throw new ValidationError('Navigation must be a list of items.');
  return items.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new ValidationError('Invalid navigation item.');
    if (++counter.n > MAX_ITEMS) throw new ValidationError('Too many navigation items.');

    const type = raw.type === 'custom' ? 'custom' : 'page';
    const label = str(raw.label).trim();
    if (!label) throw new ValidationError('Every item needs a label.');
    if (label.length > LABEL_MAX) throw new ValidationError(`Labels must be ${LABEL_MAX} characters or fewer.`);

    const item = { id: str(raw.id) || null, type, pageId: null, url: null, label, children: [], home: false };

    if (type === 'page') {
      const page = pagesRepository.getById(userId, str(raw.pageId));
      if (!page) throw new ValidationError('A linked page no longer exists.');
      item.pageId = page.id;
      // Only a page can be the homepage (the star).
      item.home = raw.home === true;
    } else {
      if (!validUrl(raw.url)) throw new ValidationError('Enter a valid URL for the custom link.');
      item.url = str(raw.url).trim();
    }

    if (Array.isArray(raw.children) && raw.children.length) {
      if (depth + 1 >= MAX_DEPTH) throw new ValidationError('Navigation can only nest one level deep.');
      item.children = sanitize(raw.children, userId, depth + 1, counter);
    }
    return item;
  });
}

// Annotate page items with the live page title + availability for the client.
function annotate(items, userId) {
  return items.map((it) => {
    const out = { ...it, children: annotate(it.children || [], userId) };
    if (it.type === 'page') {
      const page = pagesRepository.getById(userId, it.pageId);
      out.available = !!page && page.status === 'published';
      out.pageTitle = page ? page.title : null;
      out.pageStatus = page ? page.status : 'missing';
    } else {
      out.available = true;
    }
    // The starred homepage item (undeletable; the client moves the star).
    out.home = it.home === true;
    return out;
  });
}

router.get('/navigation', requireApiAuth, (req, res) => {
  const userId = req.session.userId;
  pagesRepository.ensureHome(userId);
  const saved = ensureOneHome(navigationRepository.get(userId) || []);
  res.json({
    navigation: annotate(saved, userId),
    publishedPages: pagesRepository.listPublished(userId).map((p) => ({ id: p.id, title: p.title })),
  });
});

router.put('/navigation', requireApiAuth, (req, res) => {
  const userId = req.session.userId;
  pagesRepository.ensureHome(userId);
  let clean;
  try {
    clean = sanitize((req.body || {}).items, userId, 0, { n: 0 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.code, message: err.message });
    }
    throw err;
  }
  navigationRepository.save(userId, ensureOneHome(clean));
  res.json({ saved: annotate(navigationRepository.get(userId), userId) });
});

module.exports = router;
