/* El comando de entrada es la frontera del modo online: una intención del
   jugador convertida en dato plano. e2e.js lo atraviesa de pasada; esta prueba
   mira los detalles que allí no se notarían.

   Comprueba tres cosas: que cuantizar una dirección y recuperarla no pierde
   más de un paso, que cada bit de `buttons` lanza la habilidad que le toca, y
   que el punto de apuntado sobrevive al viaje. Todo esto es lo que la
   reconciliación del modo online dará por hecho.                            */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const parts = ['src/10_core.js', 'src/20_champs.js', 'src/30_combat.js',
               'src/40_ai.js', 'src/50_match.js'];
const code = parts.map(p => fs.readFileSync(path.join(root, p), 'utf8')).join('\n');
vm.runInThisContext(code, { filename: 'input_cmd' });

seedSim(7);

let fails = 0;
function check(name, ok, detail) {
  if (ok) return;
  fails++;
  console.error('  FALLO: ' + name + (detail ? '  ' + detail : ''));
}

/* ---- 1. cuantización de direcciones ---- */
{
  const out = { x: 0, z: 0 };
  let worst = 0;
  for (let i = 0; i < 720; i++) {
    const a = i / 720 * TAU - Math.PI;
    const x = Math.sin(a), z = Math.cos(a);
    byteToDir(dirToByte(x, z), out);
    const err = Math.abs(angDiff(Math.atan2(out.x, out.z), a)) * 180 / Math.PI;
    if (err > worst) worst = err;
  }
  // 256 pasos = 1,40625° por paso, así que el peor error posible es la mitad
  check('ida y vuelta de dirección', worst <= 0.71, `peor error ${worst.toFixed(3)}°`);
  console.log('   cuantización: peor error', worst.toFixed(3) + '°', 'sobre 1,406° de paso');
}

/* ---- 2. los botones lanzan la habilidad correcta ---- */
{
  const names = ['M1', 'M2', 'SP', 'Q', 'E', 'F', 'R'];
  const bits = [BTN.M1, BTN.M2, BTN.SP, BTN.Q, BTN.E, BTN.F, BTN.R];
  G.state = 'live';
  for (let i = 0; i < 7; i++) {
    G.fighters.length = 0; G.byId.clear(); clearTransient(); G.events.length = 0;
    const f = makeFighter('vesk', 0, false, 'prueba');
    G.fighters.push(f);
    resetFighter(f, 0, 0, 0);
    f.energy = 100;                       // para que la definitiva sea lanzable
    applyInput(f, { seq: 1, move: CMD_STILL, aim: dirToByte(0, 1), aimD: 100, buttons: bits[i], ex: 0 });
    const fired = f.cds[i] > 0 || (f.casting && f.casting.i === i);
    check('el botón ' + names[i] + ' lanza la habilidad ' + i, fired);
    const others = f.cds.some((cd, k) => k !== i && cd > 0);
    check('el botón ' + names[i] + ' no lanza ninguna otra', !others);
  }
  console.log('   botones: los siete bits lanzan su habilidad y solo la suya');
}

/* ---- 3. movimiento y punto de apuntado ---- */
{
  G.fighters.length = 0; G.byId.clear(); clearTransient(); G.events.length = 0;
  const f = makeFighter('vesk', 0, false, 'prueba');
  G.fighters.push(f);
  resetFighter(f, 3, -4, 0);        // (x, z, orientación)

  applyInput(f, { seq: 2, move: CMD_STILL, aim: dirToByte(1, 0), aimD: 0, buttons: 0, ex: 0 });
  check('CMD_STILL deja el movimiento a cero', f.moveDir.x === 0 && f.moveDir.z === 0);

  applyInput(f, { seq: 3, move: dirToByte(1, 0), aim: dirToByte(1, 0), aimD: 0, buttons: 0, ex: 0 });
  check('una dirección de movimiento llega normalizada',
    Math.abs(Math.hypot(f.moveDir.x, f.moveDir.z) - 1) < 1e-9);

  // apuntar a 12,5 m hacia +x desde (3, -4) debe dejar aimPt en (15,5, -4)
  applyInput(f, { seq: 4, move: CMD_STILL, aim: dirToByte(1, 0), aimD: 125, buttons: 0, ex: 0 });
  const err = Math.hypot(f.aimPt.x - 15.5, f.aimPt.z - (-4));
  check('el punto de apuntado sobrevive al viaje', err < 0.05, `error ${err.toFixed(4)} m`);
  console.log('   apuntado: punto reconstruido con', err.toFixed(4) + ' m de error');
}

/* ---- 4. fuera de `live` no se mueve nadie ---- */
{
  G.state = 'intro';
  const f = G.fighters[0];
  applyInput(f, { seq: 5, move: dirToByte(1, 0), aim: dirToByte(1, 0), aimD: 50, buttons: BTN.M1, ex: 0 });
  check('en la cuenta atrás no se avanza', f.moveDir.x === 0 && f.moveDir.z === 0);
  check('en la cuenta atrás no se dispara', f.cds[0] === 0);
  G.state = 'live';
  console.log('   estado: la cuenta atrás congela movimiento y lanzamientos');
}

if (fails) { console.error('\ncomando de entrada: ' + fails + ' fallo(s)'); process.exit(1); }
console.log('\ncomando de entrada: correcto');
