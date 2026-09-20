# Referencia de datos

Los números del juego, tal como están en `src/`. Es una foto del estado actual:
si tocas el equilibrio, actualiza esta tabla o quedará mintiendo.

---

## Modos

| Id | Nombre | Tamaño | Victorias | Tiempo de ronda |
|---|---|---|---|---|
| `duel` | Duelo | 1v1 | 3 | 100 s |
| `duo` | Dúo | 2v2 | 3 | 100 s |
| `squad` | Escuadra | 3v3 | 3 | 110 s |
| `training` | Entrenamiento | 1v1 | — | sin límite |

En entrenamiento los bots reaparecen a los 3 s y el jugador gana energía sola
(14/s) para poder practicar definitivas.

## Dificultades

Parámetros del bot, en `DIFFS`. Cuanto más bajo `react` y `aimErr`, mejor juega.

| Id | Nombre | `react` (s) | `aimErr` (rad) | `dodge` | `aggr` | `exUse` |
|---|---|---|---|---|---|---|
| `easy` | Recluta | 0,42 | 0,30 | 0,18 | 0,55 | 0,15 |
| `normal` | Veterano | 0,24 | 0,17 | 0,42 | 0,75 | 0,40 |
| `hard` | Campeón | 0,13 | 0,085 | 0,68 | 0,90 | 0,70 |
| `elite` | Leyenda | 0,07 | 0,045 | 0,88 | 1,00 | 0,95 |

- `react` — cada cuánto recalcula la puntería, y parte del retardo antes de lanzar.
- `aimErr` — error angular máximo, sorteado en cada recálculo.
- `dodge` — probabilidad de reaccionar a un proyectil entrante que le va a dar.
- `aggr` — cuánto pesa acercarse frente a mantener la distancia.
- `exUse` — con qué frecuencia gasta energía en versiones mejoradas.

## Roles y distancia de combate

`ROLE_RANGE` en `40_ai.js` fija a qué distancia intenta quedarse el bot:

| Rol | Distancia ideal |
|---|---|
| Tirador | 8,6 m |
| Vanguardia | 2,5 m |
| Custodio | 7,4 m |

---

## Campeones

### Vesk, la Cazadora — Tirador

100 de vida · 7,3 de velocidad · ATQ 4 / DEF 2 / MOV 4

| | Habilidad | Recarga | Canal. | Efecto |
|---|---|---|---|---|
| M1 | Virote | 0,5 s | 0,07 s | proyectil, 8 de daño, 38 de velocidad, 26 m |
| M2 | Saeta perforante | 5 s | 0,22 s | 17 de daño, atraviesa · **EX** 21 y raíz 0,8 s |
| SP | Voltereta | 7,5 s | — | 8,4 m, inmune 0,2 s |
| Q | Red de acero | 10 s | 0,2 s | trampa: 6 de daño y raíz 1,4 s · **EX** más ancha y 2,2 s |
| E | Humo cegador | 13 s | 0,12 s | +35 % velocidad 3,2 s, evita un proyectil · **EX** limpia control y cura 14 |
| F | Patada ascendente | 8 s | 0,12 s | 9 de daño, aturde 0,35 s, empuje 13 · **EX** empuje 23 |
| R | Lluvia de saetas | 100 energía | 0,8 s | zona 5,2 m durante 3 s, 6 por tick, 30 % de ralentización |

La patada mejorada existe para tirar gente al vacío; es su mayor amenaza, más
que el daño.

### Brakk, el Yunque — Vanguardia

130 de vida · 7,05 de velocidad · ATQ 3 / DEF 5 / MOV 2

| | Habilidad | Recarga | Canal. | Efecto |
|---|---|---|---|---|
| M1 | Tajo | 0,62 s | 0,1 s | cadena de 3; el tercero pega más y empuja |
| M2 | Onda sísmica | 6 s | 0,18 s | 11 m, atraviesa, 13 de daño y empuje 9 · **EX** aturde 0,55 s |
| SP | Embestida | 7 s | 0,08 s | carga 13 m; al primero: 10 de daño y aturde 0,75 s |
| Q | Golpe sísmico | 7 s | 0,22 s | 12 de daño y 45 % de ralentización alrededor · **EX** empuja hacia fuera |
| E | Fortificar | 12 s | 0,1 s | escudo 38 y −25 % de daño recibido, 4 s · **EX** cura 16 y limpia control |
| F | Garra encadenada | 8,5 s | 0,2 s | 7 de daño y arrastra hacia ti · **EX** raíz 1 s al llegar |
| R | Terremoto | 100 energía | 0,75 s | 28 de daño, aturde 1,2 s, lanza por los aires |

### Lumen, el Custodio — Custodio

105 de vida · 7,0 de velocidad · ATQ 2 / DEF 3 / MOV 3

| | Habilidad | Recarga | Canal. | Efecto |
|---|---|---|---|---|
| M1 | Destello | 0,6 s | 0,08 s | 7 de daño al enemigo **o** 9 de cura al aliado |
| M2 | Aliento sanador | 5,2 s | 0,16 s | cono: 17 a los aliados, 5 a ti · **EX** 27 y limpia control |
| SP | Planear | 7 s | — | 8,6 m y cura 4 |
| Q | Santuario | 14 s | 0,25 s | zona 5,5 s: 4,5/s a aliados, 25 % de ralentización a enemigos · **EX** 7 s y 6,5/s |
| E | Égida | 9 s | 0,12 s | escudo 32 durante 4,5 s a un aliado · **EX** 52 y +20 % de velocidad |
| F | Fulgor | 12 s | 0,15 s | 6 de daño y silencio 1,2 s · **EX** aturde 0,7 s |
| R | Renacer | 100 energía | 0,7 s | cura 42 a todo el equipo, limpia control, +30 % de velocidad |

El único campeón cuyo ataque básico sirve para dos cosas según a quién alcance.

---

## Reliquias

Se elige una entre rondas, en `brite`. Son permanentes durante la partida y se
acumulan.

### Comunes

| Nombre | Efecto |
|---|---|
| Vigor | +18 de vida máxima |
| Zancada | +8 % de velocidad |
| Filo afilado | +18 % de daño con el básico |
| Foco arcano | +12 % de daño con habilidades |
| Manos rápidas | −14 % de recarga |
| Conducto | +30 % de energía generada |
| Coraza | −10 % de daño recibido |

### Raras

| Nombre | Efecto |
|---|---|
| Sanguijuela | te curas el 16 % del daño que causas |
| Impulso | tras desplazarte, +35 % de velocidad 2 s |
| Placa reactiva | al desplazarte, 22 de escudo |
| Tenacidad | el control te dura un 35 % menos |
| Segundo aire | por debajo del 40 % de vida, −22 % de daño recibido |
| Acumulador | empiezas cada ronda con 40 de energía |
| Castigo | +25 % de daño a enemigos por debajo del 35 % de vida |

### Épicas

| Nombre | Efecto | Gancho |
|---|---|---|
| Catalizador | el básico marca; el siguiente golpe de habilidad hace +9 | `dealDamage` |
| Resonancia | la definitiva cuesta 25 menos | `abilityCost` |
| Baluarte | cada 12 s, 26 de escudo | `tickFighter` |
| Eco | al golpear con habilidad, −0,9 s a todas las recargas | `dealDamage` |

Las cuatro épicas son las únicas que **cambian reglas** en vez de mover números,
y cada una necesita su gancho explícito en el camino caliente. Tenlo en cuenta
antes de añadir más de ese tipo.

---

## Constantes de sistema

| Constante | Valor | Dónde |
|---|---|---|
| Arena | 19 × 13 m, esquinas de radio 7,5 | `ARENA`, `10_core.js` |
| Energía por daño causado | 42 % | `dealDamage` |
| Energía por daño recibido | 16 % | `dealDamage` |
| Energía por curación | 30 % | `healTarget` |
| Coste de versión mejorada | 50 | `exCost` en cada habilidad |
| Coste de definitiva | 100 | `cost` |
| Rendimientos decrecientes de control | `[1, .5, .25, 0]`, ventana 6,5 s | `DR_SCALE`, `applyCC` |
| Orbe de energía | centro, cada 24 s | `updateRound` |
| Orbes de vida | dos polos, cada 30 s | `updateRound` |
| Inicio de muerte súbita | `max(30, límite − 55)` s | `updateRound` |
| Encogimiento mínimo | 26 % en 42 s | `G.shrink` |
| Daño fuera del anillo | 9 cada 0,5 s | `tickFighter` |
| Duración de la caída al vacío | 0,55 s | `tickFighter` |

---

## Equilibrio medido

Bots contra bots, 60 rondas, dificultad Campeón. Porcentaje de victoria de la
fila contra la columna:

| | vs Vesk | vs Brakk | vs Lumen |
|---|---|---|---|
| **Vesk** | 50 % | 60 % | 31 % |
| **Brakk** | 40 % | 50 % | 58 % |
| **Lumen** | 69 % | 42 % | 50 % |

Es un triángulo deliberado: el tirador castiga al cuerpo a cuerpo, el cuerpo a
cuerpo rompe al curador, el curador aguanta al tirador.

**Advertencia al leer esta tabla**: mide bots. El bot de Vesk apunta con error y
retardo; un humano no. Vesk rinde bastante más en manos humanas de lo que sugiere
su fila, y es el sesgo que hay que tener presente en cualquier ajuste. Es también
la razón por la que estos números cambiarán cuando haya modo online: el
equilibrio contra humanos es otro problema, y solo se podrá medir con partidas
reales.
