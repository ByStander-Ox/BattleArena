# Convenciones y buenas prácticas

Reglas de trabajo para este proyecto. No son preferencias de estilo abstractas:
casi todas salen de algo que se rompió una vez.

---

## 1. Reglas que no se negocian

Estas cinco rompen el juego de formas que no dan error en consola:

1. **No edites `crisol-arena.html`.** Es salida de `build.sh`. Cualquier cambio
   ahí desaparece en la siguiente compilación. Se edita `src/`, se ejecuta
   `./build.sh`.
2. **Un solo ámbito global.** Los seis archivos se concatenan en un `<script>`.
   Dos `const` con el mismo nombre en archivos distintos es un `SyntaxError` que
   deja la página en blanco sin más pistas. Antes de crear un nombre de nivel
   superior: `grep -rn "nombre" src/`.
3. **`'use strict'` va en la primera línea de `10_core.js` y en ningún otro
   sitio.** La directiva solo cuenta si es la primera sentencia del script, y
   `00_head.html` no aporta ninguna. Si algún día añades un `05_algo.js`, mueve
   la directiva a su primera línea o el modo estricto se apaga en silencio.
4. **El orden de `ab[]` es contrato.** `M1, M2, SP, Q, E, F, R`, siempre siete.
   `playerControl`, `buildAbilityBar` y `BOT_PLANS` indexan por posición.
   Reordenar es reasignar teclas sin querer.
5. **Conserva la rotación de `fightersInOrder()`.** Procesar siempre en el mismo
   orden da ventaja sistemática al primero. Se midió: espejo de Brakk, 58-2.

---

## 2. Estilo

Sigue lo que ya hay; el código es homogéneo y merece seguir siéndolo.

**Idioma.** Identificadores en inglés (`makeFighter`, `dealDamage`,
`spawnZone`). Comentarios, documentación y todo lo que ve el jugador, en
español. Los datos de juego usan su nombre de ficción (`CHAMPS.vesk.title = 'la
Cazadora'`).

**Formato.** Dos espacios, punto y coma, comillas simples. Cabecera de sección
con el patrón que ya existe:

```js
/* ============================ nombre de la sección ============================ */
```

**Nombres.** `MAYÚSCULAS` para tablas de datos inmutables (`CHAMPS`, `RELICS`,
`MODES`, `DIFFS`, `DR_SCALE`, `ROLE_RANGE`). `camelCase` para funciones y
variables. `_guionBajo` para lo privado del módulo (`_uid`, `_last`, `_ray`).
Abreviaturas cortas dentro de los datos de juego (`cd`, `dmg`, `kb`, `cc`,
`wind`, `ex`) — son tan frecuentes que escribirlas enteras haría los kits
ilegibles.

**Comentarios.** Escasos y explicando *por qué*, nunca *qué*. El modelo es este,
de `10_core.js`:

```js
/* El orden de actualización importa en el cuerpo a cuerpo: quien se procesa
   primero se adelanta siempre. Se rota cada fotograma para que nadie tenga
   una ventaja sistemática. */
```

Si un comentario se puede borrar sin perder información, bórralo.

**Sin clases, sin herencia.** Las entidades son objetos planos creados por
funciones fábrica (`makeFighter`) y actualizados por funciones libres
(`tickFighter`). Mantenlo: las clases complicarían la serialización que el modo
online va a necesitar.

---

## 3. Rendimiento

Es un juego de acción: 60 fps es el requisito, no el objetivo.

**No asignes en el bucle.** `tmpV` y `tmpV2` existen para eso. Todo lo que se
llama por fotograma y por entidad debe reutilizar. El pool de `numPool` es el
mismo principio aplicado al DOM.

**`dist2` antes que `dist`.** Si solo comparas contra un umbral, compara
cuadrados y ahórrate la raíz. Todo el código de colisiones ya lo hace.

**Salida temprana.** Los filtros baratos van primero: equipo, `alive`,
distancia burda, y solo después la geometría fina. `updateAI` descarta
proyectiles por distancia antes de calcular el producto cruzado.

**En el DOM, solo `transform` y `opacity`.** Son las dos propiedades que el
compositor anima sin reflow. Las barras usan `scaleX()`, las placas
`translate()`. Nunca escribas `style.width`, `style.left` ni `style.top` por
fotograma.

**Cachea las consultas al DOM.** `makePlate` guarda los hijos en `d.q` al
crearlos. `querySelector` por fotograma y por entidad no es aceptable.

**Nada de `console.log` en el bucle.** Un log por fotograma cuesta más que la
simulación entera.

---

## 4. Límites de three.js r128

La versión está fijada en `00_head.html`. La API de r128 no es la actual, y la
diferencia muerde:

- **No existe `CapsuleGeometry`.** Los personajes se montan con cilindros,
  esferas y conos (`limb()` en `20_champs.js`).
- **`ExtrudeGeometry` crece hacia +Y** después de rotar la forma. Hay que bajar
  la malla por su `boundingBox.max.y` o los personajes quedan hundidos en la
  plataforma.
- **`outputEncoding` / `sRGBEncoding`**, no `outputColorSpace`. El código ya
  comprueba `if (THREE.sRGBEncoding)` antes de asignar.
- **Libera lo que creas.** `geometry.dispose()` y `material.dispose()` al
  destruir proyectiles, zonas y efectos. `scene.remove()` solo desengancha; no
  suelta memoria de GPU.

Si algún día subes de versión: es un cambio de un archivo y una tarde de
arreglos, pero hazlo en un paso aparte y pasa `node tests/e2e.js` antes y
después.

---

## 5. Flujo de trabajo

```bash
./build.sh              # src/ → crisol-arena.html
node tests/sim.js       # equilibrio y salud de la simulación (~300 ms)
node tests/e2e.js       # recorrido completo del juego
```

El ciclo normal es: editar `src/` → `./build.sh` → recargar el navegador. Los
tests no necesitan compilar; leen `src/` directamente.

**Antes de dar algo por terminado, los dos tests pasan.** `sim.js` lanza
excepción con posiciones `NaN` o luchadores fuera de la arena, y `e2e.js`
recorre menú, rondas, reliquias y resultado. Entre los dos cogen la mayoría de
las regresiones estructurales.

**Cambios de equilibrio: mide, no opines.** Edita `comp` y `SIZE` en
`tests/test_drive.js` para enfrentar dos campeones concretos, sube las rondas a
40-60 y compara el marcador antes y después. Doce rondas son ruido; cuarenta ya
son señal. Ten presente que mide bots: un humano apunta mucho mejor que el bot
de Vesk, así que un tirador siempre rinde más en manos humanas que en la tabla.

**Sin git todavía.** El proyecto no está versionado. Antes del refactor que pide
el modo online conviene `git init` y un primer commit con el estado actual: ese
refactor toca los seis archivos a la vez y querrás poder volver.

---

## 6. Cómo añadir cosas

### Un campeón

1. Copia una entrada completa de `CHAMPS` en `20_champs.js`.
2. Ajusta `hp`, `speed`, `role` (`Tirador`, `Vanguardia` o `Custodio` — el rol
   fija la distancia de combate del bot en `ROLE_RANGE`), `glyph`, `color`,
   `blurb` y `stats` (las tres barras del menú, de 1 a 5).
3. Escribe `build(g)` con las primitivas de r128.
4. Escribe las siete habilidades **en orden** con las primitivas de
   `30_combat.js`. Cada una necesita `k`, `n`, `g` (emoji), `cd`, `wind` y `d`
   (descripción para el HUD). Si tiene versión mejorada, `exCost: 50` y `dx`
   con su descripción.
5. Añade el id a `CHAMP_LIST`.
6. Añade un plan en `BOT_PLANS` de `40_ai.js`, o los bots solo usarán el básico.
7. `node tests/sim.js` y comprueba que no aparece en la lista `sin usar:`.

### Una habilidad

Las primitivas ya cubren casi todo; combínalas antes de escribir un caso
especial. `o.ex` dice si se lanzó la versión mejorada, y el patrón habitual es
un ternario sobre `o.ex` en los números, no una rama entera.

Parámetros útiles: `wind` (canalización en segundos, el objetivo lo ve en la
barra de lanzamiento), `ground: n` (se apunta a un punto del suelo a `n` metros
como máximo, y llega en `o.pt`), `self: true` (sin objetivo), `dashAb: true`
(usa la dirección de movimiento), `ult: true` + `cost: 100`, `hold: true` (se
puede mantener pulsado), `combo: n` (el básico encadena `n` golpes).

Si necesitas una primitiva nueva, ponla en `30_combat.js` junto a las demás y
que siga la misma firma: `nombre(f, o)`, donde `f` es quien lanza y `o` son las
opciones.

### Una reliquia

Una entrada en `RELICS`: `id`, `n`, `r` (`com` / `rare` / `epic`), `rune`
(emoji), `d` (texto para el jugador) y `ap: f => {}`. Si el efecto necesita un
campo nuevo, decláralo en `mods` dentro de `makeFighter` con su valor neutro —
un `undefined` en medio de una multiplicación produce `NaN` y `sim.js` lo
detecta, pero mejor no llegar ahí.

Regla de diseño: las reliquias **no** conceden habilidades ni cambian reglas;
solo mueven números. Las que cambian reglas (`echo`, `mark`, `autoShield`)
necesitan su gancho explícito en `dealDamage` o `tickFighter`, y cada gancho
nuevo es coste permanente en el sitio más caliente del código.

---

## 7. Deuda técnica conocida

No hace falta arreglarla para seguir añadiendo contenido local, pero el modo
online sí la va a exigir. En orden de coste:

| Qué | Dónde | Por qué molesta |
|---|---|---|
| Paso variable | `frame()` | sin paso fijo no hay simulación reproducible |
| `Math.random()` suelto | `40_ai.js`, `30_combat.js` | sin semilla no hay repetición ni depuración de una partida |
| Simulación acoplada al render | `makeFighter`, `shoot`, `spawnZone` | crean mallas; el servidor no tiene escena |
| `act()` llama a `SFX` | `20_champs.js` | los datos de habilidad dependen del audio |
| `pos` es `THREE.Vector3` | luchadores | un tipo de la capa de render dentro del estado |
| Referencias cruzadas | `proj.owner`, `zone.owner` | impiden serializar `G` con `JSON.stringify` |
| `G` es un singleton | `10_core.js` | un servidor necesita N partidas por proceso |

El plan para saldarla está en [ONLINE.md](ONLINE.md) §4, ordenado para que cada
etapa se pueda entregar y probar por separado.
