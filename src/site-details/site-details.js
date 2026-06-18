// Site details — Save / Reset-to-default / Undo-reset / Unsaved-changes logic,
// persisted to the signed-in user's account via /api/site-settings.
//
// Two distinct baselines:
//   systemDefault — the factory value ("Reset to default" target).
//   lastSaved     — the user's last saved value, or null if never saved
//                   ("Undo reset" target; the dirty/Save baseline).
//
// User journeys:
//   No saved value:  edit → "Reset to default" → inputs go to systemDefault,
//                    and "Undo reset" is DISABLED (nothing saved to restore).
//   With saved value: edit → save → edit again → "Reset to default" → inputs go
//                    to systemDefault → "Undo reset" → inputs go to lastSaved.
document.addEventListener('DOMContentLoaded', () => {
  const nameInput = document.getElementById('site-name');
  const descInput = document.getElementById('site-description');
  const nameCount = document.querySelector('[data-count-for="site-name"]');
  const descCount = document.querySelector('[data-count-for="site-description"]');
  const previewTitle = document.querySelector('[data-preview="title"]');
  const previewDesc = document.querySelector('[data-preview="desc"]');
  const resetBtn = document.querySelector('[data-action="reset"]');
  const saveBtn = document.querySelector('[data-action="save"]');
  const saveLabel = saveBtn.querySelector('.btn__label');
  const statusEl = document.querySelector('[data-save-status]');
  const nameError = document.querySelector('[data-error-for="site-name"]');
  const descError = document.querySelector('[data-error-for="site-description"]');

  // Fallbacks until the server responds.
  let systemDefault = { name: nameInput.value, description: descInput.value };
  let lastSaved = null; // null = never saved
  let mode = 'reset'; // 'reset' | 'undo'
  let saving = false;
  let justSaved = false;
  let saveError = null;

  const current = () => ({ name: nameInput.value, description: descInput.value });
  const eq = (a, b) => !!a && !!b && a.name === b.name && a.description === b.description;
  // The baseline for "unsaved changes": the last saved value, or the system
  // default while nothing has been saved yet.
  const baseline = () => lastSaved || systemDefault;
  const isDirty = () => !eq(current(), baseline());

  const isEmpty = (v) => v.trim() === '';

  // Live inline validation: each field is required (cannot be empty).
  function updateValidation() {
    const nameBad = isEmpty(nameInput.value);
    const descBad = isEmpty(descInput.value);
    nameError.hidden = !nameBad;
    descError.hidden = !descBad;
    nameInput.setAttribute('aria-invalid', nameBad ? 'true' : 'false');
    descInput.setAttribute('aria-invalid', descBad ? 'true' : 'false');
    return !nameBad && !descBad;
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

    saveBtn.disabled = saving || !dirty;
    saveBtn.classList.toggle('is-saving', saving);
    saveLabel.textContent = saving ? 'Saving' : 'Save';

    let status = '';
    let isError = false;
    if (!saving) {
      if (saveError) { status = saveError; isError = true; }
      else if (dirty) status = 'Unsaved changes';
      else if (justSaved) status = 'Saved!';
    }
    statusEl.textContent = status;
    statusEl.hidden = status === '';
    statusEl.classList.toggle('save-status--error', isError);

    if (mode === 'undo') {
      // After a reset: offer to restore the last saved value. Disabled when
      // there is nothing saved to restore (or it already matches the inputs).
      resetBtn.textContent = 'Undo reset';
      resetBtn.disabled = saving || !lastSaved || eq(lastSaved, current());
    } else {
      // "Reset to default" → revert to the system default; disabled when the
      // inputs already match it.
      resetBtn.textContent = 'Reset to default';
      resetBtn.disabled = saving || eq(current(), systemDefault);
    }
  }

  function setInputs(values) {
    nameInput.value = values.name;
    descInput.value = values.description;
    refreshDerived();
  }

  function handleInput() {
    mode = 'reset'; // a manual edit exits "undo reset" mode
    justSaved = false;
    saveError = null;
    refreshDerived();
    render();
  }
  nameInput.addEventListener('input', handleInput);
  descInput.addEventListener('input', handleInput);

  // Reset to default ⇄ Undo reset.
  resetBtn.addEventListener('click', () => {
    if (resetBtn.disabled) return;
    if (mode === 'undo') {
      setInputs(lastSaved); // restore the last saved value
      mode = 'reset';
    } else {
      setInputs(systemDefault); // revert to the system default
      mode = 'undo';
    }
    justSaved = false;
    saveError = null;
    render();
  });

  // Save → persist to the user's account.
  saveBtn.addEventListener('click', async () => {
    if (saveBtn.disabled || saving) return;
    if (!updateValidation()) {
      (isEmpty(nameInput.value) ? nameInput : descInput).focus();
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
      mode = 'reset';
      justSaved = true;
    } catch (err) {
      saveError = err.message || 'Couldn’t save. Try again.';
    } finally {
      saving = false;
      render();
    }
  });

  // Initial paint, then hydrate from the server (system default + last saved).
  refreshDerived();
  render();

  (async () => {
    try {
      const res = await fetch('/api/site-settings', { credentials: 'include' });
      if (!res.ok) return; // not signed in / offline → keep fallback
      const data = await res.json();
      systemDefault = data.defaults || systemDefault;
      lastSaved = data.saved || null;
      mode = 'reset';
      setInputs(baseline());
      render();
    } catch (_) {
      /* keep fallback */
    }
  })();
});
