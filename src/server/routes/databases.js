'use strict';
// Features > Databases API (per authenticated user):
//   GET  /api/features/databases          -> { defaults, options, draft, published }
//   PUT  /api/features/databases          -> { draft }      (auto-save; stores the whole config as a draft)
//   POST /api/features/databases/publish  -> { published }  (promotes the current draft to published)
//   POST /api/features/databases/discard  -> { draft }      (reverts the draft to the current published state)
// The record stores one JSON blob — entries + categories + display settings +
// field labels — split into a draft (auto-saved while editing) and a
// published snapshot, exactly like Bento. Every page (list/settings/entry
// form) GETs the full draft, mutates only its own slice, and PUTs the whole
// thing back, so Publish/Discard from any one page correctly applies to
// edits made on any other page.

const express = require('express');
const crypto = require('crypto');
const { requireApiAuth, RESEARCH_PARTICIPANT } = require('../auth/authGuard');
const { userRepository } = require('../auth/repository');
const { databasesRepository: repo } = require('../features/DatabasesRepository');
const { logActivity } = require('../platform/activity');
const D = require('../features/defaults');

const router = express.Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const opt = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const HEX_DATA_IMAGE = /^data:image\//;
// ~3 MB raw -> ~4.1 MB data URL, under the serverless request body limit.
const IMAGE_MAX = Math.ceil(3 * 1024 * 1024 * 1.4);
const validImage = (v) => v == null || (typeof v === 'string' && HEX_DATA_IMAGE.test(v) && v.length <= IMAGE_MAX);

function cleanEntry(raw, usedIds) {
  const b = raw && typeof raw === 'object' ? raw : {};
  let id = str(b.id, 40);
  if (!id || usedIds.has(id)) id = 'dbe_' + crypto.randomUUID();
  usedIds.add(id);
  return {
    id,
    title: str(b.title, D.DATABASES_MAX.title),
    url: str(b.url, D.DATABASES_MAX.url),
    urlAlias: str(b.urlAlias, D.DATABASES_MAX.urlAlias),
    description: str(b.description, D.DATABASES_MAX.description),
    image: validImage(b.image) ? (b.image || null) : null,
    terms: Array.isArray(b.terms)
      ? b.terms
        .filter((t) => t && typeof t === 'object')
        .map((t) => ({ categoryId: str(t.categoryId, 40), term: str(t.term, D.DATABASES_MAX.term) }))
        .filter((t) => t.categoryId && t.term)
        .slice(0, D.DATABASES_MAX.categories * D.DATABASES_MAX.termsPerCategory)
      : [],
    featured: !!b.featured,
  };
}

function cleanCategory(raw, usedIds) {
  const b = raw && typeof raw === 'object' ? raw : {};
  let id = str(b.id, 40);
  if (!id || usedIds.has(id)) id = 'cat_' + crypto.randomUUID();
  usedIds.add(id);
  const terms = Array.isArray(b.terms) ? b.terms.map((t) => str(t, D.DATABASES_MAX.term)).filter(Boolean) : [];
  return {
    id,
    name: str(b.name, D.DATABASES_MAX.categoryName),
    terms: terms.slice(0, D.DATABASES_MAX.termsPerCategory),
  };
}

function cleanDisplay(raw) {
  const b = raw && typeof raw === 'object' ? raw : {};
  const def = D.DATABASES_DEFAULTS.display;
  const resultsPerPage = Number(b.resultsPerPage);
  return {
    azIndex: !!b.azIndex,
    filters: !!b.filters,
    sortOrder: opt(b.sortOrder, D.DATABASES_OPTIONS.sortOrder, def.sortOrder),
    groupBy: opt(b.groupBy, D.DATABASES_OPTIONS.groupBy, def.groupBy),
    resultsPerPage: D.DATABASES_OPTIONS.resultsPerPage.includes(resultsPerPage) ? resultsPerPage : def.resultsPerPage,
  };
}

// The 4 fields are fixed (title/url/description/image) — only their labels
// and display order are user-editable, so normalize against the known set
// rather than trusting arbitrary keys from the client.
function cleanFieldLabels(raw) {
  const def = D.DATABASES_DEFAULTS.fieldLabels;
  const byKey = new Map(def.map((f) => [f.key, f.label]));
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];
  list.forEach((f) => {
    const key = f && typeof f === 'object' ? str(f.key, 20) : '';
    if (!byKey.has(key) || seen.has(key)) return;
    seen.add(key);
    out.push({ key, label: str(f.label, D.DATABASES_MAX.fieldLabel) || byKey.get(key) });
  });
  // Any missing fixed field (e.g. a stale/incomplete payload) is appended
  // back in its factory position so the set is always complete.
  def.forEach((f) => { if (!seen.has(f.key)) out.push({ key: f.key, label: f.label }); });
  return out;
}

function cleanConfig(b, current) {
  const base = current;
  const entryIds = new Set();
  const categoryIds = new Set();
  return {
    configured: typeof b.configured === 'boolean' ? b.configured : !!base.configured,
    entries: Array.isArray(b.entries)
      ? b.entries.slice(0, D.DATABASES_MAX.entries).map((e) => cleanEntry(e, entryIds))
      : base.entries,
    categories: Array.isArray(b.categories)
      ? b.categories.slice(0, D.DATABASES_MAX.categories).map((c) => cleanCategory(c, categoryIds))
      : base.categories,
    display: b.display ? cleanDisplay(b.display) : base.display,
    fieldLabels: b.fieldLabels ? cleanFieldLabels(b.fieldLabels) : base.fieldLabels,
  };
}

// Research participant accounts start from sample content (until they save
// their own); every other role starts empty.
async function defaultsFor(req) {
  const user = await userRepository.findById(req.session.userId);
  return user && user.role === RESEARCH_PARTICIPANT ? D.RESEARCH_PARTICIPANT_DATABASES_DEFAULTS : D.DATABASES_DEFAULTS;
}

router.get('/databases', requireApiAuth, ah(async (req, res) => {
  const { draft, published } = await repo.get(req.session.userId);
  res.json({ defaults: await defaultsFor(req), options: D.DATABASES_OPTIONS, draft, published });
}));

// Auto-save only — no activity log entry here, or editing would spam the log
// roughly every 2 seconds. The meaningful, logged action is Publish below.
router.put('/databases', requireApiAuth, ah(async (req, res) => {
  const { draft: current } = await repo.get(req.session.userId);
  const config = cleanConfig(req.body || {}, current || await defaultsFor(req));
  const draft = await repo.saveDraft(req.session.userId, config);
  res.json({ draft });
}));

router.post('/databases/publish', requireApiAuth, ah(async (req, res) => {
  const published = await repo.publish(req.session.userId, await defaultsFor(req));
  await logActivity(req.session.userId, {
    pre: 'Published ', linkLabel: 'Databases', linkHref: '/features/databases/', post: '.',
  });
  res.json({ published });
}));

router.post('/databases/discard', requireApiAuth, ah(async (req, res) => {
  const draft = await repo.discard(req.session.userId, await defaultsFor(req));
  res.json({ draft });
}));

module.exports = router;
