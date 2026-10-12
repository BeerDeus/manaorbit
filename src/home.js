/* ── home.js : page d'accueil (section Accueil de la barre du bas, nav.js) ─────────────────────────────────────────────────────────────────
   · Orbe « Ma collection » : valeur (prix tendance Cardmarket), cartes, variation sur 7 jours ; les 5 terrains de base tournent autour
     (illustration de ceux de la collection s'ils y sont, sinon la fiche Scryfall, lue une fois), sur une orbite en pointillés.
   · Carte « Échange » : doublons, cartes recherchées, lien en direct ; QR code et Partager (le lien est créé au besoin) ;
     « Pour toi » : les listes d'amis ouvertes récemment, avec ce qu'elles ont pour toi (relevé à la dernière ouverture, homeSeen).
   · « Prochaines extensions » (sets.js, cachée tant qu'elle n'a rien à montrer) et « Comment ça marche ? » (aide, help.js) en bas.
   Mes decks, decks à monter et prix d'une liste sont dans la section Decks ; le scan (et son prix rapide) au milieu de la barre.
   Tout est repeint en différé (homeSoon) quand la collection, les decks, les prix ou la liste d'échange changent. */
const HM = { t: 0, v: null, raf: 0, lands: false };
const HM_SEEN_KEY = 'deckdeal:seen:v1', HM_SEEN_MAX = 5;
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
  const n = collCount(), orb = $('#btnColl'), val = $('#hmValue'), cnt = $('#hmCount'), dl = $('#hmDelta');
  orb.dataset.empty = n ? '0' : '1';
  if (n) {
    const v = homeValue();
    if (v > 0) homeCount(val, v); else { HM.v = null; val.textContent = nf0(n); }
    cnt.textContent = v > 0 ? TN(n, '{n} carte', '{n} cartes') : TN(n, 'carte', 'cartes');
    const h = histDelta(VAL.hist, 7);
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
function homeSeen(id, by, n) {
  if (!id) return;
  const l = homeSeenList().filter(x => x.id !== id); l.unshift({ id, by: String(by || '').slice(0, 40), n: Math.max(0, Number(n) || 0), at: Date.now() });
  try { localStorage.setItem(HM_SEEN_KEY, JSON.stringify(l.slice(0, HM_SEEN_MAX))); } catch (e) { /* stockage plein */ }
  homeSoon();
}
function homeForYou() {
  const box = $('#hmForYou'), ul = $('#hmFyList'); if (!box || !ul) return;
  const l = homeSeenList().slice(0, 3); box.hidden = !l.length; if (!l.length) { ul.innerHTML = ''; return; }
  ul.innerHTML = l.map(x => { const nm = x.by || T('Liste d\'un ami'); return `<li><button type="button" class="hm-fy-r" data-fy="${esc(x.id)}"><span class="hm-fy-av" aria-hidden="true" style="--h:${hash32(x.id) % 360}">${esc((nm.trim()[0] || '?').toUpperCase())}</span><span class="hm-fy-t"><b>${esc(nm)}</b> · ${x.n ? TN(x.n, '{n} carte pour toi', '{n} cartes pour toi') : T('rien pour toi pour l\'instant')}</span><svg class="i" aria-hidden="true"><use href="#i-chev"/></svg></button></li>`; }).join('');
}
/** QR code / Partager de l'accueil : le lien de la liste d'échange, créé d'abord s'il n'existe pas (compte demandé si besoin). */
async function homeTradeAct(qr) {
  haptic('tap');
  if (!TR.share) { await trShareOn(); if (!TR.share) return; }
  if (qr) trQrOpen(); else trSend(TR.share);
}

function homeInit() {
  $('#btnTrade').onclick = () => { haptic('tap'); if (typeof navOpen === 'function') navOpen(() => openCollection('trade')); else openCollection('trade'); };
  $('#btnTradeQr').onclick = () => homeTradeAct(true);
  $('#btnTradeShare').onclick = () => homeTradeAct(false);
  $('#hmFyList').addEventListener('click', e => { const b = e.target.closest('[data-fy]'); if (b) { haptic('tap'); openPublicLink(b.dataset.fy); } });
  $('#btnHome').onclick = () => { haptic('tap'); showView('home'); };
  $('#btnHelp').onclick = () => { haptic('tap'); openHelp(); };
  homePaint();
}
