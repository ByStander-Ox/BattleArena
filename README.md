# Crisol · Arena

Prototipo de brawler de arena por rondas al estilo *Battlerite*, en three.js.
Sin multiplayer: los aliados y rivales son bots. Todo el juego corre en el
navegador, en un único archivo HTML sin dependencias más allá de three.js y
dos tipografías de Google Fonts.

## Qué hay dentro

```
crisol-arena.html      juego completo, listo para abrir con doble clic
build.sh               reconstruye crisol-arena.html a partir de src/
src/                   el código separado por capas (es lo que conviene editar)

  — simulación: corre tal cual en Node, sin navegador —
  10_core.js           utilidades, azar con semilla, arena, estado global, eventos
  20_champs.js         campeones, kits de habilidades y reliquias  ← empieza aquí
  30_combat.js         luchadores, daño, control, proyectiles, zonas, orbes
  40_ai.js             bots: posicionamiento, esquivas, predicción, planes
  50_match.js          partida, rondas, reliquias y el paso de simulación

  — vista: se puede tirar entera sin que el juego deje de funcionar —
  00_head.html         <head>, CSS y maquetación de pantallas y HUD
  60_view.js           three.js, escena, cámara, mallas y sincronización
  70_fx.js             partículas, sonido y el consumidor de eventos
  80_ui.js             HUD, placas, pantallas y entrada del jugador

  90_loop.js           el bucle que une las dos mitades
tests/                 simulación sin navegador (ver abajo)
docs/                  documentación técnica (ver abajo)
```

## Documentación

| Documento | Para qué |
|---|---|
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | cómo está montado: módulos, bucle, entidades, sistemas de combate |
| [docs/CONVENCIONES.md](docs/CONVENCIONES.md) | buenas prácticas: estilo, rendimiento, límites de r128, cómo añadir campeones, habilidades y reliquias |
| [docs/ONLINE.md](docs/ONLINE.md) | diseño del modo online y el refactor por etapas que necesita |
| [docs/REFERENCIA.md](docs/REFERENCIA.md) | todos los números: campeones, habilidades, reliquias, constantes |

`CLAUDE.md` resume lo imprescindible para agentes que trabajen en el repositorio.

## Compilar

```bash
./build.sh             # concatena src/ en crisol-arena.html
```

No hay empaquetador ni instalación: el orden de concatenación es el orden de
los números, y todo vive en un mismo ámbito. Los números no son decorativos —
10 a 50 son la simulación, 60 a 80 la vista, 90 el bucle.

## Probar sin navegador

La mitad de simulación no depende del navegador, así que se puede ejecutar tal
cual desde la terminal, a 60 pasos por segundo. Sirve para detectar fallos y
para medir el equilibrio. Solo `e2e.js`, que recorre también la interfaz,
necesita dobles de three.js y del DOM.

```bash
node tests/sim.js           # 12 rondas de bots 3v3, sin dobles, ~250 ms
node tests/e2e.js           # recorrido completo: menú → rondas → reliquias → resultado
node tests/determinism.js   # misma semilla ⇒ misma partida
node tests/input_cmd.js     # el comando de entrada, de punta a punta
node tests/net.js           # el protocolo de cable, de ida y vuelta
node tests/netloop.js       # cliente y servidor con latencia y pérdida simuladas
node tests/lint.js          # azar con semilla y frontera simulación/vista
```

`tests/sim.js` es la herramienta útil para retocar números: cambia `comp` para
enfrentar dos campeones concretos y repite. La simulación lleva semilla, así que
dos ejecuciones con la misma enfrentan exactamente las mismas partidas y la
diferencia de marcador es el efecto de tu cambio, no del azar:

```bash
SIM_SEED=7 SIM_ROUNDS=60 node tests/sim.js
```

Con 40-60 rondas el marcador da una señal razonable; con doce, ruido.

## Añadir un campeón

En `src/20_champs.js`, copia una entrada de `CHAMPS` y cambia:

- `hp`, `speed`, `role` (`Tirador`, `Vanguardia` o `Custodio`; el rol decide la
  distancia a la que se coloca el bot, en `ROLE_RANGE` de `40_ai.js`).
- `ab`: siete habilidades en este orden fijo, porque el HUD y los controles lo
  asumen: `M1`, `M2`, `SP` (desplazamiento), `Q`, `E`, `F`, `R` (definitiva).

Cada habilidad se escribe con las primitivas de `30_combat.js`: `shoot`,
`meleeArc`, `coneHeal`, `radial`, `startDash`, `spawnZone`, `buff` y
`healTarget`. El parámetro `o.ex` indica si se lanzó la versión mejorada. Para
un efecto visible o audible, un evento: `sfx('nombre')`, `fxRing(...)`.

Las mallas van aparte, en `CHAMP_MESH` de `src/60_view.js`: con three.js r128 no
existe `CapsuleGeometry`, así que se usan cilindros, esferas y conos.

Después añade el identificador a `CHAMP_LIST` y, si quieres que los bots lo
jueguen bien, un plan en `BOT_PLANS` de `40_ai.js`.

## Detalles que costaron encontrar

- **Orden de actualización.** Procesar siempre a los luchadores en el mismo
  orden le daba al primero una ventaja sistemática en el cuerpo a cuerpo: un
  espejo de Brakk acababa 58-2. `fightersInOrder()` rota el orden cada
  fotograma. Si tocas el bucle, conserva esa rotación.
- **Control encadenado.** Sin rendimientos decrecientes, quien acertaba el
  primer aturdimiento no soltaba nunca. `DR_SCALE` en `applyCC` reduce cada
  control repetido a la mitad, a un cuarto y luego a cero durante 6,5 s.
- **Altura del suelo.** `ExtrudeGeometry` crece hacia +Y tras rotar la forma;
  hay que bajarla por su `boundingBox.max.y` o los personajes quedan hundidos
  dentro de la plataforma.
- **Bots sincronizados.** Al reiniciar la ronda se les da un retardo aleatorio
  para que no reaccionen todos en el mismo fotograma.

## Equilibrio actual (bots contra bots, 60 rondas)

| | contra Vesk | contra Brakk | contra Lumen |
|---|---|---|---|
| **Vesk** | 50 % | 60 % | 31 % |
| **Brakk** | 40 % | 50 % | 58 % |
| **Lumen** | 69 % | 42 % | 50 % |

Es un triángulo, no un equilibrio plano: el tirador castiga al cuerpo a cuerpo,
el cuerpo a cuerpo rompe al curador y el curador aguanta al tirador. Ten en
cuenta que mide bots, y un humano apunta mucho mejor que el bot de Vesk.

## Modo online (planificado)

Está previsto que el juego tenga multijugador en línea. Todavía no hay nada
implementado, pero el diseño está cerrado en [docs/ONLINE.md](docs/ONLINE.md):
**servidor autoritativo con predicción de cliente, reconciliación e
interpolación**, salas de 1v1 a 3v3, y transporte WebSocket binario detrás de una
interfaz para poder pasar a WebTransport más adelante.

**Las etapas 1 y 2 ya están hechas.**

La simulación avanza en pasos fijos de 1/60, el azar lleva semilla, la entrada
del jugador es un dato plano que se puede guardar y reaplicar, y ninguna entidad
guarda referencias a otra. Con la misma semilla, una partida se desarrolla
exactamente igual paso a paso — lo comprueba `tests/determinism.js`.

Y el código de juego ya no sabe nada de three.js, del DOM ni del audio: anota lo
que pasa en una cola de eventos y la vista decide qué hacer con cada anotación.
`node tests/sim.js` ejecuta la simulación entera sin un solo doble, que era
precisamente el criterio: **si arranca, existe un servidor autoritativo posible,
porque es exactamente este código**.

De propina: el equilibrio se puede medir de verdad, y una repetición cabe en
unos pocos kilobytes (la semilla más la lista de comandos).

**Y el núcleo de la etapa 3 también.** Existen ya el protocolo binario (183 B
por instantánea de 3v3, 3,6 KB/s), el servidor autoritativo y el cliente con
predicción, reconciliación e interpolación. `tests/netloop.js` los enfrenta en
dos contextos aislados a través de una red con latencia, fluctuación y pérdida
simuladas, y mide lo único que se puede medir sin jugar: **la posición que
predice el cliente contra la que saca el servidor**. Coinciden, y la
reconciliación se queda en los 2 mm de la cuantización incluso con 250 ms de
latencia y una de cada ocho tramas perdida.

Falta enchufarlo al navegador: mudar el servidor a un Web Worker y darle al menú
una opción para jugar contra él. Hasta entonces el juego sigue siendo local.

## Lo que no está

Tres campeones en lugar de treinta, sin parada ni contraataque, sin arte ni
animaciones reales, sin progresión ni emparejamiento, y el sonido es síntesis
con osciladores. La red no existe: hoy todo es local.

## Licencia y origen

Código, nombres y diseño son originales, hechos desde cero. *Battlerite* es de
Stunlock Studios y aquí solo se toma el género: arena por rondas, sin esbirros
ni objetos, con habilidades apuntadas a mano. No se reutiliza nada suyo.
