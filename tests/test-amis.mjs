// Amis côté serveur (/api/friends) : demandes par un lien d'échange, réponse (acceptée, refusée sans le révéler), liste, parties d'un ami (liste d'échange,
// decks, collection seulement si partagée), retrait dans les deux sens, notifications de chaque compte (FCM et Web Push, langue de l'appareil, cibles
// périmées retirées), « un ami a une carte que tu cherches » (tout de suite, puis regroupé une fois par jour, relu après un redémarrage), bornes,
// suppression du compte, aucun UID dans Firestore. Faux Firebase (jetons, OAuth2, Firestore REST, FCM) et faux service Web Push : aucun accès réseau réel.
import './setup-env.mjs';
import http from 'node:http';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { createECDH, randomBytes, hkdfSync, createDecipheriv, generateKeyPairSync } from 'node:crypto';
import { startFakes, tag } from './amis-fakes.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = m => console.log('✓ ' + m);
const F = await startFakes();
const until = async (fn, ms = 5000) => { for (let t = 0; t < ms && !fn(); t += 50) await sleep(50); return fn(); };

// faux service Web Push (abonnement d'un navigateur) et déchiffrement du message reçu (RFC 8291)
const pushed = [];
const upPush = http.createServer((req, res) => { const c = []; req.on('data', x => c.push(x)); req.on('end', () => { pushed.push({ url: req.url, h: req.headers, body: Buffer.concat(c) }); res.writeHead(req.url.includes('gone') ? 410 : 201); res.end(); }); });
await new Promise(r => upPush.listen(0, '127.0.0.1', r));
const vk = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' });
const VPUB = Buffer.concat([Buffer.from([4]), Buffer.from(vk.x, 'base64url'), Buffer.from(vk.y, 'base64url')]).toString('base64url');
const webSub = name => { const e = createECDH('prime256v1'); e.generateKeys(); const auth = randomBytes(16); return { e, pub: e.getPublicKey(), auth, sub: { endpoint: `http://127.0.0.1:${upPush.address().port}/send/${name}`, keys: { p256dh: e.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } } }; };
function decrypt(br, body) {
  const salt = body.subarray(0, 16), idlen = body[20], keyid = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const ikm = Buffer.from(hkdfSync('sha256', br.e.computeSecret(keyid), br.auth, Buffer.concat([Buffer.from('WebPush: info\0'), br.pub, keyid]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16)), nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(-16));
  const plain = Buffer.concat([d.update(ct.subarray(0, -16)), d.final()]); let n = plain.length; while (n > 0 && plain[n - 1] === 0) n--; return JSON.parse(plain.subarray(0, n - 1).toString());
}

const procs = [];
const start = (env, p) => new Promise((resolve, reject) => {
  const c = spawn('node', ['server/proxy.mjs'], { env: { ...process.env, EDH_SOURCE_URL: '', PORT: String(p), CARDTRADER_TOKEN: 'tok', ALERTS: '0', PUBDECKS: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.log = () => out;
  c.stdout.on('data', d => { out += d; if (/Mana Orbit →/.test(out)) resolve(c); }); c.stderr.on('data', d => { out += d; });
  c.on('exit', code => { if (code) reject(new Error('exit ' + code + ': ' + out)); });
  procs.push(c);
});
process.on('exit', () => { for (const p of procs) try { p.kill(); } catch {} });
let BASE = '';
/** Appel de l'API au nom d'un compte (uid) ; tok : jeton imposé ('' : aucun). */
const api = async (uid, method, path, body, hd = {}) => {
  const h = { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip', ...hd }; const t = hd.tok !== undefined ? hd.tok : uid ? F.jwt(uid) : ''; delete h.tok; if (t) h['x-firebase-token'] = t;
  const r = await fetch(BASE + '/api/friends' + path, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  const x = await r.text(); let o; try { o = JSON.parse(x); } catch { o = x; } return { s: r.status, o, h: r.headers };
};
const U = { a: 'uid-alice-7f3a', b: 'uid-bob-91c2', c: 'uid-carol-55d0', d: 'uid-dave-0b17', e: 'uid-eve-3e3e' }, T = Object.fromEntries(Object.entries(U).map(([k, v]) => [k, tag(v)]));
const fcmTok = name => name + ':APA91b' + randomBytes(96).toString('base64url');
const amDoc = k => { const d = F.fs.docs.get('amis/' + T[k]); return d ? JSON.parse(d.j) : null; };
const card = (n, f) => ({ n, q: 1, ...(f ? { f } : {}) });
const tradeJ = (have, want = []) => JSON.stringify({ have: have.map(x => (typeof x === 'string' ? card(x) : x)), want: want.map(n => card(n)) });

/* ── 0) Sans compte de service : coupé ─────────────────────────────────────────────────────────── */
{
  const P = await start({ FIREBASE_JWKS_URL: F.env.FIREBASE_JWKS_URL }, 19100); BASE = 'http://127.0.0.1:19100';
  assert.equal((await (await fetch(BASE + '/__ping')).json()).amis, false);
  const r = await api(U.a, 'GET', ''); assert.equal(r.s, 404); assert.equal(r.o.error, 'friends_disabled');
  P.kill(); ok('sans compte de service : amis coupés (ping amis: false, 404)');
}

/* ── 1) Comptes, appareils, demande, réponse ───────────────────────────────────────────────────── */
const env = { ...F.env, VAPID_PUBLIC_KEY: VPUB, VAPID_PRIVATE_KEY: vk.d, VAPID_SUBJECT: 'mailto:test@example.com', PUSH_ALLOW_HOSTS: `127.0.0.1:${upPush.address().port}`, FRIENDS_WANT_GAP_MS: '4000', FRIENDS_ASK_PER_DAY: '6', FRIENDS_MAX: '4' };
let P = await start(env, 19101); BASE = 'http://127.0.0.1:19101';
for (let t = 0; t < 40 && !/Amis :/.test(P.log()); t++) await sleep(50);
assert.equal((await (await fetch(BASE + '/__ping')).json()).amis, true); assert.match(P.log(), /Amis : 4 au plus par compte/);
assert.equal((await api('', 'GET', '')).s, 401); assert.equal((await api('', 'GET', '')).o.error, 'auth_required');
assert.equal((await api(U.a, 'GET', '', undefined, { tok: F.jwt(U.a, -60) })).o.error, 'token_expired');
assert.equal((await api(U.a, 'GET', '', undefined, { tok: F.jwt(U.a).slice(0, -6) + 'AAAAAA' })).o.error, 'bad_token');
let r = await api(U.a, 'GET', ''); assert.equal(r.s, 200); assert.deepEqual(r.o, { on: true, me: { c: 0, dev: 0 }, friends: [], inc: [], out: [], need: false, max: 4 });
assert.equal(F.fs.docs.size, 0, 'une simple lecture ne crée rien');
r = await api(U.a, 'PUT', '/me', { n: 'Alice' }); assert.deepEqual(r.o, { ok: true, need: false }); assert.equal(F.fs.docs.size, 0, 'profil seul, sans appareil ni ami : rien d\'écrit');
ok('jeton exigé (absent, expiré, falsifié : refusé), tout compte du projet accepté ; rien d\'écrit pour un compte qui ne fait rien');

const tokA = fcmTok('alice'), webB = webSub('bob'), tokC = fcmTok('carol');
r = await api(U.a, 'PUT', '/me', { n: 'Alice', l: 'fr', dev: { fcm: tokA } }); assert.equal(r.s, 200); assert.match(r.o.dk, /^[0-9a-f]{24}$/);
assert.equal(amDoc('a').n, 'Alice'); assert.equal(amDoc('a').d.length, 1);
assert.equal((await api(U.b, 'PUT', '/me', { n: 'Bob', l: 'en', dev: webB.sub })).s, 200);
assert.equal((await api(U.c, 'PUT', '/me', { n: 'Carol', l: 'fr', dev: { fcm: tokC } })).s, 200);
assert.equal((await api(U.a, 'PUT', '/me', { dev: { endpoint: 'https://evil.example.com/x', keys: { p256dh: 'x', auth: 'y' } } })).s, 400, 'cible push hors des services connus : refusée');
assert.equal((await api(U.a, 'PUT', '/me', { n: 'Alice', l: 'fr', dev: { fcm: tokA } })).s, 200); assert.equal(amDoc('a').d.length, 1, 'même appareil : une seule fois');
ok('appareils enregistrés par compte (FCM, Web Push), une fois chacun, cible vérifiée');

F.share('AliceShare0001', U.a, { by: 'Alice', have: [], want: [] }); F.share('CarolShare0001', U.c, { by: 'Carol', have: [], want: [] }); F.share('DaveShare00001', U.d, { by: 'Dave le Grand', have: [], want: [] });
assert.deepEqual((await api(U.b, 'GET', '/state?share=AliceShare0001')).o, { state: 'none', id: T.a });
assert.deepEqual((await api(U.a, 'GET', '/state?share=AliceShare0001')).o, { state: 'self' });
assert.equal((await api(U.b, 'GET', '/state?share=Inconnu0000001')).s, 404);
assert.deepEqual((await api(U.a, 'POST', '/ask', { share: 'AliceShare0001' })).o, { state: 'self' }, 'pas soi-même');
r = await api(U.b, 'POST', '/ask', { share: 'AliceShare0001', n: 'Bob', l: 'en' }); assert.deepEqual(r.o, { state: 'sent', id: T.a });
await until(() => F.fcmFor(tokA).length === 1);
let m = F.fcmFor(tokA)[0]; assert.deepEqual(m.notification, { title: 'Demande d\'ami', body: 'Bob veut t\'ajouter en ami sur Mana Orbit.' }); assert.equal(m.data.url, './?amis=1'); assert.equal(m.android.notification.tag, 'mo-amis-ask');
assert.deepEqual((await api(U.b, 'GET', '/state?share=AliceShare0001')).o, { state: 'sent', id: T.a });
assert.deepEqual((await api(U.a, 'GET', '/state?share=CarolShare0001')).o, { state: 'none', id: T.c });
r = await api(U.a, 'GET', ''); assert.deepEqual(r.o.inc.map(x => [x.id, x.n]), [[T.b, 'Bob']]); assert.equal(r.o.friends.length, 0);
r = await api(U.b, 'GET', ''); assert.deepEqual(r.o.out.map(x => [x.id, x.n]), [[T.a, 'Alice']]); assert.equal(r.o.need, true, 'demande envoyée : ses parties servent');
assert.deepEqual((await api(U.b, 'POST', '/ask', { share: 'AliceShare0001', n: 'Bob' })).o, { state: 'sent', id: T.a }); await sleep(300); assert.equal(F.fcmFor(tokA).length, 1, 'redemandé : pas de seconde notification');
assert.equal((await api(U.b, 'GET', '/view?id=' + T.a + '&part=t')).o.error, 'not_friend', 'pas encore amis : rien à voir');
ok('demande depuis un lien d\'échange : état (aucune, envoyée, soi-même), notification au propriétaire (FCM, français), une seule fois');

r = await api(U.a, 'POST', '/answer', { id: T.b, ok: true, n: 'Alice' }); assert.deepEqual(r.o, { state: 'friend' });
await until(() => pushed.length === 1);
const wb = decrypt(webB, pushed[0].body); assert.deepEqual(wb, { title: 'Request accepted', body: 'Alice accepted your friend request.', url: './?ami=' + T.a, kind: 'open', tag: 'mo-amis-ok' }); assert.equal(pushed[0].h.topic, 'mo-amis-ok');
r = await api(U.b, 'GET', ''); assert.deepEqual(r.o.friends.map(x => [x.id, x.n, x.m, x.c]), [[T.a, 'Alice', 0, 0]]); assert.deepEqual(r.o.out, []);
r = await api(U.a, 'GET', ''); assert.deepEqual(r.o.friends.map(x => x.n), ['Bob']); assert.deepEqual(r.o.inc, []); assert.equal(r.o.need, true);
assert.deepEqual((await api(U.b, 'GET', '/state?share=AliceShare0001')).o, { state: 'friend', id: T.a });
ok('acceptée : amis des deux côtés, l\'autre prévenu (Web Push chiffré, anglais, toucher → page de l\'ami)');

/* ── 2) Parties d'un ami : liste d'échange, decks, collection seulement si partagée ─────────────── */
const decksJ = JSON.stringify([{ n: 'Atraxa', t: '1 Atraxa, Praetors\' Voice\n1 Sol Ring' }]), collJ = JSON.stringify([['Sol Ring', 3], ['Mana Crypt', 1, 'fr']]);
assert.equal((await api(U.a, 'PUT', '/me', { part: 't', j: tradeJ(['Sol Ring'], ['Rhystic Study']), k: 1 })).o.has.t > 0, true);
assert.equal((await api(U.a, 'PUT', '/me', { part: 'd', j: decksJ, k: 1 })).s, 200);
r = await api(U.a, 'PUT', '/me', { part: 'c', j: collJ, k: 2 }); assert.equal(r.o.has.c, 0, 'collection non partagée : pas gardée');
assert.equal(F.fs.docs.has('amisdata/' + T.a + '_c'), false);
r = await api(U.b, 'GET', '/view?id=' + T.a + '&part=t'); assert.equal(r.s, 200); assert.deepEqual(JSON.parse(r.o.j).have.map(x => x.n), ['Sol Ring']); assert.ok(r.o.at > 0);
assert.equal(JSON.parse((await api(U.b, 'GET', '/view?id=' + T.a + '&part=d')).o.j)[0].n, 'Atraxa');
r = await api(U.b, 'GET', '/view?id=' + T.a + '&part=c'); assert.equal(r.s, 403); assert.equal(r.o.error, 'private');
assert.equal((await api(U.c, 'GET', '/view?id=' + T.a + '&part=t')).o.error, 'not_friend', 'un inconnu ne voit rien');
assert.equal((await api(U.a, 'PUT', '/me', { c: 1 })).o.c, 1);
r = await api(U.a, 'PUT', '/me', { part: 'c', j: collJ, k: 2 }); assert.ok(r.o.has.c > 0);
assert.deepEqual(JSON.parse((await api(U.b, 'GET', '/view?id=' + T.a + '&part=c')).o.j), [['Sol Ring', 3], ['Mana Crypt', 1, 'fr']]);
r = await api(U.b, 'GET', ''); assert.deepEqual([r.o.friends[0].c, r.o.friends[0].nc, r.o.friends[0].nd], [1, 2, 1], 'liste : collection partagée, nombres de cartes et de decks');
const n0 = F.fs.ops.filter(o => o.startsWith('PATCH amisdata')).length; await api(U.a, 'PUT', '/me', { part: 'd', j: decksJ, k: 1 }); assert.equal(F.fs.ops.filter(o => o.startsWith('PATCH amisdata')).length, n0, 'partie inchangée : pas réécrite');
assert.equal((await api(U.a, 'PUT', '/me', { part: 't', j: '{"have":5}' })).s, 400); assert.equal((await api(U.a, 'PUT', '/me', { part: 'd', j: 'pas du json' })).s, 400);
assert.equal((await api(U.a, 'PUT', '/me', { part: 'c', j: JSON.stringify([['x'.repeat(1000), 1]]).repeat(1) + ' '.repeat(1000001) })).s, 413);
const big = await api(U.b, 'GET', '/view?id=' + T.a + '&part=t'); assert.equal(big.s, 200);
await api(U.a, 'PUT', '/me', { c: 0 }); assert.equal(F.fs.docs.has('amisdata/' + T.a + '_c'), false, 'collection plus partagée : effacée tout de suite');
assert.equal((await api(U.b, 'GET', '/view?id=' + T.a + '&part=c')).o.error, 'private');
await api(U.a, 'PUT', '/me', { c: 1 }); await api(U.a, 'PUT', '/me', { part: 'c', j: collJ, k: 2 });
ok('ami : liste d\'échange et decks lisibles, collection seulement une fois partagée (effacée dès que le partage s\'arrête) ; partie inchangée non réécrite ; contenu et taille contrôlés');

/* ── 3) « Un ami a une carte que tu cherches » ──────────────────────────────────────────────────── */
await api(U.b, 'PUT', '/me', { part: 't', j: tradeJ(['Llanowar Elves'], ['Mana Crypt', 'Rhystic Study', 'Sol Ring', 'Cyclonic Rift', 'Smothering Tithe']), k: 1 });
r = await api(U.b, 'GET', ''); assert.equal(r.o.friends[0].m, 1, 'Alice a déjà Sol Ring, que Bob cherche'); assert.equal(r.o.friends[0].g, 0);
r = await api(U.a, 'GET', ''); assert.equal(r.o.friends[0].g, 1, 'côté Alice : elle a 1 carte pour Bob');
await sleep(200); assert.equal(pushed.length, 1, 'première liste de Bob, cartes déjà là chez Alice : personne n\'est prévenu');
await api(U.a, 'PUT', '/me', { part: 't', j: tradeJ(['Sol Ring', 'Mana Crypt'], ['Rhystic Study']), k: 2 });
await until(() => pushed.length === 2);
assert.deepEqual(decrypt(webB, pushed[1].body), { title: 'Alice has a card you want', body: 'Alice just added Mana Crypt, which you\'re looking for.', url: './?ami=' + T.a, kind: 'open', tag: 'mo-amis-want' });
await api(U.a, 'PUT', '/me', { part: 't', j: tradeJ(['Sol Ring', 'Mana Crypt', 'Rhystic Study', 'Cyclonic Rift', 'Forest'], []), k: 5 });
await sleep(400); assert.equal(pushed.length, 2, 'deuxième ajout dans la journée : mis en file, rien tout de suite');
assert.ok(amDoc('b').w.q.length === 1 && amDoc('b').w.due > Date.now()); await until(() => F.fs.docs.has('amisys/due')); assert.ok(JSON.parse(F.fs.docs.get('amisys/due').j)[T.b] > 0, 'heure du résumé gardée dans amisys/due');
await until(() => pushed.length === 3, 9000);
assert.deepEqual(decrypt(webB, pushed[2].body), { title: 'Alice has cards you want', body: 'Alice just added Rhystic Study and 1 more card you\'re looking for.', url: './?ami=' + T.a, kind: 'open', tag: 'mo-amis-want' });
assert.deepEqual(amDoc('b').w.q, []); await until(() => !JSON.parse(F.fs.docs.get('amisys/due').j)[T.b]);
ok('un ami ajoute une carte cherchée : prévenu tout de suite (« Alice just added Mana Crypt »), puis le reste regroupé au bout du délai (un par jour)');

// deux amis dans la même journée → un seul message « tes amis… » ; Carol (français) reçoit le nom imprimé français d'Alice
assert.equal((await api(U.b, 'POST', '/ask', { share: 'CarolShare0001', n: 'Bob' })).o.state, 'sent'); await until(() => F.fcmFor(tokC).length === 1);
assert.equal(F.fcmFor(tokC)[0].notification.body, 'Bob veut t\'ajouter en ami sur Mana Orbit.');
assert.equal((await api(U.c, 'POST', '/answer', { id: T.b, ok: true, n: 'Carol', l: 'fr' })).o.state, 'friend'); await until(() => pushed.length === 4);
assert.equal(decrypt(webB, pushed[3].body).body, 'Carol accepted your friend request.');
await api(U.c, 'PUT', '/me', { part: 't', j: tradeJ(['Island'], ['Anneau solaire']), k: 1 });
await api(U.c, 'PUT', '/me', { part: 't', j: tradeJ(['Island', 'Smothering Tithe'], ['Sol Ring']), k: 2 });
await sleep(300); assert.equal(pushed.length, 4, 'moins d\'un jour (ici 4 s) depuis le dernier : en file');
await api(U.a, 'PUT', '/me', { part: 't', j: tradeJ(['Sol Ring', 'Mana Crypt', 'Rhystic Study', 'Cyclonic Rift', 'Forest', 'Smothering Tithe'], []), k: 6 });
await until(() => pushed.length === 5, 9000);
assert.deepEqual(decrypt(webB, pushed[4].body), { title: 'Your friends have cards you want', body: 'Carol and Alice added 2 cards you\'re looking for.', url: './?amis=1', kind: 'open', tag: 'mo-amis-want' });
assert.equal((await api(U.a, 'POST', '/ask', { share: 'CarolShare0001', n: 'Alice' })).o.state, 'sent'); assert.equal((await api(U.c, 'POST', '/ask', { share: 'AliceShare0001', n: 'Carol' })).o.state, 'friend', 'Carol demande à son tour : acceptée d\'office');
await until(() => F.fcmFor(tokA).some(x => x.notification.title === 'Demande acceptée'));
await api(U.c, 'PUT', '/me', { part: 't', j: tradeJ(['Island', 'Smothering Tithe'], ['Sol Ring', 'Mana Crypt']), k: 2 });
const before = F.fcmFor(tokC).length; await api(U.a, 'PUT', '/me', { part: 't', j: tradeJ([{ n: 'Sol Ring', f: 'Anneau solaire' }, 'Mana Crypt', 'Forest'], []), k: 3 });
await sleep(300); assert.equal(F.fcmFor(tokC).length, before, 'Sol Ring et Mana Crypt déjà chez Alice : rien de nouveau');
await api(U.a, 'PUT', '/me', { part: 't', j: tradeJ(['Mana Crypt', 'Forest'], []), k: 2 });
await api(U.a, 'PUT', '/me', { part: 't', j: tradeJ([{ n: 'Sol Ring', f: 'Anneau solaire' }, 'Mana Crypt', 'Forest'], []), k: 3 });
await until(() => F.fcmFor(tokC).length === before + 1);
assert.deepEqual(F.fcmFor(tokC)[before].notification, { title: 'Alice a une carte que tu cherches', body: 'Alice vient d\'ajouter Anneau solaire, que tu cherches.' });
ok('deux amis dans le délai : un seul message regroupé ; demande croisée acceptée d\'office ; nom imprimé (français) pour un appareil en français');

/* ── 4) Redémarrage : résumé en attente relu ────────────────────────────────────────────────────── */
{
  const tokH = fcmTok('hugo'); F.share('GinaShare00001', 'uid-gina-1', { by: 'Gina' });
  await api('uid-hugo-1', 'PUT', '/me', { n: 'Hugo', l: 'fr', dev: { fcm: tokH } });
  assert.equal((await api('uid-hugo-1', 'POST', '/ask', { share: 'GinaShare00001', n: 'Hugo' })).o.state, 'sent');
  assert.equal((await api('uid-gina-1', 'POST', '/answer', { id: tag('uid-hugo-1'), ok: true, n: 'Gina' })).o.state, 'friend');
  await until(() => F.fcmFor(tokH).length === 1);
  await api('uid-gina-1', 'PUT', '/me', { part: 't', j: tradeJ(['Island']), k: 1 });
  await api('uid-hugo-1', 'PUT', '/me', { part: 't', j: tradeJ([], ['Sol Ring', 'Mana Crypt']), k: 0 });
  await api('uid-gina-1', 'PUT', '/me', { part: 't', j: tradeJ(['Island', 'Sol Ring']), k: 2 });
  await until(() => F.fcmFor(tokH).length === 2); assert.equal(F.fcmFor(tokH)[1].notification.body, 'Gina vient d\'ajouter Sol Ring, que tu cherches.');
  await api('uid-gina-1', 'PUT', '/me', { part: 't', j: tradeJ(['Island', 'Sol Ring', 'Mana Crypt']), k: 3 });
  await until(() => F.fs.docs.has('amisys/due') && JSON.parse(F.fs.docs.get('amisys/due').j)[tag('uid-hugo-1')]);
  P.kill(); await sleep(200); assert.equal(F.fcmFor(tokH).length, 2, 'en file au moment de l\'arrêt');
  const o0 = F.fs.ops.length; P = await start(env, 19102); BASE = 'http://127.0.0.1:19102';
  await sleep(300); assert.equal(F.fs.ops.length, o0, 'rien lu dans Firestore au démarrage');
  await api('uid-hugo-1', 'GET', '');      // premier appel après le démarrage : file relue
  await until(() => F.fcmFor(tokH).length === 3, 15000);
  assert.deepEqual(F.fcmFor(tokH)[2].notification, { title: 'Gina a une carte que tu cherches', body: 'Gina vient d\'ajouter Mana Crypt, que tu cherches.' });
  await until(() => !JSON.parse(F.fs.docs.get('amisys/due').j)[tag('uid-hugo-1')]);
  ok('serveur redémarré : le résumé en attente (amisys/due) part quand même, puis sort de la file');
}

/* ── 5) Refus (jamais révélé), bornes ───────────────────────────────────────────────────────────── */
const nA = F.fcmFor(tokA).length;
assert.equal((await api(U.d, 'POST', '/ask', { share: 'AliceShare0001', n: 'Dave' })).o.state, 'sent'); await until(() => F.fcmFor(tokA).length === nA + 1);
assert.deepEqual((await api(U.a, 'POST', '/answer', { id: T.d, ok: false })).o, { state: 'none' });
r = await api(U.d, 'GET', ''); assert.deepEqual(r.o.out.map(x => x.id), [T.a], 'refusée : toujours « envoyée » chez Dave');
assert.deepEqual((await api(U.d, 'POST', '/ask', { share: 'AliceShare0001', n: 'Dave' })).o, { state: 'sent', id: T.a });
await sleep(300); assert.equal(F.fcmFor(tokA).length, nA + 1, 'redemande après un refus : rien n\'arrive'); assert.deepEqual((await api(U.a, 'GET', '')).o.inc, []);
assert.equal((await api(U.d, 'POST', '/remove', { id: T.a })).s, 200); assert.equal((await api(U.d, 'POST', '/ask', { share: 'AliceShare0001', n: 'Dave' })).o.state, 'sent'); await sleep(200);
assert.deepEqual((await api(U.a, 'GET', '')).o.inc, [], 'annulée puis redemandée : toujours bloquée 30 jours');
ok('refus : jamais révélé (demande « envoyée » chez lui), plus aucune demande de sa part pendant 30 jours');

// FRIENDS_MAX = 4 : Alice a Bob et Carol ; Eve, puis deux autres
assert.equal(amDoc('d').o[T.a] > 0, true);
r = await api(U.a, 'GET', '/state?share=DaveShare00001'); assert.equal(r.o.state, 'none');
for (const [i, u] of ['x1', 'x2', 'x3'].entries()) { F.share('XShare0000000' + i, 'uid-' + u, { by: u }); }
assert.equal((await api(U.e, 'POST', '/ask', { share: 'AliceShare0001', n: 'Eve' })).o.state, 'sent');
assert.equal((await api(U.a, 'POST', '/answer', { id: T.e, ok: true })).o.state, 'friend');
assert.equal((await api(U.a, 'POST', '/ask', { share: 'XShare00000000', n: 'Alice' })).o.state, 'sent');
assert.equal((await api('uid-x0', 'POST', '/answer', { id: T.a, ok: true })).o.state, 'none', 'pas de demande reçue de ce compte');
assert.equal((await api('uid-x1', 'POST', '/answer', { id: T.a, ok: true })).o.state, 'friend');
r = await api(U.a, 'POST', '/ask', { share: 'XShare00000001', n: 'Alice' }); assert.equal(r.s, 409); assert.equal(r.o.error, 'max', '4 amis : liste pleine');
// 6 demandes par jour (FRIENDS_ASK_PER_DAY) : Eve en a fait 1
for (let i = 0; i < 5; i++) { F.share('YShare000000' + i + 'a', 'uid-y' + i, { by: 'y' + i }); assert.equal((await api(U.e, 'POST', '/ask', { share: 'YShare000000' + i + 'a' })).o.state, 'sent'); }
F.share('YShare0000009a', 'uid-y9', { by: 'y9' }); r = await api(U.e, 'POST', '/ask', { share: 'YShare0000009a' }); assert.equal(r.s, 429); assert.equal(r.o.error, 'rate');
// 30 demandes par heure et par réseau
let lim = 0; for (let i = 0; i < 40 && !lim; i++) { const x = await api('uid-z' + i, 'POST', '/ask', { share: 'AliceShare0001' }, { 'x-forwarded-for': '203.0.113.9' }); if (x.s === 429 && x.o.error === 'rate_limited') lim = i; }
assert.equal(lim, 30, 'trente demandes par heure depuis un même réseau');
ok('bornes : amis par compte (FRIENDS_MAX), demandes par jour et par compte, par heure et par réseau');

/* ── 6) Retrait, cible périmée, Firestore injoignable, suppression du compte ────────────────────── */
assert.equal((await api(U.b, 'POST', '/remove', { id: T.a })).s, 200);
assert.equal((await api(U.b, 'GET', '/view?id=' + T.a + '&part=t')).o.error, 'not_friend'); assert.equal((await api(U.a, 'GET', '/view?id=' + T.b + '&part=t')).o.error, 'not_friend', 'retiré : plus rien dans un sens ni dans l\'autre');
assert.ok(!(await api(U.a, 'GET', '')).o.friends.some(f => f.id === T.b)); assert.ok(F.fs.docs.has('amisdata/' + T.b + '_t'), 'Bob a encore Carol : ses parties restent');
const gone = 'GONE' + fcmTok('x').slice(4);
await api(U.c, 'PUT', '/me', { dev: { fcm: gone }, l: 'fr' }); assert.equal(amDoc('c').d.length, 2);
await api(U.c, 'POST', '/remove', { id: T.b });
assert.equal(F.fs.docs.has('amisdata/' + T.b + '_t'), false, 'Bob n\'a plus aucun ami : ses parties sont effacées');
await api(U.b, 'POST', '/ask', { share: 'CarolShare0001', n: 'Bob' });
await until(() => amDoc('c').d.length === 1); assert.equal(amDoc('c').d[0].sub.fcm, tokC, 'jeton FCM désinscrit : retiré, l\'autre appareil gardé');
F.fs.down = 1; r = await api(U.a, 'GET', '/view?id=' + T.c + '&part=t'); F.fs.down = 0;
assert.ok([200, 503].includes(r.s)); r = await api(U.d, 'POST', '/remove', { id: T.c }); assert.equal(r.s, 200);
F.fs.down = 1; r = await api('uid-new-1', 'PUT', '/me', { n: 'Neuf', dev: { fcm: fcmTok('neuf') } }); F.fs.down = 0; assert.equal(r.s, 503); assert.equal(r.o.error, 'unavailable');
ok('retrait : plus rien de part et d\'autre, parties effacées quand il n\'y a plus d\'ami ; jeton périmé retiré ; Firestore injoignable : 503 propre');

const friendsOfA = (await api(U.a, 'GET', '')).o.friends.map(f => f.id);
assert.ok(friendsOfA.includes(T.c) && friendsOfA.includes(T.e));
assert.deepEqual((await api(U.a, 'DELETE', '/me')).o, { ok: true });
assert.equal(amDoc('a'), null); for (const p of ['t', 'd', 'c']) assert.equal(F.fs.docs.has(`amisdata/${T.a}_${p}`), false, 'partie ' + p + ' effacée');
for (const k of ['c', 'e']) { const d = amDoc(k); assert.ok(!d.f[T.a] && !d.i[T.a] && !d.o[T.a], k + ' : Alice retirée'); }
await api(U.d, 'GET', ''); await until(() => !amDoc('d').o[T.a]); assert.ok(!amDoc('d').o[T.a], 'demande (refusée) de Dave à Alice : retirée à sa prochaine lecture');
assert.ok(!(await api(U.c, 'GET', '')).o.friends.some(f => f.id === T.a));
ok('compte supprimé : retiré de chez tous ses amis et des demandes, documents et parties effacés');

/* ── 7) Vie privée : aucun UID dans Firestore ───────────────────────────────────────────────────── */
const all = JSON.stringify([...F.fs.docs]);
for (const uid of [...Object.values(U), 'uid-x1', 'uid-y0']) assert.ok(!all.includes(uid), 'UID absent : ' + uid);
assert.ok(F.oauth.scopes.every(s => /datastore|firebase\.messaging/.test(s)));
ok('aucun UID écrit dans Firestore (empreintes seulement) ; compte de service : portées Firestore et FCM');

P.kill(); F.stop(); upPush.close();
console.log('AMIS OK');
process.exit(0);
