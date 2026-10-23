// E2E compteur de vie à plusieurs téléphones : vrai proxy.mjs (/api/partie), faux Firebase (amis-fakes), trois navigateurs.
// Alice (connectée) crée la partie : QR code de la table ; Bob ouvre ./?table=CODE sans compte → « Continuer en invité », place 3 ; Carol (connectée) prend la
// place 2 avec son deck ; Alice voit les deux téléphones, ajoute Dan (invité sans téléphone), lance la partie ; fin : Carol gagne ; le résultat arrive chez
// Bob et Carol (page restée ouverte), dans l'historique du compte d'Alice et de Carol (serveur), et dans « Mes parties » de chacun. Puis une partie Standard à 360 px : Alice choisit Standard (table de 2), Carol (compte) entre par le lien, Bob (invité) par le QR code : table complète, Alice ouvre une place de plus, Bob la prend ; résultat marqué Standard chez chacun.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, ok, signInFake, toHome } from './e2e-world.mjs';
import { startFakes, tag } from './amis-fakes.mjs';

const F = await startFakes();
const world = await startWorld({ port: 19320, env: { ...F.env, ALERTS: '0' } });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const UA = 'uid-alice-partie-e2e', UC = 'uid-carol-partie-e2e';
const txt = (p, sel) => p.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim());
async function login(p, uid, name) {
  await p.evaluate(t => { window.__idTok = t; }, F.jwt(uid, 3 * 3600));
  await signInFake(p, { uid, email: uid + '@test.dev', displayName: name });
  await p.evaluate(n => { PROF.name = n; profStore(); }, name);
}
async function page(path = '') {
  const x = await newPage(browser, world, { path });
  await x.p.route('https://www.gstatic.com/**', r => r.abort());      // pas de SDK Firebase : comptes simulés
  return x;
}
const hist = uid => { const d = F.fs.docs.get('parties/' + tag(uid)); return d ? JSON.parse(d.j).h : []; };

/* ── Alice crée la partie : table ouverte, QR code ───────────────────────────────────────────── */
const A = await page();
await login(A.p, UA, 'Alice');
await A.p.waitForFunction(() => CTX.partie === true, null, { timeout: 8000 });
await toHome(A.p); await A.p.click('#hmPartie .hm-tr-acts [data-pu="go"]');
await A.p.waitForSelector('.pu.on .pu-qr-img svg', { timeout: 10000 });
const code = await A.p.evaluate(() => partieRoom().c);
assert.match(code, /^[A-HJKMNP-Z2-9]{6}$/); assert.match(await txt(A.p, '.pu-qr-t'), new RegExp('Code : ' + code));
await A.p.screenshot({ path: 'shots/partie-room-1-table.png' });
ok('Alice : table ouverte, QR code ' + code);

/* ── Bob, sans compte : continuer en invité ──────────────────────────────────────────────────── */
const B = await page('?table=' + code);
await B.p.waitForSelector('.pu-join.on [data-j="guest"]', { timeout: 10000 });
assert.match(await txt(B.p, '.pu-join'), /Partie de Alice/); assert.ok(await B.p.$('.pu-join [data-j="login"]'), 'Se connecter proposé');
await B.p.screenshot({ path: 'shots/partie-room-2-invite.png' });
await B.p.click('[data-j="guest"]'); await B.p.waitForSelector('#puJn');
await B.p.fill('#puJn', 'Bob'); await B.p.fill('#puJc', 'Edgar Markov');
assert.equal(await B.p.$eval('[data-seat="1"]', b => b.disabled), true, 'place d\'Alice prise');
await B.p.click('[data-seat="3"]'); await B.p.click('[data-j="go"]');
await B.p.waitForSelector('.pu-wait', { timeout: 10000 });
assert.match(await txt(B.p, '.pu-wait'), /Tu es à la place 3/);
ok('Bob : invité, place 3, téléphone rangé');

/* ── Carol, connectée, avec son deck ─────────────────────────────────────────────────────────── */
const C = await page();
await login(C.p, UC, 'Carol');
await C.p.evaluate(() => { D.list = [{ id: 'dk-carol', name: 'Atraxa superfriends', text: '1 Atraxa, Praetors\' Voice\n1 Sol Ring' }]; });
await C.p.evaluate(c => { history.replaceState(null, '', '?table=' + c); handleLaunch(); }, code);
await C.p.waitForSelector('.pu-join.on [data-seat="2"]', { timeout: 10000 });
await C.p.click('[data-seat="2"]'); await C.p.selectOption('[data-j="deck"]', 'dk-carol'); await C.p.click('[data-j="go"]');
await C.p.waitForSelector('.pu-wait', { timeout: 10000 });
ok('Carol : connectée, place 2');

/* ── Alice voit les téléphones, ajoute Dan, lance ────────────────────────────────────────────── */
await A.p.waitForFunction(() => PU.st.places.length === 3, null, { timeout: 10000 });
assert.deepEqual(await A.p.evaluate(() => PU.st.places.map(p => [p.pos, p.sorte, p.nom])), [[1, 'moi', 'Alice'], [2, 'compte', 'Carol'], [3, 'invite', 'Bob']]);
assert.equal(await A.p.evaluate(() => PU.st.places[2].deck.commandant), 'Edgar Markov'); assert.equal(await A.p.evaluate(() => PU.st.places[1].deck.nom), 'Atraxa superfriends');
await A.p.click('[data-pu="guest"]'); await A.p.waitForSelector('#puGn'); await A.p.fill('#puGn', 'Dan'); await A.p.click('.sheet [data-ok]');
await A.p.waitForFunction(() => PU.st.places.length === 4 && PU.view && PU.view.places.length === 4, null, { timeout: 10000 });
await A.p.waitForFunction(() => document.querySelectorAll('.pu-dev.on').length >= 3, null, { timeout: 10000 });
await A.p.screenshot({ path: 'shots/partie-room-3-salle.png' });
await A.p.click('[data-pu="start"]'); await A.p.waitForSelector('.pu.pu-game', { timeout: 10000 });
assert.ok(await A.p.evaluate(() => /^[\w-]{20,}$/.test(PU.st.places.find(p => p.pos === 2).uid || '')), 'Carol : jeton du serveur');
await B.p.waitForFunction(() => /Partie en cours/.test(document.querySelector('.pu-wait').textContent), null, { timeout: 20000 });
ok('Alice : 3 téléphones et un invité ajouté, partie lancée (jeton de Carol), Bob voit « Partie en cours »');

/* ── Fin : Carol gagne ; le résultat arrive partout ──────────────────────────────────────────── */
await A.p.evaluate(() => { puSet(partieEliminate(PU.st, 1, 'vie')); puSet(partieEliminate(PU.st, 3, 'commandant', { par: 2 })); puSet(partieEliminate(PU.st, 4, 'abandon')); });
await A.p.evaluate(() => puEndSheet()); await A.p.waitForSelector('.pu-wins [data-w="2"][aria-pressed="true"]');
await A.p.click('.sheet [data-ok]'); await A.p.waitForSelector('.pu-rank');
await A.p.waitForFunction(() => partieQueue().length === 0, null, { timeout: 15000 });
assert.equal(hist(UA).length, 1); assert.equal(hist(UC).length, 1, 'historique du compte de Carol (serveur)');
assert.deepEqual(hist(UC)[0].places.filter(p => p.vainqueur).map(p => p.nom), ['Carol']);
for (const [X, me] of [[B, 3], [C, 2]]) {
  await X.p.waitForSelector('.pu-join .pu-rank', { timeout: 30000 });
  assert.equal(await X.p.evaluate(() => partieHist().length), 1); assert.equal(await X.p.evaluate(() => partieHist()[0].moi), me);
}
assert.match(await txt(B.p, '.pu-rank li.win'), /Carol/);
await B.p.screenshot({ path: 'shots/partie-room-4-resultat.png' });
ok('fin : résultat chez Bob (invité, sur son téléphone) et Carol, historique des comptes d\'Alice et Carol');

/* ── Partie Standard (360 px) : Alice choisit Standard (table de 2) ; Carol, connectée, rejoint par le lien de la table ; Bob, invité, scanne le QR code : table
   complète, Alice ouvre une place de plus, Bob la voit apparaître et la prend ; partie à 20 PV sans blessures de commandant ; résultat chez chacun, marqué Standard ── */
for (const X of [A, B, C]) await X.p.setViewportSize({ width: 360, height: 740 });
await A.p.click('.pu-foot [data-pu="close"]'); await A.p.waitForFunction(() => !document.querySelector('.pu'));
await A.p.click('#hmPartie .hm-tr-acts [data-pu="go"]'); await A.p.waitForSelector('.pu.on .pu-jeu');
await A.p.waitForFunction(() => partieRoom() && partieRoom().id === PU.st.id && PU.view && PU.view.st === 'wait', null, { timeout: 10000 });
await A.p.click('.pu-jeu [data-v="standard"]');
await A.p.waitForFunction(() => PU.view && PU.view.jeu === 'standard' && PU.view.format === 20 && PU.view.size === 2, null, { timeout: 10000 });
const code2 = await A.p.evaluate(() => partieRoom().c); assert.notEqual(code2, code);
assert.ok(await A.p.$('.pu-qr-img svg'), 'QR code de la table Standard'); assert.equal(await A.p.evaluate(() => PU.st.places[0].vie), 20);
ok('Alice : nouvelle partie, Standard en un appui (table de 2, 20 points, QR code ' + code2 + ')');

await C.p.evaluate(c => { history.replaceState(null, '', '?table=' + c); handleLaunch(); }, code2);
await C.p.waitForSelector('.pu-join.on [data-seat="2"]', { timeout: 10000 });
assert.match(await txt(C.p, '.pu-join .pu-card .pu-h'), /^Partie de Alice · Standard · 20 PV$/);
assert.deepEqual(await C.p.$$eval('.pu-places button', b => b.map(x => [x.dataset.seat, x.disabled])), [['1', true], ['2', false]], 'deux places, celle d\'Alice prise');
await C.p.click('[data-seat="2"]'); await C.p.click('[data-j="go"]'); await C.p.waitForSelector('.pu-wait', { timeout: 10000 });
assert.match(await txt(C.p, '.pu-wait'), /Tu es à la place 2/);
await C.p.screenshot({ path: 'shots/partie-room-5-standard-carol-360.png' });
ok('Carol (compte) : lien de la table, « Partie de Alice · Standard · 20 PV », place 2');

await B.p.evaluate(c => { history.replaceState(null, '', '?table=' + c); handleLaunch(); }, code2);
await B.p.waitForSelector('.pu-join.on [data-j="guest"]', { timeout: 10000 }); await B.p.click('[data-j="guest"]'); await B.p.waitForSelector('#puJc');
assert.equal(await txt(B.p, 'label[for="puJc"]'), 'Deck (facultatif)', 'Standard : le deck de l\'invité');
await B.p.fill('#puJn', 'Bob'); await B.p.fill('#puJc', 'Mono-vert');
assert.deepEqual(await B.p.$$eval('.pu-places button', b => b.map(x => x.disabled)), [true, true], 'table de 2 complète');
await A.p.waitForFunction(() => PU.st.places.length === 2 && document.querySelector('[data-pu="seat+"]'), null, { timeout: 10000 });
await A.p.screenshot({ path: 'shots/partie-room-6-standard-salle-360.png' });
await A.p.click('[data-pu="seat+"]'); await A.p.waitForFunction(() => PU.view.size === 3, null, { timeout: 10000 });
await B.p.waitForSelector('[data-seat="3"]:not([disabled])', { timeout: 15000 });
assert.equal(await B.p.$eval('#puJc', e => e.value), 'Mono-vert', 'saisie gardée quand la table est relue');
await B.p.click('[data-seat="3"]'); await B.p.click('[data-j="go"]'); await B.p.waitForSelector('.pu-wait', { timeout: 10000 });
ok('Bob (invité, QR code) : table complète, Alice ouvre une place de plus, Bob la voit et la prend (saisie gardée)');

await A.p.waitForFunction(() => PU.st.places.length === 3, null, { timeout: 10000 });
assert.deepEqual(await A.p.evaluate(() => PU.st.places.map(p => [p.pos, p.sorte, p.nom, p.vie, (p.deck || {}).nom || ''])), [[1, 'moi', 'Alice', 20, ''], [2, 'compte', 'Carol', 20, 'Atraxa superfriends'], [3, 'invite', 'Bob', 20, 'Mono-vert']]);      // Carol : son deck de la partie d'avant, gardé pour la fois suivante
await A.p.click('[data-pu="start"]'); await A.p.waitForSelector('.pu.pu-game', { timeout: 10000 });
assert.equal(await A.p.evaluate(() => PU.st.jeu), 'standard'); assert.ok(await A.p.evaluate(() => /^[\w-]{20,}$/.test(PU.st.places.find(p => p.pos === 2).uid || '')), 'Carol : jeton du serveur');
await A.p.click('.pu-t[data-pos="1"] .pu-nm'); await A.p.waitForSelector('.pu-sheet .pu-lifebig');
assert.equal(await A.p.$('.pu-sheet [data-k="b"]'), null, 'pas de blessures de commandant'); await A.p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); });
await A.p.screenshot({ path: 'shots/partie-room-7-standard-compteur-360.png' });
await A.p.evaluate(() => { puSet(partieEliminate(PU.st, 1, 'vie')); puSet(partieEliminate(PU.st, 3, 'poison')); });
await A.p.evaluate(() => puEndSheet()); await A.p.waitForSelector('.pu-wins [data-w="2"][aria-pressed="true"]');
await A.p.click('.sheet [data-ok]'); await A.p.waitForSelector('.pu-rank');
await A.p.waitForFunction(() => partieQueue().length === 0, null, { timeout: 15000 });
assert.deepEqual(hist(UC).map(x => [x.jeu || 'commander', x.format, x.moi]), [['standard', 20, 2], ['commander', 40, 2]], 'historique du compte de Carol : la partie Standard marquée');
assert.deepEqual([hist(UA)[0].jeu, hist(UA)[0].src], ['standard', 'h']);
for (const [X, me] of [[B, 3], [C, 2]]) {
  await X.p.waitForSelector('.pu-join .pu-rank', { timeout: 30000 });
  assert.deepEqual(await X.p.evaluate(() => [partieHist().length, partieHist()[0].jeu, partieHist()[0].format, partieHist()[0].moi]), [2, 'standard', 20, me]);
}
assert.match(await txt(B.p, '.pu-rank li.win'), /Carol/);
await B.p.screenshot({ path: 'shots/partie-room-8-standard-resultat-360.png' });
for (const X of [A, B, C]) assert.equal(await X.p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, '360 px : pas de défilement horizontal');
ok('Standard : partie à trois (20 PV, sans blessures de commandant), Carol gagne ; résultat chez Bob (invité) et Carol, historiques des comptes marqués Standard');

const errs = [...A.errs, ...B.errs, ...C.errs].filter(e => !/gstatic|ERR_FAILED/.test(e));
console.log('erreurs page :', errs.length ? errs : 'aucune'); assert.deepEqual(errs, []);
await browser.close(); world.stop(); F.stop && F.stop(); console.log('\nPARTIE ROOM E2E OK'); process.exit(0);
