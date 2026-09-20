/* ============================ interfaz ============================ */
const KEYLBL = { M1: 'Clic', M2: 'Der.', SP: 'Esp', Q: 'Q', E: 'E', F: 'F', R: 'R' };
const UI = {};
let plateHost, numPool = [];
/* Las placas y los marcos son elementos del DOM, así que viven aquí en
   mapas por id, nunca colgados del luchador. */
const PLATE = new Map(), FRAME = new Map();
let announceT = 0;

function initUI() {
  UI.hud = $('hud'); UI.world = $('world');
  plateHost = $('world');
  $('buildline').textContent = 'Prototipo · tres campeones · bots';

  // menú principal
  $('go-play').onclick = () => { SFX.init(); showScreen('scr-setup'); };
  $('go-help').onclick = () => showScreen('scr-help');
  $('help-back').onclick = () => showScreen(G.state === 'title' ? 'scr-title' : 'scr-title');
  $('setup-back').onclick = () => showScreen('scr-title');
  $('setup-start').onclick = () => { SFX.init(); startMatch(); };
  $('result-again').onclick = () => { showScreen('scr-setup'); };
  $('result-menu').onclick = () => { showScreen('scr-title'); };
  $('pause-resume').onclick = () => togglePause();
  $('pause-quit').onclick = () => { quitMatch(); showScreen('scr-title'); };
  $('pausebtn').onclick = () => togglePause();

  // opciones
  const modeBox = $('opt-mode');
  for (const id of ['duel', 'duo', 'squad', 'training']) {
    const m = MODES[id];
    const b = el('button', 'opt', `${m.name}<small>${m.sub}</small>`);
    b.onclick = () => { SEL.mode = id; syncOpts(); };
    b.dataset.v = id;
    modeBox.appendChild(b);
  }
  const diffBox = $('opt-diff');
  for (const id of ['easy', 'normal', 'hard', 'elite']) {
    const b = el('button', 'opt', DIFFS[id].name);
    b.onclick = () => { SEL.diff = id; syncOpts(); };
    b.dataset.v = id;
    diffBox.appendChild(b);
  }
  const roster = $('roster');
  for (const id of CHAMP_LIST) {
    const C = CHAMPS[id];
    const b = el('button', 'champ');
    b.dataset.v = id;
    b.innerHTML = `
      <div class="head">
        <div class="sig" style="background:#${C.color.toString(16).padStart(6, '0')}">${C.glyph}</div>
        <div><h3>${C.name}</h3><div class="role">${C.title} · ${C.role}</div></div>
      </div>
      <p class="blurb">${C.blurb}</p>
      <div class="kit">${C.ab.map(a => `<span title="${a.n}">${a.g}</span>`).join('')}</div>
      <div class="stats"><span>Daño <b>${'▪'.repeat(C.stats.atk)}</b></span><span>Aguante <b>${'▪'.repeat(C.stats.def)}</b></span><span>Movilidad <b>${'▪'.repeat(C.stats.mob)}</b></span></div>`;
    b.onclick = () => { SEL.champ = id; syncOpts(); };
    roster.appendChild(b);
  }
  syncOpts();

  // atajos en la pausa
  $('pause-keys').innerHTML = `
    <b>WASD</b><span>Moverte</span>
    <b>Ratón</b><span>Apuntar</span>
    <b>Clic · Der. · Q · E · F</b><span>Habilidades</span>
    <b>Espacio</b><span>Desplazamiento</span>
    <b>R</b><span>Definitiva</span>
    <b>Shift + habilidad</b><span>Versión mejorada (50 energía)</span>`;
}

function syncOpts() {
  for (const b of document.querySelectorAll('#opt-mode .opt')) b.setAttribute('aria-pressed', b.dataset.v === SEL.mode);
  for (const b of document.querySelectorAll('#opt-diff .opt')) b.setAttribute('aria-pressed', b.dataset.v === SEL.diff);
  for (const b of document.querySelectorAll('#roster .champ')) b.setAttribute('aria-pressed', b.dataset.v === SEL.champ);
}

function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
  const inMatch = id === null;
  UI.hud.classList.toggle('hidden', !!id);
  $('touch').classList.toggle('hidden', !!id || !Input.touch);
  if (id === 'scr-title') { G.state = 'title'; quitMatch(); }
  if (id === 'scr-setup') G.state = 'setup';
}
function hideScreens() { for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden'); UI.hud.classList.remove('hidden'); if (Input.touch) $('touch').classList.remove('hidden'); }

/* ---------- avisos y registro ---------- */
function announce(big, sub, dur) {
  const a = $('announce');
  a.innerHTML = `<div class="big pop">${big}</div>${sub ? `<div class="sub pop">${sub}</div>` : ''}`;
  announceT = dur || 1.6;
}
function clearAnnounce() { $('announce').innerHTML = ''; }
function feed(html) {
  const box = $('feed');
  const d = el('div', 'fe', html);
  box.appendChild(d);
  while (box.children.length > 4) box.removeChild(box.firstChild);
  setTimeout(() => d.remove(), 4200);
}

/* ---------- números flotantes ---------- */
function floatNum(pos, text, cls) {
  const d = numPool.pop() || el('div', 'fnum');
  d.className = 'fnum ' + (cls || 'dmg');
  d.textContent = text;
  d.style.opacity = '1';
  plateHost.appendChild(d);
  const p = { el: d, x: pos.x + frnd(-.4, .4), y: 1.9, z: pos.z + frnd(-.3, .3), t: 0, vy: 2.1 };
  FLOATS.push(p);
}
const FLOATS = [];
function updateFloats(dt) {
  for (let i = FLOATS.length - 1; i >= 0; i--) {
    const p = FLOATS[i];
    p.t += dt; p.y += p.vy * dt; p.vy -= dt * 2.4;
    tmpV.set(p.x, p.y, p.z).project(camera);
    p.el.style.transform = `translate(${(tmpV.x * .5 + .5) * window.innerWidth}px,${(-tmpV.y * .5 + .5) * window.innerHeight}px) translate(-50%,-50%) scale(${1 + Math.max(0, .25 - p.t) * 2})`;
    p.el.style.opacity = String(clamp(1 - (p.t - .5) / .5, 0, 1));
    if (p.t > 1.1) { p.el.remove(); numPool.push(p.el); FLOATS.splice(i, 1); }
  }
}

/* ---------- placas sobre los personajes ---------- */
function makePlate(f) {
  const d = el('div', 'plate' + (f.team === G.playerTeam ? '' : ' foe'));
  d.innerHTML = `<div class="cc"></div><div class="nm">${f.name}</div>
    <div class="bar"><i class="sh"></i><i class="hp"></i></div>
    <div class="cast"><i></i></div>`;
  d.q = { cc: d.querySelector('.cc'), hp: d.querySelector('.hp'), sh: d.querySelector('.sh'), cast: d.querySelector('.cast'), castI: d.querySelector('.cast i') };
  plateHost.appendChild(d);
  PLATE.set(f.uid, d);
}
function updatePlates() {
  for (const f of G.fighters) {
    const d = PLATE.get(f.uid), m = VIEW.fighter.get(f.uid);
    if (!d || !m) continue;
    if (!f.alive) { d.style.display = 'none'; continue; }
    d.style.display = '';
    // la placa sigue a la malla, que ya está interpolada, no al último paso
    tmpV.set(m.position.x, 2.35, m.position.z).project(camera);
    d.style.transform = `translate(${(tmpV.x * .5 + .5) * window.innerWidth}px,${(-tmpV.y * .5 + .5) * window.innerHeight}px) translate(-50%,-100%)`;
    d.q.hp.style.transform = `scaleX(${clamp(f.hp / f.maxHp, 0, 1)})`;
    d.q.sh.style.transform = `scaleX(${clamp(f.shield / f.maxHp, 0, 1)})`;
    d.q.sh.style.opacity = f.shield > 0 ? '1' : '0';
    const cc = f.st.stun > 0 ? 'Aturdido' : f.st.root > 0 ? 'Raíz' : f.st.silence > 0 ? 'Silencio' : f.st.invuln > 0 ? 'Inmune' : '';
    if (d.q.cc.textContent !== cc) d.q.cc.textContent = cc;
    if (f.casting) {
      d.q.cast.style.visibility = 'visible';
      d.q.castI.style.transform = `scaleX(${f.casting.t / f.casting.dur})`;
    } else d.q.cast.style.visibility = 'hidden';
  }
}

/* ---------- barra de habilidades ---------- */
function buildAbilityBar(C) {
  const wrap = $('abilities');
  wrap.innerHTML = '';
  C.ab.forEach((ab, i) => {
    const b = el('button', 'slot ready');
    b.innerHTML = `<span class="gl">${ab.g}</span><span class="kb">${KEYLBL[ab.k]}</span><span class="ex">EX</span>
      <span class="sweep"></span><span class="cdn"></span>
      <span class="tip"><h5>${ab.n}${ab.cost ? ' · 100 energía' : ''}</h5><p>${ab.d}</p>${ab.dx ? `<p class="exline">Shift · ${ab.dx}</p>` : ''}</span>`;
    b.addEventListener('pointerdown', e => { e.preventDefault(); Input.queued = { i, ex: Input.shift }; });
    wrap.appendChild(b);
    b.q = { sweep: b.querySelector('.sweep'), cdn: b.querySelector('.cdn') };
  });
  UI.slots = [...wrap.children];

  // botones táctiles (sin el básico, que va en el joystick derecho)
  const tb = $('tbtns');
  tb.innerHTML = '';
  UI.tbtns = [];
  [1, 3, 4, 2, 5, 6].forEach(i => {
    const ab = C.ab[i];
    const b = el('button', 'tb', `${ab.g}<u>${KEYLBL[ab.k]}</u><i></i>`);
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Input.queued = { i, ex: Input.exMode }; Input.exMode = false; syncEx(); });
    b.addEventListener('pointerup', e => e.stopPropagation());
    tb.appendChild(b);
    UI.tbtns.push({ el: b, i, i2: b.querySelector('i') });
  });
  // interruptor de versión mejorada para móvil
  const exb = el('button', 'tb exb', 'EX<u>50</u>');
  exb.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Input.exMode = !Input.exMode; syncEx(); });
  tb.appendChild(exb);
  UI.exb = exb;
  syncEx();
}

function syncEx() { if (UI.exb) UI.exb.classList.toggle('on', !!Input.exMode); }

function buildTeamFrames() {
  for (const side of ['a', 'b']) $('tf-' + side).innerHTML = '';
  for (const f of G.fighters) {
    const mine = f.team === G.playerTeam;
    const host = $(mine ? 'tf-a' : 'tf-b');
    const d = el('div', 'frame ' + (f.team ? 'b' : 'a'));
    d.innerHTML = `<div class="por">${f.champ.glyph}</div>
      <div class="meta"><div class="nm"><span>${f.name}</span><span class="hpn">100</span></div>
      <div class="hpb"><i class="sh"></i><i class="hp"></i></div><div class="enb"><i></i></div></div>`;
    d.q = { hp: d.querySelector('.hp'), sh: d.querySelector('.sh'), en: d.querySelector('.enb i'), n: d.querySelector('.hpn') };
    host.appendChild(d);
    FRAME.set(f.uid, d);
  }
  for (const side of ['a', 'b']) {
    const box = $('pips-' + side);
    box.innerHTML = '';
    const pips = G.mode && G.mode.id === 'training' ? 0 : Math.min(G.wins, 5);
    for (let i = 0; i < pips; i++) box.appendChild(el('div', 'pip'));
  }
}

function updateHUD() {
  const f = G.player;
  if (!f) return;
  const hpr = clamp(f.hp / f.maxHp, 0, 1);
  $('hp-fill').style.transform = `scaleX(${hpr})`;
  $('sh-fill').style.transform = `scaleX(${clamp((f.hp + f.shield) / f.maxHp, 0, 1)})`;
  $('hp-text').textContent = f.shield > 0 ? `${Math.max(0, Math.ceil(f.hp))} +${Math.ceil(f.shield)}` : Math.max(0, Math.ceil(f.hp));
  const en = f.energy / 100;
  $('en-fill').style.transform = `scaleX(${en})`;
  $('enwrap').classList.toggle('full', f.energy >= 100 - (f.mods.ultCost || 0));

  for (let i = 0; i < UI.slots.length; i++) {
    const b = UI.slots[i], ab = f.champ.ab[i];
    const max = Math.max(.15, ab.cd * (1 - f.mods.cdr));
    const cd = f.cds[i];
    b.q.sweep.style.setProperty('--p', cd > 0 ? (cd / max).toFixed(3) : 0);
    const txt = cd > 0.05 ? (cd < 1 ? cd.toFixed(1) : Math.ceil(cd)) : '';
    if (b.q.cdn.textContent !== String(txt)) b.q.cdn.textContent = txt;
    const cost = abilityCost(f, ab);
    const usable = cd <= 0 && f.energy >= cost && f.st.silence <= 0;
    b.classList.toggle('locked', !usable);
    b.classList.toggle('ready', usable && !ab.ult);
    b.classList.toggle('ultready', !!ab.ult && usable);
    b.classList.toggle('exok', !!ab.exCost && f.energy >= ab.exCost + cost && cd <= 0);
    b.classList.toggle('armed', !!ab.exCost && Input.shift && f.energy >= ab.exCost && cd <= 0);
  }
  if (UI.tbtns) for (const t of UI.tbtns) {
    const ab = f.champ.ab[t.i];
    const max = Math.max(.15, ab.cd * (1 - f.mods.cdr));
    t.i2.style.setProperty('--p', f.cds[t.i] > 0 ? (f.cds[t.i] / max).toFixed(3) : 0);
    t.el.classList.toggle('ultready', !!ab.ult && f.cds[t.i] <= 0 && f.energy >= abilityCost(f, ab));
  }

  for (const o of G.fighters) {
    const d = FRAME.get(o.uid);
    if (!d) continue;
    d.classList.toggle('dead', !o.alive);
    d.classList.toggle('ult', o.alive && o.energy >= 100 - (o.mods.ultCost || 0));
    d.q.hp.style.transform = `scaleX(${clamp(o.hp / o.maxHp, 0, 1)})`;
    d.q.sh.style.transform = `scaleX(${clamp((o.hp + o.shield) / o.maxHp, 0, 1)})`;
    d.q.sh.style.opacity = o.shield > 0 ? '1' : '0';
    d.q.en.style.transform = `scaleX(${o.energy / 100})`;
    const n = Math.max(0, Math.ceil(o.hp));
    if (d.q.n.textContent !== String(n)) d.q.n.textContent = n;
  }

  // reloj
  const left = Math.max(0, G.roundLimit - G.roundTime);
  const mm = Math.floor(left / 60), ss = Math.floor(left % 60);
  $('timer').textContent = G.mode.id === 'training' ? '∞' : `${mm}:${ss < 10 ? '0' : ''}${ss}`;
  $('clock').classList.toggle('urgent', G.sudden);
  $('modelabel').textContent = G.sudden ? 'Muerte súbita' : G.mode.name;

  // estados
  const bb = $('buffs');
  const tags = [];
  if (f.st.stun > 0) tags.push(['Aturdido', 'bad']);
  if (f.st.root > 0) tags.push(['Enraizado', 'bad']);
  if (f.st.silence > 0) tags.push(['Silenciado', 'bad']);
  if (f.st.slowAmt > 0) tags.push(['Ralentizado', 'bad']);
  if (f.st.hasteAmt > 0) tags.push(['Veloz', 'good']);
  if (f.shield > 0) tags.push(['Escudo', 'good']);
  if (f.st.drAmt > 0) tags.push(['Fortificado', 'good']);
  if (f.st.evade > 0) tags.push(['Evasión', 'good']);
  if (f.st.invuln > 0) tags.push(['Inmune', 'good']);
  const key = tags.map(t => t[0]).join('|');
  if (bb.dataset.k !== key) {
    bb.dataset.k = key;
    bb.innerHTML = tags.map(t => `<span class="buff ${t[1]}">${t[0]}</span>`).join('');
  }
  $('vignette').style.opacity = f.alive ? String(clamp(1 - f.hp / f.maxHp / .45, 0, 1) * .8) : '.8';
}

/* ============================ entrada ============================ */
const Input = {
  keys: Object.create(null), mouse: { x: 0, y: 0 }, m1: false, m2: false, shift: false,
  aim: new THREE.Vector3(1, 0, 0), aimDir: { x: 1, z: 0 },
  touch: false, moveVec: { x: 0, z: 0 }, tAim: { x: 0, z: 0 }, tFire: false,
  queued: null
};
const _ray = new THREE.Raycaster(), _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0), _ndc = new THREE.Vector2();

function screenToGround(cx, cy, out) {
  _ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  _ray.setFromCamera(_ndc, camera);
  if (!_ray.ray.intersectPlane(_plane, out)) out.set(0, 1, 0);
  return out;
}

function initInput() {
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'shift') Input.shift = true;
    Input.keys[k] = true;
    if (k === 'escape') { e.preventDefault(); togglePause(); }
    if ([' ', 'q', 'e', 'r', 'f', 'w', 'a', 's', 'd'].includes(k)) e.preventDefault();
  });
  addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k === 'shift') Input.shift = false;
    Input.keys[k] = false;
  });
  addEventListener('blur', () => { Input.keys = Object.create(null); Input.m1 = Input.m2 = false; });
  const cv = $('gl');
  cv.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    Input.mouse.x = e.clientX; Input.mouse.y = e.clientY;
  });
  cv.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    if (e.button === 0) Input.m1 = true;
    if (e.button === 2) Input.m2 = true;
  });
  addEventListener('pointerup', e => {
    if (e.pointerType === 'touch') return;
    if (e.button === 0) Input.m1 = false;
    if (e.button === 2) Input.m2 = false;
  });
  Input.touch = matchMedia('(pointer:coarse)').matches;
  if (Input.touch) initTouch();
}

function updateAim() {
  if (Input.touch && (Input.tAim.x || Input.tAim.z)) {
    Input.aimDir.x = Input.tAim.x; Input.aimDir.z = Input.tAim.z;
    if (G.player) Input.aim.set(G.player.pos.x + Input.tAim.x * 12, 1, G.player.pos.z + Input.tAim.z * 12);
    return;
  }
  screenToGround(Input.mouse.x, Input.mouse.y, Input.aim);
  if (G.player) {
    const dx = Input.aim.x - G.player.pos.x, dz = Input.aim.z - G.player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    Input.aimDir.x = dx / d; Input.aimDir.z = dz / d;
  }
}

function moveInput() {
  if (Input.touch) return { x: Input.moveVec.x, z: Input.moveVec.z };
  let x = 0, z = 0;
  if (Input.keys['w'] || Input.keys['arrowup']) z -= 1;
  if (Input.keys['s'] || Input.keys['arrowdown']) z += 1;
  if (Input.keys['a'] || Input.keys['arrowleft']) x -= 1;
  if (Input.keys['d'] || Input.keys['arrowright']) x += 1;
  const d = Math.hypot(x, z);
  return d > 0 ? { x: x / d, z: z / d } : { x: 0, z: 0 };
}

/* Muestrear es cosa de la vista: lee el teclado, el ratón o los joysticks y
   produce el comando que define 10_core.js. Aplicarlo es cosa de la
   simulación (`applyInput`, en 30_combat.js). */
function sampleInput(seq) {
  updateAim();
  const f = G.player;
  const mv = moveInput();
  const dx = Input.aim.x - (f ? f.pos.x : 0), dz = Input.aim.z - (f ? f.pos.z : 0);
  let buttons = 0, ex = Input.shift || Input.exMode;
  if (Input.queued) {
    buttons |= 1 << Input.queued.i;
    if (Input.queued.ex) ex = true;
    Input.queued = null;
    if (Input.exMode) { Input.exMode = false; syncEx(); }
  }
  if (Input.m1 || (Input.touch && Input.tFire)) buttons |= BTN.M1;
  if (Input.m2) buttons |= BTN.M2;
  if (Input.keys[' ']) buttons |= BTN.SP;
  if (Input.keys['q']) buttons |= BTN.Q;
  if (Input.keys['e']) buttons |= BTN.E;
  if (Input.keys['f']) buttons |= BTN.F;
  if (Input.keys['r']) buttons |= BTN.R;
  return {
    seq,
    move: (mv.x || mv.z) ? dirToByte(mv.x, mv.z) : CMD_STILL,
    aim: dirToByte(Input.aimDir.x, Input.aimDir.z),
    aimD: clamp(Math.round(Math.hypot(dx, dz) * 10), 0, 255),
    buttons, ex: ex ? 1 : 0
  };
}

/* --- controles táctiles --- */
function initTouch() {
  $('touch').classList.remove('hidden');
  const mk = (node, onMove, onEnd) => {
    let id = null; const R = 52;
    const nub = node.querySelector('.nub');
    const rect = () => node.getBoundingClientRect();
    node.addEventListener('pointerdown', e => {
      if (id !== null) return;
      id = e.pointerId; node.setPointerCapture(id); handle(e);
    });
    node.addEventListener('pointermove', e => { if (e.pointerId === id) handle(e); });
    const up = e => {
      if (e.pointerId !== id) return;
      id = null; nub.style.transform = '';
      onMove(0, 0); if (onEnd) onEnd();
    };
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    function handle(e) {
      const r = rect();
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      const k = d > R ? R / d : 1;
      nub.style.transform = `translate(${dx * k}px,${dy * k}px)`;
      const n = Math.max(d, 1);
      onMove(dx / n * Math.min(1, d / R), dy / n * Math.min(1, d / R));
    }
  };
  mk($('stick-l'), (x, y) => { Input.moveVec.x = x; Input.moveVec.z = y; });
  mk($('stick-r'), (x, y) => {
    const d = Math.hypot(x, y);
    if (d > .25) { Input.tAim.x = x / d; Input.tAim.z = y / d; Input.tFire = true; }
    else Input.tFire = false;
  }, () => { Input.tFire = false; });
}

/* ============================ eventos de partida ============================ */
/* Lo que la simulación anuncia y que se traduce en pantallas, avisos y texto.
   La simulación no sabe que «Ronda ganada» se escribe así, ni que hay una
   pantalla de reliquias: solo dice lo que ha pasado. */
function uiEvent(ev) {
  switch (ev.e) {
    case 'matchStart':
      buildAbilityBar(G.player.champ);
      for (const f of G.fighters) makePlate(f);
      buildTeamFrames();
      hideScreens();
      break;

    case 'matchEnd':                       // también al salir al menú
      for (const d of PLATE.values()) d.remove();
      PLATE.clear(); FRAME.clear();
      clearAnnounce();
      $('feed').innerHTML = '';
      break;

    case 'training':
      announce('Entrenamiento', 'Los bots reaparecen solos', 2);
      break;

    case 'roundStart':
      if (!ev.training) announce(`Ronda ${ev.round}`, `${ev.score[0]} · ${ev.score[1]}`, 1.7);
      playSound('round');
      break;

    case 'roundEnd': {
      if (ev.winner < 0) { announce('Empate', 'Nadie cede', 3); break; }
      const pips = $('pips-' + (ev.winner === G.playerTeam ? 'a' : 'b')).children;
      if (pips[ev.score[ev.winner] - 1]) pips[ev.score[ev.winner] - 1].classList.add('on');
      const mine = ev.winner === G.playerTeam;
      announce(mine ? 'Ronda ganada' : 'Ronda perdida',
        `${ev.score[G.playerTeam]} · ${ev.score[1 - G.playerTeam]}`, 3);
      playSound(mine ? 'win' : 'lose');
      break;
    }

    case 'countdown':
      if (ev.n > 0) { announce(String(ev.n), '', .9); playSound('tick'); }
      else { announce('¡Ya!', '', .8); playSound('go'); }
      break;

    case 'sudden':
      announce('Muerte súbita', 'La arena se cierra', 2.2);
      playSound('sudden');
      break;

    case 'orbSpawn':
      if (ev.kind === 'energy') feed('Orbe de energía en el centro');
      break;

    case 'relics': showRelics(ev.picks, ev.of); break;
    case 'matchResult': showResult(ev.winner); break;
    case 'pause': ev.on ? showScreen('scr-pause') : hideScreens(); break;
  }
}

/* ---------- pantalla de reliquias ---------- */
/* Las tres opciones las sorteó la simulación y están en G.relicOptions; aquí
   solo se pintan y se avisa de cuál eligió el jugador. */
function showRelics(picks, of) {
  $('brite-title').textContent = `Reliquia ${picks} de ${of}`;
  $('brite-sub').textContent = 'Se queda contigo hasta el final del combate.';
  const box = $('brite-cards');
  box.innerHTML = '';
  (G.relicOptions || []).forEach((r, i) => {
    const b = el('button', 'card ' + (r.r === 'com' ? '' : r.r));
    b.innerHTML = `<span class="rune">${r.rune}</span><h4>${r.n}</h4><p>${r.d}</p><span class="tag">${RELIC_TAG[r.r]}</span>`;
    b.onclick = () => { if (pickRelic(i)) hideScreens(); };
    box.appendChild(b);
  });
  showScreen('scr-brite');
}

/* ---------- pantalla de resultado ---------- */
function showResult(winner) {
  const mine = winner === G.playerTeam;
  $('result-title').textContent = mine ? 'Victoria' : 'Derrota';
  $('result-sub').textContent = `${G.score[G.playerTeam]} · ${G.score[1 - G.playerTeam]} en ${G.mode.name}. ${mine ? 'La arena es tuya.' : 'La próxima vez.'}`;
  const tb = $('score-body');
  tb.innerHTML = '';
  const order = [...G.fighters].sort((a, b) => (a.team - b.team) || (b.stats.dmg - a.stats.dmg));
  for (const f of order) {
    const tr = el('tr', (f.team === G.playerTeam ? 'a' : 'b') + (f === G.player ? ' me' : ''));
    tr.innerHTML = `<td>${f.champ.glyph} ${f.name}</td><td>${G.score[f.team]}</td><td>${f.stats.kills}</td><td>${Math.round(f.stats.dmg)}</td><td>${Math.round(f.stats.heal)}</td><td>${Math.round(f.stats.taken)}</td>`;
    tb.appendChild(tr);
  }
  showScreen('scr-result');
  clearAnnounce();
  playSound(mine ? 'win' : 'lose');
}

/* El aviso grande se apaga solo, en tiempo real: no depende del ritmo de la
   simulación, así que la cámara lenta del remate no lo alarga. */
function tickAnnounce(raw) {
  if (announceT <= 0) return;
  announceT -= raw;
  if (announceT <= 0) clearAnnounce();
}
