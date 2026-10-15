// E2E partie de Commander à plusieurs téléphones : vrai proxy.mjs (/api/partie), faux Firebase (amis-fakes), trois navigateurs.
// Alice (connectée) crée la partie : QR code de la table ; Bob ouvre ./?table=CODE sans compte → « Continuer en invité », place 3 ; Carol (connectée) prend la
// place 2 avec son deck ; Alice voit les deux téléphones, ajoute Dan (invité sans téléphone), lance la partie ; fin : Carol gagne ; le résultat arrive chez
// Bob et Carol (page restée ouverte), dans l'historique du compte d'Alice et de Carol (serveur), et dans « Mes parties » de chacun.
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

const errs = [...A.errs, ...B.errs, ...C.errs].filter(e => !/gstatic|ERR_FAILED/.test(e));
console.log('erreurs page :', errs.length ? errs : 'aucune'); assert.deepEqual(errs, []);
await browser.close(); world.stop(); F.stop && F.stop(); console.log('\nPARTIE ROOM E2E OK'); process.exit(0);
