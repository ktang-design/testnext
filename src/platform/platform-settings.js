// Generic controller for the simple Platform settings pages (Communication,
// Language & region, Analytics). Declarative: a [data-settings="/api/..."]
// container holds [data-field="key"] inputs, a [data-action="save"] button, and
// a [data-save-status] element. Handles load → populate → dirty-tracking → save
// (with "Unsaved changes"/"Saved!" status + inline error) and the unsaved-changes
// navigation guard. Read-only fields simply omit data-field.
(function () {
  var root = document.querySelector('[data-settings]');
  if (!root) return;
  var endpoint = root.getAttribute('data-settings');
  var fields = Array.prototype.slice.call(root.querySelectorAll('[data-field]'));
  var saveBtn = root.querySelector('[data-action="save"]');
  var saveLabel = saveBtn.querySelector('.btn__label');
  var statusEl = root.querySelector('[data-save-status]');
  var CACHE_KEY = 'platform-cache:' + endpoint;

  var baseline = {}, saving = false, justSaved = false, saveError = null, loaded = false, touched = false;
  var cur = function () { var o = {}; fields.forEach(function (f) { o[f.dataset.field] = f.value; }); return o; };
  var eq = function (a, b) { return fields.every(function (f) { return (a[f.dataset.field] || '') === (b[f.dataset.field] || ''); }); };
  var dirty = function () { return loaded && !eq(cur(), baseline); };

  function render() {
    saveBtn.disabled = saving || !dirty();
    saveBtn.classList.toggle('is-saving', saving);
    if (saveLabel) saveLabel.textContent = saving ? 'Saving' : 'Save';
    var s = '', err = false;
    if (!saving) {
      if (saveError) { s = saveError; err = true; }
      else if (dirty()) s = 'Unsaved changes';
      else if (justSaved) s = 'Saved!';
    }
    if (statusEl) { statusEl.textContent = s; statusEl.hidden = s === ''; statusEl.classList.toggle('save-status--error', err); }
  }
  function setValues(v) { fields.forEach(function (f) { if (v && v[f.dataset.field] != null) f.value = v[f.dataset.field]; }); }

  fields.forEach(function (f) {
    var onEdit = function () { justSaved = false; saveError = null; touched = true; render(); };
    f.addEventListener('input', onEdit);
    f.addEventListener('change', onEdit);
  });

  // Instant paint from cache (revalidated by the fetch).
  try { var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c) setValues(c); } catch (e) {}

  saveBtn.addEventListener('click', async function () {
    if (saveBtn.disabled || saving) return;
    saving = true; justSaved = false; saveError = null; render();
    try {
      var res = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(cur()) });
      if (!res.ok) { var m = 'Couldn’t save. Try again.'; try { var d = await res.json(); if (d.message) m = d.message; } catch (_) {} throw new Error(m); }
      var data = await res.json();
      if (data && data.saved) setValues(data.saved); // reflect server-normalized values
      baseline = cur();
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(baseline)); } catch (_) {}
      justSaved = true;
    } catch (err) { saveError = err.message || 'Couldn’t save. Try again.'; }
    finally { saving = false; render(); }
  });

  fetch(endpoint, { credentials: 'include' })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
    .then(function (data) {
      if (!touched) setValues((data && (data.saved || data.defaults)) || {});
      baseline = cur(); loaded = true;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(baseline)); } catch (_) {}
      render();
    })
    .catch(function () { baseline = cur(); loaded = true; render(); });
  render();

  // ---- Unsaved-changes navigation guard ----
  var modal = document.querySelector('[data-modal="unsaved"]');
  if (modal) {
    var pending = null, allow = false;
    var open = function () { if (window.AppShell) window.AppShell.closeDrawer(); modal.hidden = false; document.body.classList.add('is-locked'); var k = modal.querySelector('[data-modal-keep]'); if (k) k.focus(); };
    var close = function () { modal.hidden = true; document.body.classList.remove('is-locked'); pending = null; };
    document.addEventListener('click', function (e) {
      if (!dirty()) return;
      var a = e.target.closest('a[href]'); if (!a || a.target === '_blank') return;
      var u = new URL(a.href, location.href);
      if (u.origin === location.origin && u.pathname === location.pathname) return;
      e.preventDefault(); pending = u.href; open();
    }, true);
    modal.querySelector('[data-modal-keep]').addEventListener('click', close);
    modal.querySelector('[data-modal-close]').addEventListener('click', close);
    modal.querySelector('[data-modal-discard]').addEventListener('click', function () { allow = true; var h = pending; close(); if (h) location.href = h; });
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) close(); });
    window.addEventListener('beforeunload', function (e) { if (dirty() && !allow) { e.preventDefault(); e.returnValue = ''; } });
  }
})();
