/* ============================ bots ============================ */
const ROLE_RANGE = { 'Tirador': 8.6, 'Vanguardia': 2.5, 'Custodio': 7.4 };

function makeAI(f, diffId) {
  f.ai = {
    d: DIFFS[diffId] || DIFFS.normal,
    tgtId: 0, retgt: 0, think: 0, err: 0, strafe: chance(.5) ? 1 : -1, strafeT: 0,
    hold: 0, m1T: 0, panic: 0, want: { x: 0, z: 0 }
  };
}

function predictPos(t, time) {
  return { x: t.pos.x + (t.velEst ? t.velEst.x : 0) * time, z: t.pos.z + (t.velEst ? t.velEst.z : 0) * time };
}

function enemiesOf(f) { return G.fighters.filter(o => o.alive && o.team !== f.team); }
function alliesOf(f) { return G.fighters.filter(o => o.alive && o.team === f.team && o !== f); }

function updateAI(f, dt) {
  const ai = f.ai, D = ai.d;
  ai.think -= dt; ai.strafeT -= dt; ai.retgt -= dt; ai.hold -= dt;
  if (ai.strafeT <= 0) { ai.strafeT = rnd(.7, 1.9); if (chance(.5)) ai.strafe *= -1; }

  const foes = enemiesOf(f);
  if (!foes.length) { f.moveDir.x = f.moveDir.z = 0; return; }

  // objetivo: se guarda por id, no por referencia, para que el estado de la
  // IA se pueda serializar y rebobinar igual que el resto de la simulación
  let tgt = fighterById(ai.tgtId);
  if (!tgt || !tgt.alive || ai.retgt <= 0) {
    ai.retgt = rnd(1.2, 2.4);
    let best = null, bs = -1e9;
    for (const e of foes) {
      const d = dist(f.pos.x, f.pos.z, e.pos.x, e.pos.z);
      let s = -d * .6 + (1 - e.hp / e.maxHp) * 9;
      if (e === G.player) s += 1.5;
      if (s > bs) { bs = s; best = e; }
    }
    tgt = best;
    ai.tgtId = best ? best.uid : 0;
  }
  if (!tgt) { f.moveDir.x = f.moveDir.z = 0; return; }
  const d = dist(f.pos.x, f.pos.z, tgt.pos.x, tgt.pos.z);
  const want = ROLE_RANGE[f.champ.role] || 6;

  // ---- puntería con error y retardo de reacción ----
  if (ai.think <= 0) {
    ai.think = D.react;
    ai.err = rnd(-D.aimErr, D.aimErr);
  }
  const lead = predictPos(tgt, clamp(d / 34, .04, .5) + D.react * .5);
  let ax = lead.x - f.pos.x, az = lead.z - f.pos.z;
  const al = Math.hypot(ax, az) || 1;
  let a = Math.atan2(ax / al, az / al) + ai.err;
  const cur = Math.atan2(f.aimDir.x, f.aimDir.z);
  a = cur + angDiff(a, cur) * Math.min(1, dt * (6 + 16 * (1 - D.react)));
  f.aimDir.x = Math.sin(a); f.aimDir.z = Math.cos(a);
  f.aimPt.x = lead.x; f.aimPt.z = lead.z;

  // ---- vector de movimiento ----
  let mx = 0, mz = 0;
  const tx = (tgt.pos.x - f.pos.x) / (d || 1), tz = (tgt.pos.z - f.pos.z) / (d || 1);
  const gap = d - want;
  const approach = clamp(gap / 3.5, -1, 1) * (D.aggr * .9 + .1);
  mx += tx * approach; mz += tz * approach;
  // orbitar: cuanto más lejos estés de tu distancia ideal, menos rodeos
  const strafeW = .8 * clamp(1 - Math.abs(gap) / 5.5, .12, 1);
  mx += -tz * ai.strafe * strafeW; mz += tx * ai.strafe * strafeW;

  // huir si estás muy tocado
  const lowHp = f.hp / f.maxHp;
  if (lowHp < .3 && d < 7) { mx -= tx * 1.3; mz -= tz * 1.3; ai.panic = .8; }
  ai.panic = Math.max(0, ai.panic - dt);

  // esquivar proyectiles
  let dodging = null;
  for (const p of G.projectiles) {
    if (p.team === f.team) continue;
    const rel = dist(p.x, p.z, f.pos.x, f.pos.z);
    if (rel > 11) continue;
    const toX = f.pos.x - p.x, toZ = f.pos.z - p.z;
    if (toX * p.dx + toZ * p.dz < 0) continue;              // ya pasó
    const cross = Math.abs(toX * p.dz - toZ * p.dx);
    if (cross > p.radius + 1.5) continue;
    if (!chance(D.dodge)) continue;
    const side = (toX * p.dz - toZ * p.dx) >= 0 ? 1 : -1;
    dodging = { x: p.dz * side, z: -p.dx * side, urgency: 1 - rel / 11 };
    mx += dodging.x * 2.2; mz += dodging.z * 2.2;
    break;
  }
  // evitar zonas enemigas dañinas
  for (const z of G.zones) {
    if (z.team === f.team || (!z.tickDmg && !z.trap && !z.dmg)) continue;
    const dz2 = dist(f.pos.x, f.pos.z, z.x, z.z);
    if (dz2 < z.radius + 1.6) {
      const k = (z.radius + 2 - dz2) / (z.radius + 2);
      mx += (f.pos.x - z.x) / (dz2 || 1) * 2.4 * k;
      mz += (f.pos.z - z.z) / (dz2 || 1) * 2.4 * k;
    }
  }
  // orbes
  for (const p of G.pickups) {
    const pd = dist(f.pos.x, f.pos.z, p.x, p.z);
    const wantIt = p.type === 'energy' ? (f.energy < 75 ? 1 : .2) : (lowHp < .8 ? 1.4 : .1);
    if (pd < 15) { mx += (p.x - f.pos.x) / (pd || 1) * wantIt * 1.1; mz += (p.z - f.pos.z) / (pd || 1) * wantIt * 1.1; }
  }
  // no caerse y respetar la muerte súbita
  const shrink = G.sudden ? G.shrink : 1;
  const look = 1.9;
  const nx = f.pos.x + (mx ? mx : tx) * look, nz = f.pos.z + (mz ? mz : tz) * look;
  const depth = edgeDepth(nx, nz, shrink);
  if (depth < 2.2) {
    const c = arenaClosest(f.pos.x, f.pos.z, shrink);
    const ix = c.cx - f.pos.x, iz = c.cz - f.pos.z;
    const il = Math.hypot(ix, iz) || 1;
    const w = clamp((2.2 - depth) * 1.5, 0, 4);
    mx += -(f.pos.x - c.cx) / il * w; mz += -(f.pos.z - c.cz) / il * w;
    if (depth < .6) { mx += (0 - f.pos.x) * .06; mz += (0 - f.pos.z) * .06; }
  }
  const ml = Math.hypot(mx, mz);
  f.moveDir.x = ml > .05 ? mx / ml : 0;
  f.moveDir.z = ml > .05 ? mz / ml : 0;

  // ---- habilidades ----
  if (ai.hold > 0 || f.casting || f.dash) return;
  const ctx = { tgt, d, ai, D, lowHp, dodging, allies: alliesOf(f), foes, blocked: !!segHitsPillar(f.pos.x, f.pos.z, tgt.pos.x, tgt.pos.z, .3) };
  const plan = (BOT_PLANS[f.champ.id] || BOT_PLANS._default)(f, ctx);
  if (plan && tryCast(f, plan.i, plan.ex)) {
    ai.hold = rnd(.12, .34) + D.react * .5;
    return;
  }
  // ataque básico
  const ab = f.champ.ab[0];
  const m1range = f.champ.role === 'Vanguardia' ? 3.0 : 20;
  if (d < m1range && !ctx.blocked && canCast(f, 0, false)) {
    tryCast(f, 0, false);
    ai.hold = rnd(.02, .1);
  }
}

function wantEx(f, ctx, cost) {
  return f.energy >= (cost || 50) + 8 && chance(ctx.D.exUse);
}

const BOT_PLANS = {
  _default(f, c) { return null; },

  /* --- Vesk: mantener distancia, trampa, patada al vacío --- */
  vesk(f, c) {
    const { tgt, d, D } = c;
    // definitiva si el rival está controlado o cerca del centro
    if (canCast(f, 6) && d < 14 && (tgt.st.stun > 0 || tgt.st.root > 0 || chance(.5))) return { i: 6 };
    // patada: empujar al vacío si el borde está detrás del rival
    if (canCast(f, 5) && d < 3.3) {
      const bx = tgt.pos.x + (tgt.pos.x - f.pos.x), bz = tgt.pos.z + (tgt.pos.z - f.pos.z);
      const toEdge = edgeDepth(bx, bz, 1) < 1.4;
      if (toEdge || tgt.hp / tgt.maxHp < .45 || chance(.5)) return { i: 5, ex: toEdge && wantEx(f, c, 50) };
    }
    // humo para huir o correr
    if (canCast(f, 4) && (c.lowHp < .45 || (d < 4 && chance(.4)))) return { i: 4, ex: c.lowHp < .3 && wantEx(f, c) };
    // trampa delante del rival
    if (canCast(f, 3) && d < 12 && chance(.7)) {
      const p = predictPos(tgt, .55);
      f.aimPt.x = p.x; f.aimPt.z = p.z;
      return { i: 3, ex: wantEx(f, c) };
    }
    // saeta perforante si hay línea
    if (canCast(f, 1) && !c.blocked && d < 22) return { i: 1, ex: wantEx(f, c) };
    // rodar para separarse o esquivar
    if (canCast(f, 2) && ((c.dodging && chance(D.dodge)) || (d < 3 && chance(.5)))) {
      const away = c.dodging || { x: (f.pos.x - tgt.pos.x), z: (f.pos.z - tgt.pos.z) };
      f.moveDir.x = away.x; f.moveDir.z = away.z;
      return { i: 2 };
    }
    return null;
  },

  /* --- Brakk: entrar, encadenar control, empujar --- */
  brakk(f, c) {
    const { tgt, d } = c;
    if (canCast(f, 6) && d < 6.4) return { i: 6 };
    if (canCast(f, 4) && (c.lowHp < .6 || d < 4)) return { i: 4, ex: c.lowHp < .35 && wantEx(f, c) };
    if (canCast(f, 5) && d > 4 && d < 15 && !c.blocked) return { i: 5, ex: wantEx(f, c) };   // cadena
    if (canCast(f, 2) && d > 4.6 && d < 14) {                                                  // embestida
      f.moveDir.x = (tgt.pos.x - f.pos.x); f.moveDir.z = (tgt.pos.z - f.pos.z);
      return { i: 2 };
    }
    if (canCast(f, 3) && d < 4.6) {
      const nearEdge = edgeDepth(tgt.pos.x, tgt.pos.z, 1) < 2.4;
      return { i: 3, ex: nearEdge && wantEx(f, c) };
    }
    if (canCast(f, 1) && d < 8.5 && !c.blocked) return { i: 1, ex: wantEx(f, c) };
    return null;
  },

  /* --- Lumen: sostener al equipo y castigar al que se acerca --- */
  lumen(f, c) {
    const { tgt, d } = c;
    let hurt = null, worst = .8;
    for (const a of c.allies) { const r = a.hp / a.maxHp; if (r < worst) { worst = r; hurt = a; } }
    if (c.lowHp < .55 && worst >= c.lowHp) { hurt = f; worst = c.lowHp; }

    if (canCast(f, 6) && ((hurt && worst < .45) || c.lowHp < .4)) return { i: 6 };
    if (hurt && canCast(f, 1)) {                                    // cono curativo
      const ang = hurt === f ? Math.atan2(f.aimDir.x, f.aimDir.z) : Math.atan2(hurt.pos.x - f.pos.x, hurt.pos.z - f.pos.z);
      if (hurt === f || dist(f.pos.x, f.pos.z, hurt.pos.x, hurt.pos.z) < 7) {
        f.aimDir.x = Math.sin(ang); f.aimDir.z = Math.cos(ang);
        return { i: 1, ex: worst < .4 && wantEx(f, c) };
      }
    }
    if (canCast(f, 4) && hurt && worst < .7) {                      // égida
      f.aimPt.x = hurt.pos.x; f.aimPt.z = hurt.pos.z;
      return { i: 4, ex: worst < .45 && wantEx(f, c) };
    }
    if (canCast(f, 3) && (worst < .8 || d < 9)) {                   // santuario
      const base = hurt && hurt !== f ? hurt.pos : f.pos;
      f.aimPt.x = base.x; f.aimPt.z = base.z;
      return { i: 3, ex: wantEx(f, c) };
    }
    if (canCast(f, 5) && d < 14 && !c.blocked && chance(.8)) return { i: 5, ex: wantEx(f, c) };
    if (canCast(f, 2) && d < 3.5 && chance(.6)) {
      f.moveDir.x = (f.pos.x - tgt.pos.x); f.moveDir.z = (f.pos.z - tgt.pos.z);
      return { i: 2 };
    }
    return null;
  }
};

/* elección de reliquia para los bots: coherente con su papel */
function botPickRelic(f, options) {
  const pref = {
    'Tirador': ['filo', 'zancada', 'castigo', 'impulso', 'prisa', 'catalizador'],
    'Vanguardia': ['vigor', 'coraza', 'sanguijuela', 'baluarte', 'tenacidad', 'segundoaire'],
    'Custodio': ['arcano', 'conducto', 'prisa', 'acumulador', 'resonancia', 'eco']
  }[f.champ.role] || [];
  for (const id of pref) { const o = options.find(x => x.id === id); if (o) return o; }
  return pickOne(options);
}
