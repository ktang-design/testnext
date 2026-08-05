// Site details — Save / Unsaved-changes logic, persisted to the signed-in
// user's account via /api/site-settings.
//
// Two distinct baselines:
//   systemDefault — the factory value, used as the dirty/Save baseline until the
//                   user has saved (and to seed the inputs on first load).
//   lastSaved     — the user's last saved value, or null if never saved
//                   (the dirty/Save baseline once a save exists).
document.addEventListener('DOMContentLoaded', () => {
  const nameInput = document.getElementById('site-name');
  const descInput = document.getElementById('site-description');
  const nameCount = document.querySelector('[data-count-for="site-name"]');
  const descCount = document.querySelector('[data-count-for="site-description"]');
  const previewTitle = document.querySelector('[data-preview="title"]');
  const previewDesc = document.querySelector('[data-preview="desc"]');
  const saveBtn = document.querySelector('[data-action="save"]');
  const saveLabel = saveBtn.querySelector('.btn__label');
  const statusEl = document.querySelector('[data-save-status]');
  const nameError = document.querySelector('[data-error-for="site-name"]');
  const descError = document.querySelector('[data-error-for="site-description"]');
  const adminEmailInput = document.getElementById('site-admin-email');
  const adminEmailError = document.querySelector('[data-error-for="site-admin-email"]');
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Fallbacks until the server responds. The factory default may have been
  // stashed on data-factory by the pre-paint hydration script (which sets the
  // input to the saved value) — prefer it so the Save baseline stays correct.
  let systemDefault = {
    name: nameInput.dataset.factory != null ? nameInput.dataset.factory : nameInput.value,
    description: descInput.dataset.factory != null ? descInput.dataset.factory : descInput.value,
    adminEmail: adminEmailInput && adminEmailInput.dataset.factory != null ? adminEmailInput.dataset.factory : (adminEmailInput ? adminEmailInput.value : ''),
  };
  let lastSaved = null; // null = never saved
  let saving = false;
  let justSaved = false;
  let saveError = null;
  let touched = false; // set once the user edits, so revalidation won't clobber

  // Instant-load cache: paint the saved values from the last-known value before
  // the network resolves, then revalidate. Avoids the flash of defaults on load.
  const CACHE_KEY = 'site-details-config';
  const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) { return null; } };
  const writeCache = (data) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (_) { /* ignore */ } };

  const current = () => ({ name: nameInput.value, description: descInput.value, adminEmail: adminEmailInput ? adminEmailInput.value : '' });
  const eq = (a, b) => !!a && !!b && a.name === b.name && a.description === b.description && (a.adminEmail || '') === (b.adminEmail || '');
  // Admin email is optional; valid only when empty or a well-formed address.
  const emailOk = () => !adminEmailInput || isEmpty(adminEmailInput.value) || EMAIL_RE.test(adminEmailInput.value.trim());
  // The baseline for "unsaved changes": the last saved value, or the system
  // default while nothing has been saved yet.
  const baseline = () => lastSaved || systemDefault;
  const isDirty = () => !eq(current(), baseline());

  const isEmpty = (v) => v.trim() === '';
  // Both fields are required; Save stays disabled until they're filled.
  const requiredFilled = () => !isEmpty(nameInput.value) && !isEmpty(descInput.value);

  // Live inline validation: each field is required (cannot be empty).
  function updateValidation() {
    const nameBad = isEmpty(nameInput.value);
    const descBad = isEmpty(descInput.value);
    nameError.hidden = !nameBad;
    descError.hidden = !descBad;
    nameInput.setAttribute('aria-invalid', nameBad ? 'true' : 'false');
    descInput.setAttribute('aria-invalid', descBad ? 'true' : 'false');
    const emailBad = adminEmailInput && !isEmpty(adminEmailInput.value) && !EMAIL_RE.test(adminEmailInput.value.trim());
    if (adminEmailError) adminEmailError.hidden = !emailBad;
    if (adminEmailInput) adminEmailInput.setAttribute('aria-invalid', emailBad ? 'true' : 'false');
    return !nameBad && !descBad && !emailBad;
  }

  function refreshDerived() {
    if (nameCount) nameCount.textContent = String(nameInput.value.length);
    if (descCount) descCount.textContent = String(descInput.value.length);

    const nameEmpty = isEmpty(nameInput.value);
    const descEmpty = isEmpty(descInput.value);
    previewTitle.textContent = nameEmpty ? 'Your site name will appear here' : nameInput.value;
    previewTitle.classList.toggle('preview__title--placeholder', nameEmpty);
    previewDesc.textContent = descEmpty ? 'Your site description will appear here' : descInput.value;
    previewDesc.classList.toggle('preview__desc--placeholder', descEmpty);

    updateValidation();
  }

  function render() {
    const dirty = isDirty();

    saveBtn.disabled = saving || !dirty || !requiredFilled() || !emailOk();
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

  function setInputs(values) {
    nameInput.value = values.name;
    descInput.value = values.description;
    if (adminEmailInput) adminEmailInput.value = values.adminEmail || '';
    refreshDerived();
  }

  function handleInput() {
    justSaved = false;
    saveError = null;
    touched = true;
    refreshDerived();
    render();
  }
  nameInput.addEventListener('input', handleInput);
  descInput.addEventListener('input', handleInput);
  if (adminEmailInput) adminEmailInput.addEventListener('input', handleInput);

  // Save → persist to the user's account.
  saveBtn.addEventListener('click', async () => {
    if (saveBtn.disabled || saving) return;
    if (!updateValidation()) {
      const firstBad = isEmpty(nameInput.value) ? nameInput
        : isEmpty(descInput.value) ? descInput
        : adminEmailInput;
      if (firstBad) firstBad.focus();
      return;
    }
    saving = true;
    justSaved = false;
    saveError = null;
    render();
    try {
      const res = await fetch('/api/site-settings', {
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
      lastSaved = data.saved || current(); // new last-saved baseline
      writeCache({ defaults: systemDefault, saved: lastSaved });
      justSaved = true;
      if (window.Toast) window.Toast.show('Site details saved.');
    } catch (err) {
      saveError = err.message || 'Couldn’t save. Try again.';
    } finally {
      saving = false;
      render();
    }
  });

  // Initial paint from the local cache (instant), then hydrate/revalidate.
  const cached = readCache();
  if (cached) {
    if (cached.defaults) systemDefault = cached.defaults;
    lastSaved = cached.saved || null;
    setInputs(baseline());
  } else {
    refreshDerived();
  }
  render();

  (async () => {
    try {
      const res = await fetch('/api/site-settings', { credentials: 'include' });
      if (!res.ok) return; // not signed in / offline → keep fallback
      const data = await res.json();
      systemDefault = data.defaults || systemDefault;
      lastSaved = data.saved || null;
      writeCache({ defaults: systemDefault, saved: lastSaved });
      if (touched) return; // the user already started editing — keep their work
      setInputs(baseline());
      render();
    } catch (_) {
      /* keep the cached/fallback view */
    }
  })();

  // ---- Unsaved-changes navigation guard --------------------------------
  // Trigger a confirm modal on in-app navigation (and a native prompt on
  // browser exit) while there are unsaved changes.
  const modal = document.querySelector('[data-modal="unsaved"]');
  let pendingHref = null;
  let allowLeave = false;

  function openModal() {
    if (window.AppShell) window.AppShell.closeDrawer();
    modal.hidden = false;
    document.body.classList.add('is-locked');
    const keep = modal.querySelector('[data-modal-keep]');
    if (keep) keep.focus();
  }
  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove('is-locked');
    pendingHref = null;
  }

  // Intercept link clicks that would leave this page (capture phase, so it
  // runs before the drawer's own click handling).
  document.addEventListener('click', (e) => {
    if (!isDirty()) return;
    const link = e.target.closest('a[href]');
    if (!link || link.target === '_blank') return;
    const url = new URL(link.href, location.href);
    if (url.origin === location.origin && url.pathname === location.pathname) return; // same page
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

  // Browser-level exit (refresh / close / sign-out redirect) while dirty.
  window.addEventListener('beforeunload', (e) => {
    if (isDirty() && !allowLeave) { e.preventDefault(); e.returnValue = ''; }
  });
});
