'use strict';
// Pages API (per authenticated user). The Pages builder saves the whole ordered
// set at once, so:
//   GET  /api/website/pages  -> { pages, limits }
//   PUT  /api/website/pages  -> { saved }   (replaces the full ordered set)
//
// On save the server normalizes the set: titles required + bounded, exactly one
// homepage (slug '/'), unique slugs derived from titles, and ids preserved so
// navigation links to these pages keep working.

const express = require('express');
const crypto = require('crypto');
const { requireApiAuth } = require('../auth/authGuard');
const { pagesRepository } = require('../website/PagesRepository');
const { TITLE_MAX, DESCRIPTION_MAX, MAX_PAGES } = require('../website/defaults');

const router = express.Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const str = (v) => (typeof v === 'string' ? v : '');

function slugify(s) {
  const base = str(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base ? '/' + base : '/page';
}

class ValidationError extends Error {
  constructor(message) { super(message); this.code = 'INVALID_PAGE'; }
}

function normalize(rawPages) {
  if (!Array.isArray(rawPages)) throw new ValidationError('Pages must be a list.');
  if (rawPages.length > MAX_PAGES) throw new ValidationError('Too many pages.');

  const usedIds = new Set();
  let homepageIndex = -1;

  const pages = rawPages.map((raw, i) => {
    if (!raw || typeof raw !== 'object') throw new ValidationError('Invalid page.');
    const title = str(raw.title).trim();
    if (!title) throw new ValidationError('Every page needs a title.');
    if (title.length > TITLE_MAX) throw new ValidationError(`Titles must be ${TITLE_MAX} characters or fewer.`);
    const description = str(raw.description).trim().slice(0, DESCRIPTION_MAX);
    const status = raw.status === 'draft' ? 'draft' : 'published';

    let id = /^[\w-]{1,64}$/.test(str(raw.id)) ? str(raw.id) : 'page-' + crypto.randomUUID();
    while (usedIds.has(id)) id = 'page-' + crypto.randomUUID();
    usedIds.add(id);

    if (raw.isHomepage && homepageIndex === -1) homepageIndex = i;
    return { id, title, description, status, isHomepage: false, slug: '' };
  });

  // Exactly one homepage; default to the first page when none is flagged.
  if (homepageIndex === -1 && pages.length) homepageIndex = 0;
  pages.forEach((p, i) => { p.isHomepage = i === homepageIndex; });

  // The homepage is pinned to the top of the list.
  if (homepageIndex > 0) pages.unshift(pages.splice(homepageIndex, 1)[0]);

  // Slugs: homepage is '/', the rest are unique slugified titles.
  const usedSlugs = new Set();
  pages.forEach((p) => { if (p.isHomepage) { p.slug = '/'; usedSlugs.add('/'); } });
  pages.forEach((p) => {
    if (p.isHomepage) return;
    const base = slugify(p.title);
    let slug = base;
    let n = 2;
    while (usedSlugs.has(slug)) { slug = `${base}-${n}`; n++; }
    p.slug = slug;
    usedSlugs.add(slug);
  });

  return pages;
}

router.get('/', requireApiAuth, ah(async (req, res) => {
  // Guarantee every account has at least the starred Homepage (no-op if it
  // already has pages) so the list is never empty.
  await pagesRepository.seedDefaults(req.session.userId);
  res.json({
    pages: await pagesRepository.list(req.session.userId),
    limits: { title: TITLE_MAX, description: DESCRIPTION_MAX },
  });
}));

router.put('/', requireApiAuth, ah(async (req, res) => {
  let pages;
  try {
    pages = normalize((req.body || {}).pages);
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.code, message: err.message });
    throw err;
  }
  res.json({ saved: await pagesRepository.replaceAll(req.session.userId, pages) });
}));

module.exports = router;
