// E2E classeur d'échange (binder.js) : interrupteur Liste | Classeur (section Échange du propriétaire, page publique), « Mon classeur » (couleur, tri,
// cartes épinglées), réglages publiés DANS le champ d du partage et vus par un visiteur, pages (flèches, glisser, clavier), carte en grand, 1 carte,
// 2 000 cartes (3 feuilles seulement dans la page), deux pages face à face sur grand écran, choix gardé, réglages relus par un autre appareil du compte.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, ok, txt } from './e2e-world.mjs';

const world = await startWorld({ port: 19200 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errsOf = [];
const shares = new Map(), meta = {}; let writes = 0;
// pas de deck : réserve 1 → doublons = exemplaires − 1 (9 cartes, une seule langue chacune)
const COLL = ['5 Sol Ring *FR*', '3 Swords to Plowshares', '3 Wrath of God', '4 Llanowar Elves *EN*', '3 Craterhoof Behemoth', '3 Arcane Signet', '3 Command Tower', "2 Ranger's Hawk", '3 Edgar Markov'].join('\n');
const PRICES = '#MOPX1 2026-10-08T09:00:00Z 3\nSol Ring\t120\t100\nLlanowar Elves\t25\t25\nWrath of God\t300\t280\n';      // le reste : prix Scryfall des fiches (e2e-world)

async function routeRest(p) {
  await p.route('https://firestore.googleapis.com/**', route => {
    const u = new URL(route.request().url()), id = decodeURIComponent(u.pathname.split('/').pop()), h = { 'access-control-allow-origin': '*' }, s = shares.get(id);
    assert.equal(route.request().method(), 'GET', 'lecture seule');
    if (!s) return route.fulfill({ status: 404, headers: h, json: { error: { code: 404, status: 'NOT_FOUND' } } });
    route.fulfill({ status: 200, headers: h, json: { fields: { o: { stringValue: s.o || 'x' }, kind: { stringValue: s.kind }, v: { integerValue: '1' }, updatedAt: { integerValue: String(s.updatedAt || 1) }, d: { stringValue: s.d } } } });
  });
  await p.route('**/prices.tsv', r => r.fulfill({ status: 200, contentType: 'text/tab-separated-values', body: PRICES }));
  await p.route('https://www.gstatic.com/**', r => r.abort());
}
/** Propriétaire connecté (faux cloud : partages et réglages du compte gardés côté test). */
async function owner(opts = {}) {
  const seed = `try { localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: ${JSON.stringify(COLL)}, u: 1, s: '', b: null })); } catch (e) {}`;
  const O = await newPage(browser, world, { goto: false, init: seed, ...opts }); errsOf.push(O.errs);
  await routeRest(O.p);
  await O.p.exposeFunction('__share', (op, id, data) => { if (op === 'set') { shares.set(id, data); writes++; } else shares.delete(id); });
  await O.p.exposeFunction('__meta', (id, data) => { meta[id] = data; });
  await O.p.exposeFunction('__metaGet', id => meta[id] || null);
  await O.p.goto(world.url); await O.p.waitForFunction(() => D.authReady, null, { timeout: 15000 });
  await O.p.evaluate(() => {
    D.cloud = {
      onUser() {}, watch: (uid, cb) => { cb([], false); return () => {}; }, newId: () => 'x', save: async () => {}, remove: async () => {},
      watchColl(uid, cb) { cb(null, false, false); return () => {}; }, txColl: async (uid, fn) => fn(null), pullColl: async () => ({ data: null }), saveColl: async () => {},
      watchMeta(uid, id, cb) { window.__metaGet(id).then(d => cb(d, false, false)); return () => {}; }, saveMeta: async (uid, id, data) => { await window.__meta(id, data); }, pullMeta: async () => ({ data: null }),
      shareId: () => 'ShareBinder00001', saveShare: async (id, data) => { await window.__share('set', id, data); }, dropShare: async id => { await window.__share('drop', id); },
    };
    D.state = 'ready'; D.err = '';
    onUser({ uid: 'u-binder', email: 'beer@example.com', displayName: 'Beer', reload: async () => {} });
  });
  return O;
}
const toTrade = async p => { await p.evaluate(() => { if (S.view !== 'home') showView('home'); }); await p.click('#btnColl'); await p.waitForSelector('.coll.on'); await p.click('#nav [data-nav="trade"]'); await p.waitForSelector('.tr-box'); };
const keysOf = (p, root) => p.$$eval(root + ' .bnd-sheet[data-pos="0"] .bnd-card', c => c.map(x => x.dataset.k));
const ind = (p, root) => p.$eval(root + ' .bnd-ind', e => e.textContent);
const shareD = id => JSON.parse(shares.get(id).d);

/* ── Propriétaire : interrupteur, classeur, « Mon classeur » ───────────────────────────────────── */
const { p } = await owner();
await toTrade(p);
await p.waitForSelector('.tr-list .tr-row');
assert.deepEqual(await p.$$eval('#trView .seg-opt', b => b.map(x => [x.dataset.v, x.getAttribute('aria-label'), x.getAttribute('aria-checked')])), [['list', 'Liste', 'true'], ['binder', 'Classeur', 'false']], 'interrupteur : deux icônes, libellés lus');
assert.ok(await p.$('.tr-tools #trView') && await p.$('.tr-tools #trSort'), 'sur la ligne Trier / prix : pas de ligne de plus');
// prix connus (fichier de prix + fiches Scryfall) avant de vérifier un ordre par valeur
await p.waitForFunction(() => ['craterhoof behemoth', 'swords to plowshares', 'arcane signet', 'command tower', 'edgar markov', 'rangers hawk', 'sol ring', 'wrath of god', 'llanowar elves'].every(k => trPrice(k) > 0), null, { timeout: 15000 });
await p.click('#trView [data-v="binder"]'); await p.waitForSelector('.coll-main .bnd .bnd-card');
assert.ok(!(await p.$('.tr-list')) && !(await p.$('#trSort')) && !(await p.$('#trMin')) && !(await p.$('[data-act="trmore"]')), 'classeur : ni liste, ni tri, ni « ≥ X € »');
assert.equal(await txt(p, '.bnd-cust'), 'Personnaliser');
assert.equal(await p.$eval('.coll-main .bnd', e => e.dataset.cover), 'nuit', 'couverture par défaut');
{
  const ks = await keysOf(p, '.coll-main'), names = await p.$$eval('.coll-main .bnd-sheet[data-pos="0"] .bnd-art i', n => n.map(x => x.textContent));
  assert.equal(ks.length, 9, '9 doublons, une pochette chacun'); assert.equal(await p.$$eval('.coll-main .bnd-sheet[data-pos="0"] .bnd-slot', s => s.length), 9);
  assert.deepEqual(names, names.slice().sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })), 'sans réglage : par nom affiché');
  assert.ok(await p.$('.coll-main .bnd.one'), 'une seule page : ni flèches ni numéro');
  assert.match(await p.$eval('.coll-main .bnd-card[data-k="sol ring"]', b => b.innerText), /×4/, 'exemplaires'); assert.match(await p.$eval('.coll-main .bnd-card[data-k="sol ring"] .bnd-p', b => b.textContent), /1,20/, 'prix à l\'unité');
  assert.ok(!(await p.$('.coll-main .bnd-card[data-k="rangers hawk"] .bnd-q')), '× 1 : pas de pastille');
}
assert.equal(await p.evaluate(() => localStorage.getItem('deckdeal:bndview:v1')), '{"o":"binder"}', 'choix gardé sur l\'appareil');
ok('section Échange : interrupteur sur la ligne des outils, classeur à la place de la liste (pastilles × et prix), choix gardé');

await p.click('.bnd-cust'); await p.waitForSelector('.sheet-wrap.open .bnd-covers');
assert.equal(await txt(p, '.sheet-wrap.open .sheet-head h2'), 'Mon classeur');
assert.equal(await p.$$eval('.bnd-cv', b => b.length), 8, '8 couleurs'); assert.equal(await p.$eval('.bnd-cv[aria-checked="true"]', b => b.dataset.c), 'nuit');
assert.ok(await p.$('.sheet-wrap.open .bnd.mini'), 'aperçu de la 1re page');
await p.click('.bnd-cv[data-c="foret"]');
await p.waitForFunction(() => document.querySelector('.coll-main .bnd').dataset.cover === 'foret' && document.querySelector('.bnd.mini').dataset.cover === 'foret');
assert.equal(await txt(p, '.bnd-cvn'), 'Forêt');
await p.click('#bndSort [data-v="value"]');
assert.match(await txt(p, '.bnd-sug-h'), /Tes cartes les plus chères/); assert.equal(await p.$eval('.bnd-opt', b => b.dataset.k), 'craterhoof behemoth', 'suggestions : les plus chères d\'abord');
await p.fill('#bndQ', 'llanowar'); await p.waitForFunction(() => document.querySelectorAll('.bnd-opt').length === 1); await p.click('.bnd-opt');
await p.fill('#bndQ', 'edgar'); await p.waitForFunction(() => document.querySelectorAll('.bnd-opt').length === 1); await p.click('.bnd-opt');
await p.fill('#bndQ', 'zzz'); await p.waitForFunction(() => /Aucune carte de ta liste ne correspond/.test(document.querySelector('.bnd-sug-h').textContent));
await p.fill('#bndQ', '');
assert.equal(await txt(p, '.bnd-pin-h'), 'Cartes épinglées en tête · 2/18');
assert.deepEqual(await p.$$eval('.bnd-pinr', r => r.map(x => x.dataset.k)), ['llanowar elves', 'edgar markov']);
await p.click('.bnd-pinr[data-k="llanowar elves"] [data-pa="down"]');
assert.deepEqual(await p.$$eval('.bnd-pinr', r => r.map(x => x.dataset.k)), ['edgar markov', 'llanowar elves'], 'ordre des épingles réglable');
assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.closest('.bnd-pinr') && document.activeElement.closest('.bnd-pinr').dataset.k), 'llanowar elves', 'le focus suit la carte déplacée');
await p.click('.sheet [data-close].icon-btn'); await p.waitForTimeout(500);
const ORDER = ['edgar markov', 'llanowar elves', 'craterhoof behemoth', 'wrath of god', 'swords to plowshares', 'sol ring', 'arcane signet', 'command tower', 'rangers hawk'];
assert.deepEqual(await keysOf(p, '.coll-main'), ORDER, 'épinglées d\'abord, puis par valeur (9,00 · 3,00 · 1,90 · 1,20 · 0,40 · 0,25 · 0,05)');
assert.equal(await p.$$eval('.coll-main .bnd-sheet[data-pos="0"] .bnd-pin', x => x.length), 2, 'épingle visible');
const cfg = await p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:binder:v1')));
assert.deepEqual([cfg.c, cfg.s, cfg.k, cfg.who, cfg.u > 0], ['foret', 'value', ['edgar markov', 'llanowar elves'], 'u-binder', true], 'réglages sur l\'appareil, par compte');
ok('« Mon classeur » : couleur (aperçu en direct), tri par valeur, épingles cherchées dans la liste et réordonnées ; section repeinte derrière');

/* ── Lien public : réglages dans d, cartes dans l'ordre du classeur ─────────────────────────────── */
await p.click('[data-act="tron"]'); await p.waitForSelector('.tr-box.on');
for (let i = 0; i < 40 && !shares.has('ShareBinder00001'); i++) await sleep(150);
{
  const s = shares.get('ShareBinder00001'), d = JSON.parse(s.d);
  assert.deepEqual(Object.keys(s).sort(), ['d', 'kind', 'o', 'updatedAt', 'v'], 'aucune nouvelle clé de document (règles Firestore inchangées)');
  assert.deepEqual([d.bd.c, d.bd.s, d.bd.k, d.bd.u === cfg.u], ['foret', 'value', ['edgar markov', 'llanowar elves'], true], 'classeur publié dans d');
  assert.deepEqual(d.have.map(x => x.n), ['Edgar Markov', 'Llanowar Elves', 'Craterhoof Behemoth', 'Wrath of God', 'Swords to Plowshares', 'Sol Ring', 'Arcane Signet', 'Command Tower', "Ranger's Hawk"], 'doublons dans l\'ordre du classeur');
}
// aperçu du propriétaire : le classeur d'abord (il est réglé)
await p.click('.tr-box.on [data-act="trview"]'); await p.waitForSelector('.pubv.on .bnd .bnd-card');
assert.deepEqual(await keysOf(p, '.pubv'), ORDER); assert.equal(await p.$eval('.pubv .bnd', e => e.dataset.cover), 'foret');
await p.click('.pubv .dv-back'); await p.waitForTimeout(400);
// une carte souhaitée de plus : l'onglet « Recherchées » du visiteur aussi en classeur
const w0 = writes;
await p.evaluate(() => { TR.wish['sol ring'] = { n: 'Sol Ring', q: 2 }; TR.wish['craterhoof behemoth'] = { n: 'Craterhoof Behemoth', q: 1 }; trChanged(); });
for (let i = 0; i < 60 && (writes === w0 || shareD('ShareBinder00001').want.length < 2); i++) await sleep(200);
assert.deepEqual(shareD('ShareBinder00001').want.map(x => x.n), ['Craterhoof Behemoth', 'Sol Ring'], 'recherchées : même tri (valeur), sans épingles');
ok('lien : réglages dans le champ d (aucune clé ajoutée), doublons publiés dans l\'ordre du classeur, aperçu en classeur');

/* ── Visiteur ──────────────────────────────────────────────────────────────────────────────────── */
{
  const V = await newPage(browser, world, { goto: false }); errsOf.push(V.errs); await routeRest(V.p);
  await V.p.goto(world.url + '?p=ShareBinder00001'); await V.p.waitForSelector('.pubv.on');
  assert.ok(await V.p.$eval('#pubBar', b => b.hidden), '« Pour toi » : pas d\'interrupteur');
  await V.p.click('#pubSub [data-v="have"]'); await V.p.waitForSelector('.pubv .bnd .bnd-card');
  assert.ok(await V.p.$eval('#pubBar', b => !b.hidden) && await V.p.$('#pubBar #pubView'), 'interrupteur sur la ligne du nombre de cartes');
  assert.equal(await txt(V.p, '.bnd-cnt'), '9 cartes · 20 exemplaires');
  assert.equal(await V.p.$eval('.pubv .bnd', e => e.dataset.cover), 'foret', 'couleur choisie par le propriétaire');
  assert.deepEqual(await keysOf(V.p, '.pubv'), ORDER, 'épinglées puis tri du propriétaire');
  assert.deepEqual(await V.p.$$eval('.pubv .bnd-card:has(.bnd-pin)', c => c.map(x => x.dataset.k)), ['edgar markov', 'llanowar elves'], 'épingles visibles');
  assert.equal(await V.p.$eval('#pubView [aria-checked="true"]', b => b.dataset.v), 'binder', 'classeur réglé : ouvert en classeur');
  // carte en grand
  await V.p.waitForFunction(() => document.querySelector('.pubv .bnd-card[data-k="craterhoof behemoth"] img.ok'), null, { timeout: 8000 });
  await V.p.click('.pubv .bnd-card[data-k="craterhoof behemoth"]'); await V.p.waitForSelector('.imgv.on');
  assert.equal(await txt(V.p, '.imgv-cap b'), 'Craterhoof Behemoth'); assert.equal(await txt(V.p, '.imgv-count'), '3 / 9', 'les voisines du classeur à portée de glissement');
  await V.p.keyboard.press('Escape'); await V.p.waitForTimeout(400);
  // recherche : le classeur suit les filtres
  await V.p.fill('#pubF input', 'wrath'); await V.p.waitForFunction(() => document.querySelectorAll('.pubv .bnd-sheet[data-pos="0"] .bnd-card').length === 1);
  assert.equal(await txt(V.p, '.bnd-cnt'), '1 carte sur 9 · 2 exemplaires'); assert.equal(await V.p.$$eval('.pubv .bnd-sheet[data-pos="0"] .bnd-slot.empty', s => s.length), 8, 'pochettes vides');
  await V.p.fill('#pubF input', ''); await V.p.waitForFunction(() => document.querySelectorAll('.pubv .bnd-sheet[data-pos="0"] .bnd-card').length === 9);
  // recherchées
  await V.p.click('#pubSub [data-v="want"]'); await V.p.waitForFunction(() => document.querySelectorAll('.pubv .bnd-sheet[data-pos="0"] .bnd-card').length === 2);
  assert.deepEqual(await keysOf(V.p, '.pubv'), ['craterhoof behemoth', 'sol ring']); assert.equal(await txt(V.p, '.bnd-cnt'), '2 cartes · 3 exemplaires');
  // liste : par nom anglais, comme avant
  await V.p.click('#pubSub [data-v="have"]'); await V.p.click('#pubView [data-v="list"]'); await V.p.waitForSelector('.pubv .pub-row');
  assert.ok(!(await V.p.$('.pubv .bnd')), 'plus de classeur');
  assert.deepEqual(await V.p.$$eval('.pubv .pub-row', r => r.map(x => x.dataset.k)), ['arcane signet', 'command tower', 'craterhoof behemoth', 'edgar markov', 'llanowar elves', 'rangers hawk', 'sol ring', 'swords to plowshares', 'wrath of god'], 'liste : l\'ordre habituel');
  assert.equal(await V.p.evaluate(() => localStorage.getItem('deckdeal:bndview:v1')), '{"p":"list"}');
  await V.p.goto(world.url + '?p=ShareBinder00001'); await V.p.waitForSelector('.pubv.on'); await V.p.click('#pubSub [data-v="have"]'); await V.p.waitForSelector('.pubv .pub-row');      // l'appli retire ?p= de l'adresse à l'ouverture : on rouvre le lien
  assert.ok(!(await V.p.$('.pubv .bnd')), 'choix du visiteur gardé (liste), même si le propriétaire a réglé un classeur');
  await V.ctx.close();
  ok('visiteur : classeur du propriétaire (couleur, épingles, tri), carte en grand, filtres, recherchées, retour à la liste habituelle, choix gardé');
}

/* ── Visiteur : 2 000 cartes (pages, glisser, clavier), puis 1 carte ───────────────────────────── */
const card = i => ({ n: 'Card ' + String(i).padStart(4, '0'), q: 1 + (i % 3), i: 'small/front/a/b/card-' + i + '.jpg', t: 'Artifact', c: 2, o: '' });
shares.set('ShareBinderMany1', { kind: 'trade', d: JSON.stringify({ at: Date.now(), have: Array.from({ length: 2000 }, (_, i) => card(1999 - i)), want: [] }) });
shares.set('ShareBinderOne01', { kind: 'trade', d: JSON.stringify({ at: Date.now(), have: [card(7)], want: [] }) });
{
  const V = await newPage(browser, world, { goto: false }); errsOf.push(V.errs); await routeRest(V.p);
  await V.p.goto(world.url + '?p=ShareBinderMany1'); await V.p.waitForSelector('.pubv.on');
  await V.p.click('#pubSub [data-v="have"]'); await V.p.waitForSelector('.pubv .pub-row');
  assert.equal(await V.p.$eval('#pubView [aria-checked="true"]', b => b.dataset.v), 'list', 'sans classeur réglé : la liste d\'abord');
  const t0 = Date.now(); await V.p.click('#pubView [data-v="binder"]'); await V.p.waitForSelector('.pubv .bnd .bnd-card');
  console.log('  2 000 cartes : classeur affiché en', Date.now() - t0, 'ms');
  assert.equal(await V.p.$eval('.pubv .bnd', e => e.dataset.cover), 'nuit', 'couverture par défaut');
  assert.equal(await ind(V.p, '.pubv'), '1 / 223');
  assert.ok(await V.p.$$eval('.pubv .bnd-card', c => c.length) <= 27, 'trois feuilles au plus dans la page');
  assert.deepEqual((await keysOf(V.p, '.pubv')).slice(0, 2), ['card 0000', 'card 0001'], 'sans réglage : par nom');
  await V.p.click('.pubv .bnd-go.nx'); await V.p.waitForFunction(() => document.querySelector('.pubv .bnd-ind').textContent === '2 / 223');
  assert.equal((await keysOf(V.p, '.pubv'))[0], 'card 0009');
  await V.p.focus('.pubv .bnd-view'); await V.p.keyboard.press('ArrowRight'); await V.p.waitForFunction(() => document.querySelector('.pubv .bnd-ind').textContent === '3 / 223');
  // glisser vers la gauche : page suivante ; vers la droite : précédente ; petit geste : rien
  const swipe = async (from, to) => { const b = await V.p.$eval('.pubv .bnd-view', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + r.height / 2, w: r.width }; });
    await V.p.mouse.move(b.x + b.w * from, b.y); await V.p.mouse.down(); for (let i = 1; i <= 8; i++) await V.p.mouse.move(b.x + b.w * (from + (to - from) * i / 8), b.y + i); await V.p.mouse.up(); await V.p.waitForTimeout(600); };
  await swipe(0.85, 0.2); assert.equal(await ind(V.p, '.pubv'), '4 / 223', 'glisser à gauche');
  await swipe(0.2, 0.85); assert.equal(await ind(V.p, '.pubv'), '3 / 223', 'glisser à droite');
  await swipe(0.5, 0.45); assert.equal(await ind(V.p, '.pubv'), '3 / 223', 'petit geste : la page revient');
  assert.ok(!(await V.p.$('.imgv.on')), 'un glissement n\'ouvre pas la carte');
  assert.equal(await V.p.$$eval('.pubv .bnd-sheet[data-pos="0"] img[loading="eager"]', i => i.length), 9, 'images de la page chargées tout de suite');
  // page de début : flèche « précédente » grisée, le bord résiste
  await V.p.click('.pubv .bnd-go[data-d="-1"]'); await V.p.click('.pubv .bnd-go[data-d="-1"]'); await V.p.waitForFunction(() => document.querySelector('.pubv .bnd-ind').textContent === '1 / 223');
  assert.ok(await V.p.$eval('.pubv .bnd-go[data-d="-1"]', b => b.disabled));
  await swipe(0.2, 0.85); assert.equal(await ind(V.p, '.pubv'), '1 / 223');
  // filtre : 10 cartes (Card 1990 à 1999) → 2 pages, la seconde avec 8 pochettes vides
  await V.p.fill('#pubF input', 'card 199'); await V.p.waitForFunction(() => document.querySelector('.pubv .bnd-ind').textContent === '1 / 2');
  await V.p.click('.pubv .bnd-go.nx'); await V.p.waitForFunction(() => document.querySelector('.pubv .bnd-ind').textContent === '2 / 2');
  assert.equal(await V.p.$$eval('.pubv .bnd-sheet[data-pos="0"] .bnd-slot.empty', s => s.length), 8); assert.ok(await V.p.$eval('.pubv .bnd-go.nx', b => b.disabled));
  await V.ctx.close();
}
{
  const V = await newPage(browser, world, { goto: false }); errsOf.push(V.errs); await routeRest(V.p);
  await V.p.goto(world.url + '?p=ShareBinderOne01'); await V.p.waitForSelector('.pubv.on');
  await V.p.click('#pubSub [data-v="have"]'); await V.p.click('#pubView [data-v="binder"]'); await V.p.waitForSelector('.pubv .bnd .bnd-card');
  assert.equal(await V.p.$$eval('.pubv .bnd-card', c => c.length), 1); assert.equal(await V.p.$$eval('.pubv .bnd-slot.empty', s => s.length), 8);
  assert.ok(await V.p.$('.pubv .bnd.one') && await V.p.$eval('.pubv .bnd-nav', n => getComputedStyle(n).display === 'none'), 'une page : pas de navigation');
  assert.equal(await txt(V.p, '.bnd-cnt'), '1 carte · 2 exemplaires');
  await V.p.click('.pubv .bnd-card'); await V.p.waitForSelector('.imgv.on'); assert.ok(!(await V.p.$('.imgv-count')), 'une seule carte'); await V.p.keyboard.press('Escape');
  await V.ctx.close();
}
{
  const V = await newPage(browser, world, { goto: false, ctx: { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 } }); errsOf.push(V.errs); await routeRest(V.p);
  await V.p.goto(world.url + '?p=ShareBinderMany1'); await V.p.waitForSelector('.pubv.on');
  await V.p.click('#pubSub [data-v="have"]'); await V.p.click('#pubView [data-v="binder"]'); await V.p.waitForSelector('.pubv .bnd.spread .bnd-card');
  assert.equal(await ind(V.p, '.pubv'), '1–2 / 223', 'grand écran : deux pages face à face');
  assert.equal(await V.p.$$eval('.pubv .bnd-sheet[data-pos="0"] .bnd-page', x => x.length), 2);
  await V.p.click('.pubv .bnd-go.nx'); await V.p.waitForFunction(() => document.querySelector('.pubv .bnd-ind').textContent === '3–4 / 223');
  await V.p.setViewportSize({ width: 390, height: 844 }); await V.p.waitForFunction(() => !document.querySelector('.pubv .bnd.spread') && document.querySelector('.pubv .bnd-ind').textContent === '3 / 223', null, { timeout: 4000 });
  await V.ctx.close();
  ok('2 000 cartes : 3 feuilles dans la page, flèches, clavier, glisser (bords qui résistent), filtres, pochettes vides ; 1 carte ; grand écran à deux pages');
}

/* ── Autre appareil du même compte : relit le classeur sur le lien avant d'y écrire ────────────── */
{
  const B = await owner();
  await B.p.waitForFunction(() => TR.share === 'ShareBinder00001', null, { timeout: 8000 });
  assert.equal(await B.p.evaluate(() => localStorage.getItem('deckdeal:binder:v1')), null, 'appareil neuf : aucun réglage local');
  const w1 = writes;
  await B.p.evaluate(() => collBump(ownKey('Sol Ring'), 'Sol Ring', 1, { lang: 'fr' }));
  for (let i = 0; i < 80 && writes === w1; i++) await sleep(150);
  assert.ok(writes > w1, 'lien réécrit par l\'autre appareil');
  const d = shareD('ShareBinder00001');
  assert.deepEqual([d.bd.c, d.bd.s, d.bd.k], ['foret', 'value', ['edgar markov', 'llanowar elves']], 'le classeur réglé ailleurs n\'est pas écrasé');
  assert.equal(d.have[0].n, 'Edgar Markov');
  assert.equal(await B.p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:binder:v1')).c), 'foret', 'réglages repris sur cet appareil');
  await B.ctx.close();
  ok('autre appareil du compte : réglages du classeur relus sur le lien publié (une fois), jamais écrasés par ceux par défaut');
}

/* ── Propriétaire : choix et réglages gardés après rechargement ────────────────────────────────── */
await p.reload(); await p.waitForFunction(() => D.authReady, null, { timeout: 15000 });
await toTrade(p); await p.waitForSelector('.coll-main .bnd .bnd-card');
assert.equal(await p.$eval('.coll-main .bnd', e => e.dataset.cover), 'foret');
await p.click('#trView [data-v="list"]'); await p.waitForSelector('.tr-list .tr-row'); assert.ok(await p.$('#trSort'), 'liste : le tri revient');
ok('propriétaire : classeur et réglages retrouvés après rechargement, retour à la liste');

for (const e of errsOf) assert.deepEqual(e, [], 'erreurs page : ' + e.join(' | '));
await browser.close(); world.stop();
console.log('BINDER E2E OK');
process.exit(0);
