/* ============================ vista: efectos y sonido ============================ */
/* Partículas, números flotantes, síntesis de audio, y el consumidor de la cola
   de eventos. Nada de aquí escribe en el estado de juego.                  */
const FX = [];

/* ============================ efectos ============================ */
function puff(pos, col, n, scale) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry((scale || 1) * frnd(.08, .2), 6, 5), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .9 }));
    m.position.set(pos.x + frnd(-.4, .4), (pos.y || 0) + frnd(.3, 1.5), pos.z + frnd(-.4, .4));
    scene.add(m);
    FX.push({ mesh: m, t: 0, dur: frnd(.3, .7), vy: frnd(1, 4), vx: frnd(-2.5, 2.5), vz: frnd(-2.5, 2.5), kind: 'puff' });
  }
}
function hitFx(x, z, col) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(.34, 8, 6), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .9 }));
  m.position.set(x, 1.0, z);
  scene.add(m);
  FX.push({ mesh: m, t: 0, dur: .2, kind: 'pop' });
}
function ringFx(pos, radius, col) {
  const g = new THREE.RingGeometry(radius * .82, radius, 48);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .85, depthWrite: false, side: THREE.DoubleSide }));
  m.position.set(pos.x, .12, pos.z);
  m.scale.setScalar(.25);
  scene.add(m);
  FX.push({ mesh: m, t: 0, dur: .45, kind: 'ring' });
}
function arcFx(pos, a0, half, range, col) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.absarc(0, 0, range, -half + Math.PI / 2, half + Math.PI / 2, false);
  shape.lineTo(0, 0);
  const g = new THREE.ShapeGeometry(shape, 12);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .45, side: THREE.DoubleSide, depthWrite: false }));
  m.position.set(pos.x, .14, pos.z);
  m.rotation.y = a0 + Math.PI;
  scene.add(m);
  FX.push({ mesh: m, t: 0, dur: .22, kind: 'fade' });
}
function rainFx(x, z, col) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 1.1, 4), new THREE.MeshBasicMaterial({ color: col }));
  m.position.set(x, 7, z);
  scene.add(m);
  FX.push({ mesh: m, t: 0, dur: .5, vy: -18, kind: 'fall' });
}
function updateFx(dt) {
  for (let i = FX.length - 1; i >= 0; i--) {
    const e = FX[i];
    e.t += dt;
    const k = e.t / e.dur;
    if (e.kind === 'puff') {
      e.mesh.position.x += e.vx * dt; e.mesh.position.z += e.vz * dt;
      e.mesh.position.y += (e.vy - k * 6) * dt;
      e.mesh.material.opacity = .9 * (1 - k);
    } else if (e.kind === 'pop') {
      e.mesh.scale.setScalar(1 + k * 2.2);
      e.mesh.material.opacity = .9 * (1 - k);
    } else if (e.kind === 'ring') {
      e.mesh.scale.setScalar(.25 + k * .85);
      e.mesh.material.opacity = .85 * (1 - k);
    } else if (e.kind === 'fade') {
      e.mesh.material.opacity = .45 * (1 - k);
    } else if (e.kind === 'fall') {
      e.mesh.position.y += e.vy * dt;
      if (e.mesh.position.y < .2) e.t = e.dur;
    }
    if (e.t >= e.dur) {
      scene.remove(e.mesh);
      e.mesh.geometry.dispose(); e.mesh.material.dispose();
      FX.splice(i, 1);
    }
  }
}

/* ============================ sonido ============================ */
const SFX = {
  ctx: null, gain: null, on: true,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = .22;
    this.gain.connect(this.ctx.destination);
  },
  tone(f0, f1, dur, type, vol, delay) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + (delay || 0);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol == null ? .5 : vol, t + .008);
    g.gain.exponentialRampToValueAtTime(.0008, t + dur);
    o.connect(g); g.connect(this.gain);
    o.start(t); o.stop(t + dur + .03);
  },
  noise(dur, vol, hp) {
    if (!this.on || !this.ctx) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (frand() * 2 - 1) * (1 - i / n);   /* ruido: presentación */
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 600;
    const g = this.ctx.createGain(); g.gain.value = vol == null ? .3 : vol;
    s.connect(f); f.connect(g); g.connect(this.gain); s.start();
  },
};

function clearFx() {
  for (const e of FX) disposeMesh(e.mesh);
  FX.length = 0;
}

/* ---------- sonidos con nombre ---------- */
/* La simulación pide `sfx('pierce')`, no una frecuencia: los números viven
   aquí, donde se pueden retocar sin tocar un kit de campeón. */
const SOUNDS = {
  shot: s => s.tone(760, 320, .09, 'square', .18),
  hit: s => { s.tone(200, 90, .12, 'sawtooth', .22); s.noise(.07, .12, 900); },
  big: s => { s.tone(160, 48, .34, 'sawtooth', .3); s.noise(.2, .2, 300); },
  heal: s => s.tone(520, 880, .2, 'sine', .2),
  dash: s => s.noise(.18, .16, 1400),
  cast: s => s.tone(300, 620, .12, 'triangle', .15),
  ult: s => { s.tone(120, 500, .5, 'sawtooth', .28); s.tone(240, 1000, .5, 'square', .12, .05); },
  die: s => s.tone(300, 60, .5, 'sawtooth', .26),
  orb: s => s.tone(660, 1320, .16, 'sine', .2),
  round: s => { s.tone(392, 392, .16, 'triangle', .26); s.tone(523, 523, .16, 'triangle', .26, .16); s.tone(784, 784, .3, 'triangle', .3, .32); },
  win: s => [523, 659, 784, 1046].forEach((f, i) => s.tone(f, f, .3, 'triangle', .26, i * .12)),
  lose: s => [440, 370, 294, 220].forEach((f, i) => s.tone(f, f, .34, 'sine', .24, i * .14)),
  tick: s => s.tone(900, 900, .06, 'square', .14),
  go: s => s.tone(660, 990, .3, 'triangle', .3),
  sudden: s => s.tone(220, 110, .7, 'sawtooth', .3),
  // habilidades
  pierce: s => s.tone(520, 200, .18, 'sawtooth', .22),
  smoke: s => s.noise(.3, .18, 400),
  slash: s => s.tone(380, 150, .1, 'square', .18),
  slash3: s => s.tone(260, 150, .1, 'square', .18),
  charge: s => s.tone(140, 300, .3, 'sawtooth', .22),
  fortify: s => s.tone(180, 420, .25, 'triangle', .2),
  chain: s => s.tone(420, 180, .2, 'square', .18),
  sanctuary: s => s.tone(440, 660, .3, 'sine', .2),
  aegis: s => s.tone(300, 700, .22, 'sine', .2),
  flare: s => s.tone(880, 1400, .16, 'sine', .2)
};
function playSound(id) {
  const fn = SOUNDS[id];
  if (fn) fn(SFX);
}

/* ============================ la cola de eventos ============================ */
/* El único sitio donde lo que ocurrió en la simulación se convierte en algo que
   se ve o se oye. Los eventos traen ids y números; los nombres, los colores y
   las palabras se resuelven aquí. Lo que es de interfaz se delega en uiEvent.

   Cuando exista el modo online, esta misma función consumirá los eventos que
   lleguen por la red sin cambiar una línea. */
const CC_WORD = { stun: 'Aturdido', root: 'Raíz', silence: 'Silencio', immune: 'Inmune' };

function drainEvents() {
  for (const ev of G.events) {
    switch (ev.e) {
      case 'sfx': playSound(ev.id); break;
      case 'num': floatNum(ev, ev.text, ev.cls); break;
      case 'hit': hitFx(ev.x, ev.z, ev.col); break;
      case 'puff': puff(ev, ev.col, ev.n, ev.scale); break;
      case 'ring': ringFx(ev, ev.radius, ev.col); break;
      case 'arc': arcFx(ev, ev.a0, ev.half, ev.range, ev.col); break;
      case 'shake': shake(ev.a); break;
      case 'clearFx': clearFx(); break;

      case 'dmg': {
        floatNum(ev, Math.round(ev.dmg), ev.dmg >= 18 ? 'crit' : 'dmg');
        const me = G.player ? G.player.uid : 0;
        if (me && (ev.id === me || ev.byId === me)) playSound('hit');
        break;
      }
      case 'heal': floatNum(ev, '+' + ev.amount, 'heal'); break;
      case 'cc': floatNum(ev, CC_WORD[ev.type] || ev.type, 'en'); break;
      case 'evade': floatNum(ev, 'Evadido', 'en'); break;

      case 'kill': {
        const f = fighterById(ev.id), who = fighterById(ev.byId);
        if (f) { puff(f.pos, TEAM_COL[f.team], 26); playSound('die'); }
        if (ev.first && who) feed(`${nameTag(who)} abre el marcador`);
        feed(who && f ? `${nameTag(who)} elimina a ${nameTag(f)}`
          : f ? `${nameTag(f)} cae al vacío` : '');
        if (f && f === G.player) shake(.7);
        break;
      }
      case 'orb': {
        playSound('orb');
        if (ev.kind === 'energy') {
          const f = fighterById(ev.byId);
          if (f) floatNum(f.pos, '+38 energía', 'en');
        }
        break;
      }

      default: uiEvent(ev);
    }
  }
  G.events.length = 0;
}

function nameTag(f) { return `<b class="${f.team ? 'b' : 'a'}">${f.name}</b>`; }
