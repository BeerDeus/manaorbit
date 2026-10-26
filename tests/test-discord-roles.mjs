// Rôles Discord des comptes liés (discord-roles.mjs, branché dans discord-srv.mjs) contre un faux Discord HTTP (aucun accès réseau) : rôles créés par le bot au
// démarrage (noms et couleurs de src/progress.js, non mentionnables, sans permission, X-Audit-Log-Reason), jamais en double (relecture, rôle renommé retrouvé par
// son id, rôle existant retrouvé par son nom utile) ; « ✅ Compte lié » et paliers (série et Top 100 de la Carte mystère, Scanner) donnés au retour de la liaison,
// à la revérification de /api/discord/me (a rejoint après), une synchro au plus par fenêtre (rolesMs), palier qui monte remplace l'ancien ; retirés en déliant,
// quand le compte lie un autre compte Discord, quand un autre compte prend ce compte Discord ; fin de journée de la Carte mystère (rolesDay) ; sans « Gérer les
// rôles » (permissions du bot ou 403 / 50013) : une ligne au journal, une seule fois, rien ne casse ; rôle au-dessus du bot : pas géré ; journal sans id ni UID.
// Puis le vrai proxy.mjs (port 19847) : rôles créés au démarrage, compteur du scan lu dans le faux Firestore (compte de service), retirés en déliant,
// DISCORD_ROLES=0 ; et daily-srv.mjs (badgesOf, journée close → closed).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { startFakes } from './amis-fakes.mjs';
import { discordMake, DSC_PERMS } from '../server/discord-srv.mjs';
import { DSC_ROLE_DEFS, DSC_BADGES, dscTier, dscRoleName } from '../server/discord-roles.mjs';
import { dailyMake } from '../server/daily-srv.mjs';
import { createRequire } from 'node:module';

const ok = m => console.log('✓ ' + m);
const TOKEN = 'jeton-du-bot-SECRET-roles-42';
const G = '970000000000000001', BOT = '970000000000000002', BOTROLE = '970000000000000003', TEST_R = '970000000000000004';
const B = n => 1n << BigInt(n), VIEW = B(10), SEND = B(11), ROLES = B(28);
const OA = { cid: '975000000000000001', secret: 'secret-oauth-SECRET-roles', codes: new Map(), tokens: new Map() };
const U = { jeanne: { id: '980000000000000001', username: 'jeanne', global_name: 'Jeanne' }, paul: { id: '980000000000000002', username: 'paul' }, paul2: { id: '980000000000000003', username: 'paul_alt' }, zoe: { id: '980000000000000004', username: 'zoe' } };
// Faux Discord : rôles du serveur, membres (id → rôles), écritures (méthode, chemin, raison), refus à la demande
let n = 990000000000000000n;
const D = { roles: [], members: new Map(), calls: [], writes: [], denyRoles: false, denyCreate: false };
function world(perms = VIEW | SEND | ROLES) {
  D.roles = [{ id: G, name: '@everyone', position: 0, permissions: String(VIEW | SEND), color: 0 }, { id: TEST_R, name: 'Testeur', position: 1, permissions: '0', color: 0xf0b45a },
    { id: BOTROLE, name: 'Mana Orbit', position: 2, permissions: String(perms), managed: true, tags: { bot_id: BOT } }];
  D.members = new Map([[BOT, [BOTROLE]]]); D.calls = []; D.writes = []; D.denyRoles = false; D.denyCreate = false;
}
world();
const srv = http.createServer((q, r) => {
  const c = []; q.on('data', d => c.push(d)); q.on('end', () => {
    const raw = Buffer.concat(c).toString(), send = (code, o) => { r.writeHead(code, { 'content-type': 'application/json' }); r.end(o === undefined ? '' : JSON.stringify(o)); };
    const p = new URL(q.url, 'http://x').pathname.replace(/^\/api\/v10/, ''), m = q.method; let x;
    if (p.startsWith('/oauth2/') || /^Bearer /.test(q.headers.authorization || '')) {
      const f = new URLSearchParams(raw);
      if (m === 'POST' && p === '/oauth2/token') { const u = OA.codes.get(f.get('code')); if (!u) return send(400, { error: 'invalid_grant' }); OA.codes.delete(f.get('code')); const at = 'acc-' + (++n); OA.tokens.set(at, u); return send(200, { access_token: at, token_type: 'Bearer' }); }
      if (m === 'POST' && p === '/oauth2/token/revoke') return send(200, {});
      if (m === 'GET' && p === '/users/@me') { const u = OA.tokens.get((q.headers.authorization || '').slice(7)); return u ? send(200, u) : send(401, { message: '401: Unauthorized' }); }
      return send(404, { message: 'Unknown OAuth route' });
    }
    D.calls.push(m + ' ' + p);
    if (q.headers.authorization !== 'Bot ' + TOKEN) return send(401, { message: '401: Unauthorized', code: 0 });
    const body = raw ? JSON.parse(raw) : undefined, reason = decodeURIComponent(q.headers['x-audit-log-reason'] || '');
    if (m === 'GET' && p === '/users/@me') return send(200, { id: BOT, username: 'Mana Orbit', bot: true });
    if (m === 'GET' && p === '/users/@me/guilds') return send(200, [{ id: G, name: 'Mana Orbit' }]);
    if (m === 'GET' && p === `/guilds/${G}`) return send(200, { id: G, name: 'Mana Orbit' });
    if (m === 'GET' && p === `/guilds/${G}/channels`) return send(200, []);
    if (m === 'GET' && p === `/guilds/${G}/roles`) return send(200, D.roles);
    if (m === 'POST' && p === `/guilds/${G}/roles`) {
      D.writes.push({ m, p, reason, body });
      if (D.denyCreate === 'bad') return send(400, { message: 'Invalid Form Body', code: 50035 });
      if (D.denyCreate) return send(403, { message: 'Missing Permissions', code: 50013 });
      for (const ro of D.roles) if (ro.position >= 1) ro.position++;      // comme Discord : nouveau rôle tout en bas, juste au-dessus de @everyone
      const ro = { id: String(++n), position: 1, managed: false, ...body }; D.roles.push(ro); return send(200, ro);
    }
    if ((x = /^\/guilds\/\d+\/members\/(\d+)$/.exec(p)) && m === 'GET') { const rs = D.members.get(x[1]); return rs ? send(200, { user: { id: x[1] }, roles: rs }) : send(404, { message: 'Unknown Member', code: 10007 }); }
    if ((x = /^\/guilds\/\d+\/members\/(\d+)\/roles\/(\d+)$/.exec(p)) && (m === 'PUT' || m === 'DELETE')) {
      D.writes.push({ m, p, reason, user: x[1], role: x[2] });
      if (D.denyRoles) return send(403, { message: 'Missing Permissions', code: 50013 });
      if (!D.roles.some(ro => ro.id === x[2])) return send(404, { message: 'Unknown Role', code: 10011 });
      const rs = D.members.get(x[1]); if (!rs) return send(404, { message: 'Unknown Member', code: 10007 });
      if (m === 'PUT' && !rs.includes(x[2])) rs.push(x[2]); if (m === 'DELETE' && rs.includes(x[2])) rs.splice(rs.indexOf(x[2]), 1);
      return send(204);
    }
    return send(404, { message: 'Unknown route ' + m + ' ' + p });
  });
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const DAPI = `http://127.0.0.1:${srv.address().port}/api/v10`;
const tagOf = uid => createHash('sha256').update(uid).digest('hex');
const roleId = key => { const d = DSC_ROLE_DEFS.find(x => x.key === key); return (D.roles.find(r => dscRoleName(r.name) === dscRoleName(d.name)) || {}).id; };
/** Rôles gérés d'un membre (clés : linked, dy_streak:1…), triés. */
const mine = id => (D.members.get(id) || []).map(rid => { const ro = D.roles.find(r => r.id === rid); const d = ro && DSC_ROLE_DEFS.find(x => dscRoleName(x.name) === dscRoleName(ro.name)); return d ? d.key : null; }).filter(Boolean).sort();
const created = () => D.writes.filter(w => w.m === 'POST');

/* ── 0) Définitions : noms et seuils de src/progress.js, couleurs, permissions ── */
{
  const PG = createRequire(import.meta.url)('../src/progress.js');
  assert.deepEqual(DSC_BADGES.map(b => b.id), ['dy_streak', 'dy_top', 'sc_cards'], 'trois badges suivis');
  for (const b of DSC_BADGES) { const pb = PG.PRG_BADGES.find(x => x.id === b.id); assert.deepEqual(b.tiers, pb.tiers); assert.deepEqual(b.names, [pb.t, ...PG.PRG_NAMES[b.id]]); }
  assert.deepEqual(DSC_ROLE_DEFS.map(d => d.name), ['✅ Compte lié', '📅 Rituel sacré', '🥇 Panthéon', '🔍 Oracle du scan', '📅 Infatigable', '🥇 Crème de la crème', '🔍 Maître du scan', '📅 Régulier', '🥇 Élite', '🔍 Scanner chevronné', '📅 Assidu', '🥇 Top 100', '🔍 Scanner']);
  assert.equal(new Set(DSC_ROLE_DEFS.map(d => dscRoleName(d.name))).size, DSC_ROLE_DEFS.length, 'noms utiles tous différents');
  assert.equal(dscRoleName('✅ Compte LIÉ'), 'compte lie'); assert.equal(dscTier([3, 7, 30, 100], 2), -1); assert.equal(dscTier([3, 7, 30, 100], 30), 2);
  assert.equal(DSC_PERMS, 268618752n); assert.ok(DSC_PERMS & ROLES, 'Gérer les rôles (bit 28)');
  ok('rôles gérés : ✅ Compte lié puis diamant → bronze des badges série, Top 100 et Scanner (noms et seuils de progress.js) ; DSC_PERMS 268618752 (Gérer les rôles)');
}

/* ── 1) discord-srv.mjs seul (horloge injectée) ── */
let t = Date.now();
const DAILY = new Map(), PROG = new Map(), PC = { n: 0 };
const mkBot = (dir, logs, extra = {}) => discordMake({ token: TOKEN, api: DAPI, guild: G, clientId: OA.cid, clientSecret: OA.secret, now: () => t, dir, presence: false,
  json: (res, s, o, h = {}) => { res.writeHead(s, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(o)); }, readBody: req => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); }),
  verify: async tok => ({ uid: tok }), amTag: tagOf, log: { log: m => logs.push(m), warn: m => logs.push('! ' + m) }, sleep: () => Promise.resolve(), redirect: 'https://manaorbit.app/api/discord/callback',
  daily: async tag => { const v = DAILY.get(tag) || {}; return [{ id: 'played', n: 1 }, { id: 'streak', n: v.streak || 0 }, { id: 'top100', n: v.top || 0 }]; },      // comme daily-srv.mjs › badges (0 pour un compte inconnu)
  progress: async uid => { PC.n++; const sc = PROG.get(uid); return sc === undefined ? null : { c: { sc, sl_fr: 3 }, updatedAt: 1 }; }, ...extra });
const serve = async bot => {
  const s = http.createServer((req, res) => { const u = new URL(req.url, 'http://x'); bot.link(req, res, u.pathname.replace(/^\/api\/discord\//, ''), u); });
  await new Promise(r => s.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${s.address().port}`;
  const go = async (m, p, tok) => { const r = await fetch(base + p, { method: m, headers: { ...(tok ? { 'x-firebase-token': tok } : {}), ...(m === 'POST' ? { 'content-type': 'application/json' } : {}) }, body: m === 'POST' ? '{}' : undefined }); const tx = await r.text(); let o = null; try { o = JSON.parse(tx); } catch { /* page */ } return { s: r.status, o, t: tx }; };
  const link = async (uid, user, code) => { const st = new URL((await go('POST', '/api/discord/link', uid)).o.url).searchParams.get('state'); OA.codes.set(code, user); const r = await go('GET', `/api/discord/callback?code=${code}&state=${st}`); assert.equal(r.s, 200, r.t); await bot.rolesIdle(); return r; };
  return { s, go, link, me: async uid => { const r = await go('GET', '/api/discord/me', uid); await bot.rolesIdle(); return r.o; } };
};
const logs = [], dir = mkdtempSync(join(tmpdir(), 'dscroles-'));
const bot = mkBot(dir, logs), S1 = await serve(bot);
{
  assert.equal(bot.rolesOn, true);
  bot.start(); await bot.rolesIdle();
  assert.equal(created().length, 13, '13 rôles créés au démarrage');
  for (const d of DSC_ROLE_DEFS) { const ro = D.roles.find(r => r.name === d.name); assert.ok(ro, d.name); assert.equal(ro.color, d.color); assert.equal(ro.mentionable, false); assert.equal(ro.hoist, false); assert.equal(ro.permissions, '0'); assert.ok(ro.position < 15); }
  assert.ok(created().every(w => w.reason === 'Mana Orbit : rôle des comptes liés'), 'X-Audit-Log-Reason');
  assert.ok(D.roles.find(r => r.id === BOTROLE).position > Math.max(...DSC_ROLE_DEFS.map(d => D.roles.find(r => r.name === d.name).position)), 'créés sous le rôle du bot');
  const ids = JSON.parse(readFileSync(join(dir, 'discord-roles.json'), 'utf8')).ids; assert.equal(Object.keys(ids).length, 13); assert.equal(ids.linked, roleId('linked'));
  bot.start(); await bot.rolesIdle(); t += 6 * 60e3; bot.start(); await bot.rolesIdle();
  assert.equal(created().length, 13, 'relecture (5 min) : rien en double');
  D.roles.find(r => r.id === ids.linked).name = 'Lié à Mana Orbit'; D.roles.find(r => r.id === ids['sc_cards:0']).color = 0x123456;
  t += 6 * 60e3; bot.start(); await bot.rolesIdle();
  assert.equal(created().length, 13, 'rôle renommé à la main : retrouvé par son id gardé, pas recréé'); assert.equal(D.roles.find(r => r.id === ids['sc_cards:0']).color, 0x123456, 'rôle existant jamais modifié');
  D.roles.find(r => r.id === ids.linked).name = '✅ Compte lié';
  D.roles = D.roles.filter(r => r.id !== ids['dy_top:3']); t += 6 * 60e3; bot.start(); await bot.rolesIdle();
  assert.equal(created().length, 14, 'rôle supprimé à la main : recréé une fois'); assert.equal(created().at(-1).body.name, '🥇 Panthéon');
  t += 6 * 60e3; bot.start(); await bot.rolesIdle(); assert.equal(created().length, 14);
  const l2 = [], b2 = mkBot(mkdtempSync(join(tmpdir(), 'dscroles-')), l2); b2.start(); await b2.rolesIdle();
  assert.equal(created().length, 14, 'autre dossier (ids inconnus) : rôles retrouvés par leur nom, aucun créé');
  ok('rôles créés par le bot au démarrage (noms, couleurs, non mentionnables, sans permission, sous le rôle du bot, X-Audit-Log-Reason) ; jamais en double : relecture, rôle renommé (id gardé), autre dossier (nom utile) ; rôle supprimé : recréé ; existant jamais modifié');
}
const J = 'uid-jeanne-01', P = 'uid-paul-02', Z = 'uid-zoe-03';
{
  D.members.set(U.jeanne.id, [TEST_R]); DAILY.set(tagOf(J), { streak: 8, top: 0 }); PROG.set(J, 1500);
  await S1.link(J, U.jeanne, 'cj1');
  assert.deepEqual(mine(U.jeanne.id), ['dy_streak:1', 'linked', 'sc_cards:1'], 'retour de liaison : Compte lié, Régulier (série 8), Scanner chevronné (1 500)');
  assert.ok(D.members.get(U.jeanne.id).includes(TEST_R), 'autres rôles du membre intacts');
  assert.ok(D.writes.filter(w => w.m === 'PUT').every(w => w.reason === 'Mana Orbit : compte lié'), 'raison au journal d\'audit');
  const w0 = D.writes.length, pc0 = PC.n;
  assert.deepEqual(await S1.me(J), { linked: true, name: 'Jeanne', member: true }); assert.equal(D.writes.length, w0, '/me dans la fenêtre : rien'); assert.equal(PC.n, pc0, 'ni Firestore');
  DAILY.set(tagOf(J), { streak: 35, top: 2 }); PROG.set(J, 12000); t += 5 * 3600e3; await S1.me(J); assert.equal(PC.n, pc0, '5 h : pas encore');
  t += 3600e3 + 1000; await Promise.all([1, 2, 3].map(() => S1.go('GET', '/api/discord/me', J))); await bot.rolesIdle();
  assert.equal(PC.n, pc0 + 1, 'plus de 6 h : une seule synchro pour trois demandes');
  assert.deepEqual(mine(U.jeanne.id), ['dy_streak:2', 'dy_top:0', 'linked', 'sc_cards:2'], 'palier qui monte : Infatigable remplace Régulier, Maître du scan remplace Scanner chevronné, Top 100 donné');
  await S1.me(J); assert.equal(PC.n, pc0 + 1, 'fenêtre suivante : rien');
  ok('retour de liaison : Compte lié + plus haut palier (série, Top 100, Scanner) ; /me : au plus une synchro par fenêtre (6 h, une pour plusieurs demandes) ; palier qui monte remplace l\'ancien ; autres rôles intacts');
}
{
  DAILY.set(tagOf(P), { streak: 3, top: 0 }); PROG.set(P, 99);
  await S1.link(P, U.paul, 'cp1'); assert.equal(D.writes.filter(w => w.user === U.paul.id).length, 0, 'pas membre : aucun rôle');
  D.members.set(U.paul.id, []); t += 9 * 60e3; await S1.me(P); assert.deepEqual(mine(U.paul.id), [], 'revérifié après 10 min seulement');
  t += 2 * 60e3; assert.equal((await S1.me(P)).member, true); assert.deepEqual(mine(U.paul.id), ['dy_streak:0', 'linked'], 'a rejoint : Compte lié et Assidu donnés tout de suite (99 cartes : pas de Scanner)');
  ok('lié pas membre : rien ; membre après (revérification de /me) : rôles donnés tout de suite');
}
{
  D.members.set(U.paul2.id, []); await S1.link(P, U.paul2, 'cp2');
  assert.deepEqual(mine(U.paul.id), [], 'autre compte Discord lié : l\'ancien perd ses rôles'); assert.deepEqual(mine(U.paul2.id), ['dy_streak:0', 'linked']);
  assert.ok(D.writes.some(w => w.m === 'DELETE' && w.user === U.paul.id && w.reason === 'Mana Orbit : autre compte Discord lié'));
  DAILY.set(tagOf(Z), { streak: 0, top: 5 }); PROG.set(Z, 100); await S1.link(Z, U.paul2, 'cz1');
  assert.deepEqual(mine(U.paul2.id), ['dy_top:1', 'linked', 'sc_cards:0'], 'pris par un autre compte Mana Orbit : paliers recalculés (Assidu retiré)');
  assert.deepEqual(await S1.me(P), { linked: false }, 'un compte Discord, un seul compte Mana Orbit : l\'ancienne liaison est oubliée');
  assert.ok(logs.some(m => /ancienne liaison oubliée/.test(m)));
  const r = await S1.go('POST', '/api/discord/unlink', J); assert.deepEqual(r.o, { ok: true }); await bot.rolesIdle();
  assert.deepEqual(mine(U.jeanne.id), [], 'délié (ou compte supprimé : src/dsclink.js › dlWipe) : tous les rôles gérés retirés'); assert.deepEqual(D.members.get(U.jeanne.id), [TEST_R], 'Testeur gardé');
  assert.ok(D.writes.some(w => w.m === 'DELETE' && w.user === U.jeanne.id && w.reason === 'Mana Orbit : compte délié'));
  ok('autre compte Discord lié : l\'ancien perd ses rôles ; compte Discord pris par un autre compte : ancienne liaison oubliée, paliers recalculés ; délier : rôles retirés, les autres gardés');
}
{
  DAILY.set(tagOf(Z), { streak: 7, top: 21 }); t += 31 * 60e3; const pc0 = PC.n;
  assert.equal(await bot.rolesDay([tagOf(Z), tagOf(J), tagOf('uid-inconnu')]), 1, 'seulement les comptes liés et membres'); await bot.rolesIdle();
  assert.deepEqual(mine(U.paul2.id), ['dy_streak:1', 'dy_top:2', 'linked', 'sc_cards:0'], 'fin de journée : série et Top 100 à jour (fenêtre ignorée)'); assert.equal(PC.n, pc0, 'UID oublié (30 min) : dernier compteur du scan gardé');
  ok('fin de journée de la Carte mystère (rolesDay) : comptes liés et membres parmi les joueurs, synchronisés');
}
{
  D.denyRoles = true; DAILY.set(tagOf(Z), { streak: 30, top: 21 }); t += 7 * 3600e3;
  let r = await S1.go('GET', '/api/discord/me', Z); assert.equal(r.s, 200); await bot.rolesIdle();
  t += 7 * 3600e3; r = await S1.go('GET', '/api/discord/me', Z); assert.equal(r.s, 200); await bot.rolesIdle();
  assert.equal(logs.filter(m => /Gérer les rôles/.test(m)).length, 1, '403 / 50013 : une seule ligne au journal');
  assert.deepEqual(mine(U.paul2.id), ['dy_streak:1', 'dy_top:2', 'linked', 'sc_cards:0'], 'rien changé, rien cassé'); D.denyRoles = false;
  const hi = D.roles.find(r2 => r2.id === roleId('dy_streak:2')); hi.position = 50; t += 7 * 3600e3; await S1.me(Z);
  assert.ok(!mine(U.paul2.id).includes('dy_streak:2') && logs.some(m => /« 📅 Infatigable » au-dessus du rôle du bot/.test(m)), 'rôle au-dessus du bot : pas géré, signalé');
  hi.position = 1; await bot.rolesIdle();
  ok('permission refusée (403 / 50013) : une ligne au journal, une seule fois, /me répond ; rôle au-dessus du rôle du bot : laissé, signalé');
}
{
  world(VIEW | SEND); const l3 = [], b3 = mkBot(mkdtempSync(join(tmpdir(), 'dscroles-')), l3); b3.start(); await b3.rolesIdle();
  assert.equal(created().length, 0, 'sans « Gérer les rôles » : aucune création tentée'); assert.equal(l3.filter(m => /Gérer les rôles/.test(m)).length, 1);
  world(); D.denyCreate = true; const l4 = [], b4 = mkBot(mkdtempSync(join(tmpdir(), 'dscroles-')), l4), S4 = await serve(b4); b4.start(); await b4.rolesIdle();
  assert.equal(created().length, 1, '403 à la création : arrêt de la passe'); assert.equal(l4.filter(m => /Gérer les rôles/.test(m)).length, 1);
  D.members.set(U.zoe.id, []); await S4.link(Z, U.zoe, 'cz4'); assert.deepEqual(mine(U.zoe.id), [], 'rôles absents : rien donné');
  assert.deepEqual(await S4.me(Z), { linked: true, name: 'zoe', member: true }, 'la liaison marche quand même');
  assert.equal(D.writes.filter(w => w.m !== 'POST').length, 0, 'aucun PUT vers un rôle absent');
  D.denyCreate = false; t += 11 * 60e3; b4.start(); await b4.rolesIdle(); assert.equal(D.roles.length, 3 + 13, 'nouvel essai après 10 min : créés');
  t += 7 * 3600e3; await S4.me(Z); assert.deepEqual(mine(U.zoe.id), ['dy_streak:2', 'dy_top:2', 'linked', 'sc_cards:0'], 'puis donnés');
  world(); D.denyCreate = 'bad'; const l5 = [], b5 = mkBot(mkdtempSync(join(tmpdir(), 'dscroles-')), l5); b5.start(); await b5.rolesIdle(); b5.start(); await b5.rolesIdle();
  assert.equal(l5.filter(m => /pas créés \(HTTP 400, code 50035\)/.test(m)).length, 1, 'autre refus : une ligne');
  const off = discordMake({ token: TOKEN, api: DAPI, guild: G, clientId: OA.cid, clientSecret: OA.secret, roles: false }); assert.equal(off.rolesOn, false); assert.equal(off.rolesDay, null);
  assert.equal(discordMake({ token: TOKEN, api: DAPI, guild: G }).rolesOn, false, 'sans liaison : pas de rôles');
  S4.s.close();
  ok('sans « Gérer les rôles » : rien tenté, une ligne ; 403 à la création : une ligne, la liaison marche, nouvel essai après 10 min ; autre refus : une ligne ; roles: false ou sans liaison : coupé');
}
{
  const all = [...logs].join('\n');
  for (const s of [...Object.values(U).map(u => u.id), J, P, Z, TOKEN, OA.secret, G]) assert.ok(!all.includes(s), 'journal sans id, UID ni secret : ' + s.slice(0, 6));
  S1.s.close();
  ok('journal sans id Discord, UID, jeton ni secret');
}

/* ── 2) daily-srv.mjs : badges vérifiés d'un compte, journée close → closed (joueurs, sans les entraînements) ── */
{
  const dd = mkdtempSync(join(tmpdir(), 'dscroles-daily-')), ta = tagOf('uid-a'), tb = tagOf('uid-b'), tc = tagOf('uid-c'), got = [];
  writeFileSync(join(dd, 'stats.json'), JSON.stringify({ v: 1, p: { [ta]: { played: 9, won: 5, stage1: 0, points: 0, top100: 4, podium: 0, first: 0, cur: 2, best: 8, last: '2026-10-19', at: {}, h: [] } } }));
  writeFileSync(join(dd, '2026-10-20.json'), JSON.stringify({ v: 1, day: '2026-10-20', st: 'wait', card: null, plays: { [ta]: { k: 'x'.repeat(24), st: 'lost', s: 0 }, [tb]: { k: 'y'.repeat(24), st: 'win', s: 400, pr: 1, lb: false }, [tc]: { k: 'z'.repeat(24), st: 'play' } }, closed: false, at: 0 }));
  let tt = Date.parse('2026-10-20T19:00:00+02:00');
  const dl = dailyMake({ dir: dd, now: () => tt, fetch: async () => { throw new Error('hors ligne'); }, log: { log() {}, warn() {} }, closed: tags => { got.push(tags); } });
  const bs = await dl.badgesOf(ta); assert.equal(bs.find(x => x.id === 'streak').n, 8); assert.equal(bs.find(x => x.id === 'top100').n, 4);
  assert.equal((await dl.badgesOf(tagOf('inconnu'))).find(x => x.id === 'streak').n, 0, 'compte inconnu : 0');
  await dl.current(); assert.deepEqual(got, [], 'journée en cours : rien');
  tt = Date.parse('2026-10-21T19:00:00+02:00'); await dl.current(); await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(got, [[ta, tc]], 'journée close : ses joueurs, sans les entraînements');
  await dl.stop();
  ok('daily-srv.mjs : badgesOf (meilleure série, top 100 ; 0 pour un inconnu), journée close → closed(empreintes des joueurs)');
}

/* ── 3) Vrai proxy.mjs : création au démarrage, compteur du scan lu dans Firestore (compte de service), délier, DISCORD_ROLES=0 ── */
{
  world(); const F = await startFakes(), adm = mkdtempSync(join(tmpdir(), 'dscroles-adm-'));
  const start = env => new Promise((resolve, reject) => {
    const c = spawn('node', ['server/proxy.mjs'], { env: { ...process.env, EDH_SOURCE_URL: '', PORT: '19847', ALERTS: '0', PUBDECKS: '0', DAILY: '0', BAD_KEY_DELAY_MS: '20', ...F.env, ADMIN_DIR: adm,
      DISCORD_BOT_TOKEN: TOKEN, DISCORD_API: DAPI, DISCORD_CLIENT_ID: OA.cid, DISCORD_CLIENT_SECRET: OA.secret, DISCORD_PRESENCE: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; c.log = () => out; c.stdout.on('data', d => { out += d; if (/Mana Orbit →/.test(out)) resolve(c); }); c.stderr.on('data', d => { out += d; });
    c.on('exit', code => { if (code) reject(new Error('exit ' + code + ': ' + out)); });
  });
  const stop = p => new Promise(r => { p.once('exit', r); p.kill(); });
  const until = async (f, m, ms = 8000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error('délai dépassé : ' + m); await new Promise(r => setTimeout(r, 30)); } };
  const BASE = 'http://127.0.0.1:19847', call = async (m, p, tok) => { const r = await fetch(BASE + p, { method: m, headers: { 'x-forwarded-for': '10.9.0.' + (++n % 200n), ...(tok ? { 'x-firebase-token': tok } : {}), ...(m === 'POST' ? { 'content-type': 'application/json' } : {}) }, body: m === 'POST' ? '{}' : undefined }); const tx = await r.text(); let o = null; try { o = JSON.parse(tx); } catch { /* page */ } return { s: r.status, o, t: tx }; };
  let p = await start({});
  try {
    await until(() => D.roles.length === 16, 'rôles créés au démarrage'); assert.match(p.log(), /rôles des comptes liés/);
    await until(() => existsSync(join(adm, 'discord-roles.json')), 'ids gardés dans ADMIN_DIR/discord-roles.json');
    const uid = 'uid-proxy-roles-01', tok = F.jwt(uid, 3600); F.fs.docs.set(`users/${uid}/meta/progress`, { c: { sc: 12000 }, updatedAt: 1 });
    D.members.set(U.jeanne.id, []); OA.codes.set('px1', U.jeanne);
    const st = new URL((await call('POST', '/api/discord/link', tok)).o.url).searchParams.get('state');
    assert.equal((await call('GET', `/api/discord/callback?code=px1&state=${st}`)).s, 200);
    await until(() => mine(U.jeanne.id).length === 2, 'rôles donnés');
    assert.deepEqual(mine(U.jeanne.id), ['linked', 'sc_cards:2'], 'Compte lié + Maître du scan (12 000 cartes lues dans Firestore ; Carte mystère coupée : rien)');
    assert.ok(F.fs.ops.includes(`GET users/${uid}/meta/progress`), 'document progress lu avec le compte de service');
    assert.deepEqual((await call('POST', '/api/discord/unlink', tok)).o, { ok: true });
    await until(() => mine(U.jeanne.id).length === 0, 'rôles retirés');
    await stop(p);
    world(); p = await start({ DISCORD_ROLES: '0' }); await new Promise(r => setTimeout(r, 400));
    assert.equal(created().length, 0, 'DISCORD_ROLES=0 : rien créé'); assert.doesNotMatch(p.log(), /rôles des comptes liés/);
    assert.ok(!p.log().includes(TOKEN) && !p.log().includes(OA.secret));
    await stop(p);
  } finally { try { p.kill(); } catch { /* déjà arrêté */ } F.stop(); }
  ok('vrai proxy.mjs : rôles créés au démarrage, compteur du scan lu dans Firestore, rôles donnés au retour de liaison et retirés en déliant ; DISCORD_ROLES=0 : coupé');
}
srv.close();
console.log('OK test-discord-roles');
process.exit(0);
