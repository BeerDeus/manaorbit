/* ── partie-ui.js : compteur de vie (parties de Commander, Standard ou libre), l'interface (le moteur est dans partie.js) ───────────────────
   · Accueil : carte « Compteur de vie » sous l'Échange (nouvelle partie ou reprendre, mes parties).
   · Préparation : format en un appui (Commander, Standard 1 contre 1, Libre ; gardé pour la fois suivante : deckdeal:partie:jeu), points de départ, ma place et mon deck, QR code de la table (compte connecté et en ligne : les autres rejoignent avec leur téléphone),
     invités ajoutés ici (sans téléphone, ou hors ligne), premier joueur, lancement.
   · Compteur (le téléphone du créateur, posé sur la table) : trois affichages au choix dans le menu « … » — A tourné vers chacun, B liste, C table —
     toucher la moitié gauche / droite d'un joueur : −1 / +1 (maintenu : ±10, la moitié touchée s'allume) ; son nom (un bouton : icône de réglages, ses compteurs
     en pastilles) : sa fiche (blessures de commandant, poison, impôt, monarque…). Bouton rond « … » de A sur une jointure de la grille, jamais sur un nom ni des PV ;
     illustration du commandant en fond de chaque tuile (art_crop de Scryfall, sous un dégradé de la couleur du joueur), PV à la taille de la tuile.
   · Fin : vainqueur(s), résultat gardé et envoyé (partie.js › partieDone), QR code du résultat pour ceux qui n'ont pas rejoint.
   · Liens : ?table=CODE (rejoindre : se connecter ou continuer en invité, place, deck ; puis la table en direct au choix : ses points comptés d'ici, toute la table pour
     un co-hôte, des deltas que le téléphone du créateur applique ; partie annulée ou abandonnée : l'écran se ferme avec la raison) et ?partie=… (résultat : « c'était moi »).
   · Téléphones de la table pendant la partie (créateur) : état envoyé à la salle (regroupé ~1 s), saisies des autres téléphones appliquées une fois chacune,
     demandes de co-hôte (feuille Accepter / Refuser), « Tout le monde est co-hôte » et saisie coupée (préparation, menu « … »).
   · Sans réseau (soirée en boutique) : « Mon QR joueur », « Ajouter un joueur par QR », messages hors ligne, état de l'envoi du résultat : partie-qr.js.
   · Grande table sur deux téléphones (5 à 8 joueurs) : « Répartir sur 2 téléphones », un 2e téléphone devient l'écran 2 (?table=CODE › « Devenir l'écran 2 ») ; chacun
     sa moitié de la table en affichage A (puLayoutHalf), bascule « Ma moitié · L'autre moitié · Toute la table ». Table en direct : illustration du commandant en fond.
   Aucune publicité pendant la partie (écran plein, au-dessus de tout). Écran gardé allumé (Wake Lock) pendant le compteur. */
const PU = { el: null, st: null, mode: '', room: null, view: null, on: [], net: true, stopW: null, gone: new Set(), deltas: {}, hold: new Map(), joinEl: null, roomTry: false };
const PU_AFF_KEY = 'deckdeal:partie:aff', PU_AFFS = ['A', 'B', 'C'];
const PU_CNT = [['poison', 'Poison'], ['impot', 'Impôt de commandant'], ['energie', 'Énergie'], ['experience', 'Expérience']];
const PU_HEART = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.6 3.1 4.3 6.6-1.8 4.8-9.3 9.4-9.3 9.4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const PU_QR_MAX = 360;      // données du QR code d'un résultat : noms raccourcis au besoin, le code reste lisible par un téléphone (version 15 au plus)
const puAff = () => { try { const v = localStorage.getItem(PU_AFF_KEY); return PU_AFFS.includes(v) ? v : 'A'; } catch (e) { return 'A'; } };
const puAffSet = v => { try { localStorage.setItem(PU_AFF_KEY, v); } catch (e) { /* choix pour cette fois */ } };
/* Format choisi la dernière fois, et les points de départ de chaque format : { j, f: { commander, standard, libre } } (rien de lisible : Commander, 40). */
const PU_JEU_KEY = 'deckdeal:partie:jeu';
function puPref() {
  let o = null; try { o = JSON.parse(localStorage.getItem(PU_JEU_KEY) || 'null'); } catch (e) { o = null; }
  const f = {}; for (const k of PRT_JEUX) f[k] = o && o.f && partieVieOk(k, o.f[k]) ? o.f[k] : PRT_JEU[k].def;
  return { j: o && PRT_JEUX.includes(o.j) ? o.j : 'commander', f };
}
function puPrefSave(st) { const p = puPref(), j = partieJeu(st); p.j = j; p.f[j] = st.format; try { localStorage.setItem(PU_JEU_KEY, JSON.stringify(p)); } catch (e) { /* choix pour cette fois */ } }
const puJeuName = j => (j === 'standard' ? T('Standard') : j === 'libre' ? T('Libre') : T('Commander'));
/** « Standard · 20 PV » : format et points de départ d'une partie, d'un résultat ou d'une salle (sans jeu : Commander). */
const puJeuTxt = x => puJeuName(partieJeu(x)) + ' · ' + T('{n} PV', { n: x.format });
/** Places d'après la salle (partie.js › partieFromRoom), le format et les points de départ restant ceux de ce téléphone (le créateur les règle ici). */
const puFromRoom = (st, v) => { const n = partieFromRoom(st, v); return n === st ? st : partieSetJeu(n, partieJeu(st), st.format); };
const puOnline = () => !(typeof navigator !== 'undefined' && navigator.onLine === false);
const puNet = () => !!(D.user && CTX.partie && puOnline());      // salle d'attente possible : compte, serveur qui l'annonce, réseau
/** Mon nom : pseudo du profil, sinon nom du compte ; sans rien, « Hôte » pour le créateur (avant : « Moi », gardé tel quel dans les résultats et l'historique des autres
 *  joueurs), « Joueur » pour qui rejoint ou montre son QR joueur. Le créateur le change à la préparation (crayon de sa place). */
const puMe = host => (PROF.name || (D.user && D.user.displayName) || '').trim().slice(0, 24) || (host ? T('Hôte') : T('Joueur'));
const puName = (st, pos) => { const p = st.places.find(x => x.pos === pos); return p ? p.nom || T('Joueur {n}', { n: pos }) : ''; };
const puCmd = p => (p.deck && (p.deck.commandant || p.deck.nom)) || '';
const puDur = s => { const m = Math.round(s / 60); return m < 60 ? T('{n} min', { n: m }) : T('{h} h {m}', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') }); };

/* ── Accueil ───────────────────────────────────────────────────────────────────────────────────── */
function puHomeInit() {
  const tr = $('#hmTrade'); if (!tr || $('#hmPartie')) return;
  tr.insertAdjacentHTML('afterend', `<section class="hm-trade hm-partie" id="hmPartie" aria-labelledby="hmPartieT">
      <button class="hm-tr-h" type="button" data-pu="go"><span class="hm-tr-ic" aria-hidden="true">${PU_HEART}</span><span class="hm-tr-t"><b id="hmPartieT">${T('Compteur de vie')}</b><span class="hm-pu-sub"></span></span></button><button class="icon-btn hm-pu-qr" type="button" data-pu="myqr" aria-label="${T('Mon QR joueur')}" title="${T('Mon QR joueur')}"><svg class="i" aria-hidden="true"><use href="#i-qr"/></svg></button>
      <div class="hm-tr-acts"><button class="btn ghost" type="button" data-pu="go"><span class="hm-pu-go"></span></button><button class="btn ghost" type="button" data-pu="hist"><span>${T('Mes parties')}</span></button><button class="btn ghost hm-pu-drop" type="button" data-pu="drop" hidden><svg class="i" aria-hidden="true"><use href="#i-trash"/></svg></button></div></section>`);
  $('#hmPartie').addEventListener('click', e => { const b = e.target.closest('[data-pu]'); if (!b) return; haptic('tap'); const a = b.dataset.pu; if (a === 'hist') puHist(); else if (a === 'drop') puDropSheet(); else if (a === 'myqr') puMyQr(); else puGo(); });      // myqr : partie-qr.js
  puHomePaint();
}
/** Partie en cours de ce téléphone ; laissée de côté trop longtemps (partieStale : 12 h en préparation, 48 h commencée), elle est effacée sans résultat. */
function puCur() {
  const cur = partieLoad(); if (!cur || cur.fin || !partieStale(cur, partieSavedAt())) return cur;
  partieClear(); const r = partieRoom(); if (r && r.id === cur.id) partieRoomEnd('stale');      // les téléphones de la table l'apprennent (raison : trop vieille)
  return null;
}
function puHomePaint() {
  const box = $('#hmPartie'); if (!box) return;
  const cur = PU.el ? partieLoad() : puCur(), live = cur && !cur.fin, x = $('.hm-pu-drop', box);
  x.hidden = !live; box.classList.toggle('live', !!live);
  if (live) { const l = cur.debut ? T('Abandonner la partie') : T('Supprimer la partie'); x.setAttribute('aria-label', l); x.title = l; }
  $('.hm-pu-sub', box).textContent = live ? (cur.debut ? T('En cours · tour {t} · {n} joueurs', { t: cur.tour, n: cur.places.length }) : TN(cur.places.length, 'En préparation · {n} joueur', 'En préparation · {n} joueurs')) : T('Commander, Standard ou libre');
  $('.hm-pu-go', box).textContent = live ? T('Reprendre') : T('Nouvelle partie');
}
/** Bouton principal : reprend la partie en cours, sinon en prépare une nouvelle (dans le format de la dernière fois, ou jeu : lien ?compteur=<format> d'une annonce du bot Discord). */
function puGo(jeu) {
  const cur = puCur();
  if (cur && !cur.fin) { puOpen(cur); return; }
  const pr = puPref(), j = PRT_JEUX.includes(jeu) ? jeu : pr.j; puOpen(partieNew({ jeu: j, format: pr.f[j], moi: { nom: puMe(true) } }));
}

/* ── Écran de la partie (préparation, compteur, fin) ───────────────────────────────────────────── */
function puOpen(st) {
  puClose(); PU.st = st; PU.gone = new Set(); PU.deltas = {}; PU.roomTry = false; PU.low = Infinity;
  const wrap = document.createElement('div'); wrap.className = 'dv pu'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', T('Compteur de vie'));
  PU.el = wrap; wrap.__close = () => { if (typeof puJeuBack === 'function' && puJeuBack()) return; puClose(); };      // Retour du téléphone : d'abord le mode « attaque » ou le tirage en cours (partie-jeu.js)
  wrap.addEventListener('click', puClick);
  wrap.addEventListener('pointerdown', puDown); wrap.addEventListener('pointerup', puUp); wrap.addEventListener('pointercancel', puCancel); wrap.addEventListener('pointerleave', puCancel);
  wrap.addEventListener('contextmenu', e => { if (e.target.closest('.pu-hit')) e.preventDefault(); });
  if (typeof puSeatDrag === 'function') { wrap.addEventListener('pointerdown', puSeatDrag); wrap.addEventListener('keydown', puJeuKey); }      // préparation : ordre des places (partie-jeu.js)
  document.body.appendChild(wrap); holdApp(); puPaint();
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('on')));
  const rm = partieRoom(); PU.lvJ = ''; PU.lvOff = '';
  if (rm && rm.host && rm.id === st.id && !st.fin && !PU.stopW) { puWatch(); if (st.debut) { partieRoomPace(true); puLiveSoon(); } }      // partie reprise : la table suit de nouveau (saisies des autres téléphones, état envoyé)
}
function puClose() {
  const w = PU.el; if (!w) return; PU.el = null;
  puWatchStop(); natAwake(false, 'partie'); for (const h of PU.hold.values()) clearTimeout(h.t); PU.hold.clear();
  PU.ord = false; if (typeof puJeuStop === 'function') puJeuStop();      // partie-jeu.js : chrono, verrou d'orientation, attaque, tirage
  w.classList.remove('on'); setTimeout(() => w.remove(), reduceMotion() ? 0 : 240); releaseApp(); puHomePaint();
}
/** Nouvel état (action du moteur) : gardé sur l'appareil, repeint. Même objet : action refusée, rien ne bouge. */
function puSet(next, o = {}) {
  if (!next || next === PU.st) return false;
  if (PU.atk && (next.actif !== PU.st.actif || !next.debut || next.fin)) PU.atk = null;      // tour suivant, fin : le mode « attaque » s'arrête
  PU.st = next; if (next.fin) partieClear(); else partieSave(next);
  puLiveSoon();      // partie commencée avec une table : l'état part vers les autres téléphones (regroupé)
  const me = next.places.find(p => p.sorte === 'moi'); if (me && next.debut && !next.fin) PU.low = Math.min(PU.low ?? Infinity, me.vie);      // plus bas de mes points de vie (badge « Revenant », progress.js)
  if (o.paint !== false) puPaint();
  return true;
}
function puPaint() {
  const el = PU.el, st = PU.st; if (!el || !st) return;
  if (PU.duoFor !== st.id) { PU.duoFor = st.id; PU.duo = puDuoLoad(st); }      // deux téléphones : le réglage de cette partie
  PU.mode = st.fin ? 'end' : st.debut ? 'game' : 'setup';
  el.classList.toggle('pu-game', PU.mode === 'game');
  if (PU.mode === 'setup') puSetupPaint();
  else if (PU.mode === 'game') puGamePaint();
  else puEndPaint();
  natAwake(PU.mode === 'game', 'partie');      // écran gardé allumé pendant le compteur (appli Android : la coque ; navigateur : Wake Lock, native.js)
  if (PU.mode !== 'game' && typeof puJeuStop === 'function') puJeuStop();      // préparation, fin : orientation rendue, chrono arrêté (partie-jeu.js)
  if (PU.mode !== 'end') puDuoSync();
}

/* ── Préparation et salle d'attente ────────────────────────────────────────────────────────────── */
function puSetupPaint() {
  if (PU.drag) { PU.dragPaint = true; return; }      // une place glissée (ordre des places, partie-jeu.js) : repeint après le dépôt
  const st = PU.st, el = PU.el, me = st.places.find(p => p.sorte === 'moi'), room = partieRoom(), roomOk = room && room.host && room.id === st.id && puOnline(), jeu = partieJeu(st);      // hors ligne : ni QR code de la table ni co-hôtes (partie-qr.js)
  if (!roomOk && !PU.roomTry && puNet()) { PU.roomTry = true; puRoomOpen(); }
  puQrSetup();
  const qr = roomOk ? (() => { try { return qrSvgLogo(partieTableLink(room.c)).svg; } catch (e) { return ''; } })() : '';
  const decks = typeof allDecks === 'function' ? allDecks().filter(d => d && d.name) : [];
  const on = new Set(PU.on), ord = !!PU.ord && st.places.length > 1, seats = st.places.map((p, i) => {      // ord : « Changer l'ordre » (glisser, ↑ / ↓ : partie-jeu.js)
    const v = PU.view && PU.view.places ? PU.view.places.find(x => x.pos === p.pos) : null, phone = p.sorte === 'moi' || (v && v.dev), nm = esc(p.nom || T('Joueur {n}', { n: p.pos }));
    return `<li class="pu-seat${ord ? ' ord' : ''}" data-pos="${p.pos}">${ord && typeof puSeatGrip === 'function' ? puSeatGrip(p, i) : `<span class="pu-pos">${i + 1}</span>`}<span class="pu-who"><b>${nm}${p.sorte === 'moi' ? ` <small>${T('(toi)')}</small>` : ''}${puCarteTag(p)}</b><small>${esc(puCmd(p) || (p.sorte === 'invite' && !phone ? T('Invité') : T('Deck pas encore choisi')))}</small></span>
      ${ord && typeof puSeatArrows === 'function' ? puSeatArrows(p, i, st.places.length) : `${phone ? `<span class="pu-dev${p.sorte === 'moi' || on.has(p.pos) ? ' on' : ''}" title="${T('A rejoint avec son téléphone')}"><svg class="i" aria-hidden="true"><use href="#i-phone"/></svg></span>` : ''}${p.sorte === 'moi' ? `<button type="button" class="icon-btn pu-x pu-ren" data-pu="ren" data-pos="${p.pos}" aria-label="${T('Renommer {name}', { name: nm })}" title="${T('Ton prénom à la table')}"><svg class="i"><use href="#i-edit"/></svg></button>` : `<button type="button" class="icon-btn pu-x" data-pu="kick" data-pos="${p.pos}" aria-label="${T('Retirer {name}', { name: nm })}"><svg class="i"><use href="#i-close"/></svg></button>`}`}</li>`;
  }).join('');
  const sc0 = $('.dv-scroll', el), top0 = sc0 ? sc0.scrollTop : 0;      // repeint (salle, ordre des places) : la page reste où elle était
  el.innerHTML = `<header class="dv-head"><button class="icon-btn dv-back" type="button" data-pu="close" aria-label="${T('Fermer')}"><svg class="i"><use href="#i-back"/></svg></button><div class="dv-title"><b>${T('Nouvelle partie')}</b><span>${TN(st.places.length, '{n} joueur', '{n} joueurs')}</span></div><button class="icon-btn pu-hdq" type="button" data-pu="myqr" aria-label="${T('Mon QR joueur')}" title="${T('Mon QR joueur')}"><svg class="i" aria-hidden="true"><use href="#i-qr"/></svg></button></header>
    <div class="dv-scroll"><div class="dv-body pu-setup">
      <section class="pu-card pu-jeu-card"><p class="pu-h">${T('Format')}</p><div class="seg pu-jeu" role="radiogroup" aria-label="${T('Format')}"></div>
        ${jeu === 'commander' ? `<p class="pu-h">${T('Points de départ')}</p><div class="seg pu-fmt" role="radiogroup" aria-label="${T('Points de départ')}"></div>`
          : jeu === 'libre' ? `<p class="pu-h">${T('Points de départ')}</p><div class="pu-vie" role="group" aria-label="${T('Points de départ')}">${[-10, -1].map(n => `<button type="button" data-pu="vie" data-n="${n}"${st.format + n < 1 ? ' disabled' : ''}>−${-n}</button>`).join('')}<b aria-live="polite">${st.format}</b>${[1, 10].map(n => `<button type="button" data-pu="vie" data-n="${n}"${st.format + n > PRT_VIE_MAX ? ' disabled' : ''}>+${n}</button>`).join('')}</div>` : ''}
        <p class="hint pu-jeu-hint">${jeu === 'standard' ? T('20 points de vie, 1 contre 1 (une place de plus au besoin) : poison, énergie, expérience. Ni commandant ni blessures de commandant.') : jeu === 'libre' ? T('Points de vie au choix, jusqu\'à 8 joueurs : poison, monarque, initiative. Sans blessures de commandant.') : T('Jusqu\'à 8 joueurs : blessures de commandant, impôt, monarque, initiative, poison.')}</p></section>
      ${me ? `<section class="pu-card"><p class="pu-h">${T('Mon deck')}</p>${decks.length ? `<label class="sortsel pu-deck"><select data-pu="mydeck" aria-label="${T('Mon deck')}"><option value="">${T('Aucun')}</option>${decks.map(d => `<option value="${esc(d.id)}"${me.deck && me.deck.nom === partieStr(d.name, PRT_LEN.deck) ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>${me.deck && (puArt(me) || puCmd(me)) ? `<div class="pu-mydk" style="--h:${puHue(me.pos)}">${puArt(me) ? `<img class="pu-art" alt="" loading="lazy" decoding="async" src="${esc(puArt(me))}">` : ''}<span>${esc(puCmd(me))}</span></div>` : ''}` : `<p class="hint">${T('Aucun deck dans « Mes decks » : tu joueras sans deck affiché.')}</p>`}</section>` : ''}
      <section class="pu-card pu-qr">${qr ? `<div class="pu-qr-img" role="img" aria-label="${T('QR code de la table')}">${qr}</div><div class="pu-qr-t"><b>${T('Les autres scannent ce QR code')}</b><span>${T('Ils choisissent leur place et leur deck, puis rangent leur téléphone. Code : {c}', { c: room.c })}</span></div>`
        : `<div class="pu-qr-t"><b>${T('Joueurs sans téléphone ou hors ligne')}</b><span>${!puOnline() ? T('Hors ligne : ajoute les joueurs par leur QR joueur ou en invités ; le résultat partira au retour du réseau.') : !D.user ? T('Connecte-toi pour que les autres rejoignent la table avec leur téléphone (QR code).') : !CTX.partie ? T('Serveur indisponible : ajoute les joueurs ici.') : T('Ouverture de la table…')}</span>${!D.user && puOnline() ? `<button class="btn ghost small" type="button" data-pu="login">${T('Se connecter')}</button>` : ''}</div>`}</section>
      ${!puOnline() ? puOffHtml() : ''}${roomOk ? `<section class="pu-card"><label class="switch-row" for="puAllco"><span class="t"><b>${T('Tout le monde est co-hôte')}</b><span class="hint">${T('Chaque téléphone qui rejoint compte aussi les points de toute la table et passe au tour suivant. Abandonner, éliminer ou terminer reste sur ce téléphone.')}</span></span><span class="switch"><input type="checkbox" id="puAllco"${PU.view && PU.view.allco ? ' checked' : ''}><i></i></span></label></section>` : ''}
      ${puDuoCardHtml(st, roomOk)}
      <section class="pu-card pu-table-card"><div class="pu-h-row"><p class="pu-h">${T('Autour de la table')}</p>${st.places.length > 1 ? `<button type="button" class="link-btn pu-ord-b" data-pu="ord" aria-pressed="${ord}">${ord ? T('Terminé') : T('Changer l\'ordre')}</button>` : ''}</div>${st.places.length > 1 && typeof puPlanHtml === 'function' ? puPlanHtml(st) : ''}<ol class="pu-seats">${seats}</ol>${st.places.length < 8 ? `<div class="pu-adds"><button class="plc-add" type="button" data-pu="guest">${T('+ Invité')}</button><button class="plc-add pu-qradd" type="button" data-pu="scan"><svg class="i" aria-hidden="true"><use href="#i-qr"/></svg>${T('Ajouter un joueur par QR')}</button></div>` : ''}${roomOk && PU.view && PU.view.st === 'wait' && PU.view.size < 8 && (PU.view.places || []).length >= PU.view.size ? `<button class="plc-add" type="button" data-pu="seat+">${T('+ Une place de plus')}</button>` : ''}</section>
      ${st.places.length > 1 ? `<section class="pu-card"><p class="pu-h">${T('Premier joueur')}</p><div class="pu-chips"><button type="button" data-pu="first" data-pos="0" aria-pressed="${!st.premier}">${T('Au hasard')}</button>${st.places.map(p => `<button type="button" data-pu="first" data-pos="${p.pos}" aria-pressed="${st.premier === p.pos}">${esc(p.nom || p.pos)}</button>`).join('')}</div></section>` : ''}
    </div></div>
    <div class="pu-foot"><button class="btn block" type="button" data-pu="start"${st.places.length < 2 ? ' disabled' : ''}>${st.places.length < 2 ? T('Il faut au moins 2 joueurs') : T('Lancer la partie')}</button><button class="link-btn pu-drop" type="button" data-pu="drop">${T('Supprimer cette partie')}</button></div>`;
  if (top0) { const s2 = $('.dv-scroll', el); if (s2) s2.scrollTop = top0; }
  mountSeg($('.pu-jeu', el), [{ v: 'commander', label: T('Commander'), sub: T('jusqu\'à 8') }, { v: 'standard', label: T('Standard'), sub: T('1 contre 1') }, { v: 'libre', label: T('Libre'), sub: T('PV au choix') }], jeu, v => puJeuSet(v, puPref().f[v]));
  if ($('.pu-fmt', el)) mountSeg($('.pu-fmt', el), PRT_FORMATS.map(f => ({ v: String(f), label: String(f) })), String(st.format), v => puVieSet(Number(v)));
  const ac = $('#puAllco', el); if (ac) ac.onchange = () => puAllco(ac.checked);
  const du = $('#puDuo', el); if (du) du.onchange = () => puDuoToggle(du.checked);
  const sel = $('select[data-pu="mydeck"]', el);
  if (sel) sel.onchange = () => {
    const d = decks.find(x => x.id === sel.value), deck = d ? partieDeckOf(d, puDeckImg(d)) : null, send = dk => { puSet(partieSetPlace(PU.st, me.pos, { deck: dk })); if (partieRoom()) partieRoomOp('me', { deck: dk }).catch(() => {}); };
    send(deck);
    if (d && deck && !deck.image) puDeckImgLoad(d).then(im => { const cur = PU.st && PU.st.places.find(p => p.pos === me.pos); if (im && PU.mode === 'setup' && cur && cur.deck && cur.deck.nom === deck.nom && !cur.deck.image) send(partieDeckOf(d, im)); });      // fiche du commandant lue à l'instant : l'image suit (tuile, salle, résultat)
  };
  puArtSoon();
}
/** Plus haute place prise dans la salle (vue du serveur), 0 sans salle. */
const puViewMax = () => (PU.view && Array.isArray(PU.view.places) ? PU.view.places.reduce((a, x) => Math.max(a, x.pos), 0) : 0);
/** Réglages de la salle (format, points de départ, places), envoyés un instant après le dernier appui (le ±1 des points de départ en Libre). */
function puRoomOpts(o, now) {
  clearTimeout(PU.ot); if (!partieRoom() || !PU.view) return;
  const go = () => partieRoomOp('opts', o).then(v => { PU.view = v; if (PU.el && PU.mode === 'setup') puPaint(); }).catch(() => {});
  if (now) go(); else PU.ot = setTimeout(go, 500);
}
/** Format choisi (un appui) : points de départ de ce format la dernière fois, table de 2 en Standard (plus si des places sont déjà prises), gardé pour la fois suivante. */
function puJeuSet(jeu, f) {
  const next = partieSetJeu(PU.st, jeu, f); if (!puSet(next)) return;
  puPrefSave(next); puRoomOpts({ jeu, format: next.format, size: partieRoomSize(next, puViewMax()) }, true);
}
/** Points de départ (Commander : 40, 30, 25, 20 ; Libre : 1 à 999). */
function puVieSet(f) {
  const next = partieSetFormat(PU.st, f); if (!puSet(next)) return;
  puPrefSave(next); puRoomOpts({ jeu: partieJeu(next), format: next.format });
}
/** Carte de présentation d'un deck, comme dans « Mes decks » (core.js › dkCoverCard) : l'image choisie pour le deck, sinon son commandant, sinon sa carte la plus chère ; null : deck vide. */
const puCoverCard = d => { try { return dkCoverCard(d.text || '', k => puMeta(k)); } catch (e) { return null; } };
/** Image d'un deck (petite image Scryfall connue de l'appli : collection ou cache des decks) : sa carte de présentation (deck Standard « Elfes » sans commandant compris), '' sinon. */
function puDeckImg(d) {
  try { const c = puCoverCard(d), m = c && puMeta(c.key); return m && m.im && PRT_IMG_RE.test(m.im) ? m.im : ''; } catch (e) { return ''; }
}
/** Même chose, la fiche de la carte lue au besoin : cache des decks relu (dmLoad), sinon Scryfall (dmFetch, gardée sur l'appareil). Avant, une carte hors de la
 *  collection n'avait d'image que si « Mes decks » avait été ouvert pendant la session : la place partait sans. '' : hors ligne, carte inconnue. */
async function puDeckImgLoad(d) {      // lecture déjà partie pour la même carte (puArtSoon : dmFetch ne la refait pas) : son résultat attendu
  let im = puDeckImg(d); if (im || typeof dmFetch !== 'function') return im;
  try { if (typeof dmLoad === 'function') await dmLoad(); if (PU.artP) await PU.artP; im = puDeckImg(d); if (im) return im; const c = puCoverCard(d); if (c) await dmFetch([{ key: c.key, name: c.name }]); } catch (e) { /* hors ligne */ }
  return puDeckImg(d);
}
/* ── Illustration du commandant en fond de sa tuile ──────────────────────────────────────────── */
/** Fiche Scryfall d'une carte connue de l'appli (collection, cache des decks : builder.js › DM), null sinon. */
const puMeta = name => { try { const k = ownKey(name); return (typeof COLL !== 'undefined' && COLL.meta[k]) || (typeof DM !== 'undefined' && DM[k]) || null; } catch (e) { return null; } };
/** Recadrage de l'illustration (art_crop de Scryfall) d'après une image de carte (cards.scryfall.io/<taille>/…) ; '' sinon. */
const puArtUrl = u => (typeof u === 'string' && PRT_IMG_RE.test(u) ? u.replace(/^(https:\/\/cards\.scryfall\.io\/)(?:small|normal|large|png|border_crop)\//, '$1art_crop/').replace(/\.png(?=\?|$)/, '.jpg') : '');
/** Premier commandant d'une place (« A + B » : partenaires). */
const puCmd1 = p => String((p.deck && p.deck.commandant) || '').split(' + ')[0].trim();
/** Illustration d'une place : l'image de son deck, sinon celle de son commandant si l'appli la connaît (invité qui a tapé son nom) ; '' : rien en fond. */
function puArt(p) { const im = p.deck && p.deck.image; if (im) return puArtUrl(im); const c = puCmd1(p), m = c && puMeta(c); return m && m.im ? puArtUrl(m.im) : ''; }
/** Commandants sans image (invité qui a tapé un nom, joueur venu avec un deck sans image) : fiches relues du cache, sinon lues sur Scryfall une fois (dmFetch : une seule
 *  tentative par carte), puis l'écran repeint s'il y a du nouveau. Hors ligne, nom inconnu : la tuile garde sa couleur. */
async function puArtSoon() {
  const st = PU.st; if (PU.artRun || !st || typeof dmFetch !== 'function') return;
  const need = [...new Set(st.places.filter(p => !(p.deck && p.deck.image)).map(puCmd1).filter(Boolean))], known = () => need.filter(n => { const m = puMeta(n); return m && m.im; }).length;
  if (!need.length || known() === need.length) return;
  PU.artRun = true; const k0 = known();
  await (PU.artP = (async () => { try { if (typeof dmLoad === 'function') await dmLoad(); const miss = need.filter(n => !puMeta(n)).map(n => ({ key: ownKey(n), name: n })); if (miss.length) await dmFetch(miss); } catch (e) { /* hors ligne */ } })());
  PU.artRun = false; PU.artP = null; if (!PU.el || !PU.st || PU.mode === 'end') return;
  if (known() > k0) puPaint(); else if (PU.st.places.some(p => !(p.deck && p.deck.image) && puCmd1(p) && !need.includes(puCmd1(p)))) puArtSoon();      // place ajoutée, autre partie pendant la lecture : son tour
}
/** Illustrations déjà chargées remises dans l'écran repeint (même adresse) : pas de clignotement à chaque ±1 ni au tour suivant. */
function puKeepArt(old, root) {
  const by = new Map(); for (const im of old) by.set(im.dataset.pos + ' ' + im.getAttribute('src'), im);
  for (const im of $$('img.pu-art', root)) { const o = by.get(im.dataset.pos + ' ' + im.getAttribute('src')); if (o && o !== im && !(o.complete && !o.naturalWidth)) im.replaceWith(o); }      // ratée (hors ligne) : la nouvelle la recharge
}
async function puRoomOpen() {
  try {
    const v = await partieRoomCreate(PU.st, { n: ((PU.st.places.find(p => p.sorte === 'moi') || {}).nom) || puMe(true), p: PROF.photo || '', l: I18N.lang, allco: puAllcoPref() });
    PU.view = v; puWatch();
    if (PU.st && (partieJeu(v) !== partieJeu(PU.st) || v.format !== PU.st.format)) puRoomOpts({ jeu: partieJeu(PU.st), format: PU.st.format, size: partieRoomSize(PU.st, puViewMax()) }, true);      // format changé pendant l'ouverture
  } catch (e) { PU.view = null; }
  if (PU.el && PU.mode === 'setup') puPaint();
}
function puWatch() {
  puWatchStop();
  PU.stopW = partieRoomWatch((v, x) => {
    if (!PU.el) return;
    if (x && x.gone) { PU.view = null; toast(PU.mode === 'game' ? T('Table fermée par le serveur : les autres téléphones ne suivent plus la partie.') : T('Table fermée par le serveur : continue avec des invités')); puPaint(); return; }
    PU.net = !x || x.net !== false; PU.on = (x && x.on) || [];
    if (v) { PU.view = v; if (PU.mode === 'setup' && v.st === 'wait' && !PU.mvBusy) puSet(puFromRoom(PU.st, v), { paint: false }); }      // places en cours de déplacement : la salle suit (partie-jeu.js › puSeatMove)
    if (PU.mode === 'setup') puPaint();
    else if (PU.mode === 'game') { if (v) puCoSync(v); const w = puDuoOn() && puDuoWarn(); if (w !== PU.duoW) { PU.duoW = w; puPaint(); } }      // deux téléphones : point rouge quand l'écran 2 ne suit pas
  }, { qa: () => (PU.st && PU.st.rq && PU.st.rq.s) || 0, onQ: puRemote });      // partie commencée : saisies des autres téléphones (partieRemote)
}
function puWatchStop() { if (PU.stopW) { PU.stopW(); PU.stopW = null; } }
/** Invité (sans téléphone) : prénom, commandant facultatif (Standard, Libre : son deck). */
function puGuestSheet() {
  const cmd = partieCmdOn(PU.st);
  openSheet(T('Ajouter un invité'), T('Un joueur sans téléphone ou sans l\'appli'), api => {
    api.body.innerHTML = `<div class="field-in"><label class="label" for="puGn">${T('Prénom')}</label><input type="text" id="puGn" maxlength="24" autocomplete="off"></div>
      <div class="field-in"><label class="label" for="puGc">${cmd ? T('Commandant (facultatif)') : T('Deck (facultatif)')}</label><input type="text" id="puGc" maxlength="${cmd ? 80 : 40}" autocomplete="off"></div>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn" type="button" data-ok>${T('Ajouter')}</button>`);
    const n = $('#puGn', api.body), c = $('#puGc', api.body);
    const ok = async () => {
      const nom = partieStr(n.value, PRT_LEN.nom); if (!nom) { n.focus(); return; }
      const deck = partieDeck(cmd ? { commandant: c.value } : { nom: c.value }); api.close(); haptic('ok');
      const next = partieAddPlace(PU.st, { sorte: 'invite', nom, deck });
      if (partieRoom() && PU.view && next !== PU.st) {
        try {
          const pos = next.places.find(p => !PU.st.places.some(q => q.pos === p.pos)).pos;
          if (pos > (PU.view.size || 8)) PU.view = await partieRoomOp('opts', { size: pos });      // Standard (table de 2) : une place de plus
          const v = await partieRoomOp('add', { pos, n: nom, ...(deck ? { deck } : {}) }); PU.view = v; puSet(puFromRoom(PU.st, v)); return;
        } catch (e) { /* hors ligne : ici seulement */ }
      }
      puSet(next);
    };
    [n, c].forEach(x => x.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } }));
    api.foot.addEventListener('click', e => { if (e.target.closest('[data-ok]')) ok(); });
    setTimeout(() => { if (!api.body.contains(document.activeElement)) n.focus(); }, 60);      // déjà dans un champ (appui rapide) : on n'y touche pas
  });
}
async function puStart() {
  let st = PU.st; if (st.places.length < 2) return;
  let live = false;
  if (partieRoom() && PU.view) { try { const v = await partieRoomOp('start'); st = puFromRoom(st, v); PU.view = v; live = true; } catch (e) { /* la salle ne répond plus : on joue quand même */ } }
  puWatchStop();
  const draw = !st.premier; if (draw) st = partieFirst(st, 0, { rnd: typeof puRnd === 'function' ? puRnd : undefined });      // premier joueur au hasard (crypto.getRandomValues), tirage montré à la table
  st = partieStart(st); haptic('ok'); puSet(st);
  if (draw && typeof puDrawShow === 'function') puDrawShow(st.premier);
  if (live) { puWatch(); partieRoomPace(true); }      // la table continue de suivre : saisies des autres téléphones, co-hôtes
}

/* ── Compteur ─────────────────────────────────────────────────────────────────────────────────── */
/** Ordre de la table pour l'affichage A (tourné vers chacun) : [place, sens] ; sens 0 (en bas), 180 (en haut), 90 (colonne de gauche), 270 (colonne de droite).
 *  mid : jointure où poser le bouton rond « … / Tour » (entre les rangées mid et mid + 1, au milieu en largeur) : au croisement de quatre tuiles tournées dès qu'il y en a
 *  (leurs noms sont au milieu de leur bord intérieur, loin des coins), la plus proche du milieu de l'écran (à égalité, la plus basse) ; à 2 et 3 joueurs, contre le haut
 *  d'une tuile droite. Chaque tuile qui touche le bouton le sait (m : 'l' / 'r', coin gauche / droit du haut de la tuile vue par son joueur ; 'c', milieu du haut) : son nom s'en écarte. */
function puLayoutA(places) {
  const ps = places.slice().sort((a, b) => a.pos - b.pos), n = ps.length;
  if (n === 2) return { cols: 1, rows: 2, mid: 1, w: [1, 1], cells: [{ p: ps[1], r: 180, row: 1, col: 1, m: 'c' }, { p: ps[0], r: 0, row: 2, col: 1, m: 'c' }] };
  const odd = n % 2 === 1, rest = odd ? ps.slice(1) : ps, k = rest.length / 2, R = k + (odd ? 1 : 0), cells = [];
  const left = rest.slice(0, k).reverse(), right = rest.slice(k);      // dans le sens des aiguilles d'une montre : colonne de gauche de bas en haut, puis la droite de haut en bas
  for (let i = 0; i < k; i++) { cells.push({ p: left[i], r: 90, row: i + 1, col: 1 }); cells.push({ p: right[i], r: 270, row: i + 1, col: 2 }); }
  if (odd) cells.push({ p: ps[0], r: 0, row: k + 1, col: 1, cs: 2 });
  let mid = k; if (k >= 2) { mid = 1; for (let j = 2; j < k; j++) if (Math.abs(j - R / 2) <= Math.abs(mid - R / 2)) mid = j; }
  for (const c of cells) {      // 90° : le haut de la tuile est à droite de l'écran, sa gauche en haut ; 270° : le haut à gauche, sa gauche en bas
    if (c.r === 0) { if (c.row === mid + 1) c.m = 'c'; } else if (c.row === mid) c.m = c.r === 90 ? 'r' : 'l'; else if (c.row === mid + 1) c.m = c.r === 90 ? 'l' : 'r';
  }
  return { cols: 2, rows: R, mid, w: Array(R).fill(1), cells };
}
/* ── Paysage (téléphone posé à plat qui a basculé, tablette, ordinateur) : la table de l'affichage A (ou d'une moitié) tournée d'un quart de tour. Chaque tuile tourne
   avec elle : vue par son joueur, elle garde exactement la taille du portrait (PV, nom, moitiés − / +), les joueurs sont sur les grands côtés (rangées à 0° et 180°),
   le joueur seul d'un nombre impair à un bout (90° ou 270°), le bouton rond sur la même jointure. Sens du quart de tour : celui de l'écran (screen.orientation,
   angle 270 : dans l'autre sens) — un téléphone resté à plat qui bascule garde chaque tuile sur le même bord, face au même joueur. */
const puLand = () => typeof innerWidth === 'number' && innerWidth > innerHeight;
function puLandDir() {
  try { const a = typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.angle === 'number' ? screen.orientation.angle : typeof window.orientation === 'number' ? (window.orientation + 360) % 360 : 0; return a === 270 ? -1 : 1; } catch (e) { return 1; }
}
/** Disposition du portrait (w : poids des rangées, cols : 1 ou 2, cellules { row, rs, col, cs, r }, k : jointure du bouton rond après la rangée k) tournée d'un quart de tour :
 *  dir 1, la colonne de gauche passe en bas (rangée à 0°), la droite en haut (180°), le bas à droite (270°) ; dir −1, l'inverse. */
function puLandL(L, dir) {
  const n = L.w.length, C = L.cols;
  const cells = L.cells.map(c => {
    const rs = c.rs || 1, cs = c.cs || 1;
    return dir > 0 ? { ...c, row: C - (c.col + cs - 1) + 1, rs: cs, col: c.row, cs: rs, r: (c.r + 270) % 360 } : { ...c, row: c.col, rs: cs, col: n - (c.row + rs - 1) + 1, cs: rs, r: (c.r + 90) % 360 };
  });
  return { ...L, land: dir, w: dir > 0 ? L.w : L.w.slice().reverse(), cells, k: dir > 0 ? L.k : n - L.k };
}
/** Position du bouton rond sur la jointure k (après la rangée k ; 0 : contre le premier bord, n : contre le dernier) d'une grille aux rangées pondérées w (écart de 6 px). */
function puJoint(w, k) {
  const n = w.length, sum = w.reduce((x, y) => x + y, 0), at = w.slice(0, k).reduce((x, y) => x + y, 0) / sum;
  return k <= 0 ? '35px' : k >= n ? 'calc(100% - 35px)' : `calc((100% - ${n - 1} * 6px) * ${+at.toFixed(4)} + ${k - 0.5} * 6px)`;
}
/** Grille d'une disposition (portrait ou tournée) : style du conteneur et position du bouton rond. */
function puGridCss(L) {
  const fr = w => w.map(x => `minmax(0,${x}fr)`).join(' '), J = puJoint(L.w, L.k);
  return L.land ? { box: `grid-template-columns:${fr(L.w)};grid-template-rows:repeat(${L.cols},minmax(0,1fr))`, mid: `left:${J};top:50%` }
    : { box: `grid-template-columns:repeat(${L.cols},minmax(0,1fr));grid-template-rows:${fr(L.w)}`, mid: `top:${J}` };
}
/** Affichage C (table) : moi en bas, puis dans le sens des aiguilles d'une montre la colonne de gauche (de bas en haut), le haut (nombre impair d'adversaires), la colonne
 *  de droite (de haut en bas), autour de la table (tour, joueur qui joue) ; tuiles droites en grille : jamais l'une sur l'autre, toute la hauteur de l'écran prise. */
function puLayoutC(places) {
  const ps = places.slice().sort((a, b) => a.pos - b.pos), rest = ps.slice(1), top = rest.length % 2 === 1, s = Math.floor(rest.length / 2), r0 = top ? 2 : 1, cells = [];
  rest.slice(0, s).forEach((p, i) => cells.push({ p, row: r0 + s - 1 - i, col: 1 }));
  if (top) cells.push({ p: rest[s], row: 1, col: '1 / -1' });
  rest.slice(s + (top ? 1 : 0)).forEach((p, i) => cells.push({ p, row: r0 + i, col: 3 }));
  cells.push({ p: ps[0], row: s ? r0 + s : 3, col: '1 / -1' });      // à deux : la table entre les deux tuiles
  return { s, r0, rows: s ? r0 + s : 3, cells };
}
/** Affichage C en paysage : deux rangées de tuiles droites de part et d'autre de la table, moi en bas à droite, puis dans le sens des aiguilles d'une montre la rangée
 *  du bas (de droite à gauche) et celle du haut (de gauche à droite) ; rangées de ⌈n/2⌉ et ⌊n/2⌋ tuiles (grille au plus petit commun multiple : chaque rangée pleine). */
function puLayoutCL(places) {
  const ps = places.slice().sort((a, b) => a.pos - b.pos), n = ps.length, b = Math.ceil(n / 2), t = n - b, gcd = (x, y) => (y ? gcd(y, x % y) : x), L = (b * t) / gcd(b, t), cells = [];
  ps.slice(0, b).forEach((p, i) => cells.push({ p, row: 2, col: `${(b - 1 - i) * (L / b) + 1} / span ${L / b}` }));
  ps.slice(b).forEach((p, i) => cells.push({ p, row: 1, col: `${i * (L / t) + 1} / span ${L / t}` }));
  return { cols: L, cells };
}
/** Affichage B (liste) en paysage : colonnes qui donnent les plus grands PV (estimés d'après la taille des tuiles, comme partie.css) ; portrait : une colonne. */
function puBCols(n) {
  if (!puLand() || n < 2) return 1;
  const W = innerWidth - 12, H = innerHeight - 12 - 46;      // marges de l'écran, barre du haut
  const est = (w, h) => (h <= 170 && w / h >= 1.5 ? Math.min(h * 0.72, (w - 56) * 0.36, 120) : Math.min((h - 60) * 1.12, (w - 64) * 0.64, 200));
  let best = 1, bv = -1;
  for (let c = 1; c <= Math.min(4, n); c++) { const r = Math.ceil(n / c), v = est((W - (c - 1) * 6) / c, (H - (r - 1) * 6) / r); if (v > bv + 0.5) { bv = v; best = c; } }
  return best;
}
/** Moitié de la table (deux téléphones) : les places de sub gardent leur côté de l'affichage A de toute la table (colonne de gauche 90°, de droite 270°, seule en bas 0° :
 *  les deux téléphones sont posés dans le même sens), dans l'ordre de leurs rangées ; une colonne moins remplie que l'autre : ses tuiles s'allongent (rangées au plus petit
 *  commun multiple ; w : poids de chaque rangée, celle du bas à la hauteur d'une tuile). Bouton rond sur une jointure libre dans les deux colonnes, la plus proche du milieu
 *  (sinon libre d'un côté : la tuile allongée de l'autre écarte son nom, mid-c) ; une seule rangée : au bas de la ligne du milieu ; une seule tuile : contre son haut.
 *  k : jointure du bouton (puJoint) ; rs : rangées couvertes par une tuile. Tournée en paysage comme l'affichage A (puLandL). */
function puLayoutHalf(places, sub) {
  const F = puLayoutA(places), inS = new Set(sub.map(p => p.pos)), cs = F.cells.filter(c => inS.has(c.p.pos)), side = r => cs.filter(c => c.r === r).sort((x, y) => x.row - y.row);
  const Lc = side(90), Rc = side(270), B = cs.find(c => c.r !== 90 && c.r !== 270), a = Lc.length, b = Rc.length, gcd = (x, y) => (y ? gcd(y, x % y) : x), T = a && b ? (a * b) / gcd(a, b) : Math.max(a, b);
  const w = Array(T).fill(1), cells = [];
  Lc.forEach((c, i) => cells.push({ p: c.p, r: 90, row: i * (T / a) + 1, span: T / a, col: 1 }));
  Rc.forEach((c, i) => cells.push({ p: c.p, r: 270, row: i * (T / b) + 1, span: T / b, col: 2 }));
  if (B) { w.push(T ? T / Math.max(a, b) : 1); cells.push({ p: B.p, r: 0, row: T + 1, span: 1, col: 1, cs: 2 }); }
  const n = w.length, sum = w.reduce((x, y) => x + y, 0), at = k => w.slice(0, k).reduce((x, y) => x + y, 0) / sum;      // haut de la rangée k + 1, en fraction de la hauteur
  const ends = col => new Set(cells.filter(c => c.col === col && !c.cs).map(c => c.row + c.span - 1)), eL = ends(1), eR = ends(2), free = (e, cnt, k) => !cnt || e.has(k);
  let k = 0, best = -1;
  for (let j = 1; j < n; j++) { const s = (free(eL, a, j) ? 2 : 0) + (free(eR, b, j) ? 2 : 0), sc = s ? s - Math.abs(at(j) - 0.5) : -1; if (sc >= best && sc >= 0) { best = sc; k = j; } }
  if (!k) k = T ? n : 0;      // une seule rangée : au bas de la ligne du milieu ; la tuile du bas seule : contre son haut
  for (const c of cells) {      // 90° : le haut de la tuile est à droite de l'écran, sa gauche en haut ; 270° : le haut à gauche, sa gauche en bas (comme puLayoutA)
    const top = c.row, bot = c.row + c.span - 1;
    if (c.r === 0) { if (top === k + 1) c.m = 'c'; } else if (bot === k) c.m = c.r === 90 ? 'r' : 'l'; else if (top === k + 1) c.m = c.r === 90 ? 'l' : 'r'; else if (top <= k && bot > k) c.m = 'c';
  }
  for (const c of cells) c.rs = c.span;
  return { cols: 2, w, cells, k };
}
const puHue = pos => [265, 200, 150, 28, 340, 52, 180, 300][(pos - 1) % 8];
/** Tuile d'un joueur. m : coin ou milieu du haut touché par le bouton rond (puLayoutA). Son nom est un bouton (icône de réglages, ses compteurs non nuls en pastilles) :
 *  sa fiche. Illustration de son commandant en fond (recadrée, sous un dégradé de sa couleur) ; PV à la taille de la tuile (cq : la cellule, tournée ou non).
 *  o (deux téléphones, écran 2) : dl (écarts affichés, sinon PU.deltas), co (pos → co-hôte), ro (pos → true : sans − / + ni « Fin du tour »), cls (classes de plus : pk-l, pk-r, pk-c),
 *  roll (tirage à montrer : dés, pièce, premier joueur ; sinon celui de ce téléphone). Sur le téléphone du créateur, dans la tuile et tournés vers le joueur : la proposition
 *  d'élimination qui le concerne (Éliminer / Pas encore) et le mode « attaque » (partie-jeu.js : blessures de commandant d'un attaquant, − / + sur chaque défenseur). */
function puTile(st, p, r, m = '', o = {}) {
  const dead = !!p.elimine, act = st.actif === p.pos && !dead, d = (o.dl || PU.deltas)[p.pos], tags = [], art = puArt(p), nm = esc(p.nom || T('Joueur {n}', { n: p.pos })), ro = !!(o.ro && o.ro(p.pos));
  const host = st === PU.st && PU.mode === 'game', pr = host && !ro ? puProp(st) : null, pin = pr && pr.pos === p.pos ? pr : null;
  const atk = host && !ro && typeof puAtkTile === 'function' ? puAtkTile(st, p) : null, roll = typeof puRollTile === 'function' ? puRollTile(st, p, o.roll) : '';
  const big = !dead && (p.vie >= 1000 || p.vie <= -100) ? ' l4' : !dead && (p.vie >= 100 || p.vie <= -10) ? ' l3' : '';      // 4 chiffres (jusqu'à 9999) : encore plus petits, jamais sur les signes
  if (st.monarque === p.pos) tags.push(`<span class="pu-tag" title="${T('Monarque')}"><svg class="i" aria-hidden="true"><use href="#i-crown"/></svg></span>`);
  if (st.initiative === p.pos) tags.push(`<span class="pu-tag" title="${T('Initiative')}"><svg class="i" aria-hidden="true"><use href="#i-castle"/></svg></span>`);
  if (p.compteurs.poison) tags.push(`<span class="pu-tag" title="${T('Poison')}"><svg class="i" aria-hidden="true"><use href="#i-poison"/></svg>${p.compteurs.poison}</span>`);
  if (p.compteurs.impot) tags.push(`<span class="pu-tag" title="${T('Impôt de commandant')}">+${p.compteurs.impot * 2}</span>`);
  if ((o.co || puCoOf)(p.pos)) tags.push(`<span class="pu-tag pu-cotag" title="${T('Co-hôte : compte aussi pour la table depuis son téléphone')}">${T('Co-hôte')}</span>`);
  const bl = Object.values(p.blessures).reduce((a, x) => Math.max(a, x), 0); if (bl) tags.push(`<span class="pu-tag" title="${T('Blessures de commandant (la plus haute)')}"><svg class="i" aria-hidden="true"><use href="#i-sword"/></svg>${bl}</span>`);
  const hm = atk && atk.lm ? atk.lm : T('{name} : −1 point de vie', { name: nm }), hp = atk && atk.lp ? atk.lp : T('{name} : +1 point de vie', { name: nm });
  return `<div class="pu-t${dead ? ' dead' : ''}${act ? ' act' : ''}${r === 90 || r === 270 ? ' rv' : ''}${art ? ' art' : ''}${m ? ' mid-' + m : ''}${pin ? ' pin' : ''}${atk ? atk.cls : ''}${o.cls || ''}" data-pos="${p.pos}"${m ? ` data-m="${m}"` : ''}${o.cls ? ` data-x="${o.cls.trim()}"` : ''} style="--r:${r || 0}deg;--h:${puHue(p.pos)}"><div class="pu-in">
      ${art ? `<span class="pu-bg" aria-hidden="true"><img class="pu-art" data-pos="${p.pos}" alt="" loading="lazy" decoding="async" src="${esc(art)}"></span>` : ''}
      ${ro || (atk && atk.nohit) ? '' : `<button type="button" class="pu-hit m" data-d="-1" aria-label="${hm}"><span aria-hidden="true">−</span></button>
      <button type="button" class="pu-hit p" data-d="1" aria-label="${hp}"><span aria-hidden="true">+</span></button>`}
      <div class="pu-top"><button type="button" class="pu-nm" data-pu="pl" data-pos="${p.pos}" title="${T('Fiche du joueur : blessures de commandant, compteurs')}"><span class="pu-nm-h"><svg class="i pu-nm-i" aria-hidden="true"><use href="#i-sliders"/></svg><span class="pu-nm-w"><b>${nm}</b>${puCmd(p) ? `<small>${esc(puCmd(p))}</small>` : ''}</span></span>${tags.length ? `<span class="pu-tags">${tags.join('')}</span>` : ''}</button></div>
      ${atk && atk.top ? atk.top : ''}
      <span class="pu-lb"><b class="pu-life${big}" aria-live="polite">${dead ? '<svg class="i pu-dead" aria-hidden="true"><use href="#i-skull"/></svg>' : p.vie}${d && d.n ? `<span class="pu-dl">${d.n > 0 ? '+' : ''}${d.n}</span>` : ''}</b></span>
      ${act && !ro && !atk ? `<button type="button" class="pu-turn" data-pu="next"><span>${T('Fin du tour')}</span></button>` : ''}
      ${atk && atk.html ? atk.html : ''}${pin ? `<div class="pu-pin" role="alert"><span>${esc(puPropTxt(st, pin))}</span><div class="pu-pin-b">${puPropBtns(pin)}</div></div>` : ''}${roll}
    </div></div>`;
}
/* Affichage A (toute la table) et moitié de la table (deux téléphones), communs au téléphone du créateur et à l'écran 2. o : options de puTile, et see (vue choisie sur
   un des deux téléphones : 'other', 'all' → pastille en haut pour revenir à sa moitié), msg (écran 2 : hors ligne, créateur absent ; pastille en haut aussi : les noms
   des tuiles du haut s'en écartent, pk-l, pk-r, pk-c), warn (point rouge sur le bouton rond : l'autre écran ne suit pas). */
const puPk = c => (c.row === 1 ? (c.r === 90 ? ' pk-l' : c.r === 270 ? ' pk-r' : ' pk-c') : '');
const puCellHtml = (st, c, o, pill) => `<div class="pu-cell" style="grid-row:${c.row}${(c.rs || 1) > 1 ? ' / span ' + c.rs : ''};grid-column:${c.col}${(c.cs || 1) > 1 ? ' / span ' + c.cs : ''}">${puTile(st, c.p, c.r, c.m, { ...o, cls: pill ? puPk(c) : '' })}</div>`;
const puMidHtml = (st, o, pos) => `<button type="button" class="pu-mid${o.warn ? ' warn' : ''}" data-pu="menu" aria-label="${T('Options de la partie')}"${pos ? ` style="${pos}"` : ''}><svg class="i"><use href="#i-more"/></svg><small>${T('Tour {t}', { t: st.tour })}</small>${typeof puClkHtml === 'function' ? puClkHtml(st) : ''}</button>`;
/** Disposition A ou d'une moitié, tournée si l'écran est en paysage ; pills : pastilles en haut (portrait : les noms du haut s'en écartent ; paysage : la grille descend). */
function puGridHtml(st, L0, o, pills, cls) {
  const L = puLand() ? puLandL(L0, puLandDir()) : L0, g = puGridCss(L);
  return `<div class="pu-a${cls || ''}${L.land ? ' land' : ''}${pills && L.land ? ' pills' : ''}" style="${g.box}">${L.cells.map(c => puCellHtml(st, c, o, !!pills && !L.land)).join('')}${puMidHtml(st, o, g.mid)}${pills}</div>`;
}
const puPills = o => (o.see && o.see !== 'me') || o.msg ? `<div class="pu-pills">${o.msg ? `<p class="pu-scr-st" role="status">${esc(o.msg)}</p>` : ''}${o.see && o.see !== 'me' ? `<button type="button" class="pu-see" data-pu="see-me" aria-label="${T('Revenir à ma moitié')}">${o.see === 'all' ? T('Toute la table') : T('L\'autre moitié')}<svg class="i" aria-hidden="true"><use href="#i-close"/></svg></button>` : ''}</div>` : '';
function puAHtml(st, o = {}) {
  const L = puLayoutA(st.places); L.k = L.mid;
  return puGridHtml(st, L, o, puPills(o), '');
}
function puHalfHtml(st, sub, o = {}) {
  const pills = puPills(o);
  if (!sub.length) return `<div class="pu-a pu-h2 pu-none"><p>${T('Aucune place sur cet écran : touche « … » pour répartir les places.')}</p>${puMidHtml(st, o, 'top:calc(100% - 64px)')}${pills}</div>`;
  return puGridHtml(st, puLayoutHalf(st.places, sub), o, pills, ' pu-h2');
}
/** Proposition d'élimination en cours (la première à laquelle on n'a pas encore répondu « Pas encore »), null sinon. */
const puProp = st => partieProposals(st).find(x => !PU.gone.has(x.pos + ':' + x.cause + ':' + (x.par || ''))) || null;
const puPropTxt = (st, x) => (x.cause === 'vie' ? T('{name} n\'a plus de points de vie', { name: puName(st, x.pos) }) : x.cause === 'poison' ? T('{name} a 10 marqueurs poison', { name: puName(st, x.pos) }) : T('{name} a reçu 21 blessures du commandant de {src}', { name: puName(st, x.pos), src: puName(st, x.par) }));
const puPropBtns = x => `<button type="button" class="btn small" data-pu="elim" data-pos="${x.pos}" data-c="${x.cause}" data-par="${x.par || ''}">${T('Éliminer')}</button><button type="button" class="btn ghost small" data-pu="keep" data-k="${x.pos}:${x.cause}:${x.par || ''}">${T('Pas encore')}</button>`;
function puGamePaint() {
  const st = PU.st, el = PU.el, duo = puDuoOn(), see = duo ? PU.duo.see || 'me' : '', half = duo && see !== 'all', aff = half ? 'A' : puAff(), prop = puProp(st), old = $$('img.pu-art', el), land = puLand();
  const fo = puFocusKey(el);      // clavier : le bouton qui avait le focus le retrouve dans l'écran repeint
  const cell = (c, r) => `<div class="pu-cell" style="grid-row:${c.row};grid-column:${c.col}">${puTile(st, c.p, r, c.m)}</div>`;
  let body = '', shown = st.places.map(p => p.pos);
  if (half) { const b = new Set(puDuoB()), sub = st.places.filter(p => (see === 'me') !== b.has(p.pos)); shown = sub.map(p => p.pos); body = puHalfHtml(st, sub, { see, warn: puDuoWarn(), msg: PU.net ? '' : T('Hors ligne : l\'écran 2 ne suit plus') }); }      // deux téléphones : ma moitié (les places hors de l'écran 2) ou l'autre
  else if (aff === 'A') body = puAHtml(st, duo ? { see, warn: puDuoWarn(), msg: PU.net ? '' : T('Hors ligne : l\'écran 2 ne suit plus') } : {});
  else if (aff === 'B') {
    const bc = puBCols(st.places.length);      // paysage : plusieurs colonnes (les plus grands PV)
    body = `<div class="pu-b"${bc > 1 ? ` style="grid-template-columns:repeat(${bc},minmax(0,1fr))"` : ''}>${st.places.slice().sort((a, b) => a.pos - b.pos).map(p => `<div class="pu-cell">${puTile(st, p, 0)}</div>`).join('')}</div>`;
  } else if (land) {      // paysage : deux rangées autour de la table (le tour et le joueur qui joue sont dans la barre du haut)
    const L = puLayoutCL(st.places);
    body = `<div class="pu-c land" style="grid-template-columns:repeat(${L.cols},minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))">${L.cells.map(c => cell(c, 0)).join('')}</div>`;
  } else {
    const L = puLayoutC(st.places);
    body = `<div class="pu-c" style="grid-template-rows:${L.s ? `repeat(${L.rows},minmax(0,1fr))` : 'minmax(0,1fr) auto minmax(0,1fr)'}">${L.cells.map(c => cell(c, 0)).join('')}<div class="pu-c-mid" style="${L.s ? `grid-row:${L.r0} / span ${L.s};grid-column:2` : 'grid-row:2;grid-column:1 / -1'}"><b>${T('Tour {t}', { t: st.tour })}</b><span>${esc(puName(st, st.actif))}</span></div></div>`;
  }
  const clk = typeof puClkHtml === 'function' ? puClkHtml(st, true) : '';
  el.innerHTML = `<div class="pu-g aff-${aff}${duo ? ' pu-duo' : ''}${land ? ' pu-land' : ''}">${aff !== 'A' ? `<div class="pu-bar"><span><b>${T('Tour {t}', { t: st.tour })}</b> · ${esc(T('{name} joue', { name: puName(st, st.actif) }))}${clk}</span>${duo ? `<button type="button" class="btn ghost small pu-see-b" data-pu="see-me">${T('Ma moitié')}</button>` : ''}<button type="button" class="btn small" data-pu="next">${T('Tour suivant')}</button><button type="button" class="icon-btn pu-more" data-pu="menu" aria-label="${T('Options de la partie')}"><svg class="i"><use href="#i-more"/></svg></button></div>` : ''}
      ${body}
      ${prop && !shown.includes(prop.pos) ? `<div class="pu-prop" role="alert"><span>${esc(puPropTxt(st, prop))}</span>${puPropBtns(prop)}</div>` : ''}
    </div>`;      // proposition d'élimination : dans la tuile du joueur concerné, tournée vers lui (puTile) ; ici seulement si sa tuile n'est pas sur cet écran (deux téléphones)
  puKeepArt(old, el); puArtSoon(); puFocusBack(el, fo);
  if (typeof puJeuPaint === 'function') puJeuPaint();      // partie-jeu.js : chrono, verrou d'orientation, tirage en cours
  if (typeof tipSoon === 'function') tipSoon(1500);      // astuce (tour.js) : toucher le nom d'un joueur ouvre sa fiche
}
/** Clavier (accessibilité, ordinateur) : clé du bouton qui a le focus dans l'écran du compteur (sa tuile et son rôle), pour le lui rendre après un repeint. */
function puFocusKey(root) {
  const a = document.activeElement; if (!root || !a || !root.contains(a)) return null;
  const t = a.closest('[data-pos]'), k = a.classList.contains('pu-hit') ? '.pu-hit.' + (a.classList.contains('m') ? 'm' : 'p') : a.dataset && a.dataset.pu ? `[data-pu="${a.dataset.pu}"]` : null;
  return k ? { pos: t ? t.dataset.pos : '', k } : null;
}
function puFocusBack(root, f) {
  if (!f || !root) return;
  const t = f.pos ? $(`.pu-t[data-pos="${f.pos}"]`, root) || root : root, b = t && $(f.k, t);
  if (b && document.activeElement !== b) try { b.focus({ preventScroll: true }); } catch (e) { /* bouton parti */ }
}
/** ±n points de vie (cumul affiché quelques secondes sur la tuile, la moitié touchée s'allume un instant). */
function puLife(pos, n) {
  const next = partieLife(PU.st, pos, n); if (next === PU.st) return;
  puDeltaAdd(pos, n); haptic('tap'); puSet(next, { paint: false });
  const t = puPaintTile(pos), h = t && $(n < 0 ? '.pu-hit.m' : '.pu-hit.p', t); if (h) h.classList.add('fl');
  if (!(t && t.classList.contains('pin')) && puProp(PU.st) && puProp(PU.st).pos === pos) puPaint();      // proposition d'élimination : dans sa tuile (déjà repeinte), sinon en bas de l'écran
}
/** Écart de points de vie affiché quelques secondes en exposant sur la tuile (appuis regroupés comme dans le journal). */
function puDeltaAdd(pos, n) {
  if (!n) return;
  const d = PU.deltas[pos] = PU.deltas[pos] && Date.now() - PU.deltas[pos].t < PRT_MERGE_MS ? PU.deltas[pos] : { n: 0, t: 0 };
  d.n += n; d.t = Date.now(); clearTimeout(d.to); d.to = setTimeout(() => { if (PU.deltas[pos] === d) { delete PU.deltas[pos]; if (PU.mode === 'game') puPaintTile(pos); } }, PRT_MERGE_MS);
}
/** Appui sur une moitié de tuile : ±1 point de vie ; mode « attaque » (partie-jeu.js) : ±1 blessure du commandant de l'attaquant sur un défenseur. */
function puHitDo(pos, n) { if (PU.atk && typeof puAtkHit === 'function' && pos !== PU.atk.pos) puAtkHit(pos, n); else puLife(pos, n); }
/** Repeint une seule tuile (appuis rapides : pas de liste entière refaite, l'illustration gardée) ; la nouvelle tuile, null si tout a été repeint. Le bouton qui avait
 *  le focus (clavier : Entrée sur « − ») le garde dans la nouvelle tuile. */
function puPaintTile(pos) {
  const t = PU.el && $(`.pu-t[data-pos="${pos}"]`, PU.el), p = PU.st.places.find(x => x.pos === pos); if (!t || !p) { puPaint(); return null; }
  const fo = puFocusKey(t);
  const r = getComputedStyle(t).getPropertyValue('--r').trim(), tmp = document.createElement('div'); tmp.innerHTML = puTile(PU.st, p, parseFloat(r) || 0, t.dataset.m || '', { cls: t.dataset.x ? ' ' + t.dataset.x : '' });
  const n = tmp.firstElementChild; puKeepArt($$('img.pu-art', t), n); t.replaceWith(n);
  if (fo) puFocusBack(n.parentNode, fo);
  return n;
}
/* Appui maintenu sur une moitié de tuile : ±10 tout de suite, puis toutes les 0,5 s (mode « attaque » : ±1 toutes les 0,25 s) ; appui court : ±1 (au relâché).
   Un appui par doigt (pointerId) : plusieurs joueurs qui touchent en même temps comptent chacun le leur, sans s'annuler. */
function puDown(e) {
  const h = e.target.closest('.pu-hit'); if (!h || PU.mode !== 'game') return;
  const t = h.closest('.pu-t'), pos = Number(t.dataset.pos), d = Number(h.dataset.d), id = e.pointerId, atk = !!(PU.atk && pos !== PU.atk.pos);
  puCancel(e); const H = { pos, d, long: false, t: setTimeout(function rep() { if (PU.hold.get(id) !== H) return; H.long = true; puHitDo(pos, atk ? d : d * 10); H.t = setTimeout(rep, atk ? 250 : 500); }, 450) };
  PU.hold.set(id, H);
}
function puUp(e) {
  const h = PU.hold.get(e.pointerId); if (!h) return; clearTimeout(h.t); PU.hold.delete(e.pointerId);
  if (!h.long && e.target.closest && e.target.closest('.pu-hit')) puHitDo(h.pos, h.d);
}
function puCancel(e) { const h = PU.hold.get(e.pointerId); if (h) { clearTimeout(h.t); PU.hold.delete(e.pointerId); } }

/** Fiche d'un joueur : vie, blessures de commandant (par adversaire, 2e commandant pour les partenaires ; ±1, ±5, maintenu : répété), compteurs, monarque, initiative,
 *  attaque (mode « attaque », partie-jeu.js), élimination, nom. Affichages A et C (et chaque moitié à deux téléphones) : ouverte SUR la tuile du joueur, tournée vers lui
 *  (puSheetOnTile) ; B (liste, droite pour tous) : feuille du bas, comme avant. */
function puPlayerSheet(pos) {
  const face = puFace(pos);
  openSheet(puName(PU.st, pos), puCmd(PU.st.places.find(x => x.pos === pos) || {}), api => {      // sous-titre : son commandant (ou son deck)
    api.wrap.classList.add('pu-sheet', 'pu-fiche');
    const step = (k, v, lbl, extra = '', five = false) => `<div class="pu-row${five ? ' pu-row5' : ''}"><span class="pu-rl">${lbl}</span><span class="qstep">${five ? `<button type="button" class="q5" data-k="${k}" data-n="-5"${extra}>−5</button>` : ''}<button type="button" data-k="${k}" data-n="-1"${extra} aria-label="−1">−</button><b>${v}</b><button type="button" data-k="${k}" data-n="1"${extra} aria-label="+1">+</button>${five ? `<button type="button" class="q5" data-k="${k}" data-n="5"${extra}>+5</button>` : ''}</span></div>`;
    const paint = () => {
      const st = PU.st, p = st.places.find(x => x.pos === pos); if (!p) { api.close(); return; }
      $('h2', api.wrap).textContent = p.nom || T('Joueur {n}', { n: pos });
      const opp = st.places.filter(x => x.pos !== pos), cmd = partieCmdOn(st), two = puCmd(p).includes(' + ');      // Standard, Libre : ni blessures de commandant ni impôt ; Standard : ni monarque ni initiative
      api.body.innerHTML = `<div class="pu-lifebig"><button type="button" data-k="v" data-n="-10">−10</button><button type="button" data-k="v" data-n="-1">−1</button><b>${p.vie}</b><button type="button" data-k="v" data-n="1">+1</button><button type="button" data-k="v" data-n="10">+10</button></div>
        ${cmd ? `<p class="pu-h">${T('Blessures de commandant reçues')}</p>${opp.map(o => { const c = puCmd(o), t2 = c.includes(' + '); return step('b', p.blessures[String(o.pos)] || 0, esc(T('de {name}', { name: o.nom || o.pos })) + (c ? ` <small>${esc(t2 ? c.split(' + ')[0] : c)}</small>` : ''), ` data-s="${o.pos}"`, true) + (t2 ? step('b', p.blessures[o.pos + 'b'] || 0, `<small>${esc(c.split(' + ')[1])}</small>`, ` data-s="${o.pos}" data-b="1"`, true) : ''); }).join('')}` : ''}
        <p class="pu-h">${T('Compteurs')}</p><div class="pu-cnts">${PU_CNT.filter(([k]) => cmd || k !== 'impot').map(([k, l]) => step('c', p.compteurs[k] || 0, T(l), ` data-c="${k}"`)).join('')}</div>
        ${partieMarksOn(st) ? `<div class="pu-chips pu-marks"><button type="button" data-mk="monarque" aria-pressed="${st.monarque === pos}"><svg class="i" aria-hidden="true"><use href="#i-crown"/></svg>${T('Monarque')}</button><button type="button" data-mk="initiative" aria-pressed="${st.initiative === pos}"><svg class="i" aria-hidden="true"><use href="#i-castle"/></svg>${T('Initiative')}</button></div>` : ''}
        <div class="pu-acts">${cmd && !p.elimine && opp.some(o => !o.elimine) ? `<button class="btn ghost pu-atk-go" type="button" data-x="atk"><svg class="i" aria-hidden="true"><use href="#i-sword"/></svg>${two ? esc(T('Attaquer avec {name}', { name: puCmd(p).split(' + ')[0] })) : T('Attaquer')}</button>${two ? `<button class="btn ghost pu-atk-go" type="button" data-x="atk2"><svg class="i" aria-hidden="true"><use href="#i-sword"/></svg>${esc(T('Attaquer avec {name}', { name: puCmd(p).split(' + ')[1] }))}</button>` : ''}` : ''}${p.elimine ? `<button class="btn ghost" type="button" data-x="revive">${T('Revenir en jeu')}</button>` : `<button class="btn ghost" type="button" data-x="elim">${T('Éliminer')}</button>`}<button class="btn ghost" type="button" data-x="ren">${T('Renommer')}</button></div>`;
      if (api.__place) api.__place();
    };
    paint();
    if (face && typeof puSheetOnTile === 'function') puSheetOnTile(api, face);
    if (typeof puHoldRep === 'function') puHoldRep(api.body);      // − / + maintenus : répétés (blessures, compteurs, vie)
    api.body.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return; let st = PU.st;
      if (b.dataset.k === 'v') st = partieLife(st, pos, Number(b.dataset.n));
      else if (b.dataset.k === 'b') st = partieCmdDamage(st, pos, Number(b.dataset.s), Number(b.dataset.n), { second: !!b.dataset.b });
      else if (b.dataset.k === 'c') st = partieCounter(st, pos, b.dataset.c, Number(b.dataset.n));
      else if (b.dataset.mk) st = partieMark(st, b.dataset.mk, st[b.dataset.mk] === pos ? 0 : pos);
      else if (b.dataset.x === 'revive') st = partieRevive(st, pos);
      else if (b.dataset.x === 'elim') { puElimSheet(pos, '', 0, () => paint(), face); return; }
      else if (b.dataset.x === 'ren') { puRename(pos, () => paint(), face); return; }
      else if (b.dataset.x === 'atk' || b.dataset.x === 'atk2') { api.close(); if (typeof puAtkStart === 'function') puAtkStart(pos, b.dataset.x === 'atk2'); return; }
      else return;
      haptic('tap'); if (puSet(st)) paint();
    });
  });
}
/** Tuile d'un joueur sur laquelle ouvrir ses feuilles (affichages A et C, moitiés à deux téléphones), null en B (liste) ou sans tuile à l'écran. */
function puFace(pos) {
  const g = PU.el && $('.pu-g', PU.el); if (!g || g.classList.contains('aff-B')) return null;
  return $(`.pu-t[data-pos="${pos}"]`, g);
}
function puElimSheet(pos, cause, par, done, face) {
  if (face === undefined) face = puFace(pos);      // depuis la proposition dans sa tuile : tournée vers lui aussi
  openSheet(T('Éliminer {name} ?', { name: puName(PU.st, pos) }), '', api => {
    api.wrap.classList.add('pu-sheet');
    const causes = [['vie', T('Plus de points de vie')], ['commandant', T('Blessures de commandant')], ['poison', T('Poison')], ['abandon', T('Abandon')], ['autre', T('Autre')]].filter(([c]) => c !== 'commandant' || partieCmdOn(PU.st));
    api.body.innerHTML = `<div class="pu-chips">${causes.map(([c, l]) => `<button type="button" data-c="${c}" aria-pressed="${c === (cause || 'vie')}">${l}</button>`).join('')}</div>`;
    let c = cause || 'vie';
    api.body.addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; c = b.dataset.c; $$('[data-c]', api.body).forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn danger" type="button" data-ok>${T('Éliminer')}</button>`);
    if (face && typeof puSheetOnTile === 'function') puSheetOnTile(api, face);
    api.foot.addEventListener('click', e => {
      if (!e.target.closest('[data-ok]')) return; api.close(); haptic('ok');
      puSet(partieEliminate(PU.st, pos, c, { par }));
      const alive = PU.st.places.filter(p => !p.elimine);
      if (alive.length === 1) toast(T('{name} est le dernier en jeu', { name: alive[0].nom || alive[0].pos }), { label: T('Terminer'), fn: () => puEndSheet() });
      if (done) done();
    });
  });
}
/** Renommer une place (fiche du joueur ; préparation : le créateur sans pseudo, « Hôte », se donne un prénom, envoyé à la salle). */
function puRename(pos, done, face) {
  openSheet(T('Renommer'), '', api => {
    const p = PU.st.places.find(x => x.pos === pos);
    api.body.innerHTML = `<div class="field-in"><label class="label" for="puRn">${T('Prénom')}</label><input type="text" id="puRn" maxlength="24" autocomplete="off" value="${esc(p ? p.nom : '')}"></div>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn" type="button" data-ok>${T('Enregistrer')}</button>`);
    if (face && typeof puSheetOnTile === 'function') { api.wrap.classList.add('pu-sheet'); puSheetOnTile(api, face); }
    const inp = $('#puRn', api.body), ok = () => {
      api.close(); const nom = partieStr(inp.value, PRT_LEN.nom);
      puSet(partieSetPlace(PU.st, pos, { nom }));
      if (nom && PU.mode === 'setup' && p && p.sorte === 'moi' && partieRoom() && PU.view) partieRoomOp('me', { n: nom }).then(v => { PU.view = v; }).catch(() => {});      // la salle (et les autres téléphones) voient le nouveau prénom
      if (done) done();
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
    api.foot.addEventListener('click', e => { if (e.target.closest('[data-ok]')) ok(); });
    setTimeout(() => inp.select(), 60);
  });
}
/** Dernière action du journal, en clair sous « Annuler la dernière action » (« Léa : −3 PV ») ; '' : rien à dire (lancement, premier joueur). */
function puLastTxt(st, e) {
  if (!e) return ''; const nm = puName(st, e.p), sg = n => (n > 0 ? '+' : '−') + Math.abs(n);
  if (e.a === 'v') return T('{name} : {n} PV', { name: nm, n: sg(e.n) });
  if (e.a === 'b') return T('{name} : {n} blessures de commandant', { name: nm, n: sg(e.n) });
  if (e.a === 'c') { const c = PU_CNT.find(([k]) => k === e.k); return c ? T('{name} : {what} {n}', { name: nm, what: T(c[1]), n: sg(e.n) }) : ''; }
  if (e.a === 'n') return T('Tour suivant');
  if (e.a === 'm' || e.a === 'i') return (e.a === 'm' ? T('Monarque') : T('Initiative')) + (e.p ? ' : ' + nm : '');
  if (e.a === 'e') return T('Élimination de {name}', { name: nm });
  return '';
}
/** Menu « … » : affichage (A, B, C), tour suivant, premier joueur au hasard, annuler (ce qui sera défait, en clair), terminer, mettre en pause, abandonner. */
function puMenu() {
  openSheet(T('Partie'), T('Tour {t} · {name} joue', { t: PU.st.tour, name: puName(PU.st, PU.st.actif) }), api => {
    api.wrap.classList.add('pu-sheet');
    const last = PU.st.journal[PU.st.journal.length - 1], lt = puLastTxt(PU.st, last);
    api.body.innerHTML = `${puDuoOn() ? puSeesHtml(PU.duo.see || 'me') : ''}<p class="pu-h">${puDuoOn() ? T('Affichage de toute la table') : T('Affichage')}</p><div class="pu-affs" role="radiogroup" aria-label="${T('Affichage')}">${[['A', T('Tourné vers chacun')], ['B', T('Liste')], ['C', T('Table')]].map(([v, l]) => `<button type="button" role="radio" data-aff="${v}" aria-checked="${puAff() === v}"><i class="pu-ico pu-ico-${v}" aria-hidden="true"></i><span>${l}</span></button>`).join('')}</div>
      <div class="pu-menu">
        <button type="button" data-m="next"><b>${T('Tour suivant')}</b></button>
        ${PU.st.tour <= 1 ? `<button type="button" data-m="first"><b>${T('Premier joueur au hasard')}</b></button>` : ''}
        <button type="button" data-m="undo"${last ? '' : ' disabled'}><b>${T('Annuler la dernière action')}</b>${lt ? `<small>${esc(lt)}</small>` : ''}</button>
        <button type="button" data-m="end"><b>${T('Terminer la partie')}</b><small>${T('Vainqueur, résultat envoyé aux joueurs')}</small></button>
        <button type="button" data-m="pause"><b>${T('Mettre en pause')}</b><small>${T('Reprendre plus tard depuis l\'accueil')}</small></button>
        <button type="button" data-m="drop" class="danger-txt"><b>${T('Abandonner la partie')}</b><small>${T('Rien n\'est gardé')}</small></button>
      </div>${typeof puJeuMenuHtml === 'function' ? puJeuMenuHtml() : ''}${puTableMenuHtml()}`;
    api.body.addEventListener('change', e => { if (typeof puJeuMenuChange === 'function' && puJeuMenuChange(e)) return; if (e.target.id === 'puMAllco') puAllco(e.target.checked); else if (e.target.id === 'puMLock') { haptic('tap'); puSet(partieRemoteOff(PU.st, !e.target.checked)); } else if (e.target.id === 'puMDuo') { puDuoToggle(e.target.checked); api.close(); if (e.target.checked && PU.duo) puMenu(); } });      // deux téléphones allumés : le menu revient avec le QR code de la table
    api.body.addEventListener('click', e => {
      const sv = e.target.closest('[data-see]'); if (sv) { api.close(); puDuoSee(sv.dataset.see); return; }
      if (typeof puJeuMenuClick === 'function' && puJeuMenuClick(e, api)) return;      // partie-jeu.js : dés, pièce, chrono
      if (e.target.closest('[data-duomap]')) { api.close(); puDuoMapSheet(); return; }
      const a = e.target.closest('[data-aff]'); if (a) { puAffSet(a.dataset.aff); haptic('tap'); api.close(); if (puDuoOn() && PU.duo.see !== 'all') puDuoSee('all'); else puPaint(); return; }      // deux téléphones : l'affichage choisi est celui de toute la table
      const u = e.target.closest('[data-unco]'); if (u) { haptic('tap'); puCoSet(Number(u.dataset.unco), false); api.close(); return; }
      const m = e.target.closest('[data-m]'); if (!m || m.disabled) return; const k = m.dataset.m; api.close();
      if (k === 'next') puSet(partieNextTurn(PU.st));
      else if (k === 'first') { if (typeof puDrawFirst === 'function') puDrawFirst(); else { const st = partieFirst(PU.st, 0); puSet(st); toast(T('{name} commence', { name: puName(st, st.premier) })); } }
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
    const room = partieRoom(), table = room && room.host && room.id === st.id;
    api.body.innerHTML = `<p class="cf-msg">${go ? T('La partie est effacée de ce téléphone, sans résultat.') : T('La partie en préparation est effacée de ce téléphone.')}${table ? ' ' + T('Les téléphones de la table sont prévenus.') : ''}</p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn danger" type="button" data-ok>${go ? T('Abandonner') : T('Supprimer')}</button>`);
    api.foot.addEventListener('click', e => { if (!e.target.closest('[data-ok]')) return; api.close(); partieClear(); if (partieRoom()) partieRoomEnd(); if (PU.el) puClose(); else puHomePaint(); });      // salle close : les places quittent (« X a annulé / abandonné la partie »)
  });
}

/* ── Téléphones de la table pendant la partie : état envoyé (en direct), saisies des autres téléphones, co-hôtes ─────────────────────────── */
const PU_LIVE_MS = 1000, PU_ALLCO_KEY = 'deckdeal:partie:allco';
const puAllcoPref = () => { try { return localStorage.getItem(PU_ALLCO_KEY) === '1'; } catch (e) { return false; } };
/** Co-hôte (vue de la salle) : compte pour toute la table depuis son téléphone. */
const puCoOf = pos => !!(PU.view && PU.view.st === 'live' && Array.isArray(PU.view.places) && PU.view.places.some(x => x.pos === pos && x.co));
/** Partie commencée avec une table : l'état du compteur part vers les téléphones de la table PU_LIVE_MS après le premier changement (les suivants regroupés). */
function puLiveSoon() {
  const st = PU.st, room = partieRoom();
  if (!st || !st.debut || st.fin || !room || !room.host || room.id !== st.id || PU.lvOff === st.id || PU.lvT) return;
  PU.lvT = setTimeout(puLivePush, PU_LIVE_MS);
}
async function puLivePush() {
  PU.lvT = 0; const st = PU.st, room = partieRoom();
  if (!st || !st.debut || st.fin || !room || !room.host || room.id !== st.id) return;
  const x = typeof puLiveExtra === 'function' ? puLiveExtra() : null, j = JSON.stringify(partieLive(st)) + (x ? x.de.id : ''); if (j === PU.lvJ) return;      // tirage (dés, pièce, premier joueur : partie-jeu.js) joint à l'état
  if (PU.lvBusy) { PU.lvAgain = true; return; }
  PU.lvBusy = true; let wait = 0;
  try { await partieRoomLive(st, {}, x); PU.lvJ = j; }
  catch (e) { if (e.code === 'closed' || e.code === 'not_started' || e.code === 'gone' || e.code === 'kicked' || e.status === 400 || e.status === 413) PU.lvOff = st.id; else wait = e.status === 429 ? 1500 : 5000; }      // salle finie ou refus définitif : plus d'envoi ; panne : nouvel essai
  PU.lvBusy = false;
  if (PU.lvAgain || wait) { PU.lvAgain = false; if (wait) { clearTimeout(PU.lvT); PU.lvT = setTimeout(puLivePush, wait); } else puLiveSoon(); }
}
/** Saisies arrivées des autres téléphones (deltas : leur place, ou toute la table pour un co-hôte) : appliquées une fois chacune comme un appui ici (journal, annuler, « −3 » sur la tuile). */
function puRemote(list) {
  if (!PU.st || PU.mode !== 'game') return;
  const { st, done } = partieRemote(PU.st, list); if (st === PU.st) return;
  for (const d of done) {
    const n = d.k === 'v' ? d.n : d.k === 'b' ? -d.n : 0; if (!n) continue;
    const x = PU.deltas[d.pos] = PU.deltas[d.pos] && Date.now() - PU.deltas[d.pos].t < PRT_MERGE_MS ? PU.deltas[d.pos] : { n: 0, t: 0 };
    x.n += n; x.t = Date.now(); clearTimeout(x.to); x.to = setTimeout(() => { if (PU.deltas[d.pos] === x) { delete PU.deltas[d.pos]; if (PU.mode === 'game') puPaintTile(d.pos); } }, PRT_MERGE_MS);
  }
  puSet(st);
}
/** Vue de la salle pendant la partie : demandes de co-hôte (feuille, une à la fois), pastilles « Co-hôte » des tuiles. */
function puCoSync(v) {
  const key = (v.places || []).filter(x => x.co).map(x => x.pos).join(',');
  if (key !== PU.coKey) { PU.coKey = key; puPaint(); }
  const sheet = sheets.some(a => a.wrap && a.wrap.classList.contains('pu-ask')), ask = (v.places || []).find(x => x.ask && x.pos !== PU.askBusy);
  if (ask && !sheet) puAskSheet(ask);
}
function puAskSheet(x) {
  const name = x.n || T('Joueur {n}', { n: x.pos });
  openSheet(T('{name} demande à être co-hôte', { name }), T('Place {n}', { n: x.pos }), api => {
    api.wrap.classList.add('pu-sheet', 'pu-ask');
    api.body.innerHTML = `<p class="cf-msg">${T('Un co-hôte compte les points de toute la table depuis son téléphone et peut passer au tour suivant. Abandonner, éliminer, annuler ou terminer la partie restent sur ce téléphone.')}</p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-no>${T('Refuser')}</button><button class="btn" type="button" data-ok>${T('Accepter')}</button>`);
    api.foot.addEventListener('click', e => { const ok = e.target.closest('[data-ok]'), no = e.target.closest('[data-no]'); if (!ok && !no) return; haptic(ok ? 'ok' : 'tap'); api.close(); puCoSet(x.pos, !!ok); });
  });      // fermée sans répondre : reproposée au relevé suivant (la demande expire au bout de 5 min)
}
/** Le créateur accepte (ok), refuse ou retire le rôle de co-hôte d'une place. */
function puCoSet(pos, ok) {
  PU.askBusy = pos;      // réponse en route : la demande n'est pas reproposée entre-temps
  partieRoomOp('co', { pos, ok }).then(v => { PU.view = v; PU.askBusy = 0; if (PU.el && PU.mode === 'game') puCoSync(v); }, () => { PU.askBusy = 0; toast(T('Pas de réseau : réessaie')); });
}
/** « Tout le monde est co-hôte » : réglage de la salle, gardé pour la fois suivante. */
function puAllco(on) {
  try { localStorage.setItem(PU_ALLCO_KEY, on ? '1' : '0'); } catch (e) { /* choix pour cette fois */ }
  if (!partieRoom()) return;
  partieRoomOp('allco', { on }).then(v => { PU.view = v; if (PU.el && PU.mode === 'setup') puPaint(); else if (PU.el && PU.mode === 'game') puCoSync(v); }, () => toast(T('Pas de réseau : réessaie')));
}
/** Menu « … » : téléphones de la table (partie avec une salle) : saisie des autres téléphones permise ou coupée, tout le monde co-hôte, co-hôtes à retirer. */
function puTableMenuHtml() {
  if (!puOnline()) return puOffHtml();      // hors ligne : rien à régler, les autres téléphones ne suivent pas (partie-qr.js)
  const room = partieRoom(), v = PU.view; if (!room || !room.host || room.id !== PU.st.id || !v || v.st !== 'live') return '';
  const cos = (v.places || []).filter(x => x.co && !v.allco), off = !!(PU.st.rq && PU.st.rq.off);
  return `<p class="pu-h">${T('Téléphones de la table')}</p><div class="pu-card pu-tmenu">
      <label class="switch-row" for="puMLock"><span class="t"><b>${T('Saisie depuis les autres téléphones')}</b><span class="hint">${off ? T('Coupée : ils regardent la partie sans rien changer.') : T('Permise : chacun ses points, les co-hôtes toute la table.')}</span></span><span class="switch"><input type="checkbox" id="puMLock"${off ? '' : ' checked'}><i></i></span></label>
      <label class="switch-row" for="puMAllco"><span class="t"><b>${T('Tout le monde est co-hôte')}</b><span class="hint">${T('Chaque téléphone de la table compte pour tous. Coupé : seuls restent co-hôtes ceux que tu as acceptés.')}</span></span><span class="switch"><input type="checkbox" id="puMAllco"${v.allco ? ' checked' : ''}><i></i></span></label>
      ${cos.map(x => `<div class="pu-row"><span>${esc(x.n || T('Joueur {n}', { n: x.pos }))} <small>${T('Co-hôte')}</small></span><button class="btn ghost small" type="button" data-unco="${x.pos}">${T('Retirer le rôle')}</button></div>`).join('')}</div>${puDuoMenuHtml()}`;
}

/* ── Grande table sur deux téléphones (écran scindé, 5 à 8 joueurs) ─────────────────────────────────────────────────────────────────────────────────────
   Préparation (ou menu « … » en cours de partie) : « Répartir sur 2 téléphones » ; un 2e téléphone scanne le QR code de la table et touche « Écran 2 » (partie.js ›
   partieRoomJoin { ecran } : co-hôte d'office, sans place). Chaque écran montre SA moitié de la table en affichage A (puLayoutHalf : moitié haute pour l'écran 2, basse
   ici, ajustable place par place), avec une bascule « Ma moitié · L'autre moitié · Toute la table » ; les saisies de l'écran 2 sont des deltas que ce téléphone applique
   (comme un co-hôte), l'état en direct lui revient. Réglage gardé avec la partie : deckdeal:partie:duo { id, b (places de l'écran 2), auto, see }. Réseau requis. */
const PU_DUO_KEY = 'deckdeal:partie:duo', PU_DUO_MIN = 5;
const puDuoLoad = st => { try { const o = JSON.parse(localStorage.getItem(PU_DUO_KEY) || 'null'); return o && st && o.id === st.id && Array.isArray(o.b) ? { b: o.b, auto: !!o.auto, see: ['me', 'other', 'all'].includes(o.see) ? o.see : 'me' } : null; } catch (e) { return null; } };
function puDuoSave(d) { PU.duo = d; PU.duoFail = 0; try { if (d) localStorage.setItem(PU_DUO_KEY, JSON.stringify({ id: PU.st.id, ...d })); else localStorage.removeItem(PU_DUO_KEY); } catch (e) { /* réglage pour cette fois */ } }
/** Deux téléphones en cours de partie : réglé, table ouverte pour cette partie, au moins 4 joueurs. */
function puDuoOn() { const room = partieRoom(); return !!(PU.duo && PU.st && PU.st.places.length >= 4 && room && room.host && room.id === PU.st.id); }
/** Répartition automatique : la moitié haute de la table (affichage A : rangées du haut, de gauche à droite) va à l'écran 2, ce téléphone garde le bas (et le joueur seul en bas). */
function puDuoAuto(places) {
  if (places.length < 2) return [];
  const cs = puLayoutA(places).cells.slice().sort((a, b) => a.row - b.row || (a.col === 2) - (b.col === 2));
  return cs.slice(0, Math.floor(places.length / 2)).map(c => c.p.pos).sort((a, b) => a - b);
}
/** Places de l'écran 2 : choisies à la main (celles qui sont encore là), sinon automatiques ; jamais tout ni rien sur un même écran. */
function puDuoB(st = PU.st) {
  const ps = st.places.map(p => p.pos), d = PU.duo; let b = d && !d.auto ? d.b.filter(x => ps.includes(x)) : null;
  if (!b || !b.length || b.length >= ps.length) b = puDuoAuto(st.places);
  return b.slice().sort((x, y) => x - y);
}
/** Point rouge sur le bouton rond : l'écran 2 ne suit pas (pas encore là, absent, ou ce téléphone hors ligne). */
const puDuoWarn = () => !PU.net || !(PU.view && PU.view.duo && PU.view.duo.dev && PU.on.includes(0));
/** Réglage envoyé à la salle quand il change (l'écran 2 le lit dans sa vue). */
function puDuoSync() {
  const room = partieRoom(); if (!PU.st || !PU.view || !room || !room.host || room.id !== PU.st.id || !(PU.view.st === 'wait' || PU.view.st === 'live')) return;
  const b = PU.duo ? puDuoB() : null, cur = PU.view.duo ? PU.view.duo.b.join() : null, want = b ? b.join() : null;
  if (cur === want || PU.duoBusy === String(want) || Date.now() - (PU.duoFail || 0) < 10e3) return;
  PU.duoBusy = String(want);
  partieRoomOp('duo', b ? { on: true, b } : { on: false }).then(v => { PU.view = v; PU.duoBusy = ''; if (PU.el && PU.mode !== 'end') puPaint(); }, () => { PU.duoBusy = ''; PU.duoFail = Date.now(); });      // refus, panne : nouvel essai au plus toutes les 10 s
}
function puDuoToggle(on) {
  haptic('tap');
  if (on && !puNet()) { toast(T('Réseau requis : les deux téléphones passent par la table en ligne.')); if (PU.el) puPaint(); return; }
  puDuoSave(on ? { b: [], auto: true, see: 'me' } : null); puDuoSync(); if (PU.el) puPaint();
}
/** Une place passe sur l'autre écran (au moins une place sur chacun). */
function puDuoMove(pos) {
  const b = new Set(puDuoB()); if (b.has(pos)) b.delete(pos); else b.add(pos);
  if (!b.size || b.size >= PU.st.places.length) { toast(T('Il faut au moins une place sur chaque écran')); return false; }
  haptic('tap'); puDuoSave({ ...PU.duo, b: [...b], auto: false }); puDuoSync(); if (PU.el) puPaint(); return true;
}
function puDuoSee(v) { if (!PU.duo) return; haptic('tap'); puDuoSave({ ...PU.duo, see: v }); if (PU.el) puPaint(); }
/** État de l'écran 2, en clair. */
function puDuoState() {
  const d = PU.view && PU.view.duo;
  if (!PU.net) return [T('Hors ligne : l\'écran 2 ne suit plus la partie. Réseau requis.'), 'off'];
  if (d && d.dev && PU.on.includes(0)) return [T('Écran 2 connecté'), 'on'];
  if (d && d.dev) return [T('L\'écran 2 ne répond pas : il reprend tout seul, ou un autre téléphone scanne le QR code de la table.'), 'off'];
  return [T('Le 2e téléphone scanne le QR code de la table et touche « Devenir l\'écran 2 ».'), ''];
}
/** Plan de la table (affichage A en petit) : chaque place sur ce téléphone ou sur l'écran 2 ; toucher une place la passe sur l'autre écran. */
function puDuoMapHtml(st) {
  const b = new Set(puDuoB(st)), L = puLayoutA(st.places);
  return `<div class="pu-duo-map" style="--cols:${L.cols};--rows:${L.rows}">${L.cells.map(c => `<button type="button" class="pu-dm${b.has(c.p.pos) ? ' s2' : ''}" data-pu="duo-mv" data-pos="${c.p.pos}" style="grid-row:${c.row};grid-column:${c.col}${c.cs > 1 ? ' / span ' + c.cs : ''};--h:${puHue(c.p.pos)}" aria-label="${esc(T('{name} : sur {where}', { name: c.p.nom || T('Joueur {n}', { n: c.p.pos }), where: b.has(c.p.pos) ? T('l\'écran 2') : T('ce téléphone') }))}"><b>${c.p.pos}</b><span>${esc(c.p.nom || T('Joueur {n}', { n: c.p.pos }))}</span><small>${b.has(c.p.pos) ? T('Écran 2') : T('Ce téléphone')}</small></button>`).join('')}</div>
    <p class="hint pu-dm-hint">${T('Touche une place pour la passer sur l\'autre écran.')}${PU.duo && !PU.duo.auto ? ` <button class="link-btn" type="button" data-pu="duo-auto">${T('Répartition automatique')}</button>` : ''}</p>`;
}
/** Préparation : carte « Répartir sur 2 téléphones » (dès 5 joueurs ; réseau requis). */
function puDuoCardHtml(st, roomOk) {
  if (!PU.duo && st.places.length < PU_DUO_MIN) return '';
  const on = !!PU.duo && roomOk, [msg, cls] = on ? puDuoState() : ['', ''];
  return `<section class="pu-card pu-duo"><label class="switch-row" for="puDuo"><span class="t"><b>${T('Répartir sur 2 téléphones')}</b><span class="hint">${roomOk ? T('Grande table : un 2e téléphone, posé à l\'autre bout, montre l\'autre moitié de la table. Les deux comptent, la partie reste sur ce téléphone.') : T('Réseau requis : les deux téléphones passent par la table en ligne.')}</span></span><span class="switch"><input type="checkbox" id="puDuo"${on ? ' checked' : ''}${roomOk ? '' : ' disabled'}><i></i></span></label>
    ${on ? `<p class="pu-duo-st ${cls}">${esc(msg)}</p>${puDuoMapHtml(st)}` : ''}</section>`;
}
/** Menu « … » (partie avec une table) : deux téléphones, l'état de l'écran 2 (QR code de la table s'il n'est pas là), la répartition. */
function puDuoMenuHtml() {
  const room = partieRoom(); if (PU.st.places.length < PU_DUO_MIN && !PU.duo) return '';
  const on = puDuoOn(), [msg, cls] = on ? puDuoState() : ['', ''], here = cls === 'on';
  let qr = ''; if (on && !here && room) try { qr = qrSvgLogo(partieTableLink(room.c)).svg; } catch (e) { qr = ''; }
  return `<p class="pu-h">${T('Deux téléphones')}</p><div class="pu-card pu-tmenu pu-duo"><label class="switch-row" for="puMDuo"><span class="t"><b>${T('Répartir sur 2 téléphones')}</b><span class="hint">${T('Un 2e téléphone, posé à l\'autre bout, montre l\'autre moitié de la table.')}</span></span><span class="switch"><input type="checkbox" id="puMDuo"${on ? ' checked' : ''}><i></i></span></label>
      ${on ? `<p class="pu-duo-st ${cls}">${esc(msg)}</p>${qr ? `<div class="pu-qr"><div class="pu-qr-img" role="img" aria-label="${T('QR code de la table')}">${qr}</div><div class="pu-qr-t"><span>${T('Code : {c}', { c: room.c })}</span></div></div>` : ''}<button class="btn ghost small" type="button" data-duomap>${T('Quelles places sur quel écran ?')}</button>` : ''}</div>`;
}
/** Répartition des places en cours de partie (feuille). */
function puDuoMapSheet() {
  openSheet(T('Quelles places sur quel écran ?'), T('L\'écran 2 se pose à l\'autre bout de la table'), api => {
    api.wrap.classList.add('pu-sheet');
    const paint = () => { api.body.innerHTML = puDuoMapHtml(PU.st); };
    paint();
    api.body.addEventListener('click', e => { const b = e.target.closest('[data-pu]'); if (!b) return; if (b.dataset.pu === 'duo-mv') { if (puDuoMove(Number(b.dataset.pos))) paint(); } else if (b.dataset.pu === 'duo-auto') { puDuoSave({ ...PU.duo, auto: true }); puDuoSync(); haptic('tap'); paint(); if (PU.el) puPaint(); } });
  });
}
/** Bascule « Ma moitié · L'autre moitié · Toute la table » (menu de chaque écran). */
const puSeesHtml = see => `<p class="pu-h">${T('Voir')}</p><div class="pu-affs pu-sees" role="radiogroup" aria-label="${T('Voir')}">${[['me', T('Ma moitié')], ['other', T('L\'autre moitié')], ['all', T('Toute la table')]].map(([v, l]) => `<button type="button" role="radio" data-see="${v}" aria-checked="${see === v}"><i class="pu-ico pu-ico-${v}" aria-hidden="true"></i><span>${l}</span></button>`).join('')}</div>`;

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
      api.close(); const fin = partieEnd(PU.st, none ? [] : [...win]); PU.res = partieDone(fin); PU.st = fin; haptic('ok'); puPaint(); puHomePaint();
      const me = fin.places.find(p => p.sorte === 'moi'); if (me && win.has(me.pos) && !none && typeof rateMoment === 'function') rateMoment('partie');
      if (me && typeof prgGame === 'function') prgGame(fin, me, Math.min(PU.low ?? Infinity, me.vie));      // « Revenant », « Bourreau »… (progress.js)      // victoire : un bon moment pour demander une note (help.js, appli Android)
    });
  });
}
function puEndPaint() {
  const st = PU.st, r = PU.res || partieResult(st), link = partieResultLink(r, { max: PU_QR_MAX });
  let qr = ''; try { qr = link ? qrSvgLogo(link).svg : ''; } catch (e) { qr = ''; }
  const ps = r.places.slice().sort((a, b) => a.rang - b.rang || a.pos - b.pos), room = partieRoom();
  PU.el.innerHTML = `<header class="dv-head"><button class="icon-btn dv-back" type="button" data-pu="close" aria-label="${T('Fermer')}"><svg class="i"><use href="#i-back"/></svg></button><div class="dv-title"><b>${T('Partie terminée')}</b><span>${esc([puJeuName(partieJeu(r)), TN(r.tours, '{n} tour', '{n} tours'), puDur(r.duree)].join(' · '))}</span></div></header>
    <div class="dv-scroll"><div class="dv-body pu-setup">
      <section class="pu-card"><ol class="pu-rank">${ps.map(p => `<li class="${p.vainqueur ? 'win' : ''}"><span class="pu-pos">${p.vainqueur ? '<svg class="i" aria-hidden="true"><use href="#i-trophy"/></svg>' : p.rang}</span><span class="pu-who"><b>${esc(p.nom || T('Joueur {n}', { n: p.pos }))}</b>${p.commandant || p.deck ? `<small>${esc(p.commandant || p.deck)}</small>` : ''}</span></li>`).join('')}</ol></section>
      ${puEndNet(r)}${qr ? `<section class="pu-card pu-qr big"><div class="pu-qr-img" role="img" aria-label="${T('QR code du résultat')}">${qr}</div><div class="pu-qr-t"><b>${T('Résultat à scanner')}</b><span>${T('Les joueurs qui n\'ont pas rejoint la table le scannent pour garder la partie dans leur historique.')}</span></div></section>` : ''}
      ${r.places.some(p => p.sorte === 'invite') ? puInviteCard() : ''}
      <p class="hint">${room && puOnline() ? T('Les joueurs qui ont rejoint avec leur téléphone ont reçu le résultat.') : ''} ${D.user ? T('Partie gardée dans « Mes parties » ; envoyée à ton compte dès que possible.') : T('Partie gardée sur ce téléphone (« Mes parties »).')}</p>
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
  const h = e.target.closest('.pu-hit'); if (h && e.detail === 0) { puHitDo(Number(h.closest('.pu-t').dataset.pos), Number(h.dataset.d)); return; }      // clavier (Entrée, Espace) : ±1
  const b = e.target.closest('[data-pu]'); if (!b) return;
  const a = b.dataset.pu, pos = Number(b.dataset.pos);
  if (a === 'close') puClose();
  else if (a === 'login') openAccount();
  else if (a === 'guest') puGuestSheet();
  else if (a === 'myqr') puMyQr();      // partie-qr.js : QR code joueur, ajout par QR code
  else if (a === 'scan') puScanAdd();
  else if (a === 'kick') { if (partieRoom() && PU.view && PU.view.places && PU.view.places.some(x => x.pos === pos)) partieRoomOp('kick', { pos }).then(v => { PU.view = v; }).catch(() => {}); puSet(partieRemovePlace(PU.st, pos)); }
  else if (a === 'first') { puSet(pos ? partieFirst(PU.st, pos) : { ...PU.st, premier: 0 }); }
  else if (a === 'start') puStart();
  else if (a === 'drop') puDropSheet();
  else if (a === 'menu') { haptic('tap'); puMenu(); }
  else if (a === 'next') { haptic('tap'); puSet(partieNextTurn(PU.st)); }
  else if (a === 'pl') puPlayerSheet(pos);
  else if (a === 'elim') puElimSheet(pos, b.dataset.c, Number(b.dataset.par) || 0);
  else if (a === 'keep') { PU.gone.add(b.dataset.k); puPaint(); }
  else if (a === 'vie') { haptic('tap'); puVieSet(Math.max(1, Math.min(PRT_VIE_MAX, PU.st.format + Number(b.dataset.n)))); }
  else if (a === 'duo-mv') puDuoMove(pos);
  else if (a === 'duo-auto') { puDuoSave({ ...PU.duo, auto: true }); haptic('tap'); puPaint(); }
  else if (a === 'see-me') puDuoSee('me');
  else if (a === 'seat+' && PU.view && PU.view.size < 8) { b.disabled = true; puRoomOpts({ size: PU.view.size + 1 }, true); }
  else if (a === 'share-app' && typeof shareOut === 'function') shareOut({ title: 'Mana Orbit', text: T('Le compteur de points de vie et le scanner de cartes Magic de notre partie :'), url: PU_INV_URL });
  else if (typeof puJeuClick === 'function' && puJeuClick(a, b, pos)) return;      // partie-jeu.js : ordre des places, dés, attaque, chrono
  else if (a === 'again') { const old = PU.st; let st = partieNew({ jeu: partieJeu(old), format: old.format, moi: null }); for (const p of old.places) st = partieAddPlace(st, { pos: p.pos, sorte: p.sorte === 'compte' && !partieCarteRead(p.uid) ? 'invite' : p.sorte, nom: p.nom, uid: p.uid, deck: p.deck }); PU.res = null; PU.roomTry = false; puSet(st); }      // carte joueur (QR code) : encore valable pour la suivante
}

/* ── Liens : rejoindre une table (?table=CODE), résultat (?partie=…) ───────────────────────────── */
function puLaunch(qs) {
  const x = partieParseUrl(qs); if (!x) return false;
  if (x.table) setTimeout(() => puJoin(x.table), 500);
  else if (x.partie) setTimeout(() => puClaimSheet(x.partie), 500);
  else toast(T('Résultat de partie illisible'));
  return true;
}
/* Téléphone d'une place : choix gardés pour la fois suivante (prénom et commandant de l'invité, deck, partie suivie en direct) : deckdeal:partie:join { n, c, d, live }. */
const PU_JOIN_KEY = 'deckdeal:partie:join';
const puJoinPref = () => { try { const o = JSON.parse(localStorage.getItem(PU_JOIN_KEY) || 'null'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
const puJoinPrefSet = o => { try { localStorage.setItem(PU_JOIN_KEY, JSON.stringify({ ...puJoinPref(), ...o })); } catch (e) { /* choix pour cette fois */ } };
/** Connexion ou changement de compte (decks.js › onUser) : l'écran « Rejoindre la partie » se met à jour (il attendait peut-être le compte). */
function puUser(user) { if (PU.joinEl && PU.joinEl.__user) PU.joinEl.__user(user); if (user && typeof puCarteKeep === 'function') setTimeout(puCarteKeep, 5000); }      // compte connu : carte joueur renouvelée en tâche de fond (partie-qr.js)
const PU_HUES = [265, 200, 150, 28, 340, 52, 180, 300];      // couleur de chaque place, comme les tuiles du compteur
const puDqId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-5);
/** Raison de la fin d'une table (salle st 'end', retiré, disparue) → [titre, message] pour le téléphone d'une place. */
function puEndWhy(why, name) {
  const n = name || T('Le créateur');
  if (why === 'host') return [T('Partie annulée'), T('{name} a annulé la partie.', { name: n })];
  if (why === 'drop') return [T('Partie abandonnée'), T('{name} a abandonné la partie : pas de résultat.', { name: n })];
  if (why === 'stale') return [T('Partie effacée'), T('La partie a été effacée du téléphone de {name} : laissée de côté trop longtemps.', { name: n })];
  if (why === 'replaced') return [T('Table fermée'), T('{name} prépare une autre partie : cette table est fermée.', { name: n })];
  if (why === 'kicked') return [T('Retiré de la table'), T('Le créateur t\'a retiré de la table.')];
  if (why === 'ecran') return [T('Écran 2 arrêté'), T('{name} a arrêté l\'écran 2, ou un autre téléphone l\'a remplacé.', { name: n })];
  if (why === 'idle') return [T('Table fermée'), T('Table fermée : plus d\'activité depuis un moment.')];
  return [T('Table fermée'), T('La table est fermée.')];
}
/** Rejoindre la table : se connecter ou continuer en invité, place, deck ; puis attente (le téléphone peut être rangé) jusqu'au résultat ; partie commencée : la table
    en direct au choix (points de vie de chacun, tour ; SES points, ses blessures et compteurs changés d'ici, toute la table pour un co-hôte : des deltas que le téléphone
    du créateur applique, affichés tout de suite ici et recalés à son retour) ; partie annulée ou abandonnée par le créateur : écran fermé avec la raison, place oubliée. */
function puJoin(code) {
  if (PU.joinEl) PU.joinEl.__close();
  const wrap = document.createElement('div'); wrap.className = 'dv pu pu-join'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', T('Rejoindre la partie'));
  const pref = puJoinPref();
  const J = { code, peek: null, err: '', end: '', endName: '', guest: false, pos: 0, deck: pref.d || '', name: pref.n || '', cmd: pref.c || '', joined: partieRoom() && partieRoom().c === code ? partieRoom() : null, view: null, stop: null,
    t0: Date.now(), acct: null, live: !!pref.live, lv: null, net: true, on: [], buf: [], pend: [], bt: 0, sending: false, hold: new Map(), shown: {}, dl: {}, prev: null, sheet: null,
    ecran: false, see: 'me', artTried: new Set(), artRun: false };      // ecran : ce téléphone est l'écran 2 de la table (deux téléphones) ; see : sa vue (ma moitié, l'autre, toute la table)
  J.ecran = !!(J.joined && J.joined.ecran);
  PU.joinEl = wrap;
  wrap.__close = () => { if (J.stop) J.stop(); partieRoomPace(false); lock(false); clearTimeout(J.bt); for (const h of J.hold.values()) clearTimeout(h.t); J.hold.clear(); PU.joinEl = null; wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 240); releaseApp(); };
  const decks = () => (D.user && typeof allDecks === 'function' ? allDecks().filter(d => d && d.name) : []);
  const authWait = () => !D.authReady && !!D.hint && Date.now() - J.t0 < 8000;      // compte connu de cet appareil, session pas encore revenue : on l'attend (jamais l'écran de connexion pour rien)
  const hostName = () => { const h = ((J.view || {}).places || []).find(x => x.h); return (h && h.n) || (J.peek && J.peek.host) || ''; };
  const liveOn = () => !!(J.joined && J.view && ((J.view.st === 'live' && J.live) || (J.ecran && (J.view.st === 'live' || J.view.st === 'wait'))));      // l'écran 2 : allumé dès qu'il est posé
  /* Écran gardé allumé pendant que la partie se suit en direct (comme le compteur : la coque dans l'appli Android, Wake Lock sinon ; native.js). */
  const lock = on => natAwake(on, 'table');

  /* ── Saisie depuis ce téléphone : deltas regroupés (300 ms), envoyés avec un identifiant (refaits sans doublon après une coupure), affichés tout de suite ── */
  const unacked = () => { const a = (J.lv && J.lv.ack) || 0; return J.pend.filter(x => !x.s || x.s > a); };
  /** État affiché : celui du créateur, plus mes saisies pas encore appliquées par lui (tour suivant : le joueur actif passe tout de suite au suivant en jeu). */
  function lvShow() {
    const L = J.lv; if (!L) return null;
    const ps = L.places.map(p => ({ ...p, blessures: { ...p.blessures }, compteurs: { ...p.compteurs } })); let actif = L.actif;
    for (const d of [...unacked(), ...J.buf]) {
      if (d.k === 't') { const al = ps.filter(x => !x.elimine).map(x => x.pos).sort((a, b) => a - b); actif = al.find(x => x > actif) || al[0] || actif; continue; }
      const p = ps.find(x => x.pos === d.pos); if (!p || p.elimine) continue;
      if (d.k === 'v') p.vie += d.n;
      else if (d.k === 'b') { const k = d.src + (d.b ? 'b' : ''), cur = p.blessures[k] || 0, nb = Math.max(0, cur + d.n); if (nb) p.blessures[k] = nb; else delete p.blessures[k]; p.vie -= nb - cur; }
      else if (d.k === 'c') p.compteurs[d.c] = Math.max(0, (p.compteurs[d.c] || 0) + d.n);
    }
    return { ...L, actif, places: ps };
  }
  /** Ce téléphone peut-il changer cette place (la sienne ; toutes pour un co-hôte) ? '' : oui ; sinon la raison (affichée). */
  function tableWhy() {
    const v = J.view, L = J.lv; if (!v || !L || v.st !== 'live') return 'off';
    if (L.lock && !J.ecran) return 'lock';      // l'écran 2 est celui du créateur : jamais coupé
    const hp = (v.places || []).find(x => x.h); return hp && !J.on.includes(hp.pos) ? 'host' : '';
  }
  function canWhy(pos) {
    const w = tableWhy(), v = J.view; if (w) return w;
    const p = J.lv.places.find(x => x.pos === pos); if (!p) return 'off';
    if (pos !== v.me && !v.co) return 'off';
    return p.elimine ? 'dead' : '';
  }
  function add(d) {
    if (d.k === 't' ? !J.view.co || tableWhy() : canWhy(d.pos)) return;
    if (d.k === 't') J.buf.push({ ...d, n: 1, t: 1 });
    else { const same = J.buf.find(x => x.pos === d.pos && x.k === d.k && x.src === d.src && !!x.b === !!d.b && x.c === d.c && Math.abs(x.n + d.n) <= PRT_DQ_N); if (same) same.n += d.n; else J.buf.push({ ...d }); }
    J.buf = J.buf.filter(x => x.n); haptic('tap');
    if (!J.bt) J.bt = setTimeout(flush, 300);
    deltas(); paint();
  }
  function flush() {
    J.bt = 0; for (const x of J.buf) J.pend.push({ ...x, id: puDqId() }); J.buf = [];
    const todo = J.pend.filter(x => !x.s).slice(0, 20); if (!todo.length || J.sending || !partieRoom()) return;
    J.sending = true;
    partieRoomOp('delta', { d: todo.map(x => ({ id: x.id, pos: x.pos, k: x.k, n: x.n, ...(x.src ? { src: x.src } : {}), ...(x.b ? { b: 1 } : {}), ...(x.c ? { c: x.c } : {}) })) }).then(r => {
      for (const a of (r && r.acc) || []) { const x = J.pend.find(y => y.id === a.id); if (x) x.s = a.s; }
      J.net = true;
    }, e => {
      if (e.code === 'net' || e.status === 429 || e.status >= 500) { J.net = e.code !== 'net'; J.retry = setTimeout(flush, e.status === 429 ? 600 : 2500); return; }      // panne : renvoyés plus tard (mêmes identifiants : rien de doublé)
      J.pend = J.pend.filter(x => !todo.includes(x));
      toast(e.code === 'locked' ? T('Saisie coupée par le créateur') : e.code === 'eliminated' ? T('Joueur éliminé : saisie impossible') : e.code === 'not_cohost' ? T('Tu n\'es plus co-hôte : tu ne comptes plus que ta place.') : T('Saisie refusée'));
    }).finally(() => { J.sending = false; if (J.pend.some(x => !x.s) && !J.retry) setTimeout(flush, 200); J.retry = 0; paint(); });
  }
  /** Fiche d'une place que ce téléphone peut changer : points de vie, blessures de commandant reçues, compteurs (comme celle du compteur, en deltas). */
  function lvSheet(pos) {
    openSheet('', '', api => {
      api.wrap.classList.add('pu-sheet', 'pu-lvsheet', 'pu-fiche');
      const step = (k, v, lbl, extra = '', five = false) => `<div class="pu-row${five ? ' pu-row5' : ''}"><span class="pu-rl">${lbl}</span><span class="qstep">${five ? `<button type="button" class="q5" data-k="${k}" data-n="-5"${extra}>−5</button>` : ''}<button type="button" data-k="${k}" data-n="-1"${extra} aria-label="−1">−</button><b>${v}</b><button type="button" data-k="${k}" data-n="1"${extra} aria-label="+1">+</button>${five ? `<button type="button" class="q5" data-k="${k}" data-n="5"${extra}>+5</button>` : ''}</span></div>`;
      const sp = () => {
        const L = lvShow(), p = L && L.places.find(x => x.pos === pos), why = canWhy(pos); if (!p || why === 'off') { api.close(); return; }
        $('h2', api.wrap).textContent = p.nom || T('Joueur {n}', { n: pos });
        const opp = L.places.filter(x => x.pos !== pos), cmd = partieCmdOn(J.view), dis = why ? ' disabled' : '';
        api.body.innerHTML = `${why ? `<p class="hint pu-lv-why">${esc(lvWhy(why))}</p>` : ''}<div class="pu-lifebig"><button type="button" data-k="v" data-n="-10"${dis}>−10</button><button type="button" data-k="v" data-n="-1"${dis}>−1</button><b>${p.vie}</b><button type="button" data-k="v" data-n="1"${dis}>+1</button><button type="button" data-k="v" data-n="10"${dis}>+10</button></div>
          ${cmd ? `<p class="pu-h">${T('Blessures de commandant reçues')}</p>${opp.map(o => { const c = puCmd(o), two = c.includes(' + '); return step('b', p.blessures[String(o.pos)] || 0, esc(T('de {name}', { name: o.nom || o.pos })) + (c ? ` <small>${esc(two ? c.split(' + ')[0] : c)}</small>` : ''), ` data-s="${o.pos}"${dis}`, true) + (two ? step('b', p.blessures[o.pos + 'b'] || 0, `<small>${esc(c.split(' + ')[1])}</small>`, ` data-s="${o.pos}" data-b="1"${dis}`, true) : ''); }).join('')}` : ''}
          <p class="pu-h">${T('Compteurs')}</p><div class="pu-cnts">${PU_CNT.filter(([k]) => cmd || k !== 'impot').map(([k, l]) => step('c', p.compteurs[k] || 0, T(l), ` data-c="${k}"${dis}`)).join('')}</div>
          <p class="hint">${T('Compté sur le téléphone de {name}, qui garde la partie.', { name: hostName() || T('Le créateur') })}</p>`;
        if (api.__place) api.__place();
      };
      J.sheet = { api, paint: sp }; sp();
      const tile = J.ecran && $(`.pu-t[data-pos="${pos}"]`, wrap); if (tile) puSheetOnTile(api, tile, wrap);      // écran 2 : sur la tuile du joueur, tournée vers lui
      puHoldRep(api.body);
      api.body.addEventListener('click', e => {
        const b = e.target.closest('button[data-k]'); if (!b || b.disabled) return; const n = Number(b.dataset.n);
        if (b.dataset.k === 'v') add({ pos, k: 'v', n }); else if (b.dataset.k === 'b') add({ pos, k: 'b', src: Number(b.dataset.s), n, ...(b.dataset.b ? { b: 1 } : {}) }); else add({ pos, k: 'c', c: b.dataset.c, n });
      });
    });
  }
  const lvWhy = w => (w === 'lock' ? T('{name} a coupé la saisie depuis les autres téléphones : tu suis la partie sans rien changer.', { name: hostName() || T('Le créateur') })
    : w === 'host' ? (hostName() ? T('Le téléphone de {name} ne répond pas : la saisie reprendra à son retour.', { name: hostName() }) : T('Le téléphone du créateur ne répond pas : la saisie reprendra à son retour.')) : w === 'dead' ? T('Éliminé : tu suis la fin de la partie.') : '');
  /** La table en direct : chaque place (la mienne d'abord, puis dans l'ordre du tour), points de vie, tour, joueur actif, éliminés, blessures, poison, monarque, initiative. */
  function liveHtml() {
    const v = J.view, L = lvShow(), host = hostName(), me = v.me;
    if (!L) return `<section class="pu-card pu-wait">${PU_HEART}<b>${T('Tu es à la place {n}', { n: me })}</b><p>${esc(T('Les points de vie arrivent du téléphone de {name}…', { name: host }))}</p></section>`;
    const ps = L.places.slice().sort((a, b) => a.pos - b.pos), i = Math.max(0, ps.findIndex(p => p.pos >= me)), order = ps[i] && ps[i].pos === me ? [...ps.slice(i), ...ps.slice(0, i)] : ps;
    const cmd = partieCmdOn(v), co = new Set((v.places || []).filter(x => x.co).map(x => x.pos)), pending = unacked().length + J.buf.length, why = canWhy(me), coWhy = v.co ? tableWhy() : '';
    const cards = order.map(p => {
      const dead = !!p.elimine, act = L.actif === p.pos && !dead, mine = p.pos === me, can = !canWhy(p.pos), c = puCmd(p), tags = [];
      if (L.monarque === p.pos) tags.push(`<span class="pu-tag" title="${T('Monarque')}"><svg class="i" aria-hidden="true"><use href="#i-crown"/></svg></span>`);
      if (L.initiative === p.pos) tags.push(`<span class="pu-tag" title="${T('Initiative')}"><svg class="i" aria-hidden="true"><use href="#i-castle"/></svg></span>`);
      if (p.compteurs.poison) tags.push(`<span class="pu-tag" title="${T('Poison')}"><svg class="i" aria-hidden="true"><use href="#i-poison"/></svg>${p.compteurs.poison}</span>`);
      const bl = Object.values(p.blessures).reduce((a, x) => Math.max(a, x), 0); if (bl && cmd) tags.push(`<span class="pu-tag" title="${T('Blessures de commandant (la plus haute)')}"><svg class="i" aria-hidden="true"><use href="#i-sword"/></svg>${bl}</span>`);
      if (p.compteurs.impot && cmd) tags.push(`<span class="pu-tag" title="${T('Impôt de commandant')}">+${p.compteurs.impot * 2}</span>`);
      if (p.compteurs.energie) tags.push(`<span class="pu-tag" title="${T('Énergie')}"><svg class="i" aria-hidden="true"><use href="#i-bolt"/></svg>${p.compteurs.energie}</span>`);
      if (p.compteurs.experience) tags.push(`<span class="pu-tag" title="${T('Expérience')}"><svg class="i" aria-hidden="true"><use href="#i-star"/></svg>${p.compteurs.experience}</span>`);
      const d = J.dl[p.pos], nm = esc(p.nom || T('Joueur {n}', { n: p.pos })), art = puArt(p);      // illustration de son commandant en fond, comme sur les tuiles du compteur
      const recv = mine && cmd && !dead ? Object.entries(p.blessures).filter(([, n]) => n).map(([k, n]) => { const o = L.places.find(x => x.pos === parseInt(k, 10)); return `<span>${esc(T('de {name}', { name: (o && o.nom) || parseInt(k, 10) }))} <b>${n}</b></span>`; }).join('') : '';
      return `<div class="pu-lv${mine ? ' me' : ''}${act ? ' act' : ''}${dead ? ' dead' : ''}${can ? ' can' : ''}${art ? ' art' : ''}" data-lp="${p.pos}" style="--h:${PU_HUES[(p.pos - 1) % 8]}">
          ${art ? `<span class="pu-lv-bg" aria-hidden="true"><img class="pu-art" data-pos="${p.pos}" alt="" loading="lazy" decoding="async" src="${esc(art)}"></span>` : ''}<div class="pu-lv-top"><span class="pu-lv-pos">${p.pos}</span><b class="pu-lv-n">${nm}</b>${mine ? `<small class="pu-lv-pill me">${T('Toi')}</small>` : ''}${co.has(p.pos) ? `<small class="pu-lv-pill">${T('Co-hôte')}</small>` : ''}${act ? `<small class="pu-lv-pill act">${T('Joue')}</small>` : ''}</div>
          ${c ? `<small class="pu-lv-cmd">${esc(c)}</small>` : ''}
          <div class="pu-lv-mid">${can ? `<button type="button" class="pu-lv-b" data-lv="-1" aria-label="${T('{name} : −1 point de vie', { name: nm })}">−</button>` : ''}<b class="pu-lv-life">${dead ? `<svg class="i" aria-hidden="true"><use href="#i-skull"/></svg>` : p.vie}</b>${d && d.n ? `<span class="pu-lv-dl">${d.n > 0 ? '+' : ''}${d.n}</span>` : ''}${can ? `<button type="button" class="pu-lv-b" data-lv="1" aria-label="${T('{name} : +1 point de vie', { name: nm })}">+</button>` : ''}</div>
          ${dead ? `<small class="pu-lv-cmd pu-lv-out">${T('éliminé')}</small>` : tags.length ? `<div class="pu-lv-tags">${tags.join('')}</div>` : ''}
          ${recv ? `<div class="pu-lv-recv"><small>${T('Blessures de commandant reçues')}</small>${recv}</div>` : ''}
          ${can ? `<button type="button" class="pu-lv-more" data-lvs="${p.pos}">${mine ? T('Ma fiche : blessures, compteurs') : T('Fiche')}</button>` : ''}
        </div>`;
    }).join('');
    const de = deOn(), dt = de ? puRollTxt(de, L.places) : null;
    const state = pending ? `<span class="pu-lv-st">${J.net ? T('Envoi…') : T('Hors ligne : envoi au retour du réseau')}</span>` : !J.net ? `<span class="pu-lv-st">${T('Connexion perdue · nouvel essai…')}</span>` : `<span class="pu-lv-st on">${T('En direct')}</span>`;
    const msg = why && why !== 'off' ? lvWhy(why) : coWhy && coWhy !== 'off' ? lvWhy(coWhy) : '';
    return `<section class="pu-card pu-live"><div class="pu-lv-bar"><span><b>${T('Tour {t}', { t: L.tour })}</b> · ${esc(T('{name} joue', { name: (L.places.find(p => p.pos === L.actif) || {}).nom || T('Joueur {n}', { n: L.actif }) }))}</span>${state}</div>
        ${msg ? `<p class="hint pu-lv-why">${esc(msg)}</p>` : ''}${dt ? `<p class="pu-lv-de" role="status">${de.k === 'j1' ? '' : PU_DIE}<span>${esc(dt.lbl)}</span><b>${esc(de.k === 'j1' ? (de.v === me ? T('Tu commences !') : T('{name} commence', { name: dt.val })) : dt.val)}</b></p>` : ''}
        <div class="pu-lv-g">${cards}</div>
        ${v.co && !coWhy ? `<button class="btn ghost block" type="button" data-j="turn">${T('Tour suivant')}</button>` : ''}
        <p class="hint">${v.co ? esc(T('Co-hôte : tu comptes pour toute la table. Le téléphone de {name} garde la partie.', { name: host })) : esc(T('Tu changes tes points d\'ici ; les autres places sont comptées sur le téléphone de {name}.', { name: host }))}</p></section>`;
  }
  /** Co-hôte : demande, demande en attente, rôle (sauf « Tout le monde est co-hôte » : rien à demander). */
  function coHtml() {
    const v = J.view; if (!v || !(v.st === 'live' || v.st === 'wait') || v.allco) return '';
    if (v.co) return `<button class="link-btn pu-co-off" type="button" data-j="unask">${T('Ne plus être co-hôte')}</button>`;
    if (v.ask) return `<p class="hint pu-co-wait">${esc(T('Demande envoyée : {name} doit l\'accepter sur son téléphone.', { name: hostName() || T('le créateur') }))} <button class="link-btn" type="button" data-j="unask">${T('Annuler la demande')}</button></p>`;
    return `<button class="btn ghost block" type="button" data-j="ask">${T('Demander à être co-hôte')}</button>`;
  }
  /** Tirage de la table (dés, pièce, premier joueur ; état en direct, champ de) montré 10 s après son arrivée (déjà vieux de plus de 20 s : pas montré). */
  const deOn = () => (J.de && Date.now() - J.de.at < PU_ROLL_MS ? J.de.d : null);
  /** Écran 2 (grande table sur deux téléphones) : plein écran sombre, SA moitié de la table en affichage A comme le téléphone du créateur (puHalfHtml : places de la vue
      duo.b ; « L'autre moitié », « Toute la table » au choix dans le menu du bouton rond), mêmes gestes (−1 / +1, maintenu ±10, nom → fiche, « Fin du tour ») en deltas. */
  function scrHtml() {
    const v = J.view, L = v && v.st === 'live' ? lvShow() : null, host = hostName() || T('le créateur');
    if (!L) {
      const who = ((v && v.duo && v.duo.b) || []).map(pos => ((v.places || []).find(x => x.pos === pos) || {}).n || T('Joueur {n}', { n: pos }));
      return `<div class="pu-g pu-scr-wait"><div class="pu-scr-box"><span class="pu-scr-n" aria-hidden="true">2</span><b>${T('Écran 2')}</b><p>${esc(v && v.st === 'live' ? T('Les points de vie arrivent du téléphone de {name}…', { name: host }) : T('En attente du lancement de la partie par {name}…', { name: host }))}</p>
        ${who.length ? `<p class="pu-scr-who">${T('Cet écran montre :')} <b>${esc(who.join(', '))}</b></p>` : ''}<p class="hint">${esc(T('Pose ce téléphone à l\'autre bout de la table, dans le même sens que celui de {name}. Il reste allumé.', { name: host }))}</p>
        ${J.net ? '' : `<p class="pu-scr-st">${T('Hors ligne : l\'écran 2 reprend au retour du réseau.')}</p>`}<button class="btn ghost small" type="button" data-j="scr-leave">${T('Quitter l\'écran 2')}</button></div></div>`;
    }
    const b = new Set((v.duo && v.duo.b) || []), see = J.see, co = new Set((v.places || []).filter(x => x.co).map(x => x.pos)), why = tableWhy();
    const sub = see === 'all' ? L.places : L.places.filter(p => (see === 'me') === b.has(p.pos));
    const o = { dl: J.dl, co: pos => co.has(pos), ro: pos => !J.net || !!canWhy(pos), roll: deOn(), see, warn: !J.net || why === 'host', msg: !J.net ? T('Hors ligne : l\'écran 2 reprend au retour du réseau.') : why === 'host' ? T('Le téléphone de {name} ne répond pas', { name: host }) : '' };
    return `<div class="pu-g aff-A pu-duo">${see === 'all' ? puAHtml(L, o) : puHalfHtml(L, sub, o)}</div>`;
  }
  /** Menu du bouton rond de l'écran 2 : la vue, tour suivant, l'état, quitter (éliminer, annuler, terminer : sur le téléphone du créateur). */
  function scrMenu() {
    const L = lvShow(); haptic('tap');
    openSheet(T('Écran 2'), L ? T('Tour {t} · {name} joue', { t: L.tour, name: (L.places.find(p => p.pos === L.actif) || {}).nom || T('Joueur {n}', { n: L.actif }) }) : '', api => {
      api.wrap.classList.add('pu-sheet', 'pu-scr-menu');
      const why = tableWhy(), host = hostName() || T('le créateur');
      api.body.innerHTML = `${puSeesHtml(J.see)}<div class="pu-menu">${L && !why ? `<button type="button" data-sm="next"><b>${T('Tour suivant')}</b></button>` : ''}<button type="button" data-sm="leave" class="danger-txt"><b>${T('Quitter l\'écran 2')}</b><small>${esc(T('La partie continue sur le téléphone de {name}.', { name: host }))}</small></button></div>
        <p class="hint pu-lv-why">${esc(!J.net ? T('Hors ligne : envoi au retour du réseau') : why && why !== 'off' ? lvWhy(why) : T('En direct : les deux écrans comptent, le téléphone de {name} garde la partie.', { name: host }))}</p>
        <p class="hint">${esc(T('Éliminer un joueur, annuler une action, terminer la partie : sur le téléphone de {name}.', { name: host }))}</p>`;
      api.body.addEventListener('click', e => {
        const sv = e.target.closest('[data-see]'); if (sv) { J.see = sv.dataset.see; haptic('tap'); api.close(); paint(); return; }
        const m = e.target.closest('[data-sm]'); if (!m) return; api.close();
        if (m.dataset.sm === 'next') add({ pos: J.view.me, k: 't', n: 1 }); else scrLeave();
      });
    });
  }
  /** Avant d'entrer : l'écran 2 de la table, si le créateur l'a ouvert (deux téléphones) ; partie commencée : seul choix possible. */
  const scrCard = P => (P && P.duo ? `<section class="pu-card pu-scr-card"><span class="pu-scr-n" aria-hidden="true">2</span><div class="pu-qr-t"><b>${T('Écran 2 de la table')}</b><span>${T('Grande table : ce téléphone montre l\'autre moitié de la table, posé à l\'autre bout. Il ne prend pas de place.')}</span><button class="btn small" type="button" data-j="ecran"${P.scr ? ' disabled' : ''}>${P.scr ? T('L\'écran 2 est déjà là') : T('Devenir l\'écran 2')}</button></div></section>${P.st === 'wait' ? `<p class="pu-h pu-scr-or">${T('Ou prends ta place pour jouer :')}</p>` : ''}` : '');
  async function scrLeave() { await partieRoomLeave(); J.joined = null; J.view = null; if (J.stop) J.stop(); wrap.__close(); }
  /** Commandants sans image (invité qui a tapé un nom) : fiches relues du cache, sinon lues sur Scryfall une fois chacune ; repeint s'il y a du nouveau (hors ligne : rien). */
  async function artFor(places) {
    if (J.artRun || typeof dmFetch !== 'function') return;
    const need = [...new Set(places.filter(p => !(p.deck && p.deck.image)).map(puCmd1).filter(Boolean))].filter(n => !J.artTried.has(n) && !(puMeta(n) || {}).im);
    if (!need.length) return; need.forEach(n => J.artTried.add(n)); J.artRun = true;
    try { if (typeof dmLoad === 'function') await dmLoad(); const miss = need.filter(n => !puMeta(n)).map(n => ({ key: ownKey(n), name: n })); if (miss.length) await dmFetch(miss); } catch (e) { /* hors ligne */ }
    J.artRun = false; if (wrap.isConnected && need.some(n => (puMeta(n) || {}).im)) paint();
  }
  const paint = () => {
    const P = J.peek, taken = new Map(((J.view || P || {}).places || []).map(x => [x.pos, x.n])), scr = !!(J.joined && J.ecran && !J.end && !(J.view && J.view.res));
    let body, foot = '';
    if (J.end) {
      const [h, m] = puEndWhy(J.end, J.endName);
      body = `<section class="pu-card pu-wait pu-end"><svg class="i" aria-hidden="true"><use href="#i-close"/></svg><b>${esc(h)}</b><p>${esc(m)}</p>${J.ecran ? '' : `<p class="hint">${T('Ta place à cette table est oubliée.')}</p>`}</section>${puGetAppHtml()}`;
      foot = `<div class="pu-foot"><button class="btn block" type="button" data-j="close">${T('Fermer')}</button></div>`;
    } else if (scr) body = scrHtml();      // l'écran 2 : plein écran, sans en-tête
    else if (J.joined) {
      const v = J.view, res = v && v.res, me = v ? v.me : J.joined.pos, live = v && v.st === 'live';
      if (res) body = `<section class="pu-card"><p class="pu-h">${T('Partie terminée')}</p><ol class="pu-rank">${res.places.slice().sort((a, b) => a.rang - b.rang).map(p => `<li class="${p.vainqueur ? 'win' : ''}${p.pos === me ? ' me' : ''}"><span class="pu-pos">${p.vainqueur ? '<svg class="i" aria-hidden="true"><use href="#i-trophy"/></svg>' : p.rang}</span><span class="pu-who"><b>${esc(p.nom || p.pos)}</b>${p.commandant || p.deck ? `<small>${esc(p.commandant || p.deck)}</small>` : ''}</span></li>`).join('')}</ol>${J.ecran ? '' : `<p class="hint">${T('Gardée dans « Mes parties ».')}</p>`}</section>${puGetAppHtml()}`;
      if (res) foot = `<div class="pu-foot"><button class="btn block" type="button" data-j="close">${T('Fermer')}</button></div>`;
      else if (live && J.live) {
        body = liveHtml() + `<section class="pu-card pu-lv-foot">${coHtml()}<div class="pu-acts"><button class="btn ghost small" type="button" data-j="hide">${T('Masquer les points de vie')}</button><button class="btn ghost small" type="button" data-j="leave">${T('Quitter la table')}</button></div></section>`;
      } else {
        body = `<section class="pu-card pu-wait">${PU_HEART}<b>${T('Tu es à la place {n}', { n: me })}</b><p>${esc(T('Range ton téléphone : la partie se joue sur le téléphone de {name}. Le résultat arrivera ici.', { name: hostName() }))}</p>${live ? `<p class="hint">${T('Partie en cours…')}</p><button class="btn block" type="button" data-j="show">${T('Voir les points de vie')}</button>` : `<p class="hint">${T('En attente du lancement…')}</p><p class="hint">${T('Une fois la partie lancée, tu pourras suivre les points de vie de la table ici et compter les tiens.')}</p>`}
          ${coHtml()}<button class="btn ghost small" type="button" data-j="leave">${T('Quitter la table')}</button></section>`;
      }
    } else if (J.err) body = `<section class="pu-card"><p class="pu-h">${T('Table introuvable')}</p><p class="hint">${esc(J.err)}</p></section>`;
    else if (!P || authWait()) body = `<section class="pu-card pu-load"><span class="dot" aria-hidden="true"></span><p class="hint">${P ? T('Connexion à ton compte…') : T('Lecture de la table…')}</p></section>`;
    else if (P.duo && P.st !== 'wait') body = scrCard(P);      // partie commencée : seul l'écran 2 peut encore la rejoindre
    else if (!D.user && !J.guest) body = scrCard(P) + `<section class="pu-card"><p class="pu-h">${esc(T('Partie de {name}', { name: P.host || '' }) + ' · ' + puJeuTxt(P))}</p><p class="hint">${T('Connecte-toi pour garder la partie dans ton historique, ou continue en invité.')}</p><div class="pu-acts"><button class="btn" type="button" data-j="login">${T('Se connecter')}</button><button class="btn ghost" type="button" data-j="guest">${T('Continuer en invité')}</button></div></section>`;
    else {
      const seats = Array.from({ length: P.size || 8 }, (_, i) => i + 1), ds = decks();
      if (J.deck && !ds.some(d => d.id === J.deck)) J.deck = '';
      if (J.pos && taken.has(J.pos)) J.pos = 0;      // prise entre-temps par un autre
      body = scrCard(P) + `<section class="pu-card"><p class="pu-h">${esc(T('Partie de {name}', { name: P.host || '' }) + ' · ' + puJeuTxt(P))}</p>
          ${J.guest ? `<div class="field-in"><label class="label" for="puJn">${T('Prénom')}</label><input type="text" id="puJn" maxlength="24" autocomplete="given-name" value="${esc(J.name)}"></div>` : `<p class="hint pu-j-me">${esc(T('Tu joues avec ton compte : {name}', { name: puMe() }))}</p>`}
          <p class="pu-h">${T('Ta place autour de la table')}</p><div class="pu-places">${seats.map(n => `<button type="button" data-seat="${n}" aria-pressed="${J.pos === n}"${taken.has(n) ? ' disabled' : ''}><b>${n}</b><small>${esc(taken.get(n) || T('libre'))}</small></button>`).join('')}</div>
          <p class="hint pu-j-turn">${T('Dans l\'ordre du tour : la place suivante est celle du joueur à ta gauche.')}</p>
          ${!J.guest ? (ds.length ? `<p class="pu-h">${T('Ton deck')}</p><label class="sortsel pu-deck"><select data-j="deck" aria-label="${T('Ton deck')}"><option value="">${T('Aucun')}</option>${ds.map(d => `<option value="${esc(d.id)}"${J.deck === d.id ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>` : `<p class="hint">${T('Aucun deck dans « Mes decks » : tu joueras sans deck affiché.')}</p>`) : ''}
          ${J.guest ? `<div class="field-in"><label class="label" for="puJc">${partieJeu(P) === 'commander' ? T('Commandant (facultatif)') : T('Deck (facultatif)')}</label><input type="text" id="puJc" maxlength="${partieJeu(P) === 'commander' ? 80 : 40}" autocomplete="off" value="${esc(J.cmd)}"></div>` : ''}</section>`;
      foot = `<div class="pu-foot"><button class="btn block" type="button" data-j="go"${J.pos ? '' : ' disabled'}>${J.pos ? T('Prendre la place {n}', { n: J.pos }) : T('Choisis ta place')}</button></div>`;
    }
    const sc = $('.dv-scroll', wrap), top = sc ? sc.scrollTop : 0, old = $$('img.pu-art', wrap);
    wrap.classList.toggle('pu-game', scr); wrap.classList.toggle('pu-scr', scr);
    wrap.innerHTML = scr ? body : `<header class="dv-head"><button class="icon-btn dv-back" type="button" data-j="close" aria-label="${T('Fermer')}"><svg class="i"><use href="#i-back"/></svg></button><div class="dv-title"><b>${T('Rejoindre la partie')}</b><span>${esc(T('Table {c}', { c: code }))}</span></div></header>
      <div class="dv-scroll"><div class="dv-body pu-setup">${body}</div></div>${foot}`;
    if (top) { const s2 = $('.dv-scroll', wrap); if (s2) s2.scrollTop = top; }      // repeint (relevé, saisie) : la page reste où elle était
    puKeepArt(old, wrap); if (J.lv) artFor(J.lv.places);      // illustrations : gardées d'un repeint à l'autre (pas de clignotement), commandants sans image lus une fois
    const on = liveOn(); partieRoomPace(on); lock(on);
    if (J.sheet) { if (sheets.includes(J.sheet.api)) J.sheet.paint(); else J.sheet = null; }
  };
  /** Repeint en gardant le champ en cours de saisie (prénom, commandant) avec son curseur. */
  const refresh = () => {
    const a = document.activeElement, id = a && wrap.contains(a) && a.id, at = id && typeof a.selectionStart === 'number' ? a.selectionStart : null;
    paint();
    const b = id && $('#' + id, wrap); if (b) { b.focus(); if (at != null) try { b.setSelectionRange(at, at); } catch (e) { /* champ sans curseur */ } }
  };
  /** Écarts affichés quelques secondes sur une place (« −3 ») : saisis ici ou arrivés du téléphone du créateur. */
  function deltas() {
    const L = lvShow(); if (!L) return;
    for (const p of L.places) {
      const was = J.shown[p.pos]; J.shown[p.pos] = p.vie; if (was == null || was === p.vie || p.elimine) continue;
      const d = J.dl[p.pos] = J.dl[p.pos] && Date.now() - J.dl[p.pos].t < 3000 ? J.dl[p.pos] : { n: 0, t: 0 };
      d.n += p.vie - was; d.t = Date.now(); clearTimeout(d.to); d.to = setTimeout(() => { if (J.dl[p.pos] === d) { delete J.dl[p.pos]; if (wrap.isConnected) paint(); } }, 3000);
    }
  }
  /** Rôle de co-hôte : message clair au joueur quand il change (accepté, refusé, retiré, expiré, tout le monde). */
  function coNote(v) {
    const was = J.prev; J.prev = { co: !!v.co, ask: !!v.ask }; if (!was || J.ecran) return;      // l'écran 2 : co-hôte d'office, rien à dire
    const h = hostName() || T('Le créateur');
    if (!was.co && v.co) toast(v.allco && !was.ask ? T('Tout le monde est co-hôte : tu comptes aussi pour toute la table.') : T('{name} t\'a accepté comme co-hôte : tu comptes aussi pour toute la table.', { name: h }));
    else if (was.co && !v.co) toast(T('Tu n\'es plus co-hôte : tu ne comptes plus que ta place.'));
    else if (was.ask && !v.ask && !v.co && v.cw) toast(v.cw === 'exp' ? T('Ta demande de co-hôte est restée sans réponse.') : T('{name} a refusé ta demande de co-hôte.', { name: h }));
  }
  const watch = () => {
    if (J.stop) J.stop();
    J.stop = partieRoomWatch((v, x) => {
      if (x && x.gone) { J.joined = null; J.end = x.gone === 'kicked' ? (J.ecran ? 'ecran' : 'kicked') : 'gone'; J.endName = hostName(); haptic('tap'); paint(); return; }      // écran 2 retiré : arrêté par le créateur, ou remplacé
      J.net = !x || x.net !== false; J.on = (x && x.on) || J.on;
      if (v) {
        if (v.st === 'end') { J.view = v; J.endName = hostName(); J.joined = null; J.end = v.why || 'host'; haptic('tap'); paint(); return; }      // annulée, abandonnée par le créateur… : place oubliée (partieRoomWatch)
        J.view = v; coNote(v);
        if (v.live) { J.lv = v.live; const a = v.live.ack || 0; J.pend = J.pend.filter(y => !y.s || y.s > a); }
        const de = v.live && v.live.de; if (de && de.id !== J.deId) { J.deId = de.id; if (de.a <= 20) { J.de = { d: de, at: Date.now() }; haptic('tap'); setTimeout(() => { if (wrap.isConnected) paint(); }, PU_ROLL_MS + 50); } }
      }
      deltas(); paint();
    });
  };
  wrap.__paint = () => paint();      // écran 2 : remis en page quand l'écran tourne (partie-jeu.js › puResize)
  wrap.addEventListener('input', e => { if (e.target.id === 'puJn') J.name = e.target.value; else if (e.target.id === 'puJc') J.cmd = e.target.value; });      // gardés quand l'écran se repeint (choix de la place)
  wrap.addEventListener('change', e => { if (e.target.closest('[data-j="deck"]')) J.deck = e.target.value; });
  /* ±1 d'un appui, ±10 maintenu (puis toutes les 0,5 s), comme le compteur ; le repeint pendant l'appui ne l'interrompt pas (suivi au niveau de l'écran).
     Un appui par doigt (pointerId) : deux joueurs qui touchent l'écran 2 en même temps comptent chacun le leur. */
  /* Écran 2 : les moitiés − / + des tuiles (comme le compteur du créateur) ; la moitié touchée s'allume un instant. */
  const hitOf = b => { const t = b.closest('[data-lp], .pu-t'); return { pos: Number(t.dataset.lp || t.dataset.pos), d: Number(b.dataset.lv || b.dataset.d) }; };
  const life = (pos, n) => { add({ pos, k: 'v', n }); const h = J.ecran && $(`.pu-t[data-pos="${pos}"] .pu-hit.${n < 0 ? 'm' : 'p'}`, wrap); if (h) h.classList.add('fl'); };
  wrap.addEventListener('pointerdown', e => {
    const b = e.target.closest('.pu-lv-b, .pu-hit'); if (!b) return; const { pos, d } = hitOf(b);
    const id = e.pointerId, o = J.hold.get(id); if (o) clearTimeout(o.t);
    const H = { pos, d, long: false, t: setTimeout(function rep() { if (J.hold.get(id) !== H) return; H.long = true; life(pos, d * 10); H.t = setTimeout(rep, 500); }, 450) };
    J.hold.set(id, H);
  });
  const up = e => { const h = J.hold.get(e.pointerId); if (!h) return; clearTimeout(h.t); J.hold.delete(e.pointerId); J.ptr = Date.now(); if (!h.long && e.type === 'pointerup') life(h.pos, h.d); };
  wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', up);
  wrap.addEventListener('contextmenu', e => { if (e.target.closest('.pu-lv-b, .pu-hit')) e.preventDefault(); });
  wrap.addEventListener('click', async e => {
    const lb = e.target.closest('.pu-lv-b, .pu-hit'), ghost = Date.now() - (J.ptr || 0) < 700;      // clavier : ±1 (le toucher, déjà compté au relâché : le clic qui suit est ignoré ;
    if (lb || (ghost && !J.ecran)) { if (lb && !ghost) { const h = hitOf(lb); life(h.pos, h.d); } return; }      // l'écran 2, aux tuiles immobiles : seulement sur une moitié − / +, le nom reste touchable)
    const pu = J.ecran && e.target.closest('[data-pu]');      // écran 2 : bouton rond (menu), nom d'un joueur (sa fiche), « Fin du tour », retour à sa moitié
    if (pu) { const a = pu.dataset.pu; if (a === 'roll-x') { J.de = null; paint(); return; } if (a === 'menu') scrMenu(); else if (a === 'pl') { haptic('tap'); lvSheet(Number(pu.dataset.pos)); } else if (a === 'next') add({ pos: J.view.me, k: 't', n: 1 }); else if (a === 'see-me') { J.see = 'me'; haptic('tap'); paint(); } return; }
    const ls = e.target.closest('[data-lvs]'); if (ls) { haptic('tap'); lvSheet(Number(ls.dataset.lvs)); return; }
    const s = e.target.closest('[data-seat]'); if (s && !s.disabled) { J.pos = Number(s.dataset.seat); haptic('tap'); refresh(); return; }
    const b = e.target.closest('[data-j]'); if (!b || b.tagName === 'SELECT') return;
    const a = b.dataset.j;
    if (a === 'close') wrap.__close();
    else if (a === 'login') { openAccount(); J.acct = D.account && D.account.api; }      // connecté : la feuille du compte se ferme et l'écran passe au choix de la place (puUser)
    else if (a === 'guest') { J.guest = true; paint(); setTimeout(() => { const n = $('#puJn', wrap); if (n && !n.value) n.focus(); }, 60); }
    else if (a === 'leave') { await partieRoomLeave(); J.joined = null; J.view = null; if (J.stop) J.stop(); wrap.__close(); }
    else if (a === 'show' || a === 'hide') { J.live = a === 'show'; puJoinPrefSet({ live: J.live }); haptic('tap'); paint(); }
    else if (a === 'turn') add({ pos: J.view.me, k: 't', n: 1 });
    else if (a === 'scr-leave') scrLeave();
    else if (a === 'ecran') {      // ce téléphone devient l'écran 2 de la table (sans place, sans compte)
      b.disabled = true;
      try { J.view = await partieRoomJoin(code, { ecran: true }); J.joined = partieRoom(); J.ecran = true; J.see = 'me'; haptic('ok'); watch(); }
      catch (er) { toast(er && er.code === 'screen_taken' ? T('L\'écran 2 de cette table est déjà là.') : er && er.code === 'no_duo' ? T('Le créateur n\'a pas ouvert d\'écran 2 pour cette table.') : er && er.code === 'net' ? T('Pas de réseau : réessaie') : T('Impossible de rejoindre la table')); try { J.peek = await partiePeek(code); } catch (x) { /* garde l'ancienne vue */ } }
      paint();
    }
    else if (a === 'ask' || a === 'unask') { b.disabled = true; try { J.view = await partieRoomOp('ask', a === 'unask' ? { off: 1 } : {}); coNote(J.view); haptic('tap'); } catch (er) { toast(er && er.code === 'ask_wait' ? T('Demande refusée il y a un instant : attends un peu.') : T('Pas de réseau : réessaie')); } paint(); }
    else if (a === 'go') {
      const nom = J.guest ? partieStr(($('#puJn', wrap) || {}).value || J.name, PRT_LEN.nom) : puMe(); if (J.guest && !nom) { const n = $('#puJn', wrap); if (n) n.focus(); return; }
      const d = decks().find(x => x.id === J.deck), deck = J.guest ? partieDeck(partieJeu(J.peek) === 'commander' ? { commandant: J.cmd } : { nom: J.cmd }) : d ? partieDeckOf(d, puDeckImg(d)) : null;
      b.disabled = true;
      try {
        J.view = await partieRoomJoin(code, { pos: J.pos, n: nom, p: J.guest ? '' : PROF.photo || '', l: I18N.lang, ...(deck ? { deck } : {}), guest: J.guest }); J.joined = partieRoom(); haptic('ok'); watch();
        puJoinPrefSet(J.guest ? { n: nom, c: partieStr(J.cmd, PRT_LEN.cmd) } : { d: J.deck });      // la fois suivante : déjà rempli
      } catch (er) { toast(er && er.code === 'taken' ? T('Place déjà prise : choisis-en une autre') : er && er.code === 'net' ? T('Pas de réseau : réessaie') : T('Impossible de rejoindre la table')); try { J.peek = await partiePeek(code); } catch (x) { /* garde l'ancienne vue */ } }
      paint();
    }
  });
  /* Compte arrivé (session restaurée après l'ouverture du lien, ou connexion depuis cet écran) : choix de la place, sans la feuille du compte par-dessus ; decks relus. */
  wrap.__user = u => {
    if (u && J.acct) { if (sheets.includes(J.acct)) J.acct.close(); J.acct = null; }
    if (!wrap.isConnected) return; refresh();
    for (const ms of [900, 2500]) setTimeout(() => { if (wrap.isConnected && !J.joined) refresh(); }, ms);      // « Mes decks » du compte : lus juste après
  };
  document.body.appendChild(wrap); holdApp(); paint(); requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('on')));
  if (authWait()) setTimeout(() => { if (wrap.isConnected) refresh(); }, 8100);      // session qui ne revient pas : connexion ou invité
  if (J.joined) watch();
  else partiePeek(code).then(p => { J.peek = p; if (p && p.st && p.st !== 'wait' && !(p.duo && p.st === 'live')) J.err = T('La partie a déjà commencé.'); paint(); }, er => { J.err = er && er.code === 'net' ? T('Pas de réseau : la table ne peut pas être lue.') : T('Cette table n\'existe plus.'); paint(); });      // commencée : seul l'écran 2 (deux téléphones) peut encore la rejoindre
  // pas encore assis : la table relue toutes les 6 s pendant 10 min (place ajoutée par le créateur en Standard, places prises ; decks du compte arrivés) ; repeinte seulement
  // si elle a changé, le champ en cours de saisie (prénom, deck) gardé avec son curseur
  const t0 = Date.now(), seen = () => JSON.stringify(J.peek && [J.peek.size, J.peek.jeu, J.peek.format, J.peek.places, J.peek.duo, J.peek.scr, J.peek.st, decks().length, D.uid || '']);
  const tick = setInterval(() => {
    if (!wrap.isConnected || Date.now() - t0 > 600e3) { clearInterval(tick); return; }
    if (J.joined || J.err || J.end || !J.peek) return;
    partiePeek(code).then(p => {
      if (!p || J.joined || !wrap.isConnected) return; const was = seen(); J.peek = p; if (seen() === was) return;
      refresh();
    }, () => {});
  }, 6000);
}
/** Résultat scanné (?partie=…) : « c'était moi : place N » → historique (et compte). */
function puClaimSheet(r) {
  openSheet(T('Résultat d\'une partie'), [new Date(r.date).toLocaleDateString(LOC(), { day: 'numeric', month: 'long' }), puJeuName(partieJeu(r)), TN(r.tours, '{n} tour', '{n} tours')].join(' · '), api => {
    api.wrap.classList.add('pu-sheet');
    api.body.innerHTML = `<p class="pu-h">${T('Quelle place était la tienne ?')}</p><div class="pu-wins">${r.places.slice().sort((a, b) => a.rang - b.rang).map(p => `<button type="button" data-cl="${p.pos}"><span>${p.vainqueur ? '<svg class="i" aria-hidden="true"><use href="#i-trophy"/></svg>' : ''}${esc(p.nom || p.pos)}</span><small>${esc(p.commandant || p.deck || T('Place {n}', { n: p.pos }))}</small></button>`).join('')}</div><p class="hint">${D.user && !puOnline() ? T('Hors ligne : ajoutée à « Mes parties » tout de suite, envoyée à ton compte au retour du réseau.') : D.user ? T('Ajoutée à « Mes parties » et à ton compte.') : T('Ajoutée à « Mes parties » sur ce téléphone.')}</p>`;      // hors ligne : la réclamation attend en file (partie.js › partieFlush, au retour du réseau)
    api.body.insertAdjacentHTML('beforeend', puGetAppHtml());
    api.body.addEventListener('click', e => { const b = e.target.closest('[data-cl]'); if (!b) return; if (partieClaim(r, Number(b.dataset.cl))) { haptic('ok'); api.close(); toast(T('Partie ajoutée à « Mes parties »')); puHomePaint(); } });
  });
}

/* ── Mes parties ──────────────────────────────────────────────────────────────────────────────── */
async function puHist(tab) {
  openSheet(T('Mes parties'), '', api => {
    api.wrap.classList.add('pu-sheet');
    let items = partieHist().sort((a, b) => b.date - a.date), view = tab === 'stats' ? 'stats' : 'list', jf = '';      // jf : statistiques d'un seul format ('' : tous)
    api.body.innerHTML = `<div class="seg pu-tabs" role="radiogroup" aria-label="${T('Mes parties')}"></div><div class="pu-hbody"></div>`;
    mountSeg($('.pu-tabs', api.body), [{ v: 'list', label: T('Parties') }, { v: 'stats', label: T('Statistiques') }], view, v => { view = v; paint(); });
    const paint = () => {
      const won = items.filter(x => x.moi && (x.places.find(p => p.pos === x.moi) || {}).vainqueur).length;
      let sub = $('.sheet-head p', api.wrap); if (!sub) { sub = document.createElement('p'); $('.sheet-head > div', api.wrap).appendChild(sub); }
      sub.textContent = items.length ? TN(items.length, '{n} partie · {w} gagnée(s)', '{n} parties · {w} gagnée(s)', { n: items.length, w: won }) : '';
      $('.pu-hbody', api.body).innerHTML = view === 'stats' ? puStatsJeuHtml(items, jf) : items.length ? `<ul class="pu-hist">${items.map(x => { const me = x.places.find(p => p.pos === x.moi), w = x.places.filter(p => p.vainqueur).map(p => p.nom || p.pos); return `<li><button type="button" data-h="${esc(x.id)}"><span class="pu-hd">${esc(new Date(x.date).toLocaleDateString(LOC(), { day: 'numeric', month: 'short' }))}</span><span class="pu-who"><b>${me && me.vainqueur ? '<svg class="i" aria-hidden="true"><use href="#i-trophy"/></svg>' : ''}${esc(x.places.map(p => p.nom || p.pos).join(', '))}</b><small>${partieJeu(x) !== 'commander' ? `<span class="pu-jtag">${esc(puJeuName(partieJeu(x)))}</span> ` : ''}${esc([me && (me.commandant || me.deck), w.length ? T('vainqueur : {name}', { name: w.join(', ') }) : T('aucun vainqueur'), TN(x.tours, '{n} tour', '{n} tours')].filter(Boolean).join(' · '))}</small></span></button></li>`; }).join('')}</ul>`
        : `<p class="hint">${T('Aucune partie pour l\'instant. Lance-en une depuis l\'accueil : les résultats arrivent ici.')}</p>`;
    };
    paint();
    if (D.user && CTX.partie && puOnline()) partieHistFetch(0, 50).then(j => {      // historique du compte : parties jouées sur d'autres téléphones
      const by = new Map(items.map(x => [x.id, x])); for (const it of (j && j.items) || []) { const c = partieHistClean(it); if (c && !by.has(c.id)) by.set(c.id, c); }
      items = [...by.values()].sort((a, b) => b.date - a.date); if (sheets.includes(api)) paint();
    }, () => {});
    api.body.addEventListener('click', e => {
      const j = e.target.closest('[data-sj]'); if (j) { jf = j.dataset.sj; haptic('tap'); paint(); return; }
      const b = e.target.closest('[data-h]'); if (!b) return; const x = items.find(y => y.id === b.dataset.h); if (x) puHistOne(x);
    });
  });
}
/** Statistiques, avec un choix du format dès que l'historique en mêle plusieurs (Tous, Commander, Standard, Libre : chaque format compté à part). */
function puStatsJeuHtml(items, jf) {
  const all = partieStats(items), js = PRT_JEUX.filter(j => all.jeux[j]), cur = js.includes(jf) ? jf : '';
  const chips = js.length > 1 ? `<div class="pu-chips pu-sjeu" role="group" aria-label="${T('Format')}">${[['', T('Tous'), all.n], ...js.map(j => [j, puJeuName(j), all.jeux[j]])].map(([v, l, n]) => `<button type="button" data-sj="${v}" aria-pressed="${cur === v}">${esc(l)} <small>${n}</small></button>`).join('')}</div>` : '';
  return chips + puStatsHtml(cur ? partieStats(items, { jeu: cur }) : all);
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
  openSheet(new Date(x.date).toLocaleString(LOC(), { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }), [puJeuTxt(x), TN(x.tours, '{n} tour', '{n} tours'), puDur(x.duree)].join(' · '), api => {
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
