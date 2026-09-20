/* ============================ campeones ============================ */
/* Cada kit: M1 básico · M2/Q/E/F habilidades (versión mejorada con Shift) ·
   Espacio desplazamiento · R definitiva (100 de energía).

   Aquí solo hay reglas y números: nada de mallas ni de audio. Las mallas de
   cada campeón viven en 60_view.js (`CHAMP_MESH`) y los sonidos salen como
   eventos `sfx('nombre')` que 70_fx.js traduce a osciladores.              */

const CHAMPS = {
  /* ------------------------------------------------ VESK ------------- */
  vesk: {
    id: 'vesk', name: 'Vesk', title: 'la Cazadora', role: 'Tirador', glyph: '🏹',
    color: 0x5ddba6, hp: 100, speed: 7.3, stats: { atk: 4, def: 2, mob: 4 },
    blurb: 'Castiga a distancia y rompe la formación con trampas y patadas al vacío.',
    ab: [
      {
        k: 'M1', n: 'Virote', g: '🏹', cd: .5, wind: .07, hold: true,
        d: 'Dispara un virote rápido. 8 de daño.',
        act(f, o) { shoot(f, { dir: o.aim, speed: 38, dmg: 8, radius: .3, range: 26, color: 0xbff3d6, kb: 1.4 }); sfx('shot'); }
      },
      {
        k: 'M2', n: 'Saeta perforante', g: '🎯', cd: 5, wind: .22, exCost: 50,
        d: 'Saeta pesada que atraviesa a todos los enemigos. 17 de daño.',
        dx: 'Mejorada: 21 de daño y enraíza 0,8 s.',
        act(f, o) {
          shoot(f, {
            dir: o.aim, speed: 31, dmg: o.ex ? 21 : 17, radius: .45, range: 28, pierce: true,
            color: o.ex ? 0xffe27a : 0x9ef0c4, kb: 2, cc: o.ex ? 'root' : null, ccT: .8, scale: 1.5
          });
          sfx('pierce');
        }
      },
      {
        k: 'SP', n: 'Voltereta', g: '🌀', cd: 7.5, wind: 0, dashAb: true,
        d: 'Rueda 8 m en la dirección de movimiento. Inmune mientras ruedas.',
        act(f, o) { startDash(f, { dir: o.move || o.aim, dist: 8.4, dur: .26, invuln: .2 }); sfx('dash'); }
      },
      {
        k: 'Q', n: 'Red de acero', g: '🕸️', cd: 10, wind: .2, exCost: 50, ground: 13,
        d: 'Coloca una trampa. El primer enemigo que la pisa queda enraizado 1,4 s y recibe 6.',
        dx: 'Mejorada: trampa más amplia y 2,2 s de raíz.',
        act(f, o) {
          spawnZone(f, {
            x: o.pt.x, z: o.pt.z, radius: o.ex ? 3.3 : 2.6, dur: 9, delay: .45, trap: true,
            color: 0x9ef0c4, dmg: 6, cc: 'root', ccT: o.ex ? 2.2 : 1.4
          });
          sfx('cast');
        }
      },
      {
        k: 'E', n: 'Humo cegador', g: '💨', cd: 13, wind: .12, exCost: 50, self: true,
        d: 'Te envuelves en humo: +35 % de velocidad 3,2 s y evitas el próximo proyectil.',
        dx: 'Mejorada: además te libera de control y cura 14.',
        act(f, o) {
          buff(f, { haste: .35, hasteT: 3.2, evade: 3.2, cleanse: o.ex, heal: o.ex ? 14 : 0 });
          fxPuff(f.pos, 0x9fb0c8, 22);
          sfx('smoke');
        }
      },
      {
        k: 'F', n: 'Patada ascendente', g: '🦵', cd: 8, wind: .12, exCost: 50,
        d: 'Patada frontal: 9 de daño, aturde 0,35 s y empuja lejos.',
        dx: 'Mejorada: empuje mucho mayor. Perfecta para lanzar al vacío.',
        act(f, o) {
          meleeArc(f, { dir: o.aim, range: 3.6, arc: 85, dmg: 9, kb: o.ex ? 23 : 13, cc: 'stun', ccT: o.ex ? .6 : .35, color: 0xd8ffe9 });
          sfx('hit');
        }
      },
      {
        k: 'R', n: 'Lluvia de saetas', g: '🌧️', cd: 3, wind: .8, cost: 100, ground: 15, ult: true,
        d: 'Definitiva: una tormenta de saetas cae sobre la zona durante 3 s, dañando y ralentizando.',
        act(f, o) {
          spawnZone(f, {
            x: o.pt.x, z: o.pt.z, radius: 5.2, dur: 3, tick: .32, tickDmg: 6,
            slow: .3, color: 0x7de0b0, rain: true
          });
          sfx('ult');
        }
      }
    ]
  },

  /* ------------------------------------------------ BRAKK ------------ */
  brakk: {
    id: 'brakk', name: 'Brakk', title: 'el Yunque', role: 'Vanguardia', glyph: '⚔️',
    color: 0xd98b4a, hp: 130, speed: 7.05, stats: { atk: 3, def: 5, mob: 2 },
    blurb: 'Aguanta el castigo, descoloca al enemigo y lo arrastra donde quiere pelear.',
    ab: [
      {
        k: 'M1', n: 'Tajo', g: '⚔️', cd: .62, wind: .1, hold: true, combo: 3,
        d: 'Cadena de tres tajos. El tercero golpea más fuerte y empuja.',
        act(f, o) {
          const third = f.combo === 2;
          meleeArc(f, { dir: o.aim, range: 3.5, arc: 115, dmg: third ? 16 : 9, kb: third ? 7 : 1.5, color: 0xffcf9a });
          sfx(third ? 'slash3' : 'slash');
        }
      },
      {
        k: 'M2', n: 'Onda sísmica', g: '💥', cd: 6, wind: .18, exCost: 50,
        d: 'Onda ancha de 11 m que atraviesa: 13 de daño y empuja.',
        dx: 'Mejorada: además aturde 0,55 s.',
        act(f, o) {
          shoot(f, {
            dir: o.aim, speed: 26, dmg: 13, radius: 1.25, range: 11, pierce: true, kb: 9,
            cc: o.ex ? 'stun' : null, ccT: .55, color: o.ex ? 0xffd37a : 0xffa35c, scale: 2.4, flat: true
          });
          sfx('big'); fxShake(.25);
        }
      },
      {
        k: 'SP', n: 'Embestida', g: '🐗', cd: 7, wind: .08, dashAb: true,
        d: 'Cargas 13 m. Al primer enemigo: 10 de daño y aturde 0,75 s.',
        act(f, o) {
          startDash(f, { dir: o.move || o.aim, dist: 13, dur: .36, dmg: 10, cc: 'stun', ccT: .75, stopOnHit: true, trail: 0xffa35c });
          sfx('charge');
        }
      },
      {
        k: 'Q', n: 'Golpe sísmico', g: '💢', cd: 7, wind: .22, exCost: 50,
        d: 'Golpea el suelo: 12 de daño y 45 % de ralentización a tu alrededor.',
        dx: 'Mejorada: además empuja hacia fuera.',
        act(f, o) {
          radial(f, { radius: 4.6, dmg: 12, slow: .45, slowT: 2.2, kb: o.ex ? 10 : 0, color: 0xffa35c });
          fxRing(f.pos, 4.6, 0xffa35c);
          sfx('big'); fxShake(.3);
        }
      },
      {
        k: 'E', n: 'Fortificar', g: '🛡️', cd: 12, wind: .1, exCost: 50, self: true,
        d: 'Escudo de 38 y 25 % menos daño durante 4 s.',
        dx: 'Mejorada: cura 16 y te libera de control.',
        act(f, o) {
          buff(f, { shield: 38, dr: .25, drT: 4, heal: o.ex ? 16 : 0, cleanse: o.ex });
          sfx('fortify');
        }
      },
      {
        k: 'F', n: 'Garra encadenada', g: '⛓️', cd: 8.5, wind: .2, exCost: 50,
        d: 'Lanza una cadena: 7 de daño y arrastra al enemigo hacia ti.',
        dx: 'Mejorada: además lo enraíza 1 s al llegar.',
        act(f, o) {
          shoot(f, {
            dir: o.aim, speed: 30, dmg: 7, radius: .45, range: 15, color: 0xcfcfcf, chain: true,
            pull: 1, cc: o.ex ? 'root' : null, ccT: 1
          });
          sfx('chain');
        }
      },
      {
        k: 'R', n: 'Terremoto', g: '🌋', cd: 3, wind: .75, cost: 100, ult: true,
        d: 'Definitiva: parte el suelo. 28 de daño, aturde 1,2 s y lanza por los aires a todos los enemigos cercanos.',
        act(f, o) {
          radial(f, { radius: 7.2, dmg: 28, cc: 'stun', ccT: 1.2, kb: 9, color: 0xff7a28 });
          fxRing(f.pos, 7.2, 0xff7a28);
          sfx('ult'); fxShake(1.1);
        }
      }
    ]
  },

  /* ------------------------------------------------ LUMEN ------------ */
  lumen: {
    id: 'lumen', name: 'Lumen', title: 'el Custodio', role: 'Custodio', glyph: '✨',
    color: 0x7fb6ff, hp: 105, speed: 7.0, stats: { atk: 2, def: 3, mob: 3 },
    blurb: 'Mantiene al equipo en pie: cura, escuda y silencia al que se pasa de listo.',
    ab: [
      {
        k: 'M1', n: 'Destello', g: '✨', cd: .6, wind: .08, hold: true,
        d: 'Proyectil de luz: 7 de daño al enemigo, o 9 de curación si alcanza a un aliado.',
        act(f, o) { shoot(f, { dir: o.aim, speed: 31, dmg: 7, healAlly: 9, radius: .34, range: 24, color: 0xbfe0ff }); sfx('shot'); }
      },
      {
        k: 'M2', n: 'Aliento sanador', g: '🌿', cd: 5.2, wind: .16, exCost: 50,
        d: 'Cono de luz: cura 17 a los aliados alcanzados y 5 a ti.',
        dx: 'Mejorada: cura 27 y libera de efectos de control.',
        act(f, o) {
          coneHeal(f, { dir: o.aim, range: 7.5, arc: 72, heal: o.ex ? 27 : 17, selfHeal: 5, cleanse: o.ex });
          sfx('heal');
        }
      },
      {
        k: 'SP', n: 'Planear', g: '🕊️', cd: 7, wind: 0, dashAb: true,
        d: 'Te deslizas 8,6 m y te curas 4.',
        act(f, o) { startDash(f, { dir: o.move || o.aim, dist: 8.6, dur: .28, invuln: .12 }); healTarget(f, f, 4); sfx('dash'); }
      },
      {
        k: 'Q', n: 'Santuario', g: '💚', cd: 14, wind: .25, exCost: 50, ground: 13,
        d: 'Zona sagrada 5,5 s: cura 4,5/s a los aliados dentro y ralentiza 25 % a los enemigos.',
        dx: 'Mejorada: dura 7 s y cura 6,5/s.',
        act(f, o) {
          spawnZone(f, {
            x: o.pt.x, z: o.pt.z, radius: 4.1, dur: o.ex ? 7 : 5.5, tick: 1,
            tickHeal: o.ex ? 6.5 : 4.5, slow: .25, color: 0x7ef0b4, friendly: true
          });
          sfx('sanctuary');
        }
      },
      {
        k: 'E', n: 'Égida', g: '🔰', cd: 9, wind: .12, exCost: 50,
        d: 'Escudo de 32 durante 4,5 s al aliado que apuntas (o a ti).',
        dx: 'Mejorada: escudo de 52 y +20 % de velocidad.',
        act(f, o) {
          const t = allyNear(f, o.pt, 13) || f;
          buff(t, { shield: o.ex ? 52 : 32, shieldT: 4.5, haste: o.ex ? .2 : 0, hasteT: 3 });
          fxRing(t.pos, 1.3, 0xbfe0ff);
          sfx('aegis');
        }
      },
      {
        k: 'F', n: 'Fulgor', g: '🔆', cd: 12, wind: .15, exCost: 50,
        d: 'Destello cegador: 6 de daño y silencia 1,2 s.',
        dx: 'Mejorada: además aturde 0,7 s.',
        act(f, o) {
          shoot(f, {
            dir: o.aim, speed: 34, dmg: 6, radius: .5, range: 18, color: 0xfff3c0,
            cc: o.ex ? 'stun' : 'silence', ccT: o.ex ? .7 : 1.2, cc2: o.ex ? 'silence' : null, cc2T: 1.2
          });
          sfx('flare');
        }
      },
      {
        k: 'R', n: 'Renacer', g: '🌟', cd: 3, wind: .7, cost: 100, ult: true,
        d: 'Definitiva: una oleada de luz cura 42 a todo tu equipo, lo libera de control y le da +30 % de velocidad.',
        act(f, o) {
          for (const a of G.fighters) {
            if (a.team !== f.team || !a.alive) continue;
            if (dist(a.pos.x, a.pos.z, f.pos.x, f.pos.z) > 9) continue;
            healTarget(f, a, 42);
            buff(a, { cleanse: true, haste: .3, hasteT: 3 });
          }
          fxRing(f.pos, 9, 0xbfe0ff);
          sfx('ult');
        }
      }
    ]
  }
};
const CHAMP_LIST = ['vesk', 'brakk', 'lumen'];

/* ============================ reliquias (mejoras) ============================ */
/* Se elige una antes de cada ronda; son permanentes durante el combate. */
const RELICS = [
  { id: 'vigor', n: 'Vigor', r: 'com', rune: '❤', d: '+18 de vida máxima.', ap: f => { f.maxHp += 18; f.hp += 18; } },
  { id: 'zancada', n: 'Zancada', r: 'com', rune: '🌬', d: '+8 % de velocidad de movimiento.', ap: f => { f.mods.speed += .08; } },
  { id: 'filo', n: 'Filo afilado', r: 'com', rune: '🗡', d: '+18 % de daño con el ataque básico.', ap: f => { f.mods.m1Dmg += .18; } },
  { id: 'arcano', n: 'Foco arcano', r: 'com', rune: '🔮', d: '+12 % de daño con habilidades.', ap: f => { f.mods.abDmg += .12; } },
  { id: 'prisa', n: 'Manos rápidas', r: 'com', rune: '⏱', d: '−14 % de tiempo de recarga.', ap: f => { f.mods.cdr += .14; } },
  { id: 'conducto', n: 'Conducto', r: 'com', rune: '⚡', d: '+30 % de energía generada.', ap: f => { f.mods.energy += .3; } },
  { id: 'coraza', n: 'Coraza', r: 'com', rune: '🛡', d: 'Recibes un 10 % menos de daño.', ap: f => { f.mods.dr += .1; } },
  { id: 'sanguijuela', n: 'Sanguijuela', r: 'rare', rune: '🩸', d: 'Te curas el 16 % del daño que causas.', ap: f => { f.mods.lifesteal += .16; } },
  { id: 'impulso', n: 'Impulso', r: 'rare', rune: '💨', d: 'Tras desplazarte: +35 % de velocidad 2 s.', ap: f => { f.mods.dashHaste = true; } },
  { id: 'reactivo', n: 'Placa reactiva', r: 'rare', rune: '✚', d: 'Al desplazarte ganas 22 de escudo.', ap: f => { f.mods.dashShield = 22; } },
  { id: 'tenacidad', n: 'Tenacidad', r: 'rare', rune: '⛓', d: 'Los efectos de control te duran un 35 % menos.', ap: f => { f.mods.tenacity += .35; } },
  { id: 'segundoaire', n: 'Segundo aire', r: 'rare', rune: '🌀', d: 'Por debajo del 40 % de vida recibes un 22 % menos de daño.', ap: f => { f.mods.lowHpDr = .22; } },
  { id: 'acumulador', n: 'Acumulador', r: 'rare', rune: '🔋', d: 'Empiezas cada ronda con 40 de energía.', ap: f => { f.mods.startEnergy += 40; } },
  { id: 'castigo', n: 'Castigo', r: 'rare', rune: '🎯', d: '+25 % de daño a enemigos por debajo del 35 % de vida.', ap: f => { f.mods.execute += .25; } },
  { id: 'catalizador', n: 'Catalizador', r: 'epic', rune: '🔥', d: 'Tu ataque básico marca: el siguiente golpe de habilidad hace +9.', ap: f => { f.mods.mark = 9; } },
  { id: 'resonancia', n: 'Resonancia', r: 'epic', rune: '🌟', d: 'La definitiva cuesta 25 menos.', ap: f => { f.mods.ultCost += 25; } },
  { id: 'baluarte', n: 'Baluarte', r: 'epic', rune: '💎', d: 'Cada 12 s ganas 26 de escudo automáticamente.', ap: f => { f.mods.autoShield = 12; } },
  { id: 'eco', n: 'Eco', r: 'epic', rune: '♾', d: 'Al golpear con una habilidad reduces 0,9 s todas tus recargas.', ap: f => { f.mods.echo = .9; } }
];
const RELIC_TAG = { com: 'Reliquia común', rare: 'Reliquia rara', epic: 'Reliquia épica' };
