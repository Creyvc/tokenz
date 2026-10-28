// About: the team, three cartoon heads (after xox.makemepulse.com's chunky characters, drawn our
// own way): a boy with curly hair and round glasses, the girl in the middle with twin buns and
// violet clips, and a boy in a teal beanie. Clicking (or tapping) someone bonks them:
// - the head squashes away from the blow and springs back, wobbling; the face
//   winces (>_<); a burst of lines pops out where it landed
// - hit someone five times in quick succession and they're stunned for a few seconds: spiral
//   eyes, stars circling their head, a slow sway, then a shake as they come round
// - between hits they breathe, blink, follow the pointer with their eyes, and flinch when it's
//   hovering right over them
// - sounds are made in the browser (Web Audio), nothing downloaded: a bonk, an "ow" in each
//   person's own voice, a dizzy jingle; a button turns them off
// - keys 1, 2 and 3 bonk them too, once the canvas has focus
// - with reduced motion, the reactions are smaller and nothing shakes
(function () {
  var W = 960, H = 360;           // drawing size; the canvas scales it to fit
  var STUN_HITS = 5;              // hits in a row before someone is stunned
  var STUN_SECONDS = 2.8;
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var react = still ? 0.45 : 1;

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function rand(a, b) { return a + Math.random() * (b - a); }

  // ---- The three people
  function person(x, look) {
    return Object.assign({
      x: x, r: 86, hx: 0, hy: 0, vx: 0, vy: 0, rot: 0, vr: 0, sq: 0, vsq: 0, ang: Math.PI / 2,
      arm: 0, varm: 0, hurt: 0, stun: 0, daze: 0, dazeAt: 0, blink: rand(1, 4), blinking: 0,
      flinch: 0, eyeX: 0, eyeY: 0, recover: 0
    }, look);
  }

  var people = [
    person(200, {
      kind: "curly", voice: 165, skin: "#f6c9a6", skinDark: "#e0a27c", hair: "#1f2a4d", hairLight: "#3a4a80",
      shirt: "#5B4FD6", shirtDark: "#3f35a8", glasses: true, iris: "#4a2f1f", irisLight: "#8a5a3a"
    }),
    person(480, {
      kind: "buns", voice: 300, r: 84, skin: "#fbd9c0", skinDark: "#eab092", hair: "#3b2218", hairLight: "#6b3f2c",
      shirt: "#ff8a5c", shirtDark: "#e2643a", clip: "#8B7FF2", iris: "#5a3a22", irisLight: "#a0703f"
    }),
    person(760, {
      kind: "beanie", voice: 135, skin: "#f6c9a6", skinDark: "#e0a27c", hair: "#1b1b1f", hairLight: "#3a3a42",
      shirt: "#14b8a6", shirtDark: "#0d8f81", hat: "#0f766e", hatLight: "#2bb5a5", iris: "#3b2a1e", irisLight: "#6e4c34"
    })
  ];
  var GROUND = 336, NECK = 222;   // the ground line (for the shadows), and where the heads sit

  // ---- Sounds
  var audio = null, master = null, muted = false;
  function sound() {
    if (audio) return audio;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audio = new AC();
    master = audio.createGain();
    master.gain.value = 0.55;
    master.connect(audio.destination);
    return audio;
  }
  function noise(seconds) {
    var buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * seconds), audio.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    var node = audio.createBufferSource();
    node.buffer = buffer;
    return node;
  }
  function envelope(gain, t, peak, attack, release) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }
  // A low thump dropping in pitch, a puff of noise and a short knock on top
  function bonk(strength) {
    if (muted || !sound()) return;
    var t = audio.currentTime;
    var o = audio.createOscillator(), g = audio.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(rand(200, 250), t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.16);
    envelope(g, t, 0.9 * strength, 0.004, 0.2);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 0.25);
    var n = noise(0.08), f = audio.createBiquadFilter(), ng = audio.createGain();
    f.type = "lowpass"; f.frequency.value = 2200;
    envelope(ng, t, 0.5 * strength, 0.002, 0.06);
    n.connect(f).connect(ng).connect(master);
    n.start(t);
    var k = audio.createOscillator(), kg = audio.createGain();
    k.type = "square"; k.frequency.setValueAtTime(rand(820, 1000), t);
    envelope(kg, t, 0.12 * strength, 0.001, 0.03);
    k.connect(kg).connect(master);
    k.start(t); k.stop(t + 0.05);
  }
  // "Ow": a buzzy voice through two vowel filters, its pitch jumping up and falling away
  function ow(who, big) {
    if (muted || !sound()) return;
    var t = audio.currentTime + 0.03;
    var pitch = who.voice * rand(0.92, 1.1) * (big ? 1.15 : 1);
    var o = audio.createOscillator(), g = audio.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(pitch * 1.35, t);
    o.frequency.exponentialRampToValueAtTime(pitch * 0.75, t + 0.32);
    var vib = audio.createOscillator(), vg = audio.createGain();
    vib.frequency.value = 26; vg.gain.value = pitch * 0.03;
    vib.connect(vg).connect(o.frequency);
    var f1 = audio.createBiquadFilter(), f2 = audio.createBiquadFilter(), mixG = audio.createGain();
    f1.type = "bandpass"; f1.frequency.value = who.voice > 250 ? 900 : 700; f1.Q.value = 6;
    f2.type = "bandpass"; f2.frequency.value = who.voice > 250 ? 1500 : 1150; f2.Q.value = 8;
    envelope(g, t, 0.5, 0.02, 0.34);
    o.connect(f1); o.connect(f2);
    f1.connect(mixG); f2.connect(mixG);
    mixG.gain.value = 1.4;
    mixG.connect(g).connect(master);
    o.start(t); o.stop(t + 0.4); vib.start(t); vib.stop(t + 0.4);
  }
  // Stunned: little bird-like chirps going round, wobbling in pitch
  function dizzy() {
    if (muted || !sound()) return;
    var t = audio.currentTime + 0.1;
    for (var i = 0; i < 6; i++) {
      var o = audio.createOscillator(), g = audio.createGain();
      var s = t + i * 0.13;
      o.type = "triangle";
      o.frequency.setValueAtTime(1500 + (i % 2) * 380, s);
      o.frequency.linearRampToValueAtTime(1150 + (i % 2) * 380, s + 0.1);
      envelope(g, s, 0.12, 0.01, 0.1);
      o.connect(g).connect(master);
      o.start(s); o.stop(s + 0.14);
    }
  }

  // ---- Bits that fly off a hit
  var bursts = [], words = [], sweat = [];

  // ---- Drawing
  function ellipse(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
  function shaded(c, x, y, r, light, dark) {
    var g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.05);
    g.addColorStop(0, light);
    g.addColorStop(1, dark);
    return g;
  }

  function drawHair(c, p, back) {
    var r = p.r;
    if (p.kind === "curly") {
      if (back) {
        c.fillStyle = shaded(c, 0, -r * 0.3, r * 1.1, p.hairLight, p.hair);
        for (var a = -200; a <= 20; a += 22) {
          var ra = a * Math.PI / 180;
          ellipse(c, Math.cos(ra) * r * 0.86, Math.sin(ra) * r * 0.86 - 4, r * 0.32, r * 0.32);
          c.fill();
        }
        return;
      }
      c.fillStyle = shaded(c, 0, -r * 0.6, r * 0.9, p.hairLight, p.hair);
      var curls = [[-0.55, -0.72], [-0.2, -0.88], [0.18, -0.9], [0.52, -0.74], [0.0, -0.66], [-0.38, -0.58], [0.36, -0.6]];
      curls.forEach(function (q) {
        ellipse(c, q[0] * r, q[1] * r, r * 0.3, r * 0.27);
        c.fill();
      });
      // each curl catching the light along its top, with a darker turn under it
      c.lineCap = "round";
      curls.forEach(function (q, i) {
        c.strokeStyle = "rgba(160, 175, 230, 0.35)";
        c.lineWidth = 3;
        c.beginPath();
        c.arc(q[0] * r - 3, q[1] * r - 2, r * 0.17, Math.PI * 1.1, Math.PI * 1.75);
        c.stroke();
        c.strokeStyle = "rgba(5, 8, 25, 0.35)";
        c.lineWidth = 2;
        c.beginPath();
        c.arc(q[0] * r + 2, q[1] * r + 3, r * 0.2, Math.PI * 0.15, Math.PI * 0.8);
        c.stroke();
      });
    } else if (p.kind === "buns") {
      if (back) {
        [-1, 1].forEach(function (side) {
          c.fillStyle = shaded(c, side * r * 0.78, -r * 0.82, r * 0.38, p.hairLight, p.hair);
          ellipse(c, side * r * 0.78, -r * 0.82, r * 0.36, r * 0.36);
          c.fill();
        });
        c.fillStyle = shaded(c, 0, -r * 0.2, r * 1.1, p.hairLight, p.hair);
        ellipse(c, 0, -r * 0.05, r * 1.06, r * 1.02);
        c.fill();
        return;
      }
      // the fringe
      c.fillStyle = shaded(c, 0, -r * 0.7, r * 0.9, p.hairLight, p.hair);
      c.beginPath();
      c.moveTo(-r * 0.98, -r * 0.05);
      c.quadraticCurveTo(-r * 0.95, -r * 1.02, 0, -r * 1.0);
      c.quadraticCurveTo(r * 0.95, -r * 1.02, r * 0.98, -r * 0.05);
      c.quadraticCurveTo(r * 0.7, -r * 0.55, r * 0.22, -r * 0.5);
      c.quadraticCurveTo(0, -r * 0.7, -r * 0.2, -r * 0.48);
      c.quadraticCurveTo(-r * 0.7, -r * 0.55, -r * 0.98, -r * 0.05);
      c.fill();
      // strands, and a sheen across the top
      c.lineCap = "round";
      c.strokeStyle = "rgba(20, 8, 4, 0.35)";
      c.lineWidth = 1.6;
      for (var k = -5; k <= 5; k++) {
        c.beginPath();
        c.moveTo(k * r * 0.11, -r * 0.97);
        c.quadraticCurveTo(k * r * 0.13, -r * 0.75, k * r * 0.14, -r * 0.55 - Math.abs(k) * 2);
        c.stroke();
      }
      c.strokeStyle = "rgba(255, 220, 190, 0.28)";
      c.lineWidth = 4;
      c.beginPath();
      c.arc(0, -r * 0.2, r * 0.72, Math.PI * 1.25, Math.PI * 1.6);
      c.stroke();
      // the clips
      [-1, 1].forEach(function (side) {
        c.save();
        c.translate(side * r * 0.62, -r * 0.62);
        c.rotate(side * 0.6);
        c.fillStyle = p.clip;
        c.beginPath();
        c.roundRect(-14, -6, 28, 12, 6);
        c.fill();
        c.restore();
      });
    } else {
      if (back) return;
      // the beanie: a cap, a folded band, a pompom
      c.fillStyle = shaded(c, 0, -r * 0.75, r * 1.0, p.hatLight, p.hat);
      c.beginPath();
      c.moveTo(-r * 1.0, -r * 0.3);
      c.quadraticCurveTo(-r * 1.02, -r * 1.25, 0, -r * 1.22);
      c.quadraticCurveTo(r * 1.02, -r * 1.25, r * 1.0, -r * 0.3);
      c.closePath();
      c.fill();
      c.save();
      c.clip();
      for (var j = -9; j <= 9; j++) {
        c.strokeStyle = j % 2 ? "rgba(0, 0, 0, 0.12)" : "rgba(255, 255, 255, 0.08)";
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(j * r * 0.11, -r * 1.3);
        c.quadraticCurveTo(j * r * 0.13, -r * 0.8, j * r * 0.12, -r * 0.3);
        c.stroke();
      }
      c.restore();
      c.fillStyle = p.hat;
      c.beginPath();
      c.roundRect(-r * 1.04, -r * 0.48, r * 2.08, r * 0.3, r * 0.14);
      c.fill();
      c.strokeStyle = "rgba(255, 255, 255, 0.18)";
      c.lineWidth = 3;
      for (var i = -4; i <= 4; i++) {
        c.beginPath();
        c.moveTo(i * r * 0.22, -r * 0.46);
        c.lineTo(i * r * 0.22, -r * 0.2);
        c.stroke();
      }
      c.fillStyle = shaded(c, 0, -r * 1.3, r * 0.22, "#ffffff", "#cfe9e5");
      ellipse(c, 0, -r * 1.28, r * 0.2, r * 0.2);
      c.fill();
    }
  }

  // ---- The face, drawn with more of a real face's detail: an egg-shaped head narrowing to the
  // chin, soft shading round its edge and under the hairline, almond eyes with coloured irises and
  // lids, tapered brows, a nose with nostrils, and lips
  function headPath(c, r) {
    c.beginPath();
    c.moveTo(0, -r);
    c.bezierCurveTo(r * 0.62, -r, r * 0.98, -r * 0.62, r * 0.97, -r * 0.08);
    c.bezierCurveTo(r * 0.96, r * 0.44, r * 0.6, r * 0.92, 0, r * 1.02);
    c.bezierCurveTo(-r * 0.6, r * 0.92, -r * 0.96, r * 0.44, -r * 0.97, -r * 0.08);
    c.bezierCurveTo(-r * 0.98, -r * 0.62, -r * 0.62, -r, 0, -r);
    c.closePath();
  }

  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return "rgba(" + (n >> 16) + ", " + ((n >> 8) & 255) + ", " + (n & 255) + ", " + a + ")";
  }

  function drawSkin(c, p) {
    var r = p.r;
    headPath(c, r);
    c.fillStyle = shaded(c, 0, -r * 0.05, r * 1.05, p.skin, p.skinDark);
    c.fill();
    c.save();
    headPath(c, r);
    c.clip();
    // darker round the edges, as a rounded form turns away from the light
    var edge = c.createRadialGradient(-r * 0.12, -r * 0.15, r * 0.55, 0, 0, r * 1.1);
    edge.addColorStop(0, rgba(p.skinDark, 0));
    edge.addColorStop(1, rgba(p.skinDark, 0.65));
    c.fillStyle = edge;
    c.fillRect(-r * 1.2, -r * 1.2, r * 2.4, r * 2.4);
    // the jaw in a little shadow, and a soft light on the forehead and cheekbones
    var jaw = c.createLinearGradient(0, r * 0.4, 0, r * 1.05);
    jaw.addColorStop(0, rgba(p.skinDark, 0));
    jaw.addColorStop(1, rgba(p.skinDark, 0.45));
    c.fillStyle = jaw;
    c.fillRect(-r, r * 0.4, r * 2, r * 0.7);
    var light = c.createRadialGradient(-r * 0.25, -r * 0.42, 2, -r * 0.25, -r * 0.42, r * 0.55);
    light.addColorStop(0, "rgba(255, 255, 255, 0.28)");
    light.addColorStop(1, "rgba(255, 255, 255, 0)");
    c.fillStyle = light;
    c.fillRect(-r, -r, r * 1.4, r);
    // a shadow along the hairline, where the hair sits over the skin
    var under = c.createLinearGradient(0, -r * 0.75, 0, -r * 0.35);
    under.addColorStop(0, "rgba(40, 20, 10, 0.35)");
    under.addColorStop(1, "rgba(40, 20, 10, 0)");
    c.fillStyle = under;
    c.fillRect(-r, -r, r * 2, r * 0.7);
    // cheeks
    [-1, 1].forEach(function (side) {
      var g = c.createRadialGradient(side * r * 0.5, r * 0.3, 1, side * r * 0.5, r * 0.3, r * 0.3);
      g.addColorStop(0, p.kind === "buns" ? "rgba(235, 105, 120, 0.42)" : "rgba(220, 110, 100, 0.26)");
      g.addColorStop(1, "rgba(235, 105, 120, 0)");
      c.fillStyle = g;
      c.fillRect(side * r * 0.5 - r * 0.3, 0, r * 0.6, r * 0.6);
    });
    c.restore();
  }

  function drawEar(c, p, side) {
    var r = p.r, x = side * r * 0.94, y = 6;
    c.fillStyle = shaded(c, x, y, 22, p.skin, p.skinDark);
    ellipse(c, x, y, 15, 22);
    c.fill();
    c.strokeStyle = rgba(p.skinDark, 0.9);
    c.lineWidth = 3;
    c.beginPath();
    c.arc(x + side * 2, y, 9, side > 0 ? -1.9 : -1.25, side > 0 ? 1.9 : 4.4 - 3.14, side < 0);
    c.stroke();
  }

  function eyeShape(c, x, y, open, side) {
    c.beginPath();
    c.moveTo(x - 18 * side, y + 1);
    c.bezierCurveTo(x - 10 * side, y - 15 * open, x + 10 * side, y - 15 * open, x + 19 * side, y - 2);
    c.bezierCurveTo(x + 10 * side, y + 11 * open, x - 10 * side, y + 11 * open, x - 18 * side, y + 1);
    c.closePath();
  }

  function drawEye(c, p, side, t) {
    var x = side * 31, y = -4, hurt = p.hurt > 0, stun = p.stun > 0;
    var lid = "#2a1a12";
    if (hurt) {
      // squeezed shut, with creases at the outer corner
      c.strokeStyle = lid;
      c.lineWidth = 4;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(x - 17 * side, y + 2);
      c.quadraticCurveTo(x, y - 8, x + 18 * side, y + 1);
      c.stroke();
      c.lineWidth = 2;
      c.strokeStyle = rgba(p.skinDark, 1);
      for (var k = -1; k <= 1; k++) {
        c.beginPath();
        c.moveTo(x + 21 * side, y + k * 6);
        c.lineTo(x + 29 * side, y + k * 9);
        c.stroke();
      }
      return;
    }
    var open = stun ? 0.62 : 1 - Math.max(p.blinking, p.flinch * 0.45) * 0.92;
    if (open < 0.12) {
      c.strokeStyle = lid;
      c.lineWidth = 3.5;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(x - 18 * side, y + 1);
      c.quadraticCurveTo(x, y + 6, x + 19 * side, y - 1);
      c.stroke();
      return;
    }
    // the white, a little shaded under the lid
    eyeShape(c, x, y, open, side);
    var white = c.createLinearGradient(0, y - 14, 0, y + 10);
    white.addColorStop(0, "#d9d4d0");
    white.addColorStop(0.45, "#fbfaf8");
    white.addColorStop(1, "#ece7e3");
    c.fillStyle = white;
    c.fill();
    c.save();
    eyeShape(c, x, y, open, side);
    c.clip();
    // the iris: wandering round on its own when stunned, otherwise after the pointer
    var ix = x + (stun ? Math.cos(t * 6 * side) * 5 : p.eyeX * 0.8);
    var iy = y + 1 + (stun ? Math.sin(t * 6 * side) * 3 : p.eyeY * 0.6);
    var iris = c.createRadialGradient(ix - 2, iy - 2, 1, ix, iy, 10);
    iris.addColorStop(0, p.irisLight);
    iris.addColorStop(0.7, p.iris);
    iris.addColorStop(1, "#1a0f08");
    c.fillStyle = iris;
    ellipse(c, ix, iy, 9.5, 9.5);
    c.fill();
    c.fillStyle = "#0b0706";
    ellipse(c, ix, iy, 4.4, 4.4);
    c.fill();
    c.fillStyle = "rgba(255, 255, 255, 0.95)";
    ellipse(c, ix - 3.5, iy - 3.5, 2.6, 2.4);
    c.fill();
    c.fillStyle = "rgba(255, 255, 255, 0.5)";
    ellipse(c, ix + 3, iy + 3, 1.3, 1.3);
    c.fill();
    // the lid's shadow over the top of the eye
    var shade = c.createLinearGradient(0, y - 14, 0, y - 4);
    shade.addColorStop(0, "rgba(60, 30, 20, 0.35)");
    shade.addColorStop(1, "rgba(60, 30, 20, 0)");
    c.fillStyle = shade;
    c.fillRect(x - 22, y - 16, 44, 14);
    c.restore();
    // upper lid line, thicker towards the outer corner; a faint lower one; the crease above
    c.lineCap = "round";
    c.strokeStyle = lid;
    c.lineWidth = 3.2;
    c.beginPath();
    c.moveTo(x - 18 * side, y + 1);
    c.bezierCurveTo(x - 10 * side, y - 15 * open, x + 10 * side, y - 15 * open, x + 19 * side, y - 2);
    c.stroke();
    c.strokeStyle = rgba(p.skinDark, 0.8);
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(x - 14 * side, y + 5 * open);
    c.quadraticCurveTo(x, y + 11 * open, x + 15 * side, y + 3 * open);
    c.stroke();
    c.strokeStyle = rgba(p.skinDark, 0.7);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x - 13 * side, y - 13 * open - 3);
    c.quadraticCurveTo(x + 2 * side, y - 20 * open - 3, x + 17 * side, y - 9 * open - 2);
    c.stroke();
    // lashes
    if (p.kind === "buns") {
      c.strokeStyle = lid;
      c.lineWidth = 2;
      for (var i = 0; i < 3; i++) {
        var lx = x + (8 + i * 5) * side, ly = y - 10 * open + i * 3;
        c.beginPath();
        c.moveTo(lx, ly);
        c.lineTo(lx + 5 * side, ly - 5);
        c.stroke();
      }
    }
  }

  function drawBrow(c, p, side) {
    var hurt = p.hurt > 0, stun = p.stun > 0;
    var y = -34 - p.flinch * 3;
    var inner = hurt ? 6 : stun ? -2 : -p.flinch * 5;     // how far the inner end drops
    c.fillStyle = rgba(p.hair, 0.92);
    c.beginPath();
    c.moveTo(side * 12, y + inner - 3);
    c.quadraticCurveTo(side * 30, y - 9, side * 47, y + 2);
    c.quadraticCurveTo(side * 30, y - 2, side * 12, y + inner + 4);
    c.closePath();
    c.fill();
  }

  function drawNose(c, p) {
    // a soft shadow down one side of the bridge, a light on the tip, the nostrils
    var bridge = c.createLinearGradient(-8, 0, 6, 0);
    bridge.addColorStop(0, rgba(p.skinDark, 0));
    bridge.addColorStop(0.5, rgba(p.skinDark, 0.35));
    bridge.addColorStop(1, rgba(p.skinDark, 0));
    c.fillStyle = bridge;
    c.beginPath();
    c.moveTo(-3, -6);
    c.quadraticCurveTo(-8, 10, -12, 24);
    c.lineTo(-4, 24);
    c.quadraticCurveTo(-2, 10, 3, -6);
    c.fill();
    c.fillStyle = shaded(c, 0, 24, 13, p.skin, p.skinDark);
    ellipse(c, 0, 24, 12, 9);
    c.fill();
    c.fillStyle = "rgba(255, 255, 255, 0.3)";
    ellipse(c, -3, 21, 4, 2.6);
    c.fill();
    c.fillStyle = "rgba(70, 30, 20, 0.45)";
    ellipse(c, -6, 29, 3.4, 2.2);
    c.fill();
    ellipse(c, 6, 29, 3.4, 2.2);
    c.fill();
  }

  function drawMouth(c, p, t) {
    var hurt = p.hurt > 0, stun = p.stun > 0, y = 50;
    var lip = p.kind === "buns" ? "#cf6676" : "#c27a6c";
    var lipDark = p.kind === "buns" ? "#a34556" : "#9c5a4d";
    c.lineCap = "round";
    if (hurt) {
      // a grimace through clenched teeth
      var h = 10 + Math.sin(t * 40) * 1.5;
      c.fillStyle = lip;
      c.beginPath();
      c.roundRect(-20, y - h / 2 - 4, 40, h + 8, 9);
      c.fill();
      c.fillStyle = "#3a1a1a";
      c.beginPath();
      c.roundRect(-16, y - h / 2, 32, h, 6);
      c.fill();
      c.fillStyle = "#f4efe8";
      c.beginPath();
      c.roundRect(-15, y - h / 2, 30, h * 0.48, 3);
      c.fill();
      c.beginPath();
      c.roundRect(-15, y + h * 0.06, 30, h * 0.44, 3);
      c.fill();
      c.strokeStyle = "rgba(0, 0, 0, 0.2)";
      c.lineWidth = 1;
      for (var i = -10; i <= 10; i += 5) {
        c.beginPath();
        c.moveTo(i, y - h / 2);
        c.lineTo(i, y + h / 2);
        c.stroke();
      }
      return;
    }
    if (stun) {
      var o = 7 + Math.sin(t * 7) * 2;
      c.fillStyle = lip;
      ellipse(c, 0, y + 2, 11, o + 3);
      c.fill();
      c.fillStyle = "#4a1f22";
      ellipse(c, 0, y + 2, 7, o);
      c.fill();
      return;
    }
    // lips, the corners turning up (and down a little when the pointer's right over them)
    var smile = 6 - p.flinch * 9;
    c.fillStyle = lip;
    c.beginPath();
    c.moveTo(-18, y - smile * 0.4);
    c.quadraticCurveTo(-9, y - 7, -2, y - 4);
    c.quadraticCurveTo(0, y - 5, 2, y - 4);
    c.quadraticCurveTo(9, y - 7, 18, y - smile * 0.4);
    c.quadraticCurveTo(0, y + 1 + smile * 0.3, -18, y - smile * 0.4);
    c.fill();
    c.fillStyle = shaded(c, 0, y + 6, 16, lip, lipDark);
    c.beginPath();
    c.moveTo(-17, y - smile * 0.4);
    c.quadraticCurveTo(0, y + 2 + smile * 0.3, 17, y - smile * 0.4);
    c.quadraticCurveTo(0, y + 14 + smile * 0.2, -17, y - smile * 0.4);
    c.fill();
    c.strokeStyle = "rgba(70, 25, 25, 0.75)";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-18, y - smile * 0.4);
    c.quadraticCurveTo(0, y + 1 + smile * 0.3, 18, y - smile * 0.4);
    c.stroke();
    c.fillStyle = "rgba(255, 255, 255, 0.3)";
    ellipse(c, -4, y + 6, 5, 1.8);
    c.fill();
  }

  function drawGlasses(c) {
    [-1, 1].forEach(function (side) {
      var x = side * 31;
      c.fillStyle = "rgba(200, 220, 255, 0.1)";
      ellipse(c, x, -4, 25, 22);
      c.fill();
      c.strokeStyle = "rgba(255, 255, 255, 0.45)";
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(x - 12, -18);
      c.lineTo(x - 18, -6);
      c.stroke();
      c.strokeStyle = "#1c1c22";
      c.lineWidth = 3;
      ellipse(c, x, -4, 25, 22);
      c.stroke();
    });
    c.beginPath();
    c.moveTo(-7, -8);
    c.quadraticCurveTo(0, -12, 7, -8);
    c.stroke();
  }

  function drawFace(c, p, t) {
    drawEye(c, p, -1, t);
    drawEye(c, p, 1, t);
    drawBrow(c, p, -1);
    drawBrow(c, p, 1);
    drawNose(c, p);
    drawMouth(c, p, t);
    if (p.glasses) drawGlasses(c);
    // sweat when the pointer's right over them
    var r = p.r;
    if (p.flinch > 0.4 && p.stun <= 0) {
      c.fillStyle = "rgba(150, 200, 255, 0.85)";
      c.beginPath();
      c.moveTo(r * 0.72, -r * 0.35);
      c.quadraticCurveTo(r * 0.83, -r * 0.12, r * 0.72, -r * 0.08);
      c.quadraticCurveTo(r * 0.61, -r * 0.12, r * 0.72, -r * 0.35);
      c.fill();
    }
  }

  function drawPerson(c, p, t) {
    var breathe = Math.sin(t * 2 + p.x) * 2;
    c.save();
    c.translate(p.x + p.hx, NECK + p.hy + breathe);
    c.rotate(p.rot);
    // squashed along the line of the blow, stretched across it
    var along = 1 - p.sq * 0.16, across = 1 + p.sq * 0.12;
    c.rotate(p.ang);
    c.scale(along, across);
    c.rotate(-p.ang);
    var r = p.r;
    drawHair(c, p, true);
    drawEar(c, p, -1);
    drawEar(c, p, 1);
    drawSkin(c, p);
    drawFace(c, p, t);
    drawHair(c, p, false);
    c.restore();
    // stars going round a stunned head
    if (p.stun > 0) {
      for (var i = 0; i < 3; i++) {
        var a = t * 4 + i * (Math.PI * 2 / 3);
        var sx = p.x + p.hx + Math.cos(a) * r * 0.95, sy = NECK + p.hy - r * 1.15 + Math.sin(a) * 16;
        star(c, sx, sy, 11 + Math.sin(a) * 3, "#FFD23F");
      }
    }
  }

  function star(c, x, y, size, colour) {
    c.save();
    c.translate(x, y);
    c.fillStyle = colour;
    c.strokeStyle = "#16171A";
    c.lineWidth = 2.5;
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? size * 0.45 : size;
      c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }

  function drawEffects(c) {
    bursts.forEach(function (b) {
      var k = b.age / 0.3;
      c.strokeStyle = "rgba(255, 210, 63, " + (1 - k) + ")";
      c.lineWidth = 6 * (1 - k) + 1;
      c.lineCap = "round";
      for (var i = 0; i < 8; i++) {
        var a = i * Math.PI / 4 + b.spin;
        var r1 = 18 + k * 30, r2 = 34 + k * 46;
        c.beginPath();
        c.moveTo(b.x + Math.cos(a) * r1, b.y + Math.sin(a) * r1);
        c.lineTo(b.x + Math.cos(a) * r2, b.y + Math.sin(a) * r2);
        c.stroke();
      }
    });
    words.forEach(function (w) {
      var k = w.age / 0.8, pop = Math.min(1, w.age / 0.08);
      c.save();
      c.translate(w.x, w.y - k * 40);
      c.rotate(w.tilt);
      c.scale(pop * (1.2 - 0.2 * pop), pop * (1.2 - 0.2 * pop));
      c.globalAlpha = 1 - Math.max(0, (k - 0.6) / 0.4);
      c.font = "900 38px Inter, system-ui, sans-serif";
      c.textAlign = "center";
      c.lineJoin = "round";
      c.lineWidth = 8;
      c.strokeStyle = "#16171A";
      c.strokeText(w.text, 0, 0);
      c.fillStyle = w.colour;
      c.fillText(w.text, 0, 0);
      c.restore();
    });
    sweat.forEach(function (s) {
      c.fillStyle = "rgba(120, 190, 255, " + (1 - s.age / 0.6) + ")";
      ellipse(c, s.x, s.y, 4, 6);
      c.fill();
    });
  }

  // ---- Movement
  function spring(p, key, vkey, k, damp, dt) {
    p[vkey] += (-k * p[key] - damp * p[vkey]) * dt;
    p[key] += p[vkey] * dt;
  }

  function step(dt, t, mallet) {
    people.forEach(function (p) {
      spring(p, "hx", "vx", 170, 11, dt);
      spring(p, "hy", "vy", 170, 11, dt);
      spring(p, "rot", "vr", 130, 8, dt);
      spring(p, "sq", "vsq", 320, 13, dt);
      spring(p, "arm", "varm", 90, 6, dt);
      p.hurt = Math.max(0, p.hurt - dt);
      if (p.stun > 0) {
        p.stun -= dt;
        p.rot += Math.sin(t * 2.6) * 0.012 * react;
        if (p.stun <= 0) { p.stun = 0; p.vr += 5 * react; p.vx += 120 * react; }
      }
      if (t - p.dazeAt > 1.4) p.daze = Math.max(0, p.daze - dt * 1.5);
      // blinking
      p.blink -= dt;
      if (p.blink <= 0) { p.blinking = 1; p.blink = rand(2, 5); }
      p.blinking = Math.max(0, p.blinking - dt * 7);
      // eyes after the mallet; a flinch when it's right over them
      var hx = p.x + p.hx, hy = NECK + p.hy;
      var dx = mallet.on ? mallet.x - hx : 0, dy = mallet.on ? mallet.y - hy : 0;
      var d = Math.hypot(dx, dy) || 1;
      p.eyeX += ((dx / d) * Math.min(6, d / 20) - p.eyeX) * Math.min(1, dt * 12);
      p.eyeY += ((dy / d) * Math.min(6, d / 20) - p.eyeY) * Math.min(1, dt * 12);
      var near = mallet.on && d < p.r * 1.6 ? 1 - d / (p.r * 1.6) : 0;
      p.flinch += (near - p.flinch) * Math.min(1, dt * 8);
    });
    [bursts, words, sweat].forEach(function (list) { list.forEach(function (b) { b.age += dt; }); });
    sweat.forEach(function (s) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 900 * dt; });
    bursts = bursts.filter(function (b) { return b.age < 0.3; });
    words = words.filter(function (w) { return w.age < 0.8; });
    sweat = sweat.filter(function (s) { return s.age < 0.6; });
  }

  function hit(p, x, y, t) {
    var hx = p.x + p.hx, hy = NECK + p.hy;
    var dx = hx - x, dy = hy - y, d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    // mostly a blow from above if it lands on top
    var force = 620 * react;
    p.vx += dx * force;
    p.vy += Math.max(dy, 0.2) * force * 0.6;
    p.vr += (dx * 7 + rand(-2, 2)) * react;
    p.vsq += 11 * react;
    p.varm += (dx > 0 ? 1 : -1) * 9 * react;
    p.ang = Math.atan2(dy, dx);
    p.hurt = 0.55;
    p.daze += 1;
    p.dazeAt = t;
    bursts.push({ x: x, y: y, age: 0, spin: rand(0, 1) });
    for (var i = 0; i < 4; i++) sweat.push({ x: hx + rand(-30, 30), y: hy - p.r * 0.6, vx: rand(-160, 160), vy: rand(-380, -200), age: 0 });
    var stunned = false;
    if (p.stun <= 0 && p.daze >= STUN_HITS) { p.stun = STUN_SECONDS; p.daze = 0; stunned = true; }
    bonk(stunned ? 1 : 0.85);
    ow(p, stunned);
    if (stunned) dizzy();
    return stunned;
  }

  // ---- Setting up
  function setUp(box) {
    var canvas = box.querySelector("canvas");
    var muteEl = box.querySelector(".team-sound");
    if (!canvas || !canvas.getContext) return;
    var c = canvas.getContext("2d");
    var mallet = { x: W / 2, y: 120, on: false };  // the pointer, for the eyes to follow
    var running = false, last = 0, start = performance.now();

    function fit() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = canvas.clientWidth;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(w * (H / W) * dpr);
    }
    function point(event) {
      var box2 = canvas.getBoundingClientRect();
      return { x: (event.clientX - box2.left) / box2.width * W, y: (event.clientY - box2.top) / box2.height * H };
    }
    function who(x, y) {
      var best = null, bestD = Infinity;
      people.forEach(function (p) {
        var hx = p.x + p.hx, hy = NECK + p.hy;
        var d = Math.hypot(x - hx, y - hy);
        if (d < p.r * 1.25 && d < bestD) { best = p; bestD = d; }
      });
      return best;
    }
    function strike(x, y) {
      var p = who(x, y);
      if (!p) return;
      hit(p, x, y, (performance.now() - start) / 1000);
    }

    function frame(now) {
      if (!running) return;
      var dt = Math.min(0.033, (now - last) / 1000 || 0.016);
      last = now;
      var t = (now - start) / 1000;
      step(dt, t, mallet);
      var scale = canvas.width / W;
      c.setTransform(scale, 0, 0, scale, 0, 0);
      c.clearRect(0, 0, W, H);
      people.forEach(function (p) { drawPerson(c, p, t); });
      drawEffects(c);
      requestAnimationFrame(frame);
    }
    function run(on) {
      if (on === running) return;
      running = on;
      if (on) { last = performance.now(); requestAnimationFrame(frame); }
    }

    canvas.addEventListener("pointermove", function (event) {
      var q = point(event);
      mallet.x = q.x; mallet.y = q.y;
      mallet.on = event.pointerType === "mouse" || event.pointerType === "pen";
    });
    canvas.addEventListener("pointerleave", function () { mallet.on = false; });
    canvas.addEventListener("pointerdown", function (event) {
      sound();
      if (audio && audio.state === "suspended") audio.resume();
      var q = point(event);
      mallet.x = q.x; mallet.y = q.y; mallet.on = true;
      strike(q.x, q.y);
    });
    canvas.addEventListener("keydown", function (event) {
      var i = ["1", "2", "3"].indexOf(event.key);
      if (i < 0) return;
      sound();
      var p = people[i];
      mallet.x = p.x + rand(-30, 30); mallet.y = NECK - p.r * 0.7; mallet.on = true;
      strike(mallet.x, mallet.y);
    });
    if (muteEl) muteEl.addEventListener("click", function () {
      muted = !muted;
      muteEl.setAttribute("aria-pressed", String(!muted));
      muteEl.textContent = muted ? "Sound off" : "Sound on";
    });

    fit();
    window.addEventListener("resize", fit);
    // Only drawn while it can be seen (on About, once the dive has landed)
    var stage = box.closest(".hw-stage");
    function check() {
      var shown = !stage || stage.classList.contains("is-landed") || document.documentElement.classList.contains("hw-still");
      run(shown && !document.hidden);
    }
    if (stage) new MutationObserver(check).observe(stage, { attributes: true, attributeFilter: ["class"] });
    new MutationObserver(check).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("visibilitychange", check);
    check();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var box = document.querySelector(".team-toy");
    if (box) setUp(box);
  });
})();
