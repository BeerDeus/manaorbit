// Audit des textes trop serrés (outil, hors de run-tests.sh ; port 19950) : le tour de menus-e2e.mjs (chaque écran, onglet, feuille, réglage, dialogue)
// + page publique d'échange, onboarding, visite guidée (chaque étape), bannières (installer, ouvrir dans l'appli, mise à jour du site et de l'APK,
// pastille de la visite), astuce, toast ; sur 360 × 780, 375 × 667, 393 × 852 et 1280 × 800, dans les 6 langues, en clair (et en sombre sur une partie),
// avec une police système agrandie (OA_SCALES, défaut 1 et 1.3 : WebView Android « taille de police », qui agrandit chaque texte sans changer la mise en page :
// simulée en multipliant chaque font-size et line-height des feuilles de style).
// Détecte : texte coupé (boîte overflow hidden/clip, « … » déclenchée sur un libellé important, -webkit-line-clamp), texte qui sort de son bouton / de son bloc /
// de l'écran, défilement horizontal, textes qui se chevauchent, padding < 4 px entre le texte et le bord d'un bouton / pastille, cible < 40 px de haut,
// mot coupé au milieu, ligne d'une seule lettre, bouton sur 3 lignes ou plus.
// Rapport groupé par sélecteur : shots/overflow/report.txt (+ report.json), captures des cas (éléments entourés en rouge) : shots/overflow/<passe>/<écran>.png.
// Filtres : OA_DEV=android-s,iphone-se,iphone-15,desktop  OA_LANG=de,pt  OA_SCALES=1,1.3  OA_SCREENS=a,b  OA_DARK=0 (pas de passes sombres)  OA_CONC=3 (passes en parallèle)
//          OA_SOFT=1 (padding et cibles dans le rapport texte)  OA_SHOTS=0 (sans captures)  OA_KEEP=1 (garder les captures d'avant)  OA_TAG=x (report-x.txt)  OA_ALLSHOTS=1 (capture de chaque écran).
// Usage : node tests/overflow-audit.mjs   (≈ 20 min pour tout ; code retour 0 toujours : c'est un rapport, pas un test)
import './setup-env.mjs';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { chromium, startWorld, newPage, ok } from './e2e-world.mjs';

const env = process.env, list = (k, d) => (env[k] ? env[k].split(',').map(s => s.trim()).filter(Boolean) : d);
const OUT = 'shots/overflow', SHOTS = env.OA_SHOTS !== '0', CONC = Math.max(1, +env.OA_CONC || 3);
const DEVICES = [
  { id: 'android-s', w: 360, h: 780, dpr: 2, mobile: true },
  { id: 'iphone-se', w: 375, h: 667, dpr: 2, mobile: true },
  { id: 'iphone-15', w: 393, h: 852, dpr: 2, mobile: true },
  { id: 'desktop', w: 1280, h: 800, dpr: 1, mobile: false },
].filter(d => list('OA_DEV', null) ? list('OA_DEV').includes(d.id) : true);
const LANGS = list('OA_LANG', ['fr', 'en', 'de', 'es', 'it', 'pt']), SCALES = list('OA_SCALES', ['1', '1.3']).map(Number), ONLY = list('OA_SCREENS', []);
// passes : chaque appareil × langue × taille de police en clair ; en sombre : les deux langues les plus longues sur les deux téléphones étroits, police agrandie
const PASSES = [];
for (const d of DEVICES) for (const lang of LANGS) for (const sc of SCALES) PASSES.push({ d, lang, sc, theme: 'light' });
if (env.OA_DARK !== '0') for (const [id, lang] of [['android-s', 'de'], ['iphone-15', 'pt'], ['android-s', 'fr']]) { const d = DEVICES.find(x => x.id === id), sc = SCALES[SCALES.length - 1]; if (d && LANGS.includes(lang)) PASSES.push({ d, lang, sc, theme: 'dark' }); }

const world = await startWorld({ port: 19950, daily: true, env: { DAILY_MIN_AGE_DAYS: '0' } });
const browser = await chromium.launch({ executablePath: (env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

/* ── Données (celles de menus-e2e.mjs) ── */
const COLL_TEXT = ['//@L ab12 binder Classeur rouge', '//@L cd34 box!skip Boîte à garder', '//@L ef56 sale!all Bac à vendre',
  '4 Sol Ring (DETAILS) pab12 *FR*', '2 Swords to Plowshares *EN*', '3 Arcane Signet (DETAILS) pcd34 *FR*', '1 Wrath of God *FR*', '1 Craterhoof Behemoth (DETAILS) pef56 *EN*', '2 Command Tower *FR*', '3 Llanowar Elves *FR*', '1 Edgar Markov (DETAILS) pab12 *EN*'].join('\n');
const initFn = () => {
  localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: window.__COLL, u: Date.now() - 36e5, s: '', b: null }));
  localStorage.setItem('deckdeal:onboard', String(Date.now() - 864e5 * 30)); localStorage.setItem('deckdeal:tour', JSON.stringify({ fin: Date.now(), done: Date.now(), ver: 99 }));
  localStorage.setItem('deckdeal:scnote', 'off'); localStorage.setItem('deckdeal:lang', window.__LANG);
  const h = []; for (let i = 40; i >= 0; i--) h.push({ t: Date.now() - i * 864e5, v: 2600 + Math.round(Math.sin(i / 4) * 120) + (40 - i) * 8 }); localStorage.setItem('deckdeal:coll:hist', JSON.stringify(h));
};
/** Police système agrandie : chaque font-size et line-height en unités absolues des feuilles de style × FS (calc), feuilles ajoutées plus tard comprises. */
const scaleFn = () => {
  const FS = window.__FS; if (!(FS > 1)) return;
  const done = new WeakSet(), abs = /(\d(px|rem|vw|vh|vmin|vmax|cq[a-z]*))\b/;
  const fix = rules => { for (const r of rules) {
    if (r.style) for (const p of ['font-size', 'line-height']) {
      const v = r.style.getPropertyValue(p).trim(); if (!v || !abs.test(v) || /^(inherit|initial|unset|normal)$/.test(v)) continue;
      r.style.setProperty(p, `calc(${v} * ${FS})`, r.style.getPropertyPriority(p));
    }
    if (r.cssRules) fix(r.cssRules);
  } };
  const run = () => { for (const s of document.styleSheets) { if (done.has(s)) continue; try { fix(s.cssRules); done.add(s); } catch (e) { done.add(s); } } };
  document.addEventListener('DOMContentLoaded', run);
  new MutationObserver(m => { if (m.some(x => [...x.addedNodes].some(n => n.nodeName === 'STYLE' || n.nodeName === 'LINK'))) run(); }).observe(document, { childList: true, subtree: true });
  window.__fsRun = run;
};
const seedDecks = p => p.evaluate(() => {
  putDeck('deckA', deckDoc({ name: 'Edgar aristocrates', text: '1 Edgar Markov\n1 Sol Ring\n1 Arcane Signet\n2 Command Tower\n1 Swords to Plowshares\n1 Wrath of God\n1 Llanowar Elves\n1 Craterhoof Behemoth' }));
  putDeck('deckB', deckDoc({ name: 'Elfes', text: '4 Llanowar Elves\n1 Craterhoof Behemoth\n1 Sol Ring' }));
});

/* ── Fermer tout (écrans, feuilles, dialogues, bannières) ── */
const closeAll = async p => {
  await p.evaluate(() => {
    try { if (typeof TOUR !== 'undefined' && TOUR.on) tourEnd('skip'); } catch (e) { /* ignore */ }
    try { if (typeof OB !== 'undefined' && OB.el) { document.removeEventListener('keydown', OB.key); OB.el.remove(); OB.el = null; if (typeof releaseApp === 'function') releaseApp(); } } catch (e) { /* ignore */ }
    try { if (typeof tourPillHide === 'function') tourPillHide(true); if (typeof tipHide === 'function') tipHide(); } catch (e) { /* ignore */ }
    for (const s of ['#updPop', '#apkPop', '#aplBar', '.tour-pill', '.tip', '.tip-ring']) document.querySelectorAll(s).forEach(e => e.remove());
    document.body.classList.remove('apl-on'); const t = document.getElementById('toast'); if (t) t.classList.remove('on');
    if (window.__pwaW) { PWA.wantsBanner = window.__pwaW; delete window.__pwaW; paintInstallBar(); }
    while (sheets.length) sheets[sheets.length - 1].close();
  });
  for (let i = 0; i < 4; i++) {
    const open = await p.evaluate(() => { const l = document.querySelectorAll('body > .dv.on'); const top = l[l.length - 1]; if (!top) return false; if (typeof top.__close === 'function') { top.__close(); return true; } const b = top.querySelector('.dv-back, [data-pu="close"], .sc-close, [data-close]'); if (b) b.click(); else if (typeof navGo === 'function') navGo('home'); return true; });
    if (!open) break; await p.waitForTimeout(250);
  }
  await p.evaluate(() => { if (typeof navGo === 'function') navGo('home'); });
  await p.waitForFunction(() => !document.querySelector('.sheet-wrap') && !document.querySelector('body > .dv.on') && S.view === 'home', null, { timeout: 5000 }).catch(() => {});
};

/* ── Écrans : [id, ouverture, sélecteur attendu, { click, root }] (root : zone auditée ; sinon le dessus : feuille, écran, ou l'appli) ── */
const SCREENS_ALL = [
  ['home', () => navGo('home'), '#app[data-view="home"]'],
  ['coll-cartes', () => openCollection('list'), '.coll.m-coll.on .crow'],
  ['coll-rangement', () => openCollection('places'), '.coll.m-coll.on .plc-grid'],
  ['coll-stats', () => openCollection('stats'), '.coll.m-coll.on .cv'],
  ['echange', () => openCollection('trade'), '.coll.m-trade.on .tr-box'],
  ['echange-recherche', () => { openCollection('trade'); TR.sub = 'want'; collPaintBody(true); }, '.coll.m-trade.on .tr-wacts'],
  ['echange-rangements', () => { openCollection('trade'); trPlacesSheet(); }, '.sheet-wrap.open .trp-row'],
  ['echange-direct', () => trocEntry(), '.sheet-wrap.open'],
  ['echange-public', () => openPublicTrade(readShare('trade', { ...trPayload(), by: 'Wolfgang Müller-Lüdenscheidt', at: Date.now() - 36e5 }), false, 'abc12345'), '.pubv.on'],      // page publique vue par un visiteur
  ['echange-apercu', () => { const p = trPayload(); openPublicTrade(readShare('trade', { ...p, ...profShare(), at: Date.now() }), true); }, '.pubv.on'],
  ['decks', () => openDecks(), '.dks.on'],
  ['decks-a-monter', () => openCollection('decks'), '.coll.m-decks.on'],
  ['decks-prix-liste', () => showView('input'), '#deckInput, textarea'],
  ['deck-viewer', () => openDeckViewer({ id: 'deckA' }), '.dv.on .dv-head'],
  ['compte', () => openSettings(), '.me-sheet.open'],
  ['compte-profil', () => openSettings('profil'), '.sheet-wrap.open'],
  ['compte-niveau', () => openSettings('niveau'), '.sheet-wrap.open'],
  ['reglages-prix', () => setPrixSheet(), '.sheet-wrap.open'],
  ['reglages-donnees', () => setDataSheet(), '.sheet-wrap.open'],
  ['reglages-appli', () => setAppSheet(), '.sheet-wrap.open'],
  ['reglages-confidentialite', () => setConfSheet(), '.sheet-wrap.open'],
  ['aide', () => setHelpSheet(), '.sheet-wrap.open #helpBox'],
  ['aide-comment', () => openHelp(), '.sheet-wrap.open.hp-sheet .sheet-foot [data-help="report"]'],
  ['aide-avis', () => { CTX.feedback = true; fbOpen(); }, '.sheet-wrap.open .fb'],
  ['guide-manabox', () => swgOpen({ from: 'audit' }), '.sheet-wrap.open, body > .dv.on'],
  ['carte-mystere', () => { CTX.daily = true; dlyOpen(); }, '.sheet-wrap.open, .dv.dly.on'],
  ['ouverture', () => opnEntry(), '.sheet-wrap.open'],
  ['amis', () => amSheet(), '.sheet-wrap.open'],
  ['partie', () => puOpen(partieNew()), '.dv.pu.on'],
  ['masterset-options', () => { openCollection('list'); msOptSheet(); }, '.sheet-wrap.open'],
  ['decks-communaute', () => pdListSheet(), '.sheet-wrap.open'],
  ['scan', () => openScan(), '.dv.scan.on'],
  ['scan-reglages', () => { openScan(); scsSheet(); }, '.sheet-wrap.open'],
  ['carte', () => { openCollection('list'); cexSheet('coll', 'sol ring', 'fr#pab12', null); }, '.sheet-wrap.open'],
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
  ['partie-standard', () => puOpen(partieNew({ jeu: 'standard', moi: { nom: 'Moi' } })), '.dv.pu.on .pu-jeu'],
  ['partie-standard-en-cours', () => puOpen(partieStart(partieAddPlace(partieNew({ jeu: 'standard', moi: { nom: 'Moi' } }), { nom: 'Léa', deck: { nom: 'Contrôle Azorius' } }))), '.dv.pu.on'],
  ['ouverture-en-cours', () => { if (!OPN.cur) { OPN.cur = { id: 'oTour', name: 'Ouverture du jour', at: Date.now(), paid: 2500, st: false, rows: [] }; opnSave(); opnRefresh(); } opnSheet(); }, '.sheet-wrap.open'],
  ['ouverture-historique', () => opnHistSheet(), '.sheet-wrap.open'],
  ['extension', () => { const d = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10); SETS.list = [{ code: 'zz1', name: 'Extension à venir', at: d(12), icon: '', url: '', type: 'expansion' }]; SETS.sig = ''; setsPaint(); openSetView('zz1'); }, '.dv.setv.on'],
  // dialogues de premier lancement, bannières, messages
  ['onboarding-1', () => { obOpen(); obGo(0); }, '.ob.on', { root: '.ob' }],
  ['onboarding-2', () => { obOpen(); obGo(1); }, '.ob.on', { root: '.ob' }],
  ['onboarding-3', () => { obOpen(); obGo(2); }, '.ob.on', { root: '.ob' }],
  ['banniere-installer', () => { navGo('home'); window.__pwaW = PWA.wantsBanner; PWA.wantsBanner = () => true; paintInstallBar(); }, '#installWrap:not(.closed) .installbar', { root: '#installWrap', wait: 900 }],      // repli animé : mesuré une fois ouvert
  ['banniere-appli', () => { window.aplBarWanted = () => true; aplBar(); }, '#aplBar', { root: '#aplBar' }],
  ['banniere-maj', () => updPop(), '#updPop.on', { root: '#updPop' }],
  ['banniere-apk', () => apkPop(16), '#apkPop.on', { root: '#apkPop' }],
  ['pastille-visite', () => tourPillShow('new'), '.tour-pill', { root: '.tour-pill' }],
  ['astuce', () => { openCollection('trade'); tipShow('bnd', document.querySelector('.coll.m-trade #trView') || document.querySelector('.coll.m-trade .tr-box'), COLL.el); }, '.tip', { root: '.tip' }],
  ['toast', () => toast(T('Les astuces reviendront sur chaque écran.'), { label: T('Annuler'), fn() {} }), '#toast.on', { root: '#toast' }],
].filter(([id]) => !ONLY.length || ONLY.includes(id));
const TOUR_ON = !ONLY.length || ONLY.includes('visite-guidee');

/* ── Vérifications dans la page ── */
function oaCheck(o) {
  const W = innerWidth, H = innerHeight, out = [], seen = new Set();
  const css = new Map(), cs = el => { let s = css.get(el); if (!s) css.set(el, s = getComputedStyle(el)); return s; };
  const hiddenAnc = el => !!el.closest('svg, #splash, [aria-hidden="true"], [inert], .sr-only, .ev-sr, .sr, template, noscript');
  const opac = el => { for (let a = el; a && a !== document.documentElement; a = a.parentElement) { const s = cs(a); if (+s.opacity < 0.05 || s.display === 'none') return false; } return true; };
  const vis = el => { const s = cs(el); if (s.display === 'none' || s.visibility !== 'visible') return false; if (el.checkVisibility && !el.checkVisibility({ contentVisibilityAuto: true })) return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && opac(el) && !srOnly(el); };
  const srOnly = el => { for (let a = el, i = 0; a && i < 4; a = a.parentElement, i++) { const s = cs(a); if ((s.clip && s.clip !== 'auto') || (s.clipPath && s.clipPath !== 'none' && /inset\(50%|circle\(0/.test(s.clipPath))) return true; const r = a.getBoundingClientRect(); if (r.width <= 1 || r.height <= 1) return true; } return false; };
  // zone visible d'un élément : intersection des boîtes de ses ancêtres qui coupent ou défilent
  const clipBox = el => { let b = { left: -1e9, top: -1e9, right: 1e9, bottom: 1e9 }; for (let a = el; a && a !== document.documentElement; a = a.parentElement) { const s = cs(a); if (s.overflowX === 'visible' && s.overflowY === 'visible') continue; const r = a.getBoundingClientRect(), x0 = r.left + a.clientLeft, y0 = r.top + a.clientTop; if (s.overflowX !== 'visible') { b.left = Math.max(b.left, x0); b.right = Math.min(b.right, x0 + a.clientWidth); } if (s.overflowY !== 'visible') { b.top = Math.max(b.top, y0); b.bottom = Math.min(b.bottom, y0 + a.clientHeight); } } return b; };
  const cut = (r, b) => { const x = { left: Math.max(r.left, b.left), right: Math.min(r.right, b.right), top: Math.max(r.top, b.top), bottom: Math.min(r.bottom, b.bottom) }; x.width = x.right - x.left; x.height = x.bottom - x.top; return x.width > 0.5 && x.height > 0.5 ? x : null; };
  const sig = el => { const one = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).filter(c => !/^(on|open|sel|act|active|is-|has-)/.test(c) && !/\d{3,}/.test(c)).slice(0, 2).join('.') : '');
    const p = []; for (let a = el, i = 0; a && a !== document.body && i < 3; a = a.parentElement, i++) { p.unshift(one(a)); if (a.id) break; } return p.join(' > ').replace(/\.(?= |$)/g, ''); };
  const txt = el => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const add = (kind, el, msg, sev = 'hard') => { const k = kind + '|' + sig(el) + '|' + msg; if (seen.has(k)) return; seen.add(k); out.push({ kind, sev, sel: sig(el), txt: txt(el), msg }); if (sev === 'hard') el.setAttribute('data-oa', kind); };
  // racines : le dessus (feuille, écran plein, sinon l'appli et la barre de navigation) ou celle de l'écran
  let roots;
  if (o.root) roots = [...document.querySelectorAll(o.root)];
  else { const sh = [...document.querySelectorAll('.sheet-wrap.open')].pop(), dv = [...document.querySelectorAll('body > .dv.on')].pop(); roots = sh ? [sh] : dv ? [dv] : [document.getElementById('app'), document.getElementById('nav')].filter(Boolean); }
  if (document.documentElement.scrollWidth > W + 1) out.push({ kind: 'défilement horizontal', sev: 'hard', sel: 'html', txt: '', msg: `${document.documentElement.scrollWidth} > ${W}` });
  // texte tourné (compteur de vie en face à face, writing-mode vertical) : mesures en travers, écarté
  const rotated = el => { for (let a = el; a && a !== document.body; a = a.parentElement) { const s = cs(a); if (/^vertical|sideways/.test(s.writingMode)) return true; if (s.transform && s.transform !== 'none') { const m = /matrix\(([^,]+),\s*([^,]+)/.exec(s.transform); if (m && (Math.abs(+m[2]) > 0.01 || +m[1] < 0)) return true; } if (s.rotate && s.rotate !== 'none') return true; } return false; };
  const els = roots.flatMap(r => [r, ...r.querySelectorAll('*')]).filter(el => !hiddenAnc(el) && vis(el) && !rotated(el));
  // rectangles du texte d'un élément (ses propres nœuds texte, ou tout son texte)
  const rng = document.createRange();
  const ownText = el => [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
  const rectsOf = nodes => { const rs = []; for (const n of nodes) { rng.selectNodeContents(n); for (const r of rng.getClientRects()) if (r.width > 0.5 && r.height > 0.5) rs.push(r); } return rs; };
  const allText = el => { const w = document.createTreeWalker(el, 4), l = []; while (w.nextNode()) { const n = w.currentNode; if (n.textContent.trim() && !hiddenAnc(n.parentElement) && vis(n.parentElement)) l.push(n); } return l; };
  const union = rs => rs.length ? rs.reduce((u, r) => ({ left: Math.min(u.left, r.left), right: Math.max(u.right, r.right), top: Math.min(u.top, r.top), bottom: Math.max(u.bottom, r.bottom) }), { left: 1e9, right: -1e9, top: 1e9, bottom: -1e9 }) : null;
  const lines = rs => { const t = []; for (const r of rs) { const l = t.find(x => Math.abs(x.top - r.top) < r.height * 0.5); if (l) { l.left = Math.min(l.left, r.left); l.right = Math.max(l.right, r.right); } else t.push({ top: r.top, left: r.left, right: r.right, h: r.height }); } return t; };
  const BOX = 'button, [role="button"], [role="tab"], [role="radio"], a.btn, .btn, select, input[type="button"], input[type="submit"], [class*="chip"], [class*="badge"], [class*="pill"], .tag, .seg-opt, [class*="-tab"], .tab';
  const IMPORTANT = 'button, [role="button"], [role="tab"], [role="radio"], h1, h2, h3, h4, .dv-title, .sheet-head, label, [class*="chip"], [class*="pill"], [class*="badge"], .seg-opt, [class*="-tab"], th, nav, #nav';
  const TAP = 'button, a[href], [role="button"], [role="tab"], [role="radio"], select, input:not([type="hidden"]), label[for]';
  const leaves = [];
  for (const el of els) {
    const s = cs(el), own = ownText(el), fs = parseFloat(s.fontSize) || 14;
    if (own.length) {
      const rs = rectsOf(own), u = union(rs); if (!u) continue;
      const cb = clipBox(el), vr = rs.map(r => cut(r, cb)).filter(Boolean);
      if (vr.length) leaves.push({ el, rs: vr, u: union(vr), fs, one: lines(rs).length === 1 });
      // 1) coupé par une boîte overflow hidden / clip (elle-même ou un parent) : en partie visible seulement (entièrement caché = replié exprès)
      for (let a = el, d = 0; a && a !== document.body && d < 12; a = a.parentElement, d++) {
        const as = cs(a), ox = as.overflowX, oy = as.overflowY; if (ox === 'visible' && oy === 'visible') continue;
        const ar = a.getBoundingClientRect(), bx = { left: ar.left + a.clientLeft, top: ar.top + a.clientTop, right: ar.left + a.clientLeft + a.clientWidth, bottom: ar.top + a.clientTop + a.clientHeight };
        if (!a.clientWidth || !a.clientHeight) break;
        const inX = u.right > bx.left && u.left < bx.right, inY = u.bottom > bx.top && u.top < bx.bottom; if (!inX || !inY) break;      // hors de la boîte : caché exprès (carrousel, repli)
        const cutX = /hidden|clip/.test(ox) ? Math.max(0, u.right - bx.right, bx.left - u.left) : 0, tolY = 1 + fs * 0.22, cutY = /hidden|clip/.test(oy) ? Math.max(0, u.bottom - bx.bottom, bx.top - u.top) : 0;
        const ell = a === el && s.textOverflow === 'ellipsis', clamp = a === el && s.webkitLineClamp && s.webkitLineClamp !== 'none';
        const imp = !!el.closest(IMPORTANT) && !el.closest('.crow, .dvc, [class*="-row"] .nm, .cname');
        if (cutX > 1.5 && ell) add(imp ? '« … » sur un libellé' : '« … »', el, `${Math.round(el.scrollWidth)} > ${Math.round(el.clientWidth)} px`, imp ? 'hard' : 'soft');
        else if ((cutY > tolY || cutX > 1.5) && clamp) add(imp ? 'line-clamp sur un libellé' : 'line-clamp', el, `${Math.round(el.scrollHeight)} > ${Math.round(el.clientHeight)} px`, imp ? 'hard' : 'soft');
        else if (cutX > 1.5 || cutY > tolY) add('texte coupé', el, `coupé de ${Math.round(Math.max(cutX, cutY))} px par ${a === el ? 'lui-même' : a.tagName.toLowerCase() + '.' + String(a.className).split(' ')[0]} (${cutX > 1.5 ? 'largeur' : 'hauteur'})`);
        if (/auto|scroll/.test(ox) || /auto|scroll/.test(oy)) break;      // défileur : la suite se voit en défilant
        if (cutX > 1.5 || cutY > tolY) break;
      }
      // 2) hors de l'écran (sans défileur horizontal au-dessus)
      if (u.right > W + 1 || u.left < -1) { let sc = false; for (let a = el; a && a !== document.body; a = a.parentElement) { const ox = cs(a).overflowX; if (/auto|scroll|hidden|clip/.test(ox)) { sc = true; break; } } if (!sc) add('hors de l\'écran', el, `${Math.round(u.left)}…${Math.round(u.right)} / ${W}`); }
      // 3) sort de son bloc (débordement visible) : texte plus large que le bloc qui le contient
      let blk = el; while (blk && /^inline/.test(cs(blk).display) && blk.parentElement) blk = blk.parentElement;
      if (blk && cs(blk).display !== 'contents') { const br = blk.getBoundingClientRect(), ov = Math.max(u.right - br.right, br.left - u.left); if (ov > 1.5 && cs(blk).overflowX === 'visible' && !(u.right > W + 1)) add('sort de son bloc', el, `de ${Math.round(ov)} px (${blk.tagName.toLowerCase()}.${String(blk.className).split(' ')[0]} ${Math.round(br.width)} px)`); }
      // 4) mots coupés au milieu, ligne d'une lettre
      const blockTxt = !/^inline/.test(s.display) ? allText(el).filter(n => { let b = n.parentElement; while (b !== el && /^inline/.test(cs(b).display)) b = b.parentElement; return b === el; }) : null;
      const lrs = blockTxt ? rectsOf(blockTxt) : [];
      if (lrs.length > 1) {
        const L = lines(lrs);
        if (L.length > 1) {
          const shortL = L.find(l => l.right - l.left < fs * 0.95 && l.right - l.left > 0);
          if (shortL) add('ligne d\'une lettre', el, `${L.length} lignes, une de ${Math.round(shortL.right - shortL.left)} px`);
          for (const n of own) { const t = n.textContent, re = /\S{2,}/g; let m; while ((m = re.exec(t))) {
            if (/[-‐–—\/_.@:]/.test(m[0])) continue;
            rng.setStart(n, m.index); rng.setEnd(n, m.index + m[0].length); const wl = lines([...rng.getClientRects()].filter(r => r.width > 0.5));
            if (wl.length > 1) { add(s.hyphens === 'auto' ? 'césure' : 'mot coupé au milieu', el, `« ${m[0]} » sur ${wl.length} lignes`, s.hyphens === 'auto' ? 'soft' : 'hard'); break; }
          } }
        }
      }
    }
    // 5) boutons, pastilles, onglets : texte qui sort, padding, lignes, hauteur
    if (el.matches(BOX) && !/auto|scroll/.test(s.overflowX) && !el.querySelector(BOX + ', nav, ul, ol, section')) {      // un bouton, pas une rangée de boutons
      const tn = allText(el); if (!tn.length) { /* icône seule */ }
      else {
        const rs = rectsOf(tn), u = union(rs), r = el.getBoundingClientRect();
        if (u) {
          const bl = parseFloat(s.borderLeftWidth) || 0, br = parseFloat(s.borderRightWidth) || 0, ov = Math.max(u.right - (r.right - br), (r.left + bl) - u.left);
          const clipped = s.overflowX !== 'visible' && s.textOverflow === 'ellipsis';
          if (ov > 1.5 && !clipped && !el.querySelector('[style*="ellipsis"]')) add('sort du bouton', el, `de ${Math.round(ov)} px (${Math.round(r.width)} px de large)`);
          const bg = s.backgroundColor, a = (/rgba?\(([^)]+)\)/.exec(bg) || [, '0,0,0,0'])[1].split(',').map(Number), bgA = a.length > 3 ? a[3] : 1;
          const framed = bgA > 0.06 || s.backgroundImage !== 'none' || (bl > 0 && !/rgba\(0, 0, 0, 0\)|transparent/.test(s.borderLeftColor));
          const L = tn.map(n => lines(rectsOf([n])).length).reduce((a, b) => Math.max(a, b), 0);
          if (framed && ov <= 1.5) { const hp = Math.min(u.left - r.left - bl, r.right - br - u.right); if (hp < 4 && r.width < W * 0.9) add('padding < 4 px', el, `${Math.round(hp * 10) / 10} px à l'intérieur (${Math.round(r.width)}×${Math.round(r.height)})`, 'soft'); }
          if (L >= 3 && tn.every(n => { for (let a = n.parentElement; a !== el; a = a.parentElement) if (!/^inline/.test(cs(a).display)) return false; return true; }) && el.matches('button, [role="button"], [role="tab"], [role="radio"], a.btn, .btn, [class*="chip"], [class*="pill"], [class*="badge"], .seg-opt, [class*="-tab"]') && r.width < W * 0.7) add('bouton sur 3 lignes ou plus', el, `${L} lignes dans ${Math.round(r.width)} px`);
        }
      }
    }
    if (el.matches(TAP) && !el.closest('p, .hint, small, li > a, .sr-only') && !/^inline$/.test(s.display)) {
      const r = el.getBoundingClientRect(), b = getComputedStyle(el, '::before'), zone = b.position === 'absolute' && b.content !== 'none' && (parseFloat(b.top) < 0 || parseFloat(b.left) < 0);
      if (r.height < 40 && r.height > 4 && !zone && !el.matches('input[type="checkbox"], input[type="radio"], input[type="range"]')) add('cible < 40 px', el, `${Math.round(r.width)}×${Math.round(r.height)}`, 'soft');
    }
  }
  // 5 bis) choix segmentés (.seg) : le curseur (.seg-thumb) posé sur l'option cochée (un libellé plus large que sa part élargit sa colonne)
  for (const sg of roots.flatMap(r => [...r.querySelectorAll('.seg')]).filter(e => vis(e) && e.querySelector(':scope > .seg-thumb'))) {
    const o = [...sg.querySelectorAll(':scope > .seg-opt')].filter(vis); if (o.length < 2) continue;
    const on = o.find(e => e.getAttribute('aria-checked') === 'true'); if (!on) continue;
    const t = sg.querySelector(':scope > .seg-thumb').getBoundingClientRect(), r = on.getBoundingClientRect(), d = Math.max(Math.abs(t.left - r.left), Math.abs(t.right - r.right));
    if (d > 2) add('curseur à côté de son choix', on, `décalé de ${Math.round(d)} px (colonnes ${o.map(e => Math.round(e.getBoundingClientRect().width)).join(' / ')} px)`);
  }
  // 6) textes qui se chevauchent (même couche : même ancêtre fixe / collant)
  const layer = el => { for (let a = el; a; a = a.parentElement) { const p = cs(a).position; if (p === 'fixed' || p === 'sticky' || p === 'absolute') return a; } return null; };
  for (const L of leaves) L.layer = layer(L.el);
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const A = leaves[i], B = leaves[j]; if (A.u.bottom <= B.u.top || B.u.bottom <= A.u.top || A.u.right + 3 <= B.u.left || B.u.right + 3 <= A.u.left) continue;
    if (A.el.contains(B.el) || B.el.contains(A.el) || A.fs > 48 || B.fs > 48) continue;      // chiffres géants (points de vie) : leur boîte de ligne déborde sans gêner
    let hit = null; for (const a of A.rs) { for (const b of B.rs) { const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (w > 2 && h > Math.min(a.height, b.height) * 0.35) { hit = [w, h]; break; } } if (hit) break; }
    if (!hit && A.one && B.one && A.layer === B.layer) {      // textes collés sur la même ligne (« SammlungScannen »)
      const vy = Math.min(A.u.bottom, B.u.bottom) - Math.max(A.u.top, B.u.top), gap = Math.max(B.u.left - A.u.right, A.u.left - B.u.right);
      const blk = e => { let b = e; while (b && /^inline/.test(cs(b).display) && b.parentElement) b = b.parentElement; return b; };
      if (vy > Math.min(A.u.bottom - A.u.top, B.u.bottom - B.u.top) * 0.5 && gap > -2 && gap < 2.5 && blk(A.el) !== blk(B.el)) add('textes collés', A.el, `avec ${sig(B.el)} « ${txt(B.el).slice(0, 30)} » (écart ${Math.round(gap * 10) / 10} px)`);
    }
    if (hit) add('chevauchement', A.el, `avec ${sig(B.el)} « ${txt(B.el).slice(0, 30)} » (${Math.round(hit[0])}×${Math.round(hit[1])} px)${A.layer !== B.layer ? ' [couches différentes]' : ''}`, A.layer !== B.layer ? 'soft' : 'hard');
  }
  return out;
}

/* ── Passes ── */
const all = [], fails = [];
if (SHOTS && env.OA_KEEP !== '1') rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
async function shot(p, dir, id) {
  if (!SHOTS) return;
  mkdirSync(dir, { recursive: true });
  await p.evaluate(() => { const f = document.querySelector('[data-oa]'), r = f && f.getBoundingClientRect(); if (r && (r.top < 0 || r.bottom > innerHeight)) f.scrollIntoView({ block: 'center' }); const s = document.createElement('style'); s.id = '__oaS'; s.textContent = '[data-oa]{outline:2px solid #f0f !important;outline-offset:1px}'; document.head.appendChild(s); });
  await p.screenshot({ path: `${dir}/${id}.png` });
  await p.evaluate(() => { document.getElementById('__oaS').remove(); document.querySelectorAll('[data-oa]').forEach(e => e.removeAttribute('data-oa')); });
}
async function runPass(P) {
  const { d, lang, sc, theme } = P, tag = `${d.id}-${lang}-x${sc}-${theme}`, dir = `${OUT}/${tag}`;
  const ctx = { viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.dpr, isMobile: d.mobile, hasTouch: d.mobile, locale: lang };
  const init = `window.__COLL = ${JSON.stringify(COLL_TEXT)}; window.__LANG = ${JSON.stringify(lang)}; window.__FS = ${sc}; (${initFn.toString()})(); (${scaleFn.toString()})();`;
  const { p, errs } = await newPage(browser, world, { init, ctx });
  await p.emulateMedia({ colorScheme: theme });
  await p.waitForFunction(() => typeof navGo === 'function' && S && S.view, null, { timeout: 30000 });
  await p.evaluate(() => window.__fsRun && window.__fsRun());
  await seedDecks(p); await p.waitForTimeout(300);
  const check = async (id, root) => {
    const r = await p.evaluate(oaCheck, { root });
    for (const x of r) all.push({ ...x, screen: id, dev: d.id, w: d.w, lang, sc, theme });
    if (r.some(x => x.sev === 'hard') || env.OA_ALLSHOTS === '1') await shot(p, dir, id);
    else await p.evaluate(() => document.querySelectorAll('[data-oa]').forEach(e => e.removeAttribute('data-oa')));
  };
  for (const [id, open, sel, o = {}] of SCREENS_ALL) {
    await closeAll(p);
    try { await p.evaluate(open); if (o.click) { await p.waitForSelector(o.click, { timeout: 6000, state: 'visible' }); await p.waitForTimeout(350); await p.click(o.click); } await p.waitForSelector(sel, { timeout: 12000, state: 'visible' }); }
    catch (e) { fails.push(`${tag}/${id} : non ouvert (${String(e.message).split('\n')[0].slice(0, 90)})`); continue; }
    await p.evaluate(() => window.__fsRun && window.__fsRun());
    await p.waitForTimeout(o.wait || 500);
    await check(id, o.root);
  }
  if (TOUR_ON) {      // visite guidée : chaque étape
    await closeAll(p);
    await p.evaluate(() => { tourSet({ done: 0, fin: 0 }); tourStart(); });
    const n = await p.evaluate(() => (TOUR.steps || []).length);
    for (let i = 0; i < n; i++) {
      const okStep = await p.waitForFunction(i => TOUR.on && TOUR.i === i && !TOUR.busy && TOUR.b.classList.contains('on'), i, { timeout: 8000 }).then(() => true, () => false);
      if (!okStep) { fails.push(`${tag}/visite-${i + 1} : étape non affichée`); break; }
      await p.waitForTimeout(450);
      await check('visite-' + String(i + 1).padStart(2, '0'), '.tour-b');
      await p.evaluate(() => tourNext(1));
    }
  }
  if (errs.length) fails.push(`${tag} : ${[...new Set(errs)].slice(0, 3).join(' | ')}`);
  await p.context().close();
  ok(`${tag} : ${SCREENS_ALL.length} écrans${TOUR_ON ? ' + visite' : ''}, ${all.filter(x => x.dev === d.id && x.lang === lang && x.sc === sc && x.theme === theme && x.sev === 'hard').length} cas`);
}
const queue = [...PASSES]; const t0 = Date.now();
await Promise.all(Array.from({ length: Math.min(CONC, queue.length) }, async () => { while (queue.length) { const P = queue.shift(); try { await runPass(P); } catch (e) { fails.push(`${P.d.id}-${P.lang}-x${P.sc}-${P.theme} : ${String(e.message).split('\n')[0]}`); } } }));
await browser.close(); world.stop();

/* ── Rapport groupé ── */
const groups = new Map();
for (const x of all) { const k = x.sev + '|' + x.kind + '|' + x.sel; let g = groups.get(k); if (!g) groups.set(k, g = { sev: x.sev, kind: x.kind, sel: x.sel, n: 0, cases: [] }); g.n++; g.cases.push(x); }
const gl = [...groups.values()].sort((a, b) => (a.sev === b.sev ? b.n - a.n : a.sev === 'hard' ? -1 : 1));
const fmt = g => {
  const by = (f) => [...new Set(g.cases.map(f))];
  const ex = g.cases.slice().sort((a, b) => b.sc - a.sc || a.w - b.w)[0];
  return `[${g.kind}] ${g.sel}  — ${g.n} cas · écrans : ${by(c => c.screen).slice(0, 6).join(', ')}${by(c => c.screen).length > 6 ? '…' : ''} · langues : ${by(c => c.lang).join(',')} · polices : ${by(c => 'x' + c.sc).join(',')} · appareils : ${by(c => c.dev).join(',')}\n` +
    `    ex. ${ex.screen} · ${ex.dev} ${ex.w} px · ${ex.lang} · x${ex.sc} · ${ex.theme} — « ${ex.txt} » — ${ex.msg}`;
};
const hard = gl.filter(g => g.sev === 'hard'), soft = gl.filter(g => g.sev === 'soft');
const txtRep = [`Audit des textes serrés — ${PASSES.length} passes × ${SCREENS_ALL.length} écrans${TOUR_ON ? ' + visite guidée' : ''} (${Math.round((Date.now() - t0) / 60000)} min)`,
  `${hard.length} groupes à regarder (${hard.reduce((s, g) => s + g.n, 0)} cas), ${soft.length} groupes de remarques`, '', '== À regarder ==', ...hard.map(fmt),
  '', '== Remarques ' + (env.OA_SOFT === '1' ? '' : '(OA_SOFT=1 pour le détail)') + ' ==', ...(env.OA_SOFT === '1' ? soft.map(fmt) : soft.map(g => `[${g.kind}] ${g.sel} — ${g.n} cas`).slice(0, 80)),
  '', fails.length ? '== Écrans non ouverts / erreurs ==\n' + [...new Set(fails)].join('\n') : ''].join('\n');
const RN = 'report' + (env.OA_TAG ? '-' + env.OA_TAG : ''); writeFileSync(`${OUT}/${RN}.txt`, txtRep); writeFileSync(`${OUT}/${RN}.json`, JSON.stringify(gl, null, 1));
console.log(txtRep.split('\n').slice(0, 200).join('\n'));
console.log(`\nRapport : ${OUT}/${RN}.txt, captures : ${OUT}/<passe>/<écran>.png`);
process.exit(0);
