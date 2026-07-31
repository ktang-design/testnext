'use strict';
// Features APIs (per authenticated user):
//   GET /api/features/bento  -> { defaults, options, saved }
//   PUT /api/features/bento  -> { saved }
// The bento record is a single JSON doc: a search-integration flag plus the
// ordered list of blocks. PUT merges the provided fields onto the existing
// record so the Platform > Integrations toggle (integrationConfigured only) and
// the Bento page Save (blocks) don't clobber each other.

const express = require('express');
const crypto = require('crypto');
const { requireApiAuth } = require('../auth/authGuard');
const { bentoRepository: repo } = require('../features/BentoRepository');
const { logActivity } = require('../platform/activity');
const D = require('../features/defaults');

const router = express.Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// Keep only whitelisted option values; anything else (incl. the "All options"
// placeholder) normalizes to '' — meaning no filter.
const opt = (v, allowed) => (allowed.includes(v) ? v : '');

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
  res.json({
    defaults: D.BENTO_DEFAULTS,
    options: D.BENTO_OPTIONS,
    saved: await repo.get(req.session.userId),
  });
}));

router.put('/bento', requireApiAuth, ah(async (req, res) => {
  const b = req.body || {};
  const current = (await repo.get(req.session.userId)) || D.BENTO_DEFAULTS;

  const config = {
    integrationConfigured: typeof b.integrationConfigured === 'boolean'
      ? b.integrationConfigured
      : !!current.integrationConfigured,
    blocks: Array.isArray(b.blocks)
      ? b.blocks.slice(0, D.BENTO_MAX.blocks).map(cleanBlock)
      : (Array.isArray(current.blocks) ? current.blocks : []),
  };

  const saved = await repo.save(req.session.userId, config);
  await logActivity(req.session.userId, {
    pre: 'Updated ', linkLabel: 'Bento', linkHref: '/features/bento/', post: '.',
  });
  res.json({ saved });
}));

module.exports = router;
