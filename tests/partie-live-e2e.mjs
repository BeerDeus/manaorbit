// E2E compteur de vie, téléphones qui rejoignent la table : vrai proxy.mjs (/api/partie), faux Firebase (amis-fakes), trois navigateurs.
// · Compte qui arrive APRÈS l'ouverture du lien ?table= (SDK lent, session connue de l'appareil) : « Connexion à ton compte… », jamais l'écran de connexion, puis le choix
//   de la place ; « Se connecter » depuis l'écran : la feuille du compte se ferme d'elle-même une fois connecté, retour au choix de la place.
// · Partie en direct : Bob (compte) et Carol (invitée, 360 px) suivent la table (« Voir les points de vie », choix gardé) ; Bob fait −3 sur SA place (affiché tout de suite,
//   « Envoi… »), Alice (créateur) voit 37, puis Alice fait −1 et Bob voit 36 ; Bob ne peut rien changer aux autres places.
// · Co-hôtes : Carol demande, Alice accepte (feuille), Carol change les points d'Alice et passe au tour suivant, Alice le voit ; rôle retiré (menu « … ») ; « Tout le monde
//   est co-hôte » (menu « … », et à la préparation : gardé pour la fois suivante) ; saisie coupée par Alice.
// · Fin sans résultat : Alice abandonne (menu « … ») → « Partie abandonnée » chez Bob et Carol, place oubliée ; Alice supprime une partie en préparation → « Partie annulée » ;
//   partie effacée car trop vieille → raison reçue. Mode sombre, 360 px sans défilement horizontal.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, ok, signInFake, toHome } from './e2e-world.mjs';
import { startFakes } from './amis-fakes.mjs';

const F = await startFakes();
const world = await startWorld({ port: 19325, env: { ...F.env, ALERTS: '0' } });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const txt = (p, sel) => p.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim());
const closeSheets = p => p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); });
async function login(p, uid, name, o) {
  await p.evaluate(t => { window.__idTok = t; }, F.jwt(uid, 3 * 3600));
  await signInFake(p, { uid, email: uid + '@test.dev', displayName: name }, o);
  await p.evaluate(n => { PROF.name = n; profStore(); }, name);
}
/** o.late : SDK Firebase qui tarde (jamais chargé ici) et session connue de cet appareil (deckdeal:acct) : le compte arrive après l'ouverture du lien. */
async function page(path = '', o = {}) {
  const x = await newPage(browser, world, { path, ctx: o.ctx, goto: !o.late });
  if (o.late) {
    await x.p.route('https://www.gstatic.com/**', () => {});
    await x.p.addInitScript(() => { try { localStorage.setItem('deckdeal:acct', JSON.stringify({ l: 'B' })); } catch (e) { /* stockage absent */ } });
    await x.p.goto(world.url + path); await x.p.waitForTimeout(700);
  } else await x.p.route('https://www.gstatic.com/**', r => r.abort());
  return x;
}
const launch = (X, code) => X.p.evaluate(c => { history.replaceState(null, '', '?table=' + c); handleLaunch(); }, code);
const life = (X, pos) => X.p.$eval(`.pu-lv[data-lp="${pos}"] .pu-lv-life`, e => e.textContent.trim());
const hostLife = (pos) => A.p.evaluate(n => PU.st.places.find(p => p.pos === n).vie, pos);
async function newTable() {
  await toHome(A.p); await A.p.click('#hmPartie .hm-tr-acts [data-pu="go"]'); await A.p.waitForSelector('.pu.on .pu-qr-img svg', { timeout: 10000 });
  await A.p.waitForFunction(() => PU.view && PU.view.st === 'wait', null, { timeout: 10000 });
  return A.p.evaluate(() => partieRoom().c);
}
async function seat(X, code, pos, guest) {
  await launch(X, code);
  await X.p.waitForSelector(guest ? '.pu-join.on [data-j="guest"]' : `.pu-join.on [data-seat="${pos}"]`, { timeout: 10000 });
  if (guest) { await X.p.click('[data-j="guest"]'); await X.p.waitForSelector('#puJn'); await X.p.fill('#puJn', guest); }
  await X.p.click(`[data-seat="${pos}"]`); await X.p.click('[data-j="go"]'); await X.p.waitForSelector('.pu-wait', { timeout: 10000 });
}

/* ── Alice ouvre la table ; Bob, déjà connecté sur son téléphone, scanne le QR code avant que sa session soit revenue ─────────────────── */
const A = await page();
await login(A.p, 'uid-alice-live-e2e', 'Alice');
await A.p.waitForFunction(() => CTX.partie === true, null, { timeout: 8000 });
let code = await newTable();
const B = await page('?table=' + code, { late: true });
await B.p.waitForSelector('.pu-join.on .pu-load', { timeout: 10000 }); await B.p.waitForTimeout(1500);
assert.equal(await B.p.evaluate(() => D.authReady), false, 'session pas encore revenue');
assert.match(await txt(B.p, '.pu-join .pu-load'), /Connexion à ton compte/); assert.equal(await B.p.$('.pu-join [data-j="login"]'), null, 'jamais l\'écran de connexion pour un compte connu');
await B.p.screenshot({ path: 'shots/partie-live-1-compte.png' });
await B.p.evaluate(() => { D.localList = [{ id: 'dk-bob', name: 'Vampires', text: '1 Edgar Markov\n1 Sol Ring' }]; });
await login(B.p, 'uid-bob-live-e2e', 'Bob', { early: true });
await B.p.waitForSelector('.pu-join [data-seat="2"]', { timeout: 5000 });
assert.equal(await B.p.$('.pu-join [data-j="login"]'), null); assert.match(await txt(B.p, '.pu-j-me'), /Tu joues avec ton compte : Bob/);
assert.equal(await B.p.$eval('[data-seat="1"]', b => b.disabled), true, 'place d\'Alice prise');
ok('Bob : compte arrivé après l\'ouverture du lien : « Connexion à ton compte… », puis le choix de la place (jamais « Se connecter »)');

/* ── Dan, sans compte : « Se connecter » depuis l'écran ; connecté, la feuille du compte se ferme, retour au choix de la place ───────────── */
const Dn = await page('?table=' + code);
await Dn.p.waitForSelector('.pu-join.on [data-j="login"]', { timeout: 10000 });
await Dn.p.click('[data-j="login"]'); await Dn.p.waitForFunction(() => sheets.length === 1, null, { timeout: 5000 });
await login(Dn.p, 'uid-dan-live-e2e', 'Dan');
await Dn.p.waitForSelector('.pu-join [data-seat="4"]', { timeout: 5000 }); await Dn.p.waitForFunction(() => sheets.length === 0, null, { timeout: 5000 });
assert.equal(await Dn.p.$('.pu-join [data-j="login"]'), null);
await Dn.p.close();
ok('Dan : « Se connecter » depuis l\'écran de la table : la feuille du compte se ferme une fois connecté, choix de la place');

/* ── Bob prend la place 2 (deck gardé pour la fois suivante), Carol (invitée, 360 px) la 3 ; Alice lance ─────────────────────────────── */
await B.p.evaluate(() => { D.list = [{ id: 'dk-bob', name: 'Vampires', text: '1 Edgar Markov\n1 Sol Ring' }]; }); await B.p.waitForTimeout(100);
await B.p.click('[data-seat="2"]'); await B.p.waitForSelector('[data-j="deck"]'); await B.p.selectOption('[data-j="deck"]', 'dk-bob'); await B.p.click('[data-j="go"]');
await B.p.waitForSelector('.pu-wait', { timeout: 10000 });
assert.equal(await B.p.evaluate(() => puJoinPref().d), 'dk-bob', 'deck gardé pour la fois suivante');
assert.match(await txt(B.p, '.pu-wait'), /Range ton téléphone/); assert.equal(await B.p.$('[data-j="show"]'), null, 'pas encore lancée');
const C = await page('', { ctx: { viewport: { width: 360, height: 740 } } });
await seat(C, code, 3, 'Carol');
await A.p.waitForFunction(() => PU.st.places.length === 3, null, { timeout: 10000 });
await A.p.evaluate(() => puSet(partieFirst(PU.st, 1)));
await A.p.click('[data-pu="start"]'); await A.p.waitForSelector('.pu.pu-game', { timeout: 10000 });
for (const X of [B, C]) { await X.p.waitForSelector('[data-j="show"]', { timeout: 20000 }); assert.match(await txt(X.p, '.pu-wait'), /Range ton téléphone/, 'message gardé'); }
await B.p.click('[data-j="show"]'); await B.p.waitForSelector('.pu-lv[data-lp="1"]', { timeout: 10000 });
await C.p.click('[data-j="show"]'); await C.p.waitForSelector('.pu-lv[data-lp="1"]', { timeout: 10000 });
assert.equal(await B.p.evaluate(() => puJoinPref().live), true, 'choix gardé');
assert.deepEqual(await B.p.$$eval('.pu-lv', l => l.map(x => [x.dataset.lp, x.classList.contains('me')])), [['2', true], ['3', false], ['1', false]], 'ma place d\'abord, puis dans l\'ordre du tour');
assert.equal(await life(B, 2), '40'); assert.match(await txt(B.p, '.pu-lv-bar'), /Tour 1 · Alice joue/);
assert.equal(await B.p.$('.pu-lv[data-lp="1"] .pu-lv-b'), null, 'les autres places : en lecture');
assert.ok(await B.p.$('.pu-lv.me .pu-lv-b'), 'sa place : −1 / +1');
ok('partie lancée : « Range ton téléphone » gardé, « Voir les points de vie » (choix gardé) : toute la table, sa place d\'abord, les autres en lecture');

/* ── Bob : −3 sur sa place ; Alice voit 37 ; Alice −1 ; Bob voit 36 ─────────────────────────────────────────────────────────────── */
for (let i = 0; i < 3; i++) { await B.p.click('.pu-lv.me .pu-lv-b[data-lv="-1"]'); await B.p.waitForTimeout(60); }
assert.equal(await life(B, 2), '37', 'affiché tout de suite'); assert.match(await txt(B.p, '.pu-lv-st'), /Envoi/);
await A.p.waitForFunction(() => PU.st.places.find(p => p.pos === 2).vie === 37, null, { timeout: 15000 });
assert.equal(await A.p.evaluate(() => PU.st.journal.filter(e => e.a === 'v' && e.p === 2).reduce((a, e) => a + e.n, 0)), -3, 'appliqué une fois, dans le journal (annuler)');
await A.p.screenshot({ path: 'shots/partie-live-2-alice-37.png' });
await B.p.waitForFunction(() => /En direct/.test(document.querySelector('.pu-lv-st').textContent), null, { timeout: 15000 });
assert.equal(await life(B, 2), '37');
await A.p.evaluate(() => puLife(2, -1));
await B.p.waitForFunction(() => document.querySelector('.pu-lv[data-lp="2"] .pu-lv-life').textContent.trim() === '36', null, { timeout: 15000 });
await C.p.waitForFunction(() => document.querySelector('.pu-lv[data-lp="2"] .pu-lv-life').textContent.trim() === '36', null, { timeout: 15000 });
await B.p.screenshot({ path: 'shots/partie-live-3-bob-36.png' });
// sa fiche : blessures du commandant d'Alice reçues, poison
await B.p.click('.pu-lv.me [data-lvs]'); await B.p.waitForSelector('.pu-lvsheet [data-k="b"][data-s="1"][data-n="1"]');
for (let i = 0; i < 2; i++) await B.p.click('.pu-lvsheet [data-k="b"][data-s="1"][data-n="1"]');
await B.p.click('.pu-lvsheet [data-k="c"][data-c="poison"][data-n="1"]'); await closeSheets(B.p);
await A.p.waitForFunction(() => { const p = PU.st.places.find(x => x.pos === 2); return p.blessures['1'] === 2 && p.vie === 34 && p.compteurs.poison === 1; }, null, { timeout: 15000 });
// blessures de commandant plus rapides : +5 (et − / + maintenus) dans sa fiche aussi
await B.p.click('.pu-lv.me [data-lvs]'); await B.p.waitForSelector('.pu-lvsheet [data-k="b"][data-s="1"][data-n="5"]'); await B.p.click('.pu-lvsheet [data-k="b"][data-s="1"][data-n="5"]'); await closeSheets(B.p);
await A.p.waitForFunction(() => { const p = PU.st.places.find(x => x.pos === 2); return p.blessures['1'] === 7 && p.vie === 29; }, null, { timeout: 15000 });
ok('Bob −3 sur sa place : affiché tout de suite (« Envoi… »), Alice voit 37 (une fois, journal) ; Alice −1 : Bob et Carol voient 36 ; sa fiche : blessures reçues (+5), poison');

/* ── Dés : Alice lance un d20 et tire pile ou face ; Bob et Carol voient le résultat sur la table en direct ──────────────────────── */
await A.p.evaluate(() => puRoll('d20')); const d20 = await A.p.evaluate(() => PU.roll.v);
for (const X of [B, C]) {
  await X.p.waitForSelector('.pu-lv-de', { timeout: 15000 });
  assert.equal(await txt(X.p, '.pu-lv-de'), 'Dé à 20 faces' + d20, 'le même résultat chez ' + (X === B ? 'Bob' : 'Carol'));
}
await B.p.screenshot({ path: 'shots/partie-live-8-de-bob.png' });
await A.p.evaluate(() => { PU.roll = null; puRoll('pf'); }); const pf = await A.p.evaluate(() => (PU.roll.v ? 'Face' : 'Pile'));
await B.p.waitForFunction(t => /Pile ou face/.test(document.querySelector('.pu-lv-de').textContent) && document.querySelector('.pu-lv-de b').textContent === t, pf, { timeout: 15000 });
await B.p.click('.pu-lv-de'); await B.p.waitForFunction(() => !document.querySelector('.pu-lv-de'));      // jusqu'à un toucher, comme chez Alice
assert.ok(await C.p.$('.pu-lv-de'), 'fermé chez Bob seulement');
await A.p.evaluate(() => { PU.roll = null; puPaint(); });
ok('dés et pièce : le résultat d\'Alice arrive sur la table en direct de Bob et Carol (état en direct, champ de), affiché jusqu\'à un toucher');

/* ── Co-hôte : Carol demande, Alice accepte ; Carol change les points d'Alice, passe au tour suivant ; rôle retiré ─────────────────── */
await C.p.click('[data-j="ask"]'); await C.p.waitForSelector('.pu-co-wait');
await A.p.waitForSelector('.sheet.open.pu-ask, .pu-ask.open, .pu-ask', { timeout: 15000 }); assert.match(await txt(A.p, '.pu-ask'), /Carol demande à être co-hôte/);
await A.p.screenshot({ path: 'shots/partie-live-4-demande.png' });
await A.p.click('.pu-ask [data-ok]');
await C.p.waitForSelector('.pu-lv[data-lp="1"] .pu-lv-b', { timeout: 15000 });
assert.match(await txt(C.p, '.pu-lv.me .pu-lv-top'), /Co-hôte/); assert.ok(await C.p.$('[data-j="turn"]'), 'tour suivant');
await A.p.waitForFunction(() => /Co-hôte/.test(document.querySelector('.pu-t[data-pos="3"] .pu-tags').textContent), null, { timeout: 15000 });
for (let i = 0; i < 5; i++) { await C.p.click('.pu-lv[data-lp="1"] .pu-lv-b[data-lv="-1"]'); await C.p.waitForTimeout(40); }
await A.p.waitForFunction(() => PU.st.places.find(p => p.pos === 1).vie === 35, null, { timeout: 15000 });
await C.p.click('[data-j="turn"]'); await A.p.waitForFunction(() => PU.st.actif === 2, null, { timeout: 15000 });
await C.p.screenshot({ path: 'shots/partie-live-5-cohote-360.png' });
assert.equal(await B.p.$('.pu-lv[data-lp="1"] .pu-lv-b'), null, 'Bob, pas co-hôte : toujours en lecture');
await A.p.evaluate(() => puMenu()); await A.p.waitForSelector('.sheet [data-unco="3"]'); await A.p.click('.sheet [data-unco="3"]');
await C.p.waitForFunction(() => !document.querySelector('.pu-lv[data-lp="1"] .pu-lv-b'), null, { timeout: 15000 });
assert.ok(await C.p.$('[data-j="ask"]'), 'peut redemander');
ok('co-hôte : demande de Carol, acceptée par Alice (pastille sur la tuile), Carol change les points d\'Alice (35) et passe au tour suivant ; rôle retiré');

/* ── « Tout le monde est co-hôte » (menu « … ») ; saisie coupée ──────────────────────────────────────────────────────────────── */
await A.p.evaluate(() => puMenu()); await A.p.waitForSelector('#puMAllco'); await A.p.click('label[for="puMAllco"]'); await closeSheets(A.p);
await B.p.waitForSelector('.pu-lv[data-lp="1"] .pu-lv-b', { timeout: 15000 }); assert.equal(await B.p.$('[data-j="ask"]'), null, 'rien à demander');
await A.p.evaluate(() => puMenu()); await A.p.waitForSelector('#puMAllco:checked'); await A.p.click('label[for="puMAllco"]'); await closeSheets(A.p);
await B.p.waitForFunction(() => !document.querySelector('.pu-lv[data-lp="1"] .pu-lv-b'), null, { timeout: 15000 });
await A.p.evaluate(() => puMenu()); await A.p.waitForSelector('#puMLock:checked'); await A.p.click('label[for="puMLock"]'); await closeSheets(A.p);
await B.p.waitForFunction(() => !document.querySelector('.pu-lv.me .pu-lv-b') && /coupé la saisie/.test(document.querySelector('.pu-lv-why').textContent), null, { timeout: 15000 });
await A.p.evaluate(() => puSet(partieRemoteOff(PU.st, false))); await B.p.waitForSelector('.pu-lv.me .pu-lv-b', { timeout: 15000 });
ok('« Tout le monde est co-hôte » : Bob compte pour toute la table, plus de demande ; coupé : de nouveau sa place seule ; saisie coupée par Alice : message, plus de boutons');

/* ── Mode sombre, 360 px ; puis Alice abandonne : « Partie abandonnée » chez Bob et Carol, place oubliée ─────────────────────────── */
await C.p.emulateMedia({ colorScheme: 'dark' }); await C.p.waitForTimeout(300); await C.p.screenshot({ path: 'shots/partie-live-6-sombre-360.png' }); await C.p.emulateMedia({ colorScheme: 'light' });
for (const X of [B, C]) assert.equal(await X.p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, 'pas de défilement horizontal');
await A.p.evaluate(() => puMenu()); await A.p.waitForSelector('.sheet [data-m="drop"]'); await A.p.click('.sheet [data-m="drop"]');
await A.p.waitForSelector('.sheet [data-ok]'); assert.match(await txt(A.p, '.sheet .cf-msg'), /téléphones de la table sont prévenus/); await A.p.click('.sheet [data-ok]');
for (const X of [B, C]) {
  await X.p.waitForSelector('.pu-end', { timeout: 20000 });
  assert.match(await txt(X.p, '.pu-end'), /Partie abandonnée ?Alice a abandonné la partie : pas de résultat/); assert.equal(await X.p.evaluate(() => partieRoom()), null, 'place oubliée');
}
assert.equal(await B.p.evaluate(() => !!(PU.joinEl && document.querySelector('.pu-join .pu-lv'))), false);
await B.p.screenshot({ path: 'shots/partie-live-7-abandon.png' });
await B.p.click('.pu-foot [data-j="close"]'); await B.p.waitForFunction(() => !document.querySelector('.pu-join'));
ok('Alice abandonne (menu « … ») : Bob et Carol voient « Partie abandonnée », leur place est oubliée');

/* ── Préparation : « Tout le monde est co-hôte » (gardé pour la fois suivante), puis Alice supprime la partie : « Partie annulée » ─────── */
code = await newTable();
await A.p.click('label[for="puAllco"]'); await A.p.waitForFunction(() => PU.view.allco === 1, null, { timeout: 10000 });
assert.equal(await A.p.evaluate(() => localStorage.getItem('deckdeal:partie:allco')), '1');
await seat(B, code, 2);
assert.equal(await B.p.$('[data-j="ask"]'), null, 'co-hôte d\'office : rien à demander'); assert.equal(await B.p.evaluate(() => partieRoom() && 1), 1);
await A.p.waitForFunction(() => PU.st.places.length === 2, null, { timeout: 10000 });
await A.p.click('.pu-foot [data-pu="drop"]'); await A.p.waitForSelector('.sheet [data-ok]'); await A.p.click('.sheet [data-ok]');
await B.p.waitForSelector('.pu-end', { timeout: 20000 }); assert.match(await txt(B.p, '.pu-end'), /Partie annulée ?Alice a annulé la partie\./);
ok('préparation : « Tout le monde est co-hôte » gardé, Bob co-hôte d\'office ; Alice supprime la partie : « Partie annulée » chez Bob');

/* ── La table suivante reprend le réglage ; partie laissée de côté trop longtemps (effacée à l'accueil) : raison reçue ─────────────── */
await A.p.waitForFunction(() => !document.querySelector('.pu.on'), null, { timeout: 5000 });
code = await newTable(); assert.equal(await A.p.evaluate(() => PU.view.allco), 1, 'réglage repris');
await seat(B, code, 3);
await A.p.click('.dv-head [data-pu="close"]'); await A.p.waitForFunction(() => !document.querySelector('.pu.on'), null, { timeout: 5000 });
await A.p.evaluate(() => { localStorage.setItem(PRT_AT, JSON.stringify(Date.now() - 13 * 3600e3)); const s = partieLoad(); s.cree = Date.now() - 13 * 3600e3; partieSave(s); localStorage.setItem(PRT_AT, JSON.stringify(Date.now() - 13 * 3600e3)); puHomePaint(); });
await B.p.waitForSelector('.pu-end', { timeout: 20000 }); assert.match(await txt(B.p, '.pu-end'), /effacée du téléphone de Alice : laissée de côté trop longtemps/);
ok('partie trop vieille effacée à l\'accueil d\'Alice : Bob reçoit la raison');

const errs = [...A.errs, ...B.errs, ...C.errs].filter(e => !/gstatic|ERR_FAILED/.test(e));
console.log('erreurs page :', errs.length ? errs : 'aucune'); assert.deepEqual(errs, []);
await browser.close(); world.stop(); F.stop && F.stop(); console.log('\nPARTIE LIVE E2E OK'); process.exit(0);
