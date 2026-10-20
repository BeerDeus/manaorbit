// Serveur Discord de Mana Orbit : rôles, salons, permissions, mode communauté, AutoMod, messages d'accueil et des règles, lien d'invitation permanent.
// Lancé sur le PC du propriétaire avec le jeton d'un bot à lui (docs/store/sortie.md § 2). Relancé, il ne crée rien en double : il complète et remet à jour
// (textes compris). Jeton : variable d'environnement DISCORD_TOKEN seulement, jamais affiché ni écrit nulle part.
//   PowerShell : $env:DISCORD_TOKEN = "…" puis node tools/discord-setup.mjs          --dry : montre ce qui serait fait, sans rien changer
//   Bot présent sur plusieurs serveurs : node tools/discord-setup.mjs <identifiant du serveur>
// DISCORD_API : autre adresse de l'API (tests/test-discord-setup.mjs, faux Discord). Node 18 ou plus (fetch).
import { readFileSync, existsSync } from 'node:fs';

const API = (process.env.DISCORD_API || 'https://discord.com/api/v10').replace(/\/$/, '');
const TOKEN = String(process.env.DISCORD_TOKEN || '').trim();
const ARGS = process.argv.slice(2), DRY = ARGS.includes('--dry'), GUILD_ARG = ARGS.find(a => /^\d{5,}$/.test(a)) || '';
const PLAY = 'https://play.google.com/store/apps/details?id=app.manaorbit', SITE = 'https://manaorbit.app';
const ICON = new URL('../pwa/icons/icon-512.png', import.meta.url);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Permissions Discord (bits)
const B = n => 1n << BigInt(n);
const VIEW = B(10), SEND = B(11), MENTION_ALL = B(17), THREADS_PUB = B(35), THREADS_PRIV = B(36), SEND_THREADS = B(38);
const TEAM_PERMS = B(1) | B(2) | B(7) | B(13) | MENTION_ALL | B(22) | B(24) | B(34) | B(40);      // expulser, bannir, journal, gérer les messages, @everyone, rendre muet, déplacer, gérer les fils, exclure temporairement
const TX = 0, VOICE = 2, CAT = 4, NEWS = 5, FORUM = 15;

let writes = 0;
async function api(method, path, body) {
  if (DRY && method !== 'GET') { writes++; console.log(`  (essai) ${method} ${path.split('?')[0]}`); return method === 'POST' ? { id: 'essai-' + writes, ...(body || {}) } : (body || null); }
  if (DRY && path.includes('/essai-')) return [];      // objet qui n'existerait qu'après une vraie création
  for (let i = 0; i < 6; i++) {
    const r = await fetch(API + path, { method, headers: { Authorization: 'Bot ' + TOKEN, 'User-Agent': 'DiscordBot (https://manaorbit.app, 1.0)', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (r.status === 429) { const j = await r.json().catch(() => ({})); await sleep(Math.ceil((Number(j.retry_after) || 1) * 1000) + 50); continue; }      // limite de débit : on attend ce que Discord demande
    if (r.status === 204) return null;
    const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { /* réponse non JSON */ }
    if (!r.ok) { const e = new Error(`${method} ${path.split('?')[0]} → ${r.status}${j && j.message ? ' ' + j.message : ''}`); e.status = r.status; e.body = j; throw e; }
    return j;
  }
  throw new Error(`${method} ${path} : refusé trop de fois (limite de débit)`);
}

// ── Textes ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const TOPICS = {
  bienvenue: 'Bienvenue ! Présentation et liens utiles · Welcome and useful links',
  'règles': 'Les règles du serveur · Server rules',
  annonces: 'Nouvelles versions et nouveautés de Mana Orbit · Releases and news',
  'général': 'Magic et Mana Orbit · Magic and Mana Orbit',
  ouvertures: 'Tes ouvertures de boosters et sessions d\'ouverture, photos bienvenues · Your booster openings',
  decks: 'Partage tes decks (liens de l\'appli) · Share your decks',
  'échanges': 'Listes d\'échange (liens de l\'appli). Échanges entre membres, à vos risques : Mana Orbit n\'est pas intermédiaire. · Trade lists, at your own risk',
  english: 'English-speaking chat',
  'modération': 'Équipe : alertes de la modération automatique et messages de Discord',
  aide: 'Une question sur l\'appli : un fil par question, avec l\'étiquette qui va bien. Dis ton téléphone (ou ordinateur) et ta version (Réglages).\nOne thread per question, in French or English.',
  bugs: 'Un bug : un fil par bug. Indique ton appareil, la version (Réglages), ce que tu faisais, ce qui s\'est passé, et une capture si possible. L\'équipe ajoute l\'étiquette Corrigé ou Prochaine version.\nOne thread per bug: device, app version, steps, screenshot.',
  'idées': 'Une idée pour Mana Orbit : un fil par idée, les 👍 aident à choisir. L\'équipe indique où elle en est (Envisagé, Prévu, Fait, Pas pour l\'instant).\nOne thread per idea, upvote with 👍.',
};
const tags = (...l) => l.map(([name, emoji_name, moderated]) => ({ name, emoji_name, moderated: !!moderated }));
const AREAS = [['Scan', '📷'], ['Collection', '🗂️'], ['Decks', '🃏'], ['Prix', '💶'], ['Compte et synchro', '🔄'], ['Autre', '💬']];
const TAGS = {
  aide: tags(...AREAS),
  bugs: tags(...AREAS, ['Corrigé', '✅', 1], ['Prochaine version', '🕐', 1]),
  'idées': tags(['Envisagé', '🤔', 1], ['Prévu', '📌', 1], ['Fait', '✅', 1], ['Pas pour l\'instant', '💤', 1]),
};
const welcome = c => `**Bienvenue sur le Discord de Mana Orbit** 👋
Mana Orbit : scanne tes cartes Magic, suis la valeur de ta collection, construis et partage tes decks.

📲 Google Play : ${PLAY}
🌐 Site : ${SITE}
🔁 Tu viens de ManaBox ? ${SITE}/passer-de-manabox

❓ Une question → <#${c.aide}>
🐞 Un bug → <#${c.bugs}>
💡 Une idée → <#${c['idées']}>
📢 Les nouveautés → <#${c.annonces}>
Commence par lire <#${c['règles']}>.

**Welcome!** Mana Orbit scans your Magic cards, tracks your collection's value and builds your decks.
Questions → <#${c.aide}> · bugs → <#${c.bugs}> · ideas → <#${c['idées']}> · English chat → <#${c.english}>`;
const rulesText = c => `**Règles du serveur**
1. Respect : pas d'insulte, de harcèlement ni de propos discriminatoires.
2. Pas de spam ni de pub sans accord de l'équipe.
3. Échanges et ventes : à vos risques, entre membres ; Mana Orbit n'est pas intermédiaire. Jamais de paiement « entre proches ».
4. Pas de contenu piraté ni de fuite non officielle.
5. Un bug : un fil dans <#${c.bugs}> avec ta version (Réglages) et les étapes.
6. L'équipe peut supprimer un message ou exclure sans préavis.

**Server rules** · Be respectful, no spam or ads, trades at your own risk between members, no pirated content or leaks, bugs in <#${c.bugs}> with your app version. Mods may remove messages or members.

*Mana Orbit est un contenu de fan non officiel autorisé par la Fan Content Policy, ni approuvé ni soutenu par Wizards of the Coast. Unofficial Fan Content permitted under the Fan Content Policy, not approved/endorsed by Wizards.*`;

// ── Installation ─────────────────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  if (!TOKEN) { console.error('DISCORD_TOKEN manquant. PowerShell : $env:DISCORD_TOKEN = "<jeton du bot>" puis relance (docs/store/sortie.md § 2).'); process.exit(1); }
  if (DRY) console.log('Essai : rien n\'est changé sur le serveur.');
  const me = await api('GET', '/users/@me');
  let gid = GUILD_ARG;
  if (!gid) {
    const gs = await api('GET', '/users/@me/guilds');
    if (gs.length !== 1) { console.error(gs.length ? `Le bot est sur ${gs.length} serveurs : donne l'identifiant du bon (node tools/discord-setup.mjs <identifiant>).` : 'Le bot n\'est sur aucun serveur : invite-le d\'abord (lien de l\'étape « OAuth2 », docs/store/sortie.md § 2).'); process.exit(1); }
    gid = gs[0].id;
  }
  const guild = await api('GET', `/guilds/${gid}`);
  console.log(`Serveur « ${guild.name} »`);

  // Rôles (créés sous celui du bot : il peut les gérer et les donner)
  const roles = await api('GET', `/guilds/${gid}/roles`);
  const role = async (name, o) => {
    const body = { name, permissions: String(o.perms), color: o.color, hoist: true, mentionable: false }, r = roles.find(x => x.name === name);
    if (r) { if (BigInt(r.permissions) !== o.perms || r.color !== o.color || !r.hoist) await api('PATCH', `/guilds/${gid}/roles/${r.id}`, body); console.log(`✓ rôle ${name}`); return r.id; }
    const c = await api('POST', `/guilds/${gid}/roles`, body); roles.push(c); console.log(`✓ rôle ${name} (créé)`); return c.id;
  };
  const TEAM = await role('Équipe', { perms: TEAM_PERMS, color: 0x9fb4ff }); await role('Testeur', { perms: 0n, color: 0xf0b45a });
  const every = roles.find(x => x.id === gid);
  if (every && (BigInt(every.permissions) & MENTION_ALL)) { await api('PATCH', `/guilds/${gid}/roles/${gid}`, { permissions: String(BigInt(every.permissions) & ~MENTION_ALL) }); console.log('✓ @everyone : plus de @everyone / @here pour les membres'); }
  if (guild.owner_id) { try { await api('PUT', `/guilds/${gid}/members/${guild.owner_id}/roles/${TEAM}`); console.log('✓ rôle Équipe donné au propriétaire du serveur'); } catch (e) { console.log(`! rôle Équipe à te donner toi-même (${e.message})`); } }

  // Salons
  const chans = await api('GET', `/guilds/${gid}/channels`);
  const ow = (deny, allowTeam) => [{ id: gid, type: 0, allow: '0', deny: String(deny) }, { id: TEAM, type: 0, allow: String(allowTeam), deny: '0' }];
  const RO = ow(SEND | THREADS_PUB | THREADS_PRIV | SEND_THREADS, SEND | THREADS_PUB | SEND_THREADS), PRIV = ow(VIEW, VIEW | SEND);
  const mergeTags = (have, want) => [...have, ...want.filter(t => !have.some(h => h.name === t.name))];
  const chan = async (name, type, o = {}) => {
    const want = { name, type, position: o.pos || 0 };
    if (o.parent) want.parent_id = o.parent;
    if (TOPICS[name] && type !== CAT && type !== VOICE) want.topic = TOPICS[name];
    if (o.rate !== undefined) want.rate_limit_per_user = o.rate;
    want.permission_overwrites = o.ow || [];
    if (TAGS[name] && type === FORUM) want.available_tags = TAGS[name];
    const ex = chans.find(c => c.name === name && (c.type === type || (type === NEWS && c.type === TX))) || (o.was && chans.find(o.was));
    if (!ex) { const c = await api('POST', `/guilds/${gid}/channels`, want); chans.push(c); console.log(`✓ ${type === CAT ? 'catégorie' : 'salon'} ${name} (créé)`); return c; }
    const patch = { ...want }; if (ex.type === type) delete patch.type;      // seul changement de type possible : texte → annonces
    if (ex.available_tags && patch.available_tags) patch.available_tags = mergeTags(ex.available_tags, patch.available_tags);      // étiquettes déjà posées sur des fils : gardées
    Object.assign(ex, await api('PATCH', `/channels/${ex.id}`, patch) || patch); console.log(`✓ ${type === CAT ? 'catégorie' : 'salon'} ${name}`); return ex;
  };
  const W = (await chan('Bienvenue', CAT, { pos: 0, ow: RO })).id, A = (await chan('Appli', CAT, { pos: 1 })).id;
  const C = (await chan('Communauté', CAT, { pos: 2 })).id, E = (await chan('Équipe', CAT, { pos: 3, ow: PRIV })).id;
  const id = {};
  id['règles'] = (await chan('règles', TX, { parent: W, pos: 1, ow: RO })).id;
  id['modération'] = (await chan('modération', TX, { parent: E, pos: 0, ow: PRIV })).id;

  // Mode communauté : annonces, forums, accueil ; exige un salon des règles et un salon pour les messages de Discord (#modération, équipe seulement)
  let community = (guild.features || []).includes('COMMUNITY');
  const settings = { verification_level: 2, explicit_content_filter: 2, default_message_notifications: 1, rules_channel_id: id['règles'], public_updates_channel_id: id['modération'], safety_alerts_channel_id: id['modération'], preferred_locale: 'fr' };
  if (!guild.icon && existsSync(ICON)) settings.icon = 'data:image/png;base64,' + readFileSync(ICON).toString('base64');
  try {
    await api('PATCH', `/guilds/${gid}`, { ...settings, ...(community ? {} : { features: [...(guild.features || []), 'COMMUNITY'] }), description: 'Scanne tes cartes Magic, suis la valeur de ta collection, construis et partage tes decks.' });
    community = true; console.log('✓ réglages : vérification moyenne, filtre de contenu pour tous, notifications @mentions seulement, mode communauté');
  } catch (e) {
    await api('PATCH', `/guilds/${gid}`, { verification_level: 2, explicit_content_filter: 2, default_message_notifications: 1, ...(settings.icon ? { icon: settings.icon } : {}) }).catch(() => {});
    console.log(`! mode communauté non activé (${e.message}) : Paramètres du serveur › Activer la communauté, puis relance le script (annonces et forums).`);
  }

  id.bienvenue = (await chan('bienvenue', TX, { parent: W, pos: 0, ow: RO })).id;
  if (community) {
    id.annonces = (await chan('annonces', NEWS, { parent: W, pos: 2, ow: RO })).id;
    for (const [i, n] of ['aide', 'bugs', 'idées'].entries()) id[n] = (await chan(n, FORUM, { parent: A, pos: i })).id;
  }
  const gen = c => c.type === TX && /^g[eé]n[eé]ral$/i.test(c.name), genVoice = c => c.type === VOICE && /^g[eé]n[eé]ral$/i.test(c.name);
  id['général'] = (await chan('général', TX, { parent: C, pos: 0, rate: 10, was: gen })).id;
  for (const [i, n] of ['ouvertures', 'decks', 'échanges', 'english'].entries()) id[n] = (await chan(n, TX, { parent: C, pos: i + 1 })).id;
  await chan('Commander', VOICE, { parent: C, pos: 5, was: genVoice });
  for (const c of chans.filter(c => c.type === CAT && /^(salons (textuels|vocaux)|text channels|voice channels)$/i.test(c.name))) {      // catégories du serveur neuf, vidées
    if (!chans.some(x => x.parent_id === c.id)) { await api('DELETE', `/channels/${c.id}`); console.log(`✓ catégorie vide « ${c.name} » retirée`); }
  }

  // Modération automatique (règles de Discord ; spam, mentions et listes toutes faites : une seule de chaque par serveur)
  const have = await api('GET', `/guilds/${gid}/auto-moderation/rules`);
  const alert = { type: 2, metadata: { channel_id: id['modération'] } };
  const AUTOMOD = [
    { name: 'Arnaques', trigger_type: 1, trigger_metadata: { keyword_filter: ['*discord.gift*', '*free nitro*', '*nitro gratuit*', '*nitro free*', '*steamcommunity.ru*', '*airdrop*', '*crypto giveaway*', '*giveaway crypto*'] }, actions: [{ type: 1, metadata: { custom_message: 'Message bloqué : il ressemble à une arnaque. · Blocked: looks like a scam.' } }, alert] },
    { name: 'Spam', trigger_type: 3, actions: [{ type: 1 }, alert] },
    { name: 'Mentions en masse', trigger_type: 5, trigger_metadata: { mention_total_limit: 5, mention_raid_protection_enabled: true }, actions: [{ type: 1 }, alert] },
    { name: 'Contenu choquant', trigger_type: 4, trigger_metadata: { presets: [2, 3] }, actions: [{ type: 1 }, alert] },
  ];
  for (const r of AUTOMOD) {
    if (have.some(h => h.name === r.name || (r.trigger_type !== 1 && h.trigger_type === r.trigger_type))) { console.log(`✓ AutoMod ${r.name}`); continue; }
    try { await api('POST', `/guilds/${gid}/auto-moderation/rules`, { ...r, event_type: 1, enabled: true, exempt_roles: [TEAM] }); console.log(`✓ AutoMod ${r.name} (créée)`); }
    catch (e) { console.log(`! AutoMod ${r.name} : ${e.message}`); }
  }

  // Messages : remis à jour s'ils existent déjà (le plus récent du bot dans le salon)
  const say = async (ch, content, what) => {
    const msgs = await api('GET', `/channels/${ch}/messages?limit=50`), mine = (msgs || []).find(m => m.author && m.author.id === me.id);
    const body = { content, allowed_mentions: { parse: [] }, flags: 4 };      // 4 : sans aperçu des liens
    if (!mine) { await api('POST', `/channels/${ch}/messages`, body); console.log(`✓ message ${what} (posté)`); }
    else if (mine.content !== content) { await api('PATCH', `/channels/${ch}/messages/${mine.id}`, body); console.log(`✓ message ${what} (mis à jour)`); }
    else console.log(`✓ message ${what}`);
  };
  const ref = new Proxy(id, { get: (o, k) => o[k] || o['général'] });      // sans mode communauté : renvois vers #général
  await say(id['règles'], rulesText(ref), 'des règles');
  await say(id.bienvenue, welcome(ref), 'd\'accueil');

  // Lien d'invitation permanent (#bienvenue)
  let inv = null;
  try { inv = ((await api('GET', `/guilds/${gid}/invites`)) || []).find(i => i.channel && i.channel.id === id.bienvenue && i.max_age === 0 && i.max_uses === 0 && !i.temporary); } catch { /* liste illisible : on en crée un */ }
  if (!inv) inv = await api('POST', `/channels/${id.bienvenue}/invites`, { max_age: 0, max_uses: 0, temporary: false, unique: false });
  console.log(`\nLien d'invitation permanent : ${inv && inv.code ? 'https://discord.gg/' + inv.code : '(créé au vrai lancement)'}`);
  console.log(`Rôle Testeur : à donner à la main (clic droit sur un membre › Rôles). ${community ? '' : 'Mode communauté à activer, puis relancer. '}Le bot peut ensuite être expulsé du serveur.`);
  if (DRY) console.log(`Essai terminé : ${writes} changement${writes > 1 ? 's' : ''} prévu${writes > 1 ? 's' : ''}.`);
}

main().catch(e => {
  const hint = e.status === 401 ? ' : jeton refusé, recopie-le (Bot › Reset Token)' : e.status === 403 ? ' : le bot n\'a pas les droits, réinvite-le avec la permission Administrateur' : '';
  console.error('Échec : ' + e.message + hint); process.exit(1);
});
