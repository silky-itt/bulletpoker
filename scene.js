// Bullet Poker 3D scene (Three.js r128 UMD). Reads game state only; no rules here.
// Visual spec: DESIGN.md §3–4.
(function (root) {
'use strict';
const T = root.THREE;
const E = root.PokerEngine;

const CHARACTERS = {
  fox:  {name: 'Rusty',   animal: 'Red fox',   blurb: 'Sly. Bluffs more than he should.',
         body: 0xc8682c, head: 0xd9773a, snout: 0xf1e2cf, ear: 'pointy', snoutShape: 'cone', nose: 'tip', acc: 'bowtie', accColor: 0x2f6b45},
  pig:  {name: 'Truffle', animal: 'Pig',       blurb: 'Reckless. Calls almost anything.',
         body: 0xd98f95, head: 0xe9a3a8, snout: 0xf0b7bb, ear: 'flop', snoutShape: 'disk', nose: 'nostrils', acc: 'cap', accColor: 0x55524e},
  bear: {name: 'Bruno',   animal: 'Brown bear', blurb: 'Steady. Only plays strong hands.',
         body: 0x5b3b26, head: 0x6c4630, snout: 0xa98163, ear: 'round', snoutShape: 'box', nose: 'big', acc: 'scarf', accColor: 0xa3312a},
  bull: {name: 'Tank',    animal: 'Bull',      blurb: 'Aggressive. Raises at every chance.',
         body: 0x2f2a28, head: 0x3a3330, snout: 0x8a7468, ear: 'horn', snoutShape: 'box', nose: 'ring', acc: 'ring', accColor: 0xd4a73c},
};
const TABLE_R = 1.9, SEAT_R = 2.75, CARD_R = 1.35, EYE_H = 1.62, TOP = 0.955;

const std = (c, r = 0.8, m = 0) => new T.MeshStandardMaterial({color: c, roughness: r, metalness: m});
const wood = (c, r = 0.75) => std(c, r, 0.05);

/* ---------- character model with a full face kit ---------- */
function makeAnimal(kind) {
  const a = CHARACTERS[kind] || CHARACTERS.fox;
  const g = new T.Group();
  const chair = new T.Mesh(new T.BoxGeometry(0.7, 0.08, 0.7), wood(0x3a2414)); chair.position.y = 0.55;
  const back = new T.Mesh(new T.BoxGeometry(0.7, 0.9, 0.08), wood(0x3a2414)); back.position.set(0, 1.0, 0.33);
  const torso = new T.Group(); torso.position.y = 0.6;
  const body = new T.Mesh(new T.CylinderGeometry(0.3, 0.38, 0.85, 16), std(a.body)); body.position.y = 0.42; torso.add(body);
  const head = new T.Group(); head.position.y = 0.98; torso.add(head);
  head.add(new T.Mesh(new T.SphereGeometry(0.27, 20, 16), std(a.head)));

  // snout + nose
  let snoutTipZ;
  if (a.snoutShape === 'cone') {
    const s = new T.Mesh(new T.ConeGeometry(0.11, 0.3, 14), std(a.snout)); s.rotation.x = -Math.PI / 2; s.position.set(0, -0.05, -0.33); head.add(s); snoutTipZ = -0.48;
  } else if (a.snoutShape === 'disk') {
    const s = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 0.1, 18), std(a.snout)); s.rotation.x = Math.PI / 2; s.position.set(0, -0.05, -0.27); head.add(s); snoutTipZ = -0.32;
  } else {
    const s = new T.Mesh(new T.BoxGeometry(0.22, 0.15, 0.17), std(a.snout)); s.position.set(0, -0.07, -0.26); head.add(s); snoutTipZ = -0.345;
  }
  const dark = std(0x141010, 0.35);
  if (a.nose === 'tip') { const n = new T.Mesh(new T.SphereGeometry(0.032, 10, 8), dark); n.position.set(0, -0.05, snoutTipZ); head.add(n); }
  if (a.nose === 'big') { const n = new T.Mesh(new T.SphereGeometry(0.05, 12, 8), dark); n.scale.set(1.3, 0.8, 0.8); n.position.set(0, -0.02, snoutTipZ); head.add(n); }
  if (a.nose === 'nostrils' || a.nose === 'ring') {
    for (const s of [-1, 1]) { const n = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, 0.02, 8), dark); n.rotation.x = Math.PI / 2; n.position.set(s * 0.035, a.nose === 'ring' ? -0.05 : -0.05, snoutTipZ - 0.002); head.add(n); }
  }
  if (a.nose === 'ring') { const r = new T.Mesh(new T.TorusGeometry(0.04, 0.008, 8, 20), std(a.accColor, 0.25, 0.9)); r.position.set(0, -0.085, snoutTipZ - 0.03); r.rotation.x = 0.5; head.add(r); }

  // eyes (sclera + pupil + highlight), brows, mouth
  const face = {eyes: [], pupils: [], brows: [], lids: []};
  const white = std(0xf4efe4, 0.3), black = std(0x0b0b0b, 0.2), shine = new T.MeshBasicMaterial({color: 0xffffff});
  for (const s of [-1, 1]) {
    const eye = new T.Group(); eye.position.set(s * 0.1, 0.07, -0.215); head.add(eye);
    eye.add(new T.Mesh(new T.SphereGeometry(0.058, 14, 12), white));
    const pupil = new T.Group(); pupil.position.z = -0.042; eye.add(pupil);
    pupil.add(new T.Mesh(new T.SphereGeometry(0.03, 12, 10), black));
    const hl = new T.Mesh(new T.SphereGeometry(0.009, 6, 6), shine); hl.position.set(0.012, 0.014, -0.026); pupil.add(hl);
    pupil.userData.base = pupil.position.clone();
    const brow = new T.Mesh(new T.BoxGeometry(0.1, 0.02, 0.025), std(0x1d1410)); brow.position.set(s * 0.1, 0.16, -0.235); brow.userData.side = s; head.add(brow);
    face.eyes.push(eye); face.pupils.push(pupil); face.brows.push(brow);
  }
  const mouthY = {cone: -0.13, disk: -0.175, box: -0.115}[a.snoutShape];
  const mouthZ = {cone: -0.36, disk: -0.29, box: snoutTipZ - 0.008}[a.snoutShape];
  const mouth = new T.Mesh(new T.SphereGeometry(0.05, 14, 10), std(0x3a0f0f, 0.6)); mouth.position.set(0, mouthY, mouthZ); mouth.scale.set(1.3, 0.12, 0.35); head.add(mouth);
  const smile = new T.Mesh(new T.TorusGeometry(0.05, 0.011, 6, 16, Math.PI), std(0x1d1410)); smile.position.set(0, mouthY + 0.02, mouthZ - 0.005); smile.rotation.z = Math.PI; smile.visible = false; head.add(smile);
  face.mouth = mouth; face.smile = smile;

  // ears / horns
  for (const s of [-1, 1]) {
    let ear;
    if (a.ear === 'pointy') { ear = new T.Mesh(new T.ConeGeometry(0.08, 0.2, 8), std(a.head)); ear.position.set(s * 0.15, 0.27, 0); }
    else if (a.ear === 'flop') { ear = new T.Mesh(new T.ConeGeometry(0.08, 0.16, 8), std(a.head)); ear.position.set(s * 0.18, 0.2, -0.05); ear.rotation.z = s * 2.2; }
    else if (a.ear === 'round') { ear = new T.Mesh(new T.SphereGeometry(0.08, 10, 8), std(a.head)); ear.position.set(s * 0.18, 0.22, 0); }
    else { ear = new T.Mesh(new T.ConeGeometry(0.045, 0.3, 8), std(0xe8dcc4, 0.5)); ear.position.set(s * 0.28, 0.17, -0.02); ear.rotation.z = -s * 1.1; }
    head.add(ear);
    const arm = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.55, 8), std(a.body));
    arm.position.set(s * 0.3, 0.45, -0.25); arm.rotation.x = -1.1; torso.add(arm);
  }

  // accessory
  const acc = std(a.accColor, 0.6);
  if (a.acc === 'bowtie') {
    const neck = new T.Group(); neck.position.set(0, 0.8, -0.28); torso.add(neck);
    for (const s of [-1, 1]) { const w = new T.Mesh(new T.ConeGeometry(0.05, 0.09, 4), acc); w.rotation.z = s * Math.PI / 2; w.position.x = s * 0.045; neck.add(w); }
    neck.add(new T.Mesh(new T.SphereGeometry(0.022, 8, 6), acc));
  } else if (a.acc === 'cap') {
    const cap = new T.Mesh(new T.CylinderGeometry(0.24, 0.26, 0.09, 18), acc); cap.position.set(0, 0.22, 0.01); cap.rotation.x = -0.12; head.add(cap);
    const brim = new T.Mesh(new T.BoxGeometry(0.3, 0.02, 0.16), acc); brim.position.set(0, 0.19, -0.25); brim.rotation.x = 0.1; head.add(brim);
  } else if (a.acc === 'scarf') {
    const sc = new T.Mesh(new T.TorusGeometry(0.24, 0.065, 8, 20), acc); sc.rotation.x = Math.PI / 2; sc.position.y = 0.82; torso.add(sc);
    const tail = new T.Mesh(new T.BoxGeometry(0.09, 0.28, 0.04), acc); tail.position.set(0.12, 0.68, -0.27); tail.rotation.z = 0.15; torso.add(tail);
  }

  g.add(chair, back, torso);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = {torso, head, face, kind};
  return g;
}

/* Face controller: blink, look, talk, fear, smile, dead. */
function animateFace(ch, st, t, dt, lookWorld) {
  const {torso, head, face} = ch.userData;
  const k = d => 1 - Math.exp(-dt * d);
  // blink
  if (t > st.nextBlink) { st.blinkUntil = t + 0.12; st.nextBlink = t + 2 + Math.random() * 4; }
  const blink = t < st.blinkUntil;
  const fear = st.fear && !st.dead, happy = t < st.happyUntil && !st.dead, talk = t < st.talkUntil && !st.dead;
  const eyeY = st.dead ? 0.12 : blink ? 0.1 : fear ? 1.25 : 1;
  for (const e of face.eyes) { e.scale.y += (eyeY - e.scale.y) * k(blink ? 40 : 12); e.scale.x += ((fear ? 1.15 : 1) - e.scale.x) * k(12); }
  for (const p of face.pupils) p.visible = !st.dead;
  // pupils + head follow the look target
  let yaw = 0;
  if (lookWorld && !st.dead) {
    const lh = head.worldToLocal(lookWorld.clone());
    const len = lh.length() || 1;
    for (const p of face.pupils) {
      p.position.x += (p.userData.base.x + Math.max(-0.02, Math.min(0.02, lh.x / len * 0.03)) - p.position.x) * k(10);
      p.position.y += (p.userData.base.y + Math.max(-0.015, Math.min(0.015, lh.y / len * 0.03)) - p.position.y) * k(10);
    }
    const lt = torso.worldToLocal(lookWorld.clone());
    yaw = Math.max(-0.7, Math.min(0.7, Math.atan2(-lt.x, -lt.z)));
  }
  head.rotation.y += ((st.dead ? 0 : yaw * 0.75) - head.rotation.y) * k(3);
  // brows
  for (const b of face.brows) {
    const s = b.userData.side;
    const ty = fear ? 0.19 : happy ? 0.16 : 0.16;
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
  const slump = st.dead ? 0.95 : st.relief && t < st.relief ? 0.25 : 0;
  torso.rotation.x += (slump - torso.rotation.x) * k(st.dead ? 2.5 : 4);
  torso.position.y = 0.6 + (st.dead ? 0 : Math.sin(t * 1.6 + st.phase) * 0.012);
  torso.position.x = fear ? (Math.random() - 0.5) * 0.015 : 0;
}
const newFaceState = () => ({nextBlink: Math.random() * 3, blinkUntil: 0, talkUntil: 0, happyUntil: 0, fear: false, dead: false, relief: 0, phase: Math.random() * 6, confident: false});

/* ---------- portrait renderer for the character picker ---------- */
function renderPortraits(w = 220, h = 250) {
  const out = {};
  let r;
  try { r = new T.WebGLRenderer({antialias: true, preserveDrawingBuffer: true}); } catch (e) { return out; }
  r.setSize(w, h); r.outputEncoding = T.sRGBEncoding;
  const sc = new T.Scene(); sc.background = new T.Color(0x1a120c);
  sc.add(new T.HemisphereLight(0x8a6a48, 0x1a120c, 0.7));
  const key = new T.SpotLight(0xffc77a, 2.2, 8, Math.PI / 5, 0.6, 1); key.position.set(0.6, 3, -1.6); key.target.position.set(0, 1.5, 0); sc.add(key, key.target);
  const rim = new T.DirectionalLight(0xe2a64a, 0.6); rim.position.set(-1, 2, 1); sc.add(rim);
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

/* ---------- main table scene ---------- */
function createScene(canvas, labelLayer) {
  const renderer = new T.WebGLRenderer({canvas, antialias: true});
  renderer.setPixelRatio(Math.min(2, root.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputEncoding = T.sRGBEncoding;
  const scene = new T.Scene();
  scene.background = new T.Color(0x0d0a08);
  scene.fog = new T.Fog(0x0d0a08, 5, 13);
  const camera = new T.PerspectiveCamera(55, 1, 0.05, 50);
  camera.position.set(0, 4.4, 3.6);

  // room & light
  scene.add(new T.HemisphereLight(0x5a4632, 0x0a0806, 0.55));
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
  const floor = new T.Mesh(new T.CircleGeometry(12, 48), wood(0x1c130d, 0.9)); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const wall = new T.Mesh(new T.CylinderGeometry(7, 7, 6, 40, 1, true), new T.MeshStandardMaterial({color: 0x1a120c, side: T.BackSide, roughness: 1})); wall.position.y = 3; scene.add(wall);
  const shelf = new T.Mesh(new T.BoxGeometry(3.2, 0.08, 0.4), wood(0x3a2616)); shelf.position.set(0, 1.9, -6.6); scene.add(shelf);
  [0x2d5a3a, 0x6a3a1a, 0x8a7a3a, 0x3a2a5a, 0x5a1a1a, 0x2a4a5a].forEach((c, i) => {
    const b = new T.Mesh(new T.CylinderGeometry(0.07, 0.08, 0.42, 12), new T.MeshStandardMaterial({color: c, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85}));
    b.position.set(-1.3 + i * 0.52, 2.15, -6.6); scene.add(b);
  });
  const tableG = new T.Group();
  const rim = new T.Mesh(new T.CylinderGeometry(TABLE_R + 0.12, TABLE_R + 0.15, 0.14, 64), wood(0x4a2c18, 0.55)); rim.position.y = 0.86; rim.castShadow = rim.receiveShadow = true;
  const felt = new T.Mesh(new T.CylinderGeometry(TABLE_R - 0.05, TABLE_R - 0.05, 0.02, 64), std(0x1f4a32, 0.95)); felt.position.y = 0.94; felt.receiveShadow = true;
  const leg = new T.Mesh(new T.CylinderGeometry(0.18, 0.35, 0.86, 16), wood(0x2a190e)); leg.position.y = 0.43;
  tableG.add(rim, felt, leg); scene.add(tableG);

  // card textures
  const texCache = new Map();
  function cardTex(c) {
    const key = c ? c.id : 'back';
    if (texCache.has(key)) return texCache.get(key);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 356;
    const g = cv.getContext('2d');
    if (!c) {
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
    if (m.userData.cardId === c.id) return;
    m.userData.cardId = c.id; m.userData.face.map = m.userData.face.emissiveMap = cardTex(c); m.userData.face.needsUpdate = true;
  }

  // gun & bullets
  const brass = std(0xc8963c, 0.3, 0.9), copper = std(0xb0603a, 0.3, 0.9);
  function makeGun() {
    const g = new T.Group();
    const steel = std(0x3a3a3c, 0.35, 0.85), grip = std(0x4a2a16, 0.7);
    const barrel = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.42, 12), steel); barrel.rotation.z = Math.PI / 2; barrel.position.x = 0.24;
    // cylinder group: body + 6 chamber holes + 6 rounds (shown as they are loaded)
    const cyl = new T.Group();
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
    const trig = new T.Mesh(new T.TorusGeometry(0.04, 0.008, 6, 12, Math.PI), steel); trig.position.set(-0.06, -0.05, 0); trig.rotation.z = Math.PI;
    g.add(barrel, cyl, frame, handle, trig);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.userData.cyl = cyl; g.userData.rounds = rounds;
    return g;
  }
  const bulletGeo = new T.CylinderGeometry(0.022, 0.022, 0.09, 10);
  const tipGeo = new T.SphereGeometry(0.022, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  function makeBullet() {
    const g = new T.Group();
    const b = new T.Mesh(bulletGeo, brass); b.position.y = 0.045;
    const t = new T.Mesh(tipGeo, copper); t.position.y = 0.09;
    g.add(b, t); g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  // dynamic objects eased toward targets
  const dyn = new Map();
  const DECK_POS = new T.Vector3(0.9, TOP + 0.02, 0.2);
  function want(key, factory, pos, quat, opt = {}) {
    let d = dyn.get(key);
    if (!d) {
      const obj = factory();
      obj.position.copy(opt.from || pos); obj.quaternion.copy(quat);
      scene.add(obj);
      d = {obj}; dyn.set(key, d);
    }
    d.pos = pos; d.quat = quat; d.seen = true; d.speed = opt.speed || 9;
    return d.obj;
  }

  let seats = [];
  const gun = makeGun(), gunTarget = {pos: new T.Vector3(), quat: new T.Quaternion()};
  scene.add(gun);
  let camPos = new T.Vector3(0, 4.4, 3.6), camLook = new T.Vector3(0, TOP, 0);
  const curLook = camLook.clone();
  let mouse = {x: 0, y: 0}, viewerSeat = null, shake = 0, flashT = 0, boardView = false;
  let lastState = null, lastHide = false, snap = true;
  let gunFx = {gun: null, flown: new Set()};
  const flyers = [];

  function seatAngle(i, n) { return Math.PI / 2 + i * 2 * Math.PI / n; }
  function polar(r, ang, y) { return new T.Vector3(Math.cos(ang) * r, y, Math.sin(ang) * r); }

  function setup(ps) {
    for (const s of seats) scene.remove(s.group);
    for (const d of dyn.values()) scene.remove(d.obj);
    dyn.clear();
    labelLayer.innerHTML = '';
    snap = true; boardView = false;
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
  }

  function seatBasis(i) {
    const ang = seats[i].ang;
    return {ang, out: new T.Vector3(Math.cos(ang), 0, Math.sin(ang)), side: new T.Vector3(-Math.sin(ang), 0, Math.cos(ang))};
  }
  const flatQ = (yaw, faceUp) => new T.Quaternion().setFromEuler(new T.Euler(faceUp ? 0 : Math.PI, yaw, 0, 'YXZ'));
  const headPos = i => seats[i].group.userData.head.getWorldPosition(new T.Vector3());

  function update(S, viewer, hideViewerCards) {
    lastState = S; viewerSeat = viewer; lastHide = hideViewerCards;
    for (const d of dyn.values()) d.seen = false;

    if (viewer != null) {
      const {out} = seatBasis(viewer);
      if (boardView) { camPos = out.clone().multiplyScalar(0.75).setY(2.75); camLook = new T.Vector3(0, TOP, 0); }
      else { camPos = out.clone().multiplyScalar(SEAT_R + 0.2).setY(EYE_H + 0.05); camLook = out.clone().multiplyScalar(-0.6).setY(TOP); }
    } else if (boardView) { camPos = new T.Vector3(0, 2.75, 0.75); camLook = new T.Vector3(0, TOP, 0); }
    else { camPos = new T.Vector3(0, 4.4, 3.6); camLook = new T.Vector3(0, TOP, 0); }

    S.players.forEach((p, i) => {
      const seat = seats[i]; if (!seat) return;
      const {ang, out, side} = seatBasis(i);
      seat.group.visible = i !== viewer;
      seat.face.dead = !p.alive;
      seat.face.fear = !!(S.gun && S.gun.pid === i && (S.gun.state === 'aim' || S.gun.state === 'load'));
      seat.face.confident = p.alive && !p.folded && p.bet >= 3;
      const yaw = -ang - Math.PI / 2;

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
        setFace(want('h' + c.id, makeCard, pos, quat, {from: DECK_POS}), c);
      });

      const inGun = S.gun && S.gun.pid === i ? (S.gun.state === 'load' ? S.gun.loaded : S.gun.bullets) : 0;
      for (let b = inGun; b < p.bet; b++) {
        const pos = out.clone().multiplyScalar(CARD_R - 0.42).add(side.clone().multiplyScalar(0.36 + (b % 3) * 0.07)).setY(TOP);
        pos.add(out.clone().multiplyScalar(-Math.floor(b / 3) * 0.07));
        want(`b${i}-${b}`, makeBullet, pos, new T.Quaternion(), {from: new T.Vector3(0, TOP + 0.6, 0)});
      }
    });

    S.board.forEach((c, k) => {
      const pos = new T.Vector3((k - 2) * 0.33, TOP + 0.004, 0);
      const quat = viewer != null ? flatQ(-seatBasis(viewer).ang - Math.PI / 2 + Math.PI, true) : flatQ(0, true);
      setFace(want('c' + c.id, makeCard, pos, quat, {from: DECK_POS}), c);
    });
    want('deck', () => { const g = new T.Group(); for (let i = 0; i < 6; i++) { const c = makeCard(); c.position.y = i * 0.006; g.add(c); } return g; }, DECK_POS.clone(), flatQ(0.3, false));

    if (S.gun && gunFx.gun !== S.gun) { gunFx = {gun: S.gun, flown: new Set()}; gun.userData.rounds.forEach(r => r.visible = false); }
    if (!S.gun) { gun.userData.rounds.forEach(r => r.visible = false); flyers.forEach(f => scene.remove(f.mesh)); flyers.length = 0; }
    if (S.gun && S.gun.state === 'load') {
      const i = S.gun.pid, {out} = seatBasis(i);
      const eye = viewer != null ? camPos.clone() : camera.position.clone();
      gunTarget.pos = i === viewer
        ? camPos.clone().add(out.clone().multiplyScalar(-0.55)).setY(EYE_H - 0.12)
        : out.clone().multiplyScalar(SEAT_R - 0.75).setY(1.3);
      const away = gunTarget.pos.clone().sub(eye).normalize();
      const m = new T.Matrix4().lookAt(gunTarget.pos, gunTarget.pos.clone().add(away), new T.Vector3(0, 1, 0));
      gunTarget.quat = new T.Quaternion().setFromRotationMatrix(m).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 2)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), 0.45));
      // send each newly loaded round flying from the table into its chamber
      for (let b = 0; b < S.gun.loaded; b++) {
        if (gunFx.flown.has(b)) continue;
        gunFx.flown.add(b);
        const src = dyn.get(`b${i}-${b}`);
        const from = src ? src.obj.position.clone() : out.clone().multiplyScalar(CARD_R - 0.42).setY(TOP);
        const mesh = makeBullet(); mesh.position.copy(from); scene.add(mesh);
        flyers.push({mesh, from, t0: clock.elapsedTime, dur: 0.38, idx: b});
      }
      gun.userData.spinning = false;
    } else if (S.gun) {
      const i = S.gun.pid, {out, side} = seatBasis(i);
      gun.userData.rounds.forEach((r, c) => { if (c < S.gun.bullets) r.visible = true; });
      if (i === viewer) gunTarget.pos = camPos.clone().add(side.clone().multiplyScalar(0.16)).add(out.clone().multiplyScalar(-0.32)).setY(EYE_H - 0.06);
      else gunTarget.pos = headPos(i).add(side.clone().multiplyScalar(0.36));
      const tgt = i === viewer ? camPos.clone() : headPos(i);
      const m = new T.Matrix4().lookAt(gunTarget.pos, tgt, new T.Vector3(0, 1, 0));
      gunTarget.quat = new T.Quaternion().setFromRotationMatrix(m).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 2));
      if (S.gun.state === 'bang' && !S.gun._fx) { S.gun._fx = true; flashT = 1; shake = 1; flash.position.copy(gunTarget.pos); }
      if (S.gun.state === 'click' && !S.gun._fx) { S.gun._fx = true; shake = 0.15; seats[i].face.relief = clock.elapsedTime + 0.9; seats[i].face.happyUntil = clock.elapsedTime + 1.6; }
      if (S.gun.state === 'godsave' && !S.gun._fx) {
        S.gun._fx = true; shake = 0.3; godT = 1;
        seats[i].face.relief = clock.elapsedTime + 1.2; seats[i].face.happyUntil = clock.elapsedTime + 3.2;
        godLight.position.copy(headPos(i)).add(new T.Vector3(0, 0.9, 0));
        halo.position.copy(headPos(i)).add(new T.Vector3(0, 0.42, 0)); halo.visible = i !== viewer;
      }
      gun.userData.spinning = S.gun.state === 'aim';
    } else {
      gunTarget.pos = new T.Vector3(-0.15, TOP + 0.035, -0.55);
      gunTarget.quat = new T.Quaternion().setFromEuler(new T.Euler(Math.PI / 2, 0, 0.6));
      gun.userData.spinning = false;
    }

    for (const [k, d] of dyn) if (!d.seen) { scene.remove(d.obj); dyn.delete(k); }
    if (snap) { snap = false; camera.position.copy(camPos); curLook.copy(camLook); gun.position.copy(gunTarget.pos); gun.quaternion.copy(gunTarget.quat); }
  }

  // expressions triggered by game events
  function react(pid, kind) {
    const s = seats[pid]; if (!s) return;
    const t = clock.elapsedTime;
    if (kind === 'talk') s.face.talkUntil = t + 0.7;
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
      const html = `<b>${escapeHTML(p.name)}</b>${S.dealer === i ? '<i class="d">D</i>' : ''}<span class="bul">${'●'.repeat(p.bet)}<span class="emp">${'○'.repeat(Math.max(0, 6 - p.bet))}</span></span><span class="st">${escapeHTML(status || '')}</span>`;
      if (el._html !== html) { el.innerHTML = html; el._html = html; }
    });
  }

  // loop
  const clock = new T.Clock();
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 74 : 60;
    camera.updateProjectionMatrix();
  }
  root.addEventListener('resize', resize);
  root.addEventListener('pointermove', e => { mouse.x = e.clientX / root.innerWidth - 0.5; mouse.y = e.clientY / root.innerHeight - 0.5; });

  function lookTargetFor(i) {
    const S = lastState; if (!S) return null;
    if (S.gun) return S.gun.pid === i ? gun.position.clone() : (S.gun.pid === viewerSeat ? camera.position.clone() : headPos(S.gun.pid));
    if (S.toAct != null && S.toAct !== i) return S.toAct === viewerSeat ? camera.position.clone() : headPos(S.toAct);
    if (S.showdown) return new T.Vector3(0, TOP, 0);
    return viewerSeat != null ? camera.position.clone() : new T.Vector3(0, TOP, 0);
  }

  function frame() {
    const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
    const k = d => root.__instant ? 1 : 1 - Math.exp(-dt * d);
    for (const d of dyn.values()) { d.obj.position.lerp(d.pos, k(d.speed)); d.obj.quaternion.slerp(d.quat, k(d.speed)); }
    gun.position.lerp(gunTarget.pos, k(6)); gun.quaternion.slerp(gunTarget.quat, k(6));
    if (gun.userData.spinning) gun.userData.cyl.rotation.x += dt * 16;
    for (let f = flyers.length - 1; f >= 0; f--) {
      const fl = flyers[f], p = Math.min(1, (t - fl.t0) / fl.dur), e = p * p * (3 - 2 * p);
      const to = gun.userData.rounds[fl.idx].getWorldPosition(new T.Vector3());
      fl.mesh.position.lerpVectors(fl.from, to, e); fl.mesh.position.y += Math.sin(p * Math.PI) * 0.25;
      fl.mesh.rotation.z = p * 4;
      if (p >= 1) { gun.userData.rounds[fl.idx].visible = true; scene.remove(fl.mesh); flyers.splice(f, 1); }
    }
    seats.forEach((s, i) => { if (s.group.visible) animateFace(s.group, s.face, t, dt, lookTargetFor(i)); });
    lampGroup.rotation.z = Math.sin(t * 0.7) * 0.03;
    lamp.position.x = Math.sin(t * 0.7) * -0.1;
    flash.intensity = flashT * 30; flashT = Math.max(0, flashT - dt * 4);
    godLight.intensity = godT * 9 * (0.85 + Math.sin(t * 9) * 0.15); halo.material.opacity = Math.min(1, godT * 1.6);
    halo.rotation.z += dt * 1.5; halo.position.y += Math.sin(t * 3) * 0.0008;
    godT = Math.max(0, godT - dt * 0.33); if (godT === 0) halo.visible = false;
    lamp.intensity = 2.4 * (0.96 + Math.random() * 0.04);
    camera.position.lerp(camPos, k(boardView ? 4 : 3));
    curLook.lerp(camLook, k(3));
    const free = viewerSeat != null && !boardView;
    const look = curLook.clone().sub(camera.position).applyAxisAngle(new T.Vector3(0, 1, 0), -mouse.x * (free ? 1.6 : 0.2)).add(camera.position);
    look.y -= mouse.y * (free ? 1.2 : 0.2);
    if (shake > 0) { camera.position.add(new T.Vector3((Math.random() - .5) * shake * 0.08, (Math.random() - .5) * shake * 0.08, 0)); shake = Math.max(0, shake - dt * 2.5); }
    camera.lookAt(look);
    renderer.render(scene, camera);
    updateLabels();
    requestAnimationFrame(frame);
  }
  root.__pokerDebug = {camera, scene, seats: () => seats};
  resize(); requestAnimationFrame(frame);

  return {
    setup, update, resize, react,
    setBoardView(on) { boardView = on; if (lastState) update(lastState, viewerSeat, lastHide); },
    get boardView() { return boardView; },
  };
}

root.PokerScene = {createScene, renderPortraits, CHARACTERS};
})(window);
