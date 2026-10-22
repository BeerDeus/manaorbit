// Bot Discord côté serveur (discord-srv.mjs, branché dans proxy.mjs) contre un faux Discord HTTP (aucun accès réseau) : /__ping feedback ; « Aide et avis »
// (POST /api/feedback : forum selon le type, étiquettes de la plateforme et de la partie sauf celles de l'équipe, captures en multipart, mentions jamais permises,
// refus de chaque champ, budget par réseau et par compte, Discord en panne → 503, limite de débit attendue, salon disparu relu, coupé → 404) ; panneau
// (/api/admin/discord : sans compte, autre compte, salons où le bot peut écrire dans l'ordre du serveur, rôles à pinger, envoi avec pings et allowed_mentions
// exacts, publication d'une annonce, refus, suppression, historique gardé sur le disque, budget) ; Carte mystère de la veille (message, embed) ; jeton jamais
// affiché. Ports 19800–19803 ; faux Firebase de amis-fakes.mjs.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { startFakes } from './amis-fakes.mjs';
import { discordMake, dscRevealMsg, dscName, DSC_PERMS } from '../discord-srv.mjs';

const ok = m => console.log('✓ ' + m);
const TOKEN = 'jeton-du-bot-SECRET-0123456789';
const G = '910000000000000001', BOT = '910000000000000002', ADMIN = 'admin@example.org';
const B = n => 1n << BigInt(n), VIEW = B(10), SEND = B(11), EMBED = B(14), ATTACH = B(15), MENTION = B(17);
const ow = (id, allow, deny, type = 0) => ({ id, type, allow: String(allow), deny: String(deny) });
const R = { team: '920000000000000001', test: '920000000000000002', bot: '920000000000000003', boost: '920000000000000004' };
const tagsOf = (base, list) => list.map(([name, moderated], i) => ({ id: String(base + i), name, moderated: !!moderated, emoji_name: null }));
const AREA_TAGS = [['Scan'], ['Collection'], ['Decks'], ['Prix'], ['Compte et synchro'], ['Alertes'], ['Échange'], ['Partie'], ['Carte mystère'], ['Amis'], ['Autre'], ['Site'], ['PWA'], ['Android']];
const C = {
  hors: '930000000000000001', bienvenue: '930000000000000002', regles: '930000000000000003', annonces: '930000000000000004', general: '930000000000000005', mystere: '930000000000000006',
  moder: '930000000000000007', bugs: '930000000000000008', idees: '930000000000000009', aide: '930000000000000010', voice: '930000000000000011', interdit: '930000000000000012',
  catW: '939000000000000001', catA: '939000000000000002', catC: '939000000000000003', catE: '939000000000000004',
};
function world() {
  return {
    roles: [
      { id: G, name: '@everyone', position: 0, permissions: String(VIEW | SEND), color: 0, managed: false, mentionable: false },
      { id: R.team, name: 'Équipe', position: 3, permissions: '0', color: 0x9fb4ff, managed: false, mentionable: false },
      { id: R.test, name: 'Testeur', position: 2, permissions: '0', color: 0xf0b45a, managed: false, mentionable: false },
      { id: R.bot, name: 'Mana Orbit', position: 4, permissions: String(VIEW | SEND | EMBED | ATTACH | MENTION), color: 0, managed: true, tags: { bot_id: BOT } },
      { id: R.boost, name: 'Booster', position: 1, permissions: '0', color: 0xff73fa, managed: true, tags: { premium_subscriber: null } },
    ],
    channels: [
      { id: C.catE, name: 'Équipe', type: 4, position: 3, permission_overwrites: [ow(G, 0, VIEW)] },
      { id: C.moder, name: '🛡️・modération', type: 0, position: 0, parent_id: C.catE, permission_overwrites: [ow(G, 0, VIEW)] },      // privé : le bot n'y voit rien
      { id: C.catC, name: 'Communauté', type: 4, position: 2 },
      { id: C.mystere, name: '🔮・carte-mystère', type: 0, position: 1, parent_id: C.catC },
      { id: C.general, name: '💬・général', type: 0, position: 0, parent_id: C.catC },
      { id: C.voice, name: 'Commander', type: 2, position: 5, parent_id: C.catC },
      { id: C.interdit, name: 'interdit', type: 0, position: 2, parent_id: C.catC },      // le fake refuse d'y écrire (403)
      { id: C.catW, name: 'Bienvenue', type: 4, position: 0 },
      { id: C.annonces, name: '📢・annonces', type: 5, position: 2, parent_id: C.catW, permission_overwrites: [ow(G, 0, SEND), ow(R.bot, SEND, 0)] },
      { id: C.regles, name: '📜・règles', type: 0, position: 1, parent_id: C.catW, permission_overwrites: [ow(G, 0, SEND)] },      // lecture seule, pas d'exception pour le bot
      { id: C.bienvenue, name: '👋・bienvenue', type: 0, position: 0, parent_id: C.catW, permission_overwrites: [ow(G, 0, SEND), ow(BOT, SEND, 0, 1)] },      // exception pour le membre (le bot)
      { id: C.catA, name: 'Appli', type: 4, position: 1 },
      { id: C.bugs, name: '🐞・bugs', type: 15, position: 1, parent_id: C.catA, flags: 16, available_tags: tagsOf(800, [...AREA_TAGS, ['Corrigé', 1], ['Prochaine version', 1]]) },
      { id: C.idees, name: '💡・Idées', type: 15, position: 2, parent_id: C.catA, available_tags: tagsOf(850, [['Envisagé', 1], ['Prévu', 1], ['Fait', 1]]) },
      { id: C.aide, name: 'aide', type: 15, position: 0, parent_id: C.catA, available_tags: tagsOf(870, [['Scan'], ['Carte mystère'], ['Site'], ['Autre']]) },      // ancien serveur : nom sans emoji
      { id: C.hors, name: 'hors-catégorie', type: 0, position: 9 },
    ],
  };
}
// Faux Discord : calls (méthode et chemin), posts (corps JSON ou multipart lus), down (réponses 503 restantes), limit (429 restants), auth (en-têtes reçus)
const D = { ...world(), calls: [], posts: [], down: 0, limit: 0, auth: new Set(), ua: new Set(), n: 5000, deleted: [] };
const srv = http.createServer((q, r) => {
  const c = []; q.on('data', d => c.push(d)); q.on('end', async () => {
    const raw = Buffer.concat(c), send = (code, o) => { r.writeHead(code, { 'content-type': 'application/json' }); r.end(o === undefined ? '' : JSON.stringify(o)); };
    const p = new URL(q.url, 'http://x').pathname.replace(/^\/api\/v10/, ''), m = q.method; let x;
    D.calls.push(m + ' ' + p); D.auth.add(q.headers.authorization || ''); D.ua.add(q.headers['user-agent'] || '');
    if (q.headers.authorization !== 'Bot ' + TOKEN) return send(401, { message: '401: Unauthorized', code: 0 });
    if (D.down > 0) { D.down--; return send(503, { message: 'upstream connect error' }); }
    if (D.limit > 0 && m === 'POST') { D.limit--; return send(429, { message: 'You are being rate limited.', retry_after: 0.08, global: false }); }
    if (m === 'GET' && p === '/users/@me') return send(200, { id: BOT, username: 'Mana Orbit', bot: true });
    if (m === 'GET' && p === '/users/@me/guilds') return send(200, [{ id: G, name: 'Mana Orbit' }]);
    if (m === 'GET' && p === `/guilds/${G}`) return send(200, { id: G, name: 'Mana Orbit' });
    if (m === 'GET' && p === `/guilds/${G}/channels`) return send(200, D.channels);
    if (m === 'GET' && p === `/guilds/${G}/roles`) return send(200, D.roles);
    if (m === 'GET' && p === `/guilds/${G}/members/${BOT}`) return send(200, { user: { id: BOT }, roles: [R.bot] });
    let body = null, files = [];
    if (/^multipart\/form-data/.test(q.headers['content-type'] || '')) {
      const fd = await new Response(raw, { headers: { 'content-type': q.headers['content-type'] } }).formData();
      body = JSON.parse(fd.get('payload_json'));
      for (const [k, v] of fd.entries()) if (k !== 'payload_json') files.push({ field: k, name: v.name, type: v.type, bytes: Buffer.from(await v.arrayBuffer()) });
    } else if (raw.length) body = JSON.parse(raw.toString());
    const ch = id => D.channels.find(y => y.id === id);
    if ((x = /^\/channels\/(\d+)\/threads$/.exec(p)) && m === 'POST') {
      if (!ch(x[1]) || ch(x[1]).type !== 15) return send(404, { message: 'Unknown Channel', code: 10003 });
      const id = String(++D.n); D.posts.push({ kind: 'thread', ch: x[1], body, files, ct: q.headers['content-type'] }); return send(201, { id, name: body.name, parent_id: x[1], type: 11 });
    }
    if ((x = /^\/channels\/(\d+)\/messages$/.exec(p)) && m === 'POST') {
      if (!ch(x[1])) return send(404, { message: 'Unknown Channel', code: 10003 });
      if (x[1] === C.interdit) return send(403, { message: 'Missing Permissions', code: 50013 });
      const id = String(++D.n); D.posts.push({ kind: 'msg', ch: x[1], id, body }); return send(200, { id, channel_id: x[1], ...body });
    }
    if ((x = /^\/channels\/(\d+)\/messages\/(\d+)\/crosspost$/.exec(p)) && m === 'POST') { D.posts.push({ kind: 'crosspost', ch: x[1], id: x[2] }); return send(200, { id: x[2] }); }
    if ((x = /^\/channels\/(\d+)\/messages\/(\d+)$/.exec(p)) && m === 'DELETE') {
      if (D.deleted.includes(x[2])) return send(404, { message: 'Unknown Message', code: 10008 });
      D.deleted.push(x[2]); return send(204);
    }
    return send(404, { message: 'Unknown route ' + m + ' ' + p });
  });
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const DAPI = `http://127.0.0.1:${srv.address().port}/api/v10`;
const F = await startFakes();

const procs = [];
const start = (env, port) => new Promise((resolve, reject) => {
  const c = spawn('node', ['proxy.mjs'], { env: { ...process.env, EDH_SOURCE_URL: '', PORT: String(port), ALERTS: '0', PUBDECKS: '0', BAD_KEY_DELAY_MS: '20', FIREBASE_JWKS_URL: F.env.FIREBASE_JWKS_URL, ADMIN_EMAILS: ADMIN, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.log = () => out; c.url = `http://127.0.0.1:${port}`;
  c.stdout.on('data', d => { out += d; if (/Mana Orbit →/.test(out)) resolve(c); }); c.stderr.on('data', d => { out += d; });
  c.on('exit', code => { if (code) reject(new Error('exit ' + code + ': ' + out)); });
  procs.push(c);
});
const stop = p => new Promise(r => { p.once('exit', r); p.kill(); });
process.on('exit', () => { for (const p of procs) try { p.kill(); } catch { /* ignore */ } F.stop(); srv.close(); });
let BASE = '', ipN = 0;
const ip = () => { const n = ++ipN; return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`; };
const fresh = () => ip();
/** Appel JSON ; ip : réseau du client (X-Forwarded-For, sans lui aucun budget) ; tok : jeton Firebase ; hd : en-têtes en plus ; raw : corps tel quel. */
async function call(method, path, { body, raw, tok, ip: from = fresh(), hd = {} } = {}) {
  const h = { 'x-forwarded-for': from, ...(tok ? { 'x-firebase-token': tok } : {}), ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}), ...hd };
  const r = await fetch(BASE + path, { method, headers: h, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
  const t = await r.text(); let o = null; try { o = JSON.parse(t); } catch { /* pas du JSON */ }
  return { s: r.status, o, t, h: r.headers };
}
const ADM = () => F.jwt('uid-admin-00', 3600, { email: ADMIN, email_verified: true });
const JEANNE = () => F.jwt('uid-jeanne-01', 3600, { email: 'jeanne.dupont@gmail.com', email_verified: true });
const JPG = readFileSync('tests/fixtures/swords.jpg'), JPG2 = readFileSync('tests/fixtures/anneau.jpg');
const url64 = b => 'data:image/jpeg;base64,' + b.toString('base64');
/** En-tête JPEG (SOF0) aux dimensions données, complété jusqu'à size octets. */
const fakeJpg = (w, h, size = 400) => { const b = Buffer.alloc(size); Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3]).copy(b); return b; };
const FB = (x = {}) => ({ kind: 'bug', title: 'Le scan ne lit pas les cartes', text: 'Ligne 1\nLigne 2 @everyone <@&' + R.team + '>', area: 'scan', contact: 'jeanne_42', meta: { v: '2026-10-22a', plat: 'android', apk: '1.0.10', lang: 'fr', nav: 'Chrome 141 / Android 15', ua: 'Mozilla/5.0 (Linux; Android 15)' }, imgs: [], ...x });
const last = () => D.posts[D.posts.length - 1];

/* ── 1) Sans jeton du bot, puis DISCORD=0 : coupé ─────────────────────────────────────────────────────────────────────────── */
{
  let P = await start({}, 19800); BASE = P.url;
  assert.equal((await call('GET', '/__ping')).o.feedback, false, '/__ping feedback: false');
  assert.equal((await call('POST', '/api/feedback', { body: FB() })).s, 404);
  let r = await call('GET', '/api/admin/discord', { tok: ADM() });
  assert.equal(r.s, 200); assert.equal(r.o.on, false); assert.match(r.o.message, /non configuré/); assert.deepEqual([r.o.channels, r.o.roles, r.o.guild], [[], [], null]);
  assert.equal((await call('POST', '/api/admin/discord/send', { tok: ADM(), body: { channel: C.general, content: 'x' } })).s, 404);
  assert.doesNotMatch(P.log(), /Bot Discord/); await stop(P);
  P = await start({ DISCORD: '0', DISCORD_BOT_TOKEN: TOKEN, DISCORD_API: DAPI }, 19801); BASE = P.url;
  assert.equal((await call('GET', '/__ping')).o.feedback, false); assert.equal((await call('POST', '/api/feedback', { body: FB() })).s, 404);
  r = await call('GET', '/api/admin/discord', { tok: ADM() }); assert.equal(r.s, 404); assert.match(r.o.message, /DISCORD=0/);
  await stop(P); assert.equal(D.calls.length, 0, 'aucun appel à Discord');
  ok('sans DISCORD_BOT_TOKEN : /__ping feedback false, /api/feedback 404, panneau « bot non configuré » (200, on: false) ; DISCORD=0 : tout en 404, rien demandé à Discord');
}

const ENV = { DISCORD_BOT_TOKEN: TOKEN, DISCORD_API: DAPI, FEEDBACK_PER_H: '3', ADMIN_ACTIONS_PER_H: '12' };
let P = await start(ENV, 19802); BASE = P.url;

/* ── 2) Aide et avis ──────────────────────────────────────────────────────────────────────────────────────────────────────── */
{
  assert.equal((await call('GET', '/__ping')).o.feedback, true, '/__ping feedback: true');
  let r = await call('POST', '/api/feedback', { body: FB({ imgs: [url64(JPG), url64(JPG2)] }) });
  assert.equal(r.s, 200, r.t); assert.equal(r.o.ok, true);
  let t = last(); assert.equal(t.kind, 'thread'); assert.equal(t.ch, C.bugs, 'bug → #bugs');
  assert.equal(r.o.url, `https://discord.com/channels/${G}/${r.o.id}`);
  assert.match(t.ct, /^multipart\/form-data/); assert.equal(t.body.name, 'Le scan ne lit pas les cartes');
  const tagName = id => D.channels.find(c => c.id === t.ch).available_tags.find(x => x.id === id).name;
  assert.deepEqual(t.body.applied_tags.map(tagName).sort(), ['Android', 'Scan'], 'étiquettes : plateforme + partie');
  assert.deepEqual(t.body.message.allowed_mentions, { parse: [] }, 'jamais de ping venu d\'un utilisateur');
  assert.deepEqual(t.files.map(f => [f.field, f.name, f.type]), [['files[0]', 'capture-1.jpg', 'image/jpeg'], ['files[1]', 'capture-2.jpg', 'image/jpeg']]);
  assert.ok(t.files[0].bytes.equals(JPG) && t.files[1].bytes.equals(JPG2), 'captures reçues intactes');
  assert.deepEqual(t.body.message.attachments, [{ id: 0, filename: 'capture-1.jpg' }, { id: 1, filename: 'capture-2.jpg' }]);
  const ct = t.body.message.content;
  assert.ok(ct.startsWith('Ligne 1\nLigne 2 @everyone <@&' + R.team + '>\n\n-# '), 'texte d\'abord, sauts de ligne gardés : ' + ct);
  assert.match(ct, /^-# Android · version 2026-10-22a · APK 1\.0\.10 · langue fr$/m); assert.match(ct, /^-# Contact Discord : jeanne\\_42$/m); assert.match(ct, /^-# Navigateur : Chrome 141 \/ Android 15$/m);
  assert.equal(D.calls.filter(c => c.endsWith('/channels')).length, 1, 'salons lus une fois');

  r = await call('POST', '/api/feedback', { body: FB({ kind: 'idea', area: 'decks', contact: '', meta: { plat: 'pwa' } }) });
  t = last(); assert.equal(r.s, 200); assert.equal(t.ch, C.idees, 'idée → « 💡・Idées » (nom utile, casse ignorée)'); assert.deepEqual(t.body.applied_tags, [], '#idées : étiquettes de l\'équipe seulement, aucune posée');
  assert.match(t.ct, /^application\/json/, 'sans capture : JSON'); assert.doesNotMatch(t.body.message.content, /Contact/); assert.match(t.body.message.content, /^-# PWA$/m);
  r = await call('POST', '/api/feedback', { body: FB({ kind: 'help', area: 'mystere', meta: { plat: 'web' }, contact: undefined }) });
  t = last(); assert.equal(t.ch, C.aide, 'aide → « aide » (ancien nom sans emoji)'); assert.deepEqual(t.body.applied_tags.sort(), ['871', '872'], 'Carte mystère + Site');
  r = await call('POST', '/api/feedback', { body: FB({ area: 'amis', meta: {} }) });
  t = last(); assert.deepEqual(t.body.applied_tags.map(tagName), ['Amis'], 'sans plateforme : la partie seule');
  assert.equal(D.calls.filter(c => c.endsWith('/channels')).length, 1, 'toujours la même liste (5 min)');
  ok('avis : bug → #bugs (étiquettes Android + Scan, jamais celles de l\'équipe), idée → #idées (aucune étiquette), aide → « aide » ; captures en multipart (capture-1.jpg…, intactes), texte puis « -# » (plateforme, version, langue, contact, navigateur), allowed_mentions vide ; url du fil ; salons gardés en cache');

  const huge = 'data:image/jpeg;base64,' + fakeJpg(800, 600, 1.5 * 1048576 + 10).toString('base64');
  const cases = [
    [FB({ kind: 'spam' }), 'bad_kind'], [FB({ kind: undefined }), 'bad_kind'], [FB({ title: 'ab' }), 'bad_title'], [FB({ title: ' \u0007a\u200b ' }), 'bad_title'], [FB({ title: 'x'.repeat(91) }), 'bad_title'], [FB({ title: 42 }), 'bad_title'],
    [FB({ text: '' }), 'bad_text'], [FB({ text: '  \n ' }), 'bad_text'], [FB({ text: 'é'.repeat(1501) }), 'bad_text'], [FB({ text: Array(31).fill('a').join('\n') }), 'bad_text'], [FB({ text: ['a'] }), 'bad_text'],
    [FB({ area: 'compta' }), 'bad_area'], [FB({ area: '__proto__' }), 'bad_area'], [FB({ contact: 'x'.repeat(61) }), 'bad_contact'], [FB({ contact: 7 }), 'bad_contact'],
    [FB({ imgs: ['data:image/png;base64,' + JPG.toString('base64')] }), 'bad_image'], [FB({ imgs: [url64(JPG), url64(JPG), url64(JPG), url64(JPG)] }), 'bad_image'], [FB({ imgs: [url64(Buffer.alloc(500, 7))] }), 'bad_image'],
    [FB({ imgs: [url64(fakeJpg(5000, 100))] }), 'bad_image'], [FB({ imgs: [huge] }), 'bad_image'], [FB({ imgs: 'x' }), 'bad_image'],
    [FB({ meta: { plat: 'ios' } }), 'bad_request'], [FB({ meta: { v: 'x'.repeat(301) } }), 'bad_request'], [FB({ meta: { lang: 5 } }), 'bad_request'], [FB({ meta: [] }), 'bad_request'], [[FB()], 'bad_request'],
  ];
  const n0 = D.posts.length;
  for (const [b, err] of cases) { r = await call('POST', '/api/feedback', { body: b }); assert.equal(r.s, 400, err + ' : ' + r.t); assert.equal(r.o.error, err, JSON.stringify(b).slice(0, 120)); assert.ok(r.o.message, 'message lisible'); }
  r = await call('POST', '/api/feedback', { raw: '{pas du json' }); assert.deepEqual([r.s, r.o.error], [400, 'bad_request']);
  r = await call('POST', '/api/feedback', { raw: JSON.stringify(FB()), hd: { 'Content-Type': 'text/plain' } }); assert.deepEqual([r.s, r.o.error], [415, 'bad_content_type']);
  r = await call('POST', '/api/feedback', { raw: '"' + 'a'.repeat(7 * 1048576 + 10) + '"' }); assert.deepEqual([r.s, r.o.error], [413, 'too_large']);
  assert.equal((await call('GET', '/api/feedback')).s, 405);
  assert.equal(D.posts.length, n0, 'rien de posté');
  r = await call('POST', '/api/feedback', { body: FB({ title: '  Titre\u0000 avec   espaces\u202e ', text: 'a\r\nb\u0007c', imgs: [url64(fakeJpg(4096, 4096))] }) });
  assert.equal(r.s, 200); assert.equal(last().body.name, 'Titre avec espaces', 'titre nettoyé'); assert.ok(last().body.message.content.startsWith('a\nb c\n'), 'texte nettoyé'); assert.equal(last().files.length, 1, '4 096 px : accepté');
  ok(`avis refusés champ par champ (${cases.length} cas : type, titre 3–90, texte 1–1 500 et 30 lignes, partie, contact 60, captures JPEG ≤ 3, 1,5 Mo, 4 096 px, meta), JSON, Content-Type (415), 7 Mo (413), GET (405) ; titre et texte nettoyés`);

  const net = '198.51.100.7';
  for (let i = 0; i < 3; i++) assert.equal((await call('POST', '/api/feedback', { body: FB(), ip: net })).s, 200);
  r = await call('POST', '/api/feedback', { body: FB(), ip: net }); assert.equal(r.s, 429); assert.equal(r.o.error, 'rate_limited'); assert.ok(r.o.retry > 0 && r.h.get('retry-after') === String(r.o.retry));
  const tok = F.jwt('uid-zoe-03');
  for (let i = 0; i < 3; i++) assert.equal((await call('POST', '/api/feedback', { body: FB(), tok })).s, 200);
  r = await call('POST', '/api/feedback', { body: FB(), tok }); assert.equal(r.s, 429, 'budget du compte, d\'un autre réseau'); assert.match(r.o.message, /compte/);
  assert.equal((await call('POST', '/api/feedback', { body: FB(), tok: F.jwt('uid-zoe-03', -60) })).o.error, 'token_expired');
  assert.equal((await call('POST', '/api/feedback', { body: FB(), tok: 'abc.def.ghi' })).s, 401);
  assert.equal((await call('POST', '/api/feedback', { body: FB(), tok: F.jwt('uid-yves-04') })).s, 200, 'autre compte : son propre budget');
  assert.ok(!D.posts.some(p => JSON.stringify(p.body).includes('uid-')), 'ni UID ni empreinte envoyés à Discord');
  ok('budgets : FEEDBACK_PER_H par réseau (429 + Retry-After), autant par compte connecté (jeton vérifié : expiré, falsifié refusés) ; rien du compte chez Discord');

  D.limit = 1; r = await call('POST', '/api/feedback', { body: FB() }); assert.equal(r.s, 200, 'limite de débit (429) : attendue puis nouvel essai');
  D.down = 1; r = await call('POST', '/api/feedback', { body: FB() }); assert.equal(r.s, 200, '5xx : un nouvel essai');
  const nc = D.calls.length; D.down = 5; r = await call('POST', '/api/feedback', { body: FB() });
  assert.deepEqual([r.s, r.o.error], [503, 'unavailable']); assert.ok(r.o.message); assert.equal(D.calls.length - nc, 2, 'Discord en panne : deux essais, pas plus'); D.down = 0;
  D.limit = 99; r = await call('POST', '/api/feedback', { body: FB() }); assert.equal(r.s, 503, 'limite qui dure : abandon borné (~10 s)'); D.limit = 0;
  const saved = D.channels; D.channels = saved.filter(c => c.id !== C.idees);
  r = await call('POST', '/api/feedback', { body: FB({ kind: 'idea' }) }); assert.equal(r.s, 503, '#idées gardé en cache mais disparu : refus…');
  r = await call('POST', '/api/feedback', { body: FB({ kind: 'idea' }) }); assert.equal(r.s, 200); assert.equal(last().ch, C.bugs, '…liste relue tout de suite : forum absent → #bugs');
  D.channels = saved.filter(c => c.type !== 15); D.posts.length = 0;
  r = await call('POST', '/api/feedback', { body: FB() }); assert.equal(r.s, 503); r = await call('POST', '/api/feedback', { body: FB() }); assert.equal(r.s, 503); assert.match(r.o.message, /Forum/);
  D.channels = saved;
  ok('Discord : 429 attendu (retry_after), 5xx réessayé une fois, en panne → 503, limite qui dure → 503 borné ; forum disparu : liste relue, repli sur #bugs ; aucun forum → 503');
}

/* ── 3) Panneau /admin ────────────────────────────────────────────────────────────────────────────────────────────────────── */
{
  await stop(P); P = await start(ENV, 19802); BASE = P.url;      // cache vide (forums rendus)
  let r = await call('GET', '/api/admin/discord'); assert.equal(r.s, 401);
  r = await call('GET', '/api/admin/discord', { tok: JEANNE() }); assert.equal(r.s, 403); assert.doesNotMatch(r.t, /annonces|Testeur/);
  r = await call('POST', '/api/admin/discord/send', { tok: JEANNE(), body: { channel: C.general, content: 'pirate' } }); assert.equal(r.s, 403);
  r = await call('GET', '/api/admin/discord', { tok: ADM() });
  assert.equal(r.s, 200, r.t); assert.equal(r.o.on, true); assert.deepEqual(r.o.guild, { id: G, name: 'Mana Orbit' });
  assert.deepEqual(r.o.channels.map(c => [c.name, c.type, c.cat]), [['hors-catégorie', 0, ''], ['👋・bienvenue', 0, 'Bienvenue'], ['📢・annonces', 5, 'Bienvenue'], ['💬・général', 0, 'Communauté'], ['🔮・carte-mystère', 0, 'Communauté'], ['interdit', 0, 'Communauté']],
    'salons écrits et d\'annonces où le bot peut écrire, dans l\'ordre du serveur (ni #règles en lecture seule, ni #modération privé, ni forum, ni vocal)');
  assert.deepEqual(r.o.roles, [{ id: R.team, name: 'Équipe', color: 0x9fb4ff }, { id: R.test, name: 'Testeur', color: 0xf0b45a }], 'rôles à pinger, du plus haut au plus bas (ni @everyone ni rôles gérés)');
  assert.deepEqual(r.o.sent, []);
  ok('panneau : sans compte 401, autre compte 403 (rien), éditeur : serveur, salons où le bot écrit (ordre du serveur, catégorie), rôles à pinger');

  const send = (body, o = {}) => call('POST', '/api/admin/discord/send', { tok: ADM(), body, ...o });
  r = await send({ channel: C.annonces, content: 'Version 1.0.11 !\nNouveautés…', roles: [R.test, R.team], everyone: true, publish: true });
  assert.equal(r.s, 200, r.t); let m = D.posts.find(p => p.kind === 'msg' && p.ch === C.annonces);
  assert.equal(m.body.content, `<@&${R.test}> <@&${R.team}> @everyone\nVersion 1.0.11 !\nNouveautés…`, 'mentions en tête, dans l\'ordre reçu');
  assert.deepEqual(m.body.allowed_mentions, { roles: [R.test, R.team], parse: ['everyone'] }, 'allowed_mentions : exactement les pings demandés');
  assert.ok(D.posts.some(p => p.kind === 'crosspost' && p.ch === C.annonces && p.id === m.id), 'annonce publiée (crosspost)');
  assert.deepEqual(r.o.msg, { id: m.id, url: `https://discord.com/channels/${G}/${C.annonces}/${m.id}` });
  assert.deepEqual([r.o.sent.length, r.o.sent[0].ch, r.o.sent[0].chn, r.o.sent[0].id, r.o.sent[0].ping, r.o.sent[0].text], [1, C.annonces, '📢・annonces', m.id, ['Testeur', 'Équipe', 'everyone'], 'Version 1.0.11 !\nNouveautés…']);
  r = await send({ channel: C.general, content: '  Coucou <@&' + R.team + '> @everyone  ', roles: [], everyone: false, publish: true });
  m = D.posts.filter(p => p.kind === 'msg').pop(); assert.equal(r.s, 200);
  assert.equal(m.body.content, '  Coucou <@&' + R.team + '> @everyone  ', 'sans ping demandé : texte tel quel'); assert.deepEqual(m.body.allowed_mentions, { roles: [], parse: [] }, 'aucun ping permis');
  assert.ok(!D.posts.some(p => p.kind === 'crosspost' && p.id === m.id), 'salon écrit : pas de publication');
  assert.equal(r.o.sent[0].text.length, 140 > m.body.content.length ? m.body.content.length : 140);
  const pre = ('<@&' + R.team + '>\n').length;
  r = await send({ channel: C.general, content: 'x'.repeat(2000 - pre - 1) + 'y', roles: [R.team] }); assert.equal(r.s, 200, '2 000 caractères mentions comprises');
  assert.equal(r.o.sent[0].text.length, 140, 'historique : 140 premiers caractères');
  r = await send({ channel: C.general, content: 'x'.repeat(2000 - pre) + 'y', roles: [R.team] }); assert.deepEqual([r.s, r.o.error], [400, 'too_long']);
  for (const [b, st, err] of [[{ channel: C.general, content: '   ' }, 400, 'bad_content'], [{ channel: C.general }, 400, 'bad_content'], [{ channel: 'abc', content: 'x' }, 400, 'bad_channel'],
    [{ channel: C.regles, content: 'x' }, 404, 'not_found'], [{ channel: C.bugs, content: 'x' }, 404, 'not_found'], [{ channel: '939999999999999999', content: 'x' }, 404, 'not_found'],
    [{ channel: C.general, content: 'x', roles: Array(6).fill(0).map((_, i) => '92000000000000001' + i) }, 400, 'bad_roles'], [{ channel: C.general, content: 'x', roles: [R.bot] }, 400, 'bad_roles'], [{ channel: C.general, content: 'x', roles: [G] }, 400, 'bad_roles'],
    [{ channel: C.general, content: 'x', everyone: 'oui' }, 400, 'bad_request'], [{ channel: C.interdit, content: 'x' }, 502, 'discord']]) {
    r = await send(b); assert.equal(r.s, st, JSON.stringify(b) + ' → ' + r.t); assert.equal(r.o.error, err); assert.ok(r.o.message, 'message en français');
  }
  assert.match(r.o.message, /Missing Permissions/, 'refus de Discord : son message');
  assert.equal((await send({ channel: C.general, content: 'x' }, { hd: { 'sec-fetch-site': 'cross-site' } })).s, 403, 'autre site');
  assert.equal((await call('POST', '/api/admin/discord/send', { tok: ADM(), raw: JSON.stringify({ channel: C.general, content: 'x' }), hd: { 'Content-Type': 'text/plain' } })).s, 415, 'pas en JSON');
  assert.equal((await call('GET', '/api/admin/discord/send', { tok: ADM() })).s, 405);
  ok('envoi : mentions en tête et allowed_mentions exacts (rôles, @everyone), annonce publiée, salon écrit sans publication, texte tel quel, 2 000 caractères mentions comprises ; refus (vide, salon fermé au bot ou inconnu, 6 rôles, rôle géré, @everyone comme rôle, autre site, pas en JSON) ; refus de Discord → 502 avec son message');

  r = await call('GET', '/api/admin/discord', { tok: ADM() }); const sent = r.o.sent, del = sent[1];
  assert.equal(sent.length, 3); assert.ok(sent[0].t >= sent[1].t && sent[1].t >= sent[2].t, 'du plus récent au plus ancien');
  r = await call('POST', '/api/admin/discord/delete', { tok: ADM(), body: { id: del.id } });
  assert.equal(r.s, 200); assert.equal(r.o.ok, true); assert.ok(D.calls.includes(`DELETE /channels/${del.ch}/messages/${del.id}`)); assert.deepEqual(r.o.sent.map(x => x.id), [sent[0].id, sent[2].id]);
  assert.equal((await call('POST', '/api/admin/discord/delete', { tok: ADM(), body: { id: del.id } })).s, 404, 'plus dans l\'historique');
  assert.equal((await call('POST', '/api/admin/discord/delete', { tok: ADM(), body: { id: D.channels[0].id } })).s, 404, 'id hors de l\'historique : jamais supprimé');
  D.deleted.push(sent[2].id); r = await call('POST', '/api/admin/discord/delete', { tok: ADM(), body: { id: sent[2].id } }); assert.equal(r.s, 200, 'déjà supprimé sur Discord : retiré quand même'); assert.equal(r.o.sent.length, 1);
  const file = JSON.parse(readFileSync(join(process.env.ADMIN_DIR, 'discord.json'), 'utf8'));
  assert.deepEqual(file.list.map(x => x.id), [sent[0].id], 'historique sur le disque (ADMIN_DIR/discord.json)');
  assert.ok(!existsSync(join(process.env.ADMIN_DIR, 'discord.json.tmp')), 'écriture atomique');
  await stop(P); P = await start(ENV, 19803); BASE = P.url;
  r = await call('GET', '/api/admin/discord', { tok: ADM() }); assert.deepEqual(r.o.sent.map(x => x.id), [sent[0].id], 'historique relu après un redémarrage');
  const net = '198.51.100.99'; let last429 = null;
  for (let i = 0; i < 13; i++) last429 = await call('POST', '/api/admin/discord/send', { tok: ADM(), body: { channel: C.general, content: '' }, ip: net });
  assert.equal(last429.s, 429, 'ADMIN_ACTIONS_PER_H (12) par réseau');
  for (let i = 0; i < 60; i++) await call('POST', '/api/admin/discord/send', { tok: ADM(), body: { channel: C.general, content: 'm' + i }, ip: fresh() });
  r = await call('GET', '/api/admin/discord', { tok: ADM() }); assert.equal(r.o.sent.length, 50, '50 derniers envois'); assert.equal(r.o.sent[0].text, 'm59');
  ok('suppression (id de l\'historique seulement, déjà supprimé sur Discord : retiré), historique du plus récent au plus ancien, gardé sur le disque et relu au redémarrage, 50 au plus ; budget ADMIN_ACTIONS_PER_H');
}

/* ── 4) Discord injoignable pour le panneau, jeton jamais affiché ────────────────────────────────────────────────────────────── */
{
  await stop(P); P = await start(ENV, 19803); BASE = P.url;
  D.down = 99; let r = await call('GET', '/api/admin/discord', { tok: ADM() });
  assert.equal(r.s, 200); assert.equal(r.o.on, false); assert.match(r.o.message, /injoignable/); assert.equal(r.o.sent.length, 50, 'historique quand même'); D.down = 0;
  r = await call('GET', '/api/admin/discord', { tok: ADM() }); assert.equal(r.o.on, true, 'revenu : relu');
  await stop(P);
  P = await start({ ...ENV, DISCORD_BOT_TOKEN: 'mauvais-jeton-SECRET' }, 19803); BASE = P.url;
  r = await call('GET', '/api/admin/discord', { tok: ADM() }); assert.equal(r.o.on, false); assert.match(r.o.message, /Jeton du bot refusé/);
  assert.equal((await call('POST', '/api/feedback', { body: FB() })).s, 503);
  const logs = P.log() + procs.map(p => p.log()).join('');
  assert.ok(!logs.includes(TOKEN) && !logs.includes('mauvais-jeton-SECRET'), 'jeton jamais dans le journal');
  assert.ok(!r.t.includes('SECRET'), 'ni dans une réponse');
  assert.ok([...D.auth].every(a => a === 'Bot ' + TOKEN || a === 'Bot mauvais-jeton-SECRET')); assert.ok([...D.ua].every(u => /^DiscordBot \(https:\/\/manaorbit\.app, [\d.]+\)$/.test(u)), 'User-Agent DiscordBot');
  await stop(P);
  ok('Discord injoignable : panneau on: false + message, historique gardé, relu au retour ; jeton refusé : message clair ; jeton jamais dans le journal ni une réponse ; Authorization « Bot … », User-Agent DiscordBot');
}

/* ── 5) Carte mystère de la veille (discord-srv.mjs seul, horloge et attente injectées) ───────────────────────────────────────── */
{
  const waits = [], logs = [];
  const bot = discordMake({ token: TOKEN, api: DAPI, sleep: ms => { waits.push(ms); return Promise.resolve(); }, log: { log: m => logs.push(m), warn: m => logs.push(m) } });
  const info = { day: '2026-10-21', fr: 'Anneau solaire', en: 'Sol Ring', set: 'cmm', setName: 'Commander Masters', num: '400', img: 'https://cards.scryfall.io/large/front/x.jpg', scry: 'https://scryfall.com/card/cmm/400', plays: 12, wins: 5 };
  D.posts.length = 0; D.limit = 1;
  assert.equal(await bot.reveal(info), true); assert.equal(waits.length, 1, '429 : une attente'); assert.ok(waits[0] >= 80 && waits[0] < 1000);
  const m = last(); assert.equal(m.ch, C.mystere, '#carte-mystère');
  assert.deepEqual(m.body.allowed_mentions, { parse: [] });
  assert.match(m.body.content, /Carte mystère d'hier : Anneau solaire/); assert.match(m.body.content, /Trouvée par 5 joueurs sur 12\./); assert.match(m.body.content, /Yesterday's Mystery card: Sol Ring/); assert.match(m.body.content, /Found by 5 players out of 12\./);
  assert.equal(m.body.content.split('<https://manaorbit.app/?mystere=1>').length, 3, 'lien vers le jeu (FR et EN)');
  const e = m.body.embeds[0]; assert.deepEqual([e.title, e.url, e.image.url], ['Anneau solaire', 'https://scryfall.com/card/cmm/400', info.img]); assert.match(e.description, /Sol Ring · Commander Masters \(CMM\) #400/);
  assert.match(dscRevealMsg({ ...info, plays: 1, wins: 1 }).content, /Trouvée par 1 joueur sur 1\.[\s\S]*Found by 1 player out of 1\./);
  assert.match(dscRevealMsg({ ...info, plays: 0, wins: 0 }).content, /Personne ne l'a jouée\./);
  assert.equal(dscRevealMsg({ ...info, img: 'http://x/y.jpg' }).embeds[0].image, undefined, 'image en https seulement');
  const saved = D.channels; D.channels = saved.filter(c => c.id !== C.mystere);
  await assert.rejects(bot.reveal(info), /Discord a refusé/, 'salon disparu : erreur (nouvel essai au tour suivant)');
  await assert.rejects(bot.reveal(info), /carte-mystère introuvable/, 'liste relue : salon introuvable'); D.channels = saved;
  await assert.rejects(discordMake({ token: '', api: DAPI }).reveal(info), /non configuré/);
  assert.equal(dscName('🔮・Carte-Mystere'), 'carte-mystere'); assert.equal(dscName('🔮・carte-mystère'), 'carte-mystere'); assert.equal(DSC_PERMS, 183296n);
  ok('Carte mystère de la veille : #carte-mystère, FR + EN (trouvée par X joueurs sur Y, pluriels), embed (nom, image, page Scryfall), lien vers le jeu, aucun ping ; salon disparu : erreur puis liste relue');
}
console.log('OK test-discord-srv');
process.exit(0);
