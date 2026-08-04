// EBSCO Discovery Service (Platform > Integrations) — load / validate / save
// the EDS integration config to the signed-in user's account via
// /api/platform/eds. Modeled on site-details.js (live counters, inline
// required-field validation, dirty/Save, unsaved-changes guard) with a
// "saved" toast instead of inline status. The endpoint URL is read-only and
// not part of the saved config; Authentication type is optional.
document.addEventListener('DOMContentLoaded', () => {
  const ENDPOINT = '/api/platform/eds';
  const KEYS = ['apiUsername', 'apiPassword', 'customerId', 'groupId', 'profile', 'authType'];
  const REQUIRED = ['apiUsername', 'apiPassword', 'customerId', 'groupId', 'profile'];

  const inputs = {};
  document.querySelectorAll('[data-field]').forEach((el) => { inputs[el.dataset.field] = el; });
  const countEls = {};
  document.querySelectorAll('[data-count-for]').forEach((el) => { countEls[el.dataset.countFor] = el; });
  const errEls = {};
  document.querySelectorAll('[data-error-for]').forEach((el) => { errEls[el.dataset.errorFor] = el; });

  const saveBtn = document.querySelector('[data-action="save"]');
  const saveLabel = saveBtn.querySelector('.btn__label');
  const statusEl = document.querySelector('[data-save-status]');

  let baseline = null;   // saved || defaults
  let saving = false;
  let saveError = null;
  let touched = false;    // set once the user edits (guards load hydration)
  let validated = false;  // errors only surface after a Save attempt
  let hasStoredPassword = false; // a password is already saved server-side

  const isEmpty = (v) => !v || v.trim() === '';
  const current = () => { const c = {}; KEYS.forEach((k) => { c[k] = inputs[k].value; }); return c; };
  // A required field is "filled" if it has a value. The API password is special:
  // it's write-only, so an empty box is fine when one is already stored (blank
  // means "keep the current password").
  const isFilled = (k) => (k === 'apiPassword' && hasStoredPassword ? true : !isEmpty(inputs[k].value));
  // Show a hint on the password box when a password is already stored.
  function reflectPasswordState() {
    const pw = inputs.apiPassword;
    if (pw) pw.placeholder = hasStoredPassword ? 'Leave blank to keep the current password' : '';
  }
  const eq = (a, b) => !!a && !!b && KEYS.every((k) => (a[k] || '') === (b[k] || ''));
  const isDirty = () => !eq(current(), baseline);

  function toast(message) { if (window.Toast) window.Toast.show(message); }

  // Required-field validation. Errors only surface after a Save attempt
  // (`validated`), so the form stays clean until the user tries to save with
  // some fields still empty. Once shown, they clear live as fields are filled.
  function updateValidation() {
    let allFilled = true;
    REQUIRED.forEach((k) => {
      const el = inputs[k];
      const empty = !isFilled(k);
      if (empty) allFilled = false;
      const show = empty && validated;
      const err = errEls[el.id];
      if (err) err.hidden = !show;
      el.setAttribute('aria-invalid', show ? 'true' : 'false');
      const field = el.closest('.field');
      if (field) field.classList.toggle('field--invalid', show);
    });
    return allFilled;
  }

  function refreshCounts() {
    KEYS.forEach((k) => {
      const el = inputs[k];
      const cnt = countEls[el.id];
      if (cnt) cnt.textContent = String(el.value.length);
    });
  }

  function render() {
    const dirty = isDirty();
    // Save is enabled whenever there are changes; clicking it with empty
    // required fields reveals the "cannot be empty" errors (rather than the
    // button staying disabled).
    saveBtn.disabled = saving || !dirty;
    saveBtn.classList.toggle('is-saving', saving);
    saveLabel.textContent = saving ? 'Saving' : 'Save';

    let status = '';
    let isError = false;
    if (!saving) {
      if (saveError) { status = saveError; isError = true; }
      else if (dirty) status = 'Unsaved changes';
    }
    statusEl.textContent = status;
    statusEl.hidden = status === '';
    statusEl.classList.toggle('save-status--error', isError);
  }

  function setInputs(cfg) {
    KEYS.forEach((k) => { inputs[k].value = cfg[k] != null ? cfg[k] : ''; });
    refreshCounts();
    updateValidation();
  }

  function handleInput() {
    touched = true;
    saveError = null;
    refreshCounts();
    updateValidation();
    render();
  }
  KEYS.forEach((k) => inputs[k].addEventListener('input', handleInput));

  saveBtn.addEventListener('click', async () => {
    if (saveBtn.disabled || saving) return;
    touched = true;
    validated = true; // reveal empty-required errors from here on
    if (!updateValidation()) {
      const firstEmpty = REQUIRED.find((k) => !isFilled(k));
      if (firstEmpty) inputs[firstEmpty].focus();
      render();
      return;
    }
    saving = true;
    saveError = null;
    render();
    try {
      const res = await fetch(ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(current()),
      });
      if (!res.ok) {
        let msg = 'Couldn’t save. Try again.';
        try { const d = await res.json(); if (d.message) msg = d.message; } catch (_) {}
        throw new Error(msg);
      }
      const data = await res.json();
      baseline = data.saved || current();
      hasStoredPassword = !!(data.saved && data.saved.hasApiPassword);
      setInputs(baseline);        // clears the password box (never returned)
      reflectPasswordState();
      toast('Integration saved!');
    } catch (err) {
      saveError = err.message || 'Couldn’t save. Try again.';
    } finally {
      saving = false;
      render();
    }
  });

  // ---- initial load ----
  // Seed the baseline from the initial DOM so the form isn't considered dirty
  // before the network responds (a null baseline made isDirty() true, which
  // popped the discard-changes modal on navigation even with no edits).
  baseline = current();
  refreshCounts();
  render();
  (async () => {
    try {
      const res = await fetch(ENDPOINT, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      baseline = data.saved || data.defaults || {};
      hasStoredPassword = !!(data.saved && data.saved.hasApiPassword);
      if (touched) return; // don't clobber in-progress edits
      setInputs(baseline);
      reflectPasswordState();
      render();
    } catch (_) { /* keep the seeded defaults */ }
  })();

  // ---- unsaved-changes navigation guard ----
  const modal = document.querySelector('[data-modal="unsaved"]');
  let pendingHref = null;
  let allowLeave = false;
  const openModal = () => {
    if (window.AppShell) window.AppShell.closeDrawer();
    modal.hidden = false;
    document.body.classList.add('is-locked');
    const keep = modal.querySelector('[data-modal-keep]');
    if (keep) keep.focus();
  };
  const closeModal = () => { modal.hidden = true; document.body.classList.remove('is-locked'); pendingHref = null; };
  document.addEventListener('click', (e) => {
    if (!isDirty()) return;
    const link = e.target.closest('a[href]');
    if (!link || link.target === '_blank') return;
    const url = new URL(link.href, location.href);
    if (url.origin === location.origin && url.pathname === location.pathname) return;
    e.preventDefault();
    pendingHref = url.href;
    openModal();
  }, true);
  modal.querySelector('[data-modal-keep]').addEventListener('click', closeModal);
  modal.querySelector('[data-modal-close]').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
  modal.querySelector('[data-modal-discard]').addEventListener('click', () => {
    allowLeave = true;
    const href = pendingHref;
    closeModal();
    if (href) window.location.href = href;
  });
  window.addEventListener('beforeunload', (e) => {
    if (isDirty() && !allowLeave) { e.preventDefault(); e.returnValue = ''; }
  });
});
