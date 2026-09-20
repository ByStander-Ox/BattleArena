/* ============================ entrada del jugador ============================ */
/* Muestrear y aplicar son dos pasos separados a propósito: entre medias hay un
   comando, que es un dato plano. Hoy va directo del teclado a la simulación;
   con el modo online irá además por la red y se volverá a aplicar al
   reconciliar. */
let _cmdSeq = 0;
function playerControl() {
  const f = G.player;
  if (!f || !f.alive) return;
  applyInput(f, sampleInput(_cmdSeq++));
}

/* ============================ ritmo de la ronda ============================ */
function updateRound(dt) {
  if (G.state === 'intro') {
    G.introT -= dt;
    const n = Math.ceil(G.introT - .2);
    if (n > 0 && n <= 3 && G.introN !== n) { G.introN = n; announce(String(n), '', .9); SFX.tick(); }
    if (G.introT <= .2 && G.introN !== 0) { G.introN = 0; announce('¡Ya!', '', .8); SFX.tone(660, 990, .3, 'triangle', .3); }
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
    if (G.nextOrb <= 0) { G.nextOrb = 24; spawnPickup('energy', 0, 0); feed('Orbe de energía en el centro'); }
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
      sdRing.visible = true;
      announce('Muerte súbita', 'La arena se cierra', 2.2);
      SFX.tone(220, 110, .7, 'sawtooth', .3);
    }
    if (G.sudden) {
      G.shrink = clamp(1 - (G.roundTime - sdStart) / 42 * .72, .26, 1);
      sdRing.scale.set(G.shrink, 1, G.shrink);
      sdRing.material.opacity = .55 + Math.abs(Math.sin(G.t * 4)) * .45;
      ringMesh.material.opacity = .25;
    } else ringMesh.material.opacity = .85;
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

/* ============================ simulación ============================ */
/* Un paso de simulación. Todo lo que cambia el estado de juego ocurre aquí y
   solo aquí, siempre con el mismo dt. Lo que queda fuera es vista: se podría
   quitar entero y la partida acabaría igual. */
function simStep(dt) {
  G.dt = dt;
  // la posición del paso anterior sirve para dos cosas: estimar la velocidad
  // (la usan los bots al predecir) e interpolar la vista entre pasos
  for (const f of G.fighters) { f.px = f.pos.x; f.pz = f.pos.z; f.pface = f.face; }
  for (const p of G.projectiles) { p.px = p.x; p.pz = p.z; }

  playerControl();
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

/* ============================ bucle ============================ */
let _acc = 0;
function frame() {
  requestAnimationFrame(frame);
  const raw = Math.min(.25, clock.getDelta());
  G.t += raw;

  const simState = G.state === 'intro' || G.state === 'live' || G.state === 'roundend';
  const simming = G.started && !G.paused && simState;
  if (simming) {
    // el acumulador recibe tiempo de juego, no real: la cámara lenta del
    // remate de ronda da menos pasos, nunca pasos más cortos
    _acc += raw * (G.state === 'roundend' ? G.timeScale : 1);
    let n = 0;
    while (_acc >= STEP && n < MAX_STEPS) { simStep(STEP); _acc -= STEP; n++; }
    if (_acc >= STEP) _acc = 0;      // tras un parón el tiempo se pierde, no se recupera
  } else _acc = 0;

  const alpha = simming ? _acc / STEP : 1;
  for (const f of G.fighters) updateFighterVisual(f, alpha);
  updateProjectileVisual(alpha);
  if (simming) {
    updateHUD();
    updatePlates();
    if (G.announceT > 0) { G.announceT -= raw; if (G.announceT <= 0) clearAnnounce(); }
  }
  updateFx(raw);
  updateFloats(raw);
  updateEmbers(raw);
  updateCamera(raw);
  renderer.render(scene, camera);
}

/* ============================ arranque ============================ */
function boot() {
  initEngine();
  initInput();
  initUI();
  showScreen('scr-title');
  const wake = () => { SFX.init(); if (SFX.ctx && SFX.ctx.state === 'suspended') SFX.ctx.resume(); };
  addEventListener('pointerdown', wake, { once: true });
  addEventListener('keydown', wake, { once: true });
  clock.start();
  frame();
}
boot();
