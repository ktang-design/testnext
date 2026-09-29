// Website layer — Header configuration.
// Logo/navigation placement + colours + header image, with a live preview.
// Nav link text has no colour field of its own — it's auto-detected against
// the Branding background at render time (see website-preview.js).
// Edits auto-save as a DRAFT a couple of seconds after you stop typing; the
// shared Page Builder pageactions bar (website-saveactions.js) is what
// actually promotes drafts to published, across every section at once.
(function () {
  const $ = (s) => document.querySelector(s);
  const navSecond = $('[data-nav-second]');
  const imgChoose = $('[data-img-choose]');
  const imgPreview = $('[data-img-preview]');
  const imgEl = $('[data-img-el]');
  const imgReplace = $('[data-img-replace]');
  const imgRemove = $('[data-img-remove]');
  const imgInput = $('[data-img-input]');
  const imgError = $('[data-img-error]');
  const IMAGE_MAX = 3 * 1024 * 1024; // 3 MB
  const AUTO_SAVE_DELAY = 2000; // ms of idle time after the last edit before auto-saving
  const DEFAULTS = {
    logo: 'left', nav: 'left',
    siteName: { color: '#FFFFFF', opacity: 100 },
    background: { color: '#FFFFFF', opacity: 100 },
    searchBackground: { color: '#FFFFFF', opacity: 100 },
    headerImage: null,
  };
  // Shared website preview in the main area (header + body + footer).
  const preview = window.WebsitePreview.create(document.querySelector('[data-website-preview]'), { highlight: 'header' });

  let config = null;
  let publishedConfig = null; // last-known published snapshot
  let loaded = false; // true once the draft has loaded — no dirty check before then
  let saving = false; // an auto-save PUT is in flight
  let saveState = 'idle'; // 'idle' | 'pending' | 'saved'
  let autoSaveTimer = null;
  let bar = null;
  let touched = false; // set once the user edits, so the boot revalidation fetch won't clobber it

  // Instant-load cache: paint the last-known config before the network
  // resolves, then revalidate. Avoids the flash of DEFAULTS on load.
  const CACHE_KEY = 'ws-header-cache';
  const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) { return null; } };
  const writeCache = (data) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (_) { /* ignore */ } };

  const show = (el) => { el.hidden = false; };
  const hide = (el) => { el.hidden = true; };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const serialize = (x) => JSON.stringify(x);
  const isLocalDirty = () => loaded && serialize(config) !== serialize(publishedConfig);

  // ---------- segmented controls ----------
  function setupSeg(name, onSelect) {
    const seg = document.querySelector(`[data-seg="${name}"]`);
    const opts = Array.from(seg.querySelectorAll('.seg__opt'));
    const paint = (value) => opts.forEach((o) => {
      const on = o.dataset.value === value;
      o.setAttribute('aria-checked', on ? 'true' : 'false');
      o.tabIndex = on ? 0 : -1;
    });
    const choose = (value, focus) => {
      paint(value);
      if (focus) { const el = opts.find((o) => o.dataset.value === value); if (el) el.focus(); }
      onSelect(value);
    };
    seg.addEventListener('click', (e) => {
      const o = e.target.closest('.seg__opt');
      if (o) choose(o.dataset.value);
    });
    seg.addEventListener('keydown', (e) => {
      const i = opts.findIndex((o) => o.getAttribute('aria-checked') === 'true');
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); choose(opts[(i + 1) % opts.length].dataset.value, true); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); choose(opts[(i - 1 + opts.length) % opts.length].dataset.value, true); }
    });
    return { paint };
  }

  const logoSeg = setupSeg('logo', (v) => { config.logo = v; onEdit(); });
  const navSeg = setupSeg('nav', (v) => { config.nav = v; onEdit(); });

  // ---------- colour rows ----------
  function setupColor(key) {
    const row = document.querySelector(`[data-color="${key}"]`);
    const swatch = row.querySelector('[data-color-swatch]');
    const hex = row.querySelector('[data-color-hex]');
    const op = row.querySelector('[data-color-opacity]');
    // Swap the native picker for the shared component; it writes back through
    // this same input, so the listeners below need no changes.
    if (window.ColorPicker) window.ColorPicker.upgrade(swatch, { opacityInput: op, label: key });
    // Choosing a colour while it's fully transparent (the default) would show
    // nothing — make it visible so the choice reflects in the preview.
    const ensureVisible = () => {
      if (config[key].opacity === 0) { config[key].opacity = 100; op.value = 100; }
    };
    swatch.addEventListener('input', () => {
      config[key].color = swatch.value.toUpperCase();
      hex.value = config[key].color;
      ensureVisible();
      onEdit();
    });
    hex.addEventListener('input', () => {
      let v = hex.value.trim();
      if (v && !v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) { config[key].color = v.toUpperCase(); swatch.value = config[key].color; ensureVisible(); onEdit(); }
    });
    hex.addEventListener('blur', () => { hex.value = config[key].color; });
    op.addEventListener('input', () => {
      let n = parseInt(op.value, 10);
      if (Number.isNaN(n)) return;
      n = Math.max(0, Math.min(100, n));
      config[key].opacity = n;
      onEdit();
    });
    op.addEventListener('blur', () => { op.value = config[key].opacity; });
    return { set: () => { swatch.value = config[key].color; hex.value = config[key].color; op.value = config[key].opacity; } };
  }
  const siteNameColor = setupColor('siteName');
  const bgColor = setupColor('background');
  const searchBgColor = setupColor('searchBackground');

  // ---------- header image ----------
  function renderImage() {
    if (config.headerImage) { imgEl.src = config.headerImage; show(imgPreview); hide(imgChoose); }
    else { hide(imgPreview); show(imgChoose); }
  }
  function pickImage() { imgInput.click(); }
  imgInput.addEventListener('change', () => {
    const file = imgInput.files && imgInput.files[0];
    imgInput.value = '';
    if (!file) return;
    hide(imgError);
    if (file.size > IMAGE_MAX) { imgError.textContent = 'Image must be 3 MB or smaller.'; show(imgError); return; }
    const reader = new FileReader();
    reader.onload = () => { config.headerImage = reader.result; renderImage(); onEdit(); };
    reader.onerror = () => { imgError.textContent = 'Couldn’t read that file. Try another.'; show(imgError); };
    reader.readAsDataURL(file);
  });
  imgChoose.addEventListener('click', pickImage);
  imgReplace.addEventListener('click', pickImage);
  imgRemove.addEventListener('click', () => { config.headerImage = null; hide(imgError); renderImage(); onEdit(); });

  // ---------- render ----------
  function applyToControls() {
    logoSeg.paint(config.logo);
    navSeg.paint(config.nav);
    siteNameColor.set();
    bgColor.set();
    searchBgColor.set();
    renderImage();
    refresh();
  }

  function refresh() {
    navSecond.textContent = config.logo === 'left' ? 'Horizontal' : 'Center';
    // The shared website preview reflects the live header config.
    if (preview) preview.update({ header: config });
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
  // Skips the debounce and saves right away — used before Publish, so it
  // always promotes the latest edits rather than a stale draft.
  function flushPendingSave() {
    if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; return autoSave(); }
    return Promise.resolve();
  }
  function autoSave() {
    if (saving) return Promise.resolve();
    saving = true;
    return fetch('/api/website/header', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(config),
    }).then((res) => {
      if (!res.ok) return res.json().catch(() => ({})).then((d) => { throw new Error(d.message || 'We could not save your changes. Try again.'); });
      return res.json();
    }).then((data) => {
      config = { ...clone(DEFAULTS), ...(data.saved || {}) };
      writeCache(config);
      saving = false;
      saveState = 'saved';
      applyToControls();
    }).catch((err) => {
      saving = false;
      saveState = 'idle';
      refresh();
      if (window.Toast) window.Toast.show(err.message || 'We could not save your changes. Try again.');
    });
  }

  // ---------- boot ----------
  // Initial paint from the local cache (instant), then hydrate/revalidate.
  // Merged over DEFAULTS (not used as-is) so a cache written before a field
  // existed (e.g. searchBackground/siteName/headerImage, all added after some
  // browsers already had a cached header) doesn't leave that field undefined
  // — setupColor's .set() would then throw reading config[key].color, which
  // (being uncaught, synchronous, top-level) aborts the rest of this script,
  // including the fetch below that would otherwise have self-corrected it.
  const cached = readCache();
  if (cached) {
    config = { ...clone(DEFAULTS), ...clone(cached) };
    loaded = true;
    applyToControls();
  }

  bar = window.WebsiteSaveActions.init({
    isLocalDirty,
    flushLocalSave: flushPendingSave,
    cancelLocalPending: cancelPendingSave,
    onPublished: (published) => {
      const p = published && published.header;
      if (p) publishedConfig = { ...clone(DEFAULTS), ...p };
      refresh();
    },
    onDiscarded: (draft) => {
      const d = draft && draft.header;
      if (d) {
        config = { ...clone(DEFAULTS), ...d };
        publishedConfig = clone(config);
        writeCache(config);
        applyToControls();
      }
    },
  });

  // Auto-save on a page-hide/unload so a rapid edit-then-leave within the
  // debounce window isn't silently lost; best-effort, doesn't block leaving.
  window.addEventListener('beforeunload', () => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
      try {
        fetch('/api/website/header', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          keepalive: true,
          body: JSON.stringify(config),
        });
      } catch (_) { /* best effort */ }
    }
  });

  fetch('/api/website/header', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((hdr) => {
      const draft = clone((hdr && (hdr.draft || hdr.defaults)) || DEFAULTS);
      const published = clone((hdr && hdr.published) || draft);
      publishedConfig = { ...clone(DEFAULTS), ...published };
      loaded = true;
      writeCache(draft);
      if (touched) { refresh(); return; } // the user already started editing — keep their work
      config = { ...clone(DEFAULTS), ...draft };
      applyToControls();
    });
})();
