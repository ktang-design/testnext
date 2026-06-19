// Website layer — Typography configuration.
// Font family + heading/body size & weight. Simple form: load, edit, save.
(function () {
  const $ = (s) => document.querySelector(s);
  const fields = Array.from(document.querySelectorAll('[data-field]'));
  const saveBtn = $('[data-action="save"]');
  const statusEl = $('[data-save-status]');

  let config = null;
  let baseline = '';
  let saving = false;
  let saveError = null;

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const serialize = () => JSON.stringify(config);
  const isDirty = () => serialize() !== baseline;

  function applyToControls() {
    fields.forEach((el) => { const k = el.dataset.field; if (config[k] != null) el.value = config[k]; });
    pushPreview();
  }

  const preview = window.WebsitePreview.create(document.querySelector('[data-website-preview]'));
  const pushPreview = () => { if (config) preview.update({ typography: config }); };

  fields.forEach((el) => {
    const evt = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evt, () => { config[el.dataset.field] = el.value; saveError = null; pushPreview(); updateSaveBar(); });
  });

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
      const res = await fetch('/api/website/typography', {
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
      updateSaveBar();
    } catch (err) {
      saving = false; saveError = err.message || 'Couldn’t save. Try again.';
      updateSaveBar();
    }
  }

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

  fetch('/api/website/typography', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((data) => {
      config = clone(data.saved || data.defaults);
      baseline = serialize();
      applyToControls();
      updateSaveBar();
    })
    .catch(() => {
      config = { fontFamily: 'Inter', headingSize: 'default', headingWeight: 'default', bodySize: 'default', bodyWeight: 'default' };
      baseline = serialize();
      applyToControls();
    });
})();
