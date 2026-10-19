// E2E emplacements, détails d'exemplaire, proxys : onglet Rangement, fiche d'un exemplaire, filtre, Mes proxys, deck monté rangé, « Ranger dans » du scan.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, toHome } from './e2e-world.mjs';

const world = await startWorld({ port: 18927 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const { p, errs } = await newPage(browser, world);
const top = () => p.evaluate(() => { const s = sheets[sheets.length - 1]; return s ? s.wrap.querySelector('h2').textContent : ''; });
const lines = k => p.evaluate(k => collLines(COLL.map[k]), k);

await p.evaluate(() => { COLL.map = collFromText('2 Sol Ring *FR*\n1 Arcane Signet (CMM) 380 *EN*'); collChanged(); });
await toHome(p); await p.click('#btnColl'); await p.waitForSelector('.coll.on');
await p.waitForFunction(() => document.querySelectorAll('.crow').length === 2);
assert.equal(await p.$('.crow .tag.plc'), null, 'rien de rangé : aucune étiquette');
assert.deepEqual(await p.$$eval('#collSeg .seg-opt', b => b.map(x => x.textContent)), ['Cartes', 'Rangement', 'Stats']);

/* ── Onglet Rangement : premier emplacement ─────────────────────────────────────────────────── */
await p.click('#collSeg [data-v="places"]'); await p.waitForSelector('.plc-prox');
assert.match(await txt(p, '.coll-main'), /Classeurs, boîtes, decks montés/); assert.match(await txt(p, '.plc-prox'), /Mes proxys Aucun proxy pour l'instant/);
await p.click('[data-act="plcnew"]'); await p.waitForSelector('#plcName');
await p.fill('#plcName', 'Classeur rouge'); await p.click('.sheet [data-ok]');
await p.waitForFunction(() => document.querySelectorAll('.plc-card:not([data-p=""])').length === 1);
const red = await p.evaluate(() => Object.keys(COLL.places)[0]);
assert.match(await txt(p, '.plc-card'), /Classeur Classeur rouge 0 carte/); assert.match(await txt(p, '.plc-card[data-p=""]'), /Non rangé 3 cartes/);
await p.screenshot({ path: 'shots/places-1-rangement.png' });
ok('Rangement : emplacement créé (classeur par défaut)');

/* ── Fiche d'un exemplaire : 1 des 2 Sol Ring rangé, état EX ─────────────────────────────────── */
await p.click('#collSeg [data-v="list"]'); await p.waitForFunction(() => document.querySelectorAll('.crow').length === 2);
await p.evaluate(() => cexSheet('map', 'sol ring', 'fr'));
await p.waitForSelector('.cex .cex-n');
assert.equal(await p.$eval('.cex-det', d => d.open), false, 'détails repliés');
await p.click('.cex [data-cn="-1"]'); assert.equal(await txt(p, '.cex-n b'), '1');
await p.click('.cex [data-pp]'); await p.waitForFunction(() => sheets.length === 2);
await p.click(`.plc-opt[data-p="${red}"]`); await p.waitForFunction(() => sheets.length === 1);
assert.match(await txt(p, '.cex .plc-cur'), /Classeur rouge/);
await p.click('.cex-det summary'); await p.click('.cex [data-cc="ex"]'); await p.click('.cex [data-cf="s"]');
await p.screenshot({ path: 'shots/places-2-exemplaire.png' });
await p.click('.cex [data-ok]'); await p.waitForFunction(() => !sheets.length);
assert.deepEqual(await lines('sol ring'), [['fr', 1], [`fr#p${red}-cex-s`, 1]]);
await p.waitForFunction(() => document.querySelectorAll('.crow').length === 3);
assert.deepEqual(await p.$$eval('.crow .tag.plc:not(.add)', t => t.map(x => x.textContent)), ['Classeur rougeEX · signée']);
assert.deepEqual(await p.$$eval('.crow .tag.plc.add', t => t.map(x => x.closest('.crow').dataset.k + ' ' + x.textContent)), ['arcane signet Ranger', 'sol ring Ranger'], 'un emplacement existe : « Ranger » discret sur les lignes non rangées');
await p.click('.crow[data-k="arcane signet"] .tag.plc.add'); await p.waitForSelector('.cex .plc-cur'); await p.click('.sheet-wrap.open [data-close]'); await p.waitForFunction(() => !sheets.length);
ok('exemplaire : 1 sur 2 rangé dans le classeur, état et signature (ligne à part, étiquette discrète)');

/* ── Filtre par emplacement, depuis le Rangement ───────────────────────────────────────────── */
await p.click('#collSeg [data-v="places"]'); await p.waitForSelector('.plc-card');
assert.match(await txt(p, `.plc-card[data-p="${red}"]`), /1 carte/); assert.match(await txt(p, '.plc-card[data-p=""]'), /Non rangé 2 cartes/);
await p.click(`.plc-card[data-p="${red}"]`); await p.waitForSelector('.plc-bar');
assert.equal(await p.$$eval('.crow', r => r.length), 1); assert.match(await txt(p, '.plc-pill'), /Classeur rouge · 1/);
await p.screenshot({ path: 'shots/places-3-filtre.png' });
await p.click('.plc-bar [data-act="plcclear"]'); await p.waitForFunction(() => document.querySelectorAll('.crow').length === 3 && !document.querySelector('.plc-bar'));
ok('filtre : l\'emplacement seul, puis toutes les cartes');

/* ── « Ranger… » : les exemplaires affichés d'un coup (filtres compris), Annuler, transfert d'un emplacement à l'autre ; fiche « Extension » du rangement ── */
const where = () => p.evaluate(() => Object.fromEntries(Object.entries(COLL.map).map(([k, x]) => [k, collLines(x).map(([g, q]) => `${q}${plcOf(g) ? '@' + plcName(plcOf(g)) : ''}`).sort().join(' ')])));
await p.click('#collSeg [data-v="places"]'); await p.click('.plc-card[data-p=""]'); await p.waitForSelector('.plc-bar .plc-mv');
await p.click('.coll .fbtn'); await p.click('.coll .fset'); await p.waitForSelector('.sheet-wrap.open .fs-row');
assert.deepEqual(await p.$$eval('.sheet-wrap.open .fs-row', l => l.map(r => r.dataset.c + ' ' + ((r.querySelector('em') || {}).textContent || ''))), [' 2', '- 1', 'cmm 1'], 'fiche « Extension » : seulement les extensions de « Non rangé », avec leurs cartes ici');
assert.match(await txt(p, '.sheet-wrap.open .sheet-head'), /1 extension dans « Non rangé »/);
await p.click('.sheet-wrap.open .fs-row[data-c="cmm"]'); await p.waitForFunction(() => document.querySelectorAll('.crow').length === 1);
await p.click('.plc-bar .plc-mv'); await p.waitForSelector('.sheet-wrap.open .plc-opt');
assert.match(await txt(p, '.sheet-wrap.open .sheet-head'), /Ranger 1 exemplaire\s*1 carte affichée, recherche et filtres compris/);
await p.click(`.sheet-wrap.open .plc-opt[data-p="${red}"]`); await p.waitForFunction(() => !sheets.length);
assert.deepEqual(await where(), { 'arcane signet': '1@Classeur rouge', 'sol ring': '1 1@Classeur rouge' }, 'seule l\'extension filtrée part (Sol Ring sans édition reste non rangé)');
assert.match(await txt(p, '#toast'), /1 exemplaire rangé dans « Classeur rouge »/);
await p.click('#toast .toast-act'); await p.waitForTimeout(200);
assert.deepEqual(await where(), { 'arcane signet': '1', 'sol ring': '1 1@Classeur rouge' }, 'Annuler : remis non rangé');
await p.click('.coll .freset'); await p.waitForFunction(() => document.querySelectorAll('.crow').length === 2);
await p.click('.plc-bar .plc-mv'); await p.waitForSelector('.sheet-wrap.open .plc-opt'); await p.click(`.sheet-wrap.open .plc-opt[data-p="${red}"]`); await p.waitForFunction(() => !sheets.length);
assert.deepEqual(await where(), { 'arcane signet': '1@Classeur rouge', 'sol ring': '1@Classeur rouge 1@Classeur rouge' }, 'tout le « Non rangé » affiché : rangé (le signé EX garde sa ligne)');
// transfert : tout le classeur rouge vers une boîte (le détail EX · signée suit l'exemplaire)
const blue = await p.evaluate(() => plcCreate('box', 'Boîte bleue'));
await p.evaluate(id => plcShow(id), red); await p.waitForSelector('.plc-bar .plc-mv');
await p.click('.plc-bar .plc-mv'); await p.waitForSelector('.sheet-wrap.open .plc-opt'); assert.match(await txt(p, '.sheet-wrap.open .sheet-head'), /Ranger 3 exemplaires/);
await p.click(`.sheet-wrap.open .plc-opt[data-p="${blue}"]`); await p.waitForFunction(() => !sheets.length);
assert.deepEqual(await where(), { 'arcane signet': '1@Boîte bleue', 'sol ring': '1@Boîte bleue 1@Boîte bleue' }, 'transfert : tout passe dans la boîte');
assert.ok((await lines('sol ring')).some(([g]) => /-cex-s$/.test(g)), 'détails gardés');
await p.screenshot({ path: 'shots/places-4-ranger.png' });
// tout remis comme avant la section (les suivantes comptent dessus) : le signé EX dans le classeur rouge, le reste non rangé
await p.evaluate(({ red }) => { COLL.map = collFromText('1 Sol Ring *FR*\n1 Arcane Signet (CMM) 380 *EN*'); collBump('sol ring', 'Sol Ring', 1, { lang: `fr#p${red}-cex-s` }); plcDelete(Object.keys(COLL.places).find(id => COLL.places[id].n === 'Boîte bleue')); COLL.place = ''; collChanged(); collPaintBody(true); }, { red });
assert.deepEqual(await lines('sol ring'), [['fr', 1], [`fr#p${red}-cex-s`, 1]]);
ok('« Ranger… » : les exemplaires affichés (filtre Extension compris) d\'un coup, Annuler, transfert du classeur vers une boîte (détails gardés) ; fiche « Extension » limitée au rangement ouvert');

/* ── « Retirer… » : les exemplaires affichés quittent la collection (ex. « Non rangé » : une ancienne copie fusionnée), confirmation, Annuler ── */
await p.evaluate(() => plcShow('')); await p.waitForSelector('.plc-bar .plc-rm');
await p.click('.plc-bar .plc-rm'); await p.waitForSelector('.sheet-wrap.open [data-ok]');
assert.match(await txt(p, '.sheet-wrap.open .sheet-head'), /Retirer 2 exemplaires de ta collection \?\s*2 cartes affichées, recherche et filtres compris/);
await p.click('.sheet-wrap.open [data-ok]'); await p.waitForFunction(() => !sheets.length);
assert.deepEqual(await where(), { 'sol ring': '1@Classeur rouge' }, '« Non rangé » vidé, l\'exemplaire rangé reste');
assert.match(await txt(p, '#toast'), /2 exemplaires retirés de ta collection/);
await p.click('#toast .toast-act'); await p.waitForTimeout(200);
assert.deepEqual(await where(), { 'arcane signet': '1', 'sol ring': '1 1@Classeur rouge' }, 'Annuler : tout remis');
assert.deepEqual(await lines('sol ring'), [['fr', 1], [`fr#p${red}-cex-s`, 1]], 'détails gardés');
await p.evaluate(() => { COLL.place = ''; collPaintBody(true); });
ok('« Retirer… » : les exemplaires affichés de « Non rangé » quittent la collection après confirmation, les rangés restent ; Annuler remet tout');

/* ── Enregistré avec la collection (même texte, lu par l'ancienne version) ───────────────────── */
const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:coll:v1')).t);
assert.match(stored, new RegExp(`^1 Sol Ring \\(DETAILS\\) p${red}-cex-s(?: \\(D[0-9a-z]+\\))? \\*FR\\*$`, 'm'));
assert.match(stored, new RegExp(`^//@L ${red} binder Classeur rouge$`, 'm'));
assert.equal(await p.evaluate(() => sameDoc(collDocFromText(collDocText(collDocNow())), collDocNow())), true);
ok('stockage : détails et emplacements dans le texte de la collection');

/* ── Mes proxys : à part, jamais dans la valeur ; « Vraie » ─────────────────────────────────── */
const copies0 = await p.evaluate(() => collCopies());
await p.click('#collSeg [data-v="places"]'); await p.click('[data-act="prox"]'); await p.waitForSelector('.prox-sheet');
await p.click('.prox-addw summary'); await p.fill('.prox-ta', '2 Mana Crypt\n1 Sol Ring'); await p.click('.prox-sheet [data-act="padd"]');
await p.waitForFunction(() => document.querySelectorAll('.prox-row').length === 2);
assert.equal(await p.evaluate(() => collCopies()), copies0, 'les proxys ne comptent pas dans la collection');
assert.equal(await p.evaluate(() => COLL.prox['mana crypt'].q), 2);
await p.screenshot({ path: 'shots/places-4-proxys.png' });
await p.click('.prox-row[data-k="mana crypt"] [data-act="real"]');
await p.waitForFunction(() => COLL.prox['mana crypt'].q === 1 && collQty('mana crypt') === 1);
await p.click('.prox-row[data-k="sol ring"] [data-d="-1"]'); await p.waitForFunction(() => !COLL.prox['sol ring']);
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); });
assert.match(await p.evaluate(() => collDocText(collDocNow())), /^\/\/@P 1 Mana Crypt/m);
ok('proxys : liste à part, « Vraie » passe un exemplaire dans la collection');

/* ── Deck monté : cartes à aller chercher, rangées dans « Deck : … », puis retour à leur place ─── */
await p.evaluate(() => plcFetchSheet({ id: 'deck1', name: 'Atraxa', text: '2 Sol Ring\n1 Arcane Signet\n1 Mana Crypt\n1 Doubling Season' }));
await p.waitForSelector('.fetch-sheet .fetch-g');
assert.match(await txt(p, '.fetch-sum'), /4 \/ 5 possédées · 1 manquante/);
assert.deepEqual(await p.$$eval('.fetch-gh b', b => b.map(x => x.textContent)), ['Classeur rouge', 'Non rangé']);
await p.click('.fetch-px input'); await p.waitForFunction(() => localStorage.getItem('deckdeal:fetchprox') === '1');
await p.click('.fetch-c input'); await p.waitForFunction(() => document.querySelector('.fetch-c.on'));
await p.screenshot({ path: 'shots/places-5-chercher.png' });
await p.click('.fetch-sheet [data-mount]');
const dk = await p.evaluate(() => plcDeckOf('deck1')); assert.ok(dk, 'emplacement du deck créé');
assert.equal(await p.evaluate(dk => COLL.places[dk].n + '|' + COLL.places[dk].t, dk), 'Atraxa|deck');
assert.deepEqual(await lines('sol ring'), [[`fr#p${dk}`, 1], [`fr#p${dk}-o${red}-cex-s`, 1]]);
assert.ok((await lines('arcane signet')).some(([g]) => g === `en|cmm|380#p${dk}`));
assert.equal(await p.evaluate(() => engIsOn('deck1')), true, 'deck monté (cartes réservées)');
await p.click('.fetch-sheet [data-un]'); await p.waitForFunction(() => !plcDeckOf('deck1'));
assert.deepEqual(await lines('sol ring'), [['fr', 1], [`fr#p${red}-cex-s`, 1]], 'retour au classeur');
assert.deepEqual(await lines('arcane signet'), [['en|cmm|380', 1]]);
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); });
ok('deck : à aller chercher par emplacement, monté (rangé, origine gardée), démonté (retour)');

/* ── « Ranger dans » du scan (réglages) ─────────────────────────────────────────────────────── */
await p.evaluate(() => scsSheet()); await p.waitForSelector('.scs [data-rcd]');
assert.match(await txt(p, '.scs [data-rcd]'), /Ranger dans Ma collection/);
await p.click('.scs [data-rcd]'); await p.waitForSelector('.plc-seg');
await p.click('.plc-seg [data-v="prox"]'); await p.click(`.plc-opt[data-p="${red}"]`);
await p.waitForFunction(() => SCD.x && SCD.p);
assert.match(await txt(p, '.scs [data-rcd]'), /Mes proxys · Classeur rouge/);
assert.equal(await p.evaluate(red => scdLine('fr', 'cmm|400') === `fr|cmm|400#p${red}`, red), true);
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); SCD.x = false; SCD.p = ''; scdSave(); });
ok('scan : « Ranger dans » proxys et emplacement, gardé sur l\'appareil');

/* ── Supprimer l'emplacement : ses cartes redeviennent non rangées ───────────────────────────── */
await p.click('#collSeg [data-v="places"]'); await p.click(`.plc-card[data-p="${red}"]`); await p.waitForSelector('.plc-bar');
await p.click('.plc-bar [data-act="plcedit"]'); await p.waitForSelector('.sheet [data-del]'); await p.click('.sheet [data-del]');
await p.waitForFunction(() => sheets.length === 2); assert.match(await top(), /Supprimer « Classeur rouge » \?/);
await p.click('.sheet-wrap:last-child .btn.danger'); await p.waitForFunction(() => !sheets.length && !Object.keys(COLL.places).length);
assert.deepEqual(await lines('sol ring'), [['fr', 1], ['fr#cex-s', 1]], 'détails gardés, emplacement retiré');
ok('suppression : cartes non rangées, détails gardés');

console.log('erreurs page :', errs.length ? errs : 'aucune'); assert.deepEqual(errs, []);
await browser.close(); world.stop(); console.log('\nPLACES E2E OK'); process.exit(0);
