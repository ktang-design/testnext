// Website layer — Search configuration.
// The list of configured searches shown in the search bar's dropdown. Each
// search becomes an option in the bar's dropdown. Searches are added from
// the "+" menu (EBSCO Discovery Service / Custom search) via a focused
// "Add … search" modal. The search bar's own background colour/image is
// configured from Header Settings (see src/website/header/header.js).
// Edits auto-save as a DRAFT a couple of seconds after you stop editing; the
// shared Page Builder pageactions bar (website-saveactions.js) is what
// actually promotes drafts to published, across every section at once.
(function () {
  const $ = (s) => document.querySelector(s);
  const addBtn = $('[data-add-search]');
  const listEl = $('[data-search-list]');
  const listSkeleton = $('[data-search-skeleton]');

  const NAME_MAX = 40;
  const LABEL_MAX = 40;
  const MAX_SEARCHES = 20;
  const AUTO_SAVE_DELAY = 2000; // ms of idle time after the last edit before auto-saving

  const DEFAULTS = { searches: [] };
  const CACHE_KEY = 'ws-search-config'; // last-known draft, for instant load
  // Separate from CACHE_KEY: that one only ever holds the draft, which stays
  // null forever for an account that has never edited anything — so it can't
  // tell "never loaded" apart from "loaded, and there's genuinely nothing
  // saved yet." This flag just means "we've successfully talked to the
  // server at least once," which is what the skeleton actually needs to know.
  const VISITED_KEY = 'ws-search-visited';
  const cacheConfig = (draft) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(draft || null)); } catch (_) { /* ignore */ } };

  let config = null;
  let publishedSerialized = ''; // last-known published snapshot, serialized
  let saving = false; // an auto-save PUT is in flight
  let saveState = 'idle'; // 'idle' | 'pending' | 'saved'
  let autoSaveTimer = null;
  let touched = false; // set once the user edits, so the boot revalidation fetch won't clobber it
  let bar = null;
  let bentoIsConfigured = false; // last-known Bento-configured state, reapplied after Publish/Discard
  let preview = null;
  // True once we know the REAL list (from a cache or the first server
  // response) — until then, an empty config.searches doesn't mean "no
  // searches," it means "haven't loaded yet," so the skeleton stays up
  // instead of flashing an empty list.
  let searchesLoaded = false;

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const serialize = () => JSON.stringify(config);
  const isLocalDirty = () => serialize() !== publishedSerialized;
  const show = (el) => { el.hidden = false; };
  const hide = (el) => { el.hidden = true; };
  const uid = () => 'search-' + Math.random().toString(36).slice(2, 10);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function onEdit() {
    touched = true;
    saveState = 'pending';
    render();
    scheduleAutoSave();
  }

  // Features > Bento: when a Bento search integration is configured (EDS filled
  // in + at least one block), a "Bento search" is pre-created in the list. It
  // has no URL — selecting it runs the unified Bento search. It can't be edited
  // or deleted here (managed from Features > Bento); it drops out if Bento is
  // unconfigured. bentoConfigured() reads the /api/features/bento response.
  function bentoConfigured(bento) {
    return !!(bento && bento.integrationConfigured && bento.published && Array.isArray(bento.published.blocks) && bento.published.blocks.length);
  }
  // Pure: returns a new searches array with the synthetic Bento entry
  // added/removed, so it can be applied identically to the draft AND the
  // published snapshot — otherwise this derived, always-in-sync entry would
  // make a freshly-loaded page look "dirty" purely from the injection itself.
  function withBentoSearch(list, configured) {
    list = list || [];
    const idx = list.findIndex((s) => s.type === 'bento');
    if (configured && idx === -1) {
      return [...list, { id: 'search-bento', type: 'bento', name: 'Bento search', displayLabel: 'Bento search', url: '', urlencode: true, buttonLabel: 'Search', isDefault: list.length === 0 }];
    }
    if (!configured && idx !== -1) {
      const wasDefault = list[idx].isDefault;
      const next = list.slice(0, idx).concat(list.slice(idx + 1));
      if (wasDefault && next.length && !next.some((s) => s.isDefault)) next[0].isDefault = true;
      return next;
    }
    return list;
  }
  function ensureBentoSearch(configured) {
    config.searches = withBentoSearch(config.searches, configured);
  }
  const pushPreview = () => { if (config && preview) preview.update({ search: config }); };

  // The search bar's own background colour/image moved to Header Settings
  // (searchBackground/headerImage) since it renders as part of the header
  // composite — see src/website/header/header.js.

  // ---------- searches list (shared SortableTree, like sections / pages / nav) ----------
  let tree = null;
  const labelOf = (s) => s.displayLabel || s.name || 'Untitled search';
  // "Item" -> "Item Copy" -> "Item Copy 2" -> ... — strips any existing
  // "Copy"/"Copy N" suffix first, so duplicating a copy doesn't double up.
  const nextCopyName = (title, existingNames) => {
    const m = /^(.*) Copy(?: (\d+))?$/.exec(title);
    const base = m ? m[1] : title;
    if (!existingNames.includes(`${base} Copy`)) return `${base} Copy`;
    let n = 2;
    while (existingNames.includes(`${base} Copy ${n}`)) n++;
    return `${base} Copy ${n}`;
  };

  function svg(paths) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 16 16');
    s.setAttribute('width', '16');
    s.setAttribute('height', '16');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = paths;
    return s;
  }
  function rowLabel(text, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'navtree__label pageitem__open';
    b.textContent = text;
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }
  function rowKebab(name, items) {
    const k = document.createElement('button');
    k.type = 'button';
    k.className = 'navtree__kebab';
    k.setAttribute('aria-label', `Actions for ${name || 'search'}`);
    k.setAttribute('data-tooltip', 'More options');
    k.setAttribute('data-tip-pos', 'bottom-end');
    k.appendChild(svg('<circle cx="8" cy="3" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="8" cy="13" r="1.4"/>'));
    window.Popover.attach(k, () => items, { align: 'right', label: `Actions for ${name || 'search'}` });
    return k;
  }
  function reorderSearches(orderedIds) {
    const map = Object.fromEntries(config.searches.map((s) => [s.id, s]));
    config.searches = orderedIds.map((id) => map[id]).filter(Boolean);
  }
  // Exactly one search is the default (starred). It is pre-selected in the
  // preview's dropdown; deleting it promotes the first remaining search.
  function makeDefault(id) {
    config.searches.forEach((s) => { s.isDefault = s.id === id; });
    renderList(); onEdit();
  }
  function duplicateSearch(id) {
    const idx = config.searches.findIndex((s) => s.id === id);
    if (idx === -1 || config.searches.length >= MAX_SEARCHES) return;
    const src = config.searches[idx];
    const copy = clone(src);
    copy.id = uid();
    const newLabel = nextCopyName(labelOf(src), config.searches.map(labelOf));
    // The visible "title" is whichever of these labelOf() actually reads.
    if (copy.displayLabel) copy.displayLabel = newLabel; else copy.name = newLabel;
    copy.isDefault = false;
    copy.enabled = true;
    config.searches.splice(idx + 1, 0, copy);
    renderList(); onEdit();
  }
  // The default search can't be disabled (it's what visitors get pre-selected),
  // so the option only ever appears on non-default searches.
  function toggleEnabled(id) {
    const s = config.searches.find((x) => x.id === id);
    if (!s || s.isDefault) return;
    s.enabled = s.enabled === false ? true : false;
    renderList(); onEdit();
  }
  async function deleteSearch(id) {
    const ok = await window.Modal.confirm({
      title: 'Delete search',
      message: 'This search will be removed from your website. This cannot be undone.',
      confirmLabel: 'Delete search',
      cancelLabel: 'Keep search',
      danger: true,
    });
    if (!ok) return;
    const wasDefault = config.searches.find((s) => s.id === id && s.isDefault);
    config.searches = config.searches.filter((s) => s.id !== id);
    if (wasDefault && config.searches.length && !config.searches.some((s) => s.isDefault)) {
      // Promote an enabled search when possible — the default can't be disabled.
      const next = config.searches.find((s) => s.enabled !== false) || config.searches[0];
      next.isDefault = true;
    }
    renderList(); onEdit();
  }
  // Trailing row actions: a star on the default search + the actions kebab.
  function rowActions(s) {
    const wrap = document.createElement('span');
    wrap.className = 'pageitem__actions';
    if (s.isDefault) {
      const star = document.createElement('span');
      star.className = 'pageitem__star';
      star.setAttribute('role', 'img');
      star.setAttribute('aria-label', 'Default search');
      star.title = 'Default search';
      star.appendChild(svg('<path d="M8 2.1 9.85 5.85 14 6.46 11 9.38 11.71 13.5 8 11.56 4.29 13.5 5 9.38 2 6.46 6.15 5.85Z"/>'));
      wrap.appendChild(star);
    }
    // The Bento search is managed from Features > Bento — no Edit/Delete/
    // Duplicate/Disable here, only (when it isn't already the default) the
    // option to make it one.
    const items = [];
    const disabled = s.enabled === false;
    if (s.type !== 'bento') {
      items.push({ label: 'Edit', onSelect: () => openSearchModal(s.type, s.id) });
      // A disabled search can't be made default or duplicated until it's
      // re-enabled — duplicating would just create another disabled search,
      // and a disabled search can't stand in as the pre-selected default.
      if (!s.isDefault && !disabled) items.push({ label: 'Make default search', onSelect: () => makeDefault(s.id) });
      if (!disabled) items.push({ label: 'Duplicate', onSelect: () => duplicateSearch(s.id) });
      if (!s.isDefault) items.push({ label: disabled ? 'Enable' : 'Disable', onSelect: () => toggleEnabled(s.id) });
      items.push({ label: 'Delete', danger: true, onSelect: () => deleteSearch(s.id) });
    } else if (!s.isDefault) {
      items.push({ label: 'Make default search', onSelect: () => makeDefault(s.id) });
    }
    wrap.appendChild(rowKebab(labelOf(s), items));
    return wrap;
  }

  function renderList() {
    if (tree) { tree.destroy(); tree = null; }
    listEl.innerHTML = '';
    const items = config.searches || [];
    if (!searchesLoaded && items.length === 0) {
      // Still waiting on the first real fetch — keep the skeleton up rather
      // than flashing "no searches" prematurely.
      if (listSkeleton) listSkeleton.hidden = false;
      listEl.hidden = true;
      return;
    }
    if (listSkeleton) listSkeleton.hidden = true;
    listEl.hidden = items.length === 0;
    if (!items.length) return;
    tree = window.SortableTree.create(listEl, {
      items: items.map((s) => ({ id: s.id, children: [] })),
      maxDepth: 1,
      ariaLabel: 'Searches',
      labelOf: (it) => { const s = config.searches.find((x) => x.id === it.id); return s ? labelOf(s) : 'Search'; },
      renderContent: (it) => {
        const s = config.searches.find((x) => x.id === it.id);
        if (s && s.type === 'bento') { const span = document.createElement('span'); span.className = 'navtree__label'; span.textContent = labelOf(s); return span; }
        const label = rowLabel(s ? labelOf(s) : 'Search', () => openSearchModal(s.type, s.id));
        if (!s || s.enabled !== false) return label;
        // Disabled: grey label (via the shared .is-unavailable/.navtree__tip
        // treatment from sortable-tree.css) + a tooltip explaining why, shown
        // on hover/focus of the row. Deliberately not marked aria-disabled —
        // the kebab (Edit/Enable/Delete) must stay fully usable, and
        // aria-disabled on an ancestor tells assistive tech to treat every
        // descendant control, kebab included, as inert.
        const wrap = document.createElement('span');
        const tipId = 'tip-' + s.id;
        const tip = document.createElement('span');
        tip.className = 'navtree__tip';
        tip.id = tipId;
        tip.setAttribute('role', 'tooltip');
        tip.textContent = 'This search is disabled and will not appear on your website.';
        label.setAttribute('aria-describedby', tipId);
        wrap.appendChild(label);
        wrap.appendChild(tip);
        return wrap;
      },
      renderTrailing: (it) => { const s = config.searches.find((x) => x.id === it.id); return s ? rowActions(s) : null; },
      itemAttrs: (it) => {
        const s = config.searches.find((x) => x.id === it.id);
        return { className: s && s.enabled === false ? 'is-unavailable' : '' };
      },
      onChange: () => { reorderSearches(tree.getItems().map((it) => it.id)); onEdit(); },
    });
  }

  // The "+" opens the custom-search modal directly.
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (config.searches.length >= MAX_SEARCHES) return;
    openSearchModal('custom');
  });

  // ---------- search-term detection ----------
  // Query-string parameter names that conventionally carry the user's search text.
  const TERM_PARAMS = ['q', 'query', 'search', 'searchterm', 'search_term', 'searchtext', 'search_text', 'searchquery', 'search_query',
    'searchfor', 'keyword', 'keywords', 'kw', 'term', 'terms', 'text', 'k', 's', 'qs', 'find', 'lookfor', 'queryterm', 'bquery', 'searchstring'];
  // Returns the URL with the search-term value replaced by SEARCH_TERM, or null when the
  // input isn't a valid http(s) URL or no known search parameter holds a value.
  function replaceSearchTerm(raw) {
    let parsed;
    try { parsed = new URL(raw); } catch (e) { return null; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    let replaced = false;
    // Edit the raw string (not URLSearchParams) so the rest of the URL keeps its exact encoding.
    const next = raw.replace(/([?&;])([^=&#;]+)=([^&#;]*)/g, (m, sep, name, value) => {
      if (replaced || !value) return m;
      let key = name;
      try { key = decodeURIComponent(name); } catch (e) { /* keep raw */ }
      if (!TERM_PARAMS.includes(key.toLowerCase())) return m;
      replaced = true;
      return sep + name + '=SEARCH_TERM';
    });
    return replaced ? next : null;
  }

  // ---------- add / edit search modal ----------
  function openSearchModal(type, editId) {
    const existing = editId ? config.searches.find((s) => s.id === editId) : null;
    const draft = existing
      ? clone(existing)
      // The first search created is the default (starred).
      : { id: uid(), type, name: '', displayLabel: '', url: '', urlencode: true, buttonLabel: 'Search', isDefault: config.searches.length === 0, enabled: true };
    const noun = 'custom search';
    const prev = document.activeElement;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', (existing ? 'Edit ' : 'Add ') + noun);
    const modal = document.createElement('div');
    modal.className = 'modal modal--search';
    overlay.appendChild(modal);
    modal.innerHTML =
      `<div class="modal__header"><h2 class="modal__title">${existing ? 'Edit' : 'Add'} ${esc(noun)}</h2>` +
      '<button type="button" class="modal__close" aria-label="Close dialog"><img src="/shared/close.svg" alt="" /></button></div>' +
      '<div class="modal__body">' +
        '<div class="ws-mfield">' +
          '<label class="ws-label" for="ws-name">Search name</label>' +
          '<input type="text" class="ws-input" id="ws-name" maxlength="' + NAME_MAX + '" />' +
          '<div class="ws-meta">' +
            '<button type="button" class="btn--link ws-addlabel" data-addlabel hidden>Create display label</button>' +
            '<span class="ws-count" data-name-count></span>' +
          '</div>' +
          '<div class="ws-labelwrap" data-labelwrap hidden>' +
            '<label class="ws-label" for="ws-label">Display label (optional)</label>' +
            '<p class="ws-help">Adjusts the administrative label that displays on the website within the dropdown.</p>' +
            '<input type="text" class="ws-input" id="ws-label" maxlength="' + LABEL_MAX + '" />' +
            '<div class="ws-meta"><span class="ws-count" data-label-count></span></div>' +
          '</div>' +
        '</div>' +
        '<div class="ws-mfield">' +
          '<label class="ws-label" for="ws-url">URL</label>' +
          '<p class="ws-help" id="ws-url-help">Enter a search URL. Existing search terms will be replaced with SEARCH_TERM automatically. If needed, add SEARCH_TERM manually as the placeholder for user searches. For more help, <a href="https://connect.ebsco.com" target="_blank" rel="noopener">visit EBSCO Connect</a>.</p>' +
          '<textarea class="ws-input ws-textarea" id="ws-url" spellcheck="false" aria-describedby="ws-url-help ws-url-status"></textarea>' +
          '<p class="ws-status" id="ws-url-status" role="status" hidden><img class="ws-status__icon" src="" alt="" width="13" height="13" /><span data-status-text></span></p>' +
        '</div>' +
      '</div>' +
      '<div class="modal__footer">' +
        '<button type="button" class="modal__btn modal__btn--cancel" data-cancel>Cancel</button>' +
        `<button type="button" class="modal__btn modal__btn--primary" data-confirm>${existing ? 'Save' : 'Add'}</button>` +
      '</div>';

    document.body.appendChild(overlay);
    document.body.classList.add('is-locked');

    const nameI = modal.querySelector('#ws-name');
    const labelBtn = modal.querySelector('[data-addlabel]');
    const labelWrap = modal.querySelector('[data-labelwrap]');
    const labelI = modal.querySelector('#ws-label');
    const urlI = modal.querySelector('#ws-url');
    const statusEl = modal.querySelector('#ws-url-status');
    const statusIcon = statusEl.querySelector('img');
    const statusText = statusEl.querySelector('[data-status-text]');
    const confirmBtn = modal.querySelector('[data-confirm]');
    const nameCount = modal.querySelector('[data-name-count]');
    const labelCount = modal.querySelector('[data-label-count]');

    nameI.value = draft.name;
    labelI.value = draft.displayLabel;
    urlI.value = draft.url;
    // Show the display-label field when one already exists; otherwise offer the link.
    if (draft.displayLabel) { show(labelWrap); hide(labelBtn); } else { show(labelBtn); hide(labelWrap); }

    const updateCounts = () => {
      nameCount.textContent = nameI.value.length + '/' + NAME_MAX;
      labelCount.textContent = labelI.value.length + '/' + LABEL_MAX;
    };
    nameI.addEventListener('input', updateCounts);
    labelI.addEventListener('input', updateCounts);
    updateCounts();
    labelBtn.addEventListener('click', () => { hide(labelBtn); show(labelWrap); labelI.focus(); });

    // ----- URL: detect the search term in a pasted/entered URL and swap in SEARCH_TERM -----
    const STATUS = {
      updating: { icon: '/shared/cog.svg', text: 'Updating the URL automatically...', cls: '' },
      success: { icon: '/shared/check-circle.svg', text: 'The URL has been updated automatically. Review it to ensure SEARCH_TERM is used in the appropriate location.', cls: 'is-success' },
      error: { icon: '/shared/error.svg', text: 'We couldn’t update the URL automatically. Please add SEARCH_TERM manually in the appropriate location.', cls: 'is-error' },
    };
    let detectTimer = null;
    function setStatus(kind) {
      if (!kind) { hide(statusEl); return; }
      const st = STATUS[kind];
      statusIcon.src = st.icon;
      statusText.textContent = st.text;
      statusEl.className = 'ws-status ' + st.cls;
      show(statusEl);
    }
    // Add is blocked while a URL is present but has no SEARCH_TERM to substitute.
    function syncConfirm() {
      const v = urlI.value.trim();
      confirmBtn.disabled = !!v && !v.includes('SEARCH_TERM');
    }
    function runDetection() {
      const v = urlI.value.trim();
      if (!v || v.includes('SEARCH_TERM')) { setStatus(null); syncConfirm(); return; }
      setStatus('updating');
      urlI.readOnly = true;
      urlI.classList.add('is-busy');
      detectTimer = setTimeout(() => {
        detectTimer = null;
        urlI.readOnly = false;
        urlI.classList.remove('is-busy');
        const next = replaceSearchTerm(v);
        if (next) { urlI.value = next; setStatus('success'); } else { setStatus('error'); }
        syncConfirm();
      }, 700);
    }
    urlI.addEventListener('input', () => {
      // Typing never rewrites the URL; it only clears stale messages and re-checks Add.
      if (!urlI.value.trim() || urlI.value.includes('SEARCH_TERM')) setStatus(null);
      syncConfirm();
    });
    urlI.addEventListener('paste', () => setTimeout(runDetection, 0));
    urlI.addEventListener('change', () => { if (!detectTimer) runDetection(); });
    syncConfirm();

    function close() {
      clearTimeout(detectTimer);
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      document.body.classList.remove('is-locked');
      if (prev && prev.focus) prev.focus();
    }
    function confirm() {
      const name = nameI.value.trim();
      if (!name) { nameI.focus(); return; }
      draft.name = name;
      draft.displayLabel = labelWrap.hidden ? '' : labelI.value.trim();
      draft.url = urlI.value.trim();
      draft.buttonLabel = draft.buttonLabel || 'Search'; // no longer user-set; keep a sensible default
      if (existing) {
        const i = config.searches.findIndex((s) => s.id === existing.id);
        if (i !== -1) config.searches[i] = draft;
      } else {
        config.searches.push(draft);
      }
      renderList(); onEdit(); close();
    }
    modal.querySelector('.modal__close').addEventListener('click', close);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    modal.querySelector('[data-cancel]').addEventListener('click', close);
    modal.querySelector('[data-confirm]').addEventListener('click', confirm);
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') {
        const f = Array.from(modal.querySelectorAll('button, input, textarea')).filter((el) => el.offsetParent !== null && !el.disabled);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    nameI.focus();
  }

  // ---------- render ----------
  function applyToControls() {
    renderList();
    render();
  }
  function render() {
    pushPreview();
    if (bar) bar.refresh(saveState);
  }

  // ---------- auto-save (draft only) ----------
  function scheduleAutoSave() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => { autoSaveTimer = null; autoSave(); }, AUTO_SAVE_DELAY);
  }
  function cancelPendingSave() {
    if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
  }
  function flushPendingSave() {
    if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; return autoSave(); }
    return Promise.resolve();
  }
  function autoSave() {
    if (saving) return Promise.resolve();
    saving = true;
    return fetch('/api/website/search', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(config),
    }).then((res) => {
      if (!res.ok) return res.json().catch(() => ({})).then((d) => { throw new Error(d.message || 'We could not save your changes. Try again.'); });
      return res.json();
    }).then((data) => {
      config = data.draft || data.saved;
      saving = false;
      saveState = 'saved';
      cacheConfig(config); // keep the instant-load cache in sync
      applyToControls();
    }).catch((err) => {
      saving = false;
      saveState = 'idle';
      render();
      if (window.Toast) window.Toast.show(err.message || 'We could not save your changes. Try again.');
    });
  }

  // ---------- boot ----------
  preview = window.WebsitePreview.create(document.querySelector('[data-website-preview]'), { highlight: 'search' });

  // Paint the draft configuration instantly from a local cache (panel +
  // preview) instead of waiting for the network — then revalidate against
  // the server and adopt it only if the user hasn't started editing. This
  // removes the visible "pop-in" of saved changes on load.
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) { /* ignore */ }
  try { searchesLoaded = localStorage.getItem(VISITED_KEY) === '1'; } catch (_) { /* ignore */ }
  config = clone(cached || DEFAULTS);
  publishedSerialized = serialize();
  applyToControls();

  bar = window.WebsiteSaveActions.init({
    isLocalDirty,
    flushLocalSave: flushPendingSave,
    cancelLocalPending: cancelPendingSave,
    onPublished: (published) => {
      const p = published && published.search;
      if (p) {
        p.searches = withBentoSearch(p.searches, bentoIsConfigured);
        publishedSerialized = JSON.stringify(p);
      }
      render();
    },
    onDiscarded: (draft) => {
      const d = draft && draft.search;
      if (d) {
        d.searches = withBentoSearch(d.searches, bentoIsConfigured);
        config = clone(d);
        publishedSerialized = serialize();
        cacheConfig(config);
        applyToControls();
      }
    },
  });

  window.addEventListener('beforeunload', () => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
      try {
        fetch('/api/website/search', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          keepalive: true,
          body: JSON.stringify(config),
        });
      } catch (_) { /* best effort */ }
    }
  });

  const getJSON = (url) => fetch(url, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  Promise.all([getJSON('/api/website/search'), getJSON('/api/features/bento')])
    .then(([data, bento]) => {
      searchesLoaded = true;
      if (data) { try { localStorage.setItem(VISITED_KEY, '1'); } catch (_) { /* ignore */ } }
      if (!data) { renderList(); return; } // search fetch failed — keep the cached/default view
      const draft = clone(data.draft || data.saved || data.defaults || DEFAULTS);
      const published = clone(data.published || draft);
      const configured = bentoConfigured(bento);
      bentoIsConfigured = configured;
      // Apply the same synthetic Bento-entry injection to both sides so it
      // never shows up as an "unpublished change" on its own.
      published.searches = withBentoSearch(published.searches, configured);
      publishedSerialized = JSON.stringify(published);
      cacheConfig(draft);
      if (touched) { render(); return; } // the user already started editing — keep their work
      config = draft;
      ensureBentoSearch(configured); // pre-create the Bento search when configured
      applyToControls();
    });
})();
