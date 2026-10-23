// Bot Discord côté serveur (discord-srv.mjs, branché dans proxy.mjs) contre un faux Discord HTTP (aucun accès réseau) : /__ping feedback ; « Aide et avis »
// (POST /api/feedback : forum selon le type, étiquettes de la plateforme et de la partie sauf celles de l'équipe, captures en multipart, mentions jamais permises,
// refus de chaque champ, budget par réseau et par compte, Discord en panne → 503, limite de débit attendue, salon disparu relu, coupé → 404) ; panneau
// (/api/admin/discord : sans compte, autre compte, salons où le bot peut écrire dans l'ordre du serveur, rôles à pinger, envoi avec pings et allowed_mentions
// exacts, publication d'une annonce, refus, suppression, historique gardé sur le disque, budget) ; Carte mystère de la veille (message, embed) ; jeton jamais
// affiché ; fils des forums (/api/admin/discord/threads, thread, reply, thread-delete : ouverts, fermés et pages, filtre par forum, premier message gardé,
// lectures 4 à la fois, auteur sans id, hidden, fil hors des forums → 404, étiquettes du forum, fermer / rouvrir / verrouiller / renommer, réponse sans ping
// puis fermeture, suppression, garde-fous, CSP de /admin, journal sans texte) ; membres du serveur pour le champ « Pseudo Discord » (/api/feedback/members :
// préfixe du nom ou de l'identifiant, casse et accents ignorés, bots exclus, 5 au plus, avatars, cache, budget, intention absente → 503) et avis avec member
// (membre vérifié → « Signalé par <@id> », allowed_mentions.users exact ; inconnu, bot, mal formé → sans mention). Ports 19800–19803 ; faux Firebase de amis-fakes.mjs.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
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
// Faux Discord : calls (méthode et chemin), posts (corps JSON ou multipart lus), down (réponses 503 restantes), limit (429 restants), auth (en-têtes reçus) ;
// th (fils des forums et d'un salon écrit), msgs (messages de chaque fil, du plus ancien au plus récent), arcQ (requêtes des fils fermés), inflight / maxPar (lectures simultanées du premier message)
const D = { ...world(), calls: [], posts: [], down: 0, limit: 0, auth: new Set(), ua: new Set(), n: 5000, deleted: [], th: new Map(), msgs: new Map(), arcQ: [], inflight: 0, maxPar: 0, members: [], memQ: [], noIntent: false };
// OAuth2 de l'utilisateur (liaison) : codes donnés par la page d'autorisation (code → utilisateur), jetons d'accès, révoqués, redirect_uri reçues, membres du serveur
const OA = { cid: '950000000000000001', secret: 'secret-oauth-SECRET-abcdef', codes: new Map(), tokens: new Map(), revoked: [], redirs: [], reqs: [], members: new Set(), down: 0 };
// Membres du serveur (members/search, members/{id}) : le faux Discord est plus large que le vrai (le nom contient la recherche, accents ignorés) : le filtre par préfixe est celui du bot
const HASH = 'a1'.repeat(16), HASH2 = 'b2'.repeat(16), mem = (n, username, o = {}) => ({ user: { id: '95000000000000' + String(n).padStart(4, '0'), username, global_name: o.g ?? null, avatar: o.av ?? null, ...(o.bot ? { bot: true } : {}) }, nick: o.nick ?? null, avatar: o.mav ?? null, roles: [] });
const M = { beer: mem(1, 'beergod_', { g: 'Beer', av: HASH }), beer2: mem(2, 'beer'), abeer: mem(3, 'abeer', { g: 'Abeer' }), bot: mem(4, 'beerbot', { bot: true, g: 'Beer Bot' }), fan: mem(5, 'beer_fan', { g: 'Fan' }),
  bea: mem(6, 'zed', { g: 'Zed', nick: 'Béatrice', mav: HASH2, av: HASH }), x1: mem(7, 'beerx1'), x2: mem(8, 'beerx2'), x3: mem(9, 'beerx3'), bad: mem(10, 'beerbad', { av: '../x' }) };
D.members = Object.values(M);
const fold0 = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const EPOCH = 1420070400000, snow = (ms, n = 0) => String((BigInt(Math.floor(ms) - EPOCH) << 22n) + BigInt(n)), nid = () => snow(Date.now(), ++D.n & 4095);
const U = { jeanne: { id: '940000000000000001', username: 'jeanne_42', global_name: 'Jeanne', bot: false }, paul: { id: '940000000000000002', username: 'paul.m', global_name: null }, bot: { id: BOT, username: 'Mana Orbit', bot: true } };
const T0 = Date.now() - 20 * 86400e3, DAY = 86400e3, iso = ms => new Date(ms).toISOString();
/** Fil de forum : starter (même id que le fil) puis les messages ; msgs : [auteur, texte, { mentions, attachments, edited }]. */
function th(parent, at, { name = 'Fil', tags = [], owner = U.jeanne, archived = false, locked = false, arcAt = 0, msgs = [] } = {}) {
  const id = snow(at, D.th.size + 1), list = msgs.map(([a, content, x = {}], j) => ({ id: j ? snow(at + j * 60e3, j) : id, channel_id: id, type: 0, author: a, content, timestamp: iso(j ? at + j * 60e3 : at), edited_timestamp: x.edited ? iso(at + j * 60e3 + 5e3) : null, mentions: x.mentions || [], attachments: x.attachments || [], embeds: [] }));
  D.th.set(id, { id, type: 11, guild_id: G, parent_id: parent, name, owner_id: owner.id, applied_tags: tags, message_count: Math.max(0, list.length - 1), last_message_id: list.length ? list[list.length - 1].id : null,
    thread_metadata: { archived, locked, archive_timestamp: iso(arcAt || at), create_timestamp: iso(at), auto_archive_duration: 10080 } });
  D.msgs.set(id, list); return id;
}
const LONG = 'Début ' + 'é'.repeat(400);
const T = {
  t1: th(C.bugs, T0 + 10 * DAY, { name: 'Le scan ne lit pas les cartes', tags: ['800', '813'], owner: U.bot, msgs: [[U.bot, 'Le scan ne lit pas les cartes\n\n-# Android'], [U.jeanne, `Merci <@${BOT}> et <@&${R.team}> ! Voir <#${C.general}>`, { mentions: [U.bot], edited: true }],
    [U.paul, ''], [U.jeanne, '', { attachments: [{ id: '1', filename: 'capture.png', content_type: 'image/png', width: 640, height: 480, url: 'https://cdn.discordapp.com/attachments/1/2/capture.png?ex=1' }, { id: '2', filename: 'x.png', url: 'https://evil.example/x.png' }] }]] }),
  t2: th(C.bugs, T0 + 12 * DAY, { name: 'Plantage au lancement', owner: U.jeanne, msgs: [[U.jeanne, '']] }),
  t3: th(C.bugs, T0 + 5 * DAY, { name: 'Prix faux', owner: U.paul, locked: true, msgs: [[U.paul, LONG], ...Array.from({ length: 60 }, (_, i) => [U.paul, 'm' + (i + 1)])] }),
  t4: th(C.idees, T0 + 8 * DAY, { name: 'Mode sombre', owner: U.paul, msgs: [[U.paul, `Comme <@${U.jeanne.id}> le disait`, { mentions: [U.jeanne] }]] }),
  tx: th(C.general, T0 + 15 * DAY, { name: 'Fil du salon général', owner: U.jeanne, msgs: [[U.jeanne, 'hors forum']] }),
};
const ARC = Array.from({ length: 30 }, (_, k) => th(C.bugs, T0 - (k + 1) * 5 * 3600e3, { name: 'Fermé ' + k, archived: true, arcAt: T0 - (k + 1) * 5 * 3600e3 + 3600e3, msgs: [[U.bot, 'archivé ' + k]] }));
const ARC_I = [th(C.idees, T0 - 21 * 3600e3, { name: 'Idée fermée A', archived: true, arcAt: T0 - 20 * 3600e3, msgs: [[U.paul, 'a']] }), th(C.idees, T0 - 137 * 3600e3, { name: 'Idée fermée B', archived: true, arcAt: T0 - 136 * 3600e3, msgs: [[U.paul, 'b']] })];
const srv = http.createServer((q, r) => {
  const c = []; q.on('data', d => c.push(d)); q.on('end', async () => {
    const raw = Buffer.concat(c), send = (code, o) => { r.writeHead(code, { 'content-type': 'application/json' }); r.end(o === undefined ? '' : JSON.stringify(o)); };
    const p = new URL(q.url, 'http://x').pathname.replace(/^\/api\/v10/, ''), m = q.method; let x;
    if (p.startsWith('/oauth2/') || /^Bearer /.test(q.headers.authorization || '')) {      // OAuth2 de l'utilisateur (liaison du compte) : à part, jamais avec le jeton du bot
      const f = new URLSearchParams(raw.toString()); OA.reqs.push({ m, p, auth: q.headers.authorization || '', body: raw.toString(), ua: q.headers['user-agent'] || '', ct: q.headers['content-type'] || '' });
      if (OA.down > 0) { OA.down--; return send(503, { message: 'upstream connect error' }); }
      if (m === 'POST' && p === '/oauth2/token') {
        if (f.get('client_id') !== OA.cid || f.get('client_secret') !== OA.secret) return send(401, { error: 'invalid_client' });
        const u = OA.codes.get(f.get('code')); if (!u || f.get('grant_type') !== 'authorization_code') return send(400, { error: 'invalid_grant', error_description: 'Invalid "code" in request.' });
        OA.codes.delete(f.get('code')); OA.redirs.push(f.get('redirect_uri'));
        const at = 'acc-tok-' + nid(); OA.tokens.set(at, u); return send(200, { access_token: at, token_type: 'Bearer', expires_in: 604800, refresh_token: 'ref-tok-' + nid(), scope: 'identify' });
      }
      if (m === 'POST' && p === '/oauth2/token/revoke') { OA.revoked.push(f.get('token')); OA.tokens.delete(f.get('token')); return send(200, {}); }
      if (m === 'GET' && p === '/users/@me') { const u = OA.tokens.get((q.headers.authorization || '').slice(7)); return u ? send(200, { ...u, avatar: null, discriminator: '0' }) : send(401, { message: '401: Unauthorized', code: 0 }); }
      return send(404, { message: 'Unknown OAuth route ' + m + ' ' + p });
    }
    D.calls.push(m + ' ' + p); D.auth.add(q.headers.authorization || ''); D.ua.add(q.headers['user-agent'] || '');
    if (q.headers.authorization !== 'Bot ' + TOKEN) return send(401, { message: '401: Unauthorized', code: 0 });
    if (D.down > 0) { D.down--; return send(503, { message: 'upstream connect error' }); }
    if (D.limit > 0 && m === 'POST') { D.limit--; return send(429, { message: 'You are being rate limited.', retry_after: 0.08, global: false }); }
    if (m === 'GET' && p === '/users/@me') return send(200, { id: BOT, username: 'Mana Orbit', bot: true });
    if (m === 'GET' && p === '/users/@me/guilds') return send(200, [{ id: G, name: 'Mana Orbit' }]);
    if (m === 'GET' && p === `/guilds/${G}`) return send(200, { id: G, name: 'Mana Orbit' });
    if (m === 'GET' && p === `/guilds/${G}/channels`) return send(200, D.channels);
    if (m === 'GET' && p === `/guilds/${G}/roles`) return send(200, D.roles);
    if (m === 'GET' && p === `/guilds/${G}/members/${BOT}`) return send(200, { user: { id: BOT, username: 'Mana Orbit', bot: true }, roles: [R.bot] });
    if (m === 'GET' && p === `/guilds/${G}/members/search`) {
      const sp = new URL(q.url, 'http://x').searchParams; D.memQ.push(sp.toString());
      if (D.noIntent) return send(403, { message: 'Missing Access', code: 50001 });
      const qq = fold0(sp.get('query')), lim = Number(sp.get('limit')) || 1;
      return send(200, D.members.filter(y => [y.nick, y.user.global_name, y.user.username].some(n => n && fold0(n).includes(qq))).slice(0, lim));
    }
    if ((x = /^\/guilds\/\d+\/members\/(\d+)$/.exec(p)) && m === 'GET') { const mm = D.members.find(y => y.user.id === x[1]); if (mm) return send(200, mm); return OA.members.has(x[1]) ? send(200, { user: { id: x[1] }, roles: [] }) : send(404, { message: 'Unknown Member', code: 10007 }); }      // membres de la recherche (avis), ou ceux de la liaison du compte
    let body = null, files = [];
    if (/^multipart\/form-data/.test(q.headers['content-type'] || '')) {
      const fd = await new Response(raw, { headers: { 'content-type': q.headers['content-type'] } }).formData();
      body = JSON.parse(fd.get('payload_json'));
      for (const [k, v] of fd.entries()) if (k !== 'payload_json') files.push({ field: k, name: v.name, type: v.type, bytes: Buffer.from(await v.arrayBuffer()) });
    } else if (raw.length) body = JSON.parse(raw.toString());
    const ch = id => D.channels.find(y => y.id === id) || D.th.get(id), u = new URL(q.url, 'http://x');
    if ((x = /^\/channels\/(\d+)\/threads$/.exec(p)) && m === 'POST') {
      if (!ch(x[1]) || ch(x[1]).type !== 15) return send(404, { message: 'Unknown Channel', code: 10003 });
      const id = nid(); D.posts.push({ kind: 'thread', ch: x[1], body, files, ct: q.headers['content-type'] }); return send(201, { id, name: body.name, parent_id: x[1], type: 11 });
    }
    if ((x = /^\/channels\/(\d+)\/messages$/.exec(p)) && m === 'POST') {
      if (!ch(x[1])) return send(404, { message: 'Unknown Channel', code: 10003 });
      if (x[1] === C.interdit) return send(403, { message: 'Missing Permissions', code: 50013 });
      const id = nid(); D.posts.push({ kind: 'msg', ch: x[1], id, body });
      const t = D.th.get(x[1]);
      if (t) { t.thread_metadata.archived = false; t.message_count++; t.last_message_id = id; D.msgs.get(x[1]).push({ id, channel_id: x[1], type: 0, author: U.bot, content: body.content, timestamp: iso(Date.now()), edited_timestamp: null, mentions: [], attachments: [], embeds: [] }); }
      return send(200, { id, channel_id: x[1], ...body });
    }
    if ((x = /^\/channels\/(\d+)\/messages\/(\d+)\/crosspost$/.exec(p)) && m === 'POST') { D.posts.push({ kind: 'crosspost', ch: x[1], id: x[2] }); return send(200, { id: x[2] }); }
    if ((x = /^\/channels\/(\d+)\/messages\/(\d+)$/.exec(p)) && m === 'DELETE') {
      if (D.deleted.includes(x[2])) return send(404, { message: 'Unknown Message', code: 10008 });
      D.deleted.push(x[2]); return send(204);
    }
    if (m === 'GET' && p === `/guilds/${G}/threads/active`) return send(200, { threads: [...D.th.values()].filter(t => !t.thread_metadata.archived), members: [] });
    if ((x = /^\/channels\/(\d+)\/threads\/archived\/public$/.exec(p)) && m === 'GET') {
      D.arcQ.push(x[1] + u.search);
      const lim = Number(u.searchParams.get('limit')) || 50, bf = u.searchParams.get('before'), bt = bf ? Date.parse(bf) : Infinity, at = t => Date.parse(t.thread_metadata.archive_timestamp);
      const all = [...D.th.values()].filter(t => t.parent_id === x[1] && t.thread_metadata.archived && at(t) < bt).sort((a, b) => at(b) - at(a));
      return send(200, { threads: all.slice(0, lim), members: [], has_more: all.length > lim });
    }
    if ((x = /^\/channels\/(\d+)\/messages\/(\d+)$/.exec(p)) && m === 'GET') {
      D.inflight++; D.maxPar = Math.max(D.maxPar, D.inflight); await new Promise(res => setTimeout(res, 25)); D.inflight--;
      const mm = (D.msgs.get(x[1]) || []).find(y => y.id === x[2]); return mm ? send(200, mm) : send(404, { message: 'Unknown Message', code: 10008 });
    }
    if ((x = /^\/channels\/(\d+)\/messages$/.exec(p)) && m === 'GET') return send(200, [...(D.msgs.get(x[1]) || [])].reverse().slice(0, Number(u.searchParams.get('limit')) || 50));
    if ((x = /^\/channels\/(\d+)$/.exec(p))) {
      const t = D.th.get(x[1]);
      if (m === 'GET') { const c = ch(x[1]); return c ? send(200, { guild_id: G, ...c }) : send(404, { message: 'Unknown Channel', code: 10003 }); }
      if (!t) return send(404, { message: 'Unknown Channel', code: 10003 });
      if (m === 'PATCH') {
        D.posts.push({ kind: 'patch', id: x[1], body });
        if (t.thread_metadata.archived && body.archived !== false) return send(400, { message: 'Thread is archived', code: 50083 });
        if (body.name !== undefined) t.name = body.name;
        if (body.applied_tags !== undefined) t.applied_tags = body.applied_tags;
        if (body.locked !== undefined) t.thread_metadata.locked = body.locked;
        if (body.archived !== undefined) { t.thread_metadata.archived = body.archived; t.thread_metadata.archive_timestamp = iso(Date.now()); }
        return send(200, t);
      }
      if (m === 'DELETE') { D.th.delete(x[1]); D.posts.push({ kind: 'thdel', id: x[1] }); return send(200, t); }
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
  assert.equal((await call('GET', '/api/feedback/members?q=beer')).s, 404, 'membres : coupé sans bot');
  let r = await call('GET', '/api/admin/discord', { tok: ADM() });
  assert.equal(r.s, 200); assert.equal(r.o.on, false); assert.match(r.o.message, /non configuré/); assert.deepEqual([r.o.channels, r.o.roles, r.o.guild], [[], [], null]);
  assert.equal((await call('POST', '/api/admin/discord/send', { tok: ADM(), body: { channel: C.general, content: 'x' } })).s, 404);
  r = await call('GET', '/api/admin/discord/threads', { tok: ADM() }); assert.equal(r.s, 200); assert.deepEqual([r.o.on, r.o.forums, r.o.threads], [false, [], []]); assert.match(r.o.message, /non configuré/);
  assert.equal((await call('POST', '/api/admin/discord/reply', { tok: ADM(), body: { id: T.t1, content: 'x' } })).s, 404);
  assert.doesNotMatch(P.log(), /Bot Discord/); await stop(P);
  P = await start({ DISCORD: '0', DISCORD_BOT_TOKEN: TOKEN, DISCORD_API: DAPI }, 19801); BASE = P.url;
  assert.equal((await call('GET', '/__ping')).o.feedback, false); assert.equal((await call('POST', '/api/feedback', { body: FB() })).s, 404); assert.equal((await call('GET', '/api/feedback/members?q=beer')).s, 404);
  r = await call('GET', '/api/admin/discord', { tok: ADM() }); assert.equal(r.s, 404); assert.match(r.o.message, /DISCORD=0/);
  assert.equal((await call('GET', '/api/admin/discord/threads', { tok: ADM() })).s, 404); assert.equal((await call('GET', '/api/admin/discord/thread?id=' + T.t1, { tok: ADM() })).s, 404);
  await stop(P); assert.equal(D.calls.length, 0, 'aucun appel à Discord');
  ok('sans DISCORD_BOT_TOKEN : /__ping feedback false, /api/feedback 404, panneau « bot non configuré » (200, on: false) ; DISCORD=0 : tout en 404, rien demandé à Discord');
}

const ENV = { DISCORD_BOT_TOKEN: TOKEN, DISCORD_API: DAPI, FEEDBACK_PER_H: '3', ADMIN_ACTIONS_PER_H: '12', DISCORD_FEEDBACK_SIMILAR: '0' };      // titres proches : tests/test-discord-forum.mjs (sinon des appels de plus en arrière-plan)
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

/* ── 2 bis) Champ « Pseudo Discord » : membres du serveur, avis avec member ─────────────────────────────────────────────────── */
{
  await stop(P); P = await start(ENV, 19802); BASE = P.url;      // caches vides (forums rendus)
  const ids = r => r.o.members.map(x => x.id), mq = q => call('GET', '/api/feedback/members?q=' + encodeURIComponent(q));
  let r = await mq('Beer');
  assert.equal(r.s, 200, r.t); assert.deepEqual(Object.keys(r.o), ['members']);
  assert.deepEqual(ids(r), [M.beer, M.beer2, M.fan, M.x1, M.x2].map(x => x.user.id), 'préfixe du nom ou de l\'identifiant (ni « abeer », ni le bot), 5 au plus, ordre de Discord');
  assert.deepEqual(r.o.members[0], { id: M.beer.user.id, name: 'Beer', user: 'beergod_', avatar: `https://cdn.discordapp.com/avatars/${M.beer.user.id}/${HASH}.png?size=64` }, 'nom affiché, identifiant, avatar de l\'utilisateur (64 px)');
  assert.deepEqual(r.o.members[1], { id: M.beer2.user.id, name: 'beer', user: 'beer', avatar: '' }, 'sans nom affiché : l\'identifiant ; sans avatar : vide');
  assert.deepEqual(r.o.members[2].name, 'Fan', 'trouvé par son identifiant (beer_fan), affiché sous son nom');
  assert.equal(D.memQ.at(-1), 'query=Beer&limit=10', 'members/search : la saisie, 10 au plus');
  const n0 = D.memQ.length;
  r = await mq('BEER'); assert.deepEqual(ids(r), [M.beer, M.beer2, M.fan, M.x1, M.x2].map(x => x.user.id), 'casse ignorée');
  r = await mq('beer'); assert.equal(D.memQ.length, n0, 'même recherche (casse près) : gardée 60 s, rien redemandé à Discord');
  r = await mq('bea'); assert.deepEqual(r.o.members, [{ id: M.bea.user.id, name: 'Béatrice', user: 'zed', avatar: `https://cdn.discordapp.com/guilds/${G}/users/${M.bea.user.id}/avatars/${HASH2}.png?size=64` }], 'accents ignorés ; surnom du serveur ; avatar du membre d\'abord');
  r = await mq('ZE'); assert.deepEqual(ids(r), [M.bea.user.id], 'identifiant (zed) sous un surnom');
  r = await mq('beerb'); assert.deepEqual(r.o.members, [{ id: M.bad.user.id, name: 'beerbad', user: 'beerbad', avatar: '' }], 'bot exclu ; avatar mal formé : vide');
  r = await mq('beerx'); assert.equal(r.o.members.length, 3);
  for (const q of ['b', ' b ', '', 'x'.repeat(33)]) { r = await mq(q); assert.deepEqual([r.s, r.o.error], [400, 'bad_query'], JSON.stringify(q)); assert.ok(r.o.message); }
  assert.equal((await call('GET', '/api/feedback/members')).s, 400);
  assert.equal((await call('POST', '/api/feedback/members?q=beer', { body: {} })).s, 405);
  const net = '198.51.100.40'; let last429 = null;
  for (let i = 0; i < 61; i++) last429 = await call('GET', '/api/feedback/members?q=beer', { ip: net });
  assert.equal(last429.s, 429, '60 recherches par 10 min et par réseau'); assert.equal(last429.o.error, 'rate_limited'); assert.ok(Number(last429.h.get('retry-after')) > 0);
  assert.equal((await call('GET', '/api/feedback/members?q=beer')).s, 200, 'autre réseau : son propre budget');
  ok('membres : préfixe du nom (surnom, nom affiché, identifiant) ou de l\'identifiant, casse et accents ignorés, bots exclus, 5 au plus, avatar du membre ou de l\'utilisateur (CDN, 64 px), recherche de 2 à 32 caractères, gardée 60 s, 60 par 10 min et par réseau');

  r = await call('POST', '/api/feedback', { body: FB({ member: M.beer.user.id, contact: 'beergod_' }) });
  assert.equal(r.s, 200, r.t); let t = last();
  assert.ok(D.calls.includes(`GET /guilds/${G}/members/${M.beer.user.id}`), 'membre vérifié auprès de Discord');
  assert.deepEqual(t.body.message.allowed_mentions, { parse: [], users: [M.beer.user.id] }, 'seul le membre choisi peut être pingé (ni @everyone ni le rôle du texte)');
  assert.ok(t.body.message.content.startsWith(`Ligne 1\nLigne 2 @everyone <@&${R.team}>\n\nSignalé par <@${M.beer.user.id}>\n\n-# Android`), 'texte, « Signalé par <@id> », puis les détails : ' + t.body.message.content);
  assert.doesNotMatch(t.body.message.content, /Contact Discord/, 'mentionné : pas de ligne de contact en plus');
  for (const [member, what] of [['950000000000009999', 'inconnu'], [M.bot.user.id, 'bot'], ['abc', 'mal formé'], [42, 'pas un texte'], [BOT, 'le bot lui-même']]) {
    r = await call('POST', '/api/feedback', { body: FB({ member }) }); assert.equal(r.s, 200, what + ' : ' + r.t); t = last();
    assert.deepEqual(t.body.message.allowed_mentions, { parse: [] }, what + ' : aucun ping'); assert.doesNotMatch(t.body.message.content, /Signalé par/, what);
    assert.match(t.body.message.content, /^-# Contact Discord : jeanne\\_42$/m, what + ' : le pseudo écrit, comme avant');
  }
  ok('avis avec member : membre vérifié (members/{id}) → « Signalé par <@id> » après le texte, allowed_mentions { parse: [], users: [id] } ; inconnu, bot, mal formé → publié sans mention, contact gardé');

  D.noIntent = true; const nq = D.memQ.length;
  r = await mq('Noé'); assert.deepEqual([r.s, r.o.error], [503, 'no_intent']); assert.match(r.o.message, /Server Members/); assert.ok(Number(r.h.get('retry-after')) > 0);
  r = await mq('autre'); assert.equal(r.s, 503); assert.equal(D.memQ.length, nq + 1, 'refus gardé : plus rien demandé à Discord pendant 5 min');
  assert.equal((P.log().match(/Server Members Intent/g) || []).length, 1, 'une seule ligne de journal'); assert.ok(!P.log().includes(TOKEN));
  r = await call('POST', '/api/feedback', { body: FB({ member: M.beer.user.id }) }); assert.equal(r.s, 200, 'l\'avis part toujours'); assert.deepEqual(last().body.message.allowed_mentions.users, [M.beer.user.id]);
  D.noIntent = false;
  ok('intention « Server Members » absente (403, 50001) : 503 no_intent avec un message clair, une ligne de journal, pause de 5 min sans appel ; l\'avis part toujours');
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

/* ── 3 bis) Fils des forums depuis /admin ─────────────────────────────────────────────────────────────────────────────────────── */
{
  await stop(P); P = await start(ENV, 19803); BASE = P.url;      // caches vides
  const get = (q, o = {}) => call('GET', '/api/admin/discord/' + q, { tok: ADM(), ...o });
  const act = (sub, body, o = {}) => call('POST', '/api/admin/discord/' + sub, { tok: ADM(), body, ...o });
  const firstReads = id => D.calls.filter(c => c === `GET /channels/${id}/messages/${id}`).length;
  const noIds = (t, what) => { for (const id of [U.jeanne.id, U.paul.id, BOT]) assert.ok(!t.includes(id), what + ' : aucun id d\'utilisateur (' + id + ')'); };
  let r = await get('threads');
  assert.equal(r.s, 200, r.t); assert.equal(r.o.on, true); assert.equal(r.o.more, false);
  assert.deepEqual(r.o.forums.map(f => [f.key, f.id, f.name, f.tags.length]), [['bugs', C.bugs, '🐞・bugs', 16], ['idées', C.idees, '💡・Idées', 3], ['aide', C.aide, 'aide', 4]], 'les trois forums, trouvés par leur nom utile');
  assert.deepEqual(r.o.forums[0].tags[14], { id: '814', name: 'Corrigé', emoji: '', moderated: true }, 'étiquettes du forum (emoji, réservées à l\'équipe)');
  assert.deepEqual(r.o.threads.map(t => t.id), [T.t2, T.t1, T.t4, T.t3], 'fils ouverts des trois forums (pas celui du salon général, ni les fermés), le plus récent d\'abord');
  const t1 = r.o.threads[1];
  assert.deepEqual({ ...t1, created: 0, last: 0 }, { id: T.t1, forum: 'bugs', name: 'Le scan ne lit pas les cartes', tags: ['800', '813'], created: 0, last: 0, count: 3, archived: false, locked: false, by: { name: 'Mana Orbit', bot: true }, url: `https://discord.com/channels/${G}/${T.t1}`, first: 'Le scan ne lit pas les cartes\n\n-# Android' });
  assert.equal(t1.created, T0 + 10 * DAY); assert.equal(t1.last, T0 + 10 * DAY + 3 * 60e3, 'last : dernier message');
  const t2 = r.o.threads[0], t3 = r.o.threads[3], t4 = r.o.threads[2];
  assert.deepEqual([t2.first, t2.firstHidden, t2.by], ['', true, { name: 'Jeanne', bot: false }], 'premier message d\'un membre illisible (intention absente) : vide, signalé');
  assert.deepEqual([t3.locked, t3.by, [...t3.first].length, t3.first.endsWith('…'), t3.count], [true, { name: 'paul.m', bot: false }, 300, true, 60], 'début du premier message : 300 caractères ; sans global_name : username');
  assert.equal(t4.first, 'Comme @Jeanne le disait', 'mention <@id> → @nom'); assert.equal(t4.forum, 'idées');
  noIds(r.t, 'liste');
  for (const t of [T.t1, T.t2, T.t3, T.t4]) assert.equal(firstReads(t), 1, 'premier message lu une fois');
  assert.equal(firstReads(T.tx), 0, 'fil hors des forums : jamais lu');
  const nList = D.calls.length; r = await get('threads');
  assert.equal(r.s, 200); assert.equal(D.calls.length, nList, 'liste gardée (30 s) : rien redemandé à Discord');
  r = await get('threads?forum=idees&state=open'); assert.deepEqual(r.o.threads.map(t => t.id), [T.t4], 'filtre par forum (accent ignoré)');
  r = await get('threads?forum=bugs'); assert.deepEqual(r.o.threads.map(t => t.id), [T.t2, T.t1, T.t3]);
  r = await get('threads?forum=aide'); assert.deepEqual(r.o.threads, []);
  assert.equal(D.calls.filter(c => c === `GET /guilds/${G}/threads/active`).length, 4, 'un appel des fils actifs par liste');
  for (const t of [T.t1, T.t2, T.t3, T.t4]) assert.equal(firstReads(t), 1, 'premier message toujours gardé');
  for (const q of ['threads?forum=spam', 'threads?state=tout', 'threads?state=closed&before=hier']) { r = await get(q); assert.equal(r.s, 400, q); assert.ok(r.o.message); }
  ok('fils ouverts : les trois forums et leurs étiquettes, fils actifs filtrés par forum (ni salon écrit ni fermés), le plus récent d\'abord, auteur (nom, bot) sans id, début du premier message (300 caractères, mentions → noms, illisible → firstHidden) lu une fois, liste gardée 30 s ; filtre forum');

  D.maxPar = 0; r = await get('threads?forum=bugs&state=closed');
  assert.equal(r.s, 200, r.t); assert.equal(r.o.threads.length, 25); assert.equal(r.o.more, true); assert.ok(r.o.next, 'next : date à passer en before');
  assert.deepEqual(r.o.threads.map(t => t.id), ARC.slice(0, 25), 'fermés : 25 par page, le plus récent d\'abord'); assert.ok(r.o.threads.every(t => t.archived && t.closed > 0 && t.forum === 'bugs'));
  assert.ok(D.maxPar >= 2 && D.maxPar <= 4, 'premiers messages lus en parallèle, 4 à la fois au plus (' + D.maxPar + ')');
  assert.equal(D.arcQ[D.arcQ.length - 1], C.bugs + '?limit=25');
  r = await get('threads?forum=bugs&state=closed&before=' + encodeURIComponent(r.o.next));
  assert.deepEqual([r.o.threads.map(t => t.id), r.o.more, r.o.next], [ARC.slice(25), false, undefined], 'page suivante : les 5 derniers');
  assert.match(D.arcQ[D.arcQ.length - 1], /^\d+\?limit=25&before=\d{4}-/);
  const all = []; let before = '', pages = 0;
  do { r = await get('threads?state=closed' + (before ? '&before=' + encodeURIComponent(before) : '')); assert.equal(r.s, 200); all.push(...r.o.threads.map(t => t.id)); before = r.o.next; pages++; } while (r.o.more && pages < 5);
  assert.equal(pages, 2); assert.equal(new Set(all).size, all.length, 'aucun fil répété'); assert.deepEqual(all.slice().sort(), [...ARC, ...ARC_I].sort(), 'trois forums : tous les fermés, rien de perdu');
  assert.ok(all.indexOf(ARC_I[0]) < 26 && all.indexOf(ARC_I[1]) >= 26, 'pages coupées à la même date dans chaque forum');
  ok('fils fermés : 25 par page (archived/public, limit et before), more et next, page suivante ; trois forums mêlés sans perte ni doublon ; premiers messages 4 à la fois au plus');

  r = await get('thread?id=' + T.t1);
  assert.equal(r.s, 200, r.t); assert.equal(r.o.thread.id, T.t1); assert.equal(r.o.more, false);
  const ms = r.o.messages; assert.equal(ms.length, 4); assert.ok(ms[0].t < ms[1].t && ms[1].t < ms[3].t, 'du plus ancien au plus récent');
  assert.deepEqual([ms[0].by, ms[0].content, ms[0].edited], [{ name: 'Mana Orbit', bot: true }, 'Le scan ne lit pas les cartes\n\n-# Android', false]);
  assert.deepEqual([ms[1].by, ms[1].content, ms[1].edited, ms[1].hidden], [{ name: 'Jeanne', bot: false }, 'Merci @Mana Orbit et @Équipe ! Voir #💬・général', true, undefined], 'mentions remplacées par les noms, modifié');
  assert.deepEqual([ms[2].content, ms[2].hidden], ['', true], 'message d\'un membre sans texte lisible : hidden');
  assert.deepEqual([ms[3].hidden, ms[3].attachments], [undefined, [{ url: 'https://cdn.discordapp.com/attachments/1/2/capture.png?ex=1', name: 'capture.png', type: 'image/png', w: 640, h: 480 }]], 'pièces jointes du CDN de Discord seulement');
  noIds(r.t, 'fil'); assert.equal(firstReads(T.t1), 1, 'premier message toujours pas relu');
  r = await get('thread?id=' + T.t3); assert.equal(r.o.messages.length, 50); assert.equal(r.o.more, true); assert.deepEqual([r.o.messages[0].content, r.o.messages[49].content], ['m11', 'm60'], '50 derniers, more');
  const n1 = D.calls.length;
  for (const id of [T.tx, C.general, C.bugs, '939999999999999999', 'abc', '']) { r = await get('thread?id=' + id); assert.equal(r.s, 404, id + ' → ' + r.t); assert.equal(r.o.error, 'not_found'); assert.ok(r.o.message); }
  assert.ok(!D.calls.slice(n1).some(c => /\/messages/.test(c)), 'fil hors des forums : aucun message lu');
  ok('fil : 50 derniers messages du plus ancien au plus récent (more), auteur sans id, mentions → noms, modifié, hidden, pièces jointes du CDN ; fil d\'un autre salon, salon, inconnu, mal formé → 404 sans rien lire');

  const n2 = D.posts.length;
  for (const [sub, b] of [['thread', { id: T.tx, archived: true }], ['reply', { id: T.tx, content: 'x' }], ['thread-delete', { id: T.tx }], ['thread', { id: C.general, locked: true }], ['reply', { id: '939999999999999999', content: 'x' }]]) {
    r = await act(sub, b); assert.equal(r.s, 404, sub + ' ' + JSON.stringify(b)); assert.equal(r.o.error, 'not_found');
  }
  assert.equal(D.posts.length, n2, 'rien écrit hors des forums'); assert.ok(D.th.has(T.tx));
  for (const [sub, b, err] of [['thread', { id: T.t1, tags: ['850'] }, 'bad_tags'], ['thread', { id: T.t1, tags: ['800', '801', '802', '803', '804', '805'] }, 'bad_tags'], ['thread', { id: T.t1, tags: ['800', '800'] }, 'bad_tags'],
    ['thread', { id: T.t1, tags: 'Scan' }, 'bad_tags'], ['thread', { id: T.t1, name: '  \u0007 ' }, 'bad_name'], ['thread', { id: T.t1, name: 'x'.repeat(101) }, 'bad_name'], ['thread', { id: T.t1, name: 5 }, 'bad_name'],
    ['thread', { id: T.t1, archived: 'oui' }, 'bad_request'], ['thread', { id: T.t1 }, 'bad_request'], ['thread', { id: 5 }, 'bad_request'],
    ['reply', { id: T.t1, content: '  ' }, 'bad_content'], ['reply', { id: T.t1 }, 'bad_content'], ['reply', { id: T.t1, content: 'x'.repeat(2001) }, 'too_long'], ['reply', { id: T.t1, content: 'x', close: 1 }, 'bad_request']]) {
    r = await act(sub, b); assert.equal(r.s, 400, sub + ' ' + JSON.stringify(b).slice(0, 80) + ' → ' + r.t); assert.equal(r.o.error, err); assert.ok(r.o.message);
  }
  assert.equal(D.posts.length, n2, 'rien écrit');
  ok('écritures refusées : fil hors des forums (404, rien écrit), étiquettes d\'un autre forum, 6, en double, nom vide ou > 100, rien à changer, réponse vide ou > 2 000');

  const patches = () => D.posts.filter(p => p.kind === 'patch' && p.id === T.t1).map(p => p.body);
  r = await act('thread', { id: T.t1, tags: ['801', '814'] }); assert.equal(r.s, 200, r.t); assert.deepEqual(r.o.thread.tags, ['801', '814']); assert.equal(r.o.thread.first, 'Le scan ne lit pas les cartes\n\n-# Android');
  r = await act('thread', { id: T.t1, archived: true }); assert.equal(r.s, 200); assert.equal(r.o.thread.archived, true);
  r = await get('threads?forum=bugs'); assert.ok(!r.o.threads.some(t => t.id === T.t1), 'liste oubliée après une écriture : fil fermé absent des ouverts');
  r = await act('thread', { id: T.t1, name: '  Scan :\u0007 cartes   illisibles ', locked: true }); assert.equal(r.s, 200, r.t);
  assert.deepEqual([r.o.thread.name, r.o.thread.locked, r.o.thread.archived], ['Scan : cartes illisibles', true, true], 'fil fermé : renommé et verrouillé, toujours fermé');
  r = await act('thread', { id: T.t1, archived: false, locked: false }); assert.deepEqual([r.s, r.o.thread.archived, r.o.thread.locked], [200, false, false], 'rouvert, déverrouillé');
  assert.deepEqual(patches(), [{ applied_tags: ['801', '814'] }, { archived: true }, { name: 'Scan : cartes illisibles', locked: true, archived: false }, { archived: true }, { locked: false, archived: false }], 'PATCH envoyés (fil fermé : rouvert le temps du changement)');
  ok('étiquettes du forum, fermer, renommer et verrouiller un fil fermé (rouvert puis refermé), rouvrir, déverrouiller ; liste oubliée après chaque écriture');

  r = await act('reply', { id: T.t2, content: `Corrigé dans la 1.0.11, merci @everyone <@&${R.team}> <@${U.jeanne.id}> !`, close: true });
  assert.equal(r.s, 200, r.t); const rep = D.posts.filter(p => p.kind === 'msg' && p.ch === T.t2).pop();
  assert.deepEqual(rep.body, { content: `Corrigé dans la 1.0.11, merci @everyone <@&${R.team}> <@${U.jeanne.id}> !`, allowed_mentions: { parse: [] } }, 'réponse telle quelle, aucun ping');
  assert.deepEqual(r.o.msg, { id: rep.id, url: `https://discord.com/channels/${G}/${T.t2}/${rep.id}` });
  assert.deepEqual(D.posts.filter(p => p.kind === 'patch' && p.id === T.t2).map(p => p.body), [{ archived: true }], 'puis fermé'); assert.equal(r.o.thread.archived, true);
  r = await act('reply', { id: T.t2, content: 'Rouvert par la réponse' }); assert.equal(r.s, 200); assert.equal(r.o.thread.archived, false, 'réponse dans un fil fermé : rouvert par Discord'); assert.equal(r.o.thread.count, 2);
  r = await get('thread?id=' + T.t2); assert.deepEqual(r.o.messages.slice(1).map(m => [m.by.bot, m.content]), [[true, 'Corrigé dans la 1.0.11, merci @everyone @Équipe @membre !'], [true, 'Rouvert par la réponse']]);
  r = await act('thread-delete', { id: T.t4 }); assert.equal(r.s, 200); assert.deepEqual(r.o, { ok: true }); assert.ok(D.calls.includes(`DELETE /channels/${T.t4}`)); assert.ok(!D.th.has(T.t4));
  assert.equal((await get('thread?id=' + T.t4)).s, 404, 'supprimé : introuvable'); r = await get('threads'); assert.ok(!r.o.threads.some(t => t.id === T.t4));
  assert.equal((await act('thread-delete', { id: T.t4 })).s, 404);
  ok('réponse du bot (texte tel quel, allowed_mentions vide) puis fermeture, lien du message ; réponse dans un fil fermé ; suppression d\'un fil (DELETE), introuvable ensuite');

  r = await call('GET', '/api/admin/discord/threads'); assert.equal(r.s, 401);
  r = await call('GET', '/api/admin/discord/threads', { tok: JEANNE() }); assert.equal(r.s, 403); assert.doesNotMatch(r.t, /bugs|Mana Orbit/);
  r = await call('GET', '/api/admin/discord/thread?id=' + T.t1, { tok: JEANNE() }); assert.equal(r.s, 403);
  const n3 = D.posts.length;
  for (const sub of ['thread', 'reply', 'thread-delete']) {
    assert.equal((await call('POST', '/api/admin/discord/' + sub, { body: { id: T.t3, content: 'x', archived: true } })).s, 401, sub + ' sans compte');
    assert.equal((await call('POST', '/api/admin/discord/' + sub, { tok: JEANNE(), body: { id: T.t3, content: 'x', archived: true } })).s, 403, sub + ' autre compte');
    assert.equal((await act(sub, { id: T.t3, content: 'x', archived: true }, { hd: { 'sec-fetch-site': 'cross-site' } })).s, 403, sub + ' autre site');
    assert.equal((await call('POST', '/api/admin/discord/' + sub, { tok: ADM(), raw: JSON.stringify({ id: T.t3, content: 'x' }), hd: { 'Content-Type': 'text/plain' } })).s, 415, sub + ' pas en JSON');
    assert.equal((await call('GET', '/api/admin/discord/' + sub + '?id=' + T.t3, { tok: ADM() })).s, sub === 'thread' ? 200 : 405);
  }
  assert.equal((await call('POST', '/api/admin/discord/threads', { tok: ADM(), body: {} })).s, 405);
  assert.equal(D.posts.length, n3, 'rien écrit'); assert.ok(D.th.has(T.t3));
  const net = '198.51.100.123'; let rr = null;
  for (let i = 0; i < 13; i++) rr = await act('thread', { id: 'x' }, { ip: net });
  assert.equal(rr.s, 429, 'ADMIN_ACTIONS_PER_H (12) par réseau, comme /send'); assert.equal(rr.o.error, 'rate_limited');
  r = await call('GET', '/admin'); const csp = r.h.get('content-security-policy') || '';
  assert.match(csp, /img-src 'self' data: https:\/\/cdn\.discordapp\.com https:\/\/media\.discordapp\.net;/, 'CSP de /admin : images des pièces jointes de Discord');
  const lg = P.log();
  assert.match(lg, new RegExp(`Discord : fil ${T.t1} \\(#bugs\\) : étiquettes\\.`)); assert.match(lg, new RegExp(`Discord : fil ${T.t1} \\(#bugs\\) : renommé, verrouillé\\.`));
  assert.match(lg, new RegExp(`Discord : fil ${T.t2} \\(#bugs\\) : réponse, fermé\\.`)); assert.match(lg, new RegExp(`Discord : fil ${T.t4} \\(#idées\\) : supprimé\\.`));
  for (const x of ['Corrigé dans', 'Rouvert par', 'cartes illisibles', 'Mode sombre', 'Jeanne', TOKEN]) assert.ok(!lg.includes(x), 'journal sans texte, nom ni jeton : ' + x);
  ok('garde-fous des fils : sans compte 401, autre compte 403 (rien), autre site, pas en JSON, mauvaise méthode, budget ADMIN_ACTIONS_PER_H ; CSP de /admin avec cdn.discordapp.com et media.discordapp.net ; journal : fil, forum, action (ni texte, ni nom, ni jeton)');
}

/* ── 4) Discord injoignable pour le panneau, jeton jamais affiché ────────────────────────────────────────────────────────────── */
{
  await stop(P); P = await start(ENV, 19803); BASE = P.url;
  D.down = 99; let r = await call('GET', '/api/admin/discord', { tok: ADM() });
  assert.equal(r.s, 200); assert.equal(r.o.on, false); assert.match(r.o.message, /injoignable/); assert.equal(r.o.sent.length, 50, 'historique quand même'); D.down = 0;
  r = await call('GET', '/api/admin/discord', { tok: ADM() }); assert.equal(r.o.on, true, 'revenu : relu');
  D.down = 99; r = await call('GET', '/api/admin/discord/threads', { tok: ADM() }); D.down = 0;
  assert.equal(r.s, 200); assert.deepEqual([r.o.on, r.o.forums, r.o.threads], [false, [], []]); assert.match(r.o.message, /injoignable/, 'fils : Discord injoignable → on: false');
  D.down = 99; r = await call('GET', '/api/admin/discord/thread?id=' + T.t1, { tok: ADM() }); D.down = 0; assert.deepEqual([r.s, r.o.error], [503, 'unavailable']);
  r = await call('GET', '/api/admin/discord/threads', { tok: ADM() }); assert.equal(r.o.on, true, 'revenu');
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
/* ── 6) Liaison du compte Discord (OAuth2) : vrai proxy.mjs ──────────────────────────────────────────────────────────────────── */
const seen = [];      // toutes les réponses de la liaison (corps et en-têtes) : ni secret, ni UID, ni jeton, ni id Discord
const lc = async (method, path, o) => { const r = await call(method, path, o); seen.push(r.t + ' ' + JSON.stringify([...r.h])); return r; };
const back = (code, state, lang = 'fr-FR,fr;q=0.9,en;q=0.8', ip) => lc('GET', '/api/discord/callback?' + new URLSearchParams({ ...(code ? { code } : {}), ...(state != null ? { state } : {}) }), { hd: { 'accept-language': lang }, ...(ip ? { ip } : {}) });
const linkUrl = async tok => { const r = await lc('POST', '/api/discord/link', { tok, body: {} }); assert.equal(r.s, 200, r.t); return new URL(r.o.url); };
const LINKS = () => { const f = join(process.env.ADMIN_DIR, 'discord-links.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).links : {}; };
const LENV = { ...ENV, DISCORD_CLIENT_ID: OA.cid, DISCORD_CLIENT_SECRET: OA.secret }, P0 = procs.length;
{
  P = await start(ENV, 19802); BASE = P.url;      // bot sans identifiant ni secret de l'application : liaison coupée
  assert.equal((await call('GET', '/__ping')).o.discordLink, false, '/__ping discordLink: false');
  for (const [m, pth] of [['POST', '/api/discord/link'], ['GET', '/api/discord/me'], ['GET', '/api/discord/callback?code=x&state=y'], ['POST', '/api/discord/unlink']]) assert.equal((await call(m, pth, { tok: JEANNE(), body: m === 'POST' ? {} : undefined })).s, 404, pth);
  await stop(P);
  P = await start({ DISCORD_CLIENT_ID: OA.cid, DISCORD_CLIENT_SECRET: OA.secret, DISCORD_API: DAPI }, 19802); BASE = P.url;      // application sans bot : coupée aussi (l'adhésion se vérifie avec le bot)
  assert.equal((await call('GET', '/__ping')).o.discordLink, false); assert.equal((await call('POST', '/api/discord/link', { tok: JEANNE(), body: {} })).s, 404);
  assert.match(P.log(), /Liaison des comptes Discord coupée/); assert.ok(!P.log().includes(OA.secret));
  await stop(P);
  ok('liaison coupée sans DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET, ou sans le bot : /__ping discordLink false, /api/discord/* en 404 (avertissement sans le secret)');

  P = await start(LENV, 19802); BASE = P.url;
  assert.equal((await call('GET', '/__ping')).o.discordLink, true, '/__ping discordLink: true'); assert.match(P.log(), /liaison des comptes \(OAuth2\)/);
  let r = await lc('POST', '/api/discord/link', { body: {} }); assert.deepEqual([r.s, r.o.error], [401, 'auth_required']);
  r = await lc('POST', '/api/discord/link', { body: {}, tok: 'abc.def.ghi' }); assert.deepEqual([r.s, r.o.error], [401, 'bad_token']);
  r = await lc('POST', '/api/discord/link', { body: {}, tok: F.jwt('uid-jeanne-01', -60) }); assert.equal(r.o.error, 'token_expired');
  assert.equal((await lc('GET', '/api/discord/link', { tok: JEANNE() })).s, 405);
  assert.equal((await lc('POST', '/api/discord/link', { tok: JEANNE(), raw: '{}', hd: { 'Content-Type': 'text/plain' } })).s, 415);
  assert.equal((await lc('GET', '/api/discord/me')).s, 401); assert.equal((await lc('POST', '/api/discord/me', { tok: JEANNE(), body: {} })).s, 405); assert.equal((await lc('GET', '/api/discord/autre', { tok: JEANNE() })).s, 404);
  assert.deepEqual((await lc('GET', '/api/discord/me', { tok: JEANNE() })).o, { linked: false }, 'pas encore lié');

  const au = await linkUrl(JEANNE()), qs = Object.fromEntries(au.searchParams);
  assert.equal(au.origin + au.pathname, 'https://discord.com/oauth2/authorize');
  assert.deepEqual([qs.response_type, qs.client_id, qs.scope, qs.prompt, qs.redirect_uri], ['code', OA.cid, 'identify', 'consent', BASE + '/api/discord/callback'], 'portée identify seulement, consentement demandé, retour sur l\'origine du serveur local');
  assert.match(qs.state, /^[0-9a-f]{64}\.[0-9a-z]+\.[\w-]{16}\.[\w-]{32}$/, 'state : empreinte du compte, expiration, nonce, signature');
  assert.ok(!au.href.includes('uid-jeanne') && !au.href.includes(OA.secret), 'ni UID ni secret dans l\'adresse');
  const st1 = qs.state;
  OA.codes.set('code-j1', U.jeanne);
  r = await back('code-j1', st1);
  assert.equal(r.s, 200, r.t); assert.match(r.h.get('content-type'), /^text\/html/); assert.equal(r.h.get('content-language'), 'fr');
  assert.match(r.t, /<h1>Compte Discord lié<\/h1>/); assert.match(r.t, /Tu peux revenir dans l'appli\./); assert.match(r.t, /pas encore sur le serveur/);
  assert.match(r.t, /href="https:\/\/discord\.gg\/TTwrP94agb"/, 'pas membre : lien d\'invitation'); assert.ok(r.t.includes(`href="${BASE}/"`), 'serveur local : retour sur son origine');
  const csp = r.h.get('content-security-policy');
  assert.match(csp, /^default-src 'none'; style-src 'sha256-[\w+/=]+'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'$/, 'CSP stricte : ' + csp);
  assert.doesNotMatch(r.t, /<script|\son\w+=/i, 'aucun script'); const css = /<style>([\s\S]*?)<\/style>/.exec(r.t)[1];
  assert.ok(csp.includes(`'sha256-${createHash('sha256').update(css).digest('base64')}'`), 'style permis par son empreinte');
  assert.deepEqual([r.h.get('cache-control'), r.h.get('referrer-policy'), r.h.get('x-frame-options')], ['no-store', 'no-referrer', 'DENY']); assert.match(r.h.get('x-robots-tag'), /noindex/);
  assert.equal(OA.redirs.at(-1), BASE + '/api/discord/callback', 'même redirect_uri à l\'échange du code');
  assert.equal(OA.tokens.size, 0, 'jeton d\'accès révoqué tout de suite'); assert.ok(OA.revoked.length === 1 && OA.revoked[0].startsWith('acc-tok-'));
  const ex = OA.reqs.filter(x => x.p === '/oauth2/token');
  assert.ok(ex.length === 1 && /^application\/x-www-form-urlencoded/.test(ex[0].ct) && ex[0].auth === '', 'échange : formulaire, sans le jeton du bot');
  assert.ok(OA.reqs.filter(x => x.p === '/users/@me').every(x => /^Bearer acc-tok-/.test(x.auth)), '/users/@me avec le jeton de l\'utilisateur');
  assert.ok(OA.reqs.every(x => x.p !== '/users/@me' ? true : !x.body.includes(OA.secret)) && OA.reqs.filter(x => x.body.includes(OA.secret)).every(x => x.p.startsWith('/oauth2/token')), 'secret envoyé seulement à /oauth2/token');
  assert.ok(D.calls.includes(`GET /guilds/${G}/members/${U.jeanne.id}`), 'adhésion vérifiée par le bot');
  let L = LINKS(), keys = Object.keys(L);
  assert.equal(keys.length, 1); assert.match(keys[0], /^[0-9a-f]{64}$/, 'gardé sous l\'empreinte du compte');
  assert.deepEqual({ ...L[keys[0]], at: 0 }, { id: U.jeanne.id, name: 'Jeanne', member: false, at: 0 }); assert.ok(L[keys[0]].at > 0);
  assert.ok(!existsSync(join(process.env.ADMIN_DIR, 'discord-links.json.tmp')), 'écriture atomique');
  r = await lc('GET', '/api/discord/me', { tok: JEANNE() }); assert.deepEqual(r.o, { linked: true, name: 'Jeanne', member: false }, 'pseudo seulement, jamais l\'id Discord');
  ok('liaison : POST /api/discord/link (compte exigé : 401, jeton faux, expiré, 405, 415) → adresse d\'autorisation (identify, consent, state signé, redirect_uri) ; retour : code échangé (formulaire, secret), /users/@me (Bearer), jeton révoqué, adhésion par le bot, gardé sous l\'empreinte (atomique) ; page HTML en français, CSP stricte sans script ; /me : pseudo et adhésion');

  OA.codes.set('code-j2', U.paul);
  r = await back('code-j2', st1, 'en-US,en;q=0.9'); assert.equal(r.s, 400, 'state rejoué'); assert.match(r.t, /<h1>Link expired<\/h1>/); assert.equal(r.h.get('content-language'), 'en'); assert.ok(OA.codes.has('code-j2'), 'code jamais échangé');
  const [h, ex1, n1, s1] = st1.split('.'), flip = c => (c === 'A' ? 'B' : 'A');
  const forged = [[h, ex1, n1, flip(s1[0]) + s1.slice(1)], [createHash('sha256').update('uid-paul').digest('hex'), ex1, n1, s1], [h, (parseInt(ex1, 36) + 3600e3).toString(36), n1, s1], [h, ex1, flip(n1[0]) + n1.slice(1), s1]].map(x => x.join('.'));
  for (const s of [...forged, '', 'abc', st1 + '.x', 'a'.repeat(5000)]) { r = await back('code-j2', s); assert.equal(r.s, 400, 'state falsifié : ' + s.slice(0, 40)); assert.match(r.t, /Lien expiré/); }
  r = await back('code-j2', null); assert.equal(r.s, 400, 'sans state');
  assert.ok(OA.codes.has('code-j2') && OA.reqs.filter(x => x.p === '/oauth2/token').length === 1, 'state falsifié : rien demandé à Discord');
  assert.deepEqual(Object.keys(LINKS()), keys, 'rien de gardé');
  ok('state rejoué, falsifié (signature, autre compte, expiration ou nonce changés, tronqué, vide, absent) → 400 « Lien expiré » (anglais selon Accept-Language), code jamais échangé, rien de gardé');

  const st2 = (await linkUrl(JEANNE())).searchParams.get('state');
  r = await lc('GET', '/api/discord/callback?' + new URLSearchParams({ error: 'access_denied', error_description: 'The resource owner or authorization server denied the request', state: st2 }), { hd: { 'accept-language': 'fr' } });
  assert.equal(r.s, 200); assert.match(r.t, /<h1>Liaison annulée<\/h1>/); assert.match(r.t, /rien n'a été gardé/); assert.doesNotMatch(r.t, /discord\.gg/);
  r = await back('code-j2', st2); assert.equal(r.s, 400, 'state d\'un refus : consommé');
  const st3 = (await linkUrl(JEANNE())).searchParams.get('state');
  r = await back('code-inconnu', st3); assert.equal(r.s, 400); assert.match(r.t, /Liaison impossible/, 'code refusé par Discord');
  const st4 = (await linkUrl(JEANNE())).searchParams.get('state'); OA.down = 2;
  r = await back('code-j2', st4); assert.equal(r.s, 502); assert.match(r.t, /Discord injoignable/); OA.down = 0;
  assert.deepEqual(LINKS()[keys[0]].id, U.jeanne.id, 'refus, code refusé, panne : liaison d\'avant intacte');
  ok('refus de l\'utilisateur (error=access_denied) : page « Liaison annulée », rien de gardé, state consommé ; code refusé (400) ; Discord en panne (502)');

  OA.members.add(U.jeanne.id); const nm = () => D.calls.filter(c => c === `GET /guilds/${G}/members/${U.jeanne.id}`).length, m0 = nm();
  r = await lc('GET', '/api/discord/me', { tok: JEANNE() }); assert.equal(r.o.member, false, 'pas membre il y a moins de 10 min : pas revérifié'); assert.equal(nm(), m0);
  const PAUL = () => F.jwt('uid-paul-02', 3600); OA.members.add(U.paul.id); OA.codes.set('code-p1', U.paul);
  r = await back('code-p1', (await linkUrl(PAUL())).searchParams.get('state'));
  assert.equal(r.s, 200); assert.match(r.t, /Tu es bien sur le serveur Mana Orbit/); assert.doesNotMatch(r.t, /discord\.gg/, 'membre : pas d\'invitation');
  r = await lc('GET', '/api/discord/me', { tok: PAUL() }); assert.deepEqual(r.o, { linked: true, name: 'paul.m', member: true }, 'sans global_name : username');
  r = await lc('POST', '/api/discord/unlink', { tok: JEANNE(), body: {} }); assert.deepEqual([r.s, r.o], [200, { ok: true }]);
  assert.deepEqual((await lc('GET', '/api/discord/me', { tok: JEANNE() })).o, { linked: false }, 'délié : oublié');
  assert.deepEqual(Object.values(LINKS()).map(x => x.id), [U.paul.id], 'effacé du disque');
  assert.deepEqual((await lc('POST', '/api/discord/unlink', { tok: JEANNE(), body: {} })).o, { ok: true }, 'délier deux fois : ok');
  assert.equal((await lc('POST', '/api/discord/unlink', { body: {} })).s, 401);
  await stop(P); P = await start(LENV, 19802); BASE = P.url;
  assert.deepEqual((await lc('GET', '/api/discord/me', { tok: PAUL() })).o, { linked: true, name: 'paul.m', member: true }, 'relu après un redémarrage');
  ok('membre : page sans invitation, /me member true ; pas membre : revérifié au plus toutes les 10 min ; délier : oublié (disque compris), sans compte 401 ; liaisons relues au redémarrage');

  const net = '198.51.100.200'; let rr;
  for (let i = 0; i < 21; i++) rr = await lc('POST', '/api/discord/link', { tok: PAUL(), body: {}, ip: net });
  assert.equal(rr.s, 429, 'link : 20 par heure et par réseau');
  const net2 = '198.51.100.201';
  for (let i = 0; i < 31; i++) rr = await back('x', 'y', 'fr', net2);
  assert.equal(rr.s, 429, 'callback : 30 par heure et par réseau'); assert.match(rr.t, /Trop d'essais/);
  const all = seen.join('\n') + procs.slice(P0).map(p => p.log()).join('');
  for (const x of [OA.secret, 'uid-jeanne', 'uid-paul', U.jeanne.id, U.paul.id, 'acc-tok-', 'ref-tok-', TOKEN]) assert.ok(!all.includes(x), 'ni secret, ni UID, ni id Discord, ni jeton dans les réponses et le journal : ' + x);
  assert.ok(OA.reqs.every(x => x.ua.startsWith('DiscordBot (')), 'User-Agent DiscordBot');
  await stop(P);
  P = await start({ ...LENV, DISCORD_REDIRECT_URI: 'https://manaorbit.app/api/discord/callback' }, 19802); BASE = P.url;
  const au2 = await linkUrl(PAUL()); assert.equal(au2.searchParams.get('redirect_uri'), 'https://manaorbit.app/api/discord/callback', 'DISCORD_REDIRECT_URI');
  OA.codes.set('code-p2', U.paul); r = await back('code-p2', au2.searchParams.get('state'));
  assert.equal(r.s, 200); assert.ok(r.t.includes('href="https://manaorbit.app/"'), 'lien « Revenir dans l\'appli » : https://manaorbit.app/'); assert.equal(OA.redirs.at(-1), 'https://manaorbit.app/api/discord/callback');
  await stop(P);
  ok('budgets (link 20/h, callback 30/h par réseau) ; secret, UID, id Discord et jetons jamais dans une réponse ni le journal ; DISCORD_REDIRECT_URI → retour et lien https://manaorbit.app/');
}

/* ── 7) Liaison : expiration du state et revérifications (discord-srv.mjs seul, horloge injectée) ────────────────────────────────── */
{
  let t = Date.now(); const logs = [], dir = mkdtempSync(join(tmpdir(), 'dsclink-'));
  const jsonR = (res, s, o, h = {}) => { res.writeHead(s, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(o)); };
  const readB = req => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
  const bot = discordMake({ token: TOKEN, api: DAPI, guild: G, clientId: OA.cid, clientSecret: OA.secret, now: () => t, dir, json: jsonR, readBody: readB, verify: async tok => ({ uid: tok }),
    amTag: uid => createHash('sha256').update(uid).digest('hex'), log: { log: m => logs.push(m), warn: m => logs.push(m) }, sleep: () => Promise.resolve(), redirect: 'https://manaorbit.app/api/discord/callback' });
  const s2 = http.createServer((req, res) => { const u = new URL(req.url, 'http://x'); bot.link(req, res, u.pathname.replace(/^\/api\/discord\//, ''), u); });
  await new Promise(r => s2.listen(0, '127.0.0.1', r)); const B2 = `http://127.0.0.1:${s2.address().port}`;
  const go = async (m, p, tok) => { const r = await fetch(B2 + p, { method: m, headers: { ...(tok ? { 'x-firebase-token': tok } : {}), ...(m === 'POST' ? { 'content-type': 'application/json' } : {}) }, body: m === 'POST' ? '{}' : undefined }); const tx = await r.text(); let o = null; try { o = JSON.parse(tx); } catch { /* page */ } return { s: r.status, o, t: tx }; };
  const stOf = async tok => new URL((await go('POST', '/api/discord/link', tok)).o.url).searchParams.get('state');
  const zoe = { id: '940000000000000009', username: 'zoe', global_name: 'Zoé ✨' }, nm = () => D.calls.filter(c => c === `GET /guilds/${G}/members/${zoe.id}`).length;
  let st = await stOf('uid-zoe'); t += 10 * 60e3 + 1000; OA.codes.set('code-z0', zoe);
  let r = await go('GET', '/api/discord/callback?code=code-z0&state=' + st); assert.equal(r.s, 400, 'state de plus de 10 min : expiré'); assert.match(r.t, /Link expired/);
  st = await stOf('uid-zoe'); t += 9 * 60e3; r = await go('GET', '/api/discord/callback?code=code-z0&state=' + st); assert.equal(r.s, 200, '9 min : encore bon'); assert.match(r.t, /not on the Mana Orbit server yet/);
  assert.deepEqual((await go('GET', '/api/discord/me', 'uid-zoe')).o, { linked: true, name: 'Zoé ✨', member: false });
  OA.members.add(zoe.id); const c0 = nm();
  t += 9 * 60e3; assert.equal((await go('GET', '/api/discord/me', 'uid-zoe')).o.member, false, '9 min : pas revérifié'); assert.equal(nm(), c0);
  t += 2 * 60e3; assert.equal((await go('GET', '/api/discord/me', 'uid-zoe')).o.member, true, 'plus de 10 min : revérifié, a rejoint'); assert.equal(nm(), c0 + 1);
  await Promise.all([1, 2, 3].map(() => go('GET', '/api/discord/me', 'uid-zoe'))); assert.equal(nm(), c0 + 1, 'membre : pas relu dans la journée');
  OA.members.delete(zoe.id); t += 23 * 3600e3; assert.equal((await go('GET', '/api/discord/me', 'uid-zoe')).o.member, true, '23 h : gardé'); assert.equal(nm(), c0 + 1);
  t += 2 * 3600e3; const all3 = await Promise.all([1, 2, 3].map(() => go('GET', '/api/discord/me', 'uid-zoe')));
  assert.deepEqual(all3.map(x => x.o.member), [false, false, false], 'plus de 24 h : revérifié, parti'); assert.equal(nm(), c0 + 2, 'une seule lecture pour trois demandes');
  OA.members.add(zoe.id); D.down = 99; t += 11 * 60e3;
  r = await go('GET', '/api/discord/me', 'uid-zoe'); assert.deepEqual([r.s, r.o.member], [200, false], 'Discord en panne : statut gardé'); D.down = 0;
  r = await go('GET', '/api/discord/me', 'uid-zoe'); assert.equal(r.o.member, false, 'panne : nouvel essai après 1 min seulement');
  t += 61e3; r = await go('GET', '/api/discord/me', 'uid-zoe'); assert.equal(r.o.member, true, 'puis relu');
  assert.ok(logs.some(m => /devenu membre/.test(m)) && logs.every(m => !m.includes(zoe.id) && !m.includes('uid-zoe') && !m.includes(OA.secret)), 'journal sans id ni UID ni secret');
  assert.equal(discordMake({ token: TOKEN, api: DAPI, clientId: OA.cid, clientSecret: '' }).linkOn, false); assert.equal(discordMake({ token: '', api: DAPI, clientId: OA.cid, clientSecret: 'x' }).linkOn, false);
  assert.equal(discordMake({ token: TOKEN, api: DAPI, clientId: 'pas-un-id', clientSecret: 'x' }).linkOn, false); assert.equal(discordMake({ token: TOKEN, off: true, api: DAPI, clientId: OA.cid, clientSecret: 'x' }).linkOn, false);
  s2.close();
  ok('state expiré après 10 min ; lié pas membre : revérifié après 10 min (a rejoint) ; membre : gardé 24 h, puis revérifié (parti), une lecture pour plusieurs demandes ; Discord en panne : statut gardé, nouvel essai après 1 min ; linkOn faux sans secret, sans bot, id invalide, DISCORD=0');
}
console.log('OK test-discord-srv');
process.exit(0);
