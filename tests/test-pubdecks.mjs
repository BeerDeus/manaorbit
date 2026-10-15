// Decks publics (« Communauté ») côté serveur : GET /api/pubdecks relit Firestore (API REST) avec le compte de service, garde les decks au bon format
// (core.js › pubClean), écarte les signalés et les masqués (PUBDECKS_HIDE), sert la liste (gzip, ETag), la relit en arrière-plan quand elle a vieilli,
// tout de suite après une publication (?fresh=1, plafonné), ne relit rien si 2 agrégations (nombre, somme des dates) disent que rien n'a changé,
// et tient bon si Firestore tombe. Faux OAuth2 et faux Firestore : aucun accès réseau réel.
// Plus : les fonctions communes (pubFromText, pubClean, edhAddComm) et la fusion dans les decks EDHREC (type 'comm').
import './setup-env.mjs';
import http from 'node:http';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const C = createRequire(import.meta.url)('../src/core.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = m => console.log('✓ ' + m);
const tag = uid => createHash('sha256').update(uid).digest('hex');

/* ── 0) Fonctions communes ───────────────────────────────────────────────────────────────────── */
{
  const p = C.pubFromText('Commander\n1 Atraxa, Praetors\' Voice\n\nDeck\n1 Sol Ring\n2 Forest\n96 Island', [C.parseDeck('1 Atraxa, Praetors\' Voice').cards[0].key]);
  assert.deepEqual(p, { cmd: ['Atraxa, Praetors\' Voice'], cards: ['1 Sol Ring', '2 Forest', '96 Island'], n: 100 });
  const cards = ['1 Sol Ring', '60 Forest', '1 Llanowar Elves', '36 Island', '1 sol ring'];
  const g = C.pubClean({ by: '  Ma<x>\n ', cmd: ['Atraxa, Praetors\' Voice'], ci: 'WUBG', cards, updatedAt: Date.parse('2026-10-10T10:00:00Z') });
  assert.deepEqual(g, { by: 'Max', cmd: ['Atraxa, Praetors\' Voice'], ci: 'WUBG', cards: [['Sol Ring', 2], ['Forest', 60], ['Llanowar Elves', 1], ['Island', 36]], u: '2026-10-10' });
  const bad = { by: 'x', cmd: ['A'], ci: 'G', cards: ['99 Forest'] };
  assert.ok(C.pubClean(bad));
  for (const [k, v] of [['by', ''], ['by', 5], ['cmd', []], ['cmd', ['A', 'B', 'C']], ['cmd', ['A', 'a']], ['cmd', 'A'], ['ci', 'GW'], ['ci', 'X'], ['ci', undefined], ['cards', ['98 Forest']], ['cards', ['100 Forest']], ['cards', ['99Forest']], ['cards', ['0 Forest', '99 Island']], ['cards', [5]], ['cards', []]])
    assert.equal(C.pubClean({ ...bad, [k]: v }), null, k + ' = ' + JSON.stringify(v));
  assert.ok(C.pubClean({ ...bad, cmd: ['Tymna the Weaver', 'Thrasios, Triton Hero'], ci: 'WUBG', cards: ['98 Island'] }), 'deux commandants (partenaires)');
  // filtre de mots : variantes (l33t, lettres répétées ou séparées, accents), mots ambigus entiers seulement, aucun nom de carte refusé
  for (const [s, w] of [['F.u.c.k', 'fuck'], ['fuuuck you', 'fuuuck'], ['Connard', 'connard'], ['Sal0pe', 'salope'], ['Hurensohn', 'hurensohn'], ['n1gg3r', 'nigger'], ['H1tler', 'hitler'], ['Pute', 'pute'], ['Mana Orbit', 'manaorbit'], ['ADMIN', 'admin'], ['big ass', 'ass'], ['Vaffanculo', 'vaffanculo'], ['hijo de puta', 'puta'], ['Caralho!', 'caralho'], ['@ss', 'ass']])
    assert.equal(C.pubBad(s), w, s);
  for (const s of ['Max', 'Élodie', 'Bob 42', 'Damnation', 'Assassin', 'Cockatrice', 'Hellkite', 'Dispute', 'Kill Shot', 'Shenanigans', 'Cabal Therapist', 'Thaumaton Torpedo', 'Bite Down', 'As Foretold', 'Ennis, Debate Moderator', 'Grass', 'Scunthorpe', 'Pique-nique', ''])
    assert.equal(C.pubBad(s), '', s);
  const names = readFileSync(new URL('../pwa/names-all.tsv', import.meta.url), 'utf8').split('\n').filter(l => l && l[0] !== '#').map(l => l.split('\t')[0]);
  assert.ok(names.length > 25000); assert.deepEqual(names.filter(n => C.pubBad(n)), [], 'aucun des noms de cartes anglais refusé');
  for (const x of [{ by: 'Sal0pe' }, { cmd: ['Fuck Face'] }, { cards: ['1 Nigger Card', '98 Forest'] }]) assert.equal(C.pubClean({ ...bad, ...x }), null, JSON.stringify(x));
  const known = new Set([...names, 'Edgar Markov'].map(C.ownKey));      // le fichier des traductions n'a pas les cartes imprimées seulement en anglais : le serveur lit le catalogue complet de Scryfall
  assert.ok(C.pubClean({ by: 'Max', cmd: ['Edgar Markov'], ci: 'WBR', cards: ['1 Sol Ring', '1 Adventurous Eater', '1 Adventurous Eater // Have a Bite', '96 Plains'] }, known), 'vraies cartes (face avant d\'une carte double comprise)');
  assert.equal(C.pubClean({ by: 'Max', cmd: ['Edgar Markov'], ci: 'WBR', cards: ['1 Achetez Mes Cartes Ici', '98 Plains'] }, known), null, 'nom inventé : écarté');
  assert.equal(C.pubClean({ by: 'Max', cmd: ['Mon Super Commandant'], ci: 'WBR', cards: ['99 Plains'] }, known), null, 'commandant inventé : écarté');
  ok('vraies cartes seulement (catalogue des noms) : nom inventé, en carte ou en commandant → deck écarté');
  ok('filtre de mots : insultes (fr, en, de, es, it, pt), l33t, lettres répétées ou séparées ; mots ambigus entiers seulement ; aucun des ' + names.length + ' noms de cartes refusé ; pseudo, commandant ou carte refusé → deck écarté');
  ok('commun : deck à publier tiré du texte (commandants à part, 100 cartes), relu au format (pseudo nettoyé, 1 ou 2 commandants, identité de couleur, 100 cartes pile)');

  const tsv = ['#edh\t1\t2026-10-01', 'C\tatraxa\t500\tWUBG\tAtraxa, Praetors\' Voice', 'D\tatraxa\tedhrec\tDeck moyen\t', ...Array.from({ length: 60 }, (_, i) => 'K\t1\tCard ' + i), 'K\t39\tForest', 'P\t150\tCard 1'].join('\n');
  const mine = C.pubClean({ by: 'Max', cmd: ['Atraxa, Praetors\' Voice'], ci: 'WUBG', cards: [...Array.from({ length: 50 }, (_, i) => '1 ' + (i < 30 ? 'Card ' : 'New ') + i), '48 Forest', '1 Atraxa, Praetors\' Voice'], updatedAt: 1 });
  const duo = C.pubClean({ by: 'Bob', cmd: ['Tymna the Weaver', 'Thrasios, Triton Hero'], ci: 'WUBG', cards: [...Array.from({ length: 40 }, (_, i) => '1 Duo ' + i), '58 Island'], updatedAt: 2 });
  const d = C.parseEdh(tsv, null, [{ id: tag('a') + '_0', ...mine }, { id: tag('b') + '_3', ...duo }, { id: 'x', by: 'Vide', cmd: ['Z'], cards: [] }]);
  assert.deepEqual(d.decks.map(x => [x.k, x.src, x.label, x.pid, x.url]), [['avg', 'edhrec', 'Deck moyen', '', ''], ['comm', 'comm', 'Max', tag('a') + '_0', ''], ['comm', 'comm', 'Bob', tag('b') + '_3', '']]);
  assert.equal(d.decks[1].cmd, d.bySlug.get('atraxa'), 'commandant déjà connu : même fiche (rang, thèmes, image)');
  const nc = d.decks[2].cmd; assert.deepEqual([nc.names, nc.ci, nc.decks, nc.rank, nc.tier, nc.comm], [['Tymna the Weaver', 'Thrasios, Triton Hero'], 'WUBG', 0, d.cmds.length, '', true], 'commandant inconnu d\'EDHREC : ajouté avec l\'identité de l\'auteur, classé dernier, sans tier');
  assert.equal(d.decks[1].cmd.tier, 'S', 'commandant EDHREC : son tier');
  assert.equal(d.decks[1].cards.reduce((a, c) => a + c[2], 0), 98, 'la ligne du commandant ne compte pas dans les cartes');
  assert.equal(d.price.get('card 1'), 150); assert.equal(d.price.get('new 40'), undefined, 'carte inconnue du fichier : sans prix');
  const o = { held: () => 0, cols: new Set(), tiers: new Set(), kinds: new Set(['comm']), themes: new Set(), mine: false, budget: 0, sort: 'have', then: '', q: '', qm: 'cmd' };
  const rows = C.edhRank(d, k => (k === 'card 1' || k === 'new 40' ? 1 : 0), o);
  assert.deepEqual(rows.map(r => [r.deck.label, r.total, r.have]), [['Max', 51, 2], ['Bob', 42, 0]]);
  assert.equal(C.edhRank(d, () => 0, { ...o, cols: new Set(['G']) }).length, 0);
  assert.equal(C.parseEdh(tsv, null, []).decks.length, 1); assert.equal(C.parseEdh(tsv).decks.length, 1);
  ok('fusion : decks de la communauté ajoutés aux decks EDHREC (type comm, pseudo, identifiant), commandant retrouvé ou ajouté, cartes inconnues sans prix, filtres et classement inchangés');
}

/* ── Faux OAuth2 et faux Firestore ───────────────────────────────────────────────────────────── */
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { type: 'service_account', project_id: 'mana-test', private_key_id: 'k1', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), client_email: 'svc@mana-test.iam.gserviceaccount.com', client_id: '1', token_uri: 'https://oauth2.googleapis.com/token' };
const oauth = { scopes: [], n: 0 };
const upAuth = http.createServer((req, res) => {
  const c = []; req.on('data', x => c.push(x)); req.on('end', () => {
    const jwt = String(new URLSearchParams(Buffer.concat(c).toString()).get('assertion') || ''); oauth.scopes.push(JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url')).scope);
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ access_token: 'ya29.ds-' + (++oauth.n), expires_in: 3599 }));
  });
});
const sv = v => Array.isArray(v) ? { arrayValue: { values: v.map(sv) } } : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : typeof v === 'boolean' ? { booleanValue: v } : v === null ? { nullValue: null } : { stringValue: String(v) };
const fs = { pubdecks: new Map(), pubreports: new Map(), hits: [], auth: [], down: 0, revoked: new Set(), page: 2, agg: false };
const upFs = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), m = /^\/v1\/projects\/mana-test\/databases\/\(default\)\/documents\/(pubdecks|pubreports)$/.exec(u.pathname), au = String(req.headers.authorization || '');
  fs.hits.push(u.pathname.split('/').pop() + (u.searchParams.get('pageToken') ? '#' + u.searchParams.get('pageToken') : '')); fs.auth.push(au);
  const send = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  // agrégation (nombre + somme d'un champ) : seulement quand fs.agg (avant : comme un Firestore qui la refuse, la liste est relue en entier)
  if (req.method === 'POST' && u.pathname === '/v1/projects/mana-test/databases/(default)/documents:runAggregationQuery') {
    const c = []; for await (const x of req) c.push(x);
    if (!fs.agg) return send(404, { error: { code: 404, message: 'not found' } });
    if (fs.down) return send(503, { error: { code: 503, message: 'The service is currently unavailable.' } });
    if (fs.revoked.has(au.replace(/^Bearer /, ''))) return send(401, { error: { code: 401, message: 'Request had invalid authentication credentials.' } });
    const q = JSON.parse(Buffer.concat(c).toString()).structuredAggregationQuery, col = fs[q.structuredQuery.from[0].collectionId], f = q.aggregations.find(a => a.sum).sum.field.fieldPath;
    const sum = [...col.values()].reduce((a, d) => a + (Number(d[f]) || 0), 0);
    return send(200, [{ result: { aggregateFields: { n: { integerValue: String(col.size) }, s: { integerValue: String(sum) } } }, readTime: '2026-10-10T10:00:00Z' }]);
  }
  if (!m || req.method !== 'GET') return send(404, { error: { code: 404, message: 'not found' } });
  if (fs.down) return send(503, { error: { code: 503, message: 'The service is currently unavailable.' } });
  if (fs.revoked.has(au.replace(/^Bearer /, ''))) return send(401, { error: { code: 401, message: 'Request had invalid authentication credentials.' } });
  const all = [...fs[m[1]]].map(([id, f]) => ({ name: `projects/mana-test/databases/(default)/documents/${m[1]}/${id}`, fields: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, sv(v)])), createTime: '2026-10-10T10:00:00Z', updateTime: '2026-10-10T10:00:00Z' }));
  const from = Number(u.searchParams.get('pageToken') || 0), size = Math.min(Number(u.searchParams.get('pageSize')) || 300, fs.page), docs = all.slice(from, from + size);
  send(200, { ...(docs.length ? { documents: docs } : {}), ...(from + size < all.length ? { nextPageToken: String(from + size) } : {}) });      // collection vide : {} (comme Firestore)
});
// faux Scryfall : catalogue des noms (ceux du fichier des traductions, plus les cartes imprimées seulement en anglais des decks du test)
const CATALOG = [...new Set([...readFileSync(new URL('../pwa/names-all.tsv', import.meta.url), 'utf8').split('\n').filter(l => l && l[0] !== '#').map(l => l.split('\t')[0]), 'Atraxa, Praetors\' Voice', 'Tymna the Weaver', 'Thrasios, Triton Hero', 'Sol Ring', 'Forest', 'Island'])];
const scry = { hits: 0, down: false };
const upScry = http.createServer((req, res) => { scry.hits++; if (scry.down || req.url !== '/catalog/card-names') { res.writeHead(503); return res.end(); } res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ object: 'catalog', total_values: CATALOG.length, data: CATALOG })); });
for (const s of [upAuth, upFs, upScry]) await new Promise(r => s.listen(0, '127.0.0.1', r));
const port = s => s.address().port;

const procs = [];
const start = (env, p) => new Promise((resolve, reject) => {
  const c = spawn('node', ['proxy.mjs'], { env: { ...process.env, EDH_SOURCE_URL: '', PORT: String(p), CARDTRADER_TOKEN: 'tok', ALERTS: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.log = () => out;
  c.stdout.on('data', d => { out += d; if (/Mana Orbit →/.test(out)) resolve(c); }); c.stderr.on('data', d => { out += d; });
  c.on('exit', code => { if (code) reject(new Error('exit ' + code + ': ' + out)); });
  procs.push(c);
});
process.on('exit', () => { for (const p of procs) try { p.kill(); } catch {} });
const get = async (B, path, hd = {}) => { const r = await fetch(B + path, { headers: hd }); const t = await r.text(); let o; try { o = JSON.parse(t); } catch { o = t; } return { s: r.status, o, h: r.headers }; };

/* ── 1) Sans compte de service : coupé, liste vide ─────────────────────────────────────────────── */
{
  await start({}, 18876); const B = 'http://127.0.0.1:18876';
  assert.equal((await get(B, '/__ping')).o.pub, false);
  const r = await get(B, '/api/pubdecks'); assert.equal(r.s, 200); assert.deepEqual(r.o, { at: 0, decks: [], off: true });
  assert.equal(fs.hits.length, 0); ok('sans compte de service : decks publics coupés (ping pub: false, liste vide), Firestore jamais appelé');
}

/* ── 2) Lecture, tri, exclusions ─────────────────────────────────────────────────────────────── */
const A = tag('alice'), Bo = tag('bob'), Cc = tag('carol');
const deck = (o, extra = {}) => ({ o, by: 'Alice', deck: 'd1', name: 'Atraxa', cmd: ['Atraxa, Praetors\' Voice'], ci: 'WUBG', cards: ['1 Sol Ring', '98 Forest'], updatedAt: 1000, v: 1, ...extra });
fs.pubdecks.set(A + '_0', deck(A, { updatedAt: 3000 }));
fs.pubdecks.set(A + '_1', deck(A, { cards: ['97 Forest'], name: '99 cartes' }));                     // 99 cartes : écarté
fs.pubdecks.set(Bo + '_0', deck(Bo, { by: 'Bob', cmd: ['Tymna the Weaver', 'Thrasios, Triton Hero'], cards: ['98 Island'], updatedAt: 2000 }));
fs.pubdecks.set(Bo + '_1', deck(A));                                                                    // o ≠ empreinte de l'identifiant : écarté
fs.pubdecks.set('mauvais_0', deck(A));                                                                  // identifiant hors format : écarté
fs.pubdecks.set(Cc + '_0', deck(Cc, { by: 'Carol', updatedAt: 500 }));                                 // signalé 3 fois : écarté
fs.pubdecks.set(Cc + '_1', deck(Cc, { by: 'Carol', updatedAt: 400 }));                                 // signalé 2 fois : gardé
fs.pubdecks.set(Cc + '_2', deck(Cc, { by: 'Carol', updatedAt: 300 }));                                 // PUBDECKS_HIDE : écarté
fs.pubdecks.set(Cc + '_4', deck(Cc, { by: 'Carol', cards: ['1 Visitez Mon Site', '98 Forest'], updatedAt: 200 }));      // carte inventée (texte libre) : écartée
for (const [d, n] of [[Cc + '_0', 3], [Cc + '_1', 2]]) for (let i = 0; i < n; i++) fs.pubreports.set(`${d}~${tag('r' + i)}`, { d, at: 1 });
const env = { FCM_SERVICE_ACCOUNT: JSON.stringify(SA), FCM_TOKEN_URL: `http://127.0.0.1:${port(upAuth)}/token`, FIRESTORE_BASE_URL: `http://127.0.0.1:${port(upFs)}/`, SCRYFALL_UPSTREAM: `http://127.0.0.1:${port(upScry)}`, PUBDECKS_HIDE: `${Cc}_2, autre`, PUBDECKS_TTL_MS: '1500', PUBDECKS_SOON_MS: '600' };
const P = await start(env, 18877), B = 'http://127.0.0.1:18877';
for (let t = 0; t < 40 && !/Decks publics/.test(P.log()); t++) await sleep(50);      // le journal du démarrage arrive après la première ligne
assert.match(P.log(), /Decks publics : lus dans Firestore au plus toutes les 0 min, retirés après 3 signalements, 2 masqués \(PUBDECKS_HIDE\)/);
assert.equal((await get(B, '/__ping')).o.pub, true);
assert.equal(fs.hits.length, 0, 'rien de lu avant la première demande');
let r = await get(B, '/api/pubdecks');
assert.equal(r.s, 200); assert.match(r.h.get('cache-control'), /no-cache/); assert.ok(r.h.get('etag'));
assert.deepEqual(r.o.decks.map(d => [d.id, d.by]), [[A + '_0', 'Alice'], [Bo + '_0', 'Bob'], [Cc + '_1', 'Carol']], 'plus récents d\'abord ; 99 cartes, propriétaire faux, identifiant hors format, 3 signalements, masqué, carte inventée : écartés');
assert.deepEqual(r.o.decks[0], { id: A + '_0', by: 'Alice', cmd: ['Atraxa, Praetors\' Voice'], ci: 'WUBG', cards: [['Sol Ring', 1], ['Forest', 98]], u: '1970-01-01' });
assert.ok(r.o.at > Date.now() - 5000);
assert.deepEqual(oauth.scopes, ['https://www.googleapis.com/auth/datastore'], 'jeton du compte de service, portée Firestore');
assert.equal(scry.hits, 1, 'catalogue des noms lu une fois');
assert.ok(fs.auth.every(a => a === 'Bearer ya29.ds-1'));
assert.deepEqual(fs.hits.filter(h => h.startsWith('pubdecks')), ['pubdecks', 'pubdecks#2', 'pubdecks#4', 'pubdecks#6', 'pubdecks#8'], 'toutes les pages lues');
ok('liste servie : decks au bon format, plus récents d\'abord, sans les signalés (3), les masqués, les faux ni les cartes inventées (catalogue Scryfall) ; toutes les pages, jeton Firestore du compte de service');

// gzip, ETag
let n0 = fs.hits.length;
const z = await fetch(B + '/api/pubdecks', { headers: { 'Accept-Encoding': 'gzip' } }); assert.equal(z.headers.get('content-encoding'), 'gzip');
const zr = await fetch(B + '/api/pubdecks', { headers: { 'Accept-Encoding': 'identity', 'If-None-Match': r.h.get('etag') } }); assert.equal(zr.status, 304);
const raw = http.get(B + '/api/pubdecks', { headers: { 'Accept-Encoding': 'gzip' } }); const buf = await new Promise(res => raw.on('response', rs => { const c = []; rs.on('data', x => c.push(x)); rs.on('end', () => res(Buffer.concat(c))); }));
assert.deepEqual(JSON.parse(gunzipSync(buf)).decks.length, 3);
assert.equal(fs.hits.length, n0, 'liste gardée : Firestore pas relu');
ok('réponse compressée (gzip), revalidée par ETag (304), gardée en mémoire');

// publication : ?fresh=1 relit tout de suite (pas avant 600 ms ici), plafonné par réseau
fs.pubdecks.set(Bo + '_5', deck(Bo, { by: 'Bob', updatedAt: 9000 }));
r = await get(B, '/api/pubdecks?fresh=1'); assert.equal(r.o.decks.length, 3, 'relue il y a moins de 600 ms : pas encore');
await sleep(700);
r = await get(B, '/api/pubdecks?fresh=1'); assert.equal(r.o.decks[0].id, Bo + '_5', 'nouveau deck tout de suite');
const xff = { 'X-Forwarded-For': '203.0.113.9' }; let lim = 0;
for (let i = 0; i < 8; i++) { await sleep(620); const x = await get(B, '/api/pubdecks?fresh=1', xff); if (x.s === 429) { lim++; assert.ok(Number(x.h.get('retry-after')) > 0); } else assert.equal(x.s, 200); }
assert.ok(lim >= 1, 'relectures forcées plafonnées (6 par 10 min et par réseau)');
assert.equal((await get(B, '/api/pubdecks', xff)).s, 200, 'la liste reste servie');
ok('après une publication : relue tout de suite (?fresh=1), pas plus d\'une fois par intervalle, 6 fois par 10 min et par réseau');

// vieillie : servie telle quelle, relue en arrière-plan
fs.pubdecks.delete(Bo + '_5'); await sleep(1600); n0 = fs.hits.length;
r = await get(B, '/api/pubdecks'); assert.equal(r.o.decks[0].id, Bo + '_5', 'l\'ancienne part tout de suite');
for (let t = 0; t < 40 && fs.hits.length === n0; t++) await sleep(50);
await sleep(200); r = await get(B, '/api/pubdecks'); assert.equal(r.o.decks[0].id, A + '_0', 'puis la nouvelle');
ok('liste vieillie (10 min) : l\'ancienne servie sans attendre, la nouvelle lue en arrière-plan');

// Firestore en panne : l'ancienne liste reste ; jeton révoqué : un nouveau, un seul essai
fs.down = 1; await sleep(1600);
r = await get(B, '/api/pubdecks?fresh=1'); assert.equal(r.s, 200); assert.equal(r.o.decks.length, 3, 'panne : la dernière liste reste');
assert.match(P.log(), /Decks publics : pubdecks : HTTP 503/);
fs.down = 0; fs.revoked.add('ya29.ds-1'); await sleep(700);
fs.pubdecks.set(Cc + '_3', deck(Cc, { by: 'Carol', updatedAt: 9500 }));
r = await get(B, '/api/pubdecks?fresh=1'); assert.equal(r.o.decks[0].id, Cc + '_3'); assert.equal(oauth.n, 2, 'jeton renouvelé');
assert.equal(scry.hits, 1, 'catalogue gardé (relu une fois par jour)');
ok('Firestore en panne : la dernière liste reste servie ; jeton révoqué : un nouveau, un seul essai');

// agrégations (nombre et somme des dates : 2 lectures) : rien de changé depuis la dernière lecture complète → rien de relu
{
  const lists = () => fs.hits.filter(h => /^pub(decks|reports)/.test(h)).length, aggs = () => fs.hits.filter(h => /runAggregationQuery/.test(h)).length;
  const fresh = i => get(B, '/api/pubdecks?fresh=1', { 'X-Forwarded-For': '198.51.100.' + i });      // un réseau par appel : le plafond des relectures forcées ne compte pas ici
  fs.agg = true; await sleep(700);
  let l0 = lists(), a0 = aggs();
  r = await fresh(1); const et = r.h.get('etag');
  assert.equal(aggs() - a0, 2, '2 agrégations'); assert.ok(lists() > l0, 'empreinte encore inconnue : relecture complète');
  await sleep(700); l0 = lists(); a0 = aggs();
  r = await fresh(2); assert.equal(r.s, 200); assert.equal(aggs() - a0, 2); assert.equal(lists(), l0, 'rien de changé : rien de relu');
  assert.equal(r.h.get('etag'), et, 'même liste, même ETag'); assert.equal(r.o.decks.length, 4);
  const keep = { b: fs.pubdecks.get(Bo + '_0'), c: fs.pubdecks.get(Cc + '_4') }, rep9 = `${Cc}_1~${tag('r9')}`;
  let i = 3;
  for (const change of [() => fs.pubdecks.set(Bo + '_0', { ...keep.b, by: 'Bobby', updatedAt: 2001 }), () => fs.pubdecks.delete(Cc + '_4'), () => fs.pubreports.set(rep9, { d: Cc + '_1', at: 2 })]) {
    change(); await sleep(700); l0 = lists();
    r = await fresh(i++); assert.ok(lists() > l0, 'changement vu par les agrégations : relecture complète');
  }
  assert.ok(r.o.decks.some(d => d.by === 'Bobby') && !r.o.decks.some(d => d.id === Cc + '_1'), 'deck modifié relu, deck signalé une 3e fois retiré');
  fs.pubdecks.set(Bo + '_0', keep.b); fs.pubdecks.set(Cc + '_4', keep.c); fs.pubreports.delete(rep9);      // état d'avant pour la suite
  ok('agrégations avant de relire : rien de changé → rien de relu (même ETag) ; deck modifié, retiré ou signalé → relecture complète');
}

/* ── 3) Démarrage avec Firestore injoignable : 503 propre, puis la liste ─────────────────────── */
{
  fs.down = 1; scry.down = true;
  const P3 = await start({ ...env, PUBDECKS_SOON_MS: '300' }, 18878), B3 = 'http://127.0.0.1:18878';
  r = await get(B3, '/api/pubdecks'); assert.equal(r.s, 503); assert.equal(r.h.get('retry-after'), '60');
  r = await get(B3, '/api/pubdecks'); assert.equal(r.s, 503, 'pas de nouvel essai avant l\'intervalle');
  fs.down = 0; await sleep(350);
  r = await get(B3, '/api/pubdecks'); assert.equal(r.s, 200);
  assert.deepEqual(r.o.decks.map(d => d.id).sort(), [A + '_0', Bo + '_0', Cc + '_1', Cc + '_3', Cc + '_4'].sort(), 'catalogue Scryfall injoignable : noms non contrôlés (filtre de mots seul)');
  assert.match(P3.log(), /catalogue des cartes Scryfall illisible/);
  assert.equal((await fetch(B3 + '/api/pubdecks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 405);
  ok('Firestore injoignable au démarrage : 503 (réessayer dans 60 s), puis la liste dès qu\'il répond ; POST refusé');
}
/* ── 4) PUBDECKS=0 : coupé même avec le compte de service ──────────────────────────────────────── */
{
  await start({ ...env, PUBDECKS: '0' }, 18879); const n1 = fs.hits.length;
  assert.equal((await get('http://127.0.0.1:18879', '/__ping')).o.pub, false);
  assert.deepEqual((await get('http://127.0.0.1:18879', '/api/pubdecks')).o.off, true); assert.equal(fs.hits.length, n1);
  ok('PUBDECKS=0 : coupé, Firestore jamais lu');
}
console.log('\nPUBDECKS OK');
process.exit(0);
