// Site details — Save / Reset-to-default / Unsaved-changes logic, persisted to
// the signed-in user's account via /api/site-settings.
//
// Model:
//   DEFAULT  – factory values (from the server; the "Reset to default" target).
//   saved    – the user's last persisted values (null → never saved → DEFAULT).
//   current  – the live input values.
//   dirty       = current !== saved   → Save enabled, "Unsaved changes".
//   resettable  = saved   !== DEFAULT → "Reset to default" enabled.
// "Reset to default" flips to "Undo reset" once reset-but-unsaved.
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

  // Fallback factory defaults (the inputs' shipped values) until the server
  // responds with the authoritative ones.
  let DEFAULT = { name: nameInput.value, description: descInput.value };
  let saved = { ...DEFAULT };
  let saving = false;
  let justSaved = false;
  let saveError = null;

  const current = () => ({ name: nameInput.value, description: descInput.value });
  const eq = (a, b) => a.name === b.name && a.description === b.description;
  const isDirty = () => !eq(current(), saved);
  const isResettable = () => !eq(saved, DEFAULT);
  const currentIsDefault = () => eq(current(), DEFAULT);

  function refreshDerived() {
    if (nameCount) nameCount.textContent = String(nameInput.value.length);
    if (descCount) descCount.textContent = String(descInput.value.length);
    previewTitle.textContent = nameInput.value || 'StacksNext';
    previewDesc.textContent = descInput.value;
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

    resetBtn.disabled = saving || !isResettable();
    resetBtn.textContent =
      currentIsDefault() && isResettable() ? 'Undo reset' : 'Reset to default';
  }

  function setInputs(values) {
    nameInput.value = values.name;
    descInput.value = values.description;
    refreshDerived();
  }

  function handleInput() {
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
    setInputs(currentIsDefault() && isResettable() ? saved : DEFAULT);
    justSaved = false;
    saveError = null;
    render();
  });

  // Save → persist to the user's account.
  saveBtn.addEventListener('click', async () => {
    if (saveBtn.disabled || saving) return;
    if (!nameInput.value.trim()) {
      saveError = 'Site name is required.';
      render();
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
      saved = data.saved || current();
      justSaved = true;
    } catch (err) {
      saveError = err.message || 'Couldn’t save. Try again.';
    } finally {
      saving = false;
      render();
    }
  });

  // Initial paint from the fallback, then hydrate from the server.
  refreshDerived();
  render();

  (async () => {
    try {
      const res = await fetch('/api/site-settings', { credentials: 'include' });
      if (!res.ok) return; // not signed in / offline → keep fallback defaults
      const data = await res.json();
      if (data.defaults) DEFAULT = data.defaults;
      saved = data.saved || { ...DEFAULT };
      setInputs(saved);
      render();
    } catch (_) {
      /* keep fallback */
    }
  })();
});
