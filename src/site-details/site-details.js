// Site details — Save / Reset-to-default / Unsaved-changes logic, persisted to
// the signed-in user's account via /api/site-settings.
//
// User stories:
//   • The "default state" is the LAST SAVED values.
//   • "Reset to default" is disabled only while the inputs match the default
//     state; once they differ (unsaved edits) it becomes active.
//   • Selecting "Reset to default" reverts the fields to the default state and
//     the button becomes "Undo reset".
//   • "Undo reset" restores the fields to what was previously added.
//   • Save is enabled while there are unsaved changes; it persists to the
//     account and updates the default state.
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

  // The "default state" = the last saved values (server-backed). Until the
  // server responds, fall back to whatever the inputs render with.
  let saved = { name: nameInput.value, description: descInput.value };
  let saving = false;
  let justSaved = false;
  let saveError = null;
  // After a reset, holds the edits that were discarded so "Undo reset" can
  // restore them. null = not in "undo" mode.
  let undoValue = null;

  const current = () => ({ name: nameInput.value, description: descInput.value });
  const eq = (a, b) => a.name === b.name && a.description === b.description;
  const isDirty = () => !eq(current(), saved); // differs from the default state

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

    updateValidation(); // keep error messages live with every change
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

    if (undoValue !== null) {
      // A reset was just performed → offer to undo it.
      resetBtn.textContent = 'Undo reset';
      resetBtn.disabled = saving;
    } else {
      // "Reset to default" is active only when the value differs from the
      // default state (last saved); disabled when it matches.
      resetBtn.textContent = 'Reset to default';
      resetBtn.disabled = saving || !dirty;
    }
  }

  function setInputs(values) {
    nameInput.value = values.name;
    descInput.value = values.description;
    refreshDerived();
  }

  function handleInput() {
    justSaved = false;
    saveError = null;
    undoValue = null; // fresh edits supersede the undo buffer
    refreshDerived();
    render();
  }
  nameInput.addEventListener('input', handleInput);
  descInput.addEventListener('input', handleInput);

  // Reset to default ⇄ Undo reset.
  resetBtn.addEventListener('click', () => {
    if (resetBtn.disabled) return;
    if (undoValue !== null) {
      const restore = undoValue;
      undoValue = null;
      setInputs(restore); // revert to what was previously added
    } else {
      undoValue = current(); // remember the edits being discarded
      setInputs(saved); // revert to the default state (last saved)
    }
    justSaved = false;
    saveError = null;
    render();
  });

  // Save → persist to the user's account.
  saveBtn.addEventListener('click', async () => {
    if (saveBtn.disabled || saving) return;
    if (!updateValidation()) {
      // Block invalid saves; the inline errors are already shown live.
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
      saved = data.saved || current(); // new default state
      justSaved = true;
      undoValue = null;
    } catch (err) {
      saveError = err.message || 'Couldn’t save. Try again.';
    } finally {
      saving = false;
      render();
    }
  });

  // Initial paint from the fallback, then hydrate the default state from the
  // server (the user's last saved values, or factory defaults if never saved).
  refreshDerived();
  render();

  (async () => {
    try {
      const res = await fetch('/api/site-settings', { credentials: 'include' });
      if (!res.ok) return; // not signed in / offline → keep fallback
      const data = await res.json();
      saved = data.saved || data.defaults || saved;
      undoValue = null;
      setInputs(saved);
      render();
    } catch (_) {
      /* keep fallback */
    }
  })();
});
