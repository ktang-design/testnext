// Website layer — Pages + per-page content builder.
//
// List view: the user's pages (reorderable, homepage star, ⋯ menu). Clicking a
// page's title opens the BUILDER for that page: sections, each containing
// elements (Richtext / Code). Section/element settings show in the panel; the
// grey canvas keeps the shared website preview (nav+footer) and gains the
// editing overlays (blue Add CTAs + the rendered content + a pink selection).
//
// Everything is local until Save (one PUT replaces the full ordered set, with
// each page carrying its content). Deleting a page asks for confirmation.
(function () {
  const listView = document.querySelector('[data-list-view]');
  const builderView = document.querySelector('[data-builder-view]');
  const treeMount = document.querySelector('[data-tree]');
  const emptyEl = document.querySelector('[data-empty]');
  const addBtn = document.querySelector('[data-add]');
  const saveBtn = document.querySelector('[data-action="save"]');
  const backBtn = document.querySelector('[data-action="back"]');
  const publishBtn = document.querySelector('[data-action="publish"]');
  const statusEl = document.querySelector('[data-save-status]');
  if (!treeMount) return;

  // ---- state ----
  let tree = null;          // list SortableTree
  let baseline = '[]';
  let saving = false;
  let saveError = null;
  let limits = { title: 120, description: 160, sectionTitle: 120, elementTitle: 120, body: 20000, maxSections: 50, maxElements: 100 };
  let preview = null;

  let view = 'list';        // 'list' | 'builder'
  let builderPageId = null;
  let selectedSectionId = null;
  let selectedElementId = null;
  let sectionTree = null;
  let elementTree = null;
  const contentById = {};   // pageId -> { sections: [...] }

  const uid = (prefix) =>
    `${prefix}-${window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.floor(performance.now())}`;
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- canonical persisted shape (content rides along per page) ----
  function strip(items) {
    return (items || []).map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description || '',
      status: p.status || 'published',
      isHomepage: !!p.isHomepage,
      content: contentById[p.id] || { sections: [] },
    }));
  }
  const serialize = () => JSON.stringify(strip(tree ? tree.getItems() : []));
  const isDirty = () => serialize() !== baseline;
  function findById(items, id) { return items.find((p) => p.id === id) || null; }

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

  // =====================================================================
  // LIST VIEW
  // =====================================================================
  function renderContent(page) {
    // The title is a button that opens the content builder for the page.
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'navtree__label pageitem__open';
    open.textContent = page.title;
    open.addEventListener('click', (e) => { e.stopPropagation(); enterBuilder(page.id); });
    return open;
  }

  function renderTrailing(page) {
    const wrap = document.createElement('span');
    wrap.className = 'pageitem__actions';
    if (page.isHomepage) {
      const star = document.createElement('span');
      star.className = 'pageitem__star';
      star.setAttribute('role', 'img');
      star.setAttribute('aria-label', 'Homepage');
      star.title = 'Homepage';
      star.appendChild(svg('<path d="M8 2.1 9.85 5.85 14 6.46 11 9.38 11.71 13.5 8 11.56 4.29 13.5 5 9.38 2 6.46 6.15 5.85Z"/>'));
      wrap.appendChild(star);
    }
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
        if (!page.isHomepage) opts.push({ label: 'Delete', danger: true, onSelect: () => deletePage(page.id) });
        return opts;
      },
      { align: 'right', label: `Actions for ${page.title}` }
    );
    wrap.appendChild(kebab);
    return wrap;
  }

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
      maxDepth: 1,
      ariaLabel: 'Pages',
      labelOf: (p) => p.title,
      renderContent,
      renderTrailing,
      itemAttrs: (p) => (p.isHomepage
        ? { draggable: false, handleTooltip: 'The homepage cannot be reordered', className: 'is-pinned' }
        : {}),
      onChange: () => {
        const items2 = tree.getItems();
        if (items2.findIndex((p) => p.isHomepage) > 0) commit(items2);
        else refreshList();
      },
    });
    refreshList();
  }

  function refreshList() {
    const count = tree ? tree.getItems().length : 0;
    emptyEl.hidden = count > 0;
    updateSaveBar();
  }

  // ---- list mutations ----
  function commit(items) {
    saveError = null;
    mountTree(pinHomepage(items));
  }
  function setHomepage(id) {
    const cur = findById(tree.getItems(), id);
    if (!cur || cur.isHomepage) return;
    commit(tree.getItems().map((p) => ({ ...p, isHomepage: p.id === id })));
  }
  function duplicatePage(id) {
    const items = tree.getItems();
    const idx = items.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const src = items[idx];
    const newId = uid('page');
    contentById[newId] = JSON.parse(JSON.stringify(contentById[id] || { sections: [] }));
    items.splice(idx + 1, 0, { ...src, id: newId, title: `${src.title} (copy)`, isHomepage: false });
    commit(items);
  }
  async function deletePage(id) {
    const cur = findById(tree.getItems(), id);
    if (!cur || cur.isHomepage) return; // the homepage cannot be deleted
    const ok = await window.Modal.confirm({
      title: 'Delete page',
      message: 'This page and all of its content will be removed from your website. This can’t be undone.',
      confirmLabel: 'Delete page',
      cancelLabel: 'Keep page',
      danger: true,
    });
    if (!ok) return;
    delete contentById[id];
    commit(tree.getItems().filter((p) => p.id !== id));
  }

  const pageFields = () => [
    { name: 'title', label: 'Title', type: 'text', required: true, maxLength: limits.title, showCount: true, placeholder: 'e.g. About us' },
    {
      name: 'description', label: 'Description', type: 'textarea', maxLength: limits.description, showCount: true,
      hint: 'Used by search engines and may appear in search results when people discover this page.',
    },
  ];
  async function openAdd() {
    const values = await window.Modal.form({ title: 'Add page', submitLabel: 'Add page', fields: pageFields() });
    if (!values) return;
    const items = tree.getItems();
    const newId = uid('page');
    contentById[newId] = { sections: [] };
    items.push({ id: newId, title: values.title.trim(), description: (values.description || '').trim(), status: 'published', isHomepage: items.length === 0 });
    commit(items);
  }
  async function editPage(id) {
    const page = findById(tree.getItems(), id);
    if (!page) return;
    const values = await window.Modal.form({
      title: 'Edit page', submitLabel: 'Save',
      values: { title: page.title, description: page.description || '' }, fields: pageFields(),
    });
    if (!values) return;
    const items = tree.getItems();
    const target = findById(items, id);
    if (!target) return;
    target.title = values.title.trim();
    target.description = (values.description || '').trim();
    commit(items);
  }

  // =====================================================================
  // BUILDER VIEW
  // =====================================================================
  function currentPage() { return findById(tree.getItems(), builderPageId); }
  function getContent() {
    if (!contentById[builderPageId]) contentById[builderPageId] = { sections: [] };
    return contentById[builderPageId];
  }
  const getSections = () => getContent().sections;
  const findSection = (id) => getSections().find((s) => s.id === id) || null;
  const findElement = (secId, elId) => { const s = findSection(secId); return s ? (s.elements.find((e) => e.id === elId) || null) : null; };

  function enterBuilder(pageId) {
    view = 'builder';
    builderPageId = pageId;
    selectedSectionId = null;
    selectedElementId = null;
    if (!contentById[pageId]) contentById[pageId] = { sections: [] };
    renderAll();
  }
  function exitBuilder() {
    view = 'list';
    builderPageId = null;
    selectedSectionId = null;
    selectedElementId = null;
    if (sectionTree) { sectionTree.destroy(); sectionTree = null; }
    if (elementTree) { elementTree.destroy(); elementTree = null; }
    renderAll();
  }
  function selectSection(id) { selectedSectionId = id; selectedElementId = null; renderAll(); }
  function selectElement(secId, elId) { selectedSectionId = secId; selectedElementId = elId; renderAll(); }
  function backToSectionList() { selectedSectionId = null; selectedElementId = null; renderAll(); }
  function backToSection() { selectedElementId = null; renderAll(); }

  // Re-render the panel + preview after a structural change.
  function afterContentChange() { renderAll(); }
  // Lighter: a field edit (typing) updates preview + save bar without rebuilding
  // the panel (which would steal focus from the input).
  function afterFieldEdit() { updateSaveBar(); pushPreview(); }

  function addSection() {
    const secs = getSections();
    if (secs.length >= limits.maxSections) return;
    const s = { id: uid('sec'), title: `Section ${secs.length + 1}`, displayTitle: true, columns: 1, background: { color: '#FFFFFF', opacity: 100 }, elements: [] };
    secs.push(s);
    selectedSectionId = s.id;
    selectedElementId = null;
    afterContentChange();
  }
  function deleteSection(id) {
    const secs = getSections();
    const i = secs.findIndex((s) => s.id === id);
    if (i === -1) return;
    secs.splice(i, 1);
    if (selectedSectionId === id) { selectedSectionId = null; selectedElementId = null; }
    afterContentChange();
  }
  function reorderSections(orderedIds) {
    const map = Object.fromEntries(getSections().map((s) => [s.id, s]));
    getContent().sections = orderedIds.map((id) => map[id]).filter(Boolean);
    afterFieldEdit();
  }
  async function addElement(sectionId, column) {
    const sec = findSection(sectionId);
    if (!sec || sec.elements.length >= limits.maxElements) return;
    const type = await chooseElementType();
    if (!type) return;
    const col = column === 1 ? 1 : 0; // which 50% column (ignored in 100% layout)
    const e = type === 'code'
      ? { id: uid('el'), type: 'code', title: 'Code', displayTitle: false, column: col, code: '' }
      : { id: uid('el'), type: 'richtext', title: 'Richtext', displayTitle: false, column: col, body: '' };
    sec.elements.push(e);
    selectedSectionId = sectionId;
    selectedElementId = e.id;
    afterContentChange();
  }
  // Edit icon: richtext opens the focused content modal; code selects (panel).
  function editElement(secId, elId) {
    const elc = findElement(secId, elId);
    if (!elc) return;
    selectElement(secId, elId);
    if (elc.type === 'richtext') openRichtextModal(secId, elId);
  }

  // Focused "Edit richtext" modal — a small WYSIWYG editor. Cannot be dismissed
  // by clicking outside (only Cancel / Save / close / Escape).
  function openRichtextModal(secId, elId) {
    const elc = findElement(secId, elId);
    if (!elc || elc.type !== 'richtext') return;
    const prev = document.activeElement;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Edit richtext');
    const modal = document.createElement('div');
    modal.className = 'modal modal--rt';
    overlay.appendChild(modal);
    modal.innerHTML =
      '<div class="modal__header"><h2 class="modal__title">Edit richtext</h2>' +
      '<button type="button" class="modal__close" aria-label="Close dialog"><img src="/shared/close.svg" alt="" /></button></div>';

    const body = document.createElement('div');
    body.className = 'modal__body';
    const lab = document.createElement('span');
    lab.className = 'pgb__label';
    lab.textContent = 'Content';
    body.appendChild(lab);

    const wrap = document.createElement('div');
    wrap.className = 'rt';
    const toolbar = document.createElement('div');
    toolbar.className = 'rt__toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Formatting');
    const editor = document.createElement('div');
    editor.className = 'rt__editor';
    editor.contentEditable = 'true';
    editor.setAttribute('role', 'textbox');
    editor.setAttribute('aria-multiline', 'true');
    editor.innerHTML = window.RichText.sanitize(elc.body || '');

    const exec = (cmd, val) => { editor.focus(); document.execCommand(cmd, false, val || null); };
    const TOOLS = [
      { label: 'Bold', html: '<b>B</b>', run: () => exec('bold') },
      { label: 'Italic', html: '<i>I</i>', run: () => exec('italic') },
      { label: 'Underline', html: '<u>U</u>', run: () => exec('underline') },
      { sep: true },
      { label: 'Heading', html: 'H2', run: () => exec('formatBlock', 'H2') },
      { label: 'Subheading', html: 'H3', run: () => exec('formatBlock', 'H3') },
      { sep: true },
      { label: 'Bulleted list', html: '&bull;', run: () => exec('insertUnorderedList') },
      { label: 'Numbered list', html: '1.', run: () => exec('insertOrderedList') },
      { sep: true },
      { label: 'Link', html: '&#128279;', run: () => { const u = window.prompt('Link URL', 'https://'); if (u) exec('createLink', u.trim()); } },
    ];
    TOOLS.forEach((t) => {
      if (t.sep) { const s = document.createElement('span'); s.className = 'rt__sep'; toolbar.appendChild(s); return; }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rt__tool';
      b.title = t.label;
      b.setAttribute('aria-label', t.label);
      b.innerHTML = t.html;
      b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the editor's selection
      b.addEventListener('click', t.run);
      toolbar.appendChild(b);
    });
    wrap.appendChild(toolbar);
    wrap.appendChild(editor);
    body.appendChild(wrap);
    modal.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'modal__footer';
    footer.innerHTML =
      '<button type="button" class="modal__btn modal__btn--cancel">Cancel</button>' +
      '<button type="button" class="modal__btn modal__btn--primary" data-save>Save</button>';
    modal.appendChild(footer);

    document.body.appendChild(overlay);
    document.body.classList.add('is-locked');
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (_) { /* not supported */ }

    function close() {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      document.body.classList.remove('is-locked');
      if (prev && prev.focus) prev.focus();
    }
    modal.querySelector('.modal__close').addEventListener('click', close);
    footer.querySelector('.modal__btn--cancel').addEventListener('click', close);
    footer.querySelector('[data-save]').addEventListener('click', () => {
      const target = findElement(secId, elId);
      if (target) { target.body = window.RichText.sanitize(editor.innerHTML); afterContentChange(); }
      close();
    });
    // Deliberately NO overlay-click handler — the user can't click outside to exit.
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') {
        const f = Array.from(modal.querySelectorAll('button, [contenteditable="true"]')).filter((el) => el.offsetParent !== null);
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    editor.focus();
  }

  function deleteElement(secId, elId) {
    const sec = findSection(secId);
    if (!sec) return;
    const i = sec.elements.findIndex((e) => e.id === elId);
    if (i === -1) return;
    sec.elements.splice(i, 1);
    if (selectedElementId === elId) selectedElementId = null;
    afterContentChange();
  }
  function reorderElements(secId, orderedIds) {
    const sec = findSection(secId);
    if (!sec) return;
    const map = Object.fromEntries(sec.elements.map((e) => [e.id, e]));
    sec.elements = orderedIds.map((id) => map[id]).filter(Boolean);
    afterFieldEdit();
  }

  // ---- element type chooser (cards) on the shared modal chrome ----
  function chooseElementType() {
    return new Promise((resolve) => {
      const prev = document.activeElement;
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Add element');
      overlay.innerHTML =
        '<div class="modal"><div class="modal__header"><h2 class="modal__title">Add element</h2>' +
        '<button type="button" class="modal__close" aria-label="Close dialog"><img src="/shared/close.svg" alt="" /></button></div>' +
        '<div class="modal__body"><div class="elchoose">' +
        '<button type="button" class="elchoose__card" data-type="richtext"><span class="elchoose__vis elchoose__vis--rt" aria-hidden="true"></span><span class="elchoose__name">Richtext</span></button>' +
        '<button type="button" class="elchoose__card" data-type="code"><span class="elchoose__vis elchoose__vis--code" aria-hidden="true"></span><span class="elchoose__name">Code</span></button>' +
        '</div></div><div class="modal__footer">' +
        '<button type="button" class="modal__btn modal__btn--cancel">Cancel</button>' +
        '<button type="button" class="modal__btn modal__btn--primary" data-add disabled>Add to page</button></div></div>';
      document.body.appendChild(overlay);
      document.body.classList.add('is-locked');
      const modal = overlay.querySelector('.modal');
      const addEl = modal.querySelector('[data-add]');
      let chosen = null;
      modal.querySelectorAll('.elchoose__card').forEach((card) => {
        card.addEventListener('click', () => {
          chosen = card.dataset.type;
          modal.querySelectorAll('.elchoose__card').forEach((c) => c.classList.toggle('is-selected', c === card));
          addEl.disabled = false;
        });
      });
      function done(val) {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        document.body.classList.remove('is-locked');
        if (prev && prev.focus) prev.focus();
        resolve(val);
      }
      modal.querySelector('.modal__close').addEventListener('click', () => done(null));
      modal.querySelector('.modal__btn--cancel').addEventListener('click', () => done(null));
      addEl.addEventListener('click', () => done(chosen));
      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) done(null); });
      function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); done(null); } }
      document.addEventListener('keydown', onKey, true);
      modal.querySelector('.elchoose__card').focus();
    });
  }

  // ---- reusable builder UI bits ----
  function buildBreadcrumb(crumbs) {
    const nav = document.createElement('nav');
    nav.className = 'pgb__crumbs';
    nav.setAttribute('aria-label', 'Breadcrumb');
    crumbs.forEach((c, i) => {
      if (i) {
        const sep = document.createElement('span');
        sep.className = 'pgb__crumbsep';
        sep.textContent = '›';
        sep.setAttribute('aria-hidden', 'true');
        nav.appendChild(sep);
      }
      if (c.onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pgb__crumb pgb__crumb--link';
        b.textContent = c.label;
        b.addEventListener('click', c.onClick);
        nav.appendChild(b);
      } else {
        const s = document.createElement('span');
        s.className = 'pgb__crumb';
        s.textContent = c.label;
        nav.appendChild(s);
      }
    });
    return nav;
  }
  function buildHead(titleText, addLabel, onAdd) {
    const head = document.createElement('div');
    head.className = 'navpanel__head';
    const h = document.createElement('h1');
    h.className = 'navpanel__title';
    h.textContent = titleText;
    head.appendChild(h);
    if (onAdd) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'navpanel__add pgb__add';
      b.setAttribute('aria-label', addLabel);
      b.setAttribute('data-tooltip', addLabel);
      b.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>';
      b.addEventListener('click', onAdd);
      head.appendChild(b);
    }
    return head;
  }
  function buildHelper(text) { const p = document.createElement('p'); p.className = 'navpanel__desc'; p.textContent = text; return p; }
  function buildEmpty(text) { const p = document.createElement('p'); p.className = 'navpanel__empty'; p.textContent = text; return p; }
  function buildTextField(labelText, value, maxLen, onInput) {
    const field = document.createElement('div');
    field.className = 'pgb__field';
    const id = uid('f');
    const lab = document.createElement('label');
    lab.className = 'pgb__label';
    lab.textContent = labelText;
    lab.setAttribute('for', id);
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'pgb__input';
    input.id = id;
    input.maxLength = maxLen;
    input.value = value || '';
    const count = document.createElement('div');
    count.className = 'pgb__count';
    const draw = () => { count.textContent = `${input.value.length}/${maxLen}`; };
    draw();
    input.addEventListener('input', () => { draw(); onInput(input.value); });
    field.appendChild(lab);
    field.appendChild(input);
    field.appendChild(count);
    return field;
  }
  function buildTextarea(labelText, value, maxLen, onInput, mono, hint) {
    const field = document.createElement('div');
    field.className = 'pgb__field';
    const id = uid('f');
    const lab = document.createElement('label');
    lab.className = 'pgb__label';
    lab.textContent = labelText;
    lab.setAttribute('for', id);
    field.appendChild(lab);
    if (hint) { const h = document.createElement('p'); h.className = 'pgb__hint'; h.textContent = hint; field.appendChild(h); }
    const ta = document.createElement('textarea');
    ta.className = 'pgb__input pgb__textarea' + (mono ? ' pgb__textarea--mono' : '');
    ta.id = id;
    ta.rows = mono ? 8 : 6;
    ta.maxLength = maxLen;
    ta.value = value || '';
    ta.addEventListener('input', () => onInput(ta.value));
    field.appendChild(ta);
    return field;
  }
  function buildRadio(labelText, options, value, onChange) {
    const field = document.createElement('div');
    field.className = 'pgb__field';
    const lab = document.createElement('span');
    lab.className = 'pgb__label';
    lab.textContent = labelText;
    field.appendChild(lab);
    const group = document.createElement('div');
    group.className = 'pgb__radios';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', labelText);
    const name = uid('r');
    options.forEach((o) => {
      const wrap = document.createElement('label');
      wrap.className = 'pgb__radio';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = name;
      input.value = String(o.value);
      input.checked = String(o.value) === String(value);
      input.addEventListener('change', () => { if (input.checked) onChange(o.value); });
      const span = document.createElement('span');
      span.textContent = o.label;
      wrap.appendChild(input);
      wrap.appendChild(span);
      group.appendChild(wrap);
    });
    field.appendChild(group);
    return field;
  }
  function buildCheckbox(labelText, checked, onChange) {
    const wrap = document.createElement('label');
    wrap.className = 'pgb__check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!checked;
    cb.addEventListener('change', () => onChange(cb.checked));
    const span = document.createElement('span');
    span.textContent = labelText;
    wrap.appendChild(cb);
    wrap.appendChild(span);
    return wrap;
  }
  // Reuses the shared .colorrow component (same markup branding.js builds).
  function makeColorRow(labelText, colorObj, onChange) {
    const row = document.createElement('div');
    row.className = 'colorrow';
    row.innerHTML =
      `<span class="colorrow__label">${escapeHtml(labelText)}</span>` +
      '<span class="colorrow__controls">' +
      `<input type="color" class="colorrow__swatch" data-color-swatch aria-label="${escapeHtml(labelText)} colour" />` +
      `<input type="text" class="colorrow__hex" data-color-hex maxlength="7" spellcheck="false" aria-label="${escapeHtml(labelText)} hex" />` +
      '<span class="colorrow__opacity">' +
      `<input type="number" class="colorrow__opacityval" data-color-opacity min="0" max="100" aria-label="${escapeHtml(labelText)} opacity percent" /><span aria-hidden="true">%</span>` +
      '</span></span>';
    const swatch = row.querySelector('[data-color-swatch]');
    const hex = row.querySelector('[data-color-hex]');
    const op = row.querySelector('[data-color-opacity]');
    const HEX = /^#[0-9a-fA-F]{6}$/;
    swatch.value = colorObj.color; hex.value = colorObj.color; op.value = colorObj.opacity;
    swatch.addEventListener('input', () => { colorObj.color = swatch.value.toUpperCase(); hex.value = colorObj.color; if (colorObj.opacity === 0) { colorObj.opacity = 100; op.value = 100; } onChange(); });
    hex.addEventListener('input', () => { let v = hex.value.trim(); if (v && !v.startsWith('#')) v = '#' + v; if (HEX.test(v)) { colorObj.color = v.toUpperCase(); swatch.value = colorObj.color; onChange(); } });
    hex.addEventListener('blur', () => { hex.value = colorObj.color; });
    op.addEventListener('input', () => { let n = parseInt(op.value, 10); if (isNaN(n)) return; n = Math.max(0, Math.min(100, n)); colorObj.opacity = n; onChange(); });
    op.addEventListener('blur', () => { op.value = colorObj.opacity; });
    return row;
  }
  function rowLabel(text, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'navtree__label pageitem__open';
    b.textContent = text;
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }
  function rowKebab(name, opts) {
    const k = document.createElement('button');
    k.type = 'button';
    k.className = 'navtree__kebab';
    k.setAttribute('aria-label', `Actions for ${name || 'item'}`);
    k.appendChild(svg('<circle cx="8" cy="3" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="8" cy="13" r="1.4"/>'));
    window.Popover.attach(k, () => opts, { align: 'right', label: `Actions for ${name || 'item'}` });
    return k;
  }

  // ---- builder panel renders ----
  function renderBuilderPanel() {
    builderView.innerHTML = '';
    if (sectionTree) { sectionTree.destroy(); sectionTree = null; }
    if (elementTree) { elementTree.destroy(); elementTree = null; }
    if (selectedElementId) renderElementSettings();
    else if (selectedSectionId) renderSectionSettings();
    else renderSectionList();
  }

  function renderSectionList() {
    const page = currentPage();
    const title = page ? page.title : 'Page';
    builderView.appendChild(buildBreadcrumb([{ label: 'Pages', onClick: exitBuilder }, { label: title }]));
    builderView.appendChild(buildHead(title, 'Add section', addSection));
    builderView.appendChild(buildHelper('Create sections to structure your page. Each section can contain elements like rich text and code.'));
    const secs = getSections();
    if (!secs.length) { builderView.appendChild(buildEmpty('No sections yet. Use the + button to add your first section.')); return; }
    const mount = document.createElement('div');
    mount.className = 'navpanel__tree';
    builderView.appendChild(mount);
    sectionTree = window.SortableTree.create(mount, {
      items: secs.map((s) => ({ id: s.id, children: [] })),
      maxDepth: 1,
      ariaLabel: 'Sections',
      labelOf: (it) => { const s = findSection(it.id); return (s && s.title) || 'Untitled section'; },
      renderContent: (it) => { const s = findSection(it.id); return rowLabel((s && s.title) || 'Untitled section', () => selectSection(it.id)); },
      renderTrailing: (it) => { const s = findSection(it.id); return rowKebab(s && s.title, [{ label: 'Edit', onSelect: () => selectSection(it.id) }, { label: 'Delete', danger: true, onSelect: () => deleteSection(it.id) }]); },
      onChange: () => reorderSections(sectionTree.getItems().map((it) => it.id)),
    });
  }

  function renderSectionSettings() {
    const page = currentPage();
    const sec = findSection(selectedSectionId);
    if (!sec) { backToSectionList(); return; }
    builderView.appendChild(buildBreadcrumb([
      { label: 'Pages', onClick: exitBuilder },
      { label: page ? page.title : 'Page', onClick: backToSectionList },
      { label: sec.title || 'Section' },
    ]));
    builderView.appendChild(buildHead(sec.title || 'Section', 'Add element', () => addElement(sec.id)));
    builderView.appendChild(buildHelper('Add elements to this section to build your content. You can reorder, edit, or remove them.'));

    const settings = document.createElement('div');
    settings.className = 'pgb__settings';
    settings.appendChild(buildTextField('Title', sec.title, limits.sectionTitle, (v) => { sec.title = v; afterFieldEdit(); }));
    settings.appendChild(buildCheckbox('Display section title', sec.displayTitle, (v) => { sec.displayTitle = v; afterFieldEdit(); }));
    settings.appendChild(buildRadio('Column layout', [{ value: 1, label: '100%' }, { value: 2, label: '50% / 50%' }], sec.columns || 1, (v) => { sec.columns = v; afterFieldEdit(); }));
    settings.appendChild(makeColorRow('Background', sec.background, afterFieldEdit));
    builderView.appendChild(settings);
    // Elements are managed in the preview (click to select/edit, toolbar to
    // delete), so they are intentionally not listed in the section panel.
  }

  function renderElementSettings() {
    const page = currentPage();
    const sec = findSection(selectedSectionId);
    const elc = findElement(selectedSectionId, selectedElementId);
    if (!sec || !elc) { backToSection(); return; }
    const elName = elc.title || (elc.type === 'code' ? 'Code' : 'Richtext');
    builderView.appendChild(buildBreadcrumb([
      { label: 'Pages', onClick: exitBuilder },
      { label: page ? page.title : 'Page', onClick: backToSectionList },
      { label: sec.title || 'Section', onClick: backToSection },
      { label: elName },
    ]));
    builderView.appendChild(buildHead(elName));

    const settings = document.createElement('div');
    settings.className = 'pgb__settings';
    settings.appendChild(buildTextField('Title', elc.title, limits.elementTitle, (v) => { elc.title = v; afterFieldEdit(); }));
    settings.appendChild(buildCheckbox('Display element title', elc.displayTitle, (v) => { elc.displayTitle = v; afterFieldEdit(); }));
    if (elc.type === 'code') {
      settings.appendChild(buildTextarea('Code', elc.code, limits.body, (v) => { elc.code = v; afterFieldEdit(); }, true));
    } else {
      // Richtext content is edited in a focused modal (also via the toolbar's edit icon).
      const field = document.createElement('div');
      field.className = 'pgb__field';
      const lab = document.createElement('span');
      lab.className = 'pgb__label';
      lab.textContent = 'Content';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--secondary';
      btn.textContent = 'Edit content';
      btn.addEventListener('click', () => openRichtextModal(selectedSectionId, elc.id));
      field.appendChild(lab);
      field.appendChild(btn);
      settings.appendChild(field);
    }
    builderView.appendChild(settings);
  }

  // ---- preview ----
  function pushPreview() {
    if (!preview) return;
    if (view !== 'builder') { preview.update({ builder: null }); return; }
    preview.update({
      builder: { sections: getSections(), selectedSectionId, selectedElementId },
      builderCallbacks: {
        onAddSection: addSection,
        onAddElement: (sid, col) => addElement(sid, col),
        onSelectSection: selectSection,
        onSelectElement: selectElement,
        onEditElement: (sid, elId) => editElement(sid, elId),
        onDeleteSection: deleteSection,
        onDeleteElement: deleteElement,
      },
    });
  }

  // ---- save bar + view toggle ----
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

  function renderAll() {
    const builderMode = view === 'builder';
    listView.hidden = builderMode;
    builderView.hidden = !builderMode;
    backBtn.hidden = !builderMode;
    publishBtn.hidden = !builderMode;
    if (builderMode) {
      const p = currentPage();
      publishBtn.disabled = !!(p && p.status === 'published');
      publishBtn.textContent = p && p.status === 'published' ? 'Published' : 'Publish page';
      renderBuilderPanel();
    }
    updateSaveBar();
    pushPreview();
  }

  function publishPage() {
    const items = tree.getItems();
    const p = findById(items, builderPageId);
    if (!p || p.status === 'published') return;
    p.status = 'published';
    tree.setItems(pinHomepage(items));
    renderAll();
  }

  // ---- save ----
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
      const saved = data.saved || [];
      Object.keys(contentById).forEach((k) => delete contentById[k]);
      saved.forEach((p) => { contentById[p.id] = p.content || { sections: [] }; });
      baseline = JSON.stringify(strip(saved));
      mountTree(saved);
      // If the edited page/section/element vanished after normalization, fall back.
      if (view === 'builder') {
        if (!findById(saved, builderPageId)) { exitBuilder(); return; }
        if (selectedSectionId && !findSection(selectedSectionId)) { selectedSectionId = null; selectedElementId = null; }
        else if (selectedElementId && !findElement(selectedSectionId, selectedElementId)) { selectedElementId = null; }
        renderAll();
      }
    } catch (err) {
      saving = false;
      saveError = err.message || 'Couldn’t save. Try again.';
      updateSaveBar();
    }
  }

  // ---- navigation guard (unsaved changes) ----
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

  // ---- boot ----
  preview = window.WebsitePreview.create(document.querySelector('[data-website-preview]'));
  saveBtn.addEventListener('click', save);
  addBtn.addEventListener('click', openAdd);
  backBtn.addEventListener('click', exitBuilder);
  publishBtn.addEventListener('click', publishPage);

  fetch('/api/website/pages', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((data) => {
      if (data.limits) limits = data.limits;
      (data.pages || []).forEach((p) => { contentById[p.id] = p.content || { sections: [] }; });
      baseline = JSON.stringify(strip(data.pages || []));
      mountTree(data.pages || []);
    })
    .catch(() => {
      emptyEl.hidden = false;
      emptyEl.textContent = 'Couldn’t load pages. Refresh to try again.';
    });

  setupNavGuard();
})();
