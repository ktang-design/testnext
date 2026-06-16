// Branding settings page — interactivity
// Implemented from Figma node 1:1272.
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

  // Capture defaults so "Reset to default" can restore them.
  const defaults = new Map();
  document.querySelectorAll('.swatch input[type="color"]').forEach((input) => {
    defaults.set(input, input.value);
  });

  // Live-sync a color swatch with its chip + hex label.
  document.querySelectorAll('.swatch').forEach((swatch) => {
    const input = swatch.querySelector('input[type="color"]');
    const hexLabel = swatch.closest('.color-card__value')?.querySelector('.color-card__hex');
    input.addEventListener('input', () => {
      swatch.style.setProperty('--swatch', input.value);
      if (hexLabel) hexLabel.textContent = input.value.toUpperCase();
    });
  });

  // Wire up actions.
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    const action = trigger.dataset.action;

    if (action === 'reset') {
      defaults.forEach((value, input) => {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: false }));
      });
      toast('Branding reset to default.');
    } else if (action === 'upload-logo') {
      document.querySelector('[data-input="logo"]')?.click();
    } else if (action === 'upload-favicon') {
      document.querySelector('[data-input="favicon"]')?.click();
    } else if (action === 'save' || action === 'save-secondary') {
      toast('Branding saved.');
    }
  });

  // Reflect chosen file names.
  document.querySelectorAll('input[type="file"]').forEach((input) => {
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (file) toast(`Selected “${file.name}”.`);
    });
  });
});
