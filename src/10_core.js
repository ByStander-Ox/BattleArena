'use strict';
/* ============================ utilidades ============================ */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const damp = (rate, dt) => 1 - Math.pow(rate, dt);
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
  fighters: [], projectiles: [], zones: [], pickups: [],
  byId: new Map(),         // uid -> luchador; las entidades se refieren por id
  events: [],              // lo ocurrido en el paso, para que lo lea la vista
  player: null, t: 0, dt: 0, paused: false,
  round: 1, score: [0, 0], roundTime: 0, sudden: false, shrink: 1,
  picks: 0, timeScale: 1, nextOrb: 0, nextHeal: 0, started: false,
  firstBlood: false, order: 0, relicOptions: null,
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

/* ============================ eventos ============================ */
/* La simulación no dibuja ni suena: anota lo que ha pasado y sigue. La vista
   vacía la cola cada fotograma y decide qué hacer con cada anotación.

   Es lo que permite que este mismo código corra en un servidor sin escena ni
   audio, y lo que viajará por la red cuando exista el modo online: por eso los
   eventos llevan identificadores y números, nunca referencias a objetos ni
   texto ya compuesto. Quien decide que «Vesk elimina a Brakk» se lee así es la
   vista, a partir de `{e:'kill', id, byId}`. */
function emit(ev) { G.events.push(ev); return ev; }

const sfx = id => emit({ e: 'sfx', id });
const fxNum = (p, text, cls) => emit({ e: 'num', x: p.x, z: p.z, text, cls });
const fxHit = (x, z, col) => emit({ e: 'hit', x, z, col });
const fxPuff = (p, col, n, scale) => emit({ e: 'puff', x: p.x, y: p.y || 0, z: p.z, col, n, scale });
const fxRing = (p, radius, col) => emit({ e: 'ring', x: p.x, z: p.z, radius, col });
const fxArc = (p, a0, half, range, col) => emit({ e: 'arc', x: p.x, z: p.z, a0, half, range, col });
const fxShake = a => emit({ e: 'shake', a });

/* ============================ comando de entrada ============================ */
/* La entrada entra en la simulación como un dato plano, nunca leyendo el
   teclado desde dentro del bucle. Así se puede guardar, enviar por la red y
   volver a aplicar, que es justo lo que hará la reconciliación del cliente
   cuando exista el modo online; y de paso una repetición pasa a ser la semilla
   más la lista de comandos.

   El formato es contrato de simulación, no de interfaz: `applyInput` lo
   consume y un servidor lo recibirá por la red. Quien lo produce leyendo el
   teclado es la vista.

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
