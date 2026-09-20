/* El criterio de la etapa 1: misma semilla, misma partida.

   Ejecuta la simulación tres veces en contextos limpios — dos con la misma
   semilla y una con otra — y compara la huella del estado final. Que las dos
   primeras coincidan demuestra que nada consume azar sin semilla; que la
   tercera difiera demuestra que la huella mide algo de verdad y no una
   simulación congelada.

   Si esto falla, lo habitual es un Math.random() nuevo en el camino de
   simulación (lo caza antes tests/lint_rng.js), una referencia a un objeto que
   cambia de identidad entre ejecuciones, o un orden de iteración que depende
   de algo externo.                                                          */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const parts = ['tests/test_stub.js', 'src/10_core.js', 'src/20_champs.js',
               'src/30_combat.js', 'src/40_ai.js', 'tests/test_drive.js'];
const code = parts.map(p => fs.readFileSync(path.join(root, p), 'utf8')).join('\n');

function run(seed) {
  const out = [];
  const ctx = vm.createContext({
    console: { log: (...a) => out.push(a.join(' ')), error: () => { } },
    SIM_SEED: seed, SIM_ROUNDS: 8, SIM_QUIET: true
  });
  vm.runInContext(code, ctx, { filename: 'determinism' });
  const line = out.find(l => l.startsWith('huella:'));
  if (!line) throw new Error('el banco de pruebas no imprimió huella');
  return line.slice('huella:'.length).trim();
}

const a = run(1234);
const b = run(1234);
const c = run(5678);

console.log('semilla 1234 →', a);
console.log('semilla 1234 →', b, a === b ? '(coincide)' : '(¡DIFIERE!)');
console.log('semilla 5678 →', c, c !== a ? '(distinta, como debe)' : '(¡IGUAL: la huella no mide nada!)');

if (a !== b) {
  console.error('\nFALLO: la misma semilla produjo dos partidas distintas.');
  console.error('Algo dentro de la simulación consume azar sin semilla, o el orden de actualización no es estable.');
  process.exit(1);
}
if (a === c) {
  console.error('\nFALLO: dos semillas distintas dieron la misma huella.');
  console.error('O la simulación no usa la semilla, o la huella no resume el estado.');
  process.exit(1);
}
console.log('\ndeterminismo: la simulación es reproducible');
