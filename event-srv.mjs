// Mana Orbit — événements saisonniers (chasse aux citrouilles d'Halloween…) : côté serveur (aucune dépendance npm : node:crypto, node:fs). Chargé par proxy.mjs
// (eventMake), testé par tests/test-event.mjs et tests/event-e2e.mjs. Les fêtes elles-mêmes (dates, objets, quotas, textes) sont des « packs » : src/evpacks.js,
// lu tel quel (createRequire) : ajouter une fête ne touche pas à ce fichier.
//   · Calendrier : l'édition en cours (heure de Paris, bascule à minuit) donnée par /__ping › event et GET /api/event ; EVENT=0 coupe tout, EVENT_FORCE=<id>
//     ouvre une édition quel que soit le jour (essais, lien /test) ; interrupteur à chaud du panneau /admin (édition coupée : gardé dans EVENT_DIR/state.json).
//   · Cachettes du jour : tirées ici pour chaque joueur (compte : empreinte SHA-256 de l'UID ; sans compte : jeton d'appareil x-event-device signé par le serveur),
//     de façon déterministe (HMAC du secret, de l'édition, du joueur et du jour) parmi celles que son appli peut montrer (?c= : capacités, src/evpacks.js › EV_CAPS),
//     chacune avec un jeton (HMAC) : l'appli réclame un objet avec son jeton, le serveur refuse au-delà du quota du jour, un jeton faux ou d'un autre jour.
//   · Progression : EVENT_DIR/<édition>.json (joueurs : objets trouvés par jour, pseudo public, dernier trouvé). Chaque jour joué reçoit un reçu signé (sig) que
//     l'appli garde avec sa progression (appareil, Firestore users/{uid}/meta/events) : un serveur qui a perdu son dossier relit la progression d'un compte
//     depuis ces reçus (POST /api/event/sync) ; la progression sans compte d'un appareil rejoint le compte une seule fois (POST /api/event/merge).
//   · Statistiques (panneau /admin › Événements, annonces Discord) : chasseurs, trouvés par jour, à total/total, top des pseudos publics.
//   · Notifications push (o.push, event-push.mjs) : appareils enregistrés avec ou sans compte (POST /api/event/push), annonces automatiques (tick de proxy.mjs),
//     envois manuels du panneau (GET/POST /api/admin/events/push, …/push/cancel).
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { evPushMake } from './event-push.mjs';

const EVP = createRequire(import.meta.url)('./src/evpacks.js');
const ID_RE = /^[a-z]+-\d{4}$/, DAY_RE = /^\d{4}-\d{2}-\d{2}$/, DEV_RE = /^([\w-]{22})\.([\w-]{16})$/, TOK_RE = /^[\w-]{16}$/, SIG_RE = /^[\w-]{22}$/;
const ROUTES = ['', 'claim', 'sync', 'merge', 'board', 'push'];
const SPOT_IDS = new Set(EVP.EV_SPOTS.map(s => s.id));
const evJson = (res, status, obj, extra = {}) => { const b = JSON.stringify(obj); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra }); res.end(b); };
const evBody = (req, max) => new Promise((ok, ko) => { const c = []; let n = 0; req.on('data', d => { n += d.length; if (n > max) { req.pause(); ko(Object.assign(new Error('too large'), { status: 413 })); } else c.push(d); }); req.on('end', () => ok(Buffer.concat(c))); req.on('error', ko); });
/** Empreinte d'un compte : la même que la Carte mystère et les amis (SHA-256 de l'UID). */
export const evTag = uid => createHash('sha256').update(String(uid)).digest('hex');
/** Pseudo public (celui de la Carte mystère : nom du profil, jamais le nom Google) : sans caractère de contrôle ni chevron, 24 caractères ; refusé par le filtre : vide. */
export function evName(v, bad) { const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').replace(/[\p{Cc}\p{Cf}<>]/gu, '').trim().slice(0, 24).trim() : ''; return s && !(bad && bad(s)) ? s : ''; }
/** Générateur pseudo-aléatoire reproductible (mulberry32) d'une graine hexadécimale. */
function rng(hex) { let a = parseInt(String(hex).slice(0, 8), 16) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

/** Tirage d'une couleur rare (calendrier de l'Avent, ciel du Nouvel an) : rr.p de chance, couleur parmi rr.covers ; '' : rien. Exporté pour les tests (taux). */
export function evRare(secret, id, k, i, rr) {
  const h = createHmac('sha256', secret).update(`evr|${id}|${k}|${i}`).digest();
  return h.readUInt32BE(0) / 0x100000000 < rr.p ? rr.covers[h.readUInt32BE(4) % rr.covers.length] : '';
}
/** Crée le moteur. o : { dir, on (EVENT ≠ '0'), force (EVENT_FORCE), secret, now, verify (jeton → { uid, emailVerified, provider }), bad (filtre de mots),
 *  json, readBody, rateWait, tooMany, tooLarge, isLocked, badKey, log, adminHeaders, adminBody (garde-fous des actions du panneau), adminLog, adminMail,
 *  push ({ send, target } : notifications ; null : aucune), pushExtra (→ appareils de la Carte mystère, cible « tous »), pushOpts (réglages de event-push.mjs : tests) }. */
export function eventMake(o = {}) {
  const now = o.now || Date.now, log = o.log || console, dir = o.dir || join(process.cwd(), '.data', 'events');
  const json = o.json || evJson, readBody = o.readBody || evBody, rateWait = o.rateWait || (() => 0), isLocked = o.isLocked || (() => false);
  const tooMany = o.tooMany || ((res, s) => json(res, 429, { error: 'rate_limited', retry: s }, { 'Retry-After': String(s) }));
  const tooLarge = o.tooLarge || (res => json(res, 413, { error: 'too_large' }));
  const badKey = o.badKey || ((req, res) => json(res, 401, { error: 'bad_token', message: 'Jeton de connexion invalide.' }));
  const ON = o.on !== false, FORCE = String(o.force || '').trim().toLowerCase(), HD = o.adminHeaders || {};
  const G = { secret: String(o.secret || ''), off: [], recs: new Map(), saving: new Map(), boot: null };
  /** Notifications push (event-push.mjs) : null sans o.push ou avec EVENT=0. */
  const EP = ON ? evPushMake({ dir, now, push: o.push, on: ON, off: () => G.off, extra: o.pushExtra, log, adminLog: o.adminLog, ...(o.pushOpts || {}) }) : null;

  /* ── Disque ── */
  async function put(f, s) { await mkdir(dirname(f), { recursive: true }); await writeFile(f + '.tmp', s); await rename(f + '.tmp', f); }
  async function getJson(f) { try { return JSON.parse(await readFile(f, 'utf8')); } catch (e) { return e && e.code === 'ENOENT' ? null : undefined; } }      // undefined : illisible (jamais écrasé)
  // Éditions coupées depuis le panneau : lues tout de suite (petit fichier), pour que /__ping les connaisse dès le premier appel.
  try { const st = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')); if (st && Array.isArray(st.off)) G.off = st.off.filter(x => typeof x === 'string' && ID_RE.test(x)); } catch (e) { /* aucune */ }
  const stateSave = () => put(join(dir, 'state.json'), JSON.stringify({ v: 1, off: G.off }));
  async function secret() {
    if (G.secret) return G.secret;
    const f = join(dir, '.secret'); let s = ''; try { s = (await readFile(f, 'utf8')).trim(); } catch (e) { /* pas encore */ }
    if (!/^[0-9a-f]{64}$/.test(s)) { s = randomBytes(32).toString('hex'); try { await put(f, s); } catch (e) { log.warn('Événements : secret non enregistré'); } }
    return (G.secret = s);
  }
  /** Progression d'une édition : { v, id, p: { joueur: { d: { jour: [cachettes] }, n, at, nm, a (compte), own (appareil rattaché à ce compte) } } } ; relue une fois. */
  async function rec(id) {
    let r = G.recs.get(id); if (r) return r;
    const j = await getJson(join(dir, id + '.json'));
    r = j && j.id === id && j.p && typeof j.p === 'object' ? j : { v: 1, id, p: {} };
    if (j === undefined) { r.bad = true; log.warn('Événements : ' + id + '.json illisible, gardé tel quel (rien ne sera écrit)'); }
    if (!G.recs.has(id)) G.recs.set(id, r);
    return G.recs.get(id);
  }
  /** Écriture groupée (1,5 s) ; flush : tout de suite. */
  function saveSoon(r, flush) {
    if (r.bad) return Promise.resolve();
    const w = G.saving.get(r.id) || {}; G.saving.set(r.id, w);
    const go = () => { clearTimeout(w.t); w.t = null; G.saving.delete(r.id); return put(join(dir, r.id + '.json'), JSON.stringify(r)).catch(e => log.warn('Événements : enregistrement impossible (' + (e && e.code || e) + ')')); };
    if (flush) return go();
    if (!w.t) { w.t = setTimeout(go, 1500); if (w.t.unref) w.t.unref(); }
    return Promise.resolve();
  }
  /** Tout ce qui attend part (arrêt du serveur, tests). */
  const flush = () => Promise.all([...G.saving.keys()].map(id => G.recs.get(id) && saveSoon(G.recs.get(id), true)));

  /* ── Calendrier ── */
  /** Édition en cours (ou null) : EVENT=0, coupée par le panneau, forcée par EVENT_FORCE. */
  const cur = (t = now()) => (ON ? EVP.evActive(t, { off: G.off, force: FORCE }) : null);
  /** /__ping › event : de quoi poser les décorations tout de suite. */
  function ping() { const e = cur(); return e ? { id: e.id, pack: e.pack, from: e.from, to: e.to, day: e.day, total: e.total, per: e.per } : null; }

  /* ── Joueurs ── */
  const devSig = id => createHmac('sha256', G.secret).update('evdev|' + id).digest('base64url').slice(0, 16);
  function devOf(req) { const m = DEV_RE.exec(String(req.headers['x-event-device'] || '')); return m && eq(devSig(m[1]), m[2]) ? m[1] : ''; }
  const devNew = () => { const id = randomBytes(16).toString('base64url'); return id + '.' + devSig(id); };
  /** Compte (jeton Firebase) : { tag, uid } ; pas de jeton : null ; jeton refusé : réponse envoyée, false. */
  async function who(req, res) {
    const tok = String(req.headers['x-firebase-token'] || ''); if (!tok) return null;
    if (isLocked(req)) { json(res, 429, { error: 'too_many_attempts', message: 'Trop d\'essais invalides : réessaie dans quelques minutes.' }, { 'Retry-After': '300' }); return false; }
    if (!o.verify) { json(res, 503, { error: 'auth_unavailable', message: 'Comptes indisponibles sur ce serveur.' }); return false; }
    let u; try { u = await o.verify(tok); }
    catch (e) {
      const code = e && e.authCode;
      if (code === 'expired') json(res, 401, { error: 'token_expired', message: 'Session expirée : le navigateur va la renouveler.' });
      else if (code === 'unavailable') json(res, 503, { error: 'auth_unavailable', message: 'Vérification du compte impossible pour le moment.' }, { 'Retry-After': '5' });
      else await badKey(req, res, 'bad_token', 401);
      return false;
    }
    return { tag: evTag(u.uid), uid: u.uid };
  }
  /** Clé du joueur : 'u' + empreinte du compte, sinon 'd' + appareil. */
  const keyOf = (u, dev) => (u ? 'u' + u.tag : dev ? 'd' + dev : '');
  const player = (r, k) => r.p[k] || (r.p[k] = { d: {}, n: 0, at: 0 });
  const total = (e, pl) => Math.min(e.total, Object.values(pl.d || {}).reduce((a, l) => a + (Array.isArray(l) ? l.length : 0), 0));
  /** Jeton d'une cachette (joueur, jour) ; reçu d'un jour (liste triée de ce qui y a été trouvé). */
  const spotTok = (id, k, day, s) => createHmac('sha256', G.secret).update(`evt|${id}|${k}|${day}|${s}`).digest('base64url').slice(0, 16);
  const daySig = (id, k, day, list) => createHmac('sha256', G.secret).update(`evd|${id}|${k}|${day}|${[...list].sort().join(',')}`).digest('base64url').slice(0, 22);
  /** Cachettes du jour d'un joueur : tirées parmi celles que son appli peut montrer (caps), de façon reproductible ; au plus EV_LVL_MAX[0] en vue sur l'accueil et
   *  EV_LVL_MAX[1] à un geste, le reste dans les sous-menus ; celles d'hier évitées s'il en reste assez. */
  function spotsOf(e, k, day, caps, want = EVP.evQuota(e, day)) {      // want : nombre de cachettes (quota du jour ; rattrapage d'un calendrier : ce qui manque)
    const ok = EVP.EV_SPOTS.filter(s => (s.need & caps) === s.need), shuffle = (d, from) => {
      const r = rng(createHmac('sha256', G.secret).update(`evpl|${e.id}|${k}|${d}`).digest('hex')), a = from.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    };
    const pick = (d, from) => {
      const out = [], n = [0, 0, 0], max = [...EVP.EV_LVL_MAX, want], a = shuffle(d, from);
      for (const s of a) { if (out.length >= want) break; if (n[s.lvl] < max[s.lvl]) { out.push(s); n[s.lvl]++; } }
      for (const s of a) { if (out.length >= want) break; if (!out.includes(s)) out.push(s); }      // pas assez de sous-menus (capacités) : complété
      return out;
    };
    const y = new Set(pick(EVP.evAdd(day, -1), ok).map(s => s.id)), fresh = ok.filter(s => !y.has(s.id)), base = fresh.length >= want * 3 ? fresh : ok;
    return pick(day, base).map(s => s.id);
  }
  /** Couleurs rares gagnées par un joueur : calendrier (pack.advent.rare) : { porte: couleur } pour ses portes ouvertes, sauf la dernière (récompense sûre) ;
   *  ciel (pack.sky.rare) : { n° du jour (1…) : couleur } pour chaque jour où il a trouvé au moins un objet.
   *  Tirage reproductible (secret, édition, joueur, porte ou jour) : le même à chaque lecture, invisible et impossible à forcer depuis l'appli. */
  function rares(e, k, pl) {
    const p = EVP.evPack(e.pack), out = {}; if (!p || !k) return out;
    if (p.advent && p.advent.rare) for (const d of EVP.evDoors(e, pl.d || {})) if (d.open && d.i < p.advent.doors) { const c = evRare(G.secret, e.id, k, d.i, p.advent.rare); if (c) out[d.i] = c; }
    if (p.sky && p.sky.rare) for (const [d, l] of Object.entries(pl.d || {})) {
      const i = EVP.evDiff(e.from, d) + 1; if (!Array.isArray(l) || !l.length || i < 1 || i > e.days) continue;
      const c = evRare(G.secret, e.id, k, i, p.sky.rare); if (c) out[i] = c;
    }
    return out;
  }
  /** Ce que voit le joueur : total, trouvées du jour, cachettes du jour et leurs jetons, jours joués et leurs reçus. */
  function me(e, r, k, caps) {
    const pl = r.p[k] || { d: {}, n: 0 }, day = e.day, found = (pl.d && pl.d[day]) || [], n = total(e, pl), sig = {};
    for (const [d, l] of Object.entries(pl.d || {})) if (Array.isArray(l) && l.length) sig[d] = daySig(e.id, k, d, l);
    const q = EVP.evQuota(e, day), full = n >= e.total, sp = full ? [] : spotsOf(e, k, day, caps, Math.min(q, e.total - n + found.length));      // rattrapage : pas plus de cachettes que d'objets manquants
    for (const s of found) if (!sp.includes(s)) {      // capacités changées depuis (autre appareil, connexion…) : celles déjà trouvées restent marquées, à la place d'une
      const i = sp.findLastIndex(x => !found.includes(x)); if (i >= 0) sp[i] = s; else sp.push(s);      // pas trouvée : jamais plus d'indices que le quota du jour
    }
    const dr = rares(e, k, pl), ad = EVP.evPack(e.pack), seed = ad && ad.advent && k ? createHmac('sha256', G.secret).update(`evs|${e.id}|${k}`).digest().readUInt32BE(0) || 1 : 0;      // graine des cartes du jour (calendrier)
    return { n, day, found, q, ...(Object.keys(dr).length ? { dr } : {}), ...(seed ? { seed } : {}), left: full ? 0 : Math.max(0, Math.min(q - found.length, e.total - n)), spots: sp.map(s => ({ s, t: spotTok(e.id, k, day, s), f: found.includes(s) ? 1 : 0 })), jours: pl.d || {}, sig, rs: pl.rs || 0 };      // rs : remise à zéro par le panneau (les copies plus anciennes ne comptent plus)
  }
  const edOut = e => ({ id: e.id, pack: e.pack, from: e.from, to: e.to, day: e.day, days: e.days, dayNo: EVP.evDiff(e.from, e.day) + 1, left: EVP.evDiff(e.day, e.to), total: e.total, per: e.per, ...(e.forced ? { forced: true } : {}) });
  async function body(req, res, max = 4096) {
    let b; try { b = JSON.parse((await readBody(req, max)).toString('utf8') || '{}'); } catch (e) { if (e.status === 413) tooLarge(res); else json(res, 400, { error: 'bad_request', message: 'JSON invalide' }); return null; }
    if (!b || typeof b !== 'object' || Array.isArray(b)) { json(res, 400, { error: 'bad_request', message: 'JSON invalide' }); return null; }
    return b;
  }
  /** Jours reçus de l'appli ({ jour: [cachettes] } + { jour: reçu }) : seulement ceux de l'édition, jusqu'à aujourd'hui, au reçu valable pour la clé k. */
  function verified(e, k, jours, sig) {
    const out = {}; if (!jours || typeof jours !== 'object' || !sig || typeof sig !== 'object') return out;
    for (const [d, l] of Object.entries(jours).slice(0, 40)) {
      if (!DAY_RE.test(d) || d < e.from || d > e.day || !Array.isArray(l) || !l.length || l.length > EVP.evQuota(e, d)) continue;
      const list = [...new Set(l.filter(s => typeof s === 'string' && SPOT_IDS.has(s)))]; if (list.length !== l.length) continue;
      if (typeof sig[d] === 'string' && SIG_RE.test(sig[d]) && eq(daySig(e.id, k, d, list), sig[d])) out[d] = list;
    }
    return out;
  }
  /** Ajoute des jours à un joueur (union, quota du jour et total respectés) ; true si quelque chose a changé. */
  function absorb(e, pl, days) {
    let ch = false;
    for (const [d, l] of Object.entries(days)) {
      const cur0 = pl.d[d] || [];
      for (const s of l) { if (cur0.length >= EVP.evQuota(e, d) || total(e, pl) >= e.total) break; if (!cur0.includes(s)) { cur0.push(s); pl.d[d] = cur0; ch = true; } }
    }
    if (ch) { pl.n = total(e, pl); pl.at = Math.max(pl.at || 0, now()); }
    return ch;
  }

  /* ── Routes /api/event… ── */
  async function api(req, res, path, url) {
    const sub = path.replace(/^event\/?/, '');
    if (!ROUTES.includes(sub)) return json(res, 404, { error: 'not_found' });
    const w = rateWait(req, 'event', 240, 600e3); if (w) return tooMany(res, w);
    await secret();
    const e = cur(), dev = devOf(req), devOut = dev ? {} : { dev: devNew() }, t = now();
    if (sub === 'push') {      // { sub, l } : cet appareil prévenu des événements (avec ou sans compte) ; { off: clé } : retiré
      if (!EP) return json(res, 404, { error: 'push_disabled', message: 'Notifications indisponibles sur ce serveur.' });
      if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
      const w2 = rateWait(req, 'evpush', 30, 3600e3); if (w2) return tooMany(res, w2);
      const b = await body(req, res, 4096); if (!b) return;
      const u = await who(req, res); if (u === false) return;
      if (!u && !dev) return json(res, 400, { error: 'device', message: 'Réessaie dans un instant.', ...devOut });      // jeton d'appareil donné : l'appli réessaie avec lui
      const [st, out] = await EP.reg(u, dev, b);
      return json(res, st, { ...out, ...devOut });
    }
    if (req.method === 'GET' && !sub) {
      const up = ON ? EVP.evUpcoming(EVP.evDay(t), 14) : null;
      if (!e) return json(res, 200, { on: false, now: t, next: EVP.evNextMidnight(t), ...(up && !G.off.includes(up.id) ? { soon: { id: up.id, pack: up.pack, from: up.from, in: up.in } } : {}), ...devOut });
      const u = await who(req, res); if (u === false) return;
      const caps = Math.max(0, Math.min(255, Math.floor(Number(url.searchParams.get('c')) || 0))) | (u ? EVP.EV_CAPS.acct : 0), k = keyOf(u, dev), r = await rec(e.id);
      return json(res, 200, { on: true, ev: edOut(e), now: t, next: EVP.evNextMidnight(t), acct: !!u, me: k ? me(e, r, k, caps) : null, ...devOut });
    }
    if (req.method === 'GET' && sub === 'board') {
      const id = String(url.searchParams.get('ev') || (e && e.id) || ''), ed = ID_RE.test(id) ? EVP.evById(id) : null; if (!ed) return json(res, 404, { error: 'not_found' });
      const u = await who(req, res); if (u === false) return;
      return json(res, 200, await board(ed, u ? 'u' + u.tag : ''));
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
    const b = await body(req, res, sub === 'claim' ? 1024 : 8192); if (!b) return;
    if (!e || b.ev !== e.id) return json(res, 404, { error: 'no_event', message: 'Aucun événement en cours.' });
    const u = await who(req, res); if (u === false) return;
    const r = await rec(e.id);
    if (sub === 'claim') {      // { ev, day, s, t, n? } : une cachette trouvée
      const k = keyOf(u, dev); if (!k) return json(res, 400, { error: 'device', message: 'Réessaie dans un instant.', ...devOut });
      if (b.day !== e.day) return json(res, 410, { error: 'wrong_day', message: 'Ces cachettes étaient celles d\'un autre jour.', day: e.day });
      const s = String(b.s || ''); if (!SPOT_IDS.has(s) || !TOK_RE.test(String(b.t || '')) || !eq(spotTok(e.id, k, e.day, s), b.t)) return json(res, 403, { error: 'bad_token', message: 'Cachette inconnue.' });
      const pl = player(r, k), list = pl.d[e.day] || [], q = EVP.evQuota(e, e.day);
      if (u) { pl.a = 1; const nm = evName(b.n, o.bad); if (nm) pl.nm = nm; }
      if (list.includes(s)) return json(res, 200, { ok: true, dup: true, n: total(e, pl), found: list, left: Math.max(0, Math.min(q - list.length, e.total - total(e, pl))), sig: daySig(e.id, k, e.day, list) });
      if (total(e, pl) >= e.total) return json(res, 409, { error: 'done', message: 'Tu as déjà tout trouvé.', n: total(e, pl) });
      if (list.length >= q) return json(res, 409, { error: 'day_quota', message: 'Plus rien à trouver aujourd\'hui : reviens demain.', n: total(e, pl), found: list });
      list.push(s); pl.d[e.day] = list; pl.n = total(e, pl); pl.at = t; saveSoon(r);
      const dr = rares(e, k, pl);
      return json(res, 200, { ok: true, n: pl.n, found: list, left: Math.max(0, Math.min(q - list.length, e.total - pl.n)), sig: daySig(e.id, k, e.day, list), ...(Object.keys(dr).length ? { dr } : {}) });
    }
    if (sub === 'sync') {      // { ev, jours, sig } (compte) : progression relue depuis la copie de l'appli (Firestore), reçus vérifiés
      if (!u) return json(res, 401, { error: 'auth_required', message: 'Connecte-toi.' });
      const k = 'u' + u.tag, pl = player(r, k); pl.a = 1; { const nm = evName(b.n, o.bad); if (nm) pl.nm = nm; }
      if ((Number(b.rs) || 0) >= (pl.rs || 0) && absorb(e, pl, verified(e, k, b.jours, b.sig))) saveSoon(r);      // copie d'avant une remise à zéro : ignorée
      return json(res, 200, { ok: true, me: me(e, r, k, Math.floor(Number(b.c) || 0) | EVP.EV_CAPS.acct) });
    }
    if (sub === 'merge') {      // { ev, jours?, sig? } (compte + appareil) : la progression sans compte de cet appareil rejoint le compte, une seule fois
      if (!u) return json(res, 401, { error: 'auth_required', message: 'Connecte-toi.' });
      if (!dev) return json(res, 400, { error: 'device', message: 'Appareil inconnu.', ...devOut });
      const dk = 'd' + dev, dp = r.p[dk], k = 'u' + u.tag;
      if (dp && dp.own && dp.own !== u.tag) return json(res, 409, { error: 'owned', message: 'Cette progression a déjà rejoint un autre compte.' });
      const days = (Number(b.rs) || 0) >= ((r.p[k] && r.p[k].rs) || 0) ? { ...verified(e, dk, b.jours, b.sig) } : {};
      if (dp) for (const [d, l] of Object.entries(dp.d || {})) days[d] = [...new Set([...(days[d] || []), ...l])];
      const pl = player(r, k); pl.a = 1; { const nm = evName(b.n, o.bad); if (nm) pl.nm = nm; }
      const ch = absorb(e, pl, days); const dpl = player(r, dk); dpl.own = u.tag; saveSoon(r);
      return json(res, 200, { ok: true, merged: ch, me: me(e, r, k, Math.floor(Number(b.c) || 0) | EVP.EV_CAPS.acct) });
    }
    return json(res, 404, { error: 'not_found' });
  }

  /* ── Statistiques et classement ── */
  /** Joueurs comptés : ceux qui ont trouvé au moins un objet ; un appareil rattaché à un compte ne compte plus à part. */
  const hunters = (ed, r) => Object.entries(r.p).filter(([, p]) => p && !p.own && total(ed, p) > 0);
  async function stats(id) {
    const ed = EVP.evById(id); if (!ed) return null;
    const r = await rec(id), hs = hunters(ed, r), days = new Map(), dist = new Array(ed.total + 1).fill(0);
    let finds = 0, full = 0, accounts = 0;
    for (const [k, p] of hs) {
      const n = total(ed, p); finds += n; dist[n]++; if (n >= ed.total) full++; if (k[0] === 'u') accounts++;
      for (const [d, l] of Object.entries(p.d || {})) { const x = days.get(d) || { day: d, finds: 0, hunters: 0 }; x.finds += l.length; x.hunters += l.length ? 1 : 0; days.set(d, x); }
    }
    const top = hs.filter(([k, p]) => k[0] === 'u' && p.nm).map(([, p]) => ({ n: p.nm, c: total(ed, p), at: p.at || 0 })).sort((a, b) => b.c - a.c || a.at - b.at).slice(0, 20);
    return { hunters: hs.length, accounts, devices: hs.length - accounts, full, finds, days: [...days.values()].sort((a, b) => (a.day < b.day ? -1 : 1)), dist, top };
  }
  async function board(ed, mine) {
    const r = await rec(ed.id), hs = hunters(ed, r).filter(([k]) => k[0] === 'u'), rows = hs.map(([k, p]) => ({ k, n: p.nm || 'Chasseur ' + k.slice(1, 5).toUpperCase(), c: total(ed, p), at: p.at || 0 })).sort((a, b) => b.c - a.c || a.at - b.at);
    const i = mine ? rows.findIndex(x => x.k === mine) : -1, out = x => ({ n: x.n, c: x.c });
    return { ev: ed.id, total: ed.total, hunters: hunters(ed, r).length, full: hs.filter(([, p]) => total(ed, p) >= ed.total).length, rows: rows.slice(0, 20).map((x, j) => ({ r: j + 1, ...out(x), ...(x.k === mine ? { me: true } : {}) })), ...(i >= 0 ? { me: { r: i + 1, c: rows[i].c } } : {}) };
  }

  /* ── Panneau /admin › Événements ── */
  const admPid = k => createHmac('sha256', G.secret).update('evadm|' + k).digest('base64url').slice(0, 12);      // identifiant opaque d'un joueur pour le panneau (jamais l'empreinte)
  /** Chasseurs d'une édition pour le panneau : nom du compte réduit (comme la liste des comptes, si elle est calculée), pseudo public, trouvées, aujourd'hui, jours joués. */
  async function players(ed, mine) {
    const r = await rec(ed.id), day = EVP.evDay(now()), hs = hunters(ed, r), names = o.adminNames ? o.adminNames(hs.filter(([k]) => k[0] === 'u').map(([k]) => k.slice(1))) : new Map();
    return hs.map(([k, p]) => { const nm = names.get(k.slice(1)) || {}; return { id: admPid(k), acct: k[0] === 'u', name: nm.name || '', mail: nm.mail || '', n: p.nm || '', c: total(ed, p), today: ((p.d || {})[day] || []).length, days: Object.values(p.d || {}).filter(l => l && l.length).length, last: p.at || 0, ...(k === mine ? { me: true } : {}) }; })
      .sort((a, b) => b.c - a.c || a.last - b.last).slice(0, 3000);
  }
  async function admin(req, res, sub, url, u) {
    const t = now(), day = EVP.evDay(t), y = +day.slice(0, 4);
    const list = async () => {
      const seen = new Map();
      for (const p of EVP.EV_PACKS) for (const yy of [y - 1, y, y + 1]) {
        const ed = EVP.evEdition(p, yy), soon = EVP.evDiff(day, ed.from), live = day >= ed.from && day <= ed.to, past = day > ed.to;
        const forced = FORCE && (FORCE === ed.id || FORCE === p.id) && yy === y;
        if (!(p.ready || forced)) continue;
        if (!(live || forced || (soon > 0 && soon <= 60) || (past && G.recs.has(ed.id)) || (past && EVP.evDiff(ed.to, day) <= 60))) continue;
        seen.set(ed.id, { id: ed.id, pack: p.id, name: p.name, emoji: p.obj.emoji, obj: p.obj.many, from: ed.from, to: ed.to, total: ed.total, per: ed.per, state: live || forced ? 'live' : past ? 'past' : 'soon', off: G.off.includes(ed.id) });
      }
      return [...seen.values()].sort((a, b) => (a.from < b.from ? 1 : -1));
    };
    if (req.method === 'GET' && sub === 'events') {
      const l = await list(), st = {};
      const mine = u && u.uid ? 'u' + evTag(u.uid) : '';
      for (const x of l) if (x.state !== 'soon') { st[x.id] = await stats(x.id); st[x.id].players = await players(EVP.evById(x.id), mine); }
      const c = ON ? EVP.evActive(t, { force: FORCE }) : null;
      return json(res, 200, { on: ON, force: FORCE, day, cur: c ? c.id : null, list: l, stats: st }, HD);
    }
    if (req.method === 'POST' && sub === 'events/switch') {
      const b = o.adminBody ? await o.adminBody(req, res) : await body(req, res); if (!b) return;
      const id = String(b.id || ''); if (!ID_RE.test(id) || !EVP.evById(id)) return json(res, 404, { error: 'not_found', message: 'Événement inconnu.' }, HD);
      if (typeof b.on !== 'boolean') return json(res, 400, { error: 'bad_request', message: 'on (true : actif, false : coupé) attendu.' }, HD);
      G.off = b.on ? G.off.filter(x => x !== id) : [...new Set([...G.off, id])];
      try { await stateSave(); } catch (err) { log.warn('Événements : interrupteur non enregistré (' + (err && err.code || err) + ')'); }
      log.log('Événements : ' + id + (b.on ? ' rallumé' : ' coupé') + ' depuis le panneau.');
      if (o.adminLog) await o.adminLog({ t, a: 'event', n: '', m: '', d: id + (b.on ? ' : rallumé' : ' : coupé'), by: o.adminMail && u ? o.adminMail(u.email) : '', ok: true });
      return json(res, 200, { ok: true, off: G.off }, HD);
    }
    if (sub === 'events/push' || sub === 'events/push/cancel') {      // notifications : état, historique ; envoi manuel { title, body, target, at? } ; annulation { id }
      if (!EP) return json(res, 404, { error: 'push_disabled', message: ON ? 'Notifications des événements indisponibles : pas de compte de service FCM, ou EVENT_PUSH=0.' : 'Événements coupés (EVENT=0).' }, HD);
      if (req.method === 'GET' && sub === 'events/push') return json(res, 200, await EP.view(), HD);
      if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' }, HD);
      const b = o.adminBody ? await o.adminBody(req, res, 8192) : await body(req, res, 8192); if (!b) return;
      const by = o.adminMail && u ? o.adminMail(u.email) : '';
      const [st, out] = sub === 'events/push' ? await EP.send(b, by) : await EP.cancel(String(b.id || ''), by);
      return json(res, st, out, st === 429 && out.retry ? { ...HD, 'Retry-After': String(out.retry) } : HD);
    }
    if (req.method === 'POST' && sub === 'events/reset') {      // { id, p : identifiant du joueur ou 'me' } : sa progression de cette édition remise à zéro (débogage, triche) ; ses copies d'avant ne reviennent pas
      const b = o.adminBody ? await o.adminBody(req, res) : await body(req, res); if (!b) return;
      const id = String(b.id || ''), ed = ID_RE.test(id) ? EVP.evById(id) : null; if (!ed) return json(res, 404, { error: 'not_found', message: 'Événement inconnu.' }, HD);
      const r = await rec(id), want = String(b.p || ''), k = want === 'me' ? (u && u.uid ? 'u' + evTag(u.uid) : '') : Object.keys(r.p).find(x => admPid(x) === want);
      if (!k) return json(res, 404, { error: 'not_found', message: 'Joueur introuvable.' }, HD);
      const pl = r.p[k] || (r.p[k] = {}); pl.d = {}; pl.n = 0; pl.at = 0; pl.rs = t;
      for (const [dk, dp] of Object.entries(r.p)) if (dk[0] === 'd' && dp && dp.own === k.slice(1)) { dp.d = {}; dp.n = 0; dp.rs = t; }      // appareils rattachés à ce compte : remis à zéro aussi (sinon rattachés de nouveau)
      await saveSoon(r, true);
      log.log('Événements : progression d\'un joueur remise à zéro (' + id + ') depuis le panneau.');
      if (o.adminLog) await o.adminLog({ t, a: 'event', n: '', m: '', d: id + ' : progression remise à zéro' + (want === 'me' ? ' (la sienne)' : ''), by: o.adminMail && u ? o.adminMail(u.email) : '', ok: true });
      return json(res, 200, { ok: true, stats: { ...(await stats(id)), players: await players(ed, u && u.uid ? 'u' + evTag(u.uid) : '') } }, HD);
    }
    return json(res, 404, { error: 'not_found' }, HD);
  }

  return { api, admin, ping, cur, stats, board, flush: async () => { await flush(); if (EP) await EP.flush(); }, off: () => G.off.slice(), devSig: async id => { await secret(); return devSig(id); },
    pushOn: !!EP, pushTick: () => (EP ? EP.tick() : Promise.resolve()), _push: EP };
}
