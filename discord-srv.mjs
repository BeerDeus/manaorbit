// Mana Orbit — le bot Discord, côté serveur (aucune dépendance npm : fetch, FormData et Blob de Node 18+). Chargé par proxy.mjs (discordMake), testé par
// tests/test-discord-srv.mjs (faux Discord HTTP, vrai proxy.mjs). Trois usages :
//   · « Aide et avis » de l'appli : POST /api/feedback → un fil dans le forum #bugs, #idées ou #aide (étiquettes de la plateforme et de la partie de l'appli, captures en pièces jointes) ;
//   · panneau /admin : GET /api/admin/discord (salons, rôles, derniers envois), POST …/send (message de l'éditeur, pings de rôles, publication d'une annonce), POST …/delete ;
//   · Carte mystère de la veille (reveal, appelé par daily-srv.mjs au tour de garde) : message FR + EN dans #carte-mystère ;
//   · statut « En ligne » (passerelle Discord, WebSocket de Node 22+ ; sans lui : bot affiché hors ligne, le reste marche pareil) : « 🔮 Carte mystère n° 42 »,
//     dans une langue après l'autre (une toutes les presenceMs, 30 s). Aucune intention (intents 0) : le bot ne lit rien, il se montre seulement.
// Serveur Discord : DISCORD_GUILD_ID, sinon le seul serveur du bot. Salons et rôles relus au plus toutes les 5 min (tout de suite si un salon gardé n'existe plus) ;
// salons trouvés par leur nom utile (« 🐞・bugs » → bugs, ou le nom exact d'un ancien serveur), accents et casse ignorés. Limite de débit (429) : attente de
// retry_after (10 s au plus en tout, 4 essais) ; Discord en panne (5xx, réseau) : un nouvel essai. Jeton : seulement dans l'en-tête Authorization, jamais dans
// un journal, une erreur ni une réponse. Mentions : jamais de ping venu d'un utilisateur (allowed_mentions vide) ; ceux de l'éditeur, exactement ceux demandés.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const TX = 0, CAT = 4, NEWS = 5, FORUM = 15, REQUIRE_TAG = 16;
const B = n => 1n << BigInt(n), P_ADMIN = B(3), P_VIEW = B(10), P_SEND = B(11), P_EMBED = B(14), P_ATTACH = B(15), P_MENTION = B(17), P_ALL = (1n << 53n) - 1n;
export const DSC_PERMS = P_VIEW | P_SEND | P_EMBED | P_ATTACH | P_MENTION;      // permissions du bot (183296) : voir les salons, envoyer (et créer un fil de forum), liens intégrés, fichiers, @everyone et rôles non mentionnables
export const DSC_GAME = 'https://manaorbit.app/?mystere=1';
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
 *  cacheMs (5 min), maxWaitMs (10 s), tries (4), retryMs (attente avant le nouvel essai d'une panne, 1 s), timeoutMs (15 s) }. */
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
  async function admin(req, res, sub) {
    if (sub === 'discord') {
      if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' }, HD);
      if (o.off) return json(res, 404, { error: 'not_found', message: 'Bot Discord coupé (DISCORD=0).' }, HD);
      const sent = await sentList(), off = m => json(res, 200, { on: false, guild: null, channels: [], roles: [], sent, message: m }, HD);
      if (!ON) return off('Bot Discord non configuré (DISCORD_BOT_TOKEN absent chez l\'hébergeur).');
      let d; try { d = await load(); }
      catch (e) { log.warn('Discord : panneau, serveur illisible (' + e.message + ')'); return off(e.kind === 'setup' ? e.message : e.kind === 'refused' && e.status === 401 ? 'Jeton du bot refusé par Discord (DISCORD_BOT_TOKEN à recopier).' : e.kind === 'refused' ? 'Discord a refusé : ' + (e.dm || 'HTTP ' + e.status) + '.' : e.kind === 'limit' ? e.message : 'Discord injoignable pour le moment.'); }
      return json(res, 200, { on: true, guild: { id: d.gid, name: d.gname }, channels: chanList(d), roles: roleList(d), sent }, HD);
    }
    if (sub !== 'discord/send' && sub !== 'discord/delete') return json(res, 404, { error: 'not_found' }, HD);
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' }, HD);
    // Mêmes garde-fous que proxy.mjs › admAct : même origine, JSON, budget ADMIN_ACTIONS_PER_H par heure et par réseau (le même que les autres actions)
    const sf = String(req.headers['sec-fetch-site'] || '');
    if (sf && sf !== 'same-origin' && sf !== 'none') return json(res, 403, { error: 'cross_site', message: 'Action refusée : demande venue d\'une autre page.' }, HD);
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return json(res, 415, { error: 'bad_content_type', message: 'Content-Type: application/json attendu.' }, HD);
    const w = rateWait(req, 'adminact', ACT_H, 3600e3); if (w) return tooMany(res, w);
    let b; try { b = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8') || '{}'); } catch (e) { return e.status === 413 ? tooLarge(res) : json(res, 400, { error: 'bad_request', message: 'JSON invalide' }, HD); }
    if (!b || typeof b !== 'object' || Array.isArray(b)) return json(res, 400, { error: 'bad_request', message: 'JSON invalide' }, HD);
    if (!ON) return json(res, 404, { error: 'not_found', message: o.off ? 'Bot Discord coupé (DISCORD=0).' : 'Bot Discord non configuré.' }, HD);
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

  return { on: ON, feedback, admin, reveal, start, stop, gwOn: ON && typeof WS === 'function' && o.presence !== false, _g: G, _gw: GW };
}
