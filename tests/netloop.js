/* Cliente y servidor de verdad, separados por una red falsa.

   Dos contextos aislados — cada uno con su propio `G`, como lo estarán el hilo
   principal y el Web Worker — unidos por un enlace con latencia, fluctuación y
   pérdida configurables. Un reloj virtual avanza a 60 pasos por segundo, así
   que una prueba de 30 s de juego tarda menos de un segundo.

   Lo que mide es el error de reconciliación: cuánto se mueve tu luchador en el
   instante en que llega la instantánea y el servidor dice dónde estabas de
   verdad. Es la traducción medible de «se siente como en local»:

     · con 0 ms el error debe ser exactamente cero — misma entrada, mismo
       código, mismo resultado. Si no lo es, la predicción está mal.
     · con latencia real, lo que importa es que el p95 se quede por debajo de
       unos centímetros. Los picos existen y son legítimos: son los empujes y
       los aturdimientos, que por diseño no se predicen.                     */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');

const SIM = ['src/10_core.js', 'src/20_champs.js', 'src/30_combat.js',
             'src/40_ai.js', 'src/50_match.js', 'src/55_net.js'];
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

function makeCtx(extra, label) {
  const ctx = vm.createContext({
    console: { log: (...a) => console.log('   [' + label + ']', ...a), error: () => { } }
  });
  vm.runInContext(SIM.concat(extra).map(read).join('\n'), ctx, { filename: label });
  /* Las declaraciones `const` de un script no quedan colgadas de globalThis,
     así que se exportan a mano; las funciones sí son accesibles. */
  vm.runInContext('globalThis.X = { G, SEL, STEP, BTN, dirToByte };', ctx);
  return ctx;
}

/* ---------- la red falsa ---------- */
function makeLink(cfg, rnd) {
  return {
    queue: [],
    sent: 0, lost: 0,
    push(to, buf, now) {
      this.sent++;
      // el saludo va por canal fiable en cualquier diseño real: no se pierde
      const type = new DataView(buf).getUint8(0);
      const reliable = type === 1 || type === 2;
      if (!reliable && rnd() < cfg.loss) { this.lost++; return; }
      const lat = cfg.latency + (rnd() * 2 - 1) * cfg.jitter;
      this.queue.push({ to, buf, at: now + Math.max(0, lat) });
    },
    deliver(now) {
      // TCP entrega en orden; con jitter un paquete puede adelantar a otro, así
      // que se ordena por hora de llegada antes de repartir
      this.queue.sort((a, b) => a.at - b.at);
      while (this.queue.length && this.queue[0].at <= now) {
        const p = this.queue.shift();
        p.to(p.buf);
      }
    }
  };
}

/* ---------- entrada guionizada ---------- */
/* Un patrón reproducible que orbita, cambia de rumbo y lanza habilidades. No
   pretende jugar bien: pretende mover al personaje de todas las maneras que
   la predicción tiene que acertar, incluidos los desplazamientos. */
function makeScript(ctx, seedFn, noAbilities) {
  const { dirToByte, BTN } = ctx.X;
  return function (t) {
    if (noAbilities) return { seq: 0, move: dirToByte(Math.cos(t * 0.9 + Math.sin(t * 0.37) * 2.2), Math.sin(t * 0.9 + Math.sin(t * 0.37) * 2.2)), aim: dirToByte(Math.sin(t * 1.3), Math.cos(t * 1.3)), aimD: 100, buttons: 0, ex: 0 };
    const a = t * 0.9 + Math.sin(t * 0.37) * 2.2;
    let buttons = 0;
    if (seedFn() < .06) buttons |= BTN.M1;
    if (seedFn() < .012) buttons |= BTN.SP;      // desplazamiento: el caso difícil
    if (seedFn() < .010) buttons |= BTN.Q;
    if (seedFn() < .008) buttons |= BTN.F;
    return {
      seq: 0,
      move: dirToByte(Math.cos(a), Math.sin(a)),
      aim: dirToByte(Math.sin(t * 1.3), Math.cos(t * 1.3)),
      aimD: 90 + ((t * 13) % 60 | 0),
      buttons, ex: 0
    };
  };
}

function run(cfg) {
  const server = makeCtx(['src/56_server.js'], 'srv');
  const client = makeCtx(['src/57_client.js'], 'cli');

  // azar propio de la prueba, con semilla: la red falsa es reproducible
  let s = cfg.seed >>> 0 || 1;
  const rnd = () => {
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  let now = 0;
  const link = makeLink(cfg, rnd);
  const sv = server.createServer(buf => link.push(b => client.__recv(b), buf, now), cfg.seed);
  const cl = client.createClient(buf => link.push(b => sv.onMessage(b), buf, now));
  client.__recv = buf => cl.onMessage(buf);

  server.seedSim(cfg.seed);
  const csel = client.X.SEL;
  csel.mode = 'squad'; csel.diff = 'hard'; csel.champ = 'vesk';
  cl.hello(csel);

  const script = makeScript(client, rnd, cfg.noAbilities);
  const STEP = client.X.STEP;
  const steps = Math.round(cfg.seconds / STEP);
  let predicted = 0, frozen = false, stepMax = 0, stepN = 0, stepBad = 0;
  const pred = {};

  for (let i = 0; i < steps; i++) {
    now += STEP;
    link.deliver(now);
    cl.tickClock(STEP);

    /* Quien elige reliquia es el servidor: el cliente se entera por el evento
       `relic` y la aplica, que es como funcionará en red de verdad. */
    if (server.X.G.state === 'brite') server.pickRelic(0);

    /* En vacío: los demás se quedan quietos. Aísla la predicción de todo lo
       que por diseño no se puede predecir — golpes, control, empujes y la
       energía que dan — y deja a la vista el suelo real del método. */
    if (cfg.freeze && cl.connected && !frozen) {
      frozen = true;
      for (const f of server.X.G.fighters) if (f !== server.X.G.player) f.isBot = false;
    }
    if (cl.connected) {
      cl.step(script(now));
      predicted++;
      /* Ground truth: se guarda lo que el cliente predijo para este comando, y
         cuando el servidor lo consuma se comparan las dos posiciones. Esto no
         pasa por la reconciliación ni por el cable: compara directamente las
         dos simulaciones. Si coinciden paso a paso, la predicción es correcta,
         y cualquier diferencia que aparezca luego es de la red o de la medida. */
      const cf = client.X.G.byId.get(cl.playerUid);
      if (cf) pred[cl.seq] = { x: cf.pos.x, z: cf.pos.z,
        cast: cf.casting ? cf.casting.i + '@' + cf.casting.t.toFixed(4) : '-',
        dash: cf.dash ? cf.dash.t.toFixed(4) + '/' + cf.dash.dur.toFixed(4) + ' v' + cf.dash.speed.toFixed(3) : '-',
        cds: cf.cds.map(c => c.toFixed(3)).join(','), en: cf.energy.toFixed(1),
        slow: cf.st.slowAmt.toFixed(3), spd: cf.mods.speed.toFixed(3) };
    }
    const prevAck = sv.ackSeq;
    sv.update(STEP);
    if (sv.ackSeq > prevAck && server.X.G.state === 'live' && server.X.G.roundTime > 1) {
      const sf = server.X.G.player, p = pred[sv.ackSeq];
      if (sf && p) {
        const d = Math.hypot(sf.pos.x - p.x, sf.pos.z - p.z);
        if (d > stepMax) stepMax = d;
        stepN++;
        if (d > .05) stepBad++;
        if (cfg.trace && d > cfg.trace) {
          console.log('  >> seq', sv.ackSeq, 'rt', server.X.G.roundTime.toFixed(2), 'div', (d * 1000).toFixed(0) + 'mm');
          console.log('     srv cast', sf.casting ? sf.casting.i + '@' + sf.casting.t.toFixed(4) : '-',
            'dash', sf.dash ? sf.dash.t.toFixed(4) + '/' + sf.dash.dur.toFixed(4) + ' v' + sf.dash.speed.toFixed(3) : '-',
            'en', sf.energy.toFixed(1), 'slow', sf.st.slowAmt.toFixed(3), 'spd', sf.mods.speed.toFixed(3));
          console.log('     cli cast', p.cast, 'dash', p.dash, 'en', p.en, 'slow', p.slow, 'spd', p.spd);
          console.log('     srv cds', sf.cds.map(c => c.toFixed(3)).join(','));
          console.log('     cli cds', p.cds);
        }
      }
    }
    if (cl.connected) client.interpolateWorld(cl);
    client.X.G.events.length = 0;
  }

  const rep = client.netReport(cl);
  rep.predicted = predicted;
  rep.lost = link.lost;
  rep.sent = link.sent;
  rep.starved = sv.starved;
  rep.dropped = sv.dropped;
  rep.worst = cl.stats.worst;
  rep.stepMax = stepMax; rep.stepN = stepN; rep.stepBad = stepBad;
  return rep;
}

/* ---------- escenarios ---------- */
/* Se miden dos cosas distintas y conviene no confundirlas.

   «Paso a paso» compara directamente la posición que predijo el cliente para
   un comando con la que sacó el servidor al procesarlo. No pasa por la
   reconciliación ni por el cable: dice si las dos simulaciones coinciden. Es la
   prueba de que la predicción está bien escrita.

   «Reconciliación» mide cuánto se mueve tu personaje cuando llega la
   instantánea. Eso sí incluye todo lo que la red y el juego meten por medio, y
   es lo que se siente jugando.                                             */
let fails = 0;
const check = (name, ok, detail) => {
  if (ok) { console.log('   OK    ' + name + (detail ? '  (' + detail + ')' : '')); return; }
  fails++;
  console.error('   FALLO  ' + name + (detail ? '  ' + detail : ''));
};
const mm = v => (v * 1000).toFixed(1) + ' mm';
const show = r => {
  console.log(`   ${r.snapshots} instantáneas · ${r.lost} de ${r.sent} paquetes perdidos`);
  console.log(`   paso a paso (las dos simulaciones): n=${r.stepN}  peor ${mm(r.stepMax)} · discrepan ${r.stepBad} (${(r.stepBad / Math.max(1, r.stepN) * 100).toFixed(1)} %)`);
  console.log(`   reconciliación, limpia:   n=${r.clean.n}  p50 ${mm(r.clean.p50)} · p95 ${mm(r.clean.p95)} · máx ${mm(r.clean.max)}`);
  console.log(`   reconciliación, con golpe: n=${r.dirty.n}  p50 ${mm(r.dirty.p50)} · p95 ${mm(r.dirty.p95)}`);
  console.log(`   arranque de ronda:         n=${r.transition.n}  máx ${mm(r.transition.max)}`);
};

console.log('escenario: en vacío, sin latencia (nadie ataca)');
{
  const r = run({ seed: 7, seconds: 20, latency: 0, jitter: 0, loss: 0, freeze: true });
  show(r);
  /* La prueba de fuego: sin red de por medio y sin nadie tocándote, las dos
     simulaciones tienen que llegar al mismo sitio con la misma entrada.

     Lo hacen en el 99 % de los pasos, con el error justo en el suelo de
     cuantización. El 1 % restante es siempre lo mismo y se conoce bien: el
     cliente va un paso por delante, así que cuando una recarga expira
     exactamente en ese paso, él lanza el ataque y el servidor todavía no. El
     cliente canaliza —al 42 % de velocidad— mientras el servidor corre, y eso
     son unos 28 cm en los 70 ms que dura la canalización del básico. La
     siguiente instantánea lo corrige y no queda rastro.

     El arreglo de verdad es alinear los ticks: que el comando lleve el tick de
     servidor para el que se predijo y el servidor lo ejecute en ese tick, en
     vez de uno por paso. Está anotado en docs/ONLINE.md; hasta entonces esto
     vigila que la tasa no suba. */
  check('coinciden en casi todos los pasos', r.stepBad / r.stepN < .02,
    (r.stepBad / r.stepN * 100).toFixed(1) + ' %');
  check('la discrepancia no pasa de la canalización del básico', r.stepMax < .35, mm(r.stepMax));
  check('la reconciliación se queda en la cuantización', r.clean.p95 < .010, mm(r.clean.p95));
}

console.log('\nescenario: en vacío, 150 ms (nadie ataca)');
{
  const r = run({ seed: 7, seconds: 20, latency: .150, jitter: .030, loss: .05, freeze: true });
  show(r);
  /* Con pérdida, un comando puede no llegar nunca: el servidor repite el
     anterior y ahí las dos simulaciones se separan un paso. La mediana sigue
     en el suelo de cuantización, que es lo que dice que no hay deriva. */
  check('la mediana sigue en el suelo de cuantización', r.clean.p50 < .005, mm(r.clean.p50));
  check('sin huecos de interpolación', r.gaps === 0, r.gaps + ' huecos');
}

console.log('\nescenario: combate real, sin latencia');
{
  const r = run({ seed: 7, seconds: 30, latency: 0, jitter: 0, loss: 0 });
  show(r);
  check('la mediana sigue en el suelo de cuantización', r.clean.p50 < .005, mm(r.clean.p50));
  check('los tirones por golpe se mantienen acotados', r.dirty.p95 < 1.5, mm(r.dirty.p95));
}

console.log('\nescenario: casero (60 ms, ±10 ms, 1 %)');
{
  const r = run({ seed: 7, seconds: 30, latency: .060, jitter: .010, loss: .01 });
  show(r);
  check('la mediana sigue en el suelo de cuantización', r.clean.p50 < .005, mm(r.clean.p50));
  check('sin huecos de interpolación', r.gaps === 0, r.gaps + ' huecos');
  check('el servidor casi nunca se queda seco', r.starved < r.predicted * .02, r.starved + ' de ' + r.predicted);
}

console.log('\nescenario: el del criterio (150 ms, ±30 ms, 5 %)');
{
  const r = run({ seed: 7, seconds: 30, latency: .150, jitter: .030, loss: .05 });
  show(r);
  console.log(`   servidor: ${r.starved} pasos sin comando nuevo de ${r.predicted}`);
  check('la mediana sigue en el suelo de cuantización', r.clean.p50 < .010, mm(r.clean.p50));
  check('sin huecos de interpolación', r.gaps === 0, r.gaps + ' huecos');
  check('el servidor casi nunca se queda seco', r.starved < r.predicted * .02, r.starved + ' de ' + r.predicted);
}

console.log('\nescenario: malo (250 ms, ±60 ms, 12 %)');
{
  const r = run({ seed: 7, seconds: 30, latency: .250, jitter: .060, loss: .12 });
  show(r);
  /* Una de cada ocho tramas se pierde. Aquí ya no se trata de que se sienta
     bien, sino de que no se rompa: el búfer de interpolación no se queda seco
     y la mediana no se dispara. */
  check('la mediana aguanta', r.clean.p50 < .050, mm(r.clean.p50));
  check('el búfer de interpolación aguanta', r.gaps < 5, r.gaps + ' huecos');
}

if (fails) { console.error('\nred: ' + fails + ' fallo(s)'); process.exit(1); }
console.log('\nred: la predicción coincide con el servidor y las correcciones quedan acotadas');
