/* Math.random() en el camino de simulación es una desincronización futura:
   dos máquinas sacarían números distintos y la partida se separaría sin que
   nada dé error. Este comprobador lo prohíbe en src/, salvo en las tres líneas
   que definen los generadores cosméticos (marcadas con `rng-cosmético`).

   Si necesitas azar: srand/rnd/irnd/pickOne/chance dentro de la simulación,
   frand/frnd/firnd para partículas y demás adornos.                        */
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

const bad = [];
for (const name of fs.readdirSync(srcDir).sort()) {
  if (!/\.(js|html)$/.test(name)) continue;
  const src = fs.readFileSync(path.join(srcDir, name), 'utf8');
  const mask = commentMask(src);
  const lines = src.split('\n');
  const lineStart = [];
  let at = 0;
  for (const l of lines) { lineStart.push(at); at += l.length + 1; }

  for (let k = 0; k < lines.length; k++) {
    const col = lines[k].indexOf('Math.random');
    if (col < 0) continue;
    if (mask[lineStart[k] + col]) continue;              // está comentado
    if (lines[k].includes('rng-cosmético')) continue;    // definición de frand/frnd/firnd
    bad.push(`${name}:${k + 1}  ${lines[k].trim()}`);
  }
}

if (bad.length) {
  console.error('Math.random() fuera de los generadores cosméticos:\n');
  for (const b of bad) console.error('   ' + b);
  console.error('\nUsa srand/rnd/irnd/pickOne/chance si afecta al juego, o frand/frnd/firnd si es solo visual.');
  process.exit(1);
}
console.log('lint_rng: sin Math.random en el camino de simulación');
