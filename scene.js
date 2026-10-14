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
  // startle: a flinch when someone else's gun goes off
  const startled = t < st.startle && !st.dead;
  const fear = (st.fear || startled) && !st.dead, happy = t < st.happyUntil && !st.dead, talk = t < st.talkUntil && !st.dead;
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
  // a bullet snaps the head away from the gun, fast, and it stays tipped over
  const hitFast = st.hitT != null && t - st.hitT < 0.25;
  head.rotation.z += ((st.dead && st.hitSide ? st.hitSide * 0.5 : 0) - head.rotation.z) * k(hitFast ? 28 : 4);
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
  const jump = startled ? Math.max(0, Math.sin(Math.min(1, (t - st.startle + 0.7) / 0.35) * Math.PI)) * 0.05 : 0;
  torso.position.y = 0.6 + (st.dead ? 0 : Math.sin(t * 1.6 + st.phase) * 0.012) + jump;
  torso.rotation.z += ((st.dead && st.hitSide ? st.hitSide * 0.18 : 0) - torso.rotation.z) * k(hitFast ? 14 : 3);
  torso.position.x = fear ? (Math.random() - 0.5) * 0.015 : 0;
}
const newFaceState = () => ({nextBlink: Math.random() * 3, blinkUntil: 0, talkUntil: 0, happyUntil: 0, fear: false, dead: false, relief: 0, phase: Math.random() * 6, confident: false, startle: 0, hitT: null, hitSide: 0});

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

  function seatAngle(i, n) { return Math.PI / 2 + i * 2 * Math.PI / n; }
  function polar(r, ang, y) { return new T.Vector3(Math.cos(ang) * r, y, Math.sin(ang) * r); }

  function setup(ps) {
    for (const s of seats) scene.remove(s.group);
    for (const d of dyn.values()) scene.remove(d.obj);
    dyn.clear();
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
  }

  function seatBasis(i) {
    const ang = seats[i].ang;
    return {ang, out: new T.Vector3(Math.cos(ang), 0, Math.sin(ang)), side: new T.Vector3(-Math.sin(ang), 0, Math.cos(ang))};
  }
  const flatQ = (yaw, faceUp) => new T.Quaternion().setFromEuler(new T.Euler(faceUp ? 0 : Math.PI, yaw, 0, 'YXZ'));
  const headPos = i => seats[i].group.userData.head.getWorldPosition(new T.Vector3());

  /* ----- Liar's Deck: hands, the face-down pile, the last play (revealed on a Liar call) ----- */
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
      setFace(want(deckKey(S, c), makeCard, pos, quat, {from: DECK_POS}), c);
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
        setFace(want(deckKey(S, c), makeCard, pos, flatQ(S.reveal ? face : -ang - Math.PI / 2, S.reveal)), S.reveal ? c : {hidden: true});
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
      want(`D${S.round}-${i}-${k}`, makeDie, pos, dieQ(v || 1, yaw + k * 0.4), {from: centre.clone().setY(TOP + 0.5), speed: 7});
    });
    const covered = i !== viewer && !S.reveal && p.alive;
    const cupPos = covered ? centre.clone().setY(TOP + 0.11) : centre.clone().add(side.clone().multiplyScalar(-0.38)).add(out.clone().multiplyScalar(0.12)).setY(TOP + 0.11);
    want(`cup-${i}`, makeCup, cupPos, new T.Quaternion(), {from: centre.clone().setY(TOP + 0.11), speed: 6});
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
        setFace(want(`h${S.handNo}-${i}-${k}`, makeCard, pos, quat, {from: DECK_POS}), c);
      });

      const inGun = S.gun && S.gun.pid === i ? (S.gun.state === 'load' ? S.gun.loaded : S.gun.bullets) : 0;
      for (let b = inGun; b < p.bet; b++) {
        const pos = out.clone().multiplyScalar(CARD_R - 0.42).add(side.clone().multiplyScalar(0.36 + (b % 3) * 0.07)).setY(TOP);
        pos.add(out.clone().multiplyScalar(-Math.floor(b / 3) * 0.07));
        want(`b${i}-${b}`, makeBullet, pos, new T.Quaternion(), {from: new T.Vector3(0, TOP + 0.6, 0)});
      }
    });

    if (S.mode === 'deck') deckCenter(S, viewer);
    if (!S.mode || S.mode === 'poker') S.board.forEach((c, k) => {
      const pos = new T.Vector3((k - 2) * 0.33, TOP + 0.004, 0);
      const quat = viewer != null ? flatQ(-seatBasis(viewer).ang - Math.PI / 2 + Math.PI, true) : flatQ(0, true);
      setFace(want('c' + c.id, makeCard, pos, quat, {from: DECK_POS}), c);
    });
    if (S.mode !== 'dice') want('deck', () => { const g = new T.Group(); for (let i = 0; i < 6; i++) { const c = makeCard(); c.position.y = i * 0.006; g.add(c); } return g; }, DECK_POS.clone(), flatQ(0.3, false));

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
      gunTarget.pos = new T.Vector3(-0.15, TOP + 0.035, -0.55);
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
        else { camPos = base.lerp(H, 0.3); camLook = H.add(new T.Vector3(0, -0.06, 0)); fovMul = st === 'aim' ? 0.62 : st === 'bang' ? 0.58 : 0.68; }
      }
    }

    for (const [k, d] of dyn) if (!d.seen) { scene.remove(d.obj); dyn.delete(k); }
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

  function frame() {
    const realDt = Math.min(0.05, clock.getDelta());
    const dt = fx.step(realDt, camera, renderer), t = now(); // dt is 0 during hit-stop, small in slow motion
    const k = d => root.__instant ? 1 : 1 - Math.exp(-dt * d);
    for (const d of dyn.values()) { d.obj.position.lerp(d.pos, k(d.speed)); d.obj.quaternion.slerp(d.quat, k(d.speed)); }
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
    seats.forEach((s, i) => { if (s.group.visible) animateFace(s.group, s.face, t, dt, lookTargetFor(i)); });
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
    requestAnimationFrame(frame);
  }
  root.__pokerDebug = {camera, scene, fx, seats: () => seats};
  resize(); requestAnimationFrame(frame);

  return {
    setup, update, resize, react,
    // Liar's Deck: lift the cards the viewer has selected (by card id).
    setPicked(ids) { picked = new Set(ids); if (lastState) update(lastState, viewerSeat, lastHide); },
    setBoardView(on) { boardView = on; if (lastState) update(lastState, viewerSeat, lastHide); },
    get boardView() { return boardView; },
  };
}

root.PokerScene = {createScene, renderPortraits, CHARACTERS};
})(window);
