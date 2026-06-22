// Website layer — Pages.
// Lists the user's pages in an accessible, reorderable list; each row has a
// homepage star and an Edit/Duplicate menu. Add/Edit use a Title + Description
// modal. Everything is local until Save (one PUT replaces the ordered set).
// The grey area holds the shared website preview, which persists across pages.
(function () {
  const treeMount = document.querySelector('[data-tree]');
  const emptyEl = document.querySelector('[data-empty]');
  const addBtn = document.querySelector('[data-add]');
  const saveBtn = document.querySelector('[data-action="save"]');
  const statusEl = document.querySelector('[data-save-status]');
  if (!treeMount) return;

  let tree = null;
  let baseline = '[]';
  let saving = false;
  let saveError = null;
  let limits = { title: 120, description: 160 };

  const uid = () =>
    'page-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.floor(performance.now()));

  // Canonical form for persistence + dirty comparison (order matters).
  function strip(items) {
    return (items || []).map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description || '',
      status: p.status || 'published',
      isHomepage: !!p.isHomepage,
    }));
  }
  const serialize = () => JSON.stringify(strip(tree ? tree.getItems() : []));
  const isDirty = () => serialize() !== baseline;

  function findById(items, id) { return items.find((p) => p.id === id) || null; }

  // ---------- rendering ----------
  function svg(paths, opts) {
    const ns = 'http://www.w3.org/2000/svg';
    const el = document.createElementNS(ns, 'svg');
    el.setAttribute('viewBox', '0 0 16 16');
    el.setAttribute('width', '16');
    el.setAttribute('height', '16');
    el.setAttribute('aria-hidden', 'true');
    if (opts && opts.stroke) {
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', 'currentColor');
      el.setAttribute('stroke-width', opts.stroke);
      el.setAttribute('stroke-linejoin', 'round');
      el.setAttribute('stroke-linecap', 'round');
    }
    el.innerHTML = paths;
    return el;
  }

  function renderContent(page) {
    const label = document.createElement('span');
    label.className = 'navtree__label';
    label.textContent = page.title;
    return label;
  }

  function renderTrailing(page) {
    const wrap = document.createElement('span');
    wrap.className = 'pageitem__actions';

    // Homepage indicator — shown only on the homepage row and non-interactive.
    // The homepage is reassigned from the menu, not by clicking the star.
    if (page.isHomepage) {
      const star = document.createElement('span');
      star.className = 'pageitem__star';
      star.setAttribute('role', 'img');
      star.setAttribute('aria-label', 'Homepage');
      star.title = 'Homepage';
      star.appendChild(svg('<path d="M8 2.1 9.85 5.85 14 6.46 11 9.38 11.71 13.5 8 11.56 4.29 13.5 5 9.38 2 6.46 6.15 5.85Z"/>'));
      wrap.appendChild(star);
    }

    // Actions menu — "Set as homepage" only appears for non-homepage pages.
    const kebab = document.createElement('button');
    kebab.type = 'button';
    kebab.className = 'navtree__kebab';
    kebab.setAttribute('aria-label', `Actions for ${page.title}`);
    kebab.appendChild(svg('<circle cx="8" cy="3" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="8" cy="13" r="1.4"/>'));
    window.Popover.attach(
      kebab,
      () => {
        const opts = [];
        if (!page.isHomepage) opts.push({ label: 'Set as homepage', onSelect: () => setHomepage(page.id) });
        opts.push({ label: 'Edit', onSelect: () => editPage(page.id) });
        opts.push({ label: 'Duplicate', onSelect: () => duplicatePage(page.id) });
        return opts;
      },
      { align: 'right', label: `Actions for ${page.title}` }
    );
    wrap.appendChild(kebab);
    return wrap;
  }

  // The homepage is always pinned to the top of the list.
  function pinHomepage(items) {
    const i = items.findIndex((p) => p.isHomepage);
    if (i > 0) items.unshift(items.splice(i, 1)[0]);
    return items;
  }

  function mountTree(items) {
    if (tree) tree.destroy();
    treeMount.innerHTML = '';
    tree = window.SortableTree.create(treeMount, {
      items: (items || []).map((p) => ({ ...p, children: [] })),
      maxDepth: 1, // flat, reorderable list (no nesting)
      ariaLabel: 'Pages',
      labelOf: (p) => p.title,
      renderContent,
      renderTrailing,
      onChange: () => {
        // A drag that moved a page above the homepage re-pins it to the top.
        const items2 = tree.getItems();
        if (items2.findIndex((p) => p.isHomepage) > 0) commit(items2);
        else refresh();
      },
    });
    refresh();
  }

  function refresh() {
    const count = tree ? tree.getItems().length : 0;
    emptyEl.hidden = count > 0;
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
    mountTree(pinHomepage(items));
  }
  function setHomepage(id) {
    const cur = findById(tree.getItems(), id);
    if (!cur || cur.isHomepage) return; // already the homepage
    // Reassign the star and pin the new homepage to the top of the list.
    commit(tree.getItems().map((p) => ({ ...p, isHomepage: p.id === id })));
  }
  function duplicatePage(id) {
    const items = tree.getItems();
    const idx = items.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const src = items[idx];
    const copy = { ...src, id: uid(), title: `${src.title} (copy)`, isHomepage: false };
    items.splice(idx + 1, 0, copy);
    commit(items);
  }

  // ---------- add / edit modal ----------
  const pageFields = () => [
    { name: 'title', label: 'Title', type: 'text', required: true, maxLength: limits.title, showCount: true, placeholder: 'e.g. About us' },
    {
      name: 'description', label: 'Description', type: 'textarea', maxLength: limits.description, showCount: true,
      hint: 'Used by search engines and may appear in search results when people discover this page.',
    },
  ];

  async function openAdd() {
    const values = await window.Modal.form({
      title: 'Add page',
      submitLabel: 'Add page',
      fields: pageFields(),
    });
    if (!values) return;
    const items = tree.getItems();
    items.push({
      id: uid(),
      title: values.title.trim(),
      description: (values.description || '').trim(),
      status: 'published',
      isHomepage: items.length === 0, // first page becomes the homepage
    });
    commit(items);
  }

  async function editPage(id) {
    const page = findById(tree.getItems(), id);
    if (!page) return;
    const values = await window.Modal.form({
      title: 'Edit page',
      submitLabel: 'Save',
      values: { title: page.title, description: page.description || '' },
      fields: pageFields(),
    });
    if (!values) return;
    const items = tree.getItems();
    const target = findById(items, id);
    if (!target) return;
    target.title = values.title.trim();
    target.description = (values.description || '').trim();
    commit(items);
  }

  // ---------- save ----------
  async function save() {
    if (saving || !isDirty()) return;
    saving = true;
    updateSaveBar();
    try {
      const res = await fetch('/api/website/pages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pages: strip(tree.getItems()) }),
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
      mountTree(data.saved);
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
  window.WebsitePreview.create(document.querySelector('[data-website-preview]'));
  saveBtn.addEventListener('click', save);
  addBtn.addEventListener('click', openAdd);

  fetch('/api/website/pages', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((data) => {
      if (data.limits) limits = data.limits;
      baseline = JSON.stringify(strip(data.pages || []));
      mountTree(data.pages || []);
    })
    .catch(() => {
      emptyEl.hidden = false;
      emptyEl.textContent = 'Couldn’t load pages. Refresh to try again.';
    });

  setupNavGuard();
})();
