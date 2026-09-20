/* ============================ servidor ============================ */
/* El lado autoritativo. No sabe nada de pantallas: recibe comandos, avanza la
   simulación a 60 pasos fijos por segundo y emite una instantánea cada tres
   pasos. Es lo que correrá dentro de un Web Worker en la etapa 3 y dentro de
   un proceso Node en la etapa 4, sin cambiar nada.

   La regla que lo hace a prueba de trampas está en `applyInput`, no aquí: un
   comando solo dice qué botones van pulsados y hacia dónde miras. Quien decide
   si la habilidad sale es `canCast`, que comprueba silencio, energía y recarga
   con el estado del servidor. El servidor no necesita código de validación
   porque su código de juego ya es la validación. */

const SNAP_EVERY = 3;              // un paso de cada tres → 20 instantáneas/s
const CMD_QUEUE_MAX = 12;          // tope de comandos en cola: ~200 ms de margen

function createServer(send, fixedSeed) {
  /* `fixedSeed` pone la partida en una semilla concreta en vez de sortearla.
     Lo necesitan las pruebas para ser reproducibles, y lo querrá cualquier
     servidor que reproduzca una partida guardada. */
  const sv = {
    tick: 0, acc: 0, sinceSnap: 0,
    queue: [], lastCmd: null, ackSeq: 0, seen: new Set(),
    started: false, dropped: 0, starved: 0
  };

  sv.onMessage = function (buf) {
    const r = new Reader(buf);
    const type = r.u8();
    if (type === NET.HELLO) {
      const h = decodeHello(r);
      SEL.mode = h.mode; SEL.diff = h.diff; SEL.champ = h.champ;
      const seed = fixedSeed === undefined ? (frand() * 0xFFFFFFFF) >>> 0 : (fixedSeed >>> 0);
      startMatch(seed);
      sv.started = true;
      send(encodeWelcome(G.seed, G.player ? G.player.uid : 0));
      return;
    }
    if (type === NET.INPUT) {
      for (const c of decodeInput(r)) {
        // el reenvío redundante trae comandos ya vistos: se descartan por seq
        if (c.seq <= sv.ackSeq || sv.seen.has(c.seq)) continue;
        sv.seen.add(c.seq);
        sv.queue.push(c);
      }
      sv.queue.sort((a, b) => a.seq - b.seq);
      // un cliente que envía de más intenta simular más rápido que los demás
      while (sv.queue.length > CMD_QUEUE_MAX) { sv.queue.shift(); sv.dropped++; }
    }
  };

  /* Un comando por paso. Si el paquete llega tarde, se repite el último: es
     mejor que el personaje siga andando a que dé un tirón cada vez que la red
     hipa. Si llega de sobra, la cola se recorta arriba. */
  sv.nextCmd = function () {
    if (sv.queue.length) {
      const c = sv.queue.shift();
      sv.ackSeq = c.seq;
      sv.lastCmd = c;
      return c;
    }
    if (sv.lastCmd) { sv.starved++; return sv.lastCmd; }
    return null;
  };

  sv.update = function (dt) {
    if (!sv.started) return;
    sv.acc += dt;
    let n = 0;
    while (sv.acc >= STEP && n < MAX_STEPS) {
      simStep(STEP, sv.nextCmd());
      sv.tick++;
      n++;
      sv.acc -= STEP;
      if (++sv.sinceSnap >= SNAP_EVERY) {
        sv.sinceSnap = 0;
        send(encodeSnapshot(sv.tick, sv.ackSeq));
        G.events.length = 0;        // ya viajaron: el servidor no los dibuja
      }
    }
    if (sv.acc >= STEP) sv.acc = 0;
    if (G.events.length > 400) G.events.length = 0;   // por si nadie recoge
  };

  return sv;
}
