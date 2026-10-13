// Règles Firestore (firestore.rules) contre l'émulateur : chaque branche a au moins un cas permis et un cas refusé (parties, decks, partages publics,
// documents annexes du compte dont le profil, classeur, refus par défaut). Lancé par la CI (.github/workflows/rules.yml) avec RULES_REQUIRED=1 : un test ignoré y est un échec.
// En local, facultatif (lourd) : Java 21, l'émulateur Firestore et @firebase/rules-unit-testing. Sans eux, le test s'ignore.
//   npm i --no-save --prefix <dossier> firebase-tools@15.31.0 @firebase/rules-unit-testing@5.0.2 firebase@12.19.0   (firebase : version de tests/package.json)
//   RULES_DEPS=<dossier>/node_modules <dossier>/node_modules/.bin/firebase emulators:exec --only firestore --project demo-deckdeal "node tests/rules-test.mjs"
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const req = createRequire(process.env.RULES_DEPS ? process.env.RULES_DEPS.replace(/\/?$/, '/') : import.meta.url);
// RULES_REQUIRED=1 (CI) : sans émulateur ni dépendances, échec au lieu d'un succès silencieux (une règle cassée passerait inaperçue)
const skip = m => {
  if (process.env.RULES_REQUIRED === '1') { console.error(`✗ ${m} : RULES_REQUIRED=1, le test des règles doit tourner`); process.exit(1); }
  console.log(`· ${m} : test des règles ignoré`); process.exit(0);
};
let T, F;
try { T = req('@firebase/rules-unit-testing'); F = req('firebase/firestore'); } catch (e) { skip('@firebase/rules-unit-testing absent'); }
if (!process.env.FIRESTORE_EMULATOR_HOST) skip('émulateur Firestore absent (FIRESTORE_EMULATOR_HOST)');
F.setLogLevel('error');      // chaque refus attendu serait un avertissement du SDK : le journal ne garderait que du bruit
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await T.initializeTestEnvironment({ projectId: 'demo-deckdeal', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) } });
// émulateur réutilisé (emulators:start) : base vide, chaque cas ne dépend que de ce fichier. Juste après un essai interrompu (flux d'écoute resté ouvert), l'émulateur répond une fois 499 CANCELLED
await env.clearFirestore().catch(() => env.clearFirestore());
const { doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, collection, collectionGroup, getDocs, query, where, writeBatch } = F;
const tag = uid => createHash('sha256').update(uid).digest('hex');
const u1 = env.authenticatedContext('u1').firestore(), u2 = env.authenticatedContext('u2').firestore(), anon = env.unauthenticatedContext().firestore();
const share = (o, extra = {}) => ({ o, kind: 'trade', v: 1, updatedAt: Date.now(), d: '{"have":[],"want":[]}', ...extra });
const drop = (o, k) => { const c = { ...o }; delete c[k]; return c; };
const keys = n => Object.fromEntries(Array.from({ length: n }, (_, i) => ['k' + i, 1]));      // map de n clés (bornes des règles sur size())
const list = (n, x = 'x') => Array.from({ length: n }, () => x);
const ok = m => console.log('✓', m);

await T.assertFails(setDoc(doc(anon, 'shares/s1'), share(tag('u1'))));
await T.assertFails(setDoc(doc(u1, 'shares/s1'), share(tag('u2'))));
await T.assertFails(setDoc(doc(u1, 'shares/s1'), share(tag('u1'), { uid: 'u1' })));
await T.assertFails(setDoc(doc(u1, 'shares/s1'), share(tag('u1'), { kind: 'evil' })));
await T.assertFails(setDoc(doc(u1, 'shares/s1'), share(tag('u1'), { d: 'x'.repeat(900001) })));
await T.assertFails(setDoc(doc(u1, 'shares/s1'), share(tag('u1').toUpperCase().replace(/[0-9]/g, 'f'))));
await T.assertFails(setDoc(doc(u1, 'shares/s1'), share(tag('u1').toUpperCase())));      // empreinte en minuscules (ownerTag de share.js), jamais une autre écriture
await T.assertFails(setDoc(doc(u1, 'shares/s1'), drop(share(tag('u1')), 'o')));
await T.assertFails(setDoc(doc(u1, 'shares/s1'), drop(share(tag('u1')), 'kind')));
await T.assertFails(setDoc(doc(u1, 'shares/s1'), drop(share(tag('u1')), 'updatedAt')));
await T.assertFails(setDoc(doc(u1, 'shares/s1'), drop(share(tag('u1')), 'd')));
await T.assertFails(setDoc(doc(u1, 'shares/s1'), share(tag('u1'), { updatedAt: '1' })));
await T.assertFails(setDoc(doc(u1, 'shares/s1'), share(tag('u1'), { d: { have: [], want: [] } })));
await T.assertSucceeds(setDoc(doc(u1, 'shares/s1'), share(tag('u1'))));
await T.assertSucceeds(setDoc(doc(u1, 'shares/d1'), share(tag('u1'), { kind: 'deck', d: '{"name":"x","text":"1 Sol Ring"}' })));
await T.assertSucceeds(setDoc(doc(u1, 'shares/s2'), drop(share(tag('u1')), 'v')));
await T.assertSucceeds(setDoc(doc(u1, 'shares/s3'), share(tag('u1'), { d: 'x'.repeat(900000) })));      // TR_SHARE_MAX de share.js : la borne elle-même passe
await T.assertSucceeds(setDoc(doc(u2, 'shares/t2'), share(tag('u2'))));
ok('création : propriétaire seul (empreinte SHA-256 de son UID), champs et tailles contrôlés, jamais l\'UID');
await T.assertSucceeds(getDoc(doc(anon, 'shares/s1')));
await T.assertSucceeds(getDoc(doc(u2, 'shares/s1')));
await T.assertSucceeds(getDoc(doc(anon, 'shares/absent')));      // lien retiré : le visiteur lit « introuvable », pas « accès refusé »
await T.assertFails(getDocs(collection(anon, 'shares')));
await T.assertFails(getDocs(collection(u2, 'shares')));
await T.assertFails(getDocs(query(collection(u1, 'shares'), where('o', '==', tag('u1')))));      // même le propriétaire : aucune liste par empreinte
ok('lecture : quiconque a le lien ; liste des partages impossible');
await T.assertFails(setDoc(doc(u2, 'shares/s1'), share(tag('u2'))));
await T.assertFails(setDoc(doc(u2, 'shares/s1'), share(tag('u1'))));
await T.assertFails(updateDoc(doc(u2, 'shares/s1'), { d: '{}' }));
await T.assertFails(updateDoc(doc(anon, 'shares/s1'), { d: '{}' }));
await T.assertFails(deleteDoc(doc(u2, 'shares/s1')));
await T.assertFails(deleteDoc(doc(anon, 'shares/s1')));
await T.assertFails(deleteDoc(doc(u1, 'shares/t2')));
await T.assertSucceeds(setDoc(doc(u1, 'shares/s1'), share(tag('u1'), { d: '{"have":[{"n":"Sol Ring","q":2}],"want":[]}' })));
await T.assertSucceeds(updateDoc(doc(u1, 'shares/s1'), { d: '{"have":[],"want":[]}', updatedAt: Date.now() }));
await T.assertFails(updateDoc(doc(u1, 'shares/s1'), { o: tag('u2') }));      // jamais cédé à un autre compte
await T.assertFails(updateDoc(doc(u1, 'shares/s1'), { kind: 'evil' }));
await T.assertFails(updateDoc(doc(u1, 'shares/s1'), { d: 'x'.repeat(900001) }));
await T.assertFails(updateDoc(doc(u1, 'shares/s1'), { uid: 'u1' }));
await T.assertFails(updateDoc(doc(u1, 'shares/s1'), { updatedAt: deleteField() }));
await T.assertSucceeds(deleteDoc(doc(u1, 'shares/s1')));
await T.assertFails(deleteDoc(doc(u1, 'shares/absent')));      // aucun propriétaire à comparer : cloud.js (wipe) vérifie d'abord que le lien existe
ok('modification et suppression : propriétaire seul');

const trade = (extra = {}) => ({ keep: 1, kept: ['sol ring'], wish: { 'mana crypt': { n: 'Mana Crypt', q: 1 } }, share: 's1', dsh: { deck1: 'd1' }, updatedAt: Date.now(), ...extra });
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/meta/trade'), trade()));
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/meta/trade'), trade({ share: '', dsh: {} })));
await T.assertFails(setDoc(doc(u2, 'users/u1/meta/trade'), trade()));
await T.assertFails(getDoc(doc(u2, 'users/u1/meta/trade')));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/trade'), trade({ evil: 1 })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/trade'), trade({ kept: 'sol ring' })));
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/meta/collection'), { text: '1 Sol Ring', count: 1, updatedAt: 1 }));
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/decks/x'), { name: 'Deck', text: '1 Sol Ring', updatedAt: 1 }));
ok('réglages de la liste d\'échange : propriétaire seul, forme contrôlée ; collection et decks inchangés');
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/meta/trade'), trade({ kept: list(5000), wish: keys(2000), share: 'x'.repeat(40), dsh: keys(200) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/trade'), trade({ kept: list(5001) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/trade'), trade({ wish: keys(2001) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/trade'), trade({ wish: [] })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/trade'), trade({ share: 'x'.repeat(41) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/trade'), trade({ share: null })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/trade'), trade({ dsh: keys(201) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/trade'), trade({ keep: '1' })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/trade'), trade({ updatedAt: '1' })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/trade'), drop(trade(), 'wish')));      // pas de hasAll : chaque champ lu par la règle est exigé
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/trade'), drop(trade(), 'updatedAt')));
ok('liste d\'échange : bornes (5 000 gardées, 2 000 souhaits, 200 decks partagés, identifiant ≤ 40), types, champs exigés');

const scanDoc = (extra = {}) => ({ on: true, s: 'abc123', dev: 'dev1', by: 'Chrome · Windows', at: Date.now(), items: [], updatedAt: Date.now(), ...extra });
const card = i => ({ i: 'c' + i, k: 'sol ring', n: 'Sol Ring', q: 1, l: 'fr' });
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/meta/scan'), scanDoc()));
await T.assertSucceeds(updateDoc(doc(u1, 'users/u1/meta/scan'), { items: F.arrayUnion(card(1), card(2)), updatedAt: Date.now() }));      // le téléphone dépose
await T.assertSucceeds(updateDoc(doc(u1, 'users/u1/meta/scan'), { items: F.arrayRemove(card(1)), updatedAt: Date.now() }));      // le PC retire ce qu'il a reçu
await T.assertSucceeds(updateDoc(doc(u1, 'users/u1/meta/scan'), { on: false, updatedAt: Date.now() }));
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/meta/scan'), scanDoc({ items: Array.from({ length: 60 }, (_, i) => card(i)), by: 'x'.repeat(60) })));
await T.assertFails(setDoc(doc(u2, 'users/u1/meta/scan'), scanDoc()));
await T.assertFails(getDoc(doc(u2, 'users/u1/meta/scan')));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/scan'), scanDoc({ items: Array.from({ length: 61 }, (_, i) => card(i)) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/scan'), scanDoc({ by: 'x'.repeat(61) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/scan'), scanDoc({ on: 'oui' })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/scan'), scanDoc({ evil: 1 })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/scan'), drop(scanDoc(), 'dev')));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/scan'), drop(scanDoc(), 'updatedAt')));
ok('scan mobile : le compte seul, 60 cartes en attente au plus, champs et types contrôlés, dépôt et retrait par arrayUnion / arrayRemove');

const prefs = (extra = {}) => ({ scan: { ed: 'scan', auto: false, delay: 1000, same: 'ask', lang: '', vib: true, snd: false }, updatedAt: Date.now(), ...extra });
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/meta/prefs'), prefs()));
await T.assertSucceeds(getDoc(doc(u1, 'users/u1/meta/prefs')));
await T.assertFails(setDoc(doc(u2, 'users/u1/meta/prefs'), prefs()));
await T.assertFails(getDoc(doc(u2, 'users/u1/meta/prefs')));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/prefs'), prefs({ evil: 1 })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/prefs'), prefs({ scan: 'x' })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/prefs'), prefs({ scan: Object.fromEntries(Array.from({ length: 13 }, (_, i) => ['k' + i, 1])) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/prefs'), drop(prefs(), 'updatedAt')));
ok('réglages du compte (scan) : le compte seul, un objet « scan » de 12 champs au plus, rien d\'autre');

const prof = (extra = {}) => ({ name: 'Martin', photo: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==', updatedAt: Date.now(), ...extra });
const photo = (n, type = 'jpeg') => { const p = `data:image/${type};base64,`; return p + 'A'.repeat(n - p.length); };      // n caractères en tout
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/meta/profile'), prof()));
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/meta/profile'), { updatedAt: Date.now() }));      // pseudo et photo retirés (profSave n'écrit que les champs remplis)
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/meta/profile'), drop(prof(), 'photo')));
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/meta/profile'), prof({ name: 'x'.repeat(30) })));
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/meta/profile'), prof({ name: 'é'.repeat(30) })));
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/meta/profile'), prof({ name: '😀'.repeat(15) })));      // size() compte en UTF-16, comme le slice(0, 30) de profClean
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/profile'), prof({ name: 'x'.repeat(31) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/profile'), prof({ name: '😀'.repeat(16) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/profile'), prof({ name: 42 })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/profile'), prof({ name: null })));
ok('profil : pseudo facultatif, texte de 30 caractères au plus (accents et émojis comptés comme dans l\'appli)');
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/meta/profile'), prof({ photo: photo(40000) })));
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/meta/profile'), prof({ photo: photo(100, 'png') })));
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/meta/profile'), prof({ photo: photo(100, 'webp') })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/profile'), prof({ photo: photo(40001) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/profile'), prof({ photo: photo(100, 'gif') })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/profile'), prof({ photo: photo(100, 'svg+xml') })));      // SVG : du script dans une image
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/profile'), prof({ photo: 'https://lh3.googleusercontent.com/a/photo' })));      // jamais une adresse (pixel espion sur les liens partagés)
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/profile'), prof({ photo: 'data:image/png;base64,AAAA" onerror="alert(1)' })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/profile'), prof({ photo: ' data:image/png;base64,AAAA' })));      // matches() porte sur toute la chaîne
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/profile'), prof({ photo: 'data:image/png;base64,' })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/profile'), prof({ photo: 12 })));
ok('profil : photo facultative, data:image JPEG, PNG ou WebP en base64, 40 000 caractères au plus');
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/profile'), prof({ email: 'martin@example.com' })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/profile'), prof({ updatedAt: '1' })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/profile'), drop(prof(), 'updatedAt')));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/profile'), { text: '1 Sol Ring', updatedAt: 1 }));      // forme d'un autre document annexe
await T.assertSucceeds(updateDoc(doc(u1, 'users/u1/meta/profile'), { name: 'Martin S', updatedAt: Date.now() }));
await T.assertFails(updateDoc(doc(u1, 'users/u1/meta/profile'), { name: 'x'.repeat(31) }));
await T.assertSucceeds(getDoc(doc(u1, 'users/u1/meta/profile')));
await T.assertFails(getDoc(doc(u2, 'users/u1/meta/profile')));
await T.assertFails(getDoc(doc(anon, 'users/u1/meta/profile')));
await T.assertFails(setDoc(doc(u2, 'users/u1/meta/profile'), prof()));
await T.assertFails(updateDoc(doc(u2, 'users/u1/meta/profile'), { name: 'Pirate' }));
await T.assertFails(deleteDoc(doc(u2, 'users/u1/meta/profile')));
ok('profil : champs name, photo, updatedAt seulement (updatedAt nombre) ; lu, écrit et effacé par son seul propriétaire');

const coll = (extra = {}) => ({ text: '1 Sol Ring', count: 1, updatedAt: Date.now(), ...extra });
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/meta/collection'), drop(coll(), 'count')));
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/meta/collection'), coll({ text: 'x'.repeat(900000) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/collection'), coll({ text: 'x'.repeat(900001) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/collection'), coll({ text: 12 })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/collection'), drop(coll(), 'text')));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/collection'), coll({ count: '1' })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/collection'), coll({ evil: 1 })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/collection'), coll({ updatedAt: '1' })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/collection'), drop(coll(), 'updatedAt')));
const eng = (extra = {}) => ({ decks: { d1: { n: 'Rakdos', at: 1, q: { 'sol ring': 2 } } }, updatedAt: Date.now(), ...extra });
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/meta/engaged'), eng()));
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/meta/engaged'), eng({ decks: keys(80) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/engaged'), eng({ decks: keys(81) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/engaged'), eng({ decks: [] })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/engaged'), drop(eng(), 'decks')));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/engaged'), eng({ evil: 1 })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/engaged'), drop(eng(), 'updatedAt')));
// pts : une carte { t, v, n, q } par jour. Le format [[t, v, n, q], …] n'atteint jamais les règles : Firestore refuse les tableaux imbriqués (le SDK lève l'erreur).
const pt = i => ({ t: i, v: 1000, n: 2, q: 2 });
const hist = (extra = {}) => ({ pts: [pt(1)], updatedAt: Date.now(), ...extra });
await assert.rejects(async () => setDoc(doc(u1, 'users/u1/meta/history'), { pts: [[1, 1000, 2, 2]], updatedAt: 1 }), /Nested arrays/);
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/meta/history'), hist()));
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/meta/history'), hist({ pts: Array.from({ length: 420 }, (_, i) => pt(i)) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/history'), hist({ pts: Array.from({ length: 421 }, (_, i) => pt(i)) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/history'), hist({ pts: {} })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/history'), drop(hist(), 'pts')));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/history'), hist({ evil: 1 })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/history'), hist({ updatedAt: '1' })));
await T.assertFails(setDoc(doc(u1, 'users/u1/meta/evil'), { updatedAt: 1 }));      // document annexe inconnu
ok('collection, cartes réservées, historique de valeur : champs, types et bornes (900 000 caractères, 80 decks, 420 jours) ; document inconnu refusé');
for (const id of ['collection', 'engaged', 'history', 'trade', 'profile']) {
  await T.assertSucceeds(getDoc(doc(u1, 'users/u1/meta/' + id)));
  await T.assertFails(getDoc(doc(u2, 'users/u1/meta/' + id)));
  await T.assertFails(getDoc(doc(anon, 'users/u1/meta/' + id)));
  await T.assertFails(setDoc(doc(u2, 'users/u1/meta/' + id), { updatedAt: 1 }));
  await T.assertFails(deleteDoc(doc(u2, 'users/u1/meta/' + id)));
}
await T.assertSucceeds(getDocs(collection(u1, 'users/u1/meta')));
await T.assertFails(getDocs(collection(u2, 'users/u1/meta')));
await T.assertFails(getDocs(collectionGroup(u2, 'meta')));
ok('documents annexes d\'un autre compte : ni lus, ni listés, ni écrits, ni effacés');

// Sommaire du compte (cloud.js › makeSum) : dates des documents du compte, écrit dans le même lot qu'eux ; vérifié par 2 agrégations (nombre, somme des dates)
const SOM = 'users/u1/meta/sommaire', som = (extra = {}) => ({ v: 1, p: { collection: 1, trade: 2 }, d: { d1: 3 }, at: Date.now(), ...extra });
await T.assertSucceeds(setDoc(doc(u1, SOM), som()));
await T.assertSucceeds(setDoc(doc(u1, SOM), { at: Date.now() }, { merge: true }));      // essai d'écriture avant la création (règles publiées ?)
await T.assertSucceeds(setDoc(doc(u1, SOM), { p: { profile: 4 } }, { merge: true }));
await T.assertSucceeds(setDoc(doc(u1, SOM), { d: { d1: deleteField() } }, { merge: true }));      // deck supprimé
await T.assertSucceeds(setDoc(doc(u1, SOM), som({ old: Date.now(), p: keys(30), d: keys(3000) })));
await T.assertFails(setDoc(doc(u1, SOM), som({ p: keys(31) })));
await T.assertFails(setDoc(doc(u1, SOM), som({ d: keys(3001) })));
await T.assertFails(setDoc(doc(u1, SOM), som({ updatedAt: 1 })));      // jamais d'updatedAt : il fausserait la somme des dates des documents annexes
await T.assertFails(setDoc(doc(u1, SOM), som({ evil: 1 })));
await T.assertFails(setDoc(doc(u1, SOM), som({ v: '1' })));
await T.assertFails(setDoc(doc(u1, SOM), som({ p: [] })));
await T.assertFails(setDoc(doc(u1, SOM), som({ d: 'x' })));
await T.assertFails(setDoc(doc(u1, SOM), som({ at: '1' })));
await T.assertFails(setDoc(doc(u1, SOM), som({ old: true })));
await T.assertFails(setDoc(doc(u2, SOM), som()));
await T.assertFails(setDoc(doc(anon, SOM), som()));
await T.assertFails(setDoc(doc(u2, 'users/u1/meta/sommaire'), { p: { trade: 9 } }, { merge: true }));
await T.assertSucceeds(getDoc(doc(u1, SOM)));
await T.assertFails(getDoc(doc(u2, SOM)));
await T.assertFails(getDoc(doc(anon, SOM)));
await T.assertFails(deleteDoc(doc(u2, SOM)));
ok('sommaire : le compte seul, champs v, p, d, at, old (types et bornes : 30 documents, 3 000 decks), jamais updatedAt ; mises à jour par fusion, deck retiré par deleteField');
{
  const b = writeBatch(u1); b.set(doc(u1, 'users/u1/decks/dsom'), deck()); b.set(doc(u1, SOM), { d: { dsom: 5 } }, { merge: true }); await T.assertSucceeds(b.commit());
  const bad = writeBatch(u1); bad.set(doc(u1, 'users/u1/decks/dsom2'), deck()); bad.set(doc(u1, SOM), { d: { dsom2: 5 }, evil: 1 }, { merge: true }); await T.assertFails(bad.commit());
  assert.equal((await getDoc(doc(u1, 'users/u1/decks/dsom2'))).exists(), false, 'lot refusé : le deck n\'est pas écrit non plus');
  const b2 = writeBatch(u1); b2.delete(doc(u1, 'users/u1/decks/dsom')); b2.set(doc(u1, SOM), { d: { dsom: deleteField() } }, { merge: true }); await T.assertSucceeds(b2.commit());
  await T.assertSucceeds(F.runTransaction(u1, async tx => { const s = await tx.get(doc(u1, 'users/u1/meta/collection')); tx.set(doc(u1, 'users/u1/meta/collection'), coll()); tx.set(doc(u1, SOM), { p: { collection: 6 } }, { merge: true }); return s.exists(); }));
  const agg = (db, path) => F.getAggregateFromServer(query(collection(db, path), where('updatedAt', '>', 0)), { n: F.count(), s: F.sum('updatedAt') });
  await T.assertSucceeds(agg(u1, 'users/u1/meta')); await T.assertSucceeds(agg(u1, 'users/u1/decks'));
  await T.assertFails(agg(u2, 'users/u1/meta')); await T.assertFails(agg(u2, 'users/u1/decks'));
}
ok('sommaire : écrit dans le même lot (ou la même transaction) qu\'un deck ou la collection, lot entier refusé si le sommaire est invalide ; vérification par agrégations pour le compte seul');

const deck = (extra = {}) => ({ name: 'Rakdos', text: '1 Sol Ring', opts: { lang: 'fr', mode: 'zero' }, cards: 1, history: [{ at: 1, total: 1000, mode: 'zero', found: 1, count: 1, sig: '' }], createdAt: 1, updatedAt: Date.now(), ...extra });
const snap = (extra = {}) => ({ at: 1, mode: 'zero', lang: 'fr', sig: 's', items: [{ k: 'sol ring', n: 'Sol Ring', q: 1, s: 'ok', c: 150 }], pv: { 'sol ring': 150 }, pa: 1, ...extra });
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/decks/d1'), deck()));
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/decks/d1'), deck({ snap: snap() })));
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/decks/d1'), deck({ name: 'x'.repeat(120), text: 'x'.repeat(60000), history: list(40, {}), snap: snap({ items: list(400, {}) }) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/decks/d1'), deck({ evil: 1 })));
await T.assertFails(setDoc(doc(u1, 'users/u1/decks/d1'), drop(deck(), 'name')));
await T.assertFails(setDoc(doc(u1, 'users/u1/decks/d1'), drop(deck(), 'text')));
await T.assertFails(setDoc(doc(u1, 'users/u1/decks/d1'), drop(deck(), 'updatedAt')));
await T.assertFails(setDoc(doc(u1, 'users/u1/decks/d1'), deck({ name: '' })));
await T.assertFails(setDoc(doc(u1, 'users/u1/decks/d1'), deck({ name: 'x'.repeat(121) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/decks/d1'), deck({ name: 3 })));
await T.assertFails(setDoc(doc(u1, 'users/u1/decks/d1'), deck({ text: 'x'.repeat(60001) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/decks/d1'), deck({ text: [] })));
await T.assertFails(setDoc(doc(u1, 'users/u1/decks/d1'), deck({ updatedAt: '1' })));
await T.assertFails(setDoc(doc(u1, 'users/u1/decks/d1'), deck({ history: list(41, {}) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/decks/d1'), deck({ history: {} })));
ok('decks : champs connus, nom de 1 à 120 caractères, liste ≤ 60 000, historique ≤ 40 relevés');
await T.assertFails(setDoc(doc(u1, 'users/u1/decks/d1'), deck({ snap: snap({ evil: 1 }) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/decks/d1'), deck({ snap: snap({ items: list(401, {}) }) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/decks/d1'), deck({ snap: snap({ items: {} }) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/decks/d1'), deck({ snap: drop(snap(), 'items') })));
await T.assertFails(setDoc(doc(u1, 'users/u1/decks/d1'), deck({ snap: 'x' })));
ok('decks : prix gardés (snap) facultatifs, champs connus, 400 cartes au plus');
await T.assertSucceeds(getDoc(doc(u1, 'users/u1/decks/d1')));
await T.assertSucceeds(getDocs(collection(u1, 'users/u1/decks')));
await T.assertFails(getDoc(doc(u2, 'users/u1/decks/d1')));
await T.assertFails(getDoc(doc(anon, 'users/u1/decks/d1')));
await T.assertFails(getDocs(collection(u2, 'users/u1/decks')));
await T.assertFails(getDocs(collectionGroup(u1, 'decks')));      // aucune lecture des decks de tous les comptes, même connecté
await T.assertFails(setDoc(doc(u2, 'users/u1/decks/d1'), deck()));
await T.assertFails(setDoc(doc(u2, 'users/u1/decks/d2'), deck()));
await T.assertFails(deleteDoc(doc(u2, 'users/u1/decks/d1')));
await T.assertFails(setDoc(doc(anon, 'users/u1/decks/d2'), deck()));
ok('decks d\'un autre compte : ni lus, ni listés, ni écrits, ni effacés');

const lands = (extra = {}) => ({ owned: { abc: true }, pages: { neo: '12' }, updatedAt: Date.now(), ...extra });
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/binder/lands'), lands()));
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/binder/lands'), drop(lands(), 'pages')));
await T.assertSucceeds(setDoc(doc(u1, 'users/u1/binder/lands'), lands({ owned: keys(5000), pages: keys(1500) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/binder/lands'), lands({ owned: keys(5001) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/binder/lands'), lands({ pages: keys(1501) })));
await T.assertFails(setDoc(doc(u1, 'users/u1/binder/lands'), lands({ pages: [] })));
await T.assertFails(setDoc(doc(u1, 'users/u1/binder/lands'), lands({ owned: [] })));
await T.assertFails(setDoc(doc(u1, 'users/u1/binder/lands'), drop(lands(), 'owned')));
await T.assertFails(setDoc(doc(u1, 'users/u1/binder/lands'), lands({ evil: 1 })));
await T.assertFails(setDoc(doc(u1, 'users/u1/binder/lands'), lands({ updatedAt: '1' })));
await T.assertFails(setDoc(doc(u1, 'users/u1/binder/autre'), lands()));
await T.assertSucceeds(getDoc(doc(u1, 'users/u1/binder/lands')));
await T.assertFails(getDoc(doc(u2, 'users/u1/binder/lands')));
await T.assertFails(setDoc(doc(u2, 'users/u1/binder/lands'), lands()));
await T.assertFails(deleteDoc(doc(u2, 'users/u1/binder/lands')));
ok('classeur Full Art : un seul document « lands », champs et bornes contrôlés, propriétaire seul');

const game = (extra = {}) => ({ createdBy: 'u1', name: 'Partie', at: 1, ...extra });
await T.assertFails(setDoc(doc(anon, 'games/g1'), game()));
await T.assertFails(setDoc(doc(u1, 'games/g1'), game({ createdBy: 'u2' })));
await T.assertFails(setDoc(doc(u1, 'games/g1'), drop(game(), 'createdBy')));
await T.assertSucceeds(setDoc(doc(u1, 'games/g1'), game()));
await T.assertSucceeds(getDoc(doc(u2, 'games/g1')));
await T.assertSucceeds(getDocs(collection(u2, 'games')));
await T.assertFails(getDoc(doc(anon, 'games/g1')));
await T.assertFails(getDocs(collection(anon, 'games')));
ok('parties : créées au nom de son propre compte, lues par tout compte connecté, jamais sans compte');
await T.assertSucceeds(updateDoc(doc(u1, 'games/g1'), { name: 'Partie 2' }));
await T.assertFails(updateDoc(doc(u1, 'games/g1'), { createdBy: 'u2' }));
await T.assertFails(updateDoc(doc(u1, 'games/g1'), { createdBy: deleteField() }));
await T.assertFails(setDoc(doc(u1, 'games/g1'), drop(game(), 'createdBy')));
await T.assertFails(updateDoc(doc(u2, 'games/g1'), { name: 'Pirate' }));
await T.assertFails(setDoc(doc(u2, 'games/g1'), game({ createdBy: 'u2' })));
await T.assertFails(updateDoc(doc(anon, 'games/g1'), { name: 'Pirate' }));
await T.assertFails(deleteDoc(doc(u2, 'games/g1')));
await T.assertFails(deleteDoc(doc(anon, 'games/g1')));
await T.assertSucceeds(deleteDoc(doc(u1, 'games/g1')));
ok('parties : modifiées et supprimées par leur seul créateur, jamais cédées (createdBy inchangé)');

// Decks publics (Communauté) : 10 places par compte, adresse vérifiée, propriétaire seul ; signalements créés une fois, jamais relus
const v1 = env.authenticatedContext('v1', { email_verified: true }).firestore(), v2 = env.authenticatedContext('v2', { email_verified: true }).firestore(), t1 = tag('v1'), t2 = tag('v2');
const pub = (o, extra = {}) => ({ o, by: 'Max', deck: 'd1', name: 'Atraxa', cmd: ['Atraxa, Praetors\' Voice'], ci: 'WUBG', cards: ['1 Sol Ring', '98 Forest'], updatedAt: Date.now(), v: 1, ...extra });
await T.assertFails(setDoc(doc(u1, `pubdecks/${tag('u1')}_0`), pub(tag('u1'))));      // adresse non vérifiée
await T.assertFails(setDoc(doc(anon, `pubdecks/${t1}_0`), pub(t1)));
await T.assertFails(setDoc(doc(v1, `pubdecks/${t2}_0`), pub(t1)));      // place d'un autre compte
await T.assertFails(setDoc(doc(v1, `pubdecks/${t1}_0`), pub(t2)));
for (const id of [`${t1}_10`, t1, `x${t1}_1`, `${t1}_a`]) await T.assertFails(setDoc(doc(v1, 'pubdecks/' + id), pub(t1)));      // 10 places : _0 … _9
for (const [k, v] of [['by', ''], ['by', 'x'.repeat(31)], ['cmd', []], ['cmd', ['a', 'b', 'c']], ['cmd', 'Atraxa'], ['ci', 'GW'], ['ci', 'X'], ['cards', []], ['cards', list(101, '1 X')], ['uid', 'v1'], ['name', 'x'.repeat(121)], ['deck', 'x'.repeat(41)], ['updatedAt', 'x'], ['v', 'x']]) await T.assertFails(setDoc(doc(v1, `pubdecks/${t1}_0`), pub(t1, { [k]: v })));
for (const k of ['o', 'by', 'cmd', 'ci', 'cards', 'updatedAt']) await T.assertFails(setDoc(doc(v1, `pubdecks/${t1}_0`), drop(pub(t1), k)));
await T.assertSucceeds(setDoc(doc(v1, `pubdecks/${t1}_0`), pub(t1)));
await T.assertSucceeds(setDoc(doc(v1, `pubdecks/${t1}_9`), pub(t1, { ci: '', cmd: ['Kozilek', 'Partner'], cards: list(100, '1 X') })));
await T.assertSucceeds(setDoc(doc(v1, `pubdecks/${t1}_0`), pub(t1, { by: 'Max 2' })));      // mise à jour
await T.assertFails(setDoc(doc(v2, `pubdecks/${t1}_0`), pub(t2)));
await T.assertFails(updateDoc(doc(v2, `pubdecks/${t1}_0`), { by: 'Pirate' }));
await T.assertSucceeds(getDoc(doc(v1, `pubdecks/${t1}_0`)));
await T.assertFails(getDoc(doc(v2, `pubdecks/${t1}_0`)));
await T.assertFails(getDoc(doc(anon, `pubdecks/${t1}_0`)));
assert.equal((await T.assertSucceeds(getDocs(query(collection(v1, 'pubdecks'), where('o', '==', t1))))).size, 2, 'ses decks publiés');
await T.assertFails(getDocs(collection(v1, 'pubdecks')));      // jamais la liste de tous : le serveur la sert
await T.assertFails(getDocs(query(collection(v2, 'pubdecks'), where('o', '==', t1))));
await T.assertFails(deleteDoc(doc(v2, `pubdecks/${t1}_0`)));
await T.assertSucceeds(deleteDoc(doc(v1, `pubdecks/${t1}_9`)));
ok('decks publics : 10 places par compte (<empreinte>_0 … _9), adresse vérifiée, champs bornés ; lus, modifiés et retirés par leur seul auteur');
const rep = (d, extra = {}) => ({ d, at: Date.now(), ...extra });
await T.assertFails(setDoc(doc(u2, `pubreports/${t1}_0~${tag('u2')}`), rep(`${t1}_0`)));      // adresse non vérifiée
await T.assertFails(setDoc(doc(v2, `pubreports/${t1}_0~${t1}`), rep(`${t1}_0`)));      // au nom d'un autre
await T.assertFails(setDoc(doc(v2, `pubreports/${t1}_1~${t2}`), rep(`${t1}_0`)));
await T.assertFails(setDoc(doc(v2, `pubreports/x~${t2}`), rep('x')));
await T.assertFails(setDoc(doc(v2, `pubreports/${t1}_0~${t2}`), rep(`${t1}_0`, { why: 'spam' })));
await T.assertFails(setDoc(doc(v2, `pubreports/${t1}_0~${t2}`), drop(rep(`${t1}_0`), 'at')));
await T.assertSucceeds(setDoc(doc(v2, `pubreports/${t1}_0~${t2}`), rep(`${t1}_0`)));
await T.assertFails(setDoc(doc(v2, `pubreports/${t1}_0~${t2}`), rep(`${t1}_0`)));      // une fois par deck
await T.assertFails(getDoc(doc(v2, `pubreports/${t1}_0~${t2}`)));
await T.assertFails(getDocs(collection(v1, 'pubreports')));
await T.assertFails(deleteDoc(doc(v2, `pubreports/${t1}_0~${t2}`)));
ok('signalements : un par compte et par deck, à son nom, jamais relus, modifiés ni effacés par l\'appli');

// Suppression du compte (cloud.js, wipe) : un seul lot efface decks, documents annexes et classeur, qu'ils existent ou non
const wipe = (db, uid) => { const b = writeBatch(db); for (const p of ['meta/sommaire', 'decks/d1', 'decks/x', 'meta/collection', 'meta/engaged', 'meta/history', 'meta/trade', 'meta/profile', 'binder/lands']) b.delete(doc(db, `users/${uid}/${p}`)); return b.commit(); };
await T.assertFails(wipe(u2, 'u1'));
assert.ok((await getDoc(doc(u1, 'users/u1/meta/profile'))).exists(), 'lot refusé : rien d\'effacé');
await T.assertSucceeds(wipe(u1, 'u1'));
await T.assertSucceeds(wipe(u2, 'u2'));      // compte sans aucun document : le lot passe quand même
ok('suppression du compte : tout part en un lot, pour son seul propriétaire');

await T.assertFails(setDoc(doc(u1, 'users/u1'), { a: 1 }));
await T.assertFails(getDoc(doc(u1, 'users/u1')));
await T.assertFails(setDoc(doc(u1, 'users/u1/autre/x'), { updatedAt: 1 }));
await T.assertFails(setDoc(doc(u1, 'users/u1/decks/d1/sous/x'), { a: 1 }));      // les règles d'un document ne valent pas pour ses sous-collections
await T.assertFails(setDoc(doc(u1, 'shares/t2/sous/x'), { a: 1 }));
await T.assertFails(getDoc(doc(anon, 'config/app')));
await T.assertFails(setDoc(doc(u1, 'config/app'), { a: 1 }));
ok('tout le reste : refusé par défaut');
// Amis (proxy.mjs › /api/friends) : collections du serveur seul (compte de service, hors règles) ; aucune règle ne les ouvre à l'appli
for (const c of ['amis', 'amisdata', 'amisys']) {
  await T.assertFails(getDoc(doc(u1, `${c}/${tag('u1')}`)));      // même son propre document
  await T.assertFails(setDoc(doc(u1, `${c}/${tag('u1')}`), { j: '{}', at: 1 }));
  await T.assertFails(deleteDoc(doc(u1, `${c}/${tag('u1')}_t`)));
  await T.assertFails(getDocs(collection(u1, c)));
  await T.assertFails(getDoc(doc(anon, `${c}/due`)));
}
ok('amis : collections du serveur jamais lues ni écrites par l\'appli (refus par défaut)');

await env.cleanup();
console.log('RULES OK');
process.exit(0);
