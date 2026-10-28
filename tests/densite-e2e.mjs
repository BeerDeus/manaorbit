// E2E densité sur téléphone (src/densite.js) : vues de la liste de la collection (compacte par défaut, détaillée, grille ; choix gardé, rechargement),
// toucher d'une ligne (fiche de la carte si elle existe, sinon la ligne se déplie sur place), vignette qui s'agrandit, tri / masterset / vue en icônes
// dans la rangée de la recherche, en-tête replié (valeur dans le sous-titre, grande carte de valeur dans Stats, point de sauvegarde et sa feuille, onglets
// et recherche collés en haut, titre resserré au défilement), tri par édition, filtres et Rangement dans les vues ; écran Échange : barre du lien
// (déconnecté, connecté avec lien), « Réglages de l'échange » (roue à côté de Filtres, pastille du réglage), sous-onglets et total sur une ligne ;
// positions mesurées à 393 × 852 (1re carte ≤ 30 % de la hauteur, ≥ 7 cartes en compacte, liste d'échange à y ≤ 320), 360 × 780 et 1280 × 800.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, ok, txt } from './e2e-world.mjs';

const world = await startWorld({ port: 19800 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const errsAll = [];
const COLL = ['//@L ab12 binder Classeur rouge', '//@L cd34 box!skip Boîte à garder', '//@L ef56 sale!all Bac à vendre',
  '4 Sol Ring (DETAILS) pab12 *FR*', '2 Swords to Plowshares *EN*', '3 Arcane Signet (DETAILS) pcd34 *FR*', '1 Wrath of God *FR*', '1 Craterhoof Behemoth (DETAILS) pef56 *EN*', '2 Command Tower *FR*', '3 Llanowar Elves *FR*', '1 Edgar Markov (DETAILS) pab12 *EN*'].join('\n');
const NAMES = ['Sol Ring', 'Swords to Plowshares', 'Arcane Signet', 'Wrath of God', 'Craterhoof Behemoth', 'Command Tower', 'Llanowar Elves', 'Edgar Markov'];
const BIG = COLL + '\n' + NAMES.flatMap((n, i) => [`${1 + i % 3} ${n} *DE*`, `${1 + i % 2} ${n} *IT*`]).join('\n');      // 24 lignes : de quoi défiler
const seed = t => `try { localStorage.setItem('deckdeal:coll:v1', ${JSON.stringify(JSON.stringify({ t, u: 1, s: '', b: null }))}); localStorage.setItem('deckdeal:onboard', String(Date.now() - 864e5 * 30)); localStorage.setItem('deckdeal:tour', JSON.stringify({ fin: Date.now(), done: Date.now(), ver: 99 })); } catch (e) {}`;
const phone = { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
async function open(o = {}) {
  const P = await newPage(browser, world, { cview: false, init: seed(o.coll || COLL) + (o.init || ''), ctx: o.ctx || phone, goto: false }); errsAll.push(P.errs);
  await P.p.route('https://www.gstatic.com/**', r => r.abort());
  await P.p.goto(world.url); await P.p.waitForFunction(() => typeof openCollection === 'function' && S && S.view, null, { timeout: 20000 });
  return P;
}
const toColl = async (p, tab = 'list') => { await p.evaluate(t => openCollection(t), tab); await p.waitForSelector('.coll.on .coll-main .crow, .coll.on .coll-main .dv-empty, .coll.on .tr-box, .coll.on .plc-grid, .coll.on .cs-tiles'); await p.waitForTimeout(400); };
/** Positions : 1re ligne de la liste, lignes entières au-dessus de la barre du bas, hauteur d'une ligne. */
const measure = (p, sel) => p.evaluate(sel => {
  const nav = document.querySelector('#nav'), nr = nav && nav.getBoundingClientRect(), bot = nr && nr.width > innerWidth * .6 && nr.top > innerHeight * .6 ? nr.top : innerHeight;
  const rows = [...document.querySelectorAll(sel)].filter(r => r.offsetParent), f = rows[0] && rows[0].getBoundingClientRect();
  return { first: f ? Math.round(f.top) : null, h: f ? Math.round(f.height) : null, full: rows.filter(r => { const b = r.getBoundingClientRect(); return b.top >= 0 && b.bottom <= bot + 1; }).length, H: innerHeight };
}, sel);
const noHScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const ROWS = '.coll.on .coll-list > .crow';

/* ── 1) Vue compacte par défaut, en-tête replié, outils en icônes ─────────────────────────────── */
{
  const { p } = await open();
  await toColl(p);
  assert.equal(await p.evaluate(() => cvwView()), 'compact', 'vue compacte par défaut');
  await p.waitForFunction(() => document.querySelectorAll('.coll.on .coll-list.cvw-compact > .crow.cvw-c').length === 8);
  assert.equal(await p.$$eval('.coll.on .coll-list .qstep, .coll.on .coll-list .row-ed', l => l.length), 0, 'ni − / + ni édition sur la ligne');
  assert.equal(await p.$$eval('.coll.on .coll-list .tag', l => l.length), 0, 'ni Famille ni Coût');
  const sol = await p.$eval('.crow.cvw-c[data-k="sol ring"]', r => [r.querySelector('.row-name').textContent, !!r.querySelector('.row-top .flag'), r.querySelector('.cvw-plc').textContent, r.querySelector('.cvw-q').textContent, r.querySelector('.cvw-hit').getAttribute('aria-label')]);
  assert.deepEqual(sol.slice(0, 4), ['Sol Ring', true, 'Classeur rouge', '×4'], 'nom, drapeau, emplacement, quantité'); assert.match(sol[4], /^Ouvrir la fiche de Sol Ring · × 4/, 'ligne entière : un bouton nommé');
  await p.waitForFunction(() => /1,50/.test((document.querySelector('.crow.cvw-c[data-k="sol ring"] .cvw-p') || {}).textContent || ''), null, { timeout: 8000 });
  // en-tête : valeur dans le sous-titre, carte de valeur seulement dans Stats, point de sauvegarde (texte complet lu), pas de bandeau hors compte
  await p.waitForFunction(() => /^8 cartes · 17 ex\. · \d+\s€$/.test(document.querySelector('.coll .dv-title span').textContent), null, { timeout: 8000 });
  assert.equal(await p.$eval('.coll-val', e => e.hidden), true, 'pas de grande carte de valeur dans Cartes');
  await p.waitForFunction(() => { const d = document.querySelector('.coll-dot'); return d && !d.hidden && d.dataset.k !== 'ok'; });
  assert.equal(await p.$eval('.coll-sync', e => e.hidden), true, 'hors compte : pas de bandeau');
  assert.match(await p.$eval('.coll-dot', d => d.getAttribute('aria-label')), /ne sont que sur cet appareil/);
  await p.click('.coll-dot'); await p.waitForSelector('.sheet-wrap.open .sync-sheet'); assert.match(await txt(p, '.sheet-wrap.open .sync-sheet'), /ne sont que sur cet appareil/);
  assert.ok(await p.$('.sheet-wrap.open [data-sy="export"]'), 'Exporter une copie');
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  // outils : Trier, Masterset, Affichage dans la rangée de la recherche (une rangée de moins), libellés lus, infobulles
  const tools = await p.evaluate(() => { const row = document.querySelector('.coll #collF .fbar-row'), y = row.querySelector('.fsearch').getBoundingClientRect().top;
    return { inRow: ['.coll-sort select', '.coll-ms', '.cvw-btn', '.fbtn'].map(s => { const e = row.querySelector(s); return !!e && Math.abs(e.closest('label, button').getBoundingClientRect().top - y) < 2; }), srow: document.querySelector('.coll-srow').hidden,
      labels: [row.querySelector('#collSort').getAttribute('aria-label'), row.querySelector('.coll-ms').getAttribute('aria-label'), row.querySelector('.cvw-btn').getAttribute('aria-label')], titles: [row.querySelector('.coll-sort').title, row.querySelector('.cvw-btn').title],
      size: [...row.querySelectorAll('.coll-sort, .coll-ms, .cvw-btn, .fbtn')].map(e => Math.round(Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height))) }; });
  assert.deepEqual(tools.inRow, [true, true, true, true], 'Trier, Masterset, Affichage et Filtres sur la ligne de la recherche'); assert.equal(tools.srow, true, 'plus de rangée « Trier · Masterset »');
  assert.deepEqual(tools.labels, ['Trier la collection', 'Masterset', 'Affichage : Compacte']); assert.deepEqual(tools.titles, ['Trier : Nom', 'Affichage : Compacte']);
  assert.ok(tools.size.every(n => n >= 40), 'cibles ≥ 40 px : ' + tools.size);
  assert.deepEqual(await p.$eval('.coll .fbtn > span', b => [b.textContent, getComputedStyle(b).position]), ['Filtres', 'absolute'], '« Filtres » en icône, son nom reste lu');
  // positions à 393 × 852
  const m = await measure(p, ROWS);
  console.log('  393×852 compacte :', JSON.stringify(m));
  assert.ok(m.first <= 0.30 * m.H, `1re carte à ${m.first} px (≤ 30 % de ${m.H})`); assert.ok(m.full >= 7, `${m.full} cartes entières (≥ 7)`); assert.ok(m.h >= 60 && m.h <= 68, `ligne de ${m.h} px (≈ 64)`);
  assert.ok(await noHScroll(p), 'pas de défilement horizontal');
  // Stats : la grande carte de valeur y est
  await p.click('#collSeg [data-v="stats"]'); await p.waitForSelector('.coll .cs-tiles');
  assert.equal(await p.$eval('.coll-val', e => !e.hidden && !!e.querySelector('.cv')), true, 'carte de valeur en tête des Stats');
  await p.click('#collSeg [data-v="list"]'); await p.waitForSelector('.crow.cvw-c'); assert.equal(await p.$eval('.coll-val', e => e.hidden), true);
  ok('compacte par défaut (64 px, nom, drapeau, emplacement, prix, ×n), valeur dans le sous-titre, carte de valeur dans Stats, point de sauvegarde et sa feuille, outils en icônes');

  // tri, filtres, tri par édition (intertitres), Rangement : dans la vue compacte
  await p.selectOption('#collSort', 'price'); await p.waitForFunction(() => document.querySelector('.coll-list > .crow').dataset.k === 'craterhoof behemoth');
  assert.equal(await p.$eval('.coll-sort', l => [l.classList.contains('on'), l.title].join()), 'true,Trier : Prix', 'tri choisi : bouton marqué');
  await p.selectOption('#collSort', 'set'); await p.waitForSelector('.coll-list.cvw-compact > .coll-sethd'); assert.match(await txt(p, '.coll-sethd'), /Sans édition/);
  await p.selectOption('#collSort', 'name');
  await p.fill('.coll #collF input', 'sol'); await p.waitForFunction(() => document.querySelectorAll('.coll-list > .crow').length === 1);
  await p.click('.coll #collF .fclear'); await p.waitForFunction(() => document.querySelectorAll('.coll-list > .crow').length === 8);
  await p.evaluate(() => plcShow('ab12')); await p.waitForFunction(() => document.querySelectorAll('.coll-list.cvw-compact > .crow.cvw-c').length === 2);
  assert.deepEqual(await p.$$eval('.coll-list > .crow', r => r.map(x => x.dataset.k)), ['edgar markov', 'sol ring'], 'Rangement : les cartes du classeur');
  await p.click('.plc-x'); await p.waitForFunction(() => document.querySelectorAll('.coll-list > .crow').length === 8);
  // masterset : interrupteur en icône, sélecteur d'édition et roue dans leur rangée ; pas de choix de vue dans le masterset
  await p.click('.coll-ibar .coll-ms'); await p.waitForFunction(() => document.querySelector('.coll-ms').getAttribute('aria-pressed') === 'true');
  assert.deepEqual(await p.evaluate(() => [document.querySelector('.coll-srow').hidden, document.querySelector('.ms-pick').hidden, document.querySelector('.cvw-btn').hidden, document.querySelector('.coll-sort').hidden]), [false, false, true, true], 'masterset : sa rangée, ni tri ni vue');
  await p.click('.coll-ibar .coll-ms'); await p.waitForSelector('.crow.cvw-c'); assert.equal(await p.$eval('.coll-srow', e => e.hidden), true);
  ok('tri (bouton marqué), tri par édition et ses intertitres, recherche, Rangement, masterset : dans la vue compacte');

  // toucher : la ligne ouvre la fiche de la carte (cardsheet.js), par le même branchement que la vue détaillée (collection.js) ; la vignette garde l'agrandissement
  await p.click('.crow.cvw-c[data-k="craterhoof behemoth"] .cvw-hit'); await p.waitForSelector('.sheet-wrap.open.cs-sheet');
  assert.equal(await p.evaluate(() => [CS.k, CS.o.from, CS.o.l].join()), 'craterhoof behemoth,coll,en#pef56', 'fiche de la carte : clé, ligne touchée');
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  await p.waitForFunction(() => !!document.querySelector('.crow.cvw-c[data-k="wrath of god"] .thumb img.ok'), null, { timeout: 8000 });
  await p.click('.crow.cvw-c[data-k="wrath of god"] .thumb'); await p.waitForSelector('.imgv.on'); assert.equal(await p.$('.sheet-wrap.open.cs-sheet'), null, 'la vignette ne va pas à la fiche');
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.imgv.on'));
  // sans fiche de carte (appli sans cardsheet.js) : la ligne se déplie sur place en vue détaillée (− / +), « Replier »
  await p.evaluate(() => { window.__ocs = openCardSheet; window.openCardSheet = undefined; collPaintBody(true); });
  assert.match(await p.$eval('.crow.cvw-c[data-k="sol ring"] .cvw-hit', b => b.getAttribute('aria-label')), /^Afficher le détail de Sol Ring/);
  await p.click('.crow.cvw-c[data-k="sol ring"] .cvw-hit'); await p.waitForSelector('.cvw-x .crow[data-k="sol ring"] .qstep');
  assert.equal(await p.evaluate(() => document.activeElement.classList.contains('cvw-fold')), true, 'focus sur « Replier »');
  await p.click('.cvw-x .crow[data-k="sol ring"] .qstep [data-d="1"]'); await p.waitForFunction(() => COLL.map['sol ring'].q === 5);
  assert.equal(await txt(p, '.cvw-x .qstep b'), '5');
  await p.click('.cvw-x .cvw-fold'); await p.waitForSelector('.crow.cvw-c[data-k="sol ring"]'); assert.equal(await p.$('.cvw-x'), null);
  assert.equal(await txt(p, '.crow.cvw-c[data-k="sol ring"] .cvw-q'), '×5');
  await p.evaluate(() => { window.openCardSheet = window.__ocs; collPaintBody(true); });
  ok('toucher d\'une ligne : la fiche de la carte (même branchement que la vue détaillée), la vignette s\'agrandit ; sans fiche, la ligne se déplie (− / +, Replier)');

  // choix de la vue : feuille « Affichage de la liste », grille 3 par ligne, gardé au rechargement
  await p.click('.cvw-btn'); await p.waitForSelector('.sheet-wrap.open .cvw-opts');
  assert.deepEqual(await p.$$eval('.cvw-opt', b => b.map(x => x.dataset.v + (x.getAttribute('aria-checked') === 'true' ? '*' : ''))), ['compact*', 'detail', 'grid']);
  await p.click('.cvw-opt[data-v="grid"]'); await p.waitForSelector('.coll-list.cvw-grid > .crow.cvw-g'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  assert.equal(await p.evaluate(() => localStorage.getItem('deckdeal:coll:view')), 'grid');
  const g = await p.$$eval('.coll-list.cvw-grid > .crow.cvw-g', t => t.slice(0, 4).map(x => Math.round(x.getBoundingClientRect().top)));
  assert.ok(g[0] === g[1] && g[1] === g[2] && g[3] > g[0], 'trois par ligne : ' + g);
  assert.match(await txt(p, '.crow.cvw-g[data-k="sol ring"] .cvw-ov'), /Sol Ring ×5 1,50\s€/, 'nom, ×n et prix en surimpression');
  await p.click('.crow.cvw-g[data-k="arcane signet"] .cvw-hit'); await p.waitForSelector('.sheet-wrap.open.cs-sheet'); assert.equal(await p.evaluate(() => CS.k), 'arcane signet', 'grille : même toucher que la compacte');
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  await p.selectOption('#collSort', 'set'); await p.waitForSelector('.coll-list.cvw-grid > .coll-sethd');
  assert.ok(await p.$eval('.coll-list.cvw-grid > .coll-sethd', h => h.getBoundingClientRect().width > innerWidth * .8), 'intertitre sur toute la largeur'); await p.selectOption('#collSort', 'name');
  console.log('  393×852 grille :', JSON.stringify(await measure(p, ROWS)));
  await p.reload(); await p.waitForFunction(() => typeof openCollection === 'function'); await toColl(p);
  assert.ok(await p.$('.coll-list.cvw-grid > .crow.cvw-g'), 'vue gardée après rechargement'); assert.equal(await p.$eval('.cvw-btn', b => b.getAttribute('aria-label')), 'Affichage : Grille');
  await p.evaluate(() => { window.openCardSheet = undefined; collPaintBody(true); });      // sans fiche : dépliée sur toute la largeur
  await p.click('.crow.cvw-g[data-k="sol ring"] .cvw-hit'); await p.waitForSelector('.cvw-grid > .cvw-x .qstep');
  assert.ok(await p.$eval('.cvw-grid > .cvw-x', x => x.getBoundingClientRect().width > innerWidth * .8));
  await p.click('.cvw-btn'); await p.waitForSelector('.sheet-wrap.open .cvw-opts'); await p.click('.cvw-opt[data-v="detail"]');
  await p.waitForFunction(() => document.querySelectorAll('.coll-list.cvw-detail > .crow .qstep').length === 8 && !document.querySelector('.cvw-x'));
  assert.ok(await p.$('.coll-list .crow .tag'), 'détaillée : la ligne de toujours (pastilles, − / +)');
  console.log('  393×852 détaillée :', JSON.stringify(await measure(p, ROWS)));
  // stockage indisponible : le choix vaut pour la session, rien ne casse
  await p.evaluate(() => { Storage.prototype.__set = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new Error('quota'); }; cvwSet('compact'); Storage.prototype.setItem = Storage.prototype.__set; });
  await p.waitForSelector('.coll-list.cvw-compact > .crow.cvw-c');
  ok('feuille « Affichage de la liste », grille 3 par ligne (intertitres, toucher), choix gardé au rechargement, détaillée inchangée, stockage en panne');
  await p.context().close();
}

/* ── 2) Défilement : onglets et recherche collés en haut, titre resserré ─────────────────────── */
{
  const { p } = await open({ coll: BIG });
  await toColl(p); await p.waitForFunction(() => document.querySelectorAll('.coll-list > .crow').length === 24);
  const h0 = await p.$eval('.coll .dv-head', h => h.getBoundingClientRect().height);
  await p.evaluate(() => { const s = document.querySelector('.coll .dv-scroll'); s.scrollTop = 600; });
  await p.waitForFunction(() => document.querySelector('.coll.on').classList.contains('scrolled')); await p.waitForTimeout(300);
  const st = await p.evaluate(() => { const sc = document.querySelector('.coll .dv-scroll').getBoundingClientRect(), c = document.querySelector('.coll .coll-controls').getBoundingClientRect(), i = document.querySelector('.coll #collF input').getBoundingClientRect(); return [Math.round(c.top - sc.top), i.top >= sc.top && i.bottom < sc.top + 140, getComputedStyle(document.querySelector('.coll-controls')).position]; });
  assert.deepEqual(st, [0, true, 'sticky'], 'onglets et recherche collés en haut de la liste');
  assert.ok(await p.$eval('.coll .dv-head', h => h.getBoundingClientRect().height) < h0, 'titre resserré');
  await p.evaluate(() => { document.querySelector('.coll .dv-scroll').scrollTop = 0; }); await p.waitForFunction(() => !document.querySelector('.coll.on').classList.contains('scrolled'));
  ok('défilement : onglets et recherche collés en haut, en-tête resserré puis rendu');
  await p.context().close();
}

/* ── 3) Échange : déconnecté (barre « Connecte-toi pour partager »), réglages, ligne des sous-onglets ── */
{
  const { p } = await open();
  await toColl(p, 'trade'); await p.waitForSelector('.coll.m-trade .tr-list .tr-row');
  assert.equal(await txt(p, '.coll-main .tr-box.tr-bar'), 'Connecte-toi pour partager Un lien public pour tes amis, en lecture seule');
  assert.ok(await p.$('.tr-bar [data-act="login"]')); assert.ok(await p.$eval('.tr-bar', b => b.getBoundingClientRect().height <= 60), 'barre d\'une ligne');
  assert.equal(await p.$('.coll-main .tr-keep'), null, 'réserve : dans les réglages');
  assert.equal(await txt(p, '.tr-setb span'), 'Garde 1 ex.');
await p.waitForSelector('.tr-top .tr-sum em', { timeout: 15000 });      // valeur : prix des cartes lus après l'ouverture de l'écran
  const top = await p.evaluate(() => { const s = document.querySelector('.tr-top .tr-sub').getBoundingClientRect(), e = document.querySelector('.tr-top .tr-sum em').getBoundingClientRect(); return Math.abs((s.top + s.bottom) / 2 - (e.top + e.bottom) / 2) < 4 && e.left > s.right; });
  assert.ok(top, 'sous-onglets et total sur la même ligne');
  const m = await measure(p, '.coll.m-trade .tr-list .tr-row'); console.log('  393×852 échange déconnecté :', JSON.stringify(m));
  assert.ok(m.first <= 320, `liste d'échange à y = ${m.first} (≤ 320)`);
  await p.click('.tr-setb'); await p.waitForSelector('.sheet-wrap.open .trs-sheet #trKeep .seg-opt'); await p.waitForTimeout(450);
  assert.equal(await txt(p, '.sheet-wrap.open .sheet-head h2'), 'Réglages de l\'échange');
  await p.click('#trKeep [data-v="2"]'); await p.waitForFunction(() => TR.keep === 2);
  assert.equal(await txt(p, '.tr-setb span'), 'Garde 2 ex.', 'la pastille suit le réglage'); assert.match(await p.$eval('.tr-setb', b => b.getAttribute('aria-label')), /Garde 2 ex\./);
  assert.ok(await p.$('.trs-plc .tr-plc'), 'Mes rangements (rangements de la collection)');
  await p.click('.trs-plc .tr-plc'); await p.waitForSelector('.sheet-wrap.open .trp-row');
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.trp-row')); await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  ok('Échange déconnecté : barre d\'une ligne, roue « Garde 1 ex. » à côté de Filtres, feuille « Réglages de l\'échange » (réserve, Mes rangements), sous-onglets et total sur une ligne');
  await p.context().close();
}

/* ── 4) Échange connecté avec lien : « Lien actif · QR · Partager », feuille du lien ───────────── */
{
  const { p } = await open();
  await p.waitForFunction(() => D.authReady, null, { timeout: 15000 });
  await p.evaluate(() => {
    D.cloud = { onUser() {}, watch: (uid, cb) => { cb([], false); return () => {}; }, newId: () => 'x', save: async () => {}, remove: async () => {},
      watchColl(uid, cb) { cb(null, false, false); return () => {}; }, txColl: async (uid, fn) => fn(null), pullColl: async () => ({ data: null }), saveColl: async () => {},
      watchMeta(uid, id, cb) { cb(null, false, false); return () => {}; }, saveMeta: async () => {}, pullMeta: async () => ({ data: null }),
      shareId: () => 'ShareDensite0001', saveShare: async () => {}, dropShare: async () => {} };
    D.state = 'ready'; D.err = ''; onUser({ uid: 'u-dens', email: 'beer@example.com', displayName: 'Beer', reload: async () => {} });
  });
  await toColl(p, 'trade'); await p.waitForSelector('.coll.m-trade .tr-list .tr-row');
  assert.match(await txt(p, '.tr-bar'), /^Partager ta liste/); await p.click('.tr-bar [data-act="tron"]'); await p.waitForSelector('.coll-main .tr-box.tr-bar.on');
  assert.deepEqual(await p.$$eval('.tr-bar.on [data-act]', b => b.map(x => x.dataset.act).filter(a => a !== 'trlive')), ['trlink', 'trqr', 'trsend']);
  assert.match(await txt(p, '.tr-bar.on .tr-bar-main'), /^Lien actif/); assert.ok(await p.$eval('.tr-bar.on', b => b.getBoundingClientRect().height <= 60), 'une ligne');
  assert.ok(await p.$eval('.tr-bar.on .tr-bar-main b', b => b.scrollWidth <= b.clientWidth + 1), '« Lien actif » lisible en entier');
  await p.evaluate(() => document.querySelector('#toast').classList.remove('on'));
  const m = await measure(p, '.coll.m-trade .tr-list .tr-row'); console.log('  393×852 échange avec lien :', JSON.stringify(m));
  assert.ok(m.first <= 320, `liste d'échange à y = ${m.first} (≤ 320)`);
  await p.click('.tr-bar.on [data-act="trlink"]'); await p.waitForSelector('.sheet-wrap.open .trl-sheet .tr-link input');
  assert.equal(await p.$eval('.trl-sheet .tr-link input', i => i.value), world.url + '?p=ShareDensite0001');
  assert.deepEqual(await p.$$eval('.trl-sheet [data-act]', b => b.map(x => x.dataset.act).filter(a => a !== 'trlive')), ['trcopy', 'trsend', 'trview', 'trqr', 'trimg', 'trnew', 'troff'], 'toutes les actions du lien');
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  await p.click('.tr-bar.on [data-act="trqr"]'); await p.waitForSelector('.sheet-wrap.open .qr-img svg'); await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  ok('Échange connecté : « Lien actif · QR · Partager » sur une ligne, la feuille du lien garde toutes les actions, liste à y ≤ 320');
  // 360 × 780 : rien ne déborde, « Lien actif » toujours lisible
  await p.setViewportSize({ width: 360, height: 780 }); await p.waitForTimeout(400);
  assert.ok(await noHScroll(p), '360 px : pas de défilement horizontal');
  assert.ok(await p.$eval('.tr-bar.on .tr-bar-main b', b => b.scrollWidth <= b.clientWidth + 1), '360 px : « Lien actif » lisible');
  console.log('  360×780 échange avec lien :', JSON.stringify(await measure(p, '.coll.m-trade .tr-list .tr-row')));
  await p.context().close();
}

/* ── 5) 360 × 780 et ordinateur 1280 × 800 ───────────────────────────────────────────────────── */
{
  const { p } = await open({ ctx: { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } });
  await toColl(p); await p.waitForSelector('.crow.cvw-c'); await p.waitForTimeout(600);      // en-tête posé (sinon mesuré pendant l'ouverture)
  const m = await measure(p, ROWS); console.log('  360×780 compacte :', JSON.stringify(m));
  assert.ok(m.first <= 0.30 * m.H && m.full >= 7, '360 px : ' + JSON.stringify(m)); assert.ok(await noHScroll(p));
  assert.ok(await p.$eval('.coll #collF .fsearch', s => s.getBoundingClientRect().width >= 130), 'la recherche garde sa place');
  await p.context().close();
  const D = await open({ ctx: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }, init: "try { localStorage.setItem('deckdeal:coll:view', 'grid'); } catch (e) {}" });
  await toColl(D.p); await D.p.waitForSelector('.crow.cvw-g');
  const cols = await D.p.$$eval('.coll-list.cvw-grid > .crow.cvw-g', t => new Set(t.map(x => Math.round(x.getBoundingClientRect().top))).size);
  assert.ok(cols <= 2, 'ordinateur : plus de 3 images par ligne (' + cols + ' lignes pour 8)'); assert.ok(await noHScroll(D.p));
  assert.equal(await D.p.$eval('.coll .fbtn span', s => getComputedStyle(s).position), 'static', 'ordinateur : « Filtres » écrit');
  await D.p.click('.cvw-btn'); await D.p.waitForSelector('.sheet-wrap.open .cvw-opts'); await D.p.click('.cvw-opt[data-v="compact"]'); await D.p.waitForSelector('.crow.cvw-c');
  console.log('  1280×800 compacte :', JSON.stringify(await measure(D.p, ROWS)));
  ok('360 × 780 (≥ 7 cartes, recherche lisible) et ordinateur (grille large, Filtres écrit, compacte)');
  await D.p.context().close();
}

for (const e of errsAll) assert.deepEqual(e, [], 'erreurs page : ' + e.join(' | '));
await browser.close(); world.stop();
console.log('DENSITE E2E OK');
process.exit(0);
