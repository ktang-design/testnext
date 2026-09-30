// Features > Databases > Create database (Settings step) — display options,
// categories (one expanded at a time), and field labels. Per Figma 7587:64672
// this page has no auto-save and no Discard/Publish pair — just one "Save and
// continue" action that saves the draft and moves on to the entry form.
(function () {
  var DEFAULTS = { entries: [], categories: [], display: { azIndex: false, filters: false, sortOrder: 'title', groupBy: 'none', resultsPerPage: 25 }, fieldLabels: [] };
  var MAX_CATEGORIES = 3;

  var categoriesEl = document.querySelector('[data-categories]');
  var fieldLabelsEl = document.querySelector('[data-fieldlabels]');
  var addCategoryBtn = document.querySelector('[data-action="add-category"]');
  var saveContinueBtn = document.querySelector('[data-action="save-continue"]');

  var draft = clone(DEFAULTS);
  var openCategoryId = null;

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  var uid = function (prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 10); };
  function toast(message) { if (window.Toast) window.Toast.show(message); }

  // ---------- display options ----------
  function applyDisplayValues() {
    document.querySelectorAll('[data-opt]').forEach(function (el) {
      var key = el.dataset.opt;
      if (el.type === 'checkbox') el.checked = !!draft.display[key];
      else el.value = String(draft.display[key]);
    });
  }
  function bindDisplay() {
    document.querySelectorAll('[data-opt]').forEach(function (el) {
      var key = el.dataset.opt;
      if (el.type === 'checkbox') {
        el.addEventListener('change', function () { draft.display[key] = el.checked; });
      } else {
        el.addEventListener('change', function () {
          draft.display[key] = key === 'resultsPerPage' ? Number(el.value) : el.value;
        });
      }
    });
    applyDisplayValues();
  }

  // ---------- categories (accordion, one open at a time) ----------
  function renderCategories() {
    categoriesEl.innerHTML = '';
    draft.categories.forEach(function (cat) {
      const isOpen = cat.id === openCategoryId;
      const item = document.createElement('div');
      item.className = 'db-category' + (isOpen ? ' is-open' : '');

      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'db-category__head';
      head.setAttribute('aria-expanded', String(isOpen));
      const headLabel = document.createElement('span');
      headLabel.className = 'db-category__head-label';
      headLabel.textContent = cat.name || 'Category';
      const chevron = document.createElement('span');
      chevron.className = 'db-category__chevron';
      chevron.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';
      head.appendChild(headLabel);
      head.appendChild(chevron);
      head.addEventListener('click', function () {
        openCategoryId = isOpen ? null : cat.id;
        renderCategories();
      });
      item.appendChild(head);

      const body = document.createElement('div');
      body.className = 'db-category__body';
      body.hidden = !isOpen;

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
        headLabel.textContent = cat.name || 'Category';
      });
      nameControl.appendChild(nameInput);
      nameField.appendChild(nameControl);
      body.appendChild(nameField);

      const termsWrap = document.createElement('div');
      termsWrap.className = 'db-terms';
      const termsLabel = document.createElement('span');
      termsLabel.className = 'field__label';
      termsLabel.textContent = 'Terms';
      body.appendChild(termsLabel);
      if (!cat.terms.length) cat.terms.push('');
      cat.terms.forEach(function (term, ti) {
        const row = document.createElement('div');
        row.className = 'db-term';
        const termInput = document.createElement('input');
        termInput.className = 'db-term__label input';
        termInput.type = 'text';
        termInput.maxLength = 60;
        termInput.value = term;
        termInput.placeholder = 'Term';
        termInput.setAttribute('aria-label', 'Term');
        termInput.addEventListener('input', function () { cat.terms[ti] = termInput.value; });
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'db-term__remove';
        remove.setAttribute('aria-label', 'Remove term');
        remove.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
        remove.addEventListener('click', function () { cat.terms.splice(ti, 1); renderCategories(); });
        row.appendChild(termInput);
        row.appendChild(remove);
        termsWrap.appendChild(row);
      });
      body.appendChild(termsWrap);

      const addTerms = document.createElement('button');
      addTerms.type = 'button';
      addTerms.className = 'db-textlink';
      addTerms.textContent = 'Add terms';
      addTerms.addEventListener('click', function () {
        cat.terms.push('');
        renderCategories();
        const inputs = categoriesEl.querySelectorAll('.db-term__label');
        if (inputs.length) inputs[inputs.length - 1].focus();
      });
      termsWrap.appendChild(addTerms);

      const removeCat = document.createElement('button');
      removeCat.type = 'button';
      removeCat.className = 'btn btn--secondary';
      removeCat.textContent = 'Remove category';
      removeCat.addEventListener('click', function () {
        draft.categories = draft.categories.filter(function (c) { return c.id !== cat.id; });
        if (openCategoryId === cat.id) openCategoryId = null;
        renderCategories();
        updateAddCategoryBtn();
      });
      body.appendChild(removeCat);

      item.appendChild(body);
      categoriesEl.appendChild(item);
    });
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

  // ---------- field labels (up/down + rename, no drag grip) ----------
  function renderFieldLabels() {
    fieldLabelsEl.innerHTML = '';
    draft.fieldLabels.forEach(function (f, i) {
      const row = document.createElement('div');
      row.className = 'db-fieldrow';
      const label = document.createElement('span');
      label.className = 'db-fieldrow__label';
      label.textContent = f.label;
      row.appendChild(label);

      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'db-fieldrow__btn';
      up.setAttribute('aria-label', 'Move ' + f.label + ' up');
      up.disabled = i === 0;
      up.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13V3M4 6.5 8 3l4 3.5"/></svg>';
      up.addEventListener('click', function () { moveField(i, -1); });

      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'db-fieldrow__btn';
      down.setAttribute('aria-label', 'Move ' + f.label + ' down');
      down.disabled = i === draft.fieldLabels.length - 1;
      down.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v10M4 9.5 8 13l4-3.5"/></svg>';
      down.addEventListener('click', function () { moveField(i, 1); });

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'db-fieldrow__btn';
      edit.setAttribute('aria-label', 'Rename ' + f.label);
      edit.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><path d="M10.8 2.6 13.4 5.2 5.4 13.2H2.8v-2.6z"/></svg>';
      edit.addEventListener('click', function () { renameField(i); });

      row.appendChild(up);
      row.appendChild(down);
      row.appendChild(edit);
      fieldLabelsEl.appendChild(row);
    });
  }
  function moveField(i, delta) {
    var j = i + delta;
    if (j < 0 || j >= draft.fieldLabels.length) return;
    var arr = draft.fieldLabels;
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    renderFieldLabels();
  }
  function renameField(i) {
    var f = draft.fieldLabels[i];
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
      window.location.href = '../';
    }).catch(function (err) {
      saveContinueBtn.disabled = false;
      saveContinueBtn.classList.remove('is-saving');
      toast(err.message || 'We could not save your changes. Try again.');
    });
  });

  window.DatabasesResource.load().then(function (data) {
    draft = clone(data.draft || data.defaults || DEFAULTS);
    if (!draft.categories.length) draft.categories.push({ id: uid('cat'), name: '', terms: [''] });
    openCategoryId = draft.categories[0].id;
    bindDisplay();
    renderCategories();
    updateAddCategoryBtn();
    renderFieldLabels();
  });
})();
