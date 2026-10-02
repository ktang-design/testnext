// Features > Databases > Create database (Settings step) — display options,
// categories (one expanded at a time), and field labels. Per Figma 7587:64672
// this page has no auto-save and no Discard/Publish pair — just one "Save and
// continue" action. First-time setup continues to the create-database form;
// later saves ("Save changes") return to the Databases page.
(function () {
  var DEFAULTS = { entries: [], categories: [], display: { azIndex: false, filters: false, filterCounts: false, sortOrder: 'title', groupBy: 'none', resultsPerPage: 25 }, fieldLabels: [] };
  var MAX_CATEGORIES = 3;

  var categoriesEl = document.querySelector('[data-categories]');
  var fieldLabelsEl = document.querySelector('[data-fieldlabels]');
  var addCategoryBtn = document.querySelector('[data-action="add-category"]');
  var saveContinueBtn = document.querySelector('[data-action="save-continue"]');

  var draft = clone(DEFAULTS);
  var openCategoryId = null;
  var wasConfigured = false;

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  var uid = function (prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 10); };
  function toast(message) { if (window.Toast) window.Toast.show(message); }

  // ---------- display options ----------
  // Filter counts only apply when Filters is on, so its row appears only then.
  function syncFilterCounts() {
    var row = document.querySelector('[data-filtercounts-row]');
    if (row) row.hidden = !draft.display.filters;
  }
  function applyDisplayValues() {
    document.querySelectorAll('[data-opt]').forEach(function (el) {
      var key = el.dataset.opt;
      if (el.type === 'checkbox') el.checked = !!draft.display[key];
      else el.value = String(draft.display[key]);
    });
    syncFilterCounts();
  }
  function bindDisplay() {
    document.querySelectorAll('[data-opt]').forEach(function (el) {
      var key = el.dataset.opt;
      if (el.type === 'checkbox') {
        el.addEventListener('change', function () { draft.display[key] = el.checked; syncFilterCounts(); });
      } else {
        el.addEventListener('change', function () {
          draft.display[key] = key === 'resultsPerPage' ? Number(el.value) : el.value;
        });
      }
    });
    applyDisplayValues();
  }

  // ---------- categories (reorderable accordion, one open at a time) ----------
  function catById(id) { return draft.categories.filter(function (c) { return c.id === id; })[0]; }

  // Untitled vocabularies show as "Controlled vocabulary", "Controlled vocabulary 2", ...
  function vocabName(cat) {
    if (cat.name) return cat.name;
    var i = draft.categories.indexOf(cat);
    return i > 0 ? 'Controlled vocabulary ' + (i + 1) : 'Controlled vocabulary';
  }

  function renderCategories() {
    categoriesEl.innerHTML = '';
    var bodies = {};
    window.SortableTree.create(categoriesEl, {
      items: draft.categories.map(function (c) { return { id: c.id }; }),
      maxDepth: 1,
      ariaLabel: 'Controlled vocabularies',
      labelOf: function (it) { var c = catById(it.id); return c ? vocabName(c) : 'Controlled vocabulary'; },
      itemAttrs: function (it) { return { className: 'db-category' + (it.id === openCategoryId ? ' is-open' : '') }; },
      renderContent: function (it) {
        var parts = buildCategory(catById(it.id));
        bodies[it.id] = parts.body;
        return parts.head;
      },
      renderBelow: function (it) { return bodies[it.id]; },
      onChange: function (items) { draft.categories = items.map(function (it) { return catById(it.id); }); },
    });
  }

  function buildCategory(cat) {
    const isOpen = cat.id === openCategoryId;

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'db-category__head';
    head.setAttribute('aria-expanded', String(isOpen));
    const headLabel = document.createElement('span');
    headLabel.className = 'db-category__head-label';
    headLabel.textContent = vocabName(cat);
    const chevron = document.createElement('span');
    chevron.className = 'db-category__chevron';
    chevron.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';
    head.appendChild(headLabel);
    head.appendChild(chevron);
    head.addEventListener('click', function () {
      openCategoryId = isOpen ? null : cat.id;
      renderCategories();
    });

    const body = document.createElement('div');
    body.className = 'db-category__body';
    body.id = 'dbcat-body-' + cat.id;
    body.hidden = !isOpen;
    head.setAttribute('aria-controls', body.id);

    const nameField = document.createElement('div');
    nameField.className = 'field';
    nameField.innerHTML = '<label class="field__label">Category name</label>';
    const nameControl = document.createElement('div');
    nameControl.className = 'field__control';
    const nameInput = document.createElement('input');
    nameInput.className = 'input';
    nameInput.type = 'text';
    nameInput.maxLength = 60;
    nameInput.value = cat.name || '';
    nameInput.addEventListener('input', function () {
      cat.name = nameInput.value;
      headLabel.textContent = vocabName(cat);
    });
    nameControl.appendChild(nameInput);
    nameField.appendChild(nameControl);
    body.appendChild(nameField);

    const termsWrap = document.createElement('div');
    termsWrap.className = 'db-terms';
    const termsLabel = document.createElement('span');
    termsLabel.className = 'field__label';
    termsLabel.textContent = 'Terms';
    termsWrap.appendChild(termsLabel);
    if (!cat.terms.length) cat.terms.push('');
    const termsMount = document.createElement('div');
    termsWrap.appendChild(termsMount);
    const termsTree = window.SortableTree.create(termsMount, {
      items: cat.terms.map(function (t, i) { return { id: 't' + i, label: t }; }),
      maxDepth: 1,
      ariaLabel: 'Terms for ' + vocabName(cat),
      labelOf: function (t) { return t.label || 'Term'; },
      renderContent: function (t) {
        const termInput = document.createElement('input');
        termInput.className = 'db-term__input';
        termInput.type = 'text';
        termInput.maxLength = 60;
        termInput.value = t.label;
        termInput.placeholder = 'Term';
        termInput.setAttribute('aria-label', 'Term');
        termInput.addEventListener('input', function () {
          t.label = termInput.value;
          cat.terms = termsTree.getItems().map(function (x) { return x.label; });
        });
        return termInput;
      },
      renderTrailing: function (t) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'db-term__remove';
        remove.setAttribute('aria-label', 'Remove term ' + (t.label || ''));
        remove.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
        remove.addEventListener('click', function () {
          cat.terms = termsTree.getItems().filter(function (x) { return x.id !== t.id; }).map(function (x) { return x.label; });
          renderCategories();
        });
        return remove;
      },
      onChange: function (items) { cat.terms = items.map(function (x) { return x.label; }); },
    });
    body.appendChild(termsWrap);

    const addTerms = document.createElement('button');
    addTerms.type = 'button';
    addTerms.className = 'db-textlink';
    addTerms.textContent = 'Add terms';
    addTerms.addEventListener('click', function () {
      cat.terms.push('');
      renderCategories();
      const inputs = categoriesEl.querySelectorAll('.db-term__input');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    termsWrap.appendChild(addTerms);

    const removeCat = document.createElement('button');
    removeCat.type = 'button';
    removeCat.className = 'btn btn--secondary db-category__remove';
    removeCat.textContent = 'Remove list';
    removeCat.addEventListener('click', function () {
      draft.categories = draft.categories.filter(function (c) { return c.id !== cat.id; });
      if (openCategoryId === cat.id) openCategoryId = null;
      renderCategories();
      updateAddCategoryBtn();
    });
    body.appendChild(removeCat);

    return { head: head, body: body };
  }

  function updateAddCategoryBtn() {
    addCategoryBtn.disabled = draft.categories.length >= MAX_CATEGORIES;
  }

  addCategoryBtn.addEventListener('click', function () {
    if (draft.categories.length >= MAX_CATEGORIES) return;
    var cat = { id: uid('cat'), name: '', terms: [] };
    draft.categories.push(cat);
    openCategoryId = cat.id; // newly added category opens, closing any other
    renderCategories();
    updateAddCategoryBtn();
  });

  // ---------- field labels (reorderable, rename via modal) ----------
  var EDIT_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 9.5V13a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 2 13V5a1.5 1.5 0 0 1 1.5-1.5H7"/><path d="M11.6 1.9a1.3 1.3 0 0 1 1.9 1.9L8 9.3 5.5 10l.7-2.5z"/></svg>';

  // Input type shown under each display label (matches the entry form's controls).
  var FIELD_INPUT_TYPES = {
    title: 'Text input',
    url: 'URL input',
    description: 'Text area input',
    image: 'Image upload input',
  };

  function renderFieldLabels() {
    fieldLabelsEl.innerHTML = '';
    window.SortableTree.create(fieldLabelsEl, {
      items: draft.fieldLabels.map(function (f) { return { id: f.key, key: f.key, label: f.label }; }),
      maxDepth: 1,
      ariaLabel: 'Field labels',
      labelOf: function (f) { return f.label; },
      renderContent: function (f) {
        const wrap = document.createElement('div');
        wrap.className = 'db-fieldrow__text';
        const label = document.createElement('span');
        label.className = 'db-fieldrow__label';
        label.textContent = f.label;
        wrap.appendChild(label);
        if (FIELD_INPUT_TYPES[f.key]) {
          const type = document.createElement('span');
          type.className = 'db-fieldrow__type';
          type.textContent = FIELD_INPUT_TYPES[f.key];
          wrap.appendChild(type);
        }
        return wrap;
      },
      renderTrailing: function (f) {
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'db-fieldrow__btn';
        edit.setAttribute('aria-label', 'Rename ' + f.label);
        edit.innerHTML = EDIT_ICON;
        edit.addEventListener('click', function () { renameField(f.key); });
        return edit;
      },
      onChange: function (items) { draft.fieldLabels = items.map(function (f) { return { key: f.key, label: f.label }; }); },
    });
  }
  function renameField(key) {
    var f = draft.fieldLabels.filter(function (x) { return x.key === key; })[0];
    window.Modal.form({
      title: 'Rename field label',
      submitLabel: 'Save',
      values: { label: f.label },
      fields: [{ name: 'label', label: 'Label', type: 'text', maxLength: 60, required: true }],
    }).then(function (values) {
      if (!values) return;
      f.label = values.label.trim() || f.label;
      renderFieldLabels();
    });
  }

  // ---------- Save and continue (the one action on this page) ----------
  saveContinueBtn.addEventListener('click', function () {
    saveContinueBtn.disabled = true;
    saveContinueBtn.classList.add('is-saving');
    draft.configured = true;
    draft.categories = draft.categories.filter(function (c) {
      return (c.name && c.name.trim()) || c.terms.some(function (t) { return t && t.trim(); });
    });
    window.DatabasesResource.save(draft).then(function () {
      window.location.href = wasConfigured ? '../' : '../entry/';
    }).catch(function (err) {
      saveContinueBtn.disabled = false;
      saveContinueBtn.classList.remove('is-saving');
      toast(err.message || 'We could not save your changes. Try again.');
    });
  });

  window.DatabasesResource.load().then(function (data) {
    draft = clone(data.draft || data.defaults || DEFAULTS);
    wasConfigured = !!draft.configured;
    if (wasConfigured) saveContinueBtn.querySelector('.btn__label').textContent = 'Save changes';
    if (!draft.categories.length) draft.categories.push({ id: uid('cat'), name: '', terms: [''] });
    openCategoryId = draft.categories[0].id;
    bindDisplay();
    renderCategories();
    updateAddCategoryBtn();
    renderFieldLabels();
  });
})();
