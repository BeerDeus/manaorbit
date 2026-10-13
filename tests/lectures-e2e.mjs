// Lectures Firestore (quota gratuit : 50 000 par jour pour tout le projet) : sommaire du compte (cloud.js › makeSum) contre l'émulateur,
// vrai SDK Firebase (bundle des tests), lectures comptées sur le fil comme Firestore les facture (lectures-lib.mjs).
//   · coûts : première ouverture, relance (l'émulateur ignore les jetons de reprise : c'est le cas « après plus de 30 min »), 30 cartes ajoutées une à une,
//     deck modifié, deuxième appareil ouvert ;
//   · deux appareils synchronisés par le sommaire : collection, decks (ajout, modification, suppression), profil, liste d'échange, scan mobile en direct ;
//   · écriture faite sans le sommaire (version d'avant de l'appli) : vue à la vérification, sommaire réparé, écoutes d'avant pendant 24 h ;
//   · hors ligne puis retour du réseau : rien de perdu, sommaire juste ; envoi groupé de la collection parti en passant en arrière-plan ou à la déconnexion ;
//   · règles sans le sommaire (pas encore publiées) : écoutes d'avant, tout se synchronise quand même ; règles publiées : sommaire créé.
// Lourd (Java, émulateur) : s'ignore sans lui, comme rules-test.mjs (RULES_REQUIRED=1 : échec). Lancer :
//   RULES_DEPS=<dossier>/node_modules <dossier>/node_modules/.bin/firebase emulators:exec --only firestore --project demo-deckdeal "node tests/lectures-e2e.mjs"
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, startWorld, ok } from './e2e-world.mjs';
import { emu, fsPage, fsSignIn, reads, resetReads } from './lectures-lib.mjs';

const E = emu();
if (!E) {
  if (process.env.RULES_REQUIRED === '1') { console.error('✗ émulateur Firestore absent (FIRESTORE_EMULATOR_HOST) : RULES_REQUIRED=1, le test doit tourner'); process.exit(1); }
  console.log('· émulateur Firestore absent (FIRESTORE_EMULATOR_HOST) : test des lectures ignoré'); process.exit(0);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const RULES = readFileSync('firestore.rules', 'utf8');
const OLD_RULES = RULES.replace(/\n    match \/users\/\{uid\}\/meta\/sommaire \{[\s\S]*?\n    \}\n/, '\n');      // règles d'avant : pas de sommaire
assert.ok(OLD_RULES.length < RULES.length && !/meta\/sommaire \{/.test(OLD_RULES), 'règles sans le sommaire');
await E.rules(RULES); await E.clear();

const NOW = Date.now(), N_DECKS = 10;
const deckData = (i, extra = {}) => ({ name: 'Deck ' + i, text: '1 Sol Ring\n1 Arcane Signet', opts: {}, cards: 2, history: [], createdAt: NOW - i * 1000, updatedAt: NOW - i * 1000, ...extra });
async function seed(uid) {
  for (let i = 0; i < N_DECKS; i++) await E.put(`users/${uid}/decks/deck${i}`, deckData(i));
  await E.put(`users/${uid}/meta/collection`, { text: Array.from({ length: 200 }, (_, i) => `1 Card Number ${i}`).join('\n'), count: 200, updatedAt: NOW });
  await E.put(`users/${uid}/meta/profile`, { name: 'Beer', updatedAt: NOW });
  await E.put(`users/${uid}/meta/trade`, { keep: 1, kept: [], wish: {}, share: '', dsh: {}, updatedAt: NOW });
  await E.put(`users/${uid}/meta/prefs`, { scan: { ed: 'scan' }, updatedAt: NOW });
  await E.put(`users/${uid}/meta/engaged`, { decks: {}, updatedAt: NOW });
  await E.put(`users/${uid}/meta/history`, { pts: [], updatedAt: NOW });
}
await seed('u1');

const world = await startWorld({ port: 19452 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const st = P => P.p.evaluate(() => (D.cloud && D.cloud.sumState ? D.cloud.sumState(D.uid) : null));
const table = [];
const note = (who, what, P) => { const r = reads(P); table.push([who, what, r.reads, r.writes]); return r; };
/** Réglages de test posés avant la connexion (le moteur du compte les lit à sa création). */
const tune = (P, o = {}) => P.p.evaluate(o => { SUM.init = 300; COLL_PUSH.burst = o.burst || COLL_PUSH.burst; if (o.verify) sumNote(o.uid, { v: 0 }); if (o.legacy != null) { SUM.legacy = o.legacy; sumNote(o.uid, { leg: 0 }); } if (o.denied != null) SUM.denied = o.denied; }, { uid: P.uid, ...o });
/** Attend la fin de la synchro : collection « ok », decks attendus, mode décidé ; puis le temps que les dernières réponses arrivent (comptées). */
async function settle(P, nDecks, ms = 2500) {
  await P.p.waitForFunction(n => COLL.cloud === 'ok' && D.list.length === n && D.cloud.sumState(D.uid) && D.cloud.sumState(D.uid).mode !== 'wait', nDecks, { timeout: 25000 });
  await sleep(ms);
}
async function open(uid, nDecks, o = {}) { const P = await fsPage(browser, world, E, { uid }); await tune(P, o); await fsSignIn(P); await settle(P, nDecks); return P; }
async function relaunch(P, nDecks, o = {}) {
  resetReads(P); await P.p.reload(); await P.p.waitForFunction(() => D.authReady && D.state === 'ready', null, { timeout: 20000 });
  await tune(P, o); await fsSignIn(P); await settle(P, nDecks);
}
const until = async (P, fn, arg, label, timeout = 15000) => { try { await P.p.waitForFunction(fn, arg, { timeout }); } catch (e) { throw new Error(label + ' : délai dépassé'); } };
const man = uid => E.get(`users/${uid}/meta/sommaire`);
const noErrs = (...Ps) => { for (const P of Ps) assert.deepEqual(P.errs.filter(e => !/firestore|Firestore|WebChannel|transport errored/i.test(e)), [], 'erreurs JS'); };

/* ═══ 1. Coûts : ouvertures ═════════════════════════════════════════════════════════════════════ */
const A = await open('u1', N_DECKS);
let r = note('A', 'première ouverture (écoutes d\'avant + création du sommaire)', A);
assert.equal((await st(A)).mode, 'legacy', 'première ouverture du compte sur cet appareil : écoutes d\'avant');
let m = await man('u1');
assert.ok(m && m.v === 1, 'sommaire créé'); assert.equal(Object.keys(m.d).length, N_DECKS); assert.deepEqual(Object.keys(m.p).sort(), ['collection', 'engaged', 'history', 'prefs', 'profile', 'trade']);
assert.equal(m.d.deck3, NOW - 3000, 'date de chaque deck'); assert.equal(m.p.collection, NOW);
assert.ok(r.reads <= 2 * (N_DECKS + 6) + 4, 'création : une relecture complète en plus, une seule fois (' + r.reads + ')');
ok(`première ouverture : écoutes d'avant (${r.reads} lectures, création du sommaire comprise) ; sommaire = 10 decks et 6 documents datés`);

await relaunch(A, N_DECKS); r = note('A', 'relance (> 30 min)', A);
assert.equal((await st(A)).mode, 'sum'); assert.equal(r.reads, 1, 'relance : le sommaire seul (' + r.names.join(', ') + ')');
await relaunch(A, N_DECKS, { verify: true }); r = note('A', 'relance avec vérification (au plus toutes les 6 h)', A);
assert.equal((await st(A)).mode, 'sum'); assert.equal(r.reads, 3, 'sommaire + 2 agrégations (' + r.names.join(', ') + ')'); assert.equal(r.agg, 2);
assert.equal(await A.p.evaluate(() => D.list.map(d => d.name).join()), Array.from({ length: N_DECKS }, (_, i) => 'Deck ' + i).join(), 'decks livrés depuis la copie locale, dans l\'ordre');
assert.equal(await A.p.evaluate(() => Object.keys(COLL.map).length), 200); assert.equal(await A.p.evaluate(() => PROF.name), 'Beer');
ok('relance après plus de 30 min : 1 lecture (avant : 17) ; avec la vérification : 3 ; decks, collection, profil livrés depuis la copie locale');

const B = await open('u1', N_DECKS); r = note('B', 'première ouverture (2e appareil)', B);
assert.equal((await st(B)).mode, 'legacy'); assert.ok(r.reads <= N_DECKS + 6 + 1, 'sommaire déjà là : rien à créer (' + r.reads + ')');
await relaunch(B, N_DECKS); r = note('B', 'relance (vérification : première fois ici)', B); assert.equal((await st(B)).mode, 'sum'); assert.equal(r.reads, 3);
await relaunch(B, N_DECKS); r = note('B', 'relance', B); assert.equal(r.reads, 1);
ok('deuxième appareil : écoutes d\'avant à sa première ouverture, puis sommaire (3 lectures la première fois, 1 ensuite)');

/* ═══ 2. Deux appareils ouverts : chaque modification arrive en direct ══════════════════════════ */
resetReads(A); resetReads(B);
for (let i = 0; i < 30; i++) { await A.p.evaluate(i => collBump(ownKey('Scan Card ' + i), 'Scan Card ' + i, 1), i); await sleep(1200); }
await until(B, () => Object.keys(COLL.map).length === 230, null, '30 cartes sur B', 20000); await sleep(2500);
const ra = note('A', '30 cartes ajoutées une à une (1,2 s d\'écart)', A), rb = note('B', '… pendant ce temps (ouvert)', B);
assert.ok(ra.reads <= 18 && ra.reads >= 4, 'envois groupés : ' + ra.reads + ' lectures'); assert.ok(rb.reads <= 18, 'B : ' + rb.reads + ' lectures');
assert.equal((await E.get('users/u1/meta/collection')).count, 230);
ok(`30 cartes une à une : ${ra.reads} lectures sur A et ${rb.reads} sur B (avant : 60 et 30) ; B a toutes les cartes`);

resetReads(A); resetReads(B);
await A.p.evaluate(() => { const d = D.list.find(x => x.id === 'deck0'); putDeck(d.id, deckDoc({ ...d, text: d.text + '\n1 Wrath of God' })); });
await until(B, () => /Wrath of God/.test((D.list.find(x => x.id === 'deck0') || {}).text || ''), null, 'deck modifié vu sur B'); await sleep(2500);
r = note('A', 'deck modifié', A); assert.equal(r.reads, 1, 'A : écho du sommaire seulement (' + r.names.join(', ') + ')'); assert.equal(r.writes, 2, 'deck + sommaire');
r = note('B', '… vu sur B', B); assert.equal(r.reads, 2, 'B : sommaire + le deck (' + r.names.join(', ') + ')');
assert.equal((await man('u1')).d.deck0, await A.p.evaluate(() => D.list.find(x => x.id === 'deck0').updatedAt));
ok('deck modifié sur A : 1 lecture sur A, 2 sur B (sommaire + ce deck), B le voit en direct');

await B.p.evaluate(() => putDeck('nouveau1', deckDoc({ name: 'Neuf', text: '1 Sol Ring' })));
await until(A, () => D.list.some(d => d.id === 'nouveau1' && d.name === 'Neuf'), null, 'deck ajouté sur B vu sur A');
await A.p.evaluate(() => removeDeck('deck9'));
await until(B, () => !D.list.some(d => d.id === 'deck9') && D.list.length === 10, null, 'deck supprimé sur A vu sur B');
m = await man('u1'); assert.ok(m.d.nouveau1 && !('deck9' in m.d), 'sommaire : deck ajouté, deck retiré');
ok('deck ajouté sur B → A ; deck supprimé sur A → B (retiré du sommaire)');

await B.p.evaluate(() => profSave({ name: 'Beer Deus' }));
await until(A, () => PROF.name === 'Beer Deus', null, 'profil vu sur A');
await A.p.evaluate(() => { TR.keep = 3; trChanged(); });
await until(B, () => TR.keep === 3, null, 'liste d\'échange vue sur B');
await A.p.evaluate(() => { XS.eng = { ...XS.eng, deck0: { n: 'Deck 0', at: Date.now(), q: { 'sol ring': 1 } } }; engSaved(); });
await until(B, () => !!XS.eng.deck0, null, 'deck monté vu sur B');
ok('profil (B → A), liste d\'échange et deck monté (A → B) : en direct par le sommaire');

// scan mobile : écoute directe du document pendant la session, plus rien ensuite
resetReads(B);
await A.p.evaluate(() => mobStart());
await until(B, () => !!mobWaiting(), null, 'B voit le PC qui attend'); assert.equal((await st(B)).hot, true, 'B suit la session en direct');
await B.p.evaluate(() => { MOB.queue.push({ i: 'it1', k: ownKey('Mobile Card'), n: 'Mobile Card', q: 1, l: '', e: '' }); mobFlush(); });
await until(A, () => collQty(ownKey('Mobile Card')) === 1, null, 'carte du téléphone arrivée sur le PC');
await until(A, () => !(MOB.doc && MOB.doc.items && MOB.doc.items.length), null, 'carte retirée du document par le PC');
await A.p.evaluate(() => mobStop());
await until(B, () => !D.cloud.sumState(D.uid).hot && !mobWaiting(), null, 'session fermée : plus d\'écoute directe sur B');
assert.equal((await st(A)).hot, false);
r = note('B', 'session de scan mobile (ouverture, 1 carte, fermeture)', B);
ok(`scan mobile : session suivie en direct (${r.reads} lectures sur B), carte arrivée sur le PC, écoute directe arrêtée à la fermeture`);
noErrs(A, B);

/* ═══ 3. Écriture sans le sommaire (version d'avant de l'appli ouverte ailleurs) ═══════════════ */
const tOld = Date.now();
await E.put('users/u1/decks/deck3', deckData(3, { text: '1 Sol Ring\n1 Llanowar Elves', updatedAt: tOld }));
const cOld = await E.get('users/u1/meta/collection'); await E.put('users/u1/meta/collection', { ...cOld, text: cOld.text + '\n4 Old Client Card', count: cOld.count + 1, updatedAt: cOld.updatedAt + 1 });
await sleep(1500);
assert.ok(!/Llanowar/.test(await B.p.evaluate(() => D.list.find(d => d.id === 'deck3').text)), 'B (sommaire) ne voit pas encore l\'écriture faite sans lui');
await relaunch(A, 10, { verify: true });
r = note('A', 'relance : vérification, écart → réparation', A);
assert.equal((await st(A)).mode, 'legacy', 'écart : écoutes d\'avant');
assert.match(await A.p.evaluate(() => D.list.find(d => d.id === 'deck3').text), /Llanowar/); assert.equal(await A.p.evaluate(() => collQty(ownKey('Old Client Card'))), 4);
await until(B, () => /Llanowar/.test((D.list.find(d => d.id === 'deck3') || {}).text || '') && collQty(ownKey('Old Client Card')) === 4, null, 'B voit l\'écriture après la réparation');
assert.equal((await st(B)).mode, 'legacy', 'B : écoutes d\'avant aussi (champ old)');
m = await man('u1'); assert.ok(m.old > 0, 'old noté'); assert.equal(m.d.deck3, tOld, 'sommaire réparé');
ok(`écriture sans le sommaire : vue à la vérification (${r.reads} lectures), sommaire réparé, les deux appareils repassent aux écoutes d'avant (24 h)`);
// plus tard (24 h écoulées) : retour au sommaire, vérification juste
await relaunch(A, 10, { verify: true, legacy: 1 }); assert.equal((await st(A)).mode, 'sum', 'période écoulée : sommaire, vérification juste');
await relaunch(B, 10, { verify: true, legacy: 1 }); assert.equal((await st(B)).mode, 'sum');
ok('24 h plus tard : vérification juste, retour au sommaire');

/* ═══ 4. Hors ligne puis retour du réseau : rien de perdu ═════════════════════════════════════════ */
const net = (P, on) => P.p.evaluate(async on => { const fs = await import(FB_BASE + 'firebase-firestore.js'); await (on ? fs.enableNetwork : fs.disableNetwork)(self.__db); }, on);      // module de l'émulateur (lectures-lib.mjs) : base de l'appli dans __db
await net(A, false);
await A.p.evaluate(() => { putDeck('horsligne1', deckDoc({ name: 'Hors ligne', text: '1 Command Tower' })); const d = D.list.find(x => x.id === 'deck1'); putDeck(d.id, deckDoc({ ...d, name: 'Deck 1 bis' })); TR.keep = 4; trChanged(); profSave({ name: 'Hors réseau' }); });
await until(A, () => D.list.some(d => d.id === 'horsligne1') && D.list.some(d => d.name === 'Deck 1 bis'), null, 'hors ligne : decks visibles tout de suite');
await sleep(1500);
assert.equal(await B.p.evaluate(() => D.list.some(d => d.id === 'horsligne1')), false, 'rien n\'est parti');
await net(A, true);
await until(B, () => D.list.some(d => d.id === 'horsligne1') && D.list.some(d => d.name === 'Deck 1 bis') && TR.keep === 4 && PROF.name === 'Hors réseau', null, 'retour du réseau : tout arrive sur B', 20000);
m = await man('u1'); assert.ok(m.d.horsligne1 > 0 && m.d.deck1 === (await E.get('users/u1/decks/deck1')).updatedAt, 'sommaire à jour');
await relaunch(B, 11, { verify: true }); assert.equal((await st(B)).mode, 'sum', 'vérification juste après le retour du réseau');
ok('hors ligne : decks, liste d\'échange, profil gardés ; au retour du réseau tout part, sommaire juste (vérification)');

/* ═══ 5. Envoi groupé de la collection : parti tout de suite en arrière-plan, à la déconnexion ═════ */
// une rafale juste après un envoi : le suivant attendrait ~6 s
const burst = async from => { await A.p.evaluate(f => { for (let i = f; i < f + 4; i++) collBump(ownKey('Burst ' + i), 'Burst ' + i, 1); }, from); await until(A, () => !COLL.pushing && !COLL.pushT && COLL.cloud === 'ok', null, 'premier envoi', 8000); await A.p.evaluate(f => collBump(ownKey('Burst ' + (f + 4)), 'Burst ' + (f + 4), 1), from); };
await burst(0);
assert.ok(await A.p.evaluate(() => !!COLL.pushT && COLL.pushAt + COLL_PUSH.burst - Date.now() > 3000), 'rafale : envoi suivant en attente (plusieurs secondes)');
await A.p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
await until(B, () => collQty(ownKey('Burst 4')) === 1, null, 'arrière-plan : envoyé sans attendre', 2500);
await A.p.evaluate(() => { delete document.hidden; });
await burst(10);
assert.ok(await A.p.evaluate(() => !!COLL.pushT), 'rafale : envoi en attente');
await A.p.evaluate(() => meSignOut());
await A.p.waitForFunction(() => !D.user, null, { timeout: 8000 });
assert.match((await E.get('users/u1/meta/collection')).text, /Burst 14/, 'déconnexion : l\'envoi en attente est parti avant');
ok('envoi groupé (rafale) : parti tout de suite en passant en arrière-plan et avant la déconnexion');
noErrs(A, B);

/* ═══ 6. Règles sans le sommaire (pas encore publiées) : écoutes d'avant, rien ne se perd ═════════ */
await E.rules(OLD_RULES); await seed('u2');
const C = await open('u2', N_DECKS), Dv = await open('u2', N_DECKS);
await sleep(1200);
assert.equal(await man('u2'), null, 'sommaire refusé : pas créé');
assert.ok((await C.p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:sum:v1')).u2.den)) > 0, 'refus noté (nouvel essai dans 24 h)');
await C.p.evaluate(() => { putDeck('c1', deckDoc({ name: 'Sur C', text: '1 Sol Ring' })); collBump(ownKey('Sol Ring'), 'Sol Ring', 2); TR.keep = 2; trChanged(); });
await until(Dv, () => D.list.some(d => d.id === 'c1') && collQty(ownKey('Sol Ring')) === 2 && TR.keep === 2, null, 'C → D sans sommaire');
await Dv.p.evaluate(() => removeDeck('deck2'));
await until(C, () => !D.list.some(d => d.id === 'deck2'), null, 'D → C : deck supprimé');
await relaunch(C, N_DECKS); r = note('C', 'relance, règles sans le sommaire', C);
assert.equal((await st(C)).mode, 'legacy'); assert.ok(r.reads <= N_DECKS + 6 + 1, 'comme avant (' + r.reads + ')');
ok(`règles sans le sommaire : écoutes d'avant (${r.reads} lectures par ouverture, comme avant), tout se synchronise ; création retentée dans 24 h`);
await E.rules(RULES);
await relaunch(C, N_DECKS, { denied: 0 }); await sleep(1500);
m = await man('u2'); assert.ok(m && m.v === 1 && m.d.c1 && !('deck2' in m.d), 'règles publiées : sommaire créé');
await relaunch(C, N_DECKS); r = note('C', 'relance après publication des règles', C); assert.equal((await st(C)).mode, 'sum'); assert.equal(r.reads, 1);
ok('règles publiées : sommaire créé à l\'ouverture suivante, puis 1 lecture par relance');
noErrs(C, Dv);

console.log('\nLectures (et écritures) mesurées, facturation Firestore :');
for (const [w, what, n, wr] of table) console.log(`  ${w}  ${String(n).padStart(3)} lect. ${String(wr).padStart(3)} écr.  ${what}`);
await browser.close(); world.stop();
console.log('\nLECTURES OK');
process.exit(0);
