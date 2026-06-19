// Reusable accessible popover menu.
//
//   Popover.open(anchorEl, items, opts)   -> open a menu now
//   Popover.attach(anchorEl, getItems, opts) -> open on click (getItems may be
//                                               a function, evaluated each open)
//
// items: [{ label, onSelect, disabled?, danger? }]
// opts:  { align: 'left' | 'right' (default 'right'), label?: aria-label }
//
// Behaviour: role="menu" with role="menuitem" children; Up/Down/Home/End move
// focus (skipping disabled), Enter/Space activate, Escape closes and restores
// focus to the anchor, Tab or an outside click closes. Only one menu is open at
// a time.
(function () {
  let current = null; // { menu, anchor, cleanup }

  function closeCurrent(restoreFocus) {
    if (!current) return;
    const { menu, anchor, onClose } = current;
    document.removeEventListener('click', current.onDocClick, true);
    document.removeEventListener('keydown', current.onDocKey, true);
    window.removeEventListener('resize', current.onReflow, true);
    window.removeEventListener('scroll', current.onReflow, true);
    menu.remove();
    anchor.setAttribute('aria-expanded', 'false');
    if (restoreFocus) anchor.focus();
    current = null;
    if (onClose) onClose();
  }

  function enabledItems(menu) {
    return Array.from(menu.querySelectorAll('.popover__item:not([aria-disabled="true"])'));
  }

  function focusByOffset(menu, dir) {
    const items = enabledItems(menu);
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement);
    let next;
    if (dir === 'home') next = 0;
    else if (dir === 'end') next = items.length - 1;
    else next = (idx + dir + items.length) % items.length;
    items[next].focus();
  }

  function position(menu, anchor, align) {
    const r = anchor.getBoundingClientRect();
    const top = window.scrollY + r.bottom + 4;
    menu.style.top = `${top}px`;
    // Measure width, then place. Clamp into the viewport with an 8px margin.
    const w = menu.offsetWidth;
    let left = align === 'left' ? window.scrollX + r.left : window.scrollX + r.right - w;
    const min = window.scrollX + 8;
    const max = window.scrollX + document.documentElement.clientWidth - w - 8;
    left = Math.max(min, Math.min(left, max));
    menu.style.left = `${left}px`;
  }

  function open(anchor, items, opts) {
    opts = opts || {};
    closeCurrent(false);

    const menu = document.createElement('div');
    menu.className = 'popover';
    menu.setAttribute('role', 'menu');
    if (opts.label) menu.setAttribute('aria-label', opts.label);

    items.forEach((it) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'popover__item' + (it.danger ? ' popover__item--danger' : '');
      b.setAttribute('role', 'menuitem');
      b.tabIndex = -1;
      b.textContent = it.label;
      if (it.disabled) {
        b.setAttribute('aria-disabled', 'true');
      } else {
        b.addEventListener('click', () => {
          closeCurrent(true);
          if (it.onSelect) it.onSelect();
        });
      }
      menu.appendChild(b);
    });

    document.body.appendChild(menu);
    anchor.setAttribute('aria-expanded', 'true');
    position(menu, anchor, opts.align || 'right');

    const onDocClick = (e) => {
      if (!menu.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) {
        closeCurrent(false);
      }
    };
    const onDocKey = (e) => {
      if (!current) return;
      switch (e.key) {
        case 'Escape': e.preventDefault(); closeCurrent(true); break;
        case 'ArrowDown': e.preventDefault(); focusByOffset(menu, +1); break;
        case 'ArrowUp': e.preventDefault(); focusByOffset(menu, -1); break;
        case 'Home': e.preventDefault(); focusByOffset(menu, 'home'); break;
        case 'End': e.preventDefault(); focusByOffset(menu, 'end'); break;
        case 'Tab': closeCurrent(false); break;
        default: break;
      }
    };
    const onReflow = () => current && position(menu, anchor, opts.align || 'right');

    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onDocKey, true);
    window.addEventListener('resize', onReflow, true);
    window.addEventListener('scroll', onReflow, true);

    current = { menu, anchor, onDocClick, onDocKey, onReflow, onClose: opts.onClose };

    const first = enabledItems(menu)[0];
    if (first) first.focus();
    return { close: () => closeCurrent(false) };
  }

  function attach(anchor, getItems, opts) {
    anchor.setAttribute('aria-haspopup', 'menu');
    anchor.setAttribute('aria-expanded', 'false');
    anchor.addEventListener('click', (e) => {
      e.stopPropagation();
      // Toggle: clicking the anchor while its own menu is open closes it.
      if (current && current.anchor === anchor) { closeCurrent(true); return; }
      const items = typeof getItems === 'function' ? getItems() : getItems;
      if (items && items.length) open(anchor, items, opts);
    });
  }

  window.Popover = { open, attach, close: () => closeCurrent(false) };
})();
