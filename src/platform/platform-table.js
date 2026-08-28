// Generic paginated data-table for the Platform list pages (Users,
// Administrators, Activity log). Each page sets window.PLATFORM_TABLE = {
//   endpoint, searchPlaceholder, exportPath?, showFilter?, columns:[{label,width}],
//   getRows(data)->[], rowHtml(row)->'<tr>…', afterRender?(tbody,rows)
// } before this script runs. Renders search + optional Export + table + pager
// into [data-table-page], fetches endpoint?page=&q=, and wires search/paging.
(function () {
  var cfg = window.PLATFORM_TABLE;
  var root = document.querySelector('[data-table-page]');
  if (!cfg || !root) return;

  var ICON_EXPORT = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 10.5V2.5"/><path d="m5 5.5 3-3 3 3"/><path d="M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2"/></svg>';
  var ICON_FILTER = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2 4.5h12M4.5 8h7M6.5 11.5h3"/></svg>';
  var chevron = function (dir) {
    var d = dir === 'prev' ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5';
    return '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
  };

  var state = { q: '', page: 1, pageSize: 10, total: 0 };
  // Regional display prefs from Language & region — applied to every date/time
  // shown on the Platform pages so they stay in sync with that setting.
  var prefs = { timeFormat: '12h', timezone: null };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso); if (isNaN(d.getTime())) return '—';
    var dOpts = { month: 'long', day: 'numeric', year: 'numeric' };
    var tOpts = { hour: 'numeric', minute: '2-digit', hour12: prefs.timeFormat !== '24h' };
    if (prefs.timezone) { dOpts.timeZone = prefs.timezone; tOpts.timeZone = prefs.timezone; }
    try {
      return d.toLocaleDateString('en-US', dOpts) + ' at ' + d.toLocaleTimeString('en-US', tOpts);
    } catch (e) { // invalid timezone — fall back to local
      return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) +
        ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: prefs.timeFormat !== '24h' });
    }
  }
  function statusPill(s) {
    var map = { active: 'Active', pending: 'Pending', inactive: 'Inactive' };
    return '<span class="status status--' + esc(s) + '"><span class="status__dot"></span>' + (map[s] || esc(s) || '—') + '</span>';
  }

  var panel = document.createElement('div'); panel.className = 'panel';
  var toolbar = document.createElement('div'); toolbar.className = 'panel__toolbar';
  var search = document.createElement('input');
  search.className = 'panel__search'; search.type = 'search';
  search.placeholder = cfg.searchPlaceholder || 'Search';
  search.setAttribute('aria-label', cfg.searchPlaceholder || 'Search');
  toolbar.appendChild(search);
  // Filter + Export live in their own group so they stay 8px apart while the
  // toolbar keeps a 24px gap after the search box.
  if (cfg.showFilter || cfg.exportPath) {
    var actions = document.createElement('div'); actions.className = 'panel__actions';
    if (cfg.showFilter) {
      var fb = document.createElement('button'); fb.type = 'button'; fb.className = 'icon-btn icon-btn--square';
      fb.setAttribute('aria-label', 'Filters'); fb.innerHTML = ICON_FILTER;
      fb.addEventListener('click', function () { search.focus(); });
      actions.appendChild(fb);
    }
    if (cfg.exportPath) {
      var ex = document.createElement('button'); ex.type = 'button'; ex.className = 'icon-btn';
      ex.innerHTML = ICON_EXPORT + '<span>Export</span>';
      ex.addEventListener('click', function () { window.location.href = cfg.exportPath + '?q=' + encodeURIComponent(state.q); });
      actions.appendChild(ex);
    }
    toolbar.appendChild(actions);
  }
  panel.appendChild(toolbar);

  var wrap = document.createElement('div'); wrap.style.overflowX = 'auto';
  var table = document.createElement('table'); table.className = 'dtable';
  table.innerHTML = '<thead><tr>' + cfg.columns.map(function (c) {
    return '<th' + (c.width ? ' style="width:' + c.width + '"' : '') + '>' + esc(c.label) + '</th>';
  }).join('') + '</tr></thead><tbody></tbody>';
  wrap.appendChild(table); panel.appendChild(wrap);
  var tbody = table.querySelector('tbody');
  root.appendChild(panel);
  var pager = document.createElement('div'); pager.className = 'pager'; root.appendChild(pager);

  // Helpers exposed for page-specific code (row rendering, reload after edits).
  window.PlatformTable = { esc: esc, fmtDate: fmtDate, statusPill: statusPill, reload: load };

  // Skeleton rows shown while data loads (initial paint + every fetch).
  function renderSkeleton() {
    var n = 5;
    var cells = cfg.columns.map(function () { return '<td><span class="skeleton"></span></td>'; }).join('');
    var html = '';
    for (var i = 0; i < n; i++) html += '<tr class="dtable__skeleton" aria-hidden="true">' + cells + '</tr>';
    tbody.innerHTML = html;
  }
  renderSkeleton();

  function renderPager() {
    var pages = Math.max(1, Math.ceil(state.total / state.pageSize));
    var html = '<button class="pager__btn" data-p="prev" aria-label="Previous page"' + (state.page <= 1 ? ' disabled' : '') + '>' + chevron('prev') + '</button>';
    for (var i = 1; i <= pages && i <= 10; i++) {
      html += '<button class="pager__btn" data-p="' + i + '"' + (i === state.page ? ' aria-current="page"' : '') + '>' + i + '</button>';
    }
    html += '<button class="pager__btn" data-p="next" aria-label="Next page"' + (state.page >= pages ? ' disabled' : '') + '>' + chevron('next') + '</button>';
    pager.innerHTML = html;
    pager.querySelectorAll('.pager__btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = b.getAttribute('data-p');
        if (p === 'prev') state.page = Math.max(1, state.page - 1);
        else if (p === 'next') state.page += 1;
        else state.page = parseInt(p, 10);
        load();
      });
    });
  }
  function render(data) {
    state.total = data.total || 0; state.page = data.page || 1; state.pageSize = data.pageSize || 10;
    var rows = cfg.getRows(data) || [];
    tbody.innerHTML = rows.length
      ? rows.map(cfg.rowHtml).join('')
      : '<tr><td class="dtable__empty" colspan="' + cfg.columns.length + '">No results found.</td></tr>';
    if (cfg.afterRender) cfg.afterRender(tbody, rows);
    renderPager();
  }
  function load() {
    renderSkeleton();
    fetch(cfg.endpoint + '?page=' + state.page + '&q=' + encodeURIComponent(state.q), { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(render)
      .catch(function () { tbody.innerHTML = '<tr><td class="dtable__empty" colspan="' + cfg.columns.length + '">Couldn’t load data.</td></tr>'; });
  }
  var deb;
  search.addEventListener('input', function () {
    clearTimeout(deb);
    deb = setTimeout(function () { state.q = search.value; state.page = 1; load(); }, 300);
  });

  // Load the shared date/time display prefs first, then the table (so the very
  // first render already formats times per the Language & region setting).
  fetch('/api/platform/language-region', { credentials: 'include' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      var v = data && (data.saved || data.defaults);
      if (v) { prefs.timeFormat = v.timeFormat || '12h'; prefs.timezone = v.timezone || null; }
    })
    .catch(function () {})
    .then(load, load);
})();
