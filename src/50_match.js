/* ============================ partida ============================ */
/* La máquina de estados del combate: composición de equipos, rondas, reliquias
   y condición de victoria. Es exactamente lo que gobernaría un servidor de
   partida, así que no toca el DOM ni el audio: anuncia por eventos y deja las
   opciones de reliquia en `G.relicOptions` para que las pinte quien quiera.

   `SEL` es lo que el jugador eligió en el menú. Aquí vive porque es lo que lee
   startMatch; quien lo escribe es la interfaz.                              */
const SEL = { mode: 'duo', diff: 'normal', champ: 'vesk' };

function spawnPoints(team, n) {
  const x = team === 0 ? -14.5 : 14.5;
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x, z: (i - (n - 1) / 2) * 3.4, a: team === 0 ? Math.PI / 2 : -Math.PI / 2 });
  return out;
}

/* `seed` sirve para repetir una partida entera: con la misma semilla y la
   misma entrada, el combate se desarrolla igual paso a paso. Si no se pasa, se
   sortea una y se guarda en G.seed. */
function startMatch(seed) {
  quitMatch();
  G.seed = seed === undefined ? (frand() * 0xFFFFFFFF) >>> 0 : (seed >>> 0);
  seedSim(G.seed);
  G.mode = MODES[SEL.mode];
  G.diff = SEL.diff;
  G.wins = G.mode.wins;
  G.round = 1; G.score = [0, 0]; G.picks = 0;
  G.playerTeam = 0;
  G.roundLimit = G.mode.time || 9999;

  const n = G.mode.size;
  // composición: nunca repetir campeón dentro de un equipo si se puede evitar
  const teamComp = t => {
    const list = [];
    const rest = CHAMP_LIST.filter(c => !(t === 0 && c === SEL.champ));
    if (t === 0) list.push(SEL.champ);
    const order = t === 0 ? ['brakk', 'lumen', 'vesk'] : ['lumen', 'vesk', 'brakk'];
    for (const c of order) {
      if (list.length >= n) break;
      if (list.includes(c)) continue;
      if (t === 0 && !rest.includes(c)) continue;
      list.push(c);
    }
    while (list.length < n) list.push(pickOne(CHAMP_LIST));
    return list.slice(0, n);
  };
  for (let t = 0; t < 2; t++) {
    const comp = teamComp(t);
    comp.forEach((cid, i) => {
      const isBot = !(t === 0 && i === 0);
      const f = makeFighter(cid, t, isBot, isBot ? BOT_NAMES[t][i % 4] : 'Tú');
      if (isBot) makeAI(f, G.diff);
      else G.player = f;
      G.fighters.push(f);
    });
  }
  G.started = true;
  emit({ e: 'matchStart' });         // la vista monta HUD, placas y marcos
  if (G.mode.id === 'training') { beginRound(); emit({ e: 'training' }); }
  else openRelicPick();
}

function quitMatch() {
  G.fighters.length = 0;
  G.byId.clear();
  _uid = 0;                 // los ids arrancan de cero en cada partida, como en un servidor
  G.player = null; G.started = false; G.sudden = false; G.shrink = 1;
  G.relicOptions = null;
  clearTransient();
  G.paused = false;
  emit({ e: 'matchEnd' });
}

function beginRound() {
  const n = G.mode.size;
  for (const t of [0, 1]) {
    const pts = spawnPoints(t, n);
    let i = 0;
    for (const f of G.fighters) if (f.team === t) { const p = pts[i++]; resetFighter(f, p.x, p.z, p.a); }
  }
  clearTransient();
  G.roundTime = 0; G.sudden = false; G.shrink = 1;
  G.firstBlood = false;
  G.relicOptions = null;
  G.nextOrb = 18; G.nextHeal = 26;
  G.state = 'intro';
  G.introT = 3.2;
  emit({ e: 'roundStart', round: G.round, score: G.score.slice(), training: G.mode.id === 'training' });
}

function endRound(winner) {
  if (G.state !== 'live') return;
  G.state = 'roundend';
  G.roundEndT = 3.4;
  if (winner >= 0) {
    G.score[winner]++;
    for (const f of G.fighters) if (f.team === winner) f.stats.rounds++;
  }
  emit({ e: 'roundEnd', winner, score: G.score.slice() });
  G.timeScale = .35;
}

/* Las tres opciones se sortean aquí, con el generador con semilla, y se dejan
   en G.relicOptions. La interfaz las pinta; cuando el jugador elige, llama a
   pickRelic. En red, el servidor haría exactamente esto y esperaría la
   respuesta con un plazo. */
function openRelicPick() {
  G.picks++;
  G.state = 'brite';
  const taken = new Set(G.player.relics.map(r => r.id));
  const pool = RELICS.filter(r => !taken.has(r.id));
  const opts = [];
  const byRar = r => pool.filter(x => x.r === r && !opts.includes(x));
  const wantEpic = G.picks >= 3 ? 1 : 0;
  while (opts.length < 3) {
    let cand;
    if (opts.length === 0) cand = pickOne(byRar('com'));
    else if (opts.length === 1) cand = pickOne(byRar(chance(.6) ? 'rare' : 'com'));
    else cand = pickOne(byRar(wantEpic && chance(.55) ? 'epic' : 'rare'));
    if (!cand) cand = pickOne(pool.filter(x => !opts.includes(x)));
    if (!cand) break;
    opts.push(cand);
  }
  G.relicOptions = opts;
  emit({ e: 'relics', picks: G.picks, of: G.wins + 2 });
}

/* Elige la reliquia `i` de las ofrecidas, deja que los bots elijan la suya y
   arranca la ronda. */
function pickRelic(i) {
  if (G.state !== 'brite' || !G.relicOptions) return false;
  const r = G.relicOptions[i];
  if (!r) return false;
  applyRelic(G.player, r);
  for (const f of G.fighters) {
    if (f === G.player || !f.isBot) continue;
    const own = new Set(f.relics.map(x => x.id));
    const p = RELICS.filter(x => !own.has(x.id));
    const three = [pickOne(p), pickOne(p), pickOne(p)].filter(Boolean);
    const chosen = botPickRelic(f, three.length ? three : [pickOne(RELICS)]);
    if (chosen) applyRelic(f, chosen);
  }
  G.relicOptions = null;
  beginRound();
  return true;
}

function endMatch(winner) {
  G.state = 'result';
  emit({ e: 'matchResult', winner, score: G.score.slice() });
}

function togglePause() {
  if (!G.started) return;
  if (G.state === 'brite' || G.state === 'result') return;
  G.paused = !G.paused;
  emit({ e: 'pause', on: G.paused });
}

/* ============================ ritmo de la ronda ============================ */
function updateRound(dt) {
  if (G.state === 'intro') {
    G.introT -= dt;
    const n = Math.ceil(G.introT - .2);
    if (n > 0 && n <= 3 && G.introN !== n) { G.introN = n; emit({ e: 'countdown', n }); }
    if (G.introT <= .2 && G.introN !== 0) { G.introN = 0; emit({ e: 'countdown', n: 0 }); }
    if (G.introT <= 0) { G.state = 'live'; G.introN = -1; }
    return;
  }
  if (G.state === 'roundend') {
    G.roundEndT -= dt;
    G.timeScale = lerp(G.timeScale, 1, dt * 1.2);
    if (G.roundEndT <= 0) {
      G.timeScale = 1;
      const w = G.score[0] >= G.wins ? 0 : G.score[1] >= G.wins ? 1 : -1;
      if (w >= 0) endMatch(w);
      else { G.round++; openRelicPick(); }
    }
    return;
  }
  if (G.state !== 'live') return;

  G.roundTime += dt;

  // orbes
  if (G.mode.id !== 'training') {
    G.nextOrb -= dt;
    if (G.nextOrb <= 0) { G.nextOrb = 24; spawnPickup('energy', 0, 0); emit({ e: 'orbSpawn', kind: 'energy' }); }
    G.nextHeal -= dt;
    if (G.nextHeal <= 0) {
      G.nextHeal = 30;
      spawnPickup('health', 0, -9.6);
      spawnPickup('health', 0, 9.6);
    }
  } else {
    gainEnergy(G.player, dt * 14);
  }

  // muerte súbita
  const sdStart = Math.max(30, G.roundLimit - 55);
  if (G.mode.id !== 'training') {
    if (!G.sudden && G.roundTime > sdStart) {
      G.sudden = true;
      emit({ e: 'sudden' });
    }
    if (G.sudden) G.shrink = clamp(1 - (G.roundTime - sdStart) / 42 * .72, .26, 1);
  }

  // fin de ronda
  let alive = [0, 0];
  for (const f of G.fighters) if (f.alive) alive[f.team]++;
  if (G.mode.id === 'training') {
    for (const f of G.fighters) {
      if (f.alive) continue;
      f.deadT2 = (f.deadT2 || 0) + dt;
      if (f.deadT2 > 3) {
        f.deadT2 = 0;
        const pts = spawnPoints(f.team, G.mode.size);
        const p = pts[0];
        resetFighter(f, p.x, p.z, p.a);
      }
    }
    return;
  }
  if (alive[0] === 0 || alive[1] === 0) {
    if (alive[0] === 0 && alive[1] === 0) endRound(-1);
    else endRound(alive[0] === 0 ? 1 : 0);
    return;
  }
  if (G.roundTime >= G.roundLimit) {
    const r = [0, 0];
    for (const f of G.fighters) if (f.alive) r[f.team] += f.hp / f.maxHp;
    endRound(r[0] === r[1] ? -1 : (r[0] > r[1] ? 0 : 1));
  }
}

/* ============================ el paso de simulación ============================ */
/* Todo lo que cambia el estado de juego ocurre aquí y solo aquí, siempre con el
   mismo dt. `cmd` es la intención del jugador local: llega como parámetro, no
   se lee del teclado desde dentro. Esa firma es la frontera del modo online —
   un servidor llamaría a esto con el comando que le llegó por la red, y un
   cliente lo llamará de nuevo con los comandos sin confirmar al reconciliar. */
function simStep(dt, cmd) {
  G.dt = dt;
  // la posición del paso anterior sirve para dos cosas: estimar la velocidad
  // (la usan los bots al predecir) e interpolar la vista entre pasos
  for (const f of G.fighters) { f.px = f.pos.x; f.pz = f.pos.z; f.pface = f.face; }
  for (const p of G.projectiles) { p.px = p.x; p.pz = p.z; }

  if (cmd && G.player && G.player.alive) applyInput(G.player, cmd);
  G.order++;
  const order = fightersInOrder();
  if (G.state === 'live') {
    for (const f of order) if (f.isBot && f.alive) updateAI(f, dt);
  } else {
    for (const f of G.fighters) { f.moveDir.x = 0; f.moveDir.z = 0; }
  }
  for (const f of order) tickFighter(f, dt);
  updateProjectiles(dt);
  updateZones(dt);
  updatePickups(dt);
  for (const f of G.fighters) {
    f.velEst.x = (f.pos.x - f.px) / dt;
    f.velEst.z = (f.pos.z - f.pz) / dt;
  }
  updateRound(dt);
}
