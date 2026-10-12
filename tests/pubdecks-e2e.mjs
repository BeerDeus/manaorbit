// E2E decks publics (« Communauté ») : decks des joueurs ajoutés à « À monter » (type Communauté, pseudo de l'auteur, commandant inconnu d'EDHREC compris),
// feuille du deck (« deck de … », « Signaler ce deck » → masqué ici, un signalement par compte), publication depuis le viewer d'un deck de Mes decks
// (contrôles : commandant, 100 cartes, pseudo, 10 places), mise à jour, retrait, retrait avec le deck supprimé.
// Faux edh.tsv et fausse liste /api/pubdecks servis par des routes Playwright ; faux cloud (e2e-world › signInFake).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, signInFake } from './e2e-world.mjs';

const world = await startWorld({ port: 18956 }); world.basics = true;      // terrains de base connus du faux Scryfall (cartes vérifiées avant publication)
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const { p, errs } = await newPage(browser, world);

const filler = (n, from = 0, w = 'Filler') => Array.from({ length: n }, (_, i) => `K\t1\t${w} ${from + i}`);
const FILE = ['#edh\t1\t2026-10-03T04:00:00Z', 'C\tedgar-markov\t12345\tWBR\tEdgar Markov', 'C\tcraterhoof-behemoth\t100\tG\tCraterhoof Behemoth',
  'D\tedgar-markov\tedhrec\tDeck moyen\thttps://edhrec.com/average-decks/edgar-markov', 'K\t1\tSol Ring', 'K\t8\tPlains', ...filler(24),
  'D\tcraterhoof-behemoth\tedhrec\tDeck moyen\t', 'K\t1\tSol Ring', ...filler(22, 100), 'P\t150\tSol Ring'].join('\n');
await p.route('**/edh.tsv', r => r.fulfill({ status: 200, contentType: 'text/tab-separated-values; charset=utf-8', body: FILE }));
const H = 'b'.repeat(64), Z = 'c'.repeat(64);
let served = [
  { id: H + '_0', by: 'Bob', cmd: ['Edgar Markov'], ci: 'WBR', cards: [['Sol Ring', 1], ...Array.from({ length: 25 }, (_, i) => ['Bob Card ' + i, 1]), ['Plains', 73]], u: '2026-10-08' },
  { id: Z + '_3', by: 'Zed', cmd: ['Krenko, Mob Boss'], ci: 'R', cards: [...Array.from({ length: 30 }, (_, i) => ['Goblin ' + i, 1]), ['Mountain', 69]], u: '2026-10-09' },
];
const hits = [];
await p.route('**/api/pubdecks*', r => { hits.push(new URL(r.request().url()).search); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ at: Date.now(), decks: served }) }); });

await p.goto(world.url); await p.waitForFunction(() => CTX.proxy); await p.evaluate(() => { CTX.pub = true; });      // serveur de test sans compte de service : decks publics annoncés à la main
await signInFake(p);
await p.evaluate(() => profSave({ name: 'Max' }));

/* ── 1) « À monter » : decks de la communauté avec ceux d'EDHREC ──────────────────────────── */
await p.evaluate(() => navOpen(() => openCollection('decks'))); await p.waitForSelector('.crow.dk');
const dks = () => p.$$eval('.crow.dk', r => r.map(x => ({ name: x.querySelector('.row-name').firstChild.textContent.trim(), tags: [...x.querySelectorAll('.tag')].map(t => t.textContent.trim()) })));
let d = await dks();
assert.equal(d.length, 4, 'deux decks EDHREC + deux de la communauté');
const bob = d.find(x => x.tags.includes('Bob')), zed = d.find(x => x.tags.includes('Zed'));
assert.ok(bob && bob.name === 'Edgar Markov' && bob.tags.includes('Communauté'), JSON.stringify(d));
assert.ok(zed && zed.name === 'Krenko, Mob Boss' && zed.tags.includes('Communauté'), 'commandant absent d\'EDHREC : ajouté');
  assert.deepEqual(await p.$$eval('.crow.dk', r => r.filter(x => /Krenko/.test(x.textContent)).map(x => [!!x.querySelector('.dk-tier'), !!x.querySelector('.dk-rank')])), [[false, false]], 'ni tier ni rang EDHREC pour lui');
assert.deepEqual(hits, [''], 'liste lue une fois');
await p.click('[data-act="dfilt"]'); await p.waitForSelector('.dkf-sheet .dkf');
assert.ok(await p.$('.dkf-sheet .fopt[data-act="dkind"][data-k="comm"]'), 'type « Communauté » dans les filtres');
assert.equal(await p.$eval('.dkf-sheet [data-act="dkind"]', b => b.dataset.k), 'comm', 'en premier');
await p.click('.dkf-sheet .fopt[data-k="comm"]'); await p.click('.dkf-sheet .sheet-foot [data-close]'); await p.waitForFunction(() => !document.querySelector('.dkf-sheet'));
await p.waitForFunction(() => document.querySelectorAll('.crow.dk').length === 2);
await p.screenshot({ path: 'shots/pub-1-amonter.png' });
ok('À monter : decks de la communauté (type Communauté, pseudo de l\'auteur) avec ceux d\'EDHREC, commandant inconnu compris ; filtre « Communauté » en premier');

/* ── 2) feuille du deck : auteur, « Signaler ce deck » ──────────────────────────────────────── */
await p.$$eval('.crow.dk', r => r.find(x => [...x.querySelectorAll('.tag')].some(t => t.textContent.trim() === 'Bob')).click());
await p.waitForSelector('.sheet-wrap.open .dk-info');
await p.waitForTimeout(450); await p.screenshot({ path: 'shots/pub-3-feuille.png' });
assert.match(await txt(p, '.sheet-wrap.open .sheet-head p'), /Communauté · deck de Bob/);
assert.match(await txt(p, '.sheet-wrap.open .dk-info'), /^Communauté · deck de Bob · mis à jour/);
assert.match(await txt(p, '.sheet-wrap.open .dk-kinfo'), /publié par un joueur de Mana Orbit/);
await p.click('.sheet-wrap.open [data-act="dkrep"]'); await p.waitForSelector('.sheet-wrap.open [data-rep="go"]');
await p.click('.sheet-wrap.open [data-rep="go"]');
await p.waitForFunction(() => /signalé et masqué/.test(document.querySelector('#toast').textContent));
const tag = await p.evaluate(() => pdTag());
assert.deepEqual(await p.evaluate(() => window.__reps), [H + '_0~' + tag], 'signalement : deck + empreinte du compte');
await p.waitForFunction(() => document.querySelectorAll('.crow.dk').length === 1);
assert.deepEqual((await dks()).map(x => x.name), ['Krenko, Mob Boss'], 'deck signalé masqué ici');
assert.ok(await p.evaluate(h => JSON.parse(localStorage.getItem('deckdeal:pubhide:v1')).includes(h + '_0'), H));
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); });
// deuxième signalement du même deck par ce compte (autre appareil) : refusé par les règles, vu comme fait
await p.evaluate(h => openPubReport(h + '_0'), H); await p.waitForSelector('.sheet-wrap.open [data-rep="go"]'); await p.click('.sheet-wrap.open [data-rep="go"]');
await p.waitForFunction(() => /signalé et masqué/.test(document.querySelector('#toast').textContent) && !sheets.length);
ok('feuille d\'un deck de la communauté : « deck de Bob », signalé (une fois par compte) et masqué tout de suite sur cet appareil');
await p.evaluate(() => closeCollection()); await p.waitForTimeout(300);

/* ── 3) publier un deck de Mes decks depuis son viewer ──────────────────────────────────────── */
const deck = (extra = '') => 'Commander\n1 Edgar Markov\n\nDeck\n1 Sol Ring\n1 Arcane Signet\n30 Plains\n30 Swamp\n' + (extra || '37 Mountain');
const id = await p.evaluate(t => { const id = newIdFor(); putDeck(id, deckDoc({ name: 'Edgar de Max', text: t, opts: { ...S.opts } })); return id; }, deck());
await p.waitForFunction(i => !!findDeck(i), id);
await p.evaluate(i => openDeckViewer({ id: i }), id); await p.waitForSelector('.dv.on .dv-pubb');
assert.match(await txt(p, '.dv.on .dv-pubb'), /^Publier$/);
await p.click('.dv.on .dv-pubb'); await p.waitForSelector('.sheet-wrap.open .pub-checks');
await p.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open .pub-checks li.ok').length === 5, null, { timeout: 8000 });
await p.waitForFunction(() => /Toutes les cartes existent/.test(document.querySelector('.sheet-wrap.open .pub-checks').textContent), null, { timeout: 8000 });
assert.match(await txt(p, '.sheet-wrap.open .pub-checks'), /Commandant : Edgar Markov · WBR 100 cartes, commandant compris Toutes les cartes existent Publié sous le pseudo Max Modifier 0 \/ 10 decks publiés/);
await p.waitForTimeout(450); await p.screenshot({ path: 'shots/pub-2-publier.png' });
await p.click('.sheet-wrap.open [data-pub="go"]');
await p.waitForFunction(() => /Deck publié/.test((document.querySelector('.sheet-wrap.open .pub-msg') || {}).textContent || ''));
let pubs = await p.evaluate(() => [...window.__pubs]);
assert.equal(pubs.length, 1); assert.equal(pubs[0][0], tag + '_0', 'première place du compte');
assert.deepEqual({ ...pubs[0][1], updatedAt: 0 }, { o: tag, by: 'Max', deck: id, name: 'Edgar de Max', cmd: ['Edgar Markov'], ci: 'WBR', cards: ['1 Sol Ring', '1 Arcane Signet', '30 Plains', '30 Swamp', '37 Mountain'], updatedAt: 0, v: 1 });
assert.ok(hits.includes('?fresh=1'), 'liste relue tout de suite');
assert.deepEqual(await p.$$eval('.sheet-wrap.open .sheet-foot .btn', b => b.map(x => [x.textContent.trim(), x.disabled])), [['Retirer', false], ['✓ À jour', true]]);
assert.match(await txt(p, '.dv.on .dv-pubb'), /✓ Publié/);
ok('viewer › Publier : commandant (couleurs), 100 cartes, pseudo, places contrôlés ; document à la première place du compte, liste relue ; « ✓ Publié »');

// liste modifiée : « Mettre à jour » (même place)
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); closeDeckViewer(); });
await p.evaluate(([i, t]) => putDeck(i, deckDoc({ name: 'Edgar de Max', text: t, opts: { ...S.opts } })), [id, deck('36 Mountain\n1 Swords to Plowshares')]);
await p.waitForFunction(i => /Swords/.test(findDeck(i).text), id);
await p.evaluate(i => openDeckViewer({ id: i }), id); await p.waitForSelector('.dv.on .dv-pubb.on');
await p.click('.dv.on .dv-pubb'); await p.waitForSelector('.sheet-wrap.open .pub-state');
await p.waitForFunction(() => /la liste a changé depuis/.test(document.querySelector('.sheet-wrap.open .pub-state').textContent));
await p.waitForFunction(() => { const b = document.querySelector('.sheet-wrap.open [data-pub="go"]'); return b && !b.disabled && /Mettre à jour/.test(b.textContent); });
await p.click('.sheet-wrap.open [data-pub="go"]'); await p.waitForFunction(() => /Deck mis à jour/.test(document.querySelector('.sheet-wrap.open .pub-msg').textContent));
pubs = await p.evaluate(() => [...window.__pubs]); assert.equal(pubs.length, 1); assert.ok(pubs[0][1].cards.includes('1 Swords to Plowshares'));
// retirer
await p.click('.sheet-wrap.open [data-pub="drop"]'); await p.waitForFunction(() => /retiré de la communauté/.test(document.querySelector('.sheet-wrap.open .pub-msg').textContent));
assert.equal(await p.evaluate(() => window.__pubs.size), 0);
assert.deepEqual(await p.$$eval('.sheet-wrap.open .sheet-foot .btn', b => b.map(x => x.textContent.trim())), ['Publier']);
assert.match(await txt(p, '.dv.on .dv-pubb'), /^Publier$/);
ok('liste modifiée : « Mettre à jour » à la même place ; « Retirer » : le document part, « Publier » revient');

// 99 cartes : refusé ; 10 places prises : refusé
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); closeDeckViewer(); });
const id99 = await p.evaluate(t => { const i = newIdFor(); putDeck(i, deckDoc({ name: 'Court', text: t, opts: { ...S.opts } })); return i; }, deck('36 Mountain'));
await p.waitForFunction(i => !!findDeck(i), id99);
await p.evaluate(i => openDeckViewer({ id: i }), id99); await p.click('.dv.on .dv-pubb'); await p.waitForSelector('.sheet-wrap.open .pub-checks');
await p.waitForFunction(() => /0 \/ 10/.test(document.querySelector('.sheet-wrap.open .pub-checks').textContent));
assert.match(await txt(p, '.sheet-wrap.open .pub-checks li.ko'), /Il faut 100 cartes pile, commandant compris : ce deck en a 99/);
assert.equal(await p.$eval('.sheet-wrap.open [data-pub="go"]', b => b.disabled), true);
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); closeDeckViewer(); });
await p.evaluate(t => { for (let i = 0; i < 10; i++) window.__pubs.set(t + '_' + i, { o: t, deck: 'autre' + i, updatedAt: 1 }); PD.mine = null; }, tag);
await p.evaluate(i => openDeckViewer({ id: i }), id); await p.click('.dv.on .dv-pubb'); await p.waitForSelector('.sheet-wrap.open .pub-checks');
await p.waitForFunction(() => /10 \/ 10 decks publiés · retire-en un pour publier celui-ci/.test(document.querySelector('.sheet-wrap.open .pub-checks').textContent));
assert.equal(await p.$eval('.sheet-wrap.open [data-pub="go"]', b => b.disabled), true);
ok('99 cartes : « Il faut 100 cartes pile » ; 10 decks déjà publiés : « retire-en un », rien d\'envoyé');

// deck publié puis supprimé de Mes decks : sa copie publique part avec lui
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); closeDeckViewer(); });
await p.evaluate(t => { window.__pubs.delete(t + '_4'); PD.mine = null; }, tag);
await p.evaluate(i => openDeckViewer({ id: i }), id); await p.click('.dv.on .dv-pubb'); await p.waitForSelector('.sheet-wrap.open .pub-checks');
await p.waitForFunction(() => { const b = document.querySelector('.sheet-wrap.open [data-pub="go"]'); return b && !b.disabled; }, null, { timeout: 8000 });
await p.click('.sheet-wrap.open [data-pub="go"]'); await p.waitForFunction(() => /Deck publié/.test(document.querySelector('.sheet-wrap.open .pub-msg').textContent));
assert.equal(await p.evaluate(t => window.__pubs.get(t + '_4').deck, tag), id, 'première place libre (_4)');
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); closeDeckViewer(); });
await p.evaluate(i => removeDeck(i), id);
await p.waitForFunction(t => !window.__pubs.has(t + '_4'), tag);
assert.equal(await p.evaluate(() => window.__pubs.size), 9, 'les autres restent');
ok('place libre réutilisée (_4) ; deck supprimé de Mes decks : sa copie publique retirée');

// pseudo refusé par le filtre de mots ; carte au nom refusé
await p.evaluate(() => { PROF.name = 'Sal0pe'; }); await p.evaluate(i => openDeckViewer({ id: i }), id99);
await p.click('.dv.on .dv-pubb'); await p.waitForSelector('.sheet-wrap.open .pub-checks');
assert.match(await txt(p, '.sheet-wrap.open .pub-checks'), /Pseudo refusé pour la communauté : choisis-en un autre Modifier/);
assert.equal(await p.$eval('.sheet-wrap.open [data-pub="go"]', b => b.disabled), true);
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); closeDeckViewer(); PROF.name = 'Max'; });
const idBad = await p.evaluate(t => { const i = newIdFor(); putDeck(i, deckDoc({ name: 'Sale', text: t, opts: { ...S.opts } })); return i; }, deck('36 Mountain\n1 Fuck Yeah'));
await p.waitForFunction(i => !!findDeck(i), idBad);
await p.evaluate(i => openDeckViewer({ id: i }), idBad); await p.click('.dv.on .dv-pubb'); await p.waitForSelector('.sheet-wrap.open .pub-checks');
await p.waitForFunction(() => /Carte inconnue de Scryfall : « Fuck Yeah »/.test(document.querySelector('.sheet-wrap.open .pub-checks').textContent), null, { timeout: 8000 });
assert.match(await txt(p, '.sheet-wrap.open .pub-checks'), /Nom refusé dans la liste : « Fuck Yeah »/);
assert.equal(await p.$eval('.sheet-wrap.open [data-pub="go"]', b => b.disabled), true);
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); closeDeckViewer(); });
ok('filtre de mots : pseudo refusé, carte au nom refusé → publication bloquée, la raison affichée');

// sans pseudo : « Choisis d'abord un pseudo »
await p.evaluate(() => { PROF.name = ''; }); await p.evaluate(i => openDeckViewer({ id: i }), id99);
await p.click('.dv.on .dv-pubb'); await p.waitForSelector('.sheet-wrap.open .pub-checks');
assert.match(await txt(p, '.sheet-wrap.open .pub-checks'), /Choisis d'abord un pseudo Choisir/);
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); closeDeckViewer(); });
ok('sans pseudo : publication bloquée, « Choisir » ouvre le profil');

assert.deepEqual(errs, []);
await browser.close(); world.close?.();
console.log('\nPUBDECKS E2E OK');
process.exit(0);
