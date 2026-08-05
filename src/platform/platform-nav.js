// Shared Platform (settings) side navigation. Rendered once here and injected
// into every Platform page's <aside class="sidenav" data-platform-nav> so the
// nav structure/active-state never drifts between pages. Uses the canonical
// .nav-item / .sidenav classes from components/navigation.css (which already
// supports collapsible groups: .nav-item__chevron, .is-open, .nav-item--secondary,
// .sidenav__subitem[hidden]).
(function () {
  var mount = document.querySelector('[data-platform-nav]');
  if (!mount) return;

  var I = {
    site: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><rect x="1.8" y="2.6" width="12.4" height="10.8" rx="1.5"/><path d="M6.2 2.9v10.2"/></svg>',
    branding: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M0 12.5C0 14.4344 1.56562 16 3.5 16H14C15.1031 16 16 15.1031 16 14V11C16 9.89688 15.1031 9 14 9H12.0594L13.6438 7.41563C14.425 6.63438 14.425 5.36875 13.6438 4.5875L11.4156 2.35313C10.6344 1.57188 9.36875 1.57188 8.5875 2.35313L7 3.94062V2C7 0.896875 6.10312 0 5 0H2C0.896875 0 0 0.896875 0 2V12.5ZM14 14.5H6.55937L10.5594 10.5H14C14.275 10.5 14.5 10.725 14.5 11V14C14.5 14.275 14.275 14.5 14 14.5ZM12.5844 6.35313L7 11.9406V6.0625L9.64688 3.41563C9.84063 3.22188 10.1594 3.22188 10.3531 3.41563L12.5844 5.64687C12.7781 5.84062 12.7781 6.15938 12.5844 6.35313ZM3.5 14.5C2.39688 14.5 1.5 13.6031 1.5 12.5V9.5H5.5V12.5C5.5 13.6031 4.60312 14.5 3.5 14.5ZM1.5 8V5.5H5.5V8H1.5ZM1.5 4V2C1.5 1.725 1.725 1.5 2 1.5H5C5.275 1.5 5.5 1.725 5.5 2V4H1.5ZM3.5 13.25C3.59849 13.25 3.69602 13.2306 3.78701 13.1929C3.87801 13.1552 3.96069 13.1 4.03033 13.0303C4.09997 12.9607 4.15522 12.878 4.19291 12.787C4.2306 12.696 4.25 12.5985 4.25 12.5C4.25 12.4015 4.2306 12.304 4.19291 12.213C4.15522 12.122 4.09997 12.0393 4.03033 11.9697C3.96069 11.9 3.87801 11.8448 3.78701 11.8071C3.69602 11.7694 3.59849 11.75 3.5 11.75C3.40151 11.75 3.30398 11.7694 3.21299 11.8071C3.12199 11.8448 3.03931 11.9 2.96967 11.9697C2.90003 12.0393 2.84478 12.122 2.80709 12.213C2.7694 12.304 2.75 12.4015 2.75 12.5C2.75 12.5985 2.7694 12.696 2.80709 12.787C2.84478 12.878 2.90003 12.9607 2.96967 13.0303C3.03931 13.1 3.12199 13.1552 3.21299 13.1929C3.30398 13.2306 3.40151 13.25 3.5 13.25Z"/></svg>',
    globe: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M1.8 8h12.4"/><ellipse cx="8" cy="8" rx="3" ry="6.2"/></svg>',
    mail: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><rect x="1.8" y="3.4" width="12.4" height="9.2" rx="1.5"/><path d="m2.6 4.6 5.4 3.9 5.4-3.9"/></svg>',
    shield: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.6 13.4 3.4v4.2c0 3.4-2.3 5.9-5.4 6.8-3.1-.9-5.4-3.4-5.4-6.8V3.4L8 1.6Z"/><path d="m5.7 8 1.6 1.6 3.1-3.2"/></svg>',
    users: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><circle cx="8" cy="6.3" r="2.1"/><path d="M4.1 12.7a4 4 0 0 1 7.8 0"/></svg>',
    plug: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2.2v3.2M10 2.2v3.2M4.4 5.4h7.2v2a3.6 3.6 0 0 1-7.2 0v-2ZM8 11v2.8"/></svg>',
    history: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.7 8a5.3 5.3 0 1 1 1.7 3.9"/><path d="M2.4 12.2V9h3.2"/><path d="M8 5.2V8l1.9 1.3"/></svg>',
  };
  var CHEVRON =
    '<svg class="chevron--down" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>' +
    '<svg class="chevron--up" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 10 4-4 4 4"/></svg>';

  var NAV = [
    { icon: 'site', label: 'Site details', href: '/site-details/' },
    { icon: 'branding', label: 'Branding', href: '/branding/' },
    { icon: 'globe', label: 'Language and region', href: '/language-region/' },
    { icon: 'shield', label: 'Access', href: '/access/' },
    { icon: 'users', label: 'Users and permissions', children: [
      { label: 'Administrators', href: '/administrators/' },
      { label: 'Users', href: '/users/' },
    ] },
    { icon: 'plug', label: 'Integrations', children: [
      { label: 'EBSCO Discovery Service', href: '/eds/' },
      { label: 'Analytics', href: '/analytics/' },
    ] },
    { icon: 'history', label: 'Activity log', href: '/activity-log/' },
  ];

  var norm = function (p) { return (p || '').replace(/index\.html$/, '').replace(/\/+$/, '') || '/'; };
  var here = norm(location.pathname);
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var active = function (href) { return norm(href) === here; };
  var slugify = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };

  // Persisted group open/closed state: once the user opens (or closes) a group
  // it stays that way across page loads until they change it. Default (untouched)
  // is open only for the group containing the current page.
  var GROUPS_KEY = 'platform-nav-groups';
  var savedGroups = {};
  try { savedGroups = JSON.parse(localStorage.getItem(GROUPS_KEY) || '{}') || {}; } catch (e) {}

  var html = '<ul class="sidenav__list">';
  NAV.forEach(function (item, i) {
    if (item.children) {
      var gid = 'grp' + i;
      var slug = slugify(item.label);
      // Open if the user has a saved preference; otherwise default to open only
      // when this group holds the current page. is-active-parent marks the group
      // that contains the active page (used by the collapsed icon rail).
      var containsActive = item.children.some(function (c) { return active(c.href); });
      var open = Object.prototype.hasOwnProperty.call(savedGroups, slug) ? !!savedGroups[slug] : containsActive;
      html += '<li><button type="button" class="nav-item nav-item--interactive' + (open ? ' is-open' : '') + (containsActive ? ' is-active-parent' : '') +
        '" data-nav-group="' + gid + '" data-group-slug="' + slug + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
        '<span class="nav-item__icon">' + I[item.icon] + '</span>' +
        '<span class="nav-item__label">' + esc(item.label) + '</span>' +
        '<span class="nav-item__chevron">' + CHEVRON + '</span></button></li>';
      item.children.forEach(function (c) {
        var a = active(c.href);
        html += '<li><a class="nav-item nav-item--interactive nav-item--secondary sidenav__subitem' + (a ? ' is-active' : '') +
          '" data-group="' + gid + '" href="' + c.href + '"' + (a ? ' aria-current="page"' : '') +
          (open ? '' : ' hidden') + '><span class="nav-item__label">' + esc(c.label) + '</span></a></li>';
      });
    } else {
      var a2 = active(item.href);
      html += '<li><a class="nav-item nav-item--interactive' + (a2 ? ' is-active' : '') +
        '" href="' + item.href + '"' + (a2 ? ' aria-current="page"' : '') + '>' +
        '<span class="nav-item__icon">' + I[item.icon] + '</span>' +
        '<span class="nav-item__label">' + esc(item.label) + '</span></a></li>';
    }
  });
  html += '</ul>';

  var nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Platform settings');
  nav.innerHTML = html;
  mount.innerHTML = '';
  mount.appendChild(nav);

  // Collapsible groups.
  mount.querySelectorAll('[data-nav-group]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      // Collapsed icon rail: there's no room to expand a dropdown, so clicking a
      // group icon navigates to its first child (e.g. Users and permissions ->
      // Administrators, Integrations -> EBSCO Discovery Service). When expanded,
      // fall through to the normal expand/collapse toggle below.
      if (document.documentElement.classList.contains('is-nav-collapsed')) {
        var first = mount.querySelector('.sidenav__subitem[data-group="' + btn.getAttribute('data-nav-group') + '"]');
        var href = first && first.getAttribute('href');
        if (href) { window.location.href = href; return; }
      }
      var open = btn.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      savedGroups[btn.getAttribute('data-group-slug')] = open; // persist until changed
      try { localStorage.setItem(GROUPS_KEY, JSON.stringify(savedGroups)); } catch (e) {}
      mount.querySelectorAll('.sidenav__subitem[data-group="' + btn.getAttribute('data-nav-group') + '"]')
        .forEach(function (s) { s.hidden = !open; });
    });
  });
})();
