// App shell — shared responsive chrome for the settings pages.
// Injects the hamburger (sidebar drawer) and the mobile product-nav grid
// toggle, and keeps the --topnav-h variable in sync. No-ops on pages without
// a top nav (login / signup).
(function () {
  // ---- Shared toast (top-right of the viewport) --------------------------
  // window.Toast.show(message) drops a dismissible confirmation toast in the
  // top-right, used by every save/interaction flow instead of inline "Saved!".
  // Multiple toasts stack like Sonner: newest in front, older ones peeking
  // behind (scaled + offset); hovering the stack fans them out. Toasts persist
  // until the user clicks the X or navigates away (no auto-timeout).
  const INFO_SVG = '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="8.25" fill="#fff"/><path d="M10 9v4.2" stroke="#3d3f42" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="6.4" r="1.05" fill="#3d3f42"/></svg>';
  const X_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg>';
  const PEEK = 14;   // collapsed vertical offset per toast behind the front
  const GAP = 14;    // expanded gap between toasts
  const MAX_STACK = 3; // toasts visible in the collapsed stack

  const toasts = []; // active toast elements, index 0 = front (newest)
  let toastExpanded = false;

  function toastRegion() {
    let r = document.querySelector('.toast-region');
    if (!r) {
      r = document.createElement('div');
      r.className = 'toast-region';
      r.setAttribute('role', 'region');
      r.setAttribute('aria-label', 'Notifications');
      r.addEventListener('mouseenter', () => { toastExpanded = true; layoutToasts(); });
      r.addEventListener('mouseleave', () => { toastExpanded = false; layoutToasts(); });
      document.body.appendChild(r);
    }
    return r;
  }

  function layoutToasts() {
    const region = toastRegion();
    const n = toasts.length;
    region.style.pointerEvents = n ? 'auto' : 'none';
    let regionH = 0;
    if (toastExpanded) {
      // Fan out: each toast at its own row, full size.
      let y = 0;
      toasts.forEach((el, i) => {
        el.style.transform = 'translateY(' + y + 'px) scale(1)';
        el.style.opacity = '1';
        el.style.zIndex = String(1000 - i);
        el.style.pointerEvents = 'auto';
        y += el.offsetHeight + GAP;
      });
      regionH = Math.max(0, y - GAP);
    } else {
      // Collapsed: front fully visible, the rest peek behind it (offset + scaled).
      const frontH = toasts[0] ? toasts[0].offsetHeight : 0;
      toasts.forEach((el, i) => {
        const scale = Math.max(1 - i * 0.06, 0.85);
        el.style.transform = 'translateY(' + (i * PEEK) + 'px) scale(' + scale + ')';
        el.style.opacity = i < MAX_STACK ? '1' : '0';
        el.style.zIndex = String(1000 - i);
        el.style.pointerEvents = i === 0 ? 'auto' : 'none';
      });
      regionH = frontH + Math.min(n - 1, MAX_STACK - 1) * PEEK;
    }
    region.style.height = regionH + 'px';
  }

  window.Toast = {
    show(message) {
      const region = toastRegion();
      const el = document.createElement('div');
      el.className = 'toast';
      el.setAttribute('role', 'status');
      el.innerHTML =
        '<span class="toast__icon">' + INFO_SVG + '</span>' +
        '<span class="toast__msg"></span>' +
        '<button type="button" class="toast__close" aria-label="Dismiss">' + X_SVG + '</button>';
      el.querySelector('.toast__msg').textContent = message;
      // Start slightly above + transparent, then settle into the stack.
      el.style.transform = 'translateY(-12px) scale(1)';
      el.style.opacity = '0';
      region.appendChild(el);
      toasts.unshift(el); // newest becomes the front of the stack
      requestAnimationFrame(layoutToasts);

      const dismiss = () => {
        const i = toasts.indexOf(el);
        if (i === -1) return;
        toasts.splice(i, 1);
        el.style.opacity = '0';
        el.style.transform = el.style.transform.replace(/scale\([^)]*\)/, 'scale(0.9)');
        setTimeout(() => el.remove(), 250);
        layoutToasts();
      };
      el.querySelector('.toast__close').addEventListener('click', dismiss);
      return el;
    },
  };

  const topnav = document.querySelector('.topnav');
  if (!topnav) return;

  const left = topnav.querySelector('.topnav__left');
  const menu = topnav.querySelector('.topnav__menu');
  const usermenu = topnav.querySelector('.usermenu');
  const sidenav = document.querySelector('.sidenav');

  // Keep the drawer/scrim offset correct under the (variable-height) top nav and
  // the persistent system message above it (both can wrap on narrow screens).
  const sysmsg = document.querySelector('.sysmsg');
  function syncTopnavHeight() {
    document.documentElement.style.setProperty('--topnav-h', `${topnav.offsetHeight}px`);
    document.documentElement.style.setProperty('--sysmsg-h', `${sysmsg ? sysmsg.offsetHeight : 0}px`);
  }

  // ---- Scrim (shared by the drawer) ----
  const scrim = document.createElement('div');
  scrim.className = 'app-scrim';
  document.body.appendChild(scrim);

  // ---- Unified mobile navigation drawer ----
  // On small screens the product pills + the section sidenav are replaced by a
  // single hamburger drawer: each product (Platform / Website / Features) is an
  // accordion; the current product is expanded and shows its section nav
  // (cloned from the page's .sidenav), the others link to their landing page.
  const mobilenav = buildMobileNav();
  const drawerEl = mobilenav || sidenav; // fall back to the sidenav if no pills

  // ---- Hamburger → drawer ----
  let hamburger = null;
  if (drawerEl && left) {
    hamburger = document.createElement('button');
    hamburger.type = 'button';
    hamburger.className = 'topnav__iconbtn topnav__hamburger';
    hamburger.setAttribute('aria-label', 'Toggle navigation');
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.innerHTML = '<img src="/shared/menu.svg" alt="" />';
    left.insertBefore(hamburger, left.firstChild);
    hamburger.addEventListener('click', () => (drawerEl.classList.contains('is-open') ? closeDrawer() : openDrawer()));
  }

  function openDrawer() {
    if (!drawerEl) return;
    drawerEl.classList.add('is-open');
    scrim.classList.add('is-open');
    hamburger && (hamburger.classList.add('is-active'), hamburger.setAttribute('aria-expanded', 'true'));
    document.body.classList.add('is-locked');
  }
  function closeDrawer() {
    if (!drawerEl) return;
    drawerEl.classList.remove('is-open');
    scrim.classList.remove('is-open');
    hamburger && (hamburger.classList.remove('is-active'), hamburger.setAttribute('aria-expanded', 'false'));
    document.body.classList.remove('is-locked');
  }

  scrim.addEventListener('click', closeDrawer);
  // Close the drawer when a nav *link* inside it is activated.
  drawerEl && drawerEl.addEventListener('click', (e) => { if (e.target.closest('a')) closeDrawer(); });

  // Builds the mobile drawer from the product pills + the page's section nav.
  function buildMobileNav() {
    if (!menu) return null;
    const pills = Array.from(menu.querySelectorAll('.navpill'));
    if (!pills.length) return null;
    const CHEV =
      '<svg class="chevron--down" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>' +
      '<svg class="chevron--up" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 10 4-4 4 4"/></svg>';
    const KEYS = ['website', 'features', 'platform'];
    const keyOf = (pill) => {
      const ic = pill.querySelector('.navpill__icon');
      return (ic && KEYS.find((k) => ic.classList.contains('navpill__icon--' + k))) || '';
    };
    const byKey = {};
    pills.forEach((pill) => { const k = keyOf(pill); if (k) byKey[k] = pill; });

    const nav = document.createElement('nav');
    nav.className = 'mobilenav';
    nav.setAttribute('aria-label', 'Menu');
    const ul = document.createElement('ul');
    ul.className = 'mobilenav__list';
    nav.appendChild(ul);

    // Fixed order matching the design: Platform, Website, Features.
    ['platform', 'website', 'features'].forEach((key) => {
      const pill = byKey[key];
      if (!pill) return;
      const labelEl = pill.querySelector('.navpill__label');
      const label = labelEl ? labelEl.textContent : key;
      const active = pill.classList.contains('navpill--active');
      const href = pill.getAttribute('href') || '#';
      const icon = '<span class="navpill__icon navpill__icon--' + key + '" aria-hidden="true"></span>';
      const inner = icon + '<span class="mobilenav__label">' + label + '</span><span class="mobilenav__chevron">' + CHEV + '</span>';
      const li = document.createElement('li');
      li.className = 'mobilenav__group';

      if (active && sidenav) {
        // Current product: expandable header + its section nav (cloned).
        const header = document.createElement('button');
        header.type = 'button';
        header.className = 'mobilenav__product is-active is-open';
        header.setAttribute('aria-expanded', 'true');
        header.innerHTML = inner;
        const panel = document.createElement('div');
        panel.className = 'mobilenav__panel';
        const list = sidenav.querySelector('.sidenav__list');
        if (list) panel.appendChild(list.cloneNode(true));
        header.addEventListener('click', () => {
          const open = header.classList.toggle('is-open');
          header.setAttribute('aria-expanded', open ? 'true' : 'false');
          panel.hidden = !open;
        });
        // Re-wire the cloned collapsible groups (Users and permissions, Integrations).
        panel.querySelectorAll('[data-nav-group]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const open = btn.classList.toggle('is-open');
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            panel.querySelectorAll('.sidenav__subitem[data-group="' + btn.getAttribute('data-nav-group') + '"]')
              .forEach((s) => { s.hidden = !open; });
          });
        });
        li.appendChild(header);
        li.appendChild(panel);
      } else {
        // Other products: a link to that product's landing page.
        const header = document.createElement('a');
        header.className = 'mobilenav__product';
        header.href = href;
        header.innerHTML = inner;
        li.appendChild(header);
      }
      ul.appendChild(li);
    });
    document.body.appendChild(nav);
    return nav;
  }

  // ---- Collapse / expand the docked panel (wide desktop, >1024px) ----
  if (sidenav) {
    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'sidenav__collapse';
    collapseBtn.innerHTML = '<img src="/shared/chevron-left.svg" alt="" />';
    sidenav.appendChild(collapseBtn);

    // When collapsed the labels are hidden, so expose each item's destination
    // as a hover/focus tooltip (the shared tooltip component; shown only in the
    // collapsed state, positioned to the right of the rail).
    sidenav.querySelectorAll('.nav-item').forEach((item) => {
      const label = item.querySelector('.nav-item__label');
      const text = label && label.textContent.trim();
      if (text && !item.hasAttribute('data-tooltip')) {
        item.setAttribute('data-tooltip', text);
        item.setAttribute('data-tip-pos', 'right');
      }
    });

    // The collapsed flag lives on <html> (.is-nav-collapsed) so a tiny inline
    // <head> script can apply it before first paint — otherwise the sidenav
    // renders expanded, then jumps to the rail on each navigation (flicker).
    const root = document.documentElement;
    try {
      if (localStorage.getItem('sn.sidenav') === 'collapsed') root.classList.add('is-nav-collapsed');
    } catch (_) { /* storage unavailable */ }

    const syncCollapse = () => {
      const collapsed = root.classList.contains('is-nav-collapsed');
      collapseBtn.setAttribute('aria-label', collapsed ? 'Expand navigation panel' : 'Collapse navigation panel');
      collapseBtn.setAttribute('aria-expanded', String(!collapsed));
    };
    syncCollapse();

    collapseBtn.addEventListener('click', () => {
      const collapsed = root.classList.toggle('is-nav-collapsed');
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
  // Sits at the very bottom of the page, reached by scrolling to the end.
  const content = document.querySelector('.content');
  if (content && content.querySelector('.pageactions') && !document.querySelector('.sysfooter')) {
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
    // On the Website builder the tool (.layout) is a viewport-height block pinned
    // under the system message; the footer goes in the page flow just below it, so
    // the panel + preview stay fixed during normal scrolling and the footer is
    // reached by continuing to scroll past the tool. On the Platform pages the
    // document scrolls, so the footer sits at the end of the content column.
    const layout = document.querySelector('.layout');
    if (document.querySelector('[data-website-preview]') && layout) {
      layout.insertAdjacentElement('afterend', footer);
    } else {
      content.appendChild(footer);
      content.classList.add('has-sysfooter');
    }
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

  // ---- Tooltips ----
  // One body-level bubble, shared by every [data-tooltip] element and positioned
  // with position:fixed, so it can never be clipped or covered by a panel, an
  // input, the preview, or any other stacking context (a CSS pseudo-element is
  // trapped in its element's stacking context and can be painted over). Uses event
  // delegation, so dynamically-added elements (tree handles/kebabs) work too.
  (function setupTooltips() {
    let tip = null;
    let target = null;
    // Sidenav items carry a tooltip but should only show it while collapsed (the
    // label is visible when expanded).
    const allowed = (el) => (el.matches('.nav-item') ? document.documentElement.classList.contains('is-nav-collapsed') : true);
    const ensure = () => {
      if (!tip) {
        tip = document.createElement('div');
        tip.className = 'app-tooltip';
        tip.setAttribute('role', 'tooltip');
        document.body.appendChild(tip);
      }
      return tip;
    };
    function place() {
      if (!tip || !target || !target.isConnected) { hide(); return; }
      const pos = target.getAttribute('data-tip-pos') || 'bottom-start';
      const r = target.getBoundingClientRect();
      const w = tip.offsetWidth, h = tip.offsetHeight, gap = 6;
      let left, top;
      if (pos === 'right') { left = r.right + 8; top = r.top + r.height / 2 - h / 2; }
      else if (pos === 'bottom-end') { left = r.right - w; top = r.bottom + gap; }
      else if (pos === 'bottom') { left = r.left + r.width / 2 - w / 2; top = r.bottom + gap; }
      else { left = r.left; top = r.bottom + gap; }
      left = Math.max(4, Math.min(left, window.innerWidth - w - 4));
      top = Math.max(4, Math.min(top, window.innerHeight - h - 4));
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
    }
    function show(el) {
      const text = el.getAttribute('data-tooltip');
      if (!text || !allowed(el)) return;
      target = el;
      ensure();
      tip.textContent = text;
      tip.classList.remove('is-shown'); // measure while hidden, then position + show
      place();
      tip.classList.add('is-shown');
    }
    function hide() {
      if (tip) tip.classList.remove('is-shown');
      target = null;
    }
    document.addEventListener('pointerover', (e) => {
      const el = e.target.closest && e.target.closest('[data-tooltip]');
      if (el && el !== target) show(el);
    });
    document.addEventListener('pointerout', (e) => {
      const el = e.target.closest && e.target.closest('[data-tooltip]');
      if (el && el === target && !(e.relatedTarget && el.contains(e.relatedTarget))) hide();
    });
    document.addEventListener('focusin', (e) => {
      const el = e.target.closest && e.target.closest('[data-tooltip]');
      if (el) { try { if (!el.matches(':focus-visible')) return; } catch (_) {} show(el); }
    });
    document.addEventListener('focusout', (e) => {
      const el = e.target.closest && e.target.closest('[data-tooltip]');
      if (el && el === target) hide();
    });
    document.addEventListener('pointerdown', hide); // clicking (e.g. opening a menu) dismisses
    window.addEventListener('scroll', () => { if (target) place(); }, true);
    window.addEventListener('resize', hide);
  })();

  // Expose a tiny API (used by the unsaved-changes nav guard).
  window.AppShell = { closeDrawer };
})();
