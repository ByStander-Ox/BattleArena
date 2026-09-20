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
./build.sh              # src/ → crisol-arena.html  (obligatorio tras editar src/)
node tests/sim.js       # 12 rondas de bots 3v3, ~300 ms; valida equilibrio y salud
node tests/e2e.js       # recorrido completo: menú → rondas → reliquias → resultado
```

No hay `package.json`, ni instalación, ni linter. Node 22 basta.

## Reglas que rompen el juego en silencio

1. **`crisol-arena.html` es generado.** Se edita `src/`, se ejecuta `./build.sh`.
2. **Un solo ámbito global**: los seis archivos de `src/` se concatenan en un
   `<script>`. Un nombre de nivel superior duplicado es un `SyntaxError` que deja
   la página en blanco. `grep -rn "nombre" src/` antes de declarar.
3. **`'use strict'` va en la primera línea de `10_core.js`**, que es la primera
   sentencia del script concatenado. No añadas archivos antes sin moverla.
4. **`ab[]` tiene siete entradas en orden fijo** (`M1 M2 SP Q E F R`); el HUD,
   las teclas y los bots indexan por posición.
5. **No toques la rotación de `fightersInOrder()`**: sin ella, quien se procesa
   primero gana siempre el cuerpo a cuerpo (se midió: 58-2).
6. **No metas `Math.random()` en la simulación** más de lo que ya hay: el modo
   online exige determinismo y cada uso nuevo es trabajo futuro.

## Dónde está cada cosa

| | |
|---|---|
| `src/00_head.html` | CSS, pantallas, HUD; abre el `<script>` |
| `src/10_core.js` | utilidades, `ARENA`, `G`, `MODES`, `DIFFS`, motor, `Input`, `SFX` |
| `src/20_champs.js` | `CHAMPS` (stats + mallas + 7 habilidades), `RELICS` |
| `src/30_combat.js` | entidades, `dealDamage`, `applyCC`, `tickFighter`, primitivas |
| `src/40_ai.js` | `updateAI`, `BOT_PLANS`, `ROLE_RANGE` |
| `src/50_match_ui.js` | máquina de partida, rondas, reliquias, HUD |
| `src/60_loop.js` | `playerControl`, `updateRound`, `frame`, `boot` |

## Antes de terminar una tarea

Los dos tests pasan. Para cambios de equilibrio, mide con `tests/sim.js` (edita
`comp` y `SIZE` en `tests/test_drive.js`, sube a 40-60 rondas); doce rondas son
ruido.

## Documentación

- `README.md` — puerta de entrada
- `docs/ARQUITECTURA.md` — módulos, bucle, entidades, sistemas
- `docs/CONVENCIONES.md` — estilo, rendimiento, límites de r128, cómo añadir cosas
- `docs/ONLINE.md` — diseño del multijugador y plan de refactor por etapas
- `docs/REFERENCIA.md` — todos los números del juego
