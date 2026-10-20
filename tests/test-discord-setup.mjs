// tools/discord-setup.mjs contre un faux Discord (aucun accès réseau) : serveur neuf (salons « général », catégories par défaut), rôles, salons et permissions,
// mode communauté, forums et leurs étiquettes, AutoMod, messages d'accueil et des règles, lien permanent ; relancé : rien en double, textes remis à jour ;
// limite de débit (429) attendue ; jeton jamais affiché ; sans jeton, refus clair ; --dry : aucun changement.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';

const ok = m => console.log('✓ ' + m);
const TOKEN = 'secret-jeton-de-test-123';
let n = 100; const nid = () => String(++n);
const G = '900000000000000001', OWNER = '900000000000000002', BOT = '900000000000000003';
const S = { guild: { id: G, name: 'Mana Orbit', icon: null, owner_id: OWNER, features: [], verification_level: 0, explicit_content_filter: 0 }, roles: [{ id: G, name: '@everyone', permissions: String((1n << 10n) | (1n << 11n) | (1n << 17n)), color: 0, hoist: false }],
  channels: [], msgs: {}, automod: [], invites: [], memberRoles: [], calls: [], auth: new Set(), limited: false };
S.channels.push({ id: '501', name: 'Salons textuels', type: 4, parent_id: null }, { id: '502', name: 'Salons vocaux', type: 4, parent_id: null });
S.channels.push({ id: '503', name: 'général', type: 0, parent_id: '501' }, { id: '504', name: 'Général', type: 2, parent_id: '502' });

const srv = http.createServer((q, r) => {
  let b = ''; q.on('data', d => { b += d; }); q.on('end', () => {
    S.auth.add(q.headers.authorization || '');
    const send = (code, o) => { r.writeHead(code, { 'content-type': 'application/json' }); r.end(o === undefined ? '' : JSON.stringify(o)); };
    const body = b ? JSON.parse(b) : undefined, u = new URL(q.url, 'http://x'), p = u.pathname.replace(/^\/api\/v10/, ''), m = q.method;
    S.calls.push(m + ' ' + p);
    if (q.headers.authorization !== 'Bot ' + TOKEN) return send(401, { message: '401: Unauthorized' });
    if (!S.limited && m === 'POST' && /\/roles$/.test(p)) { S.limited = true; return send(429, { message: 'You are being rate limited.', retry_after: 0.05 }); }      // une fois : le script attend et recommence
    let x;
    if (m === 'GET' && p === '/users/@me') return send(200, { id: BOT, username: 'Mana Orbit Setup', bot: true });
    if (m === 'GET' && p === '/users/@me/guilds') return send(200, [{ id: G, name: S.guild.name }]);
    if (p === `/guilds/${G}`) {
      if (m === 'GET') return send(200, S.guild);
      if ((body.features || []).includes('COMMUNITY')) {      // comme Discord : salons des règles et des messages de Discord, vérification et filtre exigés
        if (!S.channels.some(c => c.id === body.rules_channel_id) || !S.channels.some(c => c.id === body.public_updates_channel_id) || !(body.verification_level >= 1) || body.explicit_content_filter !== 2) return send(400, { message: 'Invalid Form Body' });
      }
      Object.assign(S.guild, body, body.icon ? { icon: 'hash' } : {}); return send(200, S.guild);
    }
    if (p === `/guilds/${G}/roles`) { if (m === 'GET') return send(200, S.roles); x = { id: nid(), ...body }; S.roles.push(x); return send(200, x); }
    if ((x = /^\/guilds\/\d+\/roles\/(\d+)$/.exec(p)) && m === 'PATCH') { const ro = S.roles.find(o => o.id === x[1]); Object.assign(ro, body); return send(200, ro); }
    if ((x = /^\/guilds\/\d+\/members\/(\d+)\/roles\/(\d+)$/.exec(p)) && m === 'PUT') { S.memberRoles.push(x[1] + ':' + x[2]); return send(204); }
    if (p === `/guilds/${G}/channels`) {
      if (m === 'GET') return send(200, S.channels);
      if ((body.type === 5 || body.type === 15) && !S.guild.features.includes('COMMUNITY')) return send(400, { message: 'Community required' });
      x = { id: nid(), ...body }; if (x.available_tags) x.available_tags = x.available_tags.map(t => ({ id: nid(), ...t })); S.channels.push(x); return send(200, x);
    }
    if ((x = /^\/channels\/(\d+)$/.exec(p))) {
      const i = S.channels.findIndex(c => c.id === x[1]); if (i < 0) return send(404, { message: 'Unknown Channel' });
      if (m === 'DELETE') { if (S.channels.some(c => c.parent_id === x[1])) return send(400, { message: 'not empty' }); const [c] = S.channels.splice(i, 1); return send(200, c); }
      const c = S.channels[i]; if (body.available_tags) body.available_tags = body.available_tags.map(t => ({ id: t.id || nid(), ...t })); Object.assign(c, body); return send(200, c);
    }
    if ((x = /^\/channels\/(\d+)\/messages$/.exec(p))) {
      const l = S.msgs[x[1]] = S.msgs[x[1]] || [];
      if (m === 'GET') return send(200, l.slice().reverse());
      const msg = { id: nid(), author: { id: BOT }, ...body }; l.push(msg); return send(200, msg);
    }
    if ((x = /^\/channels\/(\d+)\/messages\/(\d+)$/.exec(p)) && m === 'PATCH') { const msg = S.msgs[x[1]].find(o => o.id === x[2]); Object.assign(msg, body); return send(200, msg); }
    if (p === `/guilds/${G}/auto-moderation/rules`) { if (m === 'GET') return send(200, S.automod); x = { id: nid(), ...body }; S.automod.push(x); return send(200, x); }
    if (p === `/guilds/${G}/invites` && m === 'GET') return send(200, S.invites);
    if ((x = /^\/channels\/(\d+)\/invites$/.exec(p)) && m === 'POST') { const inv = { code: 'MaNaOrB', channel: { id: x[1] }, ...body }; S.invites.push(inv); return send(200, inv); }
    return send(404, { message: 'Unknown route ' + m + ' ' + p });
  });
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const API = `http://127.0.0.1:${srv.address().port}/api/v10`;
const run = (env, args = []) => new Promise(res => {
  const c = spawn('node', ['tools/discord-setup.mjs', ...args], { env: { ...process.env, DISCORD_API: API, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.stdout.on('data', d => { out += d; }); c.stderr.on('data', d => { out += d; }); c.on('exit', code => res({ code, out }));
});
const byName = (name, type) => S.channels.find(c => c.name === name && (type === undefined || c.type === type));
const P = k => BigInt(k);

/* ── Sans jeton : refus clair, aucun appel ── */
{
  const r = await run({ DISCORD_TOKEN: '' }); assert.equal(r.code, 1); assert.match(r.out, /DISCORD_TOKEN manquant/); assert.equal(S.calls.length, 0);
  ok('sans jeton : refus clair, aucun appel');
}
/* ── --dry : lectures seulement ── */
{
  const r = await run({ DISCORD_TOKEN: TOKEN }, ['--dry']); assert.equal(r.code, 0, r.out); assert.match(r.out, /Essai terminé : \d+ changements prévus/);
  assert.deepEqual(S.calls.filter(c => !c.startsWith('GET ')), [], 'aucune écriture'); assert.equal(S.roles.length, 1); S.calls.length = 0;
  ok('--dry : lectures seulement, changements listés');
}
/* ── Premier lancement : serveur neuf ── */
const r1 = await run({ DISCORD_TOKEN: TOKEN });
assert.equal(r1.code, 0, r1.out); assert.ok(!r1.out.includes(TOKEN), 'jeton jamais affiché'); assert.ok([...S.auth].every(a => a === 'Bot ' + TOKEN), 'jeton envoyé seulement dans l\'en-tête Authorization');
assert.equal(S.calls.filter(c => c === `POST /guilds/${G}/roles`).length, 3, '429 : le rôle est redemandé après l\'attente');
{
  const team = S.roles.find(x => x.name === 'Équipe'), tester = S.roles.find(x => x.name === 'Testeur'), every = S.roles.find(x => x.id === G);
  assert.ok(team && tester && team.hoist && tester.hoist); assert.ok(P(team.permissions) & (1n << 13n), 'Équipe : gérer les messages'); assert.equal(P(team.permissions) & (1n << 3n), 0n, 'Équipe : jamais administrateur');
  assert.equal(P(every.permissions) & (1n << 17n), 0n, '@everyone : plus de @everyone / @here'); assert.ok(P(every.permissions) & (1n << 11n), '@everyone : écrire reste permis');
  assert.deepEqual(S.memberRoles, [OWNER + ':' + team.id], 'rôle Équipe donné au propriétaire');
  ok('rôles Équipe et Testeur (affichés à part), @everyone sans mention de masse, Équipe donnée au propriétaire, limite de débit attendue');

  const cat = n => byName(n, 4).id;
  const tree = Object.fromEntries(['Bienvenue', 'Appli', 'Communauté', 'Équipe'].map(c => [c, S.channels.filter(x => x.parent_id === cat(c)).sort((a, b) => a.position - b.position).map(x => x.name + ':' + x.type)]));
  assert.deepEqual(tree, { Bienvenue: ['bienvenue:0', 'règles:0', 'annonces:5'], Appli: ['aide:15', 'bugs:15', 'idées:15'], Communauté: ['général:0', 'ouvertures:0', 'decks:0', 'échanges:0', 'english:0', 'Commander:2'], Équipe: ['modération:0'] });
  assert.equal(byName('général').id, '503', 'salon « général » du serveur neuf gardé (déplacé)'); assert.equal(byName('Commander').id, '504', 'salon vocal « Général » renommé');
  assert.ok(!byName('Salons textuels') && !byName('Salons vocaux'), 'catégories par défaut vides retirées');
  assert.equal(byName('général').rate_limit_per_user, 10, '#général : mode lent 10 s');
  const ro = byName('annonces').permission_overwrites, ev = ro.find(o => o.id === G), tm = ro.find(o => o.id === team.id);
  assert.ok(P(ev.deny) & (1n << 11n) && P(tm.allow) & (1n << 11n), 'annonces : lecture seule sauf Équipe');
  const mod = byName('modération').permission_overwrites; assert.ok(P(mod.find(o => o.id === G).deny) & (1n << 10n), '#modération : invisible pour les membres');
  assert.deepEqual(byName('bugs').available_tags.map(t => t.name + (t.moderated ? '*' : '')), ['Scan', 'Collection', 'Decks', 'Prix', 'Compte et synchro', 'Autre', 'Corrigé*', 'Prochaine version*']);
  assert.ok(byName('idées').available_tags.every(t => t.moderated), 'idées : étiquettes d\'avancement posées par l\'équipe');
  assert.match(byName('aide').topic, /un fil par question/);
  ok('salons : Bienvenue (lecture seule), Appli (3 forums et leurs étiquettes), Communauté (général gardé, mode lent), vocal renommé, Équipe privée ; catégories par défaut retirées');

  assert.ok(S.guild.features.includes('COMMUNITY')); assert.equal(S.guild.rules_channel_id, byName('règles').id); assert.equal(S.guild.public_updates_channel_id, byName('modération').id);
  assert.deepEqual([S.guild.verification_level, S.guild.explicit_content_filter, S.guild.default_message_notifications], [2, 2, 1]); assert.equal(S.guild.icon, 'hash', 'icône posée (serveur sans icône)');
  ok('mode communauté (règles, messages de Discord dans #modération), vérification moyenne, filtre pour tous, notifications @mentions, icône');

  assert.deepEqual(S.automod.map(a => [a.name, a.trigger_type, a.actions.map(x => x.type).join('+'), a.exempt_roles[0] === team.id]), [['Arnaques', 1, '1+2', true], ['Spam', 3, '1+2', true], ['Mentions en masse', 5, '1+2', true], ['Contenu choquant', 4, '1+2', true]]);
  assert.ok(S.automod.every(a => a.actions[1].metadata.channel_id === byName('modération').id), 'alertes dans #modération');
  ok('AutoMod : arnaques, spam, mentions en masse, contenu choquant ; bloqué + alerte dans #modération, Équipe exemptée');

  const wel = S.msgs[byName('bienvenue').id], rules = S.msgs[byName('règles').id];
  assert.equal(wel.length, 1); assert.equal(rules.length, 1);
  assert.ok(wel[0].content.includes(`<#${byName('aide').id}>`) && wel[0].content.includes(`<#${byName('règles').id}>`) && wel[0].content.includes('play.google.com/store/apps/details?id=app.manaorbit'));
  assert.match(rules[0].content, /Fan Content Policy/); assert.ok(wel[0].content.length < 2000 && rules[0].content.length < 2000, 'messages sous 2 000 caractères');
  assert.deepEqual(wel[0].allowed_mentions, { parse: [] }); assert.equal(wel[0].flags, 4);
  assert.match(r1.out, /Lien d'invitation permanent : https:\/\/discord\.gg\/MaNaOrB/); assert.deepEqual([S.invites[0].max_age, S.invites[0].max_uses, S.invites[0].channel.id], [0, 0, byName('bienvenue').id]);
  ok('messages d\'accueil et des règles (renvois vers les salons, sans mention ni aperçu), lien d\'invitation permanent dans #bienvenue');
}
/* ── Relancé : rien en double, textes remis à jour ── */
{
  const before = { roles: S.roles.length, chans: S.channels.length, automod: S.automod.length, invites: S.invites.length };
  S.msgs[byName('bienvenue').id][0].content = 'ancien texte';
  const tags0 = byName('bugs').available_tags.map(t => t.id);
  const r2 = await run({ DISCORD_TOKEN: TOKEN }); assert.equal(r2.code, 0, r2.out);
  assert.deepEqual({ roles: S.roles.length, chans: S.channels.length, automod: S.automod.length, invites: S.invites.length }, before, 'rien en double');
  assert.equal(S.msgs[byName('bienvenue').id].length, 1); assert.notEqual(S.msgs[byName('bienvenue').id][0].content, 'ancien texte', 'accueil remis à jour');
  assert.match(r2.out, /message d'accueil \(mis à jour\)/); assert.match(r2.out, /message des règles\n/);
  assert.deepEqual(byName('bugs').available_tags.map(t => t.id), tags0, 'étiquettes gardées (mêmes identifiants)');
  ok('relancé : rien en double, accueil remis à jour, étiquettes des forums gardées');
}
/* ── Jeton refusé ── */
{
  const r = await run({ DISCORD_TOKEN: 'mauvais' }); assert.equal(r.code, 1); assert.match(r.out, /jeton refusé/); assert.ok(!r.out.includes('mauvais'));
  ok('jeton refusé : message clair, jeton jamais affiché');
}
srv.close();
console.log('\nDISCORD SETUP OK');
