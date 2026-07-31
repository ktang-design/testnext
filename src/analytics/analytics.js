// Analytics (Platform > Integrations) — the "Search integration" toggle. This
// is independent of the GA4 Save button: flipping it persists immediately to
// the Features > Bento record's integrationConfigured flag (blocks untouched,
// the API merges), which gates the Bento builder.
(function () {
  var cb = document.querySelector('[data-bento-integration]');
  if (!cb) return;
  var statusEl = document.querySelector('[data-bento-integration-status]');
  var ENDPOINT = '/api/features/bento';

  function status(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.classList.toggle('save-status--error', !!isError);
    statusEl.hidden = !msg;
  }

  fetch(ENDPOINT, { credentials: 'include' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var v = d && (d.saved || d.defaults);
      cb.checked = !!(v && v.integrationConfigured);
    })
    .catch(function () {});

  cb.addEventListener('change', function () {
    cb.disabled = true;
    status('Saving…');
    fetch(ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ integrationConfigured: cb.checked }),
    })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function () { status(cb.checked ? 'Search integration enabled.' : 'Search integration disabled.'); })
      .catch(function () { cb.checked = !cb.checked; status('Couldn’t update. Try again.', true); })
      .then(function () { cb.disabled = false; });
  });
})();
