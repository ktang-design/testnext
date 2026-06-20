// Branding page — colors, logo & favicon upload with live previews, logo
// options, and a Reset/Undo/Save state machine persisted to the account
// (/api/branding). Implements Figma 354:1766 / 365:9587 / 493:14148 /
// 367:9801 / 367:10005 / 367:10605 / 501:5392.
document.addEventListener('DOMContentLoaded', () => {
  const $ = (sel) => document.querySelector(sel);
  const PLACEHOLDER_FAVICON = 'assets/placeholder-favicon.png';
  const LOGO_MAX = 3 * 1024 * 1024; // 3 MB (keeps uploads under the serverless body limit)
  const FAVICON_MAX = 1 * 1024 * 1024; // 1 MB

  // Color swatches
  const colorInputs = {
    primary: $('[aria-label="Primary color"]'),
    secondary: $('[aria-label="Secondary color"]'),
  };
  // Logo
  const logoInput = $('[data-input="logo"]');
  const logoEmptyBtn = $('[data-logo-empty]');
  const logoPreview = $('[data-logo-preview]');
  const logoImg = $('[data-logo-img]');
  const logoActions = $('[data-logo-actions]');
  const logoOptions = $('[data-logo-options]');
  const logoError = $('[data-error="logo"]');
  const showSiteCb = $('[data-opt="showSiteName"]');
  const decorativeCb = $('[data-opt="decorative"]');
  const altField = $('[data-alt-field]');
  const altInput = $('#logo-alt');
  const altCount = $('[data-count-for="logo-alt"]');
  // Favicon
  const faviconInput = $('[data-input="favicon"]');
  const browserMock = $('.browser');
  const faviconImg = $('.browser__favicon');
  const faviconRemove = $('[data-favicon-remove]');
  const faviconError = $('[data-error="favicon"]');
  // Save bar
  const resetBtn = $('[data-action="reset"]');
  const saveBtn = $('[data-action="save"]');
  const saveLabel = saveBtn.querySelector('.btn__label');
  const statusEl = $('[data-save-status]');

  // In-memory image data (data URLs, or null).
  let logoData = null;
  let faviconData = null;

  // State machine baselines.
  let systemDefault = {
    primaryColor: '#255096', secondaryColor: '#3D3F42', logo: null,
    showSiteName: false, decorative: false, altText: '', favicon: null,
  };
  let lastSaved = null;
  let mode = 'reset';
  let saving = false, justSaved = false, saveError = null;

  const current = () => ({
    primaryColor: (colorInputs.primary.value || '').toUpperCase(),
    secondaryColor: (colorInputs.secondary.value || '').toUpperCase(),
    logo: logoData,
    showSiteName: showSiteCb.checked,
    decorative: decorativeCb.checked,
    altText: altInput.value,
    favicon: faviconData,
  });
  const eq = (a, b) => a && b &&
    a.primaryColor === b.primaryColor && a.secondaryColor === b.secondaryColor &&
    a.logo === b.logo && a.showSiteName === b.showSiteName &&
    a.decorative === b.decorative && a.altText === b.altText && a.favicon === b.favicon;
  const baseline = () => lastSaved || systemDefault;
  const isDirty = () => !eq(current(), baseline());

  // ---- View helpers ----
  function setSwatch(which, hex) {
    const input = colorInputs[which];
    input.value = hex;
    const swatch = input.closest('.swatch');
    swatch.style.setProperty('--swatch', hex);
    const hexLabel = input.closest('.color-card__value').querySelector('.color-card__hex');
    if (hexLabel) hexLabel.textContent = hex.toUpperCase();
  }
  // Detect whether an image is light/white (so a white logo/favicon would be
  // invisible on a white background) by averaging the luminance of its opaque
  // pixels on a small canvas. Calls cb(true) when light.
  function detectLight(dataUrl, cb) {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        const w = (c.width = 40), h = (c.height = 40);
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        let lum = 0, alpha = 0;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3] / 255;
          if (a < 0.1) continue;
          lum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) * a;
          alpha += a;
        }
        cb(alpha > 0 && lum / alpha > 150); // light if the average opaque pixel is brighter than mid-gray
      } catch (_) { cb(false); }
    };
    img.onerror = () => cb(false);
    img.src = dataUrl;
  }

  function renderLogo() {
    const has = !!logoData;
    if (has) {
      logoImg.src = logoData;
      detectLight(logoData, (light) => logoPreview.classList.toggle('logo-preview--dark', light));
    } else {
      logoPreview.classList.remove('logo-preview--dark');
    }
    logoEmptyBtn.hidden = has;
    logoPreview.hidden = !has;
    logoActions.hidden = !has;
    logoOptions.hidden = !has;
  }
  function renderFavicon() {
    faviconImg.src = faviconData || PLACEHOLDER_FAVICON;
    faviconRemove.hidden = !faviconData;
    if (faviconData) {
      detectLight(faviconData, (light) => browserMock.classList.toggle('browser--dark', light));
    } else {
      browserMock.classList.remove('browser--dark'); // placeholder is colorful
    }
  }
  function renderAltField() {
    // Alt text is hidden (not required) for decorative images.
    altField.hidden = decorativeCb.checked;
  }
  function renderCounters() {
    if (altCount) altCount.textContent = String(altInput.value.length);
  }
  function showError(el, msg) {
    el.querySelector('.field__error-text').textContent = msg;
    el.hidden = false;
  }
  const hide = (el) => { el.hidden = true; };

  // ---- State machine render ----
  function render() {
    const dirty = isDirty();
    saveBtn.disabled = saving || !dirty;
    saveBtn.classList.toggle('is-saving', saving);
    saveLabel.textContent = saving ? 'Saving' : 'Save';

    let status = '', isError = false;
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

  // Apply a whole config object to the UI.
  function applyConfig(cfg) {
    setSwatch('primary', cfg.primaryColor);
    setSwatch('secondary', cfg.secondaryColor);
    logoData = cfg.logo || null;
    faviconData = cfg.favicon || null;
    showSiteCb.checked = !!cfg.showSiteName;
    decorativeCb.checked = !!cfg.decorative;
    altInput.value = cfg.altText || '';
    renderLogo();
    renderFavicon();
    renderAltField();
    renderCounters();
  }

  // A user change occurred → leave undo mode, clear transient status.
  function onChange() {
    mode = 'reset';
    justSaved = false;
    saveError = null;
    render();
  }

  // ---- Wire up inputs ----
  Object.entries(colorInputs).forEach(([which, input]) => {
    input.addEventListener('input', () => { setSwatch(which, input.value); onChange(); });
  });

  altInput.addEventListener('input', () => { renderCounters(); onChange(); });
  showSiteCb.addEventListener('change', onChange);
  decorativeCb.addEventListener('change', () => { renderAltField(); onChange(); });

  // File → data URL with size validation.
  function readImage(file, maxBytes, label, errEl, onOk) {
    hide(errEl);
    if (!file) return;
    if (file.size > maxBytes) {
      const mb = Math.round(maxBytes / (1024 * 1024));
      showError(errEl, `The selected file exceeds the maximum upload size of ${mb} MB. Please choose a smaller file and try again.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { onOk(reader.result); };
    reader.readAsDataURL(file);
  }

  logoInput.addEventListener('change', () => {
    readImage(logoInput.files[0], LOGO_MAX, 'logo', logoError, (dataUrl) => {
      logoData = dataUrl;
      renderLogo();
      onChange();
    });
    logoInput.value = '';
  });
  faviconInput.addEventListener('change', () => {
    readImage(faviconInput.files[0], FAVICON_MAX, 'favicon', faviconError, (dataUrl) => {
      faviconData = dataUrl;
      renderFavicon();
      onChange();
    });
    faviconInput.value = '';
  });

  // Buttons (delegated).
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const action = t.dataset.action;
    if (action === 'upload-logo') logoInput.click();
    else if (action === 'upload-favicon') faviconInput.click();
    else if (action === 'remove-logo') { logoData = null; hide(logoError); renderLogo(); onChange(); }
    else if (action === 'remove-favicon') { faviconData = null; hide(faviconError); renderFavicon(); onChange(); }
    else if (action === 'reset') {
      if (resetBtn.disabled) return;
      if (mode === 'undo') { applyConfig(lastSaved); mode = 'reset'; }
      else { applyConfig(systemDefault); mode = 'undo'; }
      justSaved = false; saveError = null; render();
    } else if (action === 'save') {
      if (saveBtn.disabled || saving) return;
      doSave();
    }
  });

  async function doSave() {
    saving = true; justSaved = false; saveError = null; render();
    try {
      const res = await fetch('/api/branding', {
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
      lastSaved = data.saved || current();
      mode = 'reset'; justSaved = true;
    } catch (err) {
      saveError = err.message || 'Couldn’t save. Try again.';
    } finally {
      saving = false; render();
    }
  }

  // Initial paint + hydrate from the account.
  applyConfig(systemDefault);
  render();
  (async () => {
    try {
      const res = await fetch('/api/branding', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      systemDefault = data.defaults || systemDefault;
      lastSaved = data.saved || null;
      mode = 'reset';
      applyConfig(baseline());
      render();
    } catch (_) { /* keep fallback */ }
  })();

  // ---- Unsaved-changes navigation guard (mirrors Site details) ----
  const modal = $('[data-modal="unsaved"]');
  let pendingHref = null;
  let allowLeave = false;
  function openModal() {
    if (window.AppShell) window.AppShell.closeDrawer();
    modal.hidden = false;
    document.body.classList.add('is-locked');
    const keep = modal.querySelector('[data-modal-keep]');
    if (keep) keep.focus();
  }
  function closeModal() { modal.hidden = true; document.body.classList.remove('is-locked'); pendingHref = null; }
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
    allowLeave = true; const href = pendingHref; closeModal(); if (href) window.location.href = href;
  });
  window.addEventListener('beforeunload', (e) => {
    if (isDirty() && !allowLeave) { e.preventDefault(); e.returnValue = ''; }
  });
});
