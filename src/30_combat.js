/* ============================ luchadores ============================ */
/* Simulación pura: sin three.js, sin DOM, sin audio. Todo lo que habría que
   dibujar o sonar sale por la cola de eventos de 10_core.js. Este archivo,
   junto con 10, 20, 40 y 50, es lo que correría un servidor autoritativo tal
   cual — y lo que `node tests/sim.js` ejecuta sin ningún doble.            */
let _uid = 0;
const BOT_NAMES = [['Kael', 'Nera', 'Orin', 'Sila'], ['Drax', 'Vora', 'Tarn', 'Mire']];

function makeFighter(champId, team, isBot, name) {
  const C = CHAMPS[champId];
  const f = {
    uid: ++_uid, champ: C, team, isBot, name: name || C.name,
    pos: vec3(0, 0, 0), face: 0, aimDir: { x: 0, z: team === 0 ? 1 : -1 }, aimPt: vec3(),
    // posición del paso anterior: la usan velEst y la interpolación de la vista
    px: 0, pz: 0, pface: 0, velEst: { x: 0, z: 0 }, lastHitById: 0,
    moveDir: { x: 0, z: 0 }, maxHp: C.hp, hp: C.hp, shield: 0, shieldT: 0, energy: 0, alive: true,
    cds: new Array(C.ab.length).fill(0), casting: null, combo: 0, comboT: 0, echoT: 0, deadT: 0,
    st: { stun: 0, root: 0, silence: 0, slow: 0, slowAmt: 0, haste: 0, hasteAmt: 0, invuln: 0, evade: 0, dr: 0, drAmt: 0, mark: 0, autoT: 0 },
    dash: null, knock: { x: 0, z: 0, t: 0 }, falling: 0, ccDR: { stun: { n: 0, t: 0 }, root: { n: 0, t: 0 }, silence: { n: 0, t: 0 } },
    mods: {
      speed: 0, m1Dmg: 0, abDmg: 0, cdr: 0, energy: 0, dr: 0, lifesteal: 0, tenacity: 0, execute: 0,
      startEnergy: 0, ultCost: 0, dashHaste: false, dashShield: 0, lowHpDr: 0, mark: 0, autoShield: 0, echo: 0
    },
    relics: [], stats: { dmg: 0, heal: 0, taken: 0, kills: 0, rounds: 0 },
    ai: null,
    // estado de animación: números planos que la vista lee y el servidor ignora
    hitFlash: 0, bob: 0, anim: 0
  };
  G.byId.set(f.uid, f);
  return f;
}

function applyRelic(f, relic) {
  f.relics.push(relic);
  relic.ap(f);
  // Viaja por la red: las reliquias cambian velocidad, daño y recargas, así que
  // un cliente que no supiera cuáles llevas predeciría otro movimiento.
  emit({ e: 'relic', id: f.uid, idx: RELICS.indexOf(relic) });
}

function resetFighter(f, x, z, faceDir) {
  f.hp = f.maxHp; f.shield = 0; f.shieldT = 0; f.alive = true; f.deadT = 0;
  f.energy = Math.min(100, f.mods.startEnergy);
  f.cds.fill(0); f.casting = null; f.combo = 0; f.dash = null; f.falling = 0;
  f.knock.x = f.knock.z = f.knock.t = 0;
  f.lastHitById = 0;
  for (const k in f.st) f.st[k] = 0;
  for (const k in f.ccDR) { f.ccDR[k].n = 0; f.ccDR[k].t = 0; }
  f.pos.x = x; f.pos.y = 0; f.pos.z = z;
  // reaparecer es un salto, no un movimiento: que ni velEst ni la vista
  // interpolen desde donde estabas al morir
  f.px = x; f.pz = z; f.pface = faceDir;
  f.velEst.x = 0; f.velEst.z = 0;
  f.face = faceDir; f.aimDir.x = Math.sin(faceDir); f.aimDir.z = Math.cos(faceDir);
  if (f.mods.autoShield) f.st.autoT = f.mods.autoShield;
  if (f.ai) {                       // que los bots no reaccionen todos en el mismo fotograma
    f.ai.hold = rnd(.1, .8); f.ai.think = rnd(0, .3); f.ai.tgtId = 0;
    f.ai.strafe = chance(.5) ? 1 : -1; f.ai.panic = 0;
  }
}

/* ============================ daño, curación y control ============================ */
function dealDamage(src, tgt, amount, opts) {
  opts = opts || {};
  if (!tgt.alive || tgt.st.invuln > 0 || tgt.falling) return 0;
  let dmg = amount;
  if (src && src !== tgt) {
    dmg *= 1 + (opts.m1 ? src.mods.m1Dmg : src.mods.abDmg);
    if (src.mods.execute && tgt.hp / tgt.maxHp < .35) dmg *= 1 + src.mods.execute;
    if (!opts.m1 && src.st.mark > 0) { dmg += src.mods.mark; src.st.mark = 0; }
  }
  dmg *= 1 - tgt.mods.dr;
  if (tgt.st.dr > 0) dmg *= 1 - tgt.st.drAmt;
  if (tgt.mods.lowHpDr && tgt.hp / tgt.maxHp < .4) dmg *= 1 - tgt.mods.lowHpDr;
  dmg = Math.max(1, Math.round(dmg));

  let left = dmg;
  if (tgt.shield > 0) {
    const ab = Math.min(tgt.shield, left);
    tgt.shield -= ab; left -= ab;
    if (tgt.shield <= 0) tgt.shieldT = 0;
  }
  tgt.hp -= left;
  tgt.stats.taken += dmg;
  tgt.hitFlash = .18;
  if (src && src !== tgt) {
    src.stats.dmg += dmg;
    gainEnergy(src, dmg * .42);
    if (src.mods.lifesteal) healTarget(src, src, dmg * src.mods.lifesteal, true);
    if (src.mods.mark && opts.m1) src.st.mark = 1;
    if (src.mods.echo && !opts.m1 && src.echoT <= 0) {
      src.echoT = .4;
      for (let i = 0; i < src.cds.length; i++) src.cds[i] = Math.max(0, src.cds[i] - src.mods.echo);
    }
  }
  gainEnergy(tgt, dmg * .16);
  emit({ e: 'dmg', id: tgt.uid, byId: src ? src.uid : 0, dmg, x: tgt.pos.x, z: tgt.pos.z });
  if (tgt.hp <= 0) killFighter(tgt, src);
  return dmg;
}

function healTarget(src, tgt, amount, silent) {
  if (!tgt.alive || tgt.hp >= tgt.maxHp) return 0;
  const h = Math.min(Math.round(amount), tgt.maxHp - tgt.hp);
  if (h <= 0) return 0;
  tgt.hp += h;
  if (src) {
    if (src !== tgt) src.stats.heal += h;
    gainEnergy(src, h * .3);
  }
  if (!silent) emit({ e: 'heal', id: tgt.uid, amount: h, x: tgt.pos.x, z: tgt.pos.z });
  return h;
}

function gainEnergy(f, amt) {
  if (!f.alive) return;
  f.energy = clamp(f.energy + amt * (1 + f.mods.energy), 0, 100);
}

const DR_SCALE = [1, .5, .25, 0];
function applyCC(f, type, t) {
  if (!f.alive || f.st.invuln > 0 || !type) return;
  const e = f.ccDR[type];
  if (e) {
    if (e.t <= 0) e.n = 0;
    t *= DR_SCALE[Math.min(3, e.n)];
    e.n++; e.t = 6.5;
  }
  t *= 1 - f.mods.tenacity;
  if (t <= .08) { emit({ e: 'cc', id: f.uid, type: 'immune', x: f.pos.x, z: f.pos.z }); return; }
  f.st[type] = Math.max(f.st[type] || 0, t);
  if (type === 'stun' && f.casting) cancelCast(f);
  emit({ e: 'cc', id: f.uid, type, x: f.pos.x, z: f.pos.z });
}

function applySlow(f, amt, t) {
  if (!f.alive) return;
  f.st.slow = Math.max(f.st.slow, t);
  f.st.slowAmt = Math.max(f.st.slowAmt, amt);
}

function applyKnockback(f, dx, dz, force) {
  if (!f.alive || f.st.invuln > 0 || !force) return;
  const d = Math.hypot(dx, dz) || 1;
  const k = 1 - f.mods.tenacity * .5;
  f.knock.x = dx / d * force * k;
  f.knock.z = dz / d * force * k;
  f.knock.t = .34;
  if (f.casting) cancelCast(f);
}

function killFighter(f, src) {
  if (!f.alive) return;
  f.alive = false; f.hp = 0; f.shield = 0; f.deadT = 0;
  f.dash = null; f.casting = null;
  if (src && src !== f) src.stats.kills++;
  const who = src && src !== f ? src : null;
  const first = !G.firstBlood && !!who;
  if (first) G.firstBlood = true;
  emit({ e: 'kill', id: f.uid, byId: who ? who.uid : 0, first });
}

/* ============================ primitivas de habilidad ============================ */
function shoot(f, o) {
  const d = o.dir, len = Math.hypot(d.x, d.z) || 1;
  const x = f.pos.x + d.x / len * .7, z = f.pos.z + d.z / len * .7;
  G.projectiles.push({
    id: ++_uid, x, z, px: x, pz: z,
    dx: d.x / len, dz: d.z / len,
    speed: o.speed, radius: o.radius, range: o.range, traveled: 0,
    dmg: o.dmg || 0, healAlly: o.healAlly || 0, kb: o.kb || 0, pull: o.pull || 0,
    cc: o.cc, ccT: o.ccT || 0, cc2: o.cc2, cc2T: o.cc2T || 0,
    pierce: !!o.pierce, chain: !!o.chain, team: f.team, ownerId: f.uid, hit: [], alive: true,
    // aspecto: lo lee la vista para construir la malla, no afecta a la física
    col: o.color || 0xffffff, scale: o.scale || 1, flat: !!o.flat
  });
}

function meleeArc(f, o) {
  const a0 = Math.atan2(o.dir.x, o.dir.z);
  const half = (o.arc || 90) * Math.PI / 360;
  fxArc(f.pos, a0, half, o.range, o.color || 0xffffff);
  let hit = 0;
  for (const t of G.fighters) {
    if (t.team === f.team || !t.alive) continue;
    const dx = t.pos.x - f.pos.x, dz = t.pos.z - f.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > o.range + .55) continue;
    if (Math.abs(angDiff(Math.atan2(dx, dz), a0)) > half) continue;
    dealDamage(f, t, o.dmg, { m1: o.m1 });
    if (o.cc) applyCC(t, o.cc, o.ccT);
    if (o.kb) applyKnockback(t, dx, dz, o.kb);
    hit++;
  }
  return hit;
}

function coneHeal(f, o) {
  const a0 = Math.atan2(o.dir.x, o.dir.z);
  const half = (o.arc || 70) * Math.PI / 360;
  fxArc(f.pos, a0, half, o.range, 0x8ff0bb);
  if (o.selfHeal) healTarget(f, f, o.selfHeal);
  if (o.cleanse) cleanse(f);
  for (const t of G.fighters) {
    if (t.team !== f.team || !t.alive || t === f) continue;
    const dx = t.pos.x - f.pos.x, dz = t.pos.z - f.pos.z;
    if (Math.hypot(dx, dz) > o.range + .55) continue;
    if (Math.abs(angDiff(Math.atan2(dx, dz), a0)) > half) continue;
    healTarget(f, t, o.heal);
    if (o.cleanse) cleanse(t);
  }
}

function radial(f, o) {
  for (const t of G.fighters) {
    if (t.team === f.team || !t.alive) continue;
    const dx = t.pos.x - f.pos.x, dz = t.pos.z - f.pos.z;
    if (Math.hypot(dx, dz) > o.radius + .5) continue;
    dealDamage(f, t, o.dmg);
    if (o.cc) applyCC(t, o.cc, o.ccT);
    if (o.slow) applySlow(t, o.slow, o.slowT || 2);
    if (o.kb) applyKnockback(t, dx, dz, o.kb);
  }
}

function startDash(f, o) {
  const d = o.dir, len = Math.hypot(d.x, d.z) || 1;
  f.dash = {
    dx: d.x / len, dz: d.z / len, speed: o.dist / o.dur, t: 0, dur: o.dur,
    dmg: o.dmg || 0, cc: o.cc, ccT: o.ccT || 0, stopOnHit: !!o.stopOnHit, hit: [], trail: o.trail
  };
  if (o.invuln) f.st.invuln = Math.max(f.st.invuln, o.invuln);
  if (f.mods.dashHaste) { f.st.haste = Math.max(f.st.haste, 2); f.st.hasteAmt = Math.max(f.st.hasteAmt, .35); }
  if (f.mods.dashShield) addShield(f, f.mods.dashShield, 4);
  f.combo = 0;
}

function spawnZone(f, o) {
  G.zones.push({
    id: ++_uid, x: o.x, z: o.z, radius: o.radius, dur: o.dur, t: 0, delay: o.delay || 0,
    tick: o.tick || 0, tickT: 0, tickDmg: o.tickDmg || 0, tickHeal: o.tickHeal || 0,
    dmg: o.dmg || 0, cc: o.cc, ccT: o.ccT || 0, slow: o.slow || 0, trap: !!o.trap,
    friendly: !!o.friendly, rain: !!o.rain, team: f.team, ownerId: f.uid, alive: true,
    col: o.color || 0xffffff
  });
}

function addShield(f, amt, t) {
  f.shield = Math.max(f.shield, amt);
  f.shieldT = Math.max(f.shieldT, t || 4);
}
function cleanse(f) {
  f.st.stun = f.st.root = f.st.silence = f.st.slow = 0;
  f.st.slowAmt = 0;
}
function buff(f, o) {
  if (o.shield) addShield(f, o.shield, o.shieldT || 4);
  if (o.heal) healTarget(f, f, o.heal);
  if (o.cleanse) cleanse(f);
  if (o.haste) { f.st.haste = Math.max(f.st.haste, o.hasteT || 3); f.st.hasteAmt = Math.max(f.st.hasteAmt, o.haste); }
  if (o.dr) { f.st.dr = Math.max(f.st.dr, o.drT || 4); f.st.drAmt = Math.max(f.st.drAmt, o.dr); }
  if (o.evade) f.st.evade = Math.max(f.st.evade, o.evade);
  if (o.invuln) f.st.invuln = Math.max(f.st.invuln, o.invuln);
}
function allyNear(f, pt, range) {
  let best = null, bd = range * range;
  for (const a of G.fighters) {
    if (a.team !== f.team || !a.alive || a === f) continue;
    const d = dist2(a.pos.x, a.pos.z, pt.x, pt.z);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}

/* ============================ lanzar habilidades ============================ */
function abilityCost(f, ab) {
  if (ab.cost) return Math.max(0, ab.cost - (f.mods.ultCost || 0));
  return 0;
}
function canCast(f, i, ex) {
  const ab = f.champ.ab[i];
  if (!f.alive || f.falling || f.casting || f.dash) return false;
  if (f.st.stun > 0 || f.st.root > 0 && ab.dashAb) return false;
  if (f.st.silence > 0 && !ab.dashAb) return false;
  if (f.cds[i] > 0) return false;
  if (abilityCost(f, ab) > f.energy) return false;
  if (ex && (!ab.exCost || f.energy < ab.exCost + abilityCost(f, ab))) return false;
  return true;
}
function cancelCast(f) {
  if (!f.casting) return;
  const c = f.casting;
  f.energy = Math.min(100, f.energy + c.spent);
  f.cds[c.i] = Math.min(f.cds[c.i], .8);
  f.casting = null;
}
function tryCast(f, i, ex) {
  if (!canCast(f, i, ex)) return false;
  const ab = f.champ.ab[i];
  let spent = abilityCost(f, ab);
  if (ex) spent += ab.exCost;
  f.energy -= spent;
  const aim = { x: f.aimDir.x, z: f.aimDir.z };
  let pt = vec3(f.aimPt.x, 0, f.aimPt.z);
  if (ab.ground) {
    const dx = pt.x - f.pos.x, dz = pt.z - f.pos.z, d = Math.hypot(dx, dz);
    if (d > ab.ground) { pt.x = f.pos.x + dx / d * ab.ground; pt.z = f.pos.z + dz / d * ab.ground; }
    pushInside(pt, 0.8);
  }
  const move = (Math.abs(f.moveDir.x) + Math.abs(f.moveDir.z)) > .01 ? { x: f.moveDir.x, z: f.moveDir.z } : null;
  const o = { ex: !!ex, aim, pt, move, i };
  if (ab.wind > 0) {
    f.casting = { i, ab, o, t: 0, dur: ab.wind, spent, root: !!ab.ult };
  } else {
    fireAbility(f, i, ab, o);
  }
  f.cds[i] = Math.max(.15, ab.cd * (1 - f.mods.cdr));
  if (i === 0) { f.comboT = 1.3; } else f.combo = 0;
  return true;
}
function fireAbility(f, i, ab, o) {
  f.anim = .22;
  ab.act(f, o);
  if (i === 0 && ab.combo) { f.combo = (f.combo + 1) % ab.combo; f.comboT = 1.4; }
}

/* Aplica un comando de entrada a un luchador. Es el gemelo exacto de
   updateAI: ambos dejan al luchador con un moveDir, un aimDir y, como mucho,
   una habilidad intentada. Nadie más escribe esas intenciones, y por eso un
   bot puede sustituir a un humano sin que nada más cambie. */
const _cmdDir = { x: 0, z: 0 };
function applyInput(f, cmd) {
  if (cmd.move === CMD_STILL) { f.moveDir.x = 0; f.moveDir.z = 0; }
  else { byteToDir(cmd.move, _cmdDir); f.moveDir.x = _cmdDir.x; f.moveDir.z = _cmdDir.z; }
  byteToDir(cmd.aim, _cmdDir);
  f.aimDir.x = _cmdDir.x; f.aimDir.z = _cmdDir.z;
  const d = cmd.aimD / 10;
  f.aimPt.x = f.pos.x + _cmdDir.x * d;
  f.aimPt.z = f.pos.z + _cmdDir.z * d;
  if (G.state !== 'live') { f.moveDir.x = f.moveDir.z = 0; return; }
  const b = cmd.buttons, ex = !!cmd.ex;
  if (b & BTN.M1) tryCast(f, 0, false);
  if (b & BTN.M2) tryCast(f, 1, ex);
  if (b & BTN.SP) tryCast(f, 2, false);
  if (b & BTN.Q) tryCast(f, 3, ex);
  if (b & BTN.E) tryCast(f, 4, ex);
  if (b & BTN.F) tryCast(f, 5, ex);
  if (b & BTN.R) tryCast(f, 6, false);
}

/* ============================ tick de luchador ============================ */
function tickFighter(f, dt) {
  const st = f.st;
  for (const k of ['stun', 'root', 'silence', 'slow', 'haste', 'invuln', 'evade', 'dr']) {
    if (st[k] > 0) { st[k] = Math.max(0, st[k] - dt); }
  }
  if (st.slow <= 0) st.slowAmt = 0;
  if (st.haste <= 0) st.hasteAmt = 0;
  if (st.dr <= 0) st.drAmt = 0;
  if (f.shieldT > 0) { f.shieldT -= dt; if (f.shieldT <= 0) f.shield = 0; }
  if (f.echoT > 0) f.echoT -= dt;
  for (const k in f.ccDR) if (f.ccDR[k].t > 0) f.ccDR[k].t -= dt;
  if (f.comboT > 0) { f.comboT -= dt; if (f.comboT <= 0) f.combo = 0; }
  if (f.hitFlash > 0) f.hitFlash -= dt;
  if (f.anim > 0) f.anim -= dt;
  for (let i = 0; i < f.cds.length; i++) if (f.cds[i] > 0) f.cds[i] = Math.max(0, f.cds[i] - dt);
  if (f.mods.autoShield) {
    st.autoT -= dt;
    if (st.autoT <= 0) { st.autoT = f.mods.autoShield; addShield(f, 26, 6); fxRing(f.pos, 1.1, 0xbfe0ff); }
  }

  if (!f.alive) { f.deadT += dt; return; }     // la vista deriva la caída de deadT
  if (f.falling > 0) {
    f.falling += dt;
    if (f.falling > .55) killFighter(f, fighterById(f.lastHitById));
    return;
  }

  // muerte súbita: fuera del anillo
  if (G.sudden && !insideArena(f.pos.x, f.pos.z, 0, G.shrink)) {
    f.sdT = (f.sdT || 0) + dt;
    if (f.sdT > .5) { f.sdT = 0; dealDamage(null, f, 9); }
  }

  // empuje
  if (f.knock.t > 0) {
    f.knock.t -= dt;
    const k = Math.max(0, f.knock.t / .34);
    f.pos.x += f.knock.x * k * dt;
    f.pos.z += f.knock.z * k * dt;
    collidePillars(f.pos, .5);
    if (!insideArena(f.pos.x, f.pos.z, -.2, 1)) { f.falling = .001; return; }
  }

  // desplazamiento
  if (f.dash) {
    const d = f.dash;
    d.t += dt;
    const step = d.speed * dt;
    f.pos.x += d.dx * step; f.pos.z += d.dz * step;
    if (collidePillars(f.pos, .5)) d.t = d.dur;
    pushInside(f.pos, .5);
    if (d.dmg || d.cc) {
      for (const t of G.fighters) {
        if (t.team === f.team || !t.alive || d.hit.indexOf(t.uid) >= 0) continue;
        if (dist(t.pos.x, t.pos.z, f.pos.x, f.pos.z) > 1.15) continue;
        d.hit.push(t.uid);
        if (d.dmg) dealDamage(f, t, d.dmg);
        if (d.cc) applyCC(t, d.cc, d.ccT);
        t.lastHitById = f.uid;
        if (d.stopOnHit) d.t = d.dur;
      }
    }
    f.face = Math.atan2(d.dx, d.dz);
    if (d.t >= d.dur) f.dash = null;
    return;
  }

  // canalización
  let castSlow = 1;
  if (f.casting) {
    f.casting.t += dt;
    castSlow = f.casting.root ? 0 : .42;
    if (f.casting.t >= f.casting.dur) {
      const c = f.casting; f.casting = null;
      // una canalización reconstruida de una instantánea no dispara: el efecto
      // lo manda el servidor (ver writeFighter en 57_client.js)
      if (!c.ghost) fireAbility(f, c.i, c.ab, c.o);
    }
  }

  // movimiento
  let mv = f.moveDir;
  if (st.stun > 0 || st.root > 0) mv = { x: 0, z: 0 };
  const sp = f.champ.speed * (1 + f.mods.speed) * (1 + st.hasteAmt) * (1 - st.slowAmt) * castSlow;
  if (mv.x || mv.z) {
    const len = Math.hypot(mv.x, mv.z) || 1;
    f.pos.x += mv.x / len * sp * dt;
    f.pos.z += mv.z / len * sp * dt;
    f.bob += dt * 11;
  } else f.bob += dt * 2;
  collidePillars(f.pos, .5);
  pushInside(f.pos, .45);

  // orientación
  if (st.stun <= 0) {
    const want = Math.atan2(f.aimDir.x, f.aimDir.z);
    f.face += angDiff(want, f.face) * Math.min(1, dt * 18);
  }
}

/* ============================ proyectiles ============================ */
function updateProjectiles(dt) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const p = G.projectiles[i];
    const step = p.speed * dt;
    const nx = p.x + p.dx * step, nz = p.z + p.dz * step;
    p.traveled += step;
    // pilares
    if (segHitsPillar(p.x, p.z, nx, nz, p.radius * .5)) { destroyProj(p, i, true); continue; }
    p.x = nx; p.z = nz;
    if (p.traveled > p.range || !insideArena(p.x, p.z, -1.5, 1)) { destroyProj(p, i, false); continue; }
    const owner = fighterById(p.ownerId);
    let consumed = false;
    for (const t of G.fighters) {
      if (!t.alive || t.falling || p.hit.indexOf(t.uid) >= 0) continue;
      const friendly = t.team === p.team;
      if (friendly && !p.healAlly) continue;
      if (dist(t.pos.x, t.pos.z, p.x, p.z) > p.radius + .55) continue;
      p.hit.push(t.uid);
      if (friendly) {
        healTarget(owner, t, p.healAlly);
      } else {
        if (t.st.evade > 0) { t.st.evade = 0; emit({ e: 'evade', id: t.uid, x: t.pos.x, z: t.pos.z }); continue; }
        dealDamage(owner, t, p.dmg);
        t.lastHitById = p.ownerId;
        if (p.cc) applyCC(t, p.cc, p.ccT);
        if (p.cc2) applyCC(t, p.cc2, p.cc2T);
        if (p.pull && owner) {
          const dx = owner.pos.x - t.pos.x, dz = owner.pos.z - t.pos.z;
          applyKnockback(t, dx, dz, Math.max(0, Math.hypot(dx, dz) - 2) * 4.2);
        } else if (p.kb) applyKnockback(t, p.dx, p.dz, p.kb);
      }
      fxHit(p.x, p.z, p.col);
      if (!p.pierce) { consumed = true; break; }
    }
    if (consumed) destroyProj(p, i, true);
  }
}
function destroyProj(p, i, fx) {
  if (fx) fxHit(p.x, p.z, p.col);
  G.projectiles.splice(i, 1);
}

/* ============================ zonas ============================ */
function updateZones(dt) {
  for (let i = G.zones.length - 1; i >= 0; i--) {
    const z = G.zones[i];
    if (z.delay > 0) { z.delay -= dt; continue; }
    z.t += dt;
    const owner = fighterById(z.ownerId);
    if (z.trap) {
      for (const t of G.fighters) {
        if (t.team === z.team || !t.alive) continue;
        if (dist(t.pos.x, t.pos.z, z.x, z.z) > z.radius) continue;
        dealDamage(owner, t, z.dmg);
        applyCC(t, z.cc, z.ccT);
        fxRing({ x: z.x, z: z.z }, z.radius, z.col);
        z.t = z.dur + 1;
        break;
      }
    } else {
      if (z.tick) {
        z.tickT += dt;
        if (z.tickT >= z.tick) {
          z.tickT = 0;
          for (const t of G.fighters) {
            if (!t.alive) continue;
            if (dist(t.pos.x, t.pos.z, z.x, z.z) > z.radius) continue;
            if (t.team === z.team) { if (z.tickHeal) healTarget(owner, t, z.tickHeal); }
            else if (z.tickDmg) { dealDamage(owner, t, z.tickDmg); t.lastHitById = z.ownerId; }
          }
        }
      }
      if (z.slow) {
        for (const t of G.fighters) {
          if (t.team === z.team || !t.alive) continue;
          if (dist(t.pos.x, t.pos.z, z.x, z.z) > z.radius) continue;
          applySlow(t, z.slow, .3);
        }
      }
    }
    if (z.t >= z.dur) G.zones.splice(i, 1);
  }
}

/* ============================ orbes ============================ */
function spawnPickup(type, x, z) {
  G.pickups.push({ id: ++_uid, type, x, z, t: 0 });
}
function updatePickups(dt) {
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const p = G.pickups[i];
    p.t += dt;
    for (const f of G.fighters) {
      if (!f.alive || dist(f.pos.x, f.pos.z, p.x, p.z) > 1.25) continue;
      if (p.type === 'energy') {
        gainEnergy(f, 38);
        for (const a of G.fighters) if (a.team === f.team && a !== f && a.alive) gainEnergy(a, 16);
      } else {
        healTarget(null, f, 30);
      }
      emit({ e: 'orb', id: p.id, kind: p.type, byId: f.uid, x: p.x, z: p.z });
      G.pickups.splice(i, 1);
      break;
    }
  }
}
function clearPickups() { G.pickups.length = 0; }

function clearTransient() {
  G.projectiles.length = 0;
  G.zones.length = 0;
  clearPickups();
  emit({ e: 'clearFx' });      // que la vista tire también sus partículas
}
