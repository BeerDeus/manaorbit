// E2E classeur d'échange (binder.js) : interrupteur Liste | Classeur (section Échange du propriétaire, page publique), « Mon classeur » (couleur, tri,
// cartes épinglées), réglages publiés DANS le champ d du partage et vus par un visiteur, pages (flèches, glisser, clavier), carte en grand, 1 carte,
// 2 000 cartes (3 feuilles seulement dans la page), deux pages face à face sur grand écran, choix gardé, réglages relus par un autre appareil du compte.
// Foil : pochette à part (voile irisé, pastille ✦), publiée (fo) et vue par le visiteur. « Aller à la page » : tuiles (12 pages), curseur (223 pages), clavier.
// Captures (clair et sombre) : BND_SHOTS=<dossier> (fausses cartes dessinées pour juger du rendu).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, startWorld, newPage, ok, txt } from './e2e-world.mjs';

const world = await startWorld({ port: 19200 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errsOf = [];
const shares = new Map(), meta = {}; let writes = 0;
// pas de deck : réserve 1 → doublons = exemplaires − 1 (9 cartes, une seule langue chacune)
const COLL = ['5 Sol Ring *FR*', '3 Swords to Plowshares', '3 Wrath of God', '4 Llanowar Elves *EN*', '3 Craterhoof Behemoth', '3 Arcane Signet', '3 Command Tower', "2 Ranger's Hawk", '3 Edgar Markov (FOIL)'].join('\n');      // Edgar Markov : foil
const PRICES = '#MOPX1 2026-10-08T09:00:00Z 3\nSol Ring\t120\t100\nLlanowar Elves\t25\t25\nWrath of God\t300\t280\n';      // le reste : prix Scryfall des fiches (e2e-world)

const SHOTS = process.env.BND_SHOTS || ''; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
/** Fausse carte (captures seulement) : cadre, illustration et texte d'une teinte tirée de l'adresse. */
const cardSvg = u => { const h = [...u].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 360, l = i => `<rect x="52" y="${458 + i * 30}" width="${250 + (i * 53) % 120}" height="10" rx="4" fill="#4a4a52"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="488" height="680" viewBox="0 0 488 680"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${(h + 40) % 360} 70% 62%)"/><stop offset="1" stop-color="hsl(${(h + 200) % 360} 55% 28%)"/></linearGradient></defs>
    <rect width="488" height="680" rx="24" fill="#141418"/><rect x="18" y="18" width="452" height="644" rx="12" fill="hsl(${h} 32% 50%)"/><rect x="30" y="30" width="428" height="44" rx="7" fill="hsl(${h} 30% 86%)"/><rect x="44" y="45" width="190" height="14" rx="4" fill="#26262c"/>
    <rect x="36" y="84" width="416" height="300" fill="url(#g)"/><circle cx="${180 + h % 140}" cy="210" r="74" fill="hsl(${(h + 90) % 360} 85% 78%)" opacity=".55"/><rect x="30" y="392" width="428" height="34" rx="6" fill="hsl(${h} 30% 86%)"/><rect x="36" y="436" width="416" height="204" rx="5" fill="hsl(${h} 22% 92%)"/>${[0, 1, 2, 3, 4].map(l).join('')}</svg>`; };
/** Capture en clair puis en sombre (sel : un élément, sinon l'écran). */
async function shot(p, name, sel) {
  if (!SHOTS) return;
  for (const cs of ['light', 'dark']) { await p.emulateMedia({ colorScheme: cs }); await p.waitForTimeout(300); const path = `${SHOTS}/${name}-${cs}.png`; if (sel) await (await p.$(sel)).screenshot({ path }); else await p.screenshot({ path }); }
  await p.emulateMedia({ colorScheme: 'light' });
}
async function routeRest(p) {
  if (SHOTS) await p.route('https://cards.scryfall.io/**', r => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'image/svg+xml', body: cardSvg(r.request().url()) }));
  await p.route('https://firestore.googleapis.com/**', route => {
    const u = new URL(route.request().url()), id = decodeURIComponent(u.pathname.split('/').pop()), h = { 'access-control-allow-origin': '*' }, s = shares.get(id);
    assert.equal(route.request().method(), 'GET', 'lecture seule');
    if (!s) return route.fulfill({ status: 404, headers: h, json: { error: { code: 404, status: 'NOT_FOUND' } } });
    route.fulfill({ status: 200, headers: h, json: { fields: { o: { stringValue: s.o || 'x' }, kind: { stringValue: s.kind }, v: { integerValue: '1' }, updatedAt: { integerValue: String(s.updatedAt || 1) }, d: { stringValue: s.d } } } });
  });
  await p.route('**/prices.tsv', r => r.fulfill({ status: 200, contentType: 'text/tab-separated-values', body: PRICES }));
  await p.route('https://www.gstatic.com/**', r => r.abort());
}
/** Propriétaire connecté (faux cloud : partages et réglages du compte gardés côté test). coll : texte de sa collection ; sid : identifiant de son lien ; uid : autre compte (ses propres réglages). */
async function owner({ coll = COLL, sid = 'ShareBinder00001', uid = 'u-binder', ...opts } = {}) {
  const seed = `try { localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: ${JSON.stringify(coll)}, u: 1, s: '', b: null })); } catch (e) {}`;
  const O = await newPage(browser, world, { goto: false, init: seed, ...opts }); errsOf.push(O.errs);
  await routeRest(O.p);
  await O.p.exposeFunction('__share', (op, id, data) => { if (op === 'set') { shares.set(id, data); writes++; } else shares.delete(id); });
  const mk = id => (uid === 'u-binder' ? id : uid + ':' + id);
  await O.p.exposeFunction('__meta', (id, data) => { meta[mk(id)] = data; });
  await O.p.exposeFunction('__metaGet', id => meta[mk(id)] || null);
  await O.p.goto(world.url); await O.p.waitForFunction(() => D.authReady, null, { timeout: 15000 });
  await O.p.evaluate(([sid, uid]) => {
    D.cloud = {
      onUser() {}, watch: (uid, cb) => { cb([], false); return () => {}; }, newId: () => 'x', save: async () => {}, remove: async () => {},
      watchColl(uid, cb) { cb(null, false, false); return () => {}; }, txColl: async (uid, fn) => fn(null), pullColl: async () => ({ data: null }), saveColl: async () => {},
      watchMeta(uid, id, cb) { window.__metaGet(id).then(d => cb(d, false, false)); return () => {}; }, saveMeta: async (uid, id, data) => { await window.__meta(id, data); }, pullMeta: async () => ({ data: null }),
      shareId: () => sid, saveShare: async (id, data) => { await window.__share('set', id, data); }, dropShare: async id => { await window.__share('drop', id); },
    };
    D.state = 'ready'; D.err = '';
    onUser({ uid, email: 'beer@example.com', displayName: 'Beer', reload: async () => {} });
  }, [sid, uid]);
  return O;
}
const toTrade = async p => { await p.evaluate(() => { if (S.view !== 'home') showView('home'); }); await p.click('#btnColl'); await p.waitForSelector('.coll.on'); await p.click('#nav [data-nav="trade"]'); await p.waitForSelector('.tr-box'); };
const keysOf = (p, root) => p.$$eval(root + ' .bnd-sheet[data-pos="0"] .bnd-card', c => c.map(x => x.dataset.k));
const ind = (p, root) => p.$eval(root + ' .bnd-ind', e => e.textContent);
const shareD = id => JSON.parse(shares.get(id).d);
const SL = '.bnd-sheet[data-pos="0"] .bnd-card';
/** Pochettes de la page affichée : [clé, édition lue (« CMM 400 »), foil, « ×n », image (après /front/)]. */
const sleeves = (p, root) => p.$$eval(root + ' ' + SL, c => c.map(x => { const im = x.querySelector('img'); return [x.dataset.k, (/, ([0-9A-Z]{2,6} [^,]+?)(?:,|$)/.exec(x.getAttribute('aria-label')) || [])[1] || '', x.classList.contains('foil'), (x.querySelector('.bnd-q') || {}).textContent || '', im ? im.getAttribute('src').replace(/^.*\/front\//, '') : '']; }));
/** Regroupées par carte, dans leur ordre (l'ordre entre cartes suit les noms affichés). */
const perCard = list => [...new Set(list.map(x => x[0]))].sort().flatMap(k => list.filter(x => x[0] === k));
const sleevesAre = async (p, root, want) => { let got; for (let i = 0; i < 100; i++) { got = perCard(await sleeves(p, root)); if (JSON.stringify(got) === JSON.stringify(perCard(want))) break; await sleep(200); } return got; };
/** Carte en grand d'une pochette (clé, édition, foil) : image affichée et légende, une fois l'impression lue. */
async function bigOf(p, root, k, ed, foil, re) {
  const i = await p.$$eval(root + ' ' + SL, (c, [k, ed, foil]) => c.findIndex(x => x.dataset.k === k && x.getAttribute('aria-label').includes(ed) && x.classList.contains('foil') === foil), [k, ed, foil]);
  assert.ok(i >= 0, 'pochette ' + k + ' ' + ed); await (await p.$$(root + ' ' + SL))[i].click(); await p.waitForSelector('.imgv.on');
  await p.waitForFunction(r => new RegExp(r).test(document.querySelector('.imgv-img').getAttribute('src') || ''), re.source, { timeout: 8000 });
  return [await p.$eval('.imgv-img', m => m.getAttribute('src').replace(/^.*\/front\//, '')), await txt(p, '.imgv-sub')];
}

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
  // foil : la pochette de l'exemplaire foil (voile qui glisse, pastille ✦, « Foil » lu) ; une langue en partie foil : deux pochettes, la foil juste après
  assert.deepEqual(await p.$$eval('.coll-main .bnd-sheet[data-pos="0"] .bnd-card.foil', c => c.map(x => x.dataset.k)), ['edgar markov'], 'seul Edgar Markov est foil');
  assert.ok(await p.$('.coll-main .bnd-card[data-k="edgar markov"] .bnd-fo') && !(await p.$('.coll-main .bnd-card[data-k="sol ring"] .bnd-fo')), 'pastille ✦');
  assert.match(await p.$eval('.coll-main .bnd-card[data-k="edgar markov"]', b => b.getAttribute('aria-label')), /^Edgar Markov, Foil, × 2/);
  assert.deepEqual(await p.$eval('.coll-main .bnd-card.foil .bnd-art', a => { const s = getComputedStyle(a, '::after'); return [s.animationName, s.mixBlendMode]; }), ['bndfoil', 'screen'], 'voile irisé qui glisse');
  assert.deepEqual(await p.evaluate(() => bndOwnItems([{ k: 'sol ring', n: 'Sol Ring', q: 4, u: 120, lines: [['fr', 2], ['fr|cmm|400*', 1], ['en', 1]] }], false).map(x => [x.l, x.q, !!x.foil])), [['fr', 2, false], ['fr', 1, true], ['en', 1, false]], 'foil d\'une langue : sa pochette après les autres');
  await p.waitForFunction(() => document.querySelectorAll('.coll-main .bnd-sheet[data-pos="0"] img.ok').length === 9, null, { timeout: 8000 }).catch(() => {});
  await shot(p, 'owner-foil', '.coll-main .bnd'); await shot(p, 'foil-card', '.coll-main .bnd-slot:has(.bnd-card.foil)');
}
assert.equal(await p.evaluate(() => localStorage.getItem('deckdeal:bndview:v1')), '{"o":"binder"}', 'choix gardé sur l\'appareil');
ok('section Échange : interrupteur sur la ligne des outils, classeur à la place de la liste (pastilles × et prix, foil), choix gardé');

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
  assert.deepEqual(d.have.filter(x => 'fo' in x).map(x => [x.n, x.q, x.fo]), [['Edgar Markov', 2, 2]], 'exemplaires foil publiés (fo), seulement pour la carte foil');
}
// aperçu du propriétaire : le classeur d'abord (il est réglé)
await p.click('.tr-box.on [data-act="trlink"]'); await p.waitForSelector('.sheet-wrap.open .trl-sheet [data-act="trview"]'); await p.waitForTimeout(450);      // Aperçu : feuille du lien (densite.js)
await p.click('.sheet-wrap.open [data-act="trview"]'); await p.waitForSelector('.pubv.on .bnd .bnd-card');
assert.deepEqual(await keysOf(p, '.pubv'), ORDER); assert.equal(await p.$eval('.pubv .bnd', e => e.dataset.cover), 'foret');
await p.click('.pubv .dv-back'); await p.waitForTimeout(400);
// une carte souhaitée de plus : l'onglet « Recherchées » du visiteur aussi en classeur
const w0 = writes;
await p.evaluate(() => { TR.wish['sol ring'] = { n: 'Sol Ring', q: 2 }; TR.wish['craterhoof behemoth'] = { n: 'Craterhoof Behemoth', q: 1 }; trChanged(); });
for (let i = 0; i < 60 && (writes === w0 || shareD('ShareBinder00001').want.length < 2); i++) await sleep(200);
assert.deepEqual(shareD('ShareBinder00001').want.map(x => x.n), ['Craterhoof Behemoth', 'Sol Ring'], 'recherchées : même tri (valeur), sans épingles');
ok('lien : réglages dans le champ d (aucune clé ajoutée), doublons publiés dans l\'ordre du classeur (foil compris), aperçu en classeur');

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
  assert.deepEqual(await V.p.$$eval('.pubv .bnd-card.foil', c => c.map(x => x.dataset.k)), ['edgar markov'], 'foil vu par le visiteur');
  // carte en grand
  await V.p.waitForFunction(() => document.querySelector('.pubv .bnd-card[data-k="craterhoof behemoth"] img.ok'), null, { timeout: 8000 });
  await V.p.click('.pubv .bnd-card[data-k="craterhoof behemoth"]'); await V.p.waitForSelector('.imgv.on');
  assert.equal(await txt(V.p, '.imgv-cap b'), 'Craterhoof Behemoth'); assert.equal(await txt(V.p, '.imgv-count'), '3 / 9', 'les voisines du classeur à portée de glissement');
  assert.ok(!(await V.p.$('.imgv-card.foil')), 'carte non foil : pas d\'étincelles');
  await V.p.keyboard.press('Escape'); await V.p.waitForTimeout(400);
  await V.p.click('.pubv .bnd-card[data-k="edgar markov"]'); await V.p.waitForSelector('.imgv.on .imgv-card.foil');
  assert.equal(await txt(V.p, '.imgv-extra'), '2 exemplaires · Foil ✦', 'carte en grand : foil (étincelles), « Foil ✦ » dans la légende');
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
  ok('visiteur : classeur du propriétaire (couleur, épingles, tri, foil), carte en grand (foil), filtres, recherchées, retour à la liste habituelle, choix gardé');
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
  await shot(V.p, 'pub-nav', '.pubv .bnd');
  // « Aller à la page » : 223 pages → curseur (page visée, sa 1re et sa dernière carte), − / +, « Aller à la page 100 »
  const at = n => V.p.waitForFunction(t => document.querySelector('.pubv .bnd-ind').textContent === t, n);
  const focused = cls => V.p.waitForFunction(c => document.activeElement && document.activeElement.matches(c), cls, { timeout: 3000 });
  assert.equal(await V.p.$eval('.pubv .bnd-ind', b => [b.getAttribute('aria-haspopup'), b.getAttribute('aria-label')].join(' | ')), 'dialog | Page 1 sur 223 · Aller à une page');
  await V.p.click('.pubv .bnd-ind'); await V.p.waitForSelector('.sheet-wrap.open .bnd-rg');
  assert.deepEqual([await txt(V.p, '.sheet-wrap.open .sheet-head h2'), await txt(V.p, '.sheet-wrap.open .sheet-head p')], ['Aller à la page', '223 pages']);
  await focused('.bnd-rg');
  assert.deepEqual([await txt(V.p, '.bnd-pkv b'), await txt(V.p, '.bnd-pkn'), await txt(V.p, '.bnd-pkgo'), await V.p.$eval('.bnd-pkgo', b => b.classList.contains('ghost'))], ['1', 'Card 0000 → Card 0008', 'Aller à la page 1', true], 'la page affichée');
  await V.p.$eval('.bnd-rg', r => { r.value = '100'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.deepEqual([await txt(V.p, '.bnd-pkv b'), await txt(V.p, '.bnd-pkn'), await txt(V.p, '.bnd-pkgo'), await V.p.$eval('.bnd-rg', r => r.getAttribute('aria-valuetext'))], ['100', 'Card 0891 → Card 0899', 'Aller à la page 100', 'Page 100 sur 223 · Card 0891']);
  await V.p.click('.bnd-pkc [data-st="1"]'); assert.equal(await txt(V.p, '.bnd-pkv b'), '101'); await V.p.click('.bnd-pkc [data-st="-1"]'); assert.equal(await txt(V.p, '.bnd-pkv b'), '100');
  await shot(V.p, 'pick-slider');
  await V.p.click('.bnd-pkgo'); await at('100 / 223'); assert.ok(!(await V.p.$('.sheet-wrap.open')), 'feuille fermée');
  assert.equal((await keysOf(V.p, '.pubv'))[0], 'card 0891', 'la page visée');
  assert.deepEqual(await V.p.$$eval('.pubv .bnd-sheet:not([data-pos="0"])', s => s.map(x => x.dataset.pos + ':' + x.querySelector('.bnd-card').dataset.k).sort()), ['-1:card 0882', '1:card 0900'], 'ses voisines prêtes à glisser');
  assert.ok(await V.p.$$eval('.pubv .bnd-card', c => c.length) <= 27, 'toujours trois feuilles');
  await V.p.click('.pubv .bnd-go.nx'); await at('101 / 223');
  // clavier : Entrée sur le numéro (curseur au focus), Fin, Entrée ; le focus revient au numéro ; Début et Fin sur le classeur
  await V.p.focus('.pubv .bnd-ind'); await V.p.keyboard.press('Enter'); await focused('.bnd-rg');
  await V.p.keyboard.press('End'); assert.equal(await txt(V.p, '.bnd-pkv b'), '223'); await V.p.keyboard.press('Enter'); await at('223 / 223');
  await focused('.pubv .bnd-ind');
  assert.ok(await V.p.$eval('.pubv .bnd-go.nx', b => b.disabled)); assert.equal(await V.p.$$eval('.pubv .bnd-sheet[data-pos="0"] .bnd-card', c => c.length), 2, 'dernière page : 2 000 = 222 × 9 + 2');
  await V.p.focus('.pubv .bnd-view'); await V.p.keyboard.press('Home'); await at('1 / 223');
  assert.equal(await V.p.$eval('.pubv .bnd-sr', s => s.textContent), 'Page 1 sur 223', 'page annoncée (lecteur d\'écran)');
  await V.p.keyboard.press('End'); await at('223 / 223'); await V.p.keyboard.press('Home'); await at('1 / 223');
  // 12 pages (filtre « card 19 » : Card 1900 à 1999) → une tuile par page (numéro, 1re carte), page affichée marquée, flèches, Entrée, Échap
  await V.p.fill('#pubF input', 'card 19'); await at('1 / 12');
  await V.p.click('.pubv .bnd-ind'); await V.p.waitForSelector('.sheet-wrap.open .bnd-pk');
  assert.equal(await V.p.$$eval('.bnd-pk', t => t.length), 12); assert.ok(!(await V.p.$('.sheet-wrap.open .bnd-rg')), 'pas de curseur');
  assert.deepEqual(await V.p.$$eval('.bnd-pk[aria-current="page"]', t => t.map(x => x.dataset.p)), ['0'], 'page affichée marquée');
  assert.deepEqual(await V.p.$$eval('.bnd-pk', t => t.slice(0, 2).map(x => [x.querySelector('b').textContent, x.querySelector('small').textContent, x.getAttribute('aria-label')])), [['1', 'Card 1900', 'Page 1 sur 12 · Card 1900'], ['2', 'Card 1909', 'Page 2 sur 12 · Card 1909']]);
  await focused('.bnd-pk[data-p="0"]');
  await shot(V.p, 'pick-grid');
  const cols = await V.p.$$eval('.bnd-pk', t => t.filter(x => x.offsetTop === t[0].offsetTop).length);
  assert.ok(cols >= 3 && cols < 12, 'plusieurs colonnes : ' + cols);
  await V.p.keyboard.press('ArrowRight'); await V.p.keyboard.press('ArrowDown'); await focused(`.bnd-pk[data-p="${1 + cols}"]`);
  await V.p.keyboard.press('ArrowLeft'); await V.p.keyboard.press('ArrowRight'); await focused(`.bnd-pk[data-p="${1 + cols}"]`);
  await V.p.keyboard.press('Enter'); await at((2 + cols) + ' / 12');
  assert.equal((await keysOf(V.p, '.pubv'))[0], 'card ' + (1900 + 9 * (1 + cols)), 'la page choisie');
  await V.p.click('.pubv .bnd-ind'); await V.p.waitForSelector('.sheet-wrap.open .bnd-pk');
  assert.deepEqual(await V.p.$$eval('.bnd-pk[aria-current="page"]', t => t.map(x => x.dataset.p)), [String(1 + cols)]);
  await V.p.click(`.bnd-pk[data-p="${2 + cols}"]`); await at((3 + cols) + ' / 12');      // page d'à côté : elle glisse, comme avec la flèche
  await V.p.click('.pubv .bnd-ind'); await V.p.waitForSelector('.sheet-wrap.open .bnd-pk'); await V.p.keyboard.press('Escape'); await V.p.waitForFunction(() => !document.querySelector('.sheet-wrap.open'));
  assert.ok(await V.p.$('.pubv.on'), 'Échap : la feuille seulement'); assert.equal(await ind(V.p, '.pubv'), (3 + cols) + ' / 12');
  await V.p.focus('.pubv .bnd-view'); await V.p.keyboard.press('Home'); await at('1 / 12');
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
  // « Aller à la page » : les deux pages affichées marquées ; une page choisie → la vue qui la contient
  await V.p.fill('#pubF input', 'card 19'); await V.p.waitForFunction(() => document.querySelector('.pubv .bnd-ind').textContent === '1–2 / 12');
  await V.p.click('.pubv .bnd-ind'); await V.p.waitForSelector('.sheet-wrap.open .bnd-pk');
  assert.deepEqual(await V.p.$$eval('.bnd-pk[aria-current="page"]', t => t.map(x => x.dataset.p)), ['0', '1'], 'deux pages face à face : les deux marquées');
  await shot(V.p, 'pick-wide');
  await V.p.click('.bnd-pk[data-p="8"]'); await V.p.waitForFunction(() => document.querySelector('.pubv .bnd-ind').textContent === '9–10 / 12');
  assert.equal(await V.p.$eval('.pubv .bnd-ind', b => b.getAttribute('aria-label')), 'Pages 9 et 10 sur 12 · Aller à une page');
  await V.p.focus('.pubv .bnd-view'); await V.p.keyboard.press('Home'); await V.p.waitForFunction(() => document.querySelector('.pubv .bnd-ind').textContent === '1–2 / 12');
  await V.p.fill('#pubF input', ''); await V.p.waitForFunction(() => document.querySelector('.pubv .bnd-ind').textContent === '1–2 / 223');
  await V.p.click('.pubv .bnd-go.nx'); await V.p.waitForFunction(() => document.querySelector('.pubv .bnd-ind').textContent === '3–4 / 223');
  await V.p.setViewportSize({ width: 390, height: 844 }); await V.p.waitForFunction(() => !document.querySelector('.pubv .bnd.spread') && document.querySelector('.pubv .bnd-ind').textContent === '3 / 223', null, { timeout: 4000 });
  await V.ctx.close();
  ok('2 000 cartes : 3 feuilles dans la page, flèches, clavier (Début, Fin), glisser (bords qui résistent), « Aller à la page » (curseur, tuiles, clavier), filtres, pochettes vides ; 1 carte ; grand écran à deux pages');
}

/* ── Visiteur : une langue en partie foil (fo < q) → deux pochettes ; partage d'avant (sans fo) : aucune foil ── */
shares.set('ShareBinderFoil1', { kind: 'trade', d: JSON.stringify({ at: Date.now(), have: [{ n: 'Sol Ring', q: 3, fo: 1, l: 'fr' }, { n: 'Ponder', q: 2 }, { n: 'Wrath of God', q: 2, fo: 2 }], want: [{ n: 'Llanowar Elves', q: 1, fo: 1 }] }) });
{
  const V = await newPage(browser, world, { goto: false }); errsOf.push(V.errs); await routeRest(V.p);
  await V.p.goto(world.url + '?p=ShareBinderFoil1'); await V.p.waitForSelector('.pubv.on');
  await V.p.click('#pubSub [data-v="have"]'); await V.p.click('#pubView [data-v="binder"]'); await V.p.waitForSelector('.pubv .bnd .bnd-card');
  assert.deepEqual(await V.p.$$eval('.pubv .bnd-sheet[data-pos="0"] .bnd-card', c => c.map(x => [x.dataset.k, x.classList.contains('foil'), (x.querySelector('.bnd-q') || {}).textContent || ''])),
    [['ponder', false, '×2'], ['sol ring', false, '×2'], ['sol ring', true, ''], ['wrath of god', true, '×2']], 'Sol Ring : 2 normales, puis 1 foil ; Wrath of God : toutes foil');
  assert.equal(await txt(V.p, '.bnd-cnt'), '3 cartes · 7 exemplaires', 'le compte ne change pas');
  await V.p.waitForFunction(() => document.querySelectorAll('.pubv .bnd-sheet[data-pos="0"] img.ok').length === 3, null, { timeout: 8000 }).catch(() => {});      // Ponder : inconnue du faux Scryfall (lettre seule)
  { const W0 = [['ponder', '', false, '×2', ''], ['sol ring', '', false, '×2', 'a/b/sol-ring.jpg'], ['sol ring', '', true, '', 'a/b/sol-ring.jpg'], ['wrath of god', '', true, '×2', 'a/b/wrath-of-god.jpg']];
    assert.deepEqual(await sleevesAre(V.p, '.pubv', W0), W0, 'partage d\'avant (sans e) : ni édition, image de la carte, comme avant'); }
  await shot(V.p, 'pub-split', '.pubv .bnd');
  await V.p.click('#pubSub [data-v="want"]'); await V.p.waitForFunction(() => document.querySelectorAll('.pubv .bnd-sheet[data-pos="0"] .bnd-card').length === 1);
  assert.ok(!(await V.p.$('.pubv .bnd-card.foil')), 'recherchées : jamais foil');
  await V.p.click('#pubSub [data-v="have"]'); await V.p.click('#pubView [data-v="list"]'); await V.p.waitForSelector('.pubv .pub-row');
  assert.deepEqual((await V.p.$$eval('.pubv .pub-row', r => r.map(x => [x.dataset.k, (x.querySelector('.tag.foil') || {}).textContent || '']))).sort(),
    [['ponder', ''], ['sol ring', '✦ Foil × 1'], ['wrath of god', '✦ Foil']], 'vue Liste : pastille foil (× n quand une partie seulement l\'est)');
  await V.ctx.close();
  ok('visiteur : une langue en partie foil en deux pochettes (la foil après), toutes foil en une, recherchées sans foil ; vue Liste : pastille foil');
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

/* ── Éditions : une pochette par impression, avec l'image de cette impression exacte (propriétaire : liste et classeur ; lien ; visiteur : liste, classeur, carte en grand) ── */
// Sol Ring CMM 400 : imprimé en français (faux Scryfall : world.eds) ; 2X2 101 (impression des « Illustrations » simulées) et M21 103 : en anglais seulement
world.eds['cmm|400'] = { n: 'Sol Ring', langs: ['fr'] }; world.setnum = { ...(world.setnum || {}), '2x2/101': { name: 'Sol Ring', printed: {} } };
const COLL_ED = ['1 Sol Ring *FR*', '2 Sol Ring (CMM) 400 *FR*', '1 Sol Ring (FOIL) (CMM) 400 *FR*', '2 Sol Ring (2X2) 101 *FR*', '2 Llanowar Elves *EN*', '2 Llanowar Elves (M21) 103 *EN*', '3 Arcane Signet'].join('\n');
const OWN_ED = [['sol ring', '2X2 101', false, '×2', 'en/ed-2x2-101.jpg'], ['sol ring', 'CMM 400', false, '×2', 'fr/ed-cmm-400.jpg'], ['sol ring', 'CMM 400', true, '', 'fr/ed-cmm-400.jpg'],
  ['llanowar elves', '', false, '', 'a/b/llanowar-elves.jpg'], ['llanowar elves', 'M21 103', false, '×2', 'en/ed-m21-103.jpg'], ['arcane signet', '', false, '×2', 'a/b/arcane-signet.jpg']];
{
  const O = await owner({ coll: COLL_ED, sid: 'ShareBinderEds01', uid: 'u-binder-ed' }), q = O.p;
  await toTrade(q); await q.waitForSelector('.tr-list .tr-row');
  // vue Liste : vignette d'une carte = l'impression de sa 1re ligne (FR 2X2 101 : l'image anglaise de cette impression, Scryfall n'a pas la française)
  await q.waitForFunction(() => /\/small\/front\/en\/ed-2x2-101\.jpg$/.test((document.querySelector('.tr-row[data-k="sol ring"] .thumb img') || { src: '' }).src), null, { timeout: 15000 });
  assert.deepEqual(await q.$$eval('.tr-list .tr-row', r => r.map(x => [x.dataset.k, x.dataset.e || ''])), [['arcane signet', ''], ['llanowar elves', ''], ['sol ring', '2x2|101']], 'vignettes : l\'impression de la 1re ligne de chaque carte');
  await q.waitForFunction(() => document.querySelectorAll('.tr-list .tr-row .thumb img.ok').length === 3, null, { timeout: 8000 }).catch(() => {});
  await shot(q, 'owner-editions-list', '.tr-list');
  await q.click('.tr-row[data-k="sol ring"] .thumb'); await q.waitForSelector('.imgv.on');
  await q.waitForFunction(() => /\/2x2\/101-en\.jpg$/.test(document.querySelector('.imgv-img').getAttribute('src') || ''), null, { timeout: 8000 });
  assert.match(await txt(q, '.imgv-sub'), /2X2 101.*Pas d'image française sur Scryfall : version anglaise/, 'liste : carte en grand de cette impression (anglaise, signalée)');
  await q.keyboard.press('Escape'); await q.waitForTimeout(400);
  // classeur : une pochette par langue et par édition (la foil juste après), image de l'impression exacte (française si Scryfall l'a) ; lignes sans édition : comme avant
  await q.click('#trView [data-v="binder"]'); await q.waitForSelector('.coll-main .bnd .bnd-card');
  assert.deepEqual(await sleevesAre(q, '.coll-main', OWN_ED), perCard(OWN_ED), 'pochettes du propriétaire');
  assert.ok(world.edLangQ.some(x => /\(set:cmm cn:400\)/.test(x) && /\(set:2x2 cn:101\)/.test(x) && /lang:fr$/.test(x)), 'images françaises des éditions : une recherche pour les deux');
  assert.ok(world.scry.some(x => /^POST \/cards\/collection/.test(x)), 'éditions lues par code et numéro');
  const [im0, cap0] = await bigOf(q, '.coll-main', 'sol ring', 'CMM 400', false, /\/cmm\/400-fr\.jpg$/);
  assert.ok(im0 === 'cmm/400-fr.jpg' && /CMM 400/.test(cap0) && world.scry.includes('GET /cards/cmm/400/fr'), 'carte en grand : la même impression, lue en français par l\'extension et le numéro');
  await q.keyboard.press('Escape'); await q.waitForTimeout(400);
  await q.waitForFunction(() => document.querySelectorAll('.coll-main .bnd-sheet[data-pos="0"] img.ok').length === 6, null, { timeout: 8000 }).catch(() => {});
  await shot(q, 'owner-editions', '.coll-main .bnd');
  // lien : une carte par langue et par édition (e), avec l'image de cette impression ; sans édition : comme avant (ni e, ni autre image)
  await q.click('[data-act="tron"]'); await q.waitForSelector('.tr-box.on');
  for (let i = 0; i < 40 && !shares.has('ShareBinderEds01'); i++) await sleep(150);
  const d = shareD('ShareBinderEds01'), by = n => d.have.filter(x => x.n === n);
  assert.deepEqual(by('Sol Ring').map(x => [x.l, x.e, x.q, x.fo || 0, x.i]), [['fr', '2x2/101', 2, 0, 'small/front/en/ed-2x2-101.jpg'], ['fr', 'cmm/400', 3, 1, 'small/front/fr/ed-cmm-400.jpg']], 'Sol Ring : deux éditions, deux cartes (foil comptées dans fo)');
  assert.deepEqual(by('Llanowar Elves').map(x => [x.l, x.e, x.q, x.i]), [['en', undefined, 1, 'small/front/a/b/llanowar-elves.jpg'], ['en', 'm21/103', 2, 'small/front/en/ed-m21-103.jpg']], 'sans édition puis édition');
  assert.deepEqual(by('Arcane Signet').map(x => [x.e, x.q]), [[undefined, 2]]);
  await O.ctx.close();
  ok('éditions (propriétaire) : une pochette par impression avec son image exacte (française si Scryfall l\'a, sinon l\'anglaise de cette impression), vignette de la liste et carte en grand de la même impression ; lien : e par carte');
}
{
  const V = await newPage(browser, world, { goto: false }); errsOf.push(V.errs); await routeRest(V.p);
  await V.p.goto(world.url + '?p=ShareBinderEds01'); await V.p.waitForSelector('.pubv.on');
  assert.equal(await V.p.$eval('#pubSub [data-v="have"]', b => b.textContent.replace(/\D+/g, '')), '3', 'onglet : cartes comptées par langue, comme avant');
  await V.p.click('#pubSub [data-v="have"]'); await V.p.waitForSelector('.pubv .pub-row');
  assert.equal(await txt(V.p, '.bnd-cnt'), '3 cartes · 10 exemplaires', 'le compte ne change pas');
  // vue Liste : une ligne par impression, son image et son édition
  assert.deepEqual(await V.p.$$eval('.pubv .pub-row', r => r.map(x => [x.dataset.k, x.dataset.e || '', ((x.querySelector('.thumb img') || { getAttribute: () => '' }).getAttribute('src') || '').replace(/^.*\/front\//, ''), [...x.querySelectorAll('.tag')].map(t => t.textContent).filter(t => /\d/.test(t)).join(' | ')])),
    [['arcane signet', '', 'a/b/arcane-signet.jpg', ''], ['llanowar elves', '', 'a/b/llanowar-elves.jpg', ''], ['llanowar elves', 'm21|103', 'en/ed-m21-103.jpg', 'M21 103'], ['sol ring', '2x2|101', 'en/ed-2x2-101.jpg', '2X2 101'], ['sol ring', 'cmm|400', 'fr/ed-cmm-400.jpg', 'CMM 400 | ✦ Foil × 1']], 'liste du visiteur');
  await V.p.waitForFunction(() => document.querySelectorAll('.pubv .pub-row .thumb img.ok').length === 5, null, { timeout: 8000 }).catch(() => {});
  await shot(V.p, 'pub-editions-list', '.pubv .pub-main');
  await V.p.click('.pubv .pub-row[data-e="cmm|400"]'); await V.p.waitForSelector('.imgv.on');
  await V.p.waitForFunction(() => /\/cmm\/400-fr\.jpg$/.test(document.querySelector('.imgv-img').getAttribute('src') || ''), null, { timeout: 8000 });
  await V.p.keyboard.press('Escape'); await V.p.waitForTimeout(400);
  // classeur : les mêmes pochettes que chez le propriétaire, dans le même ordre pour chaque carte, mêmes images
  await V.p.click('#pubView [data-v="binder"]'); await V.p.waitForSelector('.pubv .bnd .bnd-card');
  assert.deepEqual(await sleevesAre(V.p, '.pubv', OWN_ED), perCard(OWN_ED), 'pochettes du visiteur = celles du propriétaire');
  assert.equal(await txt(V.p, '.bnd-cnt'), '3 cartes · 10 exemplaires');
  const [im1, cap1] = await bigOf(V.p, '.pubv', 'sol ring', 'CMM 400', true, /\/cmm\/400-fr\.jpg$/);
  assert.ok(im1 === 'cmm/400-fr.jpg' && /CMM 400/.test(cap1) && await V.p.$('.imgv-card.foil'), 'carte en grand : cette impression, en français, foil');
  await shot(V.p, 'pub-edition-big');
  await V.p.keyboard.press('Escape'); await V.p.waitForTimeout(400);
  const [im2, cap2] = await bigOf(V.p, '.pubv', 'sol ring', '2X2 101', false, /\/2x2\/101-en\.jpg$/);
  assert.ok(im2 === '2x2/101-en.jpg' && /Pas d'image française sur Scryfall/.test(cap2), 'pas d\'image française : l\'anglaise de cette impression, signalée');
  await V.p.keyboard.press('Escape'); await V.p.waitForTimeout(400);
  await V.p.waitForFunction(() => document.querySelectorAll('.pubv .bnd-sheet[data-pos="0"] img.ok').length === 6, null, { timeout: 8000 }).catch(() => {});
  await shot(V.p, 'pub-editions', '.pubv .bnd');
  await V.ctx.close();
}
// partage trop gros (sans images) : le visiteur lit les impressions par l'extension et le numéro (dans la langue de la carte)
shares.set('ShareBinderEds02', { kind: 'trade', d: JSON.stringify({ at: Date.now(), have: [{ n: 'Sol Ring', q: 1, l: 'fr' }, { n: 'Sol Ring', q: 2, l: 'fr', e: 'cmm/400' }, { n: 'Sol Ring', q: 1, l: 'fr', e: '2x2/101', fo: 1 }], want: [] }) });
{
  const V = await newPage(browser, world, { goto: false }); errsOf.push(V.errs); await routeRest(V.p);
  const q0 = world.edLangQ.length;
  await V.p.goto(world.url + '?p=ShareBinderEds02'); await V.p.waitForSelector('.pubv.on');
  await V.p.click('#pubSub [data-v="have"]'); await V.p.click('#pubView [data-v="binder"]'); await V.p.waitForSelector('.pubv .bnd .bnd-card');
  const W = [['sol ring', '', false, '', 'a/b/sol-ring.jpg'], ['sol ring', 'CMM 400', false, '×2', 'fr/ed-cmm-400.jpg'], ['sol ring', '2X2 101', true, '', 'en/ed-2x2-101.jpg']];
  assert.deepEqual(await sleevesAre(V.p, '.pubv', W), W, 'impressions lues chez le visiteur : française pour CMM 400, anglaise pour 2X2 101 ; sans édition : comme avant');
  assert.ok(world.edLangQ.length > q0, 'images françaises cherchées par édition');
  assert.equal(await txt(V.p, '.bnd-cnt'), '1 carte · 4 exemplaires');
  await V.ctx.close();
  ok('éditions (visiteur) : liste et classeur avec les mêmes impressions que le propriétaire (même ordre, même compte), carte en grand de cette impression (française, ou anglaise signalée) ; partage sans images : impressions lues par l\'extension et le numéro');
}

for (const e of errsOf) assert.deepEqual(e, [], 'erreurs page : ' + e.join(' | '));
await browser.close(); world.stop();
console.log('BINDER E2E OK');
process.exit(0);
