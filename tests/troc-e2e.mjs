// E2E échange en direct (troc.js + /api/troc) : vrai proxy.mjs, faux Firebase (jetons signés, Firestore REST, FCM : amis-fakes), deux navigateurs.
// Alice crée l'échange depuis l'onglet Échange (QR code, code) et prépare ce qu'elle donne ; Bob ouvre ./?troc=<code> déconnecté (connexion d'abord,
// puis il entre tout seul) ; il demande une carte de la liste d'Alice et donne les siennes ; « Prêt » retiré à Bob quand Alice accepte (règle des RPG) ;
// « Équilibrer » ; les deux prêts → récapitulatif → les deux valident → chaque collection mise à jour (langue gardée), souhait comblé, « Mes échanges » ;
// « Annuler » chez Bob ; invitation d'un ami (page de l'ami › Échange en direct → notification FCM ./?troc=, toast « Rejoindre » par la liste des amis) ;
// départ (« Bob a quitté l'échange ») ; connexion perdue puis revenue ; mode streamer ; aucune erreur dans la console. Captures : TROC_SHOTS (dossier).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium, startWorld, newPage, ok, signInFake, closeSheets, toHome } from './e2e-world.mjs';
import { startFakes, tag } from './amis-fakes.mjs';

const F = await startFakes();
const DATA = mkdtempSync(join(tmpdir(), 'troc-e2e-'));
process.on('exit', () => { try { rmSync(DATA, { recursive: true, force: true }); } catch { /* ignore */ } });
// fichier de prix du serveur (celui de /prices.tsv, lu aussi par les deux appareils) : les mêmes valeurs chez les deux joueurs
writeFileSync(join(DATA, 'prices.tsv.gz'), gzipSync('#MOPX1 2026-10-12T09:00:00Z 6\nSol Ring\t120\t100\nLlanowar Elves\t25\t25\nArcane Signet\t60\t55\nEdgar Markov\t500\t480\nCraterhoof Behemoth\t900\t850\nWrath of God\t300\t280\n'));
const world = await startWorld({ port: 19310, env: { ...F.env, EDH_DATA_DIR: DATA, ALERTS: '0', TROC_AWAY_MS: '4000' } });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const SHOTS = process.env.TROC_SHOTS || ''; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p, name) => { if (SHOTS) { await p.waitForTimeout(500); await p.screenshot({ path: `${SHOTS}/${name}.png` }); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tc = (p, sel) => p.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim());
const T0 = Date.now(); process.on('exit', () => console.log('durée : ' + Math.round((Date.now() - T0) / 1000) + ' s'));
const UA = 'uid-alice-troc-e2e', UB = 'uid-bob-troc-e2e', TA = tag(UA), TB = tag(UB);
const seed = coll => `try { localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: ${JSON.stringify(coll)}, u: 1, s: '', b: null })); } catch (e) {}`;
const coll = p => p.evaluate(() => Object.fromEntries(Object.values(COLL.map).map(x => [x.n, collLines(x).map(([g, q]) => (g ? g + ':' : '') + q).join(',')])));
/** Compte connecté (faux cloud de e2e-world), jeton signé que le serveur vérifie. */
async function login(p, uid, name) {
  await p.evaluate(t => { window.__idTok = t; }, F.jwt(uid, 3 * 3600));
  await signInFake(p, { uid, email: uid + '@test.dev', displayName: name });
  await p.evaluate(n => { PROF.name = n; profStore(); }, name);
}
async function page(collText) {
  const x = await newPage(browser, world, { goto: false, init: seed(collText) });
  await x.p.route('https://www.gstatic.com/**', r => r.abort());      // pas de SDK Firebase : comptes simulés
  return x;
}
// Alice et Bob sont amis (documents du serveur, avant toute lecture : le serveur les garde 10 min) ; Bob a un appareil enregistré (jeton FCM)
const TOKB = 'eBob:APA91b' + 'z'.repeat(130);
{
  const now = Date.now(), doc = (n, f, d = []) => ({ j: JSON.stringify({ v: 1, n, p: '', l: 'fr', c: 0, s: '', f, i: {}, o: {}, x: {}, d, hk: [], wk: [], has: {}, w: null, r: null }), at: now });
  F.fs.docs.set('amis/' + TA, doc('Alice', { [TB]: now }));
  F.fs.docs.set('amis/' + TB, doc('Bob', { [TA]: now }, [{ k: 'dkb', sub: { fcm: TOKB }, l: 'fr', at: now }]));
}
const phase = (p, ph) => p.waitForSelector(`.dv.trc.on[data-ph="${ph}"]`, { timeout: 10000 });
const giveCount = p => p.evaluate(() => TRC.s ? TRC.s.me.give.reduce((t, x) => t + x.q, 0) : -1);

/* ── Alice : onglet Échange › « Échange en direct » › Créer ─────────────────────────────────────── */
const A = await page('5 Sol Ring *FR*\n3 Llanowar Elves *EN*\n2 Craterhoof Behemoth\n1 Wrath of God');
const pa = A.p;
await pa.goto(world.url); await pa.waitForTimeout(600);
await login(pa, UA, 'Alice');
await pa.waitForFunction(() => CTX.troc === true && COLL.live, null, { timeout: 10000 });
await toHome(pa); await pa.click('#btnColl'); await pa.waitForSelector('.coll.on');
await pa.click('#nav [data-nav="trade"]'); await pa.waitForSelector('.tr-box .trc-entry');
assert.match(await tc(pa, '.trc-entry'), /^Échange en direct\s*Face à face, chacun sur son téléphone$/);
await shot(pa, '01-onglet-echange');
await pa.click('.trc-entry'); await pa.waitForSelector('.trc-entry-sheet.open [data-trc="new"]');
assert.equal(await pa.$('.trc-entry-sheet [data-trc="hist"]'), null, 'pas encore d\'échange : pas de « Mes échanges »');
await shot(pa, '02-feuille-entree');
await pa.click('.trc-entry-sheet [data-trc="new"]'); await phase(pa, 'wait');
const CODE = await pa.evaluate(() => TRC.c);
assert.match(CODE, /^[A-HJKMNP-Z2-9]{6}$/);
assert.equal(await tc(pa, '.trc .trc-bigcode'), CODE.slice(0, 3) + ' ' + CODE.slice(3));
assert.ok(await pa.$('.trc .trc-qr .qr-img svg'), 'QR code de la session');
assert.equal(await tc(pa, '.trc .dv-title span'), 'En attente d\'un joueur');
// seule, elle prépare déjà ce qu'elle donne : un Sol Ring français de sa liste d'échange
await pa.click('.trc [data-trc="give"]'); await pa.waitForSelector('.trc-pick.open .trc-prow[data-k="sol ring"] .trc-ln[data-g="fr"]');
assert.deepEqual(await pa.$$eval('.trc-pick .trc-prow', r => r.map(x => x.dataset.k)), ['craterhoof behemoth', 'llanowar elves', 'sol ring'], 'sa liste d\'échange (réserve de 1)');
await pa.click('.trc-pick .trc-prow[data-k="sol ring"] .trc-ln[data-g="fr"]'); await pa.waitForFunction(() => TRC.s.me.give.length === 1);
await pa.waitForSelector('.trc-pick .trc-prow[data-k="sol ring"] .trc-ln.on[data-g="fr"]');
assert.match(await tc(pa, '.trc-pick .trc-prow[data-k="sol ring"] .trc-ln[data-g="fr"]'), /1\/4/);
await closeSheets(pa);
assert.match(await tc(pa, '.trc .trc-zone.give .trc-pu'), /1,20/, 'prix du serveur');
await shot(pa, '03-hote-qr');
ok('Alice : « Échange en direct » dans l\'onglet Échange, QR code et code de la session, ce qu\'elle donne préparé en attendant');

/* ── Bob : ouvre ./?troc=<code> déconnecté → connexion → entre tout seul ─────────────────────────── */
const B = await page('4 Arcane Signet *EN*\n2 Edgar Markov *DE*\n1 Command Tower');
const pb = B.p;
await pb.goto(world.url + '?troc=' + CODE.toLowerCase());
await pb.waitForSelector('.sheet-wrap.open [data-trc="login"]', { timeout: 10000 });
assert.match(await tc(pb, '.sheet-wrap.open .sheet-body'), /Connecte-toi pour échanger en direct/);
await shot(pb, '04-invite-connexion');
await closeSheets(pb);
await login(pb, UB, 'Bob');
await pb.evaluate(() => { TR.wish['sol ring'] = { n: 'Sol Ring', q: 1 }; trChanged(); });      // Bob cherche un Sol Ring
await phase(pb, 'live');
assert.equal(await tc(pb, '.trc .trc-who b'), 'Alice'); assert.equal(await tc(pb, '.trc .dv-title span'), 'avec Alice');
assert.match(await tc(pb, '.trc .trc-zone.get'), /Sol Ring|Anneau solaire/, 'il voit déjà ce qu\'Alice prépare');
await phase(pa, 'live');
await pa.waitForFunction(() => /Bob a rejoint l'échange/.test(document.querySelector('#toast').textContent));
assert.equal(await tc(pa, '.trc .trc-who b'), 'Bob');
ok('Bob : lien ./?troc= déconnecté → « Connecte-toi » → entre tout seul une fois connecté ; Alice : « Bob a rejoint l\'échange »');

/* ── Bob demande une carte de la liste d'Alice, donne les siennes ─────────────────────────────────── */
await pb.click('.trc [data-trc="ask"]'); await pb.waitForSelector('.trc-pick.open .trc-tabs');
assert.deepEqual(await pb.$$eval('.trc-pick .trc-prow', r => r.map(x => x.dataset.k)), ['sol ring'], 'onglet « Tu les cherches » : le Sol Ring de son souhait');
assert.match(await tc(pb, '.trc-pick .trc-prow[data-k="sol ring"]'), /tu la cherches × 1/);
await pb.click('.trc-pick .trc-tabs .seg-opt[data-v="all"]'); await pb.waitForSelector('.trc-pick .trc-prow[data-k="llanowar elves"]');
await shot(pb, '05-demander');
await pb.click('.trc-pick .trc-prow[data-k="llanowar elves"] .trc-ln[data-g="en"]'); await pb.waitForFunction(() => TRC.s.ot.give.some(x => x.n === 'Llanowar Elves' && x.r));
await closeSheets(pb);
await pb.click('.trc [data-trc="give"]'); await pb.waitForSelector('.trc-pick.open .trc-prow[data-k="arcane signet"] .trc-ln[data-g="en"]');
for (let i = 1; i <= 2; i++) { await pb.click('.trc-pick .trc-prow[data-k="arcane signet"] .trc-ln[data-g="en"]'); await pb.waitForFunction(n => TRC.s.me.give.reduce((t, x) => t + x.q, 0) === n, i); }
assert.match(await tc(pb, '.trc-pick .trc-prow[data-k="arcane signet"] .trc-ln[data-g="en"]'), /2\/3/, 'pastille : 2 donnés sur 3 en trop');
await pb.click('.trc-pick .trc-prow[data-k="edgar markov"] .trc-ln[data-g="de"]'); await pb.waitForFunction(() => TRC.s.me.give.length === 2);
await closeSheets(pb);
assert.deepEqual(await pb.evaluate(() => TRC.s.me.give.map(x => [x.n, x.q, x.g, x.u])), [['Arcane Signet', 2, 'en', 60], ['Edgar Markov', 1, 'de', 500]]);
ok('Bob : demande dans la liste d\'Alice (onglet « Tu les cherches » d\'abord), donne deux cartes de sa liste (prix de la session)');

/* ── « Prêt » retiré quand le contenu change ; demande acceptée ; « Équilibrer » ───────────────────── */
await pa.waitForSelector('.trc .trc-req [data-trc="acceptall"]');
assert.match(await tc(pa, '.trc .trc-req'), /Bob te demande 1 carte/);
assert.ok(await pa.$('.trc [data-trc="ready"][disabled]'), 'Alice : « Prêt » impossible tant qu\'une demande attend');
assert.ok(await pa.$('.trc .trc-card.pend[data-side="me"]'), 'carte demandée : en attente chez Alice');
await shot(pa, '06-demande-recue');
await pb.click('.trc [data-trc="ready"]'); await pb.waitForSelector('.trc [data-trc="ready"][aria-pressed="true"]');
await pa.waitForSelector('.trc .trc-who[data-st="ready"]'); assert.equal(await tc(pa, '.trc .trc-who small'), 'est prêt');
await pa.click('.trc [data-trc="acceptall"]'); await pa.waitForFunction(() => !TRC.s.me.give.some(x => x.r));
await pb.waitForSelector('.trc [data-trc="ready"][aria-pressed="false"]', { timeout: 6000 });
await pb.waitForFunction(() => /Alice a changé l'échange/.test(document.querySelector('#toast').textContent));
ok('Prêt : impossible avec une demande en attente ; Alice accepte → Bob n\'est plus prêt (« Alice a changé l\'échange »)');

assert.equal(await pa.$eval('.trc .trc-bal', e => e.dataset.lv), 'far'); assert.match(await tc(pa, '.trc .trc-bal'), /Tu reçois 4,75 € de plus/);
await pb.waitForFunction(() => /Tu donnes 4,75/.test(document.querySelector('.trc .trc-bal').textContent));
await pa.click('.trc [data-trc="eq"]'); await pa.waitForSelector('.sheet-wrap.open [data-trc="eqgo"]');
assert.match(await tc(pa, '.sheet-wrap.open .trc-ml'), /Anneau solaire × 3|Sol Ring × 3/); assert.match(await tc(pa, '.sheet-wrap.open .trc-eqs'), /3,85/);
await shot(pa, '07-equilibrer');
await pa.click('.sheet-wrap.open [data-trc="eqgo"]'); await pa.waitForFunction(() => TRC.s.me.give.reduce((t, x) => t + x.q, 0) === 6);
await pa.waitForSelector('.trc .trc-bal[data-lv="mid"]'); assert.match(await tc(pa, '.trc .trc-bal'), /Tu reçois 0,90 € de plus/);
await pb.waitForFunction(() => /Tu donnes 0,90/.test(document.querySelector('.trc .trc-bal').textContent));
assert.match(await tc(pa, '.trc .trc-zone.give .trc-zh'), /6 cartes · 5,30/); assert.match(await tc(pb, '.trc .trc-zone.get .trc-zh'), /6 cartes · 5,30/, 'les mêmes valeurs chez les deux');
await shot(pa, '08-alice-echange'); await shot(pb, '08-bob-echange');
await pa.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await pb.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await shot(pa, '09-alice-echange-sombre'); await shot(pb, '09-bob-echange-sombre');
await pa.evaluate(() => document.documentElement.removeAttribute('data-theme')); await pb.evaluate(() => document.documentElement.removeAttribute('data-theme'));
ok('balance (écart en €, couleur), « Équilibrer » (cartes peu chères de sa liste) ; mêmes valeurs des deux côtés');

/* ── Les deux prêts → récapitulatif → les deux valident → appliqué ────────────────────────────────── */
await pa.click('.trc [data-trc="ready"]'); await pa.waitForSelector('.trc [data-trc="ready"][aria-pressed="true"]');
await pb.waitForSelector('.trc .trc-who[data-st="ready"]');
await pb.click('.trc [data-trc="ready"]');
await phase(pa, 'confirm'); await phase(pb, 'confirm');
assert.match(await tc(pa, '.trc .trc-final .trc-col.get'), /Tu reçois.*6,20/); assert.match(await tc(pa, '.trc .trc-final .trc-col.give'), /Tu donnes.*5,30/);
await shot(pa, '10-alice-recap'); await shot(pb, '10-bob-recap');
await pa.click('.trc [data-trc="ok"]'); await pa.waitForSelector('.trc [data-trc="ok"][disabled]');
assert.match(await tc(pa, '.trc [data-trc="ok"]'), /En attente de Bob/);
await pb.waitForSelector('.trc .trc-fs[data-ok="1"]'); assert.match(await tc(pb, '.trc .trc-fs'), /Alice a validé/);
const before = { a: await coll(pa), b: await coll(pb) };
assert.deepEqual(before.b, { 'Arcane Signet': 'en:4', 'Command Tower': '1', 'Edgar Markov': 'de:2' }, 'rien de changé tant que les deux n\'ont pas validé');
await pb.click('.trc [data-trc="ok"]');
await phase(pa, 'done'); await phase(pb, 'done');
await pa.waitForFunction(() => /Échange appliqué/.test(document.querySelector('#toast').textContent));
await pb.waitForFunction(() => /Échange appliqué : 3 cartes données, 6 reçues/.test(document.querySelector('#toast').textContent));
assert.deepEqual(await coll(pa), { 'Arcane Signet': 'en:2', 'Craterhoof Behemoth': '2', 'Edgar Markov': 'de:1', 'Llanowar Elves': 'en:1', 'Sol Ring': 'fr:1', 'Wrath of God': '1' }, 'Alice : donnés retirés, reçus ajoutés (langue gardée)');
assert.deepEqual(await coll(pb), { 'Arcane Signet': 'en:2', 'Command Tower': '1', 'Edgar Markov': 'de:1', 'Llanowar Elves': 'en:2', 'Sol Ring': 'fr:4' }, 'Bob : idem');
assert.equal(await pb.evaluate(() => !!TR.wish['sol ring']), false, 'souhait de Bob comblé');
assert.match(await tc(pb, '.trc .trc-done'), /Échange terminé.*Ta collection est à jour : 3 cartes données, 6 reçues/);
await shot(pa, '11-alice-fait'); await shot(pb, '11-bob-fait');
const hist = await pa.evaluate(() => trocHist().map(h => [h.who, h.qg, h.qr, h.vg, h.vr]));
assert.deepEqual(hist, [['Bob', 6, 3, 530, 620]], '« Mes échanges » d\'Alice');
await pa.waitForFunction(() => !localStorage.getItem('deckdeal:troc:cur'), null, { timeout: 5000 });
ok('les deux prêts → récapitulatif ; une validation ne change rien ; les deux → chaque collection mise à jour, souhait comblé, « Mes échanges »');

// « Annuler » chez Bob : sa collection revient comme avant (Alice garde son échange)
await pb.click('#toast .toast-act'); await pb.waitForFunction(() => /annulé sur cet appareil/.test(document.querySelector('#toast').textContent));
assert.deepEqual(await coll(pb), before.b, 'Bob : collection d\'avant');
assert.equal(await pb.evaluate(() => TR.wish['sol ring'] && TR.wish['sol ring'].q), 1, 'souhait rendu');
assert.equal(await pb.evaluate(() => trocHist()[0].u), 1, 'historique : marqué annulé');
await pb.click('.trc [data-trc="close"]'); await pb.waitForFunction(() => !document.querySelector('.dv.trc'));
ok('« Annuler » du toast : sur cet appareil seulement, collection et souhait revenus, échange marqué annulé dans l\'historique');

// « Mes échanges » chez Alice
await pa.click('.trc [data-trc="close"]'); await pa.waitForFunction(() => !document.querySelector('.dv.trc'));
await pa.waitForSelector('.tr-box .trc-entry'); await pa.click('.trc-entry'); await pa.waitForSelector('.trc-entry-sheet.open [data-trc="hist"]');
assert.match(await tc(pa, '.trc-entry-sheet [data-trc="hist"]'), /Mes échanges\s*1/);
await pa.click('.trc-entry-sheet [data-trc="hist"]'); await pa.waitForSelector('.sheet-wrap.open .trc-h');
assert.match(await tc(pa, '.sheet-wrap.open .trc-h'), /Bob.*− 6 · 5,30.*\+ 3 · 6,20/);
await shot(pa, '12-mes-echanges');
await pa.click('.sheet-wrap.open .trc-h'); await pa.waitForSelector('.trc-hs.open .trc-col.get li');
assert.deepEqual(await pa.$$eval('.trc-hs.open .trc-col.give li .trc-mn', l => l.map(x => x.textContent)), ['Sol Ring × 4', 'Llanowar Elves × 2'], 'détail : une ligne par carte (demandée et ajoutée réunies)');
await closeSheets(pa);
ok('« Mes échanges » : ligne par échange (donné, reçu, valeurs), détail');

/* ── Invitation d'un ami : page de l'ami › Échange en direct → notification FCM, toast « Rejoindre » ─ */
{
  await pa.evaluate(() => amRefresh(true)); await pa.waitForFunction(t => AM.l && AM.l.friends.some(f => f.id === t), TB, { timeout: 8000 });
  await pa.evaluate(t => amOpenFriend(t), TB); await pa.waitForSelector('.pubv.on .am-chip[data-am="troc"]');
  await shot(pa, '13-page-ami');
  await pa.click('.pubv .am-chip[data-am="troc"]'); await phase(pa, 'wait');
  await pa.waitForFunction(() => /Invitation envoyée à Bob/.test(document.querySelector('.trc .trc-wh').textContent));
  const C2 = await pa.evaluate(() => TRC.c);
  const m = F.fcmFor(TOKB).pop(); assert.deepEqual(m.notification, { title: 'Invitation à un échange', body: 'Alice t\'invite à un échange en direct sur Mana Orbit.' }); assert.equal(m.data.url, './?troc=' + C2);
  await shot(pa, '14-invitation-envoyee');
  // Bob, appli ouverte : la liste des amis apporte l'invitation → toast « Rejoindre »
  await pb.evaluate(() => amRefresh(true));
  await pb.waitForFunction(() => /Alice t'invite à un échange en direct/.test(document.querySelector('#toast').textContent), null, { timeout: 8000 });
  await shot(pb, '15-invitation-recue');
  await pb.click('#toast .toast-act'); await phase(pb, 'live'); await phase(pa, 'live');
  // notification touchée pendant qu'on y est déjà : rien de plus
  await pb.evaluate(c => pushOpen('./?troc=' + c), C2); await pb.waitForTimeout(600); assert.equal(await pb.$$eval('.dv.trc', d => d.length), 1);
  ok('invitation d\'un ami : page de l\'ami › « Échange en direct » → notification FCM (./?troc=) ; appli ouverte : toast « Rejoindre » → dans l\'échange');

  // connexion perdue puis revenue
  await B.ctx.setOffline(true); await pb.waitForSelector('.trc .trc-net:not([hidden])', { timeout: 8000 });
  await shot(pb, '16-connexion-perdue');
  await B.ctx.setOffline(false); await pb.waitForSelector('.trc .trc-net[hidden]', { state: 'attached', timeout: 15000 });
  ok('connexion perdue : bandeau « nouvel essai », puis reprise');

  // Bob quitte (Retour → « Quitter l'échange ? ») : Alice voit qu'il est parti, rien n'a changé
  const ca = await coll(pa);
  await pb.evaluate(() => backClose()); await pb.waitForSelector('.sheet-wrap.open [data-trc="leave"]');
  await pb.click('.sheet-wrap.open [data-trc="leave"]'); await pb.waitForFunction(() => !document.querySelector('.dv.trc'));
  await phase(pa, 'end'); assert.match(await tc(pa, '.trc .trc-done'), /Bob a quitté l'échange\.\s*Rien n'a changé dans ta collection\./);
  assert.deepEqual(await coll(pa), ca);
  await shot(pa, '17-parti');
  await pa.click('.trc [data-trc="close"]'); await pa.waitForFunction(() => !document.querySelector('.dv.trc'));
  await pa.evaluate(() => { if (TR.pub && TR.pub.el) TR.pub.el.__close(); });
  ok('départ (Retour → confirmer) : « Bob a quitté l\'échange », rien n\'a changé');
}

/* ── Mode streamer, code invalide ─────────────────────────────────────────────────────────────────── */
await pa.evaluate(() => { window.__so = streamOn; window.streamOn = () => true; trocEntry(); });      // mode streamer (opening.js), simulé
await pa.waitForFunction(() => /indisponible en mode streamer/.test(document.querySelector('#toast').textContent)); assert.equal(await pa.$('.trc-entry-sheet'), null);
await pa.evaluate(() => { window.streamOn = window.__so; });
await pa.evaluate(() => trocEntry()); await pa.waitForSelector('.trc-entry-sheet.open #trcCode');
await pa.fill('#trcCode', 'abc'); assert.equal(await pa.$eval('#trcCode', e => e.value), 'ABC');
await pa.click('.trc-entry-sheet [data-trc="join"]'); await pa.waitForFunction(() => /Code invalide/.test(document.querySelector('#toast').textContent));
await pa.fill('#trcCode', 'zzzzzz'); await pa.click('.trc-entry-sheet [data-trc="join"]');
await pa.waitForFunction(() => /Code inconnu, ou échange terminé/.test(document.querySelector('#toast').textContent), null, { timeout: 8000 });
ok('mode streamer : pas d\'échange en direct ; code invalide ou inconnu : message court');

for (const [n, e] of [['Alice', A.errs], ['Bob', B.errs]]) assert.deepEqual(e, [], 'aucune erreur dans la console (' + n + ')');
await browser.close(); world.stop(); F.stop();
console.log('TROC E2E OK');
process.exit(0);
