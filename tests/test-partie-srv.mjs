// Compteur de vie côté serveur (/api/partie) : formats de jeu (Commander, Standard, Libre : validés, gardés dans la salle, renvoyés ; salle sans jeu = Commander ;
// résultat Standard dans l'historique ; appli d'avant dans une salle Standard), salle d'attente (création par un compte, coup d'œil sans compte, entrée par le code avec ou sans compte,
// places prises ou libres, invités du créateur, déplacer, retirer, format, « commencer » qui fige la liste et donne les jetons des comptes, présence,
// relevé versionné, expiration, départ, redémarrage ; partie en direct : état du compteur, deltas des places, co-hôtes, « Tout le monde est co-hôte », fin avec sa raison), résultats (POST result : historique de chaque compte dans Firestore, notification FCM dans sa langue,
// résultat remis aux téléphones restés sur la page, invités compris ; jetons faux, d'une autre partie ou d'un autre créateur refusés ; idempotent ;
// Firestore en panne puis relance sans doublon), réclamation par le QR code du résultat, historique paginé, suppression, bornes, PARTIE=0.
// Faux Firebase (jetons, OAuth2, Firestore REST, FCM) de amis-fakes.mjs : aucun accès réseau réel. Ports 19500–19503.
import './setup-env.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startFakes, tag } from './amis-fakes.mjs';

const require = createRequire(import.meta.url);
const P = require('../src/partie.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = m => console.log('✓ ' + m);
const until = async (fn, ms = 5000) => { for (let t = 0; t < ms && !fn(); t += 50) await sleep(50); return fn(); };
const F = await startFakes();
const IMG = 'https://cards.scryfall.io/normal/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg?1599707796';

const procs = [];
const start = (env, p) => new Promise((resolve, reject) => {
  const c = spawn('node', ['proxy.mjs'], { env: { ...process.env, EDH_SOURCE_URL: '', PORT: String(p), CARDTRADER_TOKEN: 'tok', ALERTS: '0', PUBDECKS: '0', BAD_KEY_DELAY_MS: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.log = () => out;
  c.stdout.on('data', d => { out += d; if (/Mana Orbit →/.test(out)) resolve(c); }); c.stderr.on('data', d => { out += d; });
  c.on('exit', code => { if (code) reject(new Error('exit ' + code + ': ' + out)); });
  procs.push(c);
});
process.on('exit', () => { for (const p of procs) try { p.kill(); } catch {} });
let BASE = '';
/** Appel au nom d'un compte (uid : jeton signé), d'une place (key), d'un réseau (ip : X-Forwarded-For). */
const call = async (method, path, { uid, key, body, tok, ip } = {}) => {
  const h = { 'Content-Type': 'application/json', 'Accept-Encoding': 'identity' }, t = tok !== undefined ? tok : uid ? F.jwt(uid) : '';
  if (t) h['x-firebase-token'] = t; if (key) h['x-partie-key'] = key; if (ip) h['x-forwarded-for'] = ip;
  const r = await fetch(BASE + '/api/partie' + path, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  const x = await r.text(); let o; try { o = JSON.parse(x); } catch { o = x; } return { s: r.status, o, h: r.headers };
};
const U = { a: 'uid-alice-partie1', b: 'uid-bob-partie2', c: 'uid-carol-partie3', d: 'uid-dave-partie4', e: 'uid-eve-partie5' }, T = Object.fromEntries(Object.entries(U).map(([k, v]) => [k, tag(v)]));
const paced = async f => { for (let i = 0; ; i++) { const r = await f(); if (r.s !== 429 || i > 3) return r; await sleep(400); } };
const poll = (S, v) => paced(() => call('GET', `/s?c=${S.c}${v != null ? '&v=' + v : ''}`, { key: S.key }));
const op = (S, o) => paced(() => call('POST', '/op', { key: S.key, body: { c: S.c, ...o } }));
const noIds = (o, what) => { const j = JSON.stringify(o); for (const k of Object.keys(U)) assert.ok(!j.includes(U[k]) && !j.includes(T[k]), what + ' : aucun UID ni empreinte'); };
const hist = k => { const d = F.fs.docs.get('parties/' + T[k]); return d ? JSON.parse(d.j).h : []; };

/* ── 0) PARTIE=0, ou sans compte de service : coupé ──────────────────────────────────────────────── */
{
  let P0 = await start({ ...F.env, PARTIE: '0' }, 19500); BASE = 'http://127.0.0.1:19500';
  assert.equal((await (await fetch(BASE + '/__ping')).json()).partie, false);
  let r = await call('POST', '', { uid: U.a, body: {} }); assert.equal(r.s, 404); assert.equal(r.o.error, 'partie_disabled');
  r = await call('GET', '/peek?c=ABCDEF'); assert.equal(r.s, 404); assert.equal(r.o.error, 'partie_disabled');
  P0.kill(); await sleep(200);
  P0 = await start({ FIREBASE_JWKS_URL: F.env.FIREBASE_JWKS_URL }, 19500);
  assert.equal((await (await fetch(BASE + '/__ping')).json()).partie, false, 'sans compte de service : pas d\'historique, fonction coupée');
  P0.kill(); await sleep(200);
  ok('PARTIE=0 ou sans compte de service : coupé (ping partie: false, 404)');
}

/* ── 1) Serveur normal ───────────────────────────────────────────────────────────────────────────── */
const P1 = await start({ ...F.env, PARTIE_AWAY_MS: '1500', PARTIE_RES_PER_H: '200' }, 19501); BASE = 'http://127.0.0.1:19501';
assert.equal((await (await fetch(BASE + '/__ping')).json()).partie, true);
assert.match(P1.log(), /Compteur de vie \(parties de Commander, Standard ou libre\) : 500 salles d'attente au plus/);
{
  let r = await call('POST', '', { body: { id: 'abc' } }); assert.equal(r.s, 401); assert.equal(r.o.error, 'auth_required');
  r = await call('POST', '', { tok: 'abc.def.ghi', body: {} }); assert.equal(r.s, 401); assert.equal(r.o.error, 'bad_token');
  r = await call('POST', '', { tok: F.jwt(U.a, -60), body: {} }); assert.equal(r.s, 401); assert.equal(r.o.error, 'token_expired');
  r = await call('POST', '/result', { body: {} }); assert.equal(r.s, 401);
  r = await call('GET', '/s?c=ABCDEF'); assert.equal(r.s, 404); assert.equal(r.o.error, 'gone');
  r = await call('PUT', '', { uid: U.a, body: {} }); assert.equal(r.s, 405);
  r = await call('POST', '', { uid: U.a, body: { id: 'zzzzzzzz0001', deck: { image: 'https://evil.example/a.jpg' } } }); assert.equal(r.s, 400); assert.equal(r.o.error, 'bad_image', 'image hors Scryfall : refusée');
  ok('jeton Firebase exigé pour créer (absent, faux, expiré) ; images Scryfall seulement ; sans clé : « partie introuvable »');
}

// la partie d'Alice, sur son téléphone (src/partie.js), puis sa salle d'attente
let game = P.partieNew({ moi: { nom: 'Alice', deck: { nom: 'Superfriends', commandant: "Atraxa, Praetors' Voice", image: IMG } }, id: 'alicegame001', now: Date.now() });
let r = await call('POST', '', { uid: U.a, body: { id: game.id, n: 'Alice', l: 'fr', pos: 1, deck: game.places[0].deck, format: 40, size: 8 } });
assert.equal(r.s, 200, JSON.stringify(r.o));
const A = { c: r.o.s.c, key: r.o.key };
assert.match(A.c, /^[A-HJKMNP-Z2-9]{6}$/); assert.match(A.key, /^[\w-]{24}$/);
assert.deepEqual([r.o.s.st, r.o.s.id, r.o.s.me, r.o.s.host, r.o.s.format, r.o.s.size], ['wait', 'alicegame001', 1, true, 40, 8]);
assert.deepEqual(r.o.s.places, [{ pos: 1, n: 'Alice', k: 'compte', h: 1, dev: 1, on: 1, deck: { nom: 'Superfriends', commandant: "Atraxa, Praetors' Voice", image: IMG } }]);
noIds(r.o, 'création');
let v = r.o.s.v;
r = await call('POST', '', { uid: U.a, body: { id: game.id, n: 'Alice' } }); assert.deepEqual([r.o.s.c, r.o.key], [A.c, A.key], 'même partie : sa salle (rechargement)');
r = await poll(A, v); assert.deepEqual(r.o, { v, same: 1, on: [1] }, 'rien de neuf : réponse courte et présences');
ok('création : code, clé, place du créateur ; même partie rouverte : la même salle ; relevé court');

// coup d'œil sans compte
r = await call('GET', '/peek?c=' + A.c.toLowerCase());
assert.deepEqual(r.o, { c: A.c, st: 'wait', jeu: 'commander', format: 40, size: 8, host: 'Alice', free: [2, 3, 4, 5, 6, 7, 8], places: [{ pos: 1, n: 'Alice', k: 'compte', h: 1 }] });
r = await call('GET', '/peek?c=ZZZZZZ'); assert.equal(r.s, 404); assert.equal(r.o.error, 'not_found');
ok('coup d\'œil avant d\'entrer, sans compte : places prises et libres');

// Bob (compte) place 3, Carol (compte) première place libre, Dave place 3 déjà prise, Zoé invitée sans compte
r = await call('POST', '/join', { uid: U.b, body: { c: A.c, pos: 3, n: 'Bob', p: 'data:image/png;base64,AAAA', deck: { nom: 'Vampires', commandant: 'Edgar Markov', image: 'normal/front/a/b/edgar.jpg' } } });
assert.equal(r.s, 200, JSON.stringify(r.o)); const B = { c: A.c, key: r.o.key };
assert.deepEqual([r.o.s.me, r.o.s.host], [3, false]); assert.equal(r.o.s.places.find(p => p.pos === 3).deck.image, 'https://cards.scryfall.io/normal/front/a/b/edgar.jpg', 'image courte : adresse complète');
r = await call('POST', '/join', { uid: U.c, body: { c: A.c, n: 'Carol' } }); const C = { c: A.c, key: r.o.key }; assert.equal(r.o.s.me, 2, 'première place libre');
r = await call('POST', '/join', { uid: U.d, body: { c: A.c, pos: 3, n: 'Dave' } }); assert.equal(r.s, 409); assert.equal(r.o.error, 'taken'); assert.deepEqual(r.o.free, [4, 5, 6, 7, 8]);
r = await call('POST', '/join', { uid: U.d, body: { c: A.c, pos: 9, n: 'Dave' } }); assert.equal(r.s, 400); assert.equal(r.o.error, 'bad_place');
r = await call('POST', '/join', { body: { c: A.c, n: '' } }); assert.equal(r.s, 400); assert.equal(r.o.error, 'name', 'invité : prénom exigé');
r = await call('POST', '/join', { body: { c: A.c, n: 'Fuck' } }); assert.equal(r.s, 400); assert.equal(r.o.error, 'name', 'mot grossier : refusé');
r = await call('POST', '/join', { body: { c: A.c, n: 'Zoé', pos: 4, deck: { commandant: 'Tymna the Weaver + Thrasios, Triton Hero' } } });
assert.equal(r.s, 200, JSON.stringify(r.o)); const Z = { c: A.c, key: r.o.key }; assert.deepEqual([r.o.s.me, r.o.s.places.find(p => p.pos === 4).k], [4, 'invite']);
r = await call('POST', '/join', { uid: U.b, body: { c: A.c, n: 'Bob' } }); assert.equal(r.o.key, B.key, 'Bob revient (rechargement, autre appareil) : sa place');
r = await poll(A, v); assert.ok(r.o.v > v); v = r.o.v;
assert.deepEqual(r.o.places.map(p => [p.pos, p.n, p.k, p.dev, p.on]), [[1, 'Alice', 'compte', 1, 1], [2, 'Carol', 'compte', 1, 1], [3, 'Bob', 'compte', 1, 1], [4, 'Zoé', 'invite', 1, 1]], 'le créateur voit compte / invité');
assert.equal(r.o.places.find(p => p.pos === 3).p, 'data:image/png;base64,AAAA'); noIds(r.o, 'salle');
ok('entrée par le code : compte (place choisie ou première libre), place prise (409 + libres), invité sans compte (prénom filtré), retour à sa place');

// présence : Zoé ne relève plus
await sleep(1700); await poll(B); await poll(C);
r = await poll(A, v); assert.deepEqual([r.o.same, r.o.on], [1, [1, 2, 3]], 'Zoé silencieuse : absente');
await poll(Z); r = await poll(A, v); assert.deepEqual(r.o.on, [1, 2, 3, 4]);
ok('présence de chaque place (PARTIE_AWAY_MS)');

// actions : seat, me, add, move, kick, opts ; réservées au créateur ; refusées une fois commencée
r = await op(B, { op: 'seat', pos: 4 }); assert.equal(r.s, 409); assert.equal(r.o.error, 'taken');
r = await op(B, { op: 'seat', pos: 5 }); assert.equal(r.o.me, 5);
r = await op(B, { op: 'me', deck: { nom: 'Vampires 2', commandant: 'Edgar Markov', image: 'javascript:alert(1)' } }); assert.equal(r.s, 400); assert.equal(r.o.error, 'bad_image');
r = await op(B, { op: 'me', deck: { nom: 'Vampires 2', commandant: 'Edgar Markov' } }); assert.equal(r.o.places.find(p => p.pos === 5).deck.nom, 'Vampires 2');
r = await op(B, { op: 'add', n: 'Paul' }); assert.equal(r.s, 403); assert.equal(r.o.error, 'not_host');
r = await op(A, { op: 'add', n: 'Paul', deck: { commandant: 'The Ur-Dragon' } }); assert.deepEqual(r.o.places.find(p => p.n === 'Paul'), { pos: 3, n: 'Paul', k: 'invite', dev: 0, on: 0, deck: { commandant: 'The Ur-Dragon' } }, 'invité sans téléphone');
r = await op(A, { op: 'add', n: 'Léon', pos: 5 }); assert.equal(r.o.error, 'taken');
r = await op(A, { op: 'move', from: 3, to: 6 }); assert.equal(r.o.places.find(p => p.n === 'Paul').pos, 6);
r = await op(A, { op: 'move', from: 6, to: 5 }); assert.deepEqual([r.o.places.find(p => p.n === 'Paul').pos, r.o.places.find(p => p.n === 'Bob').pos], [5, 6], 'échange de places');
r = await op(A, { op: 'kick', pos: 2 }); assert.equal(r.o.places.some(p => p.n === 'Carol'), false);
r = await call('GET', `/s?c=${A.c}`, { key: C.key }); assert.equal(r.s, 410); assert.equal(r.o.error, 'kicked', 'Carol retirée');
r = await call('POST', '/join', { uid: U.c, body: { c: A.c, n: 'Carol' } }); assert.equal(r.s, 410, 'et ne revient pas par le code');
r = await op(A, { op: 'kick', pos: 1 }); assert.equal(r.o.error, 'bad_place', 'le créateur ne se retire pas');
r = await op(A, { op: 'opts', size: 4 }); assert.equal(r.s, 400, 'places 5 et 6 occupées');
r = await op(A, { op: 'opts', format: 30, size: 6 }); assert.deepEqual([r.o.format, r.o.size], [30, 6]);
r = await op(A, { op: 'dance' }); assert.equal(r.s, 400);
ok('places : changer de place, son deck, invités du créateur, déplacer, échanger, retirer (et bannir le compte), format et taille ; réservé au créateur');

// le créateur commence : liste figée, jetons des comptes (vue du créateur seulement)
r = await op(A, { op: 'start' });
assert.equal(r.o.st, 'live'); const view = r.o;
assert.deepEqual(view.places.map(p => [p.pos, p.n, p.k, !!p.t]), [[1, 'Alice', 'compte', false], [4, 'Zoé', 'invite', false], [5, 'Paul', 'invite', false], [6, 'Bob', 'compte', true]]);
assert.match(view.places.find(p => p.pos === 6).t, /^[\w-]{80}$/); noIds(view, 'jetons');
r = await poll(B); assert.equal(r.o.places.some(p => p.t), false, 'Bob ne voit aucun jeton');
r = await call('POST', '/join', { uid: U.d, body: { c: A.c, n: 'Dave' } }); assert.equal(r.s, 409); assert.equal(r.o.error, 'started');
r = await op(A, { op: 'add', n: 'Tard' }); assert.equal(r.o.error, 'started');
r = await op(B, { op: 'seat', pos: 2 }); assert.equal(r.o.error, 'started');
ok('commencer : liste figée (entrées et changements refusés), un jeton par compte, visible du créateur seul');

// la partie se joue sur le téléphone d'Alice (src/partie.js), puis le résultat part
game = P.partieFromRoom(game, view); game = P.partieStart(game);
assert.deepEqual(game.places.map(p => [p.pos, p.sorte, p.vie]), [[1, 'moi', 30], [4, 'invite', 30], [5, 'invite', 30], [6, 'compte', 30]]);
game = P.partieCmdDamage(game, 5, 6, 21); game = P.partieEliminate(game, 5, 'commandant', { par: 6 }); game = P.partieLife(game, 4, -30); game = P.partieEliminate(game, 4, 'vie');
game = P.partieEnd(game, [6]);
const res = P.partieResult(game);
const tok6 = res.places.find(p => p.pos === 6).uid;
// Bob a un appareil enregistré (amis), en anglais
const now = Date.now(), FTOK = 'eB0b:APA91b' + 'p'.repeat(120);
F.fs.docs.set('amis/' + T.b, { j: JSON.stringify({ v: 1, n: 'Bob', p: '', l: 'en', c: 0, s: '', f: {}, i: {}, o: {}, x: {}, d: [{ k: 'dk1', sub: { fcm: FTOK }, l: 'en', at: now }], hk: [], wk: [], has: {}, w: null, r: null }), at: now });
r = await call('POST', '/result', { uid: U.a, body: { r: res, c: A.c, key: A.key } });
assert.equal(r.s, 200, JSON.stringify(r.o)); assert.deepEqual(r.o, { ok: true, n: 2, skip: 0 });
const ha = hist('a'), hb = hist('b');
assert.equal(ha.length, 1); assert.deepEqual([ha[0].id, ha[0].moi, ha[0].src], ['alicegame001', 1, 'h']);
assert.equal(hb.length, 1); assert.deepEqual([hb[0].moi, hb[0].src, hb[0].places.find(p => p.pos === 6).vainqueur], [6, 's', true]);
for (const k of ['a', 'b']) { const raw = F.fs.docs.get('parties/' + T[k]).j; assert.ok(!raw.includes(tok6) && !/"uid"/.test(raw), 'ni jeton ni uid stockés'); noIds(raw, 'Firestore'); }
assert.ok(await until(() => F.fcmFor(FTOK).length === 1), 'Bob prévenu');
const m = F.fcmFor(FTOK)[0]; assert.deepEqual(m.notification, { title: 'Game saved', body: 'Alice\'s game: you won!' }); assert.equal(m.data.url, './?parties=1'); assert.equal(m.android.notification.tag, 'mo-partie');
r = await poll(Z); assert.equal(r.o.st, 'done'); assert.deepEqual(r.o.res.places.map(p => [p.pos, p.rang, p.vainqueur]), [[1, 2, false], [4, 3, false], [5, 4, false], [6, 1, true]], 'résultat remis à l\'invitée restée sur la page');
assert.ok(!JSON.stringify(r.o).includes(tok6), 'sans jetons');
{ globalThis.localStorage = (() => { const mm = new Map(); return { getItem: k => mm.get(k) ?? null, setItem: (k, x) => mm.set(k, String(x)), removeItem: k => mm.delete(k) }; })();
  P.partieRoomResult(r.o, { c: Z.c, key: Z.key, host: false, guest: true, pos: 4 }); assert.deepEqual([P.partieHist()[0].moi, P.partieHist()[0].sv], [4, 0], 'gardé dans l\'historique de son navigateur'); delete globalThis.localStorage; }
ok('résultat : historique d\'Alice (h) et de Bob (s, sa place), notification FCM dans sa langue, résultat remis aux téléphones de la table ; rien de personnel stocké');

// idempotent : renvoyé (réseau coupé avant la réponse), puis corrigé par le créateur
r = await call('POST', '/result', { uid: U.a, body: { r: res, c: A.c, key: A.key } }); assert.deepEqual(r.o, { ok: true, n: 2, skip: 0 });
assert.equal(hist('a').length, 1); assert.equal(hist('b').length, 1); await sleep(300); assert.equal(F.fcmFor(FTOK).length, 1, 'pas de 2e notification');
const fixed = P.partieResult(P.partieSetRanks(game, [6, 4, 1, 5]));
r = await call('POST', '/result', { uid: U.a, body: { r: fixed } }); assert.equal(hist('b')[0].places.find(p => p.pos === 4).rang, 2, 'remplacée (une seule entrée)'); assert.equal(hist('b').length, 1);
assert.equal(hist('b')[0].at, hb[0].at, 'date d\'enregistrement gardée'); await sleep(300); assert.equal(F.fcmFor(FTOK).length, 1, 'corrigée : pas de nouvelle notification');
ok('idempotent : le même résultat renvoyé ne fait qu\'une entrée et qu\'une notification ; corrigé, il remplace');

// jetons refusés : faux, d'une autre partie, d'un autre créateur
r = await call('POST', '/result', { uid: U.a, body: { r: { ...res, places: res.places.map(p => (p.uid ? { ...p, uid: p.uid.slice(0, -2) + (p.uid.endsWith('AA') ? 'BB' : 'AA') } : p)) } } });
assert.equal(r.o.skip, 1);
r = await call('POST', '/result', { uid: U.a, body: { r: { ...res, id: 'autrepartie1' } } }); assert.deepEqual([r.o.n, r.o.skip], [1, 1], 'jeton d\'une autre partie'); assert.equal(hist('b').length, 1);
r = await call('POST', '/result', { uid: U.d, body: { r: res } }); assert.deepEqual([r.o.n, r.o.skip], [1, 1], 'jeton présenté par un autre que le créateur'); assert.equal(hist('b').length, 1);
assert.equal(hist('d').length, 1, 'Dave : seulement chez lui');
r = await call('POST', '/result', { uid: U.a, body: { r: { ...res, places: [] } } }); assert.equal(r.s, 400); assert.equal(r.o.error, 'bad_result');
ok('jetons faux, d\'une autre partie ou montrés par un autre compte : ignorés (rien chez Bob)');

// réclamation par le QR code du résultat
const qr = P.decodeResult(P.partieResultLink(res)); assert.ok(qr);
r = await call('POST', '/claim', { uid: U.e, body: { r: qr, pos: 4 } }); assert.deepEqual(r.o, { ok: true, dup: false });
assert.deepEqual([hist('e')[0].moi, hist('e')[0].src], [4, 'q']);
r = await call('POST', '/claim', { uid: U.e, body: { r: qr, pos: 5 } }); assert.deepEqual(r.o, { ok: true, dup: true }, 'déjà là : rien de changé'); assert.equal(hist('e')[0].moi, 4);
r = await call('POST', '/claim', { uid: U.b, body: { r: qr, pos: 6 } }); assert.equal(r.o.dup, true); assert.equal(hist('b')[0].src, 's', 'Bob l\'avait déjà par la salle');
r = await call('POST', '/claim', { uid: U.e, body: { r: qr, pos: 2 } }); assert.equal(r.s, 400); assert.equal(r.o.error, 'bad_place');
r = await call('POST', '/claim', { uid: U.e, body: { r: 'abime', pos: 1 } }); assert.equal(r.s, 400);
ok('« c\'était moi » (QR code du résultat) : dans son seul historique, une fois ; place inconnue ou résultat illisible refusés');

// historique paginé, la plus récente d'abord ; suppression d'une partie, du compte
for (let i = 0; i < 25; i++) {
  const g = P.partieEnd(P.partieNew({ moi: { nom: 'Alice' }, id: 'histo' + String(i).padStart(7, '0'), now: Date.parse('2026-01-01') + i * 86400e3 }), [1], { now: Date.parse('2026-01-01') + i * 86400e3 + 3600e3 });
  r = await call('POST', '/result', { uid: U.a, body: { r: P.partieResult(g) } }); if (r.s === 429) { await sleep(300); i--; continue; } assert.equal(r.s, 200, JSON.stringify(r.o));
}
r = await call('GET', '/hist', { uid: U.a });      // alicegame001 et autrepartie1 (même date : par identifiant), puis les 25 de janvier, de la plus récente à la plus ancienne
assert.equal(r.o.total, 27); assert.equal(r.o.from, 0); assert.deepEqual(r.o.items.slice(0, 3).map(x => x.id), ['alicegame001', 'autrepartie1', 'histo0000024']); assert.equal(r.o.items.length, 20);
assert.deepEqual(Object.keys(r.o.items[0]).sort(), ['at', 'date', 'duree', 'format', 'id', 'moi', 'places', 'src', 'tours']);
r = await call('GET', '/hist?from=20&n=50', { uid: U.a }); assert.deepEqual(r.o.items.map(x => x.id), [6, 5, 4, 3, 2, 1, 0].map(i => 'histo000000' + i));
r = await call('GET', '/hist?n=500', { uid: U.a }); assert.equal(r.o.items.length, 27, '50 par page au plus');
r = await call('DELETE', '/hist?id=histo0000024', { uid: U.a }); assert.deepEqual(r.o, { ok: true, total: 26 });
r = await call('DELETE', '/hist?id=../x', { uid: U.a }); assert.equal(r.s, 400);
r = await call('GET', '/hist', { uid: U.c }); assert.deepEqual(r.o, { total: 0, from: 0, items: [] }, 'sans partie : vide');
r = await call('DELETE', '/me', { uid: U.e }); assert.equal(r.s, 200); assert.equal(F.fs.docs.has('parties/' + T.e), false, 'compte supprimé : historique effacé');
r = await call('GET', '/hist', { uid: U.e }); assert.equal(r.o.total, 0);
ok('historique : paginé (20 par défaut, 50 au plus), la plus récente d\'abord ; une partie retirée ; tout effacé avec le compte');

// Firestore en panne : 503, rien de perdu ni de doublé au nouvel essai
{
  const g = P.partieEnd(P.partieNew({ moi: { nom: 'Alice' }, id: 'pannefs00001' }), []);
  F.fs.down = 1; r = await call('POST', '/result', { uid: U.a, body: { r: P.partieResult(g) } }); F.fs.down = 0;
  assert.equal(r.s, 503); assert.equal(r.o.error, 'unavailable');
  r = await call('POST', '/result', { uid: U.a, body: { r: P.partieResult(g) } }); assert.equal(r.s, 200);
  assert.equal(hist('a').filter(x => x.id === 'pannefs00001').length, 1);
  ok('Firestore en panne : 503 (l\'appli garde le résultat en file), puis une seule entrée');
}

// sans réseau : partie avec des invités seulement, gardée sur le téléphone d'Alice, envoyée au retour du réseau (partieFlush) ; Eve scanne le QR du résultat
{
  const mm = new Map(); globalThis.localStorage = { getItem: k => mm.get(k) ?? null, setItem: (k, x) => mm.set(k, String(x)), removeItem: k => mm.delete(k) };
  const who = uid => ({ uid, getIdToken: async () => F.jwt(uid) }), env = (uid, online) => ({ user: who(uid), online, on: true, base: BASE + '/' });
  let g = P.partieNew({ moi: { nom: 'Alice' }, id: 'horsligne001' });
  g = P.partieAddPlace(g, { sorte: 'invite', nom: 'Mamie', deck: { commandant: 'Edgar Markov' } }); g = P.partieStart(g);
  g = P.partieLife(g, 2, -40); g = P.partieEliminate(g, 2, 'vie'); g = P.partieEnd(g);
  const rr = P.partieDone(g, { ...env(U.a, false), flush: false });
  assert.deepEqual(await P.partieFlush(env(U.a, false)), { sent: 0, left: 1, skip: 'offline' }); assert.equal(hist('a').some(x => x.id === 'horsligne001'), false);
  assert.deepEqual(await P.partieFlush(env(U.a, true)), { sent: 1, left: 0, skip: '' }, 'retour du réseau : envoyé');
  assert.equal(hist('a').filter(x => x.id === 'horsligne001').length, 1); assert.equal(P.partieHist().find(x => x.id === 'horsligne001').sv, 1);
  const link = P.partieResultLink(rr), seen = P.partieParseUrl(link);
  assert.ok(P.partieClaim(seen.partie, 2, { ...env(U.e, false), flush: false }), '« c\'était moi : place 2 », hors ligne');
  assert.deepEqual(await P.partieFlush(env(U.e, true)), { sent: 1, left: 0, skip: '' });
  assert.deepEqual([hist('e')[0].id, hist('e')[0].moi, hist('e')[0].src], ['horsligne001', 2, 'q']);
  delete globalThis.localStorage;
  ok('sans réseau : partie gardée sur le téléphone, envoyée au retour du réseau ; réclamée par le QR code du résultat, envoyée plus tard');
}

// tout par l'API de l'appli (src/partie.js), trois téléphones : salle créée, un compte et une invitée entrent, début, partie, fin, envoi, résultat reçu par l'invitée
{
  const dev = () => { const mm = new Map(); return { getItem: k => mm.get(k) ?? null, setItem: (k, x) => mm.set(k, String(x)), removeItem: k => mm.delete(k) }; };
  const LA = dev(), LB = dev(), LG = dev(), on = ls => { globalThis.localStorage = ls; };
  const envOf = uid => ({ user: uid ? { uid, getIdToken: async () => F.jwt(uid) } : null, online: true, on: true, base: BASE + '/' });
  on(LA); let g = P.partieNew({ moi: { nom: 'Alice', deck: { commandant: 'Edgar Markov' } }, id: 'appflow00001' }); P.partieSave(g);
  const s0 = await P.partieRoomCreate(g, { ...envOf(U.a), n: 'Alice' }); assert.deepEqual([s0.st, s0.me, P.partieRoom().host], ['wait', 1, true]);
  on(LB); const pk = await P.partiePeek(s0.c, envOf(null)); assert.deepEqual(pk.free, [2, 3, 4, 5, 6, 7, 8]);
  const sb = await P.partieRoomJoin(s0.c, { ...envOf(U.b), n: 'Bob', pos: 3, deck: { nom: 'Elfes', commandant: 'Lathril, Blade of the Elves', image: IMG } }); assert.equal(sb.me, 3);
  on(LG); const sg = await P.partieRoomJoin(s0.c, { ...envOf(null), n: 'Gina' }); assert.deepEqual([sg.me, P.partieRoom().guest], [2, true]);
  on(LA); const v = await P.partieRoomOp('start', {}, envOf(U.a)); assert.equal(v.st, 'live');
  g = P.partieFromRoom(g, v); assert.deepEqual(g.places.map(p => [p.pos, p.sorte, !!p.uid]), [[1, 'moi', false], [2, 'invite', false], [3, 'compte', true]]);
  g = P.partieStart(g); g = P.partieCmdDamage(g, 1, 3, 21); g = P.partieEliminate(g, 1, 'commandant', { par: 3 }); g = P.partieEnd(g, [3]); P.partieSave(g);
  P.partieDone(g, { ...envOf(U.a), flush: false }); assert.equal(P.partieQueue()[0].c, s0.c, 'envoyé avec la salle');
  assert.deepEqual(await P.partieFlush(envOf(U.a)), { sent: 1, left: 0, skip: '' });
  assert.deepEqual([hist('b').find(x => x.id === 'appflow00001').moi, hist('a').find(x => x.id === 'appflow00001').src], [3, 'h']);
  on(LG); await new Promise(res => { const stop = P.partieRoomWatch(x => { if (x && x.st === 'done') { stop(); res(); } }, envOf(null)); });
  assert.deepEqual([P.partieHist()[0].id, P.partieHist()[0].moi, P.partieHist()[0].sv], ['appflow00001', 2, 0], 'l\'invitée garde la partie dans son navigateur'); assert.equal(P.partieRoom(), null);
  delete globalThis.localStorage;
  ok('par l\'API de l\'appli : salle créée, coup d\'œil, un compte et une invitée entrent, début, fin, envoi ; résultat chez Bob et dans le navigateur de l\'invitée');
}

// formats : salle Standard (table de 2, 20 points), format refusé, salle d'une appli d'avant (sans jeu : Commander), réglages, place de plus, résultat Standard
// dans l'historique de chaque compte, résultats mal assortis refusés, QR code du résultat ; puis une appli d'avant (src/partie.js du commit a7b92dc) qui rejoint
{
  const UF = 'uid-fred-partie6', UG = 'uid-gina-partie7', UI = 'uid-ines-partie8', hf = uid => { const d = F.fs.docs.get('parties/' + tag(uid)); return d ? JSON.parse(d.j).h : []; };
  r = await call('POST', '', { uid: UF, body: { id: 'fmtbad000001', n: 'Fred', jeu: 'vintage' } }); assert.equal(r.s, 400); assert.equal(r.o.error, 'bad_jeu');
  r = await call('POST', '', { uid: UF, body: { id: 'fmtbad000002', n: 'Fred', jeu: 7 } }); assert.equal(r.s, 400); assert.equal(r.o.error, 'bad_jeu');
  r = await call('POST', '', { uid: UF, body: { id: 'oldapp000001', n: 'Fred', format: 30 } }); const O = { c: r.o.s.c, key: r.o.key };      // appli d'avant : sans jeu
  assert.deepEqual([r.o.s.jeu, r.o.s.format, r.o.s.size], ['commander', 30, 8], 'sans jeu : Commander, comme avant');
  r = await call('GET', '/peek?c=' + O.c); assert.deepEqual([r.o.jeu, r.o.format], ['commander', 30]);
  r = await call('POST', '', { uid: UF, body: { id: 'duelstd00001', n: 'Fred', jeu: 'standard', format: 40, deck: { nom: 'Mono-rouge' } } });
  assert.equal(r.s, 200, JSON.stringify(r.o)); const S = { c: r.o.s.c, key: r.o.key };
  assert.deepEqual([r.o.s.jeu, r.o.s.format, r.o.s.size], ['standard', 20, 2], 'Standard : 20 points (40 refusé), table de 2');
  r = await poll(O); assert.deepEqual([r.o.st, r.o.why], ['end', 'replaced']);
  r = await call('GET', '/peek?c=' + S.c); assert.deepEqual([r.o.jeu, r.o.format, r.o.size, r.o.free], ['standard', 20, 2, [2]], 'coup d\'œil : format, une place libre');
  r = await op(S, { op: 'opts', jeu: 'modern' }); assert.equal(r.s, 400); assert.equal(r.o.error, 'bad_jeu'); assert.equal(r.o.s.jeu, 'standard', 'rien de changé');
  r = await op(S, { op: 'opts', format: 40 }); assert.equal(r.s, 400, 'Standard : 40 refusé'); assert.equal(r.o.s.format, 20);
  r = await op(S, { op: 'opts', jeu: 'libre', format: 55, size: 8 }); assert.deepEqual([r.o.jeu, r.o.format, r.o.size], ['libre', 55, 8]);
  r = await op(S, { op: 'opts', jeu: 'libre', format: 1000 }); assert.equal(r.s, 400, 'Libre : 999 au plus');
  r = await op(S, { op: 'opts', jeu: 'commander' }); assert.deepEqual([r.o.jeu, r.o.format], ['commander', 40], 'jeu changé seul : 55 ne va pas en Commander, 40');
  r = await op(S, { op: 'opts', jeu: 'standard', format: 20, size: 2 }); assert.deepEqual([r.o.jeu, r.o.format, r.o.size], ['standard', 20, 2]);
  // Gina (compte) rejoint par le QR code ; Hugo (invité) : table complète, puis une place de plus
  r = await call('POST', '/join', { uid: UG, body: { c: S.c, n: 'Gina', deck: { nom: 'Azorius' } } }); assert.equal(r.s, 200, JSON.stringify(r.o)); const G = { c: S.c, key: r.o.key };
  assert.deepEqual([r.o.s.me, r.o.s.jeu, r.o.s.format, r.o.s.size], [2, 'standard', 20, 2]);
  r = await call('POST', '/join', { body: { c: S.c, n: 'Hugo' }, ip: '192.0.2.77' }); assert.equal(r.s, 409); assert.equal(r.o.error, 'full', 'table de 2 complète');
  r = await op(S, { op: 'opts', size: 1 }); assert.equal(r.s, 400);
  r = await op(S, { op: 'opts', size: 3 }); assert.equal(r.o.size, 3);
  r = await call('POST', '/join', { body: { c: S.c, n: 'Hugo' }, ip: '192.0.2.77' }); assert.equal(r.s, 200); const H = { c: S.c, key: r.o.key }; assert.equal(r.o.s.me, 3, 'place de plus : Hugo entre');
  r = await op(H, { op: 'leave' }); r = await op(S, { op: 'opts', size: 2 }); assert.equal(r.o.size, 2, 'Hugo parti : de nouveau 2');
  r = await op(S, { op: 'start' }); assert.deepEqual([r.o.st, r.o.jeu], ['live', 'standard']); const vs = r.o;
  // la partie sur le téléphone de Fred (src/partie.js)
  let g = P.partieNew({ jeu: 'standard', moi: { nom: 'Fred', deck: { nom: 'Mono-rouge' } }, id: 'duelstd00001' });
  g = P.partieFromRoom(g, vs); assert.deepEqual([g.jeu, g.format, g.places.map(p => [p.pos, p.sorte, p.vie, !!p.uid])], ['standard', 20, [[1, 'moi', 20, false], [2, 'compte', 20, true]]]);
  g = P.partieStart(g); assert.equal(P.partieCmdDamage(g, 1, 2, 5), g, 'Standard : pas de blessures de commandant');
  g = P.partieCounter(g, 1, 'poison', 10); g = P.partieEliminate(g, 1, 'poison'); g = P.partieEnd(g);
  const rs = P.partieResult(g); assert.deepEqual([rs.jeu, rs.format, rs.places.find(p => p.pos === 2).vainqueur], ['standard', 20, true]);
  r = await call('POST', '/result', { uid: UF, body: { r: rs, c: S.c, key: S.key } }); assert.deepEqual(r.o, { ok: true, n: 2, skip: 0 });
  assert.deepEqual(hf(UG).map(x => [x.id, x.jeu, x.format, x.moi, x.src]), [['duelstd00001', 'standard', 20, 2, 's']], 'historique de Gina : partie Standard marquée');
  assert.deepEqual(hf(UF).map(x => [x.id, x.jeu, x.format, x.src]), [['duelstd00001', 'standard', 20, 'h']]);
  r = await poll(G); assert.deepEqual([r.o.st, r.o.jeu, r.o.res.jeu, r.o.res.format], ['done', 'standard', 'standard', 20], 'résultat remis à Gina');
  r = await call('GET', '/hist', { uid: UG }); assert.deepEqual(Object.keys(r.o.items[0]).sort(), ['at', 'date', 'duree', 'format', 'id', 'jeu', 'moi', 'places', 'src', 'tours']);
  assert.equal(P.partieStats(r.o.items.map(P.partieHistClean), { jeu: 'standard' }).wins, 1, 'statistiques Standard de Gina (historique du compte)');
  for (const bad of [{ ...rs, format: 40 }, { ...rs, jeu: 'vintage' }, { ...rs, jeu: 'libre', format: 0 }]) {
    r = await call('POST', '/result', { uid: UF, body: { r: bad } }); assert.equal(r.s, 400, JSON.stringify([bad.jeu, bad.format])); assert.equal(r.o.error, 'bad_result');
  }
  r = await call('POST', '/claim', { uid: UI, body: { r: { ...rs, jeu: 'brawl' }, pos: 2 } }); assert.equal(r.s, 400);
  const qr = P.decodeResult(P.partieResultLink(rs)); assert.equal(qr.jeu, 'standard');
  r = await call('POST', '/claim', { uid: UI, body: { r: qr, pos: 1 } }); assert.deepEqual(r.o, { ok: true, dup: false }); assert.deepEqual(hf(UI).map(x => [x.jeu, x.format, x.moi, x.src]), [['standard', 20, 1, 'q']]);
  ok('formats : salle Standard (20 points, table de 2, une place de plus), jeu et points refusés, salle sans jeu = Commander, résultat Standard chez chaque compte et par le QR code');

  // une appli d'avant (moteur du commit a7b92dc : ne connaît pas jeu) rejoint une salle Standard en invitée : 20 points, résultat gardé, rien ne casse
  let V1 = null;
  try { const src = execFileSync('git', ['show', 'a7b92dc:src/partie.js'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); mkdirSync('tests/.tmp', { recursive: true }); writeFileSync('tests/.tmp/partie-v1.cjs', src); V1 = require('./.tmp/partie-v1.cjs'); } catch (e) { V1 = null; }
  if (!V1) console.log('  (appli d\'avant : moteur du commit a7b92dc introuvable dans l\'historique git, vérification sautée)');
  else {
    const mm = new Map(); globalThis.localStorage = { getItem: k => mm.get(k) ?? null, setItem: (k, x) => mm.set(k, String(x)), removeItem: k => mm.delete(k) };
    r = await call('POST', '', { uid: UF, body: { id: 'duelstd00002', n: 'Fred', jeu: 'standard' } }); const S2 = { c: r.o.s.c, key: r.o.key };
    const env = { user: null, online: true, on: true, base: BASE + '/' };
    const pk = await V1.partiePeek(S2.c, env); assert.deepEqual([pk.format, pk.size, pk.free], [20, 2, [2]], 'appli d\'avant : voit 20 points, une place');
    const sv = await V1.partieRoomJoin(S2.c, { ...env, guest: true, n: 'Vieux' }); assert.equal(sv.me, 2);
    r = await op(S2, { op: 'start' }); let g2 = P.partieStart(P.partieFromRoom(P.partieNew({ jeu: 'standard', moi: { nom: 'Fred' }, id: 'duelstd00002' }), r.o));
    g2 = P.partieEnd(P.partieEliminate(P.partieLife(g2, 1, -20), 1, 'vie')); const r2 = P.partieResult(g2);
    r = await call('POST', '/result', { uid: UF, body: { r: r2, c: S2.c, key: S2.key } }); assert.equal(r.s, 200);
    await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('résultat jamais reçu par l\'appli d\'avant')), 8000); const stop = V1.partieRoomWatch(x => { if (x && x.st === 'done') { clearTimeout(t); stop(); res(); } }, env); });
    const h1 = V1.partieHist(); assert.deepEqual([h1.length, h1[0].id, h1[0].format, h1[0].moi, h1[0].places.find(p => p.pos === 2).vainqueur, 'jeu' in h1[0]], [1, 'duelstd00002', 20, 2, true, false], 'gardée comme une partie à 20 points');
    assert.equal(V1.decodeResult(P.partieResultLink(r2)), null, 'lien ?partie= Standard : « illisible » pour une appli d\'avant (sans planter)');
    assert.ok(V1.decodeResult(P.partieResultLink(res)), 'lien de Commander : toujours lisible par une appli d\'avant');
    assert.ok(P.decodeResult(V1.partieResultLink(V1.partieResult(V1.partieEnd(V1.partieNew({ moi: { nom: 'A' }, id: 'oldlink00001' }), [1])))).id, 'ancien lien (sans format) lu par l\'appli : Commander');
    delete globalThis.localStorage;
    ok('appli d\'avant dans une salle Standard : coup d\'œil (20 points, table de 2), entrée en invitée, résultat reçu et gardé ; lien Standard refusé proprement');
  }
}

// partie en direct : le créateur envoie l'état du compteur (op live), les places le lisent (vue › live) ; chaque joueur change SES points par des deltas (op delta,
// file pour le créateur, idempotente, bornée) ; co-hôtes (demande, acceptation par le créateur seul, droits sur toute la table, retrait, départ), « Tout le monde est
// co-hôte » (allco) ; saisie coupée (lock), joueur éliminé ; fin sans résultat avec sa raison (drop, host, stale) ; rien de personnel dans ce qui est rendu
{
  const UK = 'uid-kim-partie9', UL = 'uid-lea-partie10', liveOp = (S, g) => paced(() => call('POST', '/op', { key: S.key, body: { c: S.c, op: 'live', g } }));
  const dl = (S, d) => paced(() => call('POST', '/op', { key: S.key, body: { c: S.c, op: 'delta', d } }));
  r = await call('POST', '', { uid: UK, body: { id: 'livegame0001', n: 'Kim', p: 'data:image/png;base64,KKKK' } }); const K = { c: r.o.s.c, key: r.o.key };
  r = await call('POST', '/join', { uid: UL, body: { c: K.c, n: 'Léa', pos: 2, p: 'data:image/png;base64,LLLL', deck: { commandant: 'Edgar Markov', image: IMG } } }); const L = { c: K.c, key: r.o.key };
  r = await call('POST', '/join', { body: { c: K.c, n: 'Max', pos: 3 }, ip: '192.0.2.150' }); const M = { c: K.c, key: r.o.key };
  r = await op(K, { op: 'add', n: 'Nor', pos: 4 });
  let g = P.partieNew({ moi: { nom: 'Kim' }, id: 'livegame0001' });
  r = await liveOp(K, P.partieLive(g)); assert.deepEqual([r.s, r.o.error], [409, 'not_started'], 'pas encore commencée');
  r = await dl(L, [{ id: 'lea-0000', k: 'v', n: -1 }]); assert.deepEqual([r.s, r.o.error], [409, 'not_started']);
  r = await op(K, { op: 'start' }); g = P.partieStart(P.partieFromRoom(g, r.o));
  r = await poll(L); assert.equal(r.o.places.some(p => p.p), false, 'partie commencée : plus de miniatures dans les relevés'); assert.equal(r.o.live, undefined);
  r = await dl(L, [{ id: 'lea-0001', k: 'v', n: -3 }]); assert.deepEqual([r.s, r.o.error], [409, 'not_ready'], 'état du compteur pas encore envoyé');
  r = await liveOp(L, P.partieLive(g)); assert.deepEqual([r.s, r.o.error], [403, 'not_host']);
  r = await liveOp(K, { places: [] }); assert.deepEqual([r.s, r.o.error], [400, 'bad_live']);
  await sleep(450); r = await liveOp(K, { ...P.partieLive(g), places: P.partieLive(g).places.map(p => (p.pos === 3 ? { ...p, nom: 'Fuck', uid: 'x'.repeat(40), vie: 1e9 } : p)) });
  assert.equal(r.s, 200, JSON.stringify(r.o)); const v1 = r.o.v;
  r = await call('POST', '/op', { key: K.key, body: { c: K.c, op: 'live', g: P.partieLive(g) } }); assert.deepEqual([r.s, r.o.error], [429, 'rate_limited'], 'un envoi par PARTIE_LIVE_GAP_MS');
  r = await poll(L); assert.equal(r.o.v, v1); assert.deepEqual(r.o.live.places.map(p => [p.pos, p.nom, p.vie]), [[1, 'Kim', 40], [2, 'Léa', 40], [3, '', 9999], [4, 'Nor', 40]], 'noms filtrés, valeurs bornées');
  assert.equal(r.o.live.places[1].deck.commandant, 'Edgar Markov'); assert.ok(!JSON.stringify(r.o).includes('"uid"')); noIds(r.o, 'vue en direct'); assert.ok(!JSON.stringify(r.o).includes(UK) && !JSON.stringify(r.o).includes(tag(UL)));
  await sleep(450); r = await liveOp(K, P.partieLive(g)); const v2 = r.o.v; await sleep(450); r = await liveOp(K, P.partieLive(g)); assert.equal(r.o.v, v2, 'même état : version inchangée');
  ok('en direct : état du compteur envoyé par le créateur seul, partie commencée, borné (noms filtrés, valeurs), un envoi à la fois ; places : vue › live, sans miniatures ni identifiants');

  // deltas d'une place : sa place seulement, idempotents, bornés
  r = await dl(L, [{ id: 'lea-0001', k: 'v', n: -3 }]); assert.equal(r.s, 200, JSON.stringify(r.o)); assert.deepEqual(r.o.acc, [{ id: 'lea-0001', s: 1 }]);
  r = await call('POST', '/op', { key: L.key, body: { c: L.c, op: 'delta', d: [{ id: 'lea-0002', k: 'v', n: -1 }] } }); assert.deepEqual([r.s, r.o.error], [429, 'rate_limited'], 'deux envois trop proches');
  await sleep(200); r = await dl(L, [{ id: 'lea-0001', k: 'v', n: -3 }, { id: 'lea-0002', k: 'b', src: 1, n: 2 }]); assert.deepEqual(r.o.acc, [{ id: 'lea-0001', s: 1 }, { id: 'lea-0002', s: 2 }], 'déjà reçu : même numéro, rien de doublé');
  await sleep(200);
  for (const [d, e] of [[{ id: 'lea-0003', pos: 3, k: 'v', n: -1 }, 'not_cohost'], [{ id: 'lea-0004', k: 't', n: 1 }, 'not_cohost'], [{ id: 'lea-0005', k: 'v', n: 500 }, 'bad_delta'], [{ id: 'lea-0006', k: 'b', src: 2, n: 1 }, 'bad_delta'],
    [{ id: 'x', k: 'v', n: 1 }, 'bad_delta'], [{ id: 'lea-0007', k: 'c', c: 'toString', n: 1 }, 'bad_delta'], [{ id: 'lea-0008', k: 'v', vie: 12 }, 'bad_delta']]) { r = await dl(L, [d]); assert.equal(r.o.error, e, JSON.stringify(d)); await sleep(160); }
  r = await dl(M, [{ id: 'max-0001', k: 'c', c: 'poison', n: 2 }]); assert.deepEqual(r.o.acc, [{ id: 'max-0001', s: 3 }], 'invité avec téléphone : sa place aussi');
  r = await call('POST', '/op', { key: K.key, body: { c: K.c, op: 'delta', d: [{ id: 'kim-0001', k: 'v', n: 1 }] } }); assert.equal(r.s, 400, 'le créateur compte sur son téléphone');
  r = await poll(K, v2); assert.equal(r.o.same, 1, 'deltas : pas de nouvelle version pour les places'); assert.deepEqual(r.o.q.map(d => [d.s, d.by, d.pos, d.k, d.n]), [[1, 2, 2, 'v', -3], [2, 2, 2, 'b', 2], [3, 3, 3, 'c', 2]]);
  r = await poll(L, v2); assert.equal(r.o.q, undefined, 'la file : au créateur seulement');
  let x = P.partieRemote(g, (await poll(K, v2)).o.q); g = x.st; assert.deepEqual([x.done.length, g.places.find(p => p.pos === 2).vie, g.places.find(p => p.pos === 2).blessures['1'], g.places.find(p => p.pos === 3).compteurs.poison, g.rq.s], [3, 35, 2, 2, 3]);
  assert.equal(P.partieRemote(g, (await poll(K, v2)).o.q).st, g, 'appliqués une seule fois (même file relue, redémarrage du créateur)');
  assert.equal(P.partieRemote(P.partieStateClean(JSON.parse(JSON.stringify(g))), [{ s: 2, id: 'lea-0002', pos: 2, by: 2, k: 'b', src: 1, n: 2 }]).st.places[1].vie, 35, 'partie relue du stockage : toujours une seule fois');
  await sleep(450); r = await liveOp(K, P.partieLive(g)); r = await poll(K, v2); assert.equal(r.o.q, undefined, 'live.ack : appliqués, hors de la file');
  r = await poll(L, v2); assert.deepEqual([r.o.live.ack, r.o.live.places[1].vie], [3, 35]);
  for (let i = 0; i < 2; i++) { r = await dl(M, Array.from({ length: 20 }, (_, j) => ({ id: `max-q${i}-${j}`, k: 'v', n: -1 }))); assert.equal(r.s, 200); await sleep(160); }
  r = await dl(M, [{ id: 'max-qx-1', k: 'v', n: -1 }]); assert.deepEqual([r.s, r.o.error], [429, 'queue_full'], 'PARTIE_DQ_MAX en file par place');
  r = await paced(() => call('GET', `/s?c=${K.c}&q=999`, { key: K.key })); assert.equal(r.o.q, undefined, 'relevé du créateur avec q : file vidée');
  await sleep(160); r = await dl(M, Array.from({ length: 21 }, (_, j) => ({ id: 'max-big-' + j, k: 'v', n: -1 }))); assert.equal(r.o.error, 'bad_delta', '20 par envoi');
  ok('deltas : sa place seulement, file pour le créateur (numérotée, relevée et vidée par lui seul), même identifiant jamais refait, bornes (valeur, type, fréquence, file, taille de l\'envoi)');

  // co-hôtes
  r = await op(L, { op: 'ask' }); assert.deepEqual([r.o.co, r.o.ask], [0, 1]);
  r = await op(M, { op: 'ask' }); r = await op(M, { op: 'ask' }); assert.equal(r.o.ask, 1, 'une demande à la fois');
  r = await poll(K); assert.deepEqual(r.o.places.filter(p => p.ask).map(p => p.pos), [2, 3], 'le créateur voit les demandes'); r = await poll(L); assert.equal(r.o.places.some(p => p.ask), false, 'les autres non');
  r = await op(L, { op: 'co', pos: 2, ok: true }); assert.deepEqual([r.s, r.o.error], [403, 'not_host'], 'acceptation : le créateur seulement');
  r = await op(K, { op: 'co', pos: 2, ok: true }); assert.deepEqual(r.o.places.find(p => p.pos === 2).co, 1);
  r = await op(K, { op: 'co', pos: 3, ok: false }); r = await poll(M); assert.deepEqual([r.o.co, r.o.ask, r.o.cw], [0, 0, 'no'], 'refusée');
  r = await op(M, { op: 'ask' }); assert.deepEqual([r.s, r.o.error], [429, 'ask_wait'], 'nouvelle demande trop tôt après un refus');
  r = await op(K, { op: 'co', pos: 4, ok: true }); assert.equal(r.o.error, 'bad_place', 'invité sans téléphone : pas de co-hôte');
  r = await poll(L); assert.deepEqual([r.o.co, r.o.cw, r.o.places.find(p => p.pos === 2).co], [1, 'ok', 1], 'acceptée : rôle visible de tous');
  await sleep(160); r = await dl(L, [{ id: 'lea-co-01', pos: 3, k: 'v', n: -5 }, { id: 'lea-co-02', pos: 4, k: 'b', src: 2, n: 3 }, { id: 'lea-co-03', k: 't', n: 1 }]); assert.equal(r.s, 200, JSON.stringify(r.o));
  x = P.partieRemote(g, (await poll(K)).o.q); g = x.st;
  assert.deepEqual([g.places.find(p => p.pos === 3).vie, g.places.find(p => p.pos === 4).vie, g.places.find(p => p.pos === 4).blessures['2'], g.actif], [35, 37, 3, 2], 'co-hôte : toute la table, tour suivant');
  await sleep(450); r = await liveOp(K, P.partieLive(g));
  r = await op(K, { op: 'co', pos: 2, ok: false }); r = await poll(L); assert.deepEqual([r.o.co, r.o.cw], [0, 'off'], 'rôle retiré');
  await sleep(160); r = await dl(L, [{ id: 'lea-co-04', pos: 3, k: 'v', n: -1 }]); assert.equal(r.o.error, 'not_cohost');
  ok('co-hôtes : demande (une à la fois, vue du créateur seul), acceptée ou refusée par le créateur seul (attente après un refus), droits sur toute la table et tour suivant, retrait');

  // « Tout le monde est co-hôte » : d'office, sans demande ; coupé : restent ceux acceptés un par un
  r = await op(L, { op: 'allco', on: true }); assert.equal(r.o.error, 'not_host');
  r = await op(K, { op: 'allco', on: true }); assert.deepEqual([r.o.allco, r.o.places.filter(p => p.co).map(p => p.pos)], [1, [2, 3]], 'chaque téléphone de la table (pas l\'invité sans téléphone)');
  r = await op(M, { op: 'ask' }); assert.deepEqual([r.o.co, r.o.ask], [1, 0], 'déjà co-hôte : rien à demander');
  await sleep(160); r = await dl(M, [{ id: 'max-all-1', pos: 2, k: 'v', n: 1 }]); assert.equal(r.s, 200);
  r = await op(K, { op: 'co', pos: 2, ok: true }); r = await op(K, { op: 'allco', on: false }); assert.deepEqual([r.o.allco, r.o.places.filter(p => p.co).map(p => p.pos)], [undefined, [2]], 'coupé : Léa (acceptée) le reste, Max non');
  await sleep(160); r = await dl(M, [{ id: 'max-all-2', pos: 2, k: 'v', n: 1 }]); assert.equal(r.o.error, 'not_cohost');
  ok('« Tout le monde est co-hôte » : le créateur seul, d\'office pour chaque téléphone, sans demande ; coupé, les co-hôtes acceptés un par un le restent');

  // saisie coupée par le créateur, joueur éliminé, départ d'un co-hôte
  x = P.partieRemote(g, (await poll(K)).o.q); g = P.partieRemoteOff(x.st, true); await sleep(450); r = await liveOp(K, P.partieLive(g)); assert.equal(r.s, 200);
  r = await poll(L); assert.equal(r.o.live.lock, 1); await sleep(160); r = await dl(L, [{ id: 'lea-lock-1', k: 'v', n: -1 }]); assert.deepEqual([r.s, r.o.error], [409, 'locked']);
  assert.equal(P.partieRemote(g, [{ s: 99, id: 'lea-lock-0', pos: 2, by: 2, k: 'v', n: -1 }]).st.places[1].vie, g.places[1].vie, 'coupée : ignorée par le créateur aussi');
  g = P.partieEliminate(P.partieRemoteOff(g, false), 3, 'vie'); await sleep(450); r = await liveOp(K, P.partieLive(g));
  await sleep(160); r = await dl(M, [{ id: 'max-dead-1', k: 'v', n: 1 }]); assert.deepEqual([r.s, r.o.error], [409, 'eliminated']);
  r = await dl(L, [{ id: 'lea-dead-1', pos: 3, k: 'v', n: 1 }]); assert.deepEqual([r.s, r.o.error], [409, 'eliminated'], 'co-hôte : pas sur un joueur éliminé');
  r = await op(L, { op: 'leave' }); r = await poll(K); assert.equal(r.o.places.find(p => p.pos === 2).co, undefined, 'départ : le rôle tombe');
  ok('saisie coupée (live.lock : refusée par le serveur et ignorée par le créateur), joueur éliminé, départ d\'un co-hôte');

  // fin sans résultat : abandonnée en cours (drop), annulée en préparation (host), effacée car trop vieille (stale) ; création avec allco
  r = await op(K, { op: 'end' }); r = await poll(M); assert.deepEqual([r.o.st, r.o.why, r.o.live], ['end', 'drop', undefined], 'abandonnée en cours : drop');
  r = await call('POST', '', { uid: UK, body: { id: 'livegame0002', n: 'Kim', allco: true } }); const K2 = { c: r.o.s.c, key: r.o.key }; assert.equal(r.o.s.allco, 1);
  r = await call('POST', '/join', { body: { c: K2.c, n: 'Ola' }, ip: '192.0.2.151' }); const O2 = { c: K2.c, key: r.o.key }; assert.equal(r.o.s.co, 1, 'allco à la création : co-hôte d\'office');
  r = await op(K2, { op: 'end' }); r = await poll(O2); assert.deepEqual([r.o.st, r.o.why], ['end', 'host'], 'annulée en préparation : host');
  r = await call('POST', '', { uid: UK, body: { id: 'livegame0003', n: 'Kim' } }); const K3 = { c: r.o.s.c, key: r.o.key };
  r = await call('POST', '/join', { body: { c: K3.c, n: 'Pia' }, ip: '192.0.2.152' }); const P3 = { c: K3.c, key: r.o.key };
  r = await op(K3, { op: 'end', why: 'stale' }); r = await poll(P3); assert.deepEqual([r.o.st, r.o.why], ['end', 'stale'], 'trop vieille : stale');
  r = await op(K3, { op: 'end' }); r = await poll(P3); assert.equal(r.o.why, 'stale', 'déjà finie : raison gardée');
  ok('fin sans résultat : raison reçue par les places (drop en cours, host en préparation, stale trop vieille) ; « Tout le monde est co-hôte » dès la création');
}

// départ : un joueur en attente libère sa place ; le créateur qui part termine la salle ; taille du corps
{
  r = await call('POST', '', { uid: U.d, body: { id: 'davegame0001', n: 'Dave' } }); const D1 = { c: r.o.s.c, key: r.o.key };
  r = await call('POST', '/join', { body: { c: D1.c, n: 'Ines' } }); const I1 = { c: D1.c, key: r.o.key };
  r = await op(I1, { op: 'leave' }); assert.deepEqual(r.o, { ok: true });
  r = await poll(D1); assert.deepEqual(r.o.places.map(p => p.n), ['Dave'], 'place libérée');
  r = await call('POST', '', { uid: U.d, body: { id: 'davegame0002', n: 'Dave' } }); const D2 = { c: r.o.s.c, key: r.o.key };
  r = await poll(D1); assert.deepEqual([r.o.st, r.o.why], ['end', 'replaced'], 'nouvelle partie : l\'ancienne salle en attente se termine');
  r = await call('POST', '/join', { uid: U.b, body: { c: D2.c, n: 'Bob' } }); const B2 = { c: D2.c, key: r.o.key };
  r = await op(D2, { op: 'leave' }); r = await poll(B2); assert.deepEqual([r.o.st, r.o.why], ['end', 'host'], 'le créateur part : plus de partie');
  r = await call('POST', '/op', { key: D2.key, body: 'x'.repeat(40 * 1024) }); assert.equal(r.s, 413);
  ok('départ d\'un joueur (place libérée), du créateur (salle terminée), salle remplacée, corps trop gros (413)');
}

// redémarrage : salles perdues, mais un jeton reste valable (résultat envoyé plus tard)
P1.kill(); await sleep(300);
const P2 = await start({ ...F.env }, 19502); BASE = 'http://127.0.0.1:19502';
r = await poll(A); assert.equal(r.s, 404); assert.equal(r.o.error, 'gone', 'redémarrage : salle terminée');
F.fs.docs.delete('parties/' + T.b);
r = await call('POST', '/result', { uid: U.a, body: { r: res } }); assert.deepEqual([r.o.n, r.o.skip], [2, 0], 'jeton toujours valable après un redémarrage');
assert.equal(hist('b').length, 1);
P2.kill(); await sleep(200);
ok('redémarrage : salles terminées, jetons toujours valables (clé tirée du compte de service)');

/* ── 2) Bornes : salles ouvertes, créations, codes faux, invités par réseau, résultats, inactivité ─────────────────── */
{
  const PB = await start({ ...F.env, PARTIE_MAX: '2', PARTIE_NEW_PER_H: '3', PARTIE_BAD_PER_H: '4', PARTIE_GUEST_PER_H: '2', PARTIE_RES_PER_H: '2', PARTIE_IDLE_MS: '1500', PARTIE_TICK_MS: '200', PARTIE_ASK_MS: '500' }, 19503); BASE = 'http://127.0.0.1:19503';
  r = await call('POST', '', { uid: U.a, body: { id: 'borne0000001' } }); const X = { c: r.o.s.c, key: r.o.key };
  r = await call('POST', '', { uid: U.b, body: { id: 'borne0000002' } }); assert.equal(r.s, 200);
  r = await call('POST', '', { uid: U.c, body: { id: 'borne0000003' } }); assert.equal(r.s, 503); assert.equal(r.o.error, 'busy', 'PARTIE_MAX salles ouvertes');
  for (let i = 0; i < 2; i++) { r = await call('POST', '', { uid: U.a, body: { id: 'borne000001' + i } }); assert.equal(r.s, 200, 'sa propre salle, remplacée, ne compte pas'); }
  r = await call('POST', '', { uid: U.a, body: { id: 'borne0000019' } }); assert.equal(r.s, 429, 'PARTIE_NEW_PER_H créations par compte');
  // codes faux : 4 par compte, 2 par réseau pour un invité ou un coup d'œil
  for (const c of ['ZZZZZZ', 'ZZZZZY', 'ZZZZZX', 'ZZZZZW']) { r = await call('POST', '/join', { uid: U.d, body: { c, n: 'Dave' }, ip: '203.0.113.' + c.charCodeAt(5) }); assert.equal(r.s, 404); }
  r = await call('POST', '/join', { uid: U.d, body: { c: X.c, n: 'Dave' }, ip: '203.0.113.200' }); assert.equal(r.s, 429, 'codes faux répétés : compte bloqué');
  r = await call('GET', '/peek?c=ZZZZZZ', { ip: '198.51.100.7' }); assert.equal(r.s, 404); r = await call('GET', '/peek?c=ZZZZZY', { ip: '198.51.100.7' }); assert.equal(r.s, 404);
  r = await call('GET', '/peek?c=' + X.c, { ip: '198.51.100.7' }); assert.equal(r.s, 429, 'coups d\'œil sur des codes faux : réseau freiné');
  r = await call('POST', '/join', { body: { c: X.c, n: 'Inès' }, ip: '198.51.100.7' }); assert.equal(r.s, 429, 'invité du même réseau aussi');
  ok('bornes : salles ouvertes (503), créations par compte (429), codes faux par compte et par réseau (invité, coup d\'œil : plus stricts)');
  // invités par réseau
  r = await call('POST', '', { uid: U.e, body: { id: 'borne0000020' } }); assert.equal(r.s, 503, 'encore 2 salles ouvertes');
  await sleep(1900);
  r = await poll(X); assert.deepEqual([r.o.st, r.o.why], ['end', 'replaced'], 'remplacée plus haut');
  r = await call('POST', '', { uid: U.e, body: { id: 'borne0000021' } }); assert.equal(r.s, 200, 'salles inactives terminées : places libérées'); const E = { c: r.o.s.c, key: r.o.key };
  for (const n of ['Un', 'Deux']) { r = await call('POST', '/join', { body: { c: E.c, n }, ip: '192.0.2.9' }); assert.equal(r.s, 200); }
  r = await call('POST', '/join', { body: { c: E.c, n: 'Trois' }, ip: '192.0.2.9' }); assert.equal(r.s, 429, 'PARTIE_GUEST_PER_H invités par réseau');
  r = await call('POST', '/join', { body: { c: E.c, n: 'Quatre' }, ip: '192.0.2.10' }); assert.equal(r.s, 200, 'autre réseau'); const Q4 = { c: E.c, key: r.o.key };
  r = await op(Q4, { op: 'ask' }); assert.equal(r.o.ask, 1); await sleep(900);
  r = await poll(Q4); assert.deepEqual([r.o.co, r.o.ask, r.o.cw], [0, 0, 'exp'], 'demande de co-hôte sans réponse : expirée (PARTIE_ASK_MS)');
  r = await op(Q4, { op: 'ask' }); assert.equal(r.o.ask, 1, 'expirée (pas refusée) : nouvelle demande permise tout de suite');
  // résultats par compte
  const g = P.partieResult(P.partieEnd(P.partieNew({ moi: { nom: 'Eve' }, id: 'bornres00001' }), [1]));
  for (let i = 0; i < 2; i++) { r = await call('POST', '/result', { uid: U.e, body: { r: g } }); assert.equal(r.s, 200); }
  r = await call('POST', '/claim', { uid: U.e, body: { r: g, pos: 1 } }); assert.equal(r.s, 429, 'PARTIE_RES_PER_H résultats et réclamations par compte');
  // inactivité d'une salle en attente
  await sleep(1900);
  r = await poll(E); assert.deepEqual([r.o.st, r.o.why], ['end', 'idle'], 'salle en attente inactive : terminée');
  PB.kill();
  ok('bornes : invités par réseau (429), demande de co-hôte expirée, résultats par compte (429), salle inactive terminée (idle)');
}

F.stop();
console.log('PARTIE OK');
process.exit(0);
