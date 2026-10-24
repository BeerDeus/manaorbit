// Échange en direct côté serveur (/api/troc) : création (code de 6 caractères, clé de siège), entrée par le code (codes faux freinés, session pleine),
// relevé versionné (« same »), listes avec les prix du serveur (fichier de prix, sinon le prix de l'appareil), give / ask (dans sa liste, plafonné) /
// accept / set / unask, « Prêt » et « Valider » portant la version du contenu (stale), tout changement retire « Prêt » aux deux, done seulement quand
// les deux ont validé, départ (left), une session à la fois par compte, invitation d'un ami (notifyUser, liste des amis : tr), inactivité (idle),
// bornes (sessions, créations, rythme d'un siège, taille), jeton exigé, aucun UID ni empreinte renvoyé, redémarrage (session terminée), TROC=0.
// Faux Firebase (jetons, OAuth2, Firestore REST, FCM) : aucun accès réseau réel. Ports 19300–19309.
import './setup-env.mjs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { startFakes, tag } from './amis-fakes.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = m => console.log('✓ ' + m);
const F = await startFakes();
const DATA = mkdtempSync(join(tmpdir(), 'troc-data-'));
process.on('exit', () => { try { rmSync(DATA, { recursive: true, force: true }); } catch { /* ignore */ } });
// fichier de prix du serveur (celui de /prices.tsv) : Sol Ring 1,20 €, Llanowar Elves 0,25 € (deux impressions : la moins chère)
writeFileSync(join(DATA, 'prices.tsv.gz'), gzipSync('#MOPX1 2026-10-12T09:00:00Z 3\nSol Ring\t120\t100\nLlanowar Elves\t40\t30\nLlanowar Elves\t25\t25\nArcane Signet\t60\t55\n'));

const procs = [];
const start = (env, p) => new Promise((resolve, reject) => {
  const c = spawn('node', ['proxy.mjs'], { env: { ...process.env, EDH_SOURCE_URL: '', PORT: String(p), CARDTRADER_TOKEN: 'tok', ALERTS: '0', PUBDECKS: '0', EDH_DATA_DIR: DATA, BAD_KEY_DELAY_MS: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.log = () => out;
  c.stdout.on('data', d => { out += d; if (/Mana Orbit →/.test(out)) resolve(c); }); c.stderr.on('data', d => { out += d; });
  c.on('exit', code => { if (code) reject(new Error('exit ' + code + ': ' + out)); });
  procs.push(c);
});
process.on('exit', () => { for (const p of procs) try { p.kill(); } catch {} });
let BASE = '';
/** Appel au nom d'un compte (uid : jeton signé) ou d'un siège (key). */
const call = async (method, path, { uid, key, body, tok, hd = {} } = {}) => {
  const h = { 'Content-Type': 'application/json', ...hd }, t = tok !== undefined ? tok : uid ? F.jwt(uid) : '';
  if (t) h['x-firebase-token'] = t; if (key) h['x-troc-key'] = key;
  const r = await fetch(BASE + '/api/troc' + path, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  const x = await r.text(); let o; try { o = JSON.parse(x); } catch { o = x; } return { s: r.status, o, h: r.headers };
};
const U = { a: 'uid-alice-troc1', b: 'uid-bob-troc2', c: 'uid-carol-troc3', d: 'uid-dave-troc4' }, T = Object.fromEntries(Object.entries(U).map(([k, v]) => [k, tag(v)]));
const LIST_A = [{ n: 'Sol Ring', q: 3, g: 'fr', f: 'Anneau solaire', fl: 'fr', i: 'https://cards.scryfall.io/small/front/a/b/sol-ring.jpg?123', u: 150 }, { n: 'Llanowar Elves', q: 2, g: 'en|m21|180', u: 30 }, { n: 'Vrombl Unknown', q: 1, g: '', u: 777 }, { n: '', q: 1 }, { n: 'Bad Lang', q: 1, g: 'xx|BAD SET|1' }];
const LIST_B = [{ n: 'Arcane Signet', q: 4, g: 'en', u: 50 }, { n: 'Craterhoof Behemoth', q: 1, g: 'de', u: 900 }];
const create = (who, extra = {}) => call('POST', '', { uid: U[who], body: { n: who === 'a' ? 'Alice' : who === 'b' ? 'Bob' : who, l: 'fr', list: who === 'a' ? LIST_A : LIST_B, ...extra } });
const join_ = (who, c, extra = {}) => call('POST', '/join', { uid: U[who], body: { c, n: who === 'b' ? 'Bob' : who, l: 'en', list: who === 'b' ? LIST_B : [], ...extra } });
/** Siège : relevé, action ; l'appli ne dépasse jamais le rythme d'un siège (6 par seconde) : un 429 ici attend et recommence (sauf rawPoll). */
const paced = async f => { for (let i = 0; ; i++) { const r = await f(); if (r.s !== 429 || i > 3) return r; await sleep(400); } };
const rawPoll = (S, v) => call('GET', `/s?c=${S.c}${v != null ? '&v=' + v : ''}`, { key: S.key });
const poll = (S, v) => paced(() => rawPoll(S, v));
const op = (S, o) => paced(() => call('POST', '/op', { key: S.key, body: { c: S.c, ...o } }));
const noIds = (o, what) => { const j = JSON.stringify(o); for (const k of Object.keys(U)) { assert.ok(!j.includes(U[k]) && !j.includes(T[k]), what + ' : aucun UID ni empreinte'); } };

/* ── 0) TROC=0 : coupé ─────────────────────────────────────────────────────────────────────────── */
{
  const P = await start({ ...F.env, TROC: '0' }, 19300); BASE = 'http://127.0.0.1:19300';
  assert.equal((await (await fetch(BASE + '/__ping')).json()).troc, false);
  const r = await create('a'); assert.equal(r.s, 404); assert.equal(r.o.error, 'troc_disabled');
  P.kill(); ok('TROC=0 : coupé (ping troc: false, 404)');
}

/* ── 1) Serveur normal (amis : compte de service simulé ; prix : fichier du serveur) ───────────── */
const P1 = await start({ ...F.env, TROC_BAD_PER_H: '3', TROC_AWAY_MS: '1500' }, 19301); BASE = 'http://127.0.0.1:19301';
assert.equal((await (await fetch(BASE + '/__ping')).json()).troc, true);
assert.match(P1.log(), /Échange en direct : 300 sessions au plus/);
{
  let r = await call('POST', '', { body: { n: 'x' } }); assert.equal(r.s, 401); assert.equal(r.o.error, 'auth_required');
  r = await call('POST', '', { tok: 'abc.def.ghi', body: {} }); assert.equal(r.s, 401); assert.equal(r.o.error, 'bad_token');
  r = await call('POST', '', { tok: F.jwt(U.a, -60), body: {} }); assert.equal(r.s, 401); assert.equal(r.o.error, 'token_expired');
  r = await call('GET', '/s?c=ABCDEF'); assert.equal(r.s, 404); assert.equal(r.o.error, 'gone');
  r = await call('PUT', '', { uid: U.a, body: {} }); assert.equal(r.s, 405);
  ok('jeton Firebase exigé pour créer (absent, faux, expiré) ; sans clé de siège : « session terminée »');
}

// Alice crée la session
let r = await create('a');
assert.equal(r.s, 200, JSON.stringify(r.o));
const A = { c: r.o.s.c, key: r.o.key };
assert.match(A.c, /^[A-HJKMNP-Z2-9]{6}$/, 'code de 6 caractères sans 0, O, 1, I, L'); assert.match(A.key, /^[\w-]{24}$/);
assert.equal(r.o.s.st, 'wait'); assert.equal(r.o.s.host, true); assert.equal(r.o.s.me.n, 'Alice'); assert.equal(r.o.s.ot, null); assert.equal(r.o.s.px, '2026-10-12T09:00:00Z');
assert.equal(r.o.s.me.nl, 4, 'liste : entrée sans nom écartée'); noIds(r.o, 'création');
let v = r.o.s.v;
r = await poll(A, v); assert.deepEqual(r.o, { v, same: 1, on: false }, 'rien de neuf : réponse courte');
r = await call('GET', `/s?c=${A.c}`, { key: 'x'.repeat(24) }); assert.equal(r.s, 404, 'mauvaise clé : session introuvable');
ok('création : code, clé de siège, attente d\'un joueur, prix du serveur datés ; relevé « same » sans nouveauté');

// liste d'Alice avec les prix de la session
r = await call('GET', `/list?c=${A.c}&w=me`, { key: A.key });
assert.deepEqual(r.o.list.map(x => [x.n, x.q, x.g, x.u]), [['Sol Ring', 3, 'fr', 120], ['Llanowar Elves', 2, 'en|m21|180', 30], ['Vrombl Unknown', 1, '', 777], ['Bad Lang', 1, '', undefined]], 'prix du serveur (le moins cher), sinon celui de l\'appareil ; édition précise : celui de l\'appareil (prix de cette impression) ; ligne illisible : sans langue ni édition');
assert.equal(r.o.list[0].i, 'small/front/a/b/sol-ring.jpg', 'image en forme courte'); assert.equal(r.o.list[0].f, 'Anneau solaire');
ok('liste : prix du fichier du serveur (impression la moins chère), prix de l\'appareil pour une carte absente du fichier, images raccourcies');

// codes faux : comptés par compte (3 par heure ici), puis 429 ; un autre compte n'est pas touché
for (const c of ['ZZZZZZ', 'ZZZZZY', 'nope']) { r = await join_('c', c); assert.equal(r.s, 404); assert.equal(r.o.error, 'not_found'); }
r = await join_('c', A.c); assert.equal(r.s, 429, 'codes faux répétés : bloqué, même avec le bon code');
ok('codes faux : 3 par compte et par heure (TROC_BAD_PER_H), puis bloqué');

// Bob rejoint (code en minuscules avec un tiret : accepté)
r = await join_('b', A.c.slice(0, 3).toLowerCase() + '-' + A.c.slice(3));
assert.equal(r.s, 200, JSON.stringify(r.o));
const B = { c: A.c, key: r.o.key };
assert.notEqual(B.key, A.key); assert.equal(r.o.s.st, 'live'); assert.equal(r.o.s.host, false); assert.equal(r.o.s.me.n, 'Bob'); assert.equal(r.o.s.ot.n, 'Alice'); assert.equal(r.o.s.ot.on, true);
noIds(r.o, 'entrée');
r = await join_('d', A.c); assert.equal(r.s, 409); assert.equal(r.o.error, 'full');
r = await join_('b', A.c); assert.equal(r.o.key, B.key, 'Bob revient (rechargement) : sa place');
r = await poll(A, v); assert.equal(r.o.st, 'live'); assert.equal(r.o.ot.n, 'Bob'); assert.ok(r.o.v > v); v = r.o.v;
r = await call('GET', `/list?c=${A.c}&w=ot`, { key: B.key }); assert.deepEqual(r.o.list.map(x => x.n), ['Sol Ring', 'Llanowar Elves', 'Vrombl Unknown', 'Bad Lang'], 'Bob lit la liste d\'Alice');
r = await call('GET', `/list?c=${A.c}&w=ot`, { key: A.key }); assert.deepEqual(r.o.list.map(x => [x.n, x.u]), [['Arcane Signet', 60], ['Craterhoof Behemoth', 900]]);
ok('entrée : code tolérant (minuscules, tiret), session pleine pour un 3e, retour à sa place, listes croisées');

// give / ask / accept, versions
const cvOf = async S => (await poll(S)).o.cv;
r = await op(A, { op: 'give', card: { n: 'Sol Ring', q: 1, g: 'fr', u: 999 } });
assert.equal(r.s, 200); assert.deepEqual(r.o.me.give.map(x => [x.n, x.q, x.u, !!x.r]), [['Sol Ring', 1, 120, false]], 'prix du serveur, pas celui de l\'appareil');
r = await op(B, { op: 'ask', card: { n: 'Llanowar Elves', q: 5, g: 'en|m21|180' } });
assert.equal(r.s, 200); const ask = r.o.ot.give.find(x => x.n === 'Llanowar Elves');
assert.deepEqual([ask.q, ask.r, ask.a, ask.u], [2, 1, 1, 30], 'demande plafonnée à ce qu\'Alice propose, en attente (prix de sa liste : cette impression)');
r = await op(B, { op: 'ask', card: { n: 'Llanowar Elves', q: 1, g: 'en|m21|180' } }); assert.equal(r.s, 409); assert.equal(r.o.error, 'max');
r = await op(B, { op: 'ask', card: { n: 'Llanowar Elves', q: 1, g: 'fr' } }); assert.equal(r.s, 404); assert.equal(r.o.error, 'not_listed', 'autre langue : pas dans sa liste');
r = await op(B, { op: 'ask', card: { n: 'Black Lotus', q: 1 } }); assert.equal(r.o.error, 'not_listed');
r = await op(B, { op: 'give', card: { n: 'Arcane Signet', q: 2, g: 'en' } }); assert.equal(r.o.me.give[0].u, 60);
ok('give (prix de la session), ask (dans sa liste, plafonné, en attente), give de l\'autre côté');

// Prêt : version du contenu, demandes en attente, tout changement retire « Prêt » aux deux
let cv = await cvOf(A);
r = await op(A, { op: 'ready', on: true, cv }); assert.equal(r.s, 409); assert.equal(r.o.error, 'pending', 'Alice doit d\'abord répondre à la demande');
r = await op(B, { op: 'ready', on: true, cv: cv - 1 }); assert.equal(r.s, 409); assert.equal(r.o.error, 'stale'); assert.equal(r.o.s.cv, cv, 'la session à jour revient avec le refus');
r = await op(B, { op: 'ready', on: true, cv }); assert.equal(r.o.me.ready, true);
r = await op(A, { op: 'accept', id: ask.id }); assert.equal(r.o.me.give.find(x => x.id === ask.id).r, undefined); assert.equal(r.o.ot.ready, false, 'contenu changé : Bob n\'est plus prêt');
cv = r.o.cv;
r = await op(A, { op: 'ready', on: true, cv }); assert.equal(r.o.me.ready, true);
r = await op(B, { op: 'confirm', cv }); assert.equal(r.s, 409); assert.equal(r.o.error, 'not_ready');
r = await op(B, { op: 'ready', on: true, cv }); assert.ok(r.o.me.ready && r.o.ot.ready, 'les deux prêts : confirmation');
r = await op(A, { op: 'confirm', cv }); assert.equal(r.o.me.ok, true); assert.equal(r.o.st, 'live', 'une seule validation : pas encore fait');
r = await op(B, { op: 'unask', id: ask.id }); assert.equal(r.o.me.ready, false); assert.equal(r.o.ot.ok, false, 'Bob retire sa demande : validations et « Prêt » annulés');
assert.equal(r.o.ot.give.length, 1);
cv = r.o.cv;
r = await op(A, { op: 'set', id: r.o.ot.give[0].id, q: 2 }); assert.equal(r.o.me.give[0].q, 2); cv = r.o.cv;
r = await op(A, { op: 'set', id: 'zz', q: 1 }); assert.equal(r.s, 404);
for (const S of [A, B]) { r = await op(S, { op: 'ready', on: true, cv }); assert.equal(r.o.me.ready, true); }
r = await op(B, { op: 'ready', on: false }); assert.equal(r.o.me.ready, false); r = await op(B, { op: 'ready', on: true, cv }); assert.equal(r.o.me.ready, true);
r = await op(A, { op: 'confirm', cv }); assert.equal(r.o.st, 'live');
r = await op(B, { op: 'confirm', cv }); assert.equal(r.o.st, 'done', 'les deux ont validé : fait');
assert.deepEqual(r.o.me.give.map(x => [x.n, x.q]), [['Arcane Signet', 2]]); assert.deepEqual(r.o.ot.give.map(x => [x.n, x.q, x.g]), [['Sol Ring', 2, 'fr']]);
noIds(r.o, 'session faite');
r = await poll(A); assert.equal(r.o.st, 'done');
r = await op(A, { op: 'give', card: { n: 'Sol Ring', q: 1, g: 'fr' } }); assert.equal(r.s, 409); assert.equal(r.o.error, 'closed', 'figée');
r = await call('GET', `/list?c=${A.c}&w=ot`, { key: B.key }); assert.deepEqual(r.o.list, [], 'listes libérées');
r = await op(A, { op: 'leave' }); assert.equal(r.o.st, 'done', 'quitter après coup ne défait rien');
r = await op(A, { op: 'got' }); assert.equal(r.o.me.got, true); r = await op(B, { op: 'got' }); assert.equal(r.o.ot.got, true);
ok('Prêt / Valider : version du contenu (stale), demandes à régler d\'abord, tout changement retire Prêt et les validations ; fait seulement à deux');

// départ, une session par compte
r = await create('a'); const A2 = { c: r.o.s.c, key: r.o.key };
r = await create('a'); const A3 = { c: r.o.s.c, key: r.o.key };
r = await poll(A2); assert.equal(r.o.st, 'end'); assert.equal(r.o.why, 'left'); assert.equal(r.o.by, 'me', 'nouvelle session : l\'ancienne se termine');
r = await join_('b', A3.c); const B3 = { c: A3.c, key: r.o.key };
r = await op(B3, { op: 'leave' }); assert.equal(r.o.st, 'end');
r = await poll(A3); assert.deepEqual([r.o.st, r.o.why, r.o.by], ['end', 'left', 'ot'], 'Alice voit que Bob est parti');
r = await op(A3, { op: 'give', card: { n: 'Sol Ring', q: 1 } }); assert.equal(r.o.error, 'closed');
ok('départ : l\'autre voit « parti », plus rien ne change ; une session à la fois par compte');

// présence : Bob ne relève plus → « on » tombe
r = await create('a'); const A4 = { c: r.o.s.c, key: r.o.key }; r = await join_('b', A4.c); const B4 = { c: A4.c, key: r.o.key };
r = await poll(A4); assert.equal(r.o.ot.on, true); await sleep(1700);
r = await poll(A4, r.o.v); assert.deepEqual([r.o.same, r.o.on], [1, false], 'Bob silencieux : hors ligne');
await poll(B4); r = await poll(A4); assert.equal(r.o.ot.on, true);
ok('présence de l\'autre (TROC_AWAY_MS)');

// rythme d'un siège : 12 d'avance, 6 par seconde
await sleep(2200);      // seau plein
{ const rs = await Promise.all(Array.from({ length: 24 }, () => rawPoll(A4, 0))); assert.ok(rs.some(x => x.s === 429), 'trop de relevés : 429'); assert.ok(rs.filter(x => x.s === 200).length >= 12); }
await sleep(1200);
ok('rythme d\'un siège borné');

// invitation d'un ami : amitié vérifiée, notification dans la langue de son appareil, liste des amis (tr)
{
  const now = Date.now(), TOK = 'eB0b:APA91b' + 'y'.repeat(120);
  const doc = (n, f, d = []) => ({ j: JSON.stringify({ v: 1, n, p: '', l: 'fr', c: 0, s: '', f, i: {}, o: {}, x: {}, d, hk: [], wk: [], has: {}, w: null, r: null }), at: now });
  F.fs.docs.set('amis/' + T.a, doc('Alice', { [T.b]: now }));
  F.fs.docs.set('amis/' + T.b, doc('Bob', { [T.a]: now }, [{ k: 'dk1', sub: { fcm: TOK }, l: 'en', at: now }]));
  r = await create('a', { inv: T.c }); assert.equal(r.s, 403); assert.equal(r.o.error, 'not_friend');
  r = await create('a', { inv: 'nope' }); assert.equal(r.s, 400);
  r = await create('a', { inv: T.b }); assert.equal(r.s, 200); assert.equal(r.o.sent, 1, 'un appareil de Bob prévenu'); assert.equal(r.o.s.inv, 'Bob');
  const AI = { c: r.o.s.c, key: r.o.key };
  const m = F.fcmFor(TOK).pop(); assert.deepEqual(m.notification, { title: 'Trade invitation', body: 'Alice invites you to a live trade on Mana Orbit.' }); assert.equal(m.data.url, './?troc=' + AI.c);
  assert.equal(m.android.notification.tag, 'mo-troc');
  const fl = await fetch(BASE + '/api/friends', { headers: { 'x-firebase-token': F.jwt(U.b) } }).then(x => x.json());
  assert.deepEqual(fl.tr.map(x => [x.c, x.n]), [[AI.c, 'Alice']], 'liste des amis de Bob : l\'invitation qui l\'attend');
  r = await join_('b', AI.c); assert.equal(r.o.s.st, 'live');
  const fl2 = await fetch(BASE + '/api/friends', { headers: { 'x-firebase-token': F.jwt(U.b) } }).then(x => x.json()); assert.deepEqual(fl2.tr, [], 'rejointe : plus d\'invitation');
  r = await poll(AI); assert.equal(r.o.inv, 'Bob'); noIds(r.o, 'invitation');
  ok('invitation d\'un ami : amitié vérifiée, notification FCM dans sa langue (./?troc=), visible dans sa liste d\'amis tant qu\'elle l\'attend');
}

// foil : la clé de ligne garde langue, édition et foil (avant : 'en*' perdait langue et foil, 'fr|cmm|400*' son édition) ; prix d'un foil : celui de l'appareil (le fichier n'en a pas)
{
  const LIST_F = [{ n: 'Llanowar Elves', q: 2, g: 'en*', u: 300 }, { n: 'Sol Ring', q: 1, g: 'fr|cmm|400*#pk3x9a-cnm', u: 900 }, { n: 'Arcane Signet', q: 1, g: '*' }, { n: 'Sol Ring', q: 1, g: 'zz*' }];
  r = await create('a', { list: LIST_F }); const AF = { c: r.o.s.c, key: r.o.key };
  r = await join_('b', AF.c); const BF = { c: AF.c, key: r.o.key };
  r = await call('GET', `/list?c=${AF.c}&w=ot`, { key: BF.key });
  assert.deepEqual(r.o.list.map(x => [x.n, x.g, x.u]), [['Llanowar Elves', 'en*', 300], ['Sol Ring', 'fr|cmm|400*', 900], ['Arcane Signet', '*', 60], ['Sol Ring', '*', 120]],
    'foil : langue, édition et foil gardés (emplacement retiré, langue inconnue seule perdue) ; prix de l\'appareil (foil), sinon celui du fichier');
  r = await op(BF, { op: 'ask', card: { n: 'Llanowar Elves', q: 1, g: 'en*' } }); assert.equal(r.s, 200, JSON.stringify(r.o));
  assert.deepEqual(r.o.ot.give.map(x => [x.n, x.g, x.u]), [['Llanowar Elves', 'en*', 300]], 'demande d\'un foil : la ligne foil de sa liste, à son prix');
  r = await op(BF, { op: 'ask', card: { n: 'Llanowar Elves', q: 1, g: 'en' } }); assert.equal(r.o.error, 'not_listed', 'non foil : pas la même ligne');
  r = await op(AF, { op: 'accept', all: true });
  r = await op(AF, { op: 'give', card: { n: 'Sol Ring', q: 1, g: 'fr|cmm|400*', u: 900 } }); assert.deepEqual(r.o.me.give.map(x => [x.g, x.u]), [['en*', 300], ['fr|cmm|400*', 900]]);
  r = await op(BF, { op: 'give', card: { n: 'Arcane Signet', q: 1, g: 'en', u: 999 } }); assert.equal(r.o.me.give[0].u, 60, 'ligne sans foil ni édition : prix du serveur, pas celui de l\'appareil');
  let cv = r.o.cv;
  for (const S of [AF, BF]) { r = await op(S, { op: 'ready', on: true, cv }); assert.equal(r.o.me.ready, true); }
  r = await op(AF, { op: 'undo', on: true }); assert.equal(r.o.error, 'closed', 'pas encore fait : rien à annuler');
  for (const S of [AF, BF]) r = await op(S, { op: 'confirm', cv });
  assert.equal(r.o.st, 'done'); assert.deepEqual(r.o.ot.give.map(x => [x.n, x.g]), [['Llanowar Elves', 'en*'], ['Sol Ring', 'fr|cmm|400*']], 'fait : foil et édition arrivent tels quels');
  assert.ok(r.o.ut > 0, 'temps restant pour l\'annuler');
  ok('foil : clé de ligne (langue, édition, foil) gardée de bout en bout, prix foil de l\'appareil ; demande et don d\'un foil');

  // annuler l'échange fait : des deux côtés ou pas du tout
  r = await op(AF, { op: 'undo', on: true }); assert.equal(r.o.error, 'closed', 'pas encore appliqué chez Alice : rien à défaire');
  for (const S of [AF, BF]) { r = await op(S, { op: 'got' }); assert.equal(r.o.me.got, true); }
  r = await op(AF, { op: 'undo', on: true }); assert.equal(r.s, 200); assert.equal(r.o.me.un, 1); assert.equal(r.o.ud, undefined, 'proposé seulement');
  r = await poll(BF); assert.deepEqual([r.o.ot.un, r.o.me.un, r.o.ud], [1, undefined, undefined], 'Bob voit la proposition');
  r = await op(BF, { op: 'undo', on: false }); assert.deepEqual([r.o.me.un, r.o.ot.un, r.o.ud], [undefined, undefined, undefined], 'Bob refuse : la demande tombe');
  r = await poll(AF); assert.equal(r.o.me.un, undefined, 'Alice le voit');
  r = await op(BF, { op: 'undo', on: true }); r = await op(AF, { op: 'undo', on: true });
  assert.equal(r.o.ud, 1, 'proposé par Bob, accepté par Alice : annulé des deux côtés');
  r = await poll(BF); assert.equal(r.o.ud, 1, 'Bob le voit (chaque appli défait sa collection)');
  r = await op(BF, { op: 'undo', on: false }); assert.equal(r.o.error, 'closed', 'annulé : figé');
  noIds(r.o, 'annulation');
  ok('annuler un échange fait : proposé par l\'un (après l\'avoir appliqué), refusé ou accepté par l\'autre ; accepté : ud chez les deux, figé');
}

// taille, action inconnue
r = await call('POST', '/op', { key: A.key, body: 'x'.repeat(800 * 1024) }); assert.equal(r.s, 413);
r = await create('a'); const A5 = { c: r.o.s.c, key: r.o.key };
r = await op(A5, { op: 'dance' }); assert.equal(r.s, 400);
r = await op(A5, { op: 'ask', card: { n: 'Arcane Signet', q: 1 } }); assert.equal(r.o.error, 'alone', 'seul : rien à demander');
r = await op(A5, { op: 'ready', on: true, cv: 1 }); assert.equal(r.o.error, 'alone');
r = await op(A5, { op: 'give', card: { n: 'Sol Ring', q: 1, g: 'fr' } }); assert.equal(r.s, 200, 'seul : on peut déjà préparer ce qu\'on donne');
ok('corps trop gros (413), action inconnue, seul dans la session');

// redémarrage : sessions perdues
P1.kill(); await sleep(300);
const P2 = await start({ ...F.env }, 19301);
r = await poll(A5); assert.equal(r.s, 404); assert.equal(r.o.error, 'gone', 'redémarrage : session terminée');
P2.kill();
ok('redémarrage : les sessions en mémoire sont terminées (404 gone)');

/* ── 2) Bornes : sessions ouvertes, créations par compte, inactivité ─────────────────────────────── */
{
  const P = await start({ ...F.env, TROC_MAX: '2', TROC_NEW_PER_H: '4', TROC_IDLE_MS: '1200', TROC_TICK_MS: '200' }, 19302); BASE = 'http://127.0.0.1:19302';
  r = await create('a'); const X = { c: r.o.s.c, key: r.o.key };
  r = await create('b'); assert.equal(r.s, 200);
  r = await create('c'); assert.equal(r.s, 503); assert.equal(r.o.error, 'busy', 'TROC_MAX sessions ouvertes');
  await sleep(1800);
  r = await poll(X); assert.deepEqual([r.o.st, r.o.why], ['end', 'idle'], 'inactive : terminée');
  r = await create('c'); assert.equal(r.s, 200, 'places libérées');
  for (let i = 0; i < 4; i++) { r = await create('d'); assert.equal(r.s, 200, 'sa propre session, remplacée, ne compte pas dans TROC_MAX'); }
  r = await create('d'); assert.equal(r.s, 429, 'TROC_NEW_PER_H créations par compte et par heure');
  P.kill();
  ok('bornes : sessions ouvertes (503), créations par compte (429), inactivité (idle)');
}

F.stop();
console.log('TROC OK');
process.exit(0);
