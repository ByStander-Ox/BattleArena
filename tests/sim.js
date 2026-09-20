/* Simulación sin navegador y SIN DOBLES: carga solo la mitad de simulación.
   Que esto funcione es el criterio de la etapa 2 — si arranca, existe un
   servidor autoritativo posible, porque es exactamente este código.
   Uso: node tests/sim.js     (SIM_SEED, SIM_ROUNDS; comp y SIZE en test_drive) */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const parts = ['src/10_core.js', 'src/20_champs.js', 'src/30_combat.js',
               'src/40_ai.js', 'src/50_match.js', 'tests/test_drive.js'];
const code = parts.map(p => fs.readFileSync(path.join(root, p), 'utf8')).join('\n');
vm.runInThisContext(code, { filename: 'sim' });
