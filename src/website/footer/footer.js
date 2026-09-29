// Website layer — Footer configuration.
// Element toggles (Logo / Navigation) + an ordered list of custom links.
// Edits auto-save as a DRAFT a couple of seconds after you stop typing; the
// shared Page Builder pageactions bar (website-saveactions.js) is what
// actually promotes drafts to published, across every section at once.
(function () {
  const $ = (s) => document.querySelector(s);
  const treeMount = $('[data-tree]');
  const treeSkeleton = $('[data-tree-skeleton]');
  const linksEmpty = $('[data-links-empty]');
  const addBtn = $('[data-add]');
  const logoCheck = $('[data-el="logo"]');
  const navCheck = $('[data-el="navigation"]');
  // Shared website preview in the main area (header + body + footer).
  const preview = window.WebsitePreview.create(document.querySelector('[data-website-preview]'), { highlight: 'footer' });

  const AUTO_SAVE_DELAY = 2000; // ms of idle time after the last edit before auto-saving

  let showLogo = false;
  let showNavigation = false;
  const COLOR_DEFAULTS = { background: { color: '#FFFFFF', opacity: 100 }, text: { color: '#3D3F42', opacity: 100 }, link: { color: '#255096', opacity: 100 } };
  const colors = { background: { ...COLOR_DEFAULTS.background }, text: { ...COLOR_DEFAULTS.text }, link: { ...COLOR_DEFAULTS.link } };
  let tree = null;
  let publishedSerialized = ''; // last-known published snapshot, serialized
  let loaded = false; // true once the draft has loaded — no dirty check before then
  let saving = false; // an auto-save PUT is in flight
  let saveState = 'idle'; // 'idle' | 'pending' | 'saved'
  let autoSaveTimer = null;
  let touched = false; // set once the user edits, so the boot revalidation fetch won't clobber it
  let bar = null;

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
  // the live DOM/tree state — used to compute a comparable serialized
  // snapshot (the published baseline, or a fresh one from a revalidation
  // fetch) without clobbering in-progress edits.
  const serializeConfig = (cfg) => JSON.stringify({
    showLogo: !!cfg.showLogo,
    showNavigation: !!cfg.showNavigation,
    background: { color: (cfg.background && cfg.background.color) || COLOR_DEFAULTS.background.color, opacity: cfg.background && typeof cfg.background.opacity === 'number' ? cfg.background.opacity : COLOR_DEFAULTS.background.opacity },
    text: { color: (cfg.text && cfg.text.color) || COLOR_DEFAULTS.text.color, opacity: cfg.text && typeof cfg.text.opacity === 'number' ? cfg.text.opacity : COLOR_DEFAULTS.text.opacity },
    link: { color: (cfg.link && cfg.link.color) || COLOR_DEFAULTS.link.color, opacity: cfg.link && typeof cfg.link.opacity === 'number' ? cfg.link.opacity : COLOR_DEFAULTS.link.opacity },
    links: stripLinks(cfg.links || []),
  });
  const serialize = () => JSON.stringify(current());
  const isLocalDirty = () => loaded && serialize() !== publishedSerialized;

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
      onChange: () => { onEdit(); },
    });
    refresh();
  }

  function refresh() {
    if (treeSkeleton) treeSkeleton.hidden = true;
    const count = tree ? tree.getItems().length : 0;
    linksEmpty.hidden = count > 0;
    if (preview) preview.update({ footer: current() });
    if (bar) bar.refresh(saveState);
  }

  function onEdit() {
    touched = true;
    saveState = 'pending';
    refresh();
    scheduleAutoSave();
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
    swatch.addEventListener('input', () => { colors[key].color = swatch.value.toUpperCase(); hex.value = colors[key].color; ensureVisible(); onEdit(); });
    hex.addEventListener('input', () => {
      let v = hex.value.trim();
      if (v && !v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) { colors[key].color = v.toUpperCase(); swatch.value = colors[key].color; ensureVisible(); onEdit(); }
    });
    hex.addEventListener('blur', () => { hex.value = colors[key].color; });
    op.addEventListener('input', () => {
      let n = parseInt(op.value, 10);
      if (Number.isNaN(n)) return;
      colors[key].opacity = Math.max(0, Math.min(100, n));
      onEdit();
    });
    op.addEventListener('blur', () => { op.value = colors[key].opacity; });
    return { set: () => { swatch.value = colors[key].color; hex.value = colors[key].color; op.value = colors[key].opacity; } };
  }
  const colorFields = ['background', 'text', 'link'].map(setupColor);

  // ---------- mutations ----------
  function addLink(link) {
    const items = tree.getItems();
    items.push(link);
    mountTree(items);
    onEdit();
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
    mountTree(tree.getItems().filter((i) => i.id !== id));
    onEdit();
  }
  function updateLink(id, patch) {
    const items = tree.getItems();
    const it = items.find((i) => i.id === id);
    if (it) Object.assign(it, patch);
    mountTree(items);
    onEdit();
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

  // ---------- auto-save (draft only) ----------
  function scheduleAutoSave() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => { autoSaveTimer = null; autoSave(); }, AUTO_SAVE_DELAY);
  }
  function cancelPendingSave() {
    if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
  }
  function flushPendingSave() {
    if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; return autoSave(); }
    return Promise.resolve();
  }
  function autoSave() {
    if (saving) return Promise.resolve();
    saving = true;
    return fetch('/api/website/footer', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(current()),
    }).then((res) => {
      if (!res.ok) return res.json().catch(() => ({})).then((d) => { throw new Error(d.message || 'We could not save your changes. Try again.'); });
      return res.json();
    }).then((data) => {
      saving = false;
      saveState = 'saved';
      applyConfig(data.saved);
      writeCache(data.saved);
      refresh();
    }).catch((err) => {
      saving = false;
      saveState = 'idle';
      refresh();
      if (window.Toast) window.Toast.show(err.message || 'We could not save your changes. Try again.');
    });
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

  // ---------- boot ----------
  addBtn.addEventListener('click', openAddCustom);
  logoCheck.addEventListener('change', () => { showLogo = logoCheck.checked; onEdit(); });
  navCheck.addEventListener('change', () => { showNavigation = navCheck.checked; onEdit(); });

  // Initial paint from the local cache (instant), then hydrate/revalidate.
  const cached = readCache();
  if (cached) {
    applyConfig(cached);
    loaded = true;
  }

  bar = window.WebsiteSaveActions.init({
    isLocalDirty,
    flushLocalSave: flushPendingSave,
    cancelLocalPending: cancelPendingSave,
    onPublished: (published) => {
      const p = published && published.footer;
      if (p) publishedSerialized = serializeConfig(p);
      refresh();
    },
    onDiscarded: (draft) => {
      const d = draft && draft.footer;
      if (d) {
        applyConfig(d);
        publishedSerialized = serializeConfig(d);
        writeCache(d);
        refresh();
      }
    },
  });
  refresh();

  window.addEventListener('beforeunload', () => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
      try {
        fetch('/api/website/footer', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          keepalive: true,
          body: JSON.stringify(current()),
        });
      } catch (_) { /* best effort */ }
    }
  });

  fetch('/api/website/footer', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((ftr) => {
      const draft = (ftr && (ftr.draft || ftr.defaults)) || { showLogo: false, showNavigation: false, links: [] };
      const published = (ftr && ftr.published) || draft;
      publishedSerialized = serializeConfig(published);
      loaded = true;
      writeCache(draft);
      if (touched) { refresh(); return; } // keep the user's in-progress edits
      applyConfig(draft);
      refresh();
    });
})();
