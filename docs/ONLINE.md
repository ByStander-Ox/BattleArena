# Modo online

Diseño del multijugador de *Crisol · Arena*. El juego hoy es 100 % local: el
jugador contra bots, todo en una pestaña. Este documento decide **qué modelo de
red usar**, audita **qué del código actual lo impide** y propone **un plan por
etapas** en el que cada paso se puede entregar y probar por separado.

**Estado: etapas 1 y 2 hechas.** La simulación es determinista, la entrada es
un dato y el código de juego ya no depende de three.js, del DOM ni del audio:
corre entero en Node. Falta la red — no hay servidor, ni socket, ni una sola
línea de protocolo. Cada apartado dice en qué punto está.

---

## 1. Qué queremos exactamente

Antes de elegir arquitectura hay que acotar. Lo que este juego necesita:

- **Salas pequeñas**: 1v1, 2v2, 3v3. Como mucho seis jugadores por partida.
- **Partidas cortas**: al mejor de 3 rondas, 5-10 minutos.
- **Acción rápida y apuntada a mano**: proyectiles con tiempo de vuelo,
  desplazamientos, control. La latencia se nota de inmediato.
- **Sin mundo persistente**: ni inventario, ni economía, ni progresión entre
  partidas (todavía). Una partida es un proceso efímero.
- **Navegador, sin instalación.** Es la premisa del proyecto y se mantiene.

Y lo que **no** necesita, que es igual de importante porque descarta trabajo:

- No hace falta soportar cientos de jugadores por instancia.
- No hace falta replicar un mundo grande: la arena entra entera en la vista, así
  que **todo el mundo ve todo** y no hay que implementar área de interés.
- No hace falta rebobinado profundo: no hay armas hitscan.

Ese último punto es más útil de lo que parece. En un juego con hitscan, el
servidor tiene que reconstruir dónde estaban los enemigos hace 80 ms para
resolver un disparo. Aquí todos los ataques a distancia son proyectiles con
velocidad finita (`shoot` con `speed: 31..38`), y eso hace la compensación de
latencia mucho más simple y mucho menos injusta para quien recibe.

---

## 2. El modelo: servidor autoritativo

**Decisión: servidor autoritativo con predicción de cliente, reconciliación e
interpolación de entidades remotas.** El patrón clásico de los shooters, el que
describió Valve para Source y el que usa casi todo juego de acción con red.

```
CLIENTE                              SERVIDOR (autoritativo)
────────                             ───────────────────────
muestrea entrada a 60 Hz
  │  envía {seq, move, aim, botones}
  ├──────────────────────────────────▶ acumula entradas por jugador
  │                                    simula a 60 Hz fijo
  │                                    (el MISMO código de src/)
predice su propio luchador                │
  ya, sin esperar                         │  emite instantánea a 20 Hz
  │  ◀───────────────────────────────────┘  {tick, ackSeq, estado}
  │
  ├─ reconcilia: rebobina a lo que dijo el servidor
  │  y reaplica las entradas sin confirmar
  │
  └─ dibuja a los demás con 100 ms de retraso, interpolando
```

### Por qué no las alternativas

**Peer-to-peer con host.** Barato de montar y la latencia del host es cero —
para el host. Ese es justo el problema: ventaja estructural para uno de los seis
y ninguna defensa contra trampas, porque el host es el juez. Descartado.

**Lockstep determinista** (solo se envían entradas, cada cliente simula todo).
Tentador: el ancho de banda es ridículo y no hay que serializar estado. Pero
exige que todas las máquinas produzcan **bit a bit** el mismo resultado, y en
JavaScript eso no se puede garantizar: la norma obliga a `+`, `−`, `*`, `/` y
`sqrt` a ser exactos en IEEE-754, pero deja `Math.sin`, `Math.cos`, `Math.atan2`
y `Math.pow` a discreción de cada motor. Este código usa trigonometría en el
camino caliente — `tickFighter` orienta con `atan2`, `updateAI` apunta con
`sin`/`cos`, `shoot` normaliza con `hypot`. Habría que reescribir todo eso sobre
tablas propias o punto fijo. Además, en lockstep cada cliente conoce el estado
completo, así que los mapas de trampas son triviales. Descartado, aunque se
recupera una idea suya en la etapa 1: **hacer la simulación determinista es
útil de todas formas**, para repetir partidas y depurar.

**Servidor autoritativo sin predicción.** Simplísimo, y cada pulsación de tecla
tarda un viaje completo en verse. Con 60 ms de ida y vuelta ya se siente pastoso;
con 120 es injugable para un brawler. Descartado: la predicción no es un lujo.

### Transporte

**Empezar con WebSocket binario. Dejar la puerta abierta a WebTransport.**

WebSocket va sobre TCP: entrega fiable y ordenada, que para un juego de acción es
la propiedad *equivocada* — un paquete perdido bloquea los siguientes mientras se
retransmite, justo cuando más falta hacen. Pero con seis jugadores y unos 200
bytes por instantánea el problema es pequeño, y a cambio funciona en todos los
navegadores hoy, sin certificados especiales ni pelea con NAT.

WebTransport (HTTP/3, datagramas no fiables) es lo correcto a medio plazo y ya
está en Chrome y Edge; Safari va por detrás.

La consecuencia práctica: **el transporte va detrás de una interfaz desde el
primer día**.

```js
// net/transport.js
// send(bytes) · onMessage(cb) · onClose(cb) · close()
// Implementaciones: WsTransport, LoopbackTransport (worker), WtTransport (luego)
```

Con `LoopbackTransport` el modo online se puede desarrollar y depurar **sin
servidor**, con la simulación corriendo en un Web Worker de la misma pestaña.
Es la etapa 2 del plan y ahorra muchísimo tiempo.

---

## 3. Auditoría: qué impide hoy el online

Siete obstáculos concretos. Seis están resueltos; el que queda se pospone a
propósito.

| | Obstáculo | Estado |
|---|---|---|
| 3.1 | paso de tiempo variable | **hecho** |
| 3.2 | aleatoriedad sin semilla | **hecho** |
| 3.3 | la simulación crea mallas | **hecho** |
| 3.4 | `pos` es un `THREE.Vector3` | **hecho** |
| 3.5 | referencias cruzadas entre entidades | **hecho** |
| 3.6 | `G` es un singleton | pendiente (se pospone a propósito) |
| 3.7 | la entrada se lee dentro de la simulación | **hecho** |

### 3.1 Paso de tiempo variable — el bucle · **hecho**

```js
const raw = Math.min(.05, clock.getDelta());
```

La simulación avanza lo que haya durado el fotograma. A 144 Hz da pasos de 7 ms,
a 30 Hz de 33 ms, y tras un tirón, de 50. Eso impide que servidor y cliente
lleguen al mismo resultado con la misma entrada, que es la base de la
predicción.

**Arreglo: acumulador de paso fijo.** La simulación a 60 Hz exactos, el render a
lo que dé el monitor:

```js
const STEP = 1 / 60;
let acc = 0;
function frame() {
  requestAnimationFrame(frame);
  acc += Math.min(.25, clock.getDelta());   // techo: tras cambiar de pestaña, no recuperes 10 s
  while (acc >= STEP) { simStep(STEP); acc -= STEP; }
  render(acc / STEP);                        // alpha para interpolar la vista
}
```

Implementado así, con dos detalles que el esbozo no contemplaba:

- **La cámara lenta escala el acumulador, no el paso.** `_acc += raw *
  timeScale` da *menos pasos* en el remate de ronda, nunca pasos más cortos. El
  paso de simulación sigue siendo 1/60 exacto, que es lo que hace falta.
- **Interpolación en la vista.** Con paso fijo a 60 Hz y pantalla a 144, dibujar
  la última posición simulada se ve a tirones. Cada luchador y cada proyectil
  guardan su posición del paso anterior (`px`, `pz`, `pface`) y
  `updateFighterVisual(f, alpha)` interpola entre ambas. El ángulo se interpola
  con `angDiff` para que no dé la vuelta larga al cruzar ±π.

Tras un parón largo (pestaña en segundo plano) el tiempo pendiente se descarta
en vez de recuperarse: `MAX_STEPS = 5` pasos por fotograma como techo.

### 3.2 Aleatoriedad sin semilla — `40_ai.js`, `30_combat.js` · **hecho**

`Math.random()` aparece quince veces en la IA y ocho en combate. La mayoría de
las de combate son cosméticas (partículas, la lluvia de `updateZones`), pero
**las de la IA deciden el juego**: a quién apunta, cuándo esquiva, qué habilidad
lanza, hacia qué lado orbita.

**Arreglo: dos generadores, explícitamente separados.**

```js
// simulación: determinista, con semilla, replicable en el servidor
let _seed = 1;
function srand() {                       // mulberry32
  _seed |= 0; _seed = _seed + 0x6D2B79F5 | 0;
  let t = Math.imul(_seed ^ _seed >>> 15, 1 | _seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
// presentación: da igual, no toca el estado
const fxrand = Math.random;
```

Regla que hay que hacer cumplir a partir de ahí: **dentro de `simStep` solo
`srand()`**. Un `Math.random()` en el camino de simulación es un fallo de
desincronización que aparecerá una vez cada cien partidas y costará un día
encontrar. Vale la pena una comprobación en los tests que recorra `src/` y falle
si aparece `Math.random` fuera de las funciones de efectos.

Implementado con dos juegos de ayudantes en `10_core.js`: `rnd`, `irnd`,
`pickOne` y `chance` tiran de `srand()`; `frnd`, `firnd` y `frand` son los
cosméticos. `Math.random` solo aparece ya en las tres líneas que definen los
cosméticos, y **`node tests/lint.js` falla si reaparece en cualquier otro
sitio** — que era justo la comprobación que este documento prometía.

Beneficio colateral, ya disponible: `tests/sim.js` acepta `SIM_SEED` y es
reproducible, así que un cambio de equilibrio se mide contra exactamente la
misma secuencia de partidas. `startMatch(seed)` guarda la semilla en `G.seed`.

### 3.3 La simulación crea mallas — `30_combat.js`, `20_champs.js` · **hecho**

`makeFighter` monta un `THREE.Group`, `shoot` crea una `SphereGeometry`,
`spawnZone` crea dos mallas y las añade a `scene`. El servidor no tiene escena.
Hoy funciona en Node solo porque `tests/test_stub.js` finge un three.js entero —
un truco excelente para pruebas, pero no una base para producción.

**Arreglo: la simulación emite eventos; la vista los consume.**

```js
// en la simulación
G.events.push({ e: 'spawnProj', id, x, z, dx, dz, kind: 'vesk.m1' });
G.events.push({ e: 'hit', x, z, dmg, crit, targetId });
G.events.push({ e: 'death', id, byId });

// en el cliente, después de simular
for (const ev of G.events) VIEW[ev.e](ev);   // mallas, partículas, SFX, números
G.events.length = 0;
```

La misma cola viaja por la red: el cliente remoto reproduce los efectos de lo que
hicieron los demás sin haberlo simulado.

Lo mismo con el sonido: `SFX.shot()` dentro de `act()` pasa a ser un evento.

Implementado, con una diferencia respecto al esbozo que resultó ser importante:
**las entidades no se anuncian por eventos, se reconcilian.** Los eventos sirven
para lo instantáneo (un impacto, un grito, una muerte, un aviso); para lo que
persiste —luchadores, proyectiles, zonas, orbes— la vista recorre las listas de
`G` cada fotograma, crea la malla de lo que no la tiene y destruye la de lo que
ya no está (`syncView`, en `60_view.js`).

Sale más corto que emitir un evento por cada nacimiento y cada muerte, no se
rompe si un evento se pierde, y es exactamente lo que tendrá que hacer un
cliente al recibir instantáneas por la red: comparar lo que le llega con lo que
tiene dibujado. Un protocolo que dependiera de eventos de creación obligaría a
entrega fiable y ordenada; así no.

El proyecto quedó partido en dos mitades visibles desde el nombre del archivo:

```
src/10_core.js   20_champs.js   30_combat.js   40_ai.js   50_match.js    ← simulación
src/60_view.js   70_fx.js       80_ui.js                                 ← vista
src/90_loop.js                                                           ← el bucle que las une
```

`tests/lint.js` falla si algo de 10-50 menciona `THREE`, `document`, `window`,
`scene`, `renderer`, `camera` o `SFX`.

### 3.4 `pos` es un `THREE.Vector3` · **hecho**

Era un tipo de la capa de render dentro del estado de juego. Ahora `pos` y
`aimPt` se crean con `vec3(x, y, z)`, que devuelve un objeto plano. Se conserva
la `y` porque la lee la vista (balanceo, caída al vacío), pero la simulación no
la usa para nada.

### 3.5 Referencias cruzadas entre entidades · **hecho**

`proj.owner` y `zone.owner` apuntaban al objeto luchador, lo que impedía
serializar `G` y, con rebobinado, dejaba proyectiles agarrados a un estado ya
descartado.

Ahora todo lo que señala a otra entidad guarda su `uid` y lo resuelve al
usarlo, contra el índice `G.byId`: `proj.ownerId`, `zone.ownerId`,
`f.lastHitById`, `ai.tgtId`, y las listas de ya-golpeados de proyectiles y
desplazamientos. `quitMatch` reinicia el contador de ids a cero, como haría un
servidor al abrir una sala.

### 3.6 `G` es un singleton — `10_core.js` · pendiente, a propósito

Un servidor necesita muchas partidas por proceso. Hoy hay un `G` global y
funciones que lo leen directamente.

**Arreglo mínimo viable**: `createGame(cfg)` devuelve un objeto de estado, y las
funciones lo reciben como primer parámetro. Es un refactor extenso y mecánico.

**Atajo defendible**: un proceso (o un Worker) por partida, con `G` global
dentro. Seis jugadores por partida y partidas de diez minutos hacen que el coste
por proceso sea asumible hasta cifras de usuarios que este proyecto no va a ver
pronto. Recomendación: **empezar por el atajo**, medir, y hacer el refactor solo
si el coste de memoria aparece de verdad. Un proceso por partida además aísla
los fallos: una partida que revienta no se lleva las demás.

### 3.7 La entrada se lee desde dentro de la simulación — el bucle · **hecho**

```js
if (Input.m1 || (Input.touch && Input.tFire)) tryCast(f, 0, false);
if (Input.keys['q']) tryCast(f, 3, ex);
```

`playerControl` consulta el teclado directamente. Para que la entrada se pueda
enviar, guardar y **reaplicar** (que es lo que hace la reconciliación), tiene que
ser un dato.

**Arreglo: el comando de entrada como estructura.**

```js
// 5 bytes más el número de secuencia
{ seq: 1234,            // contador, para que el servidor confirme
  move: 37,             // dirección de movimiento en 256 pasos, o 255 = quieto
  aim: 91,              // dirección de apuntado en 256 pasos
  aimD: 125,            // distancia al punto apuntado, en decímetros
  buttons: 0b0010001,   // un bit por M1 M2 SP Q E F R
  ex: 1 }               // modificador de versión mejorada
```

`aimD` no estaba en el esbozo y hace falta: tres habilidades se apuntan a un
punto del suelo (`ground`) y la Égida de Lumen busca al aliado más cercano a ese
punto, así que con la dirección sola no basta. Un decímetro de precisión sobra
para un alcance máximo de 15 m.

Y la simulación pasa a consumirlo:

```js
function applyInput(f, cmd) {
  const a = cmd.move * TAU / 256;
  f.moveDir.x = cmd.move === 255 ? 0 : Math.sin(a);
  /* … */
  for (let i = 0; i < 7; i++) if (cmd.buttons & (1 << i)) tryCast(f, i, !!cmd.ex);
}
```

Fíjate en que **la IA ya funciona así**: `updateAI` escribe `moveDir` y `aimDir`
y llama a `tryCast`, exactamente lo mismo que hará `applyInput`. Que los bots
nunca hayan tenido privilegios es lo que hace este cambio barato, y lo que
permite que un bot sustituya a un jugador desconectado sin ningún código
especial.

Nota de diseño: el apuntado va **cuantizado a 256 direcciones**, unos 1,4° por
paso. Suficiente para un proyectil de radio 0,3 a 26 m, y hace el comando
compacto. Si en pruebas se nota, se sube a 16 bits.

Lo implementado: `sampleInput(seq)` en `10_core.js` lee teclado, ratón o
joysticks y devuelve el comando; `applyInput(f, cmd)` en `30_combat.js` lo
consume. `playerControl()` es ya solo el empalme entre los dos.
`tests/input_cmd.js` comprueba la ida y vuelta de la cuantización (peor error
medido: 0,69° sobre 1,41° de paso), que cada bit lance su habilidad y solo la
suya, y que el punto apuntado sobreviva al viaje.

---

## 4. Plan por etapas

Cada etapa deja el juego funcionando y con los tests en verde. No hay ninguna
rama larga donde el juego esté roto.

### Etapa 0 — Red de seguridad · **hecha**

Repositorio iniciado y subido a GitHub, con el juego y esta documentación en el
primer commit.

### Etapa 1 — Simulación determinista · **hecha**

Paso fijo (§3.1), PRNG con semilla (§3.2), entrada como comando (§3.7), `pos`
plano (§3.4), `ownerId` en vez de `owner` (§3.5).

**Criterio de aceptación: cumplido.** `node tests/determinism.js` ejecuta la
simulación tres veces en contextos limpios — dos con la misma semilla y una con
otra — y compara una huella del estado final. Las dos primeras coinciden; la
tercera no, que es lo que demuestra que la huella mide algo.

Se comprobó además que **el juego no cambió**: cinco partidas de 12 rondas antes
del refactor y cinco después dan la misma distribución de marcadores (el equipo 0
gana el 20 % y el 18 % de las rondas respectivamente, con el mismo rango de 1 a 4
victorias por partida). La asimetría es del banco de pruebas, que reparte
reliquias desiguales a propósito para ejercitar los modificadores.

Dos cosas que la etapa trajo de propina:

- `tests/lint.js` impide que vuelva a colarse un `Math.random()` en el camino
  de simulación. Es la comprobación automática que §3.2 prometía.
- Con semilla, `tests/sim.js` es reproducible: `SIM_SEED` y `SIM_ROUNDS` hacen
  que un ajuste de equilibrio se pueda medir contra la misma secuencia exacta de
  partidas, antes y después.

### Etapa 2 — Separar simulación de vista *(3-5 días, sin red)*

Cola de eventos (§3.3), `champs.data.js` separado de `champs.view.js`, sacar
`SFX` de `act()`, sacar `feed`/`floatNum`/`shake` de `dealDamage` y
`killFighter`.

**Criterio de aceptación**: `sim.js` corre **sin `test_stub.js`**. Ese es el
momento exacto en el que existe un servidor posible.

### Etapa 3 — Loopback en Worker *(2-3 días)*

La simulación se muda a un Web Worker. El hilo principal solo envía comandos de
entrada y recibe instantáneas, con el mismo protocolo binario que usará el
servidor. Sigue siendo un juego de un jugador contra bots, pero ya a través de
la frontera de red.

Aquí se implementan y se depuran **la predicción, la reconciliación y la
interpolación**, con latencia y pérdida de paquetes simuladas a voluntad
(`LoopbackTransport` con un retardo configurable). Depurar esto con un servidor
real de por medio es varias veces más caro.

**Criterio de aceptación**: con 150 ms de latencia simulada y 5 % de pérdida, el
juego se siente como en local.

### Etapa 4 — Servidor de verdad *(1-2 semanas)*

Node + `ws`. Gestor de salas, un Worker o proceso por partida. Emparejamiento
mínimo: una cola por modo, se llena, se crea la sala. Máquina de estados de
partida en el servidor (las rondas y las reliquias ya están escritas en
`50_match.js`, ya sin interfaz). Reconexión con un bot cubriendo el
hueco.

### Etapa 5 — Producción

Cuentas, persistencia, métricas, endurecimiento anti-trampas, despliegue en
varias regiones. Fuera del alcance de este documento; §10 y §11 dejan apuntado
lo que hará falta.

---

## 5. Protocolo

### Frecuencias

| Qué | Frecuencia | Razón |
|---|---|---|
| Simulación | 60 Hz fijo | coincide con el diseño actual, proyectiles rápidos |
| Instantánea servidor → cliente | 20 Hz | 3 por cada 100 ms de interpolación |
| Comandos cliente → servidor | 60 Hz | uno por paso; se agrupan si el navegador se retrasa |
| Reenvío redundante | los 3 últimos comandos en cada paquete | un paquete perdido no cuesta nada |

20 Hz con 100 ms de interpolación deja margen de dos instantáneas perdidas antes
de que se note un salto.

### Presupuesto de ancho de banda

Por instantánea en el peor caso (3v3 con pelea completa):

| Contenido | Bytes |
|---|---|
| Cabecera (tick, ackSeq, banderas) | 8 |
| 6 luchadores × 12 | 72 |
| ~10 proyectiles × 8 | 80 |
| ~4 zonas × 10 | 40 |
| Eventos del tick | ~30 |
| **Total** | **~230 B** |

A 20 Hz: **4,6 KB/s de bajada** por cliente. De subida, 13 bytes × 60 Hz × 3 de
redundancia ≈ **2,3 KB/s**. Es despreciable, incluso en móvil. La conclusión
práctica: **no optimices el ancho de banda antes de tiempo**; la delta-compresión
y la codificación por entropía no hacen falta a esta escala. Gasta ese esfuerzo
en que la predicción se sienta bien.

### Cuantización

| Campo | Formato | Precisión |
|---|---|---|
| `x`, `z` | `int16`, ×256 | 4 mm, alcanza ±128 m (la arena es ±19 × ±13) |
| `face`, `aim` | `uint8` | 1,4° |
| `hp`, `shield` | `uint8` | 1 punto (el máximo es 130 + reliquias) |
| `energy` | `uint8` | 1 punto de 0-100 |
| estados | máscara de 16 bits | presencia sí/no; la duración exacta la lleva el servidor |
| `uid` | `uint8` | máximo 6 luchadores por partida |

Las duraciones de los estados **no se replican**: el cliente solo necesita saber
que está aturdido para dibujar el icono; cuándo termina exactamente lo decide el
servidor. Eso ahorra bytes y, sobre todo, evita que el cliente prediga el final
de un control y se mueva antes de tiempo.

### Mensajes

```
Cliente → Servidor
  HELLO    { versión, token, preferencias }
  PICK     { campeón }          durante la selección
  INPUT    { seq, cmds[1..3] }  a 60 Hz, con redundancia
  RELIC    { índice }           durante brite
  PING     { t }
  LEAVE

Servidor → Cliente
  WELCOME  { idJugador, idSala, semilla, configuración }
  ROSTER   { jugadores, equipos, campeones }
  STATE    { fase, ronda, marcador, tiempo }        al cambiar de fase
  SNAPSHOT { tick, ackSeq, luchadores[], proyectiles[], zonas[], eventos[] }
  RELICS   { opciones[3] }                          al abrir brite
  RESULT   { ganador, estadísticas }
  PONG     { t, tServidor }
```

`ackSeq` es el número del último comando del jugador que el servidor procesó, y
es la pieza central de la reconciliación (§6).

---

## 6. Predicción y reconciliación

El cliente **no espera al servidor** para mover su propio luchador. Simula al
instante y corrige después.

```js
// cada paso de 60 Hz, en el cliente
const cmd = sampleInput(seq++);
history.push(cmd);                  // se guarda hasta que el servidor lo confirme
net.send(cmd);
applyInput(localFighter, cmd);
simStep(STEP);                      // solo el luchador local y sus proyectiles

// al llegar una instantánea
function onSnapshot(snap) {
  applyAuthoritative(snap);                              // el servidor manda
  history = history.filter(c => c.seq > snap.ackSeq);    // fuera lo confirmado
  for (const c of history) {                             // reaplica lo que falta
    applyInput(localFighter, c);
    simStep(STEP);
  }
}
```

### Qué se predice y qué no

| Se predice | No se predice |
|---|---|
| movimiento propio | daño a los demás |
| desplazamiento propio (`startDash`) | control que te aplican |
| inicio de canalización | empujes que recibes |
| recargas y gasto de energía propios | muertes |
| *aparición* de tus proyectiles | *impactos* de tus proyectiles |

La regla: **predice tu intención, nunca el resultado sobre otro**. Un cliente que
predice que mata a alguien y luego tiene que desmentirlo se siente mucho peor que
uno que espera 60 ms para ver el impacto.

Los proyectiles propios son el caso intermedio: sale uno local en cuanto disparas
(se siente inmediato), pero es **cosmético** — no hace daño. Cuando el servidor
confirma el suyo, el falso se reemplaza. Si el servidor rechazó el lanzamiento
(no había energía, había silencio), el falso desaparece.

### Corregir sin que se note

Cuando la posición autoritativa no coincide con la predicha:

- **error < 2 cm** — ignorar. Es ruido de cuantización.
- **error < 1 m** — absorber en 100 ms interpolando la posición *de dibujo*
  hacia la correcta, mientras el estado real ya es el del servidor.
- **error ≥ 1 m** — saltar. Significa que te aturdieron o te empujaron y el
  cliente no podía saberlo. Un salto honesto se lee mejor que un deslizamiento
  largo.

Ese umbral hay que afinarlo jugando. Los empujes de Brakk lo van a disparar a
menudo, y es la interacción que más va a costar de pulir.

---

## 7. Interpolación de los demás

Todo lo que no controlas se dibuja **100 ms en el pasado**, interpolando entre
las dos instantáneas que rodean a ese instante. Es lo que convierte 20
instantáneas por segundo en movimiento continuo.

```js
const renderTime = serverClock.now() - 100;   // ms de retraso
const [a, b] = buffer.around(renderTime);
const t = (renderTime - a.time) / (b.time - a.time);
pos.x = lerp(a.x, b.x, t);
```

Si el búfer se vacía (dos instantáneas perdidas seguidas), **extrapola como
mucho 100 ms** con la última velocidad conocida y luego congela. Extrapolar más
produce personajes que atraviesan paredes y vuelven de golpe.

El retraso de interpolación es un compromiso: más retraso da más suavidad y peor
sensación al apuntar. 100 ms es el punto de partida estándar; conviene dejarlo en
una constante y probarlo entre 50 y 150.

---

## 8. Compensación de latencia

Hay un desajuste inevitable: tú ves a tu enemigo 100 ms en el pasado, y tu
comando tarda otro tanto en llegar. Si el servidor resuelve el disparo con las
posiciones de *ahora*, fallarás tiros que en tu pantalla estaban dentro.

**Para lo instantáneo** (`meleeArc`, `radial`, `coneHeal`): el servidor guarda un
historial circular de un segundo de posiciones y, al resolver, rebobina a los
demás a `ahora − (RTT/2 + retrasoDeInterpolación)`, con un **tope de 200 ms**. Más
allá de ese tope se resuelve en el presente: un jugador con 400 ms de latencia no
puede golpear a alguien donde estuvo hace medio segundo.

**Para los proyectiles** no hace falta rebobinado. El servidor crea el proyectil
y lo hace viajar; el tiempo de vuelo (0,7 s a 26 m para el virote de Vesk) es un
orden de magnitud mayor que la latencia, así que el desajuste se diluye. Sí
conviene **adelantar el proyectil** en el primer paso los milisegundos de
latencia del que dispara, para que salga donde el tirador lo vio salir.

Esta asimetría es la razón por la que el catálogo de habilidades le viene bien a
la red: casi todo el daño a distancia viaja, y lo instantáneo es de corto
alcance, donde el error de rebobinado es pequeño.

---

## 9. Ciclo de partida en red

### Selección

El servidor abre la sala, anuncia el `ROSTER`, da 20 segundos para elegir
campeón y asigna uno al azar a quien no elija. (Hoy `startMatch` compone los
equipos evitando repetir campeón; esa regla puede quedarse o relajarse en
online.)

### Rondas

La máquina de estados de `updateRound` se muda al servidor tal cual: `intro` con
cuenta atrás, `live`, condición de fin de ronda, muerte súbita, `roundend`. Los
clientes reciben `STATE` en cada transición y **no deciden nada**: quien decreta
el fin de ronda es el servidor.

La cámara lenta de `roundend` (`G.timeScale`) es un efecto **de cliente**: el
servidor no ralentiza su simulación, solo anuncia que la ronda terminó y el
cliente dramatiza el remate. Mezclarlo con la simulación sería pedir problemas.

### Reliquias

Ahora mismo es una pantalla bloqueante. En red pasa a ser: el servidor envía tres
opciones por jugador, abre una ventana de 15 segundos y **elige por quien no
conteste** — `botPickRelic` ya existe y hace exactamente eso. Sin esperas
indefinidas por un jugador con la ventana minimizada.

### Desconexión

Aquí el proyecto tiene una ventaja poco común: **ya existe una IA completa que
juega con las mismas reglas**. Cuando alguien se cae:

1. Al segundo sin comandos, `makeAI(f, 'normal')` toma el control.
2. El hueco se le guarda 60 segundos.
3. Si vuelve, instantánea completa, se le devuelve el control y se le reconcilia.
4. Si no vuelve, el bot termina la partida.

Nunca se abandona una partida a medias por una desconexión, que es el fallo que
más partidas arruina en juegos de este tamaño. Esto solo funciona porque los
bots nunca tuvieron privilegios: si hubieran hecho trampa, no podrían sustituir a
un humano sin que se notara.

---

## 10. Trampas

Con servidor autoritativo, la mayoría de las trampas clásicas desaparecen solas:
el cliente **no puede** poner su vida a mil ni teletransportarse, porque nadie le
pregunta. Lo que queda por vigilar:

**Validar todo comando.** `move` y `aim` se normalizan al recibirlos; `buttons`
pasa por `canCast`, que ya comprueba silencio, energía y recarga. El servidor no
necesita código nuevo de validación: **su código de juego ya es la validación**.
Es la ventaja de correr la misma simulación.

**Limitar el caudal de entrada.** Un cliente que envía 600 comandos por segundo
intenta simular más rápido que los demás. Se descartan los comandos que excedan
la tasa esperada, con un margen para tirones.

**No enviar lo que no se ve.** Aquí no aplica — la arena entra entera en pantalla
y todo el mundo ve a todo el mundo, así que no hay información que ocultar. Es
una ventaja del diseño de arena cerrada.

**Lo que no se puede evitar desde el servidor**: apuntado asistido que lee la
pantalla, y scripts que reaccionan más rápido que un humano. La defensa es
estadística, no arquitectónica: medir precisión y tiempo de reacción por jugador
y marcar los valores imposibles. Etapa 5, no antes.

**Ojo con los eventos.** La cola de eventos de §3.3 viaja a los clientes. No
metas en ella nada que un jugador no deba saber; hoy no hay información oculta,
pero si algún día hay invisibilidad, el evento de "fulano se volvió invisible" no
puede llevar su posición.

---

## 11. Operación

**Dónde corre.** Un proceso Node por región, con un Worker (o proceso hijo) por
partida. Una partida 3v3 a 60 Hz sobre esta simulación cuesta muy poco: `sim.js`
simula 12 rondas 3v3 en ~300 ms, es decir, varios minutos de juego en menos de un
segundo de CPU. Un servidor modesto aguanta docenas de partidas simultáneas. **El
cuello de botella será la memoria por proceso, no la CPU.**

**Latencia y regiones.** Con menos de 60 ms de ida y vuelta la predicción es casi
invisible; por encima de 120 empieza a notarse en los empujes. Regla práctica:
una región por continente con jugadores, y emparejar por latencia medida, no por
lo que el jugador declare.

**Reloj.** `PING`/`PONG` estiman la deriva y la ida y vuelta. El cliente mantiene
su reloj alineado con el del servidor; toda la interpolación depende de eso.

**Qué medir desde el primer día**: ida y vuelta por jugador (p50/p95), pérdida de
paquetes, cuántas reconciliaciones por minuto y de qué magnitud, duración del
paso de simulación en el servidor, y partidas abandonadas por desconexión. Las
reconciliaciones grandes y frecuentes son la señal temprana de que algo en la
predicción está mal.

---

## 12. Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Los empujes se sienten mal con latencia | **alta** | son el caso peor de la predicción; probarlos explícitamente en la etapa 3 con 150 ms simulados |
| El refactor de la etapa 2 rompe el equilibrio sin querer | media | referencia de `sim.js` con semilla fija desde la etapa 0 |
| Un `Math.random()` colado desincroniza | media | comprobación automática en los tests, etapa 1 |
| WebSocket sobre TCP se atraganta con pérdida | baja a esta escala | transporte tras interfaz; WebTransport es un cambio de un archivo |
| Un proceso por partida no escala | baja a corto plazo | `createGame(cfg)` está identificado (§3.6); hacerlo cuando duela |
| El juego necesita más contenido antes que red | **alta** | tres campeones son pocos para que una partida en línea tenga vida; ver abajo |

Ese último merece decirse claro: **el modo online no es lo que más falta hace
ahora mismo.** Con tres campeones, un 3v3 en línea enfrenta composiciones casi
idénticas en cada partida. Las etapas 1 y 2 valen la pena ya — hacen el proyecto
determinista, medible y testeable, y eso ayuda a todo lo demás. Pero entre la
etapa 2 y la 3 hay un buen momento para parar y añadir campeones. El online es
mucho más divertido con doce campeones que con tres, y el trabajo de la etapa 2
no se echa a perder mientras tanto.

---

## 13. Decisiones abiertas

Cosas que este documento **no** decide, porque dependen de hacia dónde quieras
llevar el juego:

- **¿Cuentas y progresión?** Cambia si hace falta base de datos desde la etapa 4
  o se puede posponer entera.
- **¿Emparejamiento por nivel?** Sin cuentas no hay historial, así que van
  juntos.
- **¿Partidas privadas con código?** Mucho más barato que el emparejamiento
  abierto y suele ser lo que la gente usa al principio. Podría ser lo primero.
- **¿Espectadores?** Casi gratis con este modelo: un espectador es un cliente sin
  comandos de entrada. Vale la pena dejar el hueco en el protocolo aunque no se
  implemente.
- **¿Repeticiones?** Con la etapa 1 hecha (determinismo con semilla), una
  repetición es la semilla más la lista de comandos: unos pocos kilobytes por
  partida. Es la recompensa inesperada de hacer la simulación determinista, y
  sería una pena no recogerla.
