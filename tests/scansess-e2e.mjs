// E2E : scan en cours gardé sur le téléphone et confirmation avant de le quitter (scansess.js). « Quitter le scan ? » (←, Retour, Échap) avec des cartes
// pas encore ajoutées : Continuer, Quitter (gardées), Tout effacer (Annuler) ; rien à demander quand le scan est vide ou après « Ajouter ». Session reprise
// à la réouverture et après un rechargement (appli fermée par Android) : cartes, quantités, éditions, liste « Prix », bandeau « Scan repris » et
// « Nouvelle session » (Annuler) ; un contexte par session (le lot ne reprend pas le scan de la collection) ; plus de 7 jours : oubliée. Rangement (« Ranger dans ») :
// gardé avec la session, vide à la séance suivante ; « Ajouter » sans rangement alors qu'il en existe : confirmation.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, toHome, rcGo } from './e2e-world.mjs';

const world = await startWorld({ port: 19520 });
Object.assign(world.psets, { 'Sol Ring': ['cmm', 'blb'], 'Arcane Signet': ['cmm'], 'Llanowar Elves': ['dsk'] });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const { p, errs } = await newPage(browser, world, { scdAsk: true });
const KEY = 'deckdeal:scansess:coll';
const add = (name, l = 'en') => p.evaluate(([name, l]) => scanAdd({ key: ownKey(name), name, score: 0.99, raw: name, card: l }, 1, false), [name, l]);
const settle = () => p.waitForFunction(() => SC.items.size && ![...SC.items.values()].some(x => x.es === 'load'), null, { timeout: 8000 });
const lines = () => p.evaluate(() => Object.fromEntries([...SC.items.values()].map(x => [x.key + (x.e ? ' ' + x.e : ''), x.q])));
const saved = () => p.evaluate(k => { const s = JSON.parse(localStorage.getItem(k) || 'null'); return s && Object.fromEntries(s.items.map(x => [x.key + (x.e ? ' ' + x.e : ''), x.q])); }, KEY);
const waitSaved = n => p.waitForFunction(([k, n]) => { const s = JSON.parse(localStorage.getItem(k) || 'null'); return s && s.items.reduce((a, x) => a + x.q, 0) === n && s.items.every(x => x.e) && s.items.length === SC.items.size; }, [KEY, n], { timeout: 4000 });      // éditions comprises
const open = async o => { await p.evaluate(o => openScan(o), o); await p.waitForSelector('.scan.on'); };
const shut = () => p.waitForFunction(() => !SC.el && !document.querySelector('.scan'), null, { timeout: 4000 });
const sheet = () => p.$eval('.sss-sheet', s => [s.querySelector('h2').textContent, (s.querySelector('.sheet-head p') || {}).textContent || '']).catch(() => null);
const band = () => p.$eval('.sc-resume', b => b.querySelector('small').textContent).catch(() => null);

await p.waitForTimeout(400); await toHome(p);

/* ── 1) Quitter avec des cartes : la question ; Continuer (bouton, Retour, Échap) ; Quitter les garde ───────────────────────────── */
await open(); await add('Sol Ring'); await add('Sol Ring'); await add('Arcane Signet'); await settle();
await p.waitForFunction(() => [...SC.items.values()].every(x => x.e), null, { timeout: 8000 });      // Arcane Signet : extension unique (CMM), le Sol Ring la prend
assert.deepEqual(await lines(), { 'sol ring cmm|200': 2, 'arcane signet cmm|200': 1 });
await waitSaved(3); assert.deepEqual(await saved(), { 'sol ring cmm|200': 2, 'arcane signet cmm|200': 1 }, 'scan enregistré sur l\'appareil à chaque changement');
assert.equal(await p.evaluate(k => /"shot"|"sig"/.test(localStorage.getItem(k)), KEY), false, 'jamais de photo ni d\'empreinte');
await p.click('.scan [data-act="close"]'); await p.waitForSelector('.sss-sheet');
assert.deepEqual(await sheet(), ['Quitter le scan ?', '3 cartes pas encore ajoutées'], '← : la question, le scan reste ouvert'); assert.ok(await p.$('.scan.on'));
assert.equal(await txt(p, '.sss-sheet .sheet-foot .btn:not(.ghost)'), 'Continuer le scan', 'bouton principal : rester');
await p.click('.sss-sheet [data-close].btn'); await p.waitForFunction(() => !document.querySelector('.sss-sheet'));
assert.ok(await p.$('.scan.on'), 'Continuer : le scan reste ouvert');
await p.evaluate(() => history.back()); await p.waitForSelector('.sss-sheet');
await p.evaluate(() => history.back()); await p.waitForFunction(() => !document.querySelector('.sss-sheet'));
assert.ok(await p.$('.scan.on'), 'Retour : la question, un 2e Retour la ferme et reste dans le scan');
await p.keyboard.press('Escape'); await p.waitForSelector('.sss-sheet'); await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sss-sheet'));
assert.ok(await p.$('.scan.on'), 'Échap : pareil');
await p.click('.scan [data-act="close"]'); await p.waitForSelector('.sss-sheet'); await p.click('.sss-sheet [data-ss="quit"]'); await shut();
assert.deepEqual(await saved(), { 'sol ring cmm|200': 2, 'arcane signet cmm|200': 1 }, 'Quitter : session gardée');
ok('quitter avec des cartes : « Quitter le scan ? » (←, Retour, Échap), Continuer reste, Quitter garde la session');

/* ── 2) Reprise : réouverture, puis appli fermée (page rechargée) ; bandeau jusqu'à la carte suivante ───────────────────────────── */
await open();
assert.deepEqual(await lines(), { 'sol ring cmm|200': 2, 'arcane signet cmm|200': 1 }, 'réouverture : cartes, quantités et éditions reprises');
assert.match(await band(), /^3 cartes · /, 'bandeau « Scan repris »'); assert.equal(await txt(p, '.sc-resume b'), 'Scan repris'); assert.match(await txt(p, '.sc-count'), /3 cartes/);
await p.reload(); await p.waitForTimeout(500); await toHome(p);
assert.equal(await p.evaluate(() => !!SC.el), false);
await open(); assert.deepEqual(await lines(), { 'sol ring cmm|200': 2, 'arcane signet cmm|200': 1 }, 'page rechargée scan ouvert (appli fermée par Android) : tout est là');
await add('Llanowar Elves'); await settle();
assert.equal(await band(), null, 'carte suivante : bandeau retiré');
assert.equal((await lines())['llanowar elves dsk|200'], 1, 'les éditions continuent (extension unique)'); await waitSaved(4);
ok('reprise : réouverture et page rechargée, cartes, quantités, éditions ; bandeau jusqu\'à la carte suivante');

/* ── 3) « Nouvelle session » : vide, Annuler rend les cartes ───────────────────────────────────────────────────────────────── */
await p.click('.scan [data-act="close"]'); await p.waitForSelector('.sss-sheet'); await p.click('.sss-sheet [data-ss="quit"]'); await shut();
await open(); await p.click('.sc-resume [data-act="ssnew"]');
assert.deepEqual([await lines(), await saved(), await band()], [{}, null, null], 'Nouvelle session : scan vide, session effacée');
assert.equal(await txt(p, '#toast'), 'Scan effacé Annuler'); await p.click('#toast .toast-act');
assert.deepEqual(await lines(), { 'sol ring cmm|200': 2, 'arcane signet cmm|200': 1, 'llanowar elves dsk|200': 1 }, 'Annuler : cartes rendues'); await waitSaved(4);
ok('« Nouvelle session » : scan vidé, Annuler rend les cartes');

/* ── 4) Tout effacer et quitter (Annuler), scan vide sans question, « Ajouter » efface la session ──────────────────────────────── */
await p.click('.scan [data-act="close"]'); await p.waitForSelector('.sss-sheet'); await p.click('.sss-sheet [data-ss="del"]'); await shut();
assert.equal(await saved(), null, 'Tout effacer : session effacée'); await p.click('#toast .toast-act');
assert.deepEqual(await saved(), { 'sol ring cmm|200': 2, 'arcane signet cmm|200': 1, 'llanowar elves dsk|200': 1 }, 'Annuler : session rendue');
await open(); assert.equal(Object.keys(await lines()).length, 3);
await p.click('.sc-head [data-act="done"]'); await p.waitForSelector('.rc-sheet'); await rcGo(p); await shut();
assert.equal(await saved(), null, 'Ajouter : session effacée'); assert.deepEqual(await p.evaluate(() => [collQty('sol ring'), collQty('arcane signet'), collQty('llanowar elves')]), [2, 1, 1]);
await open(); assert.deepEqual([await lines(), await band()], [{}, null], 'après Ajouter : nouveau scan vide');
await p.click('.scan [data-act="close"]'); await shut(); assert.equal(await p.$('.sss-sheet'), null, 'scan vide : fermé sans question');
ok('Tout effacer et quitter (Annuler), « Ajouter » efface la session, scan vide fermé sans question');

/* ── 5) Liste « Prix » gardée ; un contexte par session ; plus de 7 jours : oubliée ─────────────────────────────────────────── */
await open(); await p.evaluate(() => { scanPriceMode(true); scanPriceAdd({ key: ownKey('Sol Ring'), name: 'Sol Ring', score: 0.99, raw: 'Sol Ring', card: 'en' }); });
await p.waitForFunction(() => SC.pq.length === 1 && Number.isFinite(SC.pq[0].cm), null, { timeout: 8000 });
await p.click('.scan [data-act="close"]'); await p.waitForSelector('.sss-sheet'); assert.deepEqual(await sheet(), ['Quitter le scan ?', '1 prix lu']);
await p.click('.sss-sheet [data-ss="quit"]'); await shut();
await open(); await p.evaluate(() => scanPriceMode(true));
assert.deepEqual(await p.evaluate(() => SC.pq.map(e => [e.name, Number.isFinite(e.cm)])), [['Sol Ring', true]], 'liste « Prix » reprise, prix gardé'); assert.match(await band(), /^1 prix lu · /);
await p.click('.scan [data-act="close"]'); await p.waitForSelector('.sss-sheet'); await p.click('.sss-sheet [data-ss="quit"]'); await shut();
await open({ lot: true }); assert.deepEqual([await lines(), await p.evaluate(() => SC.pq.length), await band()], [{}, 0, null], 'scan du lot : pas la session de la collection');
await add('Arcane Signet'); await settle(); await p.waitForFunction(() => localStorage.getItem('deckdeal:scansess:lot'));
await p.click('.scan [data-act="close"]'); await p.waitForSelector('.sss-sheet'); await p.click('.sss-sheet [data-ss="quit"]'); await shut();
assert.ok(await p.evaluate(k => localStorage.getItem(k), KEY), 'session de la collection intacte');
await p.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.at = Date.now() - 8 * 864e5; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
await open(); assert.deepEqual([await p.evaluate(() => SC.pq.length), await band(), await p.evaluate(k => localStorage.getItem(k), KEY)], [0, null, null], 'plus de 7 jours : oubliée');
await p.click('.scan [data-act="close"]'); await shut();
ok('liste « Prix » gardée, une session par contexte (collection, lot), oubliée après 7 jours');

/* ── 6) Rangement (« Ranger dans ») : gardé avec la session, remis à vide à la séance suivante ; « Ajouter » sans rangement : confirmation ─────────── */
// aucun emplacement : la question quand même (on apprend qu'on peut ranger), « Créer un emplacement » ; « Ne plus me demander » tant qu'il n'y en a aucun
assert.equal(await p.evaluate(() => scdHasPlaces()), false);
await open(); await add('Llanowar Elves'); await settle();
await p.click('.sc-head [data-act="done"]'); await p.waitForSelector('.rc-sheet'); await p.click('.rc-sheet [data-rc="go"]');
await p.waitForSelector('.rc-sheet .rc-quiet'); assert.match(await txt(p, '.rc-sheet .rc-ask'), /^Aucun rangement choisi\. Ajouter les cartes à ta collection sans emplacement \? Classeur, boîte/);
assert.deepEqual(await p.$$eval('.rc-sheet .sheet-foot .btn', b => b.map(x => x.textContent)), ['Créer un emplacement', 'Ajouter quand même']);
assert.equal(await txt(p, '.rc-sheet .rc-quiet'), 'Ne plus me demander (tant que je n\'ai pas d\'emplacement)');
await p.check('.rc-sheet .rc-quiet input'); await p.click('.rc-sheet [data-rc="pforce"]'); await shut();
assert.equal(await p.evaluate(() => localStorage.getItem('deckdeal:scdquiet')), '1', 'Ne plus me demander : retenu');
await open(); await add('Llanowar Elves'); await settle(); await p.click('.sc-head [data-act="done"]'); await p.waitForSelector('.rc-sheet'); await p.click('.rc-sheet [data-rc="go"]'); await shut();
assert.equal(await p.evaluate(() => collQty('llanowar elves')), 3, 'plus de question tant qu\'il n\'y a aucun emplacement');
const box = await p.evaluate(() => plcCreate('box', 'Boîte rouge'));
assert.equal(await p.evaluate(() => scdAsk()), true, 'un emplacement existe : la question revient');
const dest = () => p.evaluate(() => [SCD.x, scdPlace(), !document.querySelector('.sc-dest').hidden]);
const placed = k => p.evaluate(k => collLines(COLL.map[k]).map(([g, q]) => [plcOf(g) ? plcName(plcOf(g)) : '', q]).sort(), k);
await open(); assert.deepEqual(await dest(), [false, '', false], 'nouvelle séance : rangement vide');
await add('Sol Ring'); await settle();
await p.evaluate(() => scdPick(scanPaintTools)); await p.click(`.plc-opt[data-p="${box}"]`);
assert.deepEqual(await dest(), [false, box, true]); await p.waitForFunction(id => (JSON.parse(localStorage.getItem('deckdeal:scansess:coll')) || {}).dest?.p === id, box);
await p.click('.scan [data-act="close"]'); await p.waitForSelector('.sss-sheet'); await p.click('.sss-sheet [data-ss="quit"]'); await shut();
await p.evaluate(() => scdReset(null));      // rangement changé ailleurs entre-temps
await open(); assert.deepEqual(await dest(), [false, box, true], 'séance reprise : son rangement');
await p.click('.sc-head [data-act="done"]'); await p.waitForSelector('.rc-sheet'); await rcGo(p); await shut();
assert.deepEqual(await placed('sol ring'), [['', 2], ['Boîte rouge', 1]], 'ajoutée dans la boîte (les 2 d\'avant : sans emplacement)');
await open(); assert.deepEqual(await dest(), [false, '', false], 'séance suivante : rangement remis à vide');
await add('Arcane Signet'); await settle();
await p.click('.sc-head [data-act="done"]'); await p.waitForSelector('.rc-sheet'); await p.click('.rc-sheet [data-rc="go"]');
await p.waitForSelector('.rc-sheet .rc-ask'); assert.equal(await txt(p, '.rc-sheet .rc-ask'), 'Aucun rangement choisi. Ajouter les cartes à ta collection sans emplacement ?', 'sans rangement : confirmation');
assert.deepEqual(await p.$$eval('.rc-sheet .sheet-foot .btn', b => b.map(x => x.textContent)), ['Choisir un rangement', 'Ajouter quand même']);
await p.click('.rc-sheet [data-rc="place"]'); await p.click(`.plc-opt[data-p="${box}"]`);
await p.waitForFunction(() => !document.querySelector('.rc-sheet .rc-ask') && document.querySelector('.rc-sheet [data-rc="go"]'));
assert.match(await txt(p, '.rc-sheet .rc-dest'), /Boîte rouge/, 'rangement choisi : plus de question');
await p.click('.rc-sheet [data-rc="go"]'); await shut();
assert.deepEqual(await placed('arcane signet'), [['', 1], ['Boîte rouge', 1]]);
await open(); assert.deepEqual(await dest(), [false, '', false]); await add('Llanowar Elves'); await settle();
await p.click('.sc-head [data-act="done"]'); await p.waitForSelector('.rc-sheet'); await p.click('.rc-sheet [data-rc="go"]'); await p.waitForSelector('.rc-sheet [data-rc="pforce"]');
await p.click('.rc-sheet [data-rc="pforce"]'); await shut();
assert.deepEqual(await placed('llanowar elves'), [['', 4]], '« Ajouter quand même » : sans emplacement');
ok('rangement : gardé avec la session, remis à vide à la séance suivante ; « Ajouter » sans rangement : confirmation (créer ou choisir, ajouter quand même), « Ne plus me demander » tant qu\'il n\'y a aucun emplacement');

assert.deepEqual(errs, []);
await browser.close(); world.stop(); console.log('\nSCANSESS E2E OK'); process.exit(0);
