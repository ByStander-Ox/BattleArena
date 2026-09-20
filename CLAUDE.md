# CLAUDE.md

Contexto para agentes que trabajen en este repositorio.

## Qué es

*Crisol · Arena*: brawler de arena por rondas al estilo *Battlerite*, en
three.js, que corre entero en el navegador. Sin dependencias más allá de
three.js r128 por CDN. Hoy es solo local contra bots; hay un modo online
planificado (`docs/ONLINE.md`), todavía sin implementar.

Todo el código, los comentarios y la interfaz están **en español**. Los
identificadores, en inglés.

## Comandos

```bash
./build.sh                  # src/ → crisol-arena.html  (obligatorio tras editar src/)
node tests/sim.js           # 12 rondas de bots 3v3, sin dobles, ~250 ms
node tests/e2e.js           # recorrido completo: menú → rondas → reliquias → resultado
node tests/determinism.js   # misma semilla ⇒ misma partida
node tests/input_cmd.js     # el comando de entrada, de punta a punta
node tests/net.js           # el protocolo de cable, de ida y vuelta
node tests/netloop.js       # cliente y servidor con latencia y pérdida simuladas
node tests/lint.js          # azar con semilla y frontera simulación/vista
```

`sim.js` acepta `SIM_SEED` y `SIM_ROUNDS`: con la misma semilla dos ejecuciones
enfrentan exactamente las mismas partidas, que es como se mide un cambio de
equilibrio.

No hay `package.json`, ni instalación, ni linter. Node 22 basta.

## Reglas que rompen el juego en silencio

1. **`crisol-arena.html` es generado.** Se edita `src/`, se ejecuta `./build.sh`.
2. **Un solo ámbito global**: los diez archivos de `src/` se concatenan en un
   `<script>`. Un nombre de nivel superior duplicado es un `SyntaxError` que deja
   la página en blanco. `grep -rn "nombre" src/` antes de declarar.
3. **`'use strict'` va en la primera línea de `10_core.js`**, que es la primera
   sentencia del script concatenado. No añadas archivos antes sin moverla.
4. **`ab[]` tiene siete entradas en orden fijo** (`M1 M2 SP Q E F R`); el HUD,
   las teclas y los bots indexan por posición.
5. **No toques la rotación de `fightersInOrder()`**: sin ella, quien se procesa
   primero gana siempre el cuerpo a cuerpo (se midió: 58-2).
6. **Nada de `Math.random()` en la simulación.** Usa `rnd`/`irnd`/`pickOne`/
   `chance` (con semilla) si afecta al juego, y `frand`/`frnd`/`firnd` si es
   solo visual. Rompe el determinismo sin dar error; `tests/lint.js` falla.
   Ese mismo lint impide que 10-50 toquen `THREE`, `document`, `scene` o `SFX`:
   lo que tenga que verse u oírse sale por la cola de eventos (`emit`, `sfx`,
   `fxRing`…) y lo consume `drainEvents()` en `70_fx.js`.
7. **Lo que cambia el estado va en `simStep(STEP)`**, con paso fijo de 1/60.
   Lo que dibuja va en `frame()` y usa `raw`. No los mezcles.
8. **Las entidades se señalan por `uid`, nunca por referencia** (`ownerId`,
   `lastHitById`, `ai.tgtId`), y se resuelven con `fighterById(id)`.

## Dónde está cada cosa

**10-57 es simulación y red** (corre en Node tal cual), **60-80 es vista**, **90 une las dos.**

| | |
|---|---|
| `src/10_core.js` | utilidades, azar con semilla, `ARENA`, `G`, eventos, comando de entrada |
| `src/20_champs.js` | `CHAMPS` (stats + 7 habilidades), `RELICS` |
| `src/30_combat.js` | entidades, `dealDamage`, `applyCC`, `tickFighter`, primitivas, `applyInput` |
| `src/40_ai.js` | `updateAI`, `BOT_PLANS`, `ROLE_RANGE` |
| `src/50_match.js` | máquina de partida, rondas, reliquias, **`simStep(dt, cmd)`** |
| `src/55_net.js` | protocolo binario: instantáneas, comandos, eventos |
| `src/56_server.js` | servidor autoritativo (irá en un Worker o en Node) |
| `src/57_client.js` | predicción, reconciliación e interpolación |
| `src/00_head.html` | CSS, pantallas, HUD; abre el `<script>` |
| `src/60_view.js` | three.js, escena, cámara, `CHAMP_MESH`, **`syncView`** |
| `src/70_fx.js` | partículas, `SOUNDS`, `SFX`, **`drainEvents`** |
| `src/80_ui.js` | HUD, placas, pantallas, `uiEvent`, `Input`, `sampleInput` |
| `src/90_loop.js` | `frame`, `boot` |

## Antes de terminar una tarea

Los siete tests pasan. Para cambios de equilibrio, mide con `tests/sim.js`
(edita `comp` y `SIZE` en `tests/test_drive.js`, fija `SIM_SEED` y sube a 40-60
rondas); doce rondas son ruido.

Que `tests/sim.js` arranque sin dobles es la señal de que la mitad de simulación
sigue siendo independiente del navegador. Si deja de arrancar, has cruzado la
frontera.

`tests/test_drive.js` reproduce a mano el bucle de `simStep` porque lleva su
propio ritmo de ronda, sin menús ni reliquias. Si cambias el orden de `simStep`,
cámbialo también allí.

## Documentación

- `README.md` — puerta de entrada
- `docs/ARQUITECTURA.md` — módulos, bucle, entidades, sistemas
- `docs/CONVENCIONES.md` — estilo, rendimiento, límites de r128, cómo añadir cosas
- `docs/ONLINE.md` — diseño del multijugador y plan de refactor por etapas
- `docs/REFERENCIA.md` — todos los números del juego
