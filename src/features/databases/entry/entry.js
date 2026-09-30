// Features > Databases > Create/Edit entry. A dedicated page, not a modal
// (Modal.form has no image-upload field type) — mirrors the "Choose an
// image" data-URL pattern from src/website/header/header.js. Saves into the
// same shared draft blob as the other 2 Databases pages via
// databases-shared.js's standalone save() (no separate Discard/Publish bar
// here, per the Figma — just one primary submit button).
(function () {
  var DEFAULTS = { entries: [], categories: [], display: {}, fieldLabels: [] };
  var IMAGE_MAX = 3 * 1024 * 1024; // 3 MB

  var form = document.querySelector('[data-form]');
  var titleEl = document.querySelector('[data-title]');
  var submitBtn = document.querySelector('[data-action="submit"]');
  var submitLabel = document.querySelector('[data-submit-label]');
  var categoriesEl = document.querySelector('[data-categories]');
  var imgChoose = document.querySelector('[data-img-choose]');
  var imgPreview = document.querySelector('[data-img-preview]');
  var imgEl = document.querySelector('[data-img-el]');
  var imgReplace = document.querySelector('[data-img-replace]');
  var imgRemove = document.querySelector('[data-img-remove]');
  var imgInput = document.querySelector('[data-img-input]');
  var imgError = document.querySelector('[data-img-error]');

  var editId = new URLSearchParams(window.location.search).get('id');
  var draft = null;
  var entry = { id: null, title: '', url: '', urlAlias: '', description: '', image: null, terms: [], featured: false };
  var saving = false;

  function toast(message) { if (window.Toast) window.Toast.show(message); }
  function uid() { return 'dbe_' + Math.random().toString(36).slice(2, 10); }
  function show(el) { el.hidden = false; }
  function hide(el) { el.hidden = true; }

  function renderImage() {
    if (entry.image) { imgEl.src = entry.image; show(imgPreview); hide(imgChoose); }
    else { hide(imgPreview); show(imgChoose); }
  }
  function pickImage() { imgInput.click(); }
  imgInput.addEventListener('change', function () {
    var file = imgInput.files && imgInput.files[0];
    imgInput.value = '';
    if (!file) return;
    hide(imgError);
    if (file.size > IMAGE_MAX) { imgError.textContent = 'Image must be 3 MB or smaller.'; show(imgError); return; }
    var reader = new FileReader();
    reader.onload = function () { entry.image = reader.result; renderImage(); };
    reader.onerror = function () { imgError.textContent = 'Couldn’t read that file. Try another.'; show(imgError); };
    reader.readAsDataURL(file);
  });
  imgChoose.addEventListener('click', pickImage);
  imgReplace.addEventListener('click', pickImage);
  imgRemove.addEventListener('click', function () { entry.image = null; hide(imgError); renderImage(); });

  // ---------- Categories: multi-select dropdown of every category's terms ----------
  var catTrigger = categoriesEl.querySelector('.db-multiselect__trigger');
  var catValue = categoriesEl.querySelector('.db-multiselect__value');
  var catPanel = categoriesEl.querySelector('.db-multiselect__panel');
  var catEmpty = categoriesEl.querySelector('[data-categories-empty]');

  function isSelected(catId, term) {
    return entry.terms.some(function (t) { return t.categoryId === catId && t.term === term; });
  }
  function updateCatValue() {
    var names = [];
    draft.categories.forEach(function (c) {
      c.terms.forEach(function (term) { if (isSelected(c.id, term)) names.push(term); });
    });
    catValue.textContent = names.length ? names.join(', ') : 'Select an option';
    catTrigger.classList.toggle('is-placeholder', !names.length);
  }
  function openCatPanel() {
    catPanel.hidden = false;
    catTrigger.setAttribute('aria-expanded', 'true');
    var first = catPanel.querySelector('input');
    if (first) first.focus();
  }
  function closeCatPanel(restoreFocus) {
    if (catPanel.hidden) return;
    catPanel.hidden = true;
    catTrigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) catTrigger.focus();
  }
  catTrigger.addEventListener('click', function () {
    if (catPanel.hidden) openCatPanel(); else closeCatPanel(false);
  });
  catTrigger.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' && catPanel.hidden) { e.preventDefault(); openCatPanel(); }
  });
  categoriesEl.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !catPanel.hidden) { e.preventDefault(); closeCatPanel(true); }
  });
  // Tabbing out closes; a null relatedTarget (e.g. clicking an option's label
  // text) is left to the document click handler below.
  categoriesEl.addEventListener('focusout', function (e) {
    if (e.relatedTarget && !categoriesEl.contains(e.relatedTarget)) closeCatPanel(false);
  });
  document.addEventListener('click', function (e) {
    if (!categoriesEl.contains(e.target)) closeCatPanel(false);
  });

  function renderCategories() {
    var groups = draft.categories.filter(function (c) { return c.terms.length; });
    // Drop selections whose term was renamed or removed in Settings.
    entry.terms = entry.terms.filter(function (t) {
      return groups.some(function (c) { return c.id === t.categoryId && c.terms.indexOf(t.term) !== -1; });
    });
    catTrigger.hidden = !groups.length;
    catEmpty.hidden = !!groups.length;
    catPanel.innerHTML = '';
    groups.forEach(function (cat) {
      var fs = document.createElement('fieldset');
      fs.className = 'db-multiselect__group';
      var legend = document.createElement('legend');
      legend.className = 'db-multiselect__legend';
      legend.textContent = cat.name || 'Category';
      fs.appendChild(legend);
      cat.terms.forEach(function (term) {
        var label = document.createElement('label');
        label.className = 'checkbox db-multiselect__option';
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = isSelected(cat.id, term);
        input.addEventListener('change', function () {
          if (input.checked) { if (!isSelected(cat.id, term)) entry.terms.push({ categoryId: cat.id, term: term }); }
          else entry.terms = entry.terms.filter(function (t) { return !(t.categoryId === cat.id && t.term === term); });
          updateCatValue();
        });
        var box = document.createElement('span');
        box.className = 'checkbox__box';
        box.setAttribute('aria-hidden', 'true');
        var text = document.createElement('span');
        text.className = 'checkbox__label';
        text.textContent = term;
        label.appendChild(input);
        label.appendChild(box);
        label.appendChild(text);
        fs.appendChild(label);
      });
      catPanel.appendChild(fs);
    });
    updateCatValue();
  }

  function labelFor(key) {
    var f = draft.fieldLabels.filter(function (x) { return x.key === key; })[0];
    return (f && f.label) || key;
  }

  // Field names and their order are set only on the Settings page. URL alias
  // isn't configurable and stays directly after URL.
  function applyFieldLabels() {
    var tail = categoriesEl.closest('.field');
    draft.fieldLabels.forEach(function (f) {
      var block = form.querySelector('[data-fieldblock="' + f.key + '"]');
      if (!block) return;
      block.querySelector('[data-fieldlabel]').textContent = f.label;
      form.insertBefore(block, tail);
      if (f.key === 'url') form.insertBefore(form.querySelector('[data-fieldblock="urlAlias"]'), tail);
    });
    var url = inSentence(labelFor('url'));
    form.querySelector('[data-hint="url"]').textContent = 'Enter the ' + url + ' that the ' + inSentence(labelFor('title')) + ' will link to';
    form.querySelector('[data-hint="urlAlias"]').textContent = 'Enter a shorter, user-friendly version of the ' + url + ' for easier sharing and recognition';
  }

  function markOptionalFields() {
    form.querySelectorAll('.field').forEach(function (block) {
      if (block.dataset.fieldblock === 'title') return;
      var label = block.querySelector('.field__label');
      if (label) label.textContent += ' (Optional)';
    });
  }

  // Lowercase a label for mid-sentence use, but leave acronyms like "URL" alone.
  function inSentence(label) {
    return label.length > 1 && label[1] === label[1].toLowerCase() ? label[0].toLowerCase() + label.slice(1) : label;
  }

  function populateForm() {
    form.querySelector('[data-field="title"]').value = entry.title;
    form.querySelector('[data-field="url"]').value = entry.url;
    form.querySelector('[data-field="urlAlias"]').value = entry.urlAlias;
    form.querySelector('[data-field="description"]').value = entry.description;
    form.querySelector('[data-field="featured"]').checked = entry.featured;
    renderImage();
    renderCategories();
  }

  function readForm() {
    entry.title = form.querySelector('[data-field="title"]').value.trim();
    entry.url = form.querySelector('[data-field="url"]').value.trim();
    entry.urlAlias = form.querySelector('[data-field="urlAlias"]').value.trim();
    entry.description = form.querySelector('[data-field="description"]').value.trim();
    entry.featured = form.querySelector('[data-field="featured"]').checked;
  }

  function setMode(isEdit) {
    titleEl.textContent = isEdit ? 'Edit database' : 'Create database';
    submitLabel.textContent = isEdit ? 'Save changes' : 'Create database';
  }

  submitBtn.addEventListener('click', function () {
    readForm();
    if (!entry.title) {
      form.querySelector('[data-field="title"]').focus();
      toast(labelFor('title') + ' is required.');
      return;
    }
    if (saving) return;
    saving = true;
    submitBtn.disabled = true;
    submitBtn.classList.add('is-saving');
    if (!entry.id) entry.id = uid();
    var idx = draft.entries.findIndex(function (e) { return e.id === entry.id; });
    if (idx === -1) draft.entries.push(entry);
    else draft.entries[idx] = entry;
    window.DatabasesResource.save(draft).then(function () {
      window.location.href = '../';
    }).catch(function (err) {
      saving = false;
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-saving');
      toast(err.message || 'We could not save this database. Try again.');
    });
  });

  window.DatabasesResource.load().then(function (data) {
    draft = JSON.parse(JSON.stringify(data.draft || data.defaults || DEFAULTS));
    if (!draft.configured) { window.location.replace('../settings/'); return; }
    if (editId) {
      var found = draft.entries.filter(function (e) { return e.id === editId; })[0];
      if (found) entry = JSON.parse(JSON.stringify(found));
      if (!Array.isArray(entry.terms)) entry.terms = [];
    }
    setMode(!!editId && !!entry.id);
    applyFieldLabels();
    if (data.markOptional) markOptionalFields();
    populateForm();
  });
})();
