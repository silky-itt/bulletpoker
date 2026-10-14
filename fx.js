// Bullet Poker effects kit (Three.js r128 UMD): scaled time for hit-stop and slow motion,
// tweens, and pooled particles drawn as two Points clouds (one additive, one alpha-blended).
// scene.js owns what the effects look like; this file only runs them. See DESIGN.md §3.4.
(function (root) {
'use strict';
const T = root.THREE;

const ease = {
  linear: p => p,
  inOut: p => p * p * (3 - 2 * p),
  in: p => p * p * p,
  out: p => 1 - (1 - p) ** 3,
  back: p => { const c = 1.9; return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2; },
  bounce: p => {
    if (p < 1 / 2.75) return 7.5625 * p * p;
    if (p < 2 / 2.75) return 7.5625 * (p -= 1.5 / 2.75) * p + 0.75;
    if (p < 2.5 / 2.75) return 7.5625 * (p -= 2.25 / 2.75) * p + 0.9375;
    return 7.5625 * (p -= 2.625 / 2.75) * p + 0.984375;
  },
};

/* ---------- particle sprite atlas: 4 cells of 64 px ---------- */
const CELL = {glow: 0, smoke: 1, spark: 2, drop: 3};
function atlas() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  const radial = (x, stops) => { const gr = g.createRadialGradient(x + 32, 32, 0, x + 32, 32, 32); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
  // glow: soft round falloff
  g.fillStyle = radial(0, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, 64, 64);
  // smoke: a lumpy cluster of soft blobs
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 9; i++) {
    const x = 64 + 18 + rnd() * 28, y = 18 + rnd() * 28, r = 10 + rnd() * 10;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.42)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(64, 0, 64, 64);
  }
  // spark: hot core with a four-point glint
  g.fillStyle = radial(128, [[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,255,255,.9)'], [0.4, 'rgba(255,255,255,.15)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(128, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,.7)';
  g.beginPath(); g.moveTo(160, 2); g.lineTo(163, 32); g.lineTo(160, 62); g.lineTo(157, 32); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(130, 32); g.lineTo(160, 29); g.lineTo(190, 32); g.lineTo(160, 35); g.closePath(); g.fill();
  // drop: a teardrop with a highlight (sweat)
  g.fillStyle = 'rgba(255,255,255,.85)';
  g.beginPath(); g.moveTo(224, 8); g.bezierCurveTo(236, 26, 242, 36, 242, 44); g.arc(224, 44, 18, 0, Math.PI); g.bezierCurveTo(206, 36, 212, 26, 224, 8); g.fill();
  g.fillStyle = 'rgba(255,255,255,1)'; g.beginPath(); g.arc(218, 42, 5, 0, Math.PI * 2); g.fill();
  const tx = new T.CanvasTexture(cv); tx.minFilter = T.LinearFilter; tx.generateMipmaps = false;
  return tx;
}

const VERT = `
attribute float size; attribute float alpha; attribute vec3 tint; attribute float cell; attribute float rot;
uniform float uScale;
varying float vA; varying vec3 vC; varying float vCell; varying float vRot;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = alpha <= 0.0 ? 0.0 : min(size * uScale / max(0.05, -mv.z), 400.0);
  vA = alpha; vC = tint; vCell = cell; vRot = rot;
}`;
const FRAG = `
uniform sampler2D map;
varying float vA; varying vec3 vC; varying float vCell; varying float vRot;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float s = sin(vRot), k = cos(vRot);
  c = mat2(k, -s, s, k) * c + 0.5;
  if (c.x < 0.0 || c.y < 0.0 || c.x > 1.0 || c.y > 1.0) discard;
  vec4 tx = texture2D(map, vec2((vCell + c.x) / 4.0, 1.0 - c.y));
  gl_FragColor = vec4(vC * tx.rgb, tx.a * vA);
}`;

function cloud(cap, blending, map) {
  const geo = new T.BufferGeometry();
  const attr = (name, n) => { const a = new T.BufferAttribute(new Float32Array(cap * n), n); a.setUsage(T.DynamicDrawUsage); geo.setAttribute(name, a); return a; };
  const A = {position: attr('position', 3), size: attr('size', 1), alpha: attr('alpha', 1), tint: attr('tint', 3), cell: attr('cell', 1), rot: attr('rot', 1)};
  const mat = new T.ShaderMaterial({
    uniforms: {map: {value: map}, uScale: {value: 600}},
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, blending,
  });
  const pts = new T.Points(geo, mat);
  pts.frustumCulled = false; pts.renderOrder = blending === T.AdditiveBlending ? 3 : 2;
  geo.setDrawRange(0, 0);
  // per-particle simulation state
  const P = [];
  for (let i = 0; i < cap; i++) P.push({live: false, pos: new T.Vector3(), vel: new T.Vector3(), age: 0, life: 1, s0: 0, s1: 0, a: 1, color: new T.Color(), cell: 0, rot: 0, spin: 0, drag: 0, grav: 0, fadeIn: 0.08});
  return {pts, A, P, cap, next: 0, used: 0, uniforms: mat.uniforms};
}

/* ---------- the kit ---------- */
function createFX(scene) {
  const map = atlas();
  const add = cloud(320, T.AdditiveBlending, map);
  const norm = cloud(260, T.NormalBlending, map);
  scene.add(norm.pts, add.pts);
  const reduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const low = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
  const density = low ? 0.55 : 1;

  let time = 0, scale = 1, freezeLeft = 0, slow = null;
  const tweens = [], emitters = [];

  // Spawn one particle. o: {pos, vel, life, size:[from,to], alpha, color, cell, rot, spin, drag, grav, add}
  function spawn(o) {
    const C = o.add === false ? norm : add;
    let p = null;
    for (let n = 0; n < C.cap; n++) { const q = C.P[(C.next + n) % C.cap]; if (!q.live) { p = q; C.next = (C.next + n + 1) % C.cap; break; } }
    if (!p) { p = C.P[C.next]; C.next = (C.next + 1) % C.cap; } // pool full: recycle the oldest slot
    p.live = true; p.age = 0;
    p.pos.copy(o.pos); p.vel.copy(o.vel || ZERO);
    p.life = o.life || 1; p.s0 = o.size ? o.size[0] : 0.05; p.s1 = o.size ? o.size[1] : p.s0;
    p.a = o.alpha == null ? 1 : o.alpha; p.color.set(o.color == null ? 0xffffff : o.color);
    p.cell = CELL[o.cell || 'glow']; p.rot = o.rot == null ? Math.random() * 6.28 : o.rot; p.spin = o.spin || 0;
    p.drag = o.drag || 0; p.grav = o.grav || 0; p.fadeIn = o.fadeIn == null ? 0.08 : o.fadeIn;
  }
  const ZERO = new T.Vector3();
  // n particles from a factory i => options; n is scaled down on phones
  function burst(n, make) { const k = Math.max(1, Math.round(n * density)); for (let i = 0; i < k; i++) spawn(make(i, k)); }
  // a stream: rate per second for dur seconds; make(i) => options or null
  function emit(rate, dur, make) { const e = {rate: rate * density, left: dur, acc: 0, make, i: 0}; emitters.push(e); return {stop() { e.left = 0; }}; }

  function tween(dur, update, opt = {}) {
    const tw = {dur: Math.max(1e-4, dur), t: -(opt.delay || 0), update, ease: opt.ease || ease.inOut, done: opt.done, dead: false};
    tweens.push(tw); return {cancel() { tw.dead = true; }};
  }
  function after(sec, fn) { return tween(1e-4, () => {}, {delay: sec, done: fn}); }

  // Freeze the world for `freeze` s, then play at `slowScale` easing back to 1 over `slowDur` s.
  function hitStop(freeze, slowScale = 1, slowDur = 0) {
    if (reduced) return;
    freezeLeft = freeze; slow = slowDur > 0 ? {from: slowScale, dur: slowDur, t: 0} : null;
  }

  function stepCloud(C, dt) {
    const {A, P} = C; let used = 0;
    for (let i = 0; i < C.cap; i++) {
      const p = P[i];
      if (p.live) {
        p.age += dt;
        if (p.age >= p.life) p.live = false;
      }
      if (!p.live) { if (i < C.used) A.alpha.array[i] = 0; continue; }
      used = i + 1;
      if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.vel.y -= p.grav * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.rot += p.spin * dt;
      const k = p.age / p.life;
      const fade = Math.min(1, k / Math.max(1e-3, p.fadeIn)) * (1 - k) * (1 - k * 0.3);
      A.position.array[i * 3] = p.pos.x; A.position.array[i * 3 + 1] = p.pos.y; A.position.array[i * 3 + 2] = p.pos.z;
      A.size.array[i] = p.s0 + (p.s1 - p.s0) * (1 - (1 - k) * (1 - k));
      A.alpha.array[i] = p.a * fade;
      A.tint.array[i * 3] = p.color.r; A.tint.array[i * 3 + 1] = p.color.g; A.tint.array[i * 3 + 2] = p.color.b;
      A.cell.array[i] = p.cell; A.rot.array[i] = p.rot;
    }
    const range = Math.max(used, C.used);
    C.used = used;
    C.pts.geometry.setDrawRange(0, range);
    if (range) for (const k in A) A[k].needsUpdate = true;
  }

  // Advance by a real dt; returns the scaled dt the rest of the scene should use.
  function step(realDt, camera, renderer) {
    realDt *= root.__fxSlow ?? 1; // dev pages slow everything down to inspect frames
    let dt = realDt;
    if (freezeLeft > 0) { freezeLeft -= realDt; dt = 0; }
    else if (slow) { slow.t += realDt; const p = Math.min(1, slow.t / slow.dur); dt = realDt * (slow.from + (1 - slow.from) * ease.in(p)); if (p >= 1) slow = null; }
    scale = realDt ? dt / realDt : 1;
    time += dt;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      if (tw.dead) { tweens.splice(i, 1); continue; }
      tw.t += dt;
      if (tw.t < 0) continue;
      const p = Math.min(1, tw.t / tw.dur);
      tw.update(tw.ease(p), p);
      if (p >= 1) { tweens.splice(i, 1); if (tw.done) tw.done(); }
    }
    for (let i = emitters.length - 1; i >= 0; i--) {
      const e = emitters[i];
      e.left -= dt; e.acc += e.rate * dt;
      while (e.acc >= 1) { e.acc -= 1; const o = e.make(e.i++); if (o) spawn(o); }
      if (e.left <= 0) emitters.splice(i, 1);
    }
    stepCloud(add, dt); stepCloud(norm, dt);
    // world-size points: pixels per unit at distance 1
    const h = renderer.getDrawingBufferSize(SIZE).y;
    const sc = h / (2 * Math.tan(T.MathUtils.degToRad(camera.fov) / 2));
    add.uniforms.uScale.value = norm.uniforms.uScale.value = sc;
    return dt;
  }
  const SIZE = new T.Vector2();

  return {
    spawn, burst, emit, tween, after, hitStop, step, ease,
    get time() { return time; }, get scale() { return scale; },
    reduced, low,
  };
}

root.PokerFX = {createFX, ease};
})(window);
