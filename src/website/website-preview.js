// Shared website preview for the Website layer.
//
//   const preview = WebsitePreview.create(container);
//   preview.update({ header: liveHeaderConfig });   // push the page's live edits
//
// One preview rendered on every Website section page so the user always sees the
// same site. It fetches all saved configuration on create and merges the current
// page's live (unsaved) section via update(), then renders the actual site
// chrome — a header/navigation bar and a footer — wrapping an empty page body
// (no invented content; the page body is whatever the user publishes later).
//
// The site is drawn at a fixed desktop width inside a pan/zoom canvas: scroll to
// pan, hold Space and scroll to zoom (like a design tool), double-click to fit.
//
// Logo precedence: Website branding logo → Platform branding logo → default.
(function () {
  const DEFAULT_LOGO = '/website/assets/stacks-logo.svg';
  const DEVICE_W = 1280;            // desktop canvas width
  const MIN_Z = 0.1, MAX_Z = 2.5;

  const HEADER_D = { logo: 'left', nav: 'left', background: { color: '#FFFFFF', opacity: 100 }, links: { color: '#3D3F42', opacity: 100 } };
  const FOOTER_D = { showLogo: false, showNavigation: false, links: [] };
  const TYPO_D = { fontFamily: 'Inter', headingSize: 'default', headingWeight: 'default', bodySize: 'default', bodyWeight: 'default' };
  const BRAND_D = { logo: null, primary: { color: '#255096', opacity: 100 }, secondary: { color: '#3D3F42', opacity: 100 }, heading: { color: '#3D3F42', opacity: 100 }, body: { color: '#55585D', opacity: 100 }, link: { color: '#255096', opacity: 100 } };

  function rgba(c) {
    if (!c || !c.color) return 'transparent';
    const o = (c.opacity == null ? 100 : c.opacity) / 100;
    const h = c.color;
    return `rgba(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}, ${o})`;
  }
  const textColor = (c, fallback) => (!c || c.opacity === 0 ? fallback : rgba(c));

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function create(container) {
    const state = {
      navigation: [],
      header: HEADER_D,
      footer: FOOTER_D,
      typography: TYPO_D,
      branding: BRAND_D,
      platformLogo: null,
    };

    // ---- Canvas scaffold: viewport > sizer > site mock, plus a HUD overlay ----
    container.innerHTML = '';
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

    const canvas = el('div', 'wsprev-canvas');
    const sizer = el('div', 'wsprev-sizer');
    const root = el('div', 'wsprev');
    sizer.appendChild(root);
    canvas.appendChild(sizer);

    const hud = el('div', 'wsprev-hud');
    const hint = el('span');
    hint.innerHTML = 'Hold <kbd>Space</kbd> + scroll to zoom';
    const pct = el('span', 'wsprev-hud__pct', '100%');
    hud.appendChild(hint);
    hud.appendChild(el('span', 'wsprev-hud__dot', '·'));
    hud.appendChild(pct);

    container.appendChild(canvas);
    container.appendChild(hud);

    let zoom = 1, naturalH = 600, userZoomed = false, spaceDown = false, hovering = false;

    function applyZoom(z) {
      zoom = Math.max(MIN_Z, Math.min(MAX_Z, z));
      root.style.transform = 'scale(' + zoom + ')';
      sizer.style.width = (DEVICE_W * zoom) + 'px';
      sizer.style.height = (naturalH * zoom) + 'px';
      pct.textContent = Math.round(zoom * 100) + '%';
    }
    function fitZoom() {
      const avail = canvas.clientWidth - 56; // 28px padding each side
      applyZoom(Math.min(1, avail / DEVICE_W));
      userZoomed = false;
      canvas.scrollTop = 0;
    }
    // Zoom while keeping the point under the cursor fixed on screen.
    function zoomAt(clientX, clientY, factor) {
      const r1 = root.getBoundingClientRect();
      const px = (clientX - r1.left) / zoom;
      const py = (clientY - r1.top) / zoom;
      applyZoom(zoom * factor);
      const r2 = root.getBoundingClientRect();
      canvas.scrollLeft += r2.left - (clientX - px * zoom);
      canvas.scrollTop += r2.top - (clientY - py * zoom);
      userZoomed = true;
    }

    canvas.addEventListener('mouseenter', () => { hovering = true; });
    canvas.addEventListener('mouseleave', () => { hovering = false; });
    canvas.addEventListener('wheel', (e) => {
      if (!spaceDown) return;            // plain scroll = pan
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });
    canvas.addEventListener('dblclick', () => fitZoom());

    function onKeyDown(e) {
      if (e.code !== 'Space' || !hovering || spaceDown) return;
      const tag = (e.target && e.target.tagName) || '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (e.target && e.target.isContentEditable)) return;
      spaceDown = true;
      canvas.classList.add('wsprev-canvas--zoom');
      e.preventDefault();                // stop the page scrolling while Space is held
    }
    function onKeyUp(e) {
      if (e.code !== 'Space') return;
      spaceDown = false;
      canvas.classList.remove('wsprev-canvas--zoom');
    }
    function onBlur() { spaceDown = false; canvas.classList.remove('wsprev-canvas--zoom'); }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    let ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(() => { if (!userZoomed) fitZoom(); });
      ro.observe(canvas);
    }

    function effectiveLogo() {
      return (state.branding && state.branding.logo) || state.platformLogo || DEFAULT_LOGO;
    }
    function logoImg() {
      const src = effectiveLogo();
      const img = el('img', 'wsprev__logoimg');
      img.alt = '';
      img.src = src;
      if (src.startsWith('data:')) img.classList.add('wsprev__logoimg--custom');
      return img;
    }

    function render() {
      const h = state.header || HEADER_D;
      const f = state.footer || FOOTER_D;
      const t = state.typography || TYPO_D;
      const navLabels = (state.navigation || []).map((i) => i.label).filter(Boolean);

      root.style.fontFamily = `${t.fontFamily || 'Inter'}, "Noto Sans", Arial, sans-serif`;
      root.innerHTML = '';

      // ---- Header / navigation bar ----
      const header = el('header', 'wsprev__header');
      const inline = h.logo === 'left' && h.nav === 'aligned';
      header.classList.add(inline ? 'wsprev__header--inline' : 'wsprev__header--stacked');
      header.style.background = rgba(h.background);

      const hLogo = el('span', 'wsprev__logo');
      hLogo.appendChild(logoImg());
      const hNav = el('nav', 'wsprev__nav');
      // Only the user's real navigation items appear — no placeholder links.
      navLabels.forEach((label) => {
        const a = el('span', 'wsprev__navlink', label);
        a.style.color = textColor(h.links, '#3D3F42');
        hNav.appendChild(a);
      });
      if (!inline) {
        hLogo.style.alignSelf = h.logo === 'center' ? 'center' : 'flex-start';
        hNav.style.alignSelf = h.nav === 'aligned' ? 'center' : 'flex-start';
      }
      header.appendChild(hLogo);
      header.appendChild(hNav);
      root.appendChild(header);

      // ---- Page body: intentionally empty (no content added yet) ----
      root.appendChild(el('main', 'wsprev__body'));

      // ---- Footer ----
      const footer = el('footer', 'wsprev__footer');
      const fMain = el('div', 'wsprev__fmain');
      if (f.showLogo) {
        const fLogo = el('span', 'wsprev__flogo');
        fLogo.appendChild(logoImg());
        fMain.appendChild(fLogo);
      }
      const fLabels = [];
      if (f.showNavigation) fLabels.push(...navLabels);
      (f.links || []).forEach((l) => fLabels.push(l.label));
      if (fLabels.length) {
        const fLinks = el('div', 'wsprev__flinks');
        fLabels.forEach((label) => fLinks.appendChild(el('span', 'wsprev__flink', label)));
        fMain.appendChild(fLinks);
      }
      if (fMain.children.length) footer.appendChild(fMain);
      footer.appendChild(el('div', 'wsprev__copyright', `© ${new Date().getFullYear()} Stacks. All rights reserved.`));
      root.appendChild(footer);

      // Re-measure and re-apply zoom (fit unless the user has zoomed manually).
      naturalH = root.offsetHeight || naturalH;
      if (userZoomed) applyZoom(zoom); else fitZoom();
    }

    render();

    // ---- Load saved configuration ----
    const get = (url) => fetch(url, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    Promise.all([
      get('/api/website/navigation'),
      get('/api/website/header'),
      get('/api/website/footer'),
      get('/api/website/typography'),
      get('/api/website/branding'),
      get('/api/branding'),
    ]).then(([nav, header, footer, typo, wbrand, pbrand]) => {
      if (nav && Array.isArray(nav.navigation)) state.navigation = nav.navigation;
      if (header) state.header = header.saved || header.defaults || HEADER_D;
      if (footer) state.footer = footer.saved || footer.defaults || FOOTER_D;
      if (typo) state.typography = typo.saved || typo.defaults || TYPO_D;
      if (wbrand) state.branding = wbrand.saved || wbrand.defaults || BRAND_D;
      state.platformLogo = (pbrand && pbrand.saved && pbrand.saved.logo) || null;
      render();
    });

    return {
      update(partial) { Object.assign(state, partial || {}); render(); },
      destroy() {
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onBlur);
        if (ro) ro.disconnect();
        container.innerHTML = '';
      },
    };
  }

  window.WebsitePreview = { create };
})();
