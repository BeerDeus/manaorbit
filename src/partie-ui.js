/* ── partie-ui.js : partie de Commander, l'interface (le moteur est dans partie.js) ─────────────────────────────────────────────
   · Accueil : carte « Partie de Commander » sous l'Échange (nouvelle partie ou reprendre, mes parties).
   · Préparation : points de départ, ma place et mon deck, QR code de la table (compte connecté et en ligne : les autres rejoignent avec leur téléphone),
     invités ajoutés ici (sans téléphone, ou hors ligne), premier joueur, lancement.
   · Compteur (le téléphone du créateur, posé sur la table) : trois affichages au choix dans le menu « … » — A tourné vers chacun, B liste, C table —
     toucher la moitié gauche / droite d'un joueur : −1 / +1 (maintenu : ±10) ; son nom : sa fiche (blessures de commandant, poison, impôt, monarque…).
   · Fin : vainqueur(s), résultat gardé et envoyé (partie.js › partieDone), QR code du résultat pour ceux qui n'ont pas rejoint.
   · Liens : ?table=CODE (rejoindre : se connecter ou continuer en invité, place, deck) et ?partie=… (résultat : « c'était moi »).
   Aucune publicité pendant la partie (écran plein, au-dessus de tout). Écran gardé allumé (Wake Lock) pendant le compteur. */
const PU = { el: null, st: null, mode: '', room: null, view: null, on: [], net: true, stopW: null, wl: null, gone: new Set(), deltas: {}, hold: null, joinEl: null, roomTry: false };
const PU_AFF_KEY = 'deckdeal:partie:aff', PU_AFFS = ['A', 'B', 'C'];
const PU_CNT = [['poison', 'Poison'], ['impot', 'Impôt de commandant'], ['energie', 'Énergie'], ['experience', 'Expérience']];
const PU_HEART = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.6 3.1 4.3 6.6-1.8 4.8-9.3 9.4-9.3 9.4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const PU_QR_MAX = 360;      // données du QR code d'un résultat : noms raccourcis au besoin, le code reste lisible par un téléphone (version 15 au plus)
const puAff = () => { try { const v = localStorage.getItem(PU_AFF_KEY); return PU_AFFS.includes(v) ? v : 'A'; } catch (e) { return 'A'; } };
const puAffSet = v => { try { localStorage.setItem(PU_AFF_KEY, v); } catch (e) { /* choix pour cette fois */ } };
const puOnline = () => !(typeof navigator !== 'undefined' && navigator.onLine === false);
const puNet = () => !!(D.user && CTX.partie && puOnline());      // salle d'attente possible : compte, serveur qui l'annonce, réseau
const puMe = () => (PROF.name || (D.user && D.user.displayName) || '').trim().slice(0, 24) || T('Moi');
const puName = (st, pos) => { const p = st.places.find(x => x.pos === pos); return p ? p.nom || T('Joueur {n}', { n: pos }) : ''; };
const puCmd = p => (p.deck && (p.deck.commandant || p.deck.nom)) || '';
const puDur = s => { const m = Math.round(s / 60); return m < 60 ? T('{n} min', { n: m }) : T('{h} h {m}', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') }); };

/* ── Accueil ───────────────────────────────────────────────────────────────────────────────────── */
function puHomeInit() {
  const tr = $('#hmTrade'); if (!tr || $('#hmPartie')) return;
  tr.insertAdjacentHTML('afterend', `<section class="hm-trade hm-partie" id="hmPartie" aria-labelledby="hmPartieT">
      <button class="hm-tr-h" type="button" data-pu="go"><span class="hm-tr-ic" aria-hidden="true">${PU_HEART}</span><span class="hm-tr-t"><b id="hmPartieT">${T('Partie de Commander')}</b><span class="hm-pu-sub"></span></span></button>
      <div class="hm-tr-acts"><button class="btn ghost" type="button" data-pu="go"><span class="hm-pu-go"></span></button><button class="btn ghost" type="button" data-pu="hist"><span>${T('Mes parties')}</span></button><button class="btn ghost hm-pu-drop" type="button" data-pu="drop" hidden><svg class="i" aria-hidden="true"><use href="#i-trash"/></svg></button></div></section>`);
  $('#hmPartie').addEventListener('click', e => { const b = e.target.closest('[data-pu]'); if (!b) return; haptic('tap'); const a = b.dataset.pu; if (a === 'hist') puHist(); else if (a === 'drop') puDropSheet(); else puGo(); });
  puHomePaint();
}
/** Partie en cours de ce téléphone ; laissée de côté trop longtemps (partieStale : 12 h en préparation, 48 h commencée), elle est effacée sans résultat. */
function puCur() {
  const cur = partieLoad(); if (!cur || cur.fin || !partieStale(cur, partieSavedAt())) return cur;
  partieClear(); const r = partieRoom(); if (r && r.id === cur.id) partieRoomOp('end').catch(() => partieRoomForget());
  return null;
}
function puHomePaint() {
  const box = $('#hmPartie'); if (!box) return;
  const cur = PU.el ? partieLoad() : puCur(), live = cur && !cur.fin, x = $('.hm-pu-drop', box);
  x.hidden = !live; box.classList.toggle('live', !!live);
  if (live) { const l = cur.debut ? T('Abandonner la partie') : T('Supprimer la partie'); x.setAttribute('aria-label', l); x.title = l; }
  $('.hm-pu-sub', box).textContent = live ? (cur.debut ? T('En cours · tour {t} · {n} joueurs', { t: cur.tour, n: cur.places.length }) : TN(cur.places.length, 'En préparation · {n} joueur', 'En préparation · {n} joueurs')) : T('Compteur de vie, jusqu\'à 8 joueurs');
  $('.hm-pu-go', box).textContent = live ? T('Reprendre') : T('Nouvelle partie');
}
/** Bouton principal : reprend la partie en cours, sinon en prépare une nouvelle. */
function puGo() {
  const cur = puCur();
  if (cur && !cur.fin) { puOpen(cur); return; }
  puOpen(partieNew({ moi: { nom: puMe() } }));
}

/* ── Écran de la partie (préparation, compteur, fin) ───────────────────────────────────────────── */
function puOpen(st) {
  puClose(); PU.st = st; PU.gone = new Set(); PU.deltas = {}; PU.roomTry = false; PU.low = Infinity;
  const wrap = document.createElement('div'); wrap.className = 'dv pu'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', T('Partie de Commander'));
  PU.el = wrap; wrap.__close = () => puClose();
  wrap.addEventListener('click', puClick);
  wrap.addEventListener('pointerdown', puDown); wrap.addEventListener('pointerup', puUp); wrap.addEventListener('pointercancel', puCancel); wrap.addEventListener('pointerleave', puCancel);
  wrap.addEventListener('contextmenu', e => { if (e.target.closest('.pu-hit')) e.preventDefault(); });
  document.body.appendChild(wrap); holdApp(); puPaint();
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('on')));
  document.addEventListener('visibilitychange', puVis);
}
function puClose() {
  const w = PU.el; if (!w) return; PU.el = null;
  puWatchStop(); puWake(false); document.removeEventListener('visibilitychange', puVis);
  w.classList.remove('on'); setTimeout(() => w.remove(), reduceMotion() ? 0 : 240); releaseApp(); puHomePaint();
}
function puVis() { if (!document.hidden && PU.el && PU.mode === 'game') puWake(true); }
/** Écran allumé pendant le compteur (Wake Lock, si le navigateur l'a). */
async function puWake(on) {
  if (!on) { if (PU.wl) { try { PU.wl.release(); } catch (e) { /* déjà relâché */ } PU.wl = null; } return; }
  if (PU.wl || !navigator.wakeLock || document.visibilityState !== 'visible') return;
  try { PU.wl = await navigator.wakeLock.request('screen'); PU.wl.addEventListener('release', () => { PU.wl = null; }); } catch (e) { PU.wl = null; }
}
/** Nouvel état (action du moteur) : gardé sur l'appareil, repeint. Même objet : action refusée, rien ne bouge. */
function puSet(next, o = {}) {
  if (!next || next === PU.st) return false;
  PU.st = next; if (next.fin) partieClear(); else partieSave(next);
  const me = next.places.find(p => p.sorte === 'moi'); if (me && next.debut && !next.fin) PU.low = Math.min(PU.low ?? Infinity, me.vie);      // plus bas de mes points de vie (badge « Revenant », progress.js)
  if (o.paint !== false) puPaint();
  return true;
}
function puPaint() {
  const el = PU.el, st = PU.st; if (!el || !st) return;
  PU.mode = st.fin ? 'end' : st.debut ? 'game' : 'setup';
  el.classList.toggle('pu-game', PU.mode === 'game');
  if (PU.mode === 'setup') puSetupPaint();
  else if (PU.mode === 'game') { puGamePaint(); puWake(true); }
  else puEndPaint();
}

/* ── Préparation et salle d'attente ────────────────────────────────────────────────────────────── */
function puSetupPaint() {
  const st = PU.st, el = PU.el, me = st.places.find(p => p.sorte === 'moi'), room = partieRoom(), roomOk = room && room.host && room.id === st.id;
  if (!roomOk && !PU.roomTry && puNet()) { PU.roomTry = true; puRoomOpen(); }
  const qr = roomOk ? (() => { try { return qrSvgLogo(partieTableLink(room.c)).svg; } catch (e) { return ''; } })() : '';
  const decks = typeof allDecks === 'function' ? allDecks().filter(d => d && d.name) : [];
  const on = new Set(PU.on), seats = st.places.map(p => {
    const v = PU.view && PU.view.places ? PU.view.places.find(x => x.pos === p.pos) : null, phone = p.sorte === 'moi' || (v && v.dev);
    return `<li class="pu-seat"><span class="pu-pos">${p.pos}</span><span class="pu-who"><b>${esc(p.nom || T('Joueur {n}', { n: p.pos }))}${p.sorte === 'moi' ? ` <small>${T('(toi)')}</small>` : ''}</b><small>${esc(puCmd(p) || (p.sorte === 'invite' && !phone ? T('Invité') : T('Deck pas encore choisi')))}</small></span>
      ${phone ? `<span class="pu-dev${p.sorte === 'moi' || on.has(p.pos) ? ' on' : ''}" title="${T('A rejoint avec son téléphone')}"><svg class="i" aria-hidden="true"><use href="#i-phone"/></svg></span>` : ''}${p.sorte !== 'moi' ? `<button type="button" class="icon-btn pu-x" data-pu="kick" data-pos="${p.pos}" aria-label="${T('Retirer {name}', { name: esc(p.nom || p.pos) })}"><svg class="i"><use href="#i-close"/></svg></button>` : ''}</li>`;
  }).join('');
  el.innerHTML = `<header class="dv-head"><button class="icon-btn dv-back" type="button" data-pu="close" aria-label="${T('Fermer')}"><svg class="i"><use href="#i-back"/></svg></button><div class="dv-title"><b>${T('Nouvelle partie')}</b><span>${TN(st.places.length, '{n} joueur', '{n} joueurs')}</span></div></header>
    <div class="dv-scroll"><div class="dv-body pu-setup">
      <section class="pu-card"><p class="pu-h">${T('Points de départ')}</p><div class="seg pu-fmt" role="radiogroup" aria-label="${T('Points de départ')}"></div></section>
      ${me ? `<section class="pu-card"><p class="pu-h">${T('Mon deck')}</p>${decks.length ? `<label class="sortsel pu-deck"><select data-pu="mydeck" aria-label="${T('Mon deck')}"><option value="">${T('Aucun')}</option>${decks.map(d => `<option value="${esc(d.id)}"${me.deck && me.deck.nom === partieStr(d.name, PRT_LEN.deck) ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>` : `<p class="hint">${T('Aucun deck dans « Mes decks » : tu joueras sans deck affiché.')}</p>`}</section>` : ''}
      <section class="pu-card pu-qr">${qr ? `<div class="pu-qr-img" role="img" aria-label="${T('QR code de la table')}">${qr}</div><div class="pu-qr-t"><b>${T('Les autres scannent ce QR code')}</b><span>${T('Ils choisissent leur place et leur deck, puis rangent leur téléphone. Code : {c}', { c: room.c })}</span></div>`
        : `<div class="pu-qr-t"><b>${T('Joueurs sans téléphone ou hors ligne')}</b><span>${!puOnline() ? T('Hors ligne : ajoute les joueurs ici, le résultat partira au retour du réseau.') : !D.user ? T('Connecte-toi pour que les autres rejoignent la table avec leur téléphone (QR code).') : !CTX.partie ? T('Serveur indisponible : ajoute les joueurs ici.') : T('Ouverture de la table…')}</span>${!D.user && puOnline() ? `<button class="btn ghost small" type="button" data-pu="login">${T('Se connecter')}</button>` : ''}</div>`}</section>
      <section class="pu-card"><p class="pu-h">${T('Autour de la table')}</p><ol class="pu-seats">${seats}</ol>${st.places.length < 8 ? `<button class="plc-add" type="button" data-pu="guest">${T('+ Invité')}</button>` : ''}</section>
      ${st.places.length > 1 ? `<section class="pu-card"><p class="pu-h">${T('Premier joueur')}</p><div class="pu-chips"><button type="button" data-pu="first" data-pos="0" aria-pressed="${!st.premier}">${T('Au hasard')}</button>${st.places.map(p => `<button type="button" data-pu="first" data-pos="${p.pos}" aria-pressed="${st.premier === p.pos}">${esc(p.nom || p.pos)}</button>`).join('')}</div></section>` : ''}
    </div></div>
    <div class="pu-foot"><button class="btn block" type="button" data-pu="start"${st.places.length < 2 ? ' disabled' : ''}>${st.places.length < 2 ? T('Il faut au moins 2 joueurs') : T('Lancer la partie')}</button><button class="link-btn pu-drop" type="button" data-pu="drop">${T('Supprimer cette partie')}</button></div>`;
  mountSeg($('.pu-fmt', el), PRT_FORMATS.map(f => ({ v: String(f), label: String(f) })), String(st.format), v => { puSet(partieSetFormat(PU.st, Number(v))); if (partieRoom()) partieRoomOp('opts', { format: Number(v) }).catch(() => {}); });
  const sel = $('select[data-pu="mydeck"]', el);
  if (sel) sel.onchange = () => { const d = decks.find(x => x.id === sel.value), deck = d ? partieDeckOf(d, puDeckImg(d)) : null; puSet(partieSetPlace(PU.st, me.pos, { deck })); if (partieRoom()) partieRoomOp('me', { deck }).catch(() => {}); };
}
/** Image du commandant d'un deck (petite image Scryfall connue de l'appli), '' sinon. */
function puDeckImg(d) {
  try { const k = commanderKeys(d.text || '')[0], m = k && ((typeof COLL !== 'undefined' && COLL.meta[k]) || (typeof dmOf === 'function' && dmOf(k))); return m && m.im && PRT_IMG_RE.test(m.im) ? m.im : ''; } catch (e) { return ''; }
}
async function puRoomOpen() {
  try {
    const v = await partieRoomCreate(PU.st, { n: puMe(), p: PROF.photo || '', l: I18N.lang });
    PU.view = v; puWatch();
  } catch (e) { PU.view = null; }
  if (PU.el && PU.mode === 'setup') puPaint();
}
function puWatch() {
  puWatchStop();
  PU.stopW = partieRoomWatch((v, x) => {
    if (!PU.el) return;
    if (x && x.gone) { PU.view = null; toast(T('Table fermée par le serveur : continue avec des invités')); puPaint(); return; }
    PU.net = !x || x.net !== false; PU.on = (x && x.on) || [];
    if (v) { PU.view = v; if (PU.mode === 'setup' && v.st === 'wait') puSet(partieFromRoom(PU.st, v), { paint: false }); }
    if (PU.mode === 'setup') puPaint();
  });
}
function puWatchStop() { if (PU.stopW) { PU.stopW(); PU.stopW = null; } }
/** Invité (sans téléphone) : prénom, commandant facultatif. */
function puGuestSheet() {
  openSheet(T('Ajouter un invité'), T('Un joueur sans téléphone ou sans l\'appli'), api => {
    api.body.innerHTML = `<div class="field-in"><label class="label" for="puGn">${T('Prénom')}</label><input type="text" id="puGn" maxlength="24" autocomplete="off"></div>
      <div class="field-in"><label class="label" for="puGc">${T('Commandant (facultatif)')}</label><input type="text" id="puGc" maxlength="80" autocomplete="off"></div>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn" type="button" data-ok>${T('Ajouter')}</button>`);
    const n = $('#puGn', api.body), c = $('#puGc', api.body);
    const ok = async () => {
      const nom = partieStr(n.value, PRT_LEN.nom); if (!nom) { n.focus(); return; }
      const deck = partieDeck({ commandant: c.value }); api.close(); haptic('ok');
      const next = partieAddPlace(PU.st, { sorte: 'invite', nom, deck });
      if (partieRoom() && PU.view) { try { const v = await partieRoomOp('add', { pos: next.places.find(p => !PU.st.places.some(q => q.pos === p.pos)).pos, n: nom, ...(deck ? { deck } : {}) }); PU.view = v; puSet(partieFromRoom(PU.st, v)); return; } catch (e) { /* hors ligne : ici seulement */ } }
      puSet(next);
    };
    [n, c].forEach(x => x.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } }));
    api.foot.addEventListener('click', e => { if (e.target.closest('[data-ok]')) ok(); });
    setTimeout(() => n.focus(), 60);
  });
}
async function puStart() {
  let st = PU.st; if (st.places.length < 2) return;
  if (partieRoom() && PU.view) { try { const v = await partieRoomOp('start'); st = partieFromRoom(st, v); } catch (e) { /* la salle ne répond plus : on joue quand même */ } }
  puWatchStop();
  if (!st.premier) st = partieFirst(st, 0);
  st = partieStart(st); haptic('ok'); puSet(st);
}

/* ── Compteur ─────────────────────────────────────────────────────────────────────────────────── */
/** Ordre de la table pour l'affichage A (tourné vers chacun) : [place, sens] ; sens 0 (en bas), 180 (en haut), 90 (colonne de gauche), 270 (colonne de droite). */
function puLayoutA(places) {
  const ps = places.slice().sort((a, b) => a.pos - b.pos), n = ps.length;
  if (n === 2) return { cols: 1, cells: [{ p: ps[1], r: 180, area: 't' }, { p: ps[0], r: 0, area: 'b' }] };
  const odd = n % 2 === 1, rest = odd ? ps.slice(1) : ps, k = rest.length / 2, cells = [];
  const left = rest.slice(0, k).reverse(), right = rest.slice(k);      // dans le sens des aiguilles d'une montre : colonne de gauche de bas en haut, puis la droite de haut en bas
  for (let i = 0; i < k; i++) { cells.push({ p: left[i], r: 90, row: i + 1, col: 1 }); cells.push({ p: right[i], r: 270, row: i + 1, col: 2 }); }
  if (odd) cells.push({ p: ps[0], r: 0, row: k + 1, col: '1 / span 2' });
  return { cols: 2, rows: k + (odd ? 1 : 0), cells };
}
function puTile(st, p, r) {
  const dead = !!p.elimine, act = st.actif === p.pos && !dead, d = PU.deltas[p.pos], tags = [];
  if (st.monarque === p.pos) tags.push(`<span class="pu-tag" title="${T('Monarque')}"><svg class="i" aria-hidden="true"><use href="#i-crown"/></svg></span>`);
  if (st.initiative === p.pos) tags.push(`<span class="pu-tag" title="${T('Initiative')}"><svg class="i" aria-hidden="true"><use href="#i-castle"/></svg></span>`);
  if (p.compteurs.poison) tags.push(`<span class="pu-tag" title="${T('Poison')}"><svg class="i" aria-hidden="true"><use href="#i-poison"/></svg>${p.compteurs.poison}</span>`);
  if (p.compteurs.impot) tags.push(`<span class="pu-tag" title="${T('Impôt de commandant')}">+${p.compteurs.impot * 2}</span>`);
  const bl = Object.values(p.blessures).reduce((a, x) => Math.max(a, x), 0); if (bl) tags.push(`<span class="pu-tag" title="${T('Blessures de commandant (la plus haute)')}"><svg class="i" aria-hidden="true"><use href="#i-sword"/></svg>${bl}</span>`);
  return `<div class="pu-t${dead ? ' dead' : ''}${act ? ' act' : ''}${r === 90 || r === 270 ? ' rv' : ''}" data-pos="${p.pos}" style="--r:${r || 0}deg;--h:${[265, 200, 150, 28, 340, 52, 180, 300][(p.pos - 1) % 8]}"><div class="pu-in">
      <button type="button" class="pu-hit m" data-d="-1" aria-label="${T('{name} : −1 point de vie', { name: esc(p.nom || p.pos) })}"><span aria-hidden="true">−</span></button>
      <button type="button" class="pu-hit p" data-d="1" aria-label="${T('{name} : +1 point de vie', { name: esc(p.nom || p.pos) })}"><span aria-hidden="true">+</span></button>
      <button type="button" class="pu-nm" data-pu="pl" data-pos="${p.pos}">${esc(p.nom || T('Joueur {n}', { n: p.pos }))}${puCmd(p) ? `<small>${esc(puCmd(p))}</small>` : ''}</button>
      <b class="pu-life" aria-live="polite">${dead ? '<svg class="i pu-dead" aria-hidden="true"><use href="#i-skull"/></svg>' : p.vie}</b>${d && d.n ? `<span class="pu-dl">${d.n > 0 ? '+' : ''}${d.n}</span>` : ''}
      <span class="pu-tags">${tags.join('')}</span>
      ${act ? `<button type="button" class="pu-turn" data-pu="next">${T('Fin du tour')}</button>` : ''}
    </div></div>`;
}
function puGamePaint() {
  const st = PU.st, el = PU.el, aff = puAff(), prop = partieProposals(st).find(x => !PU.gone.has(x.pos + ':' + x.cause + ':' + (x.par || '')));
  let body = '';
  if (aff === 'A') {
    const L = puLayoutA(st.places);
    body = `<div class="pu-a" style="--cols:${L.cols};--rows:${L.rows || 2}">${L.cells.map(c => `<div class="pu-cell" style="${c.row ? `grid-row:${c.row};grid-column:${c.col}` : ''}">${puTile(st, c.p, c.r)}</div>`).join('')}</div>`;
  } else if (aff === 'B') {
    body = `<div class="pu-b">${st.places.slice().sort((a, b) => a.pos - b.pos).map(p => `<div class="pu-cell">${puTile(st, p, 0)}</div>`).join('')}</div>`;
  } else {
    const n = st.places.length, ps = st.places.slice().sort((a, b) => a.pos - b.pos);
    const w = n <= 4 ? 40 : n <= 6 ? 36 : 32, h = n <= 4 ? 25 : n <= 6 ? 21 : 18, rx = 50 - w / 2 - 0.5, ry = 50 - h / 2 - 0.5;      // tuiles autour d'un ovale, sans déborder de l'écran
    body = `<div class="pu-c" style="--w:${w}%;--h2:${h}%">${ps.map((p, i) => { const a = Math.PI / 2 + (2 * Math.PI * i) / n; return `<div class="pu-cell" style="--x:${(50 + rx * Math.cos(a)).toFixed(1)}%;--y:${(50 + ry * Math.sin(a)).toFixed(1)}%">${puTile(st, p, 0)}</div>`; }).join('')}<div class="pu-c-mid"><b>${T('Tour {t}', { t: st.tour })}</b><span>${esc(puName(st, st.actif))}</span></div></div>`;
  }
  el.innerHTML = `<div class="pu-g aff-${aff}">${aff !== 'A' ? `<div class="pu-bar"><span><b>${T('Tour {t}', { t: st.tour })}</b> · ${esc(T('{name} joue', { name: puName(st, st.actif) }))}</span><button type="button" class="btn small" data-pu="next">${T('Tour suivant')}</button><button type="button" class="icon-btn pu-more" data-pu="menu" aria-label="${T('Options de la partie')}"><svg class="i"><use href="#i-more"/></svg></button></div>` : ''}
      ${body}${aff === 'A' ? `<button type="button" class="pu-mid" data-pu="menu" aria-label="${T('Options de la partie')}"><svg class="i"><use href="#i-more"/></svg><small>${T('Tour {t}', { t: st.tour })}</small></button>` : ''}
      ${prop ? `<div class="pu-prop" role="alert"><span>${esc(prop.cause === 'vie' ? T('{name} n\'a plus de points de vie', { name: puName(st, prop.pos) }) : prop.cause === 'poison' ? T('{name} a 10 marqueurs poison', { name: puName(st, prop.pos) }) : T('{name} a reçu 21 blessures du commandant de {src}', { name: puName(st, prop.pos), src: puName(st, prop.par) }))}</span><button type="button" class="btn small" data-pu="elim" data-pos="${prop.pos}" data-c="${prop.cause}" data-par="${prop.par || ''}">${T('Éliminer')}</button><button type="button" class="btn ghost small" data-pu="keep" data-k="${prop.pos}:${prop.cause}:${prop.par || ''}">${T('Pas encore')}</button></div>` : ''}
    </div>`;
}
/** ±n points de vie (cumul affiché quelques secondes sur la tuile). */
function puLife(pos, n) {
  const next = partieLife(PU.st, pos, n); if (next === PU.st) return;
  const d = PU.deltas[pos] = PU.deltas[pos] && Date.now() - PU.deltas[pos].t < PRT_MERGE_MS ? PU.deltas[pos] : { n: 0, t: 0 };
  d.n += n; d.t = Date.now(); clearTimeout(d.to); d.to = setTimeout(() => { if (PU.deltas[pos] === d) { delete PU.deltas[pos]; if (PU.mode === 'game') puPaintTile(pos); } }, PRT_MERGE_MS);
  haptic('tap'); puSet(next, { paint: false }); puPaintTile(pos);
  if (partieProposals(PU.st).some(x => x.pos === pos && !PU.gone.has(x.pos + ':' + x.cause + ':' + (x.par || '')))) puPaint();
}
/** Repeint une seule tuile (appuis rapides : pas de liste entière refaite). */
function puPaintTile(pos) {
  const t = PU.el && $(`.pu-t[data-pos="${pos}"]`, PU.el), p = PU.st.places.find(x => x.pos === pos); if (!t || !p) { puPaint(); return; }
  const r = getComputedStyle(t).getPropertyValue('--r').trim(), tmp = document.createElement('div'); tmp.innerHTML = puTile(PU.st, p, parseFloat(r) || 0);
  t.replaceWith(tmp.firstElementChild);
}
/* Appui maintenu sur une moitié de tuile : ±10 tout de suite, puis toutes les 0,5 s ; appui court : ±1 (au relâché). */
function puDown(e) {
  const h = e.target.closest('.pu-hit'); if (!h || PU.mode !== 'game') return;
  const t = h.closest('.pu-t'), pos = Number(t.dataset.pos), d = Number(h.dataset.d);
  puCancel(); PU.hold = { pos, d, long: false, t: setTimeout(function rep() { if (!PU.hold) return; PU.hold.long = true; puLife(pos, d * 10); PU.hold.t = setTimeout(rep, 500); }, 450) };
}
function puUp(e) {
  const h = PU.hold; if (!h) return; clearTimeout(h.t); PU.hold = null;
  if (!h.long && e.target.closest && e.target.closest('.pu-hit')) puLife(h.pos, h.d);
}
function puCancel() { if (PU.hold) { clearTimeout(PU.hold.t); PU.hold = null; } }

/** Fiche d'un joueur : vie, blessures de commandant (par adversaire, 2e commandant pour les partenaires), compteurs, monarque, initiative, élimination, nom. */
function puPlayerSheet(pos) {
  openSheet(puName(PU.st, pos), '', api => {
    api.wrap.classList.add('pu-sheet');
    const step = (k, v, lbl, extra = '') => `<div class="pu-row"><span>${lbl}</span><span class="qstep"><button type="button" data-k="${k}" data-n="-1"${extra}>−</button><b>${v}</b><button type="button" data-k="${k}" data-n="1"${extra}>+</button></span></div>`;
    const paint = () => {
      const st = PU.st, p = st.places.find(x => x.pos === pos); if (!p) { api.close(); return; }
      $('h2', api.wrap).textContent = p.nom || T('Joueur {n}', { n: pos });
      const opp = st.places.filter(x => x.pos !== pos);
      api.body.innerHTML = `<div class="pu-lifebig"><button type="button" data-k="v" data-n="-10">−10</button><button type="button" data-k="v" data-n="-1">−1</button><b>${p.vie}</b><button type="button" data-k="v" data-n="1">+1</button><button type="button" data-k="v" data-n="10">+10</button></div>
        <p class="pu-h">${T('Blessures de commandant reçues')}</p>${opp.map(o => { const two = puCmd(o).includes(' + '); return step('b', p.blessures[String(o.pos)] || 0, esc(T('de {name}', { name: o.nom || o.pos })) + (puCmd(o) ? ` <small>${esc(two ? puCmd(o).split(' + ')[0] : puCmd(o))}</small>` : ''), ` data-s="${o.pos}"`) + (two ? step('b', p.blessures[o.pos + 'b'] || 0, `<small>${esc(puCmd(o).split(' + ')[1])}</small>`, ` data-s="${o.pos}" data-b="1"`) : ''); }).join('')}
        <p class="pu-h">${T('Compteurs')}</p>${PU_CNT.map(([k, l]) => step('c', p.compteurs[k] || 0, T(l), ` data-c="${k}"`)).join('')}
        <div class="pu-chips pu-marks"><button type="button" data-mk="monarque" aria-pressed="${st.monarque === pos}"><svg class="i" aria-hidden="true"><use href="#i-crown"/></svg>${T('Monarque')}</button><button type="button" data-mk="initiative" aria-pressed="${st.initiative === pos}"><svg class="i" aria-hidden="true"><use href="#i-castle"/></svg>${T('Initiative')}</button></div>
        <div class="pu-acts">${p.elimine ? `<button class="btn ghost" type="button" data-x="revive">${T('Revenir en jeu')}</button>` : `<button class="btn ghost" type="button" data-x="elim">${T('Éliminer')}</button>`}<button class="btn ghost" type="button" data-x="ren">${T('Renommer')}</button></div>`;
    };
    paint();
    api.body.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return; let st = PU.st;
      if (b.dataset.k === 'v') st = partieLife(st, pos, Number(b.dataset.n));
      else if (b.dataset.k === 'b') st = partieCmdDamage(st, pos, Number(b.dataset.s), Number(b.dataset.n), { second: !!b.dataset.b });
      else if (b.dataset.k === 'c') st = partieCounter(st, pos, b.dataset.c, Number(b.dataset.n));
      else if (b.dataset.mk) st = partieMark(st, b.dataset.mk, st[b.dataset.mk] === pos ? 0 : pos);
      else if (b.dataset.x === 'revive') st = partieRevive(st, pos);
      else if (b.dataset.x === 'elim') { puElimSheet(pos, '', 0, () => paint()); return; }
      else if (b.dataset.x === 'ren') { puRename(pos, () => paint()); return; }
      else return;
      haptic('tap'); if (puSet(st)) paint();
    });
  });
}
function puElimSheet(pos, cause, par, done) {
  openSheet(T('Éliminer {name} ?', { name: puName(PU.st, pos) }), '', api => {
    const causes = [['vie', T('Plus de points de vie')], ['commandant', T('Blessures de commandant')], ['poison', T('Poison')], ['abandon', T('Abandon')], ['autre', T('Autre')]];
    api.body.innerHTML = `<div class="pu-chips">${causes.map(([c, l]) => `<button type="button" data-c="${c}" aria-pressed="${c === (cause || 'vie')}">${l}</button>`).join('')}</div>`;
    let c = cause || 'vie';
    api.body.addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; c = b.dataset.c; $$('[data-c]', api.body).forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn danger" type="button" data-ok>${T('Éliminer')}</button>`);
    api.foot.addEventListener('click', e => {
      if (!e.target.closest('[data-ok]')) return; api.close(); haptic('ok');
      puSet(partieEliminate(PU.st, pos, c, { par }));
      const alive = PU.st.places.filter(p => !p.elimine);
      if (alive.length === 1) toast(T('{name} est le dernier en jeu', { name: alive[0].nom || alive[0].pos }), { label: T('Terminer'), fn: () => puEndSheet() });
      if (done) done();
    });
  });
}
function puRename(pos, done) {
  openSheet(T('Renommer'), '', api => {
    const p = PU.st.places.find(x => x.pos === pos);
    api.body.innerHTML = `<div class="field-in"><label class="label" for="puRn">${T('Prénom')}</label><input type="text" id="puRn" maxlength="24" autocomplete="off" value="${esc(p ? p.nom : '')}"></div>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn" type="button" data-ok>${T('Enregistrer')}</button>`);
    const inp = $('#puRn', api.body), ok = () => { api.close(); puSet(partieSetPlace(PU.st, pos, { nom: inp.value })); if (done) done(); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
    api.foot.addEventListener('click', e => { if (e.target.closest('[data-ok]')) ok(); });
    setTimeout(() => inp.select(), 60);
  });
}
/** Menu « … » : affichage (A, B, C), tour suivant, premier joueur au hasard, annuler, terminer, mettre en pause, abandonner. */
function puMenu() {
  openSheet(T('Partie'), T('Tour {t} · {name} joue', { t: PU.st.tour, name: puName(PU.st, PU.st.actif) }), api => {
    api.wrap.classList.add('pu-sheet');
    const last = PU.st.journal[PU.st.journal.length - 1];
    api.body.innerHTML = `<p class="pu-h">${T('Affichage')}</p><div class="pu-affs" role="radiogroup" aria-label="${T('Affichage')}">${[['A', T('Tourné vers chacun')], ['B', T('Liste')], ['C', T('Table')]].map(([v, l]) => `<button type="button" role="radio" data-aff="${v}" aria-checked="${puAff() === v}"><i class="pu-ico pu-ico-${v}" aria-hidden="true"></i><span>${l}</span></button>`).join('')}</div>
      <div class="pu-menu">
        <button type="button" data-m="next"><b>${T('Tour suivant')}</b></button>
        ${PU.st.tour <= 1 ? `<button type="button" data-m="first"><b>${T('Premier joueur au hasard')}</b></button>` : ''}
        <button type="button" data-m="undo"${last ? '' : ' disabled'}><b>${T('Annuler la dernière action')}</b></button>
        <button type="button" data-m="end"><b>${T('Terminer la partie')}</b><small>${T('Vainqueur, résultat envoyé aux joueurs')}</small></button>
        <button type="button" data-m="pause"><b>${T('Mettre en pause')}</b><small>${T('Reprendre plus tard depuis l\'accueil')}</small></button>
        <button type="button" data-m="drop" class="danger-txt"><b>${T('Abandonner la partie')}</b><small>${T('Rien n\'est gardé')}</small></button>
      </div>`;
    api.body.addEventListener('click', e => {
      const a = e.target.closest('[data-aff]'); if (a) { puAffSet(a.dataset.aff); haptic('tap'); api.close(); puPaint(); return; }
      const m = e.target.closest('[data-m]'); if (!m || m.disabled) return; const k = m.dataset.m; api.close();
      if (k === 'next') puSet(partieNextTurn(PU.st));
      else if (k === 'first') { const st = partieFirst(PU.st, 0); puSet(st); toast(T('{name} commence', { name: puName(st, st.premier) })); }
      else if (k === 'undo') { puSet(partieUndo(PU.st)); toast(T('Dernière action annulée')); }
      else if (k === 'end') puEndSheet();
      else if (k === 'pause') puClose();
      else if (k === 'drop') puDropSheet();
    });
  });
}
/** Abandon (partie commencée) ou suppression (en préparation) : depuis le menu de la partie, l'écran de préparation ou la carte de l'accueil. */
function puDropSheet() {
  const st = PU.el ? PU.st : partieLoad(); if (!st || st.fin) { puHomePaint(); return; }
  const go = !!st.debut;
  openSheet(go ? T('Abandonner la partie ?') : T('Supprimer la partie ?'), '', api => {
    api.body.innerHTML = `<p class="cf-msg">${go ? T('La partie est effacée de ce téléphone, sans résultat.') : T('La partie en préparation est effacée de ce téléphone.')}</p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn danger" type="button" data-ok>${go ? T('Abandonner') : T('Supprimer')}</button>`);
    api.foot.addEventListener('click', e => { if (!e.target.closest('[data-ok]')) return; api.close(); partieClear(); if (partieRoom()) partieRoomOp('end').catch(() => partieRoomForget()); if (PU.el) puClose(); else puHomePaint(); });
  });
}

/* ── Fin de la partie ─────────────────────────────────────────────────────────────────────────── */
function puEndSheet() {
  const st = PU.st, alive = st.places.filter(p => !p.elimine), win = new Set(alive.length === 1 ? [alive[0].pos] : []);
  openSheet(T('Qui a gagné ?'), T('Touche le ou les vainqueurs'), api => {
    const paint = () => { api.body.innerHTML = `<div class="pu-wins">${st.places.map(p => `<button type="button" data-w="${p.pos}" aria-pressed="${win.has(p.pos)}"><span>${esc(p.nom || p.pos)}</span><small>${p.elimine ? T('éliminé') : T('{n} PV', { n: p.vie })}</small></button>`).join('')}</div>`; };
    paint();
    api.body.addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (!b) return; const pos = Number(b.dataset.w); if (win.has(pos)) win.delete(pos); else win.add(pos); haptic('tap'); paint(); });
    api.setFoot(`<button class="btn ghost" type="button" data-nw>${T('Aucun vainqueur')}</button><button class="btn" type="button" data-ok>${T('Terminer')}</button>`);
    api.foot.addEventListener('click', e => {
      const none = e.target.closest('[data-nw]'), ok = e.target.closest('[data-ok]'); if (!none && !ok) return;
      api.close(); const fin = partieEnd(PU.st, none ? [] : [...win]); PU.res = partieDone(fin); PU.st = fin; haptic('ok'); puWake(false); puPaint(); puHomePaint();
      const me = fin.places.find(p => p.sorte === 'moi'); if (me && win.has(me.pos) && !none && typeof rateMoment === 'function') rateMoment('partie');
      if (me && typeof prgGame === 'function') prgGame(fin, me, Math.min(PU.low ?? Infinity, me.vie));      // « Revenant », « Bourreau »… (progress.js)      // victoire : un bon moment pour demander une note (help.js, appli Android)
    });
  });
}
function puEndPaint() {
  const st = PU.st, r = PU.res || partieResult(st), link = partieResultLink(r, { max: PU_QR_MAX });
  let qr = ''; try { qr = link ? qrSvgLogo(link).svg : ''; } catch (e) { qr = ''; }
  const ps = r.places.slice().sort((a, b) => a.rang - b.rang || a.pos - b.pos), room = partieRoom();
  PU.el.innerHTML = `<header class="dv-head"><button class="icon-btn dv-back" type="button" data-pu="close" aria-label="${T('Fermer')}"><svg class="i"><use href="#i-back"/></svg></button><div class="dv-title"><b>${T('Partie terminée')}</b><span>${esc([TN(r.tours, '{n} tour', '{n} tours'), puDur(r.duree)].join(' · '))}</span></div></header>
    <div class="dv-scroll"><div class="dv-body pu-setup">
      <section class="pu-card"><ol class="pu-rank">${ps.map(p => `<li class="${p.vainqueur ? 'win' : ''}"><span class="pu-pos">${p.vainqueur ? '<svg class="i" aria-hidden="true"><use href="#i-trophy"/></svg>' : p.rang}</span><span class="pu-who"><b>${esc(p.nom || T('Joueur {n}', { n: p.pos }))}</b>${p.commandant || p.deck ? `<small>${esc(p.commandant || p.deck)}</small>` : ''}</span></li>`).join('')}</ol></section>
      ${qr ? `<section class="pu-card pu-qr big"><div class="pu-qr-img" role="img" aria-label="${T('QR code du résultat')}">${qr}</div><div class="pu-qr-t"><b>${T('Résultat à scanner')}</b><span>${T('Les joueurs qui n\'ont pas rejoint la table le scannent pour garder la partie dans leur historique.')}</span></div></section>` : ''}
      ${r.places.some(p => p.sorte === 'invite') ? puInviteCard() : ''}
      <p class="hint">${room ? T('Les joueurs qui ont rejoint avec leur téléphone ont reçu le résultat.') : ''} ${D.user ? T('Partie gardée dans « Mes parties » ; envoyée à ton compte dès que possible.') : T('Partie gardée sur ce téléphone (« Mes parties »).')}</p>
    </div></div>
    <div class="pu-foot"><button class="btn ghost" type="button" data-pu="again">${T('Rejouer avec les mêmes')}</button><button class="btn" type="button" data-pu="close">${T('Fermer')}</button></div>`;
}

/* ── Faire découvrir l'appli : QR code de la fin de partie (invités de la table), carte « garde tes parties » chez les joueurs venus par le navigateur,
   page d'accueil du lien d'invitation (?invite=partie, ouvert dans l'appli si elle est installée : App Links) ─────────────────────────────── */
const PU_INV_URL = PRT_SITE + '?invite=partie';
const puAndroid = () => typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent || '');
const puIos = () => typeof PWA !== 'undefined' && PWA.ios();
/** Fin de partie, chez le créateur : QR code « télécharge l'appli » et lien à partager, pour les invités sans l'appli. */
function puInviteCard() {
  let qr = ''; try { qr = qrSvgLogo(PU_INV_URL).svg; } catch (e) { qr = ''; }
  return `<section class="pu-card pu-qr pu-inv">${qr ? `<div class="pu-qr-img" role="img" aria-label="${T('QR code pour installer Mana Orbit')}">${qr}</div>` : ''}<div class="pu-qr-t"><b>${T('Fais découvrir Mana Orbit')}</b><span>${T('Les invités le scannent : l\'appli pour leurs prochaines parties, leurs statistiques et leur collection.')}</span><button class="btn ghost small" type="button" data-pu="share-app">${T('Partager le lien')}</button></div></section>`;
}
/** Joueur venu par le navigateur du téléphone (table rejointe, résultat scanné) : Google Play sur Android, écran d'accueil sur iPhone ; rien dans l'appli ni sur ordinateur. */
function puGetAppHtml() {
  if ((typeof isNativeApp === 'function' && isNativeApp()) || (typeof PWA !== 'undefined' && PWA.standalone())) return '';
  if (puAndroid()) return `<section class="pu-card pu-getapp"><b>${T('Garde tes parties et tes statistiques')}</b><span>${T('Mana Orbit sur ton téléphone : compteur de points de vie, statistiques de tes decks, scanner de cartes. Gratuit.')}</span><a class="btn block" href="${esc(PLAY_URL)}" target="_blank" rel="noopener">${T('Installer depuis Google Play')}</a></section>`;
  if (puIos()) return `<section class="pu-card pu-getapp"><b>${T('Garde tes parties et tes statistiques')}</b><span>${T('Ajoute Mana Orbit à ton écran d\'accueil : Partager, puis « Sur l\'écran d\'accueil ». Gratuit.')}</span></section>`;
  return '';
}
/** Lien d'invitation ouvert dans le navigateur d'un téléphone : présentation et installation (l'accueil du premier lancement est passé) ; dans l'appli ou sur ordinateur : rien de plus. */
function puInvite() {
  const html = puGetAppHtml(); if (!html) return;
  if (typeof OB !== 'undefined' && OB.el && typeof obClose === 'function') { obMark(); obClose(); }
  openSheet(T('Bienvenue sur Mana Orbit'), T('Un joueur de ta table t\'invite'), api => {
    api.wrap.classList.add('pu-sheet');
    api.body.innerHTML = `<ul class="pu-invl"><li>${T('Le compteur de points de vie de toute la table, sur un téléphone ou un par joueur')}</li><li>${T('Tes parties et les statistiques de tes decks')}</li><li>${T('Un scanner de cartes Magic dans 11 langues et la cote de ta collection')}</li><li>${T('Ta liste d\'échange en un lien ou un QR code')}</li></ul>${html}`;
    api.setFoot(`<button class="btn ghost block" type="button" data-close>${T('Continuer dans le navigateur')}</button>`);
  });
}

/* ── Clics de l'écran ─────────────────────────────────────────────────────────────────────────── */
function puClick(e) {
  const h = e.target.closest('.pu-hit'); if (h && e.detail === 0) { puLife(Number(h.closest('.pu-t').dataset.pos), Number(h.dataset.d)); return; }      // clavier (Entrée, Espace) : ±1
  const b = e.target.closest('[data-pu]'); if (!b) return;
  const a = b.dataset.pu, pos = Number(b.dataset.pos);
  if (a === 'close') puClose();
  else if (a === 'login') openAccount();
  else if (a === 'guest') puGuestSheet();
  else if (a === 'kick') { if (partieRoom() && PU.view && PU.view.places && PU.view.places.some(x => x.pos === pos)) partieRoomOp('kick', { pos }).then(v => { PU.view = v; }).catch(() => {}); puSet(partieRemovePlace(PU.st, pos)); }
  else if (a === 'first') { puSet(pos ? partieFirst(PU.st, pos) : { ...PU.st, premier: 0 }); }
  else if (a === 'start') puStart();
  else if (a === 'drop') puDropSheet();
  else if (a === 'menu') { haptic('tap'); puMenu(); }
  else if (a === 'next') { haptic('tap'); puSet(partieNextTurn(PU.st)); }
  else if (a === 'pl') puPlayerSheet(pos);
  else if (a === 'elim') puElimSheet(pos, b.dataset.c, Number(b.dataset.par) || 0);
  else if (a === 'keep') { PU.gone.add(b.dataset.k); puPaint(); }
  else if (a === 'share-app' && typeof shareOut === 'function') shareOut({ title: 'Mana Orbit', text: T('Le compteur de points de vie et le scanner de cartes Magic de notre partie :'), url: PU_INV_URL });
  else if (a === 'again') { const old = PU.st; let st = partieNew({ format: old.format, moi: null }); for (const p of old.places) st = partieAddPlace(st, { pos: p.pos, sorte: p.sorte === 'compte' ? 'invite' : p.sorte, nom: p.nom, deck: p.deck }); PU.res = null; PU.roomTry = false; puSet(st); }
}

/* ── Liens : rejoindre une table (?table=CODE), résultat (?partie=…) ───────────────────────────── */
function puLaunch(qs) {
  const x = partieParseUrl(qs); if (!x) return false;
  if (x.table) setTimeout(() => puJoin(x.table), 500);
  else if (x.partie) setTimeout(() => puClaimSheet(x.partie), 500);
  else toast(T('Résultat de partie illisible'));
  return true;
}
/** Rejoindre la table : se connecter ou continuer en invité, place, deck ; puis attente (le téléphone peut être rangé) jusqu'au résultat. */
function puJoin(code) {
  if (PU.joinEl) PU.joinEl.__close();
  const wrap = document.createElement('div'); wrap.className = 'dv pu pu-join'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', T('Rejoindre la partie'));
  const J = { code, peek: null, err: '', guest: false, pos: 0, deck: '', name: '', cmd: '', joined: partieRoom() && partieRoom().c === code ? partieRoom() : null, view: null, stop: null };
  PU.joinEl = wrap; wrap.__close = () => { if (J.stop) J.stop(); PU.joinEl = null; wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 240); releaseApp(); };
  const decks = () => (D.user && typeof allDecks === 'function' ? allDecks().filter(d => d && d.name) : []);
  const paint = () => {
    const P = J.peek, taken = new Map(((J.view || P || {}).places || []).map(x => [x.pos, x.n]));
    let body;
    if (J.joined) {
      const v = J.view, res = v && v.res, me = v ? v.me : J.joined.pos;
      body = res ? `<section class="pu-card"><p class="pu-h">${T('Partie terminée')}</p><ol class="pu-rank">${res.places.slice().sort((a, b) => a.rang - b.rang).map(p => `<li class="${p.vainqueur ? 'win' : ''}${p.pos === me ? ' me' : ''}"><span class="pu-pos">${p.vainqueur ? '<svg class="i" aria-hidden="true"><use href="#i-trophy"/></svg>' : p.rang}</span><span class="pu-who"><b>${esc(p.nom || p.pos)}</b>${p.commandant || p.deck ? `<small>${esc(p.commandant || p.deck)}</small>` : ''}</span></li>`).join('')}</ol><p class="hint">${T('Gardée dans « Mes parties ».')}</p></section>${puGetAppHtml()}`
        : `<section class="pu-card pu-wait">${PU_HEART}<b>${T('Tu es à la place {n}', { n: me })}</b><p>${esc(T('Range ton téléphone : la partie se joue sur le téléphone de {name}. Le résultat arrivera ici.', { name: (v && v.host) || (P && P.host) || '' }))}</p>${v && v.st === 'live' ? `<p class="hint">${T('Partie en cours…')}</p>` : `<p class="hint">${T('En attente du lancement…')}</p>`}<button class="btn ghost small" type="button" data-j="leave">${T('Quitter la table')}</button></section>`;
    } else if (J.err) body = `<section class="pu-card"><p class="pu-h">${T('Table introuvable')}</p><p class="hint">${esc(J.err)}</p></section>`;
    else if (!P) body = `<section class="pu-card"><p class="hint">${T('Lecture de la table…')}</p></section>`;
    else if (!D.user && !J.guest) body = `<section class="pu-card"><p class="pu-h">${esc(T('Partie de {name}', { name: P.host || '' }))}</p><p class="hint">${T('Connecte-toi pour garder la partie dans ton historique, ou continue en invité.')}</p><div class="pu-acts"><button class="btn" type="button" data-j="login">${T('Se connecter')}</button><button class="btn ghost" type="button" data-j="guest">${T('Continuer en invité')}</button></div></section>`;
    else {
      const seats = Array.from({ length: P.size || 8 }, (_, i) => i + 1);
      body = `<section class="pu-card"><p class="pu-h">${esc(T('Partie de {name} · {f} points', { name: P.host || '', f: P.format }))}</p>
          ${J.guest ? `<div class="field-in"><label class="label" for="puJn">${T('Prénom')}</label><input type="text" id="puJn" maxlength="24" autocomplete="off" value="${esc(J.name)}"></div>` : ''}
          <p class="pu-h">${T('Ta place autour de la table')}</p><div class="pu-places">${seats.map(n => `<button type="button" data-seat="${n}" aria-pressed="${J.pos === n}"${taken.has(n) ? ' disabled' : ''}><b>${n}</b><small>${esc(taken.get(n) || T('libre'))}</small></button>`).join('')}</div>
          ${!J.guest && decks().length ? `<p class="pu-h">${T('Ton deck')}</p><label class="sortsel pu-deck"><select data-j="deck"><option value="">${T('Aucun')}</option>${decks().map(d => `<option value="${esc(d.id)}"${J.deck === d.id ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>` : ''}
          ${J.guest ? `<div class="field-in"><label class="label" for="puJc">${T('Commandant (facultatif)')}</label><input type="text" id="puJc" maxlength="80" autocomplete="off" value="${esc(J.cmd)}"></div>` : ''}</section>`;
    }
    wrap.innerHTML = `<header class="dv-head"><button class="icon-btn dv-back" type="button" data-j="close" aria-label="${T('Fermer')}"><svg class="i"><use href="#i-back"/></svg></button><div class="dv-title"><b>${T('Rejoindre la partie')}</b><span>${esc(T('Table {c}', { c: code }))}</span></div></header>
      <div class="dv-scroll"><div class="dv-body pu-setup">${body}</div></div>${!J.joined && P && (D.user || J.guest) ? `<div class="pu-foot"><button class="btn block" type="button" data-j="go"${J.pos ? '' : ' disabled'}>${J.pos ? T('Prendre la place {n}', { n: J.pos }) : T('Choisis ta place')}</button></div>` : ''}`;
  };
  const watch = () => { if (J.stop) J.stop(); J.stop = partieRoomWatch((v, x) => { if (x && x.gone) { J.joined = null; J.err = x.gone === 'kicked' ? T('Le créateur t\'a retiré de la table.') : T('La table est fermée.'); } else if (v) J.view = v; paint(); }); };
  wrap.addEventListener('input', e => { if (e.target.id === 'puJn') J.name = e.target.value; else if (e.target.id === 'puJc') J.cmd = e.target.value; });      // gardés quand l'écran se repeint (choix de la place)
  wrap.addEventListener('change', e => { if (e.target.closest('[data-j="deck"]')) J.deck = e.target.value; });
  wrap.addEventListener('click', async e => {
    const s = e.target.closest('[data-seat]'); if (s && !s.disabled) { J.pos = Number(s.dataset.seat); haptic('tap'); paint(); return; }
    const b = e.target.closest('[data-j]'); if (!b || b.tagName === 'SELECT') return;
    const a = b.dataset.j;
    if (a === 'close') wrap.__close();
    else if (a === 'login') { openAccount(); const t = setInterval(() => { if (!wrap.isConnected) { clearInterval(t); return; } if (D.user) { clearInterval(t); paint(); } }, 800); }
    else if (a === 'guest') { J.guest = true; paint(); setTimeout(() => { const n = $('#puJn', wrap); if (n) n.focus(); }, 60); }
    else if (a === 'leave') { await partieRoomLeave(); J.joined = null; J.view = null; if (J.stop) J.stop(); wrap.__close(); }
    else if (a === 'go') {
      const nom = J.guest ? partieStr(($('#puJn', wrap) || {}).value || J.name, PRT_LEN.nom) : puMe(); if (J.guest && !nom) { const n = $('#puJn', wrap); if (n) n.focus(); return; }
      const d = decks().find(x => x.id === J.deck), deck = J.guest ? partieDeck({ commandant: J.cmd }) : d ? partieDeckOf(d, puDeckImg(d)) : null;
      b.disabled = true;
      try { J.view = await partieRoomJoin(code, { pos: J.pos, n: nom, p: J.guest ? '' : PROF.photo || '', l: I18N.lang, ...(deck ? { deck } : {}), guest: J.guest }); J.joined = partieRoom(); haptic('ok'); watch(); }
      catch (er) { toast(er && er.code === 'taken' ? T('Place déjà prise : choisis-en une autre') : er && er.code === 'net' ? T('Pas de réseau : réessaie') : T('Impossible de rejoindre la table')); try { J.peek = await partiePeek(code); } catch (x) { /* garde l'ancienne vue */ } }
      paint();
    }
  });
  document.body.appendChild(wrap); holdApp(); paint(); requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('on')));
  if (J.joined) watch();
  else partiePeek(code).then(p => { J.peek = p; if (p && p.st && p.st !== 'wait') J.err = T('La partie a déjà commencé.'); paint(); }, er => { J.err = er && er.code === 'net' ? T('Pas de réseau : la table ne peut pas être lue.') : T('Cette table n\'existe plus.'); paint(); });
}
/** Résultat scanné (?partie=…) : « c'était moi : place N » → historique (et compte). */
function puClaimSheet(r) {
  openSheet(T('Résultat d\'une partie'), new Date(r.date).toLocaleDateString(LOC(), { day: 'numeric', month: 'long' }) + ' · ' + TN(r.tours, '{n} tour', '{n} tours'), api => {
    api.wrap.classList.add('pu-sheet');
    api.body.innerHTML = `<p class="pu-h">${T('Quelle place était la tienne ?')}</p><div class="pu-wins">${r.places.slice().sort((a, b) => a.rang - b.rang).map(p => `<button type="button" data-cl="${p.pos}"><span>${p.vainqueur ? '<svg class="i" aria-hidden="true"><use href="#i-trophy"/></svg>' : ''}${esc(p.nom || p.pos)}</span><small>${esc(p.commandant || p.deck || T('Place {n}', { n: p.pos }))}</small></button>`).join('')}</div><p class="hint">${D.user ? T('Ajoutée à « Mes parties » et à ton compte.') : T('Ajoutée à « Mes parties » sur ce téléphone.')}</p>`;
    api.body.insertAdjacentHTML('beforeend', puGetAppHtml());
    api.body.addEventListener('click', e => { const b = e.target.closest('[data-cl]'); if (!b) return; if (partieClaim(r, Number(b.dataset.cl))) { haptic('ok'); api.close(); toast(T('Partie ajoutée à « Mes parties »')); puHomePaint(); } });
  });
}

/* ── Mes parties ──────────────────────────────────────────────────────────────────────────────── */
async function puHist(tab) {
  openSheet(T('Mes parties'), '', api => {
    api.wrap.classList.add('pu-sheet');
    let items = partieHist().sort((a, b) => b.date - a.date), view = tab === 'stats' ? 'stats' : 'list';
    api.body.innerHTML = `<div class="seg pu-tabs" role="radiogroup" aria-label="${T('Mes parties')}"></div><div class="pu-hbody"></div>`;
    mountSeg($('.pu-tabs', api.body), [{ v: 'list', label: T('Parties') }, { v: 'stats', label: T('Statistiques') }], view, v => { view = v; paint(); });
    const paint = () => {
      const won = items.filter(x => x.moi && (x.places.find(p => p.pos === x.moi) || {}).vainqueur).length;
      let sub = $('.sheet-head p', api.wrap); if (!sub) { sub = document.createElement('p'); $('.sheet-head > div', api.wrap).appendChild(sub); }
      sub.textContent = items.length ? TN(items.length, '{n} partie · {w} gagnée(s)', '{n} parties · {w} gagnée(s)', { n: items.length, w: won }) : '';
      $('.pu-hbody', api.body).innerHTML = view === 'stats' ? puStatsHtml(partieStats(items)) : items.length ? `<ul class="pu-hist">${items.map(x => { const me = x.places.find(p => p.pos === x.moi), w = x.places.filter(p => p.vainqueur).map(p => p.nom || p.pos); return `<li><button type="button" data-h="${esc(x.id)}"><span class="pu-hd">${esc(new Date(x.date).toLocaleDateString(LOC(), { day: 'numeric', month: 'short' }))}</span><span class="pu-who"><b>${me && me.vainqueur ? '<svg class="i" aria-hidden="true"><use href="#i-trophy"/></svg>' : ''}${esc(x.places.map(p => p.nom || p.pos).join(', '))}</b><small>${esc([me && (me.commandant || me.deck), w.length ? T('vainqueur : {name}', { name: w.join(', ') }) : T('aucun vainqueur'), TN(x.tours, '{n} tour', '{n} tours')].filter(Boolean).join(' · '))}</small></span></button></li>`; }).join('')}</ul>`
        : `<p class="hint">${T('Aucune partie pour l\'instant. Lance-en une depuis l\'accueil : les résultats arrivent ici.')}</p>`;
    };
    paint();
    if (D.user && CTX.partie && puOnline()) partieHistFetch(0, 50).then(j => {      // historique du compte : parties jouées sur d'autres téléphones
      const by = new Map(items.map(x => [x.id, x])); for (const it of (j && j.items) || []) { const c = partieHistClean(it); if (c && !by.has(c.id)) by.set(c.id, c); }
      items = [...by.values()].sort((a, b) => b.date - a.date); if (sheets.includes(api)) paint();
    }, () => {});
    api.body.addEventListener('click', e => { const b = e.target.closest('[data-h]'); if (!b) return; const x = items.find(y => y.id === b.dataset.h); if (x) puHistOne(x); });
  });
}
/** Statistiques (core : partieStats) : chiffres clés, mes decks, adversaires, commandants vus à ma table. */
function puStatsHtml(s) {
  if (!s.n) return `<p class="hint">${T('Tes statistiques arrivent avec tes parties : celles où ta place est connue (créées ici, table rejointe, ou « c\'était moi » sur un résultat).')}</p>`;
  const pc = (a, b) => (b ? Math.round((a / b) * 100) : 0) + ' %', bar = (a, b) => `<span class="pu-sbar" aria-hidden="true"><i style="width:${b ? Math.round((a / b) * 100) : 0}%"></i></span>`;
  const sec = (h, sub, rows) => (rows ? `<p class="pu-h">${h}</p>${sub ? `<p class="hint pu-st-sub">${sub}</p>` : ''}<ul class="pu-st">${rows}</ul>` : '');
  return `<div class="pu-kpis">
      <div><b>${s.n}</b><small>${TN(s.n, 'partie', 'parties')}</small></div>
      <div><b>${pc(s.wins, s.n)}</b><small>${TN(s.wins, '{n} victoire', '{n} victoires')}</small></div>
      <div><b>${esc(puDur(s.duree))}</b><small>${T('{n} tours en moyenne', { n: String(s.tours).replace('.', I18N.lang === 'en' ? '.' : ',') })}</small></div>
      <div><b>${s.serie}</b><small>${T('d\'affilée (record {n})', { n: s.best })}</small></div></div>
    ${sec(T('Mes decks'), '', s.decks.slice(0, 15).map(d => `<li><span class="pu-who"><b>${esc(d.nom || d.commandant)}</b>${d.nom && d.commandant && d.commandant !== d.nom ? `<small>${esc(d.commandant)}</small>` : ''}</span><span class="pu-sv"><b>${pc(d.wins, d.n)}</b><small>${esc(T('{w} sur {n}', { w: d.wins, n: d.n }))}</small></span>${bar(d.wins, d.n)}</li>`).join(''))}
    ${sec(T('Adversaires'), T('Tes victoires – les siennes'), s.adv.slice(0, 15).map(a => `<li><span class="pu-who"><b>${esc(a.nom)}</b><small>${TN(a.n, '{n} partie ensemble', '{n} parties ensemble')}</small></span><span class="pu-sv"><b>${a.mine} – ${a.theirs}</b></span>${bar(a.mine, a.mine + a.theirs)}</li>`).join(''))}
    ${sec(T('Commandants à ta table'), '', s.cmds.slice(0, 15).map(c => `<li><span class="pu-who"><b>${esc(c.nom)}</b><small>${TN(c.n, 'vu une fois', 'vu {n} fois')}</small></span><span class="pu-sv"><b>${TN(c.wins, '{n} victoire', '{n} victoires')}</b></span>${bar(c.wins, c.n)}</li>`).join(''))}`;
}
/** Page d'un deck (viewer.js) : ses parties, d'après l'historique (deck choisi à la table sous ce nom) ; '' s'il n'a jamais été joué. */
function puDeckStatHtml(name) {
  let s; try { s = partieStats(partieHist(), { deck: name }); } catch (e) { return ''; }
  if (!s.n) return '';
  return `<div class="pu-dstat"><svg class="i" aria-hidden="true"><use href="#i-trophy"/></svg><span>${esc(TN(s.wins, '{n} victoire', '{n} victoires') + ' ' + TN(s.n, 'sur {n} partie', 'sur {n} parties') + ' (' + Math.round(s.rate * 100) + ' %)')}</span><button class="link-btn" type="button" data-act="games">${T('Statistiques')}</button></div>`;
}
function puHistOne(x) {
  const link = partieResultLink(x, { max: PU_QR_MAX }); let qr = ''; try { qr = link ? qrSvgLogo(link).svg : ''; } catch (e) { qr = ''; }
  openSheet(new Date(x.date).toLocaleString(LOC(), { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }), [T('{f} points', { f: x.format }), TN(x.tours, '{n} tour', '{n} tours'), puDur(x.duree)].join(' · '), api => {
    api.wrap.classList.add('pu-sheet');
    api.body.innerHTML = `<ol class="pu-rank">${x.places.slice().sort((a, b) => a.rang - b.rang).map(p => `<li class="${p.vainqueur ? 'win' : ''}${p.pos === x.moi ? ' me' : ''}"><span class="pu-pos">${p.vainqueur ? '<svg class="i" aria-hidden="true"><use href="#i-trophy"/></svg>' : p.rang}</span><span class="pu-who"><b>${esc(p.nom || p.pos)}</b>${p.commandant || p.deck ? `<small>${esc(p.commandant || p.deck)}</small>` : ''}</span></li>`).join('')}</ol>
      ${qr ? `<div class="pu-qr pu-card big"><div class="pu-qr-img" role="img" aria-label="${T('QR code du résultat')}">${qr}</div><div class="pu-qr-t"><b>${T('Partager le résultat')}</b><span>${T('Un autre joueur le scanne pour l\'ajouter à ses parties.')}</span></div></div>` : ''}`;
    api.setFoot(`<button class="btn ghost danger-txt" type="button" data-del>${T('Retirer')}</button><button class="btn" type="button" data-close>${T('Fermer')}</button>`);
    api.foot.addEventListener('click', async e => {
      if (!e.target.closest('[data-del]')) return; api.close();
      try { if (x.sv && D.user && CTX.partie) await partieHistDelete(x.id); else partieHistDrop(x.id); toast(T('Partie retirée de « Mes parties »')); } catch (er) { toast(T('Pas de réseau : réessaie plus tard')); }
      while (sheets.length) sheets[sheets.length - 1].close(); puHist();
    });
  });
}
