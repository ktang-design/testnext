// Reusable accessible modal dialog with a small form schema.
//
//   Modal.form({
//     title: 'Add page',
//     fields: [
//       { name:'pageId', label:'Page', type:'select', placeholder:'Select a published page',
//         options:[{value,label}], required:true },
//       { name:'label', label:'Label', type:'text', required:false, maxLength:120 },
//     ],
//     values: { pageId:'', label:'' },   // optional prefill (edit)
//     submitLabel: 'Add',
//     validate: (values) => 'error string' | null,   // optional cross-field check
//   })  ->  Promise<values | null>   (null when cancelled/closed)
//
// role="dialog" aria-modal, focus moves to the first field, Tab is trapped,
// Escape / overlay-click / Cancel resolve null, and focus returns to whatever
// was focused before the modal opened. Reuses the shared .modal-* styles.
(function () {
  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  let uid = 0;

  function form(config) {
    return new Promise((resolve) => {
      const previouslyFocused = document.activeElement;
      const titleId = `modal-title-${++uid}`;
      const errId = `modal-err-${uid}`;
      const values = Object.assign({}, config.values || {});

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', titleId);

      const modal = document.createElement('div');
      modal.className = 'modal';
      overlay.appendChild(modal);

      // Header
      const header = document.createElement('div');
      header.className = 'modal__header';
      header.innerHTML =
        `<h2 class="modal__title" id="${titleId}">${escapeHtml(config.title || '')}</h2>` +
        '<button type="button" class="modal__close" aria-label="Close dialog"><img src="/shared/close.svg" alt="" /></button>';
      modal.appendChild(header);

      // Form wraps the body + footer as siblings, so the spacing around the
      // actions matches the static dialogs (e.g. the unsaved-changes modal):
      //   .modal > .modal__header + form( .modal__body + .modal__footer )
      const formEl = document.createElement('form');
      formEl.noValidate = true;
      const body = document.createElement('div');
      body.className = 'modal__body';
      const controls = {};
      (config.fields || []).forEach((f) => {
        const fid = `${f.name}-${uid}`;
        const field = document.createElement('div');
        field.className = 'modal__field';
        const label = document.createElement('label');
        label.className = 'modal__label';
        label.setAttribute('for', fid);
        label.textContent = f.label;
        field.appendChild(label);

        // Optional helper text under the label (e.g. an SEO description hint).
        if (f.hint) {
          const hint = document.createElement('p');
          hint.className = 'modal__hint';
          hint.id = `${fid}-hint`;
          hint.textContent = f.hint;
          field.appendChild(hint);
        }

        let control;
        if (f.type === 'select') {
          control = document.createElement('select');
          control.className = 'modal__control';
          const ph = document.createElement('option');
          ph.value = '';
          ph.textContent = f.placeholder || 'Select…';
          ph.disabled = true;
          control.appendChild(ph);
          (f.options || []).forEach((o) => {
            const opt = document.createElement('option');
            opt.value = o.value;
            opt.textContent = o.label;
            control.appendChild(opt);
          });
          control.value = values[f.name] != null ? values[f.name] : '';
          if (!control.value) ph.selected = true;
        } else if (f.type === 'textarea') {
          control = document.createElement('textarea');
          control.className = 'modal__control modal__control--textarea';
          control.rows = f.rows || 4;
          if (f.placeholder) control.placeholder = f.placeholder;
          if (f.maxLength) control.maxLength = f.maxLength;
          control.value = values[f.name] != null ? values[f.name] : '';
        } else {
          control = document.createElement('input');
          control.className = 'modal__control';
          control.type = f.type === 'url' ? 'text' : 'text';
          if (f.type === 'url') control.inputMode = 'url';
          if (f.placeholder) control.placeholder = f.placeholder;
          if (f.maxLength) control.maxLength = f.maxLength;
          control.value = values[f.name] != null ? values[f.name] : '';
        }
        control.id = fid;
        control.name = f.name;
        if (f.required) control.setAttribute('aria-required', 'true');
        if (f.hint) control.setAttribute('aria-describedby', `${fid}-hint`);
        control.addEventListener('input', () => { values[f.name] = control.value; });
        control.addEventListener('change', () => { values[f.name] = control.value; });
        controls[f.name] = control;
        field.appendChild(control);

        // Optional live character counter (opt-in; needs a maxLength).
        if (f.showCount && f.maxLength) {
          const count = document.createElement('div');
          count.className = 'modal__count';
          const draw = () => { count.textContent = `${(control.value || '').length}/${f.maxLength}`; };
          draw();
          control.addEventListener('input', draw);
          field.appendChild(count);
        }

        body.appendChild(field);
      });

      const err = document.createElement('p');
      err.className = 'modal__error';
      err.id = errId;
      err.setAttribute('role', 'alert');
      err.hidden = true;
      body.appendChild(err);
      formEl.appendChild(body);

      // Footer (sibling of the body)
      const footer = document.createElement('div');
      footer.className = 'modal__footer';
      footer.innerHTML =
        '<button type="button" class="modal__btn modal__btn--cancel">Cancel</button>' +
        `<button type="submit" class="modal__btn modal__btn--primary">${escapeHtml(config.submitLabel || 'Add')}</button>`;
      formEl.appendChild(footer);
      modal.appendChild(formEl);

      document.body.appendChild(overlay);
      document.body.classList.add('is-locked');

      function showError(msg) {
        err.textContent = msg;
        err.hidden = false;
      }

      function done(result) {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        document.body.classList.remove('is-locked');
        if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
        resolve(result);
      }

      function submit() {
        err.hidden = true;
        (config.fields || []).forEach((f) => { values[f.name] = controls[f.name].value; });
        for (const f of config.fields || []) {
          if (f.required && !String(values[f.name] || '').trim()) {
            showError(`${f.label} is required.`);
            controls[f.name].focus();
            return;
          }
        }
        if (config.validate) {
          const msg = config.validate(values);
          if (msg) { showError(msg); return; }
        }
        done(values);
      }

      formEl.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
      header.querySelector('.modal__close').addEventListener('click', () => done(null));
      footer.querySelector('.modal__btn--cancel').addEventListener('click', () => done(null));
      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) done(null); });

      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); done(null); return; }
        if (e.key === 'Tab') {
          const f = Array.from(modal.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
          if (!f.length) return;
          const first = f[0];
          const last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      document.addEventListener('keydown', onKey, true);

      const firstField = config.fields && config.fields[0];
      if (firstField && controls[firstField.name]) controls[firstField.name].focus();
      else header.querySelector('.modal__close').focus();
    });
  }

  // Confirmation dialog -> Promise<boolean> (true = confirmed). Reuses the same
  // overlay / focus-trap / Escape scaffolding as form(). Focus starts on Cancel
  // so destructive actions aren't triggered by an accidental Enter.
  function confirm(config) {
    return new Promise((resolve) => {
      const previouslyFocused = document.activeElement;
      const titleId = `modal-title-${++uid}`;

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', titleId);

      const modal = document.createElement('div');
      modal.className = 'modal';
      overlay.appendChild(modal);

      const header = document.createElement('div');
      header.className = 'modal__header';
      header.innerHTML =
        `<h2 class="modal__title" id="${titleId}">${escapeHtml(config.title || '')}</h2>` +
        '<button type="button" class="modal__close" aria-label="Close dialog"><img src="/shared/close.svg" alt="" /></button>';
      modal.appendChild(header);

      const body = document.createElement('div');
      body.className = 'modal__body';
      const msg = document.createElement('p');
      msg.className = 'modal__text';
      msg.textContent = config.message || '';
      body.appendChild(msg);
      modal.appendChild(body);

      const footer = document.createElement('div');
      footer.className = 'modal__footer';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'modal__btn modal__btn--cancel';
      cancelBtn.textContent = config.cancelLabel || 'Cancel';
      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'modal__btn ' + (config.danger ? 'modal__btn--danger' : 'modal__btn--primary');
      okBtn.textContent = config.confirmLabel || 'Confirm';
      footer.appendChild(cancelBtn);
      footer.appendChild(okBtn);
      modal.appendChild(footer);

      document.body.appendChild(overlay);
      document.body.classList.add('is-locked');

      function done(result) {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        document.body.classList.remove('is-locked');
        if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
        resolve(result);
      }
      header.querySelector('.modal__close').addEventListener('click', () => done(false));
      cancelBtn.addEventListener('click', () => done(false));
      okBtn.addEventListener('click', () => done(true));
      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) done(false); });

      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); done(false); return; }
        if (e.key === 'Tab') {
          const f = Array.from(modal.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
          if (!f.length) return;
          const first = f[0];
          const last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      document.addEventListener('keydown', onKey, true);
      cancelBtn.focus();
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  window.Modal = { form, confirm };
})();
