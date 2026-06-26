// Website layer — Footer configuration.
// Element toggles (Logo / Navigation) + an ordered list of custom links.
(function () {
  const $ = (s) => document.querySelector(s);
  const treeMount = $('[data-tree]');
  const divider = $('[data-links-divider]');
  const addBtn = $('[data-add]');
  const saveBtn = $('[data-action="save"]');
  const statusEl = $('[data-save-status]');
  const logoCheck = $('[data-el="logo"]');
  const navCheck = $('[data-el="navigation"]');
  // Shared website preview in the main area (header + body + footer).
  const preview = window.WebsitePreview.create(document.querySelector('[data-website-preview]'));

  let showLogo = false;
  let showNavigation = false;
  const COLOR_DEFAULTS = { background: { color: '#FFFFFF', opacity: 100 }, text: { color: '#3D3F42', opacity: 100 }, link: { color: '#255096', opacity: 100 } };
  const colors = { background: { ...COLOR_DEFAULTS.background }, text: { ...COLOR_DEFAULTS.text }, link: { ...COLOR_DEFAULTS.link } };
  let tree = null;
  let baseline = '';
  let loaded = false; // true once the saved config has loaded — no "dirty" before then
  let saving = false;
  let saveError = null;

  const uid = () =>
    'ftr-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.floor(performance.now()));
  const validUrl = (v) => /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(String(v || '').trim());

  const stripLinks = (items) => (items || []).map((it) => ({ id: it.id, url: it.url, label: it.label }));
  const current = () => ({
    showLogo, showNavigation,
    background: { ...colors.background }, text: { ...colors.text }, link: { ...colors.link },
    links: stripLinks(tree ? tree.getItems() : []),
  });
  const serialize = () => JSON.stringify(current());
  const isDirty = () => loaded && serialize() !== baseline;

  // ---------- rendering ----------
  function svgIcon(paths) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '16'); svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = paths;
    return svg;
  }
  function renderContent(item) {
    const label = document.createElement('span');
    label.className = 'navtree__label';
    label.textContent = item.label;
    return label;
  }
  function renderTrailing(item) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'navtree__kebab';
    btn.setAttribute('aria-label', `Actions for ${item.label}`);
    btn.setAttribute('data-tooltip', 'More options');
    btn.setAttribute('data-tip-pos', 'bottom-end');
    btn.appendChild(svgIcon('<circle cx="8" cy="3" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="8" cy="13" r="1.4"/>'));
    window.Popover.attach(
      btn,
      () => [
        { label: 'Edit', onSelect: () => editLink(item.id) },
        { label: 'Delete', danger: true, onSelect: () => deleteLink(item.id) },
      ],
      { align: 'right', label: `Actions for ${item.label}` }
    );
    return btn;
  }

  function mountTree(links) {
    if (tree) tree.destroy();
    treeMount.innerHTML = '';
    tree = window.SortableTree.create(treeMount, {
      items: (links || []).map((l) => ({ id: l.id, url: l.url, label: l.label, children: [] })),
      maxDepth: 1, // flat list — no nesting
      ariaLabel: 'Footer links',
      labelOf: (it) => it.label,
      renderContent,
      renderTrailing,
      onChange: () => refresh(),
    });
    refresh();
  }

  function refresh() {
    const count = tree ? tree.getItems().length : 0;
    divider.hidden = count === 0;
    if (preview) preview.update({ footer: current() });
    updateSaveBar();
  }

  function updateSaveBar() {
    const dirty = isDirty();
    saveBtn.disabled = saving || !dirty;
    saveBtn.classList.toggle('is-saving', saving);
    if (saving) { statusEl.hidden = false; statusEl.classList.remove('save-status--error'); statusEl.textContent = 'Saving…'; }
    else if (saveError) { statusEl.hidden = false; statusEl.classList.add('save-status--error'); statusEl.textContent = saveError; }
    else { statusEl.hidden = !dirty; statusEl.classList.remove('save-status--error'); statusEl.textContent = 'Unsaved changes'; }
  }

  // ---------- colour rows (background / text / link) ----------
  function setupColor(key) {
    const row = document.querySelector(`[data-color="${key}"]`);
    const swatch = row.querySelector('[data-color-swatch]');
    const hex = row.querySelector('[data-color-hex]');
    const op = row.querySelector('[data-color-opacity]');
    // Picking a colour while fully transparent would show nothing — make it visible.
    const ensureVisible = () => { if (colors[key].opacity === 0) { colors[key].opacity = 100; op.value = 100; } };
    swatch.addEventListener('input', () => { colors[key].color = swatch.value.toUpperCase(); hex.value = colors[key].color; ensureVisible(); saveError = null; refresh(); });
    hex.addEventListener('input', () => {
      let v = hex.value.trim();
      if (v && !v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) { colors[key].color = v.toUpperCase(); swatch.value = colors[key].color; ensureVisible(); saveError = null; refresh(); }
    });
    hex.addEventListener('blur', () => { hex.value = colors[key].color; });
    op.addEventListener('input', () => {
      let n = parseInt(op.value, 10);
      if (Number.isNaN(n)) return;
      colors[key].opacity = Math.max(0, Math.min(100, n));
      saveError = null; refresh();
    });
    op.addEventListener('blur', () => { op.value = colors[key].opacity; });
    return { set: () => { swatch.value = colors[key].color; hex.value = colors[key].color; op.value = colors[key].opacity; } };
  }
  const colorFields = ['background', 'text', 'link'].map(setupColor);

  // ---------- mutations ----------
  function addLink(link) {
    const items = tree.getItems();
    items.push(link);
    saveError = null;
    mountTree(items);
  }
  function deleteLink(id) {
    saveError = null;
    mountTree(tree.getItems().filter((i) => i.id !== id));
  }
  function updateLink(id, patch) {
    const items = tree.getItems();
    const it = items.find((i) => i.id === id);
    if (it) Object.assign(it, patch);
    saveError = null;
    mountTree(items);
  }

  // ---------- add / edit modal ----------
  async function openLinkModal(title, values) {
    return window.Modal.form({
      title,
      submitLabel: values ? 'Save' : 'Add',
      values,
      fields: [
        { name: 'url', label: 'URL', type: 'url', placeholder: 'https://', required: true },
        { name: 'label', label: 'Label', type: 'text', maxLength: 120, required: true },
      ],
      validate: (v) => (validUrl(v.url) ? null : 'Enter a valid URL (https://…, /path, #anchor, mailto: or tel:).'),
    });
  }
  async function openAddCustom() {
    const v = await openLinkModal('Add custom link');
    if (!v) return;
    addLink({ id: uid(), url: v.url.trim(), label: v.label.trim(), children: [] });
  }
  async function editLink(id) {
    const item = tree.getItems().find((i) => i.id === id);
    if (!item) return;
    const v = await openLinkModal('Edit custom link', { url: item.url, label: item.label });
    if (!v) return;
    updateLink(id, { url: v.url.trim(), label: v.label.trim() });
  }

  // ---------- save ----------
  async function save() {
    if (saving || !isDirty()) return;
    saving = true; saveError = null; updateSaveBar();
    try {
      const res = await fetch('/api/website/footer', {
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
      saving = false; saveError = null;
      applyConfig(data.saved);
      baseline = serialize();
      updateSaveBar();
    } catch (err) {
      saving = false; saveError = err.message || 'Couldn’t save. Try again.';
      updateSaveBar();
    }
  }

  function applyConfig(config) {
    showLogo = !!config.showLogo;
    showNavigation = !!config.showNavigation;
    logoCheck.checked = showLogo;
    navCheck.checked = showNavigation;
    ['background', 'text', 'link'].forEach((key) => {
      const c = config[key];
      colors[key] = {
        color: (c && c.color) || COLOR_DEFAULTS[key].color,
        opacity: c && typeof c.opacity === 'number' ? c.opacity : COLOR_DEFAULTS[key].opacity,
      };
    });
    colorFields.forEach((f) => f.set());
    mountTree(config.links || []);
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
  saveBtn.addEventListener('click', save);
  addBtn.addEventListener('click', openAddCustom);
  logoCheck.addEventListener('change', () => { showLogo = logoCheck.checked; saveError = null; refresh(); });
  navCheck.addEventListener('change', () => { showNavigation = navCheck.checked; saveError = null; refresh(); });
  setupNavGuard();

  fetch('/api/website/footer', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((ftr) => {
      applyConfig((ftr && (ftr.saved || ftr.defaults)) || { showLogo: false, showNavigation: false, links: [] });
      baseline = serialize();
      loaded = true;
      updateSaveBar();
    });
})();
