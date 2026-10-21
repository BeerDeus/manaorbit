// E2E tour de l'interface : chaque écran, onglet, feuille et réglage de l'appli, sur plusieurs tailles de téléphone (du plus petit iPhone au plus grand,
// Android courant), tablette et ordinateur, en clair et en sombre. Pour chaque écran : capture (shots/menus/<appareil>/<thème>/<écran>.png, à relire)
// et vérifications d'affichage : aucune erreur de page, rien qui dépasse à droite (défilement horizontal, élément hors de l'écran), aucun texte
// coupé sans « … », textes ≥ 11 px, boutons touchables (≥ 28 px), dernier contenu pas caché sous la barre du bas, titre du dialogue présent.
// Les manques « doux » (petit texte, bouton étroit) sont listés sans faire échouer, sauf UI_STRICT=1. Comparaison à des captures de référence :
// UI_BASE=<dossier> (même arborescence) : écart de pixels > 0,6 % listé (échec avec UI_STRICT=1) ; UI_ONLY=<appareil> et UI_SCREENS=a,b pour cibler.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { chromium, startWorld, newPage, ok } from './e2e-world.mjs';

const world = await startWorld({ port: 19350, daily: true, env: { DAILY_MIN_AGE_DAYS: '0' } });      // Carte mystère allumée (faux Scryfall côté serveur)
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const STRICT = process.env.UI_STRICT === '1', BASE = process.env.UI_BASE || '', ONLY = process.env.UI_ONLY || '', SCREENS = (process.env.UI_SCREENS || '').split(',').filter(Boolean);
const OUT = 'shots/menus';

/* ── Appareils : largeur × hauteur CSS, densité ; thèmes testés sur chacun ── */
const DEVICES = [
  { id: 'iphone-se', w: 375, h: 667, dpr: 2, mobile: true, themes: ['light'] },          // le plus petit encore courant (SE 2022, 8)
  { id: 'iphone-15', w: 393, h: 852, dpr: 3, mobile: true, themes: ['light', 'dark'] },  // 15 / 16 / 17 (encoche, 3×)
  { id: 'iphone-max', w: 430, h: 932, dpr: 3, mobile: true, themes: ['light'] },         // Pro Max
  { id: 'android-s', w: 360, h: 780, dpr: 3, mobile: true, themes: ['dark'] },           // Android d'entrée de gamme (le plus étroit)
  { id: 'pixel', w: 412, h: 915, dpr: 2.6, mobile: true, themes: ['light'] },            // Pixel 8 / Galaxy S
  { id: 'ipad', w: 820, h: 1180, dpr: 2, mobile: true, themes: ['light'] },
  { id: 'desktop', w: 1280, h: 800, dpr: 1, mobile: false, themes: ['light', 'dark'] },
  { id: 'desktop-xl', w: 1890, h: 900, dpr: 1, mobile: false, themes: ['light'] },
].filter(d => !ONLY || d.id === ONLY);

/* ── Données : une collection rangée, des decks, un historique de valeur, visite guidée faite ── */
const COLL_TEXT = ['//@L ab12 binder Classeur rouge', '//@L cd34 box!skip Boîte à garder', '//@L ef56 sale!all Bac à vendre',
  '4 Sol Ring (DETAILS) pab12 *FR*', '2 Swords to Plowshares *EN*', '3 Arcane Signet (DETAILS) pcd34 *FR*', '1 Wrath of God *FR*', '1 Craterhoof Behemoth (DETAILS) pef56 *EN*', '2 Command Tower *FR*', '3 Llanowar Elves *FR*', '1 Edgar Markov (DETAILS) pab12 *EN*'].join('\n');
const initFn = () => {
  localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: window.__COLL, u: Date.now() - 36e5, s: '', b: null }));
  localStorage.setItem('deckdeal:onboard', String(Date.now() - 864e5 * 30)); localStorage.setItem('deckdeal:tour', JSON.stringify({ fin: Date.now(), done: Date.now(), ver: 99 }));
  localStorage.setItem('deckdeal:scnote', 'off');
  const h = []; for (let i = 40; i >= 0; i--) h.push({ t: Date.now() - i * 864e5, v: 2600 + Math.round(Math.sin(i / 4) * 120) + (40 - i) * 8 });      // centimes : la collection vaut ≈ 29 € (prix du monde des tests) localStorage.setItem('deckdeal:coll:hist', JSON.stringify(h));
};
const init = `window.__COLL = ${JSON.stringify(COLL_TEXT)}; (${initFn.toString()})();`;      // addInitScript : un texte (une fonction n'emporte pas de données)
const seedDecks = p => p.evaluate(() => {
  putDeck('deckA', deckDoc({ name: 'Edgar aristocrates', text: '1 Edgar Markov\n1 Sol Ring\n1 Arcane Signet\n2 Command Tower\n1 Swords to Plowshares\n1 Wrath of God\n1 Llanowar Elves\n1 Craterhoof Behemoth' }));      // ≥ 7 cartes : « Main de départ »
  putDeck('deckB', deckDoc({ name: 'Elfes', text: '4 Llanowar Elves\n1 Craterhoof Behemoth\n1 Sol Ring' }));
});

/* ── Écrans : ouverture (dans la page), sélecteur attendu ── */
const closeAll = async p => {
  await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); });
  for (let i = 0; i < 4; i++) {
    const open = await p.evaluate(() => { const l = document.querySelectorAll('body > .dv.on'); const top = l[l.length - 1]; if (!top) return false; const b = top.querySelector('.dv-back, [data-pu="close"], .sc-close, [data-close]'); if (b) b.click(); else if (typeof navGo === 'function') navGo('home'); return true; });
    if (!open) break; await p.waitForTimeout(250);
  }
  await p.evaluate(() => { if (typeof navGo === 'function') navGo('home'); });
  await p.waitForFunction(() => !document.querySelector('.sheet-wrap') && !document.querySelector('body > .dv.on') && S.view === 'home', null, { timeout: 5000 }).catch(() => {});
};
const SCREENS_ALL = [
  ['home', () => navGo('home'), '#app[data-view="home"]'],
  ['coll-cartes', () => openCollection('list'), '.coll.m-coll.on .crow'],
  ['coll-rangement', () => openCollection('places'), '.coll.m-coll.on .plc-grid'],
  ['coll-stats', () => openCollection('stats'), '.coll.m-coll.on .cv'],
  ['echange', () => openCollection('trade'), '.coll.m-trade.on .tr-box'],
  ['echange-recherche', () => { openCollection('trade'); TR.sub = 'want'; collPaintBody(true); }, '.coll.m-trade.on .tr-wacts'],
  ['echange-rangements', () => { openCollection('trade'); trPlacesSheet(); }, '.sheet-wrap.open .trp-row'],
  ['echange-direct', () => trocEntry(), '.sheet-wrap.open'],
  ['decks', () => openDecks(), '.dks.on'],
  ['decks-a-monter', () => openCollection('decks'), '.coll.m-decks.on'],
  ['decks-prix-liste', () => showView('input'), '#deckInput, textarea'],
  ['deck-viewer', () => openDeckViewer({ id: 'deckA' }), '.dv.on .dv-head'],
  ['compte', () => openSettings(), '.me-sheet.open'],
  ['compte-profil', () => openSettings('profil'), '.sheet-wrap.open'],
  ['compte-collection', () => openSettings('coll'), '.sheet-wrap.open'],
  ['compte-decks', () => openSettings('decks'), '.sheet-wrap.open'],
  ['compte-valeur', () => openSettings('valeur'), '.sheet-wrap.open'],
  ['compte-niveau', () => openSettings('niveau'), '.sheet-wrap.open'],
  ['reglages-prix', () => setPrixSheet(), '.sheet-wrap.open'],
  ['reglages-donnees', () => setDataSheet(), '.sheet-wrap.open'],
  ['reglages-appli', () => setAppSheet(), '.sheet-wrap.open'],
  ['reglages-confidentialite', () => setConfSheet(), '.sheet-wrap.open'],
  ['aide', () => setHelpSheet(), '.sheet-wrap.open #helpBox'],
  ['carte-mystere', () => { CTX.daily = true; dlyOpen(); }, '.sheet-wrap.open, .dv.dly.on'],      // sans compte : la feuille qui propose de se connecter (le serveur des tests n'allume pas la carte : forcée côté client)
  ['ouverture', () => opnEntry(), '.sheet-wrap.open'],
  ['amis', () => amSheet(), '.sheet-wrap.open'],
  ['partie', () => puOpen(partieNew()), '.dv.pu.on'],
  ['masterset-options', () => { openCollection('list'); msOptSheet(); }, '.sheet-wrap.open'],
  ['decks-communaute', () => pdListSheet(), '.sheet-wrap.open'],
  ['scan', () => openScan(), '.dv.scan.on'],
  ['scan-reglages', () => { openScan(); scsSheet(); }, '.sheet-wrap.open'],
  // sous-écrans et feuilles secondaires
  ['carte', () => { openCollection('list'); cexSheet('coll', 'sol ring', 'fr#pab12', null); }, '.sheet-wrap.open'],      // fiche d'un exemplaire (emplacement, état)
  ['coll-ajouter', () => openLot(), '.dv.lot.on'],
  ['coll-importer', () => { openCollection('list'); openCollImport(); }, '.sheet-wrap.open'],
  ['coll-filtres', () => openCollection('list'), '.coll.m-coll.on .fbtn[aria-expanded="true"], .sheet-wrap.open', { click: '.coll.m-coll.on .fbtn' }],
  ['coll-emplacement', () => { openCollection('places'); plcShow('ab12'); }, '.coll.m-coll.on .crow'],
  ['coll-masterset', () => openCollection('list'), '.coll.m-coll.on .coll-ms[aria-pressed="true"]', { click: '.coll.m-coll.on .coll-ms' }],
  ['echange-souhait', () => { openCollection('trade'); openWishAdd(); }, '.sheet-wrap.open'],
  ['echange-direct-historique', () => trocHistSheet(), '.sheet-wrap.open'],
  ['deck-menu', () => { openDecks(); openDeckSheet('deckA'); }, '.sheet-wrap.open'],
  ['deck-editeur', () => openBuilder({ id: 'deckA' }), '.dv.bd.on'],
  ['deck-main-depart', () => openDeckViewer({ id: 'deckA' }), '.sheet-wrap.open', { click: '.dv.on [data-act="hand"]' }],
  ['partie-en-cours', () => puOpen(partieStart(partieAddPlace(partieNew({ moi: { nom: 'Moi' } }), { nom: 'Léa' }))), '.dv.pu.on'],
  ['partie-mes-parties', () => puHist(), '.sheet-wrap.open, .dv.on'],
  ['ouverture-en-cours', () => { if (!OPN.cur) { OPN.cur = { id: 'oTour', name: 'Ouverture du jour', at: Date.now(), paid: 2500, st: false, rows: [] }; opnSave(); opnRefresh(); } opnSheet(); }, '.sheet-wrap.open'],      // session commencée (reste commencée pour les écrans suivants)
  ['ouverture-historique', () => opnHistSheet(), '.sheet-wrap.open'],
  ['extension', () => { const d = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10); SETS.list = [{ code: 'zz1', name: 'Extension à venir', at: d(12), icon: '', url: '', type: 'expansion' }]; SETS.sig = ''; setsPaint(); openSetView('zz1'); }, '.dv.setv.on'],
  ['visite-guidee', () => tourStart(), '.tour'],
].filter(([id]) => !SCREENS.length || SCREENS.includes(id));

/* ── Vérifications dans la page ── */
function uiCheck() {
  const W = innerWidth, H = innerHeight, out = { hard: [], soft: [] }, vis = el => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const name = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + (el.textContent ? ' « ' + el.textContent.trim().replace(/\s+/g, ' ').slice(0, 30) + ' »' : '');
  const clipped = el => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a); if (/(hidden|auto|scroll|clip)/.test(o.overflowX + o.overflow)) return true; } return false; };
  if (document.documentElement.scrollWidth > W + 1) out.hard.push(`défilement horizontal de la page : ${document.documentElement.scrollWidth} > ${W}`);
  const all = [...document.body.querySelectorAll('*')].filter(el => !el.closest('svg') && !el.closest('#splash') && !el.closest('[aria-hidden="true"], [inert]') && vis(el));      // barre du bas repliée (aria-hidden) : hors champ exprès
  for (const el of all) {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (cs.position === 'fixed' && (r.width === 0 || r.height === 0)) continue;
    if ((r.right > W + 1 || r.left < -1) && !clipped(el)) out.hard.push(`hors de l'écran : ${name(el)} (${Math.round(r.left)}…${Math.round(r.right)} / ${W})`);
    if (cs.whiteSpace === 'nowrap' && cs.textOverflow !== 'ellipsis' && cs.overflowX !== 'hidden' && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
      out.hard.push(`texte coupé sans « … » : ${name(el)} (${el.scrollWidth} > ${el.clientWidth})`);
    const txt = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (txt && parseFloat(cs.fontSize) < 11 && !el.closest('.sr-only, [aria-hidden="true"], .mc')) out.soft.push(`texte ${cs.fontSize} : ${name(el)}`);      // .mc : lettre d'un symbole de mana (icône)
    if ((el.matches('button, a[href], [role="button"], input[type="checkbox"], input[type="radio"], select') && !el.matches('.link-btn, .seg-opt, .fchip, .chip, .tag, .pub-tab, .plc-opt, .scs-chip, [class*="chip"], p a, .hint a, small a, li a')) && r.top < H && r.bottom > 0) {      // liens dans un texte : pas des cibles à part
      const b = getComputedStyle(el, '::before'), zone = b.position === 'absolute' && b.content !== 'none' && parseFloat(b.top) < 0;      // ::before débordant : zone de toucher agrandie (.coll-dot)
      const sz = Math.min(r.width, r.height); if (sz < 28 && !zone) out.soft.push(`cible ${Math.round(r.width)}×${Math.round(r.height)} : ${name(el)}`);
    }
  }
  // contenu sous la barre du bas : le défileur de l'écran du dessus, poussé en bas, laisse son dernier enfant au-dessus de la barre
  const nav = document.querySelector('#nav, .nav'), sc = [...document.querySelectorAll('.dv.on .dv-scroll, .sheet-wrap.open .sheet-body, .sheet-wrap.open .sheet, #app .scroll')].filter(vis).pop();
  const nr0 = nav && vis(nav) ? nav.getBoundingClientRect() : null;
  if (nr0 && nr0.top > H * .6 && nr0.width > W * .6 && sc && !document.querySelector('.sheet-wrap.open')) {      // seulement une barre en bas (sur ordinateur elle est sur le côté)
    const prev = sc.scrollTop; sc.scrollTop = sc.scrollHeight; const nr = nav.getBoundingClientRect(), kids = [...sc.querySelectorAll(':scope > * > *, :scope > *')].filter(vis); const last = kids[kids.length - 1];
    if (last) { const lr = last.getBoundingClientRect(); if (lr.bottom > nr.top + 1 && lr.top < nr.top) out.hard.push(`dernier contenu sous la barre du bas : ${name(last)} (${Math.round(lr.bottom)} > ${Math.round(nr.top)})`); }
    sc.scrollTop = prev;
  }
  const top = document.querySelector('.sheet-wrap.open .sheet-head h2, body > .dv.on:last-of-type .dv-title b, body > .dv.on:last-of-type h1, body > .dv.on:last-of-type .dv-head h2');
  return { ...out, title: top ? top.textContent.trim() : '', h: H, w: W };
}
/** Écart entre la capture et sa référence (part des pixels différents, 0 à 1) ; null sans référence. Décodage par le navigateur, aucune bibliothèque. */
async function pixelDiff(p, a, b) {
  if (!existsSync(b)) return null;
  const [A, B] = [a, b].map(f => 'data:image/png;base64,' + readFileSync(f).toString('base64'));
  return p.evaluate(async ([A, B]) => {
    const load = s => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = s; });
    const [x, y] = await Promise.all([load(A), load(B)]); if (x.width !== y.width || x.height !== y.height) return 1;
    const c = document.createElement('canvas'); c.width = x.width; c.height = x.height; const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(x, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data; g.drawImage(y, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 48) n++;
    return n / (da.length / 4);
  }, [A, B]);
}

/* ── Tour ── */
const report = { hard: [], soft: [], diff: [], opened: 0 };
for (const d of DEVICES) {
  const ctx = { viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.dpr, isMobile: d.mobile, hasTouch: d.mobile };
  for (const theme of d.themes) {
    const { p, errs } = await newPage(browser, world, { init, ctx });
    await p.emulateMedia({ colorScheme: theme });
    await p.waitForFunction(() => typeof navGo === 'function' && S && S.view, null, { timeout: 20000 });
    await seedDecks(p); await p.waitForTimeout(300);
    const dir = `${OUT}/${d.id}/${theme}`; mkdirSync(dir, { recursive: true });
    for (const [id, open, sel, o = {}] of SCREENS_ALL) {
      await closeAll(p); const n0 = errs.length;
      let opened = true;
      try { await p.evaluate(open); if (o.click) { await p.waitForSelector(o.click, { timeout: 6000, state: 'visible' }); await p.waitForTimeout(350); await p.click(o.click); } await p.waitForSelector(sel, { timeout: 6000, state: 'visible' }); } catch (e) { opened = false; report.hard.push(`${d.id}/${theme}/${id} : écran non ouvert (${String(e.message).split('\n')[0].slice(0, 80)})`); }
      await p.waitForTimeout(450);      // animations d'ouverture
      const file = `${dir}/${id}.png`; await p.screenshot({ path: file });
      if (!opened) continue;
      report.opened++;
      const r = await p.evaluate(uiCheck);
      for (const m of r.hard) report.hard.push(`${d.id}/${theme}/${id} : ${m}`);
      for (const m of r.soft) report.soft.push(`${d.id}/${theme}/${id} : ${m}`);
      if (errs.length > n0) report.hard.push(`${d.id}/${theme}/${id} : ${errs.slice(n0).join(' | ')}`);
      if (BASE) { const df = await pixelDiff(p, file, `${BASE}/${d.id}/${theme}/${id}.png`); if (df != null && df > 0.006) report.diff.push(`${d.id}/${theme}/${id} : ${(df * 100).toFixed(1)} % de pixels changés`); }
    }
    await p.context().close();
    ok(`${d.id} ${d.w}×${d.h} ${theme} : ${SCREENS_ALL.length} écrans`);
  }
}
await browser.close(); world.stop();

/* ── Bilan ── */
const uniq = l => [...new Set(l)];
if (report.soft.length) console.log(`— ${report.soft.length} remarques (petit texte, cible étroite) :\n  ` + uniq(report.soft).slice(0, 60).join('\n  '));
if (report.diff.length) console.log(`— ${report.diff.length} captures différentes de la référence :\n  ` + report.diff.join('\n  '));
if (report.hard.length) console.log(`✗ ${report.hard.length} défauts :\n  ` + uniq(report.hard).join('\n  '));
assert.equal(report.hard.length, 0, 'défauts d\'affichage');
if (STRICT) assert.equal(report.soft.length + report.diff.length, 0, 'remarques (UI_STRICT)');
console.log(`MENUS E2E OK · ${report.opened} écrans ouverts, captures dans ${OUT}/`);
process.exit(0);
