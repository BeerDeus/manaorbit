// Fils « Aide et avis » du bot Discord (discord-forum.mjs, branché dans discord-srv.mjs et proxy.mjs) contre un faux Discord HTTP (aucun accès réseau) et le faux
// Firebase de amis-fakes.mjs (jetons, Firestore, FCM) : ping de l'équipe (rôles 👑 Créateur, Admin, Modo trouvés par leur nom utile, rôle géré ou au nom voisin
// ignoré, allowed_mentions.roles exact, DISCORD_STAFF_ROLES), un seul fil par envoi (même nonce : le fil déjà créé, dup ; deux envois simultanés : un seul fil ;
// échec puis nouvel essai : créé ; sans nonce : même réseau ou compte, même type, titre et texte pliés ; 30 min), titres proches (« 🔁 Peut-être lié à », 3 au
// plus, fils ouverts des trois forums seulement, aucun ping, la réponse n'attend pas), auteur prévenu (étiquette de l'équipe ajoutée, réponse d'un autre, fil
// fermé ; panneau /admin tout de suite, relève pour Discord ; une notification regroupée, une seule fois ; fermeture automatique et étiquette ordinaire : rien ;
// français, anglais ; fils suivis gardés après un redémarrage, oubliés à la suppression du fil et du compte). Ports 19861–19862.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { startFakes, tag } from './amis-fakes.mjs';
import { forumMake, fbfPrep, fbfSim, fbfNote } from '../discord-forum.mjs';

const ok = m => console.log('✓ ' + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 6000) => { for (let t = 0; t < ms && !fn(); t += 50) await sleep(50); return fn(); };
const TOKEN = 'jeton-du-bot-SECRET-forum-0123', ADMIN = 'admin@example.org';
const G = '910000000000000001', BOT = '910000000000000002';
const R = { crea: '920000000000000011', admin: '920000000000000012', modo: '920000000000000013', modoFr: '920000000000000014', equipe: '920000000000000015', support: '920000000000000016', bot: '920000000000000017' };
const C = { general: '930000000000000005', bugs: '930000000000000008', idees: '930000000000000009', aide: '930000000000000010' };
const tagsOf = (base, list) => list.map(([name, moderated], i) => ({ id: String(base + i), name, moderated: !!moderated, emoji_name: null }));
const BUG_TAGS = tagsOf(800, [['Scan'], ['Prix'], ['Autre'], ['Android'], ['Site'], ['Confirmé', 1], ['Prochaine version', 1], ['Corrigé', 1], ['Pas un bug', 1], ['Doublon', 1]]);
const TG = n => BUG_TAGS.find(t => t.name === n).id;
const U = { paul: { id: '940000000000000002', username: 'paul.m', global_name: 'Paul' }, jeanne: { id: '940000000000000001', username: 'jeanne_42', global_name: 'Jeanne' }, bot: { id: BOT, username: 'Mana Orbit', bot: true }, other: { id: '940000000000000009', username: 'tickets', bot: true } };
const D = {
  roles: [
    { id: G, name: '@everyone', position: 0, permissions: String(1n << 10n | 1n << 11n), managed: false },
    { id: R.crea, name: '👑 Créateur', position: 9, permissions: '0', managed: false }, { id: R.admin, name: 'ADMIN', position: 8, permissions: '8', managed: false },
    { id: R.modo, name: '🛡️ Modo', position: 7, permissions: '0', managed: false }, { id: R.modoFr, name: 'Modo FR', position: 6, permissions: '0', managed: false },
    { id: R.equipe, name: 'Équipe', position: 5, permissions: '0', managed: false }, { id: R.support, name: 'Support', position: 4, permissions: '0', managed: true, tags: { bot_id: '1' } },      // rôle d'un bot de tickets : jamais pingé
    { id: R.bot, name: 'Mana Orbit', position: 10, permissions: String(1n << 3n), managed: true, tags: { bot_id: BOT } },
  ],
  channels: [
    { id: C.general, name: '💬・général', type: 0, position: 0 },
    { id: C.bugs, name: '🐞・bugs', type: 15, position: 1, flags: 16, available_tags: BUG_TAGS },
    { id: C.idees, name: '💡・idées', type: 15, position: 2, available_tags: tagsOf(850, [['Envisagé', 1], ['Prévu', 1], ['Fait', 1], ['Pas pour l\'instant', 1]]) },
    { id: C.aide, name: '🆘・aide', type: 15, position: 3, available_tags: tagsOf(870, [['Scan'], ['Autre']]) },
  ],
  th: new Map(), msgs: new Map(), posts: [], calls: [], n: 5000, slow: 0, slowAct: 0, down: 0,
};
const EPOCH = 1420070400000, snow = (ms, n = 0) => String((BigInt(Math.floor(ms) - EPOCH) << 22n) + BigInt(n)), nid = () => snow(Date.now(), ++D.n & 4095), iso = ms => new Date(ms).toISOString();
const snowMs = id => Number(BigInt(id) >> 22n) + EPOCH;
/** Fil de forum (ou d'un salon) : premier message du bot, ouvert ou fermé. */
function mkThread(parent, name, { archived = false, owner = U.bot, tags = [], at = Date.now() - 3 * 86400e3 } = {}) {
  const id = snow(at, ++D.n & 4095);
  D.th.set(id, { id, type: 11, guild_id: G, parent_id: parent, name, owner_id: owner.id, applied_tags: tags, message_count: 0, last_message_id: id, thread_metadata: { archived, locked: false, archive_timestamp: iso(at), create_timestamp: iso(at), auto_archive_duration: 4320 } });
  D.msgs.set(id, [{ id, channel_id: id, type: 0, author: owner, content: name, timestamp: iso(at), mentions: [], attachments: [], embeds: [] }]);
  return id;
}
/** Message d'un membre (ou d'un bot) posté sur Discord dans un fil : rouvert s'il était fermé, comme le fait Discord. */
function say(id, author, content, type = 0) {
  const t = D.th.get(id), mid = nid(); D.msgs.get(id).push({ id: mid, channel_id: id, type, author, content, timestamp: iso(Date.now()), mentions: [], attachments: [], embeds: [] });
  t.message_count++; t.last_message_id = mid; t.thread_metadata.archived = false; return mid;
}
const srv = http.createServer((q, r) => {
  const c = []; q.on('data', d => c.push(d)); q.on('end', async () => {
    const raw = Buffer.concat(c), send = (code, o) => { r.writeHead(code, { 'content-type': 'application/json' }); r.end(o === undefined ? '' : JSON.stringify(o)); };
    const u = new URL(q.url, 'http://x'), p = u.pathname.replace(/^\/api\/v10/, ''), m = q.method; let x;
    D.calls.push(m + ' ' + p);
    if (q.headers.authorization !== 'Bot ' + TOKEN) return send(401, { message: '401: Unauthorized', code: 0 });
    if (D.down > 0 && m === 'POST') { D.down--; return send(503, { message: 'upstream connect error' }); }
    if (m === 'GET' && p === '/users/@me') return send(200, { id: BOT, username: 'Mana Orbit', bot: true });
    if (m === 'GET' && p === '/users/@me/guilds') return send(200, [{ id: G, name: 'Mana Orbit' }]);
    if (m === 'GET' && p === `/guilds/${G}/channels`) return send(200, D.channels);
    if (m === 'GET' && p === `/guilds/${G}/roles`) return send(200, D.roles);
    if (m === 'GET' && p === `/guilds/${G}/members/${BOT}`) return send(200, { user: U.bot, roles: [R.bot] });
    if ((x = /^\/guilds\/\d+\/members\/(\d+)$/.exec(p)) && m === 'GET') { const mm = [U.paul, U.jeanne].find(y => y.id === x[1]); return mm ? send(200, { user: mm, roles: [] }) : send(404, { message: 'Unknown Member', code: 10007 }); }
    if (m === 'GET' && p === `/guilds/${G}/threads/active`) { if (D.slowAct) await sleep(D.slowAct); return send(200, { threads: [...D.th.values()].filter(t => !t.thread_metadata.archived), members: [] }); }
    const body = raw.length ? JSON.parse(raw.toString()) : null;
    if ((x = /^\/channels\/(\d+)\/threads$/.exec(p)) && m === 'POST') {
      if (D.slow) await sleep(D.slow);
      const id = nid(), now = Date.now();
      D.th.set(id, { id, type: 11, guild_id: G, parent_id: x[1], name: body.name, owner_id: BOT, applied_tags: body.applied_tags || [], message_count: 0, last_message_id: id, thread_metadata: { archived: false, locked: false, archive_timestamp: iso(now), create_timestamp: iso(now), auto_archive_duration: 4320 } });
      D.msgs.set(id, [{ id, channel_id: id, type: 0, author: U.bot, content: body.message.content, timestamp: iso(now), mentions: [], attachments: [], embeds: [] }]);
      D.posts.push({ kind: 'thread', ch: x[1], id, body }); return send(201, { id, name: body.name, parent_id: x[1], type: 11 });
    }
    if ((x = /^\/channels\/(\d+)\/messages$/.exec(p)) && m === 'POST') {
      const t = D.th.get(x[1]); if (!t) return send(404, { message: 'Unknown Channel', code: 10003 });
      const id = say(x[1], U.bot, body.content); D.posts.push({ kind: 'msg', ch: x[1], id, body }); return send(200, { id, channel_id: x[1], ...body });
    }
    if ((x = /^\/channels\/(\d+)\/threads\/archived\/public$/.exec(p)) && m === 'GET') {
      const at = t => Date.parse(t.thread_metadata.archive_timestamp), all = [...D.th.values()].filter(t => t.parent_id === x[1] && t.thread_metadata.archived).sort((a, b) => at(b) - at(a)), lim = Number(u.searchParams.get('limit')) || 50;
      return send(200, { threads: all.slice(0, lim), members: [], has_more: all.length > lim });
    }
    if ((x = /^\/channels\/(\d+)\/messages\/(\d+)$/.exec(p)) && m === 'GET') { const mm = (D.msgs.get(x[1]) || []).find(y => y.id === x[2]); return mm ? send(200, mm) : send(404, { message: 'Unknown Message', code: 10008 }); }
    if ((x = /^\/channels\/(\d+)\/messages$/.exec(p)) && m === 'GET') {
      const after = u.searchParams.get('after'), all = [...(D.msgs.get(x[1]) || [])].filter(y => !after || BigInt(y.id) > BigInt(after)).reverse();
      return send(200, all.slice(0, Number(u.searchParams.get('limit')) || 50));
    }
    if ((x = /^\/channels\/(\d+)$/.exec(p))) {
      const t = D.th.get(x[1]), ch = D.channels.find(y => y.id === x[1]);
      if (m === 'GET') return t || ch ? send(200, { guild_id: G, ...(t || ch) }) : send(404, { message: 'Unknown Channel', code: 10003 });
      if (!t) return send(404, { message: 'Unknown Channel', code: 10003 });
      if (m === 'PATCH') {
        D.posts.push({ kind: 'patch', id: x[1], body });
        if (t.thread_metadata.archived && body.archived !== false) return send(400, { message: 'Thread is archived', code: 50083 });
        if (body.applied_tags !== undefined) t.applied_tags = body.applied_tags;
        if (body.archived !== undefined) { t.thread_metadata.archived = body.archived; t.thread_metadata.archive_timestamp = iso(Date.now()); }
        return send(200, t);
      }
      if (m === 'DELETE') { D.th.delete(x[1]); return send(200, t); }
    }
    return send(404, { message: 'Unknown route ' + m + ' ' + p });
  });
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const DAPI = `http://127.0.0.1:${srv.address().port}/api/v10`;
const F = await startFakes();

const procs = [];
const start = (env, port) => new Promise((resolve, reject) => {
  const c = spawn('node', ['proxy.mjs'], { env: { ...process.env, EDH_SOURCE_URL: '', PORT: String(port), ALERTS: '0', PUBDECKS: '0', BAD_KEY_DELAY_MS: '20', ADMIN_EMAILS: ADMIN, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.log = () => out; c.url = `http://127.0.0.1:${port}`;
  c.stdout.on('data', d => { out += d; if (/Mana Orbit →/.test(out)) resolve(c); }); c.stderr.on('data', d => { out += d; });
  c.on('exit', code => { if (code) reject(new Error('exit ' + code + ': ' + out)); });
  procs.push(c);
});
const stop = p => new Promise(r => { p.once('exit', r); p.kill(); });
process.on('exit', () => { for (const p of procs) try { p.kill(); } catch { /* ignore */ } F.stop(); srv.close(); });
let BASE = '', ipN = 0;
const ip = () => { const n = ++ipN; return `10.9.${(n >> 8) & 255}.${n & 255}`; };
async function call(method, path, { body, tok, ip: from = ip(), hd = {} } = {}) {
  const h = { 'x-forwarded-for': from, ...(tok ? { 'x-firebase-token': tok } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...hd };
  const r = await fetch(BASE + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await r.text(); let o = null; try { o = JSON.parse(t); } catch { /* pas du JSON */ }
  return { s: r.status, o, t };
}
const ADM = () => F.jwt('uid-admin-00', 3600, { email: ADMIN, email_verified: true });
const UID = { jeanne: 'uid-jeanne-fb01', paul: 'uid-paul-fb02' };
const FB = (x = {}) => ({ kind: 'bug', title: 'Titre par défaut', text: 'Un texte.', area: 'scan', contact: '', meta: { v: 't', plat: 'android', lang: 'fr' }, imgs: [], ...x });
const threads = () => D.posts.filter(p => p.kind === 'thread');
const msgsIn = id => D.posts.filter(p => p.kind === 'msg' && p.ch === id);
const nonce = () => randomBytes(16).toString('base64url');
const FILE = () => join(process.env.ADMIN_DIR, 'discord-feedback.json');
const tracked = () => (existsSync(FILE()) ? JSON.parse(readFileSync(FILE(), 'utf8')).list : []);

/* ── 0) Sans serveur : ressemblance des titres, texte des notifications, rôles de l'équipe, une seule fois par clé ─────────────────── */
{
  const sim = (a, b) => fbfSim(fbfPrep(a), fbfPrep(b));
  assert.ok(sim('Le scan plante avec les cartes japonaises', 'Scan : plantage sur les cartes japonaises') >= 0.6, 'mêmes mots, pluriels, accents, ponctuation');
  assert.ok(sim('Le Scan ne lit pas les CARTES', 'le scan ne lit pas les cartes !') === 1, 'casse, ponctuation');
  assert.ok(sim('Mode sombre', 'Mode clair pour la collection') < 0.6, 'un mot en commun ne suffit pas');
  assert.ok(sim('Le prix ne se charge plus', 'Scan des cartes japonaises') < 0.2, 'sans rapport');
  assert.equal(sim('Bug', 'Bug du scan'), 0, 'titre fait de mots vides (« bug ») : jamais rapproché');
  assert.ok(sim('Prices not loading', 'prices are not loading anymore') >= 0.6, 'anglais : mots vides retirés');
  assert.deepEqual(fbfNote('fr', 'Le scan', { replies: 2, tags: ['Corrigé'], close: true }), { title: 'Du nouveau sur ton avis', body: '« Le scan » : 2 réponses, marqué Corrigé, fil fermé.' });
  assert.deepEqual(fbfNote('en', 'Le scan', { replies: 1, tags: ['Corrigé', 'Prochaine version'], close: false }), { title: 'Update on your feedback', body: '“Le scan”: a reply, tagged Fixed, Next version.' });
  assert.equal(fbfNote('de', 'X', { replies: 0, tags: ['Pas un bug'], close: true }).body, '„X“: markiert als Kein Fehler, Thread geschlossen.');
  assert.equal(fbfNote('es', 'X', { replies: 1, tags: [], close: false }).body, '«X»: una respuesta.');
  assert.equal(fbfNote('it', 'X', { replies: 3, tags: ['Mon étiquette'], close: false }).body, '«X»: 3 risposte, segnato come Mon étiquette.', 'étiquette inconnue : telle quelle');
  assert.equal(fbfNote('pt', 'X', { replies: 0, tags: [], close: true }).body, '“X”: tópico fechado.');
  assert.ok([...fbfNote('fr', 'é'.repeat(200), { replies: 1, tags: [] }).body].length < 100, 'titre coupé');
  const d = { gid: G, roles: D.roles };
  assert.deepEqual(forumMake({}).staff(d), [R.crea, R.admin, R.modo], 'défaut : Créateur, Admin, Modo (emoji, casse ignorés ; Support géré par un bot, Modo FR : non)');
  assert.deepEqual(forumMake({ staff: '0' }).staff(d), [], 'DISCORD_STAFF_ROLES=0 : aucun');
  assert.deepEqual(forumMake({ staff: ' équipe , Modo FR,Inconnu' }).staff(d), [R.equipe, R.modoFr], 'liste donnée : noms pliés, rôle absent ignoré');
  let t = 0; const fx = forumMake({ now: () => t }), f = { kind: 'bug', title: 'Le Scan !', text: 'Texte' };
  assert.deepEqual(fx.keys('', '', undefined, f), [], 'ni compte, ni réseau, ni nonce : rien pour reconnaître un doublon');
  assert.deepEqual(fx.keys('a', '', undefined, f), fx.keys('a', '', undefined, { ...f, title: 'le scan' }), 'titre plié');
  assert.notDeepEqual(fx.keys('a', '', undefined, f), fx.keys('a', '', undefined, { ...f, kind: 'idea' }), 'autre type : autre envoi');
  assert.deepEqual(fx.keys('a', '', 'court', f), fx.keys('a', '', undefined, f), 'nonce mal formé : ignoré');
  let n = 0; const mk = async () => ({ url: 'u', id: String(++n) }), k = fx.keys('a', '', nonce(), f);
  assert.deepEqual(await fx.once(k, mk), { url: 'u', id: '1' }); t = 29 * 60e3; assert.deepEqual(await fx.once(k, mk), { url: 'u', id: '1', dup: true });
  t = 60 * 60e3; assert.deepEqual(await fx.once(k, mk), { url: 'u', id: '2' }, '30 min après : un nouvel envoi');
  ok('ressemblance des titres (Dice mots + trigrammes, mots vides fr/en, pluriels, accents), notifications en 6 langues (étiquettes traduites), rôles de l\'équipe par nom utile, doublons gardés 30 min');
}

const ENV = { ...F.env, DISCORD_BOT_TOKEN: TOKEN, DISCORD_API: DAPI, FEEDBACK_PER_H: '200', ADMIN_ACTIONS_PER_H: '200', DISCORD_FEEDBACK_POLL_MS: '300' };
let P = await start(ENV, 19861); BASE = P.url;

/* ── 1) Ping de l'équipe ──────────────────────────────────────────────────────────────────────────────────────────────── */
{
  const r = await call('POST', '/api/feedback', { body: FB({ title: 'Ping de l\'équipe', text: 'Bonjour @everyone <@&' + R.equipe + '> <@' + U.jeanne.id + '>', member: U.paul.id }) });
  assert.equal(r.s, 200, r.t);
  const t = threads().at(-1), msg = t.body.message;
  assert.ok(msg.content.endsWith(`\n-# 🔔 <@&${R.crea}> <@&${R.admin}> <@&${R.modo}>`), 'rôles de l\'équipe mentionnés en fin de message : ' + msg.content);
  assert.match(msg.content, new RegExp(`Signalé par <@${U.paul.id}>`), '« Signalé par » gardé');
  assert.deepEqual(msg.allowed_mentions, { parse: [], users: [U.paul.id], roles: [R.crea, R.admin, R.modo] }, 'allowed_mentions : exactement l\'équipe et le membre vérifié, rien venu du texte');
  ok('nouveau fil : 👑 Créateur, Admin, Modo mentionnés en fin de message (Support d\'un bot, Modo FR, Équipe : non), allowed_mentions.roles exact, « Signalé par » gardé, aucun ping du texte');
}

/* ── 2) Un seul fil par envoi ─────────────────────────────────────────────────────────────────────────────────────────── */
{
  const n0 = threads().length, X = ip(), N1 = nonce();
  let a = await call('POST', '/api/feedback', { ip: X, body: FB({ title: 'Envoi retenté', nonce: N1 }) });
  assert.equal(a.s, 200); assert.equal(a.o.dup, undefined);
  let b = await call('POST', '/api/feedback', { ip: X, body: FB({ title: 'Envoi retenté', nonce: N1 }) });
  assert.deepEqual(b.o, { ok: true, url: a.o.url, id: a.o.id, dup: true }, 'même nonce : le fil déjà créé');
  b = await call('POST', '/api/feedback', { ip: X, body: FB({ title: 'Envoi retenté, corrigé', nonce: N1 }) });
  assert.equal(b.o.id, a.o.id, 'même nonce, texte retouché : toujours le même envoi');
  assert.equal(threads().length, n0 + 1, 'un seul fil');
  b = await call('POST', '/api/feedback', { ip: ip(), body: FB({ title: 'Envoi retenté', nonce: N1 }) });
  assert.notEqual(b.o.id, a.o.id, 'même nonce depuis un autre réseau, sans compte : un autre envoi');
  // deux envois simultanés (réseau lent, deuxième appui) : un seul fil, le second attend le premier
  D.slow = 400; const N2 = nonce(), Y = ip();
  const [c1, c2] = await Promise.all([call('POST', '/api/feedback', { ip: Y, body: FB({ title: 'Double appui', nonce: N2 }) }), sleep(60).then(() => call('POST', '/api/feedback', { ip: Y, body: FB({ title: 'Double appui', nonce: N2 }) }))]);
  D.slow = 0;
  assert.deepEqual([c1.s, c2.s, c1.o.id === c2.o.id, !!c1.o.dup, !!c2.o.dup], [200, 200, true, false, true], 'envoi en cours : son résultat attendu');
  assert.equal(threads().filter(t => t.body.name === 'Double appui').length, 1, 'un seul fil « Double appui »');
  // échec chez Discord : rien de retenu, le nouvel essai crée le fil
  const N3 = nonce(); D.down = 2;
  a = await call('POST', '/api/feedback', { ip: X, body: FB({ title: 'Discord en panne', nonce: N3 }) }); assert.equal(a.s, 503); D.down = 0;
  a = await call('POST', '/api/feedback', { ip: X, body: FB({ title: 'Discord en panne', nonce: N3 }) }); assert.equal(a.s, 200); assert.equal(a.o.dup, undefined, 'échec puis nouvel essai : créé');
  // sans nonce (appli d'avant) : même réseau, même type, titre et texte identiques une fois pliés
  const Z = ip(), n1 = threads().length;
  a = await call('POST', '/api/feedback', { ip: Z, body: FB({ title: 'Ancienne appli : le scan plante', text: 'Il plante.\nToujours.' }) });
  b = await call('POST', '/api/feedback', { ip: Z, body: FB({ title: 'ancienne appli  le SCAN plante !', text: 'il plante toujours' }) });
  assert.deepEqual([b.s, b.o.id, b.o.dup], [200, a.o.id, true], 'sans nonce : même réseau, titre et texte pliés identiques → le même fil');
  b = await call('POST', '/api/feedback', { ip: Z, body: FB({ kind: 'idea', title: 'Ancienne appli : le scan plante', text: 'Il plante.\nToujours.' }) }); assert.equal(b.o.dup, undefined, 'autre type : nouveau fil');
  b = await call('POST', '/api/feedback', { ip: ip(), body: FB({ title: 'Ancienne appli : le scan plante', text: 'Il plante.\nToujours.' }) }); assert.equal(b.o.dup, undefined, 'autre réseau sans compte : nouveau fil');
  const tok = F.jwt('uid-yann-fb09');
  a = await call('POST', '/api/feedback', { tok, body: FB({ title: 'Même compte, deux réseaux', text: 'x' }) });
  b = await call('POST', '/api/feedback', { tok, body: FB({ title: 'Même compte, deux réseaux', text: 'x' }) });
  assert.deepEqual([b.o.id, b.o.dup], [a.o.id, true], 'même compte depuis un autre réseau : le même fil');
  assert.equal(threads().length, n1 + 4, "4 fils : ancienne appli, autre type, autre réseau, même compte");
  assert.doesNotMatch(P.log(), /uid-|Ancienne appli|SECRET/, 'journal : ni UID, ni titre, ni jeton');
  ok('doublons : même nonce → le fil déjà créé (dup), deux appuis simultanés → un seul fil, échec puis nouvel essai → créé ; sans nonce : même réseau ou compte, même type, titre et texte pliés → le même fil');
}

/* ── 3) Titres proches ────────────────────────────────────────────────────────────────────────────────────────────────── */
{
  const B1 = mkThread(C.bugs, 'Le scan plante sur les cartes japonaises'), B2 = mkThread(C.aide, 'Plantage du scan des cartes japonaises'), B3 = mkThread(C.idees, 'Cartes japonaises : le scan plante');
  const B4 = mkThread(C.bugs, 'Scan des cartes japonaises qui plante parfois'), B5 = mkThread(C.bugs, 'Le scan plante avec les cartes japonaises', { archived: true }), GEN = mkThread(C.general, 'Le scan plante avec les cartes japonaises');
  mkThread(C.bugs, 'Mode sombre');
  D.slowAct = 700; const t0 = Date.now();
  const r = await call('POST', '/api/feedback', { body: FB({ title: 'Le scan plante avec les cartes japonaises' }) });
  assert.equal(r.s, 200); assert.ok(Date.now() - t0 < 600, 'la réponse n\'attend pas la recherche des titres proches (' + (Date.now() - t0) + ' ms)');
  assert.ok(await until(() => msgsIn(r.o.id).length === 1, 4000), 'message « Peut-être lié à » posté'); D.slowAct = 0;
  const m = msgsIn(r.o.id)[0].body, ids = [...m.content.matchAll(/<#(\d+)>/g)].map(x => x[1]);
  assert.match(m.content, /^🔁 Peut-être lié à : <#\d+>( · <#\d+>){2}$/);
  assert.equal(ids.length, 3, '3 au plus'); assert.ok(ids.every(x => [B1, B2, B3, B4].includes(x)), 'fils ouverts des trois forums seulement');
  assert.ok(!ids.includes(B5) && !ids.includes(GEN) && !ids.includes(r.o.id), 'ni fil fermé, ni fil d\'un autre salon, ni lui-même');
  assert.deepEqual(m.allowed_mentions, { parse: [] }, 'aucun ping'); assert.equal(m.flags, 4096, 'silencieux');
  const u = await call('POST', '/api/feedback', { body: FB({ title: 'Mode clair pour la collection' }) });
  await sleep(700); assert.equal(msgsIn(u.o.id).length, 0, 'titre sans fil proche : rien');
  ok('titres proches : « 🔁 Peut-être lié à : <#…> · <#…> · <#…> » (3 au plus, fils ouverts des forums bugs, idées, aide, ni fermés ni d\'un autre salon), aucun ping, silencieux ; la réponse n\'attend pas');
}

/* ── 4) Auteur prévenu quand son fil avance ───────────────────────────────────────────────────────────────────────────── */
const tokJ = 'jeanne:APA91b' + randomBytes(96).toString('base64url'), tokP = 'paul:APA91b' + randomBytes(96).toString('base64url');
const dev = async (uid, l, t) => { const r = await fetch(BASE + '/api/friends/me', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-firebase-token': F.jwt(uid) }, body: JSON.stringify({ n: 'Membre', l, dev: { fcm: t } }) }); assert.equal(r.status, 200, await r.text()); };
const admin = (sub, body) => call('POST', '/api/admin/discord/' + sub, { tok: ADM(), body });
const nJ = () => F.fcmFor(tokJ), nP = () => F.fcmFor(tokP);
let TJ = '', TJ2 = '', TP = '';
{
  await dev(UID.jeanne, 'fr', tokJ); await dev(UID.paul, 'en', tokP);
  let r = await call('POST', '/api/feedback', { tok: F.jwt(UID.jeanne), body: FB({ title: 'Les prix ne se chargent plus', area: 'prix', meta: { plat: 'android', lang: 'fr' } }) });
  assert.equal(r.s, 200); TJ = r.o.id;
  await until(() => tracked().some(x => x.id === TJ));
  const x = tracked().find(y => y.id === TJ);
  assert.deepEqual([x.a, x.k, x.t, x.l, x.c, x.tags], [tag(UID.jeanne), 'bug', 'Les prix ne se chargent plus', 'fr', false, [TG('Prix'), TG('Android')]], 'fil suivi : empreinte du compte, type, titre, langue, état');
  assert.ok(!readFileSync(FILE(), 'utf8').includes('uid-'), 'jamais d\'UID dans le fichier'); assert.ok(!existsSync(FILE() + '.tmp'), 'écriture atomique');
  r = await call('POST', '/api/feedback', { body: FB({ title: 'Sans compte, rien de suivi' }) });
  await sleep(200); assert.ok(!tracked().some(y => y.id === r.o.id), 'sans compte : pas suivi');

  // panneau /admin : étiquette de l'équipe → tout de suite ; étiquette ordinaire : rien ; une seule fois malgré les relèves
  r = await admin('thread', { id: TJ, tags: [TG('Prix'), TG('Android'), TG('Confirmé')] }); assert.equal(r.s, 200, r.t);
  assert.ok(await until(() => nJ().length === 1), 'notification de l\'étiquette');
  let n = nJ()[0];
  assert.deepEqual(n.notification, { title: 'Du nouveau sur ton avis', body: '« Les prix ne se chargent plus » : marqué Confirmé.' });
  assert.equal(n.data.url, `./?avis=${TJ}&g=${G}`); assert.equal(n.android.notification.tag, 'mo-avis-' + TJ);
  await admin('thread', { id: TJ, tags: [TG('Prix'), TG('Android'), TG('Confirmé'), TG('Site')] });
  await sleep(1000); assert.equal(nJ().length, 1, 'étiquette ordinaire, relèves suivantes : rien de plus');
  // réponse du bot + fermeture : une notification regroupée ; rouvert : rien
  r = await admin('reply', { id: TJ, content: 'Merci, on regarde ça.', close: true }); assert.equal(r.s, 200, r.t);
  assert.ok(await until(() => nJ().length === 2)); assert.equal(nJ()[1].notification.body, '« Les prix ne se chargent plus » : une réponse, fil fermé.');
  await admin('thread', { id: TJ, archived: false }); await sleep(1000); assert.equal(nJ().length, 2, 'rouvert, relèves : rien de plus');
  ok('panneau /admin : étiquette de l\'équipe (Confirmé) → « Du nouveau sur ton avis » tout de suite (./?avis=<fil>&g=<serveur>, tag par fil) ; étiquette ordinaire, réouverture : rien ; réponse + fermeture : une seule notification ; jamais deux fois');

  // sur Discord : deux réponses d'un membre entre deux relèves → une notification « 2 réponses » ; bot, système : rien
  say(TJ, U.paul, 'Pareil chez moi'); say(TJ, U.paul, 'Et sur le site aussi');
  assert.ok(await until(() => nJ().length === 3)); assert.equal(nJ()[2].notification.body, '« Les prix ne se chargent plus » : 2 réponses.');
  say(TJ, U.other, 'Ticket ouvert'); say(TJ, U.paul, '', 18);
  await sleep(1000); assert.equal(nJ().length, 3, 'message d\'un bot, message système : rien');
  // étiquette de l'équipe et fermeture faites sur Discord : regroupées
  const t = D.th.get(TJ); t.applied_tags = [...t.applied_tags, TG('Corrigé')]; t.thread_metadata.archived = true; t.thread_metadata.archive_timestamp = iso(Date.now());
  assert.ok(await until(() => nJ().length === 4)); assert.equal(nJ()[3].notification.body, '« Les prix ne se chargent plus » : marqué Corrigé, fil fermé.');
  await sleep(1000); assert.equal(nJ().length, 4, 'une seule fois');
  ok('relève : réponses d\'un membre sur Discord regroupées (« 2 réponses »), bots et messages système ignorés ; étiquette Corrigé + fermeture faites sur Discord : une notification regroupée, une seule fois');

  // le membre qui a signalé répond lui-même : rien ; fermeture automatique (inactivité) : rien
  r = await call('POST', '/api/feedback', { tok: F.jwt(UID.jeanne), body: FB({ title: 'Le classement ne s\'affiche pas', member: U.jeanne.id }) }); TJ2 = r.o.id;
  await until(() => tracked().some(y => y.id === TJ2));
  say(TJ2, U.jeanne, 'Toujours là'); await sleep(1000); assert.equal(nJ().length, 4, 'réponse de l\'auteur lui-même (membre vérifié) : rien');
  const t2 = D.th.get(TJ2); t2.thread_metadata.archived = true; t2.thread_metadata.archive_timestamp = iso(snowMs(t2.last_message_id) + 4320 * 60e3);
  await sleep(1000); assert.equal(nJ().length, 4, 'fermé par Discord faute d\'activité : rien');
  assert.equal(tracked().find(y => y.id === TJ2).c, true, 'état connu : fermé');
  ok('réponse du membre qui a signalé, fermeture automatique de Discord (inactivité) : aucune notification');

  // anglais (langue de l'appareil)
  r = await call('POST', '/api/feedback', { tok: F.jwt(UID.paul), body: FB({ title: 'Prices not loading', meta: { plat: 'web', lang: 'en' } }) }); TP = r.o.id;
  await until(() => tracked().some(y => y.id === TP));
  await admin('reply', { id: TP, content: 'Thanks!' });
  assert.ok(await until(() => nP().length === 1)); assert.deepEqual(nP()[0].notification, { title: 'Update on your feedback', body: '“Prices not loading”: a reply.' });
  ok('anglais : « Update on your feedback », « “Prices not loading”: a reply. »');
}

/* ── 5) Redémarrage, fil supprimé, compte supprimé ────────────────────────────────────────────────────────────────────── */
{
  await stop(P); P = await start(ENV, 19862); BASE = P.url;
  assert.ok(tracked().some(y => y.id === TP), 'fils suivis gardés sur le disque');
  say(TP, U.jeanne, 'Same here');
  assert.ok(await until(() => nP().length === 2), 'après un redémarrage : la relève reprend'); assert.equal(nP()[1].notification.body, '“Prices not loading”: a reply.');
  let r = await admin('thread-delete', { id: TP }); assert.equal(r.s, 200, r.t);
  assert.ok(await until(() => !tracked().some(y => y.id === TP)), 'fil supprimé depuis /admin : plus suivi');
  assert.ok(tracked().some(y => y.a === tag(UID.jeanne)));
  r = await fetch(BASE + '/api/friends/me', { method: 'DELETE', headers: { 'x-firebase-token': F.jwt(UID.jeanne) } }); assert.equal(r.status, 200);
  assert.ok(!tracked().some(y => y.a === tag(UID.jeanne)), 'compte supprimé (DELETE /api/friends/me) : ses fils oubliés');
  assert.match(P.log(), /2 fils d'avis oubliés \(compte supprimé\)/);
  const before = nJ().length; say(TJ, U.paul, 'Encore ?'); await sleep(1000); assert.equal(nJ().length, before, 'plus rien pour un compte supprimé');
  assert.doesNotMatch(P.log(), /uid-|SECRET|Prices not loading|Les prix ne/, 'journal : ni UID, ni jeton, ni titre');
  ok('fils suivis gardés après un redémarrage (relève reprise), oubliés à la suppression du fil (/admin) et du compte (DELETE /api/friends/me) ; journal sans UID, jeton ni titre');
}

/* ── 6) Sans notifications (amis coupés) ni ping : DISCORD_STAFF_ROLES=0 ─────────────────────────────────────────────────── */
{
  await stop(P); P = await start({ FIREBASE_JWKS_URL: F.env.FIREBASE_JWKS_URL, DISCORD_BOT_TOKEN: TOKEN, DISCORD_API: DAPI, DISCORD_STAFF_ROLES: '0', DISCORD_FEEDBACK_POLL_MS: '300' }, 19862); BASE = P.url;
  const n0 = tracked().length;
  const r = await call('POST', '/api/feedback', { tok: F.jwt('uid-zoe-fb03'), body: FB({ title: 'Sans notifications' }) });
  assert.equal(r.s, 200); const t = threads().at(-1).body.message;
  assert.deepEqual(t.allowed_mentions, { parse: [] }, 'DISCORD_STAFF_ROLES=0 : aucun ping'); assert.doesNotMatch(t.content, /<@&/);
  await sleep(400); assert.equal(tracked().length, n0, 'amis coupés (pas de notifications) : rien de suivi');
  await stop(P);
  ok('DISCORD_STAFF_ROLES=0 : aucun ping ; sans notifications des amis : aucun fil suivi');
}
process.exit(0);
