/* ============================ cliente de red ============================ */
/* El cliente no espera al servidor para moverse. Simula su propio luchador en
   cuanto pulsas, y cuando llega la instantánea corrige lo que haga falta. A
   los demás los dibuja con retraso, interpolando entre las dos instantáneas
   que rodean ese instante.

   Qué se predice y qué no, que es la decisión de diseño de todo esto:

     se predice                        no se predice
     ──────────────────────────────    ───────────────────────────────
     tu movimiento                     el daño que haces a otro
     tu desplazamiento (dash)          el control que te aplican
     el inicio de tu canalización      los empujes que recibes
     tus recargas y tu energía         las muertes

   La regla es «predice tu intención, nunca el resultado sobre otro». Un
   cliente que predice que mata a alguien y luego tiene que desmentirlo se
   siente mucho peor que uno que espera 60 ms para ver el impacto.          */

const NET_CFG = {
  interpDelay: 0.100,      // s de retraso al dibujar a los demás: 2 instantáneas a 20 Hz
  maxExtrap: 0.100,        // s de extrapolación antes de congelar
  redundancy: 3,           // comandos por paquete: perder uno no cuesta nada
  snapBuf: 40,             // instantáneas guardadas (2 s)
  softError: 1.0,          // m: por debajo se absorbe suave, por encima se salta
  ignoreError: 0.02,       // m: ruido de cuantización, no se toca nada
  smoothTime: 0.100        // s en absorber una corrección pequeña
};

function createClient(send) {
  const cl = {
    connected: false, playerUid: 0,
    seq: 0, history: [], snaps: [], clock: 0, lastRound: -1, lastState: '', settle: 0,
    offX: 0, offZ: 0,                // desfase visual mientras se absorbe una corrección
    stats: { corrections: 0, snaps: 0, gaps: 0, errors: [], dirty: [], transition: [] }
  };

  cl.hello = function (sel) { send(encodeHello(sel)); };

  cl.onMessage = function (buf) {
    const r = new Reader(buf);
    const type = r.u8();
    if (type === NET.WELCOME) {
      const w = decodeWelcome(r);
      startMatch(w.seed);            // el montaje es determinista: mismos ids
      cl.playerUid = w.playerUid;
      cl.connected = true;
      return;
    }
    if (type === NET.SNAPSHOT) {
      const s = decodeSnapshot(r);
      s.at = cl.clock;
      cl.snaps.push(s);
      while (cl.snaps.length > NET_CFG.snapBuf) cl.snaps.shift();
      cl.stats.snaps++;
      /* El estado de la partida se toma de la instantánea MÁS NUEVA, no de la
         interpolada. La interpolación retrasa el dibujo 100 ms a propósito,
         pero `applyInput` congela el movimiento cuando el estado no es `live`:
         si la predicción mirase el estado retrasado, seguiría quieta 100 ms
         después de que empiece la ronda mientras el servidor ya te mueve. Se
         interpolan posiciones, nunca reglas. */
      G.state = s.state; G.round = s.round;
      G.score[0] = s.score[0]; G.score[1] = s.score[1];
      G.roundTime = s.roundTime; G.shrink = s.shrink; G.sudden = s.shrink < .999;
      reconcile(cl, s);
      /* Las reliquias no se dibujan: se aplican. Son estado de juego que el
         cliente necesita para predecir igual que el servidor, así que se
         quedan aquí y no llegan a la vista. */
      for (const ev of s.events) {
        if (ev.e === 'relic') {
          const f = fighterById(ev.id), r2 = RELICS[ev.idx];
          if (f && r2 && !f.relics.includes(r2)) { G.mute = true; applyRelic(f, r2); G.mute = false; }
        } else G.events.push(ev);
      }
      return;
    }
  };

  /* Un paso de cliente: muestrear, mandar, predecir. */
  cl.step = function (cmd) {
    if (!cl.connected) return;
    cmd.seq = ++cl.seq;
    cl.history.push(cmd);
    if (cl.history.length > 240) cl.history.shift();
    send(encodeInput(cl.history.slice(-NET_CFG.redundancy)));
    predictLocal(cl, cmd);
  };

  cl.tickClock = function (dt) { cl.clock += dt; };
  return cl;
}

/* ---------- predicción ---------- */
/* Solo el luchador local, y solo su movimiento: nada de daño, nada de control.
   Es el mismo `tickFighter` que corre el servidor, con la misma entrada, así
   que mientras nadie te toque los dos llegan al mismo sitio. */
function predictLocal(cl, cmd) {
  const f = fighterById(cl.playerUid);
  if (!f || !f.alive) return;
  f.px = f.pos.x; f.pz = f.pos.z; f.pface = f.face;
  G.mute = true;
  applyInput(f, cmd);
  tickFighter(f, STEP);
  G.mute = false;
}

/* ---------- reconciliación ---------- */
/* El servidor manda. Se coloca al luchador donde él dice, se tiran los
   comandos que ya confirmó y se vuelven a aplicar los que quedan. */
function reconcile(cl, snap) {
  const f = fighterById(cl.playerUid);
  if (!f) return;
  const sf = snap.fighters.find(x => x.uid === cl.playerUid);
  if (!sf) return;

  const beforeX = f.pos.x, beforeZ = f.pos.z;
  const wasAlive = f.alive;

  writeFighter(f, sf);
  /* El bloque local: recargas, desplazamiento y empuje tal como los tiene el
     servidor. Sin esto la predicción arranca cada reconciliación desde un
     estado ligeramente distinto y el error nunca baja de unos centímetros. */
  if (snap.cds && snap.cds.length === f.cds.length) {
    for (let i = 0; i < snap.cds.length; i++) f.cds[i] = snap.cds[i];
  }
  f.dash = snap.dash
    ? { dx: snap.dash.dx, dz: snap.dash.dz, speed: snap.dash.speed, t: snap.dash.t,
        dur: snap.dash.dur, dmg: 0, cc: null, ccT: 0, stopOnHit: false, hit: [], trail: null }
    : null;
  if (snap.knock) { f.knock.x = snap.knock.x; f.knock.z = snap.knock.z; f.knock.t = snap.knock.t; }
  else f.knock.t = 0;
  cl.history = cl.history.filter(c => c.seq > snap.ackSeq);
  G.mute = true;
  for (const c of cl.history) {
    if (!f.alive) break;
    applyInput(f, c);
    tickFighter(f, STEP);
  }
  G.mute = false;

  /* Hay dos errores distintos y conviene no sumarlos.

     El limpio es el que mide si la predicción funciona: nadie te ha tocado, así
     que cliente y servidor corrieron el mismo código con la misma entrada y
     deben coincidir hasta el último bit. Si ese sube, algo está roto.

     El sucio es el de las ventanas en las que te golpearon, te aturdieron o te
     empujaron. Ese no se puede predecir por diseño — predecir el resultado que
     otro tiene sobre ti es justo lo que este modelo evita — y su tamaño dice
     cuánto tirón vas a ver, no si el código está bien.

     Y luego están los saltos que no son error de nada: al empezar la ronda todo
     el mundo reaparece en su marca y al morir el servidor mueve el cuerpo. Esos
     no se cuentan. */
  const err = Math.hypot(f.pos.x - beforeX, f.pos.z - beforeZ);
  if (snap.round !== cl.lastRound) { cl.lastRound = snap.round; cl.settle = 8; }
  if (cl.settle > 0) { cl.settle--; return; }

  /* Un cambio de estado es el tercer tipo de corrección, y el más fácil de
     confundir con un fallo. Cuando la ronda pasa de cuenta atrás a viva, el
     cliente sigue congelado hasta que le llega la instantánea que lo dice: a
     20 Hz eso son hasta 50 ms andando a 7,3 m/s, unos 35 cm, una vez por ronda
     y con todo el mundo quieto en su marca. Es el precio de no dejar que el
     cliente decida cuándo empieza la ronda, y se paga a gusto. */
  const changed = snap.state !== cl.lastState;
  cl.lastState = snap.state;
  if (changed) { if (snap.state === 'live') cl.stats.transition.push(err); return; }
  if (snap.state !== 'live' || !wasAlive || !f.alive) return;

  const me = cl.playerUid;
  const touched = snap.events.some(ev =>
    (ev.e === 'dmg' || ev.e === 'cc' || ev.e === 'evade' || ev.e === 'kill') && ev.id === me);
  (touched ? cl.stats.dirty : cl.stats.errors).push(err);
  /* Diagnóstico: guarda el contexto de la peor corrección limpia, que es la que
     dice si falta algo por sincronizar. */
  if (!touched && err > (cl.stats.worst ? cl.stats.worst.err : 0)) {
    cl.stats.worst = { err, unacked: cl.history.length, dashing: !!f.dash, casting: !!f.casting };
  }
  if (err > NET_CFG.ignoreError) {
    cl.stats.corrections++;
    if (err < NET_CFG.softError) {
      // error pequeño: se absorbe moviendo solo el dibujo, no el estado
      cl.offX += beforeX - f.pos.x;
      cl.offZ += beforeZ - f.pos.z;
    } else {
      // te aturdieron o te empujaron y no había forma de saberlo: salto limpio
      cl.offX = 0; cl.offZ = 0;
    }
  }
}

/* Escribe en un luchador el estado que dice una instantánea. Las duraciones no
   viajan: de las banderas solo se sabe «está aturdido», no cuánto le queda, y
   así el cliente no puede adelantarse al final de un control. */
function writeFighter(f, sf) {
  f.pos.x = sf.x; f.pos.z = sf.z; f.face = sf.face;
  f.hp = sf.hp; f.maxHp = sf.maxHp; f.shield = sf.shield; f.energy = sf.energy;
  f.alive = !!(sf.flags & SF.alive);
  f.deadT = sf.deadT;
  f.falling = (sf.flags & SF.falling) ? Math.max(f.falling, 0.001) : 0;
  /* Cada estado son dos cosas: un temporizador y una magnitud. El temporizador
     no viaja (el cliente no debe saber cuándo acaba un aturdimiento, o se
     movería antes de tiempo), así que se pone a uno mientras la bandera esté
     puesta y la siguiente instantánea lo renovará o lo apagará. La magnitud sí
     viaja, porque un 45 % de ralentización y un 25 % mueven distinto. */
  const st = f.st;
  st.stun = (sf.flags & SF.stun) ? 1 : 0;
  st.root = (sf.flags & SF.root) ? 1 : 0;
  st.silence = (sf.flags & SF.silence) ? 1 : 0;
  st.slow = sf.slowAmt > 0 ? 1 : 0; st.slowAmt = sf.slowAmt;
  st.haste = sf.hasteAmt > 0 ? 1 : 0; st.hasteAmt = sf.hasteAmt;
  st.invuln = (sf.flags & SF.invuln) ? 1 : 0;
  st.evade = (sf.flags & SF.evade) ? 1 : 0;
  st.dr = (sf.flags & SF.dr) ? 1 : 0; st.drAmt = (sf.flags & SF.dr) ? .25 : 0;
  /* La canalización se reconstruye como «fantasma»: avanza y frena el
     movimiento igual que la de verdad, pero al terminar no dispara nada. El
     disparo es del servidor, y su efecto llegará como proyectil o como evento.
     Sin esto el cliente lanzaría cada habilidad dos veces. */
  if (sf.castIdx < f.champ.ab.length) {
    const ab = f.champ.ab[sf.castIdx];
    f.casting = { i: sf.castIdx, ab, o: null, t: sf.castT, dur: ab.wind || .01, root: !!ab.ult, ghost: true };
  } else f.casting = null;
  /* El desplazamiento no se reconstruye: un dash falso con velocidad cero
     bloquearía el movimiento hasta que caducara. El del jugador local ya lo
     conoce la predicción, y el de los demás solo se perdería la estela. */
}

/* ---------- interpolación ---------- */
/* Todo lo que no controlas se dibuja 100 ms en el pasado, mezclando las dos
   instantáneas que rodean ese instante. Es lo que convierte 20 instantáneas
   por segundo en movimiento continuo.

   Si el búfer se queda seco se extrapola como mucho otros 100 ms y luego se
   congela: extrapolar más produce gente que atraviesa pilares y vuelve de
   golpe. */
function interpolateWorld(cl) {
  const t = cl.clock - NET_CFG.interpDelay;
  const n = cl.snaps.length;
  if (!n) return;

  let a = null, b = null;
  for (let i = n - 1; i >= 0; i--) {
    if (cl.snaps[i].at <= t) { a = cl.snaps[i]; b = cl.snaps[i + 1] || null; break; }
  }
  if (!a) { a = cl.snaps[0]; b = cl.snaps[1] || null; }

  let k = 0;
  if (b) k = clamp((t - a.at) / Math.max(1e-6, b.at - a.at), 0, 1);
  else {
    const over = t - a.at;
    if (over > NET_CFG.maxExtrap) cl.stats.gaps++;
  }
  const src = b || a;

  applyWorld(cl, a, src, k);
}

function lerpSnapField(a, b, key, id, k, fallback) {
  const ea = a.find(x => x.id === id || x.uid === id);
  const eb = b.find(x => x.id === id || x.uid === id);
  if (ea && eb) return lerp(ea[key], eb[key], k);
  return (eb || ea || fallback)[key];
}

function applyWorld(cl, a, b, k) {
  // --- luchadores remotos ---
  for (const f of G.fighters) {
    if (f.uid === cl.playerUid) continue;
    const sb = b.fighters.find(x => x.uid === f.uid);
    if (!sb) continue;
    const sa = a.fighters.find(x => x.uid === f.uid);
    const wasX = f.pos.x, wasZ = f.pos.z;
    G.mute = true;
    writeFighter(f, sb);
    G.mute = false;
    if (sa && sa !== sb) {
      f.pos.x = lerp(sa.x, sb.x, k);
      f.pos.z = lerp(sa.z, sb.z, k);
      f.face = sa.face + angDiff(sb.face, sa.face) * k;
    }
    // la suavidad ya la dio la interpolación entre instantáneas: que la vista
    // no vuelva a interpolar por su cuenta
    f.px = f.pos.x; f.pz = f.pos.z; f.pface = f.face;
    f.bob += Math.hypot(f.pos.x - wasX, f.pos.z - wasZ) * 1.6;
  }

  // --- proyectiles, zonas y orbes: se reconstruyen de la instantánea ---
  syncList(G.projectiles, b.projectiles, a.projectiles, k, makeNetProj);
  syncList(G.zones, b.zones, a.zones, k, makeNetZone);
  syncList(G.pickups, b.pickups, a.pickups, k, makeNetPickup);
}

/* Reconstruye una lista de entidades desde la instantánea, conservando las que
   siguen ahí (para que la vista no recree su malla) y colocándolas por
   interpolación. */
function syncList(list, now, prev, k, make) {
  const live = new Set();
  for (const s of now) {
    live.add(s.id);
    let e = list.find(x => x.id === s.id);
    if (!e) { e = make(s); list.push(e); e.px = s.x; e.pz = s.z; }
    else { e.px = e.x; e.pz = e.z; }
    const p = prev && prev.find(x => x.id === s.id);
    e.x = p ? lerp(p.x, s.x, k) : s.x;
    e.z = p ? lerp(p.z, s.z, k) : s.z;
    if (s.delay !== undefined) e.delay = s.delay;
  }
  for (let i = list.length - 1; i >= 0; i--) if (!live.has(list[i].id)) list.splice(i, 1);
}

function makeNetProj(s) {
  return {
    id: s.id, x: s.x, z: s.z, px: s.x, pz: s.z, dx: s.dx, dz: s.dz,
    radius: s.radius, col: s.col, scale: s.scale, flat: s.flat,
    speed: 0, range: 0, traveled: 0, dmg: 0, team: 0, ownerId: 0, hit: [], alive: true
  };
}
function makeNetZone(s) {
  return {
    id: s.id, x: s.x, z: s.z, radius: s.radius, col: s.col, rain: s.rain,
    delay: s.delay, dur: 1e9, t: 0, team: 0, ownerId: 0, alive: true
  };
}
function makeNetPickup(s) {
  return { id: s.id, type: s.type, x: s.x, z: s.z, t: 0 };
}

/* ---------- desfase visual ---------- */
/* Una corrección pequeña no se aplica de golpe al dibujo: se reparte en 100 ms
   moviendo solo la malla, mientras el estado ya es el del servidor. */
function decayOffset(cl, dt) {
  const k = Math.min(1, dt / NET_CFG.smoothTime);
  cl.offX -= cl.offX * k;
  cl.offZ -= cl.offZ * k;
  if (Math.abs(cl.offX) < 1e-4) cl.offX = 0;
  if (Math.abs(cl.offZ) < 1e-4) cl.offZ = 0;
}

/* Resumen de calidad para el HUD de red y para tests/netloop.js. */
function netReport(cl) {
  const stat = arr => {
    const e = arr.slice().sort((a, b) => a - b);
    const q = p => e.length ? e[Math.min(e.length - 1, Math.floor(e.length * p))] : 0;
    return { n: e.length, p50: q(.5), p95: q(.95), max: e.length ? e[e.length - 1] : 0 };
  };
  return {
    snapshots: cl.stats.snaps,
    corrections: cl.stats.corrections,
    gaps: cl.stats.gaps,
    clean: stat(cl.stats.errors),
    dirty: stat(cl.stats.dirty),
    transition: stat(cl.stats.transition)
  };
}
