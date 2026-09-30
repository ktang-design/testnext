// Features > Databases — landing page (empty/filled states + entries list).
// Mirrors bento.js's auto-save/Publish/Discard model via the shared
// databases-shared.js helper (all 3 Databases pages read/write the same
// single draft blob). Reuses the shared Modal/Popover/SortableTree
// primitives and the .toast component, same as Bento.
(function () {
  var KEBAB = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="3" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="8" cy="13" r="1.4"/></svg>';
  var DEFAULTS = { entries: [], categories: [], display: { azIndex: false, filters: false, sortOrder: 'title', groupBy: 'none', resultsPerPage: 25 }, fieldLabels: [] };

  var loadingEl = document.querySelector('[data-state="loading"]');
  var emptyEl = document.querySelector('[data-state="empty"]');
  var filledEl = document.querySelector('[data-state="filled"]');
  var treeMount = document.querySelector('[data-tree]');

  var draft = clone(DEFAULTS);
  var published = clone(DEFAULTS);
  var tree = null;
  var bar = null;

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function toast(message) { if (window.Toast) window.Toast.show(message); }
  var uid = function () { return 'dbe_' + Math.random().toString(36).slice(2, 10); };
  var labelOf = function (e) { return (e && e.title && e.title.trim()) || 'Untitled database'; };
  var nextCopyName = function (title, existingNames) {
    var m = /^(.*) Copy(?: (\d+))?$/.exec(title);
    var base = m ? m[1] : title;
    if (existingNames.indexOf(base + ' Copy') === -1) return base + ' Copy';
    var n = 2;
    while (existingNames.indexOf(base + ' Copy ' + n) !== -1) n++;
    return base + ' Copy ' + n;
  };

  function renderStates() {
    loadingEl.hidden = true;
    var hasEntries = draft.entries.length > 0;
    emptyEl.hidden = hasEntries;
    filledEl.hidden = !hasEntries;
    treeMount.hidden = !hasEntries;
  }

  function rowKebab(entry) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'navtree__kebab';
    btn.setAttribute('aria-label', 'Actions for ' + labelOf(entry));
    btn.innerHTML = KEBAB;
    window.Popover.attach(btn, function () {
      return [
        { label: 'Edit', onSelect: function () { window.location.href = 'entry/?id=' + encodeURIComponent(entry.id); } },
        { label: 'Duplicate', onSelect: function () { duplicateEntry(entry.id); } },
        { label: 'Delete', danger: true, onSelect: function () { deleteEntry(entry.id); } },
      ];
    }, { align: 'right', label: 'Actions for ' + labelOf(entry) });
    return btn;
  }

  function mountTree() {
    treeMount.innerHTML = '';
    tree = window.SortableTree.create(treeMount, {
      items: draft.entries,
      maxDepth: 1,
      ariaLabel: 'Databases',
      labelOf: labelOf,
      renderContent: function (e) {
        var span = document.createElement('span');
        span.className = 'navtree__label';
        span.textContent = labelOf(e);
        return span;
      },
      renderTrailing: function (e) { return rowKebab(e); },
      onChange: function (items) { draft.entries = items; afterModelChange(); },
    });
  }

  function syncTree() {
    if (draft.entries.length && !tree) mountTree();
    else if (tree) tree.setItems(draft.entries);
    afterModelChange();
  }
  function afterModelChange() {
    renderStates();
    if (bar) bar.markDirty();
  }

  function duplicateEntry(id) {
    var src = draft.entries.filter(function (e) { return e.id === id; })[0];
    if (!src) return;
    var existingNames = draft.entries.map(labelOf);
    var copy = clone(src);
    copy.id = uid();
    copy.title = nextCopyName(labelOf(src), existingNames);
    draft.entries.push(copy);
    syncTree();
  }

  function deleteEntry(id) {
    window.Modal.confirm({
      title: 'Delete database',
      message: 'This database will be removed from your directory. The change will be reflected on your website after Databases is published.',
      cancelLabel: 'Keep database',
      confirmLabel: 'Delete database',
      outline: true,
    }).then(function (ok) {
      if (!ok) return;
      draft.entries = draft.entries.filter(function (e) { return e.id !== id; });
      syncTree();
    });
  }

  // "Create database" from the empty state goes to Settings first if
  // nothing has been configured yet (no categories), so the very first
  // entry can pick from real categories; otherwise it goes straight to the
  // entry form, same as "Add database" in the filled state.
  document.querySelector('[data-action="create-first"]').addEventListener('click', function () {
    if (!draft.categories.length) window.location.href = 'settings/';
    else window.location.href = 'entry/';
  });
  document.querySelector('[data-action="add"]').addEventListener('click', function () {
    window.location.href = 'entry/';
  });

  window.DatabasesResource.load().then(function (data) {
    draft = clone(data.draft || data.defaults || DEFAULTS);
    // Fall back to DEFAULTS, not `draft` — an account that's never published
    // has nothing published yet, which must compare as different from any
    // non-empty draft (falling back to draft here would make isDirty() always
    // false, silently disabling Publish).
    published = clone(data.published || DEFAULTS);
    bar = window.DatabasesResource.init({
      getDraft: function () { return draft; },
      getPublished: function () { return published; },
      onAutoSaved: function (fresh) { if (fresh) { draft = fresh; syncTreeQuiet(); } },
      onDiscarded: function (fresh) { if (fresh) { draft = fresh; published = clone(fresh); syncTreeQuiet(); } },
      onPublished: function (fresh) { if (fresh) published = fresh; },
    });
    if (draft.entries.length) mountTree();
    renderStates();
  });

  // Re-sync the tree from a fresh server draft (auto-save echo / discard)
  // without re-triggering afterModelChange (which would re-schedule a save).
  function syncTreeQuiet() {
    if (draft.entries.length && !tree) mountTree();
    else if (tree) tree.setItems(draft.entries);
    renderStates();
  }
})();
