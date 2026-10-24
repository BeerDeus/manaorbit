/* ── partie-jeu.js : outils de la table du compteur de vie (le moteur est dans partie.js, l'écran dans partie-ui.js) ─────────────────────────────
   · Hasard : crypto.getRandomValues (puRnd, puRandInt), jamais Math.random.
   · Dés et pièce (menu « … » › Dés et pièce) : d4, d6, d8, d10, d12, d20, pile ou face. Résultat dans chaque tuile, tourné vers son joueur (toucher : fermé, sinon
     au bout de 10 s), court tirage animé (aucun avec prefers-reduced-motion) ; envoyé aux téléphones de la table avec l'état en direct (champ `de`, partie.js ›
     partieLiveClean) : bandeau sur la table en direct, tuiles de l'écran 2.
   · Premier joueur au hasard : tirage animé (les tuiles s'allument tour à tour puis s'arrêtent sur lui), au lancement (« Au hasard ») et dans le menu au tour 1.
   · Chrono : durée de la partie au centre du bouton rond (A) et dans la barre du haut (B, C) ; en option, le temps du tour en cours ; menu « … › Chrono »
     (gardé sur l'appareil : deckdeal:partie:clk { d, t }). La durée est celle du résultat (début de la partie → maintenant).
   · Mode « attaque » (blessures de commandant) : depuis la fiche de l'attaquant (« Attaquer ») ; − / + sur chaque défenseur touché (maintenu : répété),
     les PV suivent ; « Fin de l'attaque », Retour ou le tour suivant l'arrêtent.
   · Feuilles d'un joueur (fiche, éliminer, renommer) ouvertes sur sa tuile, tournées vers lui (puSheetOnTile) ; − / + maintenus répétés (puHoldRep).
   · Préparation : plan de la table (ordre du tour, côté du téléphone de chacun), « Changer l'ordre » : glisser-déposer, ↑ / ↓, flèches du clavier ; la salle suit (op move).
   · Orientation gardée pendant la partie quand l'appareil le permet (puOrient : plugin de l'appli s'il a la méthode, sinon screen.orientation.lock) ; sinon le
     compteur se met en page en paysage (partie-ui.js › puLandL) et se repeint quand l'écran tourne. */

/* ── Hasard ───────────────────────────────────────────────────────────────────────────────────── */
/** Nombre au hasard dans [0, 1) (crypto.getRandomValues ; navigateur sans : Math.random). */
function puRnd() { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; } catch (e) { return Math.random(); } }
/** Entier au hasard dans [0, n) sans biais (tirages hors du dernier multiple de n rejetés). */
function puRandInt(n) {
  try { const a = new Uint32Array(1), lim = Math.floor(4294967296 / n) * n; do crypto.getRandomValues(a); while (a[0] >= lim); return a[0] % n; } catch (e) { return Math.floor(Math.random() * n); }
}
const puRid = () => { let s = ''; for (let i = 0; i < 8; i++) s += '0123456789abcdefghijklmnopqrstuvwxyz'[puRandInt(36)]; return s; };

/* ── Dés, pièce, premier joueur ───────────────────────────────────────────────────────────────── */
const PU_DICE = [4, 6, 8, 10, 12, 20], PU_ROLL_MS = 10000;
const PU_DIE = '<svg class="i pu-die" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="9" r="1.4" fill="currentColor"/><circle cx="15" cy="15" r="1.4" fill="currentColor"/><circle cx="15" cy="9" r="1.4" fill="currentColor"/><circle cx="9" cy="15" r="1.4" fill="currentColor"/></svg>';
/** Tirage en clair : { lbl (« Dé à 20 faces »…), val (« 14 », « Pile », « Léa ») } ; places : pour le nom du premier joueur. */
function puRollTxt(R, places) {
  if (R.k === 'pf') return { lbl: T('Pile ou face'), val: R.v ? T('Face') : T('Pile') };
  if (R.k === 'j1') { const p = (places || []).find(x => x.pos === R.v); return { lbl: T('Premier joueur'), val: (p && p.nom) || T('Joueur {n}', { n: R.v }) }; }
  return { lbl: T('Dé à {n} faces', { n: R.k.slice(1) }), val: String(R.v) };
}
/** Tirage montré dans une tuile (puTile) : celui de ce téléphone (PU.roll) ou celui reçu (ext : écran 2). '' : rien en cours. */
function puRollTile(st, p, ext) {
  const R = ext || PU.roll; if (!R || (R.until && Date.now() > R.until)) return '';
  if (R.spin) return '';      // premier joueur : les tuiles s'allument tour à tour (puDrawShow), le résultat ensuite
  const t = puRollTxt(R, st.places), me = R.k === 'j1' && R.v === p.pos, val = R.k === 'j1' ? (me ? T('Tu commences !') : T('{name} commence', { name: t.val })) : t.val;
  return `<button type="button" class="pu-roll${R.k === 'j1' ? ' j1' : ''}${me ? ' me' : ''}${R.anim ? ' anim' : ''}" data-pu="roll-x" aria-label="${esc(t.lbl + ' : ' + val + ' · ' + T('Fermer'))}"><small>${R.k === 'j1' ? '' : PU_DIE}${esc(t.lbl)}</small><b>${esc(val)}</b></button>`;
}
/** Lance un dé (d4 … d20) ou la pièce (pf) : montré dans chaque tuile, envoyé aux téléphones de la table. */
function puRoll(k) {
  const n = k === 'pf' ? 2 : Number(String(k).slice(1)); if (!(k === 'pf' || PU_DICE.includes(n))) return;
  const v = k === 'pf' ? puRandInt(2) : 1 + puRandInt(n), anim = !reduceMotion();
  puRollSet({ id: puRid(), k, v, t: Date.now(), anim, until: Date.now() + PU_ROLL_MS });
  haptic('ok');
  if (anim) {      // court tirage : des valeurs défilent 0,6 s dans chaque tuile, puis le résultat
    const R = PU.roll, t0 = Date.now(), face = () => (k === 'pf' ? (puRandInt(2) ? T('Face') : T('Pile')) : String(1 + puRandInt(n)));
    const step = () => {
      if (PU.roll !== R) return;
      if (Date.now() - t0 > 600) { R.anim = false; for (const b of $$('.pu-roll b', PU.el)) b.textContent = puRollTxt(R).val; for (const x of $$('.pu-roll', PU.el)) x.classList.add('pop'); return; }
      for (const b of $$('.pu-roll b', PU.el)) b.textContent = face();
      setTimeout(step, 70);
    };
    step();
  }
}
function puRollSet(R) {
  clearTimeout(PU.rollT); PU.roll = R; PU.de = R ? { id: R.id, k: R.k, v: R.v, t: R.t } : PU.de;
  if (R && R.until) PU.rollT = setTimeout(() => { if (PU.roll === R) { PU.roll = null; if (PU.el && PU.mode === 'game') puPaint(); } }, R.until - Date.now() + 50);
  if (PU.el && PU.mode === 'game') puPaint();
  if (R) puLiveSoon();      // les téléphones de la table le voient aussi
}
/** Premier joueur au hasard (menu « … » au tour 1) : tiré parmi les places en jeu, noté (annulable), montré. */
function puDrawFirst() {
  const alive = PU.st.places.filter(p => !p.elimine).map(p => p.pos).sort((a, b) => a - b); if (!alive.length) return;
  const pos = alive[puRandInt(alive.length)]; puSet(partieFirst(PU.st, pos)); puDrawShow(PU.st.premier);
}
/** Tirage du premier joueur, déjà décidé (pos) : les tuiles s'allument tour à tour, de plus en plus lentement, et s'arrêtent sur lui ; puis « Léa commence » dans
 *  chaque tuile. prefers-reduced-motion : le résultat tout de suite. */
function puDrawShow(pos) {
  if (!PU.el || PU.mode !== 'game' || !pos) return;
  const ord = PU.st.places.filter(p => !p.elimine).map(p => p.pos).sort((a, b) => a - b), spin = !reduceMotion() && ord.length > 1;
  const R = { id: puRid(), k: 'j1', v: pos, t: Date.now(), spin, until: 0 };
  puRollSet(R); haptic('tap');
  const done = () => { if (PU.roll !== R) return; R.spin = false; R.until = Date.now() + PU_ROLL_MS; puRollSet(R); haptic('ok'); };
  if (!spin) { done(); return; }
  const steps = ord.length * 2 + ((ord.indexOf(pos) - 0 + ord.length) % ord.length) + 1;      // deux tours de table, puis jusqu'à lui
  let i = 0;
  const tick = () => {
    if (PU.roll !== R || !PU.el) return;
    const at = ord[i % ord.length]; for (const t of $$('.pu-t', PU.el)) t.classList.toggle('spin', Number(t.dataset.pos) === at);
    if (++i >= steps) { setTimeout(() => { for (const t of $$('.pu-t.spin', PU.el)) t.classList.remove('spin'); done(); }, 380); return; }
    setTimeout(tick, 60 + Math.round(200 * Math.pow(i / steps, 2)));
  };
  tick();
}
/** Tirage à joindre à l'état en direct (téléphones de la table) : le dernier, avec son âge en secondes ; plus rien après une minute. */
function puLiveExtra() {
  const d = PU.de; if (!d) return null;
  const a = Math.round((Date.now() - d.t) / 1000); if (a > 60) { PU.de = null; return null; }
  return { de: { id: d.id, k: d.k, v: d.v, a } };
}

/* ── Chrono ───────────────────────────────────────────────────────────────────────────────────── */
const PU_CLK_KEY = 'deckdeal:partie:clk';
const puClkPref = () => { try { const o = JSON.parse(localStorage.getItem(PU_CLK_KEY) || 'null'); return o && typeof o === 'object' ? { d: o.d !== 0, t: o.t === 1 } : { d: true, t: false }; } catch (e) { return { d: true, t: false }; } };
const puClkSave = p => { try { localStorage.setItem(PU_CLK_KEY, JSON.stringify({ d: p.d ? 1 : 0, t: p.t ? 1 : 0 })); } catch (e) { /* réglage pour cette fois */ } };
/** Début du tour en cours : le dernier « tour suivant » du journal, sinon le début de la partie. */
function puTurnAt(st) { const j = st.journal || []; for (let i = j.length - 1; i >= 0; i--) if (j[i] && (j[i].a === 'n' || j[i].a === 'g') && j[i].t) return j[i].t; return st.debut || 0; }
const puMmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
/** { d : durée de la partie (« 42 min »), t : temps du tour en cours (« 2:15 ») } selon le réglage ; {} : partie sans début (écran 2 : l'état reçu n'a pas l'heure). */
function puClkParts(st) {
  if (!st || !st.debut || st.fin) return {}; const p = puClkPref(), now = Date.now(), o = {};
  if (p.d) o.d = puDur(Math.max(0, (now - st.debut) / 1000));
  if (p.t) o.t = puMmss(Math.max(0, Math.floor((now - puTurnAt(st)) / 1000)));
  return o;
}
/** Chrono dans le bouton rond (A : une ligne par valeur) ou la barre du haut (bar : B, C). '' : masqué. */
function puClkHtml(st, bar) {
  const o = puClkParts(st), ks = ['d', 't'].filter(k => o[k]); if (!ks.length) return '';
  const tt = k => (k === 'd' ? T('Durée de la partie') : T('Temps du tour en cours'));
  return bar ? ks.map(k => ` · <span class="pu-clk" data-c="${k}" title="${tt(k)}">${esc(o[k])}</span>`).join('') : ks.map(k => `<small class="pu-clk" data-c="${k}" title="${tt(k)}">${esc(o[k])}</small>`).join('');
}
function puClkTick() {
  if (!PU.el || PU.mode !== 'game') { clearInterval(PU.clkT); PU.clkT = 0; return; }
  const o = puClkParts(PU.st); for (const e of $$('.pu-clk', PU.el)) { const t = o[e.dataset.c] || ''; if (e.textContent !== t) e.textContent = t; }
}

/* ── Menu « … » : dés et pièce, chrono ────────────────────────────────────────────────────────── */
function puJeuMenuHtml() {
  const c = puClkPref();
  return `<p class="pu-h">${T('Dés et pièce')}</p><div class="pu-dice">${PU_DICE.map(n => `<button type="button" data-roll="d${n}" aria-label="${T('Dé à {n} faces', { n })}">${PU_DIE}<b>d${n}</b></button>`).join('')}<button type="button" class="pu-coin" data-roll="pf"><svg class="i" aria-hidden="true"><use href="#i-coin"/></svg><b>${T('Pile ou face')}</b></button></div>
    <p class="pu-h">${T('Chrono')}</p><div class="pu-card pu-tmenu pu-clkm">
      <label class="switch-row" for="puMClkD"><span class="t"><b>${T('Durée de la partie')}</b><span class="hint">${T('Au centre du bouton rond (affichage A) ou dans la barre du haut.')}</span></span><span class="switch"><input type="checkbox" id="puMClkD"${c.d ? ' checked' : ''}><i></i></span></label>
      <label class="switch-row" for="puMClkT"><span class="t"><b>${T('Temps du tour en cours')}</b><span class="hint">${T('Remis à zéro à chaque tour.')}</span></span><span class="switch"><input type="checkbox" id="puMClkT"${c.t ? ' checked' : ''}><i></i></span></label></div>`;
}
function puJeuMenuClick(e, api) {
  const r = e.target.closest('[data-roll]'); if (!r) return false;
  api.close(); puRoll(r.dataset.roll); return true;
}
function puJeuMenuChange(e) {
  const id = e.target.id; if (id !== 'puMClkD' && id !== 'puMClkT') return false;
  const p = puClkPref(); if (id === 'puMClkD') p.d = e.target.checked; else p.t = e.target.checked;
  puClkSave(p); haptic('tap'); puPaint(); return true;
}

/* ── Mode « attaque » : blessures de commandant d'un attaquant, − / + sur chaque défenseur ─────── */
function puAtkStart(pos, second) {
  if (!PU.st || !partieCmdOn(PU.st) || PU.mode !== 'game') return;
  PU.atk = { pos, b: !!second }; haptic('tap'); puPaint();
}
function puAtkEnd() { if (!PU.atk) return; PU.atk = null; haptic('tap'); if (PU.el && PU.mode === 'game') puPaint(); }
/** Tuile en mode « attaque » (puTile) : l'attaquant (encadré, « Fin de l'attaque »), un défenseur (blessures reçues de lui, − / + = blessures), un éliminé (rien). */
function puAtkTile(st, p) {
  const A = PU.atk; if (!A) return null;
  const a = st.places.find(x => x.pos === A.pos); if (!a) return null;
  const an = esc(a.nom || T('Joueur {n}', { n: a.pos })), cmd = puCmd(a).split(' + ')[A.b ? 1 : 0] || '';
  if (p.pos === A.pos) return { cls: ' atk-a', nohit: true, html: `<div class="pu-atk-box"><b><svg class="i" aria-hidden="true"><use href="#i-sword"/></svg>${T('Attaque de {name}', { name: an })}</b>${cmd ? `<small>${esc(cmd)}</small>` : ''}<span>${T('Les joueurs touchés : − / + sur leur tuile.')}</span><button type="button" class="btn small" data-pu="atk-end">${T('Fin de l\'attaque')}</button></div>` };
  if (p.elimine) return { cls: ' atk-x', nohit: true };
  const n = p.blessures[String(A.pos) + (A.b ? 'b' : '')] || 0, nm = esc(p.nom || T('Joueur {n}', { n: p.pos }));
  return { cls: ' atk-d', top: `<div class="pu-atk-n" title="${T('Blessures de commandant reçues')}"><svg class="i" aria-hidden="true"><use href="#i-sword"/></svg><span>${esc(T('de {name}', { name: a.nom || a.pos }))}</span><b>${n}</b></div>`,
    lm: T('{name} : −1 blessure du commandant de {src}', { name: nm, src: an }), lp: T('{name} : +1 blessure du commandant de {src}', { name: nm, src: an }) };
}
/** ±1 blessure du commandant de l'attaquant sur un défenseur (les PV suivent : partie.js › partieCmdDamage), comme un appui (journal, écart sur la tuile). */
function puAtkHit(pos, n) {
  const A = PU.atk; if (!A) return;
  const was = PU.st.places.find(x => x.pos === pos), next = partieCmdDamage(PU.st, pos, A.pos, n, { second: A.b }); if (next === PU.st || !was) return;
  const now = next.places.find(x => x.pos === pos); puDeltaAdd(pos, now.vie - was.vie);
  haptic('tap'); puSet(next, { paint: false });
  const t = puPaintTile(pos), h = t && $(n < 0 ? '.pu-hit.m' : '.pu-hit.p', t); if (h) h.classList.add('fl');
  if (puProp(PU.st) && puProp(PU.st).pos === pos && !(t && t.classList.contains('pin'))) puPaint();
}

/* ── Feuilles d'un joueur sur sa tuile, tournées vers lui ─────────────────────────────────────── */
/** La feuille (openSheet) se pose sur la tuile t, tournée comme elle (--r) : vue par son joueur, aussi large que l'écran le permet (460 px au plus), centrée sur la
 *  tuile et gardée dans l'écran. root : où retrouver la tuile après un repeint (écran du compteur, écran 2). Pas de glissé vers le bas (la feuille est tournée). */
function puSheetOnTile(api, t, root) {
  const sh = $('.sheet', api.wrap); if (!sh || !t) return;
  const pos = t.dataset.pos, r = ((parseFloat(getComputedStyle(t).getPropertyValue('--r')) || 0) % 360 + 360) % 360, rv = r === 90 || r === 270;
  api.wrap.classList.add('pu-tsheet'); if (rv) api.wrap.classList.add('rv');
  api.wrap.addEventListener('pointerdown', e => { if (e.target.closest('.sheet-head, .grab') && !e.target.closest('button')) e.stopPropagation(); }, true);
  const place = () => {
    if (!t.isConnected) { const n = $(`.pu-t[data-pos="${pos}"]`, root || PU.el || document); if (n) t = n; }
    const W = innerWidth, H = innerHeight, m = 8, pw = Math.min((rv ? H : W) - 2 * m, 460), ph = Math.min((rv ? W : H) - 2 * m, 640);
    sh.style.setProperty('--w', pw + 'px'); sh.style.setProperty('--h', ph + 'px'); sh.style.setProperty('--r', r + 'deg');
    const lw = sh.offsetWidth, lh = sh.offsetHeight, bw = rv ? lh : lw, bh = rv ? lw : lh, b = t.getBoundingClientRect();
    sh.style.setProperty('--x', Math.round(Math.max(m + bw / 2, Math.min(W - m - bw / 2, b.left + b.width / 2))) + 'px');
    sh.style.setProperty('--y', Math.round(Math.max(m + bh / 2, Math.min(H - m - bh / 2, b.top + b.height / 2))) + 'px');
  };
  sh.style.transition = 'none'; api.__place = place; place(); void sh.offsetWidth; sh.style.transition = '';      // posée et tournée d'emblée : seul le zoom d'ouverture s'anime
}
/** − / + maintenus dans une feuille (fiche du joueur, de l'écran 2) : après 0,45 s, le bouton est répété (toutes les 0,14 s, puis 0,07 s) ; le relâché ne compte pas
 *  une fois de plus. Le bouton est retrouvé par ses données après chaque repeint de la feuille. */
function puHoldRep(root) {
  let H = null;
  const sel = b => 'button' + ['k', 'n', 's', 'b', 'c'].map(a => (b.dataset[a] != null ? `[data-${a}="${b.dataset[a]}"]` : '')).join('');
  const stop = () => { if (H && H.on) { clearTimeout(H.t); H.on = false; H.end = Date.now(); } };
  root.addEventListener('pointerdown', e => {
    const b = e.target.closest('button[data-k]'); if (!b || b.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    stop(); const me = H = { s: sel(b), rep: 0, on: true };
    const tick = d => { me.t = setTimeout(() => {
      if (H !== me || !me.on) return; const x = $(me.s, root); if (!x || x.disabled) { stop(); return; }
      me.rep++; root.__rep = true; try { x.click(); } finally { root.__rep = false; } tick(me.rep > 8 ? 70 : 140);
    }, d); };
    tick(450);
  });
  for (const ty of ['pointerup', 'pointercancel']) root.addEventListener(ty, stop);
  root.addEventListener('pointerleave', stop);
  root.addEventListener('click', e => { if (root.__rep || !H || !H.rep || Date.now() - (H.end || Date.now()) > 500) return; e.stopPropagation(); e.preventDefault(); H.rep = 0; }, true);      // le clic du relâché, après une répétition
  root.addEventListener('contextmenu', e => { if (e.target.closest('button[data-k]')) e.preventDefault(); });
}

/* ── Préparation : plan de la table, ordre des places ─────────────────────────────────────────── */
/** Plan de la table (affichage A en petit, le téléphone au milieu) : chaque place à sa tuile, numérotée dans l'ordre du tour, le bord de son joueur marqué ;
 *  le premier joueur choisi a « 1er ». */
function puPlanHtml(st) {
  const L = puLayoutA(st.places), idx = new Map(st.places.map((p, i) => [p.pos, i + 1])), first = st.premier && st.places.find(p => p.pos === st.premier);
  return `<div class="pu-plan"><div class="pu-plan-g" style="--cols:${L.cols};--rows:${L.rows}" role="img" aria-label="${esc(T('Plan de la table : {list}', { list: st.places.map((p, i) => (i + 1) + '. ' + (p.nom || T('Joueur {n}', { n: p.pos }))).join(', ') }))}">${L.cells.map(c => `<span class="pu-pl r${c.r}${st.premier === c.p.pos ? ' first' : ''}" style="grid-row:${c.row};grid-column:${c.col}${c.cs > 1 ? ' / span ' + c.cs : ''};--h:${puHue(c.p.pos)}"><b>${idx.get(c.p.pos)}</b><span>${esc(c.p.nom || T('Joueur {n}', { n: c.p.pos }))}</span>${st.premier === c.p.pos ? `<small>${T('1er')}</small>` : ''}</span>`).join('')}</div>
    <p class="hint pu-plan-t">${first ? esc(T('{name} commence, puis le tour passe à sa gauche (sens des aiguilles d\'une montre). Chacun a sa tuile de son côté du téléphone.', { name: first.nom || T('Joueur {n}', { n: first.pos }) })) : T('Ordre du tour : 1, 2, 3… dans le sens des aiguilles d\'une montre, à partir du premier joueur. Chacun a sa tuile de son côté du téléphone.')}</p></div>`;
}
const PU_GRIP = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></g></svg>';
/** « Changer l'ordre » : poignée (numéro de la place ; glisser, ou flèches du clavier) et ↑ / ↓ de chaque place. */
function puSeatGrip(p, i) {
  return `<button type="button" class="pu-grip" data-pu="grip" data-i="${i}" aria-label="${esc(T('Déplacer {name} : glisser, ou flèches haut et bas', { name: p.nom || T('Joueur {n}', { n: p.pos }) }))}"><b>${i + 1}</b>${PU_GRIP}</button>`;
}
function puSeatArrows(p, i, n) {
  const nm = esc(p.nom || T('Joueur {n}', { n: p.pos }));
  return `<span class="pu-ud"><button type="button" class="icon-btn" data-pu="seat-up" data-i="${i}"${i === 0 ? ' disabled' : ''} aria-label="${T('Monter {name}', { name: nm })}"><svg class="i up" aria-hidden="true"><use href="#i-chev"/></svg></button><button type="button" class="icon-btn" data-pu="seat-dn" data-i="${i}"${i === n - 1 ? ' disabled' : ''} aria-label="${T('Descendre {name}', { name: nm })}"><svg class="i dn" aria-hidden="true"><use href="#i-chev"/></svg></button></span>`;
}
/** Une place passe de l'indice i à j (échanges successifs avec ses voisines : les autres gardent leur ordre) ; la salle suit, échange par échange (op move :
 *  vers une place libre, ou échange). focus : bouton à rendre le focus après le repeint ('seat-up', 'seat-dn', 'grip'). */
async function puSeatMove(i, j, focus) {
  const ps = PU.st.places.map(p => p.pos), n = ps.length; j = Math.max(0, Math.min(n - 1, j)); if (i === j || i < 0 || i >= n) return;
  const sw = [], d = i < j ? 1 : -1; let st = PU.st;
  for (let k = i; k !== j; k += d) { st = partieMovePlace(st, ps[k], ps[k + d]); sw.push([ps[k], ps[k + d]]); }
  haptic('tap'); puSet(st);
  if (focus) { const li = $$('.pu-seat', PU.el)[j], b = li && ($(`[data-pu="${focus}"]:not(:disabled)`, li) || $('[data-pu="grip"]', li)); if (b) b.focus({ preventScroll: true }); }
  const room = partieRoom(); if (!room || !room.host || room.id !== st.id || !PU.view) return;
  PU.mvBusy = (PU.mvBusy || 0) + 1; let v = null;
  try {
    for (const [a, b] of sw) {
      const has = x => (PU.view.places || []).some(y => y.pos === x);
      if (has(a)) v = PU.view = await partieRoomOp('move', { from: a, to: b }); else if (has(b)) v = PU.view = await partieRoomOp('move', { from: b, to: a });      // invité ajouté ici seulement : l'autre place va à la sienne
    }
  } catch (e) { v = null; }      // refusé, hors ligne : la salle redonne son ordre au relevé suivant
  PU.mvBusy--; if (v && !PU.mvBusy && PU.el && PU.mode === 'setup') puSet(puFromRoom(PU.st, v));
}
/** Glisser-déposer d'une place par sa poignée (souris, doigt) : la ligne suit le pointeur, les autres s'écartent ; au dépôt, l'ordre change. */
function puSeatDrag(e) {
  const g = e.target.closest('.pu-grip'); if (!g || PU.mode !== 'setup' || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const li = g.closest('.pu-seat'), items = [...li.parentNode.children], i = items.indexOf(li); if (i < 0) return;
  e.preventDefault();
  const y0 = e.clientY, rs = items.map(x => x.getBoundingClientRect()), h = rs[i].height; let to = i, moved = false;
  PU.drag = true; li.classList.add('drag'); try { g.setPointerCapture(e.pointerId); } catch (x) { /* déjà capturé */ }
  const move = ev => {
    const dy = ev.clientY - y0; if (Math.abs(dy) > 5) moved = true; if (!moved) return;
    li.style.transform = `translateY(${dy}px)`; const c = rs[i].top + h / 2 + dy; to = i;
    for (let k = i + 1; k < items.length; k++) if (c > rs[k].top + rs[k].height / 2) to = k;
    for (let k = i - 1; k >= 0; k--) if (c < rs[k].top + rs[k].height / 2) to = k;
    items.forEach((x, k) => { if (k === i) return; const s = k > i && k <= to ? -h : k < i && k >= to ? h : 0; x.style.transform = s ? `translateY(${s}px)` : ''; });
  };
  const end = ev => {
    g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', end); g.removeEventListener('pointercancel', end);
    items.forEach(x => { x.style.transform = ''; }); li.classList.remove('drag'); PU.drag = false;
    if (moved && to !== i && ev.type === 'pointerup') { PU.dragPaint = false; puSeatMove(i, to, 'grip'); }
    else if (PU.dragPaint) { PU.dragPaint = false; puPaint(); }
  };
  g.addEventListener('pointermove', move); g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
}
/** Clavier sur la poignée d'une place : ↑ / ↓ la déplacent. */
function puJeuKey(e) {
  const g = e.target.closest && e.target.closest('.pu-grip'); if (!g || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault(); const i = Number(g.dataset.i); puSeatMove(i, i + (e.key === 'ArrowUp' ? -1 : 1), 'grip');
}

/* ── Orientation : gardée pendant la partie quand c'est possible ──────────────────────────────── */
/** Appli Android : le plugin ManaOrbit s'il a la méthode orientation({ lock }) (APK à venir) ; navigateur, PWA installée : screen.orientation.lock sur l'orientation
 *  du moment (souvent refusé hors plein écran : sans effet, le compteur se met alors en page en paysage). */
function puOrient(on) {
  if (!!PU.olk === !!on) return; PU.olk = !!on;
  const mo = typeof natPlugin === 'function' ? natPlugin('ManaOrbit') : null;
  if (mo && typeof mo.orientation === 'function') { Promise.resolve().then(() => mo.orientation({ lock: !!on })).catch(() => {}); return; }
  try {
    const so = typeof screen !== 'undefined' && screen.orientation; if (!so || typeof so.lock !== 'function') return;
    if (on) Promise.resolve(so.lock(so.type)).catch(() => {}); else so.unlock();
  } catch (e) { /* non pris en charge */ }
}

/* ── Branchements dans partie-ui.js (gardés par typeof) ───────────────────────────────────────── */
/** Après chaque repeint du compteur : orientation gardée, chrono qui avance, clé de mise en page (repeint quand l'écran tourne). */
function puJeuPaint() {
  puOrient(true);
  PU.rzKey = puRzKey();
  const clk = puClkPref(); if ((clk.d || clk.t) && !PU.clkT) PU.clkT = setInterval(puClkTick, 1000);
}
/** Compteur fermé, mis en pause ou terminé : tout s'arrête. */
function puJeuStop() {
  puOrient(false); clearInterval(PU.clkT); PU.clkT = 0; clearTimeout(PU.rollT); PU.roll = null; PU.atk = null;
}
/** Retour du téléphone (ou Échap) sur le compteur : d'abord le mode « attaque », puis un tirage affiché ; true : traité. */
function puJeuBack() {
  if (PU.atk) { puAtkEnd(); return true; }
  if (PU.roll && !PU.roll.spin) { clearTimeout(PU.rollT); PU.roll = null; puPaint(); return true; }
  return false;
}
/** Boutons de l'écran (data-pu) traités ici ; true : traité. */
function puJeuClick(a, b, pos) {
  if (a === 'ord') { PU.ord = !PU.ord; haptic('tap'); puPaint(); const x = $('[data-pu="ord"]', PU.el); if (x) x.focus({ preventScroll: true }); return true; }
  if (a === 'seat-up' || a === 'seat-dn') { const i = Number(b.dataset.i); puSeatMove(i, i + (a === 'seat-up' ? -1 : 1), a); return true; }
  if (a === 'grip') return true;
  if (a === 'ren') { puRename(pos); return true; }
  if (a === 'roll-x') { PU.roll = null; clearTimeout(PU.rollT); puPaint(); return true; }
  if (a === 'atk-end') { puAtkEnd(); return true; }
  return false;
}
const puRzKey = () => [puLand(), puLandDir(), PU.st ? puBCols(PU.st.places.length) : 1].join();
/** L'écran tourne ou change de taille : compteur remis en page (paysage), feuilles posées sur une tuile replacées, écran 2 repeint. */
function puResize() {
  if (PU.el && PU.mode === 'game' && puRzKey() !== PU.rzKey) puPaint();
  for (const s of typeof sheets !== 'undefined' ? sheets : []) if (s.__place) s.__place();
  if (PU.joinEl && PU.joinEl.__paint && PU.joinEl.classList.contains('pu-scr')) PU.joinEl.__paint();
}
if (typeof window !== 'undefined' && typeof addEventListener === 'function') {
  let rzT = 0; const rz = () => { clearTimeout(rzT); rzT = setTimeout(puResize, 120); };
  addEventListener('resize', rz);
  try { if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', rz); } catch (e) { /* ancien navigateur */ }
}
