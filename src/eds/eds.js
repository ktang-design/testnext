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
  const toastEl = document.querySelector('.toast');

  let baseline = null;   // saved || defaults
  let saving = false;
  let saveError = null;
  let touched = false;   // errors only surface once the user has edited

  const isEmpty = (v) => !v || v.trim() === '';
  const current = () => { const c = {}; KEYS.forEach((k) => { c[k] = inputs[k].value; }); return c; };
  const eq = (a, b) => !!a && !!b && KEYS.every((k) => (a[k] || '') === (b[k] || ''));
  const isDirty = () => !eq(current(), baseline);
  const requiredFilled = () => REQUIRED.every((k) => !isEmpty(inputs[k].value));

  let toastTimer;
  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3200);
  }

  // Live inline validation: each required field cannot be empty. Errors only
  // show once the user has started editing (so the initial empty form is clean).
  function updateValidation() {
    let allFilled = true;
    REQUIRED.forEach((k) => {
      const el = inputs[k];
      const empty = isEmpty(el.value);
      if (empty) allFilled = false;
      const err = errEls[el.id];
      if (err) err.hidden = !(empty && touched);
      el.setAttribute('aria-invalid', empty && touched ? 'true' : 'false');
      const field = el.closest('.field');
      if (field) field.classList.toggle('field--invalid', empty && touched);
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
    saveBtn.disabled = saving || !dirty || !requiredFilled();
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
    if (!updateValidation()) {
      const firstEmpty = REQUIRED.find((k) => isEmpty(inputs[k].value));
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
      setInputs(baseline);
      toast('Integration saved!');
    } catch (err) {
      saveError = err.message || 'Couldn’t save. Try again.';
    } finally {
      saving = false;
      render();
    }
  });

  // ---- initial load ----
  refreshCounts();
  render();
  (async () => {
    try {
      const res = await fetch(ENDPOINT, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      baseline = data.saved || data.defaults || {};
      if (touched) return; // don't clobber in-progress edits
      setInputs(baseline);
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
