// Vrai SDK Firebase 12.19 (Node) : auth simulée au niveau fetch, Firestore hors ligne (écritures locales + listeners).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (uid, email) => { const n = Math.floor(Date.now() / 1000); return [b64({ alg: 'RS256', typ: 'JWT', kid: 'x' }), b64({ iss: 'https://securetoken.google.com/m2s-mtg', aud: 'm2s-mtg', auth_time: n, user_id: uid, sub: uid, iat: n, exp: n + 3600, email, email_verified: false, firebase: { identities: { email: [email] }, sign_in_provider: 'password' } }), 'sig'].join('.'); };
const users = new Map(); const calls = []; const oobs = []; const verified = new Set();
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (/identitytoolkit|securetoken/.test(u)) {
    const body = init.body ? (typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : init.body) : {};
    calls.push(u.split('?')[0].split('/').pop());
    const j = o => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    const err = (message) => new Response(JSON.stringify({ error: { code: 400, message } }), { status: 400, headers: { 'content-type': 'application/json' } });
    if (/accounts:signUp/.test(u)) {
      if (users.has(body.email)) return err('EMAIL_EXISTS');
      users.set(body.email, { uid: 'uid-' + users.size, pw: body.password });
      const us = users.get(body.email); return j({ kind: 'x', idToken: jwt(us.uid, body.email), email: body.email, refreshToken: 'r', expiresIn: '3600', localId: us.uid });
    }
    if (/accounts:signInWithPassword/.test(u)) {
      const us = users.get(body.email); if (!us || us.pw !== body.password) return err('INVALID_LOGIN_CREDENTIALS');
      return j({ kind: 'x', idToken: jwt(us.uid, body.email), email: body.email, refreshToken: 'r', expiresIn: '3600', localId: us.uid, registered: true });
    }
    if (/accounts:lookup/.test(u)) {
      const em = [...users.entries()].find(([, v]) => true)?.[0];
      const entry = [...users.entries()].pop();
      return j({ users: [{ localId: entry[1].uid, email: entry[0], emailVerified: verified.has(entry[0]), providerUserInfo: [{ providerId: 'password', email: entry[0], federatedId: entry[0], rawId: entry[0] }], lastLoginAt: String(Date.now()), createdAt: String(Date.now()) }] });
    }
    if (/accounts:sendOobCode/.test(u)) { const h = new Headers(init.headers || {}); oobs.push({ type: body.requestType, url: body.continueUrl || '', lang: h.get('X-Firebase-Locale') || '' }); return j({ email: body.email }); }
    return err('UNHANDLED ' + u);
  }
  return realFetch(url, init);
};

const app = await import('firebase/app'), auth = await import('firebase/auth'), fs = await import('firebase/firestore');
const { makeCloud, authMessage, cloudClearLocal } = require('../src/cloud.js');
const cloud = makeCloud({ app, auth, fs });
console.log('✓ makeCloud avec le vrai SDK (repli getFirestore sans IndexedDB)');
{ // domaine d'authentification : manaorbit.app seulement sur ce site (relais /__/auth/* de proxy.mjs), Firebase ailleurs
  const vm = await import('node:vm'), { readFileSync } = await import('node:fs'), src = readFileSync('src/cloud.js', 'utf8');
  const dom = (hostname, win) => { const c = vm.createContext({ location: { hostname }, ...(win ? { window: win } : {}) }); vm.runInContext(src, c); return vm.runInContext('FIREBASE_CONFIG.authDomain', c); };
  assert.equal(require('../src/cloud.js').FIREBASE_CONFIG.authDomain, 'm2s-mtg.firebaseapp.com', 'Node : domaine de Firebase');
  assert.equal(dom('manaorbit.app', {}), 'manaorbit.app');
  assert.equal(dom('127.0.0.1', {}), 'm2s-mtg.firebaseapp.com');
  assert.equal(dom('card.m2s-photo.fr', {}), 'm2s-mtg.firebaseapp.com', 'ancienne adresse : domaine de Firebase');
  assert.equal(dom('www.manaorbit.app', {}), 'm2s-mtg.firebaseapp.com');
  console.log('✓ authDomain : manaorbit.app sur manaorbit.app, m2s-mtg.firebaseapp.com ailleurs');
}

// état initial
const seen = [];
const unsub = cloud.onUser(u => seen.push(u && u.email));
await new Promise(r => setTimeout(r, 200));
assert.deepEqual(seen, [null]); console.log('✓ onUser : null au départ');

// inscription / doublon / connexion / mauvais mot de passe
const cred = await cloud.signUp('beer@example.com', 'secret1'); assert.equal(cred.user.email, 'beer@example.com');
await new Promise(r => setTimeout(r, 100)); assert.equal(seen.at(-1), 'beer@example.com'); console.log('✓ signUp + onUser(user)');
await assert.rejects(cloud.signUp('beer@example.com', 'secret1'), e => e.code === 'auth/email-already-in-use'); console.log('✓ doublon → auth/email-already-in-use');
await cloud.signOut(); await new Promise(r => setTimeout(r, 100)); assert.equal(seen.at(-1), null); console.log('✓ signOut');
await assert.rejects(cloud.signIn('beer@example.com', 'nope'), e => e.code === 'auth/invalid-credential'); console.log('✓ mauvais mot de passe → auth/invalid-credential');
const c2 = await cloud.signIn('beer@example.com', 'secret1'); const uid = c2.user.uid; assert.ok(uid); console.log('✓ signIn', uid);
await cloud.reset('beer@example.com'); assert.ok(calls.includes('accounts:sendOobCode')); console.log('✓ reset (sendOobCode)');
// adresse e-mail : lien de vérification (langue de l'appli, sans adresse de retour hors https), puis relecture du compte une fois le lien touché
await cloud.verify(); assert.deepEqual(oobs.at(-1), { type: 'VERIFY_EMAIL', url: '', lang: 'fr' }); assert.equal(c2.user.emailVerified, false);
verified.add('beer@example.com'); await cloud.reload(); assert.equal(c2.user.emailVerified, true, 'reload : objet utilisateur mis à jour sur place');
console.log('✓ verify (sendOobCode VERIFY_EMAIL, langue fr) + reload (emailVerified relu)');

// Firestore hors ligne : listeners + écritures locales
const db = fs.getFirestore(app.getApp()); await fs.disableNetwork(db);
const states = []; let resolveNext;
const un = cloud.watch(uid, (docs, pending) => { states.push({ ids: docs.map(d => d.id), names: docs.map(d => d.data.name), data: docs.map(d => d.data), pending }); resolveNext && resolveNext(); }, e => states.push({ err: e.code }));
const next = () => new Promise(r => { resolveNext = r; setTimeout(r, 500); });
await next();
assert.deepEqual(states.at(-1).ids, []); console.log('✓ watch : liste vide');

const id1 = cloud.newId(uid); assert.match(id1, /^[A-Za-z0-9]{20}$/);
const id2 = cloud.newId(uid); assert.notEqual(id1, id2);
let p = next(); cloud.save(uid, id1, { name: 'Alpha', text: '1 Sol Ring', updatedAt: 100, createdAt: 100 }).catch(() => {}); await p;
assert.deepEqual(states.at(-1).names, ['Alpha']); assert.equal(states.at(-1).pending, true); console.log('✓ save : visible aussitôt, hasPendingWrites=true');
p = next(); cloud.save(uid, id2, { name: 'Beta', text: '1 Path to Exile', updatedAt: 200, createdAt: 200 }).catch(() => {}); await p;
assert.deepEqual(states.at(-1).names, ['Beta', 'Alpha']); console.log('✓ tri par updatedAt décroissant');
p = next(); cloud.save(uid, id1, { name: 'Alpha 2', text: '1 Sol Ring', updatedAt: 300, createdAt: 100 }).catch(() => {}); await p;
assert.deepEqual(states.at(-1).names, ['Alpha 2', 'Beta']); console.log('✓ mise à jour du même document');
p = next(); cloud.remove(uid, id2).catch(() => {}); await p;
assert.deepEqual(states.at(-1).names, ['Alpha 2']); console.log('✓ remove');
p = next(); cloud.saveMany(uid, [{ id: cloud.newId(uid), data: { name: 'Imp 1', text: 'x', updatedAt: 400, createdAt: 400 } }, { id: cloud.newId(uid), data: { name: 'Imp 2', text: 'x', updatedAt: 500, createdAt: 500 } }]).catch(() => {}); await p;
assert.deepEqual(states.at(-1).names, ['Imp 2', 'Imp 1', 'Alpha 2']); console.log('✓ saveMany (batch)');
// relevé de prix par carte : liste de maps imbriquées dans le document, relue à l'identique
{
  const C = require('../src/core.js');
  const snap = { at: 700, mode: 'zero', lang: 'fr', sig: 'fr|SP|no', items: [{ k: 'sol ring', n: 'Sol Ring', q: 1, s: 'ok', c: 150, l: 'fr', d: 'NM', cm: 1, tl: 'Artifact', im: 'https://cards.scryfall.io/small/front/a/b/x.jpg' }, { k: 'forest', n: 'Forest', q: 5, s: 'basic' }] };
  const doc = C.deckDoc({ name: 'Avec prix', text: '1 Sol Ring', snap }, 700);
  p = next(); cloud.save(uid, cloud.newId(uid), doc).catch(() => {}); await p;
  const got = states.at(-1).data.find(d => d.name === 'Avec prix');
  assert.deepEqual(got.snap, snap, 'snap relu tel quel'); assert.deepEqual(C.readDeck('z', got).snap, snap);
  assert.deepEqual(Object.keys(doc).sort(), ['cards', 'createdAt', 'history', 'name', 'opts', 'snap', 'text', 'updatedAt'], 'champs du document = ceux autorisés par firestore.rules');
  console.log('✓ relevé de prix (snap) : écrit et relu dans Firestore');
}
// collection : écoute (3e argument = vient du cache), transaction et lecture serveur — hors ligne elles doivent échouer proprement, jamais rester suspendues
{
  const got = []; const un2 = cloud.watchColl(uid, (data, pending, fromCache) => got.push({ data, pending, fromCache }), e => got.push({ err: e.code }));
  await new Promise(r => setTimeout(r, 600));
  assert.ok(got.length && got[0].data === null && got[0].fromCache === true, 'écoute : document absent, lu depuis le cache (fromCache = true)'); console.log('✓ watchColl : 3e argument fromCache');
  const race = (pr, ms) => Promise.race([pr.then(() => ({ ok: true }), e => ({ code: e && e.code, msg: e && e.message })), new Promise(r => setTimeout(() => r({ hang: true }), ms))]);
  // txColl : exige le réseau (le SDK Node ignore disableNetwork pour les transactions et tente une vraie connexion : non testable ici ; mesuré à la main : rejet « unavailable » en ~7 s)
  assert.equal(typeof cloud.txColl, 'function'); console.log('✓ txColl exposée');
  let t0;
  t0 = Date.now(); const pl = await race(cloud.pullColl(uid), 30000);
  console.log('  pullColl hors ligne →', JSON.stringify(pl), (Date.now() - t0) + ' ms');
  assert.ok(!pl.hang && !pl.ok, 'pullColl hors ligne échoue sans rester suspendue'); console.log('✓ pullColl hors ligne : rejet propre');
  un2();
}
un(); unsub();

{ // Suppression du compte (faux SDK : le vrai Firestore hors ligne ne lit pas le serveur) : liens publics, decks publics, decks, documents annexes, puis le compte
  const T1 = createHash('sha256').update('u1').digest('hex'), T2 = createHash('sha256').update('u2').digest('hex');
  const log = [], store = new Map([['users/u1/decks/d1', {}], ['users/u1/decks/d2', {}], ['users/u1/meta/trade', { share: 'S1', dsh: { d1: 'S2', d2: '' } }], ['users/u1/meta/collection', { count: 1, updatedAt: 1, parts: [{ h: 'a', n: 1 }, { h: 'b', n: 1 }] }], ['users/u1/meta/collection/parts/0', {}], ['users/u1/meta/collection/parts/1', {}], ['shares/S1', {}], ['shares/S2', {}], ['shares/S3', {}], ['shares/REFUS', {}], ['shares/AUTRE', {}], [`pubdecks/${T1}_0`, { o: T1 }], [`pubdecks/${T1}_4`, { o: T1 }], [`pubdecks/${T2}_0`, { o: T2 }]]);
  const ref = (...p) => ({ path: p.slice(1).join('/') });
  const user = { email: 'a@b.c', providerData: [{ providerId: 'password' }] };
  let google = { refuse: false };
  const m = {
    app: { getApps: () => [1], getApp: () => ({}) },
    auth: { getAuth: () => ({ currentUser: user }), EmailAuthProvider: { credential: (e, p) => ({ e, p }) }, GoogleAuthProvider: class { setCustomParameters() {} static credential(t) { return { t }; } },
      reauthenticateWithCredential: async (u, c) => { log.push('reauth:' + (c.p || c.t)); if (c.p !== 'ok' && !(c.t && !google.refuse)) throw Object.assign(new Error('x'), { code: 'auth/invalid-credential' }); },
      signInWithCredential: async (a, c) => { log.push('cred:' + c.t); if (google.refuse) throw Object.assign(new Error('x'), { code: 'auth/invalid-credential' }); return { user }; },
      signInWithPopup: async () => { log.push('popup-in'); if (google.refuse) throw Object.assign(new Error('x'), { code: 'auth/invalid-credential' }); },
      reauthenticateWithPopup: async () => { log.push('popup'); if (google.refuse) throw Object.assign(new Error('x'), { code: 'auth/invalid-credential' }); }, deleteUser: async u => { log.push('deleteUser:' + u.email); } },
    fs: { initializeFirestore: () => ({}), persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}), collection: (...p) => ({ path: p.slice(1).join('/') }), doc: (...p) => p.length === 1 ? { id: 'n' } : ref(...p),
      getDocFromServer: async r => ({ exists: () => store.has(r.path), data: () => store.get(r.path) }),
      query: (c, w) => ({ ...c, w }), where: (f, op, v) => ({ f, op, v }),
      getDocsFromServer: async c => ({ docs: [...store.keys()].filter(k => k.startsWith(c.path + '/') && (!c.w || store.get(k)[c.w.f] === c.w.v)).map(k => ({ id: k.split('/').pop(), ref: { path: k } })) }),
      deleteDoc: async r => { log.push('del:' + r.path); if (r.path === 'shares/REFUS') throw Object.assign(new Error('refusé'), { code: 'permission-denied' }); store.delete(r.path); },
      writeBatch: () => { const ops = []; return { delete: r => ops.push(r.path), commit: async () => { log.push('batch:' + ops.length); ops.forEach(k => store.delete(k)); } }; },
      terminate: async () => { log.push('terminate'); }, clearIndexedDbPersistence: async () => { log.push('clearPersistence'); } },
  };
  const c = makeCloud(m);
  assert.equal(c.provider(), 'password');
  await assert.rejects(c.reauth('mauvais'), e => e.code === 'auth/invalid-credential');
  await c.reauth('ok');
  // lot : sommaire, decks, 11 documents annexes (dont events, événements saisonniers), les 2 morceaux de la collection découpée, classeur ; liens connus de l'appareil seulement (S3), déjà retiré (PARTI : pas de suppression tentée), doublon (S1), refusé (REFUS : compté, on continue)
  const r = await c.wipe('u1', ['S3', 'S1', 'PARTI', 'REFUS', '']); await c.deleteUser();
  assert.deepEqual(r, { decks: 2, shares: 5, pub: 2, failed: 1 });
  assert.deepEqual([...store.keys()], ['shares/REFUS', 'shares/AUTRE', `pubdecks/${T2}_0`], 'tout le compte effacé (sauf le lien refusé), rien d\'autre');
  assert.deepEqual(log, ['reauth:mauvais', 'reauth:ok', 'del:shares/S1', 'del:shares/S2', 'del:shares/S3', 'del:shares/REFUS', `del:pubdecks/${T1}_0`, `del:pubdecks/${T1}_4`, 'batch:17', 'deleteUser:a@b.c']);
  user.providerData = [{ providerId: 'google.com' }]; assert.equal(c.provider(), 'google'); await c.reauth(null); assert.equal(log.at(-1), 'popup');
  console.log('✓ suppression du compte : reconnexion, liens publics (compte + appareil, absents ignorés, échecs comptés), decks publics du compte, decks, documents annexes et morceaux de la collection effacés, puis le compte');

  // cache Firestore de l'appareil : par le SDK (arrêt puis effacement), sinon bases IndexedDB « firestore/… »
  log.length = 0; assert.equal(await cloudClearLocal(c), true); assert.deepEqual(log, ['terminate', 'clearPersistence']);
  const gone = []; globalThis.indexedDB = { databases: async () => [{ name: 'firestore/[DEFAULT]/m2s-mtg/main' }, { name: 'firebaseLocalStorageDb' }, { name: 'deckdeal' }], deleteDatabase: n => { gone.push(n); const q = {}; setTimeout(() => q.onsuccess && q.onsuccess()); return q; } };
  assert.equal(await cloudClearLocal(null), false); assert.deepEqual(gone, ['firestore/[DEFAULT]/m2s-mtg/main'], 'sans SDK : seules les bases Firestore');
  gone.length = 0; assert.equal(await cloudClearLocal({ clearLocal: async () => { throw Object.assign(new Error('autre onglet'), { code: 'failed-precondition' }); } }), false); assert.deepEqual(gone, ['firestore/[DEFAULT]/m2s-mtg/main'], 'SDK en échec : repli');
  globalThis.indexedDB = { databases: () => new Promise(() => {}) }; const t0 = Date.now(); await cloudClearLocal({ clearLocal: () => new Promise(() => {}) });
  assert.ok(Date.now() - t0 < 9000, 'jamais bloquant'); delete globalThis.indexedDB;
  console.log('✓ cache Firestore effacé : SDK (terminate + clearIndexedDbPersistence), repli IndexedDB, jamais bloquant');

  // connexion Google : jeton refusé ≠ « mot de passe incorrect » ; APK sans plugin : jamais la fenêtre web ; message du plugin affiché
  google.refuse = true; log.length = 0;
  await assert.rejects(c.google(), e => e.code === 'auth/google-refused'); await assert.rejects(c.reauth(null), e => e.code === 'auth/google-refused');
  assert.match(authMessage({ code: 'auth/google-refused' }), /^Google a refusé la connexion : réessaie, ou utilise ton e-mail\.$/); assert.match(authMessage({ code: 'auth/invalid-credential' }), /incorrect/, 'e-mail : inchangé');
  globalThis.isNativeApp = () => true; let plugin = null; globalThis.natPlugin = () => plugin; log.length = 0;
  await assert.rejects(c.google(), e => e.code === 'auth/native-missing'); await assert.rejects(c.reauth(null), e => e.code === 'auth/native-missing');
  assert.deepEqual(log, [], 'APK sans plugin : ni signInWithPopup ni reauthenticateWithPopup');
  assert.equal(authMessage({ code: 'auth/native-missing' }), 'Connexion Google indisponible dans cette version de l\'appli : mets-la à jour, ou utilise ton e-mail.');
  const warns = [], warn = console.warn; console.warn = (...a) => warns.push(a.join(' '));
  plugin = { signInWithGoogle: async () => { throw new Error('10: <b>Developer</b> error & "SHA-1"'); } };
  const ng = await c.google().catch(e => e); console.warn = warn;
  assert.equal(ng.code, 'auth/native-google'); assert.match(warns.join(), /10: <b>Developer/, 'message natif dans la console');
  assert.equal(authMessage(ng), 'Connexion Google impossible sur ce téléphone. Réessaie, ou utilise ton e-mail. (10: b Developer /b error SHA-1)', 'message du plugin ajouté, sans balisage');
  plugin = { signInWithGoogle: async () => { throw new Error('The user canceled the sign-in flow.'); } }; assert.equal(authMessage(await c.google().catch(e => e)), null, 'annulation : silence');
  plugin = { signInWithGoogle: async () => ({ credential: { idToken: 'jeton' } }) }; google.refuse = false; log.length = 0;
  await c.google(); await c.reauth(null); assert.deepEqual(log, ['cred:jeton', 'reauth:jeton']);
  delete globalThis.isNativeApp; delete globalThis.natPlugin;
  console.log('✓ Google : jeton refusé → message Google ; APK sans plugin → « mets-la à jour », sans fenêtre web ; erreur native détaillée');
}
{      // écoute en erreur (quota du jour, réseau) : relancée seule après un délai, tout de suite sur relance() ; arrêtée : plus jamais relancée (makeSum › legacyOn)
  const { makeSum, SUB_RETRY } = require('../src/cloud.js'); const keep = { ...SUB_RETRY }; SUB_RETRY.first = 30; SUB_RETRY.max = 60;
  let calls = 0; const plan = [];      // plan[i] : 'err' | 'ok' pour la i-e écoute ouverte
  const fakeFs = { doc: (db, ...p) => ({ path: p.join('/') }), onSnapshot: (ref, o, next, err) => {
    const i = calls++, what = plan[i] || 'ok';
    setTimeout(() => (what === 'err' ? err(Object.assign(new Error('quota'), { code: 'resource-exhausted' })) : next({ exists: () => true, data: () => ({ updatedAt: i }), metadata: { hasPendingWrites: false, fromCache: false } })), 5);
    return () => {};
  } };
  const sm = makeSum({ fs: fakeFs }, {}, () => ({}));
  const got = [], errs = [], wait = ms => new Promise(r => setTimeout(r, ms));
  plan.push('err', 'err', 'ok');
  const off = sm.sub('u1', { kind: 'meta', id: 'collection', onData: d => got.push(d.updatedAt), onErr: e => errs.push(e.code) });
  await wait(20); assert.deepEqual([errs, got, calls], [['resource-exhausted'], [], 1], '1re écoute en erreur : abonné prévenu');
  await wait(45); assert.deepEqual([errs.length, calls], [2, 2], 'relancée après 30 ms, de nouveau en erreur');
  await wait(90); assert.deepEqual([got, calls], [[2], 3], 'relancée après 60 ms : données reçues');
  plan.push('err'); calls = 3;
  const sm2 = makeSum({ fs: fakeFs }, {}, () => ({})); SUB_RETRY.first = 5000; SUB_RETRY.max = 5000;
  const got2 = [], off2 = sm2.sub('u2', { kind: 'meta', id: 'collection', onData: d => got2.push(d.updatedAt), onErr: () => {} });
  await wait(20); assert.equal(calls, 4, 'en erreur, relance dans 5 s'); sm2.relance(); await wait(20); assert.deepEqual([calls, got2], [5, [4]], 'relance() (réseau revenu, appli au premier plan) : tout de suite');
  plan[5] = 'err'; off(); off2();
  const sm3 = makeSum({ fs: fakeFs }, {}, () => ({})); SUB_RETRY.first = 20;
  const off3 = sm3.sub('u3', { kind: 'meta', id: 'collection', onData: () => {}, onErr: () => {} }); await wait(10); off3(); await wait(60);
  assert.equal(calls, 6, 'abonnement arrêté pendant l\'attente : pas relancé');
  Object.assign(SUB_RETRY, keep);
  console.log('✓ écoute Firestore en erreur (quota) : abonné prévenu, relancée seule (délai croissant) puis tout de suite par relance(), jamais après l\'arrêt');
}
{      // collection découpée (cloud.js › collSplit, collPlan, makeSum › tx, collSnap, pull) : fonctions pures, puis deux « appareils » sur un faux Firestore
  const X = require('../src/cloud.js'), C = require('../src/core.js');
  for (const k of ['one', 'part', 'min', 'div', 'n', 'max']) assert.equal(C.COLL_LIM[k], X.COLL_PARTS_DEF[k], 'core.js › COLL_LIM = cloud.js › COLL_PARTS_DEF : ' + k);
  assert.deepEqual([C.COLL_LIM.one, C.COLL_LIM.part, C.COLL_LIM.n], [900000, 800000, 12], 'mêmes bornes que firestore.rules (document unique, morceau, nombre de morceaux)');
  const L = { one: 300, part: 400, min: 100, div: 4, n: 12, max: 5000 };
  const lines = n => Array.from({ length: n }, (_, i) => `${1 + (i % 3)} Carte numéro ${i} *FR*`), big = lines(60).join('\n');
  assert.equal(X.utf8Len('aé€😀'), 1 + 2 + 3 + 4); assert.equal(X.collHash(big), X.collHash(big)); assert.notEqual(X.collHash(big), X.collHash(big + ' '));
  const ch = X.collSplit(big, L);
  assert.equal(ch.join('\n'), big, 'morceaux recollés = texte'); assert.ok(ch.length > 3 && ch.every(c => X.utf8Len(c) <= L.part), 'morceaux ≤ part octets');
  assert.ok(ch.slice(0, -1).every(c => X.utf8Len(c) + 1 >= L.min), 'coupés après min octets'); assert.ok(ch.every(c => !c.startsWith('\n')), 'aux fins de ligne');
  assert.deepEqual(X.collSplit(big, L), ch, 'même texte, même découpe (deux appareils)');
  assert.deepEqual(X.collSplit('', L), [''], 'texte vide : un morceau');
  const ins = lines(60); ins.splice(30, 0, '4 Carte ajoutée'); const ch2 = X.collSplit(ins.join('\n'), L);
  const changed = ch2.filter(c => !ch.includes(c)).length;
  assert.ok(changed >= 1 && changed <= 2, 'une ligne ajoutée au milieu : son morceau (au plus le voisin) change seulement (' + changed + ' sur ' + ch2.length + ')');
  // plans d'écriture : document unique tel quel ; découpée ; une carte changée ; retour au document unique ; trop grosse
  const out = (text, at = 5) => ({ text, count: 7, updatedAt: at });
  assert.deepEqual(X.collPlan(out('1 Sol Ring'), null, L), { main: out('1 Sol Ring'), put: [], del: [], split: false, chunks: [] }, 'sous le plafond : exactement le document d\'avant');
  assert.deepEqual(X.collPlan(out('1 Sol Ring'), { text: 'x', updatedAt: 1, parts: [] }, L).main, out('1 Sol Ring'), 'déjà revenue au document unique : plus de parts');
  const p1 = X.collPlan(out(big), { text: 'x', updatedAt: 1 }, L);
  assert.equal(p1.split, true); assert.equal(p1.put.length, ch.length, 'découpage : tous les morceaux écrits'); assert.deepEqual(p1.del, []);
  assert.deepEqual(Object.keys(p1.main).sort(), ['count', 'parts', 'updatedAt'], 'principal : sans text'); assert.deepEqual(p1.main.parts.map(p => p.n), ch.map(c => c.length));
  const p2 = X.collPlan(out(ins.join('\n'), 6), p1.main, L), slots = pl => pl.main.parts.map(p => p.i);
  assert.equal(p2.put.length, changed, 'une carte de plus : seuls les morceaux nouveaux écrits'); assert.ok(p2.put.every(([i, c]) => p2.main.parts.some(p => p.i === i && p.h === c.h) && typeof c.text === 'string'));
  assert.ok(p2.main.parts.every((p, k) => !ch.includes(ch2[k]) || p1.main.parts[ch.indexOf(ch2[k])].i === p.i), 'morceau inchangé : même document, même s\'il change de place');
  assert.equal(new Set(slots(p2)).size, ch2.length, 'un document par morceau'); assert.ok(slots(p2).every(i => i >= 0 && i < L.n), 'numéros 0…n-1 (règles : 0…11)');
  const p3 = X.collPlan(out(lines(60).slice(0, 35).join('\n'), 7), p2.main, L);
  assert.ok(p3.del.length > 0 && p3.del.every(i => slots(p2).includes(i) && !slots(p3).includes(i)) && slots(p2).every(i => slots(p3).includes(i) || p3.del.includes(i)), 'documents restés sans morceau supprimés');
  const p4 = X.collPlan(out('1 Sol Ring', 8), p3.main, L);
  assert.deepEqual([p4.split, p4.main.parts, p4.main.text, p4.del.sort()], [false, [], '1 Sol Ring', slots(p3).sort()], 'repassée sous le plafond : document unique, parts: [], morceaux supprimés');
  assert.throws(() => X.collPlan(out('x'.repeat(5001)), null, L), e => e.code === 'too-big' && e.len === 5001 && !e.rules, 'au-delà du plafond total : trop grosse');
  assert.throws(() => X.collPlan(out('1 a\n' + 'x'.repeat(450)), null, L), e => e.code === 'too-big', 'une ligne plus grosse qu\'un morceau : trop grosse');
  assert.throws(() => X.collPlan(out(lines(400).join('\n').slice(0, 4999)), null, { ...L, n: 3 }), e => e.code === 'too-big', 'plus de n morceaux : trop grosse');
  console.log('✓ collection découpée : morceaux aux fins de ligne (≤ part octets, recollés à l\'identique, même découpe partout, une carte ajoutée ne change que son morceau) ; plans d\'écriture (document unique tel quel, découpage, morceaux changés seuls, retour au document unique, trop grosse)');

  // faux Firestore partagé : lectures (écoute, lecture directe, transaction) et écritures comptées ; règles des morceaux publiées ou non ; latence nulle
  globalThis.COLL_LIM = { ...L, warn: 0.8 };
  const db = { docs: new Map(), reads: 0, writes: 0, subs: new Set(), rules: true, log: [] };
  const clone = d => (d == null ? null : JSON.parse(JSON.stringify(d)));
  const snapOf = (d, md = {}) => ({ exists: () => d != null, data: () => clone(d), metadata: { hasPendingWrites: false, fromCache: false, ...md } });
  const tick = () => new Promise(r => setTimeout(r, 0));
  const notify = path => { for (const s of db.subs) if (s.path === path) { db.reads++; db.log.push('L ' + path); s.next(snapOf(db.docs.get(path))); } };
  const fake = { doc: (_, ...p) => ({ path: p.join('/') }),
    onSnapshot: (ref, o, next) => { const s = { path: ref.path, next }; db.subs.add(s); tick().then(() => { if (db.subs.has(s)) { db.reads++; db.log.push('L ' + ref.path); next(snapOf(db.docs.get(ref.path))); } }); return () => db.subs.delete(s); },
    getDocFromServer: async ref => { db.reads++; db.log.push('G ' + ref.path); return snapOf(db.docs.get(ref.path)); },
    getDocFromCache: async () => { throw Object.assign(new Error('absent'), { code: 'unavailable' }); },
    runTransaction: async (_, fn) => {
      const w = [], t = { get: async ref => { db.reads++; db.log.push('T ' + ref.path); return snapOf(db.docs.get(ref.path)); }, set: (ref, d) => w.push([ref.path, clone(d)]), delete: ref => w.push([ref.path, null]) };
      const r = await fn(t);
      if (!db.rules && w.some(([p, d]) => /\/parts\//.test(p) || (d && 'parts' in d))) throw Object.assign(new Error('refusé'), { code: 'permission-denied' });      // règles d'avant : ni morceaux ni parts
      for (const [p, d] of w) { db.writes++; db.log.push('W ' + p); if (d == null) db.docs.delete(p); else db.docs.set(p, d); }
      await tick(); for (const p of new Set(w.map(x => x[0]))) notify(p);
      return r;
    } };
  const MAIN = 'users/u9/meta/collection', parts = () => [...db.docs.keys()].filter(k => k.startsWith(MAIN + '/parts/')).sort();
  const dev = () => { const sm = X.makeSum({ fs: fake }, {}, () => ({ path: 'users/u9/decks' })), got = []; const off = sm.sub('u9', { kind: 'meta', id: 'collection', onData: (d, p, c) => got.push({ d, p, c }), onErr: e => got.push({ err: e.code }) }); return { sm, got, off, last: () => got.at(-1) }; };
  const wait = async (f, ms = 2000) => { for (const t0 = Date.now(); !f(); ) { if (Date.now() - t0 > ms) throw new Error('délai'); await new Promise(r => setTimeout(r, 5)); } };
  const count = () => ({ r: db.reads, w: db.writes }), since = c0 => ({ r: db.reads - c0.r, w: db.writes - c0.w });
  db.docs.set(MAIN, { text: '1 Sol Ring', count: 1, updatedAt: 1 });
  const A = dev(), B = dev();
  await wait(() => A.got.length && B.got.length);
  assert.deepEqual(A.last().d, { text: '1 Sol Ring', count: 1, updatedAt: 1 }, 'document unique : livré tel quel');
  let c0 = count();
  await A.sm.tx('u9', d => ({ text: '2 Sol Ring', count: 1, updatedAt: d.updatedAt + 1 }));
  await wait(() => B.last().d.text === '2 Sol Ring');
  assert.deepEqual(since(c0), { r: 3, w: 1 }, 'sous le plafond : 1 lecture + 1 écriture, 1 lecture par appareil qui écoute (comme avant)'); assert.deepEqual(db.docs.get(MAIN), { text: '2 Sol Ring', count: 1, updatedAt: 2 });
  // au-delà : découpée sur A, relue sur B
  c0 = count(); db.log.length = 0;
  await A.sm.tx('u9', d => ({ text: big, count: 120, updatedAt: d.updatedAt + 1 }));
  await wait(() => B.last().d.text === big);
  assert.deepEqual(parts(), ch.map((c, i) => MAIN + '/parts/' + i).sort(), 'morceaux 0…n-1'); assert.equal(db.docs.get(MAIN).text, undefined, 'principal sans text');
  assert.deepEqual(since(c0), { r: 1 + 2 + ch.length, w: 1 + ch.length }, 'découpage : principal + tous les morceaux écrits ; A (écho) : rien à relire, B : principal + chaque morceau (' + db.log.join(', ') + ')');
  assert.equal(A.last().d.text, big, 'A : texte reconstitué depuis ce qu\'il vient d\'écrire'); assert.deepEqual([B.last().p, B.last().c, B.last().d.count, B.last().d.updatedAt], [false, false, 120, 3]);
  // une carte de plus sur B : seul son morceau écrit, et relu sur A
  const big2 = ins.join('\n'); c0 = count(); db.log.length = 0;
  await B.sm.tx('u9', d => { assert.equal(d.text, big, 'transaction : texte reconstitué sans relire les morceaux connus'); return { text: big2, count: 121, updatedAt: d.updatedAt + 1 }; });
  await wait(() => A.last().d.text === big2);
  assert.deepEqual(since(c0), { r: 1 + 2 + changed, w: 1 + changed + p2.del.length }, 'une carte : principal + ' + changed + ' morceau(x) écrits ; A relit le principal et ce(s) morceau(x) seulement (' + db.log.join(', ') + ')');
  assert.deepEqual(db.docs.get(MAIN).parts, p2.main.parts, 'même découpe que le plan calculé à part');
  // nouvel appareil (relance) : dernier état du compte connu de l'appareil (collection.js › collBaseText) redécoupé → aucun morceau relu
  globalThis.collBaseText = () => big2; c0 = count(); db.log.length = 0;
  const Cv = dev(); await wait(() => Cv.got.length && Cv.last().d.text === big2);
  assert.deepEqual(since(c0), { r: 1, w: 0 }, 'relance : le principal seul (' + db.log.join(', ') + ')');
  globalThis.collBaseText = () => big; c0 = count();
  const Dv = dev(); await wait(() => Dv.got.length && Dv.last().d.text === big2);
  assert.deepEqual(since(c0), { r: 1 + changed, w: 0 }, 'base plus ancienne : seuls les morceaux changés depuis relus');
  delete globalThis.collBaseText; Cv.off(); Dv.off();
  // lecture directe (Réessayer, retour au premier plan) : texte entier
  assert.equal((await B.sm.pull('u9', 'collection')).data.text, big2);
  // repassée sous le plafond : document unique (parts: []), morceaux supprimés ; puis comme avant
  c0 = count();
  await A.sm.tx('u9', d => ({ text: '3 Sol Ring', count: 1, updatedAt: d.updatedAt + 1 }));
  await wait(() => B.last().d.text === '3 Sol Ring');
  assert.deepEqual(parts(), [], 'morceaux supprimés'); assert.deepEqual(db.docs.get(MAIN), { text: '3 Sol Ring', count: 1, updatedAt: 5, parts: [] });
  assert.deepEqual(since(c0), { r: 3, w: 1 + p2.main.parts.length }, 'retour : principal + suppression des morceaux');
  await B.sm.tx('u9', d => ({ text: '4 Sol Ring', count: 1, updatedAt: d.updatedAt + 1 }));
  assert.deepEqual(db.docs.get(MAIN), { text: '4 Sol Ring', count: 1, updatedAt: 6 }, 'ensuite : exactement le document d\'avant');
  // règles des morceaux pas publiées : écriture découpée refusée en bloc → too-big { rules }, rien d'écrit
  db.rules = false; c0 = count();
  await assert.rejects(A.sm.tx('u9', d => ({ text: big, count: 120, updatedAt: d.updatedAt + 1 })), e => e.code === 'too-big' && e.rules === true && e.len === big.length);
  assert.deepEqual([since(c0).w, parts(), db.docs.get(MAIN).text], [0, [], '4 Sol Ring'], 'refusé : rien d\'écrit, document d\'avant gardé');
  await A.sm.tx('u9', d => ({ text: '5 Sol Ring', count: 1, updatedAt: d.updatedAt + 1 })); assert.equal(db.docs.get(MAIN).text, '5 Sol Ring', 'sous le plafond : marche comme avant');
  db.rules = true;
  // morceau abîmé ou manquant dans le compte : jamais livré comme la collection ; écoute : copie locale (fromCache) puis nouvel essai ; transaction : erreur « parts »
  const keep = { ...X.COLL_PART_RETRY }; X.COLL_PART_RETRY.first = 20;
  await A.sm.tx('u9', d => ({ text: big, count: 120, updatedAt: d.updatedAt + 1 }));
  await wait(() => B.last().d.text === big);
  const E = dev(); db.docs.set(MAIN + '/parts/1', { text: 'abîmé', h: 'zz' });
  await wait(() => E.got.length > 0); await new Promise(r => setTimeout(r, 30));
  assert.ok(E.got.every(x => x.c === true && x.d.text === undefined), 'morceau abîmé : livré comme une copie locale, jamais comme le compte');
  const r0 = db.reads; await new Promise(r => setTimeout(r, 120)); assert.ok(db.reads > r0, 'nouvel essai plus tard');
  await assert.rejects(E.sm.pull('u9', 'collection'), e => e.code === 'parts');
  const F2 = X.makeSum({ fs: fake }, {}, () => ({}));
  await assert.rejects(F2.tx('u9', d => ({ ...d, updatedAt: d.updatedAt + 1 })), e => e.code === 'parts', 'transaction : erreur, rien d\'écrit');
  E.off(); Object.assign(X.COLL_PART_RETRY, keep); const r1 = db.reads; await new Promise(r => setTimeout(r, 120)); assert.ok(db.reads - r1 <= 1, 'écoute arrêtée : plus de nouvel essai');
  A.off(); B.off(); delete globalThis.COLL_LIM;
  console.log('✓ collection découpée (faux Firestore, 2 appareils) : découpée au-delà du plafond, relue sur l\'autre ; une carte : seul son morceau écrit et relu ; relance : morceaux de la base, aucun relu ; retour au document unique (parts: []) puis comme avant ; règles pas publiées : too-big, rien d\'écrit ; morceau abîmé : jamais livré, erreur « parts »');
}
{      // vrai SDK hors ligne : principal découpé écrit ici (en attente) livré tel quel, sans relire de morceau ; lecture directe : rejet propre
  globalThis.COLL_LIM = { one: 300, part: 200, min: 100, div: 8, n: 12, max: 5000, warn: 0.8 };
  const fsdb = fs.getFirestore(app.getApp()), u = 'uid-split';
  const got = []; const un3 = cloud.watchColl(u, (data, pending, fromCache) => got.push({ data, pending, fromCache }), e => got.push({ err: e.code }));
  fs.setDoc(fs.doc(fsdb, 'users', u, 'meta', 'collection'), { count: 2, updatedAt: 9, parts: [{ h: 'a', n: 3 }] }).catch(() => {});
  await new Promise(r => setTimeout(r, 400));
  const l = got.at(-1); assert.ok(l && l.pending === true && l.data.parts.length === 1 && l.data.text === undefined, 'écriture en attente livrée telle quelle (collection.js l\'ignore)');
  const race = await Promise.race([cloud.pullColl(u).then(() => 'ok', e => 'rejet'), new Promise(r => setTimeout(() => r('suspendu'), 30000))]);
  assert.equal(race, 'rejet', 'pullColl hors ligne : rejet propre'); un3(); delete globalThis.COLL_LIM;
  console.log('✓ vrai SDK hors ligne : principal découpé en attente livré tel quel, pullColl rejetée proprement');
}
console.log('\nCLOUD OK');
process.exit(0);
