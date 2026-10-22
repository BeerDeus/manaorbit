// Mana Orbit — le bot Discord, côté serveur (aucune dépendance npm : fetch, FormData et Blob de Node 18+). Chargé par proxy.mjs (discordMake), testé par
// tests/test-discord-srv.mjs (faux Discord HTTP, vrai proxy.mjs). Trois usages :
//   · « Aide et avis » de l'appli : POST /api/feedback → un fil dans le forum #bugs, #idées ou #aide (étiquettes de la plateforme et de la partie de l'appli, captures en pièces jointes) ;
//   · panneau /admin : GET /api/admin/discord (salons, rôles, derniers envois), POST …/send (message de l'éditeur, pings de rôles, publication d'une annonce), POST …/delete ;
//     modération des fils des forums bugs, idées, aide : GET …/threads (ouverts, fermés), GET …/thread (messages), POST …/thread (étiquettes, fermer, verrouiller,
//     renommer), POST …/reply (réponse du bot, sans ping), POST …/thread-delete. Texte des messages des membres : seulement avec l'intention « Message Content »
//     cochée sur le portail Discord (sinon vide : hidden) ;
//   · Carte mystère de la veille (reveal, appelé par daily-srv.mjs au tour de garde) : message FR + EN dans #carte-mystère ;
//   · liaison du compte Discord (OAuth2 « Se connecter avec Discord », portée identify) : POST /api/discord/link → adresse d'autorisation (state signé),
//     GET /api/discord/callback (code échangé, compte lu, adhésion au serveur vérifiée par le bot), GET /api/discord/me, POST /api/discord/unlink ;
//   · statut « En ligne » (passerelle Discord, WebSocket de Node 22+ ; sans lui : bot affiché hors ligne, le reste marche pareil) : « 🔮 Carte mystère n° 42 »,
//     dans une langue après l'autre (une toutes les presenceMs, 30 s). Aucune intention à la passerelle (intents 0) : rien n'y est lu, il se montre seulement.
// Serveur Discord : DISCORD_GUILD_ID, sinon le seul serveur du bot. Salons et rôles relus au plus toutes les 5 min (tout de suite si un salon gardé n'existe plus) ;
// salons trouvés par leur nom utile (« 🐞・bugs » → bugs, ou le nom exact d'un ancien serveur), accents et casse ignorés. Limite de débit (429) : attente de
// retry_after (10 s au plus en tout, 4 essais) ; Discord en panne (5xx, réseau) : un nouvel essai. Jeton : seulement dans l'en-tête Authorization, jamais dans
// un journal, une erreur ni une réponse. Mentions : jamais de ping venu d'un utilisateur (allowed_mentions vide) ; ceux de l'éditeur, exactement ceux demandés.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const TX = 0, CAT = 4, NEWS = 5, FORUM = 15, REQUIRE_TAG = 16;
const B = n => 1n << BigInt(n), P_ADMIN = B(3), P_VIEW = B(10), P_SEND = B(11), P_EMBED = B(14), P_ATTACH = B(15), P_MENTION = B(17), P_ALL = (1n << 53n) - 1n;
export const DSC_PERMS = P_VIEW | P_SEND | P_EMBED | P_ATTACH | P_MENTION;      // permissions du bot (183296) : voir les salons, envoyer (et créer un fil de forum), liens intégrés, fichiers, @everyone et rôles non mentionnables
export const DSC_GAME = 'https://manaorbit.app/?mystere=1';
export const DSC_INVITE = 'https://discord.gg/TTwrP94agb';      // invitation permanente du serveur (src/help.js › DISCORD_URL)
const KINDS = { bug: 'bugs', idea: 'idées', help: 'aide' };
export const DSC_AREAS = { scan: 'Scan', collection: 'Collection', decks: 'Decks', prix: 'Prix', compte: 'Compte et synchro', alertes: 'Alertes', echange: 'Échange', partie: 'Partie', mystere: 'Carte mystère', amis: 'Amis', autre: 'Autre' };
export const DSC_PLATS = { android: 'Android', pwa: 'PWA', web: 'Site' };
const META_KEYS = ['v', 'plat', 'apk', 'lang', 'nav', 'ua'], ID_RE = /^\d{5,25}$/, IMG_RE = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/;
const SENT_MAX = 50, SENT_TEXT = 140;
// Statut du bot, une langue après l'autre ({n} : numéro de la Carte mystère du jour) ; sans numéro (jeu coupé) : l'adresse du site
export const DSC_PRESENCE = [['fr', 'Carte mystère n° {n}'], ['en', 'Mystery card #{n}'], ['de', 'Mysterykarte Nr. {n}'], ['es', 'Carta misteriosa n.º {n}'], ['it', 'Carta misteriosa n. {n}'],
  ['pt', 'Carta mistério n.º {n}'], ['ru', 'Карта-загадка № {n}'], ['ja', 'ミステリーカード No.{n}'], ['ko', '미스터리 카드 {n}번'], ['zh', '神秘卡牌 第 {n} 期']];
export const dscPresence = (i, n) => '🔮 ' + (n > 0 ? DSC_PRESENCE[((i % DSC_PRESENCE.length) + DSC_PRESENCE.length) % DSC_PRESENCE.length][1].replace('{n}', String(n)) : 'manaorbit.app');
const GW_FATAL = [4004, 4010, 4011, 4012, 4013, 4014];      // jeton refusé, réglages refusés par Discord : plus de nouvel essai (le reste du bot continue par l'API)

/** Comparaison des noms : sans accents ni casse (« Idées » = « idees »). */
const fold = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
/** Nom utile d'un salon : ce qui suit « ・ » (« 🐞・bugs » → « bugs »), sinon le nom entier ; plié (fold). */
export const dscName = n => { const s = String(n || ''), i = Math.max(s.lastIndexOf('・'), s.lastIndexOf('･')); return fold(i >= 0 ? s.slice(i + 1) : s); };
/** Texte d'une ligne : sans caractère de contrôle ni de mise en forme invisible, espaces resserrés. */
const line = s => String(s).replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, ' ').replace(/\s+/g, ' ').trim();
/** Texte sur plusieurs lignes : sauts de ligne gardés (3 lignes vides au plus d'affilée), le reste comme line. */
const para = s => String(s).replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, ' ').replace(/[ \t\u00a0]+/g, ' ').trimEnd()).join('\n').replace(/\n{4,}/g, '\n\n\n').trim();
/** Markdown de Discord neutralisé (pseudo, version, navigateur : affichés tels quels). */
const md = s => String(s).replace(/[\\`*_~|>[\]()<@]/g, '\\$&');
const len = s => [...s].length;

/** Message de la Carte mystère de la veille (info : daily-srv.mjs › reveal) : FR puis EN, embed (nom, image, page Scryfall), lien vers le jeu. */
export function dscRevealMsg(info) {
  const fr = line(info.fr || info.en || '?').slice(0, 200), en = line(info.en || fr).slice(0, 200), plays = Math.max(0, Math.floor(Number(info.plays) || 0)), wins = Math.max(0, Math.min(plays, Math.floor(Number(info.wins) || 0)));
  const https = u => (typeof u === 'string' && /^https:\/\/[^\s<>]+$/.test(u) ? u : undefined);
  const frN = plays ? `Trouvée par ${wins} joueur${wins > 1 ? 's' : ''} sur ${plays}.` : 'Personne ne l\'a jouée.', enN = plays ? `Found by ${wins} player${wins === 1 ? '' : 's'} out of ${plays}.` : 'Nobody played it.';
  const content = `🔮 **Carte mystère d'hier : ${md(fr)}**\n${frN} La nouvelle carte est arrivée : <${DSC_GAME}>\n\n🔮 **Yesterday's Mystery card: ${md(en)}**\n${enN} Today's card is here: <${DSC_GAME}>`;
  const set = line(info.set || '').toUpperCase().slice(0, 12), where = [line(info.setName || '').slice(0, 120), set ? `(${set})` : '', info.num ? '#' + line(info.num).slice(0, 12) : ''].filter(Boolean).join(' ');
  const embed = { title: fr.slice(0, 256), url: https(info.scry), description: [en !== fr ? en : '', where].filter(Boolean).join(' · ').slice(0, 1000) || undefined, color: 0x8b5cf6, ...(https(info.img) ? { image: { url: info.img } } : {}) };
  return { content, embeds: [embed], allowed_mentions: { parse: [] } };
}

/** Crée le bot. o : { token, guild (DISCORD_GUILD_ID, facultatif), api (DISCORD_API), off (DISCORD=0), dir (dossier de l'historique, ADMIN_DIR), fetch, now, sleep, log,
 *  json, readBody, rateWait, tooMany, tooLarge, isLocked, badKey, verify (jeton → { uid }), amTag, jpegSize, adminHeaders, feedbackPerH (10), actPerH (ADMIN_ACTIONS_PER_H),
 *  cacheMs (5 min), maxWaitMs (10 s), tries (4), retryMs (attente avant le nouvel essai d'une panne, 1 s), timeoutMs (15 s), threadListMs (liste des fils gardée, 30 s),
 *  liaison du compte : clientId, clientSecret (DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET), redirect (req → adresse de retour), appUrl (req → adresse de l'appli),
 *  authorizeUrl, stateMs (10 min), recheckMs (lié, pas membre : 10 min), memberMs (membre : 24 h), linkFile, budgets linkPerH, backPerH, mePerH }. */
export function discordMake(o = {}) {
  const TOKEN = String(o.token || '').trim(), ON = !!TOKEN && !o.off, API = String(o.api || 'https://discord.com/api/v10').replace(/\/+$/, '');
  const fetchFn = o.fetch || globalThis.fetch, now = o.now || Date.now, sleep = o.sleep || (ms => new Promise(r => setTimeout(r, ms))), log = o.log || console;
  const json = o.json, readBody = o.readBody, rateWait = o.rateWait || (() => 0), isLocked = o.isLocked || (() => false), HD = o.adminHeaders || {};
  const tooMany = o.tooMany || ((res, s) => json(res, 429, { error: 'rate_limited', message: 'Trop de requêtes : réessaie dans quelques minutes.', retry: s }, { 'Retry-After': String(s) }));
  const tooLarge = o.tooLarge || (res => json(res, 413, { error: 'too_large', message: 'Requête trop grosse.' }));
  const badKey = o.badKey || ((req, res) => json(res, 401, { error: 'bad_token', message: 'Jeton de connexion invalide.' }));
  const FB_H = Number(o.feedbackPerH ?? 10), ACT_H = Number(o.actPerH ?? 30), CACHE = o.cacheMs ?? 5 * 60e3, MAX_WAIT = o.maxWaitMs ?? 10e3, TRIES = Math.max(1, o.tries || 4);
  const RETRY = o.retryMs ?? 1000, TIMEOUT = o.timeoutMs ?? 15e3, UA = 'DiscordBot (https://manaorbit.app, 1.0)', SENT_FILE = join(o.dir || join(process.cwd(), '.data', 'admin'), 'discord.json');
  const G = { guild: null, me: null, data: null, loading: null, lim: new Map(), sent: null, chain: Promise.resolve() };
  const dErr = (kind, message, extra = {}) => Object.assign(new Error(message), { kind, ...extra });

  /* ── API REST ── */
  /** Appel de l'API (corps JSON, ou form : FormData multipart) → réponse JSON (null pour 204). Erreurs : kind 'limit' (retry, secondes), 'down' (injoignable, 5xx),
   *  'refused' (4xx : status, code et message de Discord). Le jeton n'apparaît dans aucune erreur. */
  async function call(method, path, body, form) {
    let waited = 0, again = false;
    for (let i = 0; ; i++) {
      let r;
      try { r = await fetchFn(API + path, { method, headers: { Authorization: 'Bot ' + TOKEN, 'User-Agent': UA, ...(body !== undefined && !form ? { 'Content-Type': 'application/json' } : {}) }, body: form || (body === undefined ? undefined : JSON.stringify(body)), redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT) }); }
      catch (e) { if (!again) { again = true; await sleep(RETRY); continue; } throw dErr('down', 'Discord injoignable'); }
      if (r.status === 429) {      // limite de débit : on attend ce que Discord demande, sans dépasser MAX_WAIT en tout
        const j = await r.json().catch(() => null), s = Number(j && j.retry_after) || Number(r.headers.get('retry-after')) || 1, ms = Math.ceil(s * 1000) + 50;
        if (i < TRIES - 1 && waited + ms <= MAX_WAIT) { waited += ms; await sleep(ms); continue; }
        throw dErr('limit', 'Discord limite les envois : réessaie dans ' + Math.max(1, Math.ceil(s)) + ' s.', { retry: Math.max(1, Math.ceil(s)) });
      }
      if (r.status >= 500) { await r.arrayBuffer().catch(() => {}); if (!again) { again = true; await sleep(RETRY); continue; } throw dErr('down', 'Discord indisponible (HTTP ' + r.status + ')', { status: r.status }); }
      if (r.status === 204) return null;
      const t = await r.text().catch(() => ''); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { /* réponse non JSON */ }
      if (!r.ok) { const dm = j && typeof j.message === 'string' ? line(j.message).slice(0, 300) : ''; throw dErr('refused', 'Discord a refusé (HTTP ' + r.status + (dm ? ' : ' + dm : '') + ')', { status: r.status, code: j && j.code, dm }); }
      return j;
    }
  }
  /** Serveur : DISCORD_GUILD_ID, sinon le seul du bot ; gardé une fois trouvé. */
  async function guild() {
    if (G.guild) return G.guild;
    if (o.guild) { const g = await call('GET', `/guilds/${encodeURIComponent(o.guild)}`); return (G.guild = { id: String(g.id), name: String(g.name || '') }); }
    const gs = await call('GET', '/users/@me/guilds');
    if (!Array.isArray(gs) || gs.length !== 1) throw dErr('setup', Array.isArray(gs) && gs.length ? `Le bot est sur ${gs.length} serveurs : DISCORD_GUILD_ID à indiquer.` : 'Le bot n\'est sur aucun serveur : invite-le d\'abord.');
    return (G.guild = { id: String(gs[0].id), name: String(gs[0].name || '') });
  }
  /** Permissions du bot dans un salon (rôles du serveur, puis remplacements du salon : @everyone, rôles, membre). */
  function permsIn(ch, d) {
    if (d.base === null) return P_ALL;      // membre illisible : on laisse Discord trancher
    if (d.base & P_ADMIN) return P_ALL;
    const ow = Array.isArray(ch.permission_overwrites) ? ch.permission_overwrites : [], bi = x => { try { return BigInt(x || 0); } catch (e) { return 0n; } };
    const isRole = x => x.type === 0 || x.type === 'role', isMember = x => x.type === 1 || x.type === 'member';
    let p = d.base; const ev = ow.find(x => isRole(x) && x.id === d.gid); if (ev) p = (p & ~bi(ev.deny)) | bi(ev.allow);
    let a = 0n, de = 0n; for (const x of ow) if (isRole(x) && x.id !== d.gid && d.mine.has(x.id)) { a |= bi(x.allow); de |= bi(x.deny); }
    p = (p & ~de) | a;
    const mo = ow.find(x => isMember(x) && x.id === d.me); if (mo) p = (p & ~bi(mo.deny)) | bi(mo.allow);
    return p;
  }
  /** Salons, rôles et permissions du bot, gardés CACHE ms ; force : relus tout de suite. Un seul chargement à la fois. */
  async function load(force) {
    if (!force && G.data && now() - G.data.at < CACHE) return G.data;
    if (!G.loading) G.loading = (async () => {
      const g = await guild();
      if (!G.me) { const me = await call('GET', '/users/@me'); G.me = String(me && me.id || ''); }
      const [chans, roles] = await Promise.all([call('GET', `/guilds/${g.id}/channels`), call('GET', `/guilds/${g.id}/roles`)]);
      if (!Array.isArray(chans) || !Array.isArray(roles)) throw dErr('down', 'Réponse de Discord illisible');
      let mine = null; try { const m = await call('GET', `/guilds/${g.id}/members/${G.me}`); mine = new Set((m && m.roles) || []); } catch (e) { if (e.kind === 'limit') throw e; }
      const bi = x => { try { return BigInt(x || 0); } catch (e) { return 0n; } };
      let base = null; if (mine) { base = 0n; for (const r of roles) if (r.id === g.id || mine.has(r.id)) base |= bi(r.permissions); }
      const d = { at: now(), gid: g.id, gname: g.name, me: G.me, chans, roles, base, mine: mine || new Set() };
      d.can = (ch, need) => (permsIn(ch, d) & need) === need;
      return (G.data = d);
    })().finally(() => { G.loading = null; });
    return G.loading;
  }
  /** Salon d'après son nom utile ; types permis. Absent d'une liste de plus de 10 s : relue une fois. */
  async function find(names, types) {
    const pick = d => { for (const n of names) { const c = d.chans.find(x => types.includes(x.type) && dscName(x.name) === fold(n)); if (c) return c; } return null; };
    let d = await load(), c = pick(d);
    if (!c && now() - d.at > 10e3) { d = await load(true); c = pick(d); }
    return { d, c };
  }
  const gone = e => e && e.kind === 'refused' && (e.code === 10003 || e.status === 404);      // salon disparu (Unknown Channel)
  /** Envoi dans un salon gardé ; salon disparu : liste relue tout de suite (le prochain envoi trouve le nouveau). */
  async function post(ch, path, body, form) {
    try { return await call('POST', path, body, form); }
    catch (e) { if (gone(e)) { G.data = null; load(true).catch(() => {}); } throw e; }
  }

  /* ── « Aide et avis » : POST /api/feedback ── */
  /** Budget d'un compte (feedbackPerH par heure, comme proxy.mjs › srLim) : 0 si permis, sinon secondes à attendre. */
  function lim(k) {
    if (!(FB_H > 0)) return 0;
    const t = now(); let b = G.lim.get(k);
    if (!b) { if (G.lim.size > 5000) for (const [kk, v] of G.lim) if (t - v.t > 3600e3) G.lim.delete(kk); b = { n: FB_H, t }; G.lim.set(k, b); }
    b.n = Math.min(FB_H, b.n + (t - b.t) * FB_H / 3600e3); b.t = t;
    if (b.n >= 1) { b.n--; return 0; }
    return Math.max(1, Math.ceil((1 - b.n) * 3600 / FB_H));
  }
  /** Corps de l'avis vérifié → { kind, title, text, area, contact, meta, imgs : [Buffer] } ou { e: [code, message] }. */
  function feedbackOf(b) {
    const bad = (code, m) => ({ e: [code, m] });
    if (!b || typeof b !== 'object' || Array.isArray(b)) return bad('bad_request', 'JSON invalide');
    if (!Object.hasOwn(KINDS, b.kind)) return bad('bad_kind', 'Type d\'avis inconnu (bug, idea, help).');
    if (typeof b.title !== 'string') return bad('bad_title', 'Titre attendu.');
    const title = line(b.title); if (len(title) < 3 || len(title) > 90) return bad('bad_title', 'Titre : 3 à 90 caractères.');
    if (typeof b.text !== 'string') return bad('bad_text', 'Texte attendu.');
    const text = para(b.text); if (len(text) < 1 || len(text) > 1500) return bad('bad_text', 'Texte : 1 à 1 500 caractères.');
    if (text.split('\n').length > 30) return bad('bad_text', 'Texte : 30 lignes au plus.');
    if (!Object.hasOwn(DSC_AREAS, b.area)) return bad('bad_area', 'Partie de l\'appli inconnue.');
    if (b.contact != null && typeof b.contact !== 'string') return bad('bad_contact', 'Pseudo Discord invalide.');
    const contact = line(b.contact || ''); if (len(contact) > 60) return bad('bad_contact', 'Pseudo Discord : 60 caractères au plus.');
    if (b.meta != null && (typeof b.meta !== 'object' || Array.isArray(b.meta))) return bad('bad_request', 'meta invalide.');
    const meta = {};
    for (const k of META_KEYS) {
      const v = b.meta ? b.meta[k] : undefined;
      if (v != null && typeof v !== 'string') return bad('bad_request', 'meta.' + k + ' : texte attendu.');
      meta[k] = line(v || ''); if (len(meta[k]) > 300) return bad('bad_request', 'meta.' + k + ' : 300 caractères au plus.');
    }
    if (meta.plat && !Object.hasOwn(DSC_PLATS, meta.plat)) return bad('bad_request', 'meta.plat : android, pwa ou web.');
    if (b.imgs != null && !Array.isArray(b.imgs)) return bad('bad_image', 'Captures : liste attendue.');
    const raw = b.imgs || []; if (raw.length > 3) return bad('bad_image', '3 captures au plus.');
    const imgs = [];
    for (const s of raw) {
      const m = typeof s === 'string' ? IMG_RE.exec(s) : null; if (!m) return bad('bad_image', 'Capture JPEG attendue.');
      const img = Buffer.from(m[1], 'base64'); if (img.length > 1.5 * 1048576) return bad('bad_image', 'Capture trop lourde (1,5 Mo au plus).');
      const dim = o.jpegSize ? o.jpegSize(img) : null; if (!dim || dim.w > 4096 || dim.h > 4096) return bad('bad_image', 'Capture JPEG attendue (4 096 px au plus de côté).');
      imgs.push(img);
    }
    return { kind: b.kind, title, text, area: b.area, contact, meta, imgs };
  }
  /** Message du fil : le texte, puis en petit la plateforme et la version, la langue, le pseudo de contact, le navigateur (2 000 caractères au plus en tout). */
  function feedbackText(f) {
    const m = f.meta, cut = (s, n) => (len(s) > n ? [...s].slice(0, n - 1).join('') + '…' : s);
    const head = [DSC_PLATS[m.plat] || '', m.v ? 'version ' + cut(m.v, 40) : '', m.apk ? 'APK ' + cut(m.apk, 40) : '', m.lang ? 'langue ' + cut(m.lang, 20) : ''].filter(Boolean).join(' · ');
    const foot = [head, f.contact ? 'Contact Discord : ' + f.contact : '', m.nav || m.ua ? 'Navigateur : ' + cut(m.nav || m.ua, 200) : ''].filter(Boolean).map(s => '-# ' + md(s));
    let out = f.text + (foot.length ? '\n\n' + foot.join('\n') : '');
    while (out.length > 2000 && foot.length) { foot.pop(); out = f.text + (foot.length ? '\n\n' + foot.join('\n') : ''); }
    return out;
  }
  async function feedback(req, res) {
    if (!ON) return json(res, 404, { error: 'not_found' });
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return json(res, 415, { error: 'bad_content_type', message: 'Content-Type: application/json attendu.' });
    const w = rateWait(req, 'feedback', FB_H, 3600e3); if (w) return json(res, 429, { error: 'rate_limited', message: 'Trop d\'avis envoyés depuis ce réseau : réessaie plus tard.', retry: w }, { 'Retry-After': String(w) });
    const tok = String(req.headers['x-firebase-token'] || '');
    if (tok) {      // connecté : budget du compte (empreinte seulement, jamais affichée ni envoyée à Discord)
      if (isLocked(req)) return json(res, 429, { error: 'too_many_attempts', message: 'Trop d\'essais invalides : réessaie dans quelques minutes.' }, { 'Retry-After': '300' });
      let acct = '';
      try { acct = o.amTag(String((await o.verify(tok)).uid)).slice(0, 16); }
      catch (e) {
        const code = e && e.authCode;
        if (code === 'expired') return json(res, 401, { error: 'token_expired', message: 'Session expirée : le navigateur va la renouveler.' });
        if (code !== 'unavailable') return badKey(req, res, 'bad_token', 401);      // clés Google injoignables : budget du réseau seulement
      }
      const w2 = acct ? lim(acct) : 0; if (w2) return json(res, 429, { error: 'rate_limited', message: 'Trop d\'avis envoyés depuis ce compte : réessaie plus tard.', retry: w2 }, { 'Retry-After': String(w2) });
    }
    let b; try { b = JSON.parse((await readBody(req, 7 * 1048576)).toString('utf8') || '{}'); } catch (e) { return e.status === 413 ? tooLarge(res) : json(res, 400, { error: 'bad_request', message: 'JSON invalide' }); }
    const f = feedbackOf(b); if (f.e) return json(res, 400, { error: f.e[0], message: f.e[1] });
    const down = m => json(res, 503, { error: 'unavailable', message: m || 'Discord est injoignable pour le moment : réessaie plus tard.' }, { 'Retry-After': '60' });
    try {
      const { d, c } = await find([KINDS[f.kind], 'bugs'], [FORUM]);
      if (!c) { log.warn('Discord : forum #' + KINDS[f.kind] + ' introuvable, avis refusé'); return down('Forum Discord introuvable : réessaie plus tard.'); }
      const tags = Array.isArray(c.available_tags) ? c.available_tags.filter(t => t && t.id && !t.moderated) : [], want = [DSC_PLATS[f.meta.plat], DSC_AREAS[f.area]].filter(Boolean).map(fold);
      let applied = tags.filter(t => want.includes(fold(t.name))).map(t => String(t.id));
      if (!applied.length && (c.flags & REQUIRE_TAG) && tags.length) applied = [String((tags.find(t => fold(t.name) === 'autre') || tags[0]).id)];      // forum qui exige une étiquette
      const message = { content: feedbackText(f), allowed_mentions: { parse: [] }, flags: 4 };      // 4 : sans aperçu des liens écrits par l'utilisateur
      let form;
      if (f.imgs.length) {      // captures : multipart (payload_json + files[n])
        message.attachments = f.imgs.map((_, i) => ({ id: i, filename: `capture-${i + 1}.jpg` }));
        form = new FormData(); form.append('payload_json', JSON.stringify({ name: f.title, applied_tags: applied.slice(0, 5), message }));
        f.imgs.forEach((img, i) => form.append(`files[${i}]`, new Blob([img], { type: 'image/jpeg' }), `capture-${i + 1}.jpg`));
      }
      const th = await post(c, `/channels/${c.id}/threads`, form ? undefined : { name: f.title, applied_tags: applied.slice(0, 5), message }, form);
      const id = String(th && th.id || '');
      log.log(`Discord : avis (${f.kind}) publié dans #${dscName(c.name)}${f.imgs.length ? ', ' + f.imgs.length + ' capture' + (f.imgs.length > 1 ? 's' : '') : ''}.`);
      return json(res, 200, { ok: true, url: `https://discord.com/channels/${d.gid}/${id}`, id });
    } catch (e) {
      log.warn('Discord : avis non publié (' + e.message + ')');
      if (e.kind === 'limit') return json(res, 503, { error: 'unavailable', message: 'Discord est très demandé : réessaie dans une minute.' }, { 'Retry-After': String(e.retry || 60) });
      return down();
    }
  }

  /* ── Panneau /admin : /api/admin/discord… ── */
  /** Historique des envois (du plus récent au plus ancien), relu une fois ; une écriture à la fois, atomique. */
  async function sentList() {
    if (G.sent) return G.sent;
    try { const j = JSON.parse(await readFile(SENT_FILE, 'utf8')); G.sent = (Array.isArray(j.list) ? j.list : []).filter(x => x && typeof x.id === 'string' && typeof x.ch === 'string').slice(0, SENT_MAX); }
    catch (e) { if (e && e.code !== 'ENOENT') log.warn('Discord : historique illisible (' + (e.code || 'JSON') + '), repris à vide'); G.sent = []; }
    return G.sent;
  }
  function sentSave() {
    const run = G.chain.then(async () => { await mkdir(dirname(SENT_FILE), { recursive: true }); await writeFile(SENT_FILE + '.tmp', JSON.stringify({ v: 1, list: G.sent })); await rename(SENT_FILE + '.tmp', SENT_FILE); });
    G.chain = run.catch(() => {});
    return run.catch(e => log.warn('Discord : historique non enregistré (' + (e && e.code || e) + ')'));
  }
  const postable = d => d.chans.filter(c => (c.type === TX || c.type === NEWS) && d.can(c, P_VIEW | P_SEND));
  /** Salons où poster, dans l'ordre du serveur : salons sans catégorie, puis chaque catégorie (position), puis la position dans la catégorie. */
  function chanList(d) {
    const cats = new Map(d.chans.filter(c => c.type === CAT).map(c => [c.id, c])), pos = c => Number(c.position) || 0;
    const key = c => { const k = cats.get(c.parent_id); return [k ? pos(k) : -1, k ? k.id : '', pos(c), c.id]; };
    const cmp = (a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 4; i++) { if (x[i] < y[i]) return -1; if (x[i] > y[i]) return 1; } return 0; };
    return postable(d).sort(cmp).map(c => ({ id: c.id, name: String(c.name || ''), type: c.type, cat: cats.has(c.parent_id) ? String(cats.get(c.parent_id).name || '') : '' }));
  }
  /** Rôles qu'on peut pinger : ni @everyone ni ceux gérés par un bot ou une intégration ; non mentionnables seulement si le bot a « Mentionner @everyone ». Du plus haut au plus bas. */
  function roleList(d) {
    const all = d.base === null || (d.base & (P_ADMIN | P_MENTION)) !== 0n;
    return d.roles.filter(r => r && r.id !== d.gid && !r.managed && !(r.tags && (r.tags.bot_id || r.tags.integration_id)) && (all || r.mentionable))
      .sort((a, b) => (Number(b.position) || 0) - (Number(a.position) || 0) || (a.id < b.id ? -1 : 1)).map(r => ({ id: r.id, name: String(r.name || ''), color: Number(r.color) || 0 }));
  }
  /** Erreur de Discord → réponse du panneau (message affichable tel quel). */
  function admErr(res, e) {
    if (e.kind === 'limit') return json(res, 429, { error: 'rate_limited', message: e.message, retry: e.retry }, { ...HD, 'Retry-After': String(e.retry) });
    if (e.kind === 'refused') return json(res, 502, { error: 'discord', message: e.status === 401 ? 'Jeton du bot refusé par Discord (DISCORD_BOT_TOKEN à recopier).' : e.status === 403 ? 'Discord a refusé : le bot n\'a pas la permission (' + (e.dm || 'Missing Permissions') + ').' : 'Discord a refusé : ' + (e.dm || 'HTTP ' + e.status) + '.' }, HD);
    if (e.kind === 'setup') return json(res, 503, { error: 'unavailable', message: e.message }, HD);
    return json(res, 503, { error: 'unavailable', message: 'Discord injoignable pour le moment : réessaie plus tard.' }, { ...HD, 'Retry-After': '30' });
  }
  const msgUrl = (gid, ch, id) => `https://discord.com/channels/${gid}/${ch}/${id}`;
  /** Raison affichable d'un serveur illisible (panneau : on false). */
  const offMsg = e => (e.kind === 'setup' ? e.message : e.kind === 'refused' && e.status === 401 ? 'Jeton du bot refusé par Discord (DISCORD_BOT_TOKEN à recopier).' : e.kind === 'refused' ? 'Discord a refusé : ' + (e.dm || 'HTTP ' + e.status) + '.' : e.kind === 'limit' ? e.message : 'Discord injoignable pour le moment.');

  /* ── Panneau /admin : fils des forums bugs, idées, aide (modération) ──
     Liste : fils actifs du serveur filtrés par forum, ou fils fermés (archivés publics) d'un forum, 25 par page ; réponse gardée threadListMs (30 s), oubliée à chaque
     écriture. Premier message d'un fil (même id que le fil) lu une fois et gardé (FIRST_MAX fils au plus), 4 lectures à la fois. Un fil n'est lu ou modifié qu'après
     vérification : c'est un fil d'un des trois forums (parent_id), du même serveur. Aucun id d'utilisateur dans les réponses (auteur : nom affiché et bot ou non ;
     mentions <@id> remplacées par le nom). Journal : fil, forum, action (jamais le texte). */
  const FORUMS = ['bugs', 'idées', 'aide'], FIRST_MAX = 1000, FIRST_LEN = 300, LIST_MS = o.threadListMs ?? 30e3, PAR = 4;
  const TH = { first: new Map(), list: new Map(), run: 0, q: [] };
  const CDN_RE = /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/[^\s"'<>]+$/;
  const snowMs = id => { try { return Number(BigInt(id) >> 22n) + 1420070400000; } catch (e) { return 0; } };
  const isoMs = s => { const t = Date.parse(s || ''); return Number.isFinite(t) ? t : 0; };
  const cutTo = (s, n) => { const a = [...s]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : s; };
  const byOf = u => ({ name: line((u && (u.global_name || u.username)) || '').slice(0, 80) || '?', bot: !!(u && u.bot) });
  /** Lecture bornée : PAR à la fois (le reste attend son tour). */
  async function par(fn) {
    while (TH.run >= PAR) await new Promise(r => TH.q.push(r));
    TH.run++;
    try { return await fn(); } finally { TH.run--; const r = TH.q.shift(); if (r) r(); }
  }
  /** Les trois forums trouvés (comme l'avis : nom utile) → { d, list: [{ key, c }] }. */
  async function forums() {
    let d = null; const list = [];
    for (const key of FORUMS) { const r = await find([key], [FORUM]); d = r.d; if (r.c && !list.some(x => x.c.id === r.c.id)) list.push({ key, c: r.c }); }
    return { d, list };
  }
  const forumOut = f => ({ key: f.key, id: String(f.c.id), name: String(f.c.name || ''), tags: (Array.isArray(f.c.available_tags) ? f.c.available_tags : []).filter(t => t && t.id)
    .map(t => ({ id: String(t.id), name: String(t.name || ''), emoji: typeof t.emoji_name === 'string' ? t.emoji_name : '', moderated: !!t.moderated })) });
  /** Texte d'un message : mentions <@id>, <@&id>, <#id> remplacées par le nom (aucun id d'utilisateur dans la réponse). */
  function msgText(m, d) {
    const users = new Map((Array.isArray(m.mentions) ? m.mentions : []).filter(u => u && u.id).map(u => [String(u.id), byOf(u).name]));
    return String(m.content || '').replace(/<@!?(\d+)>/g, (_, id) => '@' + (users.get(id) || 'membre'))
      .replace(/<@&(\d+)>/g, (_, id) => '@' + ((d.roles.find(r => r.id === id) || {}).name || 'rôle'))
      .replace(/<#(\d+)>/g, (_, id) => '#' + ((d.chans.find(c => c.id === id) || {}).name || 'salon'));
  }
  /** Message → { id, by, t, content, edited, attachments, hidden? } ; hidden : message d'un autre que le bot sans rien de lisible (intention Message Content absente). */
  function msgOut(m, d) {
    const content = msgText(m, d), attachments = (Array.isArray(m.attachments) ? m.attachments : []).filter(a => a && CDN_RE.test(String(a.url || '')))
      .map(a => ({ url: String(a.url), name: String(a.filename || ''), type: String(a.content_type || ''), w: Number(a.width) || 0, h: Number(a.height) || 0 }));
    const empty = !content && !attachments.length && !(Array.isArray(m.embeds) && m.embeds.length) && !(Array.isArray(m.sticker_items) && m.sticker_items.length);
    const hidden = empty && (m.type == null || m.type === 0 || m.type === 19) && !(m.author && String(m.author.id) === d.me);
    return { id: String(m.id), by: byOf(m.author), t: isoMs(m.timestamp) || snowMs(m.id), content, edited: !!m.edited_timestamp, attachments, ...(hidden ? { hidden: true } : {}) };
  }
  /** Premier message d'un fil (id du fil) : { first, by, hidden? }, gardé ; disparu (404) : gardé vide ; autre erreur : vide, relu la fois suivante. */
  async function firstOf(t, d) {
    const id = String(t.id), hit = TH.first.get(id); if (hit) return hit;
    const none = { first: '', by: { name: '', bot: String(t.owner_id || '') === d.me } };
    let v;
    try { const x = msgOut(await par(() => call('GET', `/channels/${id}/messages/${id}`)), d); v = { first: x.hidden ? '' : cutTo(x.content, FIRST_LEN), by: x.by, ...(x.hidden ? { hidden: true } : {}) }; }
    catch (e) { if (!(e.kind === 'refused' && (e.status === 404 || e.code === 10008))) return none; v = none; }
    if (TH.first.size >= FIRST_MAX) TH.first.delete(TH.first.keys().next().value);
    TH.first.set(id, v); return v;
  }
  function threadOut(t, key, d, f) {
    const m = t.thread_metadata || {}, created = isoMs(m.create_timestamp) || snowMs(t.id), last = Math.max(created, t.last_message_id ? snowMs(t.last_message_id) : 0);
    return { id: String(t.id), forum: key, name: String(t.name || ''), tags: (Array.isArray(t.applied_tags) ? t.applied_tags : []).map(String), created, last, count: Number(t.message_count) || 0,
      archived: !!m.archived, locked: !!m.locked, ...(m.archived ? { closed: isoMs(m.archive_timestamp) } : {}), by: f.by, url: `https://discord.com/channels/${d.gid}/${t.id}`, first: f.first, ...(f.hidden ? { firstHidden: true } : {}) };
  }
  /** Fil d'un des trois forums → { t, f: { key, c }, d } ; sinon null (id mal formé, inconnu, fermé au bot, autre salon, autre serveur). */
  async function threadGet(id) {
    if (!ID_RE.test(id)) return null;
    const { d, list } = await forums();
    let t; try { t = await call('GET', `/channels/${id}`); } catch (e) { if (e.kind === 'refused' && (e.status === 404 || e.status === 403 || e.code === 10003 || e.code === 50001)) return null; throw e; }
    if (!t || t.type !== 11 || String(t.guild_id || d.gid) !== d.gid) return null;
    const f = list.find(x => x.c.id === String(t.parent_id || ''));
    return f ? { t, f, d } : null;
  }
  const noThread = res => json(res, 404, { error: 'not_found', message: 'Fil introuvable (supprimé, ou hors des forums bugs, idées et aide) : recharge la liste.' }, HD);
  /** GET …/threads?forum=&state=open|closed&before= */
  async function threadList(res, url) {
    const off = m => json(res, 200, { on: false, message: m, forums: [], threads: [] }, HD);
    if (!ON) return off('Bot Discord non configuré (DISCORD_BOT_TOKEN absent chez l\'hébergeur).');
    const q = url.searchParams, fq = q.get('forum') || '', state = q.get('state') || 'open', bq = q.get('before') || '';
    if (state !== 'open' && state !== 'closed') return json(res, 400, { error: 'bad_request', message: 'state : open ou closed.' }, HD);
    const want = fq ? FORUMS.find(k => fold(k) === fold(fq)) : null;
    if (fq && !want) return json(res, 400, { error: 'bad_forum', message: 'Forum : bugs, idées ou aide.' }, HD);
    let before = '';
    if (bq && state === 'closed') {      // date ISO (gardée telle quelle : microsecondes de Discord) ou millisecondes
      const iso = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,6})?(Z|[+-]\d\d:\d\d)$/.test(bq), t = iso ? Date.parse(bq) : /^\d{1,15}$/.test(bq) ? Number(bq) : NaN;
      if (!Number.isFinite(t) || t <= 0) return json(res, 400, { error: 'bad_request', message: 'before : date ISO attendue.' }, HD);
      before = iso ? bq : new Date(t).toISOString();
    }
    const key = [want || '*', state, before].join('|'), hit = TH.list.get(key);
    if (hit && now() - hit.at < LIST_MS) return json(res, 200, hit.body, HD);
    let body;
    try {
      const { d, list } = await forums(), fs = list.filter(x => !want || x.key === want), raw = [];
      let more = false, next = '';
      if (!fs.length) body = { on: true, forums: list.map(forumOut), threads: [], more: false, message: want ? `Forum « ${want} » introuvable sur le serveur.` : 'Aucun forum bugs, idées ou aide sur le serveur.' };
      else {
        if (state === 'open') {
          const j = await call('GET', `/guilds/${d.gid}/threads/active`);
          for (const t of (j && Array.isArray(j.threads) ? j.threads : [])) { const f = t && fs.find(x => x.c.id === String(t.parent_id || '')); if (f) raw.push([t, f.key]); }
        } else {      // un forum par page de Discord ; plusieurs : coupés à la date la plus récente où un forum s'arrête (la page suivante reprend là, rien de perdu ni de répété)
          const arc = t => isoMs(t && t.thread_metadata && t.thread_metadata.archive_timestamp);
          const pages = await Promise.all(fs.map(async f => { const j = await call('GET', `/channels/${f.c.id}/threads/archived/public?limit=25${before ? '&before=' + encodeURIComponent(before) : ''}`); return { f, ts: (j && Array.isArray(j.threads) ? j.threads : []).filter(Boolean), more: !!(j && j.has_more) }; }));
          let cut = 0;
          for (const p of pages) if (p.more && p.ts.length) { const old = p.ts.reduce((a, t) => (arc(t) < arc(a) ? t : a)); if (arc(old) > cut) { cut = arc(old); next = String(old.thread_metadata.archive_timestamp); } }
          for (const p of pages) for (const t of p.ts) if (!cut || arc(t) >= cut) raw.push([t, p.f.key]);
          more = pages.some(p => p.more);
        }
        const firsts = await Promise.all(raw.map(([t]) => firstOf(t, d)));
        const threads = raw.map(([t, k], i) => threadOut(t, k, d, firsts[i])).sort((a, b) => b.last - a.last || (a.id < b.id ? 1 : -1));
        body = { on: true, forums: list.map(forumOut), threads, more, ...(more && next ? { next } : {}) };
      }
    } catch (e) {
      log.warn('Discord : panneau, fils illisibles (' + e.message + ')');
      if (e.kind === 'limit') return admErr(res, e);
      return off(offMsg(e));
    }
    if (TH.list.size > 50) TH.list.clear();
    TH.list.set(key, { at: now(), body });
    return json(res, 200, body, HD);
  }
  /** GET …/thread?id= : le fil et ses 50 derniers messages (du plus ancien au plus récent). */
  async function threadRead(res, url) {
    if (!ON) return json(res, 404, { error: 'not_found', message: 'Bot Discord non configuré.' }, HD);
    try {
      const x = await threadGet(url.searchParams.get('id') || ''); if (!x) return noThread(res);
      const [ms, f] = await Promise.all([call('GET', `/channels/${x.t.id}/messages?limit=51`), firstOf(x.t, x.d)]);
      const all = Array.isArray(ms) ? ms.filter(m => m && m.id) : [], more = all.length > 50;
      const messages = all.slice(0, 50).sort((a, b) => String(a.id).length - String(b.id).length || (String(a.id) < String(b.id) ? -1 : 1)).map(m => msgOut(m, x.d));
      return json(res, 200, { thread: threadOut(x.t, x.f.key, x.d, f), messages, more }, HD);
    } catch (e) { if (gone(e)) return noThread(res); return admErr(res, e); }
  }
  /** Écritures sur un fil (corps déjà vérifié par les garde-fous) : thread (étiquettes, fermé, verrouillé, nom), reply, thread-delete. */
  async function threadWrite(res, sub, b) {
    const id = typeof b.id === 'string' ? b.id : '';
    if (!ID_RE.test(id)) return json(res, 400, { error: 'bad_request', message: 'Fil attendu (id).' }, HD);
    const done = (x, what) => { TH.list.clear(); log.log(`Discord : fil ${x.t.id} (#${x.f.key}) : ${what}.`); };
    const isB = v => v == null || typeof v === 'boolean';
    let patch = null, content = '';
    if (sub === 'discord/thread') {
      patch = {};
      if (b.tags != null) {
        if (!Array.isArray(b.tags) || b.tags.length > 5 || b.tags.some(t => typeof t !== 'string' || !/^\d{1,25}$/.test(t)) || new Set(b.tags).size !== b.tags.length) return json(res, 400, { error: 'bad_tags', message: '5 étiquettes au plus, celles du forum.' }, HD);
        patch.applied_tags = b.tags;
      }
      if (b.name != null) {
        const n = typeof b.name === 'string' ? line(b.name) : ''; if (len(n) < 1 || len(n) > 100) return json(res, 400, { error: 'bad_name', message: 'Titre du fil : 1 à 100 caractères.' }, HD);
        patch.name = n;
      }
      if (!isB(b.archived) || !isB(b.locked)) return json(res, 400, { error: 'bad_request', message: 'archived et locked : vrai ou faux.' }, HD);
      if (b.locked != null) patch.locked = b.locked;
      if (b.archived != null) patch.archived = b.archived;
      if (!Object.keys(patch).length) return json(res, 400, { error: 'bad_request', message: 'Rien à changer.' }, HD);
    } else if (sub === 'discord/reply') {
      if (typeof b.content !== 'string' || !b.content.trim()) return json(res, 400, { error: 'bad_content', message: 'Texte de la réponse attendu.' }, HD);
      if (b.content.length > 2000) return json(res, 400, { error: 'too_long', message: `Réponse trop longue : ${b.content.length} caractères pour 2 000 au plus.` }, HD);
      if (!isB(b.close)) return json(res, 400, { error: 'bad_request', message: 'close : vrai ou faux.' }, HD);
      content = b.content;      // tel quel, comme /send (aucun ping : allowed_mentions vide)
    }
    try {
      const x = await threadGet(id); if (!x) return noThread(res);
      const path = `/channels/${x.t.id}`, out = t => threadOut(t && t.id ? t : x.t, x.f.key, x.d, TH.first.get(String(x.t.id)) || { first: '', by: { name: '', bot: false } });
      if (sub === 'discord/thread-delete') {
        try { await call('DELETE', path); } catch (e) { if (!gone(e)) throw e; }
        TH.first.delete(String(x.t.id)); done(x, 'supprimé');
        return json(res, 200, { ok: true }, HD);
      }
      await firstOf(x.t, x.d);      // auteur et début du fil pour la réponse (souvent déjà gardés)
      if (patch) {
        if (patch.applied_tags) {      // étiquettes de ce forum seulement (liste relue une fois si une étiquette est inconnue : ajoutée depuis peu ?)
          const okTags = c => { const ids = new Set((Array.isArray(c.available_tags) ? c.available_tags : []).map(t => String(t && t.id))); return patch.applied_tags.every(t => ids.has(t)); };
          if (!okTags(x.f.c)) { const c = (await load(true)).chans.find(y => y.id === x.f.c.id); if (!c || !okTags(c)) return json(res, 400, { error: 'bad_tags', message: 'Étiquette inconnue dans ce forum : recharge la page.' }, HD); }
        }
        const arc = !!(x.t.thread_metadata && x.t.thread_metadata.archived), rest = Object.keys(patch).filter(k => k !== 'archived');
        let t;
        if (arc && patch.archived !== false && rest.length) {      // fil fermé : Discord n'y change rien sans le rouvrir ; rouvert le temps du changement, refermé ensuite
          t = await call('PATCH', path, { ...patch, archived: false });
          t = await call('PATCH', path, { archived: true });
        } else t = await call('PATCH', path, patch);
        const what = [patch.applied_tags ? 'étiquettes' : '', patch.name ? 'renommé' : '', patch.locked === true ? 'verrouillé' : patch.locked === false ? 'déverrouillé' : '', patch.archived === true ? 'fermé' : patch.archived === false ? 'rouvert' : ''].filter(Boolean).join(', ');
        done(x, what);
        return json(res, 200, { ok: true, thread: out(t) }, HD);
      }
      const m = await call('POST', `${path}/messages`, { content, allowed_mentions: { parse: [] } });
      const mid = String(m && m.id || ''), msg = { id: mid, url: msgUrl(x.d.gid, x.t.id, mid) };
      let t = null, closed = null;
      if (b.close === true) { try { t = await call('PATCH', path, { archived: true }); closed = true; } catch (e) { closed = false; log.warn('Discord : réponse envoyée, fil pas fermé (' + e.message + ')'); } }
      if (!t) t = await call('GET', path).catch(() => null);
      done(x, closed ? 'réponse, fermé' : 'réponse');
      return json(res, 200, { ok: true, msg, thread: out(t), ...(closed === false ? { closed: false, message: 'Réponse envoyée, mais le fil n\'a pas été fermé (Discord a refusé) : ferme-le depuis la liste.' } : {}) }, HD);
    } catch (e) { if (gone(e)) return noThread(res); return admErr(res, e); }
  }

  const WRITES = ['discord/send', 'discord/delete', 'discord/thread', 'discord/reply', 'discord/thread-delete'];
  async function admin(req, res, sub, u) {
    const qu = u || new URL(req.url || '/', 'http://x');
    if (sub === 'discord') {
      if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' }, HD);
      if (o.off) return json(res, 404, { error: 'not_found', message: 'Bot Discord coupé (DISCORD=0).' }, HD);
      const sent = await sentList(), off = m => json(res, 200, { on: false, guild: null, channels: [], roles: [], sent, message: m }, HD);
      if (!ON) return off('Bot Discord non configuré (DISCORD_BOT_TOKEN absent chez l\'hébergeur).');
      let d; try { d = await load(); }
      catch (e) { log.warn('Discord : panneau, serveur illisible (' + e.message + ')'); return off(offMsg(e)); }
      return json(res, 200, { on: true, guild: { id: d.gid, name: d.gname }, channels: chanList(d), roles: roleList(d), sent }, HD);
    }
    if (sub === 'discord/threads' || (sub === 'discord/thread' && req.method === 'GET')) {      // lectures : budget de lecture de /api/admin (proxy.mjs › adminApi)
      if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' }, HD);
      if (o.off) return json(res, 404, { error: 'not_found', message: 'Bot Discord coupé (DISCORD=0).' }, HD);
      return sub === 'discord/threads' ? threadList(res, qu) : threadRead(res, qu);
    }
    if (!WRITES.includes(sub)) return json(res, 404, { error: 'not_found' }, HD);
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' }, HD);
    // Mêmes garde-fous que proxy.mjs › admAct : même origine, JSON, budget ADMIN_ACTIONS_PER_H par heure et par réseau (le même que les autres actions)
    const sf = String(req.headers['sec-fetch-site'] || '');
    if (sf && sf !== 'same-origin' && sf !== 'none') return json(res, 403, { error: 'cross_site', message: 'Action refusée : demande venue d\'une autre page.' }, HD);
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return json(res, 415, { error: 'bad_content_type', message: 'Content-Type: application/json attendu.' }, HD);
    const w = rateWait(req, 'adminact', ACT_H, 3600e3); if (w) return tooMany(res, w);
    let b; try { b = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8') || '{}'); } catch (e) { return e.status === 413 ? tooLarge(res) : json(res, 400, { error: 'bad_request', message: 'JSON invalide' }, HD); }
    if (!b || typeof b !== 'object' || Array.isArray(b)) return json(res, 400, { error: 'bad_request', message: 'JSON invalide' }, HD);
    if (!ON) return json(res, 404, { error: 'not_found', message: o.off ? 'Bot Discord coupé (DISCORD=0).' : 'Bot Discord non configuré.' }, HD);
    if (sub !== 'discord/send' && sub !== 'discord/delete') return threadWrite(res, sub, b);
    const list = await sentList();
    if (sub === 'discord/delete') {
      const id = typeof b.id === 'string' ? b.id : '', i = list.findIndex(x => x.id === id), x = list[i];
      if (!x) return json(res, 404, { error: 'not_found', message: 'Message absent de l\'historique : recharge la page.' }, HD);
      let was = false;
      try { await call('DELETE', `/channels/${x.ch}/messages/${x.id}`); }
      catch (e) { if (e.kind === 'refused' && (e.status === 404 || e.code === 10008 || e.code === 10003)) was = true; else return admErr(res, e); }      // déjà supprimé sur Discord (ou son salon) : retiré de l'historique
      const j = list.indexOf(x); if (j >= 0) list.splice(j, 1); await sentSave();
      log.log(`Discord : message supprimé (#${dscName(x.chn)}).`);
      return json(res, 200, { ok: true, sent: list, ...(was ? { gone: true } : {}) }, HD);
    }
    const channel = typeof b.channel === 'string' ? b.channel : '', roles = b.roles == null ? [] : b.roles, everyone = b.everyone === true, publish = b.publish === true;
    if (!ID_RE.test(channel)) return json(res, 400, { error: 'bad_channel', message: 'Salon attendu.' }, HD);
    if (typeof b.content !== 'string') return json(res, 400, { error: 'bad_content', message: 'Texte du message attendu.' }, HD);
    const content = b.content;      // tel quel (le panneau compte la longueur sur le même texte)
    if (!content.trim()) return json(res, 400, { error: 'bad_content', message: 'Message vide.' }, HD);
    if (!Array.isArray(roles) || roles.length > 5 || roles.some(r => typeof r !== 'string' || !ID_RE.test(r)) || new Set(roles).size !== roles.length) return json(res, 400, { error: 'bad_roles', message: '5 rôles au plus.' }, HD);
    if ((b.everyone != null && typeof b.everyone !== 'boolean') || (b.publish != null && typeof b.publish !== 'boolean')) return json(res, 400, { error: 'bad_request', message: 'everyone et publish : vrai ou faux.' }, HD);
    const pre = [...roles.map(r => `<@&${r}>`), ...(everyone ? ['@everyone'] : [])].join(' '), full = pre ? pre + '\n' + content : content;
    if (full.length > 2000) return json(res, 400, { error: 'too_long', message: `Message trop long : ${full.length} caractères pour 2 000 au plus (mentions comprises).` }, HD);
    let d; try { d = await load(); } catch (e) { return admErr(res, e); }
    const ch = postable(d).find(c => c.id === channel);
    if (!ch) return json(res, 404, { error: 'not_found', message: 'Salon introuvable ou fermé au bot : recharge la page.' }, HD);
    const rl = roleList(d), names = roles.map(r => (rl.find(x => x.id === r) || {}).name);
    if (names.some(n => n === undefined)) return json(res, 400, { error: 'bad_roles', message: 'Rôle inconnu ou impossible à pinger : recharge la page.' }, HD);
    if (everyone && !d.can(ch, P_MENTION)) return json(res, 400, { error: 'bad_roles', message: 'Le bot n\'a pas la permission « Mentionner @everyone » dans ce salon.' }, HD);
    let m;
    try { m = await post(ch, `/channels/${ch.id}/messages`, { content: full, allowed_mentions: { roles, parse: everyone ? ['everyone'] : [] } }); }
    catch (e) { if (gone(e)) return json(res, 404, { error: 'not_found', message: 'Salon introuvable (supprimé ?) : liste relue, recharge la page.' }, HD); return admErr(res, e); }
    const id = String(m && m.id || ''), url = msgUrl(d.gid, ch.id, id);
    let pub = null;
    if (publish && ch.type === NEWS) {      // salon d'annonces : publié aussi aux serveurs abonnés
      try { await call('POST', `/channels/${ch.id}/messages/${id}/crosspost`); pub = true; }
      catch (e) { pub = false; log.warn('Discord : annonce envoyée mais pas publiée (' + e.message + ')'); }
    }
    list.unshift({ t: now(), ch: ch.id, chn: String(ch.name || ''), id, url, text: [...content].slice(0, SENT_TEXT).join(''), ping: [...names, ...(everyone ? ['everyone'] : [])], ...(pub !== null ? { pub } : {}) });
    list.splice(SENT_MAX); await sentSave();
    const np = names.length + (everyone ? 1 : 0); log.log(`Discord : message envoyé dans #${dscName(ch.name)}${np ? ` (${np} ping${np > 1 ? 's' : ''})` : ''}${pub ? ', publié' : ''}.`);
    return json(res, 200, { ok: true, msg: { id, url }, sent: list, ...(pub === false ? { published: false, message: 'Envoyé, mais pas publié aux serveurs abonnés (Discord a refusé) : publie-le depuis Discord.' } : pub ? { published: true } : {}) }, HD);
  }

  /* ── Liaison du compte Discord : /api/discord/link, callback, me, unlink ──
     Pour savoir si un compte de l'appli est sur le serveur (l'accueil n'invite plus à le rejoindre). OAuth2 « Se connecter avec Discord », portée identify
     seulement (ni e-mail, ni serveurs, ni messages) ; prompt=consent : la page de Discord s'affiche à chaque liaison. Le state est signé (HMAC-SHA256, clé tirée
     du secret de l'application) : empreinte du compte (amTag), expiration (stateMs), nonce ; une seule utilisation (nonces vus gardés en mémoire jusqu'à leur
     expiration). Le jeton d'accès sert à lire GET /users/@me, puis il est révoqué : jamais gardé ni écrit. L'adhésion est vérifiée par le bot
     (GET /guilds/{g}/members/{id} : 200 membre, 404 non ; pas d'intention privilégiée pour un seul membre). Gardé par compte (empreinte) dans linkFile
     (ADMIN_DIR/discord-links.json, une écriture à la fois, atomique) : { id, name (global_name ou username), member, at }. L'id Discord n'est jamais renvoyé
     à l'appli (seulement le pseudo) ; ni UID ni jeton dans un journal ou une réponse ; le secret ne part que vers /oauth2/token. */
  const CID = String(o.clientId || '').trim(), CSEC = String(o.clientSecret || '').trim(), LINK_ON = ON && /^\d{5,25}$/.test(CID) && !!CSEC;
  const AUTH_URL = o.authorizeUrl || 'https://discord.com/oauth2/authorize', STATE_MS = o.stateMs ?? 10 * 60e3, NO_MS = o.recheckMs ?? 10 * 60e3, YES_MS = o.memberMs ?? 86400e3;
  const LINK_H = Number(o.linkPerH ?? 20), BACK_H = Number(o.backPerH ?? 30), ME_H = Number(o.mePerH ?? 240);
  const LINK_FILE = o.linkFile || join(o.dir || join(process.cwd(), '.data', 'admin'), 'discord-links.json');
  const SKEY = LINK_ON ? createHmac('sha256', 'mana-orbit/discord-link-state').update(CSEC).digest() : null;
  const redirOf = req => (typeof o.redirect === 'function' ? o.redirect(req) : o.redirect) || 'https://manaorbit.app/api/discord/callback';
  const appOf = req => (typeof o.appUrl === 'function' ? o.appUrl(req) : o.appUrl) || 'https://manaorbit.app/';
  const LK = { map: null, loading: null, chain: Promise.resolve(), used: new Map(), chk: new Map(), fail: new Map() };
  const TAG_RE = /^[0-9a-f]{64}$/;
  const sign = s => createHmac('sha256', SKEY).update(s).digest('base64url').slice(0, 32);
  /** state → { tag } si signé, pas expiré, jamais servi (il est alors consommé) ; sinon null. */
  function stateTake(st) {
    const p = String(st || '').split('.');
    if (p.length !== 4 || !TAG_RE.test(p[0]) || !/^[0-9a-z]{1,12}$/.test(p[1]) || !/^[\w-]{16}$/.test(p[2]) || !/^[\w-]{32}$/.test(p[3])) return null;
    const want = Buffer.from(sign(p.slice(0, 3).join('.'))), got = Buffer.from(p[3]);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    const exp = parseInt(p[1], 36), t = now();
    if (!(exp > t) || exp > t + STATE_MS + 60e3 || LK.used.has(p[2])) return null;
    if (LK.used.size > 2000) for (const [k, e] of LK.used) if (e <= t) LK.used.delete(k);
    LK.used.set(p[2], exp);
    return { tag: p[0] };
  }
  /** Liaisons gardées (empreinte du compte → { id, name, member, at }), lues une fois. */
  function links() {
    if (LK.map) return Promise.resolve(LK.map);
    if (!LK.loading) LK.loading = (async () => {
      let m = new Map();
      try { const j = JSON.parse(await readFile(LINK_FILE, 'utf8')); m = new Map(Object.entries((j && j.links) || {}).filter(([k, v]) => TAG_RE.test(k) && v && ID_RE.test(String(v.id)))); }
      catch (e) { if (e && e.code !== 'ENOENT') log.warn('Discord : liaisons illisibles (' + (e.code || 'JSON') + '), reprises à vide'); }
      return (LK.map = m);
    })().finally(() => { LK.loading = null; });
    return LK.loading;
  }
  function linksSave() {
    const run = LK.chain.then(async () => { await mkdir(dirname(LINK_FILE), { recursive: true }); await writeFile(LINK_FILE + '.tmp', JSON.stringify({ v: 1, links: Object.fromEntries(LK.map) })); await rename(LINK_FILE + '.tmp', LINK_FILE); });
    LK.chain = run.catch(() => {});
    return run.catch(e => log.warn('Discord : liaisons non enregistrées (' + (e && e.code || e) + ')'));
  }
  /** Membre du serveur ? (bot) true / false ; erreur levée si Discord ne sait pas répondre. */
  async function memberOf(id) {
    const g = await guild();
    try { await call('GET', `/guilds/${g.id}/members/${id}`); return true; }
    catch (e) { if (e.kind === 'refused' && (e.status === 404 || e.code === 10007 || e.code === 10013)) return false; throw e; }
  }
  /** Adhésion relue (une seule lecture à la fois par compte ; Discord en panne : statut gardé, nouvel essai après 1 min). */
  function recheck(tag, x) {
    if (now() - (LK.fail.get(tag) || 0) < 60e3) return Promise.resolve();
    if (!LK.chk.has(tag)) LK.chk.set(tag, (async () => {
      try { const mb = await memberOf(x.id), cur = LK.map.get(tag); if (cur && cur.id === x.id) { const was = cur.member; cur.member = mb; cur.at = now(); await linksSave(); if (was !== mb) log.log('Discord : compte lié, ' + (mb ? 'devenu membre du serveur.' : 'plus membre du serveur.')); } }
      catch (e) { if (LK.fail.size > 5000) LK.fail.clear(); LK.fail.set(tag, now()); log.warn('Discord : adhésion non vérifiée (' + e.message + ')'); }
    })().finally(() => LK.chk.delete(tag)));
    return LK.chk.get(tag);
  }
  /** Appel OAuth2 de l'utilisateur (échange du code, /users/@me, révocation) : formulaire ou jeton Bearer ; jamais le jeton du bot. Erreurs sans secret ni jeton. */
  async function oauth(path, { form, bearer } = {}) {
    let r;
    try { r = await fetchFn(API + path, { method: form ? 'POST' : 'GET', headers: { 'User-Agent': UA, Accept: 'application/json', ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) }, body: form ? new URLSearchParams(form).toString() : undefined, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT) }); }
    catch (e) { throw dErr('down', 'Discord injoignable'); }
    const t = await r.text().catch(() => ''); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { /* réponse non JSON */ }
    if (!r.ok) throw dErr(r.status === 429 ? 'limit' : r.status >= 500 ? 'down' : 'refused', 'Discord a refusé (HTTP ' + r.status + (j && typeof j.error === 'string' ? ' : ' + line(j.error).replace(/[^\w ]/g, '').slice(0, 40) : '') + ')', { status: r.status });
    return j;
  }
  /** Compte de l'appli (jeton Firebase vérifié) → empreinte ; sinon la réponse est déjà partie (null). */
  async function acctOf(req, res) {
    if (isLocked(req)) { json(res, 429, { error: 'too_many_attempts', message: 'Trop d\'essais invalides : réessaie dans quelques minutes.' }, { 'Retry-After': '300' }); return null; }
    const tok = String(req.headers['x-firebase-token'] || '');
    if (!tok) { json(res, 401, { error: 'auth_required', message: 'Connecte-toi d\'abord.' }); return null; }
    try { return o.amTag(String((await o.verify(tok)).uid)); }
    catch (e) {
      const code = e && e.authCode;
      if (code === 'expired') json(res, 401, { error: 'token_expired', message: 'Session expirée : le navigateur va la renouveler.' });
      else if (code === 'unavailable') json(res, 503, { error: 'auth_unavailable', message: 'Vérification du compte impossible pour le moment.' }, { 'Retry-After': '5' });
      else await badKey(req, res, 'bad_token', 401);
      return null;
    }
  }
  /* Page de retour (navigateur : dans l'appli Android, l'autorisation s'ouvre dans le navigateur) : français ou anglais selon Accept-Language, aucun script,
     CSP stricte (style par son empreinte), jamais en cache ni indexée, sans Referer (l'adresse porte le code et le state). */
  const PG_CSS = 'body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f1c;color:#e9ecf5;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}'
    + 'main{max-width:420px;margin:24px 16px;padding:28px 24px;border-radius:20px;background:#151b2e;border:1px solid #273150;text-align:center}'
    + '.i{width:56px;height:56px;margin:0 auto 12px;border-radius:50%;display:grid;place-items:center;font-size:28px;background:#5865f2;color:#fff}.i.bad{background:#7a3348}'
    + 'h1{margin:0 0 8px;font-size:22px}p{margin:0 0 20px;color:#b7bfd6}a{display:block;margin:10px 0 0;padding:12px 16px;border-radius:12px;background:#8b5cf6;color:#fff;font-weight:600;text-decoration:none}a.g{background:#273150}';
  const PG_CSP = `default-src 'none'; style-src 'sha256-${createHash('sha256').update(PG_CSS).digest('base64')}'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
  const PG_TX = {
    fr: { ok: ['Compte Discord lié', 'Tu es bien sur le serveur Mana Orbit : l\'invitation disparaît de l\'accueil. Tu peux revenir dans l\'appli.'],
      join: ['Compte Discord lié', 'Tu n\'es pas encore sur le serveur Mana Orbit : rejoins-le, l\'appli le verra d\'elle-même. Tu peux revenir dans l\'appli.'],
      denied: ['Liaison annulée', 'Tu as refusé l\'accès : rien n\'a été gardé. Tu peux réessayer depuis l\'appli (Compte et réglages › Discord).'],
      expired: ['Lien expiré', 'Ce lien a expiré ou a déjà servi : rien n\'a été gardé. Recommence depuis l\'appli (Compte et réglages › Discord).'],
      code: ['Liaison impossible', 'Discord n\'a pas accepté la demande : rien n\'a été gardé. Recommence depuis l\'appli.'],
      down: ['Discord injoignable', 'Discord ne répond pas pour le moment : rien n\'a été gardé. Réessaie dans quelques minutes depuis l\'appli.'],
      limit: ['Trop d\'essais', 'Trop de tentatives depuis ce réseau : rien n\'a été gardé. Réessaie plus tard.'],
      back: 'Revenir dans l\'appli', invite: 'Rejoindre le serveur', lang: 'fr' },
    en: { ok: ['Discord account linked', 'You\'re on the Mana Orbit server: the invitation is gone from the home screen. You can go back to the app.'],
      join: ['Discord account linked', 'You\'re not on the Mana Orbit server yet: join it, the app will notice by itself. You can go back to the app.'],
      denied: ['Linking cancelled', 'You declined access: nothing was kept. You can try again from the app (Account and settings › Discord).'],
      expired: ['Link expired', 'This link has expired or was already used: nothing was kept. Start again from the app (Account and settings › Discord).'],
      code: ['Linking failed', 'Discord did not accept the request: nothing was kept. Start again from the app.'],
      down: ['Discord unreachable', 'Discord is not responding right now: nothing was kept. Try again in a few minutes from the app.'],
      limit: ['Too many attempts', 'Too many attempts from this network: nothing was kept. Try again later.'],
      back: 'Back to the app', invite: 'Join the server', lang: 'en' },
  };
  /** Français si Accept-Language le préfère à l'anglais ; sinon anglais. */
  function pgLang(req) {
    const l = String(req.headers['accept-language'] || '').toLowerCase().split(',').map((x, i) => { const [t, ...pp] = x.trim().split(';'); const q = pp.map(s => /^q=([\d.]+)$/.exec(s.trim())).find(Boolean); return { t: t.split('-')[0], q: q ? Number(q[1]) : 1, i }; })
      .filter(x => (x.t === 'fr' || x.t === 'en') && x.q > 0).sort((a, b) => b.q - a.q || a.i - b.i);
    return l.length && l[0].t === 'fr' ? PG_TX.fr : PG_TX.en;
  }
  const hEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);      // attributs entre guillemets doubles
  function linkPage(req, res, status, kind) {
    const tx = pgLang(req), [h, p] = tx[kind], good = kind === 'ok' || kind === 'join', app = appOf(req);
    const html = `<!doctype html><html lang="${tx.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${hEsc(h)} · Mana Orbit</title><style>${PG_CSS}</style></head>`
      + `<body><main><div class="i${good ? '' : ' bad'}" aria-hidden="true">${good ? '✓' : '!'}</div><h1>${hEsc(h)}</h1><p>${hEsc(p)}</p>`
      + (kind === 'join' ? `<a href="${hEsc(DSC_INVITE)}" rel="noopener noreferrer">${hEsc(tx.invite)}</a>` : '') + `<a${kind === 'join' ? ' class="g"' : ''} href="${hEsc(app)}">${hEsc(tx.back)}</a></main></body></html>`;
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': PG_CSP, 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex, nofollow', 'Content-Language': tx.lang });
    res.end(req.method === 'HEAD' ? undefined : html);
  }
  /** GET /api/discord/callback?code&state (ou error&state : refus de l'utilisateur). */
  async function linkBack(req, res, u) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method_not_allowed' });
    const w = rateWait(req, 'dscback', BACK_H, 3600e3); if (w) return linkPage(req, res, 429, 'limit');
    const q = u.searchParams, st = stateTake(q.get('state'));
    if (q.has('error')) { log.log('Discord : liaison refusée par l\'utilisateur.'); return linkPage(req, res, 200, 'denied'); }      // state consommé s'il était bon ; rien de gardé
    if (!st) return linkPage(req, res, 400, 'expired');
    const code = q.get('code') || ''; if (!/^[\w.~-]{1,200}$/.test(code)) return linkPage(req, res, 400, 'code');
    let user, member;
    try {
      const tk = await oauth('/oauth2/token', { form: { grant_type: 'authorization_code', code, redirect_uri: redirOf(req), client_id: CID, client_secret: CSEC } });
      const at = tk && typeof tk.access_token === 'string' ? tk.access_token : ''; if (!at) throw dErr('refused', 'jeton d\'accès absent', { status: 400 });
      try { user = await oauth('/users/@me', { bearer: at }); }
      finally { oauth('/oauth2/token/revoke', { form: { token: at, token_type_hint: 'access_token', client_id: CID, client_secret: CSEC } }).catch(() => {}); }      // jeton d'accès oublié tout de suite
      if (!user || !ID_RE.test(String(user.id || ''))) throw dErr('refused', 'compte Discord illisible', { status: 400 });
      member = await memberOf(String(user.id)).catch(e => { log.warn('Discord : adhésion non vérifiée (' + e.message + ')'); return null; });
    } catch (e) {
      log.warn('Discord : liaison impossible (' + e.message + ')');
      return e.kind === 'refused' ? linkPage(req, res, 400, 'code') : linkPage(req, res, 502, 'down');
    }
    const name = line(user.global_name || user.username || '').slice(0, 80) || 'Discord', m = await links();
    m.set(st.tag, { id: String(user.id), name, member: member === true, at: member === null ? 0 : now() });      // adhésion inconnue : relue à la prochaine lecture
    LK.fail.delete(st.tag); await linksSave();
    log.log(`Discord : compte lié (${member ? 'membre du serveur' : member === false ? 'pas membre du serveur' : 'adhésion à vérifier'}).`);
    return linkPage(req, res, 200, member ? 'ok' : 'join');
  }
  /** /api/discord/<sub> : link, callback, me, unlink. */
  async function link(req, res, sub, u) {
    if (!LINK_ON) return json(res, 404, { error: 'not_found' });
    const qu = u || new URL(req.url || '/', 'http://x');
    if (sub === 'callback') return linkBack(req, res, qu);
    if (sub === 'me') {
      if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
      const w = rateWait(req, 'dscme', ME_H, 3600e3); if (w) return tooMany(res, w);
      const tag = await acctOf(req, res); if (!tag) return;
      const m = await links(), x = m.get(tag);
      if (!x) return json(res, 200, { linked: false });
      if (now() - (x.at || 0) > (x.member ? YES_MS : NO_MS)) await recheck(tag, x);      // pas membre : il a pu rejoindre (10 min) ; membre : il a pu partir (24 h)
      const y = m.get(tag) || x;
      return json(res, 200, { linked: true, name: y.name, member: !!y.member });
    }
    if (sub !== 'link' && sub !== 'unlink') return json(res, 404, { error: 'not_found' });
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return json(res, 415, { error: 'bad_content_type', message: 'Content-Type: application/json attendu.' });
    const w = rateWait(req, sub === 'link' ? 'dsclink' : 'dscunlink', LINK_H, 3600e3); if (w) return tooMany(res, w);
    try { await readBody(req, 4096); } catch (e) { return e.status === 413 ? tooLarge(res) : json(res, 400, { error: 'bad_request', message: 'JSON invalide' }); }
    const tag = await acctOf(req, res); if (!tag) return;
    if (sub === 'unlink') {
      const m = await links();
      if (m.delete(tag)) { await linksSave(); log.log('Discord : compte délié.'); }
      return json(res, 200, { ok: true });
    }
    const pay = `${tag}.${(now() + STATE_MS).toString(36)}.${randomBytes(12).toString('base64url')}`;
    const qs = new URLSearchParams({ response_type: 'code', client_id: CID, scope: 'identify', state: pay + '.' + sign(pay), redirect_uri: redirOf(req), prompt: 'consent' });
    return json(res, 200, { url: AUTH_URL + '?' + qs });
  }

  /* ── Carte mystère de la veille ── */
  /** Poste la carte de la veille dans #carte-mystère (info : daily-srv.mjs). Erreur levée si rien n'est parti (daily-srv.mjs réessaie au tour suivant). */
  async function reveal(info) {
    if (!ON) throw dErr('setup', 'bot Discord non configuré');
    const { c } = await find(['carte-mystère'], [TX, NEWS]);
    if (!c) throw dErr('setup', 'salon #carte-mystère introuvable');
    await post(c, `/channels/${c.id}/messages`, dscRevealMsg(info));
    log.log(`Discord : Carte mystère du ${info.day} révélée dans #${dscName(c.name)}.`);
    return true;
  }

  /* ── Statut « En ligne » : passerelle Discord (WebSocket) ──
     HELLO → battements de cœur (heartbeat_interval, le premier après une part tirée au sort), IDENTIFY (intents 0, statut personnalisé) ou RESUME après une coupure ;
     battement sans réponse : connexion morte, refaite. Reconnexion : 1 s, 2 s, 4 s… 60 s au plus ; session reprise quand Discord le permet (RECONNECT, coupure
     réseau), sinon nouvelle identification (INVALID_SESSION, 4007, 4009). Jeton refusé (4004) ou réglage refusé : arrêt, signalé une fois. Statut changé toutes
     les presenceMs (une langue après l'autre ; numéro relu à chaque fois : nouveau jour à 18 h). o.WebSocket : faux pour les tests ; o.presence false : coupé. */
  const WS = o.WebSocket || globalThis.WebSocket, ROT = Math.max(20, o.presenceMs || 30e3), GW_MAX = o.gwMaxMs ?? 60e3;
  const GW = { ws: null, seq: null, sid: '', url: '', hb: null, hb0: null, rot: null, wait: null, acked: true, i: 0, tries: 0, stop: false, up: false };
  const cardNo = () => { try { const n = o.cardNo ? Number(o.cardNo()) : 0; return n > 0 ? n : 0; } catch (e) { return 0; } };
  const presence = () => ({ since: null, activities: [{ type: 4, name: 'Custom Status', state: dscPresence(GW.i, cardNo()) }], status: 'online', afk: false });
  function gwSend(ws, op, d) { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ op, d })); } catch (e) { /* connexion en train de tomber : la fermeture suit */ } }
  function gwClear() { clearInterval(GW.hb); clearTimeout(GW.hb0); clearInterval(GW.rot); GW.hb = GW.hb0 = GW.rot = null; }
  const unref = t => { if (t && t.unref) t.unref(); return t; };
  function gwLater() {
    if (GW.stop || GW.wait) return;
    const base = Math.min(GW_MAX, 1000 * 2 ** Math.min(GW.tries++, 10)), ms = base + Math.floor(Math.random() * Math.min(500, base / 2));
    GW.wait = unref(setTimeout(() => { GW.wait = null; gwOpen(); }, ms));
  }
  async function gwOpen() {
    if (GW.stop || GW.ws) return;
    let url = GW.sid && GW.url ? GW.url : '';      // reprise : l'adresse donnée par READY
    if (!url) {
      try { const j = await call('GET', '/gateway/bot'); url = j && typeof j.url === 'string' && /^wss:\/\//.test(j.url) ? j.url : ''; }
      catch (e) { if (e.kind === 'refused' && e.status === 401) { GW.stop = true; log.warn('Discord : jeton du bot refusé, statut « En ligne » coupé'); return; } }
      if (!url && !o.api) url = 'wss://gateway.discord.gg';      // vraie API seulement (un faux Discord de test n'envoie jamais vers le vrai)
      if (!url) return gwLater();
    }
    if (GW.stop) return;
    let ws; try { ws = new WS(url.replace(/\/+$/, '') + '/?v=10&encoding=json'); } catch (e) { return gwLater(); }
    GW.ws = ws;
    ws.addEventListener('message', ev => gwMsg(ws, ev.data));
    ws.addEventListener('close', ev => gwClose(ws, ev && ev.code));
    ws.addEventListener('error', () => { /* la fermeture suit */ });
  }
  function gwMsg(ws, data) {
    if (ws !== GW.ws) return;
    let m; try { m = JSON.parse(String(data)); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.s != null) GW.seq = m.s;
    if (m.op === 10) {      // HELLO
      const every = Math.max(1000, Number(m.d && m.d.heartbeat_interval) || 41250), beat = () => {
        if (!GW.acked) { try { ws.close(4000); } catch (e) { /* déjà fermée */ } return; }      // pas de réponse au battement précédent : connexion morte
        GW.acked = false; gwSend(ws, 1, GW.seq);
      };
      gwClear(); GW.acked = true;
      GW.hb0 = unref(setTimeout(() => { beat(); GW.hb = unref(setInterval(beat, every)); }, Math.floor(every * Math.random())));
      if (GW.sid) gwSend(ws, 6, { token: TOKEN, session_id: GW.sid, seq: GW.seq });
      else gwSend(ws, 2, { token: TOKEN, intents: 0, properties: { os: process.platform, browser: 'manaorbit', device: 'manaorbit' }, presence: presence() });
    } else if (m.op === 11) GW.acked = true;
    else if (m.op === 1) gwSend(ws, 1, GW.seq);
    else if (m.op === 7) { try { ws.close(4000); } catch (e) { /* déjà fermée */ } }      // RECONNECT : reprise
    else if (m.op === 9) { if (!m.d) { GW.sid = ''; GW.seq = null; } try { ws.close(4000); } catch (e) { /* déjà fermée */ } }      // INVALID_SESSION
    else if (m.op === 0 && (m.t === 'READY' || m.t === 'RESUMED')) {
      if (m.t === 'READY') { GW.sid = String(m.d && m.d.session_id || ''); GW.url = String(m.d && m.d.resume_gateway_url || ''); }
      GW.tries = 0;
      if (!GW.up) { GW.up = true; log.log('Discord : bot en ligne (statut « Carte mystère », ' + DSC_PRESENCE.length + ' langues).'); }
      if (m.t === 'RESUMED') gwSend(ws, 3, presence());
      clearInterval(GW.rot); GW.rot = unref(setInterval(() => { GW.i++; gwSend(ws, 3, presence()); }, ROT));
    }
  }
  function gwClose(ws, code) {
    if (ws !== GW.ws) return;
    gwClear(); GW.ws = null;
    if (GW_FATAL.includes(code)) { GW.stop = true; log.warn('Discord : statut « En ligne » refusé par Discord (code ' + code + '), coupé'); return; }
    if (code === 4007 || code === 4009) { GW.sid = ''; GW.seq = null; }      // numéro de séquence faux, session expirée : nouvelle identification
    gwLater();
  }
  function start() { if (ON && typeof WS === 'function' && o.presence !== false && !GW.ws && !GW.wait) { GW.stop = false; gwOpen(); } }
  function stop() { GW.stop = true; gwClear(); clearTimeout(GW.wait); GW.wait = null; const ws = GW.ws; GW.ws = null; if (ws) { try { ws.close(1000); } catch (e) { /* déjà fermée */ } } }

  return { on: ON, linkOn: LINK_ON, feedback, admin, link, reveal, start, stop, gwOn: ON && typeof WS === 'function' && o.presence !== false, _g: G, _gw: GW };
}
