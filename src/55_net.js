/* ============================ protocolo ============================ */
/* El formato de cable, y nada más: convierte estado y comandos en bytes y al
   revés. Vive en la mitad de simulación porque los dos extremos lo necesitan y
   no depende de nada del navegador — se prueba entero en Node.

   Todo va cuantizado. Las posiciones a i16 en 1/256 de metro: 4 mm de
   precisión y hasta ±128 m, cuando la arena mide ±19 × ±13. Los ángulos a un
   byte, 1,4° por paso. Nada de esto se nota jugando y deja una instantánea de
   3v3 en unos 200 bytes, que a 20 por segundo son 4 KB/s.

   Lo que NO viaja: los nombres, los campeones y la composición de los equipos.
   No hacen falta, porque el montaje de la partida es determinista: con la
   misma semilla, `startMatch(seed)` crea exactamente los mismos luchadores con
   los mismos ids a los dos lados. Un servidor de verdad sí tendría que mandar
   la plantilla, para quien entre tarde o se reconecte; aquí basta la semilla. */

const NET = { HELLO: 1, WELCOME: 2, INPUT: 3, SNAPSHOT: 4 };

/* Tablas de traducción. Un evento lleva el índice, nunca la cadena. */
const SOUND_LIST = ['shot', 'hit', 'big', 'heal', 'dash', 'cast', 'ult', 'die', 'orb',
  'round', 'win', 'lose', 'tick', 'go', 'sudden', 'pierce', 'smoke', 'slash', 'slash3',
  'charge', 'fortify', 'chain', 'sanctuary', 'aegis', 'flare'];
const CC_LIST = ['stun', 'root', 'silence', 'immune'];
const ORB_LIST = ['energy', 'health'];
const STATE_LIST = ['title', 'setup', 'intro', 'live', 'roundend', 'brite', 'result'];

const idxOf = (list, v) => { const i = list.indexOf(v); return i < 0 ? 0 : i; };

/* Banderas de estado de un luchador: presencia sí/no. La duración exacta se la
   queda el servidor — el cliente solo necesita saber que está aturdido para
   dibujar el icono, y si supiera cuándo acaba se movería antes de tiempo. */
const SF = {
  alive: 1, stun: 2, root: 4, silence: 8, slow: 16, haste: 32,
  invuln: 64, evade: 128, dr: 256, casting: 512, dashing: 1024, falling: 2048, bot: 4096
};

/* ---------- escritura y lectura ---------- */
function Writer(size) {
  this.b = new ArrayBuffer(size || 4096);
  this.v = new DataView(this.b);
  this.o = 0;
}
Writer.prototype.u8 = function (n) { this.v.setUint8(this.o, n & 255); this.o += 1; return this; };
Writer.prototype.i8 = function (n) { this.v.setInt8(this.o, n); this.o += 1; return this; };
Writer.prototype.u16 = function (n) { this.v.setUint16(this.o, n & 65535); this.o += 2; return this; };
Writer.prototype.i16 = function (n) { this.v.setInt16(this.o, clamp(n | 0, -32768, 32767)); this.o += 2; return this; };
Writer.prototype.u32 = function (n) { this.v.setUint32(this.o, n >>> 0); this.o += 4; return this; };
Writer.prototype.pos = function (n) { return this.i16(Math.round(n * 256)); };
Writer.prototype.ang = function (a) { return this.u8(dirToByte(Math.sin(a), Math.cos(a))); };
Writer.prototype.done = function () { return this.b.slice(0, this.o); };

function Reader(buf) {
  this.v = new DataView(buf);
  this.o = 0;
}
Reader.prototype.u8 = function () { const n = this.v.getUint8(this.o); this.o += 1; return n; };
Reader.prototype.i8 = function () { const n = this.v.getInt8(this.o); this.o += 1; return n; };
Reader.prototype.u16 = function () { const n = this.v.getUint16(this.o); this.o += 2; return n; };
Reader.prototype.i16 = function () { const n = this.v.getInt16(this.o); this.o += 2; return n; };
Reader.prototype.u32 = function () { const n = this.v.getUint32(this.o); this.o += 4; return n; };
Reader.prototype.pos = function () { return this.i16() / 256; };
Reader.prototype.ang = function () { const d = { x: 0, z: 0 }; byteToDir(this.u8(), d); return Math.atan2(d.x, d.z); };
Reader.prototype.left = function () { return this.v.byteLength - this.o; };

/* ---------- comandos de entrada ---------- */
/* Se mandan los últimos N comandos en cada paquete, no solo el nuevo. Cuesta
   cinco bytes por comando repetido y hace que perder un paquete no cueste
   nada: el siguiente ya trae lo que faltaba. */
function encodeInput(cmds) {
  const w = new Writer(8 + cmds.length * 6);
  w.u8(NET.INPUT).u8(cmds.length);
  for (const c of cmds) {
    w.u16(c.seq).u8(c.move).u8(c.aim).u8(c.aimD).u8(c.buttons | (c.ex ? 128 : 0));
  }
  return w.done();
}
function decodeInput(r) {
  const n = r.u8();
  const cmds = [];
  for (let i = 0; i < n; i++) {
    const seq = r.u16(), move = r.u8(), aim = r.u8(), aimD = r.u8(), b = r.u8();
    cmds.push({ seq, move, aim, aimD, buttons: b & 127, ex: b & 128 ? 1 : 0 });
  }
  return cmds;
}

/* ---------- eventos ---------- */
/* Cada tipo tiene un código y una lista de campos fija. Añadir un evento es
   añadir una línea aquí y otra en el consumidor de 70_fx.js. */
const EV = [
  null,
  { e: 'sfx', f: [['id', 'snd']] },
  { e: 'hit', f: [['x', 'pos'], ['z', 'pos'], ['col', 'u32']] },
  { e: 'puff', f: [['x', 'pos'], ['y', 'pos'], ['z', 'pos'], ['col', 'u32'], ['n', 'u8'], ['scale', 'q32']] },
  { e: 'ring', f: [['x', 'pos'], ['z', 'pos'], ['radius', 'q32'], ['col', 'u32']] },
  { e: 'arc', f: [['x', 'pos'], ['z', 'pos'], ['a0', 'rad'], ['half', 'q64'], ['range', 'q32'], ['col', 'u32']] },
  { e: 'shake', f: [['a', 'q64']] },
  { e: 'clearFx', f: [] },
  { e: 'dmg', f: [['id', 'u8'], ['byId', 'u8'], ['dmg', 'u16'], ['x', 'pos'], ['z', 'pos']] },
  { e: 'heal', f: [['id', 'u8'], ['amount', 'u16'], ['x', 'pos'], ['z', 'pos']] },
  { e: 'cc', f: [['id', 'u8'], ['type', 'cc'], ['x', 'pos'], ['z', 'pos']] },
  { e: 'evade', f: [['id', 'u8'], ['x', 'pos'], ['z', 'pos']] },
  { e: 'kill', f: [['id', 'u8'], ['byId', 'u8'], ['first', 'bool']] },
  { e: 'orb', f: [['id', 'u16'], ['kind', 'orb'], ['byId', 'u8'], ['x', 'pos'], ['z', 'pos']] },
  { e: 'matchStart', f: [] },
  { e: 'matchEnd', f: [] },
  { e: 'training', f: [] },
  { e: 'roundStart', f: [['round', 'u8'], ['score', 'score'], ['training', 'bool']] },
  { e: 'roundEnd', f: [['winner', 'i8'], ['score', 'score']] },
  { e: 'countdown', f: [['n', 'u8']] },
  { e: 'sudden', f: [] },
  { e: 'orbSpawn', f: [['kind', 'orb']] },
  { e: 'relics', f: [['picks', 'u8'], ['of', 'u8']] },
  { e: 'matchResult', f: [['winner', 'i8'], ['score', 'score']] },
  { e: 'pause', f: [['on', 'bool']] },
  { e: 'relic', f: [['id', 'u8'], ['idx', 'u8']] }
];
const EV_CODE = {};
EV.forEach((d, i) => { if (d) EV_CODE[d.e] = i; });

function writeField(w, kind, v) {
  switch (kind) {
    case 'u8': w.u8(Math.round(v) || 0); break;
    case 'i8': w.i8(Math.round(v) || 0); break;
    case 'u16': w.u16(Math.round(v) || 0); break;
    case 'u32': w.u32(v || 0); break;
    case 'pos': w.pos(v || 0); break;
    case 'rad': w.ang(v || 0); break;
    case 'q32': w.u8(clamp(Math.round((v == null ? 1 : v) * 32), 0, 255)); break;
    case 'q64': w.u8(clamp(Math.round((v || 0) * 64), 0, 255)); break;
    case 'bool': w.u8(v ? 1 : 0); break;
    case 'snd': w.u8(idxOf(SOUND_LIST, v)); break;
    case 'cc': w.u8(idxOf(CC_LIST, v)); break;
    case 'orb': w.u8(idxOf(ORB_LIST, v)); break;
    case 'score': w.u8(v ? v[0] : 0); w.u8(v ? v[1] : 0); break;
  }
}
function readField(r, kind) {
  switch (kind) {
    case 'u8': return r.u8();
    case 'i8': return r.i8();
    case 'u16': return r.u16();
    case 'u32': return r.u32();
    case 'pos': return r.pos();
    case 'rad': return r.ang();
    case 'q32': return r.u8() / 32;
    case 'q64': return r.u8() / 64;
    case 'bool': return !!r.u8();
    case 'snd': return SOUND_LIST[r.u8()];
    case 'cc': return CC_LIST[r.u8()];
    case 'orb': return ORB_LIST[r.u8()];
    case 'score': return [r.u8(), r.u8()];
  }
}

/* ---------- instantánea ---------- */
function fighterFlags(f) {
  let m = 0;
  if (f.alive) m |= SF.alive;
  if (f.st.stun > 0) m |= SF.stun;
  if (f.st.root > 0) m |= SF.root;
  if (f.st.silence > 0) m |= SF.silence;
  if (f.st.slowAmt > 0) m |= SF.slow;
  if (f.st.hasteAmt > 0) m |= SF.haste;
  if (f.st.invuln > 0) m |= SF.invuln;
  if (f.st.evade > 0) m |= SF.evade;
  if (f.st.drAmt > 0) m |= SF.dr;
  if (f.casting) m |= SF.casting;
  if (f.dash) m |= SF.dashing;
  if (f.falling > 0) m |= SF.falling;
  if (f.isBot) m |= SF.bot;
  return m;
}

function encodeSnapshot(tick, ackSeq) {
  const w = new Writer(8192);
  w.u8(NET.SNAPSHOT).u32(tick).u16(ackSeq);
  w.u8(idxOf(STATE_LIST, G.state)).u8(G.round).u8(G.score[0]).u8(G.score[1]);
  w.u16(Math.round(G.roundTime * 10)).u8(clamp(Math.round(G.shrink * 255), 0, 255));

  w.u8(G.fighters.length);
  for (const f of G.fighters) {
    w.u8(f.uid).u8(f.team).u16(fighterFlags(f));
    w.pos(f.pos.x).pos(f.pos.z).ang(f.face);
    w.u16(Math.round(f.hp)).u16(Math.round(f.maxHp)).u16(Math.round(f.shield)).u8(Math.round(f.energy));
    // las magnitudes, no solo la presencia: mueven al personaje
    w.u8(clamp(Math.round(f.st.slowAmt * 200), 0, 255)).u8(clamp(Math.round(f.st.hasteAmt * 200), 0, 255));
    // de la canalización viaja qué habilidad y cuánto lleva: con eso el cliente
    // dibuja la barra y sabe que estás frenado, pero el disparo lo hace el servidor
    w.u8(f.casting ? f.casting.i : 255);
    // en pasos, no en fracción: el reloj avanza justo un paso cada vez, así que
    // así es exacto y el cliente frena y suelta en el mismo instante que el servidor
    w.u8(f.casting ? clamp(Math.round(f.casting.t / STEP), 0, 255) : 0);
    w.u8(f.deadT > 4 ? 255 : Math.round(f.deadT * 60));
  }

  /* Bloque del jugador controlado. Solo él se predice, así que solo de él hace
     falta mandar lo que la predicción necesita reproducir exactamente:

     · las recargas, o el cliente predice un lanzamiento que el servidor
       rechaza y la barra de habilidades miente hasta que caduca;
     · el desplazamiento en curso, que es lo más rápido del juego — a 36 m/s un
       solo paso de desfase es más de un metro, y sin esto el dash del cliente
       y el del servidor terminan en instantes distintos;
     · el empuje pendiente, o el cliente se queda parado mientras el servidor
       te sigue arrastrando.

     Son doce bytes en el peor caso y quitan de golpe casi todo el error. */
  const me = G.player;
  w.u8(me ? me.cds.length : 0);
  // en milisegundos, no en octavos: con 125 ms de margen el cliente y el
  // servidor pueden decidir distinto si una habilidad está lista, y entonces
  // uno canaliza (y va al 42 % de velocidad) mientras el otro corre
  if (me) for (const cd of me.cds) w.u16(clamp(Math.round(cd * 1000), 0, 65535));
  const d = me && me.dash, kn = me && me.knock.t > 0 ? me.knock : null;
  w.u8((d ? 1 : 0) | (kn ? 2 : 0));
  /* Aquí la resolución importa más que en ningún otro sitio: un dash va a
     36 m/s, así que una centésima de segundo de error son 36 cm de tirón. El
     reloj del dash avanza justo un paso cada vez, así que va en pasos y es
     exacto; la duración y la velocidad, en diezmilésimas. */
  if (d) {
    w.u8(dirToByte(d.dx, d.dz)).u16(clamp(Math.round(d.speed * 256), 0, 65535));
    w.u8(clamp(Math.round(d.t / STEP), 0, 255)).u16(clamp(Math.round(d.dur * 10000), 0, 65535));
  }
  if (kn) {
    w.pos(kn.x).pos(kn.z).u16(clamp(Math.round(kn.t * 10000), 0, 65535));
  }

  w.u8(Math.min(255, G.projectiles.length));
  for (let i = 0; i < Math.min(255, G.projectiles.length); i++) {
    const p = G.projectiles[i];
    w.u16(p.id).pos(p.x).pos(p.z).u8(dirToByte(p.dx, p.dz));
    w.u8(clamp(Math.round(p.radius * 32), 0, 255)).u32(p.col);
    w.u8(clamp(Math.round(p.scale * 32), 0, 255)).u8(p.flat ? 1 : 0);
  }

  w.u8(Math.min(255, G.zones.length));
  for (let i = 0; i < Math.min(255, G.zones.length); i++) {
    const z = G.zones[i];
    w.u16(z.id).pos(z.x).pos(z.z).u8(clamp(Math.round(z.radius * 8), 0, 255)).u32(z.col);
    w.u8((z.rain ? 1 : 0) | (z.delay > 0 ? 2 : 0));
  }

  w.u8(Math.min(255, G.pickups.length));
  for (let i = 0; i < Math.min(255, G.pickups.length); i++) {
    const p = G.pickups[i];
    w.u16(p.id).pos(p.x).pos(p.z).u8(idxOf(ORB_LIST, p.type));
  }

  const evs = G.events.filter(e => EV_CODE[e.e] != null);
  w.u8(Math.min(255, evs.length));
  for (let i = 0; i < Math.min(255, evs.length); i++) {
    const ev = evs[i], d = EV[EV_CODE[ev.e]];
    w.u8(EV_CODE[ev.e]);
    for (const [name, kind] of d.f) writeField(w, kind, ev[name]);
  }
  return w.done();
}

function decodeSnapshot(r) {
  const s = {
    tick: r.u32(), ackSeq: r.u16(),
    state: STATE_LIST[r.u8()], round: r.u8(), score: [r.u8(), r.u8()],
    roundTime: r.u16() / 10, shrink: r.u8() / 255,
    fighters: [], projectiles: [], zones: [], pickups: [], events: []
  };
  let n = r.u8();
  for (let i = 0; i < n; i++) {
    const f = { uid: r.u8(), team: r.u8(), flags: r.u16() };
    f.x = r.pos(); f.z = r.pos(); f.face = r.ang();
    f.hp = r.u16(); f.maxHp = r.u16(); f.shield = r.u16(); f.energy = r.u8();
    f.slowAmt = r.u8() / 200; f.hasteAmt = r.u8() / 200;
    f.castIdx = r.u8(); f.castT = r.u8() * STEP; f.deadT = r.u8() / 60;
    s.fighters.push(f);
  }
  n = r.u8();
  s.cds = [];
  for (let i = 0; i < n; i++) s.cds.push(r.u16() / 1000);
  const lf = r.u8();
  if (lf & 1) {
    const d = { x: 0, z: 0 }; byteToDir(r.u8(), d);
    s.dash = { dx: d.x, dz: d.z, speed: r.u16() / 256, t: r.u8() * STEP, dur: r.u16() / 10000 };
  } else s.dash = null;
  s.knock = (lf & 2) ? { x: r.pos(), z: r.pos(), t: r.u16() / 10000 } : null;
  n = r.u8();
  for (let i = 0; i < n; i++) {
    const p = { id: r.u16(), x: r.pos(), z: r.pos() };
    const d = { x: 0, z: 0 }; byteToDir(r.u8(), d);
    p.dx = d.x; p.dz = d.z;
    p.radius = r.u8() / 32; p.col = r.u32(); p.scale = r.u8() / 32; p.flat = !!r.u8();
    s.projectiles.push(p);
  }
  n = r.u8();
  for (let i = 0; i < n; i++) {
    const z = { id: r.u16(), x: r.pos(), z: r.pos(), radius: r.u8() / 8, col: r.u32() };
    const fl = r.u8();
    z.rain = !!(fl & 1); z.delay = (fl & 2) ? 1 : 0;
    s.zones.push(z);
  }
  n = r.u8();
  for (let i = 0; i < n; i++) {
    s.pickups.push({ id: r.u16(), x: r.pos(), z: r.pos(), type: ORB_LIST[r.u8()] });
  }
  n = r.u8();
  for (let i = 0; i < n; i++) {
    const d = EV[r.u8()];
    const ev = { e: d.e };
    for (const [name, kind] of d.f) ev[name] = readField(r, kind);
    s.events.push(ev);
  }
  return s;
}

/* ---------- saludo ---------- */
/* Con la semilla y las opciones, los dos lados montan la misma partida. */
function encodeHello(sel) {
  const w = new Writer(16);
  w.u8(NET.HELLO).u8(idxOf(['duel', 'duo', 'squad', 'training'], sel.mode))
    .u8(idxOf(['easy', 'normal', 'hard', 'elite'], sel.diff))
    .u8(idxOf(CHAMP_LIST, sel.champ));
  return w.done();
}
function decodeHello(r) {
  return {
    mode: ['duel', 'duo', 'squad', 'training'][r.u8()],
    diff: ['easy', 'normal', 'hard', 'elite'][r.u8()],
    champ: CHAMP_LIST[r.u8()]
  };
}
function encodeWelcome(seed, playerUid) {
  const w = new Writer(16);
  w.u8(NET.WELCOME).u32(seed).u8(playerUid);
  return w.done();
}
function decodeWelcome(r) { return { seed: r.u32(), playerUid: r.u8() }; }

function msgType(buf) { return new DataView(buf).getUint8(0); }
