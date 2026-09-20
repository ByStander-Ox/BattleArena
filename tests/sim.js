/* Simulación sin navegador: dos equipos de bots.
   Uso: node tests/sim.js     (edita `comp` y `SIZE` en test_drive.js)         */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const parts = ['tests/test_stub.js', 'src/10_core.js', 'src/20_champs.js',
               'src/30_combat.js', 'src/40_ai.js', 'tests/test_drive.js'];
const code = parts.map(p => fs.readFileSync(path.join(root, p), 'utf8')).join('\n');
vm.runInThisContext(code, { filename: 'sim' });
