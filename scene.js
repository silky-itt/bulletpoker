// Bullet Poker 3D scene (Three.js r128 UMD). Reads game state only; no rules here.
// Visual spec: DESIGN.md §3–4.
(function (root) {
'use strict';
const T = root.THREE;
const E = root.PokerEngine;

// outfit: shirt (body), coat over it ('vest' open at the front, 'jacket' open with lapels),
// sleeve colour (null = bare fur), paw colour, plus a few per-character extras.
const CHARACTERS = {
  fox:  {name: 'Rusty',   animal: 'Red fox',   blurb: 'Sly. Bluffs more than he should.',
         body: 0xc8682c, head: 0xd9773a, snout: 0xf1e2cf, ear: 'pointy', snoutShape: 'cone', nose: 'tip', acc: 'bowtie', accColor: 0x2f6b45,
         shirt: 0xe9dcc2, coat: 0x2f4a36, coatStyle: 'vest', sleeve: 0xe9dcc2, paw: 0x2a1a14, extra: 'watch'},
  pig:  {name: 'Truffle', animal: 'Pig',       blurb: 'Reckless. Calls almost anything.',
         body: 0xd98f95, head: 0xe9a3a8, snout: 0xf0b7bb, ear: 'flop', snoutShape: 'disk', nose: 'nostrils', acc: 'cap', accColor: 0x55524e,
         shirt: 0x7f97a6, sleeve: null, paw: 0xe9a3a8, extra: 'apron'},
  bear: {name: 'Bruno',   animal: 'Brown bear', blurb: 'Steady. Only plays strong hands.',
         body: 0x5b3b26, head: 0x6c4630, snout: 0xa98163, ear: 'round', snoutShape: 'box', nose: 'big', acc: 'scarf', accColor: 0xa3312a,
         shirt: 0x2f5c5a, sleeve: 0x2f5c5a, paw: 0x4a2f1f, extra: 'sweater'},
  bull: {name: 'Tank',    animal: 'Bull',      blurb: 'Aggressive. Raises at every chance.',
         body: 0x2f2a28, head: 0x3a3330, snout: 0x8a7468, ear: 'horn', snoutShape: 'box', nose: 'ring', acc: 'ring', accColor: 0xd4a73c,
         shirt: 0xd8d0c2, coat: 0x2b211c, coatStyle: 'jacket', sleeve: 0x2b211c, paw: 0x2a2422, extra: 'scar'},
  rabbit: {name: 'Pip',   animal: 'Rabbit',    blurb: 'Nervous. Counts the odds twice, then folds.',
         body: 0xd8d0c4, head: 0xece6dc, snout: 0xf6f1ea, ear: 'long', snoutShape: 'cheeks', nose: 'pink', acc: 'glasses', accColor: 0x3a3028,
         shirt: 0x9ab4c8, coat: 0xb8902a, coatStyle: 'vest', sleeve: 0x9ab4c8, paw: 0xece6dc, extra: 'teeth', whiskers: true},
  cat:  {name: 'Smokey',  animal: 'Cat',       blurb: 'Cool. Never blinks first.',
         body: 0x6a6a72, head: 0x7c7c86, snout: 0xe8e4dc, ear: 'cat', snoutShape: 'cheeks', nose: 'pink', acc: 'beret', accColor: 0x8a1e24,
         shirt: 0x1c1c22, sleeve: 0x1c1c22, paw: 0x7c7c86, extra: 'turtleneck', whiskers: true},
  croc: {name: 'Snap',    animal: 'Crocodile', blurb: 'Patient. Waits for the kill.',
         body: 0x4a6a34, head: 0x557a3c, snout: 0x628a44, ear: 'none', snoutShape: 'long', nose: 'nubs', acc: 'fedora', accColor: 0x2a2622,
         shirt: 0xe8e2d4, coat: 0x23283a, coatStyle: 'jacket', sleeve: 0x23283a, paw: 0x557a3c, extra: 'tie', eyeY: 0.15, eyeZ: -0.17},
  owl:  {name: 'Hoot',    animal: 'Owl',       blurb: 'Calculating. Remembers every card.',
         body: 0x7a5a3a, head: 0x8a6a46, snout: 0xd8c09a, ear: 'tuft', snoutShape: 'beak', nose: 'none', acc: 'monocle', accColor: 0xd4a73c,
         shirt: 0xe9dcc2, coat: 0x6a5a40, coatStyle: 'jacket', sleeve: 0x6a5a40, paw: 0xd8a040, extra: 'disc', eyeR: 0.082, eyeX: 0.112, eyeZ: -0.21},
};
const TABLE_R = 1.9, SEAT_R = 2.75, CARD_R = 1.35, EYE_H = 1.62, TOP = 0.955;
// Deal timing in seconds, shared with the deal sound (index.html): riffle, then one card per gap.
const DEAL = {shuffle: 0.45, gap: {poker: 0.1, deck: 0.06}};

const std = (c, r = 0.8, m = 0) => new T.MeshStandardMaterial({color: c, roughness: r, metalness: m});
const wood = (c, r = 0.75) => std(c, r, 0.05);

/* ---------- toon look for the characters: stepped shading + inked outlines ---------- */
let rampTex = null;
function toonRamp() {
  if (rampTex) return rampTex;
  rampTex = new T.DataTexture(new Uint8Array([105, 105, 105, 185, 185, 185, 255, 255, 255]), 3, 1, T.RGBFormat);
  rampTex.minFilter = rampTex.magFilter = T.NearestFilter; rampTex.generateMipmaps = false; rampTex.needsUpdate = true;
  return rampTex;
}
const toonCache = new Map();
function toon(c, double = false) {
  const key = c + (double ? 'd' : '');
  if (!toonCache.has(key)) toonCache.set(key, new T.MeshToonMaterial({color: c, gradientMap: toonRamp(), side: double ? T.DoubleSide : T.FrontSide}));
  return toonCache.get(key);
}
// pure black: colours here are linear, so even a dark brown comes out as a light rim after sRGB output
const INK = new T.MeshBasicMaterial({color: 0x000000, side: T.BackSide, fog: false});
// Inverted hull: a black back-face copy of each mesh, grown by about `w` on every side.
function ink(rootObj, w = 0.011) {
  const meshes = [];
  rootObj.traverse(o => { if (o.isMesh && !o.userData.noInk) meshes.push(o); });
  for (const m of meshes) {
    const g = m.geometry; g.computeBoundingBox();
    const size = g.boundingBox.getSize(new T.Vector3()), c = g.boundingBox.getCenter(new T.Vector3());
    if (Math.max(size.x, size.y, size.z) < 0.05) continue;
    const s = new T.Vector3(...['x', 'y', 'z'].map(a => Math.min(1.35, 1 + 2 * w / Math.max(size[a], 1e-3))));
    const hull = new T.Mesh(g, INK);
    hull.scale.copy(s); hull.position.set(c.x * (1 - s.x), c.y * (1 - s.y), c.z * (1 - s.z));
    hull.userData.noInk = true; hull.raycast = () => {};
    m.add(hull);
  }
}
const noInk = m => { m.userData.noInk = true; return m; };

// Torso profile (y, radius) in torso space; shells (vest, apron) reuse it a little larger.
const TORSO = [[0, 0.3], [0.12, 0.36], [0.35, 0.37], [0.6, 0.33], [0.78, 0.24], [0.86, 0.12]];
const torsoR = y => { for (let i = 1; i < TORSO.length; i++) if (y <= TORSO[i][0]) { const [y0, r0] = TORSO[i - 1], [y1, r1] = TORSO[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); } return TORSO[TORSO.length - 1][1]; };
// a lathe around y between y0 and y1; phi 0 faces +z, so the front (-z) is at phi = PI
function shell(y0, y1, grow, phiStart = 0, phiLen = Math.PI * 2, closed = false) {
  const pts = [];
  if (closed) pts.push(new T.Vector2(0, y0));
  for (let i = 0; i <= 10; i++) { const y = y0 + (y1 - y0) * i / 10; pts.push(new T.Vector2(torsoR(y) * grow, y)); }
  if (closed) pts.push(new T.Vector2(0, y1));
  return new T.LatheGeometry(pts, 28, phiStart, phiLen);
}

/* ---------- arms: two-bone IK in torso space ---------- */
const UPV = new T.Vector3(0, 1, 0), FWD = new T.Vector3(0, 0, -1);
const ARM_A = 0.36, ARM_B = 0.38; // upper arm, forearm
function makeArm(a, side) {
  const sleeve = toon(a.sleeve == null ? a.body : a.sleeve), paw = toon(a.paw);
  const arm = {side, shoulder: new T.Vector3(side * 0.31, 0.68, -0.02), cur: null, elbowP: new T.Vector3(), handP: new T.Vector3()};
  arm.upper = new T.Mesh(new T.CylinderGeometry(0.075, 0.068, ARM_A, 12), sleeve);
  arm.fore = new T.Mesh(new T.CylinderGeometry(0.066, 0.058, ARM_B, 12), a.sleeve == null ? toon(a.body) : sleeve);
  arm.joint = new T.Mesh(new T.SphereGeometry(0.068, 12, 10), sleeve);
  arm.cap = new T.Mesh(new T.SphereGeometry(0.08, 12, 10), sleeve); arm.cap.position.copy(arm.shoulder);
  // paw: a soft palm with a thumb and three finger nubs, fingers toward -z, palm down
  arm.hand = new T.Group();
  const palm = new T.Mesh(new T.SphereGeometry(0.07, 12, 10), paw); palm.scale.set(1, 0.7, 1.15); arm.hand.add(palm);
  for (let f = -1; f <= 1; f++) { const n = noInk(new T.Mesh(new T.SphereGeometry(0.028, 8, 6), paw)); n.position.set(f * 0.036, -0.012, -0.072); arm.hand.add(n); }
  const thumb = noInk(new T.Mesh(new T.SphereGeometry(0.03, 8, 6), paw)); thumb.position.set(-side * 0.062, 0.004, -0.02); arm.hand.add(thumb);
  if (a.sleeve != null) { // cuff
    const cuff = new T.Mesh(new T.TorusGeometry(0.06, 0.016, 6, 14), toon(a.extra === 'sweater' ? 0x234644 : a.sleeve));
    cuff.rotation.x = Math.PI / 2; cuff.position.y = -ARM_B / 2 + 0.02; arm.fore.add(cuff);
  }
  return arm;
}
const _d = new T.Vector3(), _p = new T.Vector3(), _q = new T.Quaternion();
function placeLimb(mesh, from, to) { mesh.position.copy(from).add(to).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(UPV, _d.copy(to).sub(from).normalize()); }
// reach for `target` (torso space); `handQ` optionally orients the paw (e.g. around a gun grip)
function solveArm(arm, target, handQ) {
  const S = arm.shoulder, dir = _d.copy(target).sub(S);
  const len = Math.max(Math.abs(ARM_A - ARM_B) + 0.02, Math.min(ARM_A + ARM_B - 0.002, dir.length()));
  dir.normalize();
  const cosA = (ARM_A * ARM_A + len * len - ARM_B * ARM_B) / (2 * ARM_A * len), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  // elbows bend out, down and back
  _p.set(arm.side * 0.7, -1, 0.5); _p.addScaledVector(dir, -_p.dot(dir)).normalize();
  arm.elbowP.copy(S).addScaledVector(dir, ARM_A * cosA).addScaledVector(_p, ARM_A * sinA);
  arm.handP.copy(S).addScaledVector(dir, len);
  placeLimb(arm.upper, S, arm.elbowP);
  placeLimb(arm.fore, arm.elbowP, arm.handP);
  arm.joint.position.copy(arm.elbowP);
  arm.hand.position.copy(arm.handP);
  if (handQ) arm.hand.quaternion.copy(handQ);
  else { _d.copy(arm.handP).sub(arm.elbowP).setY(0); if (_d.lengthSq() < 1e-6) _d.copy(FWD); arm.hand.quaternion.setFromUnitVectors(FWD, _d.normalize()); }
}

/* ---------- character model with a full face kit ---------- */
function makeAnimal(kind) {
  const a = CHARACTERS[kind] || CHARACTERS.fox;
  const g = new T.Group();
  // wooden chair: seat, four legs, two back posts, a top rail and slats
  const cm = root.PokerRoom ? root.PokerRoom.materials().chair : wood(0x3a2414);
  const chair = new T.Group(), part = (geo, x, y, z) => { const m = new T.Mesh(geo, cm); m.position.set(x, y, z); chair.add(m); return m; };
  part(new T.BoxGeometry(0.7, 0.07, 0.66), 0, 0.55, 0);
  for (const [x, z] of [[-0.3, -0.28], [0.3, -0.28], [-0.3, 0.28], [0.3, 0.28]]) part(new T.CylinderGeometry(0.035, 0.03, 0.52, 8), x, 0.26, z);
  for (const x of [-0.3, 0.3]) part(new T.CylinderGeometry(0.035, 0.035, 0.95, 8), x, 1.0, 0.31);
  part(new T.BoxGeometry(0.7, 0.12, 0.05), 0, 1.42, 0.31);
  for (const x of [-0.15, 0, 0.15]) part(new T.BoxGeometry(0.06, 0.65, 0.03), x, 1.0, 0.31);
  const back = new T.Group();
  const torso = new T.Group(); torso.position.y = 0.6;
  const fig = new T.Group(); torso.add(fig); // everything that gets inked
  const fur = toon(a.head), body = toon(a.body);

  // body: shirt, then the coat or apron over it
  fig.add(new T.Mesh(shell(0, 0.86, 1, 0, Math.PI * 2, true), toon(a.shirt)));
  if (a.coatStyle) {
    const open = a.coatStyle === 'vest' ? 0.5 : 0.62; // half-width of the opening at the front, radians
    const coat = new T.Mesh(shell(a.coatStyle === 'vest' ? 0.14 : 0.02, a.coatStyle === 'vest' ? 0.74 : 0.8, 1.045, Math.PI + open, Math.PI * 2 - open * 2), toon(a.coat, true));
    fig.add(coat);
    if (a.coatStyle === 'jacket') { // lapels and a collar
      for (const s of [-1, 1]) { const l = new T.Mesh(new T.BoxGeometry(0.1, 0.3, 0.025), toon(a.coat)); l.position.set(s * 0.15, 0.62, -0.27); l.rotation.set(-0.35, s * 0.55, s * 0.32); fig.add(l); }
      const collar = new T.Mesh(new T.TorusGeometry(0.17, 0.04, 8, 20, Math.PI * 1.3), toon(a.coat)); collar.rotation.set(Math.PI / 2, 0, Math.PI * 0.85); collar.position.y = 0.8; fig.add(collar);
    } else { // vest buttons
      for (let i = 0; i < 3; i++) { const b = noInk(new T.Mesh(new T.SphereGeometry(0.016, 8, 6), toon(0xd4a73c))); const y = 0.22 + i * 0.12; b.position.set(Math.sin(Math.PI + open) * torsoR(y) * 1.05, y, Math.cos(Math.PI + open) * torsoR(y) * 1.05); fig.add(b); }
    }
  }
  if (a.extra === 'watch') { // pocket-watch chain across the vest
    const chain = noInk(new T.Mesh(new T.TorusGeometry(0.1, 0.006, 6, 18, Math.PI), toon(0xd4a73c)));
    chain.position.set(0.02, 0.42, -0.375); chain.rotation.set(0.15, 0, Math.PI); fig.add(chain);
    const watch = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.015, 14), toon(0xd4a73c)); watch.rotation.x = Math.PI / 2 - 0.2; watch.position.set(0.12, 0.38, -0.38); fig.add(watch);
  }
  if (a.extra === 'apron') { // butcher's apron with a bib and a neck strap
    fig.add(new T.Mesh(shell(0.03, 0.62, 1.04, Math.PI - 0.8, 1.6), toon(0xebe4d6, true)));
    const bib = new T.Mesh(new T.BoxGeometry(0.26, 0.16, 0.02), toon(0xebe4d6)); bib.position.set(0, 0.64, -0.31); bib.rotation.x = -0.3; fig.add(bib);
    const strap = new T.Mesh(new T.TorusGeometry(0.15, 0.012, 6, 20), toon(0xebe4d6)); strap.position.set(0, 0.82, -0.08); strap.rotation.x = Math.PI / 2 - 0.5; fig.add(strap);
    const stain = noInk(new T.Mesh(new T.CircleGeometry(0.035, 10), toon(0x9b3a34))); stain.position.set(-0.1, 0.3, -torsoR(0.3) * 1.045 - 0.002); stain.rotation.y = Math.PI; fig.add(stain);
  }
  if (a.extra === 'sweater') { // ribbed hem and a cream band across the chest
    const hem = new T.Mesh(new T.TorusGeometry(torsoR(0.06) * 1.01, 0.03, 8, 28), toon(0x234644)); hem.rotation.x = Math.PI / 2; hem.position.y = 0.06; fig.add(hem);
    for (const y of [0.46, 0.53]) { const band = noInk(new T.Mesh(new T.TorusGeometry(torsoR(y) * 1.005, 0.014, 6, 32), toon(0xe9dcc2))); band.rotation.x = Math.PI / 2; band.position.y = y; fig.add(band); }
  }
  if (a.extra === 'turtleneck') { const roll = new T.Mesh(new T.TorusGeometry(0.16, 0.06, 8, 22), toon(a.shirt)); roll.rotation.x = Math.PI / 2; roll.position.y = 0.8; fig.add(roll); }
  if (a.extra === 'tie') {
    const tie = new T.Mesh(new T.BoxGeometry(0.07, 0.32, 0.02), toon(0x8a1e24)); tie.position.set(0, 0.6, -0.345); tie.rotation.x = 0.12; fig.add(tie);
    const knot = new T.Mesh(new T.BoxGeometry(0.06, 0.05, 0.03), toon(0x8a1e24)); knot.position.set(0, 0.77, -0.31); fig.add(knot);
  }
  const head = new T.Group(); head.position.y = 0.98; fig.add(head);
  head.add(new T.Mesh(new T.SphereGeometry(0.27, 24, 18), fur));

  // snout + nose
  let snoutTipZ;
  if (a.snoutShape === 'cone') {
    const s = new T.Mesh(new T.ConeGeometry(0.11, 0.3, 14), toon(a.snout)); s.rotation.x = -Math.PI / 2; s.position.set(0, -0.05, -0.33); head.add(s); snoutTipZ = -0.48;
  } else if (a.snoutShape === 'disk') {
    const s = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 0.1, 18), toon(a.snout)); s.rotation.x = Math.PI / 2; s.position.set(0, -0.05, -0.27); head.add(s); snoutTipZ = -0.32;
  } else if (a.snoutShape === 'cheeks') { // cat / rabbit: two puffy cheeks under a little nose
    for (const x of [-0.045, 0.045]) { const s = new T.Mesh(new T.SphereGeometry(0.068, 14, 10), toon(a.snout)); s.scale.set(1, 0.85, 0.8); s.position.set(x, -0.085, -0.22); head.add(s); }
    snoutTipZ = -0.285;
  } else if (a.snoutShape === 'long') { // crocodile: a long flat snout lined with teeth
    const s = new T.Mesh(new T.BoxGeometry(0.22, 0.11, 0.42), toon(a.snout)); s.position.set(0, -0.08, -0.37); head.add(s); snoutTipZ = -0.58;
    const tooth = toon(0xf2ecd8);
    for (const x of [-0.1, 0.1]) for (let i = 0; i < 6; i++) { const t = noInk(new T.Mesh(new T.ConeGeometry(0.012, 0.035, 5), tooth)); t.rotation.x = Math.PI; t.position.set(x, -0.15, -0.24 - i * 0.06); head.add(t); }
  } else if (a.snoutShape === 'beak') { // owl: a hooked beak pointing down
    const s = new T.Mesh(new T.ConeGeometry(0.045, 0.14, 10), toon(0xe0a030)); s.rotation.x = -2.5; s.position.set(0, -0.04, -0.28); head.add(s); snoutTipZ = -0.32;
  } else {
    const s = new T.Mesh(new T.BoxGeometry(0.22, 0.15, 0.17), toon(a.snout)); s.position.set(0, -0.07, -0.26); head.add(s); snoutTipZ = -0.345;
  }
  if (a.extra === 'disc') { const d = new T.Mesh(new T.SphereGeometry(0.21, 20, 14), toon(a.snout)); d.scale.set(1, 0.95, 0.4); d.position.set(0, 0.04, -0.16); head.add(d); } // owl's facial disc
  const dark = std(0x141010, 0.35);
  if (a.nose === 'tip') { const n = new T.Mesh(new T.SphereGeometry(0.032, 10, 8), dark); n.position.set(0, -0.05, snoutTipZ); head.add(noInk(n)); }
  if (a.nose === 'big') { const n = new T.Mesh(new T.SphereGeometry(0.05, 12, 8), dark); n.scale.set(1.3, 0.8, 0.8); n.position.set(0, -0.02, snoutTipZ); head.add(n); }
  if (a.nose === 'nostrils' || a.nose === 'ring') {
    for (const s of [-1, 1]) { const n = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, 0.02, 8), dark); n.rotation.x = Math.PI / 2; n.position.set(s * 0.035, -0.05, snoutTipZ - 0.002); head.add(noInk(n)); }
  }
  if (a.nose === 'pink') { const n = new T.Mesh(new T.SphereGeometry(0.024, 10, 8), toon(0xe07a8a)); n.scale.set(1.3, 0.8, 0.8); n.position.set(0, -0.04, snoutTipZ + 0.01); head.add(noInk(n)); }
  if (a.nose === 'nubs') for (const x of [-0.04, 0.04]) { const n = new T.Mesh(new T.SphereGeometry(0.02, 8, 6), toon(a.snout)); n.position.set(x, -0.02, snoutTipZ + 0.03); head.add(noInk(n)); }
  if (a.extra === 'teeth') for (const x of [-0.014, 0.014]) { const t = new T.Mesh(new T.BoxGeometry(0.024, 0.04, 0.01), toon(0xfaf6ee)); t.position.set(x, -0.125, snoutTipZ + 0.012); head.add(noInk(t)); }
  if (a.whiskers) for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const w = noInk(new T.Mesh(new T.BoxGeometry(0.14, 0.004, 0.004), std(0x1d1410))); w.position.set(s * 0.13, -0.07 - i * 0.022, -0.25); w.rotation.set(0, s * 0.35, s * (0.12 - i * 0.12)); head.add(w);
  }
  if (a.nose === 'ring') { const r = new T.Mesh(new T.TorusGeometry(0.04, 0.008, 8, 20), std(a.accColor, 0.25, 0.6)); r.position.set(0, -0.085, snoutTipZ - 0.03); r.rotation.x = 0.5; head.add(noInk(r)); }

  // eyes (sclera + pupil + highlight), upper lids, brows, mouth, X marks for when they're out
  const face = {eyes: [], pupils: [], brows: [], lids: [], xs: []};
  const white = toon(0xf4efe4), black = new T.MeshBasicMaterial({color: 0x0b0b0b}), shine = new T.MeshBasicMaterial({color: 0xffffff});
  const eR = a.eyeR || 0.058, eX = a.eyeX || 0.1, eY = a.eyeY || 0.07, eZ = a.eyeZ || -0.215, ek = eR / 0.058;
  for (const s of [-1, 1]) {
    const eye = new T.Group(); eye.position.set(s * eX, eY, eZ); head.add(eye);
    eye.add(new T.Mesh(new T.SphereGeometry(eR, 16, 12), white));
    const pupil = new T.Group(); pupil.position.z = -0.042 * ek; eye.add(pupil);
    pupil.add(noInk(new T.Mesh(new T.SphereGeometry(0.03 * ek, 12, 10), black)));
    const hl = noInk(new T.Mesh(new T.SphereGeometry(0.009 * ek, 6, 6), shine)); hl.position.set(0.012 * ek, 0.014 * ek, -0.026 * ek); pupil.add(hl);
    pupil.userData.base = pupil.position.clone();
    // lid: a fur-coloured dome that rotates down over the eye (open ≈ 1.45, closed ≈ -1.5)
    const lid = new T.Group(); eye.add(lid);
    lid.add(noInk(new T.Mesh(new T.SphereGeometry(eR + 0.006, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), a.extra === 'disc' ? toon(a.snout) : fur)));
    lid.rotation.x = 1.45;
    const x = new T.Group(); x.position.z = -0.06 * ek; x.visible = false; eye.add(x);
    for (const r of [-0.785, 0.785]) { const bar = noInk(new T.Mesh(new T.BoxGeometry(0.085 * ek, 0.016, 0.01), black)); bar.rotation.z = r; x.add(bar); }
    const brow = noInk(new T.Mesh(new T.BoxGeometry(0.1 * ek, 0.022, 0.025), std(0x1d1410))); brow.position.set(s * eX, eY + 0.03 + eR, eZ - 0.02); brow.userData.side = s; brow.userData.y = brow.position.y; head.add(brow);
    face.eyes.push(eye); face.pupils.push(pupil); face.brows.push(brow); face.lids.push(lid); face.xs.push(x);
  }
  if (a.extra === 'scar') { const scar = noInk(new T.Mesh(new T.BoxGeometry(0.018, 0.16, 0.012), toon(0x8a7468))); scar.position.set(0.1, 0.1, -0.245); scar.rotation.set(-0.3, 0, 0.35); head.add(scar); }
  const mouthY = {cone: -0.13, disk: -0.175, box: -0.115, cheeks: -0.15, long: -0.135, beak: -0.13}[a.snoutShape];
  const mouthZ = {cone: -0.36, disk: -0.29, box: snoutTipZ - 0.008, cheeks: -0.25, long: -0.56, beak: -0.24}[a.snoutShape];
  const mouth = noInk(new T.Mesh(new T.SphereGeometry(0.05, 14, 10), std(0x3a0f0f, 0.6))); mouth.position.set(0, mouthY, mouthZ); mouth.scale.set(1.3, 0.12, 0.35); head.add(mouth);
  const smile = noInk(new T.Mesh(new T.TorusGeometry(0.05, 0.011, 6, 16, Math.PI), std(0x1d1410))); smile.position.set(0, mouthY + 0.02, mouthZ - 0.005); smile.rotation.z = Math.PI; smile.visible = false; head.add(smile);
  face.mouth = mouth; face.smile = smile;

  // ears / horns
  const ears = [];
  for (const s of [-1, 1]) {
    let ear;
    if (a.ear === 'pointy') {
      ear = new T.Group(); ear.position.set(s * 0.15, 0.24, 0);
      const outer = new T.Mesh(new T.ConeGeometry(0.08, 0.2, 8), fur); outer.position.y = 0.04; ear.add(outer);
      const inner = noInk(new T.Mesh(new T.ConeGeometry(0.045, 0.13, 8), toon(0x2a1a14))); inner.position.set(0, 0.03, -0.035); ear.add(inner);
    } else if (a.ear === 'flop') { ear = new T.Mesh(new T.ConeGeometry(0.08, 0.16, 8), fur); ear.position.set(s * 0.18, 0.2, -0.05); ear.rotation.z = s * 2.2; }
    else if (a.ear === 'round') { ear = new T.Mesh(new T.SphereGeometry(0.08, 12, 10), fur); ear.position.set(s * 0.18, 0.22, 0); }
    else if (a.ear === 'horn') { ear = new T.Mesh(new T.ConeGeometry(0.045, 0.3, 10), toon(0xe8dcc4)); ear.position.set(s * 0.28, 0.17, -0.02); ear.rotation.z = -s * 1.1; }
    else if (a.ear === 'long') { // rabbit: tall ears, the right one bent over
      ear = new T.Group(); ear.position.set(s * 0.09, 0.22, 0.02); ear.rotation.z = -s * 0.12;
      const outer = new T.Mesh(new T.SphereGeometry(1, 12, 10), fur); outer.scale.set(0.055, 0.2, 0.035); outer.position.y = 0.17; ear.add(outer);
      const inner = noInk(new T.Mesh(new T.SphereGeometry(1, 10, 8), toon(0xe8a0aa))); inner.scale.set(0.032, 0.15, 0.02); inner.position.set(0, 0.17, -0.02); ear.add(inner);
      if (s > 0) ear.rotation.x = 0.55;
    } else if (a.ear === 'cat') {
      ear = new T.Group(); ear.position.set(s * 0.15, 0.22, 0.01); ear.rotation.z = -s * 0.25;
      const outer = new T.Mesh(new T.ConeGeometry(0.075, 0.15, 4), fur); outer.position.y = 0.04; outer.rotation.y = Math.PI / 4; ear.add(outer);
      const inner = noInk(new T.Mesh(new T.ConeGeometry(0.04, 0.1, 4), toon(0xe8a0aa))); inner.position.set(0, 0.03, -0.03); inner.rotation.y = Math.PI / 4; ear.add(inner);
    } else if (a.ear === 'tuft') { ear = new T.Mesh(new T.ConeGeometry(0.04, 0.15, 8), toon(a.body)); ear.position.set(s * 0.16, 0.25, -0.02); ear.rotation.z = -s * 0.5; }
    else continue; // no ears (crocodile)
    ear.userData.rz = ear.rotation.z; head.add(ear); ears.push(ear);
  }

  // accessory
  const acc = toon(a.accColor);
  if (a.acc === 'bowtie') {
    const neck = new T.Group(); neck.position.set(0, 0.8, -0.24); fig.add(neck);
    for (const s of [-1, 1]) { const w = new T.Mesh(new T.ConeGeometry(0.05, 0.09, 4), acc); w.rotation.z = s * Math.PI / 2; w.position.x = s * 0.045; neck.add(w); }
    neck.add(new T.Mesh(new T.SphereGeometry(0.022, 8, 6), acc));
  } else if (a.acc === 'cap') {
    const cap = new T.Mesh(new T.CylinderGeometry(0.24, 0.26, 0.09, 20), acc); cap.position.set(0, 0.22, 0.01); cap.rotation.x = -0.12; head.add(cap);
    const brim = new T.Mesh(new T.BoxGeometry(0.3, 0.02, 0.16), acc); brim.position.set(0, 0.19, -0.25); brim.rotation.x = 0.1; head.add(brim);
  } else if (a.acc === 'glasses') { // round spectacles
    for (const s of [-1, 1]) { const r = new T.Mesh(new T.TorusGeometry(eR + 0.012, 0.006, 6, 20), acc); r.position.set(s * eX, eY, eZ - eR - 0.012); head.add(noInk(r)); }
    const bridge = noInk(new T.Mesh(new T.BoxGeometry(eX * 2 - (eR + 0.012) * 2, 0.008, 0.008), acc)); bridge.position.set(0, eY + 0.01, eZ - eR - 0.012); head.add(bridge);
    for (const s of [-1, 1]) { const tm = noInk(new T.Mesh(new T.BoxGeometry(0.006, 0.006, 0.2), acc)); tm.position.set(s * (eX + eR + 0.012), eY, eZ + 0.04); head.add(tm); }
  } else if (a.acc === 'beret') {
    const b = new T.Mesh(new T.SphereGeometry(0.2, 18, 10), acc); b.scale.set(1.05, 0.32, 1.05); b.position.set(0.05, 0.25, 0.02); b.rotation.z = -0.28; head.add(b);
    const nub = noInk(new T.Mesh(new T.CylinderGeometry(0.008, 0.012, 0.03, 6), acc)); nub.position.set(0.035, 0.32, 0.02); head.add(nub);
  } else if (a.acc === 'fedora') {
    const hat = new T.Group(); hat.position.set(0, 0.2, 0.02); hat.rotation.set(-0.08, 0, 0.06); head.add(hat);
    const crown = new T.Mesh(new T.CylinderGeometry(0.17, 0.2, 0.17, 18), acc); crown.position.y = 0.1; hat.add(crown);
    const band = noInk(new T.Mesh(new T.CylinderGeometry(0.202, 0.202, 0.04, 18), toon(0x6a1a1a))); band.position.y = 0.04; hat.add(band);
    const brim = new T.Mesh(new T.CylinderGeometry(0.33, 0.33, 0.02, 24), acc); brim.position.y = 0.01; hat.add(brim);
  } else if (a.acc === 'monocle') { // a gold monocle on the right eye with a chain
    const m = noInk(new T.Mesh(new T.TorusGeometry(eR + 0.01, 0.007, 6, 22), toon(a.accColor))); m.position.set(eX, eY, eZ - eR - 0.006); head.add(m);
    const chain = noInk(new T.Mesh(new T.TorusGeometry(0.09, 0.004, 4, 16, Math.PI * 0.8), toon(a.accColor))); chain.position.set(eX + 0.06, eY - 0.1, eZ - 0.02); chain.rotation.set(0, Math.PI / 2, -1.2); head.add(chain);
  } else if (a.acc === 'scarf') {
    const sc = new T.Mesh(new T.TorusGeometry(0.22, 0.065, 8, 22), acc); sc.rotation.x = Math.PI / 2; sc.position.y = 0.8; fig.add(sc);
    const tail = new T.Mesh(new T.BoxGeometry(0.09, 0.28, 0.04), acc); tail.position.set(0.12, 0.66, -0.27); tail.rotation.set(-0.3, 0, 0.15); fig.add(tail);
  }

  // arms (the IK places them every frame; start at rest)
  const arms = [makeArm(a, -1), makeArm(a, 1)];
  for (const arm of arms) { fig.add(arm.upper, arm.fore, arm.joint, arm.cap, arm.hand); solveArm(arm, restHand(arm.side)); }

  ink(fig);
  g.add(chair, back, torso);
  g.traverse(o => { if (o.isMesh && o.material !== INK) o.castShadow = true; });
  g.userData = {torso, head, face, kind, arms, ears};
  return g;
}
// where a paw rests on the padded rail, in torso space (its top is ~0.7 in front, 0.46 above the torso origin)
const restHand = side => new T.Vector3(side * 0.27, 0.47, -0.7);

/* Character controller: face (blink, look, talk, fear, smile, dead), body, arms and gestures.
   opt.grip: world position of the gun grip while this character holds the gun (the arm on
   that side reaches it); opt.gunQ: the gun's world rotation, to wrap the paw around the grip. */
const GESTURE = {knock: 0.55, push: 0.6, push2: 0.7, toss: 0.5, slam: 0.6};
const _v = new T.Vector3(), _tq = new T.Quaternion();
function animateFace(ch, st, t, dt, lookWorld, opt = {}) {
  const {torso, head, face, arms, ears} = ch.userData;
  const k = d => 1 - Math.exp(-dt * d);
  // blink
  if (t > st.nextBlink) { st.blinkUntil = t + 0.13; st.nextBlink = t + 2 + Math.random() * 4; }
  const blink = t < st.blinkUntil;
  // startle: a flinch when someone else's gun goes off
  const startled = t < st.startle && !st.dead;
  const fear = (st.fear || startled) && !st.dead, happy = t < st.happyUntil && !st.dead, talk = t < st.talkUntil && !st.dead;
  // eyes: lids do the blinking; fear widens the eye, confidence makes it smug (half-lidded)
  const lidT = st.dead ? -0.2 : blink ? -1.5 : fear ? 1.6 : happy ? 0.45 : st.confident ? 0.3 : 1.45;
  for (const l of face.lids) l.rotation.x += (lidT - l.rotation.x) * k(blink ? 45 : 12);
  for (const e of face.eyes) { const sc = fear ? 1.15 : 1; e.scale.x += (sc - e.scale.x) * k(12); e.scale.y += (sc - e.scale.y) * k(12); }
  for (const p of face.pupils) p.visible = !st.dead;
  for (const x of face.xs) x.visible = st.dead;
  // pupils + head follow the look target
  let yaw = 0;
  if (lookWorld && !st.dead) {
    const lh = head.worldToLocal(_v.copy(lookWorld));
    const len = lh.length() || 1;
    for (const p of face.pupils) {
      p.position.x += (p.userData.base.x + Math.max(-0.02, Math.min(0.02, lh.x / len * 0.03)) - p.position.x) * k(10);
      p.position.y += (p.userData.base.y + Math.max(-0.015, Math.min(0.015, lh.y / len * 0.03)) - p.position.y) * k(10);
    }
    const lt = torso.worldToLocal(_v.copy(lookWorld));
    yaw = Math.max(-0.7, Math.min(0.7, Math.atan2(-lt.x, -lt.z)));
  }
  head.rotation.y += ((st.dead ? 0 : yaw * 0.75) - head.rotation.y) * k(3);
  // a bullet snaps the head away from the gun, fast, and it stays tipped over
  const hitFast = st.hitT != null && t - st.hitT < 0.25;
  head.rotation.z += ((st.dead && st.hitSide ? st.hitSide * 0.5 : 0) - head.rotation.z) * k(hitFast ? 28 : 4);
  // ears: flatten back in fear, perk up when happy, an idle twitch now and then
  const twitch = !st.dead && Math.sin(t * 0.9 + st.phase * 3) > 0.985 ? Math.sin(t * 40) * 0.15 : 0;
  ears.forEach((e, i) => { const s = i ? 1 : -1; const tgt = e.userData.rz + (fear ? s * -0.35 : happy ? s * 0.12 : 0) + twitch * s; e.rotation.z += (tgt - e.rotation.z) * k(10); });
  // brows
  for (const b of face.brows) {
    const s = b.userData.side;
    const ty = b.userData.y + (fear ? 0.03 : 0);
    const rz = fear ? s * 0.35 : happy ? -s * 0.2 : st.confident ? -s * 0.3 : 0;
    b.position.y += (ty - b.position.y) * k(10);
    b.rotation.z += (rz - b.rotation.z) * k(10);
  }
  // mouth
  let open = 0.12;
  if (talk) open = 0.25 + Math.abs(Math.sin(t * 22)) * 0.55;
  if (fear) open = 0.9 + Math.sin(t * 30) * 0.08;
  if (st.dead) open = 0.45;
  face.mouth.scale.y += (open - face.mouth.scale.y) * k(18);
  face.smile.visible = happy;
  face.mouth.visible = !happy || talk;
  // body: breathe, tremble, slump
  // forward is -z, so a negative pitch tips the head toward the table
  const slump = st.dead ? -0.95 : st.relief && t < st.relief ? -0.25 : 0;
  torso.rotation.x += (slump - torso.rotation.x) * k(st.dead ? 2.5 : 4);
  const jump = startled ? Math.max(0, Math.sin(Math.min(1, (t - st.startle + 0.7) / 0.35) * Math.PI)) * 0.05 : 0;
  torso.position.y = 0.6 + (st.dead ? 0 : Math.sin(t * 1.6 + st.phase) * 0.012) + jump;
  torso.rotation.z += ((st.dead && st.hitSide ? st.hitSide * 0.18 : 0) - torso.rotation.z) * k(hitFast ? 14 : 3);
  torso.position.x = fear ? (Math.random() - 0.5) * 0.015 : 0;

  // arms: rest on the table, play a gesture, hold the gun, or hang when out
  const g = st.gesture && (t - st.gesture.t0) / (GESTURE[st.gesture.kind] || 0.5);
  if (g >= 1) st.gesture = null;
  let gunArm = null, gripLocal = null;
  if (opt.grip && !st.dead) { gripLocal = torso.worldToLocal(_v.copy(opt.grip)); gunArm = gripLocal.x >= 0 ? arms[1] : arms[0]; }
  for (const arm of arms) {
    const s = arm.side, want = opt.lap ? new T.Vector3(s * 0.2, 0.16, -0.36) : restHand(s); // no table: paws on the lap
    want.y += Math.sin(t * 1.6 + st.phase + s) * 0.006; // breathing
    // out: paws sprawled on the felt either side of the head (set in the seat's frame, then into the slumped torso's)
    if (st.dead) want.set(s * 0.6, 0.5, -0.72).applyQuaternion(_tq.copy(torso.quaternion).invert());
    else if (st.gesture && g < 1) {
      const kind = st.gesture.kind, main = s > 0; // the right paw leads
      const bump = Math.sin(Math.PI * g);
      if (kind === 'knock' && main) want.y += Math.abs(Math.sin(g * Math.PI * 2)) * 0.11;
      if ((kind === 'push' && main) || kind === 'push2') { want.z -= bump * 0.2; want.y += bump * 0.05; want.x -= s * bump * 0.08; }
      if (kind === 'toss' && main) { want.y += bump * 0.16; want.z -= bump * 0.12; }
      if (kind === 'slam') want.y += g < 0.6 ? Math.sin(Math.PI * g / 0.6) * 0.28 : 0;
    } else if (fear && arm !== gunArm) { want.set(s * 0.2, 0.55 + Math.sin(t * 31) * 0.01, -0.42); } // paw clutched to the chest
    if (!arm.cur) arm.cur = want.clone();
    if (arm === gunArm) {
      arm.cur.lerp(gripLocal, k(30));
      // paw wraps the grip: follow the gun's rotation, in torso space
      _tq.copy(torso.getWorldQuaternion(_q).invert()).multiply(opt.gunQ);
      solveArm(arm, arm.cur, _tq);
    } else {
      arm.cur.lerp(want, k(st.gesture && g < 1 ? 22 : 9));
      solveArm(arm, arm.cur);
    }
  }
}
const newFaceState = () => ({nextBlink: Math.random() * 3, blinkUntil: 0, talkUntil: 0, happyUntil: 0, fear: false, dead: false, relief: 0, phase: Math.random() * 6, confident: false, startle: 0, hitT: null, hitSide: 0, gesture: null});

/* ---------- portrait renderer for the character picker ---------- */
function renderPortraits(w = 220, h = 250) {
  const out = {};
  let r;
  try { r = new T.WebGLRenderer({antialias: true, preserveDrawingBuffer: true}); } catch (e) { return out; }
  r.setSize(w, h); r.outputEncoding = T.sRGBEncoding;
  const sc = new T.Scene(); sc.background = new T.Color(0x1a120c);
  // gentler than the table lamp: toon materials jump straight to their top band
  sc.add(new T.HemisphereLight(0x8a6a48, 0x1a120c, 0.45));
  const key = new T.SpotLight(0xffc77a, 1.05, 8, Math.PI / 5, 0.6, 1); key.position.set(0.6, 3, -1.6); key.target.position.set(0, 1.5, 0); sc.add(key, key.target);
  const rim = new T.DirectionalLight(0xe2a64a, 0.35); rim.position.set(-1, 2, 1); sc.add(rim);
  const cam = new T.PerspectiveCamera(30, w / h, 0.1, 20); cam.position.set(0.3, 1.66, -2.05); cam.lookAt(0, 1.5, 0);
  for (const kind of Object.keys(CHARACTERS)) {
    const ch = makeAnimal(kind); sc.add(ch);
    const st = newFaceState(); st.happyUntil = 1e9; st.nextBlink = 1e9;
    for (let i = 0; i < 30; i++) animateFace(ch, st, 0.1, 0.1, new T.Vector3(0.3, 1.66, -2.05));
    r.render(sc, cam);
    out[kind] = r.domElement.toDataURL('image/png');
    sc.remove(ch);
  }
  r.dispose();
  return out;
}

/* ---------- character showcase: the full-screen character select stage ---------- */
// One character on its chair under a spotlight, with out-of-focus bar lights behind. It breathes,
// blinks and follows the pointer; switching characters pops the new one in with a gesture.
// `offset` shifts the subject: {x, y} as fractions of the canvas (e.g. x: -0.22 = left of centre).
function createShowcase(canvas) {
  let r;
  try { r = new T.WebGLRenderer({canvas, antialias: true}); } catch (e) { return null; }
  r.setPixelRatio(Math.min(root.matchMedia && root.matchMedia('(pointer: coarse)').matches ? 1.5 : 2, root.devicePixelRatio || 1)); r.outputEncoding = T.sRGBEncoding;
  r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
  const sc = new T.Scene(); sc.background = new T.Color(0x0e0a07); sc.fog = new T.Fog(0x0e0a07, 6, 14);
  sc.add(new T.HemisphereLight(0x8a6a48, 0x120c08, 0.42));
  const key = new T.SpotLight(0xffc77a, 1.35, 9, Math.PI / 7, 0.55, 1.2); key.position.set(0.4, 4.2, -1.4); key.target.position.set(0, 1.0, 0);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005; sc.add(key, key.target);
  const rim = new T.DirectionalLight(0xe2a64a, 0.5); rim.position.set(-2, 2.5, 2.5); sc.add(rim);
  const rim2 = new T.DirectionalLight(0x6a8aff, 0.18); rim2.position.set(2.5, 1.5, 2); sc.add(rim2);
  // floor: a pool of light on dark planks
  const [fc, fg] = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; return [c, c.getContext('2d')]; })();
  const grad = fg.createRadialGradient(128, 128, 10, 128, 128, 128); grad.addColorStop(0, '#5a3a22'); grad.addColorStop(0.55, '#2a1a10'); grad.addColorStop(1, '#0e0a07');
  fg.fillStyle = grad; fg.fillRect(0, 0, 256, 256);
  const floorTex = new T.CanvasTexture(fc); floorTex.encoding = T.sRGBEncoding;
  const floor = new T.Mesh(new T.CircleGeometry(4, 48), new T.MeshStandardMaterial({map: floorTex, roughness: 0.85})); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; sc.add(floor);
  // bokeh: soft, out-of-focus bar lights far behind
  const bokehTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.65, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c); })();
  const bokeh = [];
  const cols = [0xffb060, 0xffd090, 0xff6040, 0xffa040, 0x60a0ff, 0xff4070];
  for (let i = 0; i < 26; i++) {
    const s = new T.Sprite(new T.SpriteMaterial({map: bokehTex, color: cols[i % cols.length], transparent: true, opacity: 0.25 + Math.random() * 0.3, blending: T.AdditiveBlending, depthWrite: false, fog: false}));
    s.position.set((Math.random() - 0.5) * 9, 0.6 + Math.random() * 3, 3 + Math.random() * 4); s.scale.setScalar(0.25 + Math.random() * 0.6);
    s.userData = {ph: Math.random() * 6, base: s.position.clone(), op: s.material.opacity};
    sc.add(s); bokeh.push(s);
  }
  // dust in the spotlight
  const dustGeo = new T.BufferGeometry(), N = 70, dp = new Float32Array(N * 3), dv = [];
  for (let i = 0; i < N; i++) { dp.set([(Math.random() - 0.5) * 1.8, Math.random() * 3.2, (Math.random() - 0.5) * 1.8 - 0.3], i * 3); dv.push(0.02 + Math.random() * 0.05); }
  dustGeo.setAttribute('position', new T.BufferAttribute(dp, 3));
  const dust = new T.Points(dustGeo, new T.PointsMaterial({color: 0xffe2a8, size: 0.018, transparent: true, opacity: 0.6, depthWrite: false, blending: T.AdditiveBlending}));
  sc.add(dust);

  const cam = new T.PerspectiveCamera(30, 1, 0.1, 30);
  const CAM = new T.Vector3(0.6, 1.5, -4.4), LOOK = new T.Vector3(0, 1.05, 0);
  cam.position.copy(CAM); cam.lookAt(LOOK);
  let ch = null, st = null, kind = null, running = false, last = 0, t = 0, enterT = 0, offset = {x: 0, y: 0, zoom: 1};
  const pointer = new T.Vector2(), look = new T.Vector3();
  const onMove = e => { const b = canvas.getBoundingClientRect(); pointer.set((e.clientX - b.left) / b.width * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1); };
  root.addEventListener('pointermove', onMove);
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    r.setSize(w, h, false); cam.aspect = w / h;
    // narrow screens: pull back so the whole figure fits
    cam.fov = w / h < 0.8 ? 40 : 30;
    cam.zoom = offset.zoom;
    cam.setViewOffset(w, h, -offset.x * w, -offset.y * h, w, h);
    cam.updateProjectionMatrix();
  }
  function show(k) {
    if (k === kind) return;
    kind = k;
    if (ch) sc.remove(ch);
    ch = makeAnimal(k); // models face -z, where the camera is
    ch.traverse(o => { if (o.isMesh) o.castShadow = true; });
    sc.add(ch);
    st = newFaceState(); st.happyUntil = t + 1.4; st.talkUntil = t + 0.5; st.gesture = {kind: Math.random() < 0.5 ? 'push2' : 'knock', t0: t + 0.15};
    enterT = t;
  }
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; t += dt;
    if (ch) {
      // pop in: a quick rise and settle
      const p = Math.min(1, (t - enterT) / 0.45), e = 1 - Math.pow(1 - p, 3);
      ch.scale.setScalar(0.88 + 0.12 * e + Math.sin(p * Math.PI) * 0.03);
      ch.position.y = (1 - e) * -0.15;
      // turn a little toward the pointer; eyes follow it
      ch.rotation.y += (pointer.x * 0.35 - ch.rotation.y) * (1 - Math.exp(-dt * 3));
      look.set(pointer.x * -1.6, 1.3 + pointer.y * 0.9, -2.5);
      animateFace(ch, st, t, dt, look, {lap: true});
    }
    for (const b of bokeh) { const u = b.userData; b.position.x = u.base.x + Math.sin(t * 0.2 + u.ph) * 0.15; b.material.opacity = u.op * (0.75 + 0.25 * Math.sin(t * 0.8 + u.ph)); }
    for (let i = 0; i < N; i++) { dp[i * 3 + 1] += dv[i] * dt; if (dp[i * 3 + 1] > 3.2) dp[i * 3 + 1] = 0; }
    dustGeo.attributes.position.needsUpdate = true;
    cam.position.set(CAM.x + Math.sin(t * 0.3) * 0.05, CAM.y + Math.sin(t * 0.4) * 0.02, CAM.z); cam.lookAt(LOOK);
    r.render(sc, cam);
  }
  return {
    show, resize,
    // x, y: shift the subject by a fraction of the canvas (+x right, +y down); zoom < 1 shows it smaller
    setOffset(x, y, zoom = 1) { offset = {x, y, zoom}; resize(); },
    start() { if (running) return; running = true; resize(); last = performance.now(); requestAnimationFrame(frame); },
    stop() { running = false; },
    get kind() { return kind; },
  };
}

/* ---------- main table scene ---------- */
function createScene(canvas, labelLayer) {
  const renderer = new T.WebGLRenderer({canvas, antialias: true});
  // touch devices: cap the render resolution at 1.5x (dense phone screens cost ~40% fewer pixels than at 2x)
  const coarse = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
  renderer.setPixelRatio(Math.min(coarse ? 1.5 : 2, root.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputEncoding = T.sRGBEncoding;
  const scene = new T.Scene();
  scene.background = new T.Color(0x0d0a08);
  scene.fog = new T.Fog(0x0d0a08, 6.5, 17); // far enough that the walls of the bar read
  const camera = new T.PerspectiveCamera(55, 1, 0.05, 50);
  camera.position.set(0, 4.4, 3.6);

  // room & light
  scene.add(new T.HemisphereLight(0x5a4632, 0x0a0806, 0.6));
  const lamp = new T.SpotLight(0xffc77a, 2.4, 12, Math.PI / 4.2, 0.55, 1.4);
  lamp.position.set(0, 3.6, 0); lamp.target.position.set(0, 0, 0);
  lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.bias = -0.0005;
  scene.add(lamp, lamp.target);
  const flash = new T.PointLight(0xffa040, 0, 6); scene.add(flash);
  // God Save: golden light from above + a halo over the survivor
  const godLight = new T.PointLight(0xffe08a, 0, 5); scene.add(godLight);
  const halo = new T.Mesh(new T.TorusGeometry(0.2, 0.025, 10, 32), new T.MeshBasicMaterial({color: 0xffe08a, transparent: true, opacity: 0}));
  halo.rotation.x = Math.PI / 2; halo.visible = false; scene.add(halo);
  let godT = 0;
  const lampGroup = new T.Group();
  const shade = new T.Mesh(new T.ConeGeometry(0.45, 0.35, 24, 1, true), new T.MeshStandardMaterial({color: 0x2c3a2a, side: T.DoubleSide, metalness: 0.4, roughness: 0.5}));
  shade.position.y = 3.25;
  const bulb = new T.Mesh(new T.SphereGeometry(0.09, 16, 12), new T.MeshBasicMaterial({color: 0xffe2a8})); bulb.position.y = 3.1;
  const cord = new T.Mesh(new T.CylinderGeometry(0.01, 0.01, 2), new T.MeshBasicMaterial({color: 0x111111})); cord.position.y = 4.4;
  lampGroup.add(shade, bulb, cord); scene.add(lampGroup);
  // the bar around us and the table itself (room.js)
  const room = root.PokerRoom.build(scene, {TABLE_R, TOP, low: !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches)});
  // Reflections for metal and glass: a small painted panorama of the bar (warm lamp overhead, dark
  // walls, a band of amber bottle light at eye level, dark floor), prefiltered with PMREM.
  // Without it, metallic materials have nothing to reflect and render nearly black.
  const envTex = (() => {
    try {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
      const g = cv.getContext('2d');
      const sky = g.createLinearGradient(0, 0, 0, 128);
      sky.addColorStop(0, '#6a5030'); sky.addColorStop(0.3, '#2a1c12'); sky.addColorStop(0.5, '#1c130c'); sky.addColorStop(0.62, '#120c08'); sky.addColorStop(1, '#0a0705');
      g.fillStyle = sky; g.fillRect(0, 0, 256, 128);
      const lampG = g.createRadialGradient(128, 0, 0, 128, 0, 60); lampG.addColorStop(0, 'rgba(255,220,160,0.9)'); lampG.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = lampG; g.fillRect(0, 0, 256, 60);
      for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(255,${150 + (i * 37) % 80},70,${0.25 + (i * 13 % 10) / 30})`; g.fillRect(96 + i * 2.4, 58 + (i % 3) * 3, 2, 6); }
      g.fillStyle = 'rgba(255,60,90,.35)'; g.fillRect(150, 44, 14, 4); // neon
      const t = new T.CanvasTexture(cv); t.encoding = T.sRGBEncoding; t.mapping = T.EquirectangularReflectionMapping;
      const pm = new T.PMREMGenerator(renderer); const rt = pm.fromEquirectangular(t); pm.dispose(); t.dispose();
      return rt.texture;
    } catch (e) { return null; }
  })();
  const shiny = m => { if (envTex && m && m.isMeshStandardMaterial && (m.metalness > 0.2 || m.transparent)) { m.envMap = envTex; m.envMapIntensity = m.transparent ? 0.6 : 1; m.needsUpdate = true; } };
  const shineAll = o => o.traverse(x => { if (x.isMesh) [].concat(x.material).forEach(shiny); });

  // card textures
  const texCache = new Map();
  const texKey = c => !c || c.hidden ? 'back' : c.k ? 'L' + c.k : c.id;
  const KIND_NAME = {K: 'KING', Q: 'QUEEN', A: 'ACE', J: 'JOKER'};
  function cardTex(c) {
    const key = texKey(c);
    if (texCache.has(key)) return texCache.get(key);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 356;
    const g = cv.getContext('2d');
    if (c && c.k) { // Liar's Deck: one big rank, no suits; the Joker is wild
      const joker = c.k === 'J';
      g.fillStyle = '#f1e8d4'; g.fillRect(0, 0, 256, 356);
      g.strokeStyle = joker ? '#b8322a' : '#8a6a3a'; g.lineWidth = 6; g.strokeRect(12, 12, 232, 332);
      g.fillStyle = joker ? '#b8322a' : '#1d1611'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '900 170px Georgia, serif'; g.fillText(joker ? '★' : c.k, 128, 160);
      g.font = '900 34px Georgia, serif'; g.fillText(KIND_NAME[c.k], 128, 300);
      g.textAlign = 'left'; g.textBaseline = 'top'; g.font = '900 44px Georgia, serif'; g.fillText(joker ? '★' : c.k, 24, 20);
    } else if (!c) {
      g.fillStyle = '#5a2019'; g.fillRect(0, 0, 256, 356);
      g.strokeStyle = '#8a4a33'; g.lineWidth = 6;
      for (let i = -356; i < 356; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 356, 356); g.stroke(); }
      g.strokeStyle = '#c99a5a'; g.lineWidth = 8; g.strokeRect(14, 14, 228, 328);
    } else {
      const red = c.s === 1 || c.s === 2;
      g.fillStyle = '#f1e8d4'; g.fillRect(0, 0, 256, 356);
      g.fillStyle = red ? '#b8322a' : '#1d1611';
      g.font = '900 78px Georgia, serif'; g.textBaseline = 'top';
      g.fillText(E.rankLabel(c.r), 18, 14);
      g.font = '56px Georgia, serif'; g.fillText(E.SUITS[c.s], 22, 100);
      g.font = '150px Georgia, serif'; g.textAlign = 'right'; g.textBaseline = 'bottom';
      g.fillText(E.SUITS[c.s], 240, 346);
    }
    const tx = new T.CanvasTexture(cv); tx.encoding = T.sRGBEncoding; tx.anisotropy = 4;
    texCache.set(key, tx); return tx;
  }
  const edgeMat = std(0xe8dcc4, 0.6);
  const cardGeo = new T.BoxGeometry(0.28, 0.006, 0.4);
  function makeCard() {
    const face = new T.MeshStandardMaterial({roughness: 0.55, emissive: 0xffffff, emissiveIntensity: 0.22});
    const back = new T.MeshStandardMaterial({map: cardTex(null), roughness: 0.55});
    const m = new T.Mesh(cardGeo, [edgeMat, edgeMat, face, back, edgeMat, edgeMat]);
    m.castShadow = true; m.userData.face = face; m.userData.cardId = null;
    return m;
  }
  function setFace(m, c) {
    const id = texKey(c);
    if (m.userData.cardId === id) return;
    m.userData.cardId = id; m.userData.face.map = m.userData.face.emissiveMap = cardTex(c.hidden ? null : c); m.userData.face.needsUpdate = true;
  }

  // gun & bullets
  const brass = std(0xc8963c, 0.3, 0.9), copper = std(0xb0603a, 0.3, 0.9);
  // Rig: g (placed by the scene) > body (recoil) > parts. The crane swings the cylinder out to
  // load; hammer and trigger pivot. Barrel along +x, muzzle at MUZZLE.
  function makeGun() {
    const g = new T.Group(), gunBody = new T.Group(); g.add(gunBody);
    // low metalness: there is no environment map, so a fully metallic gun renders black
    const steel = std(0x6a6a70, 0.38, 0.55), grip = std(0x6a3a1e, 0.65), dark = std(0x2a2a2e, 0.5, 0.5);
    const barrel = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.42, 12), steel); barrel.rotation.z = Math.PI / 2; barrel.position.x = 0.24;
    const rib = new T.Mesh(new T.BoxGeometry(0.36, 0.014, 0.02), steel); rib.position.set(0.27, 0.032, 0);
    const sight = new T.Mesh(new T.BoxGeometry(0.02, 0.022, 0.008), dark); sight.position.set(0.43, 0.045, 0);
    const rod = new T.Mesh(new T.CylinderGeometry(0.009, 0.009, 0.2, 8), steel); rod.rotation.z = Math.PI / 2; rod.position.set(0.17, -0.035, 0);
    const bore = new T.Mesh(new T.CircleGeometry(0.014, 10), std(0x000000, 1)); bore.rotation.y = Math.PI / 2; bore.position.x = 0.451;
    // crane pivots below the cylinder so the cylinder swings out sideways
    const crane = new T.Group(); crane.position.y = -0.06;
    const cyl = new T.Group(); cyl.position.y = 0.06; crane.add(cyl);
    const body = new T.Mesh(new T.CylinderGeometry(0.075, 0.075, 0.13, 18), steel); body.rotation.z = Math.PI / 2; cyl.add(body);
    const holeM = std(0x050505, 0.9), rounds = [];
    for (let c = 0; c < 6; c++) {
      const a = c * Math.PI / 3, y = Math.cos(a) * 0.045, z = Math.sin(a) * 0.045;
      const hole = new T.Mesh(new T.CylinderGeometry(0.015, 0.015, 0.012, 10), holeM); hole.rotation.z = Math.PI / 2; hole.position.set(-0.062, y, z); cyl.add(hole);
      const rnd = new T.Group(); rnd.position.set(-0.07, y, z); rnd.visible = false;
      const rim = new T.Mesh(new T.CylinderGeometry(0.017, 0.017, 0.012, 12), brass); rim.rotation.z = Math.PI / 2; rnd.add(rim);
      const primer = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, 0.004, 8), copper); primer.rotation.z = Math.PI / 2; primer.position.x = -0.007; rnd.add(primer);
      cyl.add(rnd); rounds.push(rnd);
    }
    const frame = new T.Mesh(new T.BoxGeometry(0.2, 0.07, 0.05), steel); frame.position.set(-0.08, 0.02, 0);
    const handle = new T.Mesh(new T.BoxGeometry(0.08, 0.24, 0.06), grip); handle.position.set(-0.17, -0.1, 0); handle.rotation.z = 0.35;
    const guard = new T.Mesh(new T.TorusGeometry(0.04, 0.008, 6, 12, Math.PI), steel); guard.position.set(-0.06, -0.05, 0); guard.rotation.z = Math.PI;
    // trigger blade hangs from a pivot inside the guard
    const trigger = new T.Group(); trigger.position.set(-0.05, -0.03, 0);
    const blade = new T.Mesh(new T.BoxGeometry(0.012, 0.05, 0.012), dark); blade.position.set(-0.006, -0.025, 0); blade.rotation.z = -0.25; trigger.add(blade);
    // hammer pivots at the back of the frame: rest leans forward, cocked leans back
    const hammer = new T.Group(); hammer.position.set(-0.16, 0.045, 0);
    const hm = new T.Mesh(new T.BoxGeometry(0.022, 0.06, 0.018), dark); hm.position.y = 0.025; hammer.add(hm);
    const spur = new T.Mesh(new T.BoxGeometry(0.035, 0.012, 0.022), dark); spur.position.set(-0.012, 0.055, 0); hammer.add(spur);
    hammer.rotation.z = HAMMER_REST;
    gunBody.add(barrel, rib, sight, rod, bore, crane, frame, handle, guard, trigger, hammer);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.userData = {body: gunBody, cyl, crane, hammer, trigger, rounds};
    return g;
  }
  const HAMMER_REST = -0.3, HAMMER_COCKED = 0.75, MUZZLE = new T.Vector3(0.46, 0, 0);
  // where a paw holds the grip, and how it turns so the fingers wrap around it
  const GRIP = new T.Vector3(-0.17, -0.08, 0), GRIP_Q = new T.Quaternion().setFromEuler(new T.Euler(0, Math.PI / 2, 0.35));
  const bulletGeo = new T.CylinderGeometry(0.022, 0.022, 0.09, 10);
  const tipGeo = new T.SphereGeometry(0.022, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  function makeBullet() {
    const g = new T.Group();
    const b = new T.Mesh(bulletGeo, brass); b.position.y = 0.045;
    const t = new T.Mesh(tipGeo, copper); t.position.y = 0.09;
    g.add(b, t); g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  // Liar's Dice: ivory dice (opposite faces sum to 7) and a leather cup
  const DIE = 0.075;
  const pipTex = v => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = '#efe6d2'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = v === 1 ? '#a3241c' : '#1d1611';
    const P = {1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [3, 1], [1, 3], [3, 3]], 5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]], 6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]]}[v];
    for (const [x, y] of P) { g.beginPath(); g.arc(x * 32, y * 32, v === 1 ? 17 : 12, 0, Math.PI * 2); g.fill(); }
    const t = new T.CanvasTexture(cv); t.encoding = T.sRGBEncoding; return t;
  };
  const DIE_FACES = [3, 4, 1, 6, 2, 5]; // BoxGeometry order: +x, -x, +y, -y, +z, -z
  let dieMats = null;
  function makeDie() {
    dieMats = dieMats || DIE_FACES.map(v => new T.MeshStandardMaterial({map: pipTex(v), roughness: 0.35}));
    const m = new T.Mesh(new T.BoxGeometry(DIE, DIE, DIE), dieMats); m.castShadow = true; return m;
  }
  // rotation that puts face v on top
  const X = new T.Vector3(1, 0, 0), Y = new T.Vector3(0, 1, 0), Z = new T.Vector3(0, 0, 1);
  const UP = {1: [X, 0], 6: [X, Math.PI], 3: [Z, Math.PI / 2], 4: [Z, -Math.PI / 2], 2: [X, -Math.PI / 2], 5: [X, Math.PI / 2]};
  const dieQ = (v, yaw) => { const [ax, a] = UP[v] || UP[1]; return new T.Quaternion().setFromAxisAngle(Y, yaw).multiply(new T.Quaternion().setFromAxisAngle(ax, a)); };
  function makeCup() {
    const leather = std(0x4a2516, 0.7), band = std(0xc8963c, 0.3, 0.8);
    const g = new T.Group();
    const body = new T.Mesh(new T.CylinderGeometry(0.15, 0.19, 0.22, 24), leather); g.add(body);
    const ring = new T.Mesh(new T.TorusGeometry(0.188, 0.008, 6, 32), band); ring.rotation.x = Math.PI / 2; ring.position.y = -0.1; g.add(ring);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  // dynamic objects eased toward targets
  const dyn = new Map();
  const DECK_POS = new T.Vector3(0.9, TOP + 0.02, 0.2);
  // Objects ease toward their target every frame. A new object (opt.from) or a big jump in its
  // target (> 0.15 units or > 45°) is flown instead, along an arc: opt.enter / opt.move style it.
  // Flight style: {delay, dur, arc, spin (turns about the up axis), tumble (turns about a random
  // axis), land: 'slide' | 'bounce' | 'slam', onLand}.
  function want(key, factory, pos, quat, opt = {}) {
    let d = dyn.get(key);
    const animate = !root.__instant;
    if (!d) {
      const obj = factory();
      obj.position.copy(opt.from || pos); obj.quaternion.copy(opt.from && opt.fromQ || quat);
      scene.add(obj);
      d = {obj}; dyn.set(key, d);
      if (opt.from && animate) fly(d, opt.enter);
    } else if (animate && d.pos && (d.pos.distanceToSquared(pos) > 0.0225 || d.quat.angleTo(quat) > 0.8)) fly(d, opt.move);
    d.pos = pos; d.quat = quat; d.seen = true; d.speed = opt.speed || 9;
    return d.obj;
  }
  function fly(d, st = {}) {
    d.flight = {from: d.obj.position.clone(), fromQ: d.obj.quaternion.clone(), t0: now() + (st.delay || 0), dur: st.dur, arc: st.arc,
      spin: st.spin || 0, tumble: st.tumble || 0, axis: randDir(), land: st.land || 'slide', onLand: st.onLand, hidden: !!st.hidden};
    if (st.hidden) d.obj.visible = false;
  }
  const UP_Q = new T.Quaternion(), SPIN_Q = new T.Quaternion();
  // advance one flight; returns true when it has landed
  function stepFlight(d, t) {
    const f = d.flight, o = d.obj;
    if (t < f.t0) return false; // waiting its turn (e.g. still on the deck)
    o.visible = true;
    const dist = f.from.distanceTo(d.pos);
    const dur = f.dur || 0.3 + dist * 0.12, arc = f.arc != null ? f.arc : Math.min(0.35, 0.04 + dist * 0.18);
    const p = Math.min(1, (t - f.t0) / dur);
    const e = f.land === 'slam' ? p * p : fx.ease.out(p);
    o.position.lerpVectors(f.from, d.pos, e);
    o.position.y += Math.sin(Math.PI * Math.min(1, f.land === 'slam' ? p * 1.15 : p)) * arc;
    if (f.land === 'bounce') o.position.y = f.from.y + (d.pos.y - f.from.y) * fx.ease.bounce(p) + Math.sin(Math.PI * p) * arc * (1 - p);
    const r = fx.ease.inOut(Math.min(1, p * 1.25));
    o.quaternion.copy(f.fromQ).slerp(d.quat, r);
    if (f.spin) o.quaternion.premultiply(UP_Q.setFromAxisAngle(Y, f.spin * Math.PI * 2 * (1 - r)));
    if (f.tumble) o.quaternion.premultiply(SPIN_Q.setFromAxisAngle(f.axis, f.tumble * Math.PI * 2 * (1 - r)));
    if (p < 1) return false;
    o.position.copy(d.pos); o.quaternion.copy(d.quat);
    d.flight = null;
    if (f.onLand) f.onLand(o);
    return true;
  }
  // cards that left the state are gathered back to the deck, then removed
  const leaving = new Set();
  function gather(d, i) {
    d.pos = DECK_POS.clone().setY(TOP + 0.05); d.quat = flatQ(0.3, false);
    fly(d, {delay: i * 0.02, dur: 0.38, arc: 0.12});
    leaving.add(d);
  }

  let seats = [];
  const gun = makeGun(), gunTarget = {pos: new T.Vector3(), quat: new T.Quaternion()};
  scene.add(gun);
  let camPos = new T.Vector3(0, 4.4, 3.6), camLook = new T.Vector3(0, TOP, 0);
  const curLook = camLook.clone();
  let mouse = {x: 0, y: 0}, viewerSeat = null, shake = 0, flashT = 0, boardView = false;
  let lastState = null, lastHide = false, snap = true, picked = new Set();
  const flyers = [];

  /* ----- gun moment: effects, gun mechanics, shot cam (DESIGN.md §3.4) ----- */
  const fx = root.PokerFX.createFX(scene);
  const now = () => fx.time;
  // ga: what the gun is doing. phase = last gun state seen ('load', 'aim', 'click', 'bang', 'godsave' or null)
  const ga = {phase: null, pid: null, flown: new Set(), open: 0, cock: 0, trig: 0, kick: 0, aimT0: 0, spinFrom: 0, spinTo: 0, idx: 0, drop: null, sweat: null};
  const camBase = camPos.clone();
  let fovMul = 1, baseFov = 60, fall = 0, fallOn = false, lampKick = 0, flickerUntil = 0, freeAmt = 1;
  // muzzle flash: a star sprite shown for a couple of frames
  const starTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    g.translate(64, 64);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 64);
    gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.2, 'rgba(255,220,120,1)'); gr.addColorStop(0.5, 'rgba(255,140,40,.8)'); gr.addColorStop(1, 'rgba(255,80,0,0)');
    g.fillStyle = gr; g.beginPath();
    for (let i = 0; i < 16; i++) { const r = i % 2 ? 16 : (i % 4 ? 46 : 64), a = i * Math.PI / 8; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); g.fill();
    return new T.CanvasTexture(cv);
  })();
  const muzzle = new T.Sprite(new T.SpriteMaterial({map: starTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true}));
  muzzle.visible = false; muzzle.renderOrder = 4; scene.add(muzzle);
  // God Save: a soft shaft of light from above
  const rayTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 128;
    const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 128); return new T.CanvasTexture(cv);
  })();
  const godRay = new T.Mesh(new T.CylinderGeometry(0.12, 0.5, 2.6, 24, 1, true), new T.MeshBasicMaterial({map: rayTex, color: 0xffe08a, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide}));
  godRay.visible = false; scene.add(godRay);
  const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
  const rand = (a, b) => a + Math.random() * (b - a);
  const randDir = () => V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
  const muzzlePos = () => { gun.updateMatrixWorld(true); return gun.userData.body.localToWorld(MUZZLE.clone()); };
  const barrelDir = () => V(1, 0, 0).applyQuaternion(gun.userData.body.getWorldQuaternion(new T.Quaternion()));
  const mouthPos = i => seats[i].group.userData.face.mouth.getWorldPosition(V());
  const faceDir = i => V(0, 0, -1).applyQuaternion(seats[i].group.userData.head.getWorldQuaternion(new T.Quaternion()));
  const tw = (dur, fn, opt) => fx.tween(dur, fn, opt);

  /* ----- bar ambience: haze in the lamp cone, dust, a smoking ashtray, drinks, neon, a moth ----- */
  // a faint cone of light under the shade; it sways with the lamp
  const haze = new T.Mesh(new T.CylinderGeometry(0.1, 1.9, 2.6, 32, 1, true), new T.MeshBasicMaterial({map: rayTex, color: 0xffc77a, transparent: true, opacity: 0.05, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false}));
  haze.position.y = 3.05 - 1.3; lampGroup.add(haze);
  // dust motes drifting through the light (a few dozen alive at a time)
  fx.emit(4.5, Infinity, () => {
    const y = rand(TOP + 0.15, 2.9), rMax = (3.6 - y) * 0.85, r = Math.sqrt(Math.random()) * rMax, a = rand(0, Math.PI * 2);
    return {pos: V(Math.cos(a) * r, y, Math.sin(a) * r), vel: V(rand(-0.025, 0.025), rand(-0.012, 0.018), rand(-0.025, 0.025)),
      life: rand(6, 10), size: [rand(0.012, 0.02), rand(0.012, 0.02)], color: 0xffe2a8, alpha: rand(0.35, 0.6), cell: 'glow', fadeIn: 0.3};
  });
  // ashtray with a cigarette left burning
  const ASH = V(-0.78, TOP, 0.5);
  const ashtray = new T.Group(); ashtray.position.copy(ASH); ashtray.rotation.y = 0.6; scene.add(ashtray);
  const tray = new T.Mesh(new T.CylinderGeometry(0.11, 0.12, 0.035, 20), std(0x3a3f3a, 0.25, 0.3)); tray.position.y = 0.0175;
  const bowl = new T.Mesh(new T.CircleGeometry(0.085, 20), std(0x1a1816, 0.9)); bowl.rotation.x = -Math.PI / 2; bowl.position.y = 0.036;
  const butt = new T.Mesh(new T.CylinderGeometry(0.009, 0.009, 0.05, 8), std(0xd9c9a0, 0.8)); butt.rotation.z = Math.PI / 2; butt.position.set(0.05, 0.03, 0.03);
  const cig = new T.Group(); cig.position.set(0.1, 0.042, 0); cig.rotation.z = -0.12; ashtray.add(tray, bowl, butt, cig);
  const paper = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 0.1, 8), std(0xf1ece0, 0.8)); paper.rotation.z = Math.PI / 2; paper.position.x = 0.03;
  const filter = new T.Mesh(new T.CylinderGeometry(0.0085, 0.0085, 0.03, 8), std(0xc9894a, 0.8)); filter.rotation.z = Math.PI / 2; filter.position.x = 0.095;
  const ember = new T.Mesh(new T.SphereGeometry(0.009, 8, 6), new T.MeshBasicMaterial({color: 0xff6a20})); ember.position.x = -0.022;
  cig.add(paper, filter, ember);
  ashtray.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const emberPos = () => ember.getWorldPosition(V());
  // a thin, curling ribbon of smoke
  fx.emit(5, Infinity, () => {
    const t = now(), p = emberPos();
    return {pos: p.add(V(Math.sin(t * 1.3) * 0.01, 0.005, Math.cos(t * 0.9) * 0.01)),
      vel: V(Math.sin(t * 0.7) * 0.03 + rand(-0.01, 0.01), rand(0.13, 0.19), Math.cos(t * 0.5) * 0.03 + rand(-0.01, 0.01)),
      life: rand(3.2, 4.8), size: [0.02, rand(0.16, 0.26)], color: 0xb8b0a6, alpha: 0.16, cell: 'smoke', drag: 0.25, grav: -0.02, spin: rand(-0.8, 0.8), add: false, fadeIn: 0.12};
  });
  // a drink in front of each player: glass, amber whisky, an ice cube; rattles on bangs and slams, spills when they're out
  const glassMat = new T.MeshStandardMaterial({color: 0xcfe3e8, transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false});
  const whisky = new T.MeshStandardMaterial({color: 0xb5651d, transparent: true, opacity: 0.85, roughness: 0.2, emissive: 0x3a1a05});
  const iceMat = new T.MeshStandardMaterial({color: 0xe8f4f8, transparent: true, opacity: 0.65, roughness: 0.15});
  const spillMat = new T.MeshBasicMaterial({color: 0x2a1406, transparent: true, opacity: 0.55, depthWrite: false});
  let glasses = [];
  function makeGlass() {
    const g = new T.Group();
    const cup = new T.Mesh(new T.CylinderGeometry(0.05, 0.043, 0.1, 16, 1, true), glassMat); cup.position.y = 0.05;
    const base = new T.Mesh(new T.CylinderGeometry(0.043, 0.043, 0.012, 16), glassMat); base.position.y = 0.006;
    const drink = new T.Mesh(new T.CylinderGeometry(0.045, 0.042, 0.045, 16), whisky); drink.position.y = 0.035;
    const ice = new T.Mesh(new T.BoxGeometry(0.03, 0.03, 0.03), iceMat); ice.position.set(0.01, 0.06, 0); ice.rotation.set(0.4, 0.6, 0.2);
    cup.renderOrder = base.renderOrder = 1;
    g.add(drink, ice, cup, base);
    return g;
  }
  function setGlasses() {
    for (const gl of glasses) { scene.remove(gl.g); if (gl.spill) scene.remove(gl.spill); }
    glasses = seats.map((s, i) => {
      const {out, side} = seatBasis(i), g = makeGlass();
      g.position.copy(out.clone().multiplyScalar(CARD_R + 0.15).addScaledVector(side, -0.68)).setY(TOP);
      scene.add(g);
      return {g, base: g.position.clone(), jitter: 0, tipped: false, spill: null, i};
    });
  }
  const rattle_ = (i, amt) => { for (const gl of glasses) if (i == null || gl.i === i) gl.jitter = Math.max(gl.jitter, amt); };
  function tipGlass(i) {
    const gl = glasses[i]; if (!gl || gl.tipped) return;
    gl.tipped = true;
    const {out} = seatBasis(i), dir = out.clone().multiplyScalar(-1); // falls toward the table centre
    const axis = V(0, 1, 0).cross(dir).normalize();
    const q0 = gl.g.quaternion.clone(), q1 = new T.Quaternion().setFromAxisAngle(axis, Math.PI / 2);
    const p0 = gl.base.clone(), p1 = gl.base.clone().addScaledVector(dir, 0.05).setY(TOP + 0.045);
    tw(0.45, (e, p) => { gl.g.quaternion.copy(q0).slerp(q1, fx.ease.bounce(p)); gl.g.position.lerpVectors(p0, p1, fx.ease.out(p)); }, {ease: fx.ease.linear, delay: 0.35});
    // a puddle spreads out from the rim
    const spill = new T.Mesh(new T.CircleGeometry(0.12, 20), spillMat); spill.rotation.x = -Math.PI / 2;
    spill.position.copy(gl.base).addScaledVector(dir, 0.16).setY(TOP + 0.003); spill.scale.setScalar(0.01); scene.add(spill); gl.spill = spill;
    tw(1.6, p => spill.scale.set(0.4 + p * 0.9, 0.3 + p * 0.6, 1), {delay: 0.6, ease: fx.ease.out});
  }
  function stepGlasses(t, dt) {
    for (const gl of glasses) {
      if (gl.tipped || gl.jitter <= 0) continue;
      gl.jitter = Math.max(0, gl.jitter - dt * 2.2);
      const j = gl.jitter * gl.jitter;
      gl.g.position.set(gl.base.x + Math.sin(t * 71 + gl.i) * 0.006 * j, gl.base.y + Math.abs(Math.sin(t * 53)) * 0.008 * j, gl.base.z + Math.cos(t * 67) * 0.006 * j);
      gl.g.rotation.set(Math.sin(t * 59) * 0.08 * j, 0, Math.cos(t * 61) * 0.08 * j);
    }
  }
  // neon sign over the back shelf; it buzzes and drops out now and then
  const neonTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 192;
    const g = cv.getContext('2d');
    g.font = 'italic 900 150px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    for (const [w, c, blur] of [[18, 'rgba(255,60,80,.35)', 30], [9, 'rgba(255,90,110,.8)', 12], [3.5, '#ffe6ea', 0]]) {
      g.shadowColor = 'rgba(255,40,70,.9)'; g.shadowBlur = blur; g.lineWidth = w; g.strokeStyle = c; g.strokeText('BAR', 256, 100);
    }
    return new T.CanvasTexture(cv);
  })();
  const neon = new T.Mesh(new T.PlaneGeometry(1.5, 0.56), new T.MeshBasicMaterial({map: neonTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false}));
  // inside the round wall (radius 7), turned to face the room
  neon.position.set(1.3, 2.85, -6.55); neon.lookAt(0, 2.85, 0); scene.add(neon);
  const neonGlow = new T.PointLight(0xff3050, 0.6, 3.5); neonGlow.position.set(1.2, 2.8, -6.1); scene.add(neonGlow);
  let neonOut = 0, nextNeon = rand(8, 20);
  // a moth circling the bulb
  const moth = new T.Group(), wingMat = new T.MeshBasicMaterial({color: 0x3a3026, side: T.DoubleSide});
  const wings = [-1, 1].map(s => { const w = new T.Mesh(new T.PlaneGeometry(0.035, 0.025), wingMat); w.position.x = s * 0.018; const p = new T.Group(); p.add(w); p.userData.s = s; moth.add(p); return p; });
  scene.add(moth);
  // the bulb stutters every half minute or so
  let nextFlicker = rand(15, 30), onFlicker = null;
  function stepAmbience(t, dt) {
    stepGlasses(t, dt);
    ember.material.color.setRGB(1, 0.35 + 0.15 * Math.sin(t * 2.1) + Math.random() * 0.05, 0.1);
    haze.material.opacity = 0.05 * (lamp.intensity / 2.4);
    bulb.material.color.setScalar(Math.min(1, lamp.intensity / 2.4)).multiply(BULB);
    if (t > nextFlicker) { nextFlicker = t + rand(20, 45); flickerUntil = t + rand(0.25, 0.5); if (onFlicker && dt) onFlicker(); }
    if (t > nextNeon) { nextNeon = t + rand(10, 25); neonOut = t + rand(0.15, 0.6); }
    const on = t < neonOut ? Math.random() < 0.3 : 1;
    neon.material.opacity = on ? 0.95 + Math.sin(t * 120) * 0.05 : 0.08;
    neonGlow.intensity = on ? 0.6 : 0.02;
    // moth: a wobbly orbit around the bulb, wings flapping
    const bp = bulb.getWorldPosition(V()), a = t * 2.3;
    moth.position.set(bp.x + Math.cos(a) * 0.22 + Math.sin(t * 7.1) * 0.03, bp.y - 0.05 + Math.sin(t * 3.7) * 0.08, bp.z + Math.sin(a) * 0.22 + Math.cos(t * 6.3) * 0.03);
    moth.rotation.y = -a;
    for (const w of wings) w.rotation.y = w.userData.s * (0.3 + Math.abs(Math.sin(t * 38)) * 1.1);
  }
  const BULB = new T.Color(0xffe2a8);

  function seatAngle(i, n) { return Math.PI / 2 + i * 2 * Math.PI / n; }
  function polar(r, ang, y) { return new T.Vector3(Math.cos(ang) * r, y, Math.sin(ang) * r); }

  function setup(ps) {
    for (const s of seats) scene.remove(s.group);
    for (const d of dyn.values()) scene.remove(d.obj);
    for (const d of leaving) scene.remove(d.obj);
    dyn.clear(); leaving.clear(); lastDealKey = null; wasShowdown = false; cupRattle = null;
    labelLayer.innerHTML = '';
    snap = true; boardView = false; lastState = null; // the old game's state doesn't fit the new seats
    seats = ps.map((p, i) => {
      const ang = seatAngle(i, ps.length);
      const group = makeAnimal(p.animal);
      group.position.copy(polar(SEAT_R, ang, 0));
      group.lookAt(0, 0, 0); group.rotateY(Math.PI);
      scene.add(group);
      const label = document.createElement('div');
      label.className = 'label3d';
      labelLayer.appendChild(label);
      return {group, ang, label, face: newFaceState()};
    });
    setGlasses();
  }

  function seatBasis(i) {
    const ang = seats[i].ang;
    return {ang, out: new T.Vector3(Math.cos(ang), 0, Math.sin(ang)), side: new T.Vector3(-Math.sin(ang), 0, Math.cos(ang))};
  }
  const flatQ = (yaw, faceUp) => new T.Quaternion().setFromEuler(new T.Euler(faceUp ? 0 : Math.PI, yaw, 0, 'YXZ'));
  const headPos = i => seats[i].group.userData.head.getWorldPosition(new T.Vector3());

  /* ----- Liar's Deck: hands, the face-down pile, the last play (revealed on a Liar call) ----- */
  /* ----- dealing: shuffle, then cards leave the deck in seat order (DEAL keeps audio in step) ----- */
  const DECK_Q = flatQ(0.3, false), SLAM = 0.34;
  let lastDealKey = null, dealStart = 0, cupRattle = null, wasShowdown = false, revealCount = 0, revealRanks = new Map();
  function makeDeck() { const g = new T.Group(); for (let i = 0; i < 6; i++) { const c = makeCard(); c.position.y = i * 0.006; g.add(c); } return g; }
  const untilDeal = () => Math.max(0, dealStart - now());
  // dice: the cup rattles as long as the 'dice' sound does, then slams
  const rattle = S => (6 + Math.min(4, S.players.filter(p => p.alive).length) * 2) * 0.045 + 0.08;
  function newDeal(S) {
    if (S.mode === 'dice') {
      // cups pick this up in diceSeat (on the first round they don't exist yet)
      dealStart = now(); cupRattle = {round: S.round, t0: now(), dur: rattle(S)};
      return;
    }
    dealStart = now() + DEAL.shuffle;
    const deck = dyn.get('deck');
    if (deck && !root.__instant) riffle(deck.obj);
  }
  // riffle: the deck splits in two halves that spring apart and interleave back
  function riffle(g) {
    tw(DEAL.shuffle - 0.05, (e, p) => {
      const split = Math.sin(Math.PI * Math.min(1, p / 0.8));
      g.children.forEach((c, j) => {
        const half = j % 2 ? 1 : -1;
        c.position.x = half * 0.17 * split;
        c.position.y = j * 0.006 + (half > 0 ? 0.03 : 0) * split + (p > 0.8 ? Math.sin(Math.PI * (p - 0.8) / 0.2) * 0.01 : 0);
        c.rotation.y = half * 0.18 * split;
        c.rotation.z = -half * 0.12 * split;
      });
    }, {ease: fx.ease.linear});
  }
  // seats in dealing order: left of the dealer first, only those holding cards / dice
  function dealSeats(S) {
    const n = S.players.length, d = S.dealer != null && S.dealer >= 0 ? S.dealer : (S.starter != null ? S.starter - 1 : -1), out = [];
    for (let k = 1; k <= n; k++) { const i = (((d + k) % n) + n) % n, p = S.players[i]; if ((p.hole && p.hole.length) || (p.hand && p.hand.length) || (p.dice && p.dice.length)) out.push(i); }
    return out;
  }
  function dealFlight(S, i, k) {
    const order = dealSeats(S), r = Math.max(0, order.indexOf(i));
    const gap = DEAL.gap[S.mode] || DEAL.gap.poker;
    return {delay: untilDeal() + (k * order.length + r) * gap, dur: 0.42, arc: 0.18, spin: 1};
  }
  // showdown / Liar reveal: players turn their cards (or lift cups) one after another
  function revealOrder(S) {
    revealRanks = new Map();
    dealSeats(S).forEach(i => { const p = S.players[i]; if (p.alive && !p.folded) revealRanks.set(i, revealRanks.size); });
    revealCount = revealRanks.size;
  }
  const revealRank = (S, i) => revealRanks.get(i) || 0;
  // a puff of dust off the felt
  function dust(pos, n, r) {
    fx.burst(n, (j, m) => {
      const a = j / m * Math.PI * 2 + Math.random() * 0.5, d = V(Math.cos(a), 0, Math.sin(a));
      return {pos: pos.clone().addScaledVector(d, r * 0.5).setY(TOP + 0.02), vel: d.multiplyScalar(rand(0.25, 0.5)).add(V(0, rand(0.05, 0.15), 0)),
        life: rand(0.5, 0.8), size: [0.03, rand(0.08, 0.13)], color: 0x9c8a6a, alpha: 0.35, cell: 'smoke', drag: 4, add: false, fadeIn: 0.05};
    });
  }
  function winnerSparks() {
    for (const d of dyn.values()) if (d.glow) fx.burst(10, () => ({pos: d.obj.position.clone().add(V(rand(-0.12, 0.12), 0.03, rand(-0.18, 0.18))),
      vel: V(rand(-0.15, 0.15), rand(0.4, 0.8), rand(-0.15, 0.15)), life: rand(0.6, 1.1), size: [rand(0.025, 0.04), 0.01], color: 0xffe08a, cell: 'spark', grav: 0.6, drag: 1.5}));
  }
  const GOLD = new T.Color(0xffc860), WHITE = new T.Color(0xffffff);
  function cardGlow(d, t) {
    const m = d.obj.userData.face, on = !!d.glow;
    if (!on && !d.glowing) return;
    d.glowing = on || m.emissive.r + m.emissive.g + m.emissive.b < 2.99; // keep easing back to white
    m.emissive.lerp(on ? GOLD : WHITE, 0.15);
    m.emissiveIntensity = on ? 0.3 + 0.25 * (0.5 + 0.5 * Math.sin(t * 5)) : 0.22;
  }
  // cup: rattle in place (hops and tilts), then slam down with a squash and a puff of dust
  function cupShake(d, t) {
    const sh = d.shake, p = (t - sh.t0) / sh.dur, o = d.obj;
    if (p >= 1) {
      d.shake = null; o.quaternion.copy(d.quat);
      dust(d.pos, 8, 0.38);
      tw(0.18, q => { o.scale.set(1 + 0.12 * (1 - q), 1 - 0.2 * (1 - q), 1 + 0.12 * (1 - q)); }, {ease: fx.ease.out});
      return;
    }
    o.position.copy(d.pos); o.position.y += Math.abs(Math.sin(t * 34 + sh.t0)) * 0.035;
    o.quaternion.copy(d.quat).multiply(SPIN_Q.setFromEuler(new T.Euler(Math.sin(t * 29) * 0.22, 0, Math.cos(t * 23) * 0.22)));
  }

  const deckKey = (S, c) => `L${S.round}-${c.id}`;
  function deckSeat(S, p, i, viewer, out, side, yaw) {
    const n = p.hand.length;
    p.hand.forEach((c, k) => {
      let pos, quat;
      if (i === viewer) {
        pos = out.clone().multiplyScalar(CARD_R - 0.05).add(side.clone().multiplyScalar(((n - 1) / 2 - k) * 0.24)).setY(TOP + 0.05 + (picked.has(c.id) ? 0.07 : 0));
        quat = flatQ(yaw + Math.PI, true).multiply(new T.Quaternion().setFromAxisAngle(X, 0.35));
        if (picked.has(c.id)) pos.add(out.clone().multiplyScalar(-0.08));
      } else {
        pos = out.clone().multiplyScalar(CARD_R).add(side.clone().multiplyScalar((k - (n - 1) / 2) * 0.2)).setY(TOP + 0.004 + k * 0.004);
        quat = flatQ(yaw + Math.PI, false);
      }
      setFace(want(deckKey(S, c), makeCard, pos, quat, {from: DECK_POS, fromQ: DECK_Q, enter: dealFlight(S, i, k)}), c);
    });
  }
  function deckCenter(S, viewer) {
    S.pile.forEach((c, k) => {
      const pos = new T.Vector3(Math.sin(c.id * 2.3) * 0.05, TOP + 0.004 + k * 0.004, Math.cos(c.id * 1.7) * 0.05);
      setFace(want(deckKey(S, c), makeCard, pos, flatQ(c.id * 0.9, false)), {hidden: true});
    });
    if (S.last && seats[S.last.pid]) {
      const {out, side, ang} = seatBasis(S.last.pid);
      const face = viewer != null ? -seatBasis(viewer).ang - Math.PI / 2 + Math.PI : 0;
      S.last.cards.forEach((c, k) => {
        const pos = out.clone().multiplyScalar(0.5).add(side.clone().multiplyScalar((k - (S.last.cards.length - 1) / 2) * 0.3)).setY(TOP + 0.08 + k * 0.004);
        const move = S.reveal ? {arc: 0.25, dur: 0.55, delay: 0.1 + k * 0.28} : {arc: 0.28, dur: SLAM, land: 'slam', onLand: o => dust(o.position, 7, 0.14)};
        setFace(want(deckKey(S, c), makeCard, pos, flatQ(S.reveal ? face : -ang - Math.PI / 2, S.reveal), {move}), S.reveal ? c : {hidden: true});
      });
    }
  }
  /* ----- Liar's Dice: five dice per seat, under a cup unless they are yours or revealed ----- */
  const DICE_SPOTS = [[-0.09, -0.05], [0, -0.06], [0.09, -0.05], [-0.045, 0.05], [0.05, 0.05]];
  function diceSeat(S, p, i, viewer, out, side, yaw) {
    if (!p.alive && !p.dice.length) return;
    const centre = out.clone().multiplyScalar(CARD_R - 0.15);
    p.dice.forEach((v, k) => {
      const [sx, ox] = DICE_SPOTS[k];
      const pos = centre.clone().add(side.clone().multiplyScalar(sx)).add(out.clone().multiplyScalar(ox)).setY(TOP + DIE / 2);
      want(`D${S.round}-${i}-${k}`, makeDie, pos, dieQ(v || 1, yaw + k * 0.4), {from: centre.clone().setY(TOP + 0.14), speed: 7,
        enter: {delay: untilDeal() + rattle(S) - 0.1 + k * 0.03, dur: 0.42, arc: 0.06, tumble: 1 + Math.random(), land: 'bounce', hidden: true}});
    });
    const covered = i !== viewer && !S.reveal && p.alive;
    const cupPos = covered ? centre.clone().setY(TOP + 0.11) : centre.clone().add(side.clone().multiplyScalar(-0.38)).add(out.clone().multiplyScalar(0.12)).setY(TOP + 0.11);
    want(`cup-${i}`, makeCup, cupPos, new T.Quaternion(), {from: centre.clone().setY(TOP + 0.11), speed: 6, move: {arc: 0.32, dur: 0.55, delay: revealRank(S, i) * 0.12}});
    const cup = dyn.get(`cup-${i}`);
    if (cupRattle && cupRattle.round === S.round && cup.rattled !== S.round && p.alive) { cup.rattled = S.round; cup.flight = null; cup.shake = {t0: cupRattle.t0, dur: cupRattle.dur}; }
  }

  function update(S, viewer, hideViewerCards) {
    lastState = S; viewerSeat = viewer; lastHide = hideViewerCards;
    for (const d of dyn.values()) d.seen = false;

    if (viewer != null && !seats[viewer]) viewer = null;
    if (viewer != null) {
      const {out} = seatBasis(viewer);
      if (boardView) { camPos = out.clone().multiplyScalar(0.75).setY(2.75); camLook = new T.Vector3(0, TOP, 0); }
      else { camPos = out.clone().multiplyScalar(SEAT_R + 0.2).setY(EYE_H + 0.05); camLook = out.clone().multiplyScalar(-0.6).setY(TOP); }
    } else if (boardView) { camPos = new T.Vector3(0, 2.75, 0.75); camLook = new T.Vector3(0, TOP, 0); }
    else { camPos = new T.Vector3(0, 4.4, 3.6); camLook = new T.Vector3(0, TOP, 0); }

    if (S.mode !== 'dice') want('deck', makeDeck, DECK_POS.clone(), DECK_Q);
    // a new hand or round: shuffle, then deal in seat order starting left of the dealer
    const dealKey = (S.mode || 'poker') + (S.mode === 'deck' || S.mode === 'dice' ? S.round : S.handNo);
    if (dealKey !== lastDealKey) { lastDealKey = dealKey; newDeal(S); }
    revealCount = 0; revealOrder(S);

    S.players.forEach((p, i) => {
      const seat = seats[i]; if (!seat) return;
      const {ang, out, side} = seatBasis(i);
      seat.group.visible = i !== viewer;
      seat.face.dead = !p.alive;
      seat.face.fear = !!(S.gun && S.gun.pid === i && (S.gun.state === 'aim' || S.gun.state === 'load'));
      seat.face.confident = p.alive && !p.folded && p.bet >= 3;
      const yaw = -ang - Math.PI / 2;
      if (S.mode === 'deck') return deckSeat(S, p, i, viewer, out, side, yaw);
      if (S.mode === 'dice') return diceSeat(S, p, i, viewer, out, side, yaw);

      p.hole.forEach((c, k) => {
        const mine = i === viewer && !hideViewerCards;
        const reveal = S.showdown && !p.folded && p.alive;
        let pos, quat;
        if (mine) {
          pos = out.clone().multiplyScalar(CARD_R - 0.05).add(side.clone().multiplyScalar((0.5 - k) * 0.32)).setY(TOP + 0.05);
          quat = flatQ(yaw + Math.PI, true).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), 0.35));
        } else {
          pos = out.clone().multiplyScalar(CARD_R).add(side.clone().multiplyScalar((k - 0.5) * 0.32)).setY(TOP + 0.004 + k * 0.004);
          quat = flatQ(yaw + Math.PI, reveal);
        }
        if (p.folded) { pos = out.clone().multiplyScalar(CARD_R - 0.25).add(side.clone().multiplyScalar((k - 0.5) * 0.2)).setY(TOP + 0.004 + k * 0.004); quat = flatQ(yaw + 0.4, false); }
        // keyed by hand + seat + slot so hidden cards (online) keep their mesh when revealed
        const move = p.folded ? {arc: 0.3, dur: 0.45, spin: 0.6} : {arc: 0.16, dur: 0.5, delay: revealRank(S, i) * 0.22};
        setFace(want(`h${S.handNo}-${i}-${k}`, makeCard, pos, quat, {from: DECK_POS, fromQ: DECK_Q, enter: dealFlight(S, i, k), move}), c);
        dyn.get(`h${S.handNo}-${i}-${k}`).glow = !!(S.showdown && S.winners && S.winners.includes(i));
      });

      const inGun = S.gun && S.gun.pid === i ? (S.gun.state === 'load' ? S.gun.loaded : S.gun.bullets) : 0;
      let added = 0;
      for (let b = inGun; b < p.bet; b++) {
        const pos = out.clone().multiplyScalar(CARD_R - 0.42).add(side.clone().multiplyScalar(0.36 + (b % 3) * 0.07)).setY(TOP);
        pos.add(out.clone().multiplyScalar(-Math.floor(b / 3) * 0.07));
        const from = out.clone().multiplyScalar(CARD_R + 0.05).add(side.clone().multiplyScalar(0.4)).setY(TOP + 0.3);
        const delay = dyn.has(`b${i}-${b}`) ? 0 : added++ * 0.09; // in step with the clinks in audio.js
        want(`b${i}-${b}`, makeBullet, pos, new T.Quaternion(), {from, enter: {delay, dur: 0.42, arc: 0.1, land: 'bounce'}});
      }
    });

    if (S.mode === 'deck') deckCenter(S, viewer);
    if (!S.mode || S.mode === 'poker') {
      // flop cards leave the deck one after another (0.16 s apart, like the 'board' sound) and flip in the air
      const known = S.board.filter(c => dyn.has('c' + c.id)).length;
      // the row runs across your line of sight, whichever seat you are in (every client lays out its own view)
      const across = viewer != null ? seatBasis(viewer).side : new T.Vector3(1, 0, 0);
      S.board.forEach((c, k) => {
        const pos = across.clone().multiplyScalar((2 - k) * 0.33).setY(TOP + 0.004);
        const quat = viewer != null ? flatQ(-seatBasis(viewer).ang - Math.PI / 2 + Math.PI, true) : flatQ(0, true);
        setFace(want('c' + c.id, makeCard, pos, quat, {from: DECK_POS, fromQ: DECK_Q, enter: {delay: Math.max(0, k - known) * 0.16, dur: 0.5, arc: 0.3}}), c);
      });
    }
    if (S.showdown && S.winners && !wasShowdown) fx.after(0.4 + revealCount * 0.22 + 0.5, () => winnerSparks());
    wasShowdown = !!S.showdown;

    if (S.gun && S.gun.state === 'load') {
      const i = S.gun.pid, {out} = seatBasis(i);
      const eye = viewer != null ? camPos.clone() : camera.position.clone();
      gunTarget.pos = i === viewer
        ? camPos.clone().add(out.clone().multiplyScalar(-0.55)).setY(EYE_H - 0.12)
        : out.clone().multiplyScalar(SEAT_R - 0.75).setY(1.3);
      const away = gunTarget.pos.clone().sub(eye).normalize();
      const m = new T.Matrix4().lookAt(gunTarget.pos, gunTarget.pos.clone().add(away), new T.Vector3(0, 1, 0));
      gunTarget.quat = new T.Quaternion().setFromRotationMatrix(m).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 2)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), 0.45));
    } else if (S.gun) {
      const i = S.gun.pid, {out, side} = seatBasis(i);
      gun.userData.rounds.forEach((r, c) => { if (c < S.gun.bullets) r.visible = true; });
      // the muzzle rests against the temple (the barrel is 0.46 long, the head 0.27 wide)
      // your own gun sits at the edge of view, barrel angled back toward your temple, so you see its side and hammer
      if (i === viewer) gunTarget.pos = camPos.clone().add(side.clone().multiplyScalar(0.42)).add(out.clone().multiplyScalar(-0.62)).setY(EYE_H - 0.14);
      else gunTarget.pos = headPos(i).add(side.clone().multiplyScalar(0.7)).add(out.clone().multiplyScalar(0.12)).setY(headPos(i).y + 0.17);
      // aim at the temple: above the eyes and a little behind them
      const tgt = i === viewer ? camPos.clone().add(out.clone().multiplyScalar(0.4)).add(side.clone().multiplyScalar(0.06)).setY(EYE_H + 0.06) : headPos(i).add(out.clone().multiplyScalar(0.1)).add(new T.Vector3(0, 0.15, 0));
      const m = new T.Matrix4().lookAt(gunTarget.pos, tgt, new T.Vector3(0, 1, 0));
      gunTarget.quat = new T.Quaternion().setFromRotationMatrix(m).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 2));
    } else {
      // resting on a diagonal, clear of the board whichever way it runs (across x or across z)
      gunTarget.pos = new T.Vector3(0.55, TOP + 0.035, -0.55);
      gunTarget.quat = new T.Quaternion().setFromEuler(new T.Euler(Math.PI / 2, 0, 0.6));
    }
    // effects fire on phase changes, so they work whether the state object is reused (host) or new (guest)
    const phase = S.gun ? S.gun.state : null, gpid = S.gun ? S.gun.pid : null;
    if (phase !== ga.phase || gpid !== ga.pid) { const from = ga.phase; ga.phase = phase; ga.pid = gpid; gunEnter(S, phase, from); }
    if (S.gun && S.gun.state === 'load') {
      const i = S.gun.pid, {out} = seatBasis(i);
      // send each newly loaded round flying from the table into its chamber
      for (let b = 0; b < S.gun.loaded; b++) {
        if (ga.flown.has(b)) continue;
        ga.flown.add(b);
        const src = dyn.get(`b${i}-${b}`);
        const from = src ? src.obj.position.clone() : out.clone().multiplyScalar(CARD_R - 0.42).setY(TOP);
        const mesh = makeBullet(); mesh.position.copy(from); scene.add(mesh);
        flyers.push({mesh, from, t0: now(), dur: 0.38, idx: b});
      }
    }

    // shot cam: push in on whoever holds the gun and narrow the lens; your own gun narrows it a little
    fovMul = 1; fallOn = false;
    if (S.gun && seats[S.gun.pid]) {
      const i = S.gun.pid, st = S.gun.state;
      if (i === viewer) { fovMul = st === 'aim' ? 0.86 : 0.93; fallOn = st === 'bang'; }
      else if (!fx.reduced) {
        const H = headPos(i);
        const base = viewer != null ? seatBasis(viewer).out.multiplyScalar(SEAT_R + 0.2).setY(EYE_H + 0.05) : new T.Vector3(0, 4.4, 3.6);
        if (st === 'load') { camPos = base.lerp(H, 0.1); camLook = new T.Vector3(0, TOP, 0).lerp(gunTarget.pos, 0.75); fovMul = 0.88; }
        else {
          // from in front of the shooter (over the table), a little toward the gun, so every seat sees the face and the gun
          // (pushing in from your own seat only shows a neighbour's back)
          const {out: so, side: ss} = seatBasis(i);
          camPos = H.clone().addScaledVector(so, -1.6).addScaledVector(ss, 0.32).setY(H.y + 0.1);
          camLook = H.clone().addScaledVector(ss, 0.12).add(new T.Vector3(0, -0.04, 0));
          fovMul = st === 'aim' ? 0.66 : st === 'bang' ? 0.62 : 0.72;
        }
      }
    }

    let gi = 0;
    for (const [k, d] of dyn) {
      if (d.seen) continue;
      dyn.delete(k);
      if (d.obj.userData.face && !root.__instant) gather(d, gi++); else scene.remove(d.obj);
    }
    if (snap) { snap = false; camBase.copy(camPos); camera.position.copy(camPos); curLook.copy(camLook); gun.position.copy(gunTarget.pos); gun.quaternion.copy(gunTarget.quat); }
  }

  /* ----- gun phases ----- */
  // Timings follow game.js / liars.js shoot(): load 0.7 s + 0.42 s per round, aim 2.1–2.3 s,
  // result 2 s (3.2 s God Save). The spin and hammer match the 'spin' sound in audio.js.
  function gunEnter(S, phase, from) {
    const U = gun.userData;
    if (ga.sweat) { ga.sweat.stop(); ga.sweat = null; }
    if (phase === 'load') {
      ga.flown.clear(); U.rounds.forEach(r => r.visible = false); U.cyl.rotation.x = 0;
      ga.drop = null; ga.kick = 0; ga.cock = 0;
      tw(0.35, p => ga.open = p, {ease: fx.ease.back, delay: 0.25}); // swing the cylinder out
    }
    if (phase === 'aim') {
      if (from !== 'load') { ga.drop = null; ga.kick = 0; U.cyl.rotation.x = 0; } // Liar modes skip loading
      const o0 = ga.open; tw(0.12, p => ga.open = o0 * (1 - p), {ease: fx.ease.in}); // snap it shut
      // spin: fast, slowing, landing exactly on a chamber; then the hammer cocks
      ga.aimT0 = now() + 0.1; ga.spinFrom = U.cyl.rotation.x;
      ga.spinTo = ga.spinFrom - Math.PI / 3 * (14 + Math.floor(Math.random() * 6));
      fx.after(1.45, () => { if (ga.phase === 'aim') tw(0.09, p => ga.cock = p, {ease: fx.ease.out}); });
      const pid = S.gun.pid;
      if (pid !== viewerSeat && seats[pid]) ga.sweat = fx.emit(2.4, 2.6, () => sweatDrop(pid, 0.55));
    }
    if (phase === 'click' || phase === 'bang' || phase === 'godsave') {
      // trigger, then the hammer falls
      ga.cock = Math.max(ga.cock, 1); ga.trig = 1;
      tw(0.035, p => ga.cock = 1 - p, {ease: fx.ease.in});
      tw(0.3, p => ga.trig = 1 - p, {delay: 0.3});
      if (phase === 'bang') fxBang(S.gun.pid); else if (phase === 'click') fxClick(S.gun.pid); else fxGod(S.gun.pid);
    }
    if (phase === null) {
      ga.drop = null; ga.kick = ga.cock = ga.trig = ga.open = 0;
      U.rounds.forEach(r => r.visible = false);
      flyers.forEach(f => scene.remove(f.mesh)); flyers.length = 0;
    }
  }

  function sweatDrop(i, power) {
    const off = V(rand(-1, 1), rand(0.2, 1), rand(-1, 0.3)).normalize().applyQuaternion(seats[i].group.userData.head.getWorldQuaternion(new T.Quaternion()));
    return {pos: headPos(i).addScaledVector(off, 0.25), vel: off.multiplyScalar(power * rand(0.6, 1.2)).add(V(0, power * 0.7, 0)),
      life: rand(0.6, 0.9), size: [0.045, 0.035], color: 0xcfe6ff, alpha: 0.9, cell: 'drop', rot: 0, grav: 4, add: false, fadeIn: 0.02};
  }

  function fxBang(i) {
    const t = now(), mp = muzzlePos(), dir = barrelDir(), self = i === viewerSeat;
    fx.hitStop(0.09, 0.28, 1.1);
    flashT = 1; shake = fx.reduced ? 0.3 : 1; flash.position.copy(mp);
    lampKick = 1; flickerUntil = t + 0.5;
    muzzle.position.copy(mp).addScaledVector(dir, 0.04); muzzle.material.rotation = Math.random() * 6.28;
    muzzle.scale.setScalar(self ? 0.3 : 0.6); muzzle.visible = true;
    fx.after(0.06, () => { muzzle.visible = false; });
    // sparks and a hot glow at the muzzle, then smoke that hangs and rises
    fx.burst(30, () => ({pos: mp, vel: dir.clone().multiplyScalar(rand(0.4, 2)).add(randDir().multiplyScalar(rand(1, 2.4))), life: rand(0.25, 0.6),
      size: [rand(0.03, 0.05), 0.01], color: Math.random() < 0.5 ? 0xffd27a : 0xff8a30, cell: 'spark', drag: 2.5, grav: 3, fadeIn: 0.01}));
    fx.burst(5, () => ({pos: mp.clone().add(randDir().multiplyScalar(0.05)), vel: randDir().multiplyScalar(0.3), life: rand(0.12, 0.22),
      size: [0.25, 0.45], color: 0xff9a40, alpha: 0.9, cell: 'glow', fadeIn: 0.01}));
    fx.burst(16, () => ({pos: mp.clone().add(randDir().multiplyScalar(0.04)), vel: randDir().multiplyScalar(rand(0.3, 0.9)).add(V(0, 0.25, 0)),
      life: rand(1.6, 3), size: [0.06, rand(0.3, 0.55)], color: 0x8a8580, alpha: rand(0.35, 0.6), cell: 'smoke', drag: 2.2, grav: -0.12, spin: rand(-0.6, 0.6), add: false, fadeIn: 0.02}));
    fx.emit(7, 2.4, () => ({pos: muzzlePos(), vel: V(rand(-0.03, 0.03), rand(0.15, 0.3), rand(-0.03, 0.03)), life: rand(1.4, 2.2),
      size: [0.03, rand(0.14, 0.24)], color: 0x9a948c, alpha: 0.3, cell: 'smoke', drag: 0.6, grav: -0.05, spin: rand(-0.5, 0.5), add: false}));
    // recoil, then the gun slips out of the hand and clatters onto the table
    tw(0.4, p => ga.kick = 1 - p, {ease: fx.ease.out});
    const {out, side, ang} = seatBasis(i);
    const to = out.clone().multiplyScalar(CARD_R - 0.3).addScaledVector(side, -0.3).setY(TOP + 0.035);
    const toQ = new T.Quaternion().setFromEuler(new T.Euler(Math.PI / 2, 0, -ang + 1.1));
    fx.after(0.45, () => {
      if (ga.phase !== 'bang') return;
      const from = gun.position.clone(), fromQ = gun.quaternion.clone();
      ga.drop = {pos: from.clone(), quat: fromQ.clone()};
      tw(0.6, (e, p) => {
        if (!ga.drop) return;
        ga.drop.pos.lerpVectors(from, to, fx.ease.out(p)); ga.drop.pos.y = from.y + (to.y - from.y) * fx.ease.bounce(p);
        ga.drop.quat.copy(fromQ).slerp(toQ, fx.ease.out(p));
      }, {ease: fx.ease.linear});
    });
    // the shooter's head snaps away from the gun; everyone else flinches
    const f = seats[i] && seats[i].face;
    if (f) {
      f.hitT = t;
      const ax = V(1, 0, 0).applyQuaternion(seats[i].group.userData.torso.getWorldQuaternion(new T.Quaternion()));
      f.hitSide = ax.dot(side) > 0 ? 1 : -1;
    }
    seats.forEach((s, j) => { if (j !== i) s.face.startle = t + 0.6 + Math.random() * 0.2; });
    rattle_(null, 1); tipGlass(i);
    fallOn = self;
  }

  function fxClick(i) {
    const t = now(), f = seats[i] && seats[i].face;
    shake = 0.15;
    if (f) { f.relief = t + 0.9; f.happyUntil = t + 1.6; }
    if (i === viewerSeat || !f) return;
    fx.burst(9, () => sweatDrop(i, 1.1));
    // a big exhale
    fx.after(0.7, () => {
      if (!seats[i]) return;
      const m = mouthPos(i), d = faceDir(i);
      fx.burst(6, () => ({pos: m.clone(), vel: d.clone().multiplyScalar(rand(0.35, 0.6)).add(randDir().multiplyScalar(0.08)).add(V(0, -0.08, 0)), life: rand(0.9, 1.3),
        size: [0.04, rand(0.18, 0.26)], color: 0xe2ddd2, alpha: 0.28, cell: 'smoke', drag: 2.2, grav: -0.06, spin: rand(-1, 1), add: false}));
    });
  }

  function fxGod(i) {
    const t = now(), f = seats[i] && seats[i].face; if (!f) return;
    shake = 0.3; godT = 1;
    f.relief = t + 1.2; f.happyUntil = t + 3.2;
    const H = headPos(i), self = i === viewerSeat;
    godLight.position.copy(H).add(V(0, 0.9, 0));
    halo.position.copy(H).add(V(0, 0.42, 0)); halo.visible = !self;
    godRay.position.copy(H).add(V(0, 1.05, 0)); godRay.visible = !self;
    // gold dust drifting down through the light
    fx.emit(24, 2.8, () => ({pos: H.clone().add(V(rand(-0.4, 0.4), rand(0.8, 1.5), rand(-0.4, 0.4))), vel: V(rand(-0.05, 0.05), rand(-0.35, -0.15), rand(-0.05, 0.05)),
      life: rand(1.6, 2.6), size: [rand(0.025, 0.045), 0.01], color: Math.random() < 0.5 ? 0xffe08a : 0xfff4c8, cell: 'spark', spin: rand(-2, 2), fadeIn: 0.2}));
  }

  // expressions triggered by game events
  function react(pid, kind) {
    const s = seats[pid]; if (!s) return;
    const t = now();
    if (kind === 'talk') s.face.talkUntil = t + 0.7;
    if (GESTURE[kind]) s.face.gesture = {kind, t0: t};
    if (kind === 'slam') rattle_(null, 0.8); else if (kind === 'knock') rattle_(pid, 0.5);
    if (kind === 'happy') s.face.happyUntil = t + 2.2;
  }

  // floating name tags
  const escapeHTML = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  function updateLabels() {
    const S = lastState; if (!S) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    S.players.forEach((p, i) => {
      const seat = seats[i]; if (!seat) return;
      const el = seat.label;
      if (i === viewerSeat || boardView) { el.hidden = true; return; }
      const v = headPos(i).add(new T.Vector3(0, 0.6, 0)).project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.2) { el.hidden = true; return; }
      el.hidden = false;
      el.style.transform = `translate(-50%,-100%) translate(${(v.x * 0.5 + 0.5) * w}px,${(-v.y * 0.5 + 0.5) * h}px)`;
      const turn = S.toAct === p.id && !S.gun;
      const won = S.winners && S.winners.includes(p.id);
      el.className = 'label3d' + (turn ? ' turn' : '') + (!p.alive ? ' dead' : '') + (won ? ' won' : '');
      const status = !p.alive ? 'Out' : turn ? 'Thinking...' : p.lastAction;
      // poker: bullets loaded; liar modes: trigger pulls used (×) of 6
      const pips = S.mode === 'deck' || S.mode === 'dice'
        ? `<span class="bul" title="Trigger pulls">${'×'.repeat(p.shots)}<span class="emp">${'○'.repeat(Math.max(0, 6 - p.shots))}</span></span>`
        : `<span class="bul">${'●'.repeat(p.bet)}<span class="emp">${'○'.repeat(Math.max(0, 6 - p.bet))}</span></span>`;
      const extra = S.mode === 'deck' && p.alive && !turn && !p.lastAction ? `${p.hand.length} cards` : '';
      const html = `<b>${escapeHTML(p.name)}</b>${S.dealer === i ? '<i class="d">D</i>' : ''}${pips}<span class="st">${escapeHTML(status || extra)}</span>`;
      if (el._html !== html) { el.innerHTML = html; el._html = html; }
    });
  }

  // loop
  const clock = new T.Clock();
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    baseFov = w / h < 0.8 ? 74 : 60;
    camera.fov = baseFov * fovMul;
    camera.updateProjectionMatrix();
  }
  root.addEventListener('resize', resize);
  root.addEventListener('pointermove', e => { mouse.x = e.clientX / root.innerWidth - 0.5; mouse.y = e.clientY / root.innerHeight - 0.5; });

  function lookTargetFor(i) {
    const S = lastState; if (!S) return null;
    if (S.gun) return S.gun.pid === i ? gun.position.clone() : (S.gun.pid === viewerSeat ? camera.position.clone() : headPos(S.gun.pid));
    if (S.toAct != null && S.toAct !== i) return S.toAct === viewerSeat ? camera.position.clone() : headPos(S.toAct);
    if (S.showdown || S.reveal) return new T.Vector3(0, TOP, 0);
    return viewerSeat != null ? camera.position.clone() : new T.Vector3(0, TOP, 0);
  }

  // one frame; an exception is logged once and the loop carries on (it used to stop rendering for good)
  let frameErr = false, frameMs = 0, paused = false;
  function frame() {
    requestAnimationFrame(frame);
    if (paused) { clock.getDelta(); return; } // e.g. under the full-screen character select
    const t0 = performance.now();
    try { step(); } catch (e) { if (!frameErr) { frameErr = true; console.error(e); } }
    frameMs += (performance.now() - t0 - frameMs) * 0.05;
  }
  function step() {
    const realDt = Math.min(0.05, clock.getDelta());
    const dt = fx.step(realDt, camera, renderer), t = now(); // dt is 0 during hit-stop, small in slow motion
    const k = d => root.__instant ? 1 : 1 - Math.exp(-dt * d);
    for (const d of dyn.values()) {
      if (d.flight) stepFlight(d, t);
      else { d.obj.position.lerp(d.pos, k(d.speed)); d.obj.quaternion.slerp(d.quat, k(d.speed)); }
      if (d.shake) cupShake(d, t);
      if (d.obj.userData.face) cardGlow(d, t);
    }
    for (const d of leaving) if (!d.flight || stepFlight(d, t)) { scene.remove(d.obj); leaving.delete(d); }
    // gun: placement, then its moving parts
    const U = gun.userData;
    if (ga.drop) { gun.position.copy(ga.drop.pos); gun.quaternion.copy(ga.drop.quat); }
    else { gun.position.lerp(gunTarget.pos, k(6)); gun.quaternion.slerp(gunTarget.quat, k(6)); }
    if (ga.phase === 'aim') {
      const p = Math.max(0, Math.min(1, (t - ga.aimT0) / 1.3));
      U.cyl.rotation.x = ga.spinFrom + (ga.spinTo - ga.spinFrom) * (1 - (1 - p) ** 3);
      // the hand shakes harder the longer it waits
      const amp = dt ? 0.002 + 0.006 * Math.min(1, Math.max(0, t - ga.aimT0) / 1.8) : 0;
      gun.position.x += rand(-amp, amp); gun.position.y += rand(-amp, amp); gun.position.z += rand(-amp, amp);
    }
    U.crane.rotation.x = ga.open * 1.25;
    U.hammer.rotation.z = HAMMER_REST + (HAMMER_COCKED - HAMMER_REST) * ga.cock;
    U.trigger.rotation.z = -ga.trig * 0.5;
    U.body.rotation.z = ga.kick * 0.9; U.body.position.x = -ga.kick * 0.07;
    for (let f = flyers.length - 1; f >= 0; f--) {
      const fl = flyers[f], p = Math.min(1, (t - fl.t0) / fl.dur), e = p * p * (3 - 2 * p);
      const to = U.rounds[fl.idx].getWorldPosition(new T.Vector3());
      fl.mesh.position.lerpVectors(fl.from, to, e); fl.mesh.position.y += Math.sin(p * Math.PI) * 0.25;
      fl.mesh.rotation.z = p * 4;
      if (p >= 1) {
        U.rounds[fl.idx].visible = true; scene.remove(fl.mesh); flyers.splice(f, 1);
        // index the cylinder so the next empty chamber comes to the top
        const r0 = U.cyl.rotation.x, r1 = -(fl.idx + 1) * Math.PI / 3;
        tw(0.12, q => { if (ga.phase === 'load') U.cyl.rotation.x = r0 + (r1 - r0) * q; }, {delay: 0.05, ease: fx.ease.out});
      }
    }
    // whoever holds the gun reaches for its grip (until it drops out of their hand)
    let held = null;
    if (ga.phase && ga.pid != null && !ga.drop && seats[ga.pid] && ga.pid !== viewerSeat) {
      gun.updateMatrixWorld(true);
      held = {grip: U.body.localToWorld(GRIP.clone()), gunQ: U.body.getWorldQuaternion(new T.Quaternion()).multiply(GRIP_Q)};
    }
    seats.forEach((s, i) => { if (s.group.visible) animateFace(s.group, s.face, t, dt, lookTargetFor(i), i === ga.pid ? held || {} : {}); });
    // lamp: gentle sway, kicked hard by a gunshot; the bulb stutters after it
    lampKick = Math.max(0, lampKick - dt * 0.35);
    const sway = Math.sin(t * 0.7) * 0.03 + Math.sin(t * 2.6) * 0.22 * lampKick;
    lampGroup.rotation.z = sway; lamp.position.x = -sway * 3.3;
    flash.intensity = flashT * 14; flashT = Math.max(0, flashT - dt * 4);
    godLight.intensity = godT * 5.5 * (0.85 + Math.sin(t * 9) * 0.15); halo.material.opacity = Math.min(1, godT * 1.6);
    godRay.material.opacity = Math.min(0.5, godT * 0.7); godRay.rotation.y += dt * 0.3;
    halo.rotation.z += dt * 1.5; halo.position.y += Math.sin(t * 3) * 0.0008;
    godT = Math.max(0, godT - dt * 0.33); if (godT === 0) halo.visible = godRay.visible = false;
    lamp.intensity = 2.4 * (0.96 + Math.random() * 0.04) * (t < flickerUntil && Math.random() < 0.4 ? 0.2 : 1);
    stepAmbience(t, dt); room.update(t);
    // camera: eased base position + lens, then free look, then offsets (death fall, shake, fear)
    camBase.lerp(camPos, k(boardView ? 4 : 3));
    camera.position.copy(camBase);
    curLook.lerp(camLook, k(3));
    const fovT = baseFov * fovMul;
    if (Math.abs(camera.fov - fovT) > 0.01) { camera.fov += (fovT - camera.fov) * k(fovMul < camera.fov / baseFov ? 1.4 : 2.5); camera.updateProjectionMatrix(); }
    const S = lastState;
    freeAmt += ((viewerSeat != null && !boardView && !(S && S.gun) ? 1 : 0) - freeAmt) * (root.__instant ? 1 : 1 - Math.exp(-realDt * 3));
    const look = curLook.clone().sub(camera.position).applyAxisAngle(Y, -mouse.x * (0.2 + 1.4 * freeAmt)).add(camera.position);
    look.y -= mouse.y * (0.2 + 1.0 * freeAmt);
    fall += ((fallOn ? 1 : 0) - fall) * k(fallOn ? 2.2 : 1);
    if (fall > 0.001) { camera.position.y -= 0.5 * fx.ease.out(fall); look.y -= 0.9 * fall; }
    if (shake > 0) { camera.position.add(new T.Vector3((Math.random() - .5) * shake * 0.08, (Math.random() - .5) * shake * 0.08, 0)); shake = Math.max(0, shake - realDt * 2.5); }
    if (S && S.gun && S.gun.pid === viewerSeat && S.gun.state === 'aim' && !fx.reduced) camera.position.add(randDir().multiplyScalar(0.003));
    camera.lookAt(look);
    if (fall > 0.001) camera.rotateZ(0.45 * fx.ease.out(fall));
    renderer.render(scene, camera);
    updateLabels();
  }
  shineAll(scene); [brass, copper, glassMat, whisky, iceMat].forEach(shiny);
  root.__pokerDebug = {camera, scene, renderer, fx, dyn, seats: () => seats, get frameMs() { return frameMs; }};
  resize(); requestAnimationFrame(frame);

  return {
    setup, update, resize, react,
    // Liar's Deck: lift the cards the viewer has selected (by card id).
    setPicked(ids) { picked = new Set(ids); if (lastState) update(lastState, viewerSeat, lastHide); },
    setBoardView(on) { boardView = on; if (lastState) update(lastState, viewerSeat, lastHide); },
    get boardView() { return boardView; },
    setPaused(p) { paused = !!p; },
    // called when the bulb stutters (index.html plays a buzz)
    set onFlicker(fn) { onFlicker = fn; },
  };
}

root.PokerScene = {createScene, createShowcase, renderPortraits, CHARACTERS, DEAL};
})(window);
