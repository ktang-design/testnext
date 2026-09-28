// Features > Bento. Builds a "bento" (unified multi-source search) out of an
// ordered list of blocks. Unlike the Website > Pages editor, edits here
// auto-save as a DRAFT a couple of seconds after you stop typing/dragging;
// the live site only ever reflects the separate PUBLISHED snapshot until you
// click Publish. "Discard changes" reverts the draft back to whatever is
// currently published. Reuses the shared Modal / Popover / SortableTree
// primitives and the .toast component.
(function () {
  var ENDPOINT = '/api/features/bento';
  var AUTO_SAVE_DELAY = 2000; // ms of idle time after the last edit before auto-saving
  var KEBAB = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="3" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="8" cy="13" r="1.4"/></svg>';

  var noticeEl = document.querySelector('[data-state="no-integration"]');
  var configuredEl = document.querySelector('[data-state="configured"]');
  var createBtn = document.querySelector('[data-create]');
  var hintEl = document.querySelector('[data-list-hint]');
  var treeMount = document.querySelector('[data-tree]');
  var discardBtn = document.querySelector('[data-action="discard"]');
  var publishBtn = document.querySelector('[data-action="publish"]');
  var publishLabel = publishBtn.querySelector('.btn__label');
  var statusEl = document.querySelector('[data-save-status]');

  // integrationConfigured is DERIVED from the EDS integration (all required EDS
  // fields filled) — computed server-side and returned by GET. Only `blocks` is
  // stored on the bento record.
  var state = { integrationConfigured: false, blocks: [] };
  var publishedBlocks = []; // last-known published snapshot — what the live site shows
  var options = { sourceType: [], contentProvider: [], subjects: [] };
  var draftBaseline = '';   // serialized form of the last SERVER-CONFIRMED draft
  var saving = false;       // an auto-save PUT is in flight
  var publishing = false;   // a publish POST is in flight
  var showSavedMsg = false; // true once an auto-save has completed this session
  var autoSaveTimer = null;
  var tree = null;

  var uid = function () { return 'b_' + Math.random().toString(36).slice(2, 10); };
  var labelOf = function (b) { return (b && b.name && b.name.trim()) || 'Bento block'; };
  var serializeBlocks = function (list) {
    return JSON.stringify((list || []).map(function (b) {
      return { id: b.id, name: b.name || '', sourceType: b.sourceType || '', contentProvider: b.contentProvider || '', subjects: b.subjects || '' };
    }));
  };
  // Live-edit dirty check: compares the in-memory draft against what's
  // published, so Publish can respond immediately without waiting on the
  // debounce. Discard/status text instead key off draftBaseline (see render).
  var isDraftDirty = function () { return serializeBlocks(state.blocks) !== serializeBlocks(publishedBlocks); };

  function toast(message) { if (window.Toast) window.Toast.show(message); }

  // ---- publish bar ----
  function render() {
    var draftMatchesPublished = draftBaseline === serializeBlocks(publishedBlocks);
    publishBtn.disabled = publishing || !isDraftDirty();
    publishBtn.classList.toggle('is-saving', publishing);
    publishLabel.textContent = publishing ? 'Publishing' : 'Publish';
    // Discard changes appears once there's a server-confirmed draft that
    // differs from published, and stays until the draft catches back up —
    // independent of the live in-memory edit, so it doesn't flicker mid-type.
    discardBtn.hidden = draftMatchesPublished;
    if (saving) {
      statusEl.hidden = false;
      statusEl.textContent = 'Saving…';
    } else if (showSavedMsg) {
      statusEl.hidden = false;
      statusEl.textContent = 'Changes saved!';
    } else {
      statusEl.hidden = true;
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
  // then refresh visibility + schedule an auto-save.
  function syncTree() {
    if (state.blocks.length && !tree) mountTree();
    else if (tree) tree.setItems(state.blocks);
    afterModelChange();
  }
  function afterModelChange() {
    renderStates();
    render();
    scheduleAutoSave();
  }

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

  // ---- auto-save (draft only) ----
  function scheduleAutoSave() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(function () { autoSaveTimer = null; autoSave(); }, AUTO_SAVE_DELAY);
  }
  // Skips the debounce and saves right away — used before Publish, so it
  // always promotes the latest edits rather than a stale draft.
  function flushPendingSave() {
    if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; return autoSave(); }
    return Promise.resolve();
  }
  function autoSave() {
    if (saving) return Promise.resolve();
    saving = true;
    render();
    return fetch(ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ blocks: state.blocks }),
    }).then(function (res) {
      if (!res.ok) return res.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.message || 'We could not save your changes. Try again.'); });
      return res.json();
    }).then(function (data) {
      var draft = (data && data.draft) || { blocks: [] };
      state.blocks = Array.isArray(draft.blocks) ? draft.blocks : [];
      draftBaseline = serializeBlocks(state.blocks);
      saving = false;
      showSavedMsg = true;
      if (state.blocks.length && !tree) mountTree();
      else if (tree) tree.setItems(state.blocks);
      renderStates();
      render();
    }).catch(function (err) {
      saving = false;
      render();
      toast(err.message || 'We could not save your changes. Try again.');
    });
  }

  // ---- publish / discard ----
  function publishNow() {
    if (publishing || !isDraftDirty()) return;
    publishing = true;
    render();
    flushPendingSave().then(function () {
      return fetch(ENDPOINT + '/publish', { method: 'POST', credentials: 'include' });
    }).then(function (res) {
      if (!res.ok) return res.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.message || 'We could not publish your changes. Try again.'); });
      return res.json();
    }).then(function (data) {
      var published = (data && data.published) || { blocks: [] };
      publishedBlocks = Array.isArray(published.blocks) ? published.blocks : [];
      publishing = false;
      render();
      toast('Bento published successfully. Your changes are now live!');
    }).catch(function (err) {
      publishing = false;
      render();
      toast(err.message || 'We could not publish your changes. Try again.');
    });
  }

  function discardChanges() {
    if (discardBtn.hidden || publishing || saving) return;
    fetch(ENDPOINT + '/discard', { method: 'POST', credentials: 'include' })
      .then(function (res) {
        if (!res.ok) return res.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.message || 'We could not discard your changes. Try again.'); });
        return res.json();
      })
      .then(function (data) {
        var draft = (data && data.draft) || { blocks: [] };
        state.blocks = Array.isArray(draft.blocks) ? draft.blocks : [];
        draftBaseline = serializeBlocks(state.blocks);
        showSavedMsg = false;
        if (state.blocks.length && !tree) mountTree();
        else if (tree) tree.setItems(state.blocks);
        renderStates();
        render();
      })
      .catch(function (err) { toast(err.message || 'We could not discard your changes. Try again.'); });
  }

  // ---- init ----
  createBtn.addEventListener('click', function () { openBlockModal(null); });
  publishBtn.addEventListener('click', publishNow);
  discardBtn.addEventListener('click', discardChanges);

  // Auto-save on a page-hide/unload so a rapid edit-then-leave within the
  // debounce window isn't silently lost; best-effort, doesn't block leaving.
  window.addEventListener('beforeunload', function () {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
      try {
        fetch(ENDPOINT, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          keepalive: true,
          body: JSON.stringify({ blocks: state.blocks }),
        });
      } catch (_) { /* best effort */ }
    }
  });

  fetch(ENDPOINT, { credentials: 'include' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      var d = data || {};
      options = d.options || options;
      state.integrationConfigured = !!d.integrationConfigured; // derived from EDS
      var draft = d.draft || d.defaults || { blocks: [] };
      var published = d.published || { blocks: [] };
      state.blocks = Array.isArray(draft.blocks) ? draft.blocks : [];
      publishedBlocks = Array.isArray(published.blocks) ? published.blocks : [];
      draftBaseline = serializeBlocks(state.blocks);
      if (state.integrationConfigured && state.blocks.length) mountTree();
      renderStates();
      render();
    })
    .catch(function () { renderStates(); render(); });
})();
