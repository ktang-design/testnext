// Website layer — Navigation configuration.
// Loads the draft navigation + published pages, renders an accessible
// sortable tree, and wires the add (+) menu and per-item Edit/Delete. Edits
// auto-save as a DRAFT a couple of seconds after you stop editing/dragging;
// the shared Page Builder pageactions bar (website-saveactions.js) is what
// actually promotes drafts to published, across every section at once.
(function () {
  const treeMount = document.querySelector('[data-tree]');
  const treeSkeleton = document.querySelector('[data-tree-skeleton]');
  const emptyEl = document.querySelector('[data-empty]');
  const addBtn = document.querySelector('[data-add]');
  const statusEl = document.querySelector('[data-save-status]');
  if (!treeMount) return;

  const UNAVAILABLE_MSG = 'This menu item is unavailable because the linked page is unpublished.';
  const AUTO_SAVE_DELAY = 2000; // ms of idle time after the last edit before auto-saving

  let publishedPages = [];
  let tree = null;
  let publishedSerialized = '[]'; // last-known published navigation tree, serialized
  let loaded = false; // true once the draft has loaded — no dirty check before then
  let saving = false; // an auto-save PUT is in flight
  let saveState = 'idle'; // 'idle' | 'pending' | 'saved'
  let autoSaveTimer = null;
  let touched = false; // set once the user edits, so the boot revalidation fetch won't clobber it
  let bar = null;

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
  const isLocalDirty = () => loaded && serialize() !== publishedSerialized;

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
    btn.setAttribute('data-tooltip', 'More options');
    btn.setAttribute('data-tip-pos', 'bottom-end');
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
      onChange: () => onEdit(),
    });
    refresh();
  }

  function refresh() {
    if (treeSkeleton) treeSkeleton.hidden = true;
    const count = tree ? tree.getItems().length : 0;
    emptyEl.hidden = count > 0;
    if (preview) preview.update({ navigation: tree ? tree.getItems() : [] });
    if (bar) bar.refresh(saveState);
  }

  function onEdit() {
    touched = true;
    saveState = 'pending';
    refresh();
    scheduleAutoSave();
  }

  // ---------- mutations ----------
  function commit(items) {
    mountTree(items);
    onEdit();
  }
  function addItem(item) {
    const items = tree.getItems();
    items.push(item);
    commit(items);
  }
  async function deleteItem(id) {
    const ok = await window.Modal.confirm({
      title: 'Delete navigation item',
      message: 'This menu item will be removed from your navigation. This cannot be undone.',
      confirmLabel: 'Delete item',
      cancelLabel: 'Keep item',
      danger: true,
    });
    if (!ok) return;
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
      title: 'Add navigation item',
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

  // The custom-link form is also the only way to add an entry when there are no
  // published pages to link.
  async function openAddCustom() {
    const values = await window.Modal.form({
      title: 'Add navigation item',
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
    return fetch('/api/website/navigation', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ items: strip(tree.getItems()) }),
    }).then((res) => {
      if (!res.ok) return res.json().catch(() => ({})).then((d) => { throw new Error(d.message || 'We could not save your changes. Try again.'); });
      return res.json();
    }).then((data) => {
      saving = false;
      saveState = 'saved';
      mountTree(data.saved); // refresh availability from the server
      writeNavCache();       // keep the instant-load cache in sync with the draft
      refresh();
    }).catch((err) => {
      saving = false;
      saveState = 'idle';
      refresh();
      if (window.Toast) window.Toast.show(err.message || 'We could not save your changes. Try again.');
    });
  }

  // ---------- boot ----------
  const preview = window.WebsitePreview.create(document.querySelector('[data-website-preview]'), { highlight: 'nav' });

  // Instant-load cache for the left-panel tree, so the draft items paint
  // without waiting on the network (mirrors the website preview's cache). It
  // holds only the last-saved draft navigation + published pages; the fetch
  // below revalidates it.
  const NAV_CACHE = 'ws-nav-cache';
  const readNavCache = () => { try { return JSON.parse(localStorage.getItem(NAV_CACHE) || 'null'); } catch (_) { return null; } };
  const writeNavCache = () => {
    try { localStorage.setItem(NAV_CACHE, JSON.stringify({ navigation: strip(tree ? tree.getItems() : []), publishedPages })); } catch (_) { /* quota / disabled */ }
  };

  // The + opens a Page/Custom menu when there are published pages to link; with
  // none, it goes straight to the custom-link modal. Wired once, after the
  // network resolves (authoritative publishedPages).
  let addMenuWired = false;
  function wireAddMenu() {
    if (addMenuWired) return;
    addMenuWired = true;
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
      addBtn.addEventListener('click', () => openAddCustom());
    }
  }

  bar = window.WebsiteSaveActions.init({
    isLocalDirty,
    flushLocalSave: flushPendingSave,
    cancelLocalPending: cancelPendingSave,
    onPublished: (published) => {
      const p = published && published.navigation;
      if (p) publishedSerialized = JSON.stringify(strip(p));
      refresh();
    },
    onDiscarded: (draft) => {
      const d = draft && draft.navigation;
      if (d) {
        mountTree(d);
        publishedSerialized = JSON.stringify(strip(d));
        writeNavCache();
        refresh();
      }
    },
  });

  const cached = readNavCache();
  if (cached && Array.isArray(cached.navigation)) {
    publishedPages = cached.publishedPages || [];
    loaded = true;
    mountTree(cached.navigation);
  }

  window.addEventListener('beforeunload', () => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
      try {
        fetch('/api/website/navigation', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          keepalive: true,
          body: JSON.stringify({ items: strip(tree ? tree.getItems() : []) }),
        });
      } catch (_) { /* best effort */ }
    }
  });

  fetch('/api/website/navigation', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((data) => {
      publishedPages = data.publishedPages || [];
      publishedSerialized = JSON.stringify(strip(data.publishedNavigation || []));
      const fresh = JSON.stringify(strip(data.navigation || []));
      // Re-mount only if the draft data changed and the user hasn't started
      // editing the cached paint — never discard in-progress edits.
      if (!touched) {
        if (fresh !== serialize() || !tree) mountTree(data.navigation || []);
      }
      loaded = true;
      wireAddMenu();
      writeNavCache();
      refresh();
    })
    .catch(() => {
      loaded = true;
      wireAddMenu(); // still let the user add items from the (cached) tree
      if (!tree) {
        if (treeSkeleton) treeSkeleton.hidden = true;
        emptyEl.hidden = false;
        emptyEl.textContent = 'Couldn’t load navigation. Refresh to try again.';
      }
      refresh();
    });
})();
