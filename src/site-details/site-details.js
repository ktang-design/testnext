// Site details settings page — interactivity
// Implemented from Figma node 1:1261.
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

  const nameInput = document.getElementById('site-name');
  const descInput = document.getElementById('site-description');
  const previewTitle = document.querySelector('[data-preview="title"]');
  const previewDesc = document.querySelector('[data-preview="desc"]');

  // Capture defaults for "Reset to default".
  const defaults = {
    name: nameInput.value,
    description: descInput.value,
  };

  // Keep a field's "N/max" counter in sync with its length.
  function bindCounter(input) {
    const counter = document.querySelector(`[data-count-for="${input.id}"]`);
    if (!counter) return;
    const update = () => { counter.textContent = String(input.value.length); };
    input.addEventListener('input', update);
    update();
  }
  bindCounter(nameInput);
  bindCounter(descInput);

  // Live-update the search-engine preview as the user types.
  function syncPreview() {
    previewTitle.textContent = nameInput.value || 'StacksNext';
    previewDesc.textContent = descInput.value;
  }
  nameInput.addEventListener('input', syncPreview);
  descInput.addEventListener('input', syncPreview);

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    if (trigger.dataset.action === 'reset') {
      nameInput.value = defaults.name;
      descInput.value = defaults.description;
      nameInput.dispatchEvent(new Event('input'));
      descInput.dispatchEvent(new Event('input'));
      toast('Site details reset to default.');
    } else if (trigger.dataset.action === 'save') {
      toast('Site details saved.');
    }
  });
});
