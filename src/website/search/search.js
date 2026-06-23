// Website layer — Search configuration.
// A search bar shown below the site navigation: its background colour + optional
// background image, plus a list of configured searches. Each search becomes an
// option in the bar's dropdown. Searches are added from the "+" menu (EBSCO
// Discovery Service / Custom search) via a focused "Add … search" modal.
(function () {
  const $ = (s) => document.querySelector(s);
  const saveBtn = $('[data-action="save"]');
  const statusEl = $('[data-save-status]');
  const addBtn = $('[data-add-search]');
  const listEl = $('[data-search-list]');
  const bgColorEl = $('[data-bg-color]');
  const imgChoose = $('[data-img-choose]');
  const imgPreview = $('[data-img-preview]');
  const imgEl = $('[data-img-el]');
  const imgReplace = $('[data-img-replace]');
  const imgRemove = $('[data-img-remove]');
  const imgInput = $('[data-img-input]');
  const imgError = $('[data-img-error]');

  const NAME_MAX = 120;
  const LABEL_MAX = 120;
  const BUTTON_MAX = 60;
  const MAX_SEARCHES = 20;
  const IMAGE_MAX = 3 * 1024 * 1024; // 3 MB

  const DEFAULTS = { background: { color: '#255096', opacity: 100 }, backgroundImage: null, searches: [] };

  let config = null;
  let baseline = '';
  let saving = false;
  let saveError = null;
  let preview = null;
  let bgSetter = null;

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const serialize = () => JSON.stringify(config);
  const isDirty = () => serialize() !== baseline;
  const show = (el) => { el.hidden = false; };
  const hide = (el) => { el.hidden = true; };
  const uid = () => 'search-' + Math.random().toString(36).slice(2, 10);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function onChange() { saveError = null; pushPreview(); updateSaveBar(); }
  const pushPreview = () => { if (config && preview) preview.update({ search: config }); };

  // ---------- background colour (shared .colorrow component) ----------
  function buildBgColor() {
    const row = document.createElement('div');
    row.className = 'colorrow';
    row.innerHTML =
      '<span class="colorrow__label">Background</span>' +
      '<span class="colorrow__controls">' +
      '<input type="color" class="colorrow__swatch" data-color-swatch aria-label="Background colour" />' +
      '<input type="text" class="colorrow__hex" data-color-hex maxlength="7" spellcheck="false" aria-label="Background colour hex" />' +
      '<span class="colorrow__opacity">' +
      '<input type="number" class="colorrow__opacityval" data-color-opacity min="0" max="100" aria-label="Background opacity percent" /><span aria-hidden="true">%</span>' +
      '</span></span>';
    bgColorEl.appendChild(row);
    const swatch = row.querySelector('[data-color-swatch]');
    const hex = row.querySelector('[data-color-hex]');
    const op = row.querySelector('[data-color-opacity]');
    const bg = () => config.background;
    const ensureVisible = () => { if (bg().opacity === 0) { bg().opacity = 100; op.value = 100; } };
    swatch.addEventListener('input', () => { bg().color = swatch.value.toUpperCase(); hex.value = bg().color; ensureVisible(); onChange(); });
    hex.addEventListener('input', () => {
      let v = hex.value.trim();
      if (v && !v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) { bg().color = v.toUpperCase(); swatch.value = bg().color; ensureVisible(); onChange(); }
    });
    hex.addEventListener('blur', () => { hex.value = bg().color; });
    op.addEventListener('input', () => {
      let n = parseInt(op.value, 10);
      if (Number.isNaN(n)) return;
      n = Math.max(0, Math.min(100, n));
      bg().opacity = n; onChange();
    });
    op.addEventListener('blur', () => { op.value = bg().opacity; });
    bgSetter = () => { swatch.value = bg().color; hex.value = bg().color; op.value = bg().opacity; };
  }

  // ---------- background image ----------
  function renderImage() {
    if (config.backgroundImage) { imgEl.src = config.backgroundImage; show(imgPreview); hide(imgChoose); }
    else { hide(imgPreview); show(imgChoose); }
  }
  function pickImage() { imgInput.click(); }
  imgInput.addEventListener('change', () => {
    const file = imgInput.files && imgInput.files[0];
    imgInput.value = '';
    if (!file) return;
    hide(imgError);
    if (file.size > IMAGE_MAX) { imgError.textContent = 'Image must be 3 MB or smaller.'; show(imgError); return; }
    const reader = new FileReader();
    reader.onload = () => { config.backgroundImage = reader.result; renderImage(); onChange(); };
    reader.onerror = () => { imgError.textContent = 'Couldn’t read that file. Try another.'; show(imgError); };
    reader.readAsDataURL(file);
  });
  imgChoose.addEventListener('click', pickImage);
  imgReplace.addEventListener('click', pickImage);
  imgRemove.addEventListener('click', () => { config.backgroundImage = null; hide(imgError); renderImage(); onChange(); });

  // ---------- searches list ----------
  const PENCIL = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M10.8 2.6 13.4 5.2 5.4 13.2H2.8v-2.6z"/></svg>';
  const TRASH = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10M6 4.5V3h4v1.5M4.8 4.5 5.4 13h5.2l.6-8.5"/></svg>';

  function renderList() {
    listEl.innerHTML = '';
    const items = config.searches || [];
    listEl.hidden = items.length === 0;
    items.forEach((s) => {
      const li = document.createElement('li');
      li.className = 'ws-item';
      li.innerHTML =
        `<span class="ws-item__name">${esc(s.displayLabel || s.name)}</span>` +
        '<span class="ws-item__actions">' +
        `<button type="button" class="ws-iconbtn" data-edit aria-label="Edit search">${PENCIL}</button>` +
        `<button type="button" class="ws-iconbtn" data-del aria-label="Delete search">${TRASH}</button>` +
        '</span>';
      li.querySelector('[data-edit]').addEventListener('click', () => openSearchModal(s.type, s.id));
      li.querySelector('[data-del]').addEventListener('click', () => {
        config.searches = config.searches.filter((x) => x.id !== s.id);
        renderList(); onChange();
      });
      listEl.appendChild(li);
    });
  }

  // The "+" opens a menu to pick the search type, each of which opens the modal.
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (config.searches.length >= MAX_SEARCHES) return;
    window.Popover.open(addBtn, [
      { label: 'EBSCO Discovery Service', onSelect: () => openSearchModal('eds') },
      { label: 'Custom search', onSelect: () => openSearchModal('custom') },
    ], { align: 'left', label: 'Add search' });
  });

  // ---------- add / edit search modal ----------
  function openSearchModal(type, editId) {
    const existing = editId ? config.searches.find((s) => s.id === editId) : null;
    const draft = existing
      ? clone(existing)
      : { id: uid(), type, name: type === 'eds' ? 'EBSCO Discovery Service' : '', displayLabel: '', url: '', urlencode: true, buttonLabel: 'Search' };
    const noun = type === 'eds' ? 'EBSCO Discovery Service' : 'custom search';
    const prev = document.activeElement;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', (existing ? 'Edit ' : 'Add ') + noun);
    const modal = document.createElement('div');
    modal.className = 'modal modal--search';
    overlay.appendChild(modal);
    modal.innerHTML =
      `<div class="modal__header"><h2 class="modal__title">${existing ? 'Edit' : 'Add'} ${esc(noun)}</h2>` +
      '<button type="button" class="modal__close" aria-label="Close dialog"><img src="/shared/close.svg" alt="" /></button></div>' +
      '<div class="modal__body">' +
        '<div class="ws-mfield">' +
          '<label class="ws-label" for="ws-name">Search name</label>' +
          '<input type="text" class="ws-input" id="ws-name" maxlength="' + NAME_MAX + '" />' +
          '<button type="button" class="btn--link ws-addlabel" data-addlabel hidden>Create display label</button>' +
          '<div class="ws-labelwrap" data-labelwrap hidden>' +
            '<label class="ws-label" for="ws-label">Display label</label>' +
            '<input type="text" class="ws-input" id="ws-label" maxlength="' + LABEL_MAX + '" />' +
          '</div>' +
        '</div>' +
        '<div class="ws-mfield">' +
          '<label class="ws-label" for="ws-url">URL</label>' +
          '<p class="ws-help">Add SEARCH_TERM to the URL to represent the user’s search query. When a search is performed, every occurrence of SEARCH_TERM will be replaced with the entered search term.</p>' +
          '<textarea class="ws-input ws-textarea" id="ws-url" spellcheck="false"></textarea>' +
          '<button type="button" class="btn btn--secondary ws-term" data-term>Add SEARCH_TERM</button>' +
        '</div>' +
        '<label class="ws-check"><input type="checkbox" data-urlencode /> <span>urlencode the user’s search term</span></label>' +
        '<div class="ws-mfield">' +
          '<label class="ws-label" for="ws-btn">Button label</label>' +
          '<input type="text" class="ws-input" id="ws-btn" maxlength="' + BUTTON_MAX + '" />' +
        '</div>' +
      '</div>' +
      '<div class="modal__footer">' +
        '<button type="button" class="modal__btn modal__btn--cancel" data-cancel>Cancel</button>' +
        `<button type="button" class="modal__btn modal__btn--primary" data-confirm>${existing ? 'Save' : 'Add'}</button>` +
      '</div>';

    document.body.appendChild(overlay);
    document.body.classList.add('is-locked');

    const nameI = modal.querySelector('#ws-name');
    const labelBtn = modal.querySelector('[data-addlabel]');
    const labelWrap = modal.querySelector('[data-labelwrap]');
    const labelI = modal.querySelector('#ws-label');
    const urlI = modal.querySelector('#ws-url');
    const encI = modal.querySelector('[data-urlencode]');
    const btnI = modal.querySelector('#ws-btn');

    nameI.value = draft.name;
    labelI.value = draft.displayLabel;
    urlI.value = draft.url;
    encI.checked = !!draft.urlencode;
    btnI.value = draft.buttonLabel;
    // Show the display-label field when one already exists; otherwise offer the link.
    if (draft.displayLabel) { show(labelWrap); hide(labelBtn); } else { show(labelBtn); hide(labelWrap); }

    labelBtn.addEventListener('click', () => { hide(labelBtn); show(labelWrap); labelI.focus(); });
    modal.querySelector('[data-term]').addEventListener('click', () => {
      const start = urlI.selectionStart, end = urlI.selectionEnd, v = urlI.value;
      urlI.value = v.slice(0, start) + 'SEARCH_TERM' + v.slice(end);
      const pos = start + 'SEARCH_TERM'.length;
      urlI.focus(); urlI.setSelectionRange(pos, pos);
    });

    function close() {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      document.body.classList.remove('is-locked');
      if (prev && prev.focus) prev.focus();
    }
    function confirm() {
      const name = nameI.value.trim();
      if (!name) { nameI.focus(); return; }
      draft.name = name;
      draft.displayLabel = labelWrap.hidden ? '' : labelI.value.trim();
      draft.url = urlI.value.trim();
      draft.urlencode = encI.checked;
      draft.buttonLabel = btnI.value.trim() || 'Search';
      if (existing) {
        const i = config.searches.findIndex((s) => s.id === existing.id);
        if (i !== -1) config.searches[i] = draft;
      } else {
        config.searches.push(draft);
      }
      renderList(); onChange(); close();
    }
    modal.querySelector('.modal__close').addEventListener('click', close);
    modal.querySelector('[data-cancel]').addEventListener('click', close);
    modal.querySelector('[data-confirm]').addEventListener('click', confirm);
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') {
        const f = Array.from(modal.querySelectorAll('button, input, textarea')).filter((el) => el.offsetParent !== null && !el.disabled);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    nameI.focus();
  }

  // ---------- render / save bar ----------
  function applyToControls() {
    renderList();
    if (bgSetter) bgSetter();
    renderImage();
    pushPreview();
  }
  function updateSaveBar() {
    const dirty = isDirty();
    saveBtn.disabled = saving || !dirty;
    saveBtn.classList.toggle('is-saving', saving);
    if (saving) { statusEl.hidden = false; statusEl.classList.remove('save-status--error'); statusEl.textContent = 'Saving…'; }
    else if (saveError) { statusEl.hidden = false; statusEl.classList.add('save-status--error'); statusEl.textContent = saveError; }
    else { statusEl.hidden = !dirty; statusEl.classList.remove('save-status--error'); statusEl.textContent = 'Unsaved changes'; }
  }

  async function save() {
    if (saving || !isDirty()) return;
    saving = true; saveError = null; updateSaveBar();
    try {
      const res = await fetch('/api/website/search', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        let msg = 'Couldn’t save. Try again.';
        try { const d = await res.json(); if (d.message) msg = d.message; } catch (_) {}
        throw new Error(msg);
      }
      const data = await res.json();
      config = data.saved;
      baseline = serialize();
      saving = false; saveError = null;
      applyToControls();
      updateSaveBar();
    } catch (err) {
      saving = false; saveError = err.message || 'Couldn’t save. Try again.';
      updateSaveBar();
    }
  }

  // ---------- nav guard ----------
  function setupNavGuard() {
    const modal = $('[data-modal="unsaved"]');
    let pendingHref = null;
    let allowLeave = false;
    const open = () => { modal.hidden = false; modal.querySelector('[data-modal-keep]').focus(); };
    const close = () => { modal.hidden = true; pendingHref = null; };
    modal.querySelector('[data-modal-close]').addEventListener('click', close);
    modal.querySelector('[data-modal-keep]').addEventListener('click', close);
    modal.querySelector('[data-modal-discard]').addEventListener('click', () => {
      allowLeave = true; const href = pendingHref; close(); if (href) window.location.href = href;
    });
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link || allowLeave || !isDirty()) return;
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || link.target === '_blank') return;
      const url = new URL(href, location.href);
      if (url.origin === location.origin && url.pathname === location.pathname) return;
      e.preventDefault(); pendingHref = url.href; open();
    });
    window.addEventListener('beforeunload', (e) => {
      if (isDirty() && !allowLeave) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // ---------- boot ----------
  preview = window.WebsitePreview.create(document.querySelector('[data-website-preview]'));
  saveBtn.addEventListener('click', save);
  buildBgColor();
  setupNavGuard();

  fetch('/api/website/search', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((data) => {
      config = clone(data.saved || data.defaults || DEFAULTS);
      baseline = serialize();
      applyToControls();
      updateSaveBar();
    })
    .catch(() => {
      config = clone(DEFAULTS);
      baseline = serialize();
      applyToControls();
    });
})();
