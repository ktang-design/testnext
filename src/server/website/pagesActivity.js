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
// in quotes beside it. Each link points at the page it happened on, via the
// builder's ?page= deep link, so a row takes you straight there.

const PAGES_HREF = '/website/pages/';
const pageHref = (id) => (id ? PAGES_HREF + '?page=' + encodeURIComponent(id) : PAGES_HREF);
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

function diffElements(prevSec, nextSec, page, out) {
  const href = pageHref(page.id);
  const pName = pageName(page);
  const prevEls = elementsOf(prevSec);
  const nextEls = elementsOf(nextSec);
  const prevById = byId(prevEls);
  const nextById = byId(nextEls);

  nextEls.forEach((e) => {
    const before = prevById.get(e.id);
    if (!before) {
      out.push({ pre: 'Added a ' + elLabel(e) + ' ', linkLabel: 'element', linkHref: href, post: ' to section ' + q(sectionName(nextSec)) + ' on page ' + q(pName) + '.' });
      return; // a brand-new element arrived with its cards; don't itemise them
    }
    if (e.type === 'cards' && before.type === 'cards') {
      const delta = cardsOf(e).length - cardsOf(before).length;
      const where = ' section ' + q(sectionName(nextSec)) + ' on page ' + q(pName) + '.';
      if (delta > 0) out.push({ pre: 'Added ' + delta + ' ', linkLabel: delta === 1 ? 'card' : 'cards', linkHref: href, post: ' to' + where });
      if (delta < 0) out.push({ pre: 'Removed ' + -delta + ' ', linkLabel: delta === -1 ? 'card' : 'cards', linkHref: href, post: ' from' + where });
    }
  });
  prevEls.forEach((e) => {
    if (!nextById.has(e.id)) {
      out.push({ pre: 'Removed a ' + elLabel(e) + ' ', linkLabel: 'element', linkHref: href, post: ' from section ' + q(sectionName(prevSec)) + ' on page ' + q(pName) + '.' });
    }
  });
}

function diffSections(prevPage, nextPage, out) {
  const href = pageHref(nextPage.id);
  const pName = pageName(nextPage);
  const prevSecs = sectionsOf(prevPage);
  const nextSecs = sectionsOf(nextPage);
  const prevById = byId(prevSecs);
  const nextById = byId(nextSecs);

  nextSecs.forEach((s) => {
    const before = prevById.get(s.id);
    if (!before) {
      out.push({ pre: 'Added a ', linkLabel: 'section', linkHref: href, post: ' ' + q(sectionName(s)) + ' to page ' + q(pName) + '.' });
      return; // new section: its elements came with it
    }
    if (sectionName(before) !== sectionName(s)) {
      out.push({ pre: 'Renamed ', linkLabel: 'section', linkHref: href, post: ' ' + q(sectionName(before)) + ' to ' + q(sectionName(s)) + ' on page ' + q(pName) + '.' });
    }
    diffElements(before, s, nextPage, out);
  });
  prevSecs.forEach((s) => {
    if (!nextById.has(s.id)) {
      out.push({ pre: 'Removed a ', linkLabel: 'section', linkHref: href, post: ' ' + q(sectionName(s)) + ' from page ' + q(pName) + '.' });
    }
  });
  // A reorder only counts when membership is unchanged — otherwise the add /
  // remove entries above already describe what happened.
  const a = ids(prevSecs);
  const b = ids(nextSecs);
  if (a.length > 1 && sameMembers(a, b) && !sameOrder(a, b)) {
    out.push({ pre: 'Reordered ', linkLabel: 'sections', linkHref: href, post: ' on page ' + q(pName) + '.' });
  }
}

function pagesActivity(before, after) {
  const out = [];
  const prevById = byId(before);
  const nextById = byId(after);
  let homepageMoved = false;

  (after || []).forEach((p) => {
    const href = pageHref(p.id);
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
    diffSections(prev, p, out);
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
