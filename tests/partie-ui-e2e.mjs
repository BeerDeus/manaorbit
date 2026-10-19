// E2E partie de Commander (interface) : carte de l'accueil, préparation avec invités (sans compte), compteur (3 affichages, ±1, ±10 maintenu, fiche d'un joueur),
// proposition d'élimination, menu « … », fin de partie (classement, QR code du résultat), Mes parties, lien ?partie= (c'était moi), lien ?table= sans compte.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, toHome } from './e2e-world.mjs';

const world = await startWorld({ port: 18928 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const { p, errs } = await newPage(browser, world);
const st = () => p.evaluate(() => PU.st);
const sheetTop = () => p.evaluate(() => { const s = sheets[sheets.length - 1]; return s ? s.wrap.querySelector('h2').textContent : ''; });
const closeSheets = () => p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); });

/* ── Accueil ─────────────────────────────────────────────────────────────────────────────────── */
await toHome(p); await p.waitForSelector('#hmPartie');
assert.equal(await p.evaluate(() => document.querySelector('#hmTrade').nextElementSibling.id), 'hmPartie', 'sous l\'Échange');
assert.equal(await p.evaluate(() => document.querySelector('#hmPartie').nextElementSibling.id), 'hmSets', 'au-dessus de Prochaines extensions');
assert.match(await txt(p, '#hmPartie'), /Partie de Commander Compteur de vie, jusqu'à 8 joueurs Nouvelle partie Mes parties/);
await p.$eval('#hmPartie', e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(300); await p.screenshot({ path: 'shots/partie-0-accueil.png' });
ok('accueil : carte sous l\'Échange, au-dessus de « Prochaines extensions »');

/* ── Préparation sans compte : invités ───────────────────────────────────────────────────────── */
await p.click('#hmPartie .hm-tr-acts [data-pu="go"]'); await p.waitForSelector('.pu.on .pu-setup');
assert.match(await txt(p, '.pu-qr'), /Connecte-toi pour que les autres rejoignent la table/);
assert.equal(await p.$eval('[data-pu="start"]', b => b.disabled), true, 'seul : pas de lancement');
for (const n of ['Léa', 'Paul', 'Zoé']) {
  await p.click('[data-pu="guest"]'); await p.waitForSelector('#puGn'); await p.fill('#puGn', n);
  if (n === 'Léa') await p.fill('#puGc', 'Atraxa, Praetors\' Voice');
  await p.click('.sheet [data-ok]'); await p.waitForFunction(n => [...document.querySelectorAll('.pu-seat b')].some(b => b.textContent.startsWith(n)), n);
}
assert.deepEqual(await p.$$eval('.pu-seat .pu-pos', x => x.map(e => e.textContent)), ['1', '2', '3', '4']);
await p.click('.pu-fmt [data-v="30"]'); assert.equal((await st()).format, 30);
await p.click('[data-pu="first"][data-pos="2"]'); assert.equal((await st()).premier, 2);
await p.screenshot({ path: 'shots/partie-1-preparation.png' });
assert.ok(await p.evaluate(() => partieLoad() && partieLoad().places.length === 4), 'préparation gardée sur l\'appareil');
await p.click('[data-pu="start"]'); await p.waitForSelector('.pu.pu-game .pu-a');
let s = await st(); assert.ok(s.debut > 0); assert.equal(s.actif, 2); assert.equal(s.places[0].vie, 30);
ok('préparation : 3 invités, 30 points, premier joueur, lancement');

/* ── Compteur A : ±1, ±10 maintenu, tuiles tournées ──────────────────────────────────────────── */
assert.deepEqual(await p.$$eval('.pu-t', t => t.map(x => x.style.getPropertyValue('--r'))), ['90deg', '270deg', '90deg', '270deg']);
await p.click('.pu-t[data-pos="3"] .pu-hit.m'); await p.click('.pu-t[data-pos="3"] .pu-hit.m'); await p.click('.pu-t[data-pos="3"] .pu-hit.p');
assert.equal((await st()).places[2].vie, 29); assert.equal(await txt(p, '.pu-t[data-pos="3"] .pu-dl'), '-1');
const box = await (await p.$('.pu-t[data-pos="1"] .pu-hit.m')).boundingBox();
await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up();
assert.equal((await st()).places[0].vie, 20, 'maintenu : −10');
await p.screenshot({ path: 'shots/partie-2-compteur-A.png' });
ok('compteur A : ±1 au toucher, −10 maintenu, chaque joueur tourné vers lui');

/* ── Fiche d'un joueur : blessures de commandant, poison, monarque ───────────────────────────── */
await p.click('.pu-t[data-pos="1"] .pu-nm'); await p.waitForSelector('.pu-sheet .pu-lifebig');
assert.equal(await sheetTop(), 'Moi');
for (let i = 0; i < 3; i++) await p.click('.pu-sheet [data-k="b"][data-s="2"][data-n="1"]');
await p.click('.pu-sheet [data-k="c"][data-c="poison"][data-n="1"]'); await p.click('.pu-sheet [data-mk="monarque"]');
s = await st(); assert.equal(s.places[0].blessures['2'], 3); assert.equal(s.places[0].vie, 17, 'blessures de commandant : autant de vie en moins'); assert.equal(s.places[0].compteurs.poison, 1); assert.equal(s.monarque, 1);
await p.screenshot({ path: 'shots/partie-3-fiche.png' });
await closeSheets();
assert.match(await txt(p, '.pu-t[data-pos="1"] .pu-tags'), /1.*3/); assert.deepEqual(await p.$$eval('.pu-t[data-pos="1"] .pu-tags use', l => l.map(u => u.getAttribute('href'))), ['#i-crown', '#i-poison', '#i-sword'], 'monarque, poison, blessures de commandant : icônes du sprite');
ok('fiche : blessures de commandant (et la vie), poison, monarque');

/* ── Proposition d'élimination, élimination ─────────────────────────────────────────────────── */
await p.evaluate(() => puSet(partieLife(PU.st, 4, -30)));
await p.waitForSelector('.pu-prop'); assert.match(await txt(p, '.pu-prop'), /Zoé n'a plus de points de vie/);
await p.click('.pu-prop [data-pu="elim"]'); await p.waitForSelector('.sheet [data-ok]'); await p.click('.sheet [data-ok]');
await p.waitForFunction(() => PU.st.places[3].elimine && !document.querySelector('.pu-prop'));
assert.equal(await p.$eval('.pu-t[data-pos="4"]', t => t.classList.contains('dead')), true);
ok('élimination proposée (jamais d\'office), puis faite');

/* ── Menu « … » : affichages B et C, tour suivant, annuler ───────────────────────────────────── */
await p.click('.pu-mid'); await p.waitForSelector('.pu-affs');
await p.click('.pu-affs [data-aff="B"]'); await p.waitForSelector('.pu-g.aff-B .pu-b');
assert.match(await txt(p, '.pu-bar'), /Tour 1 · Léa joue/);
await p.click('.pu-bar [data-pu="next"]'); s = await st(); assert.equal(s.actif, 3);
await p.screenshot({ path: 'shots/partie-4-compteur-B.png' });
await p.click('.pu-bar [data-pu="menu"]'); await p.waitForSelector('.pu-affs'); await p.click('.pu-affs [data-aff="C"]'); await p.waitForSelector('.pu-g.aff-C .pu-c');
await p.screenshot({ path: 'shots/partie-5-compteur-C.png' });
await p.click('.pu-bar [data-pu="menu"]'); await p.waitForSelector('[data-m="undo"]'); await p.click('[data-m="undo"]');
assert.equal((await st()).actif, 2, 'annuler : tour suivant défait');
assert.equal(await p.evaluate(() => localStorage.getItem('deckdeal:partie:aff')), 'C', 'affichage gardé');
await p.click('.pu-bar [data-pu="menu"]'); await p.waitForSelector('.pu-affs'); await p.click('.pu-affs [data-aff="A"]'); await p.waitForSelector('.pu-g.aff-A');
ok('menu « … » : trois affichages, tour suivant, annuler');

/* ── Pause, reprise depuis l'accueil ─────────────────────────────────────────────────────────── */
await p.click('.pu-mid'); await p.waitForSelector('[data-m="pause"]'); await p.click('[data-m="pause"]');
await p.waitForFunction(() => !document.querySelector('.pu'));
assert.match(await txt(p, '#hmPartie'), /En cours · tour 1 · 4 joueurs Reprendre/);
await p.click('#hmPartie .hm-tr-acts [data-pu="go"]'); await p.waitForSelector('.pu.pu-game');
ok('pause : reprise depuis l\'accueil');

/* ── Fin : vainqueur, classement, QR code du résultat, Mes parties ───────────────────────────── */
await p.click('.pu-mid'); await p.waitForSelector('[data-m="end"]'); await p.click('[data-m="end"]');
await p.waitForSelector('.pu-wins'); await p.click('.pu-wins [data-w="2"]'); await p.click('.sheet [data-ok]');
await p.waitForSelector('.pu-rank');
assert.deepEqual(await p.$$eval('.pu-rank li b', b => b.map(x => x.textContent)), ['Léa', 'Moi', 'Paul', 'Zoé']);

assert.ok(await p.$('.pu-qr-img svg'), 'QR code du résultat');
await p.screenshot({ path: 'shots/partie-6-fin.png' });
assert.equal(await p.evaluate(() => partieLoad()), null, 'partie en cours effacée');
const hist = await p.evaluate(() => partieHist()); assert.equal(hist.length, 1); assert.equal(hist[0].moi, 1);
await p.click('.pu-foot [data-pu="close"]'); await p.waitForFunction(() => !document.querySelector('.pu'));
await p.click('#hmPartie [data-pu="hist"]'); await p.waitForSelector('.pu-hist li');
assert.match(await txt(p, '.pu-hist'), /Moi, Léa, Paul, Zoé.*vainqueur : Léa.*1 tour/);
await closeSheets();
ok('fin : classement, QR code du résultat, Mes parties');

/* ── Lien ?partie= (résultat scanné) : c'était moi ───────────────────────────────────────────── */
const link = await p.evaluate(() => { const r = partieHist()[0]; return partieResultLink({ ...r, id: 'abcdefgh1234' }); });
const q = await newPage(browser, world, { path: link.slice(link.indexOf('?')) });
await q.p.waitForSelector('.pu-sheet [data-cl]', { timeout: 8000 });
await q.p.click('.pu-sheet [data-cl="3"]'); await q.p.waitForFunction(() => partieHist().length === 1);
assert.equal(await q.p.evaluate(() => partieHist()[0].moi), 3);
ok('lien du résultat : « c\'était moi » → Mes parties');

/* ── Lien ?table= sans compte : se connecter ou continuer en invité ──────────────────────────── */
const j = await newPage(browser, world, { path: '?table=ABCDEF' });
await j.p.waitForSelector('.pu-join.on');
await j.p.waitForFunction(() => /Table introuvable|Se connecter/.test(document.querySelector('.pu-join').textContent), null, { timeout: 8000 });
await j.p.screenshot({ path: 'shots/partie-7-rejoindre.png' });
ok('lien de la table : écran « Rejoindre la partie »');

const all = [...errs, ...q.errs, ...j.errs];
console.log('erreurs page :', all.length ? all : 'aucune'); assert.deepEqual(all, []);
await browser.close(); world.stop(); console.log('\nPARTIE UI E2E OK'); process.exit(0);
