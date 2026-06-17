// Site details — Save / Reset-to-default / Unsaved-changes interaction logic.
// Implemented from Figma "FY26Q4_E1499_StacksNext-Designs" nodes:
//   4:1008 (pristine), 341:1065 (editing), 341:2262 (saving),
//   341:2439 (saved), 341:1410 (after reset → "Undo reset").
//
// Model:
//   DEFAULT  – the factory values the inputs ship with.
//   saved    – the last persisted values (starts equal to DEFAULT).
//   current  – the live input values.
//   dirty       = current !== saved          → Save enabled, "Unsaved changes".
//   resettable  = saved   !== DEFAULT         → Reset to default enabled (set per save).
// The reset button flips to "Undo reset" once you've reset to default but not
// yet saved (current === DEFAULT while saved differs).
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

  // Factory defaults = whatever the inputs render with on load.
  const DEFAULT = { name: nameInput.value, description: descInput.value };
  let saved = { ...DEFAULT };
  let saving = false;
  let justSaved = false;

  const current = () => ({ name: nameInput.value, description: descInput.value });
  const eq = (a, b) => a.name === b.name && a.description === b.description;
  const isDirty = () => !eq(current(), saved);
  const isResettable = () => !eq(saved, DEFAULT);
  const currentIsDefault = () => eq(current(), DEFAULT);

  // Live-derived UI: char counters + search-engine preview.
  function refreshDerived() {
    if (nameCount) nameCount.textContent = String(nameInput.value.length);
    if (descCount) descCount.textContent = String(descInput.value.length);
    previewTitle.textContent = nameInput.value || 'StacksNext';
    previewDesc.textContent = descInput.value;
  }

  // Render the action bar (Save + status + Reset) from current state.
  function render() {
    const dirty = isDirty();

    saveBtn.disabled = saving || !dirty;
    saveBtn.classList.toggle('is-saving', saving);
    saveLabel.textContent = saving ? 'Saving' : 'Save';

    let status = '';
    if (!saving) {
      if (dirty) status = 'Unsaved changes';
      else if (justSaved) status = 'Saved!';
    }
    statusEl.textContent = status;
    statusEl.hidden = status === '';

    resetBtn.disabled = saving || !isResettable();
    resetBtn.textContent =
      currentIsDefault() && isResettable() ? 'Undo reset' : 'Reset to default';
  }

  function setInputs(values) {
    nameInput.value = values.name;
    descInput.value = values.description;
    refreshDerived();
  }

  // Typing in either field.
  function handleInput() {
    justSaved = false; // any edit clears the "Saved!" confirmation
    refreshDerived();
    render();
  }
  nameInput.addEventListener('input', handleInput);
  descInput.addEventListener('input', handleInput);

  // Reset to default ⇄ Undo reset.
  resetBtn.addEventListener('click', () => {
    if (resetBtn.disabled) return;
    if (currentIsDefault() && isResettable()) {
      setInputs(saved); // Undo reset → restore the last saved values
    } else {
      setInputs(DEFAULT); // Reset to default
    }
    justSaved = false;
    render();
  });

  // Save (simulated async persistence to show the "Saving" state; the saved
  // baseline lives client-side for this interaction demo).
  saveBtn.addEventListener('click', () => {
    if (saveBtn.disabled || saving) return;
    saving = true;
    justSaved = false;
    render();
    setTimeout(() => {
      saved = current();
      saving = false;
      justSaved = true;
      render();
    }, 800);
  });

  refreshDerived();
  render();
});
