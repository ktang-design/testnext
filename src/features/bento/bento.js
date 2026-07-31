// Features > Bento. Builds a "bento" (unified multi-source search) out of an
// ordered list of blocks. Everything is local until Save (one PUT replaces the
// full record), mirroring the Website > Pages editor. Reuses the shared
// Modal / Popover / SortableTree primitives and the .toast component.
(function () {
  var ENDPOINT = '/api/features/bento';
  var KEBAB = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="3" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="8" cy="13" r="1.4"/></svg>';

  var noticeEl = document.querySelector('[data-state="no-integration"]');
  var configuredEl = document.querySelector('[data-state="configured"]');
  var createBtn = document.querySelector('[data-create]');
  var hintEl = document.querySelector('[data-list-hint]');
  var treeMount = document.querySelector('[data-tree]');
  var saveBtn = document.querySelector('[data-action="save"]');
  var statusEl = document.querySelector('[data-save-status]');
  var toastEl = document.querySelector('.toast');

  var state = { integrationConfigured: false, blocks: [] };
  var options = { sourceType: [], contentProvider: [], subjects: [] };
  var baseline = '';
  var saving = false;
  var saveError = null;
  var tree = null;

  var uid = function () { return 'b_' + Math.random().toString(36).slice(2, 10); };
  var labelOf = function (b) { return (b && b.name && b.name.trim()) || 'Bento block'; };
  var serialize = function () {
    return JSON.stringify({
      integrationConfigured: state.integrationConfigured,
      blocks: state.blocks.map(function (b) {
        return { id: b.id, name: b.name || '', sourceType: b.sourceType || '', contentProvider: b.contentProvider || '', subjects: b.subjects || '' };
      }),
    });
  };
  var isDirty = function () { return serialize() !== baseline; };

  // ---- toast ----
  var toastTimer;
  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 3200);
  }

  // ---- save bar ----
  function updateSave() {
    var dirty = isDirty();
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

  // ---- state visibility ----
  function renderStates() {
    var configured = !!state.integrationConfigured;
    noticeEl.hidden = configured;
    configuredEl.hidden = !configured;
    var hasBlocks = state.blocks.length > 0;
    hintEl.hidden = !(configured && hasBlocks);
    treeMount.hidden = !(configured && hasBlocks);
  }

  // ---- block list (SortableTree) ----
  function rowKebab(block) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'navtree__kebab';
    btn.setAttribute('aria-label', 'Actions for ' + labelOf(block));
    btn.innerHTML = KEBAB;
    window.Popover.attach(btn, function () {
      return [
        { label: 'Edit', onSelect: function () { openBlockModal(block.id); } },
        { label: 'Duplicate', onSelect: function () { duplicateBlock(block.id); } },
        { label: 'Delete', danger: true, onSelect: function () { deleteBlock(block.id); } },
      ];
    }, { align: 'right', label: 'Actions for ' + labelOf(block) });
    return btn;
  }

  function mountTree() {
    treeMount.innerHTML = '';
    tree = window.SortableTree.create(treeMount, {
      items: state.blocks,
      maxDepth: 1,
      ariaLabel: 'Bento blocks',
      labelOf: labelOf,
      renderContent: function (b) {
        var span = document.createElement('span');
        span.className = 'navtree__label';
        span.textContent = labelOf(b);
        return span;
      },
      renderTrailing: function (b) { return rowKebab(b); },
      onChange: function (items) { state.blocks = items; afterModelChange(); },
    });
  }

  // Re-sync the tree view to state.blocks (used after add/edit/duplicate/delete),
  // then refresh states + save bar.
  function syncTree() {
    if (state.blocks.length && !tree) mountTree();
    else if (tree) tree.setItems(state.blocks);
    afterModelChange();
  }
  function afterModelChange() { renderStates(); updateSave(); }

  // ---- create / edit modal ----
  function selectOptions(list) { return (list || []).map(function (v) { return { value: v, label: v }; }); }

  function openBlockModal(editId) {
    var editing = state.blocks.filter(function (b) { return b.id === editId; })[0];
    window.Modal.form({
      title: editing ? 'Edit EDS bento block' : 'Create EDS bento block',
      submitLabel: editing ? 'Save block' : 'Create block',
      values: editing
        ? { name: editing.name, sourceType: editing.sourceType, contentProvider: editing.contentProvider, subjects: editing.subjects }
        : {},
      fields: [
        { name: 'name', label: 'Block name', type: 'text', maxLength: 120 },
        { name: 'sourceType', label: 'Source type (optional)', type: 'select', placeholder: 'All options', options: selectOptions(options.sourceType) },
        { name: 'contentProvider', label: 'Content provider (optional)', type: 'select', placeholder: 'All options', options: selectOptions(options.contentProvider) },
        { name: 'subjects', label: 'Subjects (optional)', type: 'select', placeholder: 'All options', options: selectOptions(options.subjects) },
      ],
    }).then(function (values) {
      if (!values) return;
      if (editing) {
        editing.name = values.name || '';
        editing.sourceType = values.sourceType || '';
        editing.contentProvider = values.contentProvider || '';
        editing.subjects = values.subjects || '';
      } else {
        state.blocks.push({
          id: uid(),
          name: values.name || '',
          sourceType: values.sourceType || '',
          contentProvider: values.contentProvider || '',
          subjects: values.subjects || '',
        });
      }
      syncTree();
    });
  }

  function duplicateBlock(id) {
    var src = state.blocks.filter(function (b) { return b.id === id; })[0];
    if (!src) return;
    state.blocks.push({ id: uid(), name: src.name, sourceType: src.sourceType, contentProvider: src.contentProvider, subjects: src.subjects });
    syncTree();
  }

  function deleteBlock(id) {
    var block = state.blocks.filter(function (b) { return b.id === id; })[0];
    window.Modal.confirm({
      title: 'Delete block',
      message: 'Delete "' + labelOf(block) + '"? This can’t be undone.',
      confirmLabel: 'Delete',
      danger: true,
    }).then(function (ok) {
      if (!ok) return;
      state.blocks = state.blocks.filter(function (b) { return b.id !== id; });
      syncTree();
    });
  }

  // ---- save ----
  function save() {
    if (saving || !isDirty()) return;
    saving = true;
    saveError = null;
    updateSave();
    fetch(ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ integrationConfigured: state.integrationConfigured, blocks: state.blocks }),
    }).then(function (res) {
      if (!res.ok) return res.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.message || 'Couldn’t save. Try again.'); });
      return res.json();
    }).then(function (data) {
      var saved = (data && data.saved) || { integrationConfigured: state.integrationConfigured, blocks: [] };
      state.integrationConfigured = !!saved.integrationConfigured;
      state.blocks = Array.isArray(saved.blocks) ? saved.blocks : [];
      baseline = serialize();
      saving = false;
      if (state.blocks.length && !tree) mountTree();
      else if (tree) tree.setItems(state.blocks);
      renderStates();
      updateSave();
      toast('Bento saved! You can now view it on your website.');
    }).catch(function (err) {
      saving = false;
      saveError = err.message || 'Couldn’t save. Try again.';
      updateSave();
    });
  }

  // ---- unsaved-changes nav guard ----
  function setupNavGuard() {
    var modal = document.querySelector('[data-modal="unsaved"]');
    if (!modal) return;
    var pendingHref = null;
    var allowLeave = false;
    var open = function () { modal.hidden = false; modal.querySelector('[data-modal-keep]').focus(); };
    var close = function () { modal.hidden = true; pendingHref = null; };
    modal.querySelector('[data-modal-close]').addEventListener('click', close);
    modal.querySelector('[data-modal-keep]').addEventListener('click', close);
    modal.querySelector('[data-modal-discard]').addEventListener('click', function () {
      allowLeave = true;
      var href = pendingHref;
      close();
      if (href) window.location.href = href;
    });
    document.addEventListener('click', function (e) {
      if (allowLeave) return;
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#') return;
      if (!isDirty()) return;
      e.preventDefault();
      pendingHref = href;
      open();
    }, true);
    window.addEventListener('beforeunload', function (e) {
      if (isDirty() && !allowLeave) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // ---- init ----
  createBtn.addEventListener('click', function () { openBlockModal(null); });
  saveBtn.addEventListener('click', save);
  setupNavGuard();

  fetch(ENDPOINT, { credentials: 'include' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      var d = data || {};
      options = d.options || options;
      var v = d.saved || d.defaults || { integrationConfigured: false, blocks: [] };
      state.integrationConfigured = !!v.integrationConfigured;
      state.blocks = Array.isArray(v.blocks) ? v.blocks : [];
      baseline = serialize();
      if (state.integrationConfigured && state.blocks.length) mountTree();
      renderStates();
      updateSave();
    })
    .catch(function () { renderStates(); updateSave(); });
})();
