// Website layer — Branding configuration.
// The site logo (shared with Platform branding, kept in sync — see
// syncPlatformBrandingCache) + the brand colour palette. Edits auto-save as
// a DRAFT a couple of seconds after you stop editing; the shared Page
// Builder pageactions bar (website-saveactions.js) is what actually
// promotes drafts to published, across every section at once — the sync
// into Platform branding (below) only fires once a draft is actually
// published, so an in-progress edit never leaks into System Settings.
(function () {
  const $ = (s) => document.querySelector(s);
  const colorsEl = $('[data-colors]');
  const logoChoose = $('[data-logo-choose]');
  const logoPreview = $('[data-logo-preview]');
  const logoBox = logoPreview.querySelector('.wb-logo__box');
  const logoImg = $('[data-logo-img]');
  const logoReplace = $('[data-logo-replace]');
  const logoRemove = $('[data-logo-remove]');
  const logoInput = $('[data-logo-input]');
  const logoError = $('[data-logo-error]');

  const AUTO_SAVE_DELAY = 2000; // ms of idle time after the last edit before auto-saving

  const COLORS = [
    { key: 'primary', label: 'Primary', def: '#255096', tip: 'For key actions, highlights, and core interactive elements.' },
    { key: 'secondary', label: 'Secondary', def: '#3D3F42', tip: 'For alternative actions, supporting components, and secondary emphasis.' },
    { key: 'action', label: 'Actions', def: '#255096', tip: 'For buttons, links, and other interactive elements.' },
    { key: 'heading', label: 'Heading', def: '#3D3F42', tip: 'Applied to headings and section titles across your site.' },
    { key: 'body', label: 'Body', def: '#55585D', tip: 'Applied to body and paragraph text.' },
  ];
  // Defaults derived from COLORS, used to backfill a cached config from
  // before a colour existed (the set has changed more than once this
  // session) — without this, config[key].color below would throw on the
  // missing key, aborting the rest of this script before the fetch that
  // would otherwise have self-corrected it.
  const colorDefaults = { logo: null };
  COLORS.forEach((c) => { colorDefaults[c.key] = { color: c.def, opacity: 100 }; });

  // Last-known draft, cached so the swatches show the real colours instantly on
  // load (no flash of black/defaults while the network resolves).
  const CACHE_KEY = 'ws-branding-cache';
  // The server mirrors Website logo/primary/secondary/action up into the
  // Platform branding doc on Publish (routes/website.js's publish-all);
  // patch the Platform page's instant-load cache here too so it paints the
  // new logo/colours (and opacity) on the next visit instead of flashing the
  // stale ones. The mirror image of syncWebsiteBrandingCache in
  // /branding/branding.js. Favicon, alt text and options stay as they were.
  const PLATFORM_CACHE_KEY = 'platform-branding-config';
  const syncPlatformBrandingCache = (logo, primary, secondary, action) => {
    if (!primary || !secondary || !action) return;
    try {
      const cached = JSON.parse(localStorage.getItem(PLATFORM_CACHE_KEY) || 'null');
      // Never visited Platform branding — the server sync already covers it.
      if (!cached || typeof cached !== 'object' || !cached.saved) return;
      cached.saved.logo = logo || null;
      cached.saved.primaryColor = primary.color.toUpperCase();
      cached.saved.primaryOpacity = primary.opacity;
      cached.saved.secondaryColor = secondary.color.toUpperCase();
      cached.saved.secondaryOpacity = secondary.opacity;
      cached.saved.actionColor = action.color.toUpperCase();
      cached.saved.actionOpacity = action.opacity;
      localStorage.setItem(PLATFORM_CACHE_KEY, JSON.stringify(cached));
    } catch (_) {
      // Likely quota — retry without the logo so colours still sync.
      try {
        const cached = JSON.parse(localStorage.getItem(PLATFORM_CACHE_KEY) || 'null');
        if (!cached || typeof cached !== 'object' || !cached.saved) return;
        cached.saved.primaryColor = primary.color.toUpperCase();
        cached.saved.primaryOpacity = primary.opacity;
        cached.saved.secondaryColor = secondary.color.toUpperCase();
        cached.saved.secondaryOpacity = secondary.opacity;
        cached.saved.actionColor = action.color.toUpperCase();
        cached.saved.actionOpacity = action.opacity;
        localStorage.setItem(PLATFORM_CACHE_KEY, JSON.stringify(cached));
      } catch (_) { /* give up */ }
    }
  };
  const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) { return null; } };
  const writeCache = (cfg) => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cfg)); return; } catch (_) { /* quota — retry without the logo */ }
    try { const lite = JSON.parse(JSON.stringify(cfg)); lite.logo = null; localStorage.setItem(CACHE_KEY, JSON.stringify(lite)); } catch (_) {}
  };
  const LOGO_MAX = 3 * 1024 * 1024; // 3 MB (keeps uploads under the serverless body limit)

  let config = null;
  let publishedConfig = null; // last-known published snapshot
  let loaded = false; // true once the draft has loaded — no dirty check before then
  let saving = false; // an auto-save PUT is in flight
  let saveState = 'idle'; // 'idle' | 'pending' | 'saved'
  let autoSaveTimer = null;
  let touched = false; // set once the user edits, so the boot revalidation fetch won't clobber it
  let bar = null;
  let preview = null;
  const colorSetters = {};

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const serialize = (x) => JSON.stringify(x);
  const isLocalDirty = () => loaded && serialize(config) !== serialize(publishedConfig);
  const show = (el) => { el.hidden = false; };
  const hide = (el) => { el.hidden = true; };

  function onEdit() {
    touched = true;
    saveState = 'pending';
    render();
    scheduleAutoSave();
  }
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
        '</span>' +
        '</span>';
      colorsEl.appendChild(row);
      if (window.ColorPicker) {
        window.ColorPicker.upgrade(row.querySelector('[data-color-swatch]'), {
          opacityInput: row.querySelector('[data-color-opacity]'), label: c.label,
        });
      }
      colorSetters[c.key] = setupColor(c.key, row);
    });
  }

  function setupColor(key, row) {
    const swatch = row.querySelector('[data-color-swatch]');
    const hex = row.querySelector('[data-color-hex]');
    const op = row.querySelector('[data-color-opacity]');
    const ensureVisible = () => {
      if (config[key].opacity === 0) { config[key].opacity = 100; if (op) op.value = 100; }
    };
    swatch.addEventListener('input', () => { config[key].color = swatch.value.toUpperCase(); hex.value = config[key].color; ensureVisible(); onEdit(); });
    hex.addEventListener('input', () => {
      let v = hex.value.trim();
      if (v && !v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) { config[key].color = v.toUpperCase(); swatch.value = config[key].color; ensureVisible(); onEdit(); }
    });
    hex.addEventListener('blur', () => { hex.value = config[key].color; });
    if (op) {
      op.addEventListener('input', () => {
        let n = parseInt(op.value, 10);
        if (Number.isNaN(n)) return;
        n = Math.max(0, Math.min(100, n));
        config[key].opacity = n; onEdit();
      });
      op.addEventListener('blur', () => { op.value = config[key].opacity; });
    }
    return () => {
      swatch.value = config[key].color;
      hex.value = config[key].color;
      if (op) op.value = config[key].opacity;
    };
  }

  // ---------- logo ----------
  // Detect whether an image is light/white (so a white logo would be invisible
  // on a white background) by averaging the luminance of its opaque pixels on
  // a small canvas. Calls cb(true) when light. Mirrors /branding/branding.js.
  function detectLight(dataUrl, cb) {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        const w = (c.width = 40), h = (c.height = 40);
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        let lum = 0, alpha = 0;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3] / 255;
          if (a < 0.1) continue;
          lum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) * a;
          alpha += a;
        }
        cb(alpha > 0 && lum / alpha > 150); // light if the average opaque pixel is brighter than mid-gray
      } catch (_) { cb(false); }
    };
    img.onerror = () => cb(false);
    img.src = dataUrl;
  }
  function renderLogo() {
    if (config.logo) {
      logoImg.src = config.logo;
      show(logoPreview);
      hide(logoChoose);
      detectLight(config.logo, (light) => logoBox.classList.toggle('wb-logo__box--dark', light));
    } else {
      hide(logoPreview);
      show(logoChoose);
      logoBox.classList.remove('wb-logo__box--dark');
    }
  }
  function pickLogo() { logoInput.click(); }
  logoInput.addEventListener('change', () => {
    const file = logoInput.files && logoInput.files[0];
    logoInput.value = '';
    if (!file) return;
    hide(logoError);
    if (file.size > LOGO_MAX) { logoError.textContent = 'Logo must be 3 MB or smaller.'; show(logoError); return; }
    const reader = new FileReader();
    reader.onload = () => { config.logo = reader.result; renderLogo(); onEdit(); };
    reader.onerror = () => { logoError.textContent = 'Couldn’t read that file. Try another.'; show(logoError); };
    reader.readAsDataURL(file);
  });
  logoChoose.addEventListener('click', pickLogo);
  logoReplace.addEventListener('click', pickLogo);
  logoRemove.addEventListener('click', () => { config.logo = null; hide(logoError); renderLogo(); onEdit(); });

  // ---------- render ----------
  function applyToControls() {
    renderLogo();
    COLORS.forEach((c) => colorSetters[c.key] && colorSetters[c.key]());
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
    return fetch('/api/website/branding', {
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
      writeCache(config);
      applyToControls();
    }).catch((err) => {
      saving = false;
      saveState = 'idle';
      render();
      if (window.Toast) window.Toast.show(err.message || 'We could not save your changes. Try again.');
    });
  }

  // ---------- boot ----------
  preview = window.WebsitePreview.create(document.querySelector('[data-website-preview]'));
  buildColorRows();

  // Paint the last-known draft colours immediately from cache (revalidated by the fetch).
  const cached = readCache();
  if (cached) { config = { ...clone(colorDefaults), ...clone(cached) }; applyToControls(); }

  bar = window.WebsiteSaveActions.init({
    isLocalDirty,
    flushLocalSave: flushPendingSave,
    cancelLocalPending: cancelPendingSave,
    onPublished: (published) => {
      const p = published && published.branding;
      if (p) {
        publishedConfig = { ...clone(colorDefaults), ...clone(p) };
        syncPlatformBrandingCache(p.logo, p.primary, p.secondary, p.action);
      }
      render();
    },
    onDiscarded: (draft) => {
      const d = draft && draft.branding;
      if (d) {
        config = { ...clone(colorDefaults), ...clone(d) };
        publishedConfig = clone(config);
        writeCache(config);
        applyToControls();
      }
    },
  });

  window.addEventListener('beforeunload', () => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
      try {
        fetch('/api/website/branding', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          keepalive: true,
          body: JSON.stringify(config),
        });
      } catch (_) { /* best effort */ }
    }
  });

  fetch('/api/website/branding', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((data) => {
      const draft = clone(data.draft || data.saved || data.defaults);
      const published = clone(data.published || draft);
      publishedConfig = { ...clone(colorDefaults), ...published };
      loaded = true;
      writeCache(draft);
      if (touched) { render(); return; } // the user already started editing — keep their work
      config = draft;
      applyToControls();
    })
    .catch(() => {
      loaded = true;
      if (touched) { render(); return; }
      config = clone({ logo: null, primary: { color: '#255096', opacity: 100 }, secondary: { color: '#3D3F42', opacity: 100 }, action: { color: '#255096', opacity: 100 }, heading: { color: '#3D3F42', opacity: 100 }, body: { color: '#55585D', opacity: 100 } });
      publishedConfig = clone(config);
      applyToControls();
    });
})();
