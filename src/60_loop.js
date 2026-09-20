/* ============================ entrada del jugador ============================ */
function playerControl() {
  const f = G.player;
  if (!f || !f.alive) return;
  updateAim();
  const mv = moveInput();
  f.moveDir.x = mv.x; f.moveDir.z = mv.z;
  f.aimDir.x = Input.aimDir.x; f.aimDir.z = Input.aimDir.z;
  f.aimPt.set(Input.aim.x, 0, Input.aim.z);
  if (G.state !== 'live') { f.moveDir.x = f.moveDir.z = 0; return; }

  const ex = Input.shift || Input.exMode;
  if (Input.queued) { tryCast(f, Input.queued.i, Input.queued.ex || Input.shift); Input.queued = null; if (Input.exMode) { Input.exMode = false; syncEx(); } }
  if (Input.m1 || (Input.touch && Input.tFire)) tryCast(f, 0, false);
  if (Input.m2) tryCast(f, 1, ex);
  if (Input.keys[' ']) tryCast(f, 2, false);
  if (Input.keys['q']) tryCast(f, 3, ex);
  if (Input.keys['e']) tryCast(f, 4, ex);
  if (Input.keys['f']) tryCast(f, 5, ex);
  if (Input.keys['r']) tryCast(f, 6, false);
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

/* ============================ bucle ============================ */
let _last = 0;
function frame() {
  requestAnimationFrame(frame);
  const raw = Math.min(.05, clock.getDelta());
  G.t += raw;

  const simState = G.state === 'intro' || G.state === 'live' || G.state === 'roundend';
  if (G.started && !G.paused && simState) {
    const dt = raw * (G.state === 'roundend' ? G.timeScale : 1);
    G.dt = dt;
    playerControl();
    for (const f of G.fighters) {
      f.velEst = f.velEst || { x: 0, z: 0 };
      f._px = f._px === undefined ? f.pos.x : f._px;
      f._pz = f._pz === undefined ? f.pos.z : f._pz;
    }
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
      f.velEst.x = (f.pos.x - f._px) / Math.max(dt, .001);
      f.velEst.z = (f.pos.z - f._pz) / Math.max(dt, .001);
      f._px = f.pos.x; f._pz = f.pos.z;
      updateFighterVisual(f, dt);
    }
    updateRound(dt);
    updateHUD(dt);
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
