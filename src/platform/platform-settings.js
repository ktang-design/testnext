// Generic controller for the simple Platform settings pages (Language & region,
// Analytics). Declarative: a [data-settings="/api/..."]
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
  // Per-page toast message shown on a successful save (keyed by endpoint tail).
  var SAVED_MSG = {
    'language-region': 'Language & region settings saved.',
    analytics: 'Analytics settings saved.',
  };

  var baseline = {}, saving = false, justSaved = false, saveError = null, loaded = false, touched = false;
  // US-style phone mask: digits in -> (XXX) XXX-XXXX (progressive as you type).
  function formatPhone(v) {
    var d = String(v == null ? '' : v).replace(/\D/g, '').slice(0, 10);
    if (d.length === 0) return '';
    if (d.length < 4) return '(' + d;
    if (d.length < 7) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
    return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  }
  // GA4 Measurement ID mask: force "G-" + up to 10 letters/digits (uppercased);
  // empty stays empty (the ID is optional).
  function formatGa4(v) {
    var rest = String(v == null ? '' : v).toUpperCase().replace(/^G-?/, '').replace(/[^A-Z0-9]/g, '').slice(0, 10);
    return rest === '' ? '' : 'G-' + rest;
  }
  function applyMask(mask, v) { return mask === 'phone' ? formatPhone(v) : mask === 'ga4' ? formatGa4(v) : v; }

  // ---- field validation ----
  // A masked field can be left PARTIAL (e.g. "G-ABC"), which the mask happily
  // accepts as you type. These patterns describe a COMPLETE value. Empty always
  // passes — these fields are optional — so only a half-typed value is flagged.
  var COMPLETE = {
    ga4: /^G-[A-Z0-9]{10}$/,
  };
  function fieldInvalid(f) {
    var re = COMPLETE[f.dataset.mask];
    var v = (f.value || '').trim();
    return !!re && v !== '' && !re.test(v);
  }
  var errEls = {};
  Array.prototype.slice.call(root.querySelectorAll('[data-error-for]')).forEach(function (el) {
    errEls[el.getAttribute('data-error-for')] = el;
  });
  // An error only surfaces once the user has left the field or tried to save —
  // never while they are still typing towards a valid value.
  var revealed = {};
  function paintFieldError(f) {
    var show = revealed[f.id] && fieldInvalid(f);
    var el = errEls[f.id];
    if (el) el.hidden = !show;
    f.setAttribute('aria-invalid', show ? 'true' : 'false');
    var wrap = f.closest ? f.closest('.field') : null;
    if (wrap) wrap.classList.toggle('field--invalid', show);
  }
  function paintFieldErrors() { fields.forEach(paintFieldError); }
  function anyInvalid() { return fields.some(fieldInvalid); }

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
    }
    if (statusEl) { statusEl.textContent = s; statusEl.hidden = s === ''; statusEl.classList.toggle('save-status--error', err); }
  }
  function setValues(v) {
    fields.forEach(function (f) {
      if (v && v[f.dataset.field] != null) {
        f.value = applyMask(f.dataset.mask, v[f.dataset.field]);
      }
    });
    // Loaded / server-normalized values are complete, so this clears any error
    // left over from an earlier attempt.
    paintFieldErrors();
  }

  fields.forEach(function (f) {
    var onEdit = function () {
      if (f.dataset.mask) {
        var p = applyMask(f.dataset.mask, f.value);
        if (p !== f.value) { f.value = p; try { f.setSelectionRange(p.length, p.length); } catch (_) {} }
      }
      justSaved = false; saveError = null; touched = true; render();
    };
    f.addEventListener('input', onEdit);
    f.addEventListener('change', onEdit);
    // Typing hides the error (they may be mid-way to a valid value); leaving the
    // field is what commits the verdict.
    f.addEventListener('input', function () { revealed[f.id] = false; paintFieldError(f); });
    f.addEventListener('blur', function () { revealed[f.id] = true; paintFieldError(f); });
  });

  // Instant paint from cache (revalidated by the fetch).
  try { var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c) setValues(c); } catch (e) {}

  saveBtn.addEventListener('click', async function () {
    if (saveBtn.disabled || saving) return;
    // Saving reveals every field's verdict; an incomplete value stops here rather
    // than making a round trip the server would reject anyway.
    if (anyInvalid()) {
      fields.forEach(function (f) { revealed[f.id] = true; });
      paintFieldErrors();
      var bad = fields.filter(fieldInvalid)[0];
      if (bad) bad.focus();
      return;
    }
    saving = true; justSaved = false; saveError = null; render();
    try {
      var res = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(cur()) });
      if (!res.ok) { var m = 'Couldn’t save. Try again.'; try { var d = await res.json(); if (d.message) m = d.message; } catch (_) {} throw new Error(m); }
      var data = await res.json();
      if (data && data.saved) setValues(data.saved); // reflect server-normalized values
      baseline = cur();
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(baseline)); } catch (_) {}
      justSaved = true;
      if (window.Toast) window.Toast.show(SAVED_MSG[endpoint.split('/').pop()] || 'Changes saved.');
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
