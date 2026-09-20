/* ---- simulación sin render ---- */
scene = { add() { }, remove() { } };
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

let rounds = 0, wins = [0, 0], falls = 0, totalDmg = 0;
const dt = 1 / 60;
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
for (let step = 0; step < 60 * 60 * 8; step++) {   // hasta 8 minutos simulados
  G.t += dt;
  G.roundTime += dt;
  G.nextOrb -= dt; G.nextHeal -= dt;
  if (G.nextOrb <= 0) { G.nextOrb = 24; spawnPickup('energy', 0, 0); }
  if (G.nextHeal <= 0) { G.nextHeal = 30; spawnPickup('health', 0, -9.6); spawnPickup('health', 0, 9.6); }
  const sdStart = 55;
  if (!G.sudden && G.roundTime > sdStart) G.sudden = true;
  if (G.sudden) G.shrink = Math.max(.26, 1 - (G.roundTime - sdStart) / 42 * .72);

  G.order++;
  const ord = fightersInOrder();
  for (const f of ord) if (f.alive) updateAI(f, dt);
  for (const f of ord) tickFighter(f, dt);
  updateProjectiles(dt);
  updateZones(dt);
  updatePickups(dt);
  updateFx(dt);
  for (const f of G.fighters) {
    f.velEst = f.velEst || { x: 0, z: 0 };
    f.velEst.x = (f.pos.x - (f._px || 0)) / dt; f.velEst.z = (f.pos.z - (f._pz || 0)) / dt;
    f._px = f.pos.x; f._pz = f.pos.z;
    if (!isFinite(f.pos.x) || !isFinite(f.pos.z)) throw new Error('posición NaN en ' + f.name);
    if (f.alive && !insideArena(f.pos.x, f.pos.z, -1.5, 1) && !f.falling) throw new Error('fuera de la arena: ' + f.name + ' ' + f.pos.x.toFixed(1) + ',' + f.pos.z.toFixed(1));
  }
  const alive = [0, 0];
  for (const f of G.fighters) if (f.alive) alive[f.team]++;
  if (alive[0] === 0 || alive[1] === 0 || G.roundTime > 110) {
    rounds++;
    if (alive[0] > 0) wins[0]++; else if (alive[1] > 0) wins[1]++;
    if (rounds >= 12) break;
    newRound();
  }
}
for (const f of G.fighters) totalDmg += f.stats.dmg;

console.log('rondas simuladas:', rounds, '· marcador', wins.join('-'), '· ms', Date.now() - t0);
console.log('daño total:', Math.round(totalDmg), '· curación:', Math.round(G.fighters.reduce((a, f) => a + f.stats.heal, 0)));
console.log('proyectiles vivos:', G.projectiles.length, '· zonas:', G.zones.length, '· fx:', G.fx.length, '· orbes:', G.pickups.length);
const used = Object.keys(castCount).sort();
console.log('habilidades usadas (' + used.length + '):');
for (const k of used) console.log('   ', k, castCount[k]);
const missing = [];
for (const id of CHAMP_LIST) for (const ab of CHAMPS[id].ab) if (!castCount[id + '.' + ab.k] && !castCount[id + '.' + ab.k + '+EX']) missing.push(id + '.' + ab.k);
console.log('sin usar:', missing.length ? missing.join(', ') : 'ninguna');
