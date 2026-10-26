// « Partager sur Discord » d'un deck public (discord-deck.mjs, branché dans proxy.mjs : POST /api/discord/deck) contre un faux Discord HTTP et un faux Firestore
// (liste des decks publics comme test-pubdecks.mjs, plus le nom du deck lu dans son document) ; jetons Firebase et compte de service de amis-fakes.mjs ; prix :
// prices.tsv.gz du serveur (EDH_DATA_DIR). Coupé (sans bot) → 404 ; garde-fous (jeton, JSON, même origine, identifiant) ; propriétaire seulement (autre compte → 403),
// deck absent de la liste servie → 404 (liste relue une fois) ; message : salon #decks, embed (titre = nom du deck ou commandant si refusé, couleur de l'identité :
// or, mono, gris ; commandants, 100 cartes, prix « ≈ … € (Cardmarket) » omis si trop de cartes sans prix, image Scryfall), bouton « Voir le deck » (?pd=<id>),
// auteur : membre lié mentionné SANS ping (allowed_mentions vide), sinon pseudo ; même deck dans les 24 h → le même lien (again), 5 par compte et par jour → 429,
// budget par réseau, deux appuis à la fois → un seul message, Discord en panne → 503 sans rien noter ; historique sur le disque (atomique), journal sans id ni jeton.
// Ports 19830–19831.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { startFakes, tag } from './amis-fakes.mjs';
import { dscDeckMsg, dscDeckColor, dscEuros, DSC_DECK_COLORS } from '../server/discord-deck.mjs';

const ok = m => console.log('✓ ' + m);
const TOKEN = 'jeton-du-bot-SECRET-0123456789', G = '910000000000000001', BOT = '910000000000000002', DECKS = '930000000000000020', GEN = '930000000000000005';
const JEANNE_DSC = '940000000000000001';

/* ── 0) Message (fonction pure) ───────────────────────────────────────────────────────────────── */
{
  assert.deepEqual(['', 'W', 'U', 'B', 'R', 'G', 'WU', 'WUBRG'].map(dscDeckColor), [DSC_DECK_COLORS.none, DSC_DECK_COLORS.W, DSC_DECK_COLORS.U, DSC_DECK_COLORS.B, DSC_DECK_COLORS.R, DSC_DECK_COLORS.G, DSC_DECK_COLORS.gold, DSC_DECK_COLORS.gold]);
  assert.equal(dscEuros(12345), '≈ 123 € (Cardmarket)'); assert.equal(dscEuros(40), '≈ 1 € (Cardmarket)');
  const m = dscDeckMsg({ title: '', cmd: ['Tymna the Weaver', 'Thrasios, Triton Hero'], ci: 'WUBG', n: 100, price: null, url: 'https://manaorbit.app/?pd=x', by: 'Bob_*le* <@1>', member: '' });
  assert.equal(m.embeds[0].title, 'Tymna the Weaver + Thrasios, Triton Hero', 'sans nom : les commandants');
  assert.equal(m.content, '🃏 **Bob\\_\\*le\\* \\<\\@1\\>** partage son deck · shares a deck', 'pseudo : Markdown et mentions neutralisés');
  assert.deepEqual(m.embeds[0].fields.map(f => f.name), ['Commandants · Commanders', 'Cartes · Cards', 'Auteur · Author'], 'sans prix : champ omis');
  assert.deepEqual(m.allowed_mentions, { parse: [] });
  ok('message : couleurs (incolore gris, mono, multicolore or), prix arrondi à l\'euro, titre = commandants sans nom, pseudo neutralisé, prix inconnu omis');
}

/* ── Faux Discord (seulement ce que le partage utilise) ──────────────────────────────────────── */
const D = { calls: [], posts: [], down: 0, slow: 0, n: 7000, auth: new Set() };
const CH = [
  { id: '939000000000000003', name: 'Communauté', type: 4, position: 2 },
  { id: GEN, name: '💬・général', type: 0, position: 0, parent_id: '939000000000000003' },
  { id: DECKS, name: '🃏・decks', type: 0, position: 1, parent_id: '939000000000000003' },
];
const srv = http.createServer((q, r) => {
  const c = []; q.on('data', d => c.push(d)); q.on('end', async () => {
    const send = (code, o) => { r.writeHead(code, { 'content-type': 'application/json' }); r.end(o === undefined ? '' : JSON.stringify(o)); };
    const p = new URL(q.url, 'http://x').pathname.replace(/^\/api\/v10/, ''), m = q.method; let x;
    D.calls.push(m + ' ' + p); D.auth.add(q.headers.authorization || '');
    if (q.headers.authorization !== 'Bot ' + TOKEN) return send(401, { message: '401: Unauthorized', code: 0 });
    if (D.down > 0) { D.down--; return send(503, { message: 'upstream connect error' }); }
    if (m === 'GET' && p === '/users/@me') return send(200, { id: BOT, username: 'Mana Orbit', bot: true });
    if (m === 'GET' && p === '/users/@me/guilds') return send(200, [{ id: G, name: 'Mana Orbit' }]);
    if (m === 'GET' && p === `/guilds/${G}/channels`) return send(200, CH);
    if (m === 'GET' && p === `/guilds/${G}/roles`) return send(200, [{ id: G, name: '@everyone', position: 0, permissions: String((1n << 10n) | (1n << 11n) | (1n << 14n)) }]);
    if (m === 'GET' && p === `/guilds/${G}/members/${BOT}`) return send(200, { user: { id: BOT, bot: true }, roles: [] });
    if ((x = /^\/channels\/(\d+)\/messages$/.exec(p)) && m === 'POST') {
      if (D.slow) await new Promise(res => setTimeout(res, D.slow));
      const id = String(BigInt('1300000000000000000') + BigInt(++D.n)); D.posts.push({ ch: x[1], id, body: JSON.parse(Buffer.concat(c).toString()) }); return send(200, { id, channel_id: x[1] });
    }
    return send(404, { message: 'Unknown route ' + m + ' ' + p });
  });
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const DAPI = `http://127.0.0.1:${srv.address().port}/api/v10`;

/* ── Faux Firestore : decks publics (liste par pages, document seul avec ?mask) ; agrégation refusée (liste relue en entier) ── */
const sv = v => Array.isArray(v) ? { arrayValue: { values: v.map(sv) } } : typeof v === 'number' ? { integerValue: String(v) } : { stringValue: String(v) };
const FS = { pubdecks: new Map(), pubreports: new Map(), lists: 0, gets: [] };
const docOf = (col, id, f) => ({ name: `projects/mana-test/databases/(default)/documents/${col}/${id}`, fields: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, sv(v)])) });
const upFs = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), send = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  req.resume(); req.on('end', () => {
    const base = '/v1/projects/mana-test/databases/(default)/documents';
    if (req.method === 'GET' && u.pathname === base + '/pubdecks') { FS.lists++; return send(200, { documents: [...FS.pubdecks].map(([id, f]) => docOf('pubdecks', id, f)) }); }
    if (req.method === 'GET' && u.pathname === base + '/pubreports') return send(200, {});
    const m = new RegExp('^' + base.replace(/[()]/g, '\\$&') + '/pubdecks/([^/]+)$').exec(u.pathname);
    if (req.method === 'GET' && m) {
      FS.gets.push([decodeURIComponent(m[1]), u.searchParams.getAll('mask.fieldPaths').join(',')]);
      const f = FS.pubdecks.get(decodeURIComponent(m[1])); return f ? send(200, docOf('pubdecks', m[1], { name: f.name })) : send(404, { error: { code: 404 } });
    }
    send(404, { error: { code: 404, message: 'not found' } });
  });
});
const upScry = http.createServer((q, r) => { r.writeHead(503); r.end(); });      // catalogue des noms injoignable : noms non contrôlés (filtre de mots seul)
for (const s of [upFs, upScry]) await new Promise(r => s.listen(0, '127.0.0.1', r));
const F = await startFakes();

const A = tag('uid-alice-01'), Bo = tag('uid-bob-02');
const deck = (o, x = {}) => ({ o, by: 'Alice', deck: 'd', name: '', cmd: ['Edgar Markov'], ci: 'WBR', cards: ['1 Sol Ring', '98 Plains'], updatedAt: 1000, v: 1, ...x });
FS.pubdecks.set(A + '_0', deck(A, { name: 'Edgar de <Max>', updatedAt: 9000 }));
FS.pubdecks.set(A + '_1', deck(A, { name: 'Fuck deck', cmd: ['Craterhoof Behemoth'], ci: 'G', cards: ['99 Forest'], updatedAt: 8000 }));      // nom refusé : le commandant
FS.pubdecks.set(A + '_2', deck(A, { cmd: ['Kozilek, the Great Distortion'], ci: '', cards: ['99 Wastes'], updatedAt: 7000 }));      // incolore, sans prix
FS.pubdecks.set(A + '_3', deck(A, { name: 'Partenaires', cmd: ['Tymna the Weaver', 'Thrasios, Triton Hero'], ci: 'WUBG', cards: ['98 Island'], updatedAt: 6000 }));
FS.pubdecks.set(A + '_4', deck(A, { name: 'Bleu', cmd: ['Talrand, Sky Summoner'], ci: 'U', cards: ['99 Island'], updatedAt: 5000 }));
FS.pubdecks.set(A + '_5', deck(A, { name: 'Rouge', cmd: ['Krenko, Mob Boss'], ci: 'R', cards: ['99 Mountain'], updatedAt: 4000 }));
FS.pubdecks.set(A + '_9', deck(A, { name: '99 cartes', cards: ['97 Plains'] }));      // hors format : jamais servi
for (let i = 0; i < 3; i++) FS.pubdecks.set(Bo + '_' + i, deck(Bo, { by: 'Bob', name: 'Deck ' + i, cmd: ['Atraxa, Praetors\' Voice'], ci: 'WUBG', cards: ['99 Forest'], updatedAt: 100 + i }));
// Prix du serveur (prices.tsv.gz : nom, centimes €, centimes $) : l'impression la moins chère de chaque nom
const PX = [['Edgar Markov', 500], ['Edgar Markov', 900], ['Sol Ring', 150], ['Plains', 10], ['Forest', 10], ['Island', 5], ['Tymna the Weaver', 300], ['Thrasios, Triton Hero', 200], ['Talrand, Sky Summoner', 40], ['Mountain', 5], ['Krenko, Mob Boss', 120], ['Atraxa, Praetors\' Voice', 1000]];
writeFileSync(join(process.env.EDH_DATA_DIR, 'prices.tsv.gz'), gzipSync(`#MOPX1 2026-10-22 ${PX.length}\n` + PX.map(([n, e]) => `${n}\t${e}\t`).join('\n') + '\n'));
// Compte d'Alice lié à un membre du serveur (liaison OAuth2, discord-links.json) ; Bob n'est pas lié
mkdirSync(process.env.ADMIN_DIR, { recursive: true });
writeFileSync(join(process.env.ADMIN_DIR, 'discord-links.json'), JSON.stringify({ v: 1, links: { [A]: { id: JEANNE_DSC, name: 'Jeanne', member: true, at: Date.now() } } }));

const procs = [];
const start = (env, port) => new Promise((resolve, reject) => {
  const c = spawn('node', ['server/proxy.mjs'], { env: { ...process.env, EDH_SOURCE_URL: '', PORT: String(port), ALERTS: '0', BAD_KEY_DELAY_MS: '20', ...F.env, FIRESTORE_BASE_URL: `http://127.0.0.1:${upFs.address().port}/`, SCRYFALL_UPSTREAM: `http://127.0.0.1:${upScry.address().port}`, PUBDECKS_SOON_MS: '0', DISCORD_PRESENCE: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.log = () => out; c.url = `http://127.0.0.1:${port}`;
  c.stdout.on('data', d => { out += d; if (/Mana Orbit →/.test(out)) resolve(c); }); c.stderr.on('data', d => { out += d; });
  c.on('exit', code => { if (code) reject(new Error('exit ' + code + ': ' + out)); });
  procs.push(c);
});
process.on('exit', () => { for (const p of procs) try { p.kill(); } catch { /* ignore */ } F.stop(); srv.close(); upFs.close(); upScry.close(); });
let BASE = '', ipN = 0;
const ip = () => '10.7.' + ((++ipN >> 8) & 255) + '.' + (ipN & 255);
async function call(body, { tok, from = ip(), hd = {}, raw } = {}) {
  const r = await fetch(BASE + '/api/discord/deck', { method: 'POST', headers: { 'x-forwarded-for': from, 'Content-Type': 'application/json', ...(tok ? { 'x-firebase-token': tok } : {}), ...hd }, body: raw !== undefined ? raw : JSON.stringify(body) });
  const t = await r.text(); let o = null; try { o = JSON.parse(t); } catch { /* pas du JSON */ }
  return { s: r.status, o, h: r.headers };
}
const ALICE = () => F.jwt('uid-alice-01'), BOB = () => F.jwt('uid-bob-02');
const last = () => D.posts[D.posts.length - 1];

/* ── 1) Sans jeton du bot : coupé ─────────────────────────────────────────────────────────────── */
{
  const P = await start({}, 19830); BASE = P.url;
  assert.equal((await (await fetch(BASE + '/__ping')).json()).feedback, false);
  const r = await call({ id: A + '_0' }, { tok: ALICE() }); assert.equal(r.s, 404); assert.equal(r.o.error, 'not_found');
  assert.equal(D.calls.length, 0); assert.equal(FS.lists, 0, 'rien lu');
  await new Promise(res => { P.once('exit', res); P.kill(); });
  ok('sans bot : POST /api/discord/deck → 404 not_found (l\'appli cache le bouton), ni Discord ni Firestore appelés');
}

/* ── 2) Bot et decks publics : partage ────────────────────────────────────────────────────────── */
const P = await start({ DISCORD_BOT_TOKEN: TOKEN, DISCORD_API: DAPI, DISCORD_DECKS_PER_H: '40' }, 19831); BASE = P.url;
assert.equal((await (await fetch(BASE + '/__ping')).json()).feedback, true);
{
  let r = await call({ id: A + '_0' }); assert.equal(r.s, 401); assert.equal(r.o.error, 'auth_required');
  r = await call({ id: A + '_0' }, { tok: 'pas.un.jeton' }); assert.equal(r.s, 401);
  r = await call({ id: 'abc_0' }, { tok: ALICE() }); assert.equal(r.s, 400); assert.equal(r.o.error, 'bad_id');
  r = await call(null, { tok: ALICE(), raw: '{' }); assert.equal(r.s, 400);
  r = await fetch(BASE + '/api/discord/deck', { method: 'POST', headers: { 'Content-Type': 'text/plain', 'x-firebase-token': ALICE() }, body: JSON.stringify({ id: A + '_0' }) }); assert.equal(r.status, 415);
  r = await call({ id: A + '_0' }, { tok: ALICE(), hd: { 'Sec-Fetch-Site': 'cross-site' } }); assert.equal(r.s, 403); assert.equal(r.o.error, 'cross_site');
  assert.equal((await fetch(BASE + '/api/discord/deck')).status, 405);
  assert.equal(D.posts.length, 0); assert.equal(FS.lists, 0, 'refusé avant toute lecture');
  ok('garde-fous : jeton obligatoire (absent, faux → 401), identifiant de deck public, JSON, même origine, POST seulement');

  r = await call({ id: Bo + '_0' }, { tok: ALICE() }); assert.equal(r.s, 403); assert.equal(r.o.error, 'not_owner');
  assert.equal(D.posts.length, 0);
  ok('deck d\'un autre compte : 403 not_owner (empreinte de l\'identifiant ≠ celle du compte)');

  r = await call({ id: A + '_9' }, { tok: ALICE() }); assert.equal(r.s, 404); assert.equal(r.o.error, 'not_public');
  assert.ok(FS.lists >= 1, 'liste lue (relue une fois si le deck n\'y est pas)');
  r = await call({ id: A + '_8' }, { tok: ALICE() }); assert.equal(r.s, 404);
  assert.equal(D.posts.length, 0);
  ok('deck absent de la liste servie (hors format, inexistant) : 404 not_public, rien posté');

  // Alice (membre lié) : deck multicolore, nom du deck, prix
  r = await call({ id: A + '_0' }, { tok: ALICE() });
  assert.equal(r.s, 200, JSON.stringify(r.o)); assert.equal(r.o.ok, true);
  let m = last(); assert.equal(m.ch, DECKS, 'salon #🃏・decks');
  assert.equal(r.o.url, `https://discord.com/channels/${G}/${DECKS}/${m.id}`);
  const link = `${BASE}/?pd=${A}_0`, e = m.body.embeds[0];
  assert.equal(m.body.content, `🃏 <@${JEANNE_DSC}> partage son deck · shares a deck`, 'membre lié mentionné');
  assert.deepEqual(m.body.allowed_mentions, { parse: [] }, 'mention sans ping');
  assert.equal(e.title, 'Edgar de <Max>'); assert.equal(e.url, link); assert.equal(e.color, DSC_DECK_COLORS.gold, 'multicolore : or');
  assert.deepEqual(e.fields.map(f => [f.name, f.value]), [['Commandant · Commander', 'Edgar Markov'], ['Cartes · Cards', '100'], ['Prix estimé · Estimated price', '≈ 16 € (Cardmarket)'], ['Auteur · Author', `<@${JEANNE_DSC}>`]], 'prix : 5 € + 1,50 € + 98 × 0,10 € (impression la moins chère)');
  assert.equal(e.thumbnail.url, 'https://api.scryfall.com/cards/named?exact=Edgar%20Markov&format=image&version=normal');
  assert.deepEqual(m.body.components, [{ type: 1, components: [{ type: 2, style: 5, label: 'Voir le deck · View deck', url: link }] }], 'bouton lien « Voir le deck »');
  assert.deepEqual(FS.gets.at(-1), [A + '_0', 'name'], 'nom lu dans le document (champ name seulement)');
  ok('propriétaire : posté dans #decks (embed : nom du deck, or, commandant, 100 cartes, ≈ 16 € (Cardmarket), image Scryfall), bouton « Voir le deck » (?pd=), membre lié mentionné sans ping');

  // même deck dans les 24 h : le même message
  const n0 = D.posts.length;
  const r2 = await call({ id: A + '_0' }, { tok: ALICE() }); assert.equal(r2.s, 200); assert.deepEqual(r2.o, { ok: true, url: r.o.url, again: true });
  assert.equal(D.posts.length, n0, 'rien de reposté');
  ok('même deck dans les 24 h : rien de reposté, le lien du message existant (again)');

  // nom refusé → commandant ; mono vert ; une carte sans prix sur 100 : prix gardé
  r = await call({ id: A + '_1' }, { tok: ALICE() }); assert.equal(r.s, 200);
  m = last().body;
  assert.equal(m.embeds[0].title, 'Craterhoof Behemoth', 'nom refusé par le filtre : le commandant');
  assert.equal(m.embeds[0].color, DSC_DECK_COLORS.G); assert.equal(m.embeds[0].fields.find(f => /Prix/.test(f.name)).value, '≈ 10 € (Cardmarket)');
  // incolore, sans prix (99 cartes sans prix) : gris, champ omis
  r = await call({ id: A + '_2' }, { tok: ALICE() }); assert.equal(r.s, 200);
  m = last().body;
  assert.equal(m.embeds[0].title, 'Kozilek, the Great Distortion'); assert.equal(m.embeds[0].color, DSC_DECK_COLORS.none);
  assert.ok(!m.embeds[0].fields.some(f => /Prix/.test(f.name)), 'prix inconnu : omis');
  // deux commandants ; mono bleu
  r = await call({ id: A + '_3' }, { tok: ALICE() }); assert.equal(r.s, 200);
  m = last().body; assert.deepEqual(m.embeds[0].fields[0], { name: 'Commandants · Commanders', value: 'Tymna the Weaver\nThrasios, Triton Hero', inline: true }); assert.equal(m.embeds[0].color, DSC_DECK_COLORS.gold);
  r = await call({ id: A + '_4' }, { tok: ALICE() }); assert.equal(r.s, 200); assert.equal(last().body.embeds[0].color, DSC_DECK_COLORS.U);
  ok('embed : nom refusé → commandant, couleur mono (vert, bleu), incolore gris, prix omis si trop de cartes sans prix, deux commandants');

  // 5 par compte et par jour
  r = await call({ id: A + '_5' }, { tok: ALICE() }); assert.equal(r.s, 429); assert.equal(r.o.error, 'daily_limit');
  assert.ok(Number(r.h.get('retry-after')) > 3600, 'jusqu\'à ce que le plus ancien ait 24 h');
  assert.equal(D.posts.length, 5);
  r = await call({ id: A + '_0' }, { tok: ALICE() }); assert.equal(r.s, 200); assert.equal(r.o.again, true, 'un deck déjà partagé redonne toujours son lien');
  ok('5 partages par compte et par 24 h : le 6e → 429 daily_limit (Retry-After) ; un deck déjà partagé redonne son lien');

  // Bob (pas lié) : pseudo de l'appli, aucune mention
  r = await call({ id: Bo + '_0' }, { tok: BOB() }); assert.equal(r.s, 200);
  m = last().body; assert.equal(m.content, '🃏 **Bob** partage son deck · shares a deck'); assert.ok(!JSON.stringify(m).includes('<@'), 'aucune mention');
  assert.deepEqual(m.allowed_mentions, { parse: [] }); assert.equal(m.embeds[0].title, 'Deck 0');
  ok('compte non lié : le pseudo public de l\'appli, aucune mention');

  // deux appuis à la fois : un seul message
  D.slow = 150; const n1 = D.posts.length;
  const [x, y] = await Promise.all([call({ id: Bo + '_1' }, { tok: BOB() }), call({ id: Bo + '_1' }, { tok: BOB() })]); D.slow = 0;
  assert.equal(x.s, 200); assert.equal(y.s, 200); assert.equal(x.o.url, y.o.url); assert.equal(D.posts.length, n1 + 1, 'un seul message');
  ok('deux appuis à la fois sur le même deck : un seul message, le même lien');

  // Discord en panne : 503, rien noté (un nouvel essai poste)
  D.down = 2; r = await call({ id: Bo + '_2' }, { tok: BOB() }); assert.equal(r.s, 503); assert.equal(r.o.error, 'unavailable'); assert.ok(r.h.get('retry-after'));
  r = await call({ id: Bo + '_2' }, { tok: BOB() }); assert.equal(r.s, 200); assert.ok(!r.o.again, 'pas noté pendant la panne : vraiment posté');
  ok('Discord en panne : 503 (réessayer), rien de noté ; le nouvel essai poste');

  // budget par réseau (DISCORD_DECKS_PER_H : 40 ici)
  let lim = 0; for (let i = 0; i < 45; i++) { const z = await call({ id: 'x' }, { tok: BOB(), from: '203.0.113.7' }); if (z.s === 429) { lim++; assert.equal(z.o.error, 'rate_limited'); } }
  assert.ok(lim >= 4, 'au-delà du budget du réseau : 429');
  ok('budget par réseau (DISCORD_DECKS_PER_H) : 429 rate_limited');

  // historique sur le disque, journal propre
  const f = join(process.env.ADMIN_DIR, 'discord-decks.json'), h = JSON.parse(readFileSync(f, 'utf8'));
  assert.equal(h.list.length, 8); assert.deepEqual(Object.keys(h.list[0]).sort(), ['id', 't', 'url']); assert.equal(h.list[0].id, Bo + '_2');
  assert.ok(!existsSync(f + '.tmp'), 'écriture atomique');
  const log = P.log();
  assert.match(log, /Discord : deck public partagé dans #decks \(membre mentionné, sans ping\)\./);
  for (const s of [TOKEN, 'uid-alice-01', 'uid-bob-02', JEANNE_DSC, A, Bo]) assert.ok(!log.includes(s), 'journal sans ' + s.slice(0, 12));
  assert.deepEqual([...D.auth], ['Bot ' + TOKEN]);
  ok('historique : ADMIN_DIR/discord-decks.json ({ t, id, url }, atomique) ; journal sans jeton, UID, empreinte ni id Discord');
}
console.log('\nDISCORD DECK OK');
process.exit(0);
