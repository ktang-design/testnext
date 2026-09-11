'use strict';
// Turn a Pages save into Activity-log entries by DIFFING the stored page set
// against the incoming one.
//
// The builder saves the whole set in one PUT, so the save itself says nothing
// about what changed. This reports the meaningful TRANSITIONS — pages, sections,
// elements and cards appearing, disappearing, being renamed, reordered or
// published — and names the things involved. A save that only adjusts styling,
// colours, or body copy yields no entries, so re-saving stays silent.
//
// Sentence shape follows the Activity log design (Figma 2897:36667): the LINK is
// the noun that changed ("page", "section", "element") and the specific value sits
// in quotes beside it. Each link points at exactly where it happened —
// /website/pages/<page>, .../<page>/<section>, or .../<page>/<section>/<element>
// — mirroring the builder's own URLs (see syncUrl/currentPath in pages.js), so a
// row takes you straight there instead of just to the page's section list.

const PAGES_HREF = '/website/pages/';
// A single save must not be able to flood the log; the overflow collapses to a count.
const MAX_EVENTS = 12;

const q = (s) => '“' + String(s == null ? '' : s) + '”';
const byId = (list) => new Map((list || []).map((x) => [x.id, x]));
const ids = (list) => (list || []).map((x) => x.id);
const sameOrder = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const sameMembers = (a, b) => a.length === b.length && a.every((v) => b.indexOf(v) !== -1);

const ELEMENT_LABEL = { richtext: 'Richtext', code: 'Code', cards: 'Cards' };
const elLabel = (e) => ELEMENT_LABEL[e && e.type] || 'Richtext';
const sectionsOf = (p) => (p && p.content && Array.isArray(p.content.sections) ? p.content.sections : []);
const elementsOf = (s) => (s && Array.isArray(s.elements) ? s.elements : []);
const cardsOf = (e) => (e && Array.isArray(e.cards) ? e.cards : []);
const pageName = (p) => (p && String(p.title || '').trim()) || 'Untitled page';
const sectionName = (s) => (s && String(s.title || '').trim()) || 'Untitled section';
const plural = (n, one, many) => n + ' ' + (Math.abs(n) === 1 ? one : many);

// Path segments, mirroring the client's slugSegment/segmentsFor exactly (see
// pages.js): a slugified title, deduped within its siblings with a numeric
// suffix on collision (two sections both named "Hero", an untitled section).
// Segments are derived fresh from the AFTER state on every call rather than
// stored, so they always match what the builder itself would compute for the
// same titles.
function slugSegment(s) {
  const base = String(s == null ? '' : s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base || 'untitled';
}
function segmentsFor(list, titleOf) {
  const used = new Map();
  const out = new Map();
  (list || []).forEach((it) => {
    const base = slugSegment(titleOf(it));
    const n = (used.get(base) || 0) + 1;
    used.set(base, n);
    out.set(it.id, n === 1 ? base : base + '-' + n);
  });
  return out;
}
const pagePath = (seg) => (seg ? PAGES_HREF + seg : PAGES_HREF);
const sectionPath = (pageSeg, secSeg) => (pageSeg && secSeg ? pagePath(pageSeg) + '/' + secSeg : pagePath(pageSeg));
const elementPath = (pageSeg, secSeg, elSeg) => (pageSeg && secSeg && elSeg ? sectionPath(pageSeg, secSeg) + '/' + elSeg : sectionPath(pageSeg, secSeg));

function diffElements(prevSec, nextSec, page, pageSeg, secSeg, out) {
  const pName = pageName(page);
  const sectionHref = sectionPath(pageSeg, secSeg);
  const prevEls = elementsOf(prevSec);
  const nextEls = elementsOf(nextSec);
  const prevById = byId(prevEls);
  const nextById = byId(nextEls);
  const elSegs = segmentsFor(nextEls, (e) => e.title || elLabel(e));

  nextEls.forEach((e) => {
    const before = prevById.get(e.id);
    if (!before) {
      out.push({ pre: 'Added a ' + elLabel(e) + ' ', linkLabel: 'element', linkHref: sectionHref, post: ' to section ' + q(sectionName(nextSec)) + ' on page ' + q(pName) + '.' });
      return; // a brand-new element arrived with its cards; don't itemise them
    }
    const elHref = elementPath(pageSeg, secSeg, elSegs.get(e.id));
    if (e.type === 'cards' && before.type === 'cards') {
      const delta = cardsOf(e).length - cardsOf(before).length;
      const where = ' section ' + q(sectionName(nextSec)) + ' on page ' + q(pName) + '.';
      if (delta > 0) out.push({ pre: 'Added ' + delta + ' ', linkLabel: delta === 1 ? 'card' : 'cards', linkHref: elHref, post: ' to' + where });
      if (delta < 0) out.push({ pre: 'Removed ' + -delta + ' ', linkLabel: delta === -1 ? 'card' : 'cards', linkHref: elHref, post: ' from' + where });
    }
  });
  prevEls.forEach((e) => {
    if (!nextById.has(e.id)) {
      out.push({ pre: 'Removed a ' + elLabel(e) + ' ', linkLabel: 'element', linkHref: sectionHref, post: ' from section ' + q(sectionName(prevSec)) + ' on page ' + q(pName) + '.' });
    }
  });
}

function diffSections(prevPage, nextPage, pageSeg, out) {
  const pName = pageName(nextPage);
  const prevSecs = sectionsOf(prevPage);
  const nextSecs = sectionsOf(nextPage);
  const prevById = byId(prevSecs);
  const nextById = byId(nextSecs);
  const secSegs = segmentsFor(nextSecs, (x) => x.title || 'Section');

  nextSecs.forEach((s) => {
    const before = prevById.get(s.id);
    const secHref = sectionPath(pageSeg, secSegs.get(s.id));
    if (!before) {
      out.push({ pre: 'Added a ', linkLabel: 'section', linkHref: secHref, post: ' ' + q(sectionName(s)) + ' to page ' + q(pName) + '.' });
      return; // new section: its elements came with it
    }
    if (sectionName(before) !== sectionName(s)) {
      out.push({ pre: 'Renamed ', linkLabel: 'section', linkHref: secHref, post: ' ' + q(sectionName(before)) + ' to ' + q(sectionName(s)) + ' on page ' + q(pName) + '.' });
    }
    diffElements(before, s, nextPage, pageSeg, secSegs.get(s.id), out);
  });
  prevSecs.forEach((s) => {
    if (!nextById.has(s.id)) {
      out.push({ pre: 'Removed a ', linkLabel: 'section', linkHref: pagePath(pageSeg), post: ' ' + q(sectionName(s)) + ' from page ' + q(pName) + '.' });
    }
  });
  // A reorder only counts when membership is unchanged — otherwise the add /
  // remove entries above already describe what happened.
  const a = ids(prevSecs);
  const b = ids(nextSecs);
  if (a.length > 1 && sameMembers(a, b) && !sameOrder(a, b)) {
    out.push({ pre: 'Reordered ', linkLabel: 'sections', linkHref: pagePath(pageSeg), post: ' on page ' + q(pName) + '.' });
  }
}

function pagesActivity(before, after) {
  const out = [];
  const prevById = byId(before);
  const nextById = byId(after);
  const pageSegs = segmentsFor(after, (p) => p.title);
  let homepageMoved = false;

  (after || []).forEach((p) => {
    const href = pagePath(pageSegs.get(p.id));
    const prev = prevById.get(p.id);
    if (!prev) {
      out.push({ pre: 'Created ', linkLabel: 'page', linkHref: href, post: ' ' + q(pageName(p)) + '.' });
      return; // new page: don't enumerate the sections it arrived with
    }
    if (pageName(prev) !== pageName(p)) {
      out.push({ pre: 'Renamed ', linkLabel: 'page', linkHref: href, post: ' ' + q(pageName(prev)) + ' to ' + q(pageName(p)) + '.' });
    }
    if (prev.status !== p.status) {
      out.push({ pre: p.status === 'published' ? 'Published ' : 'Unpublished ', linkLabel: 'page', linkHref: href, post: ' ' + q(pageName(p)) + '.' });
    }
    if (!prev.isHomepage && p.isHomepage) {
      homepageMoved = true;
      out.push({ pre: 'Set ', linkLabel: 'page', linkHref: href, post: ' ' + q(pageName(p)) + ' as the homepage.' });
    }
    diffSections(prev, p, pageSegs.get(p.id), out);
  });

  (before || []).forEach((p) => {
    // A deleted page has nowhere to deep-link to, so the link falls back to the
    // Pages list.
    if (!nextById.has(p.id)) {
      out.push({ pre: 'Removed ', linkLabel: 'page', linkHref: PAGES_HREF, post: ' ' + q(pageName(p)) + '.' });
    }
  });

  // The homepage is pinned to the top of the set, so promoting one reorders the
  // list as a side effect — already covered by the homepage entry.
  const pa = ids(before);
  const pb = ids(after);
  if (!homepageMoved && pa.length > 1 && sameMembers(pa, pb) && !sameOrder(pa, pb)) {
    out.push({ pre: 'Reordered ', linkLabel: 'pages', linkHref: PAGES_HREF, post: '.' });
  }

  if (out.length <= MAX_EVENTS) return out;
  const kept = out.slice(0, MAX_EVENTS - 1);
  const rest = out.length - kept.length;
  kept.push({ pre: 'Made ' + plural(rest, 'further change', 'further changes') + ' to pages.' });
  return kept;
}

module.exports = { pagesActivity, MAX_EVENTS };
