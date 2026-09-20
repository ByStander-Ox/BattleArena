/* ============================ bucle ============================ */
/* La frontera del proyecto en una función: arriba se simula, abajo se dibuja.

   El comando de entrada se muestrea aquí y se le pasa a simStep, que no lee
   el teclado por su cuenta. Cuando exista el modo online, este mismo bucle
   mandará ese comando por la red en vez de (o además de) aplicarlo en local, y
   simStep se llamará de nuevo con los comandos sin confirmar al reconciliar. */
let _acc = 0, _cmdSeq = 0;

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
    while (_acc >= STEP && n < MAX_STEPS) {
      simStep(STEP, G.player ? sampleInput(_cmdSeq++) : null);
      _acc -= STEP; n++;
    }
    if (_acc >= STEP) _acc = 0;      // tras un parón el tiempo se pierde, no se recupera
  } else _acc = 0;

  drainEvents();                     // lo ocurrido en la simulación se ve y se oye

  const alpha = simming ? _acc / STEP : 1;
  syncView(alpha, raw);
  if (simming) { updateHUD(); updatePlates(); }
  tickAnnounce(raw);
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
