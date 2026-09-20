/* ---- simulación sin render ----

   Reproduce a mano el bucle de simStep() (60_loop.js), porque este banco de
   pruebas no carga la capa de partida ni la interfaz: lleva su propio ritmo de
   ronda. Si tocas el orden de simStep, tócalo también aquí o las dos cosas
   medirán cosas distintas.

   Parámetros por variable de entorno:
     SIM_SEED=123   semilla (misma semilla = misma partida, paso a paso)
     SIM_ROUNDS=60  rondas a simular (12 es ruido; 40-60 ya es señal)          */

scene = { add() { }, remove() { } };

const env = (typeof process !== 'undefined' && process.env) || {};
const SEED = typeof SIM_SEED === 'number' ? SIM_SEED : Number(env.SIM_SEED || 20260919);
const ROUNDS = typeof SIM_ROUNDS === 'number' ? SIM_ROUNDS : Number(env.SIM_ROUNDS || 12);
const QUIET = typeof SIM_QUIET !== 'undefined' ? !!SIM_QUIET : !!env.SIM_QUIET;
seedSim(SEED);

const castCount = {};
const _tryCast = tryCast;
tryCast = function (f, i, ex) {
  const ok = _tryCast(f, i, ex);
  if (ok) {
    const key = f.champ.id + '.' + f.champ.ab[i].k + (ex ? '+EX' : '');
    castCount[key] = (castCount[key] || 0) + 1;
  }
  return ok;
};

function spawnPoints(team, n) {
  const x = team === 0 ? -14.5 : 14.5;
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x, z: (i - (n - 1) / 2) * 3.4, a: team === 0 ? Math.PI / 2 : -Math.PI / 2 });
  return out;
}

const SIZE = 3;
G.mode = MODES.squad; G.wins = 3; G.playerTeam = 0; G.roundLimit = 110; G.diff = 'hard';
const comp = [['brakk', 'lumen', 'vesk'], ['vesk', 'brakk', 'lumen']];
for (let t = 0; t < 2; t++) {
  comp[t].slice(0, SIZE).forEach((cid, i) => {
    const f = makeFighter(cid, t, true, cid + t + i);
    makeAI(f, 'hard');
    G.fighters.push(f);
  });
}
// reliquias variadas para ejercitar los modificadores
for (const f of G.fighters) for (let k = 0; k < 5; k++) applyRelic(f, RELICS[(f.uid * 3 + k * 5) % RELICS.length]);

let rounds = 0, wins = [0, 0], totalDmg = 0;
function newRound() {
  for (const t of [0, 1]) {
    const pts = spawnPoints(t, SIZE);
    let i = 0;
    for (const f of G.fighters) if (f.team === t) { const p = pts[i++]; resetFighter(f, p.x, p.z, p.a); }
  }
  clearTransient();
  G.roundTime = 0; G.sudden = false; G.shrink = 1; G.state = 'live';
  G.nextOrb = 12; G.nextHeal = 18;
}
newRound();

const t0 = Date.now();
const budget = 60 * 130 * (ROUNDS + 1);        // techo de pasos, por si nadie muere
for (let step = 0; step < budget; step++) {
  G.t += STEP;
  G.roundTime += STEP;
  G.nextOrb -= STEP; G.nextHeal -= STEP;
  if (G.nextOrb <= 0) { G.nextOrb = 24; spawnPickup('energy', 0, 0); }
  if (G.nextHeal <= 0) { G.nextHeal = 30; spawnPickup('health', 0, -9.6); spawnPickup('health', 0, 9.6); }
  const sdStart = 55;
  if (!G.sudden && G.roundTime > sdStart) G.sudden = true;
  if (G.sudden) G.shrink = Math.max(.26, 1 - (G.roundTime - sdStart) / 42 * .72);

  for (const f of G.fighters) { f.px = f.pos.x; f.pz = f.pos.z; f.pface = f.face; }
  for (const p of G.projectiles) { p.px = p.x; p.pz = p.z; }
  G.order++;
  const ord = fightersInOrder();
  for (const f of ord) if (f.alive) updateAI(f, STEP);
  for (const f of ord) tickFighter(f, STEP);
  updateProjectiles(STEP);
  updateZones(STEP);
  updatePickups(STEP);
  updateFx(STEP);
  for (const f of G.fighters) {
    f.velEst.x = (f.pos.x - f.px) / STEP;
    f.velEst.z = (f.pos.z - f.pz) / STEP;
    if (!isFinite(f.pos.x) || !isFinite(f.pos.z)) throw new Error('posición NaN en ' + f.name);
    if (f.alive && !insideArena(f.pos.x, f.pos.z, -1.5, 1) && !f.falling) throw new Error('fuera de la arena: ' + f.name + ' ' + f.pos.x.toFixed(1) + ',' + f.pos.z.toFixed(1));
  }
  const alive = [0, 0];
  for (const f of G.fighters) if (f.alive) alive[f.team]++;
  if (alive[0] === 0 || alive[1] === 0 || G.roundTime > 110) {
    rounds++;
    if (alive[0] > 0) wins[0]++; else if (alive[1] > 0) wins[1]++;
    if (rounds >= ROUNDS) break;
    newRound();
  }
}
for (const f of G.fighters) totalDmg += f.stats.dmg;

/* Huella: resume el estado final en un número. Dos ejecuciones con la misma
   semilla deben coincidir; si no, algo consume azar sin semilla o el orden de
   actualización cambió. No incluye tiempos ni nada del reloj de pared. */
function fingerprint() {
  const parts = [rounds, wins.join('-')];
  for (const f of G.fighters) {
    parts.push([f.uid, f.name, f.hp, f.energy, f.pos.x, f.pos.z, f.face,
      f.stats.dmg, f.stats.heal, f.stats.taken, f.stats.kills].join(','));
  }
  for (const k of Object.keys(castCount).sort()) parts.push(k + '=' + castCount[k]);
  let h = 0x811c9dc5;                                  // FNV-1a
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return ('0000000' + h.toString(16)).slice(-8);
}

if (!QUIET) {
  console.log('semilla:', SEED, '· rondas simuladas:', rounds, '· marcador', wins.join('-'), '· ms', Date.now() - t0);
  console.log('daño total:', Math.round(totalDmg), '· curación:', Math.round(G.fighters.reduce((a, f) => a + f.stats.heal, 0)));
  console.log('proyectiles vivos:', G.projectiles.length, '· zonas:', G.zones.length, '· fx:', G.fx.length, '· orbes:', G.pickups.length);
  const used = Object.keys(castCount).sort();
  console.log('habilidades usadas (' + used.length + '):');
  for (const k of used) console.log('   ', k, castCount[k]);
  const missing = [];
  for (const id of CHAMP_LIST) for (const ab of CHAMPS[id].ab) if (!castCount[id + '.' + ab.k] && !castCount[id + '.' + ab.k + '+EX']) missing.push(id + '.' + ab.k);
  console.log('sin usar:', missing.length ? missing.join(', ') : 'ninguna');
}
console.log('huella:', fingerprint());
