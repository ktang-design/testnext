// Website layer — Branding configuration.
// A logo override (replaces the platform logo) + the brand colour palette.
(function () {
  const $ = (s) => document.querySelector(s);
  const saveBtn = $('[data-action="save"]');
  const statusEl = $('[data-save-status]');
  const colorsEl = $('[data-colors]');
  const logoChoose = $('[data-logo-choose]');
  const logoPreview = $('[data-logo-preview]');
  const logoImg = $('[data-logo-img]');
  const logoReplace = $('[data-logo-replace]');
  const logoRemove = $('[data-logo-remove]');
  const logoInput = $('[data-logo-input]');
  const logoError = $('[data-logo-error]');

  const COLORS = [
    { key: 'primary', label: 'Primary', def: '#255096', tip: 'For key actions, highlights, and core interactive elements.' },
    { key: 'secondary', label: 'Secondary', def: '#3D3F42', tip: 'For alternative actions, supporting components, and secondary emphasis.' },
    { key: 'heading', label: 'Heading', def: '#3D3F42', tip: 'Applied to headings and section titles across your site.' },
    { key: 'body', label: 'Body', def: '#55585D', tip: 'Applied to body and paragraph text.' },
    { key: 'link', label: 'Link', def: '#255096', tip: 'Applied to links and other interactive text.' },
  ];
  // Last-saved config, cached so the swatches show the real colours instantly on
  // load (no flash of black/defaults while the network resolves).
  const CACHE_KEY = 'ws-branding-cache';
  const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) { return null; } };
  const writeCache = (cfg) => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cfg)); return; } catch (_) { /* quota — retry without the logo */ }
    try { const lite = JSON.parse(JSON.stringify(cfg)); lite.logo = null; localStorage.setItem(CACHE_KEY, JSON.stringify(lite)); } catch (_) {}
  };
  const LOGO_MAX = 3 * 1024 * 1024; // 3 MB (keeps uploads under the serverless body limit)

  let config = null;
  let baseline = '';
  let loaded = false; // true once the saved config has loaded — no "dirty" before then
  let saving = false;
  let saveError = null;
  let preview = null;
  const colorSetters = {};

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const serialize = () => JSON.stringify(config);
  const isDirty = () => loaded && serialize() !== baseline;
  const show = (el) => { el.hidden = false; };
  const hide = (el) => { el.hidden = true; };

  function onChange() { saveError = null; pushPreview(); updateSaveBar(); }
  const pushPreview = () => { if (config && preview) preview.update({ branding: config }); };

  // ---------- colour rows (shared .colorrow component) ----------
  function buildColorRows() {
    colorsEl.innerHTML = '';
    COLORS.forEach((c) => {
      const row = document.createElement('div');
      row.className = 'colorrow';
      row.dataset.color = c.key;
      // Swatches start at the brand default (not the colour input's black default)
      // so there's no black flash before the saved colours load. The label carries
      // a tooltip describing what the colour applies to.
      row.innerHTML =
        `<span class="colorrow__label" data-tooltip="${c.tip}">${c.label}</span>` +
        '<span class="colorrow__controls">' +
        `<input type="color" class="colorrow__swatch" data-color-swatch value="${c.def}" aria-label="${c.label} colour" />` +
        `<input type="text" class="colorrow__hex" data-color-hex value="${c.def}" maxlength="7" spellcheck="false" aria-label="${c.label} colour hex" />` +
        '<span class="colorrow__opacity">' +
        `<input type="number" class="colorrow__opacityval" data-color-opacity min="0" max="100" value="100" aria-label="${c.label} opacity percent" /><span aria-hidden="true">%</span>` +
        '</span></span>';
      colorsEl.appendChild(row);
      colorSetters[c.key] = setupColor(c.key, row);
    });
  }

  function setupColor(key, row) {
    const swatch = row.querySelector('[data-color-swatch]');
    const hex = row.querySelector('[data-color-hex]');
    const op = row.querySelector('[data-color-opacity]');
    const ensureVisible = () => { if (config[key].opacity === 0) { config[key].opacity = 100; op.value = 100; } };
    swatch.addEventListener('input', () => { config[key].color = swatch.value.toUpperCase(); hex.value = config[key].color; ensureVisible(); onChange(); });
    hex.addEventListener('input', () => {
      let v = hex.value.trim();
      if (v && !v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) { config[key].color = v.toUpperCase(); swatch.value = config[key].color; ensureVisible(); onChange(); }
    });
    hex.addEventListener('blur', () => { hex.value = config[key].color; });
    op.addEventListener('input', () => {
      let n = parseInt(op.value, 10);
      if (Number.isNaN(n)) return;
      n = Math.max(0, Math.min(100, n));
      config[key].opacity = n; onChange();
    });
    op.addEventListener('blur', () => { op.value = config[key].opacity; });
    return () => { swatch.value = config[key].color; hex.value = config[key].color; op.value = config[key].opacity; };
  }

  // ---------- logo ----------
  function renderLogo() {
    if (config.logo) { logoImg.src = config.logo; show(logoPreview); hide(logoChoose); }
    else { hide(logoPreview); show(logoChoose); }
  }
  function pickLogo() { logoInput.click(); }
  logoInput.addEventListener('change', () => {
    const file = logoInput.files && logoInput.files[0];
    logoInput.value = '';
    if (!file) return;
    hide(logoError);
    if (file.size > LOGO_MAX) { logoError.textContent = 'Logo must be 3 MB or smaller.'; show(logoError); return; }
    const reader = new FileReader();
    reader.onload = () => { config.logo = reader.result; renderLogo(); onChange(); };
    reader.onerror = () => { logoError.textContent = 'Couldn’t read that file. Try another.'; show(logoError); };
    reader.readAsDataURL(file);
  });
  logoChoose.addEventListener('click', pickLogo);
  logoReplace.addEventListener('click', pickLogo);
  logoRemove.addEventListener('click', () => { config.logo = null; hide(logoError); renderLogo(); onChange(); });

  // ---------- render / save bar ----------
  function applyToControls() {
    renderLogo();
    COLORS.forEach((c) => colorSetters[c.key] && colorSetters[c.key]());
    pushPreview();
  }
  function updateSaveBar() {
    const dirty = isDirty();
    saveBtn.disabled = saving || !dirty;
    saveBtn.classList.toggle('is-saving', saving);
    if (saving) { statusEl.hidden = false; statusEl.classList.remove('save-status--error'); statusEl.textContent = 'Saving…'; }
    else if (saveError) { statusEl.hidden = false; statusEl.classList.add('save-status--error'); statusEl.textContent = saveError; }
    else { statusEl.hidden = !dirty; statusEl.classList.remove('save-status--error'); statusEl.textContent = 'Unsaved changes'; }
  }

  async function save() {
    if (saving || !isDirty()) return;
    saving = true; saveError = null; updateSaveBar();
    try {
      const res = await fetch('/api/website/branding', {
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
      baseline = serialize();
      saving = false; saveError = null;
      applyToControls();
      writeCache(config);
      updateSaveBar();
    } catch (err) {
      saving = false; saveError = err.message || 'Couldn’t save. Try again.';
      updateSaveBar();
    }
  }

  // ---------- nav guard ----------
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
  preview = window.WebsitePreview.create(document.querySelector('[data-website-preview]'));
  saveBtn.addEventListener('click', save);
  buildColorRows();
  setupNavGuard();

  // Paint the last-saved colours immediately from cache (revalidated by the fetch).
  const cached = readCache();
  if (cached) { config = clone(cached); applyToControls(); }

  fetch('/api/website/branding', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((data) => {
      config = clone(data.saved || data.defaults);
      baseline = serialize();
      loaded = true;
      applyToControls();
      writeCache(config);
      updateSaveBar();
    })
    .catch(() => {
      config = clone({ logo: null, primary: { color: '#255096', opacity: 100 }, secondary: { color: '#3D3F42', opacity: 100 }, heading: { color: '#3D3F42', opacity: 100 }, body: { color: '#55585D', opacity: 100 }, link: { color: '#255096', opacity: 100 } });
      baseline = serialize();
      loaded = true;
      applyToControls();
    });
})();
