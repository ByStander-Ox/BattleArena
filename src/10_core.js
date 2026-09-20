'use strict';
/* ============================ utilidades ============================ */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const damp = (rate, dt) => 1 - Math.pow(rate, dt);
const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
/* Punto plano, no THREE.Vector3: el estado de juego no debe depender de tipos
   de la capa de render, y así se puede serializar con JSON.stringify. */
const vec3 = (x, y, z) => ({ x: x || 0, y: y || 0, z: z || 0 });

/* ============================ aleatoriedad ============================ */
/* Dos generadores, deliberadamente separados.

   srand() es determinista: misma semilla, misma partida. Es el único que puede
   usarse dentro de la simulación, porque de él dependen la IA, la composición
   de equipos y las reliquias que se ofrecen. El modo online necesita que el
   servidor y el cliente saquen exactamente los mismos números.

   frand() es cosmético: partículas, chispas, temblor de cámara, rocas de
   ambiente. Da igual que dos máquinas difieran, porque nada de eso toca el
   estado de juego.

   Mezclarlos produce desincronizaciones que aparecen una vez cada cien
   partidas y cuestan un día encontrar, así que `node tests/lint_rng.js` falla
   si Math.random aparece fuera de las tres líneas marcadas abajo. */
let _seed = 1;
function seedSim(n) { _seed = (n >>> 0) || 1; }
function simSeed() { return _seed; }
function srand() {                                   // mulberry32
  _seed = _seed + 0x6D2B79F5 | 0;
  let t = Math.imul(_seed ^ _seed >>> 15, 1 | _seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
const rnd = (a, b) => a + srand() * (b - a);
const irnd = n => (srand() * n) | 0;
const pickOne = arr => arr[irnd(arr.length)];
const chance = p => srand() < p;

const frand = () => Math.random();                   /* rng-cosmético */
const frnd = (a, b) => a + Math.random() * (b - a);  /* rng-cosmético */
const firnd = n => (Math.random() * n) | 0;          /* rng-cosmético */

/* ============================ tiempo ============================ */
/* La simulación avanza en pasos fijos de 1/60 s de tiempo de juego, pase lo
   que pase con los fotogramas. Con paso variable el mismo combate daba
   resultados distintos a 60 y a 144 Hz, y la predicción del modo online exige
   que cliente y servidor lleguen al mismo estado con la misma entrada. */
const STEP = 1 / 60;
const MAX_STEPS = 5;   // techo por fotograma: tras un parón el tiempo se pierde

/* ============================ arena ============================ */
const ARENA = { hx: 19, hz: 13, r: 7.5, pillars: [] };

function arenaClosest(x, z, shrink) {
  const s = shrink || 1;
  const ix = (ARENA.hx - ARENA.r) * s, iz = (ARENA.hz - ARENA.r) * s, r = ARENA.r * s;
  const cx = clamp(x, -ix, ix), cz = clamp(z, -iz, iz);
  return { cx, cz, r };
}
function insideArena(x, z, margin, shrink) {
  const c = arenaClosest(x, z, shrink);
  const rr = c.r - (margin || 0);
  return dist2(x, z, c.cx, c.cz) <= rr * rr;
}
/** distancia al borde (negativa si estás fuera) */
function edgeDepth(x, z, shrink) {
  const c = arenaClosest(x, z, shrink);
  return c.r - dist(x, z, c.cx, c.cz);
}
function pushInside(p, margin) {
  const c = arenaClosest(p.x, p.z, 1);
  const rr = c.r - (margin || 0);
  const dx = p.x - c.cx, dz = p.z - c.cz;
  const d = Math.hypot(dx, dz);
  if (d > rr) { const k = rr / (d || 1); p.x = c.cx + dx * k; p.z = c.cz + dz * k; return true; }
  return false;
}
function collidePillars(p, radius) {
  let hit = false;
  for (const pl of ARENA.pillars) {
    const dx = p.x - pl.x, dz = p.z - pl.z, need = pl.r + radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < need * need) {
      const d = Math.sqrt(d2) || 0.001;
      p.x = pl.x + dx / d * need; p.z = pl.z + dz / d * need; hit = true;
    }
  }
  return hit;
}
function segHitsPillar(x1, z1, x2, z2, radius) {
  for (const pl of ARENA.pillars) {
    const dx = x2 - x1, dz = z2 - z1;
    const len2 = dx * dx + dz * dz || 1e-6;
    let t = ((pl.x - x1) * dx + (pl.z - z1) * dz) / len2;
    t = clamp(t, 0, 1);
    const px = x1 + dx * t, pz = z1 + dz * t, need = pl.r + radius;
    if (dist2(px, pz, pl.x, pl.z) < need * need) return pl;
  }
  return null;
}

/* ============================ estado global ============================ */
const G = {
  state: 'title',          // title | setup | intro | live | roundend | brite | result | pause
  mode: null, diff: null,
  fighters: [], projectiles: [], zones: [], pickups: [], fx: [],
  byId: new Map(),         // uid -> luchador; las entidades se refieren por id
  player: null, t: 0, dt: 0, paused: false,
  round: 1, score: [0, 0], roundTime: 0, sudden: false, shrink: 1,
  picks: 0, timeScale: 1, nextOrb: 0, nextHeal: 0, started: false,
  firstBlood: false, announceT: 0, camShake: 0, quality: 1, order: 0,
  seed: 0                  // semilla de la partida: basta para repetirla entera
};
const fighterById = id => G.byId.get(id) || null;

/* El orden de actualización importa en el cuerpo a cuerpo: quien se procesa
   primero se adelanta siempre. Se rota cada fotograma para que nadie tenga
   una ventaja sistemática. */
function fightersInOrder() {
  const n = G.fighters.length;
  if (n < 2) return G.fighters;
  const off = G.order % n;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = G.fighters[(i + off) % n];
  return out;
}

const MODES = {
  duel: { id: 'duel', name: 'Duelo', sub: '1 contra 1', size: 1, wins: 3, time: 100 },
  duo: { id: 'duo', name: 'Dúo', sub: '2 contra 2', size: 2, wins: 3, time: 100 },
  squad: { id: 'squad', name: 'Escuadra', sub: '3 contra 3', size: 3, wins: 3, time: 110 },
  training: { id: 'training', name: 'Entrenamiento', sub: 'Sin rondas', size: 1, wins: 99, time: 0 }
};
const DIFFS = {
  easy: { id: 'easy', name: 'Recluta', react: .42, aimErr: .30, dodge: .18, aggr: .55, exUse: .15 },
  normal: { id: 'normal', name: 'Veterano', react: .24, aimErr: .17, dodge: .42, aggr: .75, exUse: .4 },
  hard: { id: 'hard', name: 'Campeón', react: .13, aimErr: .085, dodge: .68, aggr: .9, exUse: .7 },
  elite: { id: 'elite', name: 'Leyenda', react: .07, aimErr: .045, dodge: .88, aggr: 1, exUse: .95 }
};

/* ============================ motor ============================ */
let renderer, scene, camera, clock, floorMesh, ringMesh, sdRing, embers;
const CAM = { tilt: 0.985, dist: 46, follow: false, tgt: new THREE.Vector3(), shake: new THREE.Vector3() };
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();

function initEngine() {
  const canvas = $('gl');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070d);
  scene.fog = new THREE.Fog(0x05070d, 52, 108);
  camera = new THREE.PerspectiveCamera(40, 1, 1, 260);
  clock = new THREE.Clock();
  buildLights();
  buildArena();
  buildEmbers();
  window.addEventListener('resize', onResize);
  onResize();
}

function buildLights() {
  scene.add(new THREE.HemisphereLight(0x6f84bd, 0x1a1108, 0.55));
  const sun = new THREE.DirectionalLight(0xffe9c4, 1.05);
  sun.position.set(16, 34, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;
  c.left = -26; c.right = 26; c.top = 24; c.bottom = -24; c.near = 4; c.far = 90;
  sun.shadow.bias = -0.0012;
  scene.add(sun);
  const warm = new THREE.PointLight(0xff7a28, 1.5, 44, 2);
  warm.position.set(-22, 6, 0); scene.add(warm);
  const cool = new THREE.PointLight(0x4f86ff, 1.2, 44, 2);
  cool.position.set(22, 6, 0); scene.add(cool);
}

function roundedRectShape(hx, hz, r) {
  const s = new THREE.Shape();
  const x = hx - r, z = hz - r;
  s.moveTo(-x, -hz);
  s.lineTo(x, -hz);
  s.absarc(x, -z, r, -Math.PI / 2, 0, false);
  s.lineTo(hx, z);
  s.absarc(x, z, r, 0, Math.PI / 2, false);
  s.lineTo(-x, hz);
  s.absarc(-x, z, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hx, -z);
  s.absarc(-x, -z, r, Math.PI, Math.PI * 1.5, false);
  s.closePath();
  return s;
}

function floorTexture() {
  const S = 1024, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#2b2f3c'; g.fillRect(0, 0, S, S);
  // veteado de piedra
  for (let i = 0; i < 2600; i++) {
    const x = frand() * S, y = frand() * S, r = frand() * 46 + 6;
    g.fillStyle = `rgba(${140 + firnd(50)},${138 + firnd(46)},${150 + firnd(50)},${0.018 + frand() * 0.04})`;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  // losas
  g.strokeStyle = 'rgba(8,10,16,.55)'; g.lineWidth = 3;
  const cell = S / 16;
  for (let i = 1; i < 16; i++) {
    g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, S); g.stroke();
    g.beginPath(); g.moveTo(0, i * cell); g.lineTo(S, i * cell); g.stroke();
  }
  // grietas
  g.strokeStyle = 'rgba(6,8,12,.5)'; g.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    g.beginPath();
    let x = frand() * S, y = frand() * S;
    g.moveTo(x, y);
    for (let k = 0; k < 7; k++) { x += frnd(-70, 70); y += frnd(-70, 70); g.lineTo(x, y); }
    g.stroke();
  }
  // círculos centrales
  const cx = S / 2;
  g.strokeStyle = 'rgba(229,167,67,.30)'; g.lineWidth = 5;
  g.beginPath(); g.arc(cx, cx, 150, 0, TAU); g.stroke();
  g.lineWidth = 2.5;
  g.beginPath(); g.arc(cx, cx, 176, 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(229,167,67,.2)';
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 152, cx + Math.sin(a) * 152);
    g.lineTo(cx + Math.cos(a) * 174, cx + Math.sin(a) * 174);
    g.stroke();
  }
  // emblema: dos hojas cruzadas estilizadas
  g.save(); g.translate(cx, cx); g.strokeStyle = 'rgba(229,167,67,.34)'; g.lineWidth = 9; g.lineCap = 'round';
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    g.save(); g.rotate(a);
    g.beginPath(); g.moveTo(-96, 0); g.lineTo(96, 0); g.stroke();
    g.beginPath(); g.moveTo(70, -22); g.lineTo(96, 0); g.lineTo(70, 22); g.stroke();
    g.restore();
  }
  g.restore();
  // zonas de aparición
  const paint = (px, col) => {
    const grd = g.createRadialGradient(px, cx, 10, px, cx, 130);
    grd.addColorStop(0, col); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(px, cx, 130, 0, TAU); g.fill();
  };
  paint(96, 'rgba(74,158,240,.26)');
  paint(S - 96, 'rgba(232,87,76,.26)');
  const tex = new THREE.CanvasTexture(cv);
  if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4;
  return tex;
}

function buildArena() {
  const shape = roundedRectShape(ARENA.hx, ARENA.hz, ARENA.r);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 3.2, bevelEnabled: true, bevelThickness: .28, bevelSize: .34, bevelSegments: 2, curveSegments: 20 });
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.translate(0, -bb.max.y, 0);          // la cara superior queda a ras de y = 0
  const uv = geo.attributes.uv, pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getZ(i) - bb.min.z) / (bb.max.z - bb.min.z));
  }
  const mat = new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: .92, metalness: .06 });
  floorMesh = new THREE.Mesh(geo, mat);
  floorMesh.position.y = -0.03;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  // borde luminoso
  const pts = shape.getPoints(140).map(p => new THREE.Vector3(p.x, 0.07, -p.y));
  pts.push(pts[0].clone());
  const lg = new THREE.BufferGeometry().setFromPoints(pts);
  ringMesh = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xe5a743, transparent: true, opacity: .85 }));
  scene.add(ringMesh);
  const lg2 = lg.clone(); lg2.translate(0, -0.55, 0);
  scene.add(new THREE.Line(lg2, new THREE.LineBasicMaterial({ color: 0xff7a28, transparent: true, opacity: .32 })));

  // anillo de muerte súbita: mismo contorno, escalado
  const sdPts = shape.getPoints(120).map(p => new THREE.Vector3(p.x, 0, -p.y));
  sdPts.push(sdPts[0].clone());
  sdRing = new THREE.Line(new THREE.BufferGeometry().setFromPoints(sdPts),
    new THREE.LineBasicMaterial({ color: 0xff5530, transparent: true, opacity: .9 }));
  sdRing.position.y = 0.14; sdRing.visible = false;
  scene.add(sdRing);

  // pilares
  ARENA.pillars = [{ x: -8.6, z: -4.9, r: 1.45 }, { x: 8.6, z: -4.9, r: 1.45 }, { x: -8.6, z: 4.9, r: 1.45 }, { x: 8.6, z: 4.9, r: 1.45 }];
  const pgeo = new THREE.CylinderGeometry(1.2, 1.5, 4.6, 12, 1);
  const pmat = new THREE.MeshStandardMaterial({ color: 0x39405a, roughness: .8, metalness: .18 });
  const rgeo = new THREE.TorusGeometry(1.34, .07, 6, 18);
  const rmat = new THREE.MeshBasicMaterial({ color: 0xe5a743, transparent: true, opacity: .6 });
  for (const p of ARENA.pillars) {
    const m = new THREE.Mesh(pgeo, pmat);
    m.position.set(p.x, 2.3, p.z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
    for (const y of [1.2, 3.4]) {
      const r = new THREE.Mesh(rgeo, rmat);
      r.rotation.x = Math.PI / 2; r.position.set(p.x, y, p.z); scene.add(r);
    }
  }
  // rocas flotantes de ambiente
  const rock = new THREE.MeshStandardMaterial({ color: 0x1b2030, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const s = frnd(1.2, 4.2);
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rock);
    const a = frand() * TAU, d = frnd(26, 48);
    m.position.set(Math.cos(a) * d, frnd(-14, -3), Math.sin(a) * d * .8);
    m.rotation.set(frand() * 3, frand() * 3, frand() * 3);
    scene.add(m);
  }
}

function buildEmbers() {
  const N = 320, pos = new Float32Array(N * 3), spd = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = frnd(-26, 26); pos[i * 3 + 1] = frnd(-6, 20); pos[i * 3 + 2] = frnd(-20, 20);
    spd[i] = frnd(.5, 2.1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  embers = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xff9a45, size: .17, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
  embers.userData.spd = spd;
  scene.add(embers);
}

function updateEmbers(dt) {
  const p = embers.geometry.attributes.position, spd = embers.userData.spd;
  for (let i = 0; i < spd.length; i++) {
    let y = p.getY(i) + spd[i] * dt;
    if (y > 21) { y = -7; p.setX(i, frnd(-26, 26)); p.setZ(i, frnd(-20, 20)); }
    p.setY(i, y);
  }
  p.needsUpdate = true;
}

/* ============================ cámara ============================ */
function fitCamera() {
  const corners = [[-ARENA.hx, -ARENA.hz], [ARENA.hx, -ARENA.hz], [ARENA.hx, ARENA.hz], [-ARENA.hx, ARENA.hz]];
  let d = 30;
  const test = new THREE.Vector3();
  for (let i = 0; i < 60; i++) {
    camera.position.set(0, d * Math.sin(CAM.tilt), d * Math.cos(CAM.tilt));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
    let ok = true;
    for (const c of corners) {
      test.set(c[0], 1.2, c[1]).project(camera);
      if (Math.abs(test.x) > .96 || Math.abs(test.y) > .93) { ok = false; break; }
    }
    if (ok) break;
    d *= 1.045;
  }
  CAM.follow = d > 64;
  CAM.dist = CAM.follow ? 42 : d;
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  fitCamera();
  document.body.classList.toggle('portrait', h > w);
}

function updateCamera(dt) {
  let tx = 0, tz = 0;
  if (CAM.follow && G.player) {
    tx = clamp(G.player.pos.x * .62, -9.5, 9.5);
    tz = clamp(G.player.pos.z * .55, -6, 6);
  }
  const k = damp(0.002, dt);
  CAM.tgt.x = lerp(CAM.tgt.x, tx, k);
  CAM.tgt.z = lerp(CAM.tgt.z, tz, k);
  if (G.camShake > 0) {
    G.camShake = Math.max(0, G.camShake - dt * 2.4);
    const s = G.camShake * G.camShake * 1.5;
    CAM.shake.set(frnd(-s, s), frnd(-s, s), frnd(-s, s));
  } else CAM.shake.set(0, 0, 0);
  camera.position.set(
    CAM.tgt.x + CAM.shake.x,
    CAM.dist * Math.sin(CAM.tilt) + CAM.shake.y,
    CAM.tgt.z + CAM.dist * Math.cos(CAM.tilt) + CAM.shake.z);
  camera.lookAt(CAM.tgt.x, 0, CAM.tgt.z);
}
function shake(a) { G.camShake = Math.min(1.6, G.camShake + a); }

/* ============================ entrada ============================ */
const Input = {
  keys: Object.create(null), mouse: { x: 0, y: 0 }, m1: false, m2: false, shift: false,
  aim: new THREE.Vector3(1, 0, 0), aimDir: { x: 1, z: 0 },
  touch: false, moveVec: { x: 0, z: 0 }, tAim: { x: 0, z: 0 }, tFire: false,
  queued: null
};
const _ray = new THREE.Raycaster(), _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0), _ndc = new THREE.Vector2();

function screenToGround(cx, cy, out) {
  _ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  _ray.setFromCamera(_ndc, camera);
  if (!_ray.ray.intersectPlane(_plane, out)) out.set(0, 1, 0);
  return out;
}

function initInput() {
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'shift') Input.shift = true;
    Input.keys[k] = true;
    if (k === 'escape') { e.preventDefault(); togglePause(); }
    if ([' ', 'q', 'e', 'r', 'f', 'w', 'a', 's', 'd'].includes(k)) e.preventDefault();
  });
  addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k === 'shift') Input.shift = false;
    Input.keys[k] = false;
  });
  addEventListener('blur', () => { Input.keys = Object.create(null); Input.m1 = Input.m2 = false; });
  const cv = $('gl');
  cv.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    Input.mouse.x = e.clientX; Input.mouse.y = e.clientY;
  });
  cv.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    if (e.button === 0) Input.m1 = true;
    if (e.button === 2) Input.m2 = true;
  });
  addEventListener('pointerup', e => {
    if (e.pointerType === 'touch') return;
    if (e.button === 0) Input.m1 = false;
    if (e.button === 2) Input.m2 = false;
  });
  Input.touch = matchMedia('(pointer:coarse)').matches;
  if (Input.touch) initTouch();
}

function updateAim() {
  if (Input.touch && (Input.tAim.x || Input.tAim.z)) {
    Input.aimDir.x = Input.tAim.x; Input.aimDir.z = Input.tAim.z;
    if (G.player) Input.aim.set(G.player.pos.x + Input.tAim.x * 12, 1, G.player.pos.z + Input.tAim.z * 12);
    return;
  }
  screenToGround(Input.mouse.x, Input.mouse.y, Input.aim);
  if (G.player) {
    const dx = Input.aim.x - G.player.pos.x, dz = Input.aim.z - G.player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    Input.aimDir.x = dx / d; Input.aimDir.z = dz / d;
  }
}

function moveInput() {
  if (Input.touch) return { x: Input.moveVec.x, z: Input.moveVec.z };
  let x = 0, z = 0;
  if (Input.keys['w'] || Input.keys['arrowup']) z -= 1;
  if (Input.keys['s'] || Input.keys['arrowdown']) z += 1;
  if (Input.keys['a'] || Input.keys['arrowleft']) x -= 1;
  if (Input.keys['d'] || Input.keys['arrowright']) x += 1;
  const d = Math.hypot(x, z);
  return d > 0 ? { x: x / d, z: z / d } : { x: 0, z: 0 };
}

/* ---- comando de entrada ---- */
/* La entrada entra en la simulación como un dato plano, nunca leyendo el
   teclado desde dentro del bucle. Así se puede guardar, enviar por la red y
   volver a aplicar, que es justo lo que hará la reconciliación del cliente
   cuando exista el modo online; y de paso una repetición pasa a ser la semilla
   más la lista de comandos.

   Las direcciones van cuantizadas a 256 pasos (1,4°) y la distancia de
   apuntado a decímetros: sobra para un proyectil de radio 0,3 a 26 m, y deja
   el comando en 5 bytes más el número de secuencia. */
const CMD_STILL = 255;                    // `move` cuando no te estás moviendo
const BTN = { M1: 1, M2: 2, SP: 4, Q: 8, E: 16, F: 32, R: 64 };

function dirToByte(x, z) { return ((Math.atan2(x, z) / TAU * 256 + 256.5) | 0) & 255; }
function byteToDir(b, out) {
  const a = b / 256 * TAU;
  out.x = Math.sin(a); out.z = Math.cos(a);
  return out;
}

function sampleInput(seq) {
  updateAim();
  const f = G.player;
  const mv = moveInput();
  const dx = Input.aim.x - (f ? f.pos.x : 0), dz = Input.aim.z - (f ? f.pos.z : 0);
  let buttons = 0, ex = Input.shift || Input.exMode;
  if (Input.queued) {
    buttons |= 1 << Input.queued.i;
    if (Input.queued.ex) ex = true;
    Input.queued = null;
    if (Input.exMode) { Input.exMode = false; syncEx(); }
  }
  if (Input.m1 || (Input.touch && Input.tFire)) buttons |= BTN.M1;
  if (Input.m2) buttons |= BTN.M2;
  if (Input.keys[' ']) buttons |= BTN.SP;
  if (Input.keys['q']) buttons |= BTN.Q;
  if (Input.keys['e']) buttons |= BTN.E;
  if (Input.keys['f']) buttons |= BTN.F;
  if (Input.keys['r']) buttons |= BTN.R;
  return {
    seq,
    move: (mv.x || mv.z) ? dirToByte(mv.x, mv.z) : CMD_STILL,
    aim: dirToByte(Input.aimDir.x, Input.aimDir.z),
    aimD: clamp(Math.round(Math.hypot(dx, dz) * 10), 0, 255),
    buttons, ex: ex ? 1 : 0
  };
}

/* --- controles táctiles --- */
function initTouch() {
  $('touch').classList.remove('hidden');
  const mk = (node, onMove, onEnd) => {
    let id = null; const R = 52;
    const nub = node.querySelector('.nub');
    const rect = () => node.getBoundingClientRect();
    node.addEventListener('pointerdown', e => {
      if (id !== null) return;
      id = e.pointerId; node.setPointerCapture(id); handle(e);
    });
    node.addEventListener('pointermove', e => { if (e.pointerId === id) handle(e); });
    const up = e => {
      if (e.pointerId !== id) return;
      id = null; nub.style.transform = '';
      onMove(0, 0); if (onEnd) onEnd();
    };
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    function handle(e) {
      const r = rect();
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      const k = d > R ? R / d : 1;
      nub.style.transform = `translate(${dx * k}px,${dy * k}px)`;
      const n = Math.max(d, 1);
      onMove(dx / n * Math.min(1, d / R), dy / n * Math.min(1, d / R));
    }
  };
  mk($('stick-l'), (x, y) => { Input.moveVec.x = x; Input.moveVec.z = y; });
  mk($('stick-r'), (x, y) => {
    const d = Math.hypot(x, y);
    if (d > .25) { Input.tAim.x = x / d; Input.tAim.z = y / d; Input.tFire = true; }
    else Input.tFire = false;
  }, () => { Input.tFire = false; });
}

/* ============================ sonido ============================ */
const SFX = {
  ctx: null, gain: null, on: true,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = .22;
    this.gain.connect(this.ctx.destination);
  },
  tone(f0, f1, dur, type, vol, delay) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + (delay || 0);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol == null ? .5 : vol, t + .008);
    g.gain.exponentialRampToValueAtTime(.0008, t + dur);
    o.connect(g); g.connect(this.gain);
    o.start(t); o.stop(t + dur + .03);
  },
  noise(dur, vol, hp) {
    if (!this.on || !this.ctx) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (frand() * 2 - 1) * (1 - i / n);   /* ruido: presentación */
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 600;
    const g = this.ctx.createGain(); g.gain.value = vol == null ? .3 : vol;
    s.connect(f); f.connect(g); g.connect(this.gain); s.start();
  },
  shot() { this.tone(760, 320, .09, 'square', .18); },
  hit() { this.tone(200, 90, .12, 'sawtooth', .22); this.noise(.07, .12, 900); },
  big() { this.tone(160, 48, .34, 'sawtooth', .3); this.noise(.2, .2, 300); },
  heal() { this.tone(520, 880, .2, 'sine', .2); },
  dash() { this.noise(.18, .16, 1400); },
  cast() { this.tone(300, 620, .12, 'triangle', .15); },
  ult() { this.tone(120, 500, .5, 'sawtooth', .28); this.tone(240, 1000, .5, 'square', .12, .05); },
  die() { this.tone(300, 60, .5, 'sawtooth', .26); },
  orb() { this.tone(660, 1320, .16, 'sine', .2); },
  round() { this.tone(392, 392, .16, 'triangle', .26); this.tone(523, 523, .16, 'triangle', .26, .16); this.tone(784, 784, .3, 'triangle', .3, .32); },
  win() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, .3, 'triangle', .26, i * .12)); },
  lose() { [440, 370, 294, 220].forEach((f, i) => this.tone(f, f, .34, 'sine', .24, i * .14)); },
  tick() { this.tone(900, 900, .06, 'square', .14); }
};
