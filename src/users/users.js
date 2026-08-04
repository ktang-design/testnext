// Users page: table config for platform-table.js (loaded after this) plus the
// Create-user modal and the per-row status kebab menu.
(function () {
  var KEBAB = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="3" r="1.35"/><circle cx="8" cy="8" r="1.35"/><circle cx="8" cy="13" r="1.35"/></svg>';

  window.PLATFORM_TABLE = {
    endpoint: '/api/platform/users',
    exportPath: '/api/platform/users/export',
    searchPlaceholder: 'Search users by username or email',
    columns: [{ label: 'User' }, { label: 'Account created' }, { label: 'Last accessed' }, { label: 'Status' }, { label: '', width: '52px' }],
    getRows: function (d) { return d.users; },
    rowHtml: function (u) {
      var T = window.PlatformTable;
      return '<tr>' +
        '<td>' + T.esc(u.name || u.email) + '</td>' +
        '<td>' + T.fmtDate(u.createdAt) + '</td>' +
        '<td>' + T.fmtDate(u.lastAccessedAt) + '</td>' +
        '<td>' + T.statusPill(u.status) + '</td>' +
        '<td style="text-align:right"><button class="row-kebab" type="button" data-id="' + T.esc(u.id) + '" data-status="' + T.esc(u.status) + '" aria-label="Actions">' + KEBAB + '</button></td>' +
        '</tr>';
    },
    afterRender: function (tbody) { tbody.querySelectorAll('.row-kebab').forEach(function (b) { b.addEventListener('click', onKebab); }); },
  };

  // ---- Row status menu ----
  var menu = null;
  function closeMenu() { if (menu) { menu.remove(); menu = null; document.removeEventListener('click', onDoc, true); } }
  function onDoc(e) { if (menu && !menu.contains(e.target)) closeMenu(); }
  function onKebab(e) {
    e.stopPropagation();
    var btn = e.currentTarget;
    if (menu) { closeMenu(); return; }
    var id = btn.getAttribute('data-id'), status = btn.getAttribute('data-status');
    var opts = [['active', 'Set active'], ['pending', 'Set pending'], ['inactive', 'Set inactive']].filter(function (o) { return o[0] !== status; });
    menu = document.createElement('div');
    menu.className = 'rowmenu';
    menu.innerHTML = opts.map(function (o) { return '<button type="button" data-s="' + o[0] + '">' + o[1] + '</button>'; }).join('');
    document.body.appendChild(menu);
    var r = btn.getBoundingClientRect();
    menu.style.top = (window.scrollY + r.bottom + 4) + 'px';
    menu.style.left = (window.scrollX + r.right - menu.offsetWidth) + 'px';
    menu.querySelectorAll('button').forEach(function (mb) {
      mb.addEventListener('click', function () { setStatus(id, mb.getAttribute('data-s')); closeMenu(); });
    });
    setTimeout(function () { document.addEventListener('click', onDoc, true); }, 0);
  }
  function setStatus(id, status) {
    fetch('/api/platform/users/' + encodeURIComponent(id), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ status: status }),
    }).then(function (r) { if (r.ok && window.PlatformTable) window.PlatformTable.reload(); });
  }

  // ---- Create user modal ----
  var modal = document.querySelector('[data-modal="create-user"]');
  var openBtn = document.querySelector('[data-open-create-user]');
  if (modal && openBtn) {
    var form = modal.querySelector('[data-create-user-form]');
    var errEl = modal.querySelector('[data-create-user-error]');
    var submitBtn = modal.querySelector('[data-create-user-submit]');
    var val = function (sel) { var el = modal.querySelector(sel); return el ? el.value : ''; };
    var open = function () { modal.hidden = false; document.body.classList.add('is-locked'); errEl.hidden = true; form.reset(); var n = modal.querySelector('#cu-name'); if (n) n.focus(); };
    var close = function () { modal.hidden = true; document.body.classList.remove('is-locked'); };
    var showErr = function (m) { errEl.querySelector('.field__error-text').textContent = m; errEl.hidden = false; };
    openBtn.addEventListener('click', open);
    modal.querySelectorAll('[data-modal-close]').forEach(function (b) { b.addEventListener('click', close); });
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) close(); });
    var doSubmit = function (e) {
      if (e) e.preventDefault();
      var body = { name: val('#cu-name').trim(), email: val('#cu-email').trim(), password: val('#cu-password'), role: val('#cu-role') };
      submitBtn.disabled = true;
      fetch('/api/platform/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
        .then(async function (r) {
          if (r.ok) { close(); if (window.PlatformTable) window.PlatformTable.reload(); return; }
          var m = 'Couldn’t create user.'; try { var d = await r.json(); if (d.message) m = d.message; } catch (_) {}
          showErr(m);
        })
        .catch(function () { showErr('Network error. Try again.'); })
        .finally(function () { submitBtn.disabled = false; });
    };
    form.addEventListener('submit', doSubmit);
    submitBtn.addEventListener('click', doSubmit);
  }
})();
