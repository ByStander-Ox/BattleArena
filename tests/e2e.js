/* Recorrido completo con three.js y DOM falsos: menú, partida, rondas,
   reliquias, final. A diferencia de tests/sim.js, este sí carga la mitad de
   vista, así que necesita dobles: es lo que comprueba que las dos mitades
   siguen encajando.

   El jugador lo lleva un bot, pero sin atajos: se le marca como bot y el bucle
   normal hace el resto, de modo que el recorrido pasa por sampleInput,
   applyInput, simStep, la cola de eventos y el HUD igual que en el navegador. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const parts = ['tests/test_dom.js', 'tests/test_stub.js',
               'src/10_core.js', 'src/20_champs.js', 'src/30_combat.js',
               'src/40_ai.js', 'src/50_match.js',
               'src/60_view.js', 'src/70_fx.js', 'src/80_ui.js', 'src/90_loop.js'];
let code = parts.map(p => fs.readFileSync(path.join(root, p), 'utf8')).join('\n');
// el DOM falso manda: quitar los dobles más pobres del stub de three.js
code = code.replace(/globalThis\.document = \{\n {2}createElement: [\s\S]*?\n\};\n/, '')
           .replace(/globalThis\.window = \{ innerWidth: 1280[\s\S]*?\};\n/, '')
           .replace('globalThis.floatNum = () => { };\n', '')
           .replace('globalThis.feed = () => { };\n', '')
           .replace('globalThis.announce = () => { };\n', '');
code += `
SEL.mode = 'squad'; SEL.diff = 'hard'; SEL.champ = 'vesk';
startMatch(4242);   // con semilla: el recorrido es el mismo en cada ejecución
G.player.isBot = true;              // que lo lleve la IA, por el camino de siempre
makeAI(G.player, 'hard');
const choose = () => {
  const c = document.getElementById('brite-cards');
  if (G.state === 'brite' && c.children.length) { const b = c.children[0]; ((b._ev && b._ev.click) || b.onclick).call(b); }
};
choose();
let n = 0;
while (G.state !== 'result' && n < 60*60*14) { frame(); n++; choose(); }
console.log('semilla:', G.seed, '· estado final:', G.state, '· marcador', G.score.join('-'), '· rondas', G.round, '·', Math.round(n/60) + ' s simulados');
console.log('daño del jugador:', Math.round(G.player.stats.dmg), '· bajas:', G.player.stats.kills);
console.log('mallas vivas:', VIEW.fighter.size, 'luchadores ·', VIEW.proj.size, 'proyectiles ·', VIEW.zone.size, 'zonas');
console.log('eventos sin consumir:', G.events.length, '· partículas:', FX.length);

// salir al menú: quitMatch debe dejar la escena vacía
showScreen('scr-title');
frame();
if (VIEW.fighter.size) throw new Error('quedan mallas de luchador tras salir al menú: ' + VIEW.fighter.size);
if (G.fighters.length) throw new Error('quedan luchadores tras salir al menú');

// pausa: parar, reanudar y abandonar a media partida
startMatch(99);
G.player.isBot = true; makeAI(G.player, 'hard');
choose();
for (let i = 0; i < 200; i++) frame();
const tBefore = G.roundTime;
togglePause(); frame();
for (let i = 0; i < 60; i++) frame();
if (G.roundTime !== tBefore) throw new Error('la pausa no detiene el reloj de ronda');
togglePause(); frame();
for (let i = 0; i < 60; i++) frame();
if (G.roundTime <= tBefore) throw new Error('al reanudar, el reloj no avanza');
console.log('pausa: detiene y reanuda el reloj de ronda');

quitMatch(); frame();
if (VIEW.fighter.size || VIEW.proj.size || VIEW.zone.size || VIEW.pickup.size)
  throw new Error('quedan mallas tras abandonar la partida');
console.log('escena limpia tras abandonar · partículas:', FX.length);
console.log('recorrido completo sin errores');
`;
vm.runInThisContext(code, { filename: 'e2e' });
