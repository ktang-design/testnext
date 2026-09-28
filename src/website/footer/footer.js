// Website layer — Footer configuration.
// Element toggles (Logo / Navigation) + an ordered list of custom links.
(function () {
  const $ = (s) => document.querySelector(s);
  const treeMount = $('[data-tree]');
  const treeSkeleton = $('[data-tree-skeleton]');
  const linksEmpty = $('[data-links-empty]');
  const addBtn = $('[data-add]');
  const saveBtn = $('[data-action="save"]');
  const statusEl = $('[data-save-status]');
  const logoCheck = $('[data-el="logo"]');
  const navCheck = $('[data-el="navigation"]');
  // Shared website preview in the main area (header + body + footer).
  const preview = window.WebsitePreview.create(document.querySelector('[data-website-preview]'), { highlight: 'footer' });

  let showLogo = false;
  let showNavigation = false;
  const COLOR_DEFAULTS = { background: { color: '#FFFFFF', opacity: 100 }, text: { color: '#3D3F42', opacity: 100 }, link: { color: '#255096', opacity: 100 } };
  const colors = { background: { ...COLOR_DEFAULTS.background }, text: { ...COLOR_DEFAULTS.text }, link: { ...COLOR_DEFAULTS.link } };
  let tree = null;
  let baseline = '';
  let loaded = false; // true once the saved config has loaded — no "dirty" before then
  let saving = false;
  let saveError = null;
  let touched = false; // set once the user edits, so the revalidation fetch won't clobber it

  // Instant-load cache: paint the last-known config before the network
  // resolves, then revalidate. Avoids the flash of empty/default state on load.
  const CACHE_KEY = 'ws-footer-cache';
  const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) { return null; } };
  const writeCache = (data) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (_) { /* ignore */ } };

  const uid = () =>
    'ftr-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.floor(performance.now()));
  const validUrl = (v) => /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(String(v || '').trim());

  const stripLinks = (items) => (items || []).map((it) => ({ id: it.id, url: it.url, label: it.label }));
  const current = () => ({
    showLogo, showNavigation,
    background: { ...colors.background }, text: { ...colors.text }, link: { ...colors.link },
    links: stripLinks(tree ? tree.getItems() : []),
  });
  // Same shape as current(), but from an arbitrary config object rather than
  // the live DOM/tree state — used to compute a fresh baseline for the dirty
  // check when a revalidation fetch resolves while the user is mid-edit (so
  // their in-progress work isn't clobbered, but Save still re-enables
  // correctly against the latest saved server value).
  const serializeConfig = (cfg) => JSON.stringify({
    showLogo: !!cfg.showLogo,
    showNavigation: !!cfg.showNavigation,
    background: { color: (cfg.background && cfg.background.color) || COLOR_DEFAULTS.background.color, opacity: cfg.background && typeof cfg.background.opacity === 'number' ? cfg.background.opacity : COLOR_DEFAULTS.background.opacity },
    text: { color: (cfg.text && cfg.text.color) || COLOR_DEFAULTS.text.color, opacity: cfg.text && typeof cfg.text.opacity === 'number' ? cfg.text.opacity : COLOR_DEFAULTS.text.opacity },
    link: { color: (cfg.link && cfg.link.color) || COLOR_DEFAULTS.link.color, opacity: cfg.link && typeof cfg.link.opacity === 'number' ? cfg.link.opacity : COLOR_DEFAULTS.link.opacity },
    links: stripLinks(cfg.links || []),
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
      onChange: () => { touched = true; refresh(); },
    });
    refresh();
  }

  function refresh() {
    if (treeSkeleton) treeSkeleton.hidden = true;
    const count = tree ? tree.getItems().length : 0;
    linksEmpty.hidden = count > 0;
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
    // Swap the native picker for the shared component; it writes back through
    // this same input, so the listeners below need no changes.
    if (window.ColorPicker) window.ColorPicker.upgrade(swatch, { opacityInput: op, label: key });
    // Picking a colour while fully transparent would show nothing — make it visible.
    const ensureVisible = () => { if (colors[key].opacity === 0) { colors[key].opacity = 100; op.value = 100; } };
    swatch.addEventListener('input', () => { touched = true; colors[key].color = swatch.value.toUpperCase(); hex.value = colors[key].color; ensureVisible(); saveError = null; refresh(); });
    hex.addEventListener('input', () => {
      let v = hex.value.trim();
      if (v && !v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) { touched = true; colors[key].color = v.toUpperCase(); swatch.value = colors[key].color; ensureVisible(); saveError = null; refresh(); }
    });
    hex.addEventListener('blur', () => { hex.value = colors[key].color; });
    op.addEventListener('input', () => {
      let n = parseInt(op.value, 10);
      if (Number.isNaN(n)) return;
      touched = true;
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
    touched = true;
    saveError = null;
    mountTree(items);
  }
  async function deleteLink(id) {
    const ok = await window.Modal.confirm({
      title: 'Delete custom link',
      message: 'This link will be removed from your footer. This cannot be undone.',
      confirmLabel: 'Delete link',
      cancelLabel: 'Keep link',
      danger: true,
    });
    if (!ok) return;
    touched = true;
    saveError = null;
    mountTree(tree.getItems().filter((i) => i.id !== id));
  }
  function updateLink(id, patch) {
    const items = tree.getItems();
    const it = items.find((i) => i.id === id);
    if (it) Object.assign(it, patch);
    touched = true;
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
    tabs.select('links'); // jump to the tab that shows what was just added
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
      touched = false;
      applyConfig(data.saved);
      baseline = serialize();
      writeCache(data.saved);
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

  // ---------- tabs (Links / Settings / Color) ----------
  function setupTabs() {
    const tabs = Array.from(document.querySelectorAll('[data-tab]'));
    const panels = Array.from(document.querySelectorAll('[data-tab-panel]'));
    function select(key) {
      tabs.forEach((t) => {
        const active = t.dataset.tab === key;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', String(active));
      });
      panels.forEach((p) => { p.hidden = p.dataset.tabPanel !== key; });
    }
    tabs.forEach((t) => t.addEventListener('click', () => select(t.dataset.tab)));
    return { select };
  }
  const tabs = setupTabs();

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
  logoCheck.addEventListener('change', () => { touched = true; showLogo = logoCheck.checked; saveError = null; refresh(); });
  navCheck.addEventListener('change', () => { touched = true; showNavigation = navCheck.checked; saveError = null; refresh(); });
  setupNavGuard();

  // Initial paint from the local cache (instant), then hydrate/revalidate.
  const cached = readCache();
  if (cached) {
    applyConfig(cached);
    baseline = serialize();
    loaded = true;
    updateSaveBar();
  }

  fetch('/api/website/footer', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((ftr) => {
      const serverConfig = (ftr && (ftr.saved || ftr.defaults)) || { showLogo: false, showNavigation: false, links: [] };
      writeCache(serverConfig);
      loaded = true;
      if (touched) { baseline = serializeConfig(serverConfig); updateSaveBar(); return; } // keep the user's in-progress edits
      applyConfig(serverConfig);
      baseline = serialize();
      updateSaveBar();
    });
})();
