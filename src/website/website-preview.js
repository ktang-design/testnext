// Shared website preview for the Website layer.
//
//   const preview = WebsitePreview.create(container);
//   preview.update({ header: liveHeaderConfig });   // push the page's live edits
//
// One preview rendered on every Website section page so the user always sees
// the same site. It fetches all saved configuration on create and merges the
// current page's live (unsaved) section via update(), then renders a small
// website: a header/navigation bar, a sample body, and a footer.
//
// Logo precedence: Website branding logo → Platform branding logo → default.
(function () {
  const DEFAULT_LOGO = '/website/assets/stacks-logo.svg';

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
  const num = (v, d) => (v === 'default' || v == null ? d : (parseInt(v, 10) || d));

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

    const root = el('div', 'wsprev');
    container.innerHTML = '';
    container.appendChild(root);

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
      const b = state.branding || BRAND_D;
      const h = state.header || HEADER_D;
      const f = state.footer || FOOTER_D;
      const t = state.typography || TYPO_D;
      const navLabels = (state.navigation || []).map((i) => i.label).filter(Boolean);

      root.style.fontFamily = `${t.fontFamily || 'Inter'}, "Noto Sans", Arial, sans-serif`;
      root.innerHTML = '';

      // ---- Header bar ----
      const header = el('header', 'wsprev__header');
      const inline = h.logo === 'left' && h.nav === 'aligned';
      header.classList.add(inline ? 'wsprev__header--inline' : 'wsprev__header--stacked');
      header.style.background = rgba(h.background);

      const hLogo = el('span', 'wsprev__logo');
      hLogo.appendChild(logoImg());
      const hNav = el('nav', 'wsprev__nav');
      (navLabels.length ? navLabels : ['Home', 'About', 'Contact']).forEach((label) => {
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

      // ---- Body (typography + brand colours) ----
      const body = el('main', 'wsprev__body');
      const heading = el('h1', 'wsprev__heading', 'Build a beautiful website');
      heading.style.color = textColor(b.heading, '#3D3F42');
      heading.style.fontSize = num(t.headingSize, 24) + 'px';
      heading.style.fontWeight = num(t.headingWeight, 600);
      body.appendChild(heading);

      const para = el('p', 'wsprev__text');
      para.style.color = textColor(b.body, '#55585D');
      para.style.fontSize = num(t.bodySize, 16) + 'px';
      para.style.fontWeight = num(t.bodyWeight, 400);
      para.appendChild(document.createTextNode('Everything you publish is styled with your brand. '));
      const inlineLink = el('a', 'wsprev__link', 'Learn more');
      inlineLink.style.color = textColor(b.link, '#255096');
      para.appendChild(inlineLink);
      body.appendChild(para);

      const cta = el('span', 'wsprev__btn', 'Get started');
      cta.style.background = rgba(b.primary);
      body.appendChild(cta);
      root.appendChild(body);

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
      destroy() { container.innerHTML = ''; },
    };
  }

  window.WebsitePreview = { create };
})();
