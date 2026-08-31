// Custom colour-picker popover (Figma 2766:50117) — replaces the native
// <input type="color"> everywhere in the product.
//
// Two variants, per the design:
//   Default        saturation/value area, hue + opacity sliders, format
//                  dropdown, hex + opacity fields.
//   Accessibility  the same, plus a contrast-ratio panel (WCAG AA / AAA).
//                  Used only by the page-element Colors, where a colour is
//                  being chosen against another colour it must read against.
//
// Usage — upgrade() keeps existing code working untouched: the native input
// stays in the DOM (hidden) as the value carrier, so consumers that read
// `input.value` and listen for `input` events need no changes.
//
//   window.ColorPicker.upgrade(nativeInput, {
//     opacityInput: el || null,   // optional sibling that holds 0-100
//     contrast: () => ({ against: '#RRGGBB', role: 'foreground' }) | null,
//     label: 'Heading',
//   });
//
// Positioning + dismissal follow shared/popover.js conventions (appended to
// <body>, anchored, closed on outside click / Escape / reflow); that module's
// API is menu-shaped (it builds items), so it can't be reused directly here.
(function () {
  var WIDTH = 260;
  var GAP = 6;

  // ---- colour maths ----
  var clamp = function (n, lo, hi) { return Math.max(lo, Math.min(hi, n)); };
  var HEX_RE = /^#?([0-9a-f]{6})$/i;
  function parseHex(v) {
    var m = HEX_RE.exec(String(v || '').trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  var hex2 = function (n) { var s = clamp(Math.round(n), 0, 255).toString(16); return s.length < 2 ? '0' + s : s; };
  var toHex = function (c) { return ('#' + hex2(c.r) + hex2(c.g) + hex2(c.b)).toUpperCase(); };
  function rgbToHsv(c) {
    var r = c.r / 255, g = c.g / 255, b = c.b / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    var h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h: h * 360, s: max ? d / max : 0, v: max };
  }
  function hsvToRgb(hsv) {
    var h = ((hsv.h % 360) + 360) % 360 / 60, s = clamp(hsv.s, 0, 1), v = clamp(hsv.v, 0, 1);
    var i = Math.floor(h), f = h - i;
    var p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
    var m = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
    return { r: m[0] * 255, g: m[1] * 255, b: m[2] * 255 };
  }
  // WCAG 2.1 relative luminance + contrast ratio.
  function luminance(c) {
    var a = [c.r, c.g, c.b].map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function contrastRatio(a, b) {
    var l1 = luminance(a), l2 = luminance(b);
    if (l2 > l1) { var t = l1; l1 = l2; l2 = t; }
    return (l1 + 0.05) / (l2 + 0.05);
  }

  // Badge copy, keyed by level. WCAG 2.1 sets a different bar per text size, so
  // each level has three outcomes: clears the normal-text bar, clears only the
  // large-text bar, or clears neither. "Large" is 18pt/24px regular, or
  // 14pt/18.66px bold.
  //   AA   normal 4.5:1   large 3:1
  //   AAA  normal 7:1     large 4.5:1
  // The badge itself is green only when the NORMAL-text bar is met — the strict
  // reading, since these colours are mostly body and heading text. The
  // large-text-only tooltip therefore also names what is still missing, so a
  // grey badge never contradicts its own tooltip.
  var VERDICTS = {
    aa: {
      normal: 4.5,
      large: 3,
      passNormal: 'Passes WCAG AA for normal text. Meets the minimum required contrast ratio of 4.5:1.',
      passLarge: 'Passes WCAG AA for large text. Meets the minimum required contrast ratio of 3:1. Normal text requires 4.5:1.',
      fail: 'Requires a minimum contrast ratio of 4.5:1. Increase the contrast between the text and background to meet this requirement.',
    },
    aaa: {
      normal: 7,
      large: 4.5,
      passNormal: 'Passes WCAG AAA for normal text. Meets the minimum required contrast ratio of 7:1.',
      passLarge: 'Passes WCAG AAA for large text. Meets the minimum required contrast ratio of 4.5:1. Normal text requires 7:1.',
      fail: 'Requires a minimum contrast ratio of 7:1. Increase the contrast between the text and background to meet this level.',
    },
  };

  // Call `onSet` whenever this element's .value is assigned. Scoped to the one
  // element (the accessor delegates to the prototype's), so nothing else in the
  // page is affected.
  var VALUE_DESC = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  function watchValue(el, onSet) {
    if (!VALUE_DESC || !VALUE_DESC.get || !VALUE_DESC.set) return; // fall back to events
    Object.defineProperty(el, 'value', {
      configurable: true,
      enumerable: true,
      get: function () { return VALUE_DESC.get.call(this); },
      set: function (v) { VALUE_DESC.set.call(this, v); onSet(); },
    });
  }

  // ---- singleton popover ----
  var open = null; // { pop, anchor, teardown }
  function closeOpen() {
    if (!open) return;
    document.removeEventListener('pointerdown', open.onDocDown, true);
    document.removeEventListener('keydown', open.onDocKey, true);
    window.removeEventListener('resize', open.onReflow, true);
    window.removeEventListener('scroll', open.onReflow, true);
    open.pop.remove();
    open.anchor.setAttribute('aria-expanded', 'false');
    open = null;
  }
  function place(pop, anchor) {
    var r = anchor.getBoundingClientRect();
    var h = pop.offsetHeight;
    var top = r.bottom + GAP;
    if (top + h > window.innerHeight - 8 && r.top - GAP - h > 8) top = r.top - GAP - h;
    pop.style.top = clamp(top, 8, Math.max(8, window.innerHeight - h - 8)) + 'px';
    pop.style.left = clamp(r.left, 8, Math.max(8, window.innerWidth - WIDTH - 8)) + 'px';
  }

  // Drag a value out of a track: reports 0..1 on both axes.
  function draggable(el, onMove) {
    var report = function (e) {
      var r = el.getBoundingClientRect();
      onMove(clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1));
    };
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      report(e);
      var move = function (ev) { report(ev); };
      var up = function () {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  }

  function build(state, opts, commit) {
    var pop = document.createElement('div');
    pop.className = 'cpick';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', (opts.label ? opts.label + ' ' : '') + 'colour picker');
    pop.innerHTML =
      '<div class="cpick__top">' +
        '<div class="cpick__area" tabindex="0" role="application" aria-label="Saturation and brightness">' +
          '<span class="cpick__areaknob"></span>' +
        '</div>' +
        '<div class="cpick__sliders">' +
          '<div class="cpick__hue" tabindex="0" role="slider" aria-label="Hue" aria-valuemin="0" aria-valuemax="360"><span class="cpick__knob"></span></div>' +
          (opts.opacityInput ? '<div class="cpick__alpha" tabindex="0" role="slider" aria-label="Opacity" aria-valuemin="0" aria-valuemax="100"><span class="cpick__alphafill"></span><span class="cpick__knob"></span></div>' : '') +
          '<label class="cpick__formatwrap"><span class="sr-only">Colour format</span>' +
            '<select class="cpick__format"><option value="hex">Hex</option></select></label>' +
          '<div class="cpick__fields">' +
            '<input type="text" class="cpick__hex" spellcheck="false" autocomplete="off" maxlength="7" aria-label="Hex value" />' +
            // Opacity is only offered where the host has somewhere to store it;
            // otherwise the control would be visible but inert.
            (opts.opacityInput ? '<span class="cpick__opacity"><input type="number" class="cpick__opacityval" min="0" max="100" aria-label="Opacity percent" /><span aria-hidden="true">%</span></span>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +
      (opts.contrast ?
        '<div class="cpick__contrast">' +
          '<p class="cpick__contrastlabel">Contrast ratio</p>' +
          '<div class="cpick__contrastrow">' +
            '<span class="cpick__pair"><span class="cpick__pairbg"></span><span class="cpick__pairfg"></span></span>' +
            '<span class="cpick__ratio"></span>' +
            '<span class="cpick__badges">' +
              '<span class="cpick__badge" data-badge="aa" tabindex="0" data-tip-wide data-tip-pos="bottom-end"><span class="cpick__badgeicon" aria-hidden="true"></span>AA</span>' +
              '<span class="cpick__badge" data-badge="aaa" tabindex="0" data-tip-wide data-tip-pos="bottom-end"><span class="cpick__badgeicon" aria-hidden="true"></span>AAA</span>' +
            '</span>' +
          '</div>' +
        '</div>' : '');

    var q = function (s) { return pop.querySelector(s); };
    var area = q('.cpick__area'), areaKnob = q('.cpick__areaknob');
    var hue = q('.cpick__hue'), hueKnob = hue.querySelector('.cpick__knob');
    var alpha = q('.cpick__alpha'), alphaFill = q('.cpick__alphafill');
    var alphaKnob = alpha ? alpha.querySelector('.cpick__knob') : null;
    var hexIn = q('.cpick__hex'), opIn = q('.cpick__opacityval');

    function paint(skipInputs) {
      var rgb = hsvToRgb(state.hsv);
      var hexStr = toHex(rgb);
      var hueCss = 'hsl(' + Math.round(state.hsv.h) + ', 100%, 50%)';
      area.style.setProperty('--cpick-hue', hueCss);
      areaKnob.style.left = (state.hsv.s * 100) + '%';
      areaKnob.style.top = ((1 - state.hsv.v) * 100) + '%';
      areaKnob.style.background = hexStr;
      hueKnob.style.left = (state.hsv.h / 360 * 100) + '%';
      hue.setAttribute('aria-valuenow', String(Math.round(state.hsv.h)));
      if (alpha) {
        alphaFill.style.background = 'linear-gradient(to right, rgba(0,0,0,0), ' + hexStr + ')';
        alphaKnob.style.left = state.opacity + '%';
        alphaKnob.style.background = hexStr;
        alpha.setAttribute('aria-valuenow', String(state.opacity));
      }
      if (!skipInputs) {
        hexIn.value = hexStr;
        if (opIn) opIn.value = String(state.opacity);
      }
      if (opts.contrast) paintContrast(hexStr);
      commit(hexStr, state.opacity);
    }

    function paintContrast(hexStr) {
      var info = opts.contrast() || {};
      var other = parseHex(info.against) || { r: 255, g: 255, b: 255 };
      var mine = parseHex(hexStr);
      var fg = info.role === 'background' ? other : mine;
      var bg = info.role === 'background' ? mine : other;
      q('.cpick__pairbg').style.background = toHex(bg);
      q('.cpick__pairfg').style.background = toHex(fg);
      var ratio = contrastRatio(fg, bg);
      q('.cpick__ratio').textContent = (Math.round(ratio * 100) / 100).toFixed(2) + ' : 1';
      // Each badge picks one of its three size-aware verdicts (see VERDICTS) and
      // shows it through the shared [data-tooltip].
      Object.keys(VERDICTS).forEach(function (key) {
        var v = VERDICTS[key];
        var el = pop.querySelector('[data-badge="' + key + '"]');
        var pass = ratio >= v.normal;
        var text = pass ? v.passNormal : (ratio >= v.large ? v.passLarge : v.fail);
        el.classList.toggle('is-pass', pass);
        el.setAttribute('data-tooltip', text);
        el.setAttribute('aria-label', text);
      });
    }

    draggable(area, function (x, y) { state.hsv.s = x; state.hsv.v = 1 - y; paint(); });
    draggable(hue, function (x) { state.hsv.h = x * 360; paint(); });
    if (alpha) draggable(alpha, function (x) { state.opacity = Math.round(x * 100); paint(); });

    hexIn.addEventListener('input', function () {
      var rgb = parseHex(hexIn.value);
      if (!rgb) return;
      state.hsv = rgbToHsv(rgb);
      paint(true);
    });
    hexIn.addEventListener('blur', function () { paint(); });
    if (opIn) {
      opIn.addEventListener('input', function () {
        var n = parseInt(opIn.value, 10);
        if (isNaN(n)) return;
        state.opacity = clamp(n, 0, 100);
        paint(true);
      });
      opIn.addEventListener('blur', function () { paint(); });
    }

    // Keyboard nudging on the two sliders and the area.
    var arrows = function (el, onDelta) {
      el.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : (e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0);
        if (!d) return;
        e.preventDefault();
        onDelta(d * (e.shiftKey ? 10 : 1), e.key === 'ArrowUp' || e.key === 'ArrowDown');
      });
    };
    arrows(hue, function (d) { state.hsv.h = ((state.hsv.h + d) % 360 + 360) % 360; paint(); });
    if (alpha) arrows(alpha, function (d) { state.opacity = clamp(state.opacity + d, 0, 100); paint(); });
    arrows(area, function (d, vertical) {
      if (vertical) state.hsv.v = clamp(state.hsv.v + d / 100, 0, 1);
      else state.hsv.s = clamp(state.hsv.s + d / 100, 0, 1);
      paint();
    });

    paint();
    return pop;
  }

  function openFor(anchor, opts, getValue, commit) {
    var v = getValue();
    var rgb = parseHex(v.color) || { r: 255, g: 255, b: 255 };
    var state = { hsv: rgbToHsv(rgb), opacity: clamp(v.opacity, 0, 100) };
    var pop = build(state, opts, commit);
    document.body.appendChild(pop);
    anchor.setAttribute('aria-expanded', 'true');
    place(pop, anchor);

    var onDocDown = function (e) {
      if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closeOpen();
    };
    var onDocKey = function (e) { if (e.key === 'Escape') { e.preventDefault(); closeOpen(); anchor.focus(); } };
    var onReflow = function () { if (open) place(pop, anchor); };
    document.addEventListener('pointerdown', onDocDown, true);
    document.addEventListener('keydown', onDocKey, true);
    window.addEventListener('resize', onReflow, true);
    window.addEventListener('scroll', onReflow, true);
    open = { pop: pop, anchor: anchor, onDocDown: onDocDown, onDocKey: onDocKey, onReflow: onReflow };
  }

  // Replace a native colour input with a swatch button + this picker. The input
  // stays as the value carrier so existing listeners keep working.
  function upgrade(input, opts) {
    if (!input || input.dataset.cpickUpgraded) return;
    opts = opts || {};
    input.dataset.cpickUpgraded = '1';

    // Either adopt an element the host already renders as the swatch, or insert
    // a button carrying the input's own classes so it inherits its size/border.
    var btn;
    if (opts.trigger) {
      btn = opts.trigger;
      btn.tabIndex = 0;
      btn.setAttribute('role', 'button');
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
      });
    } else {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = input.className;
      input.parentNode.insertBefore(btn, input);
    }
    btn.classList.add('cpick__trigger');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    if (!btn.getAttribute('aria-label')) {
      btn.setAttribute('aria-label', input.getAttribute('aria-label') || (opts.label || 'Colour'));
    }
    input.hidden = true;
    input.tabIndex = -1;

    var opacityInput = opts.opacityInput || null;
    var readOpacity = function () {
      if (!opacityInput) return 100;
      var n = parseInt(opacityInput.value, 10);
      return isNaN(n) ? 100 : clamp(n, 0, 100);
    };
    // Painted inline, not via a class: the button inherits the host's swatch
    // class (e.g. .colorrow__swatch sets `background: none`) and an inline style
    // is the only thing guaranteed to win regardless of stylesheet order.
    var CHECKS = 'linear-gradient(45deg,#d7d8da 25%,transparent 25%,transparent 75%,#d7d8da 75%)';
    var reflectSwatch = function () {
      // opts.paint === false: the host already renders the swatch itself (and
      // keeps it current from the input event we dispatch), so leave it alone.
      if (opts.paint === false) return;
      var rgb = parseHex(input.value) || { r: 255, g: 255, b: 255 };
      var fill = 'rgba(' + Math.round(rgb.r) + ',' + Math.round(rgb.g) + ',' + Math.round(rgb.b) + ',' + (readOpacity() / 100) + ')';
      btn.style.backgroundColor = '#fff';
      btn.style.backgroundImage = 'linear-gradient(' + fill + ',' + fill + '),' + CHECKS + ',' + CHECKS;
      btn.style.backgroundSize = '100% 100%, 8px 8px, 8px 8px';
      btn.style.backgroundPosition = '0 0, 0 0, 4px 4px';
    };

    var getValue = function () { return { color: (input.value || '#FFFFFF').toUpperCase(), opacity: readOpacity() }; };
    // Only dispatch when a value actually moved: the host's `input` listeners
    // mark the page dirty, so echoing an unchanged value would fake an edit.
    var commit = function (hexStr, opacity) {
      if ((input.value || '').toUpperCase() !== hexStr) {
        input.value = hexStr;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (opacityInput && String(readOpacity()) !== String(opacity)) {
        opacityInput.value = String(opacity);
        opacityInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      reflectSwatch();
    };

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (open && open.anchor === btn) { closeOpen(); return; }
      closeOpen();
      openFor(btn, opts, getValue, commit);
    });
    // Keep the swatch in step when the host updates the value itself.
    //
    // Events alone are not enough: every host writes `swatch.value = …` directly
    // — from its hex-field handler, and again when the saved config lands — and
    // assigning .value fires nothing. That left the swatch showing a stale colour
    // while the hex field showed the real one. So intercept writes on these two
    // elements and repaint, which covers every path (including the inline
    // pre-paint scripts) without each host having to remember to tell us.
    watchValue(input, reflectSwatch);
    input.addEventListener('input', reflectSwatch);
    if (opacityInput) {
      watchValue(opacityInput, reflectSwatch);
      opacityInput.addEventListener('input', reflectSwatch);
    }
    reflectSwatch();
    return { refresh: reflectSwatch };
  }

  window.ColorPicker = { upgrade: upgrade };
})();
