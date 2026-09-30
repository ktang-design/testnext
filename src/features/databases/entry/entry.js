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
  var crumbEl = document.querySelector('[data-crumb-current]');
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
  var entry = { id: null, title: '', url: '', urlAlias: '', description: '', image: null, categoryIds: [], featured: false };
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

  function renderCategories() {
    categoriesEl.innerHTML = '';
    if (!draft.categories.length) {
      var p = document.createElement('p');
      p.className = 'field__hint';
      p.textContent = 'No categories yet — add some from Databases > Settings.';
      categoriesEl.appendChild(p);
      return;
    }
    draft.categories.forEach(function (cat) {
      var label = document.createElement('label');
      label.className = 'checkbox';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = entry.categoryIds.indexOf(cat.id) !== -1;
      input.addEventListener('change', function () {
        if (input.checked) { if (entry.categoryIds.indexOf(cat.id) === -1) entry.categoryIds.push(cat.id); }
        else entry.categoryIds = entry.categoryIds.filter(function (id) { return id !== cat.id; });
      });
      var box = document.createElement('span');
      box.className = 'checkbox__box';
      box.setAttribute('aria-hidden', 'true');
      var text = document.createElement('span');
      text.className = 'checkbox__label';
      text.textContent = cat.name || 'Category';
      label.appendChild(input);
      label.appendChild(box);
      label.appendChild(text);
      categoriesEl.appendChild(label);
    });
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
    crumbEl.textContent = isEdit ? 'Edit database' : 'Create database';
    submitLabel.textContent = isEdit ? 'Save changes' : 'Create database';
  }

  submitBtn.addEventListener('click', function () {
    readForm();
    if (!entry.title) {
      form.querySelector('[data-field="title"]').focus();
      toast('Title is required.');
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
    }
    setMode(!!editId && !!entry.id);
    populateForm();
  });
})();
