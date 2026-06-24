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
  const DEFAULT_LOGO = '/website/assets/stacks-from-ebsco.svg';
  const DEVICE_W = 1280;            // desktop canvas width
  const MIN_Z = 0.1, MAX_Z = 2.5;

  const HEADER_D = { logo: 'left', nav: 'left', background: { color: '#FFFFFF', opacity: 100 }, links: { color: '#3D3F42', opacity: 100 } };
  const FOOTER_D = { showLogo: false, showNavigation: false, links: [] };
  const TYPO_D = { fontFamily: 'Inter', headingSize: 'default', headingWeight: 'default', bodySize: 'default', bodyWeight: 'default' };
  const BRAND_D = { logo: null, primary: { color: '#255096', opacity: 100 }, secondary: { color: '#3D3F42', opacity: 100 }, heading: { color: '#3D3F42', opacity: 100 }, body: { color: '#55585D', opacity: 100 }, link: { color: '#255096', opacity: 100 } };
  const SEARCH_D = { background: { color: '#255096', opacity: 100 }, backgroundImage: null, searches: [] };

  // The preview paints from this cache on first frame so saved configuration
  // shows immediately instead of flashing the defaults and popping in after the
  // network resolves. It is refreshed every load once the real data arrives.
  const CACHE_KEY = 'ws-preview-config';
  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) { return null; }
  }
  function writeCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); return; } catch (_) { /* quota / disabled */ }
    // Likely too large (image data URLs) — cache without them so layout/colours
    // still paint instantly; the images then load when the network resolves.
    try {
      const lite = JSON.parse(JSON.stringify(data));
      if (lite.branding) lite.branding.logo = null;
      if (lite.search) lite.search.backgroundImage = null;
      lite.platformLogo = null;
      localStorage.setItem(CACHE_KEY, JSON.stringify(lite));
    } catch (_) { /* give up — fall back to the lazy load */ }
  }

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

  // A Code element renders its custom markup live. The user's code is arbitrary
  // HTML/CSS/JS, so it runs inside a sandboxed iframe. Scripts run and external
  // resources load (e.g. <script src> like jQuery, <link rel="stylesheet">, web
  // fonts) — nothing is stripped — but the frame keeps an opaque origin so the
  // embed can't reach this app's DOM/cookies. A small reporter posts the rendered
  // height up so the frame can size to its content.
  function codeFrameSrcdoc(code) {
    const reporter =
      '<script>(function(){function s(){try{var h=Math.max(' +
      'document.documentElement.scrollHeight,(document.body?document.body.scrollHeight:0));' +
      'parent.postMessage({__wsprevCodeHeight:h},"*");}catch(e){}}' +
      'window.addEventListener("load",s);window.addEventListener("resize",s);' +
      'if(window.ResizeObserver){try{new ResizeObserver(s).observe(document.documentElement);}catch(e){}}' +
      'setTimeout(s,60);setTimeout(s,300);setTimeout(s,1000);})();<\/script>';
    const c = String(code || '');
    // If the user pasted a complete HTML document, render it as-is (just add the
    // height reporter) so its <head> resources — <link rel="stylesheet">,
    // <script src>, <meta>, fonts — load exactly as authored. Otherwise wrap the
    // snippet in a minimal document.
    if (/<!doctype\s+html|<html[\s>]/i.test(c)) {
      if (/<\/body>/i.test(c)) return c.replace(/<\/body>/i, reporter + '</body>');
      if (/<\/html>/i.test(c)) return c.replace(/<\/html>/i, reporter + '</html>');
      return c + reporter;
    }
    return '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>html,body{margin:0;padding:0}body{font-family:"Noto Sans",Arial,sans-serif}</style>' +
      '</head><body>' + c + reporter + '</body></html>';
  }
  let codeResizeBound = false;
  function bindCodeFrameResize() {
    if (codeResizeBound) return;
    codeResizeBound = true;
    window.addEventListener('message', (e) => {
      const h = e.data && e.data.__wsprevCodeHeight;
      if (typeof h !== 'number' || !(h >= 0)) return;
      document.querySelectorAll('iframe.wsprev__codeframe').forEach((f) => {
        if (f.contentWindow === e.source) f.style.height = Math.min(Math.max(h, 24), 4000) + 'px';
      });
    });
  }
  function buildCodeFrame(element) {
    bindCodeFrameResize();
    const frame = document.createElement('iframe');
    frame.className = 'wsprev__codeframe';
    frame.title = element.title || 'Custom code';
    // Run scripts + load external resources, and allow the things real embeds
    // need (forms, popups, modals, downloads). Deliberately NO allow-same-origin:
    // the embed stays isolated from this app's origin (cookies/DOM/APIs).
    frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-forms allow-modals allow-downloads allow-popups-to-escape-sandbox');
    frame.setAttribute('scrolling', 'no');
    frame.srcdoc = codeFrameSrcdoc(String(element.code || ''));
    return frame;
  }

  // Apply a richtext element's style (colours + border) — only when a value is
  // actually set (opacity > 0 / a width chosen), otherwise the CSS defaults win.
  function applyRichtextStyle(elt, rt, st) {
    if (!st) return;
    let padded = false;
    if (st.background && st.background.opacity > 0) { elt.style.background = rgba(st.background); padded = true; }
    if (st.heading && st.heading.opacity > 0) rt.style.setProperty('--rt-heading', rgba(st.heading));
    if (st.text && st.text.opacity > 0) rt.style.setProperty('--rt-text', rgba(st.text));
    if (st.link && st.link.opacity > 0) rt.style.setProperty('--rt-link', rgba(st.link));
    const bw = ({ 1: 1, 2: 2, 4: 4 })[st.borderWidth] || 1;
    const sides = st.borderSides || {};
    // A border only appears once a border colour is chosen (opacity > 0).
    if (st.borderColor && st.borderColor.opacity > 0 && (sides.top || sides.right || sides.bottom || sides.left)) {
      const bc = rgba(st.borderColor);
      const b = `${bw}px solid ${bc}`;
      if (sides.top) elt.style.borderTop = b;
      if (sides.right) elt.style.borderRight = b;
      if (sides.bottom) elt.style.borderBottom = b;
      if (sides.left) elt.style.borderLeft = b;
      padded = true;
    }
    if (padded) elt.style.padding = '16px';
  }

  function create(container) {
    const state = {
      navigation: [],
      header: HEADER_D,
      footer: FOOTER_D,
      typography: TYPO_D,
      branding: BRAND_D,
      search: SEARCH_D,
      platformLogo: null,
      siteName: '',
      showSiteName: false,    // Branding "Show site name beside logo"
      pages: [],              // published pages (with content) for the read-only view
      viewPageId: null,       // which page the preview is currently showing (defaults to the homepage)
      builder: null,          // { sections, selectedSectionId, selectedElementId } when editing a page
      builderCallbacks: {},   // { onAddSection, onAddElement, onSelectSection, onSelectElement, onDeleteSection, onDeleteElement }
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

    // ---- Content builder overlays (only the body changes; header/footer stay) ----
    function iconBtn(cls, label, paths, onClick) {
      const b = el('button', cls);
      b.type = 'button';
      b.title = label;
      b.setAttribute('aria-label', label);
      b.innerHTML = paths;
      b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
      return b;
    }
    const GRIP = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor"><circle cx="5.5" cy="3" r="1.3"/><circle cx="10.5" cy="3" r="1.3"/><circle cx="5.5" cy="8" r="1.3"/><circle cx="10.5" cy="8" r="1.3"/><circle cx="5.5" cy="13" r="1.3"/><circle cx="10.5" cy="13" r="1.3"/></svg>';
    const PENCIL = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M10.8 2.6 13.4 5.2 5.4 13.2H2.8v-2.6z"/></svg>';
    const TRASH = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10M6 4.5V3h4v1.5M4.8 4.5 5.4 13h5.2l.6-8.5"/></svg>';
    const PLUSC = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="6.4"/><path d="M8 5v6M5 8h6"/></svg>';

    function blockToolbar(onEdit, onDelete) {
      const tb = el('div', 'wsprev__toolbar');
      const grip = el('span', 'wsprev__tbgrip');
      grip.innerHTML = GRIP;
      tb.appendChild(grip);
      tb.appendChild(iconBtn('wsprev__tbbtn', 'Edit', PENCIL, onEdit));
      tb.appendChild(iconBtn('wsprev__tbbtn', 'Delete', TRASH, onDelete));
      return tb;
    }
    function cta(label, onClick) {
      // The whole call-to-action is a single button (full touch area).
      const btn = el('button', 'wsprev__cta');
      btn.type = 'button';
      btn.innerHTML = PLUSC;
      btn.appendChild(document.createTextNode(label));
      btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
      return btn;
    }

    function renderBuilderBody(body) {
      const cb = state.builderCallbacks || {};
      const blr = state.builder || { sections: [] };
      const colOf = (e) => (Number(e.column) === 1 ? 1 : 0);

      // Drag-to-reorder elements (within a section; across columns in 50/50).
      // The dragged element's id; null when no drag is in progress.
      let dragId = null;
      const clearDropMarks = () => {
        body.querySelectorAll('.is-dropbefore').forEach((n) => n.classList.remove('is-dropbefore'));
        body.querySelectorAll('.is-dropend').forEach((n) => n.classList.remove('is-dropend'));
      };
      // The element to drop in front of inside container (null = drop at the end).
      // Compares against rendered (scaled) positions, so zoom doesn't matter.
      const dropBeforeEl = (container, y) => {
        const els = Array.prototype.filter.call(container.children,
          (n) => n.classList && n.classList.contains('wsprev__el') && n.dataset.id !== dragId);
        for (let i = 0; i < els.length; i++) {
          const r = els[i].getBoundingClientRect();
          if (y < r.top + r.height / 2) return els[i];
        }
        return null;
      };
      function makeDropZone(container, section, column) {
        container.addEventListener('dragover', (e) => {
          if (dragId == null) return;
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
          clearDropMarks();
          const before = dropBeforeEl(container, e.clientY);
          if (before) before.classList.add('is-dropbefore');
          else container.classList.add('is-dropend');
        });
        container.addEventListener('dragleave', (e) => {
          if (!container.contains(e.relatedTarget)) clearDropMarks();
        });
        container.addEventListener('drop', (e) => {
          if (dragId == null) return;
          e.preventDefault();
          e.stopPropagation();
          const before = dropBeforeEl(container, e.clientY);
          const id = dragId;
          clearDropMarks();
          cb.onReorderElement && cb.onReorderElement(section.id, id, column, before ? before.dataset.id : null);
        });
      }

      function buildElement(element, section) {
        const elt = el('div', 'wsprev__el');
        elt.dataset.id = element.id;
        if (element.id === blr.selectedElementId) elt.classList.add('is-selected');
        elt.addEventListener('click', (e) => { e.stopPropagation(); cb.onSelectElement && cb.onSelectElement(section.id, element.id); });
        elt.appendChild(blockToolbar(
          () => cb.onEditElement && cb.onEditElement(section.id, element.id),
          () => cb.onDeleteElement && cb.onDeleteElement(section.id, element.id)
        ));
        // The grip arms native dragging; the element drags only when grabbed there.
        const grip = elt.querySelector('.wsprev__tbgrip');
        if (grip) {
          grip.addEventListener('mousedown', () => { elt.draggable = true; });
          grip.addEventListener('mouseup', () => { elt.draggable = false; });
        }
        elt.addEventListener('dragstart', (e) => {
          dragId = element.id;
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', element.id); } catch (_) {}
          }
          elt.classList.add('is-dragging');
        });
        elt.addEventListener('dragend', () => {
          dragId = null; elt.draggable = false; elt.classList.remove('is-dragging'); clearDropMarks();
        });
        if (element.displayTitle && element.title) {
          const t = el('h3', 'wsprev__eltitle', element.title);
          const h = element.style && element.style.heading;
          if (h && h.opacity > 0) t.style.color = rgba(h); // title inherits the Heading colour
          elt.appendChild(t);
        }
        if (element.type === 'code') {
          if (String(element.code || '').trim()) {
            elt.appendChild(buildCodeFrame(element));
          } else {
            elt.appendChild(el('div', 'wsprev__codeempty', 'Your code will appear in the preview of this block'));
          }
        } else {
          const html = String(element.body || '');
          const hasContent = html.replace(/<[^>]*>/g, '').trim() || /<(br|img|hr)/i.test(html);
          const rt = el('div', 'wsprev__richtext');
          if (hasContent) rt.innerHTML = window.RichText ? window.RichText.sanitize(html) : '';
          else rt.appendChild(el('p', 'wsprev__elempty', 'Empty rich text.'));
          applyRichtextStyle(elt, rt, element.style);
          elt.appendChild(rt);
        }
        return elt;
      }

      (blr.sections || []).forEach((section) => {
        const sec = el('div', 'wsprev__section');
        sec.dataset.id = section.id;
        // A selected section shows only its pink border — its background fill is
        // dropped so it reads as a clean outline (one selected block is pink).
        const sectionSelected = section.id === blr.selectedSectionId && !blr.selectedElementId;
        sec.style.background = sectionSelected ? 'transparent' : rgba(section.background);
        if (sectionSelected) sec.classList.add('is-selected');
        // The "Add element" placeholder only shows on the active (selected)
        // section — selecting an element keeps its section active.
        const active = section.id === blr.selectedSectionId;
        sec.addEventListener('click', () => cb.onSelectSection && cb.onSelectSection(section.id));
        sec.appendChild(blockToolbar(
          () => cb.onSelectSection && cb.onSelectSection(section.id),
          () => cb.onDeleteSection && cb.onDeleteSection(section.id)
        ));
        if (section.displayTitle && section.title) sec.appendChild(el('h2', 'wsprev__sectitle', section.title));

        const elements = section.elements || [];
        if (Number(section.columns) === 2) {
          // Two 50% columns, each with its own elements + 50%-wide Add element.
          const grid = el('div', 'wsprev__elements wsprev__elements--split');
          for (let col = 0; col < 2; col++) {
            const column = el('div', 'wsprev__col');
            elements.filter((e) => colOf(e) === col).forEach((element) => column.appendChild(buildElement(element, section)));
            if (active) column.appendChild(cta('Add element', () => cb.onAddElement && cb.onAddElement(section.id, col)));
            makeDropZone(column, section, col);
            grid.appendChild(column);
          }
          sec.appendChild(grid);
        } else {
          const wrap = el('div', 'wsprev__elements');
          elements.forEach((element) => wrap.appendChild(buildElement(element, section)));
          makeDropZone(wrap, section, 0);
          sec.appendChild(wrap);
          if (active) sec.appendChild(cta('Add element', () => cb.onAddElement && cb.onAddElement(section.id, 0)));
        }

        body.appendChild(sec);
      });
      // "Add section" placeholder only on an empty page; once a section exists,
      // add more from the panel — keeps the building canvas focused.
      if (!(blr.sections || []).length) body.appendChild(cta('Add section', () => cb.onAddSection && cb.onAddSection()));
    }

    // The page the read-only preview currently shows: the chosen one, else the
    // homepage, else the first page.
    function currentViewPage() {
      const pages = state.pages || [];
      if (!pages.length) return null;
      return pages.find((p) => p.id === state.viewPageId)
        || pages.find((p) => p.isHomepage) || pages[0];
    }

    // Read-only render of a published page's sections + elements (no editing
    // chrome) — what visitors see. Mirrors the builder body's content rendering.
    function renderPublishedBody(body, sections) {
      const buildEl = (element) => {
        const elt = el('div', 'wsprev__el');
        if (element.displayTitle && element.title) {
          const t = el('h3', 'wsprev__eltitle', element.title);
          const hd = element.style && element.style.heading;
          if (hd && hd.opacity > 0) t.style.color = rgba(hd);
          elt.appendChild(t);
        }
        if (element.type === 'code') {
          if (String(element.code || '').trim()) elt.appendChild(buildCodeFrame(element));
        } else {
          const html = String(element.body || '');
          const hasContent = html.replace(/<[^>]*>/g, '').trim() || /<(br|img|hr)/i.test(html);
          if (hasContent) {
            const rt = el('div', 'wsprev__richtext');
            rt.innerHTML = window.RichText ? window.RichText.sanitize(html) : '';
            applyRichtextStyle(elt, rt, element.style);
            elt.appendChild(rt);
          }
        }
        return elt;
      };
      (sections || []).forEach((section) => {
        const sec = el('div', 'wsprev__section');
        sec.style.background = rgba(section.background);
        if (section.displayTitle && section.title) sec.appendChild(el('h2', 'wsprev__sectitle', section.title));
        const elements = section.elements || [];
        if (Number(section.columns) === 2) {
          const grid = el('div', 'wsprev__elements wsprev__elements--split');
          for (let col = 0; col < 2; col++) {
            const column = el('div', 'wsprev__col');
            elements.filter((e) => (Number(e.column) === 1 ? 1 : 0) === col).forEach((element) => column.appendChild(buildEl(element)));
            grid.appendChild(column);
          }
          sec.appendChild(grid);
        } else {
          const wrap = el('div', 'wsprev__elements');
          elements.forEach((element) => wrap.appendChild(buildEl(element)));
          sec.appendChild(wrap);
        }
        body.appendChild(sec);
      });
    }

    function render() {
      const h = state.header || HEADER_D;
      const f = state.footer || FOOTER_D;
      const t = state.typography || TYPO_D;
      const navItems = (state.navigation || []).filter((i) => i.label);
      const navLabels = navItems.map((i) => i.label);

      root.style.fontFamily = `${t.fontFamily || 'Inter'}, "Noto Sans", Arial, sans-serif`;
      root.innerHTML = '';

      // ---- Header / navigation bar ----
      const header = el('header', 'wsprev__header');
      const inline = h.logo === 'left' && h.nav === 'aligned';
      header.classList.add(inline ? 'wsprev__header--inline' : 'wsprev__header--stacked');
      header.style.background = rgba(h.background);

      // In the read-only (non-builder) view the logo + page links navigate the
      // preview between published pages; the homepage is the default.
      const live = !state.builder;
      const goTo = (pageId) => { state.viewPageId = pageId; render(); };
      const homepage = (state.pages || []).find((p) => p.isHomepage) || (state.pages || [])[0];
      const viewId = currentViewPage() ? currentViewPage().id : null;

      const hLogo = el(live && homepage ? 'a' : 'span', 'wsprev__logo');
      if (live && homepage) { hLogo.href = '#'; hLogo.addEventListener('click', (e) => { e.preventDefault(); goTo(homepage.id); }); }
      hLogo.appendChild(logoImg());
      // Branding "Show site name beside logo" → the site name sits beside the logo.
      if (state.showSiteName && state.siteName) {
        const name = el('span', 'wsprev__sitename', state.siteName);
        name.style.color = textColor(h.links, '#3D3F42');
        hLogo.appendChild(name);
      }
      const hNav = el('nav', 'wsprev__nav');
      navItems.forEach((item) => {
        const pageLink = live && item.type === 'page' && item.pageId && (state.pages || []).some((p) => p.id === item.pageId);
        const a = el(pageLink ? 'a' : 'span', 'wsprev__navlink', item.label);
        a.style.color = textColor(h.links, '#3D3F42');
        if (pageLink) {
          a.href = '#';
          if (item.pageId === viewId) a.classList.add('is-current');
          a.addEventListener('click', (e) => { e.preventDefault(); goTo(item.pageId); });
        }
        hNav.appendChild(a);
      });
      if (!inline) {
        hLogo.style.alignSelf = h.logo === 'center' ? 'center' : 'flex-start';
        hNav.style.alignSelf = h.nav === 'aligned' ? 'center' : 'flex-start';
      }
      header.appendChild(hLogo);
      header.appendChild(hNav);
      root.appendChild(header);

      // ---- Search / hero section (below the navigation). Shown when a search is
      // configured and/or a heading or description (from the Header panel) is set.
      // Heading + description sit above the search bar in this one section. ----
      const s = state.search || SEARCH_D;
      const heading = (h.heading || '').trim();
      const description = (h.description || '').trim();
      const hasSearch = !!(s.searches && s.searches.length);
      if (hasSearch || heading || description) {
        const sec = el('section', 'wsprev__search');
        if (!heading && !description) sec.classList.add('wsprev__search--baronly');
        sec.style.background = rgba(s.background);
        if (s.backgroundImage) {
          sec.style.backgroundImage = `url("${s.backgroundImage}")`;
          sec.style.backgroundSize = 'cover';
          sec.style.backgroundPosition = 'center';
        }
        if (heading || description) {
          const hero = el('div', 'wsprev__searchhero');
          if (heading) hero.appendChild(el('h2', 'wsprev__searchheading', heading));
          if (description) hero.appendChild(el('p', 'wsprev__searchdesc', description));
          sec.appendChild(hero);
        }
        if (hasSearch) {
          // The default (starred) search is pre-selected; the search button carries
          // its label as the accessible name (the visible control is a search icon).
          const def = s.searches.find((x) => x.isDefault) || s.searches[0];
          const bar = el('div', 'wsprev__searchbar');
          const select = el('select', 'wsprev__searchselect');
          s.searches.forEach((se) => {
            const o = el('option', null, se.displayLabel || se.name);
            o.value = se.id;
            if (se.id === def.id) o.selected = true;
            select.appendChild(o);
          });
          const box = el('div', 'wsprev__searchbox');
          const input = el('input', 'wsprev__searchinput');
          input.type = 'text';
          input.placeholder = 'Search articles, books, journals & more';
          const btn = el('button', 'wsprev__searchbtn');
          btn.type = 'button';
          btn.innerHTML = '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="#2d62b7" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M13 13l4.5 4.5"/></svg>';
          const setBtnLabel = (lbl) => { btn.setAttribute('aria-label', lbl); btn.title = lbl; };
          setBtnLabel(def.buttonLabel || 'Search');
          select.addEventListener('change', () => {
            const sel = s.searches.find((x) => x.id === select.value);
            setBtnLabel((sel && sel.buttonLabel) || 'Search');
          });
          box.appendChild(input);
          box.appendChild(btn);
          bar.appendChild(select);
          bar.appendChild(box);
          sec.appendChild(bar);
        }
        root.appendChild(sec);
      }

      // ---- Page body: the content builder while editing; otherwise the
      // read-only published content of the page being viewed (default homepage).
      const body = el('main', 'wsprev__body');
      if (state.builder) {
        renderBuilderBody(body);
      } else {
        body.classList.add('wsprev__body--published');
        const page = currentViewPage();
        if (page && page.content && page.content.sections) renderPublishedBody(body, page.content.sections);
      }
      root.appendChild(body);

      // ---- Footer (Figma 1802:561) ----
      const footer = el('footer', 'wsprev__footer');
      // Top "options" area: logo (left) + menu (right). The divider above the
      // copyright row only appears when this area has content — when neither the
      // logo nor the menu is enabled there is no divider.
      const fOptions = el('div', 'wsprev__foptions');
      if (f.showLogo) {
        const fLogo = el('span', 'wsprev__flogo');
        fLogo.appendChild(logoImg());
        fOptions.appendChild(fLogo);
      }
      const fLabels = [];
      if (f.showNavigation) fLabels.push(...navLabels);
      (f.links || []).forEach((l) => fLabels.push(l.label));
      if (fLabels.length) {
        const fLinks = el('div', 'wsprev__flinks');
        fLabels.forEach((label) => fLinks.appendChild(el('span', 'wsprev__flink', label)));
        fOptions.appendChild(fLinks);
      }
      if (fOptions.children.length) {
        // With a logo the menu sits opposite it (logo left, menu right); with no
        // logo the menu is centered.
        if (!f.showLogo) fOptions.classList.add('wsprev__foptions--center');
        footer.appendChild(fOptions);
        footer.appendChild(el('div', 'wsprev__fdivider'));
      }
      // Required copyright row: copyright (left) + policy links (right).
      const fRow = el('div', 'wsprev__frow');
      fRow.appendChild(el('span', 'wsprev__copyright', `Copyright © ${new Date().getFullYear()} EBSCO StacksNext. All rights reserved`));
      const fPolicy = el('div', 'wsprev__fpolicy');
      ['Privacy policy', 'License agreement', 'Manage my cookies'].forEach((label) => {
        fPolicy.appendChild(el('span', 'wsprev__fpolicylink', label));
      });
      fRow.appendChild(fPolicy);
      footer.appendChild(fRow);
      root.appendChild(footer);

      // Re-measure and re-apply zoom (fit unless the user has zoomed manually).
      naturalH = root.offsetHeight || naturalH;
      if (userZoomed) applyZoom(zoom); else fitZoom();
    }

    // Instant-load cache: snapshot the saved website config (not the per-page
    // builder state) and write it debounced so live edits/saves stay current.
    const cacheSnapshot = () => ({
      navigation: state.navigation,
      header: state.header,
      footer: state.footer,
      typography: state.typography,
      branding: state.branding,
      search: state.search,
      platformLogo: state.platformLogo,
      siteName: state.siteName,
      showSiteName: state.showSiteName,
    });
    let cacheTimer = null;
    const scheduleCacheWrite = () => {
      if (cacheTimer) return;
      cacheTimer = setTimeout(() => { cacheTimer = null; writeCache(cacheSnapshot()); }, 400);
    };

    // Paint immediately from the last-known config so there is no flash of the
    // defaults before the network resolves.
    const cached = readCache();
    if (cached) {
      if (cached.navigation) state.navigation = cached.navigation;
      if (cached.header) state.header = cached.header;
      if (cached.footer) state.footer = cached.footer;
      if (cached.typography) state.typography = cached.typography;
      if (cached.branding) state.branding = cached.branding;
      if (cached.search) state.search = cached.search;
      if ('platformLogo' in cached) state.platformLogo = cached.platformLogo;
      if ('siteName' in cached) state.siteName = cached.siteName;
      if ('showSiteName' in cached) state.showSiteName = cached.showSiteName;
    }
    render();

    // ---- Load saved configuration (revalidate the cache) ----
    const get = (url) => fetch(url, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    Promise.all([
      get('/api/website/navigation'),
      get('/api/website/header'),
      get('/api/website/footer'),
      get('/api/website/typography'),
      get('/api/website/branding'),
      get('/api/website/search'),
      get('/api/branding'),
      get('/api/site-settings'),
      get('/api/website/pages'),
    ]).then(([nav, header, footer, typo, wbrand, search, pbrand, site, pages]) => {
      if (nav && Array.isArray(nav.navigation)) state.navigation = nav.navigation;
      if (header) state.header = header.saved || header.defaults || HEADER_D;
      if (footer) state.footer = footer.saved || footer.defaults || FOOTER_D;
      if (typo) state.typography = typo.saved || typo.defaults || TYPO_D;
      if (wbrand) state.branding = wbrand.saved || wbrand.defaults || BRAND_D;
      if (search) state.search = search.saved || search.defaults || SEARCH_D;
      state.platformLogo = (pbrand && pbrand.saved && pbrand.saved.logo) || null;
      state.showSiteName = !!(pbrand && pbrand.saved && pbrand.saved.showSiteName);
      state.siteName = (site && ((site.saved && site.saved.name) || (site.defaults && site.defaults.name))) || '';
      // Pages are owned by the Pages page (which pushes live edits); only adopt the
      // fetched set when the host hasn't already provided one.
      if (pages && Array.isArray(pages.pages) && !(state.pages && state.pages.length)) state.pages = pages.pages;
      render();
      writeCache(cacheSnapshot());
    });

    return {
      update(partial) {
        Object.assign(state, partial || {});
        render();
        scheduleCacheWrite(); // keep the instant-load cache current with live edits/saves
      },
      destroy() {
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onBlur);
        if (cacheTimer) clearTimeout(cacheTimer);
        if (ro) ro.disconnect();
        container.innerHTML = '';
      },
    };
  }

  window.WebsitePreview = { create };
})();
