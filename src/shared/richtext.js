// Tiny client-side HTML sanitizer for richtext bodies. Mirrors the server
// allowlist (routes/pages.js) so what you type/see in the editor matches what
// gets stored + rendered. Parses with DOMParser (scripts in a parsed document
// never run), then rebuilds the tree keeping only allowlisted tags/attributes.
//
//   window.RichText.sanitize(htmlString) -> safe htmlString
(function () {
  const ALLOWED = { P: 1, BR: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, H2: 1, H3: 1, UL: 1, OL: 1, LI: 1, A: 1 };
  const RENAME = { DIV: 'P' }; // contenteditable often wraps lines in <div>

  function cleanUrl(u) {
    const v = String(u || '').trim();
    if (/^(https?:|mailto:|tel:)/i.test(v) || v.startsWith('/') || v.startsWith('#')) return v;
    return '';
  }

  function walk(node, out) {
    node.childNodes.forEach((ch) => {
      if (ch.nodeType === 3) { out.appendChild(document.createTextNode(ch.nodeValue)); return; }
      if (ch.nodeType !== 1) return;
      const tag = RENAME[ch.tagName] || ch.tagName;
      if (ALLOWED[tag]) {
        const clean = document.createElement(tag);
        if (tag === 'A') {
          const href = cleanUrl(ch.getAttribute('href'));
          if (href) {
            clean.setAttribute('href', href);
            clean.setAttribute('target', '_blank');
            clean.setAttribute('rel', 'noopener noreferrer');
          }
        }
        walk(ch, clean);
        out.appendChild(clean);
      } else {
        // Drop the tag but keep its (cleaned) contents.
        walk(ch, out);
      }
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
