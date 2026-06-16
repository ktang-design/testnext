// Access settings page — interactivity
// Implemented from Figma node 1:1282.
document.addEventListener('DOMContentLoaded', () => {
  const toastEl = document.querySelector('.toast');
  let toastTimer;
  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
  }

  const saveBtn = document.querySelector('[data-action="save"]');
  const radios = document.querySelectorAll('input[name="access-level"]');

  // Remember the option that is selected on load; Save enables only when the
  // selection changes away from it (the design ships with Save disabled).
  const initial = document.querySelector('input[name="access-level"]:checked')?.value;

  function refreshSave() {
    const current = document.querySelector('input[name="access-level"]:checked')?.value;
    const dirty = current !== initial;
    saveBtn.disabled = !dirty;
    saveBtn.classList.toggle('btn--disabled', !dirty);
    saveBtn.classList.toggle('btn--primary', dirty);
  }

  radios.forEach((radio) => radio.addEventListener('change', refreshSave));

  saveBtn.addEventListener('click', () => {
    if (saveBtn.disabled) return;
    toast('Access settings saved.');
  });
});
