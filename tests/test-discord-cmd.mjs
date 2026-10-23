// Commandes slash du bot Discord (discord-cmd.mjs, branché par discord-srv.mjs et proxy.mjs) contre un faux Discord HTTP (aucun accès réseau) : route coupée sans
// DISCORD_PUBLIC_KEY (ou clé mal formée : avertissement) ; enregistrement des commandes au démarrage (PUT groupé, noms et descriptions en 6 langues, appli lue
// par /applications/@me sans DISCORD_CLIENT_ID, refus de Discord → journal, le serveur continue) ; signature Ed25519 (paire de test : bonne, fausse, corps
// changé, horodatage trop vieux, en-têtes absents) ; PING → PONG ; /moi (non lié : éphémère, comment lier, anglais ; lié : niveau, Carte mystère, compteur de
// vie lu dans le faux Firestore, rien d'autre : ni UID ni empreinte ; public: true) ; /partie avec le code d'une vraie salle d'attente (/api/partie du vrai
// proxy.mjs : format, places, joueurs, bouton ?table=) ou un code inconnu, une partie commencée, trop de codes faux ; sans code (annonce, bouton ?compteur=,
// texte neutralisé, mot du filtre refusé) ; ping du rôle 🎲 LFG une fois par 30 min (puis sans ping + note éphémère par le webhook) ; réponse différée
// (dscCmdMake seul : « réfléchit… », message posé par le webhook, erreur → éphémère, compteur de vie trop lent omis). Ports 19830–19832 ; faux Firebase de amis-fakes.mjs.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { generateKeyPairSync, sign as edSign } from 'node:crypto';
import { startFakes, tag } from './amis-fakes.mjs';
import { DSC_CMDS, dscCmdMake, dscEdKey } from '../discord-cmd.mjs';
import { dlyClock, dlyAdd } from '../daily-srv.mjs';

const require = createRequire(import.meta.url);
const PG = require('../src/progress.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = m => console.log('✓ ' + m);
const until = async (fn, ms = 5000) => { for (let t = 0; t < ms && !(await fn()); t += 50) await sleep(50); return fn(); };
const TOKEN = 'jeton-du-bot-SECRET-0123456789', G = '910000000000000001', BOT = '910000000000000002', APP = '950000000000000077', CH = '930000000000000005';
const R = { lfg: '920000000000000010', team: '920000000000000001' };
const KP = generateKeyPairSync('ed25519'), PUB = KP.publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
const HASH = 'a1'.repeat(16);
const U = { jeanne: { id: '940000000000000001', username: 'jeanne_42', global_name: 'Jeanne', avatar: HASH }, paul: { id: '940000000000000002', username: 'paul.m', global_name: null, avatar: null },
  zoe: { id: '940000000000000003', username: 'zoe', global_name: 'Zoé', avatar: null } };

// Faux Discord : calls (méthode et chemin), cmds (corps des PUT de commandes), hooks (webhooks des interactions : méthode, chemin, corps), denyCmds (403 aux PUT)
const D = { calls: [], cmds: [], hooks: [], denyCmds: false, roles: [
  { id: G, name: '@everyone', position: 0, permissions: '0' }, { id: R.team, name: 'Équipe', position: 3, permissions: '0' }, { id: R.lfg, name: '🎲 LFG', position: 1, permissions: '0', mentionable: true }] };
const srv = http.createServer((q, r) => {
  const c = []; q.on('data', d => c.push(d)); q.on('end', () => {
    const send = (code, o) => { r.writeHead(code, { 'content-type': 'application/json' }); r.end(o === undefined ? '' : JSON.stringify(o)); };
    const p = new URL(q.url, 'http://x').pathname.replace(/^\/api\/v10/, ''), m = q.method, raw = Buffer.concat(c), body = raw.length ? JSON.parse(raw.toString()) : null; let x;
    D.calls.push(m + ' ' + p);
    if (q.headers.authorization !== 'Bot ' + TOKEN) return send(401, { message: '401: Unauthorized', code: 0 });
    if ((x = /^\/webhooks\/(\d+)\/([^/]+)(\/messages\/@original)?$/.exec(p))) { D.hooks.push({ m, app: x[1], tok: decodeURIComponent(x[2]), orig: !!x[3], body }); return m === 'DELETE' ? send(204) : send(200, { id: '960000000000000001', ...(body || {}) }); }
    if (m === 'GET' && p === '/applications/@me') return send(200, { id: APP, name: 'Mana Orbit' });
    if (m === 'PUT' && (x = /^\/applications\/(\d+)\/guilds\/(\d+)\/commands$/.exec(p))) {
      if (D.denyCmds) return send(403, { message: 'Missing Access', code: 50001 });
      D.cmds.push({ app: x[1], g: x[2], body }); return send(200, body.map((b, i) => ({ id: String(970000000000000000n + BigInt(i)), application_id: x[1], guild_id: x[2], ...b })));
    }
    if (m === 'GET' && p === '/users/@me') return send(200, { id: BOT, username: 'Mana Orbit', bot: true });
    if (m === 'GET' && p === '/users/@me/guilds') return send(200, [{ id: G, name: 'Mana Orbit' }]);
    if (m === 'GET' && p === `/guilds/${G}`) return send(200, { id: G, name: 'Mana Orbit' });
    if (m === 'GET' && p === `/guilds/${G}/channels`) return send(200, [{ id: CH, name: '🎲・lfg', type: 0, position: 0 }]);
    if (m === 'GET' && p === `/guilds/${G}/roles`) return send(200, D.roles);
    if (m === 'GET' && p === `/guilds/${G}/members/${BOT}`) return send(200, { user: { id: BOT, bot: true }, roles: [] });
    return send(404, { message: 'Unknown route ' + m + ' ' + p });
  });
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const DAPI = `http://127.0.0.1:${srv.address().port}/api/v10`;
const F = await startFakes();

/* Données des comptes, écrites avant le démarrage : liaison Discord (ADMIN_DIR/discord-links.json), niveau (LEVELS_FILE), badges (DAILY_DIR/stats.json),
   historique du compteur de vie (faux Firestore : parties/<empreinte>). */
const UID = { jeanne: 'uid-jeanne-cmd01', paul: 'uid-paul-cmd02', host: 'uid-host-cmd03' };
const put = (f, o) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(o)); };
put(join(process.env.ADMIN_DIR, 'discord-links.json'), { v: 1, links: { [tag(UID.jeanne)]: { id: U.jeanne.id, name: 'Jeanne', member: true, at: Date.now() }, [tag(UID.paul)]: { id: U.paul.id, name: 'paul.m', member: true, at: Date.now() } } });
put(process.env.LEVELS_FILE, { v: 1, p: { [tag(UID.jeanne)]: { x: 5000, b: 0, t: Date.now(), n: 'Jeanne', at: Date.now() } } });
const today = dlyClock(18, 'Europe/Paris').dayOf(Date.now());
put(join(process.env.DAILY_DIR, 'stats.json'), { v: 1, p: { [tag(UID.jeanne)]: { played: 12, won: 9, stage1: 1, points: 7000, top100: 4, podium: 2, first: 1, cur: 3, best: 5, last: dlyAdd(today, -1), at: {}, h: [] } } });
const game = (id, win, at) => ({ id, v: 1, date: at, duree: 900, tours: 7, format: 40, places: [{ pos: 1, nom: 'Jeanne', rang: win ? 1 : 2, ...(win ? { vainqueur: true } : {}) }, { pos: 2, nom: 'Paul', rang: win ? 2 : 1, ...(win ? {} : { vainqueur: true }) }], moi: 1, src: 'h', at });
F.fs.docs.set('parties/' + tag(UID.jeanne), { j: JSON.stringify({ v: 1, h: [game('jgame0000003', true, 3e12), game('jgame0000002', false, 2e12), game('jgame0000001', true, 1e12)] }), at: Date.now() });
const LV = PG.prgLevel(5000).lv;

const procs = [];
const start = (env, port) => new Promise((resolve, reject) => {
  const c = spawn('node', ['proxy.mjs'], { env: { ...process.env, EDH_SOURCE_URL: '', PORT: String(port), ALERTS: '0', PUBDECKS: '0', BAD_KEY_DELAY_MS: '0', DISCORD_PRESENCE: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.log = () => out; c.url = `http://127.0.0.1:${port}`;
  c.stdout.on('data', d => { out += d; if (/Mana Orbit →/.test(out)) resolve(c); }); c.stderr.on('data', d => { out += d; });
  c.on('exit', code => { if (code) reject(new Error('exit ' + code + ': ' + out)); });
  procs.push(c);
});
const stop = p => new Promise(r => { p.once('exit', r); p.kill(); });
process.on('exit', () => { for (const p of procs) try { p.kill(); } catch { /* ignore */ } F.stop(); srv.close(); });
let BASE = '', N = 0;
/** Requête de Discord, signée (o.sig : signature donnée, o.ts : horodatage, o.raw : corps envoyé à la place de celui signé, o.key : autre clé privée). */
async function post(body, o = {}) {
  const raw = JSON.stringify(body), ts = String(o.ts ?? Math.floor(Date.now() / 1000));
  const sig = o.sig ?? edSign(null, Buffer.concat([Buffer.from(ts), Buffer.from(raw)]), o.key || KP.privateKey).toString('hex');
  const h = { 'Content-Type': 'application/json', 'x-forwarded-for': '10.9.0.' + (++N % 250), ...(o.noSig ? {} : { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': ts }) };
  const r = await fetch(BASE + '/api/discord/interactions', { method: 'POST', headers: h, body: o.raw ?? raw });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* pas du JSON */ }
  return { s: r.status, o: j, t };
}
/** Interaction d'une commande (type 2) par un membre ; options : { nom: valeur }. */
const cmd = (name, options = {}, u = U.jeanne, x = {}) => ({ type: 2, id: '98' + String(++N).padStart(16, '0'), application_id: APP, token: 'aW50ZXJhY3Rpb246' + 'x'.repeat(60) + N, guild_id: G, channel_id: CH, locale: 'fr', guild_locale: 'fr', version: 1,
  member: { user: u, nick: null, roles: [] }, data: { id: '970000000000000000', name, type: 1, options: Object.entries(options).map(([k, v]) => ({ name: k, type: typeof v === 'boolean' ? 5 : 3, value: v })) }, ...x });
const noSecrets = (o, what) => { const j = JSON.stringify(o); for (const k of Object.keys(UID)) assert.ok(!j.includes(UID[k]) && !j.includes(tag(UID[k])), what + ' : ni UID ni empreinte'); assert.ok(!j.includes(TOKEN), what + ' : pas le jeton du bot'); };

/* ── 0) Sans DISCORD_PUBLIC_KEY, ou clé mal formée : route 404, aucune commande enregistrée ───────────────────────────────────── */
{
  const base = { DISCORD_BOT_TOKEN: TOKEN, DISCORD_API: DAPI };
  let P = await start(base, 19830); BASE = P.url;
  assert.equal((await post({ type: 1 })).s, 404, 'sans clé : 404');
  await sleep(300); assert.equal(D.cmds.length, 0, 'rien enregistré'); assert.doesNotMatch(P.log(), /commandes \/moi/);
  await stop(P);
  P = await start({ ...base, DISCORD_PUBLIC_KEY: 'pas-une-cle' }, 19830); BASE = P.url;
  assert.equal((await post({ type: 1 })).s, 404); assert.match(P.log(), /Commandes slash Discord coupées : DISCORD_PUBLIC_KEY attendue/); assert.doesNotMatch(P.log(), /pas-une-cle/);
  await stop(P);
  P = await start({ DISCORD_API: DAPI, DISCORD_PUBLIC_KEY: PUB }, 19830); BASE = P.url;
  assert.equal((await post({ type: 1 })).s, 404, 'clé sans jeton du bot : coupé');
  await stop(P);
  assert.equal(dscEdKey(PUB.toUpperCase()) !== null, true, 'clé en majuscules acceptée'); assert.equal(dscEdKey(PUB.slice(2)), null); assert.equal(dscEdKey('zz'.repeat(32)), null);
  ok('sans DISCORD_PUBLIC_KEY (ou mal formée : avertissement sans la valeur, ou sans jeton du bot) : /api/discord/interactions 404, aucune commande enregistrée');
}

/* ── 1) Enregistrement : sans DISCORD_CLIENT_ID (application lue), refus de Discord (journal, le reste continue) ───────────────── */
{
  const P = await start({ DISCORD_BOT_TOKEN: TOKEN, DISCORD_API: DAPI, DISCORD_PUBLIC_KEY: PUB }, 19831); BASE = P.url;
  assert.ok(await until(() => D.cmds.length === 1 && /enregistrées sur le serveur/.test(P.log())), 'commandes enregistrées : ' + P.log());
  assert.ok(D.calls.includes('GET /applications/@me'), 'application lue avec le jeton du bot');
  assert.deepEqual([D.cmds[0].app, D.cmds[0].g], [APP, G]); assert.deepEqual(D.cmds[0].body, DSC_CMDS, 'liste entière (écrasement groupé)');
  assert.match(P.log(), /Discord : commandes \/moi et \/partie enregistrées sur le serveur \(2\)/); assert.match(P.log(), /Bot Discord : .*commandes \/moi et \/partie/);
  await stop(P);
  D.denyCmds = true; D.calls.length = 0;
  const Q = await start({ DISCORD_BOT_TOKEN: TOKEN, DISCORD_API: DAPI, DISCORD_PUBLIC_KEY: PUB, DISCORD_CLIENT_ID: APP }, 19831); BASE = Q.url;
  assert.ok(await until(() => /commandes slash non enregistrées/.test(Q.log())), Q.log());
  assert.match(Q.log(), /Discord : commandes slash non enregistrées \(Discord a refusé \(HTTP 403 : Missing Access\)\) : réinviter le bot avec la portée applications\.commands/);
  assert.ok(!D.calls.includes('GET /applications/@me'), 'DISCORD_CLIENT_ID : application connue');
  assert.deepEqual((await post({ type: 1 })).o, { type: 1 }, 'le reste continue');
  assert.ok(!Q.log().includes(TOKEN)); await stop(Q); D.denyCmds = false;
  // noms et descriptions localisés
  for (const c of DSC_CMDS) {
    assert.deepEqual(Object.keys(c.name_localizations), ['fr', 'en-US', 'de', 'es-ES', 'it', 'pt-BR']); assert.deepEqual(Object.keys(c.description_localizations), ['fr', 'en-US', 'de', 'es-ES', 'it', 'pt-BR']);
    for (const v of [c.name, ...Object.values(c.name_localizations), ...c.options.flatMap(x => [x.name, ...Object.values(x.name_localizations)])]) assert.match(v, /^[-_\p{Ll}\p{N}]{1,32}$/u, 'nom de commande valable : ' + v);
    for (const v of [c.description, ...Object.values(c.description_localizations), ...c.options.flatMap(x => [x.description, ...Object.values(x.description_localizations)])]) assert.ok(v.length >= 1 && v.length <= 100, 'description de 1 à 100 caractères : ' + v);
  }
  assert.deepEqual(DSC_CMDS.map(c => [c.name, c.name_localizations['en-US'], c.options.map(x => x.name)]), [['moi', 'me', ['public']], ['partie', 'game', ['code', 'format', 'quand', 'ping']]]);
  ok('enregistrement au démarrage : PUT /applications/{app}/guilds/{g}/commands (liste entière, 6 langues, noms valables) ; application lue sans DISCORD_CLIENT_ID ; refus 403 → journal (« applications.commands »), le reste continue');
}

/* ── 2) Serveur complet : signature, PING ─────────────────────────────────────────────────────────────────────────────────────── */
const P = await start({ ...F.env, DISCORD_BOT_TOKEN: TOKEN, DISCORD_API: DAPI, DISCORD_PUBLIC_KEY: PUB, DISCORD_CLIENT_ID: APP, DAILY: '1', DAILY_FIRST_MS: '3600000', SCRYFALL_UPSTREAM: 'http://127.0.0.1:9' }, 19832); BASE = P.url;
assert.ok(await until(() => /commandes \/moi et \/partie enregistrées/.test(P.log())), P.log());
{
  let r = await post({ type: 1 }); assert.equal(r.s, 200); assert.deepEqual(r.o, { type: 1 }, 'PING → PONG');
  assert.equal((await post({ type: 1 }, { sig: 'ab'.repeat(64) })).s, 401, 'signature fausse');
  assert.equal((await post({ type: 1 }, { key: generateKeyPairSync('ed25519').privateKey })).s, 401, 'signée par une autre clé');
  assert.equal((await post({ type: 1 }, { raw: JSON.stringify({ type: 1, x: 1 }) })).s, 401, 'corps changé après signature');
  assert.equal((await post({ type: 1 }, { ts: Math.floor(Date.now() / 1000) - 600 })).s, 401, 'horodatage de 10 min : refusé');
  assert.equal((await post({ type: 1 }, { noSig: true })).s, 401, 'sans en-têtes');
  r = await post({ type: 1 }, { sig: 'zz' }); assert.equal(r.s, 401); assert.equal(r.o.error, 'bad_signature');
  assert.equal((await fetch(BASE + '/api/discord/interactions')).status, 405);
  r = await post({ type: 3, data: { custom_id: 'x' } }); assert.equal(r.s, 400, 'composant : non pris en charge');
  r = await post(cmd('inconnue')); assert.equal(r.o.type, 4); assert.equal(r.o.data.flags, 64); assert.match(r.o.data.content, /Commande inconnue/);
  ok('signature Ed25519 : bonne → 200, fausse, autre clé, corps changé, horodatage trop vieux, sans en-têtes → 401 ; PING → PONG ; composant 400 ; commande inconnue éphémère');
}

/* ── 3) /moi ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
{
  let r = await post(cmd('moi', {}, U.zoe));
  assert.equal(r.s, 200); assert.equal(r.o.type, 4); assert.equal(r.o.data.flags, 64, 'non lié : éphémère');
  assert.match(r.o.data.content, /n'est lié à aucun compte Mana Orbit/); assert.match(r.o.data.content, /Compte et réglages › Discord › Lier mon compte Discord/);
  assert.deepEqual(r.o.data.components, [{ type: 1, components: [{ type: 2, style: 5, label: 'Ouvrir Mana Orbit', url: 'https://manaorbit.app/' }] }]);
  r = await post(cmd('moi', { public: true }, U.zoe, { locale: 'en-US' }));
  assert.equal(r.o.data.flags, 64, 'non lié : éphémère même avec public'); assert.match(r.o.data.content, /Account and settings › Discord › Link my Discord account/); assert.match(r.o.data.content, /`\/me`/);

  r = await post(cmd('moi'));
  assert.equal(r.o.type, 4); assert.equal(r.o.data.flags, 64, 'éphémère par défaut'); assert.deepEqual(r.o.data.allowed_mentions, { parse: [] });
  const e = r.o.data.embeds[0];
  assert.deepEqual(e.author, { name: 'Jeanne', icon_url: `https://cdn.discordapp.com/avatars/${U.jeanne.id}/${HASH}.png?size=64` }); assert.equal(e.title, 'Profil Mana Orbit'); assert.equal(e.url, 'https://manaorbit.app/');
  assert.deepEqual(e.fields.map(f => f.name), ['Niveau', '🔮 Carte mystère', '❤️ Compteur de vie']);
  assert.equal(e.fields[0].value, `**${LV}**`, 'niveau de levels.json (courbe de progress.js)');
  assert.equal(e.fields[1].value, 'Parties jouées : **12**\nSérie en cours : **3** · meilleure : **5**\nPodiums : **2** · top 100 : **4**', 'badges vérifiés');
  assert.equal(e.fields[2].value, 'Parties : **3** · victoires : **2**', 'historique Firestore du compteur de vie');
  noSecrets(r.o, '/moi'); assert.ok(!JSON.stringify(r.o).includes('jgame'), 'ni les parties elles-mêmes');
  r = await post(cmd('moi', { public: true }, U.jeanne, { locale: 'de' }));
  assert.equal(r.o.data.flags, undefined, 'public : visible de tout le salon'); assert.deepEqual(r.o.data.embeds[0].fields.map(f => f.name), ['Level', '🔮 Mystery card', '❤️ Life counter']);
  assert.match(r.o.data.embeds[0].fields[1].value, /^Games played: \*\*12\*\*/);
  r = await post(cmd('moi', {}, U.paul));      // lié, rien joué
  assert.deepEqual(r.o.data.embeds[0].fields.map(f => f.value), ['pas encore de niveau', 'Pas encore jouée.', 'Pas encore de partie enregistrée.']);
  assert.equal(r.o.data.embeds[0].author.name, 'paul.m'); assert.equal(r.o.data.embeds[0].author.icon_url, undefined);
  assert.doesNotMatch(P.log(), new RegExp([U.jeanne.id, U.paul.id, tag(UID.jeanne)].join('|')), 'ni id Discord ni empreinte dans le journal');
  ok('/moi : non lié → éphémère, comment lier (fr, en) ; lié → niveau, Carte mystère (parties, séries, podiums, top 100), compteur de vie (parties, victoires), éphémère sauf public ; rien d\'autre du compte');
}

/* ── 4) /partie avec un code : vraie salle d'attente (/api/partie) ──────────────────────────────────────────────────────────────── */
const api = async (method, path, body, h = {}) => { const r = await fetch(BASE + '/api/partie' + path, { method, headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body) }); return { s: r.status, o: await r.json() }; };
let room;
{
  let r = await api('POST', '', { id: 'hostgame0001', n: 'Alice', pos: 1, jeu: 'standard', size: 2 }, { 'x-firebase-token': F.jwt(UID.host) });
  assert.equal(r.s, 200, JSON.stringify(r.o)); room = { c: r.o.s.c, key: r.o.key };
  r = await post(cmd('partie', { code: room.c.slice(0, 3).toLowerCase() + '-' + room.c.slice(3), quand: 'ce soir 21 h' }));
  assert.equal(r.o.type, 4); assert.equal(r.o.data.flags, undefined, 'table : message public');
  assert.equal(r.o.data.content, `🎲 **Table ouverte** par <@${U.jeanne.id}>`); assert.deepEqual(r.o.data.allowed_mentions, { parse: [], roles: [] }, 'aucun ping (pas demandé)');
  let e = r.o.data.embeds[0];
  assert.equal(e.title, '🎲 Table ouverte · ' + room.c); assert.equal(e.url, 'https://manaorbit.app/?table=' + room.c);
  assert.deepEqual(e.fields.map(f => [f.name, f.value]), [['Format', 'Standard · 20 PV'], ['Places', '1 prise · 1 libre'], ['Quand', 'ce soir 21 h'], ['Joueurs', '1. Alice (hôte)']]);
  assert.deepEqual(r.o.data.components, [{ type: 1, components: [{ type: 2, style: 5, label: 'Rejoindre', url: 'https://manaorbit.app/?table=' + room.c }] }]);
  r = await api('POST', '/join', { c: room.c, n: 'Bob_*le*' }); assert.equal(r.s, 200);      // invité sans compte
  r = await post(cmd('partie', { code: room.c, format: 'commander' }, U.jeanne, { locale: 'en-GB' }));
  e = r.o.data.embeds[0]; assert.equal(r.o.data.content, `🎲 **Open table** by <@${U.jeanne.id}>`);
  assert.deepEqual(e.fields.map(f => [f.name, f.value]), [['Format', 'Standard · 20 life'], ['Seats', '2 taken · full'], ['Players', '1. Alice (host)\n2. Bob\\_\\*le\\* (guest)']], 'format de la salle, pseudo neutralisé');
  assert.equal(r.o.data.components[0].components[0].label, 'Join');
  noSecrets(r.o, '/partie');
  // codes faux, partie commencée
  r = await post(cmd('partie', { code: 'ZZZZZZ' })); assert.equal(r.o.data.flags, 64); assert.match(r.o.data.content, /^Table introuvable/);
  r = await post(cmd('partie', { code: 'abc' }, U.jeanne, { locale: 'en-US' })); assert.equal(r.o.data.flags, 64); assert.match(r.o.data.content, /^Table not found/);
  r = await fetch(BASE + '/api/partie/op', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-partie-key': room.key }, body: JSON.stringify({ c: room.c, op: 'start' }) }); assert.equal(r.status, 200);
  r = await post(cmd('partie', { code: room.c })); assert.equal(r.o.data.flags, 64); assert.match(r.o.data.content, /déjà commencé/);
  for (let i = 0; i < 10; i++) assert.match((await post(cmd('partie', { code: 'YYYYY' + i }, U.paul))).o.data.content, /^Table introuvable/);
  r = await post(cmd('partie', { code: 'YYYYYY' }, U.paul)); assert.match(r.o.data.content, /Trop de codes faux/, '10 codes faux par heure et par membre');
  assert.match((await post(cmd('partie', { code: 'YYYYYY' }, U.zoe))).o.data.content, /^Table introuvable/, 'un autre membre : son propre budget');
  assert.equal(D.hooks.length, 0, 'aucun webhook : tout a répondu tout de suite');
  ok('/partie avec code : vraie salle (/api/partie) → « Table ouverte » publique (format, places prises / libres, joueurs du coup d\'œil, bouton ?table=) ; code inconnu, partie commencée → éphémère ; 10 codes faux par heure');
}

/* ── 5) /partie sans code, ping du rôle 🎲 LFG ─────────────────────────────────────────────────────────────────────────────────── */
{
  let r = await post(cmd('partie', { format: 'standard', quand: 'ce soir 21 h' }));
  assert.equal(r.o.data.content, `🎲 <@${U.jeanne.id}> cherche une partie de Standard ce soir 21 h`); assert.equal(r.o.data.flags, 4, 'sans aperçu des liens');
  assert.deepEqual(r.o.data.allowed_mentions, { parse: [], roles: [] });
  assert.deepEqual(r.o.data.components[0].components[0], { type: 2, style: 5, label: 'Ouvrir le compteur de vie', url: 'https://manaorbit.app/?compteur=standard' });
  r = await post(cmd('partie', {}, U.zoe, { locale: 'en-US' }));
  assert.equal(r.o.data.content, `🎲 <@${U.zoe.id}> is looking for a game`); assert.equal(r.o.data.components[0].components[0].url, 'https://manaorbit.app/?compteur=1');
  r = await post(cmd('partie', { format: 'libre', quand: '@everyone <@&' + R.team + '> [ici](https://evil.example) ' + 'x'.repeat(80) }));
  assert.ok(r.o.data.content.startsWith(`🎲 <@${U.jeanne.id}> cherche une partie de Libre \\@everyone \\<\\@&${R.team}\\> \\[ici\\]\\(https://evil.example\\)`), r.o.data.content); assert.ok(!r.o.data.content.includes("xxx"), "coupé à 60 caractères");
  assert.ok([...r.o.data.content].length < 140, 'texte borné (60 caractères)'); assert.deepEqual(r.o.data.allowed_mentions, { parse: [], roles: [] }, 'jamais le texte de l\'utilisateur');
  r = await post(cmd('partie', { quand: 'ce soir connard' })); assert.equal(r.o.data.flags, 64); assert.match(r.o.data.content, /refusé/);
  // ping : une fois par 30 min et par membre
  r = await post(cmd('partie', { format: 'commander', ping: true }));
  assert.equal(r.o.data.content, `<@&${R.lfg}> 🎲 <@${U.jeanne.id}> cherche une partie de Commander`); assert.deepEqual(r.o.data.allowed_mentions, { parse: [], roles: [R.lfg] }, 'ce rôle seulement');
  r = await post(cmd('partie', { code: room.c, ping: true }, U.paul)); assert.equal(r.o.data.flags, 64, 'erreur : pas de ping consommé');
  r = await post(cmd('partie', { ping: true }, U.paul)); assert.deepEqual(r.o.data.allowed_mentions.roles, [R.lfg], 'un autre membre : son ping');
  const hooks0 = D.hooks.length;
  r = await post(cmd('partie', { format: 'commander', ping: true, quand: 'demain' }));
  assert.equal(r.o.data.content, `🎲 <@${U.jeanne.id}> cherche une partie de Commander demain`, 'deuxième fois : posté sans ping'); assert.deepEqual(r.o.data.allowed_mentions, { parse: [], roles: [] });
  assert.ok(await until(() => D.hooks.length > hooks0), 'note de suivi');
  const h = D.hooks[D.hooks.length - 1], it = cmd('x');
  assert.equal(h.m, 'POST'); assert.equal(h.app, APP); assert.ok(h.tok.startsWith('aW50ZXJhY3Rpb246')); assert.equal(h.orig, false);
  assert.equal(h.body.flags, 64); assert.match(h.body.content, /^Annonce postée sans ping : le rôle 🎲 LFG ne peut être prévenu qu'une fois par 30 min \(encore 30 min\)\.$/); assert.deepEqual(h.body.allowed_mentions, { parse: [] });
  assert.ok(it.token && !P.log().includes(h.tok), 'jeton d\'interaction jamais dans le journal');
  D.roles = D.roles.filter(x => x.id !== R.lfg);
  ok('/partie sans code : annonce (format, quand neutralisé et borné, mot du filtre refusé, bouton ?compteur=) ; ping du rôle 🎲 LFG (allowed_mentions : ce rôle seulement), une fois par 30 min et par membre, puis sans ping + note éphémère');
}
await stop(P);

/* ── 6) dscCmdMake seul : réponse différée, erreur après le délai, compteur de vie trop lent, rôle introuvable ───────────────────── */
{
  const calls = [], logs = [];
  const fakeReq = (raw, h) => ({ method: 'POST', headers: h, body: raw });
  const mk = o => dscCmdMake({ on: true, publicKey: PUB, call: async (m, p, b) => { calls.push({ m, p, b }); return m === 'GET' ? { id: APP } : {}; }, guild: async () => ({ id: G }), load: async () => ({ gid: G, roles: [] }),
    links: async () => new Map([[tag(UID.jeanne), { id: U.jeanne.id, at: 1 }]]), line: s => String(s).replace(/\s+/g, ' ').trim(), md: s => String(s).replace(/[\\`*_~|>[\]()<@]/g, '\\$&'), fold: s => String(s || '').toLowerCase(),
    json: (res, s, b) => { res.s = s; res.b = b; res.done(); }, readBody: async req => Buffer.from(req.body), log: { log: m => logs.push(m), warn: m => logs.push(m) }, replyMs: 60, followMs: 5, ...o });
  const run = async (C, body) => {
    const raw = JSON.stringify(body), ts = String(Math.floor(Date.now() / 1000)), sig = edSign(null, Buffer.concat([Buffer.from(ts), Buffer.from(raw)]), KP.privateKey).toString('hex');
    const res = {}; const done = new Promise(r => { res.done = r; });
    C.interactions(fakeReq(raw, { 'x-signature-ed25519': sig, 'x-signature-timestamp': ts }), res); await done; return res;
  };
  let C = mk({ profile: async () => { await sleep(150); return { lv: 7, badges: [] }; }, parties: async () => { await sleep(10e3); return { n: 1, wins: 1 }; } });
  let res = await run(C, cmd('moi'));
  assert.deepEqual(res.b, { type: 5, data: { flags: 64 } }, 'trop lent : « réfléchit… » éphémère');
  assert.ok(await until(() => calls.some(c => c.m === 'PATCH'), 6000));
  const c = calls.find(x => x.m === 'PATCH');
  assert.match(c.p, /^\/webhooks\/950000000000000077\/aW50ZXJhY3Rpb246x+\d+\/messages\/@original$/); assert.equal(c.b.flags, undefined);
  assert.deepEqual(c.b.embeds[0].fields.map(f => f.name), ['Niveau', '🔮 Carte mystère'], 'compteur de vie trop lent (4 s) : omis');
  assert.ok(logs.some(l => /parties du compteur de vie omises \(trop lent\)/.test(l)));
  calls.length = 0;
  C = mk({ peek: async () => { await sleep(150); return null; } });
  res = await run(C, cmd('partie', { code: 'ABCDEF' }));
  assert.deepEqual(res.b, { type: 5 }, '/partie : « réfléchit… » public');
  assert.ok(await until(() => calls.some(x => x.m === 'POST')));
  assert.deepEqual(calls.map(x => [x.m, x.p.replace(/\/webhooks\/\d+\/[^/]+/, '/webhooks/…')]), [['DELETE', '/webhooks/…/messages/@original'], ['POST', '/webhooks/…']], 'erreur : « réfléchit… » effacé, réponse éphémère');
  assert.equal(calls[1].b.flags, 64); assert.match(calls[1].b.content, /^Table introuvable/);
  calls.length = 0;
  res = await run(mk({}), cmd('partie', { ping: true }));
  assert.deepEqual(res.b.data.allowed_mentions, { parse: [], roles: [] });
  assert.ok(await until(() => calls.length === 1)); assert.match(calls[0].b.content, /rôle 🎲 LFG introuvable/);
  assert.equal(await mk({ call: async () => { throw Object.assign(new Error('Discord injoignable'), { kind: 'down' }); } }).start(), false);
  assert.ok(logs.some(l => /commandes slash non enregistrées \(Discord injoignable\)$/.test(l)));
  assert.equal(mk({ on: false }).on, false); assert.equal(mk({ publicKey: '' }).on, false);
  ok('réponse différée : « réfléchit… » (éphémère pour /moi, public pour /partie) puis message par le webhook ; erreur → effacé + éphémère ; compteur de vie trop lent omis ; rôle introuvable : note ; échec d\'enregistrement journalisé');
}
console.log('OK test-discord-cmd');
process.exit(0);
