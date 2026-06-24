// App shell — shared responsive chrome for the settings pages.
// Injects the hamburger (sidebar drawer) and the mobile product-nav grid
// toggle, and keeps the --topnav-h variable in sync. No-ops on pages without
// a top nav (login / signup).
(function () {
  const topnav = document.querySelector('.topnav');
  if (!topnav) return;

  const left = topnav.querySelector('.topnav__left');
  const menu = topnav.querySelector('.topnav__menu');
  const usermenu = topnav.querySelector('.usermenu');
  const sidenav = document.querySelector('.sidenav');

  // Keep the drawer/scrim offset correct under the (variable-height) top nav.
  function syncTopnavHeight() {
    document.documentElement.style.setProperty('--topnav-h', `${topnav.offsetHeight}px`);
  }

  // ---- Scrim (shared by the drawer) ----
  const scrim = document.createElement('div');
  scrim.className = 'app-scrim';
  document.body.appendChild(scrim);

  // ---- Hamburger → sidebar drawer ----
  let hamburger = null;
  if (sidenav && left) {
    hamburger = document.createElement('button');
    hamburger.type = 'button';
    hamburger.className = 'topnav__iconbtn topnav__hamburger';
    hamburger.setAttribute('aria-label', 'Toggle navigation');
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.innerHTML = '<img src="/shared/menu.svg" alt="" />';
    left.insertBefore(hamburger, left.firstChild);
    hamburger.addEventListener('click', () => (sidenav.classList.contains('is-open') ? closeDrawer() : openDrawer()));
  }

  function openDrawer() {
    if (!sidenav) return;
    sidenav.classList.add('is-open');
    scrim.classList.add('is-open');
    hamburger && (hamburger.classList.add('is-active'), hamburger.setAttribute('aria-expanded', 'true'));
    document.body.classList.add('is-locked');
  }
  function closeDrawer() {
    if (!sidenav) return;
    sidenav.classList.remove('is-open');
    scrim.classList.remove('is-open');
    hamburger && (hamburger.classList.remove('is-active'), hamburger.setAttribute('aria-expanded', 'false'));
    document.body.classList.remove('is-locked');
  }

  scrim.addEventListener('click', closeDrawer);
  // Close the drawer when a nav *link* inside it is activated (not the
  // collapse button, which is a <button>).
  sidenav && sidenav.addEventListener('click', (e) => { if (e.target.closest('a')) closeDrawer(); });

  // ---- Collapse / expand the docked panel (wide desktop, >1024px) ----
  if (sidenav) {
    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'sidenav__collapse';
    collapseBtn.innerHTML = '<img src="/shared/chevron-left.svg" alt="" />';
    sidenav.appendChild(collapseBtn);

    try {
      if (localStorage.getItem('sn.sidenav') === 'collapsed') sidenav.classList.add('sidenav--collapsed');
    } catch (_) { /* storage unavailable */ }

    const syncCollapse = () => {
      const collapsed = sidenav.classList.contains('sidenav--collapsed');
      collapseBtn.setAttribute('aria-label', collapsed ? 'Expand navigation panel' : 'Collapse navigation panel');
      collapseBtn.setAttribute('aria-expanded', String(!collapsed));
    };
    syncCollapse();

    collapseBtn.addEventListener('click', () => {
      const collapsed = sidenav.classList.toggle('sidenav--collapsed');
      try { localStorage.setItem('sn.sidenav', collapsed ? 'collapsed' : 'expanded'); } catch (_) {}
      syncCollapse();
    });
  }

  // ---- Grid icon → mobile product-nav dropdown ----
  let apps = null;
  if (menu && usermenu) {
    apps = document.createElement('button');
    apps.type = 'button';
    apps.className = 'topnav__iconbtn topnav__apps';
    apps.setAttribute('aria-label', 'Product menu');
    apps.setAttribute('aria-expanded', 'false');
    // Inline the grid glyph (instead of an <img>) so its colour follows
    // currentColor — letting the open/active state turn it blue.
    apps.innerHTML =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/>' +
      '<rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>';

    // The grid icon is the collapsed form of the left-side product nav, so it
    // lives in the left group (after the logo) — keeping the hamburger, logo
    // and grid evenly spaced rather than stranding the grid on the right.
    // Wrap the menu + grid in a relatively-positioned box so the dropdown can
    // anchor to (and right-align under) the grid icon.
    const navwrap = document.createElement('div');
    navwrap.className = 'topnav__navwrap';
    left.insertBefore(navwrap, menu);
    navwrap.appendChild(menu);
    navwrap.appendChild(apps);

    const setOpen = (open) => {
      menu.classList.toggle('is-open', open);
      apps.classList.toggle('is-active', open);
      apps.setAttribute('aria-expanded', String(open));
    };
    apps.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(!menu.classList.contains('is-open'));
    });
    document.addEventListener('click', (e) => {
      if (menu.classList.contains('is-open') && !navwrap.contains(e.target)) setOpen(false);
    });
  }

  // ---- System footer ----
  // Lives at the very bottom of the content column, below the sticky actions, and
  // is only reached by scrolling to the end (CSS makes .content the scroll area).
  // Injected here so it stays consistent across every settings/builder page.
  const content = document.querySelector('.content');
  if (content && content.querySelector('.pageactions') && !content.querySelector('.sysfooter')) {
    const LINKS = [
      ['EBSCO Connect', 'https://connect.ebsco.com'],
      ['Privacy Policy', 'https://www.ebsco.com/company/privacy-policy'],
      ['Terms of use', 'https://www.ebsco.com/terms-of-use'],
      ['Copyright', 'https://www.ebsco.com/terms-of-use'],
    ];
    const footer = document.createElement('footer');
    footer.className = 'sysfooter';
    const links = document.createElement('nav');
    links.className = 'sysfooter__links';
    links.setAttribute('aria-label', 'System');
    LINKS.forEach(([label, href]) => {
      const a = document.createElement('a');
      a.className = 'sysfooter__link';
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = label;
      links.appendChild(a);
    });
    footer.appendChild(links);
    const copy = document.createElement('p');
    copy.className = 'sysfooter__copy';
    copy.textContent = `Software © ${new Date().getFullYear()} EBSCO Industries, LLC. All rights reserved`;
    footer.appendChild(copy);
    content.appendChild(footer);
    content.classList.add('has-sysfooter');
    // Make the body a fixed viewport so .content (not the body) is the scroll
    // area — this is already true on the Website pages; it normalizes the
    // Platform pages (which otherwise grow the body) so the sticky actions stay
    // pinned and the footer is reached by scrolling to the end of the content.
    document.documentElement.classList.add('has-sysfooter');
    document.body.classList.add('has-sysfooter');
  }

  // The account / sign-out dropdown itself lives in shared/auth-client.js;
  // it toggles aria-expanded on .usermenu, which the caret CSS keys off of.

  // ---- Global key + resize handling ----
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDrawer();
      if (menu && menu.classList.contains('is-open')) {
        menu.classList.remove('is-open');
        if (apps) { apps.classList.remove('is-active'); apps.setAttribute('aria-expanded', 'false'); }
      }
    }
  });
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    syncTopnavHeight();
    // Leaving mobile/tablet: reset any open drawer/menu state.
    if (window.innerWidth > 899 && lastW <= 899) closeDrawer();
    if (window.innerWidth > 599 && menu) {
      menu.classList.remove('is-open');
      if (apps) { apps.classList.remove('is-active'); apps.setAttribute('aria-expanded', 'false'); }
    }
    lastW = window.innerWidth;
  });

  syncTopnavHeight();
  window.addEventListener('load', syncTopnavHeight);

  // Expose a tiny API (used by the unsaved-changes nav guard).
  window.AppShell = { closeDrawer };
})();
