// Bullet Poker audio: everything is synthesized with the Web Audio API (no files).
// See DESIGN.md §6 for the recipes.
(function (root) {
'use strict';

function createAudio() {
  const AC = root.AudioContext || root.webkitAudioContext;
  let ctx = null, master, musicBus, musicFilter, sfxBus, reverb, noiseBuf;
  let musicOn = true, sfxOn = true, started = false;
  let schedTimer = null, heartTimer = null;
  try { const s = JSON.parse(localStorage.getItem('bp-audio')); if (s) { musicOn = s.music !== false; sfxOn = s.sfx !== false; } } catch {}
  const save = () => { try { localStorage.setItem('bp-audio', JSON.stringify({music: musicOn, sfx: sfxOn})); } catch {} };

  function init() {
    if (ctx || !AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    // short synthetic room reverb
    reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 1.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    reverb.buffer = ir;
    const revGain = ctx.createGain(); revGain.gain.value = 0.35; reverb.connect(revGain).connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 1 : 0; sfxBus.connect(master); sfxBus.connect(reverb);
    musicFilter = ctx.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 9000;
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.22 : 0;
    musicFilter.connect(musicBus).connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  /* ---------- building blocks ---------- */
  const now = () => ctx.currentTime;
  function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function noise(t, dur, {type = 'bandpass', freq = 2000, q = 1, to = null, gain = 0.5, attack = 0.002, bus = sfxBus} = {}) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain(); env(g, t, attack, gain, dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random()); src.stop(t + attack + dur + 0.05);
  }
  function tone(t, freq, dur, {type = 'sine', gain = 0.3, attack = 0.003, to = null, bus = sfxBus, detune = 0} = {}) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain(); env(g, t, attack, gain, dur);
    o.connect(g).connect(bus); o.start(t); o.stop(t + attack + dur + 0.05);
  }
  // Rhodes-ish electric piano note
  function keys(t, freq, dur, gain = 0.12, bus = musicFilter) {
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    car.frequency.value = freq; mod.frequency.value = freq * 2; mg.gain.setValueAtTime(freq * 1.2, t); mg.gain.exponentialRampToValueAtTime(1, t + dur);
    mod.connect(mg).connect(car.frequency);
    env(g, t, 0.006, gain, dur);
    car.connect(g).connect(bus); car.start(t); mod.start(t); car.stop(t + dur + 0.1); mod.stop(t + dur + 0.1);
  }

  /* ---------- sound effects ---------- */
  const SFX = {
    flick(t = now()) { noise(t, 0.07, {freq: 2500, to: 5000, q: 0.8, gain: 0.35}); },
    deal(count = 2) { const t = now(); for (let i = 0; i < Math.min(count, 8); i++) SFX.flick(t + i * 0.09); },
    board(count = 1) { const t = now(); for (let i = 0; i < count; i++) { SFX.flick(t + i * 0.16); tone(t + i * 0.16 + 0.05, 180, 0.05, {gain: 0.08, to: 90}); } },
    knock(t = now()) { tone(t, 160, 0.07, {to: 70, gain: 0.5}); noise(t, 0.03, {type: 'lowpass', freq: 900, gain: 0.25}); },
    check() { const t = now(); SFX.knock(t); SFX.knock(t + 0.13); },
    clink(t = now()) { tone(t, 2800 + Math.random() * 200, 0.18, {gain: 0.09}); tone(t, 4200 + Math.random() * 300, 0.12, {gain: 0.06}); noise(t, 0.015, {type: 'highpass', freq: 5000, gain: 0.08}); },
    bet(n = 1) { const t = now(); for (let i = 0; i < Math.max(1, n); i++) SFX.clink(t + i * 0.09); },
    allin() { const t = now(); for (let i = 0; i < 6; i++) SFX.clink(t + i * 0.07); tone(t + 0.5, 70, 0.9, {gain: 0.5, to: 40}); noise(t + 0.5, 0.6, {type: 'lowpass', freq: 300, gain: 0.25}); },
    fold() { const t = now(); noise(t, 0.22, {freq: 1200, to: 3500, q: 0.6, gain: 0.3}); tone(t + 0.2, 110, 0.12, {to: 60, gain: 0.25}); },
    switch() { const t = now(); SFX.flick(t); SFX.flick(t + 0.14); },
    spin() {
      const t = now(); let dt = 0.035, tt = t;
      for (let i = 0; i < 15; i++) { noise(tt, 0.012, {type: 'highpass', freq: 3500, gain: 0.25}); tone(tt, 1400, 0.01, {gain: 0.05}); tt += dt; dt *= 1.12; }
      // hammer cocks
      noise(tt + 0.15, 0.02, {type: 'bandpass', freq: 2200, q: 3, gain: 0.5}); noise(tt + 0.24, 0.03, {type: 'bandpass', freq: 1500, q: 3, gain: 0.45});
    },
    click() { const t = now(); noise(t, 0.015, {type: 'highpass', freq: 3000, gain: 0.7}); tone(t, 1800, 0.02, {gain: 0.15}); noise(t + 0.35, 0.7, {type: 'lowpass', freq: 900, gain: 0.08, attack: 0.15}); },
    bang() {
      const t = now();
      noise(t, 0.9, {type: 'lowpass', freq: 9000, to: 200, q: 0.5, gain: 1.0, attack: 0.001});
      tone(t, 90, 0.5, {to: 35, gain: 0.9, attack: 0.001});
      noise(t, 0.05, {type: 'highpass', freq: 2000, gain: 0.8, attack: 0.001});
    },
    // God Save: dry hammer click, then a soft choir chord and a shimmer of bells
    godSave() {
      const t = now();
      noise(t, 0.015, {type: 'highpass', freq: 3000, gain: 0.7});
      [261.63, 329.63, 392, 523.25, 659.25].forEach((f, i) => {
        for (const d of [-8, 8]) tone(t + 0.25, f, 2.6, {type: 'sawtooth', gain: 0.018, attack: 0.5, detune: d});
        tone(t + 0.25, f * 2, 2.4, {type: 'sine', gain: 0.03, attack: 0.6});
      });
      [1568, 2093, 2637, 3136, 2637, 2093].forEach((f, i) => tone(t + 0.4 + i * 0.11, f, 0.9, {gain: 0.05}));
    },
    loadStart() { const t = now(); noise(t, 0.03, {type: 'bandpass', freq: 2400, q: 3, gain: 0.45}); noise(t + 0.05, 0.18, {type: 'bandpass', freq: 1200, to: 2600, q: 1.5, gain: 0.15}); },
    loadBullet() { const t = now(); tone(t, 3200, 0.06, {gain: 0.07}); noise(t + 0.04, 0.025, {type: 'bandpass', freq: 2800, q: 4, gain: 0.5}); tone(t + 0.04, 900, 0.04, {gain: 0.12, to: 600}); },
    win() { const t = now(); [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => keys(t + i * 0.09, f, 0.7, 0.16, sfxBus)); },
    yourTurn() { const t = now(); tone(t, 880, 0.35, {gain: 0.12}); tone(t + 0.12, 1320, 0.45, {gain: 0.1}); },
    ui() { tone(now(), 1500, 0.025, {gain: 0.05}); },
    lose() { const t = now(); keys(t, 110, 1.6, 0.2, sfxBus); keys(t, 103.8, 1.6, 0.15, sfxBus); },
  };

  /* ---------- music ---------- */
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  // generic subtractive voice into the music bus
  function synth(t, freq, dur, {type = 'sawtooth', gain = 0.1, cutoff = 1200, q = 1, attack = 0.005, sweep = null, vibrato = 0} = {}) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (vibrato) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.5; lg.gain.value = vibrato; l.connect(lg).connect(o.detune); l.start(t); l.stop(t + dur + 0.1); }
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = ctx.createGain(); env(g, t, attack, gain, dur);
    o.connect(f).connect(g).connect(musicFilter); o.start(t); o.stop(t + attack + dur + 0.05);
  }
  const kick = (t, g = 0.55) => { tone(t, 150, 0.28, {to: 42, gain: g, attack: 0.001, bus: musicFilter}); };
  const snare = (t, g = 0.22) => { noise(t, 0.14, {type: 'bandpass', freq: 1900, q: 0.7, gain: g, bus: musicFilter}); tone(t, 210, 0.08, {to: 150, gain: g * 0.6, bus: musicFilter}); };
  const hat = (t, g = 0.05, open = false) => noise(t, open ? 0.16 : 0.03, {type: 'highpass', freq: 7500, gain: g, bus: musicFilter});
  const taiko = (t, g = 0.45) => { tone(t, 110, 0.4, {to: 55, gain: g, attack: 0.002, bus: musicFilter}); noise(t, 0.12, {type: 'lowpass', freq: 500, gain: g * 0.5, bus: musicFilter}); };

  // Track 1 — "High Stakes": D minor, 112 BPM, adaptive intensity 0..3 (DESIGN.md §6.1)
  const STAKES = {
    stepDur: 60 / 112 / 4,
    bars: [
      {bass: 38, chord: [62, 65, 69]},   // Dm
      {bass: 34, chord: [58, 62, 65]},   // Bb
      {bass: 43, chord: [62, 67, 70]},   // Gm
      {bass: 45, chord: [61, 64, 69]},   // A
    ],
    hook: [74, 69, 77, 76, 74, 72, 69, 70],
    step(t, i) {
      const L = intensity, s = i % 16, barN = Math.floor(i / 16), bar = this.bars[barN % 4], SD = this.stepDur;
      // dark pad, once per bar
      if (s === 0) { synth(t, mtof(bar.bass + 12), SD * 15, {gain: 0.05, cutoff: 500, attack: 0.3}); synth(t, mtof(bar.bass + 19), SD * 15, {gain: 0.035, cutoff: 500, attack: 0.3}); }
      // pulsing bass
      if (L >= 3 || s % 2 === 0) synth(t, mtof(bar.bass + (s % 4 === 2 ? 12 : 0)), SD * 0.9, {gain: 0.2, cutoff: 380 + L * 120, q: 4, attack: 0.003, sweep: 140});
      // drums
      const kicks = L >= 3 ? [0, 4, 8, 12, 14] : L >= 2 ? [0, 6, 8, 14] : [0, 8];
      if (kicks.includes(s)) kick(t);
      if (L >= 1 && (s === 4 || s === 12)) snare(t);
      if (s % 4 === 2) hat(t, 0.06, L >= 2 && s === 14);
      if (L >= 2 && s % 2 === 1) hat(t, 0.025);
      if (L >= 3 && s % 4 === 0) taiko(t, 0.3);
      if (L >= 3 && barN % 4 === 3 && s >= 12) taiko(t, 0.2 + (s - 12) * 0.06);
      // string stabs (tresillo)
      if (L >= 1 && [0, 3, 6, 10].includes(s)) bar.chord.forEach(m => synth(t, mtof(m), SD * 1.6, {gain: 0.035, cutoff: 2200, attack: 0.004, sweep: 700}));
      // 16th arpeggio
      if (L >= 2) { const notes = bar.chord.concat(bar.chord.map(m => m + 12)); synth(t, mtof(notes[(s * 2 + barN) % notes.length] + 12), SD * 0.8, {type: 'square', gain: 0.022, cutoff: 3000, sweep: 900}); }
      // whistle hook, western style
      if (L >= 1 && barN % 8 === 0 && s % 4 === 0 && s < 16) { const n = this.hook[(s / 4 + (barN % 16 ? 4 : 0)) % 8]; synth(t, mtof(n), SD * 3.6, {type: 'sine', gain: 0.07, cutoff: 6000, attack: 0.04, vibrato: 18}); }
      // riser into the loop at full intensity
      if (L >= 3 && s === 0 && barN % 4 === 2) noise(t, SD * 32, {type: 'bandpass', freq: 400, to: 7000, q: 2, gain: 0.07, attack: SD * 30, bus: musicFilter});
    },
  };

  // Track 2 — "Smoky Jazz": slow swing, Am7 – D7 – Gmaj7 – E7
  const JAZZ = {
    stepDur: 60 / 84,
    chords: [
      {tones: [57, 60, 64, 67], walk: [45, 48, 52, 50]},
      {tones: [54, 57, 60, 62], walk: [50, 54, 57, 56]},
      {tones: [55, 59, 62, 66], walk: [43, 47, 50, 51]},
      {tones: [56, 59, 62, 64], walk: [52, 56, 59, 46]},
    ],
    step(t, i) {
      const BEAT = this.stepDur, ch = this.chords[Math.floor(i / 4) % 4], beat = i % 4;
      tone(t, mtof(ch.walk[beat]), BEAT * 0.9, {type: 'triangle', gain: 0.32, attack: 0.01, bus: musicFilter});
      if (beat === 1 || beat === 3) ch.tones.forEach((m, k) => keys(t + k * 0.008, mtof(m), BEAT * 0.8, 0.05));
      noise(t, 0.12, {type: 'bandpass', freq: 5000, q: 0.4, gain: beat % 2 ? 0.07 : 0.035, attack: 0.02, bus: musicFilter});
      noise(t + BEAT * 0.66, 0.06, {type: 'bandpass', freq: 6000, q: 0.5, gain: 0.03, bus: musicFilter});
      if (Math.random() < 0.5) noise(t + Math.random() * BEAT, 0.004, {type: 'highpass', freq: 3000, gain: 0.05 + Math.random() * 0.05, bus: musicFilter});
      if (beat === 0 && Math.random() < 0.45) {
        const scale = [69, 72, 74, 76, 79, 81];
        let m = scale[Math.floor(Math.random() * scale.length)];
        for (let n = 0; n < 3; n++) { keys(t + BEAT * (0.66 * n + 0.5), mtof(m), BEAT * 0.6, 0.045); m = scale[Math.max(0, Math.min(scale.length - 1, scale.indexOf(m) + (Math.random() < 0.5 ? -1 : 1)))]; }
      }
    },
  };
  const TRACKS = {stakes: STAKES, jazz: JAZZ};
  const TRACK_NAME = {stakes: 'High Stakes', jazz: 'Smoky Jazz'};
  const TRACK_GAIN = {stakes: 0.24, jazz: 0.22};
  let track = 'stakes', intensity = 0, stepIdx = 0, nextStep = 0, ducked = false;
  try { const s = JSON.parse(localStorage.getItem('bp-audio')); if (s && TRACKS[s.track]) track = s.track; } catch {}
  const musicGain = () => musicOn ? TRACK_GAIN[track] * (ducked ? 0.45 : 1) : 0;

  function scheduler() {
    if (!ctx || !musicOn) { if (ctx) nextStep = ctx.currentTime + 0.05; return; }
    const tr = TRACKS[track];
    while (nextStep < ctx.currentTime + 0.25) { tr.step(nextStep, stepIdx++); nextStep += tr.stepDur; }
  }
  function startMusic() {
    if (schedTimer) return;
    nextStep = ctx.currentTime + 0.1;
    schedTimer = setInterval(scheduler, 50);
  }

  /* ---------- tension: duck music + heartbeat while a gun is raised ---------- */
  function tension(on) {
    if (!ctx) return;
    const t = now();
    ducked = on;
    musicFilter.frequency.cancelScheduledValues(t);
    musicFilter.frequency.setTargetAtTime(on ? 350 : 9000, t, on ? 0.15 : 0.6);
    musicBus.gain.cancelScheduledValues(t);
    musicBus.gain.setTargetAtTime(musicGain(), t, 0.3);
    clearInterval(heartTimer); heartTimer = null;
    if (on && sfxOn) {
      const beat = () => { const t2 = now(); tone(t2, 55, 0.12, {to: 40, gain: 0.55}); tone(t2 + 0.22, 50, 0.14, {to: 38, gain: 0.4}); };
      beat(); heartTimer = setInterval(beat, 700);
    }
  }
  const save2 = () => { try { localStorage.setItem('bp-audio', JSON.stringify({music: musicOn, sfx: sfxOn, track})); } catch {} };

  return {
    unlock() {
      init(); if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      musicBus.gain.value = musicGain();
      if (!started) { started = true; startMusic(); }
    },
    play(name, arg) { if (!ctx || !sfxOn || !SFX[name]) return; try { SFX[name](arg); } catch (e) { console.error(e); } },
    tension,
    setIntensity(l) { intensity = Math.max(0, Math.min(3, l | 0)); },
    get music() { return musicOn; }, get sfx() { return sfxOn; },
    get musicLabel() { return musicOn ? TRACK_NAME[track] : 'Music off'; },
    setMusic(v) { musicOn = v; save2(); if (ctx) musicBus.gain.setTargetAtTime(musicGain(), now(), 0.2); },
    // High Stakes → Smoky Jazz → off → High Stakes
    cycleMusic() {
      if (!musicOn) { musicOn = true; track = 'stakes'; }
      else if (track === 'stakes') track = 'jazz';
      else musicOn = false;
      stepIdx = 0; if (ctx) { nextStep = ctx.currentTime + 0.1; musicBus.gain.setTargetAtTime(musicGain(), now(), 0.2); }
      save2();
    },
    setSfx(v) { sfxOn = v; save2(); if (ctx) sfxBus.gain.setTargetAtTime(v ? 1 : 0, now(), 0.05); if (!v) tension(false); },
  };
}

root.PokerAudio = {createAudio};
})(window);
