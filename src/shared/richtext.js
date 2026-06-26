// Client-side HTML sanitizer for richtext bodies. Mirrors the server allowlist
// (routes/pages.js) so what you type/see in the editor matches what gets stored
// + rendered. Parses with DOMParser (scripts in a parsed document never run),
// then rebuilds the tree keeping only allowlisted tags/attributes.
//
//   window.RichText.sanitize(htmlString) -> safe htmlString
(function () {
  const ALLOWED = {
    P: 1, BR: 1, DIV: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, SUB: 1, SUP: 1,
    H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, UL: 1, OL: 1, LI: 1, A: 1, BLOCKQUOTE: 1, HR: 1, IMG: 1,
    TABLE: 1, THEAD: 1, TBODY: 1, TR: 1, TD: 1, TH: 1,
  };
  const VOID = { BR: 1, HR: 1, IMG: 1 };

  function cleanUrl(u) {
    const v = String(u || '').trim();
    if (/^(https?:|mailto:|tel:)/i.test(v) || v.startsWith('/') || v.startsWith('#')) return v;
    return '';
  }
  const cleanImgSrc = (u) => (/^https?:/i.test(String(u || '').trim()) ? String(u).trim() : '');
  function cleanStyle(style) {
    const out = [];
    String(style || '').split(';').forEach((decl) => {
      const i = decl.indexOf(':');
      if (i < 0) return;
      const prop = decl.slice(0, i).trim().toLowerCase();
      const val = decl.slice(i + 1).trim();
      if (prop === 'text-align' && /^(left|right|center|justify)$/i.test(val)) out.push(`text-align:${val.toLowerCase()}`);
      if (prop === 'margin-left' && /^\d+(\.\d+)?(px|em|rem)$/i.test(val)) out.push(`margin-left:${val}`);
    });
    return out.join(';');
  }

  function walk(node, out) {
    node.childNodes.forEach((ch) => {
      if (ch.nodeType === 3) { out.appendChild(document.createTextNode(ch.nodeValue)); return; }
      if (ch.nodeType !== 1) return;
      const tag = ch.tagName;
      if (!ALLOWED[tag]) { walk(ch, out); return; } // drop tag, keep its (cleaned) contents
      const clean = document.createElement(tag);
      if (tag === 'A') {
        const href = cleanUrl(ch.getAttribute('href'));
        if (href) { clean.setAttribute('href', href); clean.setAttribute('target', '_blank'); clean.setAttribute('rel', 'noopener noreferrer'); }
      } else if (tag === 'IMG') {
        const src = cleanImgSrc(ch.getAttribute('src'));
        if (!src) return; // drop images with an unsafe src
        clean.setAttribute('src', src);
        const alt = ch.getAttribute('alt');
        if (alt) clean.setAttribute('alt', alt);
      } else if (tag === 'P') {
        // Paragraph size class (Paragraph 1 = large, Paragraph 2 = medium).
        const cls = ch.getAttribute('class');
        if (cls === 'rt-p1' || cls === 'rt-p2') clean.setAttribute('class', cls);
      }
      const style = cleanStyle(ch.getAttribute('style'));
      if (style) clean.setAttribute('style', style);
      if (!VOID[tag]) walk(ch, clean);
      out.appendChild(clean);
    });
  }

  function sanitize(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const out = document.createElement('div');
    walk(doc.body, out);
    return out.innerHTML;
  }

  window.RichText = { sanitize };
})();
