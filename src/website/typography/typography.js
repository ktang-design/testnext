// Website layer — Typography configuration.
// Font family + heading/body size & weight. Edits auto-save as a DRAFT a
// couple of seconds after you stop typing; the shared Page Builder
// pageactions bar (website-saveactions.js) is what actually promotes drafts
// to published, across every section at once.
(function () {
  const $ = (s) => document.querySelector(s);
  const fields = Array.from(document.querySelectorAll('[data-field]'));

  const AUTO_SAVE_DELAY = 2000; // ms of idle time after the last edit before auto-saving

  let config = null;
  let publishedConfig = null; // last-known published snapshot
  let loaded = false; // true once the draft has loaded — no dirty check before then
  let saving = false; // an auto-save PUT is in flight
  let saveState = 'idle'; // 'idle' | 'pending' | 'saved'
  let autoSaveTimer = null;
  let touched = false; // set once the user edits, so the boot revalidation fetch won't clobber it
  let bar = null;

  // Instant-load cache: paint the last-known config before the network
  // resolves, then revalidate. Avoids the flash of default sizes/weights.
  const CACHE_KEY = 'ws-typography-cache';
  const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) { return null; } };
  const writeCache = (data) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (_) { /* ignore */ } };

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const serialize = (x) => JSON.stringify(x);
  const isLocalDirty = () => loaded && serialize(config) !== serialize(publishedConfig);

  function applyToControls() {
    fields.forEach((el) => { const k = el.dataset.field; if (config[k] != null) el.value = config[k]; });
    pushPreview();
  }

  const preview = window.WebsitePreview.create(document.querySelector('[data-website-preview]'));
  const pushPreview = () => { if (config) preview.update({ typography: config }); };

  fields.forEach((el) => {
    const evt = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evt, () => { config[el.dataset.field] = el.value; onEdit(); });
  });

  function refresh() {
    pushPreview();
    if (bar) bar.refresh(saveState);
  }

  function onEdit() {
    touched = true;
    saveState = 'pending';
    refresh();
    scheduleAutoSave();
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
    return fetch('/api/website/typography', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(config),
    }).then((res) => {
      if (!res.ok) return res.json().catch(() => ({})).then((d) => { throw new Error(d.message || 'We could not save your changes. Try again.'); });
      return res.json();
    }).then((data) => {
      config = data.saved;
      saving = false;
      saveState = 'saved';
      writeCache(config);
      applyToControls();
      refresh();
    }).catch((err) => {
      saving = false;
      saveState = 'idle';
      refresh();
      if (window.Toast) window.Toast.show(err.message || 'We could not save your changes. Try again.');
    });
  }

  // ---------- boot ----------
  const DEFAULT_CONFIG = { fontFamily: 'Inter', headingSize: '24', headingWeight: '600', bodySize: '16', bodyWeight: '400' };

  // Initial paint from the local cache (instant), then hydrate/revalidate.
  const cached = readCache();
  if (cached) {
    config = clone(cached);
    loaded = true;
    applyToControls();
  }

  bar = window.WebsiteSaveActions.init({
    isLocalDirty,
    flushLocalSave: flushPendingSave,
    cancelLocalPending: cancelPendingSave,
    onPublished: (published) => {
      const p = published && published.typography;
      if (p) publishedConfig = clone(p);
      refresh();
    },
    onDiscarded: (draft) => {
      const d = draft && draft.typography;
      if (d) {
        config = clone(d);
        publishedConfig = clone(d);
        writeCache(config);
        applyToControls();
        refresh();
      }
    },
  });
  refresh();

  window.addEventListener('beforeunload', () => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
      try {
        fetch('/api/website/typography', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          keepalive: true,
          body: JSON.stringify(config),
        });
      } catch (_) { /* best effort */ }
    }
  });

  fetch('/api/website/typography', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((data) => {
      const draft = clone(data.saved || data.defaults || DEFAULT_CONFIG);
      const published = clone(data.published || draft);
      publishedConfig = published;
      writeCache(draft);
      loaded = true;
      if (touched) { refresh(); return; } // keep the user's in-progress edits
      config = draft;
      applyToControls();
      refresh();
    })
    .catch(() => {
      loaded = true;
      if (config) { publishedConfig = clone(config); refresh(); return; } // cache already painted something usable
      config = clone(DEFAULT_CONFIG);
      publishedConfig = clone(DEFAULT_CONFIG);
      applyToControls();
      refresh();
    });
})();
