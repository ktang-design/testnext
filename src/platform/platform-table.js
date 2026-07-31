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

  var state = { q: '', page: 1, pageSize: 10, total: 0 };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso); if (isNaN(d.getTime())) return '—';
    var day = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    var t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return day + ' at ' + t;
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
  if (cfg.showFilter) {
    var fb = document.createElement('button'); fb.type = 'button'; fb.className = 'icon-btn icon-btn--square';
    fb.setAttribute('aria-label', 'Filters'); fb.innerHTML = ICON_FILTER;
    fb.addEventListener('click', function () { search.focus(); });
    toolbar.appendChild(fb);
  }
  if (cfg.exportPath) {
    var ex = document.createElement('button'); ex.type = 'button'; ex.className = 'icon-btn';
    ex.innerHTML = ICON_EXPORT + '<span>Export</span>';
    ex.addEventListener('click', function () { window.location.href = cfg.exportPath + '?q=' + encodeURIComponent(state.q); });
    toolbar.appendChild(ex);
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

  function renderPager() {
    var pages = Math.max(1, Math.ceil(state.total / state.pageSize));
    var html = '<button class="pager__btn" data-p="prev" aria-label="Previous page"' + (state.page <= 1 ? ' disabled' : '') + '>‹</button>';
    for (var i = 1; i <= pages && i <= 10; i++) {
      html += '<button class="pager__btn" data-p="' + i + '"' + (i === state.page ? ' aria-current="page"' : '') + '>' + i + '</button>';
    }
    html += '<button class="pager__btn" data-p="next" aria-label="Next page"' + (state.page >= pages ? ' disabled' : '') + '>›</button>';
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
  load();
})();
