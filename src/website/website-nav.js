// Shared Page Builder (website) side navigation. Rendered once here and
// injected into every website-layer page's <aside class="sidenav"
// data-website-nav> so the nav structure/active-state never drifts between
// pages — mirrors platform/platform-nav.js's approach for the same reason.
// Uses the canonical .nav-item / .sidenav classes from components/navigation.css.
(function () {
  var mount = document.querySelector('[data-website-nav]');
  if (!mount) return;

  var I = {
    pages: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.6 14.4 5 8 8.4 1.6 5 8 1.6Z"/><path d="m2 8 6 3.2L14 8"/><path d="m2 11 6 3.2L14 11"/></svg>',
    header: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><rect x="1.8" y="2.6" width="12.4" height="10.8" rx="1.5"/><path d="M1.8 6.2h12.4"/></svg>',
    footer: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><rect x="1.8" y="2.6" width="12.4" height="10.8" rx="1.5"/><path d="M1.8 9.8h12.4"/></svg>',
    branding: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M0 12.5C0 14.4344 1.56562 16 3.5 16H14C15.1031 16 16 15.1031 16 14V11C16 9.89688 15.1031 9 14 9H12.0594L13.6438 7.41563C14.425 6.63438 14.425 5.36875 13.6438 4.5875L11.4156 2.35313C10.6344 1.57188 9.36875 1.57188 8.5875 2.35313L7 3.94062V2C7 0.896875 6.10312 0 5 0H2C0.896875 0 0 0.896875 0 2V12.5ZM14 14.5H6.55937L10.5594 10.5H14C14.275 10.5 14.5 10.725 14.5 11V14C14.5 14.275 14.275 14.5 14 14.5ZM12.5844 6.35313L7 11.9406V6.0625L9.64688 3.41563C9.84063 3.22188 10.1594 3.22188 10.3531 3.41563L12.5844 5.64687C12.7781 5.84062 12.7781 6.15938 12.5844 6.35313ZM3.5 14.5C2.39688 14.5 1.5 13.6031 1.5 12.5V9.5H5.5V12.5C5.5 13.6031 4.60312 14.5 3.5 14.5ZM1.5 8V5.5H5.5V8H1.5ZM1.5 4V2C1.5 1.725 1.725 1.5 2 1.5H5C5.275 1.5 5.5 1.725 5.5 2V4H1.5ZM3.5 13.25C3.59849 13.25 3.69602 13.2306 3.78701 13.1929C3.87801 13.1552 3.96069 13.1 4.03033 13.0303C4.09997 12.9607 4.15522 12.878 4.19291 12.787C4.2306 12.696 4.25 12.5985 4.25 12.5C4.25 12.4015 4.2306 12.304 4.19291 12.213C4.15522 12.122 4.09997 12.0393 4.03033 11.9697C3.96069 11.9 3.87801 11.8448 3.78701 11.8071C3.69602 11.7694 3.59849 11.75 3.5 11.75C3.40151 11.75 3.30398 11.7694 3.21299 11.8071C3.12199 11.8448 3.03931 11.9 2.96967 11.9697C2.90003 12.0393 2.84478 12.122 2.80709 12.213C2.7694 12.304 2.75 12.4015 2.75 12.5C2.75 12.5985 2.7694 12.696 2.80709 12.787C2.84478 12.878 2.90003 12.9607 2.96967 13.0303C3.03931 13.1 3.12199 13.1552 3.21299 13.1929C3.30398 13.2306 3.40151 13.25 3.5 13.25Z"/></svg>',
    typography: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.2h10M8 4.2v8.6"/></svg>',
  };
  // Header is a single link to its landing panel (/website/header-menu/),
  // which lists Navigation menu / Search bar / Settings itself (Figma
  // 6993:82927) — the rail no longer expands those inline below the icon.
  // The icon still highlights as the active section on any of those pages.
  var NAV = [
    { icon: 'pages', label: 'Pages', href: '/website/pages/' },
    { icon: 'header', label: 'Header', href: '/website/header-menu/', activeGroup: [
      '/website/header-menu/', '/website/navigation/', '/website/search/', '/website/header/',
    ] },
    { icon: 'footer', label: 'Footer', href: '/website/footer/' },
    { icon: 'branding', label: 'Branding', href: '/website/branding/' },
    { icon: 'typography', label: 'Typography', href: '/website/typography/' },
  ];

  var norm = function (p) { return (p || '').replace(/index\.html$/, '').replace(/\/+$/, '') || '/'; };
  var here = norm(location.pathname);
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var active = function (href) { return norm(href) === here; };

  var html = '<ul class="sidenav__list">';
  NAV.forEach(function (item) {
    var a = active(item.href) || (item.activeGroup && item.activeGroup.some(active));
    html += '<li><a class="nav-item nav-item--interactive' + (a ? ' is-active' : '') +
      '" href="' + item.href + '"' + (a ? ' aria-current="page"' : '') + '>' +
      '<span class="nav-item__icon">' + I[item.icon] + '</span>' +
      '<span class="nav-item__label">' + esc(item.label) + '</span></a></li>';
  });
  html += '</ul>';

  var nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Page Builder');
  nav.innerHTML = html;
  mount.innerHTML = '';
  mount.appendChild(nav);

  // Picking a section collapses the rail down to icons-only, so the panel for
  // that section gets the space back — the user can still re-expand it (the
  // toggle lives in app-shell.js) for as long as they stay on that page; the
  // next section click collapses it again.
  nav.querySelectorAll('.nav-item').forEach(function (a) {
    a.addEventListener('click', function () {
      try { localStorage.setItem('pb.sidenav', 'collapsed'); } catch (e) {}
      document.documentElement.classList.add('is-nav-collapsed');
    });
  });
})();
