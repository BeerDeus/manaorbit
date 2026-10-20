/* ── home.js : page d'accueil (section Accueil de la barre du bas, nav.js) ─────────────────────────────────────────────────────────────────
   · Orbe « Ma collection » : valeur (prix tendance Cardmarket), cartes, variation sur 7 jours ; les 5 terrains de base tournent autour
     (illustration de ceux de la collection s'ils y sont, sinon la fiche Scryfall, lue une fois), sur une orbite en pointillés.
   · Carte « Échange » : doublons, cartes recherchées, lien en direct ; QR code et Partager (le lien est créé au besoin) ;
     « Pour toi » : tes amis qui ont le plus de cartes pour toi (friends.js, toujours à jour), puis les listes ouvertes récemment par un lien,
     avec ce qu'elles ont pour toi (relevé à la dernière ouverture, homeSeen).
   · « Prochaines extensions » (sets.js, cachée tant qu'elle n'a rien à montrer) et « Comment ça marche ? » (aide, help.js) en bas.
   Mes decks, decks à monter et prix d'une liste sont dans la section Decks ; le scan (et son prix rapide) au milieu de la barre.
   Tout est repeint en différé (homeSoon) quand la collection, les decks, les prix ou la liste d'échange changent.
   · Ordinateur (souris, écran ≥ 1 100 px : NAV_DESK de nav.js, même requête que css/zz-desktop.css) : tableau de bord en trois colonnes à la hauteur
     de l'écran (homeDesk) ; blocs .hm-dk de body.html (salutation, chiffres, courbe de valeur, raccourcis, « Mana Orbit sur ton téléphone ») cachés ailleurs. */
const HM = { t: 0, v: null, raf: 0, lands: false, ord: null, rz: 0 };
const HM_SEEN_KEY = 'deckdeal:hmseen:v1', HM_SEEN_MAX = 5;
/* Jusqu'au 19 octobre, les listes ouvertes étaient gardées sous deckdeal:seen:v1, la clé des documents du compte vus sur le serveur (decks.js › acctSeen) :
   chacun écrasait l'autre. Liste d'avant déplacée sous sa propre clé ; les documents vus sont renotés à la synchro suivante. */
try { const old = JSON.parse(localStorage.getItem('deckdeal:seen:v1') || 'null'); if (Array.isArray(old)) { if (!localStorage.getItem(HM_SEEN_KEY)) localStorage.setItem(HM_SEEN_KEY, JSON.stringify(old)); localStorage.removeItem('deckdeal:seen:v1'); } } catch (e) { /* stockage indisponible */ }
const HM_LANDS = [['W', 'plains', 'Plains'], ['U', 'island', 'Island'], ['B', 'swamp', 'Swamp'], ['R', 'mountain', 'Mountain'], ['G', 'forest', 'Forest']];
const hmEur = c => new Intl.NumberFormat(LOC(), { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(c / 100));      // euros entiers dans l'écriture de la langue : « 1 234 € », « €1,234 », « 1.234 € »
/** Petite image Scryfall → recadrage de l'illustration (même chemin, autre taille). */
const hmArt = u => String(u || '').replace('/small/', '/art_crop/').replace('/normal/', '/art_crop/');

function homeSoon(ms = 120) { if (typeof document === 'undefined') return; clearTimeout(HM.t); HM.t = setTimeout(homePaint, ms); }

/** Valeur de la collection : somme des prix tendance (centimes) ; à défaut le dernier relevé de l'historique. */
function homeValue() {
  let v = collValue();      // prix de l'édition de chaque ligne s'il est connu, sinon celui de la carte
  if (!v && VAL.hist.length) v = VAL.hist[VAL.hist.length - 1].v;
  return v;
}
/** Le chiffre défile jusqu'à sa valeur (euros entiers). */
function homeCount(el, to) {
  const from = HM.v == null ? 0 : HM.v; HM.v = to; cancelAnimationFrame(HM.raf);
  if (reduceMotion() || from === to || document.getElementById('splash')) { el.textContent = hmEur(to); return; }      // sous l'écran de lancement : valeur finale (le défilement, invisible, repeignait chaque image)
  const t0 = performance.now(), d = from ? 600 : 1400;
  const step = now => { const p = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - p, 3); el.textContent = hmEur(Math.round(from + (to - from) * e)); if (p < 1) HM.raf = requestAnimationFrame(step); };
  HM.raf = requestAnimationFrame(step);
}

function homePaint() {
  const home = $('#viewHome'); if (!home) return;
  // Orbe
  const sv = typeof opnSv === 'function' ? opnSv() : null;      // mode streamer (opening.js) : l'orbe ne montre que la session (le widget Android garde la vraie collection)
  const n = sv ? sv.n : collCount(), orb = $('#btnColl'), val = $('#hmValue'), cnt = $('#hmCount'), dl = $('#hmDelta');
  orb.dataset.empty = n ? '0' : '1';
  if (n) {
    const v = sv ? sv.v : homeValue();
    if (v > 0) homeCount(val, v); else { HM.v = null; val.textContent = nf0(n); }
    cnt.textContent = v > 0 ? TN(n, '{n} carte', '{n} cartes') : TN(n, 'carte', 'cartes');
    const h = sv ? null : histDelta(VAL.hist, 7);
    if (h && Math.abs(h.d) >= 100) { dl.hidden = false; dl.className = h.d < 0 ? 'down' : ''; dl.textContent = T('{d} · 7 j', { d: (h.d < 0 ? '▼ −' : '▲ +') + hmEur(Math.abs(h.d)) }); } else dl.hidden = true;
  } else { HM.v = null; val.textContent = T('Commencer'); cnt.textContent = T('Ajoute tes cartes'); dl.hidden = true; }
  orb.setAttribute('aria-label', n ? T('Ma collection : {v}, {n} cartes', { v: val.textContent, n: nf0(n) }) : T('Ma collection : ajoute tes cartes'));
  widgetSoon();                                                                          // widget Android : mêmes chiffres (widget.js)
  homeLands();
  // Échange
  try {
    const st = trState(), ts = $('#hmTradeSub');
    ts.textContent = n || st.want.length ? TN(st.have.length, '{n} doublon', '{n} doublons') + ' · ' + TN(st.want.length, '{n} recherchée', '{n} recherchées') : T('Doublons et cartes recherchées');
    $('#hmLive').hidden = !TR.share;
  } catch (e) { /* liste d'échange pas encore prête */ }
  homeForYou();
  if (typeof setsSoon === 'function') setsSoon();                                        // prochaines extensions (sets.js)
  if (typeof rateTick === 'function') rateTick();                                        // demande de note : decks devenus complets (help.js)
  homeDeskPaint();
}
/** Illustrations des terrains de base : celles de la collection si elle les a, sinon la fiche Scryfall lue une fois par la file de l'appli
 *  (cache de l'appareil, pause Scryfall respectée) ; en attendant, un dégradé aux couleurs du terrain. */
function homeLands() {
  let miss = false;
  for (const [c, k] of HM_LANDS) {
    const img = $(`.hm-land[data-c="${c}"] img`); if (!img) continue;
    const m = dmOf(k), src = m && m.im ? hmArt(m.im) : '';
    if (!src) { miss = true; continue; }
    img.title = m.ar ? T('Illustration : {artist}', { artist: m.ar }) : '';      // crédit de l'artiste, demandé par Scryfall pour les recadrages art_crop (lu avec la fiche, sans requête de plus)
    if (img.getAttribute('src') === src) continue;
    img.onload = () => img.classList.add('ok'); img.onerror = () => img.classList.remove('ok'); img.src = src;
  }
  if (miss && !HM.lands) {
    HM.lands = true;
    setTimeout(async () => { if (S.view !== 'home' || document.querySelector('body > .dv.on, .sheet-wrap.open')) { HM.lands = false; return; }      // seulement quand l'accueil est vraiment à l'écran : jamais pendant la collection, un scan ou une feuille
      try { await dmLoad(); if (await dmFetch(HM_LANDS.map(([, key, name]) => ({ key, name })), true)) homeSoon(); else if (HM_LANDS.some(([, k]) => !(dmOf(k) || {}).im)) HM.lands = false; } catch (e) { HM.lands = false; } }, 3000);
  }
}
/* ── « Pour toi » : listes d'amis ouvertes récemment ─────────────────────────────────────────────────────────────────────────────────────
   Chaque liste d'échange ouverte par un lien (share.js › openPublicTrade, pas l'aperçu de la sienne) est retenue sur l'appareil : identifiant,
   pseudo, cartes « Pour toi » relevées à l'ouverture, date. Les 3 dernières s'affichent sur l'accueil ; toucher en rouvre la liste (lecture à jour). */
function homeSeenList() { try { const l = JSON.parse(localStorage.getItem(HM_SEEN_KEY) || '[]'); return Array.isArray(l) ? l.filter(x => x && typeof x.id === 'string' && /^[\w-]{6,40}$/.test(x.id)) : []; } catch (e) { return []; } }
/** Lien du compte connecté (son lien actuel, ou un partage qu'il a créé : o = son empreinte) : jamais dans « Pour toi ». */
const homeSeenMine = x => !!x && (x.id === TR.share || (!!x.o && !!D.uid && TR.tagUid === D.uid && x.o === TR.tag));
function homeSeen(id, by, n, o) {
  if (!id) return;
  const e = { id, by: String(by || '').slice(0, 40), n: Math.max(0, Number(n) || 0), at: Date.now(), ...(/^[0-9a-f]{64}$/.test(o || '') ? { o } : {}) };
  const l = homeSeenList().filter(x => x.id !== id); if (!homeSeenMine(e)) l.unshift(e);
  try { localStorage.setItem(HM_SEEN_KEY, JSON.stringify(l.slice(0, HM_SEEN_MAX))); } catch (e) { /* stockage plein */ }
  homeSoon();
}
function homeForYou() {
  const box = $('#hmForYou'), ul = $('#hmFyList'); if (!box || !ul) return;
  const fr = amHome(), share = new Set(fr.map(f => f.s).filter(Boolean));      // amis (friends.js) : toujours à jour ; puis les listes ouvertes par un lien (pas déjà celle d'un ami)
  if (D.uid && TR.tagUid !== D.uid && typeof ownerTag === 'function') { const u = D.uid; ownerTag(u).then(t => { if (D.uid !== u) return; TR.tag = t; TR.tagUid = u; homeSoon(); }).catch(() => {}); }      // empreinte du compte : reconnaît ses propres liens
  const l = [...fr.map(f => ({ fa: f.id, id: f.id, by: amName(f), p: f.p, n: f.m })), ...homeSeenList().filter(x => !share.has(x.id) && !homeSeenMine(x))].slice(0, 3);
  box.hidden = !l.length; if (!l.length) { ul.innerHTML = ''; return; }
  const h = $('.hm-fy-h', box); if (h) h.innerHTML = `<b>${T('Pour toi')}</b> ${fr.length ? T('· tes amis') : T('· listes d\'amis ouvertes')}`;
  ul.innerHTML = l.map(x => { const nm = x.by || T('Liste d\'un ami'); return `<li><button type="button" class="hm-fy-r" ${x.fa ? `data-fa="${esc(x.fa)}"` : `data-fy="${esc(x.id)}"`}><span class="hm-fy-av" aria-hidden="true" style="--h:${hash32(x.id) % 360}">${esc((nm.trim()[0] || '?').toUpperCase())}${x.p ? `<img alt="" src="${esc(x.p)}">` : ''}</span><span class="hm-fy-t"><b>${esc(nm)}</b> · ${x.n ? TN(x.n, '{n} carte pour toi', '{n} cartes pour toi') : T('rien pour toi pour l\'instant')}</span><svg class="i" aria-hidden="true"><use href="#i-chev"/></svg></button></li>`; }).join('');
}
/** QR code / Partager de l'accueil : le lien de la liste d'échange, créé d'abord s'il n'existe pas (compte demandé si besoin). */
async function homeTradeAct(qr) {
  haptic('tap');
  if (!TR.share) { await trShareOn(); if (!TR.share) return; }
  if (qr) trQrOpen(); else trSend(TR.share);
}

/* ── Ordinateur : tableau de bord ────────────────────────────────────────────────────────────────────────────────────────────────────────
   Salutation sur toute la largeur, puis trois colonnes créées ici (le téléphone garde son DOM tel quel) : orbe et chiffres, courbe de valeur · raccourcis, échange, partie,
   « Mana Orbit sur ton téléphone » · installation, prochaines extensions (8 au lieu de 4, la liste défile seule), aide. Défaites si la fenêtre redevient étroite (ordre d'origine rendu). */
const HM_COLS = [['hm-c1', ['.hm-hero', '.hm-dk-val']], ['hm-c2', ['.hm-dk-acts', '#hmTrade', '#hmPartie', '#hmStores']], ['hm-c3', ['#installWrap', '#buyBar', '#hmSets', '#btnHelp']]];
const homeDeskOn = () => !!(typeof NAV_DESK !== 'undefined' && NAV_DESK && NAV_DESK.matches);
function homeDesk() {
  const home = $('#viewHome'); if (!home) return;
  const on = homeDeskOn(), box = $('.hm-cols', home);
  if (on === !!box) return;
  if (on) {
    HM.ord = [...home.children];
    const cols = document.createElement('div'); cols.className = 'hm-cols';
    const hd = $('.hm-dk-head', home); if (hd) cols.appendChild(hd);      // salutation sur toute la largeur : les trois colonnes commencent à la même hauteur
    for (const [c, sel] of HM_COLS) { const col = document.createElement('div'); col.className = 'hm-col ' + c; for (const q of sel) { const el = $(q, home); if (el) col.appendChild(el); } cols.appendChild(col); }
    home.prepend(cols); homeDeskPaint(); if (typeof setsSoon === 'function') setsSoon(); return;
  }
  const kids = $$('.hm-cols > .hm-dk-head, .hm-col > *', box), ord = (HM.ord || []).filter(x => kids.includes(x) || x.parentNode === home);
  for (const k of kids) if (!ord.includes(k)) { const p = k.previousElementSibling, i = p ? ord.indexOf(p) : -1; ord.splice(i < 0 ? ord.length : i + 1, 0, k); }      // ajouté pendant (carte « Partie ») : après son voisin
  box.remove(); home.append(...ord); if (typeof setsSoon === 'function') setsSoon();      // 4 extensions de nouveau
}
/** Salutation, chiffres de la collection et courbe de valeur (rien hors ordinateur). */
function homeDeskPaint() {
  if (!homeDeskOn() || !$('.hm-cols')) return;
  const now = new Date(), hr = now.getHours(), eve = hr >= 18 || hr < 5, nm = String(PROF.name || (D.user && D.user.displayName) || '').trim().split(/\s+/)[0].slice(0, 24);
  const d = now.toLocaleDateString(LOC(), { weekday: 'long', day: 'numeric', month: 'long' });
  $('#hmDkDate').textContent = d.charAt(0).toUpperCase() + d.slice(1);
  $('#hmDkHi').textContent = nm ? T(eve ? 'Bonsoir {name}' : 'Bonjour {name}', { name: nm }) : T(eve ? 'Bonsoir' : 'Bonjour');
  const n = collCount(), dl = days => { const h = histDelta(VAL.hist, days); return h && Math.abs(h.d) >= 100 ? `<b class="${valCls(h.d)}">${(h.d < 0 ? '−' : '+') + esc(hmEur(Math.abs(h.d)))}</b>` : '<b>—</b>'; };      // euros entiers, comme l'orbe
  const al = n ? valAlertN() : 0;
  $('#hmDkKpi').innerHTML = `<div><b>${nf0(n)}</b><span>${TN(n, 'carte différente', 'cartes différentes')}</span></div><div><b>${nf0(collCopies())}</b><span>${T('exemplaires')}</span></div>`
    + `<div>${dl(7)}<span>${T('sur 7 jours')}</span></div><div>${dl(30)}<span>${T('sur 30 jours')}</span></div>`
    + (al ? `<button type="button" class="hm-dk-mv" data-hm="stats">${TN(al, '{n} prix a bougé', '{n} prix ont bougé')} ›</button>` : '');
  homeDeskChart();
}
/** Courbe de valeur à la taille de sa case (redessinée quand sa case change de taille, accueil caché puis rouvert compris). */
function homeDeskChart() {
  const el = $('#hmDkChart'); if (!el || !el.isConnected || !homeDeskOn()) return;
  const h = VAL.hist.slice(-120), W = Math.round(el.clientWidth), H = Math.round(el.clientHeight);
  if (!W) return;      // accueil caché (autre vue) : redessinée à son retour
  if (h.length < 2 || W < 120 || H < 60) { el.innerHTML = `<p class="hint">${collCount() ? T('La courbe se dessine jour après jour : un relevé des prix par jour.') : T('Ajoute tes cartes : leur valeur sera suivie chaque jour.')}</p>`; return; }
  el.innerHTML = valChartHtml(h, W, H);
}
/** Google Play / App Store : « Bientôt » tant que l'appli n'est pas publiée ; Google Play mène à la fiche dès que RATE_ASK passe à true (help.js). */
function homeStore(k) {
  haptic('tap');
  if (k === 'play' && RATE_ASK) { window.open(PLAY_URL, '_blank', 'noopener'); return; }
  const api = openSheet(T('Bientôt'), k === 'play' ? T('Appli Android · Google Play') : T('Appli iPhone · App Store'), a => {
    a.body.innerHTML = `<div class="hm-soon"><span class="hm-soon-i" aria-hidden="true"><svg class="i"><use href="#${k === 'play' ? 'i-play' : 'i-phone'}"/></svg></span>`
      + `<p><b>${k === 'play' ? T('L\'appli Android arrive très bientôt sur Google Play.') : T('L\'appli iPhone est en préparation.')}</b></p>`
      + `<p class="hint">${T('Ta collection, tes decks et ta liste d\'échange suivent ton compte : tu les retrouveras tels quels sur ton téléphone.')}</p></div>`;
    a.setFoot(`<button class="btn" type="button" data-close>${T('OK')}</button>`);
  });
  api.wrap.classList.add('hm-soon-w');
}

function homeInit() {
  $('#btnTrade').onclick = () => { haptic('tap'); if (typeof navOpen === 'function') navOpen(() => openCollection('trade')); else openCollection('trade'); };
  $('#btnTradeQr').onclick = () => homeTradeAct(true);
  $('#btnTradeShare').onclick = () => homeTradeAct(false);
  $('#hmFyList').addEventListener('click', e => { const a = e.target.closest('[data-fa]'), b = e.target.closest('[data-fy]'); if (a) { haptic('tap'); amOpenFriend(a.dataset.fa); } else if (b) { haptic('tap'); openPublicLink(b.dataset.fy); } });
  $('#btnHome').onclick = () => { haptic('tap'); showView('home'); };
  $('#btnHelp').onclick = () => { haptic('tap'); openHelp(); };
  $('#viewHome').addEventListener('click', e => {
    const s = e.target.closest('[data-store]'); if (s) { homeStore(s.dataset.store); return; }
    const b = e.target.closest('[data-hm]'); if (!b) return;
    const a = b.dataset.hm; if (a === 'scan') { navGo('scan'); return; }
    haptic('tap');
    if (a === 'import') openCollImport();
    else if (a === 'stats') navOpen(() => openCollection('stats'));
    else if (a === 'price' || a === 'build') dkTabGo(a);
  });
  if (isNativeApp()) $('#hmStores').remove();      // l'appli Android n'annonce pas les stores
  homeDesk();
  if (typeof NAV_DESK !== 'undefined' && NAV_DESK) NAV_DESK.addEventListener('change', homeDesk);
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { clearTimeout(HM.rz); HM.rz = setTimeout(homeDeskChart, 120); }).observe($('#hmDkChart'));
  homePaint();
}
