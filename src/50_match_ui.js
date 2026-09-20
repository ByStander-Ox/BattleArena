/* ============================ interfaz ============================ */
const KEYLBL = { M1: 'Clic', M2: 'Der.', SP: 'Esp', Q: 'Q', E: 'E', F: 'F', R: 'R' };
const UI = {};
let plateHost, numPool = [];

function initUI() {
  UI.hud = $('hud'); UI.world = $('world');
  plateHost = $('world');
  $('buildline').textContent = 'Prototipo · tres campeones · bots';

  // menú principal
  $('go-play').onclick = () => { SFX.init(); showScreen('scr-setup'); };
  $('go-help').onclick = () => showScreen('scr-help');
  $('help-back').onclick = () => showScreen(G.state === 'title' ? 'scr-title' : 'scr-title');
  $('setup-back').onclick = () => showScreen('scr-title');
  $('setup-start').onclick = () => startMatch();
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

const SEL = { mode: 'duo', diff: 'normal', champ: 'vesk' };
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
  G.announceT = dur || 1.6;
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
  f.plate = d;
}
function updatePlates() {
  for (const f of G.fighters) {
    const d = f.plate;
    if (!d) continue;
    if (!f.alive) { d.style.display = 'none'; continue; }
    d.style.display = '';
    tmpV.set(f.mesh.position.x, 2.35, f.mesh.position.z).project(camera);
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
    f.frame = d;
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
    const d = o.frame;
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

/* ============================ partida ============================ */
function spawnPoints(team, n) {
  const x = team === 0 ? -14.5 : 14.5;
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x, z: (i - (n - 1) / 2) * 3.4, a: team === 0 ? Math.PI / 2 : -Math.PI / 2 });
  return out;
}

/* `seed` sirve para repetir una partida entera: con la misma semilla y la
   misma entrada, el combate se desarrolla igual paso a paso. Si no se pasa, se
   sortea una y se guarda en G.seed. */
function startMatch(seed) {
  SFX.init();
  quitMatch();
  G.seed = seed === undefined ? (frand() * 0xFFFFFFFF) >>> 0 : (seed >>> 0);
  seedSim(G.seed);
  G.mode = MODES[SEL.mode];
  G.diff = SEL.diff;
  G.wins = G.mode.wins;
  G.round = 1; G.score = [0, 0]; G.picks = 0;
  G.playerTeam = 0;
  G.roundLimit = G.mode.time || 9999;

  const n = G.mode.size;
  // composición: nunca repetir campeón dentro de un equipo si se puede evitar
  const teamComp = t => {
    const list = [];
    const rest = CHAMP_LIST.filter(c => !(t === 0 && c === SEL.champ));
    if (t === 0) list.push(SEL.champ);
    const order = t === 0 ? ['brakk', 'lumen', 'vesk'] : ['lumen', 'vesk', 'brakk'];
    for (const c of order) {
      if (list.length >= n) break;
      if (list.includes(c)) continue;
      if (t === 0 && !rest.includes(c)) continue;
      list.push(c);
    }
    while (list.length < n) list.push(pickOne(CHAMP_LIST));
    return list.slice(0, n);
  };
  for (let t = 0; t < 2; t++) {
    const comp = teamComp(t);
    comp.forEach((cid, i) => {
      const isBot = !(t === 0 && i === 0);
      const f = makeFighter(cid, t, isBot, isBot ? BOT_NAMES[t][i % 4] : 'Tú');
      if (isBot) makeAI(f, G.diff);
      else G.player = f;
      G.fighters.push(f);
      makePlate(f);
    });
  }
  buildAbilityBar(G.player.champ);
  buildTeamFrames();
  hideScreens();
  G.started = true;
  if (G.mode.id === 'training') { beginRound(); announce('Entrenamiento', 'Los bots reaparecen solos', 2); }
  else openRelicPick();
}

function quitMatch() {
  for (const f of G.fighters) { scene.remove(f.mesh); if (f.plate) f.plate.remove(); }
  G.fighters.length = 0;
  G.byId.clear();
  _uid = 0;                 // los ids arrancan de cero en cada partida, como en un servidor
  G.player = null; G.started = false; G.sudden = false; G.shrink = 1;
  sdRing.visible = false;
  clearTransient();
  clearAnnounce();
  $('feed').innerHTML = '';
  G.paused = false;
}

function beginRound() {
  const n = G.mode.size;
  for (const t of [0, 1]) {
    const pts = spawnPoints(t, n);
    let i = 0;
    for (const f of G.fighters) if (f.team === t) { const p = pts[i++]; resetFighter(f, p.x, p.z, p.a); }
  }
  clearTransient();
  G.roundTime = 0; G.sudden = false; G.shrink = 1;
  G.firstBlood = false;
  sdRing.visible = false;
  G.nextOrb = 18; G.nextHeal = 26;
  G.state = 'intro';
  G.introT = 3.2;
  if (G.mode.id !== 'training') announce(`Ronda ${G.round}`, `${G.score[0]} · ${G.score[1]}`, 1.7);
  SFX.round();
}

function endRound(winner) {
  if (G.state !== 'live') return;
  G.state = 'roundend';
  G.roundEndT = 3.4;
  if (winner >= 0) {
    G.score[winner]++;
    for (const f of G.fighters) if (f.team === winner) f.stats.rounds++;
    const pips = $('pips-' + (winner === G.playerTeam ? 'a' : 'b')).children;
    if (pips[G.score[winner] - 1]) pips[G.score[winner] - 1].classList.add('on');
    const mine = winner === G.playerTeam;
    announce(mine ? 'Ronda ganada' : 'Ronda perdida', `${G.score[G.playerTeam]} · ${G.score[1 - G.playerTeam]}`, 3);
    mine ? SFX.win() : SFX.lose();
  } else {
    announce('Empate', 'Nadie cede', 3);
  }
  G.timeScale = .35;
}

function openRelicPick() {
  G.picks++;
  G.state = 'brite';
  const taken = new Set(G.player.relics.map(r => r.id));
  const pool = RELICS.filter(r => !taken.has(r.id));
  const opts = [];
  const byRar = r => pool.filter(x => x.r === r && !opts.includes(x));
  const wantEpic = G.picks >= 3 ? 1 : 0;
  while (opts.length < 3) {
    let cand;
    if (opts.length === 0) cand = pickOne(byRar('com'));
    else if (opts.length === 1) cand = pickOne(byRar(chance(.6) ? 'rare' : 'com'));
    else cand = pickOne(byRar(wantEpic && chance(.55) ? 'epic' : 'rare'));
    if (!cand) cand = pickOne(pool.filter(x => !opts.includes(x)));
    if (!cand) break;
    opts.push(cand);
  }
  $('brite-title').textContent = `Reliquia ${G.picks} de ${G.wins + 2}`;
  $('brite-sub').textContent = 'Se queda contigo hasta el final del combate.';
  const box = $('brite-cards');
  box.innerHTML = '';
  opts.forEach(r => {
    const b = el('button', 'card ' + (r.r === 'com' ? '' : r.r));
    b.innerHTML = `<span class="rune">${r.rune}</span><h4>${r.n}</h4><p>${r.d}</p><span class="tag">${RELIC_TAG[r.r]}</span>`;
    b.onclick = () => {
      applyRelic(G.player, r);
      for (const f of G.fighters) {
        if (f === G.player || !f.isBot) continue;
        const own = new Set(f.relics.map(x => x.id));
        const p = RELICS.filter(x => !own.has(x.id));
        const three = [pickOne(p), pickOne(p), pickOne(p)].filter(Boolean);
        const chosen = botPickRelic(f, three.length ? three : [pickOne(RELICS)]);
        if (chosen) applyRelic(f, chosen);
      }
      hideScreens();
      beginRound();
    };
    box.appendChild(b);
  });
  showScreen('scr-brite');
  G.state = 'brite';
}

function endMatch(winner) {
  G.state = 'result';
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
  mine ? SFX.win() : SFX.lose();
}

function togglePause() {
  if (!G.started) return;
  if (G.state === 'brite' || G.state === 'result') return;
  if (G.paused) { G.paused = false; hideScreens(); }
  else { G.paused = true; showScreen('scr-pause'); }
}
