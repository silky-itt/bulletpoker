// Bullet Poker room: the bar around the table, and the table itself. Built from primitives and
// canvas-drawn textures (no image files). scene.js calls build() once and update() every frame.
// Static decor is merged into one mesh per material to keep draw calls low. See DESIGN.md §3.1.
(function (root) {
'use strict';
const T = root.THREE;

/* ---------- canvas textures ---------- */
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const range = (a, b) => a + rnd() * (b - a);
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, rx = 1, ry = 1) {
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry); t.encoding = T.sRGBEncoding; t.anisotropy = 4;
  return t;
}
function noise(g, w, h, amt) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}
// planks running along x: tone per plank, wavy grain, the odd knot, dark seams
function woodCanvas(w, h, {base, dark, light, planks = 6, seams = true}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const ph = h / planks;
  for (let p = 0; p < planks; p++) {
    const y0 = p * ph;
    g.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${range(0.04, 0.16)})` : `rgba(255,220,170,${range(0.02, 0.08)})`; g.fillRect(0, y0, w, ph);
    for (let i = 0; i < 30; i++) {
      const y = y0 + rnd() * ph, amp = range(0.5, 3), f = range(0.004, 0.02), o = rnd() * 6;
      g.strokeStyle = rnd() < 0.65 ? dark : light; g.globalAlpha = range(0.06, 0.22); g.lineWidth = range(0.5, 1.8);
      g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * f + o) * amp); g.stroke();
    }
    if (rnd() < 0.45) { g.globalAlpha = 0.4; g.fillStyle = dark; g.beginPath(); g.ellipse(rnd() * w, y0 + ph * range(0.3, 0.7), range(5, 12), range(2, 5), 0, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
    if (seams) { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, y0, w, 2); g.fillRect(rnd() * w, y0, 2, ph); }
  }
  noise(g, w, h, 10);
  return c;
}
const WOOD = {
  floor: {base: '#3a2616', dark: '#1a0f08', light: '#6a4a2a', planks: 8},
  dark: {base: '#2c1a0e', dark: '#120a04', light: '#5a3a1e', planks: 4},
  bar: {base: '#4a2410', dark: '#1e0c04', light: '#7a4424', planks: 3, seams: false},
  table: {base: '#3c2010', dark: '#160904', light: '#6a3a1c', planks: 2, seams: false},
  chair: {base: '#4a2c16', dark: '#1e1006', light: '#7a5030', planks: 2, seams: false},
};
const woodTexCache = {};
function woodTex(kind, rx = 1, ry = 1) {
  const key = kind + rx + 'x' + ry;
  if (!woodTexCache[key]) woodTexCache[key] = tex(woodCanvas(512, 512, WOOD[kind]), rx, ry);
  return woodTexCache[key];
}

// table felt: fibres, a darker worn rim, a printed gold racetrack, a faint six-chamber emblem, and stains
function feltCanvas(feltR) {
  const S = 1024, [c, g] = canvas(S, S), px = r => r / feltR * S / 2;
  g.fillStyle = '#1f4a32'; g.fillRect(0, 0, S, S);
  noise(g, S, S, 16);
  for (let i = 0; i < 2600; i++) { g.strokeStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '170,220,180'},0.05)`; g.lineWidth = 1; const x = rnd() * S, y = rnd() * S, a = rnd() * 6.28; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); g.stroke(); }
  const rg = g.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.5);
  rg.addColorStop(0, 'rgba(255,250,210,0.06)'); rg.addColorStop(0.7, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,0.4)');
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
  g.translate(S / 2, S / 2);
  // racetrack: two gold rings outside the cards
  g.strokeStyle = 'rgba(214,176,92,.5)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, px(1.64), 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, px(1.6), 0, Math.PI * 2); g.stroke();
  // emblem: a revolver cylinder seen from behind, with the name around it
  g.strokeStyle = 'rgba(10,30,20,.45)'; g.fillStyle = 'rgba(10,30,20,.3)'; g.lineWidth = 6;
  g.beginPath(); g.arc(0, 0, px(0.42), 0, Math.PI * 2); g.stroke();
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.beginPath(); g.arc(Math.cos(a) * px(0.24), Math.sin(a) * px(0.24), px(0.08), 0, Math.PI * 2); g.fill(); }
  g.font = '700 30px Georgia, serif'; g.fillStyle = 'rgba(214,176,92,.32)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const text = 'BULLET  POKER  ·  HOUSE  OF  LIARS  ·  ', n = text.length;
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; g.save(); g.rotate(a); g.translate(0, -px(0.55)); g.fillText(text[i], 0, 0); g.restore(); }
  // a few glass rings and a cigarette burn near the rail
  for (let i = 0; i < 5; i++) {
    const a = rnd() * Math.PI * 2, r = px(range(1.45, 1.75));
    g.strokeStyle = `rgba(20,14,6,${range(0.12, 0.25)})`; g.lineWidth = range(2, 4);
    g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, px(0.045), rnd(), rnd() + range(4, 6.2)); g.stroke();
  }
  for (const a of [2.2, 4.9]) { const r = px(1.5), x = Math.cos(a) * r, y = Math.sin(a) * r, gr = g.createRadialGradient(x, y, 0, x, y, 9); gr.addColorStop(0, 'rgba(10,6,2,.85)'); gr.addColorStop(1, 'rgba(40,30,10,0)'); g.fillStyle = gr; g.fillRect(x - 10, y - 10, 20, 20); }
  return c;
}
// padded leather rail: wrinkles and a stitched seam (on the torus, v = 0.25 is the top of the tube)
function leatherCanvas() {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#2e1810'; g.fillRect(0, 0, 512, 128);
  noise(g, 512, 128, 22);
  for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(0,0,0,${range(0.08, 0.2)})`; g.lineWidth = 1; const x = rnd() * 512, y = rnd() * 128; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + range(-20, 20), y + range(-6, 6), x + range(-40, 40), y + range(-3, 3)); g.stroke(); }
  g.strokeStyle = 'rgba(200,170,120,.55)'; g.lineWidth = 2; g.setLineDash([7, 6]);
  for (const y of [32, 96]) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  return c;
}
// dark damask wallpaper
function wallpaperCanvas() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#2a1510'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#331b14';
  for (const [x, y] of [[0, 0], [128, 128], [256, 0], [0, 256], [256, 256]]) {
    g.save(); g.translate(x, y);
    for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.ellipse(0, -34, 14, 34, 0, 0, Math.PI * 2); g.fill(); }
    g.beginPath(); g.arc(0, 0, 10, 0, Math.PI * 2); g.fill(); g.restore();
  }
  g.strokeStyle = 'rgba(160,110,60,.12)'; g.lineWidth = 2; for (const x of [64, 192]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  noise(g, 256, 256, 12);
  return c;
}
// lower wall: vertical boards with a raised panel
function wainscotCanvas() {
  const c = woodCanvas(256, 256, {base: '#2a170c', dark: '#100804', light: '#4e301a', planks: 1, seams: false});
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 4; g.strokeRect(24, 30, 208, 196);
  g.strokeStyle = 'rgba(255,200,140,.12)'; g.lineWidth = 2; g.strokeRect(29, 35, 198, 186);
  g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 0, 3, 256);
  return c;
}
function rugCanvas() {
  const S = 512, [c, g] = canvas(S, S);
  g.fillStyle = '#4a1414'; g.fillRect(0, 0, S, S);
  g.translate(S / 2, S / 2);
  const ring = (r, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
  ring(246, 14, '#2a0a0a'); ring(226, 6, '#b08a4a'); ring(205, 3, '#b08a4a');
  for (let k = 0; k < 32; k++) { g.save(); g.rotate(k * Math.PI / 16); g.fillStyle = '#7a2a1a'; g.beginPath(); g.moveTo(0, -200); g.lineTo(10, -176); g.lineTo(0, -152); g.lineTo(-10, -176); g.fill(); g.restore(); }
  ring(140, 4, '#6a2418');
  g.setTransform(1, 0, 0, 1, 0, 0);
  noise(g, S, S, 26);
  return c;
}
function posterCanvas(kind) {
  const [c, g] = canvas(256, 352);
  if (kind === 'wanted') {
    g.fillStyle = '#d8c7a0'; g.fillRect(0, 0, 256, 352); noise(g, 256, 352, 30);
    g.fillStyle = '#2a1a10'; g.textAlign = 'center';
    g.font = '900 52px Georgia, serif'; g.fillText('WANTED', 128, 66);
    g.font = '700 18px Georgia, serif'; g.fillText('FOR CHEATING AT CARDS', 128, 96);
    g.beginPath(); g.arc(128, 180, 54, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(84, 150); g.lineTo(96, 104); g.lineTo(112, 140); g.fill(); g.beginPath(); g.moveTo(172, 150); g.lineTo(160, 104); g.lineTo(144, 140); g.fill();
    g.font = '900 44px Georgia, serif'; g.fillText('$500', 128, 290);
    g.font = '700 16px Georgia, serif'; g.fillText('DEAD OR ALIVE', 128, 322);
  } else if (kind === 'rules') { // chalkboard
    g.fillStyle = '#1f2a24'; g.fillRect(0, 0, 256, 352); noise(g, 256, 352, 18);
    g.fillStyle = 'rgba(235,235,225,.85)'; g.textAlign = 'center';
    g.font = '700 30px "Comic Sans MS", cursive'; g.fillText('HOUSE RULES', 128, 52);
    g.font = '20px "Comic Sans MS", cursive';
    ['No cheating', 'No crying', 'One gun', 'Six chambers', 'Last one', 'standing', 'drinks free'].forEach((l, i) => g.fillText(l, 128, 104 + i * 34));
  } else { // a gloomy landscape painting
    const sky = g.createLinearGradient(0, 0, 0, 352); sky.addColorStop(0, '#3a2a3a'); sky.addColorStop(0.6, '#a0603a'); sky.addColorStop(1, '#2a1a10');
    g.fillStyle = sky; g.fillRect(0, 0, 256, 352);
    g.fillStyle = '#1a1210'; g.beginPath(); g.moveTo(0, 260); for (let x = 0; x <= 256; x += 16) g.lineTo(x, 230 + Math.sin(x * 0.04) * 26 + rnd() * 10); g.lineTo(256, 352); g.lineTo(0, 352); g.fill();
    g.fillStyle = 'rgba(255,220,150,.8)'; g.beginPath(); g.arc(180, 170, 18, 0, Math.PI * 2); g.fill();
    noise(g, 256, 352, 14);
  }
  return c;
}
function dartboardCanvas() {
  const [c, g] = canvas(256, 256); g.translate(128, 128);
  g.fillStyle = '#111'; g.beginPath(); g.arc(0, 0, 128, 0, Math.PI * 2); g.fill();
  for (let k = 0; k < 20; k++) {
    const a0 = (k - 0.5) * Math.PI / 10, a1 = a0 + Math.PI / 10, alt = k % 2;
    for (const [r0, r1, col] of [[8, 60, alt ? '#e8dcc0' : '#1a1a1a'], [60, 68, alt ? '#2a7a3a' : '#b02a2a'], [68, 98, alt ? '#e8dcc0' : '#1a1a1a'], [98, 106, alt ? '#2a7a3a' : '#b02a2a']]) {
      g.fillStyle = col; g.beginPath(); g.arc(0, 0, r1, a0, a1); g.arc(0, 0, r0, a1, a0, true); g.fill();
    }
  }
  g.fillStyle = '#2a7a3a'; g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = '#b02a2a'; g.beginPath(); g.arc(0, 0, 4, 0, Math.PI * 2); g.fill();
  return c;
}
function clockCanvas() {
  const [c, g] = canvas(256, 256); g.translate(128, 128);
  g.fillStyle = '#e8dcc0'; g.beginPath(); g.arc(0, 0, 124, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2a1a10'; g.font = '700 30px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let h = 1; h <= 12; h++) { const a = h / 12 * Math.PI * 2; g.fillText(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][h - 1], Math.sin(a) * 96, -Math.cos(a) * 96); }
  noise(g, 256, 256, 14);
  return c;
}
function jukeboxCanvas() {
  const [c, g] = canvas(64, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  ['#ff3060', '#ffa020', '#ffe040', '#30e080', '#30a0ff', '#a040ff', '#ff3060'].forEach((col, i, a) => gr.addColorStop(i / (a.length - 1), col));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
  return c;
}
function glowCanvas(col) {
  const [c, g] = canvas(64, 64), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, col); gr.addColorStop(0.3, col.replace(/[\d.]+\)$/, '0.35)')); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(c);
}

/* ---------- materials ---------- */
const mat = (o) => new T.MeshStandardMaterial(Object.assign({roughness: 0.8, metalness: 0}, o));
let M = null;
function materials() {
  if (M) return M;
  M = {
    floor: mat({map: woodTex('floor', 6, 6), roughness: 0.75}),
    dark: mat({map: woodTex('dark', 1, 1), roughness: 0.7}),
    bar: mat({map: woodTex('bar', 2, 1), roughness: 0.45}),
    barTop: mat({map: woodTex('bar', 6, 1), roughness: 0.25, metalness: 0.05}),
    tableWood: mat({map: woodTex('table', 8, 1), roughness: 0.4}),
    chair: mat({map: woodTex('chair', 1, 1), roughness: 0.6}),
    brass: mat({color: 0xb88a3a, roughness: 0.3, metalness: 0.6}),
    iron: mat({color: 0x2a2826, roughness: 0.5, metalness: 0.5}),
    chrome: mat({color: 0x9a9a9e, roughness: 0.25, metalness: 0.6}),
    redLeather: mat({color: 0x5a1a14, roughness: 0.5}),
    paper: mat({color: 0xe8dcc0, roughness: 0.9}),
    black: mat({color: 0x0e0c0a, roughness: 0.6}),
    ivory: mat({color: 0xe8e0cc, roughness: 0.4}),
    mirror: mat({color: 0x2a3438, roughness: 0.12, metalness: 0.5}),
    wax: mat({color: 0xe8dcc0, roughness: 0.7, emissive: 0x3a2008}),
    glow: new T.MeshBasicMaterial({color: 0xffc070}),
    strip: new T.MeshBasicMaterial({color: 0xffb060}),
    exit: new T.MeshBasicMaterial({color: 0x30d070}),
  };
  return M;
}

/* ---------- merging static decor: one mesh per material ---------- */
function mergeStatic(group, scene) {
  group.updateMatrixWorld(true);
  const byMat = new Map(), keep = [];
  group.traverse(o => {
    if (o.isSprite) { keep.push(o); return; }
    if (!o.isMesh) return;
    if (o.userData.dynamic || Array.isArray(o.material)) { keep.push(o); return; }
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(o);
  });
  for (const [m, list] of byMat) {
    const parts = list.map(o => { let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(o.matrixWorld); return g; });
    const total = parts.reduce((s, g) => s + g.attributes.position.count, 0);
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    let off = 0;
    for (const g of parts) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, off * 3); nor.set(g.attributes.normal.array, off * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, off * 2);
      off += n; g.dispose();
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(nor, 3)); geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    const mesh = new T.Mesh(geo, m); mesh.receiveShadow = list.some(o => o.receiveShadow);
    scene.add(mesh);
  }
  // dynamic pieces keep their own transforms: move them out of the group, into the scene
  for (const o of keep) { o.matrixWorld.decompose(o.position, o.quaternion, o.scale); scene.add(o); }
}

/* ---------- builders ---------- */
const V = (x, y, z) => new T.Vector3(x, y, z);
function add(parent, geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); parent.add(o); return o;
}
// a group standing at a point on the floor, turned to face the table
function spot(parent, x, z, face = true) {
  const g = new T.Group(); g.position.set(x, 0, z);
  if (face) g.rotation.y = Math.atan2(-x, -z); // local -z... we want local +z to face the centre
  parent.add(g); return g;
}
// wall-mounted: on the wall circle at angle a, height y, facing the room
function onWall(parent, R, a, y, inset = 0.04) {
  const g = new T.Group(); g.position.set(Math.cos(a) * (R - inset), y, Math.sin(a) * (R - inset));
  g.lookAt(0, y, 0); parent.add(g); return g;
}
function bottle(parent, x, y, z, M2, kind) {
  const glassMats = M2.bottles, m = glassMats[Math.floor(rnd() * glassMats.length)], h = range(0.26, 0.36);
  if (kind === 0) { add(parent, new T.CylinderGeometry(0.045, 0.05, h, 10), m, x, y + h / 2, z); add(parent, new T.CylinderGeometry(0.014, 0.03, 0.12, 8), m, x, y + h + 0.06, z); }
  else if (kind === 1) { add(parent, new T.BoxGeometry(0.09, h * 0.8, 0.07), m, x, y + h * 0.4, z); add(parent, new T.CylinderGeometry(0.016, 0.02, 0.08, 8), m, x, y + h * 0.8 + 0.04, z); }
  else { add(parent, new T.SphereGeometry(0.07, 10, 8), m, x, y + 0.07, z).scale.set(1, 1.2, 1); add(parent, new T.CylinderGeometry(0.014, 0.02, 0.1, 8), m, x, y + 0.2, z); }
  add(parent, new T.BoxGeometry(0.07, 0.07, 0.005), M2.paper, x, y + h * 0.4, z + (kind === 1 ? 0.036 : 0.046));
}
function chair(parent, Mm, x, z, ry) {
  const c = new T.Group(); c.position.set(x, 0, z); c.rotation.y = ry; parent.add(c);
  add(c, new T.BoxGeometry(0.5, 0.06, 0.5), Mm.chair, 0, 0.5, 0);
  for (const [lx, lz] of [[-0.21, -0.21], [0.21, -0.21], [-0.21, 0.21], [0.21, 0.21]]) add(c, new T.CylinderGeometry(0.025, 0.022, 0.5, 8), Mm.chair, lx, 0.25, lz);
  for (const lx of [-0.21, 0.21]) add(c, new T.CylinderGeometry(0.025, 0.025, 0.6, 8), Mm.chair, lx, 0.8, 0.22);
  add(c, new T.BoxGeometry(0.5, 0.1, 0.04), Mm.chair, 0, 1.08, 0.22);
  for (const sx of [-0.1, 0, 0.1]) add(c, new T.BoxGeometry(0.04, 0.45, 0.025), Mm.chair, sx, 0.8, 0.22);
}

/* ---------- the room ---------- */
function build(scene, {TABLE_R, TOP, low = false}) {
  seed = 7;
  const Mm = materials();
  const decor = new T.Group(); scene.add(decor);
  const R = 7, H = 5;
  const dyn = {glows: [], candles: [], clock: null, juke: null};

  // floor, rug, walls, ceiling
  const floor = add(decor, new T.CircleGeometry(12, 48), Mm.floor, 0, 0, 0, -Math.PI / 2); floor.receiveShadow = true;
  const rug = add(decor, new T.CircleGeometry(3.5, 48), mat({map: tex(rugCanvas()), roughness: 0.95}), 0, 0.004, 0, -Math.PI / 2); rug.receiveShadow = true;
  add(decor, new T.CylinderGeometry(R, R, 1.15, 48, 1, true), mat({map: tex(wainscotCanvas(), 40, 1), side: T.BackSide, roughness: 0.6}), 0, 0.575, 0);
  add(decor, new T.CylinderGeometry(R, R, H - 1.15, 48, 1, true), mat({map: tex(wallpaperCanvas(), 36, 4), side: T.BackSide, roughness: 0.95}), 0, 1.15 + (H - 1.15) / 2, 0);
  add(decor, new T.TorusGeometry(R - 0.03, 0.035, 6, 64), Mm.dark, 0, 1.17, 0, Math.PI / 2); // chair rail
  add(decor, new T.TorusGeometry(R - 0.02, 0.05, 6, 64), Mm.dark, 0, 0.05, 0, Math.PI / 2); // skirting
  add(decor, new T.CircleGeometry(R, 48), mat({color: 0x1a120c, roughness: 1}), 0, H, 0, Math.PI / 2);
  for (let i = -3; i <= 3; i++) add(decor, new T.BoxGeometry(0.22, 0.28, 2 * Math.sqrt(R * R - (i * 1.9) ** 2)), Mm.dark, i * 1.9, H - 0.14, 0);

  // the bar along the back wall: counter, stools, back bar with mirror, shelves of bottles and a warm strip light
  const bar = new T.Group(); decor.add(bar);
  add(bar, new T.BoxGeometry(4.4, 1.0, 0.6), Mm.bar, 0, 0.5, -5.5);
  for (let i = 0; i < 6; i++) add(bar, new T.BoxGeometry(0.62, 0.7, 0.02), Mm.dark, -1.84 + i * 0.735, 0.52, -5.19);
  add(bar, new T.BoxGeometry(4.7, 0.07, 0.82), Mm.barTop, 0, 1.035, -5.48);
  add(bar, new T.CylinderGeometry(0.025, 0.025, 4.3, 8), Mm.brass, 0, 0.18, -5.05, 0, 0, Math.PI / 2);
  for (const x of [-2, -1, 0, 1, 2]) add(bar, new T.CylinderGeometry(0.015, 0.015, 0.18, 6), Mm.brass, x, 0.1, -5.12);
  for (const x of [-1.5, -0.5, 0.5, 1.5]) {
    add(bar, new T.CylinderGeometry(0.21, 0.2, 0.08, 16), Mm.redLeather, x, 0.78, -4.85);
    add(bar, new T.CylinderGeometry(0.03, 0.03, 0.74, 8), Mm.chrome, x, 0.38, -4.85);
    add(bar, new T.TorusGeometry(0.15, 0.012, 6, 16), Mm.chrome, x, 0.3, -4.85, Math.PI / 2);
    add(bar, new T.CylinderGeometry(0.2, 0.22, 0.03, 16), Mm.chrome, x, 0.015, -4.85);
  }
  add(bar, new T.BoxGeometry(3.8, 0.95, 0.45), Mm.dark, 0, 0.475, -6.45);
  add(bar, new T.BoxGeometry(3.6, 1.5, 0.03), Mm.mirror, 0, 1.75, -6.62);
  add(bar, new T.BoxGeometry(3.8, 0.08, 0.06), Mm.dark, 0, 2.53, -6.6);
  for (const x of [-1.86, 1.86]) add(bar, new T.BoxGeometry(0.08, 1.6, 0.06), Mm.dark, x, 1.75, -6.6);
  Mm.bottles = Mm.bottles || [0x2d5a3a, 0x6a3a1a, 0x8a7a3a, 0x3a2a5a, 0x5a1a1a, 0x2a4a5a, 0x9a6a2a].map(c => mat({color: c, roughness: 0.15, transparent: true, opacity: 0.82, emissive: c, emissiveIntensity: 0.25}));
  Mm.paper = Mm.paper || mat({color: 0xe8dcc0});
  for (const [y, n] of [[1.2, 14], [1.8, 13]]) {
    add(bar, new T.BoxGeometry(3.6, 0.04, 0.26), Mm.dark, 0, y - 0.02, -6.48);
    add(bar, new T.BoxGeometry(3.5, 0.015, 0.02), Mm.strip, 0, y - 0.045, -6.38); // under-shelf strip light
    for (let i = 0; i < n; i++) bottle(bar, -1.62 + i * (3.24 / (n - 1)) + range(-0.04, 0.04), y, -6.5 + range(-0.04, 0.04), Mm, Math.floor(rnd() * 3));
  }
  for (let i = 0; i < 7; i++) bottle(bar, -1.6 + i * 0.5 + range(-0.1, 0.1), 0.95, -6.38, Mm, Math.floor(rnd() * 3));
  const barLight = new T.PointLight(0xffa850, 1.1, 5.5, 2); barLight.position.set(0, 1.6, -5.9); scene.add(barLight);
  dyn.glows.push({light: barLight, base: 1.1, flick: 0.02});

  // jukebox in the corner: wood cabinet, arched top, glowing tubes that cycle colour
  const jk = spot(decor, 3.75, -5.1);
  add(jk, new T.BoxGeometry(0.9, 1.15, 0.55), Mm.bar, 0, 0.575, 0);
  add(jk, new T.CylinderGeometry(0.45, 0.45, 0.55, 20, 1, false, 0, Math.PI), Mm.bar, 0, 1.15, 0, Math.PI / 2, 0, Math.PI / 2);
  const tubeMat = new T.MeshBasicMaterial({map: new T.CanvasTexture(jukeboxCanvas())});
  tubeMat.map.wrapT = T.RepeatWrapping;
  for (const x of [-0.36, 0.36]) { const tb = add(jk, new T.BoxGeometry(0.07, 1.0, 0.04), tubeMat, x, 0.65, 0.27); tb.userData.dynamic = true; }
  const arch = add(jk, new T.TorusGeometry(0.39, 0.03, 8, 24, Math.PI), tubeMat, 0, 1.15, 0.27); arch.userData.dynamic = true;
  add(jk, new T.BoxGeometry(0.55, 0.3, 0.02), Mm.mirror, 0, 1.0, 0.28);
  add(jk, new T.BoxGeometry(0.6, 0.32, 0.02), Mm.chrome, 0, 0.35, 0.28);
  const jkLight = new T.PointLight(0xff4080, 0.8, 3.2, 2); jkLight.position.set(3.4, 1.0, -4.6); scene.add(jkLight);
  dyn.juke = {tubeMat, light: jkLight};

  // upright piano against the wall
  const pn = spot(decor, -5.3, 3.0);
  add(pn, new T.BoxGeometry(1.5, 1.25, 0.55), Mm.dark, 0, 0.625, -0.05);
  add(pn, new T.BoxGeometry(1.5, 0.06, 0.3), Mm.dark, 0, 0.72, 0.36);
  add(pn, new T.BoxGeometry(1.36, 0.03, 0.14), Mm.ivory, 0, 0.765, 0.37);
  for (let i = 0; i < 18; i++) if (i % 7 !== 2 && i % 7 !== 6) add(pn, new T.BoxGeometry(0.035, 0.02, 0.08), Mm.black, -0.64 + i * 0.075, 0.785, 0.34);
  add(pn, new T.BoxGeometry(0.8, 0.45, 0.35), Mm.dark, 0, 0.225, 0.75); // bench
  const cand = spot(pn, 0.55, -0.05, false); cand.position.y = 1.25; candle(cand, Mm, dyn);

  // two small tables in the dark, with chairs and a candle
  for (const [x, z] of [[-4.6, -3.6], [4.2, 4.2]]) {
    const t = spot(decor, x, z, false);
    add(t, new T.CylinderGeometry(0.48, 0.48, 0.04, 24), Mm.tableWood, 0, 0.76, 0);
    add(t, new T.CylinderGeometry(0.05, 0.07, 0.74, 10), Mm.iron, 0, 0.38, 0);
    add(t, new T.CylinderGeometry(0.28, 0.3, 0.03, 16), Mm.iron, 0, 0.015, 0);
    chair(t, Mm, 0.7, 0.1, -Math.PI / 2 + 0.3); chair(t, Mm, -0.65, -0.2, Math.PI / 2 - 0.2);
    const c = new T.Group(); c.position.set(0.1, 0.78, 0.05); t.add(c); candle(c, Mm, dyn);
    bottle(t, -0.2, 0.78, 0.1, Mm, 0);
  }

  // barrels and crates at the end of the bar
  for (const [x, z, s] of [[-3.25, -5.0, 1], [-3.65, -4.4, 0.95], [-3.0, -4.35, 0.9]]) {
    const pts = []; for (let i = 0; i <= 8; i++) { const y = i / 8; pts.push(new T.Vector2(0.3 + Math.sin(y * Math.PI) * 0.06, y * 0.85)); }
    const b = spot(decor, x, z, false); b.scale.setScalar(s);
    add(b, new T.LatheGeometry(pts, 16), mat({map: woodTex('dark', 4, 1), roughness: 0.7}));
    for (const y of [0.15, 0.7]) add(b, new T.TorusGeometry(0.335, 0.012, 6, 20), Mm.iron, 0, y, 0, Math.PI / 2);
    add(b, new T.CircleGeometry(0.3, 16), Mm.dark, 0, 0.85, 0, -Math.PI / 2);
  }
  const cr = spot(decor, 5.5, -3.0); add(cr, new T.BoxGeometry(0.6, 0.6, 0.6), mat({map: woodTex('chair', 1, 1)}), 0, 0.3, 0); add(cr, new T.BoxGeometry(0.5, 0.5, 0.5), mat({map: woodTex('chair', 1, 1)}), 0.05, 0.85, 0.02, 0, 0.3, 0);

  // pool table in the right-hand corner, under its own green lamp, with a few balls and a cue
  const pool = spot(decor, 4.9, 1.6, false); pool.rotation.y = 0.25;
  add(pool, new T.BoxGeometry(1.25, 0.06, 2.25), mat({color: 0x1d5a3a, roughness: 1}), 0, 0.8, 0);
  for (const [x, z, w, d] of [[-0.66, 0, 0.1, 2.45], [0.66, 0, 0.1, 2.45], [0, -1.17, 1.42, 0.1], [0, 1.17, 1.42, 0.1]]) add(pool, new T.BoxGeometry(w, 0.12, d), Mm.tableWood, x, 0.84, z);
  add(pool, new T.BoxGeometry(1.3, 0.2, 2.3), Mm.tableWood, 0, 0.68, 0);
  for (const [x, z] of [[-0.55, -1.05], [0.55, -1.05], [-0.55, 1.05], [0.55, 1.05], [-0.55, 0], [0.55, 0]]) add(pool, new T.CylinderGeometry(0.07, 0.05, 0.6, 10), Mm.tableWood, x, 0.3, z);
  const ballCols = [0xf0e8d0, 0xe0b020, 0x2040a0, 0xb02020, 0x502080, 0xe06020, 0x206030, 0x101010];
  ballCols.forEach((c, i) => add(pool, new T.SphereGeometry(0.03, 12, 10), mat({color: c, roughness: 0.25}), range(-0.45, 0.45), 0.86, i ? range(-0.2, 0.9) : -0.6));
  add(pool, new T.CylinderGeometry(0.008, 0.014, 1.45, 8), Mm.chair, 0.2, 0.88, -0.2, Math.PI / 2, 0.4, 0);
  const pl = new T.Group(); pl.position.set(0, 2.05, 0); pool.add(pl);
  add(pl, new T.BoxGeometry(0.35, 0.16, 1.3), mat({color: 0x1d4a2a, roughness: 0.5, metalness: 0.3}), 0, 0, 0);
  add(pl, new T.BoxGeometry(0.3, 0.01, 1.24), Mm.glow, 0, -0.085, 0);
  for (const z of [-0.5, 0.5]) add(pl, new T.CylinderGeometry(0.006, 0.006, 2.9, 4), Mm.iron, 0, 1.5, z);
  const poolLight = new T.PointLight(0xfff0c8, 0.9, 3, 2); poolLight.position.set(4.9, 1.7, 1.6); scene.add(poolLight);
  // cue rack on the wall behind it
  const cues = onWall(decor, R, 0.08, 1.5);
  add(cues, new T.BoxGeometry(0.7, 0.06, 0.08), Mm.dark, 0, -0.55, 0.04); add(cues, new T.BoxGeometry(0.7, 0.06, 0.08), Mm.dark, 0, 0.6, 0.04);
  for (let i = 0; i < 4; i++) add(cues, new T.CylinderGeometry(0.008, 0.014, 1.3, 6), Mm.chair, -0.25 + i * 0.17, 0, 0.09);

  // on the walls: sconces, pictures, a clock, a dartboard, the door with an exit sign
  const glowTex = glowCanvas('rgba(255,200,120,1)');
  for (const a of [0.55, 2.35, 3.9, 5.3]) {
    const w = onWall(decor, R, a, 2.2);
    add(w, new T.BoxGeometry(0.08, 0.2, 0.06), Mm.brass, 0, 0, 0.03);
    add(w, new T.CylinderGeometry(0.012, 0.012, 0.2, 6), Mm.brass, 0, 0.05, 0.13, Math.PI / 2);
    add(w, new T.CylinderGeometry(0.06, 0.11, 0.14, 12, 1, true), mat({color: 0x6a3a1a, roughness: 0.6, side: T.DoubleSide, emissive: 0x3a1a06}), 0, 0.14, 0.23);
    add(w, new T.SphereGeometry(0.035, 8, 6), Mm.glow, 0, 0.1, 0.23);
    const halo = new T.Sprite(new T.SpriteMaterial({map: glowTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55, fog: false}));
    halo.scale.setScalar(0.75); halo.position.set(0, 0.12, 0.25); w.add(halo); halo.userData.dynamic = true;
    dyn.glows.push({sprite: halo, base: 0.55, flick: 0.06});
  }
  const pics = [['wanted', 1.15, 2.2, 0.5], ['painting', 2.0, 2.3, 0.65], ['rules', 4.6, 2.2, 0.55], ['wanted', 5.75, 2.25, 0.45]];
  for (const [kind, a, y, s] of pics) {
    const w = onWall(decor, R, a, y);
    add(w, new T.BoxGeometry(s * 1.0 + 0.08, s * 1.375 + 0.08, 0.04), kind === 'wanted' ? Mm.dark : Mm.bar, 0, 0, 0.02);
    add(w, new T.PlaneGeometry(s, s * 1.375), mat({map: tex(posterCanvas(kind)), roughness: 0.9}), 0, 0, 0.045);
  }
  const clk = onWall(decor, R, 1.6, 3.1);
  add(clk, new T.CylinderGeometry(0.3, 0.3, 0.05, 32), Mm.dark, 0, 0, 0.025, Math.PI / 2);
  add(clk, new T.CircleGeometry(0.26, 32), mat({map: tex(clockCanvas()), roughness: 0.6}), 0, 0, 0.052);
  const hourH = add(clk, new T.BoxGeometry(0.02, 0.14, 0.008), Mm.black, 0, 0, 0.06); hourH.geometry.translate(0, 0.06, 0);
  const minH = add(clk, new T.BoxGeometry(0.014, 0.21, 0.008), Mm.black, 0, 0, 0.066); minH.geometry.translate(0, 0.09, 0);
  hourH.userData.dynamic = minH.userData.dynamic = true;
  dyn.clock = {hourH, minH};
  const db = onWall(decor, R, 3.2, 1.75);
  add(db, new T.BoxGeometry(0.8, 0.8, 0.03), Mm.dark, 0, 0, 0.015);
  add(db, new T.CylinderGeometry(0.3, 0.3, 0.04, 32), mat({map: tex(dartboardCanvas()), roughness: 0.8}), 0, 0, 0.05, Math.PI / 2);
  for (const [dx, dy] of [[0.04, 0.07], [-0.1, -0.03], [0.12, -0.11]]) {
    add(db, new T.CylinderGeometry(0.006, 0.003, 0.14, 6), Mm.chrome, dx, dy, 0.13, Math.PI / 2);
    add(db, new T.BoxGeometry(0.04, 0.003, 0.04), mat({color: 0xb02a2a}), dx, dy, 0.19, 0, Math.PI / 4);
  }
  const door = onWall(decor, R, 2.95, 1.1, 0.02);
  add(door, new T.BoxGeometry(1.1, 2.2, 0.06), Mm.bar, 0, 0, 0.03);
  for (const [px, py] of [[-0.25, 0.45], [0.25, 0.45], [-0.25, -0.45], [0.25, -0.45]]) add(door, new T.BoxGeometry(0.4, 0.7, 0.02), Mm.dark, px, py, 0.07);
  add(door, new T.SphereGeometry(0.04, 8, 6), Mm.brass, 0.42, 0, 0.1);
  add(door, new T.BoxGeometry(1.25, 0.1, 0.1), Mm.dark, 0, 1.15, 0.05);
  add(door, new T.BoxGeometry(0.5, 0.18, 0.05), Mm.exit, 0, 1.45, 0.06);
  const exitHalo = new T.Sprite(new T.SpriteMaterial({map: glowCanvas('rgba(60,220,120,1)'), blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5, fog: false}));
  exitHalo.scale.set(1.2, 0.6, 1); exitHalo.position.set(0, 1.45, 0.1); door.add(exitHalo); exitHalo.userData.dynamic = true;
  // coat rack by the door with a hat
  const rack = spot(decor, Math.cos(2.65) * 6.5, Math.sin(2.65) * 6.5, false);
  add(rack, new T.CylinderGeometry(0.025, 0.03, 1.8, 8), Mm.dark, 0, 0.9, 0);
  for (let k = 0; k < 4; k++) add(rack, new T.CylinderGeometry(0.012, 0.012, 0.22, 6), Mm.dark, Math.cos(k * 1.57) * 0.08, 1.7, Math.sin(k * 1.57) * 0.08, 0, -k * 1.57, 0.9);
  add(rack, new T.CylinderGeometry(0.2, 0.25, 0.03, 16), Mm.dark, 0, 0.015, 0);
  add(rack, new T.CylinderGeometry(0.11, 0.12, 0.12, 14), mat({color: 0x2a2420}), 0.12, 1.66, 0, 0, 0, 0.5);
  add(rack, new T.CylinderGeometry(0.2, 0.2, 0.015, 16), mat({color: 0x2a2420}), 0.15, 1.6, 0, 0, 0, 0.5);

  if (low) { /* phones: everything above is still cheap after merging; nothing to drop yet */ }
  mergeStatic(decor, scene);
  scene.remove(decor);

  /* ----- the poker table: printed felt, padded leather rail, wood trim, apron and a heavy pedestal ----- */
  const table = new T.Group(); scene.add(table);
  const feltR = TABLE_R - 0.05;
  const feltMap = tex(feltCanvas(feltR)); feltMap.wrapS = feltMap.wrapT = T.ClampToEdgeWrapping;
  const bumpC = canvas(256, 256); bumpC[1].fillStyle = '#808080'; bumpC[1].fillRect(0, 0, 256, 256); noise(bumpC[1], 256, 256, 90);
  const bump = new T.CanvasTexture(bumpC[0]); bump.wrapS = bump.wrapT = T.RepeatWrapping; bump.repeat.set(8, 8);
  const felt = add(table, new T.CylinderGeometry(feltR, feltR, 0.02, 72), [mat({color: 0x1f4a32}), mat({map: feltMap, bumpMap: bump, bumpScale: 0.004, roughness: 1}), mat({color: 0x1f4a32})], 0, TOP - 0.01, 0);
  felt.receiveShadow = true;
  const trim = add(table, new T.CylinderGeometry(TABLE_R + 0.02, TABLE_R + 0.02, 0.05, 72, 1, true), Mm.tableWood, 0, TOP - 0.02, 0);
  trim.receiveShadow = true;
  const leather = tex(leatherCanvas(), 26, 1);
  const rail = add(table, new T.TorusGeometry(TABLE_R + 0.1, 0.1, 14, 96), mat({map: leather, roughness: 0.5, bumpMap: leather, bumpScale: 0.003}), 0, TOP + 0.02, 0, Math.PI / 2);
  rail.scale.z = 0.8; rail.castShadow = rail.receiveShadow = true;
  const apron = add(table, new T.CylinderGeometry(TABLE_R + 0.16, TABLE_R + 0.08, 0.18, 72), Mm.tableWood, 0, TOP - 0.13, 0);
  apron.castShadow = true;
  add(table, new T.CylinderGeometry(0.2, 0.26, 0.62, 18), Mm.tableWood, 0, 0.42, 0).castShadow = true;
  add(table, new T.TorusGeometry(0.22, 0.03, 8, 20), Mm.brass, 0, 0.7, 0, Math.PI / 2);
  for (let k = 0; k < 4; k++) {
    const foot = add(table, new T.BoxGeometry(0.16, 0.1, 0.95), Mm.tableWood, Math.sin(k * Math.PI / 2 + 0.785) * 0.4, 0.06, Math.cos(k * Math.PI / 2 + 0.785) * 0.4, 0, k * Math.PI / 2 + 0.785, 0);
    foot.castShadow = true;
  }

  /* ----- per frame: the jukebox cycles, candles and sconces flicker, the clock keeps real time ----- */
  function update(t) {
    const j = dyn.juke;
    j.tubeMat.map.offset.y = (t * 0.08) % 1;
    j.light.color.setHSL((t * 0.04) % 1, 0.9, 0.55);
    for (const g of dyn.glows) {
      const f = 1 + (Math.sin(t * 13 + g.base * 7) * 0.5 + Math.random() * 0.5) * g.flick;
      if (g.light) g.light.intensity = g.base * f; else g.sprite.material.opacity = g.base * f;
    }
    for (const c of dyn.candles) {
      const f = 0.85 + Math.sin(t * 9 + c.phase) * 0.08 + Math.random() * 0.1;
      if (!c.base) c.base = c.flame.position.clone(); // set after mergeStatic moved it into the scene
      c.flame.scale.set(1, f, 1); c.halo.material.opacity = 0.5 * f;
      c.flame.position.x = c.base.x + Math.sin(t * 5 + c.phase) * 0.003;
    }
    const d = new Date(), m = d.getMinutes() + d.getSeconds() / 60, h = (d.getHours() % 12) + m / 60;
    dyn.clock.minH.rotation.z = -m / 60 * Math.PI * 2;
    dyn.clock.hourH.rotation.z = -h / 12 * Math.PI * 2;
  }
  return {update, table};
}
// a candle in a little glass: wax, a flickering flame and a soft halo
function candle(parent, Mm, dyn) {
  add(parent, new T.CylinderGeometry(0.03, 0.03, 0.08, 10), Mm.wax, 0, 0.04, 0);
  add(parent, new T.CylinderGeometry(0.045, 0.04, 0.1, 12, 1, true), mat({color: 0xd0e0e0, transparent: true, opacity: 0.25, roughness: 0.1, side: T.DoubleSide, depthWrite: false}), 0, 0.05, 0);
  const flame = new T.Mesh(new T.SphereGeometry(0.012, 8, 6), new T.MeshBasicMaterial({color: 0xffd080}));
  flame.scale.set(1, 1.8, 1); flame.geometry.translate(0, 0.012, 0); flame.position.y = 0.085; flame.userData.dynamic = true; parent.add(flame);
  const halo = new T.Sprite(new T.SpriteMaterial({map: glowCanvas('rgba(255,180,90,1)'), blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5, fog: false}));
  halo.scale.setScalar(0.45); halo.position.y = 0.1; halo.userData.dynamic = true; parent.add(halo);
  dyn.candles.push({flame, halo, phase: Math.random() * 6});
}

root.PokerRoom = {build, materials, woodTex};
})(window);
