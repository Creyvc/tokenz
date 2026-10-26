// WakeSlider in plain JavaScript: a row of bars that fills up to the value, with a wave that
// lifts the bars around the handle while it moves and settles when it stops. Same maths and
// settings as the React WakeSlider component; its useSpring/useVelocity springs are simulated
// here, one small step at a time, on each animation frame. This site has no build step, so it
// can't use React or the motion library.
//
//   var slider = WakeSlider(element, { min: 1, max: 74, value: 48, onChange: function (v) {} });
//   slider.set({ min, max, value, floor, disabled }) and slider.positionOf(value) (0 to 1).
// With barWidth set, the number of bars follows the slider's width so each bar stays that thin.
(function () {
  var SETTLE = 9.23;
  var FULL_SPEED = 320;
  var MIN_REACH = 1.5;
  var FLAT = 0.002;
  var STEP_SECONDS = 0.004;  // spring simulation step

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function smoothstep(s) { return s * s * (3 - 2 * s); }
  function toPct(v, min, max) { return max > min ? ((v - min) / (max - min)) * 100 : 0; }
  function snap(v, min, max, step) {
    if (!(max > min)) return min;
    if (!(step > 0)) return clamp(v, min, max);
    var lastWhole = min + Math.floor(+((max - min) / step).toFixed(6)) * step;
    var grid = clamp(Math.round((v - min) / step) * step + min, min, lastWhole);
    return +(lastWhole < max && Math.abs(v - max) <= Math.abs(v - grid) ? max : grid).toFixed(6);
  }
  function stillPlease() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  window.WakeSlider = function (root, options) {
    var o = Object.assign({
      min: 0, max: 100, step: 1, value: 50, bars: 32, height: 56, restHeight: 12, gap: 4,
      fillColor: "#f5f5f5", trackColor: "#27272a", sensitivity: 1, reach: 6, skew: 0.6,
      glide: 0.3, smoothing: 100, ariaLabel: "Value", disabled: false, onChange: null,
      barWidth: null, onLayout: null
    }, options || {});
    var min = o.min, max = o.max, step = o.step;
    var value = clamp(o.value, min, max);
    var floor = null;
    var rest = Math.min(o.restHeight, o.height - 1) / o.height;

    // The head follows the target on a critically damped spring; "speed" follows the head's
    // velocity on a softer one. Both settings come from glide and smoothing, as in the original.
    var w0 = SETTLE / o.glide;
    var wv = 2000 / o.smoothing;
    var target = toPct(value, min, max);
    var head = { x: target, v: 0 };
    var speed = { x: 0, v: 0 };
    var lastAmp = 0, frameId = null, lastTime = 0, pointerId = null;

    // Markup: the bars, with a see-through button over them that is the focusable slider
    root.classList.add("wake-slider");
    root.style.setProperty("--ws-fill", o.fillColor);
    root.style.setProperty("--ws-track", o.trackColor);
    root.style.setProperty("--ws-height", o.height + "px");
    root.style.setProperty("--ws-gap", o.gap + "px");
    root.style.setProperty("--ws-rest", rest);
    var track = document.createElement("div");
    track.className = "wake-slider__track";
    var bars = [];
    function buildBars(count) {
      bars.forEach(function (bar) { bar.remove(); });
      bars = [];
      o.bars = count;
      for (var i = 0; i < count; i++) {
        var bar = document.createElement("span");
        bar.className = "wake-slider__bar";
        bars.push(bar);
        track.insertBefore(bar, handle);
      }
    }
    var handle = document.createElement("button");
    handle.type = "button";
    handle.className = "wake-slider__handle";
    handle.setAttribute("role", "slider");
    handle.setAttribute("aria-label", o.ariaLabel);
    track.append(handle);
    root.textContent = "";
    root.append(track);
    buildBars(o.bars);

    // Keep each bar about barWidth wide: as many bars as fit, rebuilt when the width changes
    if (o.barWidth && window.ResizeObserver) {
      new ResizeObserver(function () {
        var width = track.clientWidth;
        if (!width) return;
        var count = Math.max(8, Math.floor((width + o.gap) / (o.barWidth + o.gap)));
        if (count === o.bars) return;
        buildBars(count);
        lastAmp = 1;  // repaint every bar once
        paint(true);
        if (o.onLayout) o.onLayout();
      }).observe(track);
    }

    function paint(force) {
      var reduce = stillPlease();
      var h = ((reduce ? target : head.x) / 100) * (o.bars - 1);
      var v = reduce ? 0 : speed.x;
      // The original is tuned on a 320px track. Speed is in percent of the track per second, so a
      // wider track scales the sensitivity up: the same hand speed makes the same wave
      var widen = Math.max(1, (track.clientWidth || 320) / 320);
      var amp = smoothstep(clamp((Math.abs(v) * o.sensitivity * widen) / FULL_SPEED, 0, 1));
      var dir = Math.sign(v) || 1;
      var r = MIN_REACH + (o.reach - MIN_REACH) * amp;
      var behind = r * (1 + o.skew);
      var ahead = r * (1 - 0.5 * o.skew);
      var lit = Math.round(h);
      var floorBar = floor == null ? -1 : Math.round((toPct(floor, min, max) / 100) * (o.bars - 1));
      // Under the floor the whole fill turns grey: the value is too low to work
      var low = floor != null && value < floor ? "true" : "false";
      if (root.dataset.low !== low) root.dataset.low = low;
      var flat = !force && amp < FLAT && lastAmp < FLAT;
      for (var i = 0; i < o.bars; i++) {
        var el = bars[i];
        var on = i <= lit ? "true" : "false";
        if (el.dataset.on !== on) el.dataset.on = on;
        // Bars under the least that can work, lighter while empty
        var below = i < floorBar ? "true" : "false";
        if (el.dataset.below !== below) el.dataset.below = below;
        if (flat) continue;
        var d = i - h;
        var R = d * dir < 0 ? behind : ahead;
        var lift = Math.abs(d) < R ? amp * Math.pow(Math.cos((Math.PI * d) / (2 * R)), 2) : 0;
        el.style.transform = "scaleY(" + (rest + lift * (1 - rest)) + ")";
      }
      lastAmp = amp;
    }

    function settled() {
      return Math.abs(target - head.x) < 0.01 && Math.abs(head.v) < 0.05 &&
        Math.abs(speed.x) < 0.05 && Math.abs(speed.v) < 0.5;
    }

    function tick(now) {
      var elapsed = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      var steps = Math.max(1, Math.ceil(elapsed / STEP_SECONDS));
      var dt = elapsed / steps;
      for (var s = 0; s < steps; s++) {
        head.v += (w0 * w0 * (target - head.x) - 2 * w0 * head.v) * dt;
        head.x += head.v * dt;
        speed.v += (wv * wv * (head.v - speed.x) - 2.5 * wv * speed.v) * dt;
        speed.x += speed.v * dt;
      }
      if (settled()) {
        head.x = target;
        head.v = speed.x = speed.v = 0;
        frameId = null;
        paint(true);
        return;
      }
      paint();
      frameId = requestAnimationFrame(tick);
    }

    function animate() {
      if (stillPlease()) return jump();
      if (frameId == null) {
        lastTime = performance.now();
        frameId = requestAnimationFrame(tick);
      }
    }

    function jump() {
      head.x = target;
      head.v = speed.x = speed.v = 0;
      if (frameId != null) cancelAnimationFrame(frameId);
      frameId = null;
      paint(true);
    }

    function describe() {
      handle.setAttribute("aria-valuemin", min);
      handle.setAttribute("aria-valuemax", max);
      handle.setAttribute("aria-valuenow", value);
      handle.tabIndex = o.disabled ? -1 : 0;
      root.setAttribute("aria-disabled", o.disabled ? "true" : "false");
    }

    function commit(next) {
      var clean = snap(next, min, max, step);
      if (clean === value) return;
      value = clean;
      target = toPct(value, min, max);
      describe();
      animate();
      if (o.onChange) o.onChange(value);
    }

    function commitFromX(x) {
      var rect = track.getBoundingClientRect();
      if (!rect.width) return;
      var ratio = clamp((x - rect.left) / rect.width, 0, 1);
      if (getComputedStyle(track).direction === "rtl") ratio = 1 - ratio;
      commit(min + ratio * (max - min));
    }

    track.addEventListener("pointerdown", function (e) {
      if (o.disabled || pointerId !== null || e.button > 0) return;
      e.preventDefault();
      pointerId = e.pointerId;
      try { track.setPointerCapture(e.pointerId); } catch (err) {}
      root.removeAttribute("data-instant");
      // Used with the mouse or a finger: no focus outline (it comes back once a key is pressed)
      root.dataset.pointer = "true";
      delete root.dataset.keys;
      handle.focus({ preventScroll: true, focusVisible: false });
      commitFromX(e.clientX);
    });
    track.addEventListener("pointermove", function (e) {
      if (e.pointerId === pointerId) commitFromX(e.clientX);
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (type) {
      track.addEventListener(type, function (e) {
        if (e.pointerId !== pointerId) return;
        try { track.releasePointerCapture(e.pointerId); } catch (err) {}
        pointerId = null;
      });
    });

    // Keys move it straight to the new place, with no wave, like the original
    handle.addEventListener("keydown", function (e) {
      if (o.disabled) return;
      var jumps = {
        ArrowRight: value + step, ArrowUp: value + step, ArrowLeft: value - step, ArrowDown: value - step,
        PageUp: value + step * 10, PageDown: value - step * 10, Home: min, End: max
      };
      delete root.dataset.pointer;
      root.dataset.keys = "true";
      if (!(e.key in jumps)) return;
      e.preventDefault();
      var clean = snap(jumps[e.key], min, max, step);
      root.setAttribute("data-instant", "true");
      value = clean;
      target = toPct(value, min, max);
      describe();
      jump();
      if (o.onChange) o.onChange(value);
    });

    handle.addEventListener("blur", function () {
      delete root.dataset.pointer;
      delete root.dataset.keys;
    });

    describe();
    paint(true);

    return {
      // Change the range, value, floor or disabled state from outside. A new value glides there
      // (with the wave) unless animate is false; a new range always jumps, so nothing sweeps
      set: function (changes) {
        var rangeChanged = false;
        if ("min" in changes && changes.min !== min) { min = changes.min; rangeChanged = true; }
        if ("max" in changes && changes.max !== max) { max = changes.max; rangeChanged = true; }
        if ("floor" in changes) floor = changes.floor;
        if ("disabled" in changes) o.disabled = changes.disabled;
        var next = "value" in changes && changes.value != null ? changes.value : value;
        var clean = snap(clamp(next, min, max), min, max, step);
        var moved = clean !== value;
        value = clean;
        target = toPct(value, min, max);
        describe();
        if (rangeChanged || changes.animate === false) jump();
        else if (moved) animate();
        else paint(true);
      },
      // Where a value sits along the track, 0 to 1, at the centre of its bar
      positionOf: function (v) {
        var index = Math.round((toPct(clamp(v, min, max), min, max) / 100) * (o.bars - 1));
        return (index + 0.5) / o.bars;
      },
      get value() { return value; },
      element: handle
    };
  };
})();
