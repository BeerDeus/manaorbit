// tools/discord-setup.mjs contre un faux Discord (aucun accès réseau). Serveur neuf : rôles rangés sous celui du bot (rôle d'un bot de tickets gardé sous Support),
// catégories « ╔ … ╝ » et salons, une catégorie par langue visible avec son rôle, lecture seule, forums et leurs étiquettes, mode communauté, accueil (questions,
// salons par défaut), écran des règles refusé au bot (à faire à la main, texte affiché), AutoMod, messages (accueil, règles dans chaque langue), webhooks GitHub,
// lien permanent ; relancé : rien en double ni réécrit, identifiants de l'accueil gardés ; serveur de l'ancienne version : salons repris (mêmes identifiants,
// renommés, déplacés), étiquettes et messages gardés, salons inconnus jamais touchés ; limite de débit (429) attendue ; jeton jamais affiché ; --dry : aucun changement.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';

const ok = m => console.log('✓ ' + m);
const TOKEN = 'secret-jeton-de-test-123';
let n = 100; const nid = () => String(++n);
const G = '900000000000000001', OWNER = '900000000000000002', BOT = '900000000000000003', BOTROLE = '900000000000000004', TICKETROLE = '900000000000000005';
const VIEW = 1n << 10n, SEND = 1n << 11n, MENTION = 1n << 17n;
let S;
function fresh() {
  S = { guild: { id: G, name: 'Mana Orbit', icon: null, owner_id: OWNER, features: [], verification_level: 0, explicit_content_filter: 0, system_channel_flags: 0 },
    roles: [{ id: G, name: '@everyone', permissions: String(VIEW | SEND | MENTION), color: 0, hoist: false, position: 0 }, { id: TICKETROLE, name: 'Ticket Tool', permissions: '0', position: 1, managed: true }, { id: BOTROLE, name: 'Mana Orbit Setup', permissions: '8', position: 2, managed: true }],
    channels: [], msgs: {}, automod: [], invites: [], hooks: [], onboarding: null, memberRoles: [], calls: [], auth: new Set(), limited: false };
}
fresh();

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
    if (m === 'GET' && p === `/guilds/${G}/members/${BOT}`) return send(200, { user: { id: BOT }, roles: [BOTROLE] });
    if (p === `/guilds/${G}`) {
      if (m === 'GET') return send(200, S.guild);
      if ((body.features || []).includes('COMMUNITY')) {      // comme Discord : salons des règles et des messages de Discord, vérification et filtre exigés
        if (!S.channels.some(c => c.id === body.rules_channel_id) || !S.channels.some(c => c.id === body.public_updates_channel_id) || !(body.verification_level >= 1) || body.explicit_content_filter !== 2) return send(400, { message: 'Invalid Form Body' });
      }
      Object.assign(S.guild, body, body.icon ? { icon: 'hash' } : {}); return send(200, S.guild);
    }
    if (p === `/guilds/${G}/roles`) {
      if (m === 'GET') return send(200, S.roles);
      if (m === 'PATCH') {      // rangement : jamais au niveau ou au-dessus du rôle du bot
        const top = S.roles.find(o => o.id === BOTROLE).position;
        if (body.some(o => o.position >= top || o.position < 1)) return send(403, { message: 'Missing Permissions' });
        for (const o of body) S.roles.find(ro => ro.id === o.id).position = o.position; return send(200, S.roles);
      }
      for (const ro of S.roles) if (ro.position >= 1) ro.position++;      // nouveau rôle : juste au-dessus de @everyone
      x = { id: nid(), position: 1, ...body }; S.roles.push(x); return send(200, x);
    }
    if ((x = /^\/guilds\/\d+\/roles\/(\d+)$/.exec(p)) && m === 'PATCH') { const ro = S.roles.find(o => o.id === x[1]); Object.assign(ro, body); return send(200, ro); }
    if ((x = /^\/guilds\/\d+\/members\/(\d+)\/roles\/(\d+)$/.exec(p)) && m === 'PUT') { if (!S.memberRoles.includes(x[1] + ':' + x[2])) S.memberRoles.push(x[1] + ':' + x[2]); return send(204); }
    if (p === `/guilds/${G}/channels`) {
      if (m === 'GET') return send(200, S.channels);
      if (m === 'PATCH') {      // comme Discord : un seul changement de catégorie par appel
        if (body.filter(o => 'parent_id' in o).length > 1) return send(400, { message: 'Only one channel can have a parent_id modified at a time' });
        for (const o of body) Object.assign(S.channels.find(c => c.id === o.id), o); return send(204);
      }
      if ((body.type === 5 || body.type === 15) && !S.guild.features.includes('COMMUNITY')) return send(400, { message: 'Community required' });
      x = { id: nid(), flags: 0, ...body }; if (x.available_tags) x.available_tags = x.available_tags.map(t => ({ id: nid(), ...t })); S.channels.push(x); return send(200, x);
    }
    if ((x = /^\/channels\/(\d+)$/.exec(p))) {
      const i = S.channels.findIndex(c => c.id === x[1]); if (i < 0) return send(404, { message: 'Unknown Channel' });
      if (m === 'DELETE') { if (S.channels.some(c => c.parent_id === x[1])) return send(400, { message: 'not empty' }); const [c] = S.channels.splice(i, 1); return send(200, c); }
      const c = S.channels[i]; if (body.available_tags) body.available_tags = body.available_tags.map(t => ({ id: t.id || nid(), ...t }));
      if (body.available_tags && body.available_tags.length > 20) return send(400, { message: 'too many tags' });
      Object.assign(c, body); return send(200, c);
    }
    if ((x = /^\/channels\/(\d+)\/messages$/.exec(p))) {
      const l = S.msgs[x[1]] = S.msgs[x[1]] || [];
      if (m === 'GET') return send(200, l.slice().reverse());      // comme Discord : le plus récent d'abord
      if (body.content.length > 2000) return send(400, { message: 'too long' });
      const msg = { id: nid(), author: { id: BOT }, ...body }; l.push(msg); return send(200, msg);
    }
    if ((x = /^\/channels\/(\d+)\/messages\/(\d+)$/.exec(p))) {
      const l = S.msgs[x[1]], i = l.findIndex(o => o.id === x[2]);
      if (m === 'DELETE') { l.splice(i, 1); return send(204); }
      Object.assign(l[i], body); return send(200, l[i]);
    }
    if (p === `/guilds/${G}/auto-moderation/rules`) { if (m === 'GET') return send(200, S.automod); x = { id: nid(), ...body }; S.automod.push(x); return send(200, x); }
    if ((x = /^\/guilds\/\d+\/auto-moderation\/rules\/(\d+)$/.exec(p)) && m === 'PATCH') { const a = S.automod.find(o => o.id === x[1]); Object.assign(a, body); return send(200, a); }
    if (p === `/guilds/${G}/onboarding`) {
      if (m === 'GET') return send(200, S.onboarding || { guild_id: G, prompts: [], default_channel_ids: [], enabled: false, mode: 0 });
      const vis = id => { const c = S.channels.find(o => o.id === id), par = c && S.channels.find(o => o.id === c.parent_id), ev = l => (l || []).find(o => o.id === G); return c && ![c, par].some(o => o && ev(o.permission_overwrites) && BigInt(ev(o.permission_overwrites).deny) & VIEW); };
      if (!S.guild.features.includes('COMMUNITY') || body.default_channel_ids.length < 7 || !body.default_channel_ids.every(vis)) return send(400, { message: 'Invalid onboarding' });
      if (!body.prompts.every(pr => pr.id && pr.options.every(o => o.id && o.role_ids.every(id => S.roles.some(ro => ro.id === id))))) return send(400, { message: 'Invalid prompt' });
      S.onboarding = body; return send(200, body);
    }
    if (p === `/guilds/${G}/member-verification`) return send(403, { message: 'Bots cannot use this endpoint' });
    if ((x = /^\/channels\/(\d+)\/webhooks$/.exec(p))) {
      if (m === 'GET') return send(200, S.hooks.filter(h => h.channel_id === x[1]));
      const h = { id: nid(), token: 'tok' + n, channel_id: x[1], ...body }; S.hooks.push(h); return send(200, h);
    }
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
const role = name => S.roles.find(x => x.name === name);
const P = k => BigInt(k);
const owOf = (c, id) => (c.permission_overwrites || []).find(o => o.id === id) || { allow: '0', deny: '0' };
const kidsOf = cat => S.channels.filter(x => x.parent_id === cat.id).sort((a, b) => (a.type === 2) - (b.type === 2) || a.position - b.position).map(x => x.name + ':' + x.type);
const CATS = ['╔ BIENVENUE ╝', '╔ SUPPORT ╝', '╔ COMMUNAUTÉ ╝', '╔ JOUER ╝', '╔ 🇫🇷 FRANÇAIS ╝', '╔ 🇬🇧 ENGLISH ╝', '╔ 🇩🇪 DEUTSCH ╝', '╔ 🇪🇸 ESPAÑOL ╝', '╔ 🇮🇹 ITALIANO ╝', '╔ 🇧🇷🇵🇹 PORTUGUÊS ╝', '╔ 🇷🇺 РУССКИЙ ╝', '╔ 🇯🇵 日本語 ╝', '╔ 🇰🇷 한국어 ╝', '╔ 🀄 中文 ╝', '╔ BÊTA ╝', '╔ ÉQUIPE ╝'];
const LANG_ROLES = ['Français', 'English', 'Deutsch', 'Español', 'Italiano', 'Português', 'Русский', '日本語', '한국어', '中文'];

/* ── Sans jeton : refus clair, aucun appel ── */
{
  const r = await run({ DISCORD_TOKEN: '' }); assert.equal(r.code, 1); assert.match(r.out, /DISCORD_TOKEN manquant/); assert.equal(S.calls.length, 0);
  ok('sans jeton : refus clair, aucun appel');
}
/* ── --dry : lectures seulement ── */
{
  S.channels.push({ id: '501', name: 'Salons textuels', type: 4, parent_id: null, position: 0 }, { id: '502', name: 'Salons vocaux', type: 4, parent_id: null, position: 1 });
  S.channels.push({ id: '503', name: 'général', type: 0, parent_id: '501', position: 0 }, { id: '504', name: 'Général', type: 2, parent_id: '502', position: 0 });
  const r = await run({ DISCORD_TOKEN: TOKEN }, ['--dry']); assert.equal(r.code, 0, r.out); assert.match(r.out, /Essai terminé : \d+ changements prévus/);
  assert.deepEqual(S.calls.filter(c => !c.startsWith('GET ')), [], 'aucune écriture'); assert.equal(S.roles.length, 3); S.calls.length = 0;
  ok('--dry : lectures seulement, changements listés');
}
/* ── Premier lancement : serveur neuf ── */
const r1 = await run({ DISCORD_TOKEN: TOKEN });
assert.equal(r1.code, 0, r1.out); assert.ok(!r1.out.includes(TOKEN), 'jeton jamais affiché'); assert.ok([...S.auth].every(a => a === 'Bot ' + TOKEN), 'jeton envoyé seulement dans l\'en-tête Authorization');
{
  assert.ok(S.calls.filter(c => c === `POST /guilds/${G}/roles`).length > 30, '429 : rôle redemandé après l\'attente');
  const order = S.roles.slice().sort((a, b) => b.position - a.position).map(x => x.name);
  assert.deepEqual(order.slice(0, 9), ['Mana Orbit Setup', '👑 Créateur', 'Admin', 'Modo', 'Support', 'Ticket Tool', 'Modo FR', 'Modo EN', 'Testeur'], 'équipe en haut, rôle du bot de tickets sous Support');
  assert.deepEqual(order.slice(9, 20), [...LANG_ROLES, '🌍 Toutes les langues']); assert.equal(order.at(-1), '@everyone');
  assert.equal(new Set(S.roles.map(x => x.position)).size, S.roles.length, 'positions toutes différentes');
  assert.equal(P(role('Admin').permissions), 8n); assert.equal(P(role('Modo').permissions) & 8n, 0n, 'Modo : jamais administrateur'); assert.ok(P(role('Modo').permissions) & (1n << 13n));
  assert.ok(role('🎲 LFG').mentionable && role('Commander').mentionable && !role('Français').mentionable && !role('📢 Annonces').mentionable);
  assert.ok(role('Admin').hoist && role('Testeur').hoist && !role('Français').hoist);
  assert.equal(P(S.roles.find(x => x.id === G).permissions) & MENTION, 0n, '@everyone : plus de @everyone / @here');
  assert.deepEqual(S.memberRoles, [OWNER + ':' + role('👑 Créateur').id], 'Créateur donné au propriétaire'); assert.equal(P(role('👑 Créateur').permissions), 0n);
  ok('rôles : équipe, modos de langue, Testeur, 10 langues + toutes, notifications, usages, formats ; rangés sous le bot, bot de tickets sous Support ; Créateur au propriétaire');

  const cats = S.channels.filter(c => c.type === 4).sort((a, b) => a.position - b.position).map(c => c.name);
  assert.deepEqual(cats, CATS, 'catégories stylisées, dans l\'ordre'); const cat = name => byName(name, 4);
  assert.deepEqual(kidsOf(cat('╔ BIENVENUE ╝')), ['👋・bienvenue:0', '📜・règles:0', '📢・annonces:5', '🆕・changelog:5', '❓・faq:15']);
  assert.deepEqual(kidsOf(cat('╔ SUPPORT ╝')), ['🆘・aide:15', '🐞・bugs:15', '💡・idées:15']);
  assert.deepEqual(kidsOf(cat('╔ COMMUNAUTÉ ╝')), ['🃏・decks:0', '🖼️・collections:0', '📦・ouvertures:0', '🔮・carte-mystère:0', '🔁・échanges:0', '💶・prix-et-marché:0', '✨・spoilers:0']);
  assert.deepEqual(kidsOf(cat('╔ JOUER ╝')), ['🎲・lfg:0', '🔊 Table 1:2', '🔊 Table 2:2', '🔊 Table 3:2', '☕ Chill:2']);
  assert.deepEqual(kidsOf(cat('╔ 🇫🇷 FRANÇAIS ╝')), ['💬・général:0', '🆘・entraide:0', '🔊 Vocal FR:2']);
  assert.deepEqual(kidsOf(cat('╔ 🇩🇪 DEUTSCH ╝')), ['📜・regeln:0', '💬・allgemein:0']);
  assert.deepEqual(kidsOf(cat('╔ 🀄 中文 ╝')), ['📜・规则:0', '💬・闲聊:0']);
  assert.deepEqual(kidsOf(cat('╔ ÉQUIPE ╝')), ['🛡️・modération:0', '💬・staff:0', '🐞・bug-triage:0', '🚨・alertes-serveur:0']);
  assert.equal(byName('💬・général').id, '503', '« général » du serveur neuf gardé (déplacé dans Français)'); assert.equal(byName('🔊 Table 1').id, '504', 'vocal « Général » repris');
  assert.ok(!byName('Salons textuels') && !byName('Salons vocaux'), 'catégories par défaut vides retirées');
  assert.equal(byName('🔮・carte-mystère').rate_limit_per_user, 10); assert.equal(byName('🔊 Table 2').user_limit, 5);
  ok('catégories « ╔ … ╝ » dans l\'ordre, salons de chaque catégorie, « général » et vocal du serveur neuf repris, mode lent, tables de 5');

  const de = cat('╔ 🇩🇪 DEUTSCH ╝'), rg = byName('📜・regeln');
  assert.ok(P(owOf(de, G).deny) & VIEW, 'langue : invisible sans le rôle'); assert.ok(P(owOf(de, role('Deutsch').id).allow) & VIEW && P(owOf(de, role('🌍 Toutes les langues').id).allow) & VIEW && P(owOf(de, role('Modo').id).allow) & VIEW);
  assert.equal(P(owOf(de, role('Français').id).allow), 0n, 'une langue ne voit pas les autres');
  assert.ok(P(owOf(rg, G).deny) & SEND && P(owOf(rg, G).deny) & VIEW, 'règles traduites : lecture seule'); assert.equal(P(owOf(rg, role('Deutsch').id).allow) & SEND, 0n);
  const fr = cat('╔ 🇫🇷 FRANÇAIS ╝'); assert.ok(P(owOf(fr, role('Modo FR').id).allow) & (1n << 13n), 'Modo FR : gère les messages de la catégorie française'); assert.equal(P(owOf(de, role('Modo FR').id).allow), 0n);
  assert.ok(P(owOf(byName('📢・annonces'), G).deny) & SEND && P(owOf(byName('📢・annonces'), role('Modo').id).allow) & SEND, 'annonces : lecture seule sauf équipe');
  assert.ok(P(owOf(byName('❓・faq'), G).deny) & SEND, 'faq : fils ouverts par l\'équipe seulement');
  assert.ok(P(owOf(cat('╔ BÊTA ╝'), G).deny) & VIEW && P(owOf(cat('╔ BÊTA ╝'), role('Testeur').id).allow) & VIEW, 'bêta : Testeur'); assert.ok(P(owOf(byName('📦・builds-android'), G).deny) & SEND);
  assert.ok(P(owOf(cat('╔ ÉQUIPE ╝'), G).deny) & VIEW && P(owOf(cat('╔ ÉQUIPE ╝'), role('Support').id).allow) & VIEW, 'équipe : Modo et Support');
  assert.deepEqual(cat('╔ COMMUNAUTÉ ╝').permission_overwrites, [], 'communauté : ouverte à tous');
  ok('permissions : langue visible avec son rôle (ou « toutes »), règles traduites en lecture seule, Modo FR sur le français seulement, annonces / faq / bêta / équipe');

  const bugs = byName('🐞・bugs');
  assert.equal(bugs.available_tags.length, 19); assert.ok(bugs.available_tags.filter(t => t.moderated).map(t => t.name).join() === 'Confirmé,Prochaine version,Corrigé,Pas un bug,Doublon');
  assert.equal(bugs.flags & 16, 16, 'bugs : étiquette obligatoire'); assert.match(bugs.topic, /Version de l'appli/); assert.equal(byName('💡・idées').default_reaction_emoji.emoji_name, '👍');
  assert.ok(byName('🆘・aide').available_tags.some(t => t.name === 'Android'));
  ok('forums : bugs (19 étiquettes, obligatoire, modèle), aide (plateformes), idées (👍)');

  assert.ok(S.guild.features.includes('COMMUNITY')); assert.equal(S.guild.rules_channel_id, byName('📜・règles').id); assert.equal(S.guild.public_updates_channel_id, byName('🛡️・modération').id);
  assert.equal(S.guild.system_channel_id, byName('🛡️・modération').id); assert.equal(S.guild.system_channel_flags & 12, 12);
  assert.deepEqual([S.guild.verification_level, S.guild.explicit_content_filter, S.guild.default_message_notifications], [2, 2, 1]); assert.equal(S.guild.icon, 'hash');
  ok('mode communauté, arrivées dans #modération, vérification moyenne, filtre pour tous, notifications @mentions, icône');

  const ob = S.onboarding; assert.ok(ob && ob.enabled); assert.equal(ob.prompts.length, 4);
  assert.ok(ob.prompts[0].required && !ob.prompts[1].required && ob.prompts.every(p => p.in_onboarding && !p.single_select));
  assert.deepEqual(ob.prompts[0].options.map(o => S.roles.find(x => x.id === o.role_ids[0]).name), [...LANG_ROLES, '🌍 Toutes les langues']);
  assert.equal(ob.prompts[2].options.length, 7); assert.ok(ob.default_channel_ids.includes(byName('🐞・bugs').id) && !ob.default_channel_ids.includes(byName('📜・regeln').id));
  ok('accueil : langue obligatoire (10 + toutes), usage, formats, notifications ; salons par défaut publics');

  assert.match(r1.out, /Écran des règles : Paramètres du serveur/); assert.match(r1.out, /Règles pour l'écran des règles :\n {2}Be respectful/);
  assert.deepEqual(S.automod.map(a => [a.name, a.trigger_type]), [['Arnaques', 1], ['Invitations', 1], ['Spam', 3], ['Mentions en masse', 5], ['Contenu choquant', 4]]);
  assert.ok(S.automod.every(a => a.exempt_roles.length === 3 && a.actions[1].metadata.channel_id === byName('🛡️・modération').id));
  assert.equal(S.automod[3].actions[2].metadata.duration_seconds, 600);
  ok('écran des règles refusé au bot : texte affiché pour la main ; AutoMod (5 règles, alertes dans #modération, équipe exemptée)');

  const M = name => S.msgs[byName(name).id] || [], bug = byName('🐞・bugs').id, idea = byName('💡・idées').id;
  assert.equal(M('📜・règles').length, 2); assert.equal(M('👋・bienvenue').length, 1);
  assert.ok(M('👋・bienvenue')[0].content.includes('<id:customize>') && M('👋・bienvenue')[0].content.includes(`<#${bug}>`) && M('👋・bienvenue')[0].content.includes('play.google.com'));
  for (const c of ['📜・regeln', '📜・reglas', '📜・regole', '📜・regras', '📜・правила', '📜・ルール', '📜・규칙']) { assert.equal(M(c).length, 1, c); assert.ok(M(c)[0].content.includes(`<#${bug}>`) && M(c)[0].content.includes(`<#${idea}>`), c + ' : renvois vers les salons'); }
  assert.equal(M('📜・规则').length, 2, 'chinois : simplifié et traditionnel'); assert.match(M('📜・规则')[1].content, /伺服器規則/);
  assert.match(M('📜・regeln')[0].content, /Serverregeln/); assert.match(M('📜・règles')[1].content, /Fan Content Policy/);
  assert.ok(Object.values(S.msgs).flat().every(x => x.content.length < 2000 && x.flags === 4 && x.allowed_mentions.parse.length === 0));
  ok('messages : accueil, règles FR + EN, règles traduites dans chaque langue (zh : 2), renvois justes, sans mention ni aperçu');

  assert.deepEqual(S.hooks.map(h => [h.name, h.channel_id]), [['GitHub', byName('🆕・changelog').id], ['GitHub issues', byName('🐞・bug-triage').id]]);
  assert.match(r1.out, /#changelog, événement « Releases » : https:\/\/discord\.com\/api\/webhooks\/\d+\/tok\d+\/github/);
  assert.match(r1.out, /Lien d'invitation permanent : https:\/\/discord\.gg\/MaNaOrB/); assert.equal(S.invites[0].channel.id, byName('👋・bienvenue').id);
  ok('webhooks GitHub (#changelog, #bug-triage) affichés avec /github, lien d\'invitation permanent');
}
/* ── Relancé : rien en double, rien de réécrit ── */
{
  const before = { roles: S.roles.length, chans: S.channels.length, automod: S.automod.length, invites: S.invites.length, hooks: S.hooks.length };
  const ids0 = JSON.stringify(S.onboarding.prompts.map(p => [p.id, p.options.map(o => o.id)]));
  S.msgs[byName('👋・bienvenue').id][0].content = 'ancien texte'; S.calls.length = 0;
  const r2 = await run({ DISCORD_TOKEN: TOKEN }); assert.equal(r2.code, 0, r2.out);
  assert.deepEqual({ roles: S.roles.length, chans: S.channels.length, automod: S.automod.length, invites: S.invites.length, hooks: S.hooks.length }, before, 'rien en double');
  assert.deepEqual(S.calls.filter(c => /^(POST|PATCH) .*\/(channels|roles|auto-moderation)(\/\d+)?$/.test(c)), [], 'salons, rôles, AutoMod : rien de réécrit');
  assert.equal(JSON.stringify(S.onboarding.prompts.map(p => [p.id, p.options.map(o => o.id)])), ids0, 'accueil : mêmes identifiants (réponses des membres gardées)');
  assert.notEqual(S.msgs[byName('👋・bienvenue').id][0].content, 'ancien texte'); assert.match(r2.out, /message d'accueil \(mis à jour\)/);
  ok('relancé : rien en double, rien de réécrit, accueil remis à jour, identifiants de l\'accueil gardés');
}

/* ── Serveur de l'ancienne version : repris sans doublon ── */
{
  fresh(); S.limited = true; S.guild.features = ['COMMUNITY'];
  const team = { id: '700', name: 'Équipe', permissions: String((1n << 13n) | MENTION), color: 0x9fb4ff, hoist: true, position: 2 }, tester = { id: '701', name: 'Testeur', permissions: '0', color: 0xf0b45a, hoist: true, position: 1 };
  S.roles.find(x => x.id === BOTROLE).position = 4; S.roles.find(x => x.id === TICKETROLE).position = 3; S.roles.push(team, tester);
  const RO = [{ id: G, type: 0, allow: '0', deny: String(SEND) }, { id: '700', type: 0, allow: String(SEND), deny: '0' }];
  const t = (id, name) => ({ id, name, emoji_name: '', moderated: false });
  S.channels.push(
    { id: '601', name: 'Bienvenue', type: 4, position: 0, permission_overwrites: RO }, { id: '602', name: 'Appli', type: 4, position: 1, permission_overwrites: [] },
    { id: '603', name: 'Communauté', type: 4, position: 2, permission_overwrites: [] }, { id: '604', name: 'Équipe', type: 4, position: 3, permission_overwrites: [] },
    { id: '605', name: 'Tickets', type: 4, position: 4, permission_overwrites: [] }, { id: '606', name: 'ouvrir-un-ticket', type: 0, parent_id: '605', position: 0 },
    { id: '610', name: 'bienvenue', type: 0, parent_id: '601', position: 0 }, { id: '611', name: 'règles', type: 0, parent_id: '601', position: 1 }, { id: '612', name: 'annonces', type: 5, parent_id: '601', position: 2 },
    { id: '620', name: 'aide', type: 15, parent_id: '602', position: 0, flags: 0, available_tags: [t('801', 'Scan')] },
    { id: '621', name: 'bugs', type: 15, parent_id: '602', position: 1, flags: 0, available_tags: ['Scan', 'Collection', 'Decks', 'Prix', 'Compte et synchro', 'Autre', 'Corrigé', 'Prochaine version'].map((x, i) => t(String(810 + i), x)) },
    { id: '622', name: 'idées', type: 15, parent_id: '602', position: 2, flags: 0, available_tags: [] },
    { id: '630', name: 'général', type: 0, parent_id: '603', position: 0, rate_limit_per_user: 10 }, { id: '631', name: 'ouvertures', type: 0, parent_id: '603', position: 1 },
    { id: '632', name: 'decks', type: 0, parent_id: '603', position: 2 }, { id: '633', name: 'échanges', type: 0, parent_id: '603', position: 3 }, { id: '634', name: 'english', type: 0, parent_id: '603', position: 4 },
    { id: '635', name: 'Commander', type: 2, parent_id: '603', position: 0 }, { id: '640', name: 'modération', type: 0, parent_id: '604', position: 0 });
  S.msgs['611'] = [{ id: '900', author: { id: BOT }, content: 'anciennes règles' }]; S.msgs['610'] = [{ id: '901', author: { id: BOT }, content: 'ancien accueil' }];
  S.automod.push({ id: '950', name: 'Spam', trigger_type: 3, actions: [{ type: 1 }], exempt_roles: ['700'], enabled: true });
  const r3 = await run({ DISCORD_TOKEN: TOKEN }); assert.equal(r3.code, 0, r3.out);
  assert.equal(role('Modo').id, '700', 'Équipe renommé Modo'); assert.equal(role('Testeur').id, '701'); assert.ok(!role('Équipe'));
  const got = { '601': '╔ BIENVENUE ╝', '602': '╔ SUPPORT ╝', '603': '╔ COMMUNAUTÉ ╝', '604': '╔ ÉQUIPE ╝', '610': '👋・bienvenue', '611': '📜・règles', '612': '📢・annonces', '620': '🆘・aide', '621': '🐞・bugs', '622': '💡・idées',
    '630': '💬・général', '631': '📦・ouvertures', '632': '🃏・decks', '633': '🔁・échanges', '634': '💬・general', '635': '🔊 Table 1', '640': '🛡️・modération' };
  for (const [cid, name] of Object.entries(got)) assert.equal(S.channels.find(c => c.id === cid).name, name, cid);
  assert.equal(byName('💬・général').parent_id, byName('╔ 🇫🇷 FRANÇAIS ╝').id); assert.equal(byName('💬・general').parent_id, byName('╔ 🇬🇧 ENGLISH ╝').id); assert.equal(byName('🔊 Table 1').parent_id, byName('╔ JOUER ╝').id);
  assert.equal(byName('💬・général').rate_limit_per_user, 0);
  assert.equal(S.channels.filter(c => c.name === '📜・règles').length, 1, 'pas de doublon');
  const bt = byName('🐞・bugs').available_tags; assert.equal(bt.length, 19); assert.equal(bt.find(x => x.name === 'Corrigé').id, '816', 'étiquettes gardées (mêmes identifiants)'); assert.ok(bt.find(x => x.name === 'Corrigé').moderated);
  assert.ok(!S.calls.some(c => /\/channels\/60[56]$/.test(c)), 'salons du bot de tickets jamais touchés'); assert.equal(S.channels.find(c => c.id === '606').parent_id, '605');
  assert.deepEqual(S.msgs['611'].map(x => x.id)[0], '900', 'règles : ancien message remis à jour sur place'); assert.equal(S.msgs['611'].length, 2); assert.equal(S.msgs['610'][0].id, '901');
  assert.equal(S.automod.find(a => a.id === '950').exempt_roles.length, 3, 'AutoMod existante mise à jour'); assert.equal(S.automod.length, 5);
  ok('serveur de l\'ancienne version : catégories et salons repris (mêmes identifiants, renommés, déplacés), Équipe → Modo, étiquettes et messages gardés, tickets intacts');
}
/* ── Jeton refusé ── */
{
  const r = await run({ DISCORD_TOKEN: 'mauvais' }); assert.equal(r.code, 1); assert.match(r.out, /jeton refusé/); assert.ok(!r.out.includes('mauvais'));
  ok('jeton refusé : message clair, jeton jamais affiché');
}
srv.close();
console.log('\nDISCORD SETUP OK');
