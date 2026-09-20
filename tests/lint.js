/* Dos reglas que rompen el juego en silencio y que ningún test de ejecución
   coge del todo, porque solo cubren el código que llega a ejecutarse.

   1. Math.random() en el camino de simulación es una desincronización futura:
      dos máquinas sacarían números distintos y la partida se separaría sin que
      nada dé error. Solo se permite en las tres líneas que definen los
      generadores cosméticos (marcadas con `rng-cosmético`).

   2. La mitad de simulación (10-50) no puede tocar la mitad de vista. Si lo
      hace, deja de poder correr en un servidor. `tests/sim.js` lo detecta en
      cuanto la línea se ejecuta; esto lo detecta aunque no se ejecute nunca. */
const fs = require('fs'), path = require('path');
const srcDir = path.join(__dirname, '..', 'src');

/* Marca qué caracteres están dentro de un comentario. Hace falta un escáner de
   verdad y no un filtro por prefijo: los comentarios de este proyecto usan
   sangría colgante, sin `*` al principio de cada línea. */
function commentMask(src) {
  const mask = new Uint8Array(src.length);
  let i = 0;
  while (i < src.length) {
    if (src[i] === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      mask.fill(1, i, stop); i = stop;
    } else if (src[i] === '/' && src[i + 1] === '/') {
      let end = src.indexOf('\n', i);
      if (end < 0) end = src.length;
      mask.fill(1, i, end); i = end;
    } else i++;
  }
  return mask;
}

/* Recorre un archivo buscando `needle` fuera de comentarios. */
function findOutsideComments(name, src, needle, allow) {
  const mask = commentMask(src);
  const lines = src.split('\n');
  const hits = [];
  let at = 0;
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k], start = at;
    at += line.length + 1;
    let col = line.indexOf(needle);
    while (col >= 0) {
      if (!mask[start + col] && !(allow && allow(line))) {
        hits.push(`${name}:${k + 1}  ${line.trim()}`);
        break;
      }
      col = line.indexOf(needle, col + 1);
    }
  }
  return hits;
}

const files = {};
for (const name of fs.readdirSync(srcDir).sort()) {
  if (!/\.(js|html)$/.test(name)) continue;
  files[name] = fs.readFileSync(path.join(srcDir, name), 'utf8');
}

let bad = 0;

/* ---- 1. azar sin semilla en la simulación ---- */
{
  const hits = [];
  for (const name in files) {
    hits.push(...findOutsideComments(name, files[name], 'Math.random',
      line => line.includes('rng-cosmético')));
  }
  if (hits.length) {
    bad += hits.length;
    console.error('Math.random() fuera de los generadores cosméticos:\n');
    for (const h of hits) console.error('   ' + h);
    console.error('\nUsa srand/rnd/irnd/pickOne/chance si afecta al juego, o frand/frnd/firnd si es solo visual.\n');
  } else {
    console.log('lint: sin Math.random en el camino de simulación');
  }
}

/* ---- 2. la simulación no toca la vista ---- */
{
  const SIM = ['10_core.js', '20_champs.js', '30_combat.js', '40_ai.js', '50_match.js',
               '55_net.js', '56_server.js', '57_client.js'];
  const FORBIDDEN = ['THREE.', 'document.', 'window.', 'scene.', 'renderer.', 'camera.',
                     'requestAnimationFrame', 'SFX.', 'localStorage'];
  const hits = [];
  for (const name of SIM) {
    if (!files[name]) { console.error('falta ' + name); bad++; continue; }
    for (const needle of FORBIDDEN) hits.push(...findOutsideComments(name, files[name], needle));
  }
  if (hits.length) {
    bad += hits.length;
    console.error('La mitad de simulación toca la vista:\n');
    for (const h of hits) console.error('   ' + h);
    console.error('\nEso la ata al navegador. Saca el efecto por la cola de eventos (emit / sfx / fxNum / fxRing…).\n');
  } else {
    console.log('lint: la simulación (10-50) no depende de three.js, el DOM ni el audio');
  }
}

if (bad) process.exit(1);
