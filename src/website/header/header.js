// Website layer — Header configuration.
// Logo/navigation placement + colours + header image, with a live preview.
// Nav link text has no colour field of its own — it's auto-detected against
// the Branding background at render time (see website-preview.js).
(function () {
  const $ = (s) => document.querySelector(s);
  const saveBtn = $('[data-action="save"]');
  const statusEl = $('[data-save-status]');
  const navSecond = $('[data-nav-second]');
  const imgChoose = $('[data-img-choose]');
  const imgPreview = $('[data-img-preview]');
  const imgEl = $('[data-img-el]');
  const imgReplace = $('[data-img-replace]');
  const imgRemove = $('[data-img-remove]');
  const imgInput = $('[data-img-input]');
  const imgError = $('[data-img-error]');
  const IMAGE_MAX = 3 * 1024 * 1024; // 3 MB
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
  let baseline = '';
  let loaded = false; // true once the saved config has loaded — no "dirty" before then
  let saving = false;
  let saveError = null;
  let touched = false; // set once the user edits, so the revalidation fetch won't clobber it

  // Instant-load cache: paint the last-known config before the network
  // resolves, then revalidate. Avoids the flash of DEFAULTS on load.
  const CACHE_KEY = 'ws-header-cache';
  const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) { return null; } };
  const writeCache = (data) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (_) { /* ignore */ } };

  const show = (el) => { el.hidden = false; };
  const hide = (el) => { el.hidden = true; };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const isDirty = () => loaded && JSON.stringify(config) !== baseline;

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

  const logoSeg = setupSeg('logo', (v) => { touched = true; config.logo = v; refresh(); });
  const navSeg = setupSeg('nav', (v) => { touched = true; config.nav = v; refresh(); });

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
      touched = true;
      config[key].color = swatch.value.toUpperCase();
      hex.value = config[key].color;
      ensureVisible();
      refresh();
    });
    hex.addEventListener('input', () => {
      let v = hex.value.trim();
      if (v && !v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) { touched = true; config[key].color = v.toUpperCase(); swatch.value = config[key].color; ensureVisible(); refresh(); }
    });
    hex.addEventListener('blur', () => { hex.value = config[key].color; });
    op.addEventListener('input', () => {
      let n = parseInt(op.value, 10);
      if (Number.isNaN(n)) return;
      n = Math.max(0, Math.min(100, n));
      touched = true;
      config[key].opacity = n;
      refresh();
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
    reader.onload = () => { touched = true; config.headerImage = reader.result; renderImage(); refresh(); };
    reader.onerror = () => { imgError.textContent = 'Couldn’t read that file. Try another.'; show(imgError); };
    reader.readAsDataURL(file);
  });
  imgChoose.addEventListener('click', pickImage);
  imgReplace.addEventListener('click', pickImage);
  imgRemove.addEventListener('click', () => { touched = true; config.headerImage = null; hide(imgError); renderImage(); refresh(); });

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
    updateSaveBar();
  }

  function updateSaveBar() {
    const dirty = isDirty();
    saveBtn.disabled = saving || !dirty;
    saveBtn.classList.toggle('is-saving', saving);
    if (saving) {
      statusEl.hidden = false; statusEl.classList.remove('save-status--error'); statusEl.textContent = 'Saving…';
    } else if (saveError) {
      statusEl.hidden = false; statusEl.classList.add('save-status--error'); statusEl.textContent = saveError;
    } else {
      statusEl.hidden = !dirty; statusEl.classList.remove('save-status--error'); statusEl.textContent = 'Unsaved changes';
    }
  }

  // ---------- save ----------
  async function save() {
    if (saving || !isDirty()) return;
    saving = true; saveError = null; updateSaveBar();
    try {
      const res = await fetch('/api/website/header', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        let msg = 'Couldn’t save. Try again.';
        try { const d = await res.json(); if (d.message) msg = d.message; } catch (_) {}
        throw new Error(msg);
      }
      const data = await res.json();
      config = data.saved;
      baseline = JSON.stringify(config);
      writeCache(config);
      saving = false; saveError = null; touched = false;
      applyToControls();
    } catch (err) {
      saving = false; saveError = err.message || 'Couldn’t save. Try again.';
      updateSaveBar();
    }
  }

  // ---------- nav guard (unsaved changes) ----------
  function setupNavGuard() {
    const modal = $('[data-modal="unsaved"]');
    let pendingHref = null;
    let allowLeave = false;
    const open = () => { modal.hidden = false; modal.querySelector('[data-modal-keep]').focus(); };
    const close = () => { modal.hidden = true; pendingHref = null; };
    modal.querySelector('[data-modal-close]').addEventListener('click', close);
    modal.querySelector('[data-modal-keep]').addEventListener('click', close);
    modal.querySelector('[data-modal-discard]').addEventListener('click', () => {
      allowLeave = true; const href = pendingHref; close(); if (href) window.location.href = href;
    });
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link || allowLeave || !isDirty()) return;
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || link.target === '_blank') return;
      const url = new URL(href, location.href);
      if (url.origin === location.origin && url.pathname === location.pathname) return;
      e.preventDefault(); pendingHref = url.href; open();
    });
    window.addEventListener('beforeunload', (e) => {
      if (isDirty() && !allowLeave) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // ---------- boot ----------
  saveBtn.addEventListener('click', save);
  setupNavGuard();

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
    baseline = JSON.stringify(config);
    loaded = true;
    applyToControls();
  }

  fetch('/api/website/header', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((hdr) => {
      const serverConfig = clone((hdr && (hdr.saved || hdr.defaults)) || DEFAULTS);
      baseline = JSON.stringify(serverConfig);
      loaded = true;
      writeCache(serverConfig);
      if (touched) { updateSaveBar(); return; } // the user already started editing — keep their work
      config = serverConfig;
      applyToControls();
    });
})();
