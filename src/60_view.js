/* ============================ vista: motor y escena ============================ */
/* De aquí para abajo empieza la mitad que se puede tirar entera sin que el
   juego deje de funcionar: nada de este archivo decide nada, solo mira el
   estado de la simulación y lo convierte en píxeles.

   La escena se mantiene sincronizada por reconciliación, no por mensajes:
   `syncView()` recorre las listas de entidades, crea la malla de las nuevas y
   destruye la de las que ya no están. Es más corto que emitir un evento por
   cada nacimiento y muerte, no se pierde nada si un evento se cae, y es justo
   lo que tendrá que hacer un cliente al recibir instantáneas por la red.   */
const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const TEAM_COL = [0x4a9ef0, 0xe8574c];

/* ============================ motor ============================ */
let renderer, scene, camera, clock, floorMesh, ringMesh, sdRing, embers;
const CAM = { tilt: 0.985, dist: 46, follow: false, amt: 0, tgt: new THREE.Vector3(), shake: new THREE.Vector3() };
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
  if (CAM.amt > 0) {
    CAM.amt = Math.max(0, CAM.amt - dt * 2.4);
    const s = CAM.amt * CAM.amt * 1.5;
    CAM.shake.set(frnd(-s, s), frnd(-s, s), frnd(-s, s));
  } else CAM.shake.set(0, 0, 0);
  camera.position.set(
    CAM.tgt.x + CAM.shake.x,
    CAM.dist * Math.sin(CAM.tilt) + CAM.shake.y,
    CAM.tgt.z + CAM.dist * Math.cos(CAM.tilt) + CAM.shake.z);
  camera.lookAt(CAM.tgt.x, 0, CAM.tgt.z);
}
function shake(a) { CAM.amt = Math.min(1.6, CAM.amt + a); }


const MAT = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .68, metalness: .12 }, o || {}));

function limb(g, geo, mat, x, y, z, rx, rz) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (rx) m.rotation.x = rx;
  if (rz) m.rotation.z = rz;
  m.castShadow = true;
  g.add(m);
  return m;
}


/* ---------- mallas de cada campeón ---------- */
/* Con three.js r128 no existe CapsuleGeometry: todo se monta con cilindros,
   esferas y conos. Añadir un campeón es añadir una entrada aquí y otra en
   CHAMPS de 20_champs.js. */
const CHAMP_MESH = {
  vesk(g) {

      const cloth = MAT(0x2f6d56), skin = MAT(0xdfb894), dark = MAT(0x1d2b28);
      limb(g, new THREE.CylinderGeometry(.3, .44, 1.0, 10), cloth, 0, .6, 0);
      limb(g, new THREE.SphereGeometry(.27, 14, 12), skin, 0, 1.32, 0);
      const hood = limb(g, new THREE.ConeGeometry(.36, .5, 10), cloth, 0, 1.46, -.05);
      hood.rotation.x = -.12;
      limb(g, new THREE.BoxGeometry(.1, .62, .1), dark, .42, 1.0, .12, .35, .5);
      const bow = limb(g, new THREE.TorusGeometry(.42, .05, 5, 12, Math.PI * 1.15), dark, .46, .98, .2);
      bow.rotation.set(Math.PI / 2, 0, .4);
      return g;
  },
  brakk(g) {

      const iron = MAT(0x7a5236, { metalness: .35, roughness: .6 }), skin = MAT(0xc9a07c), dark = MAT(0x39332c);
      g.scale.setScalar(1.16);
      limb(g, new THREE.CylinderGeometry(.42, .5, 1.05, 10), iron, 0, .62, 0);
      limb(g, new THREE.SphereGeometry(.28, 14, 12), skin, 0, 1.36, 0);
      limb(g, new THREE.SphereGeometry(.25, 10, 8), iron, .48, 1.08, 0);
      limb(g, new THREE.SphereGeometry(.25, 10, 8), iron, -.48, 1.08, 0);
      limb(g, new THREE.BoxGeometry(.12, .9, .12), dark, .6, .78, .22, .5);
      limb(g, new THREE.BoxGeometry(.42, .34, .5), dark, .72, 1.18, .42);
      return g;
  },
  lumen(g) {

      const robe = MAT(0x3b5a96), trim = MAT(0xdfe7f7), skin = MAT(0xe3c5a6);
      limb(g, new THREE.ConeGeometry(.52, 1.25, 12), robe, 0, .62, 0);
      limb(g, new THREE.SphereGeometry(.26, 14, 12), skin, 0, 1.36, 0);
      limb(g, new THREE.TorusGeometry(.3, .05, 6, 14), trim, 0, 1.14, 0, Math.PI / 2);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(.22, 14, 12), new THREE.MeshBasicMaterial({ color: 0xbfe0ff }));
      orb.position.set(.5, 1.25, .34);
      g.add(orb); g.userData.orb = orb;
      return g;
  }
};

/* ============================ estado → escena ============================ */
/* La escena se mantiene al día por reconciliación, no por mensajes: se recorren
   las listas de entidades, se crea la malla de las que no la tienen y se
   destruye la de las que ya no están. Es más corto que emitir un evento por
   cada nacimiento y cada muerte, no se pierde nada si un evento se cae, y es
   exactamente lo que tendrá que hacer un cliente al recibir instantáneas.

   Las mallas viven aquí, en mapas indexados por id, nunca colgadas de la
   entidad: el estado de juego tiene que poder serializarse. */
const VIEW = { fighter: new Map(), proj: new Map(), zone: new Map(), pickup: new Map() };
const _live = new Set();

function syncGroup(list, store, idOf, make, kill) {
  _live.clear();
  for (const e of list) {
    const id = idOf(e);
    _live.add(id);
    if (!store.has(id)) store.set(id, make(e));
  }
  for (const [id, v] of store) {
    if (_live.has(id)) continue;
    kill(v);
    store.delete(id);
  }
}

function disposeMesh(m) {
  scene.remove(m);
  if (m.geometry) m.geometry.dispose();
  if (m.material && m.material.dispose) m.material.dispose();
}

/* ---------- luchador ---------- */
function makeFighterMesh(f) {
  const g = new THREE.Group();
  const ringGeo = new THREE.RingGeometry(.58, .8, 26);
  ringGeo.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: TEAM_COL[f.team], transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false }));
  ring.position.y = .04;
  g.add(ring);
  const body = new THREE.Group();
  (CHAMP_MESH[f.champ.id] || CHAMP_MESH.vesk)(body);
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.15, .38, 6), new THREE.MeshBasicMaterial({ color: TEAM_COL[f.team] }));
  nose.rotation.x = Math.PI / 2; nose.position.set(0, .92, .58);
  g.add(nose);
  // tinte de equipo en el material principal
  body.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.castShadow = true; } });
  g.userData = { body, ring, base: body.scale.x || 1 };
  g.position.set(f.pos.x, 0, f.pos.z);
  g.rotation.set(0, f.face, 0);
  scene.add(g);
  return g;
}

/* `alpha` dice qué fracción del siguiente paso lleva acumulada el fotograma.
   Interpolar entre la posición anterior y la nueva es lo que mantiene el
   movimiento suave también a 120 o 144 Hz, donde un paso fijo sin interpolar
   se vería a tirones. Todo lo demás se deriva del estado: la simulación ya no
   escribe en las mallas. */
function updateFighterVisual(f, alpha) {
  const m = VIEW.fighter.get(f.uid);
  if (!m) return;
  if (f.falling) {                       // cayendo al vacío, derivado del temporizador
    m.visible = true;
    m.position.set(f.pos.x, -f.falling * 14, f.pos.z);
    m.rotation.z = f.falling * 3;
    return;
  }
  if (!f.alive) {                        // derrumbe, derivado de deadT
    m.visible = f.deadT <= 1.4;
    m.rotation.x = Math.min(Math.PI / 2, f.deadT * 4);
    m.position.y = Math.max(-1.2, -f.deadT * .6);
    return;
  }
  m.visible = true;
  m.rotation.x = 0; m.rotation.z = 0;
  m.position.x = lerp(f.px, f.pos.x, alpha);
  m.position.z = lerp(f.pz, f.pos.z, alpha);
  m.position.y = Math.abs(Math.sin(f.bob)) * .06 + (f.anim > 0 ? .1 : 0);
  m.rotation.y = f.pface + angDiff(f.face, f.pface) * alpha;
  const b = m.userData.body;
  const pulse = f.anim > 0 ? 1 + f.anim * .5 : 1;
  b.scale.setScalar(m.userData.base * pulse);
  b.rotation.z = Math.sin(f.bob) * .05;
  // parpadeo al recibir daño / estado
  const flash = f.hitFlash > 0;
  b.traverse(o => {
    if (!o.isMesh || !o.material.emissive) return;
    if (flash) o.material.emissive.setHex(0x883322);
    else if (f.st.stun > 0) o.material.emissive.setHex(0x554400);
    else if (f.shield > 0) o.material.emissive.setHex(0x223355);
    else o.material.emissive.setHex(0x000000);
  });
  m.userData.ring.material.opacity = f.st.invuln > 0 ? .3 : .8;
  // la estela del desplazamiento se deduce de f.dash: no hace falta evento
  if (f.dash && f.dash.trail && frand() < .5) puff(f.pos, f.dash.trail, 2, .5);
}

/* ---------- proyectil ---------- */
function makeProjMesh(p) {
  const geo = p.flat ? new THREE.BoxGeometry(p.radius * 2.2, .3, .7)
                     : new THREE.SphereGeometry(Math.max(.18, p.radius * .8), 10, 8);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: p.col }));
  if (!p.flat) m.scale.set(1, 1, p.scale * 1.7);
  m.position.set(p.x, 1.0, p.z);
  m.rotation.y = Math.atan2(p.dx, p.dz);
  scene.add(m);
  return m;
}
function updateProjectileVisual(alpha) {
  for (const p of G.projectiles) {
    const m = VIEW.proj.get(p.id);
    if (m) m.position.set(lerp(p.px, p.x, alpha), 1.0, lerp(p.pz, p.z, alpha));
  }
}

/* ---------- zona ---------- */
function makeZoneMesh(z) {
  const geo = new THREE.CircleGeometry(z.radius, 40);
  geo.rotateX(-Math.PI / 2);
  const disc = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: z.col, transparent: true, opacity: .16, depthWrite: false }));
  disc.position.set(z.x, .06, z.z);
  scene.add(disc);
  const rg = new THREE.RingGeometry(z.radius * .96, z.radius, 44);
  rg.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: z.col, transparent: true, opacity: .6, depthWrite: false }));
  ring.position.copy(disc.position);
  scene.add(ring);
  return { disc, ring };
}
function updateZoneVisual(dt) {
  for (const z of G.zones) {
    const v = VIEW.zone.get(z.id);
    if (!v) continue;
    if (z.delay > 0) {                    // armándose: parpadeo de aviso
      v.disc.material.opacity = .05 + Math.abs(Math.sin(G.t * 9)) * .12;
      continue;
    }
    v.ring.rotation.y += dt * .6;
    v.disc.material.opacity = .13 + Math.sin(G.t * 3) * .03;
    if (z.rain && frand() < dt * 40) {
      const a = frand() * TAU, r = Math.sqrt(frand()) * z.radius;
      rainFx(z.x + Math.cos(a) * r, z.z + Math.sin(a) * r, z.col);
    }
  }
}

/* ---------- orbe ---------- */
function makePickupMesh(p) {
  const c = p.type === 'energy' ? 0xffcf5a : 0x5fd39a;
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(.5, 0), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: .7, roughness: .3 }));
  m.position.set(p.x, 1.1, p.z);
  m.castShadow = true;
  scene.add(m);
  const halo = new THREE.Mesh(new THREE.RingGeometry(.7, .95, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .5, depthWrite: false }));
  halo.position.set(p.x, .08, p.z);
  scene.add(halo);
  return { mesh: m, halo };
}
function updatePickupVisual(dt) {
  for (const p of G.pickups) {
    const v = VIEW.pickup.get(p.id);
    if (!v) continue;
    v.mesh.rotation.y += dt * 1.8;
    v.mesh.position.y = 1.1 + Math.sin(p.t * 2.4) * .18;
    v.halo.scale.setScalar(1 + Math.sin(p.t * 2.4) * .08);
  }
}

/* ---------- el borde de la arena ---------- */
function updateArenaVisual() {
  sdRing.visible = G.started && G.sudden;
  if (G.sudden) {
    sdRing.scale.set(G.shrink, 1, G.shrink);
    sdRing.material.opacity = .55 + Math.abs(Math.sin(G.t * 4)) * .45;
    ringMesh.material.opacity = .25;
  } else ringMesh.material.opacity = .85;
}

/* ---------- una pasada completa ---------- */
const _uidOf = f => f.uid, _idOf = e => e.id;
function syncView(alpha, dt) {
  syncGroup(G.fighters, VIEW.fighter, _uidOf, makeFighterMesh, disposeMesh);
  syncGroup(G.projectiles, VIEW.proj, _idOf, makeProjMesh, disposeMesh);
  syncGroup(G.zones, VIEW.zone, _idOf, makeZoneMesh, v => { disposeMesh(v.disc); disposeMesh(v.ring); });
  syncGroup(G.pickups, VIEW.pickup, _idOf, makePickupMesh, v => { disposeMesh(v.mesh); disposeMesh(v.halo); });

  for (const f of G.fighters) updateFighterVisual(f, alpha);
  updateProjectileVisual(alpha);
  updateZoneVisual(dt);
  updatePickupVisual(dt);
  updateArenaVisual();
}
