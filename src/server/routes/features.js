'use strict';
// Features APIs (per authenticated user):
//   GET  /api/features/bento          -> { defaults, options, draft, published, integrationConfigured }
//   PUT  /api/features/bento          -> { draft }      (auto-save; stores the ordered blocks as a draft)
//   POST /api/features/bento/publish  -> { published }  (promotes the current draft to published)
//   POST /api/features/bento/discard  -> { draft }      (reverts the draft to the current published state)
// The bento record stores only the ordered list of blocks, split into a draft
// (auto-saved while editing) and a published snapshot (what the live site
// reflects). Whether a search integration is configured is DERIVED from the
// EBSCO Discovery Service settings (all required EDS fields filled), not
// stored here.

const express = require('express');
const crypto = require('crypto');
const { requireApiAuth } = require('../auth/authGuard');
const { bentoRepository: repo } = require('../features/BentoRepository');
const { platformSettingsRepository } = require('../platform/PlatformSettingsRepository');
const { logActivity } = require('../platform/activity');
const D = require('../features/defaults');

const router = express.Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// Keep only whitelisted option values; anything else (incl. the "All options"
// placeholder) normalizes to '' — meaning no filter.
const opt = (v, allowed) => (allowed.includes(v) ? v : '');

// A search integration is "configured" once every required EDS field is filled.
const EDS_REQUIRED = ['apiUsername', 'apiPassword', 'customerId', 'groupId', 'profile', 'opid'];
async function edsConfigured(userId) {
  const eds = await platformSettingsRepository.get(userId, 'eds');
  if (!eds) return false;
  return EDS_REQUIRED.every((k) => String(eds[k] || '').trim() !== '');
}

function cleanBlock(raw) {
  const b = raw && typeof raw === 'object' ? raw : {};
  return {
    id: str(b.id, 40) || 'b_' + crypto.randomUUID(),
    name: str(b.name, D.BENTO_MAX.name),
    sourceType: opt(b.sourceType, D.BENTO_OPTIONS.sourceType),
    contentProvider: opt(b.contentProvider, D.BENTO_OPTIONS.contentProvider),
    subjects: opt(b.subjects, D.BENTO_OPTIONS.subjects),
  };
}

router.get('/bento', requireApiAuth, ah(async (req, res) => {
  const { draft, published } = await repo.get(req.session.userId);
  res.json({
    defaults: D.BENTO_DEFAULTS,
    options: D.BENTO_OPTIONS,
    draft,
    published,
    integrationConfigured: await edsConfigured(req.session.userId),
  });
}));

// Auto-save only — no activity log entry here, or editing would spam the log
// roughly every 2 seconds. The meaningful, logged action is Publish below.
router.put('/bento', requireApiAuth, ah(async (req, res) => {
  const b = req.body || {};
  const { draft: current } = await repo.get(req.session.userId);
  const config = {
    blocks: Array.isArray(b.blocks)
      ? b.blocks.slice(0, D.BENTO_MAX.blocks).map(cleanBlock)
      : (Array.isArray((current || D.BENTO_DEFAULTS).blocks) ? (current || D.BENTO_DEFAULTS).blocks : []),
  };
  const draft = await repo.saveDraft(req.session.userId, config);
  res.json({ draft });
}));

router.post('/bento/publish', requireApiAuth, ah(async (req, res) => {
  const published = await repo.publish(req.session.userId);
  await logActivity(req.session.userId, {
    pre: 'Published ', linkLabel: 'Bento', linkHref: '/features/bento/', post: '.',
  });
  res.json({ published });
}));

router.post('/bento/discard', requireApiAuth, ah(async (req, res) => {
  const draft = await repo.discard(req.session.userId);
  res.json({ draft });
}));

module.exports = router;
