// Mana Orbit — commandes slash du bot Discord (/moi, /partie) par l'« Interactions Endpoint URL » (HTTP : ni passerelle ni intention). Créé par discord-srv.mjs
// (discordMake → dscCmdMake, avec ses helpers : call, guild, load, links…), branché par proxy.mjs (POST /api/discord/interactions), testé par tests/test-discord-cmd.mjs
// (faux Discord, vrai proxy.mjs). Aucune dépendance npm (node:crypto).
//   · Chaque requête de Discord est signée (Ed25519 : X-Signature-Ed25519 sur X-Signature-Timestamp + corps brut) avec la clé publique de l'application
//     (DISCORD_PUBLIC_KEY, portail › General Information › Public Key, 64 caractères hexadécimaux) : signature fausse ou horodatage de plus de 5 min → 401 ;
//     PING (type 1) → PONG. Sans clé valable, ou bot coupé : route 404 et aucune commande enregistrée. Budget par réseau (600 par minute).
//   · Au démarrage, les deux commandes sont enregistrées sur le serveur (PUT /applications/{app}/guilds/{g}/commands : écrasement groupé, idempotent ; app :
//     DISCORD_CLIENT_ID, sinon GET /applications/@me), noms et descriptions en fr, en-US, de, es-ES, it, pt-BR. Échec : une ligne de journal, le reste continue.
//   · Réponse en moins de replyMs (2,5 s ; Discord attend 3 s), sinon « Mana Orbit réfléchit… » (type 5) puis le message posé par le webhook de l'interaction.
//     Textes en français, en anglais si la langue de Discord de la personne n'est pas le français.
//   · /moi [public] : compte Mana Orbit lié à ce compte Discord (liaisons de discord-srv.mjs, cherchées par id Discord) → niveau, Carte mystère (badges vérifiés :
//     parties, séries, podiums, top 100), compteur de vie (parties, victoires) ; rien d'autre du compte (ni collection, ni UID, ni empreinte). Réponse visible
//     de la personne seule (éphémère), sauf public: vrai. Pas lié : comment lier (éphémère).
//   · /partie [code] [format] [quand] [ping] : avec le code d'une salle d'attente du compteur de vie (coup d'œil de proxy.mjs) → « 🎲 Table ouverte » (format,
//     places, joueurs déjà visibles au coup d'œil, bouton « Rejoindre » vers ?table=<code>) ; sans code → « @membre cherche une partie de <format> <quand> »
//     (bouton vers le compteur de vie de l'appli, ?compteur=<format>). ping : le rôle 🎲 LFG (trouvé par son nom), une fois par 30 min par membre au plus
//     (sinon posté sans ping, note visible de lui seul). allowed_mentions : ce rôle seulement ; texte de l'utilisateur sur une ligne, 60 caractères, Markdown
//     neutralisé, mots du filtre des pseudos refusés. Code inconnu, expiré, partie commencée : réponse éphémère ; 10 codes faux par heure et par membre.
// Jamais dans un journal : jeton du bot, jeton d'interaction, id Discord, empreinte ou UID d'un compte.
import { createPublicKey, verify as edVerify } from 'node:crypto';

const ED_SPKI = Buffer.from('302a300506032b6570032100', 'hex');      // en-tête DER d'une clé publique Ed25519 (SPKI) : suivie des 32 octets bruts
const EPH = 64, NO_EMBEDS = 4, PONG = 1, REPLY = 4, DEFER = 5;
const ID_RE = /^\d{5,25}$/, CODE_RE = /^[A-HJKMNP-Z2-9]{6}$/, TOKEN_RE = /^[\w.-]{20,1000}$/, HASH_RE = /^(a_)?[0-9a-f]{32}$/;
export const CMD_SITE = 'https://manaorbit.app/';
export const CMD_JEUX = ['commander', 'standard', 'libre'];
/** Textes d'une commande dans les 6 langues de Discord gardées (fr, en-US, de, es-ES, it, pt-BR). */
const L6 = (fr, en, de, es, it, pt) => ({ fr, 'en-US': en, de, 'es-ES': es, it, 'pt-BR': pt });
const opt = (type, name, names, desc, o = {}) => ({ type, name, name_localizations: names, description: desc.fr, description_localizations: desc, required: false, ...o });
/** Commandes du serveur (PUT …/commands : la liste entière, dans cet ordre). Noms et options par défaut en français (ce que Discord renvoie à l'appel). */
export const DSC_CMDS = [
  { type: 1, name: 'moi', name_localizations: L6('moi', 'me', 'ich', 'yo', 'io', 'eu'),
    description: 'Ton profil Mana Orbit : niveau, Carte mystère, compteur de vie',
    description_localizations: L6('Ton profil Mana Orbit : niveau, Carte mystère, compteur de vie', 'Your Mana Orbit profile: level, Mystery card, life counter', 'Dein Mana-Orbit-Profil: Level, Mysterykarte, Lebenszähler',
      'Tu perfil de Mana Orbit: nivel, carta misteriosa, contador de vida', 'Il tuo profilo Mana Orbit: livello, carta misteriosa, contavita', 'Seu perfil do Mana Orbit: nível, carta mistério, contador de vida'),
    options: [opt(5, 'public', L6('public', 'public', 'öffentlich', 'público', 'pubblico', 'público'), L6('Montrer la réponse à tout le salon (sinon toi seul la vois)', 'Show the reply to the whole channel (otherwise only you see it)',
      'Antwort im ganzen Kanal zeigen (sonst siehst nur du sie)', 'Mostrar la respuesta a todo el canal (si no, solo la ves tú)', 'Mostra la risposta a tutto il canale (altrimenti la vedi solo tu)', 'Mostrar a resposta para todo o canal (senão só você vê)'))] },
  { type: 1, name: 'partie', name_localizations: L6('partie', 'game', 'partie', 'partida', 'partita', 'partida'),
    description: 'Annoncer une table du compteur de vie, ou chercher des joueurs',
    description_localizations: L6('Annoncer une table du compteur de vie, ou chercher des joueurs', 'Announce a life counter table, or look for players', 'Einen Tisch des Lebenszählers ankündigen oder Mitspieler suchen',
      'Anunciar una mesa del contador de vida o buscar jugadores', 'Annuncia un tavolo del contavita o cerca giocatori', 'Anunciar uma mesa do contador de vida ou procurar jogadores'),
    options: [
      opt(3, 'code', L6('code', 'code', 'code', 'código', 'codice', 'código'), L6('Code de la table (6 caractères, sous son QR code dans l\'appli)', 'Table code (6 characters, under its QR code in the app)', 'Tischcode (6 Zeichen, unter seinem QR-Code in der App)',
        'Código de la mesa (6 caracteres, bajo su código QR en la app)', 'Codice del tavolo (6 caratteri, sotto il suo codice QR nell\'app)', 'Código da mesa (6 caracteres, abaixo do QR code no app)'), { min_length: 6, max_length: 9 }),
      opt(3, 'format', L6('format', 'format', 'format', 'formato', 'formato', 'formato'), L6('Format de jeu', 'Game format', 'Spielformat', 'Formato de juego', 'Formato di gioco', 'Formato de jogo'), { choices: [
        { name: 'Commander', value: 'commander' }, { name: 'Standard', value: 'standard' },
        { name: 'Libre', value: 'libre', name_localizations: L6('Libre', 'Free-form', 'Frei', 'Libre', 'Libero', 'Livre') }] }),
      opt(3, 'quand', L6('quand', 'when', 'wann', 'cuándo', 'quando', 'quando'), L6('Quand ? (ex. « ce soir 21 h »)', 'When? (e.g. "tonight 9 pm")', 'Wann? (z. B. „heute Abend 21 Uhr“)', '¿Cuándo? (ej. «esta noche 21 h»)',
        'Quando? (es. «stasera alle 21»)', 'Quando? (ex. «hoje à noite 21 h»)'), { max_length: 60 }),
      opt(5, 'ping', L6('ping', 'ping', 'ping', 'ping', 'ping', 'ping'), L6('Prévenir le rôle 🎲 LFG (une fois par 30 min)', 'Notify the 🎲 LFG role (once every 30 min)', 'Die Rolle 🎲 LFG benachrichtigen (einmal alle 30 Min.)',
        'Avisar al rol 🎲 LFG (una vez cada 30 min)', 'Avvisa il ruolo 🎲 LFG (una volta ogni 30 min)', 'Avisar o cargo 🎲 LFG (uma vez a cada 30 min)')),
    ] },
];

/* Textes des réponses : français, ou anglais (toute autre langue de Discord). */
const TX = {
  fr: {
    unlinked: 'Ton compte Discord n\'est lié à aucun compte Mana Orbit.\nPour le lier : ouvre l\'appli, puis **Compte et réglages › Discord › Lier mon compte Discord**. Refais ensuite `/moi`.',
    openApp: 'Ouvrir Mana Orbit', title: 'Profil Mana Orbit', level: 'Niveau', noLevel: 'pas encore de niveau', mystery: '🔮 Carte mystère', life: '❤️ Compteur de vie',
    myst: b => b.played ? `Parties jouées : **${b.played}**\nSérie en cours : **${b.cur}** · meilleure : **${b.best}**\nPodiums : **${b.podium}** · top 100 : **${b.top100}**` : 'Pas encore jouée.',
    games: p => p.n ? `Parties : **${p.n}** · victoires : **${p.wins}**` : 'Pas encore de partie enregistrée.',
    jeu: { commander: 'Commander', standard: 'Standard', libre: 'Libre' }, pv: n => `${n} PV`,
    table: c => `🎲 Table ouverte · ${c}`, opened: who => `🎲 **Table ouverte** par ${who}`, fmt: 'Format', seats: 'Places', when: 'Quand', players: 'Joueurs', host: 'hôte', guest: 'invité',
    taken: (t, f) => `${t} prise${t > 1 ? 's' : ''} · ${f ? `${f} libre${f > 1 ? 's' : ''}` : 'complète'}`, join: 'Rejoindre',
    lfg: (who, jeu, q) => `🎲 ${who} cherche une partie${jeu ? ' de ' + jeu : ''}${q ? ' ' + q : ''}`, counter: 'Ouvrir le compteur de vie',
    noRoom: 'Table introuvable : code inconnu, ou salle d\'attente fermée (30 min sans activité). Vérifie le code sous le QR code de la table dans l\'appli.',
    started: 'Cette partie a déjà commencé : la table n\'accepte plus personne.', noCode: 'Partie de l\'appli indisponible pour le moment : annonce-la sans code.',
    badText: 'Texte de « quand » refusé : reformule-le.', tooMany: 'Trop de codes faux : réessaie dans un moment.',
    pingWait: m => `Annonce postée sans ping : le rôle 🎲 LFG ne peut être prévenu qu'une fois par 30 min (encore ${m} min).`, noRole: 'Annonce postée sans ping : rôle 🎲 LFG introuvable sur le serveur.',
    unknown: 'Commande inconnue.', down: 'Mana Orbit ne répond pas pour le moment : réessaie dans une minute.'
  },
  en: {
    unlinked: 'Your Discord account isn\'t linked to a Mana Orbit account.\nTo link it: open the app, then **Account and settings › Discord › Link my Discord account**. Then run `/me` again.',
    openApp: 'Open Mana Orbit', title: 'Mana Orbit profile', level: 'Level', noLevel: 'no level yet', mystery: '🔮 Mystery card', life: '❤️ Life counter',
    myst: b => b.played ? `Games played: **${b.played}**\nCurrent streak: **${b.cur}** · best: **${b.best}**\nPodiums: **${b.podium}** · top 100: **${b.top100}**` : 'Not played yet.',
    games: p => p.n ? `Games: **${p.n}** · wins: **${p.wins}**` : 'No game saved yet.',
    jeu: { commander: 'Commander', standard: 'Standard', libre: 'Free-form' }, pv: n => `${n} life`,
    table: c => `🎲 Open table · ${c}`, opened: who => `🎲 **Open table** by ${who}`, fmt: 'Format', seats: 'Seats', when: 'When', players: 'Players', host: 'host', guest: 'guest',
    taken: (t, f) => `${t} taken · ${f ? `${f} free` : 'full'}`, join: 'Join',
    lfg: (who, jeu, q) => `🎲 ${who} is looking for a${jeu ? ' ' + jeu : ''} game${q ? ' — ' + q : ''}`, counter: 'Open the life counter',
    noRoom: 'Table not found: unknown code, or the waiting room has closed (30 min without activity). Check the code under the table\'s QR code in the app.',
    started: 'This game has already started: the table no longer takes players.', noCode: 'App games are unavailable right now: announce it without a code.',
    badText: '"when" text refused: please rephrase it.', tooMany: 'Too many wrong codes: try again in a while.',
    pingWait: m => `Posted without a ping: the 🎲 LFG role can only be notified once every 30 min (${m} min left).`, noRole: 'Posted without a ping: 🎲 LFG role not found on the server.',
    unknown: 'Unknown command.', down: 'Mana Orbit isn\'t responding right now: try again in a minute.'
  },
};

/** Clé publique de l'application (64 caractères hexadécimaux) → KeyObject Ed25519 ; sinon null. */
export function dscEdKey(hex) {
  const h = String(hex || '').trim();
  if (!/^[0-9a-f]{64}$/i.test(h)) return null;
  try { return createPublicKey({ key: Buffer.concat([ED_SPKI, Buffer.from(h, 'hex')]), format: 'der', type: 'spki' }); } catch (e) { return null; }
}

/** Crée les commandes. o : { on (bot actif), publicKey (DISCORD_PUBLIC_KEY), clientId, call, guild, load, links (helpers de discordMake), line, md, fold,
 *  json, readBody, rateWait, now, sleep, log, profile (empreinte → { lv, badges } : daily-srv.mjs), parties (empreinte → { n, wins } : proxy.mjs, historique Firestore),
 *  peek (code → coup d'œil de la salle d'attente ou null : proxy.mjs), tableLink (code → ?table=), bad (mot du filtre ?), site, replyMs (2,5 s), followMs (0,5 s),
 *  skewMs (5 min), perMin (600), pingMs (30 min), badPerH (10) }. */
export function dscCmdMake(o = {}) {
  const KEY = dscEdKey(o.publicKey), ON = !!(o.on && KEY), CID = String(o.clientId || '').trim();
  const json = o.json, readBody = o.readBody, rateWait = o.rateWait || (() => 0), now = o.now || Date.now, log = o.log || console, call = o.call;
  const sleep = o.sleep || (ms => new Promise(r => setTimeout(r, ms))), line = o.line, md = o.md, fold = o.fold;
  const SITE = String(o.site || CMD_SITE).replace(/\/?$/, '/'), REPLY_MS = o.replyMs ?? 2500, FOLLOW_MS = o.followMs ?? 500, SKEW = o.skewMs ?? 300e3;
  const PER_MIN = Number(o.perMin ?? 600), PING_MS = o.pingMs ?? 30 * 60e3, BAD_H = Number(o.badPerH ?? 10);
  const S = { reg: null, ping: new Map(), bad: new Map() };
  const cut = (s, n) => [...s].slice(0, n).join('');
  const linkBtn = (label, url) => ({ type: 1, components: [{ type: 2, style: 5, label, url }] });

  /* ── Signature, PING, envoi de la réponse ── */
  function sigOk(req, raw) {
    const sig = String(req.headers['x-signature-ed25519'] || ''), ts = String(req.headers['x-signature-timestamp'] || '');
    if (!/^[0-9a-f]{128}$/i.test(sig) || !/^\d{1,12}$/.test(ts)) return false;
    if (Math.abs(now() - Number(ts) * 1000) > SKEW) return false;      // trop vieux (ou d'avance) : une requête rejouée est refusée
    try { return edVerify(null, Buffer.concat([Buffer.from(ts), raw]), KEY, Buffer.from(sig, 'hex')); } catch (e) { return false; }
  }
  /** Webhook de l'interaction (réponse différée, note de suivi) : application et jeton de la requête signée ; jamais dans un journal. */
  const hook = it => `/webhooks/${it.application_id}/${encodeURIComponent(it.token)}`;
  const hookOk = it => ID_RE.test(String(it.application_id || '')) && TOKEN_RE.test(String(it.token || ''));
  /** Message éphémère de suivi (note du ping), après la réponse. */
  function follow(it, content) {
    if (!content || !hookOk(it)) return;
    sleep(FOLLOW_MS).then(() => call('POST', hook(it), { content, flags: EPH, allowed_mentions: { parse: [] } }))
      .catch(e => log.warn('Discord : note de la commande non envoyée (' + e.message + ')'));
  }
  /** Réponse différée arrivée : message d'origine remplacé ; éphémère alors qu'on attendait un message public (erreur) : « réfléchit… » effacé, note éphémère. */
  async function late(it, r, deferEph) {
    if (!hookOk(it)) return;
    try {
      const { flags, ...msg } = r.msg;
      if (r.eph && !deferEph) { await call('DELETE', hook(it) + '/messages/@original').catch(() => {}); await call('POST', hook(it), { ...msg, flags: EPH }); }
      else await call('PATCH', hook(it) + '/messages/@original', msg);
      if (r.note) follow(it, r.note);
    } catch (e) { log.warn('Discord : réponse différée non envoyée (' + e.message + ')'); }
  }

  /* ── /moi ── */
  /** Id Discord → empreinte du compte Mana Orbit lié (le plus récemment vérifié s'il y en a plusieurs) ; '' sinon. */
  async function tagOf(id) {
    let best = '', at = -1;
    for (const [tag, x] of await o.links()) if (x && String(x.id) === id && (Number(x.at) || 0) > at) { best = tag; at = Number(x.at) || 0; }
    return best;
  }
  /** Promesse bornée : trop lente → erreur (la ligne est alors omise). */
  const within = (p, ms) => { let t; return Promise.race([Promise.resolve(p), new Promise((_, no) => { t = setTimeout(() => no(new Error('trop lent')), ms); })]).finally(() => clearTimeout(t)); };
  async function moi(it, user, T, eph) {
    const tag = user.id ? await tagOf(user.id) : '';
    if (!tag) return { eph: true, msg: { content: T.unlinked, components: [linkBtn(T.openApp, SITE)], flags: EPH, allowed_mentions: { parse: [] } } };
    const [pf, pt] = await Promise.all([o.profile ? within(o.profile(tag), 8000).catch(e => { log.warn('Discord : /moi, profil illisible (' + e.message + ')'); return null; }) : null,
      o.parties ? within(o.parties(tag), 4000).catch(e => { log.warn('Discord : /moi, parties du compteur de vie omises (' + e.message + ')'); return null; }) : null]);
    const b = {}; for (const x of (pf && Array.isArray(pf.badges) ? pf.badges : [])) b[x.id] = x;
    const n = k => Math.max(0, Math.floor(Number(b[k] && b[k].n) || 0)), lv = Math.max(0, Math.floor(Number(pf && pf.lv) || 0));
    const fields = [{ name: T.level, value: lv ? `**${lv}**` : T.noLevel, inline: false },
      { name: T.mystery, value: T.myst({ played: n('played'), best: n('streak'), cur: Math.max(0, Math.floor(Number(b.streak && b.streak.cur) || 0)), podium: n('podium'), top100: n('top100') }) }];
    if (pt && Number.isFinite(Number(pt.n))) fields.push({ name: T.life, value: T.games({ n: Math.max(0, Math.floor(pt.n)), wins: Math.max(0, Math.floor(Number(pt.wins) || 0)) }) });
    const name = cut(line((it.member && it.member.nick) || user.global_name || user.username || ''), 80) || 'Mana Orbit';
    const icon = HASH_RE.test(String(user.avatar || '')) ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : undefined;
    const embed = { author: { name, ...(icon ? { icon_url: icon } : {}) }, title: T.title, url: SITE, color: 0x8b5cf6, fields, footer: { text: 'manaorbit.app' } };
    return { eph, msg: { embeds: [embed], allowed_mentions: { parse: [] }, ...(eph ? { flags: EPH } : {}) } };
  }

  /* ── /partie ── */
  /** Codes faux d'un membre (badPerH par heure, seau rechargé en continu) : 0 si permis, sinon secondes à attendre ; hit : un code faux de plus. */
  function badWait(id, hit) {
    if (!(BAD_H > 0)) return 0;
    const t = now(); let b = S.bad.get(id);
    if (!b) { if (S.bad.size > 5000) for (const [k, v] of S.bad) if (t - v.t > 3600e3) S.bad.delete(k); b = { n: BAD_H, t }; S.bad.set(id, b); }
    b.n = Math.min(BAD_H, b.n + (t - b.t) * BAD_H / 3600e3); b.t = t;
    if (hit) { b.n = Math.max(0, b.n - 1); return 0; }
    return b.n >= 1 ? 0 : Math.max(1, Math.ceil((1 - b.n) * 3600 / BAD_H));
  }
  /** Rôle « 🎲 LFG » du serveur (nom sans emoji, casse ni accents) ; null s'il n'existe pas. */
  async function lfgRole() {
    const d = await o.load();
    return d.roles.find(r => r && r.id !== d.gid && fold(r.name).replace(/[^\p{L}\p{N}]+/gu, '') === 'lfg') || null;
  }
  const err = (T, k) => ({ eph: true, msg: { content: T[k], flags: EPH, allowed_mentions: { parse: [] } } });
  async function partie(it, user, T, op) {
    const who = user.id ? `<@${user.id}>` : md(cut(line(user.global_name || user.username || '?'), 40));
    const q = typeof op.quand === 'string' ? cut(line(op.quand), 60) : '';
    if (q && o.bad && o.bad(q)) return err(T, 'badText');
    let jeu = CMD_JEUX.includes(op.format) ? op.format : '', room = null, code = '';
    if (typeof op.code === 'string' && op.code.trim()) {
      if (!o.peek) return err(T, 'noCode');
      if (badWait(user.id || '?')) return err(T, 'tooMany');
      code = op.code.toUpperCase().replace(/[\s-]/g, '');
      room = CODE_RE.test(code) ? await o.peek(code) : null;
      if (!room || (room.st !== 'wait' && room.st !== 'live')) { badWait(user.id || '?', true); return err(T, 'noRoom'); }
      if (room.st !== 'wait') return err(T, 'started');
      jeu = CMD_JEUX.includes(room.jeu) ? room.jeu : 'commander';      // le format de la salle l'emporte
    }
    let role = '', note = '';
    if (op.ping === true) {
      const last = S.ping.get(user.id) || 0, left = PING_MS - (now() - last);
      if (last && left > 0) note = T.pingWait(Math.max(1, Math.ceil(left / 60e3)));
      else {
        const r = await lfgRole().catch(e => { log.warn('Discord : /partie, rôles illisibles (' + e.message + ')'); return null; });
        if (!r) note = T.noRole;
        else { role = String(r.id); if (S.ping.size > 5000) for (const [k, v] of S.ping) if (now() - v > PING_MS) S.ping.delete(k); S.ping.set(user.id, now()); }
      }
    }
    const pre = role ? `<@&${role}> ` : '', mentions = { parse: [], roles: role ? [role] : [] }, jn = jeu ? T.jeu[jeu] : '';
    if (!room) return { eph: false, note, msg: { content: pre + T.lfg(who, jn, md(q)), components: [linkBtn(T.counter, SITE + '?compteur=' + (jeu || '1'))], allowed_mentions: mentions, flags: NO_EMBEDS } };
    const link = (o.tableLink && o.tableLink(code)) || SITE + '?table=' + code;
    const places = (Array.isArray(room.places) ? room.places : []).slice(0, 8), free = Array.isArray(room.free) ? room.free.length : 0;
    const pl = places.map(p => `${Math.floor(Number(p.pos)) || '?'}. ${md(cut(line(p.n || ''), 24)) || '—'}${p.h ? ` (${T.host})` : p.k === 'invite' ? ` (${T.guest})` : ''}`).join('\n');
    const fields = [{ name: T.fmt, value: `${jn} · ${T.pv(Math.floor(Number(room.format)) || 0)}`, inline: true }, { name: T.seats, value: T.taken(places.length, free), inline: true },
      ...(q ? [{ name: T.when, value: md(q), inline: true }] : []), ...(pl ? [{ name: T.players, value: pl.slice(0, 1024) }] : [])];
    const embed = { title: T.table(code), url: link, color: 0x8b5cf6, fields };
    return { eph: false, note, msg: { content: pre + T.opened(who), embeds: [embed], components: [linkBtn(T.join, link)], allowed_mentions: mentions } };
  }

  /* ── POST /api/discord/interactions ── */
  async function interactions(req, res) {
    if (!ON) return json(res, 404, { error: 'not_found' });
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
    const w = rateWait(req, 'dscint', PER_MIN, 60e3); if (w) return json(res, 429, { error: 'rate_limited', retry: w }, { 'Retry-After': String(w) });
    let raw; try { raw = await readBody(req, 128 * 1024); } catch (e) { return json(res, e.status === 413 ? 413 : 400, { error: e.status === 413 ? 'too_large' : 'bad_request' }); }
    if (!sigOk(req, raw)) return json(res, 401, { error: 'bad_signature', message: 'invalid request signature' });
    let it; try { it = JSON.parse(raw.toString('utf8')); } catch (e) { return json(res, 400, { error: 'bad_request' }); }
    if (!it || typeof it !== 'object' || Array.isArray(it)) return json(res, 400, { error: 'bad_request' });
    if (it.type === 1) return json(res, 200, { type: PONG });
    if (it.type !== 2) return json(res, 400, { error: 'unsupported' });      // ni composant ni autocomplétion : les boutons sont des liens
    const T = /^fr/i.test(String(it.locale || it.guild_locale || 'fr')) ? TX.fr : TX.en, d = it.data && typeof it.data === 'object' ? it.data : {};
    const u = (it.member && it.member.user) || it.user || {}, user = { id: ID_RE.test(String(u.id || '')) ? String(u.id) : '', username: u.username, global_name: u.global_name, avatar: u.avatar };
    const op = {}; for (const x of Array.isArray(d.options) ? d.options : []) if (x && typeof x.name === 'string') op[x.name] = x.value;
    let eph = true, job;
    if (d.name === 'moi') { eph = op.public !== true; job = () => moi(it, user, T, eph); }
    else if (d.name === 'partie') { eph = false; job = () => partie(it, user, T, op); }
    else return json(res, 200, { type: REPLY, data: { content: T.unknown, flags: EPH, allowed_mentions: { parse: [] } } });
    const p = job().catch(e => { log.warn('Discord : /' + d.name + ' en échec (' + (e && e.message || e) + ')'); return err(T, 'down'); });
    let t; const r = await Promise.race([p, new Promise(ok => { t = setTimeout(ok, REPLY_MS, null); })]); clearTimeout(t);
    if (r) {
      json(res, 200, { type: REPLY, data: r.msg });
      if (r.note) follow(it, r.note);
      return;
    }
    json(res, 200, { type: DEFER, ...(eph ? { data: { flags: EPH } } : {}) });      // « Mana Orbit réfléchit… » : la réponse arrive par le webhook
    p.then(r2 => late(it, r2, eph));
  }

  /* ── Enregistrement des commandes (au démarrage) ── */
  async function register() {
    try {
      let app = ID_RE.test(CID) ? CID : '';
      if (!app) { const a = await call('GET', '/applications/@me'); app = ID_RE.test(String(a && a.id || '')) ? String(a.id) : ''; }
      if (!app) throw new Error('identifiant de l\'application illisible');
      const g = await o.guild(), list = await call('PUT', `/applications/${app}/guilds/${g.id}/commands`, DSC_CMDS);
      log.log(`Discord : commandes /moi et /partie enregistrées sur le serveur (${Array.isArray(list) ? list.length : DSC_CMDS.length}).`);
      if (o.load) o.load().catch(() => {});      // rôles prêts pour le premier /partie ping
      return true;
    } catch (e) {
      const scope = e && e.kind === 'refused' && (e.status === 403 || e.code === 50001) ? ' : réinviter le bot avec la portée applications.commands' : '';
      log.warn('Discord : commandes slash non enregistrées (' + (e && e.message || e) + ')' + scope);
      return false;
    }
  }
  function start() { if (ON && !S.reg) S.reg = register(); return S.reg || Promise.resolve(false); }

  return { on: ON, interactions, start, _s: S };
}
