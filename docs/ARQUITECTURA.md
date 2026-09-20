# Arquitectura

Cómo está montado *Crisol · Arena* por dentro: qué hace cada módulo, en qué
orden corre el bucle y qué forma tienen los datos. Si vas a tocar el código,
esto es lo que conviene tener en la cabeza antes.

---

## 1. Forma del proyecto

```
crisol-arena.html      artefacto compilado — NO se edita a mano
build.sh               concatena src/ → crisol-arena.html
src/                   el código real, un archivo por capa
tests/                 simulación headless en Node (sin navegador)
docs/                  esta documentación
```

No hay empaquetador, ni `package.json`, ni `node_modules`. `build.sh` es un
`cat` de seis archivos en orden alfabético más el cierre de etiquetas. Todo el
juego termina siendo **un solo `<script>` en un solo ámbito global**, y esa
decisión condiciona casi todo lo demás (ver [CONVENCIONES.md](CONVENCIONES.md)).

Dependencias en tiempo de ejecución, todas por CDN:

| Qué | Dónde | Por qué importa |
|---|---|---|
| three.js **r128** | `cdnjs.cloudflare.com` | versión fijada; la API moderna no aplica |
| Cinzel + Barlow Condensed | Google Fonts | solo estética, degrada sin romper |

---

## 2. Las seis capas

El prefijo numérico **es** el orden de carga y también el orden de dependencia:
un módulo solo puede usar lo que definieron los anteriores.

### `00_head.html` — presentación

`<head>`, CSS completo y el marcado de las pantallas (`#scr-title`, `#scr-setup`,
`#scr-brite`, `#scr-result`, `#scr-pause`, `#scr-help`), el HUD y los controles
táctiles. Termina abriendo el `<script>` que los cinco archivos siguientes
rellenan.

El HUD es **DOM sobre un canvas**, no texto dibujado en WebGL: las barras son
`<i>` con `transform: scaleX()` y las placas flotantes se posicionan proyectando
coordenadas de mundo a pantalla. Es más barato de iterar y más nítido que
renderizar texto en 3D.

### `10_core.js` — cimientos

- **Utilidades**: `clamp`, `lerp`, `rnd`, `dist2`, `angDiff`, `damp`, `$`, `el`.
- **Geometría de arena**: `ARENA` es un rectángulo redondeado (`hx:19`, `hz:13`,
  radio `7.5`). `insideArena`, `edgeDepth`, `pushInside`, `collidePillars` y
  `segHitsPillar` son las únicas funciones que saben de la forma del suelo —
  todo lo demás (bots, empujes, muerte súbita) las consulta.
- **`G`**: el objeto de estado global. Todo lo que cambia durante una partida
  vive ahí.
- **`MODES` y `DIFFS`**: tablas de configuración de modo y de dificultad de bot.
- **Motor**: `initEngine`, luces, textura de suelo generada en un `<canvas>` 2D
  (no hay assets externos), cámara y `updateCamera`.
- **`Input`**: teclado, ratón y joysticks táctiles si `pointer:coarse`.
- **`SFX`**: síntesis con `OscillatorNode`. No hay archivos de audio.

### `20_champs.js` — datos de campeones

`CHAMPS` es un diccionario de definiciones. Cada campeón mezcla **tres cosas
distintas** en el mismo objeto, y esa mezcla es la deuda técnica principal de
cara al modo online (ver [ONLINE.md](ONLINE.md) §3):

1. **Estadísticas** — `hp`, `speed`, `role`, `stats`. Simulación pura.
2. **`build(g)`** — mallas de three.js. Presentación pura.
3. **`ab[]`** — siete habilidades. Simulación *y* presentación mezcladas: cada
   `act(f, o)` aplica el efecto **y** llama a `SFX.*` directamente.

El orden de `ab` es **fijo y significativo**: `M1, M2, SP, Q, E, F, R`. El HUD,
el mapeo de teclas y los planes de bot lo dan por hecho por índice, no por
nombre.

`RELICS` son 18 modificadores permanentes. Cada uno es `ap: f => { ... }` que
muta `f.mods` o `f.maxHp`. Se aplican al empezar la ronda y no se deshacen: la
partida se reconstruye entera al salir.

### `30_combat.js` — la simulación

El corazón. Define las entidades y las primitivas con las que se escribe
cualquier habilidad:

| Primitiva | Qué hace |
|---|---|
| `shoot(f, o)` | proyectil con velocidad, radio, alcance, perforación |
| `meleeArc(f, o)` | golpe instantáneo en arco frontal |
| `coneHeal(f, o)` | cura en cono a aliados |
| `radial(f, o)` | efecto en círculo alrededor del lanzador |
| `startDash(f, o)` | desplazamiento con duración, inmunidad opcional, daño al pasar |
| `spawnZone(f, o)` | área persistente: trampa, daño por tick, cura, lluvia |
| `buff` / `addShield` / `cleanse` | efectos sobre uno mismo o aliados |
| `healTarget(src, tgt, n)` | cura directa |

Y las reglas transversales:

- **`dealDamage`** — único punto donde se resta vida. Aplica modificadores de
  origen (`m1Dmg`, `abDmg`, `execute`, `mark`), luego de destino (`dr`,
  `lowHpDr`), come escudo antes que vida, reparte energía a ambos (42 % al que
  pega, 16 % al que recibe) y dispara robo de vida y `echo`.
- **`applyCC`** — control con **rendimientos decrecientes**: `DR_SCALE =
  [1, .5, .25, 0]` por tipo (`stun`/`root`/`silence`) con ventana de 6,5 s.
- **`tryCast` → `canCast` → `fireAbility`** — la cadena de lanzamiento: valida
  silencio, energía y recarga, arranca la canalización (`wind`) y al terminar
  ejecuta `act`.
- **`tickFighter(f, dt)`** — el paso por luchador, con prioridades en este
  orden: temporizadores → muerto → cayendo al vacío → daño de muerte súbita →
  empuje → desplazamiento → canalización → movimiento → orientación. Cada uno
  de los tres primeros hace `return`: estás muerto, o cayendo, o desplazándote,
  y entonces el resto **no corre**. Ese `return` temprano es la razón de que un
  desplazamiento te saque limpiamente de una situación.

### `40_ai.js` — bots

`updateAI(f, dt)` produce, cada fotograma, un `moveDir` y un `aimDir` —
exactamente las mismas dos entradas que produce el jugador humano. **Los bots no
hacen trampas**: pasan por `tryCast` como todo el mundo.

El vector de movimiento se compone sumando fuerzas: acercarse o alejarse hasta
`ROLE_RANGE[rol]`, orbitar, huir con poca vida, esquivar proyectiles entrantes,
salir de zonas enemigas, ir a por orbes y no caerse por el borde. Se normaliza
al final.

La puntería tiene **error y retardo** (`D.aimErr`, `D.react` de `DIFFS`) y
predice la posición futura del objetivo con `predictPos` usando `velEst`.

`BOT_PLANS[champId](f, ctx)` decide *qué habilidad* usar; devuelve `{i, ex}` o
`null`. Es una lista de reglas con probabilidades, no un árbol de comportamiento.
Un campeón sin plan cae en `_default` y solo usa el básico.

### `50_match_ui.js` — partida e interfaz

Dos responsabilidades que conviene no confundir:

- **Partida**: `startMatch`, `beginRound`, `endRound`, `openRelicPick`,
  `endMatch`, `quitMatch`. La máquina de estados.
- **Interfaz**: HUD, placas sobre personajes, números flotantes, marcos de
  equipo, pantallas.

### `60_loop.js` — pegamento

`playerControl()` (entrada → intenciones), `updateRound(dt)` (ritmo de ronda,
orbes, muerte súbita, condición de victoria) y `frame()`, el bucle.

---

## 3. Estado global: `G`

```js
G = {
  state,                 // title | setup | intro | live | roundend | brite | result
  mode, diff,            // referencias a MODES/DIFFS
  fighters, projectiles, zones, pickups, fx,   // todas las entidades vivas
  player,                // el luchador del humano (null en simulación)
  t, dt, paused,
  round, score, roundTime, sudden, shrink,
  timeScale, nextOrb, nextHeal, started,
  camShake, order
}
```

Un único objeto mutable, sin copias. Sirve porque hay exactamente una partida
por pestaña. **No es serializable ni clonable tal cual**: contiene referencias a
objetos de three.js y referencias cruzadas entre entidades (`proj.owner` apunta
a un luchador, `zone.owner` también). Es el primer obstáculo real del modo
online.

### Máquina de estados

```
title ──▶ setup ──▶ [brite] ──▶ intro ──▶ live ──▶ roundend ──┬──▶ [brite] ──▶ intro …
  ▲                                         │                 │
  │                                         └──▶ pause        └──▶ result ──▶ title
```

- `intro` — cuenta atrás 3-2-1. La simulación corre pero `moveDir` se fuerza a cero.
- `live` — el único estado donde los bots piensan y el reloj de ronda avanza.
- `roundend` — cámara lenta (`timeScale` interpolado hacia 1) durante unos segundos.
- `brite` — elección de reliquia entre rondas; los bots eligen con `botPickRelic`.

---

## 4. El bucle, paso a paso

`frame()` en `60_loop.js`, y el orden **no es casual**:

```
requestAnimationFrame
│
├─ raw = min(0.05, clock.getDelta())        ← techo anti-salto al volver a la pestaña
│
├─ si (started && !paused && estado simulable):
│   ├─ dt = raw × timeScale
│   ├─ playerControl()                      entrada humana → moveDir/aimDir
│   ├─ G.order++ ; order = fightersInOrder()   ← rotación, ver abajo
│   ├─ updateAI(f) para cada bot            entrada de bot → moveDir/aimDir
│   ├─ tickFighter(f) para cada luchador    aplica intenciones al mundo
│   ├─ updateProjectiles / updateZones / updatePickups
│   ├─ velEst por luchador                  (lo usa predictPos de los bots)
│   ├─ updateFighterVisual                  estado → mallas
│   ├─ updateRound(dt)                      ritmo, muerte súbita, fin de ronda
│   └─ updateHUD / updatePlates
│
├─ updateFx / updateFloats / updateEmbers / updateCamera    ← siempre, con `raw`
└─ renderer.render()
```

Tres detalles que hay que preservar:

**Rotación del orden de actualización.** `fightersInOrder()` desplaza el índice
inicial un puesto cada fotograma. Sin esto, quien se procesa primero gana
siempre el intercambio en cuerpo a cuerpo: un espejo de Brakk terminaba 58-2.

**`raw` contra `dt`.** Los efectos, los números flotantes y la cámara usan `raw`
(tiempo real); la simulación usa `dt` (tiempo de juego, escalado en cámara
lenta). Mezclarlos hace que la cámara se arrastre en el remate de ronda.

**Todo depende de `dt`.** No hay paso fijo: el juego corre más *suave*, no más
rápido, a 144 Hz. Correcto para un juego local, insuficiente para red —
[ONLINE.md](ONLINE.md) §3.1.

---

## 5. Las entidades

### Luchador

Lo crea `makeFighter(champId, team, isBot, name)`. Campos por grupos:

| Grupo | Campos | Nota |
|---|---|---|
| identidad | `uid`, `champ`, `team`, `isBot`, `name` | `uid` ya sirve como id de red |
| espacio | `pos` (Vector3), `face`, `aimDir`, `aimPt`, `moveDir` | `moveDir`/`aimDir` son **la entrada**, no el resultado |
| recursos | `maxHp`, `hp`, `shield`, `shieldT`, `energy`, `alive` | energía 0-100, la definitiva cuesta 100 |
| habilidades | `cds[]`, `casting`, `combo`, `comboT`, `echoT` | `casting = {i, ab, o, t, dur, root}` |
| estados | `st.{stun,root,silence,slow,slowAmt,haste,hasteAmt,invuln,evade,dr,drAmt,mark,autoT}` | todos son **segundos restantes** |
| física | `dash`, `knock`, `falling` | excluyentes con el movimiento normal |
| control | `ccDR.{stun,root,silence}.{n,t}` | contador de rendimientos decrecientes |
| reliquias | `mods.*`, `relics[]` | `mods` es la suma de todas las reliquias |
| presentación | `mesh`, `plate`, `hitFlash`, `bob`, `anim` | **debería estar fuera** |
| telemetría | `stats.{dmg,heal,taken,kills,rounds}` | lo lee la pantalla de resultado |

`resetFighter(f, x, z, face)` lo devuelve al inicio de ronda: vida llena,
recargas a cero, estados limpios — pero **conserva `mods` y `relics`**, que son
acumulados de partida.

### Proyectil

Plano, sin herencia: `{x, z, dx, dz, speed, radius, range, traveled, dmg,
healAlly, kb, pull, cc, ccT, cc2, cc2T, pierce, chain, team, owner, hit[], mesh,
alive, col}`. `hit[]` evita golpear dos veces al mismo objetivo con un proyectil
perforante.

### Zona

`{x, z, radius, dur, t, delay, tick, tickT, tickDmg, tickHeal, dmg, cc, ccT,
slow, trap, friendly, rain, team, owner, mesh, ring, alive, col}`. Cubre trampa
(`trap`: se arma tras `delay` y se gasta con el primero que entra), daño o cura
por tick, y la lluvia de la definitiva de Vesk.

### Recogible

Orbe de energía en el centro cada 24 s; dos orbes de vida en los polos cada 30 s.

### Efecto (`fx`)

Solo presentación: partículas, anillos, arcos. Se actualizan con `raw` y se
pueden tirar enteros sin tocar la simulación. Esa separación ya está limpia.

---

## 6. Sistemas de combate

**Energía.** Único recurso. Sube al hacer daño (42 % del daño causado), al
recibirlo (16 %), al curar (30 %) y con los orbes. Paga las versiones mejoradas
(50, con Shift) y la definitiva (100). Es lo que mantiene el ritmo: quien pelea
acumula, quien huye no.

**Escudo.** `addShield` toma el **máximo**, no suma, y tiene caducidad propia
(`shieldT`). Se come antes que la vida en `dealDamage`.

**Control con rendimientos decrecientes.** Cada aplicación del mismo tipo sobre
el mismo objetivo escala por `[1, .5, .25, 0]` dentro de una ventana de 6,5 s,
con `tenacity` (reliquia) encima. Sin esto, la primera cadena de aturdimientos
gana la ronda.

**Caída al vacío.** El empuje que te saca del suelo (`insideArena` con margen
negativo) activa `falling`, y medio segundo después mueres con crédito al que te
empujó (`lastHitBy`). La patada mejorada de Vesk existe para esto.

**Muerte súbita.** A partir de `max(30, límite − 55)` segundos, `G.shrink`
encoge el área jugable hasta el 26 %; fuera del anillo son 9 de daño cada medio
segundo.

---

## 7. Presentación

**Render.** three.js r128, sombras `PCFSoftShadowMap`, cámara perspectiva fija en
escorzo, niebla. El suelo es una `ExtrudeGeometry` de rectángulo redondeado con
textura procedural dibujada en un `<canvas>` 2D al arrancar.

**HUD.** DOM puro. Las barras animan con `transform: scaleX()` sobre elementos
con `will-change`; las placas y los números flotantes se proyectan a pantalla con
`Vector3.project(camera)` y se colocan con `transform: translate()`. Nunca se
tocan `width`, `top` ni `left` — solo transformaciones compuestas, para no
disparar reflow.

**Números flotantes.** `numPool` recicla los `<div>`: se sacan del pool al
aparecer y vuelven al desaparecer. En un 3v3 con zonas de daño por tick se crean
varios por segundo.

**Sonido.** `SFX` sintetiza con osciladores. Requiere un gesto del usuario para
arrancar el `AudioContext` — de ahí el `addEventListener('pointerdown', wake,
{once:true})` de `boot()`.

---

## 8. Pruebas

`tests/test_stub.js` sustituye three.js por dobles mínimos y `tests/test_dom.js`
hace lo propio con el DOM. Eso permite ejecutar **la lógica real, sin tocar ni
una línea**, en Node:

```bash
node tests/sim.js     # 12 rondas de bots contra bots, 3v3, ~300 ms
node tests/e2e.js     # menú → partida → rondas → reliquias → resultado
```

`sim.js` además verifica invariantes duros: posiciones `NaN` y luchadores fuera
de la arena lanzan excepción. Y cuenta habilidades lanzadas, lo que detecta kits
rotos (`sin usar: vesk.R` significa que ningún bot llegó a los 100 de energía).

**Que la simulación ya corra headless es el activo más valioso del proyecto de
cara al online**: el servidor autoritativo es ese mismo código.
