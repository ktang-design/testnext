// Website layer — Header configuration.
// Logo/navigation placement + background/links colours, with a live preview.
(function () {
  const $ = (s) => document.querySelector(s);
  const saveBtn = $('[data-action="save"]');
  const statusEl = $('[data-save-status]');
  const navSecond = $('[data-nav-second]');
  const DEFAULTS = { logo: 'left', nav: 'left', background: { color: '#FFFFFF', opacity: 100 }, links: { color: '#3D3F42', opacity: 100 }, heading: '', description: '' };
  // Shared website preview in the main area (header + body + footer).
  const preview = window.WebsitePreview.create(document.querySelector('[data-website-preview]'));

  let config = null;
  let baseline = '';
  let loaded = false; // true once the saved config has loaded — no "dirty" before then
  let saving = false;
  let saveError = null;

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

  const logoSeg = setupSeg('logo', (v) => { config.logo = v; refresh(); });
  const navSeg = setupSeg('nav', (v) => { config.nav = v; refresh(); });

  // ---------- colour rows ----------
  function setupColor(key) {
    const row = document.querySelector(`[data-color="${key}"]`);
    const swatch = row.querySelector('[data-color-swatch]');
    const hex = row.querySelector('[data-color-hex]');
    const op = row.querySelector('[data-color-opacity]');
    // Choosing a colour while it's fully transparent (the default) would show
    // nothing — make it visible so the choice reflects in the preview.
    const ensureVisible = () => {
      if (config[key].opacity === 0) { config[key].opacity = 100; op.value = 100; }
    };
    swatch.addEventListener('input', () => {
      config[key].color = swatch.value.toUpperCase();
      hex.value = config[key].color;
      ensureVisible();
      refresh();
    });
    hex.addEventListener('input', () => {
      let v = hex.value.trim();
      if (v && !v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) { config[key].color = v.toUpperCase(); swatch.value = config[key].color; ensureVisible(); refresh(); }
    });
    hex.addEventListener('blur', () => { hex.value = config[key].color; });
    op.addEventListener('input', () => {
      let n = parseInt(op.value, 10);
      if (Number.isNaN(n)) return;
      n = Math.max(0, Math.min(100, n));
      config[key].opacity = n;
      refresh();
    });
    op.addEventListener('blur', () => { op.value = config[key].opacity; });
    return { set: () => { swatch.value = config[key].color; hex.value = config[key].color; op.value = config[key].opacity; } };
  }
  const bgColor = setupColor('background');
  const linksColor = setupColor('links');

  // ---------- text fields (Heading / Description) ----------
  function setupField(key) {
    const input = document.querySelector(`[data-field="${key}"]`);
    input.addEventListener('input', () => { config[key] = input.value; saveError = null; refresh(); });
    return { set: () => { input.value = config[key] || ''; } };
  }
  const headingField = setupField('heading');
  const descriptionField = setupField('description');

  // ---------- render ----------
  function applyToControls() {
    logoSeg.paint(config.logo);
    navSeg.paint(config.nav);
    bgColor.set();
    linksColor.set();
    headingField.set();
    descriptionField.set();
    refresh();
  }

  function refresh() {
    navSecond.textContent = config.logo === 'left' ? 'Inline' : 'Center';
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
      saving = false; saveError = null;
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

  fetch('/api/website/header', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((hdr) => {
      config = clone((hdr && (hdr.saved || hdr.defaults)) || DEFAULTS);
      baseline = JSON.stringify(config);
      loaded = true;
      applyToControls();
    });
})();
