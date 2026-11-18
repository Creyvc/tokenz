// About: hovering a ball or a name (or tapping either) says that person's hello out loud ("Hello,
// I'm Timila"), straight away, and shows it in place of their name while the ball is hovered.
// - The voices are ElevenLabs recordings (data-hello-audio on each name), made once by
//   tools/make-hellos.py: the page only plays the files, it never talks to ElevenLabs.
// - While a recording plays, its real loudness is measured many times a second and handed to
//   orbs.js (window.tokenzVoice), so that person's ball moves with the voice.
// - If a recording is missing, the browser's own voice says it instead (data-voice: "female" for
//   Timila, "male" for Vuthy and Vila), and the ball moves to a made-up voice level.
// - The recordings are made ready to play as the page loads, so a hello starts the moment it's
//   asked for. Browsers only allow sound once the page has been clicked, tapped or typed on,
//   though (a hover doesn't count), so until then hovering stays silent.
// - One hello at a time: a new one cuts off the last.
(function () {
  var names = document.querySelectorAll(".orb-name[data-voice]");
  if (!names.length) return;
  var speech = window.speechSynthesis || null;
  var voiceNow = window.tokenzVoice = { index: -1, level: 0 };

  function tell(index, type, on) {
    window.dispatchEvent(new CustomEvent(type, { detail: { index: index, on: on } }));
  }

  // ---- The recordings: fetched and unpacked once when the page loads (on an offline audio
  // context, which needs no permission), played through a level meter ----
  var Ctx = window.AudioContext || window.webkitAudioContext;
  var Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  var ctx = null, meter = null, wave = null, decoded = {}, ready = {}, playing = null;
  var unpack = Offline ? new Offline(1, 1, 44100) : null;
  names.forEach(function (name) {
    var url = name.getAttribute("data-hello-audio");
    if (!url || !Ctx || !unpack) return;
    decoded[url] = fetch(url).then(function (r) {
      if (!r.ok) throw new Error("missing");
      return r.arrayBuffer();
    }).then(function (bytes) {
      return unpack.decodeAudioData(bytes);
    }).then(function (buffer) {
      ready[url] = buffer;
      return buffer;
    });
    decoded[url].catch(function () {});
  });
  function audio() {
    if (!ctx) {
      ctx = new Ctx();
      meter = ctx.createAnalyser();
      meter.fftSize = 1024;
      wave = new Float32Array(meter.fftSize);
      meter.connect(ctx.destination);
    }
    if (ctx.state !== "running") ctx.resume().catch(function () {});
    return ctx;
  }
  // The first click, tap or key press anywhere lets the page make sound from then on
  function unlock() {
    if (!Ctx) return;
    audio();
    ["pointerdown", "keydown", "touchend"].forEach(function (type) { window.removeEventListener(type, unlock, true); });
  }
  ["pointerdown", "keydown", "touchend"].forEach(function (type) { window.addEventListener(type, unlock, true); });
  // How loud it is right now (0 to about 1), from the last few hundredths of a second
  function listen() {
    if (!playing) { voiceNow.index = -1; voiceNow.level = 0; return; }
    meter.getFloatTimeDomainData(wave);
    var sum = 0;
    for (var i = 0; i < wave.length; i++) sum += wave[i] * wave[i];
    voiceNow.index = playing.index;
    voiceNow.level = Math.min(1, Math.sqrt(sum / wave.length) * 5);
    requestAnimationFrame(listen);
  }

  function stop() {
    if (playing) {
      var was = playing;
      playing = null;
      try { was.source.stop(); } catch (e) {}
      tell(was.index, "tokenz:speaking", false);
    }
    if (live) { tell(live.index, "tokenz:speaking", false); live = null; }
    if (speech) speech.cancel();
  }

  // Plays the recording at once if it's ready; says whether there's one to play at all
  function play(name, index) {
    var url = name.getAttribute("data-hello-audio");
    if (!url || !decoded[url]) return false;
    var buffer = ready[url];
    if (!buffer) {
      // still loading (or missing): the browser's voice if it turns out to be missing
      decoded[url].catch(function () { speak(name, index); });
      return true;
    }
    var c = audio();
    // not allowed to make sound yet (nothing clicked so far): stay quiet
    if (c.state !== "running") return true;
    stop();
    var source = c.createBufferSource();
    source.buffer = buffer;
    source.connect(meter);
    playing = { source: source, index: index, name: name };
    source.onended = function () {
      if (playing && playing.source === source) {
        playing = null;
        tell(index, "tokenz:speaking", false);
      }
    };
    source.start();
    tell(index, "tokenz:speaking", true);
    requestAnimationFrame(listen);
    return true;
  }

  // ---- The browser's own voice, when there's no recording ----
  var FEMALE = /female|samantha|karen|moira|tessa|victoria|fiona|serena|ava|allison|susan|zira|aria|jenny|kate|amelie|anna|alice|ellen|joana|paulina|sara|nora|zuzana/i;
  var MALE = /\bmale|daniel|alex\b|fred|tom\b|aaron|arthur|oliver|rishi|david|guy|mark|george|james|ralph|thomas|reed|eddy|rocko/i;
  var voices = [], live = null;
  function load() { voices = speech.getVoices().filter(function (v) { return /^en/i.test(v.lang); }); }
  if (speech) { load(); speech.addEventListener("voiceschanged", load); }
  function pick(kind) {
    var want = kind === "female" ? FEMALE : MALE, other = kind === "female" ? MALE : FEMALE;
    var fits = voices.filter(function (v) { return want.test(v.name) && !other.test(v.name); });
    return fits.filter(function (v) { return v.localService; })[0] || fits[0] || null;
  }
  function speak(name, index) {
    if (!speech) return;
    var kind = name.getAttribute("data-voice");
    var talk = new SpeechSynthesisUtterance(name.querySelector(".orb-name-hello").textContent);
    var voice = pick(kind);
    if (voice) { talk.voice = voice; talk.lang = voice.lang; }
    // with no matching voice, the default one, pitched up or down to suit
    talk.pitch = voice ? 1 : (kind === "female" ? 1.35 : 0.85);
    stop();
    // (only the hello still playing may say it has ended: a cut-off one's "ended" can come late)
    live = { talk: talk, index: index };
    talk.onstart = function () { tell(index, "tokenz:speaking", true); tell(index, "tokenz:word"); };
    talk.onboundary = function () { tell(index, "tokenz:word"); };
    talk.onend = talk.onerror = function () {
      if (live && live.talk === talk) { tell(index, "tokenz:speaking", false); live = null; }
    };
    speech.speak(talk);
  }

  var current = null;
  function say(name, again) {
    if (!name.querySelector(".orb-name-hello")) return;
    // (a click on the name it's already saying doesn't start it over)
    var busy = (playing && playing.name === name) || (live && speech && speech.speaking);
    if (!again && current === name && busy) return;
    current = name;
    var index = Array.prototype.indexOf.call(names, name);
    if (!play(name, index)) speak(name, index);
  }

  names.forEach(function (name) {
    name.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") say(name, true); });
    name.addEventListener("click", function () { say(name, false); });
  });

  // Hovering (or tapping) a ball (orbs.js tells us which): its hello, and the hello in place of
  // the name until the pointer leaves the ball
  window.addEventListener("tokenz:ball-hover", function (e) {
    var name = names[e.detail.index];
    if (!name) return;
    name.classList.add("is-saying");
    say(name, true);
  });
  window.addEventListener("tokenz:ball-leave", function (e) {
    var name = names[e.detail.index];
    if (name) name.classList.remove("is-saying");
  });
})();
