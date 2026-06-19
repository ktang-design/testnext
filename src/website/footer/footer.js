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
  const siteFooter = $('[data-sitefooter]');

  let showLogo = false;
  let showNavigation = false;
  let tree = null;
  let baseline = '';
  let saving = false;
  let saveError = null;
  let navLabels = [];   // top-level navigation labels (for the preview)
  let brandLogo = null; // uploaded logo from Platform → Branding

  const uid = () =>
    'ftr-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.floor(performance.now()));
  const validUrl = (v) => /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(String(v || '').trim());

  const stripLinks = (items) => (items || []).map((it) => ({ id: it.id, url: it.url, label: it.label }));
  const current = () => ({ showLogo, showNavigation, links: stripLinks(tree ? tree.getItems() : []) });
  const serialize = () => JSON.stringify(current());
  const isDirty = () => serialize() !== baseline;

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
    buildFooterPreview();
    updateSaveBar();
  }

  // Live, realistic footer preview reflecting the current configuration.
  function buildFooterPreview() {
    const links = stripLinks(tree ? tree.getItems() : []);
    siteFooter.innerHTML = '';

    const main = document.createElement('div');
    main.className = 'sitefooter__main';

    if (showLogo) {
      const brand = document.createElement('div');
      brand.className = 'sitefooter__brand';
      const wrap = document.createElement('span');
      wrap.className = 'sitefooter__logo';
      const img = document.createElement('img');
      img.alt = '';
      if (brandLogo) { img.src = brandLogo; img.classList.add('is-custom'); }
      else { img.src = '../assets/stacks-logo.svg'; }
      wrap.appendChild(img);
      brand.appendChild(wrap);
      main.appendChild(brand);
    }

    const labels = [];
    if (showNavigation) labels.push(...navLabels);
    links.forEach((l) => labels.push(l.label));
    if (labels.length) {
      const nav = document.createElement('div');
      nav.className = 'sitefooter__links';
      labels.forEach((t) => {
        const a = document.createElement('span');
        a.className = 'sitefooter__link';
        a.textContent = t;
        nav.appendChild(a);
      });
      main.appendChild(nav);
    }

    if (main.children.length) siteFooter.appendChild(main);

    const bottom = document.createElement('div');
    bottom.className = 'sitefooter__bottom';
    bottom.textContent = `© ${new Date().getFullYear()} Stacks. All rights reserved.`;
    siteFooter.appendChild(bottom);
  }

  function updateSaveBar() {
    const dirty = isDirty();
    saveBtn.disabled = saving || !dirty;
    saveBtn.classList.toggle('is-saving', saving);
    if (saving) { statusEl.hidden = false; statusEl.classList.remove('save-status--error'); statusEl.textContent = 'Saving…'; }
    else if (saveError) { statusEl.hidden = false; statusEl.classList.add('save-status--error'); statusEl.textContent = saveError; }
    else { statusEl.hidden = !dirty; statusEl.classList.remove('save-status--error'); statusEl.textContent = 'Unsaved changes'; }
  }

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

  Promise.all([
    fetch('/api/website/footer', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/api/website/navigation', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/api/branding', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]).then(([ftr, nav, brand]) => {
    navLabels = nav && Array.isArray(nav.navigation) ? nav.navigation.map((i) => i.label) : [];
    brandLogo = (brand && brand.saved && brand.saved.logo) || null;
    applyConfig((ftr && (ftr.saved || ftr.defaults)) || { showLogo: false, showNavigation: false, links: [] });
    baseline = serialize();
    updateSaveBar();
  });
})();
