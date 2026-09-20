/* El protocolo de cable, de ida y vuelta.

   Comprueba que una instantánea sobrevive al viaje con el error que promete la
   cuantización y no más, que los eventos vuelven intactos, y de paso mide
   cuántos bytes ocupa de verdad un 3v3 en plena pelea — que es el número que
   decide si hace falta comprimir algo o no.                                 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const parts = ['src/10_core.js', 'src/20_champs.js', 'src/30_combat.js',
               'src/40_ai.js', 'src/50_match.js', 'src/55_net.js'];
vm.runInThisContext(parts.map(p => fs.readFileSync(path.join(root, p), 'utf8')).join('\n'),
  { filename: 'net' });

let fails = 0;
const check = (name, ok, detail) => {
  if (ok) return;
  fails++;
  console.error('  FALLO: ' + name + (detail ? '  ' + detail : ''));
};

/* ---- 1. comandos de entrada ---- */
{
  seedSim(11);
  const cmds = [];
  for (let i = 0; i < 3; i++) {
    cmds.push({ seq: 40000 + i, move: irnd(256), aim: irnd(256), aimD: irnd(256), buttons: irnd(128), ex: irnd(2) });
  }
  const buf = encodeInput(cmds);
  const r = new Reader(buf); r.u8();
  const back = decodeInput(r);
  check('mismo número de comandos', back.length === cmds.length);
  for (let i = 0; i < cmds.length; i++) {
    for (const k of ['seq', 'move', 'aim', 'aimD', 'buttons', 'ex']) {
      check(`comando ${i}.${k}`, back[i][k] === cmds[i][k], `${back[i][k]} ≠ ${cmds[i][k]}`);
    }
  }
  console.log('   comandos:', buf.byteLength, 'bytes para', cmds.length, 'comandos');
}

/* ---- 2. una partida de verdad, en su momento más cargado ---- */
{
  seedSim(4242);
  SEL.mode = 'squad'; SEL.diff = 'hard'; SEL.champ = 'vesk';
  startMatch(4242);
  // saltarse la pantalla de reliquias y pelear hasta que haya cosas en vuelo
  if (G.state === 'brite') pickRelic(0);
  for (const f of G.fighters) { f.isBot = true; if (!f.ai) makeAI(f, 'hard'); }
  let biggest = null, biggestSize = 0, sampled = 0, totalSize = 0;
  for (let i = 0; i < 60 * 40; i++) {
    simStep(STEP, null);
    if (G.state === 'brite') pickRelic(0);
    if (i % 3 === 0) {                        // 20 Hz, como en el plan
      const buf = encodeSnapshot(i, 1234);
      sampled++; totalSize += buf.byteLength;
      if (buf.byteLength > biggestSize) { biggestSize = buf.byteLength; biggest = buf; }
      G.events.length = 0;
    }
  }
  console.log('   instantáneas: media', Math.round(totalSize / sampled), 'B · mayor', biggestSize, 'B',
    '· a 20 Hz son', (totalSize / sampled * 20 / 1024).toFixed(1), 'KB/s por cliente');

  /* la instantánea mayor tiene que volver entera */
  const r = new Reader(biggest); r.u8();
  const s = decodeSnapshot(r);
  check('no sobran bytes al decodificar', r.left() === 0, r.left() + ' bytes de más');
  check('se decodifica el estado', STATE_LIST.indexOf(s.state) >= 0, s.state);
}

/* ---- 3. error de cuantización dentro de lo prometido ---- */
{
  const buf = encodeSnapshot(7, 99);
  const r = new Reader(buf); r.u8();
  const s = decodeSnapshot(r);
  check('mismo número de luchadores', s.fighters.length === G.fighters.length);
  let worstPos = 0, worstAng = 0;
  for (const g of G.fighters) {
    const f = s.fighters.find(x => x.uid === g.uid);
    if (!f) { check('falta el luchador ' + g.uid, false); continue; }
    worstPos = Math.max(worstPos, Math.abs(f.x - g.pos.x), Math.abs(f.z - g.pos.z));
    worstAng = Math.max(worstAng, Math.abs(angDiff(f.face, g.face)));
    check('vida exacta de ' + g.uid, f.hp === Math.round(g.hp), `${f.hp} ≠ ${Math.round(g.hp)}`);
    check('vivo/muerto de ' + g.uid, !!(f.flags & SF.alive) === g.alive);
  }
  // i16 en 1/256 de metro: medio paso de error como mucho
  check('error de posición bajo 2 mm', worstPos <= 0.002, (worstPos * 1000).toFixed(2) + ' mm');
  // un byte de ángulo: 1,40625° de paso, medio paso de error
  check('error de ángulo bajo 0,71°', worstAng * 180 / Math.PI <= 0.71,
    (worstAng * 180 / Math.PI).toFixed(3) + '°');
  console.log('   cuantización: posición', (worstPos * 1000).toFixed(2) + ' mm · ángulo',
    (worstAng * 180 / Math.PI).toFixed(3) + '°');
}

/* ---- 4. los eventos vuelven intactos ---- */
{
  G.events.length = 0;
  sfx('pierce');
  fxRing({ x: 3.25, z: -7.5 }, 4.6, 0xffa35c);
  fxShake(1.1);
  emit({ e: 'dmg', id: 3, byId: 5, dmg: 21, x: -2.5, z: 8.25 });
  emit({ e: 'cc', id: 2, type: 'silence', x: 1, z: 1 });
  emit({ e: 'kill', id: 4, byId: 1, first: true });
  emit({ e: 'roundEnd', winner: -1, score: [2, 1] });
  emit({ e: 'orb', id: 700, kind: 'health', byId: 6, x: 0, z: 9.6 });
  const sent = G.events.slice();
  const buf = encodeSnapshot(1, 1);
  const r = new Reader(buf); r.u8();
  const got = decodeSnapshot(r).events;

  check('llegan todos los eventos', got.length === sent.length, `${got.length} de ${sent.length}`);
  const by = e => got.find(g => g.e === e);
  check('sfx conserva el nombre', by('sfx') && by('sfx').id === 'pierce');
  check('ring conserva radio y color', by('ring') && Math.abs(by('ring').radius - 4.6) < .04 && by('ring').col === 0xffa35c);
  check('shake conserva la fuerza', by('shake') && Math.abs(by('shake').a - 1.1) < .02);
  check('dmg conserva ids y daño', by('dmg') && by('dmg').id === 3 && by('dmg').byId === 5 && by('dmg').dmg === 21);
  check('cc conserva el tipo', by('cc') && by('cc').type === 'silence');
  check('kill conserva primera sangre', by('kill') && by('kill').first === true);
  check('roundEnd conserva el empate', by('roundEnd') && by('roundEnd').winner === -1);
  check('roundEnd conserva el marcador', by('roundEnd') && by('roundEnd').score.join('-') === '2-1');
  check('orb conserva la clase', by('orb') && by('orb').kind === 'health' && by('orb').id === 700);
  console.log('   eventos:', got.length, 'tipos distintos de ida y vuelta');
}

/* ---- 5. saludo ---- */
{
  const r = new Reader(encodeHello({ mode: 'squad', diff: 'elite', champ: 'lumen' })); r.u8();
  const h = decodeHello(r);
  check('saludo conserva las opciones', h.mode === 'squad' && h.diff === 'elite' && h.champ === 'lumen');
  const r2 = new Reader(encodeWelcome(0xDEADBEEF, 3)); r2.u8();
  const wc = decodeWelcome(r2);
  check('bienvenida conserva la semilla', wc.seed === 0xDEADBEEF, String(wc.seed));
  check('bienvenida conserva el id', wc.playerUid === 3);
}

if (fails) { console.error('\nprotocolo: ' + fails + ' fallo(s)'); process.exit(1); }
console.log('\nprotocolo: ida y vuelta correcta');
