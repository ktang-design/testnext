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
const sanitizeHtml = require('sanitize-html');
const { requireApiAuth } = require('../auth/authGuard');
const { pagesRepository } = require('../website/PagesRepository');
const {
  TITLE_MAX, DESCRIPTION_MAX, MAX_PAGES,
  SECTION_TITLE_MAX, ELEMENT_TITLE_MAX, ELEMENT_BODY_MAX, MAX_SECTIONS, MAX_ELEMENTS,
} = require('../website/defaults');

const router = express.Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const str = (v) => (typeof v === 'string' ? v : '');
const bool = (v) => v === true || v === 'true';
const HEX6 = /^#[0-9a-fA-F]{6}$/;

function slugify(s) {
  const base = str(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base ? '/' + base : '/page';
}

function uniqueId(provided, prefix, used) {
  let id = /^[\w-]{1,64}$/.test(provided) ? provided : '';
  if (!id || used.has(id)) {
    do { id = `${prefix}-${crypto.randomUUID()}`; } while (used.has(id));
  }
  used.add(id);
  return id;
}

// Richtext bodies are stored as HTML; sanitize to a small safe allowlist so a
// stored body can never inject scripts/handlers when rendered.
const RICHTEXT_SANITIZE = {
  allowedTags: [
    'p', 'br', 'div', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup',
    'h1', 'h2', 'h3', 'h4', 'h5', 'ul', 'ol', 'li', 'a', 'blockquote', 'hr', 'img',
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
  ],
  allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt'], '*': ['style'] },
  allowedStyles: {
    '*': {
      'text-align': [/^(left|right|center|justify)$/],
      'margin-left': [/^\d+(\.\d+)?(px|em|rem)$/],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] }, // no data:/svg in <img> (avoid XSS)
  allowProtocolRelative: false,
};
const sanitizeRichtext = (html) => sanitizeHtml(str(html), RICHTEXT_SANITIZE);

function cleanColor(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const color = HEX6.test(str(src.color)) ? str(src.color).toUpperCase() : '#FFFFFF';
  let opacity = Number(src.opacity);
  if (!Number.isFinite(opacity)) opacity = 100;
  return { color, opacity: Math.max(0, Math.min(100, Math.round(opacity))) };
}

// Richtext element styling (colours + border). A missing colour defaults to
// opacity 0 (no override), so absent styles don't paint anything.
const RT_BORDER_WIDTHS = ['1', '2', '4']; // Default(1px) / Medium(2px) / Large(4px)
const styleColor = (c, dc, dop) => (c && typeof c === 'object' ? cleanColor(c) : { color: dc, opacity: dop });
function normalizeRichtextStyle(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const sides = s.borderSides && typeof s.borderSides === 'object'
    ? s.borderSides : { top: true, right: true, bottom: true, left: true };
  return {
    heading: styleColor(s.heading, '#3D3F42', 100),
    text: styleColor(s.text, '#55585D', 100),
    link: styleColor(s.link, '#255096', 100),
    background: styleColor(s.background, '#FFFFFF', 100),
    borderWidth: RT_BORDER_WIDTHS.includes(String(s.borderWidth)) ? String(s.borderWidth) : '1',
    borderSides: { top: bool(sides.top), right: bool(sides.right), bottom: bool(sides.bottom), left: bool(sides.left) },
    borderColor: styleColor(s.borderColor, '#FFFFFF', 0),
  };
}

// Re-shape a page's content (sections + elements) into the canonical stored
// form. Never throws — invalid bits are coerced/dropped — so a save can't fail
// on content. Richtext/code stay PLAIN TEXT (rendered via textContent client-
// side), so there is no HTML/injection surface.
function normalizeContent(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const rawSections = Array.isArray(c.sections) ? c.sections.slice(0, MAX_SECTIONS) : [];
  const usedSec = new Set();
  const sections = rawSections.map((rs) => {
    const s = rs && typeof rs === 'object' ? rs : {};
    const rawEls = Array.isArray(s.elements) ? s.elements.slice(0, MAX_ELEMENTS) : [];
    const usedEl = new Set();
    const elements = rawEls.map((re) => {
      const e = re && typeof re === 'object' ? re : {};
      const type = e.type === 'code' ? 'code' : 'richtext';
      const el = {
        id: uniqueId(str(e.id), 'el', usedEl),
        type,
        title: str(e.title).slice(0, ELEMENT_TITLE_MAX),
        displayTitle: bool(e.displayTitle),
        column: Number(e.column) === 1 ? 1 : 0, // left (0) / right (1) in a 50/50 section
      };
      if (type === 'code') {
        el.code = str(e.code).slice(0, ELEMENT_BODY_MAX);
      } else {
        el.body = sanitizeRichtext(e.body).slice(0, ELEMENT_BODY_MAX);
        el.style = normalizeRichtextStyle(e.style);
      }
      return el;
    });
    return {
      id: uniqueId(str(s.id), 'sec', usedSec),
      title: str(s.title).slice(0, SECTION_TITLE_MAX),
      displayTitle: bool(s.displayTitle),
      columns: Number(s.columns) === 2 ? 2 : 1, // 100% (1) or 50% / 50% (2)
      background: cleanColor(s.background),
      elements,
    };
  });
  return { sections };
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
    return { id, title, description, status, isHomepage: false, slug: '', content: normalizeContent(raw.content) };
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
    limits: {
      title: TITLE_MAX, description: DESCRIPTION_MAX,
      sectionTitle: SECTION_TITLE_MAX, elementTitle: ELEMENT_TITLE_MAX, body: ELEMENT_BODY_MAX,
      maxSections: MAX_SECTIONS, maxElements: MAX_ELEMENTS,
    },
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
