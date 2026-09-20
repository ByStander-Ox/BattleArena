/* Recorrido completo con DOM falso: menú, partida, rondas, reliquias, final.  */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const parts = ['tests/test_dom.js', 'tests/test_stub.js', 'src/10_core.js', 'src/20_champs.js',
               'src/30_combat.js', 'src/40_ai.js', 'src/50_match_ui.js', 'src/60_loop.js'];
let code = parts.map(p => fs.readFileSync(path.join(root, p), 'utf8')).join('\n');
// el DOM falso manda: quitar los dobles más pobres del stub de three.js
code = code.replace(/globalThis\.document = \{\n {2}createElement: [\s\S]*?\n\};\n/, '')
           .replace(/globalThis\.window = \{ innerWidth: 1280[\s\S]*?\};\n/, '')
           .replace('globalThis.floatNum = () => { };\n', '')
           .replace('globalThis.feed = () => { };\n', '')
           .replace('globalThis.announce = () => { };\n', '');
code += `
SEL.mode = 'squad'; SEL.diff = 'hard'; SEL.champ = 'vesk';
startMatch();
const choose = () => {
  const c = document.getElementById('brite-cards');
  if (G.state === 'brite' && c.children.length) { const b = c.children[0]; ((b._ev && b._ev.click) || b.onclick).call(b); }
};
choose();
makeAI(G.player, 'hard');
playerControl = () => { if (G.player.alive && G.state === 'live') updateAI(G.player, G.dt || 1/60); };
let n = 0;
while (G.state !== 'result' && n < 60*60*14) { frame(); n++; choose(); }
console.log('estado final:', G.state, '· marcador', G.score.join('-'), '· rondas', G.round, '·', Math.round(n/60) + ' s simulados');
console.log('daño del jugador:', Math.round(G.player.stats.dmg), '· bajas:', G.player.stats.kills);
console.log('recorrido completo sin errores');
`;
vm.runInThisContext(code, { filename: 'e2e' });
