// Reusable accessible sortable tree.
//
//   SortableTree.create(container, {
//     items,                 // [{ id, children:[...], ...host data }]
//     maxDepth: 2,           // parent + one level of subpages
//     renderContent(item),   // -> Node   (the label area)
//     renderTrailing(item),  // -> Node|null (e.g. a kebab menu button)
//     itemAttrs(item),       // -> { className?, disabled?, draggable? }  (optional)
//     labelOf(item),         // -> string  (used in announcements / aria-labels)
//     onChange(items),       // called after any reorder / nesting change
//   })  ->  { getItems(), setItems(items), render(), destroy() }
//
// Two equivalent ways to reorder:
//  • Pointer: drag the handle vertically to reorder; drag right/left to nest /
//    un-nest (depth is projected from the horizontal offset).
//  • Keyboard: focus a handle, press Space/Enter to pick up, then Arrow Up/Down
//    to move within the level, Arrow Right/Left to nest / un-nest, Space/Enter
//    to drop, Escape to cancel. Every change is announced via an aria-live
//    region. This is the accessible equivalent of the drag interaction.
(function () {
  const GRIP =
    '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
    '<circle cx="5.5" cy="3" r="1.3"/><circle cx="10.5" cy="3" r="1.3"/>' +
    '<circle cx="5.5" cy="8" r="1.3"/><circle cx="10.5" cy="8" r="1.3"/>' +
    '<circle cx="5.5" cy="13" r="1.3"/><circle cx="10.5" cy="13" r="1.3"/></svg>';

  const clone = (x) => JSON.parse(JSON.stringify(x));

  function create(container, opts) {
    const maxDepth = opts.maxDepth || 2; // depths are 0..(maxDepth-1)
    let model = clone(opts.items || []);
    let grabbedId = null;
    let snapshot = null; // model at pick-up time, for cancel

    // --- aria-live announcer + keyboard instructions (built once) ---
    const live = document.createElement('div');
    live.className = 'sr-only';
    live.setAttribute('aria-live', 'assertive');
    live.setAttribute('aria-atomic', 'true');
    const instr = document.createElement('div');
    instr.className = 'sr-only';
    instr.id = `navtree-instr-${Math.floor(performance.now())}`;
    instr.textContent =
      'Press Space or Enter to pick up. Use Arrow Up and Down to move within the level, ' +
      'Arrow Right to make it a subpage, Arrow Left to move it out. Press Space or Enter to drop, Escape to cancel.';

    const listEl = document.createElement('ul');
    listEl.className = 'navtree';
    listEl.setAttribute('role', 'tree');
    if (opts.ariaLabel) listEl.setAttribute('aria-label', opts.ariaLabel);

    container.appendChild(instr);
    container.appendChild(live);
    container.appendChild(listEl);

    function announce(msg) { live.textContent = msg; }
    function labelOf(item) { return (opts.labelOf && opts.labelOf(item)) || item.label || 'item'; }

    // ---------- model helpers ----------
    // Find an item's container array + index + parent, by id.
    function locate(items, id, parent) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].id === id) return { siblings: items, index: i, parent };
        const inChild = locate(items[i].children || [], id, items[i]);
        if (inChild) return inChild;
      }
      return null;
    }

    function flatten(items, depth, parent, out) {
      out = out || [];
      items.forEach((it) => {
        out.push({ id: it.id, item: it, depth, parentId: parent ? parent.id : null });
        if (it.children && it.children.length) flatten(it.children, depth + 1, it, out);
      });
      return out;
    }

    function siblingPos(id) {
      const loc = locate(model, id);
      return { pos: loc.index + 1, count: loc.siblings.length, parent: loc.parent };
    }

    function levelText(id) {
      const { pos, count, parent } = siblingPos(id);
      return parent
        ? `subpage ${pos} of ${count} under ${labelOf(parent)}`
        : `top level, position ${pos} of ${count}`;
    }

    // ---------- keyboard move operations ----------
    function moveWithinSiblings(id, dir) {
      const loc = locate(model, id);
      const target = loc.index + dir;
      if (target < 0 || target >= loc.siblings.length) return false;
      const [it] = loc.siblings.splice(loc.index, 1);
      loc.siblings.splice(target, 0, it);
      return true;
    }

    function indent(id) {
      const loc = locate(model, id);
      if (loc.index === 0) return false;            // needs a preceding sibling to nest under
      const it = loc.siblings[loc.index];
      if (it.children && it.children.length) return false; // would exceed max depth
      const prev = loc.siblings[loc.index - 1];
      // depth of prev's children must stay < maxDepth
      const prevDepth = depthOf(model, prev.id, 0);
      if (prevDepth + 1 >= maxDepth) return false;
      loc.siblings.splice(loc.index, 1);
      prev.children = prev.children || [];
      prev.children.push(it);
      return true;
    }

    function outdent(id) {
      const loc = locate(model, id);
      if (!loc.parent) return false; // already top level
      const parentLoc = locate(model, loc.parent.id);
      const it = loc.siblings.splice(loc.index, 1)[0];
      parentLoc.siblings.splice(parentLoc.index + 1, 0, it);
      return true;
    }

    function depthOf(items, id, depth) {
      for (const it of items) {
        if (it.id === id) return depth;
        const d = depthOf(it.children || [], id, depth + 1);
        if (d !== -1) return d;
      }
      return -1;
    }

    // ---------- grab / drop ----------
    function pickUp(id) {
      grabbedId = id;
      snapshot = clone(model);
      render();
      announce(`${labelOf(itemById(id))} picked up. ${levelText(id)}.`);
    }
    function drop() {
      const id = grabbedId;
      grabbedId = null;
      snapshot = null;
      render();
      announce(`${labelOf(itemById(id))} dropped. ${levelText(id)}.`);
      emitChange();
    }
    function cancel() {
      const id = grabbedId;
      model = snapshot || model;
      grabbedId = null;
      snapshot = null;
      render();
      announce(`Move cancelled. ${labelOf(itemById(id))} returned to its original position.`);
    }

    function itemById(id) {
      const loc = locate(model, id);
      return loc ? loc.siblings[loc.index] : { label: 'item' };
    }

    function doKeyOp(kind) {
      let ok;
      if (kind === 'up') ok = moveWithinSiblings(grabbedId, -1);
      else if (kind === 'down') ok = moveWithinSiblings(grabbedId, +1);
      else if (kind === 'indent') ok = indent(grabbedId);
      else if (kind === 'outdent') ok = outdent(grabbedId);
      if (!ok) { announce(`Can’t move ${kind === 'indent' || kind === 'outdent' ? '' : 'further '}${kind}.`); return; }
      const id = grabbedId;
      render();
      if (kind === 'indent') announce(`${labelOf(itemById(id))} is now a subpage of ${labelOf(siblingPos(id).parent)}.`);
      else if (kind === 'outdent') announce(`${labelOf(itemById(id))} moved out. ${levelText(id)}.`);
      else announce(`${labelOf(itemById(id))}. ${levelText(id)}.`);
    }

    function onHandleKey(e, id) {
      const k = e.key;
      if (grabbedId === id) {
        if (k === ' ' || k === 'Enter') { e.preventDefault(); drop(); }
        else if (k === 'Escape') { e.preventDefault(); cancel(); }
        else if (k === 'ArrowUp') { e.preventDefault(); doKeyOp('up'); }
        else if (k === 'ArrowDown') { e.preventDefault(); doKeyOp('down'); }
        else if (k === 'ArrowLeft') { e.preventDefault(); doKeyOp('outdent'); }
        else if (k === 'ArrowRight') { e.preventDefault(); doKeyOp('indent'); }
      } else if (k === ' ' || k === 'Enter') {
        e.preventDefault();
        pickUp(id);
      }
    }

    // ---------- pointer drag ----------
    let drag = null; // { id, startX, startY, indicator }

    function onHandlePointerDown(e, id) {
      if (e.button !== undefined && e.button !== 0) return;
      if (grabbedId) return; // keyboard grab in progress
      e.preventDefault();
      const handle = e.currentTarget;
      handle.setPointerCapture && handle.setPointerCapture(e.pointerId);
      drag = { id, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId, projection: null, moved: false };
      listEl.classList.add('navtree--dragging');
      const row = listEl.querySelector(`.navtree__item[data-id="${cssEsc(id)}"]`);
      if (row) row.classList.add('is-dragging');
      window.addEventListener('pointermove', onPointerMove, true);
      window.addEventListener('pointerup', onPointerUp, true);
    }

    function indentWidth() { return 28; }

    function onPointerMove(e) {
      if (!drag) return;
      if (Math.abs(e.clientY - drag.startY) > 3 || Math.abs(e.clientX - drag.startX) > 3) drag.moved = true;
      const proj = project(e.clientX, e.clientY);
      drag.projection = proj;
      showIndicator(proj);
    }

    function onPointerUp() {
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      listEl.classList.remove('navtree--dragging');
      const proj = drag && drag.projection;
      const id = drag && drag.id;
      hideIndicator();
      const moved = drag && drag.moved;
      drag = null;
      if (moved && proj && id) {
        applyProjection(id, proj);
        render();
        emitChange();
        announce(`${labelOf(itemById(id))} moved. ${levelText(id)}.`);
      } else {
        render();
      }
    }

    // Project a pointer position to { parentId, index, depth } using the
    // flattened list (excluding the dragged subtree).
    function project(px, py) {
      const active = drag.id;
      const subtreeIds = collectIds(itemById(active));
      const flat = flatten(model, 0, null).filter((f) => !subtreeIds.has(f.id));
      // find insertion index by row midpoints
      let overIndex = flat.length;
      for (let i = 0; i < flat.length; i++) {
        const el = listEl.querySelector(`.navtree__item[data-id="${cssEsc(flat[i].id)}"] > .navtree__row`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (py < r.top + r.height / 2) { overIndex = i; break; }
      }
      const prev = flat[overIndex - 1];
      const next = flat[overIndex];
      const dragDepth = Math.round((px - drag.startX) / indentWidth());
      const activeHasChildren = (itemById(active).children || []).length > 0;
      let maxd = prev ? prev.depth + 1 : 0;
      if (maxDepth) maxd = Math.min(maxd, maxDepth - 1);
      if (activeHasChildren) maxd = Math.min(maxd, 0); // a parent can't be nested (depth budget)
      const mind = next ? next.depth : 0;
      let depth = Math.max(mind, Math.min((prev ? prev.depth : 0) + dragDepth, maxd));
      let parentId = null;
      if (prev) {
        if (depth === prev.depth) parentId = prev.parentId;
        else if (depth > prev.depth) parentId = prev.id;
        else {
          // walk back to an ancestor sitting at depth-1
          for (let i = overIndex - 1; i >= 0; i--) {
            if (flat[i].depth === depth - 1) { parentId = flat[i].id; break; }
          }
        }
      }
      // index among the projected parent's children
      let index = 0;
      for (let i = 0; i < overIndex; i++) if (flat[i].parentId === parentId) index++;
      return { parentId, index, depth };
    }

    function applyProjection(id, proj) {
      const it = itemById(id);
      // remove from current location
      const loc = locate(model, id);
      loc.siblings.splice(loc.index, 1);
      // insert into target
      const targetArr = proj.parentId ? itemById(proj.parentId).children : model;
      if (proj.parentId) itemById(proj.parentId).children = targetArr;
      const arr = proj.parentId ? itemById(proj.parentId).children : model;
      const clamped = Math.max(0, Math.min(proj.index, arr.length));
      arr.splice(clamped, 0, it);
    }

    function collectIds(item, set) {
      set = set || new Set();
      set.add(item.id);
      (item.children || []).forEach((c) => collectIds(c, set));
      return set;
    }

    // drop indicator (a line at the projected gap)
    let indicatorEl = null;
    function showIndicator(proj) {
      if (!proj) return;
      if (!indicatorEl) {
        indicatorEl = document.createElement('div');
        indicatorEl.className = 'navtree__drop';
        listEl.appendChild(indicatorEl);
      }
      const flat = flatten(model, 0, null).filter((f) => !collectIds(itemById(drag.id)).has(f.id));
      const before = flat.filter((f) => f.parentId === proj.parentId)[proj.index];
      let top;
      const listRect = listEl.getBoundingClientRect();
      if (before) {
        const el = listEl.querySelector(`.navtree__item[data-id="${cssEsc(before.id)}"] > .navtree__row`);
        top = el.getBoundingClientRect().top - listRect.top;
      } else {
        const flatAll = flatten(model, 0, null).filter((f) => !collectIds(itemById(drag.id)).has(f.id));
        const last = flatAll[flatAll.length - 1];
        const el = last && listEl.querySelector(`.navtree__item[data-id="${cssEsc(last.id)}"] > .navtree__row`);
        top = el ? el.getBoundingClientRect().bottom - listRect.top : 0;
      }
      indicatorEl.style.top = `${top}px`;
      indicatorEl.style.marginLeft = `${proj.depth * indentWidth()}px`;
      indicatorEl.hidden = false;
    }
    function hideIndicator() { if (indicatorEl) indicatorEl.hidden = true; }

    function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

    function emitChange() { if (opts.onChange) opts.onChange(getItems()); }
    function getItems() { return clone(model); }

    // ---------- render ----------
    function buildItem(item, depth) {
      const li = document.createElement('li');
      li.className = 'navtree__item';
      li.dataset.id = item.id;
      li.dataset.depth = depth;
      li.setAttribute('role', 'treeitem');
      li.setAttribute('aria-level', depth + 1);
      const attrs = (opts.itemAttrs && opts.itemAttrs(item)) || {};
      if (attrs.className) li.className += ' ' + attrs.className;
      if (attrs.disabled) li.setAttribute('aria-disabled', 'true');
      if (grabbedId === item.id) li.classList.add('is-grabbed');

      const row = document.createElement('div');
      row.className = 'navtree__row';

      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'navtree__handle';
      handle.innerHTML = GRIP;
      handle.setAttribute('aria-describedby', instr.id);
      handle.setAttribute('aria-label',
        `Reorder ${labelOf(item)}. ${grabbedId === item.id ? 'Currently grabbed. ' : ''}${levelText(item.id)}.`);
      handle.addEventListener('keydown', (e) => onHandleKey(e, item.id));
      handle.addEventListener('pointerdown', (e) => onHandlePointerDown(e, item.id));
      row.appendChild(handle);

      const content = document.createElement('div');
      content.className = 'navtree__content';
      const c = opts.renderContent && opts.renderContent(item);
      if (c) content.appendChild(c);
      row.appendChild(content);

      const actions = document.createElement('div');
      actions.className = 'navtree__actions';
      const t = opts.renderTrailing && opts.renderTrailing(item);
      if (t) actions.appendChild(t);
      row.appendChild(actions);

      li.appendChild(row);

      if (item.children && item.children.length && depth + 1 < maxDepth) {
        const ul = document.createElement('ul');
        ul.className = 'navtree__children';
        ul.setAttribute('role', 'group');
        item.children.forEach((ch) => ul.appendChild(buildItem(ch, depth + 1)));
        li.appendChild(ul);
      }
      return li;
    }

    function render() {
      listEl.innerHTML = '';
      indicatorEl = null;
      model.forEach((it) => listEl.appendChild(buildItem(it, 0)));
      if (grabbedId) {
        const h = listEl.querySelector(`.navtree__item[data-id="${cssEsc(grabbedId)}"] > .navtree__row > .navtree__handle`);
        if (h) h.focus();
      }
    }

    function setItems(items) { model = clone(items || []); grabbedId = null; render(); }
    function destroy() { listEl.remove(); live.remove(); instr.remove(); }

    render();
    return { getItems, setItems, render, destroy, isEmpty: () => model.length === 0 };
  }

  window.SortableTree = { create };
})();
