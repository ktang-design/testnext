// Website layer — Navigation configuration.
// Loads the saved navigation + published pages, renders an accessible sortable
// tree, and wires the add (+) menu, per-item Edit/Delete, and Save.
(function () {
  const treeMount = document.querySelector('[data-tree]');
  const emptyEl = document.querySelector('[data-empty]');
  const addBtn = document.querySelector('[data-add]');
  const saveBtn = document.querySelector('[data-action="save"]');
  const statusEl = document.querySelector('[data-save-status]');
  if (!treeMount) return;

  const UNAVAILABLE_MSG = 'This menu item is unavailable because the linked page is unpublished.';

  let publishedPages = [];
  let tree = null;
  let baseline = '[]';
  let saving = false;
  let saveError = null;

  const uid = () =>
    'nav-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.floor(performance.now()));

  // Canonical form for persistence + dirty comparison.
  function strip(items) {
    return (items || []).map((it) => ({
      id: it.id,
      type: it.type,
      pageId: it.type === 'page' ? it.pageId : null,
      url: it.type === 'custom' ? it.url : null,
      label: it.label,
      children: strip(it.children || []),
    }));
  }
  const serialize = () => JSON.stringify(strip(tree ? tree.getItems() : []));
  const isDirty = () => serialize() !== baseline;

  // Permissive client mirror of the server URL check.
  const validUrl = (v) => /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(String(v || '').trim());

  // ---------- recursive model helpers (operate on a fresh getItems() copy) ----------
  function findById(items, id) {
    for (const it of items) {
      if (it.id === id) return it;
      const f = findById(it.children || [], id);
      if (f) return f;
    }
    return null;
  }
  function removeById(items, id) {
    return items
      .filter((it) => it.id !== id)
      .map((it) => ({ ...it, children: removeById(it.children || [], id) }));
  }

  // ---------- rendering ----------
  function svgIcon(paths) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = paths;
    return svg;
  }

  function renderContent(item) {
    const wrap = document.createElement('span');
    const label = document.createElement('span');
    label.className = 'navtree__label';
    label.textContent = item.label;
    wrap.appendChild(label);
    if (item.type === 'page' && item.available === false) {
      const tipId = 'tip-' + item.id;
      const tip = document.createElement('span');
      tip.className = 'navtree__tip';
      tip.id = tipId;
      tip.setAttribute('role', 'tooltip');
      tip.textContent = UNAVAILABLE_MSG;
      label.setAttribute('aria-describedby', tipId);
      wrap.appendChild(tip);
    }
    return wrap;
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
        { label: 'Edit', onSelect: () => editItem(item.id) },
        { label: 'Delete', danger: true, onSelect: () => deleteItem(item.id) },
      ],
      { align: 'right', label: `Actions for ${item.label}` }
    );
    return btn;
  }

  function mountTree(items) {
    if (tree) tree.destroy();
    treeMount.innerHTML = '';
    tree = window.SortableTree.create(treeMount, {
      items,
      maxDepth: 2,
      ariaLabel: 'Website navigation',
      labelOf: (it) => it.label,
      renderContent,
      renderTrailing,
      itemAttrs: (it) => ({
        className: it.type === 'page' && it.available === false ? 'is-unavailable' : '',
        disabled: it.type === 'page' && it.available === false,
      }),
      onChange: () => refresh(),
    });
    refresh();
  }

  function refresh() {
    const count = tree ? tree.getItems().length : 0;
    emptyEl.hidden = count > 0;
    if (preview) preview.update({ navigation: tree ? tree.getItems() : [] });
    updateSaveBar();
  }

  function updateSaveBar() {
    const dirty = isDirty();
    saveBtn.disabled = saving || !dirty;
    saveBtn.classList.toggle('is-saving', saving);
    if (saving) {
      statusEl.hidden = false;
      statusEl.classList.remove('save-status--error');
      statusEl.textContent = 'Saving…';
    } else if (saveError) {
      statusEl.hidden = false;
      statusEl.classList.add('save-status--error');
      statusEl.textContent = saveError;
    } else {
      statusEl.hidden = !dirty;
      statusEl.classList.remove('save-status--error');
      statusEl.textContent = 'Unsaved changes';
    }
  }

  // ---------- mutations ----------
  function commit(items) {
    saveError = null;
    mountTree(items);
  }
  function addItem(item) {
    const items = tree.getItems();
    items.push(item);
    commit(items);
  }
  function deleteItem(id) {
    commit(removeById(tree.getItems(), id));
  }
  function updateItem(id, patch) {
    const items = tree.getItems();
    Object.assign(findById(items, id), patch);
    commit(items);
  }

  // ---------- add / edit modals ----------
  function pageOptions(extra) {
    const opts = publishedPages.map((p) => ({ value: p.id, label: p.title }));
    // Edit may reference a page that is no longer published — keep it selectable.
    if (extra && !opts.some((o) => o.value === extra.id)) {
      opts.unshift({ value: extra.id, label: extra.title + ' (unpublished)' });
    }
    return opts;
  }

  async function openAddPage() {
    const values = await window.Modal.form({
      title: 'Add page',
      submitLabel: 'Add',
      fields: [
        { name: 'pageId', label: 'Page', type: 'select', placeholder: 'Select a published page', options: pageOptions(), required: true },
        { name: 'label', label: 'Label', type: 'text', maxLength: 120 },
      ],
    });
    if (!values) return;
    const page = publishedPages.find((p) => p.id === values.pageId);
    const label = (values.label || '').trim() || (page ? page.title : 'Untitled');
    addItem({ id: uid(), type: 'page', pageId: values.pageId, url: null, label, available: true, pageTitle: page ? page.title : null, children: [] });
  }

  // `title` lets the no-published-pages path reuse this custom-link form while
  // presenting as "Add page" (the only way to add an entry when there are no
  // pages to link).
  async function openAddCustom(title) {
    const values = await window.Modal.form({
      title: title || 'Add custom link',
      submitLabel: 'Add',
      fields: [
        { name: 'url', label: 'URL', type: 'url', placeholder: 'https://', required: true },
        { name: 'label', label: 'Label', type: 'text', maxLength: 120, required: true },
      ],
      validate: (v) => (validUrl(v.url) ? null : 'Enter a valid URL (https://…, /path, #anchor, mailto: or tel:).'),
    });
    if (!values) return;
    addItem({ id: uid(), type: 'custom', pageId: null, url: values.url.trim(), label: values.label.trim(), available: true, children: [] });
  }

  async function editItem(id) {
    const item = findById(tree.getItems(), id);
    if (!item) return;
    if (item.type === 'page') {
      const current = { id: item.pageId, title: item.pageTitle || item.label };
      const values = await window.Modal.form({
        title: 'Edit page',
        submitLabel: 'Save',
        values: { pageId: item.pageId, label: item.label },
        fields: [
          { name: 'pageId', label: 'Page', type: 'select', placeholder: 'Select a published page', options: pageOptions(current), required: true },
          { name: 'label', label: 'Label', type: 'text', maxLength: 120 },
        ],
      });
      if (!values) return;
      const page = publishedPages.find((p) => p.id === values.pageId);
      updateItem(id, {
        pageId: values.pageId,
        label: (values.label || '').trim() || (page ? page.title : item.label),
        available: !!page, // newly chosen published page is available; unchanged one keeps its state on next load
        pageTitle: page ? page.title : item.pageTitle,
      });
    } else {
      const values = await window.Modal.form({
        title: 'Edit custom link',
        submitLabel: 'Save',
        values: { url: item.url, label: item.label },
        fields: [
          { name: 'url', label: 'URL', type: 'url', placeholder: 'https://', required: true },
          { name: 'label', label: 'Label', type: 'text', maxLength: 120, required: true },
        ],
        validate: (v) => (validUrl(v.url) ? null : 'Enter a valid URL (https://…, /path, #anchor, mailto: or tel:).'),
      });
      if (!values) return;
      updateItem(id, { url: values.url.trim(), label: values.label.trim() });
    }
  }

  // ---------- save ----------
  async function save() {
    if (saving || !isDirty()) return;
    saving = true;
    updateSaveBar();
    try {
      const res = await fetch('/api/website/navigation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items: strip(tree.getItems()) }),
      });
      if (!res.ok) {
        let msg = 'Couldn’t save. Try again.';
        try { const d = await res.json(); if (d.message) msg = d.message; } catch (_) {}
        throw new Error(msg);
      }
      const data = await res.json();
      saving = false;
      saveError = null;
      baseline = JSON.stringify(strip(data.saved));
      mountTree(data.saved); // refresh availability from the server
    } catch (err) {
      saving = false;
      saveError = err.message || 'Couldn’t save. Try again.';
      updateSaveBar();
    }
  }

  // ---------- navigation guard (unsaved changes) ----------
  function setupNavGuard() {
    const modal = document.querySelector('[data-modal="unsaved"]');
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
      e.preventDefault();
      pendingHref = url.href;
      open();
    });
    window.addEventListener('beforeunload', (e) => {
      if (isDirty() && !allowLeave) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // ---------- boot ----------
  const preview = window.WebsitePreview.create(document.querySelector('[data-website-preview]'));
  saveBtn.addEventListener('click', save);

  fetch('/api/website/navigation', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((data) => {
      publishedPages = data.publishedPages || [];
      baseline = JSON.stringify(strip(data.navigation || []));
      mountTree(data.navigation || []);

      // The + opens a Page/Custom menu when there are published pages to link;
      // with none, it goes straight to the custom-link modal.
      if (publishedPages.length) {
        window.Popover.attach(
          addBtn,
          () => [
            { label: 'Page', onSelect: openAddPage },
            { label: 'Custom link', onSelect: openAddCustom },
          ],
          { align: 'right', label: 'Add navigation item' }
        );
      } else {
        // No pages to link → a "Page" can't be added, so the + opens the
        // custom-link form presented as "Add page".
        addBtn.addEventListener('click', () => openAddCustom('Add page'));
      }
    })
    .catch(() => {
      emptyEl.hidden = false;
      emptyEl.textContent = 'Couldn’t load navigation. Refresh to try again.';
    });

  setupNavGuard();
})();
