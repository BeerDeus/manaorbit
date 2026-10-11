/* ── warm.js : préchargement hebdomadaire ─────────────────────────────────────────────────────────────────────────────
   Une fois par semaine, au lancement (ou au retour sur l'appli), quand l'appli est au repos, tout ce que l'utilisateur risque d'attendre est lu d'avance et gardé :
   · collection : infos Scryfall des cartes et images dans leur langue (collEnrich), prix des éditions (edRefresh), éditions uniques (collSolo) ;
   · decks : infos des cartes qui ne sont pas dans la collection (dmFetch : prix, couleurs, images) ;
   · symboles des extensions (/sets, puis les fichiers SVG des extensions de la collection et des prochaines sorties) ;
   · catalogues des noms (Scryfall, noms imprimés) : « Ajouter des cartes » et le scan s'ouvrent sans attente ;
   · petites images (146 px) des lignes de la collection, des decks et de la liste de souhaits : gardées par le service worker (cache des images).
   Sans faire ramer l'appli : une étape à la fois, seulement sur l'accueil (aucun écran ni feuille ouverts : ni collection, ni ajout de cartes, ni scan mobile),
   jamais pendant une recherche ou un scan, pause dès que l'écran bouge (toucher, défilement, frappe
   depuis moins de 1,5 s), appli cachée ou hors ligne ; requêtes Scryfall dans la file normale (celles de l'écran passent devant) ; images 3 par 3,
   seulement en Wi-Fi (ou connexion inconnue), jamais en mode économie de données ni batterie faible (< 20 %, hors charge).
   Reprend où il en était si l'appli se ferme. Réglages › Hors ligne : date du dernier préchargement, « Précharger maintenant ». */
const WARM_KEY = 'deckdeal:warm:v1', WARM_EVERY = 7 * DAY, WARM_START = 20000, WARM_IDLE = 1500, WARM_CONC = 3;
const WARM = { st: { at: 0, step: 0, i: 0, imgs: 0 }, run: null, stop: false, touch: 0, t: 0, phase: '', done: 0, total: 0, skip: '' };
function warmRead() {
  try { const o = JSON.parse(localStorage.getItem(WARM_KEY) || 'null'); if (o && typeof o === 'object') WARM.st = { at: +o.at || 0, step: +o.step || 0, i: +o.i || 0, imgs: +o.imgs || 0 }; } catch (e) { /* illisible : tout est à faire */ }
}
function warmSave() { try { localStorage.setItem(WARM_KEY, JSON.stringify(WARM.st)); } catch (e) { /* stockage plein : on refera */ } }
/** Connexion : économie de données, réseau mobile (images sautées). */
function warmNet() { const c = typeof navigator !== 'undefined' && navigator.connection; return { save: !!(c && c.saveData), cell: !!(c && (c.type === 'cellular' || /(^|-)2g$/.test(c.effectiveType || ''))) }; }
async function warmBattery() { try { if (!navigator.getBattery) return true; const b = await navigator.getBattery(); return b.charging || b.level >= 0.2; } catch (e) { return true; } }
/** L'appli est au repos : visible, en ligne, ni recherche ni scan, aucun geste depuis 1,5 s, pas de pause Scryfall. */
const warmIdle = () => !document.hidden && navigator.onLine !== false && !(S.run && S.run.status === 'running') && !SC.el && !LOT.el && !MOB.pc && !sheets.length && !imgView && !$$('body > .dv.on').length && Date.now() - WARM.touch > WARM_IDLE && scryLeft() <= 0;      // un écran ouvert (collection, ajout, scan, decks…), une feuille : il attend que tu reviennes à l'accueil
async function warmWait() {
  while (!WARM.stop && !warmIdle()) await sleep(1000);
  if (WARM.stop) throw Object.assign(new Error('arrêté'), { name: 'AbortError' });
}
/** Petites images à garder : chaque ligne de la collection (son édition, sa langue), les cartes des decks, la liste de souhaits. */
function warmImages() {
  const out = new Set(), add = u => { u = scrySmall(u); if (/^https:\/\/cards\.scryfall\.io\/small\//.test(u)) out.add(u); };
  for (const [k, x] of Object.entries(COLL.map)) { const m = COLL.meta[k]; for (const [g] of collLines(x)) add(collLineImage(k, g, m && m.im).src); }
  for (const d of allDecks()) for (const c of parseDeck(d.text || '').cards) { const m = dmOf(c.key); if (m && m.im) add(m.im); }
  for (const w of Object.values(TR.wish || {})) if (w && w.i) add(w.i);
  return [...out];
}
/** Cartes de tous les decks ([{ key, name }]). */
function warmDeckCards() { const m = new Map(); for (const d of allDecks()) for (const c of parseDeck(d.text || '').cards) m.set(c.key, { key: c.key, name: c.name }); return [...m.values()]; }
const WARM_STEPS = [
  ['coll', async () => {      // infos des cartes, images dans leur langue, prix des éditions
    for (let n = 0; n < 40 && (collMissing().length || collLangMissingCount()); n++) { await warmWait(); await (collEnrich() || Promise.resolve()); if (COLL.enrichErr) break; }
    await warmWait(); await edRefresh(true);
  }],
  ['solo', async () => { await warmWait(); await collSolo(); }],
  ['decks', async () => {
    await dmLoad(); const list = warmDeckCards();
    for (let n = 0; n < 30 && dmMissing(list).length; n++) { await warmWait(); if (!(await dmFetch(list))) break; }
  }],
  ['sets', async () => {
    await warmWait(); await setIcLoad();
    const codes = new Set(collEds().map(edSet)); for (const s of SETS.list || []) codes.add(s.code);
    for (const c of codes) { const u = setIcon(c); if (!u) continue; await warmWait(); try { await fetch(u, { mode: 'no-cors', priority: 'low' }); } catch (e) { /* hors ligne : au prochain passage */ } }
  }],
  ['names', async () => { await warmWait(); await collCatalog().catch(() => {}); await warmWait(); await frLoad(); }],
  ['images', async () => {
    const net = warmNet(); if (net.save || net.cell) { WARM.skip = net.save ? 'save' : 'cell'; return; }
    if (!(await warmBattery())) { WARM.skip = 'battery'; return; }
    WARM.skip = '';
    const list = warmImages(); WARM.total = list.length; WARM.done = Math.min(WARM.st.i, list.length); warmPaint();
    for (let i = WARM.st.i; i < list.length; i += WARM_CONC) {
      await warmWait();
      await Promise.all(list.slice(i, i + WARM_CONC).map(u => fetch(u, { priority: 'low' }).then(r => r.blob()).catch(() => null)));      // le service worker les garde (cache des images)
      WARM.st.i = Math.min(list.length, i + WARM_CONC); WARM.done = WARM.st.i; if (WARM.st.i % 30 < WARM_CONC) { warmSave(); warmPaint(); }
    }
    WARM.st.imgs = list.length;
  }],
];
/** Lance le préchargement s'il est dû (plus de 7 jours, ou interrompu) ; force : tout de suite (Réglages). */
function warmMaybe(force) {
  if (WARM.run || typeof document === 'undefined') return WARM.run;
  if (!force && navigator.webdriver && !window.__warmTest) return null;      // tests automatisés : seulement quand le test le demande
  if (!force && WARM.st.step === 0 && WARM.st.at && Date.now() - WARM.st.at < WARM_EVERY) return null;
  if (!collCount() && !allDecks().length) return null;
  WARM.stop = false;
  WARM.run = (async () => {
    try {
      if (force) { WARM.st.step = 0; WARM.st.i = 0; }
      for (let s = WARM.st.step; s < WARM_STEPS.length; s++) {
        WARM.st.step = s; if (WARM_STEPS[s][0] !== 'images') WARM.st.i = 0; warmSave(); WARM.phase = WARM_STEPS[s][0]; warmPaint();
        await WARM_STEPS[s][1]();
      }
      WARM.st = { at: Date.now(), step: 0, i: 0, imgs: WARM.st.imgs }; warmSave();
    } catch (e) { warmSave(); }      // arrêté (Réglages) ou appli fermée : reprise au prochain lancement
    finally { WARM.run = null; WARM.phase = ''; warmPaint(); }
  })();
  warmPaint();
  return WARM.run;
}
function warmInit() {
  warmRead();
  const touched = () => { WARM.touch = Date.now(); };
  for (const ev of ['pointerdown', 'touchmove', 'wheel', 'keydown', 'scroll']) addEventListener(ev, touched, { capture: true, passive: true });
  WARM.t = setTimeout(() => warmMaybe(), WARM_START);
  document.addEventListener('visibilitychange', () => { if (document.hidden) return; clearTimeout(WARM.t); WARM.t = setTimeout(() => warmMaybe(), WARM_START); });
}
/** Réglages › Hors ligne : état du préchargement. */
function warmPaint() {
  const box = $('#warmBox'); if (!box) return;
  const st = WARM.st, ph = { coll: T('infos de la collection'), solo: T('éditions uniques'), decks: T('cartes des decks'), sets: T('symboles des extensions'), names: T('noms des cartes'), images: T('petites images') }[WARM.phase] || '';
  const when = st.at ? new Date(st.at).toLocaleDateString(LOC(), { day: 'numeric', month: 'long' }) : '';
  const state = WARM.run ? T('Préchargement en cours · {phase}', { phase: ph }) + (WARM.phase === 'images' && WARM.total ? ' · ' + nf0(WARM.done) + ' / ' + nf0(WARM.total) : '')
    : st.at ? T('Dernier préchargement : {date}', { date: when }) + (st.imgs ? ' · ' + TN(st.imgs, '{n} image', '{n} images', { n: nf0(st.imgs) }) : '') : T('Pas encore de préchargement');
  const skip = WARM.skip === 'cell' ? T('Images sautées : réseau mobile (elles se chargent en Wi-Fi).') : WARM.skip === 'save' ? T('Images sautées : économie de données activée.') : WARM.skip === 'battery' ? T('Images sautées : batterie faible.') : '';
  box.innerHTML = `<p class="hint">${T('Une fois par semaine, quand tu ne t\'en sers pas, l\'appli lit d\'avance les infos, éditions, symboles et petites images de ta collection et de tes decks : moins d\'attente, et ta collection reste lisible hors ligne. Les images seulement en Wi-Fi.')}</p>
    <p class="hint warm-st"><b>${esc(state)}</b>${skip ? '<br>' + esc(skip) : ''}</p>
    <button class="btn ghost small" type="button" data-warm="${WARM.run ? 'stop' : 'go'}" style="align-self:flex-start">${WARM.run ? T('Arrêter') : T('Précharger maintenant')}</button>`;
  if (!box._click) { box._click = true; box.addEventListener('click', e => { const b = e.target.closest('[data-warm]'); if (!b) return; haptic('tap'); if (b.dataset.warm === 'stop') { WARM.stop = true; } else warmMaybe(true); warmPaint(); }); }
}
