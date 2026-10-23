// Mana Orbit — rôles Discord des comptes liés (aucune dépendance npm). Chargé par discord-srv.mjs (rolesMake, avec ses helpers : call, load, links…) et par
// tools/discord-setup.mjs (DSC_ROLE_DEFS : mêmes noms, mêmes couleurs) ; testé par tests/test-discord-roles.mjs (faux Discord). Seule source des rôles gérés :
//   · « ✅ Compte lié » : tout compte Discord lié à un compte Mana Orbit (liaison OAuth2 de discord-srv.mjs) et membre du serveur ;
//   · un rôle par palier de trois badges de l'appli (src/progress.js : PRG_BADGES pour les seuils, PRG_NAMES pour les noms des paliers argent, or, diamant) :
//     série de la Carte mystère (dy_streak : meilleure série, vérifiée par le serveur, daily-srv.mjs › badges), Top 100 de la Carte mystère (dy_top : idem) et
//     Scanner (sc_cards : cartes scannées, compteur sc du document users/{uid}/meta/progress, lu dans Firestore avec le compte de service). Seul le plus haut
//     palier atteint est donné ; les autres paliers du même badge sont retirés. Valeur inconnue (Firestore absent, jeu coupé) : rien n'est touché pour ce badge.
// Le bot crée lui-même les rôles qui manquent (POST /guilds/{g}/roles : arrivent en bas de la liste, donc sous le sien), une passe à la fois, jamais en double :
// rôle retrouvé par son id gardé dans ADMIN_DIR/discord-roles.json (renommé ou recoloré à la main : gardé tel quel, jamais modifié), sinon par son nom utile
// (sans emoji, accents ni casse). Il faut la permission « Gérer les rôles » (Manage Roles, bit 28) et un rôle du bot AU-DESSUS des rôles gérés ; sans elle
// (403, code 50013) ou rôle trop haut : une ligne dans le journal, une seule fois, le reste du bot continue. Jamais d'id Discord, d'UID ni de jeton au journal.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';

export const DSC_TIER_COLORS = [0xcd7f32, 0xc0c6cf, 0xf2c230, 0x6fd6f2];      // bronze, argent, or, diamant
export const DSC_ROLE_LINKED = '✅ Compte lié';
/** Badges suivis : id de PRG_BADGES, source de la valeur (daily : badges de la Carte mystère, id du serveur ; progress : compteur du compte), emoji. */
export const DSC_ROLE_BADGES = [{ id: 'dy_streak', src: 'daily', key: 'streak', ic: '📅' }, { id: 'dy_top', src: 'daily', key: 'top100', ic: '🥇' }, { id: 'sc_cards', src: 'progress', key: 'sc', ic: '🔍' }];
let PG = null; try { PG = createRequire(import.meta.url)('./src/progress.js'); } catch (e) { /* appli absente : seul « Compte lié » */ }
/** Badges suivis avec leurs seuils et les noms français des 4 paliers (bronze : le nom du badge), lus dans src/progress.js. */
export const DSC_BADGES = DSC_ROLE_BADGES.map(x => {
  const b = PG && Array.isArray(PG.PRG_BADGES) ? PG.PRG_BADGES.find(y => y.id === x.id) : null, n = PG && PG.PRG_NAMES ? PG.PRG_NAMES[x.id] : null;
  return b && Array.isArray(b.tiers) && b.tiers.length === 4 && Array.isArray(n) && n.length === 3 ? { ...x, tiers: b.tiers.slice(), names: [b.t, ...n] } : null;
}).filter(Boolean);
/** Rôles gérés, du plus haut au plus bas : Compte lié (sans couleur), puis les diamants, ors, argents, bronzes (la couleur affichée est celle du meilleur palier).
 *  { key, name, color, badge?, tier? } ; key stable (linked, dy_streak:3…). */
export const DSC_ROLE_DEFS = [{ key: 'linked', name: DSC_ROLE_LINKED, color: 0 },
  ...[3, 2, 1, 0].flatMap(t => DSC_BADGES.map(b => ({ key: b.id + ':' + t, name: b.ic + ' ' + b.names[t], color: DSC_TIER_COLORS[t], badge: b.id, tier: t })))];
/** Palier atteint (-1 : aucun, 0 bronze … 3 diamant), comme progress.js › prgTier. */
export const dscTier = (tiers, v) => { let t = -1; tiers.forEach((x, i) => { if (v >= x) t = i; }); return t; };
/** Nom utile d'un rôle : sans emoji ni ponctuation en tête, accents et casse ignorés (« ✅ Compte lié » → « compte lie »). */
export const dscRoleName = n => String(n || '').normalize('NFD').replace(/\p{M}/gu, '').replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s+/g, ' ').trim().toLowerCase();

const B = n => 1n << BigInt(n), P_ADMIN = B(3), P_ROLES = B(28);
const ID_RE = /^\d{5,25}$/;

/** h : { call, load, guild, links, linksSave, now, log, file (discord-roles.json), daily (empreinte → [{ id, n }] ou null), progress (UID → document progress ou null),
 *  windowMs (synchro par compte au plus toutes les…, 6 h), retryMs (création refusée : nouvel essai après…, 10 min) }. */
export function rolesMake(h) {
  const now = h.now, log = h.log, WIN = h.windowMs ?? 6 * 3600e3, RETRY = h.retryMs ?? 10 * 60e3, UID_MS = 30 * 60e3;
  const RL = { ids: null, d: null, map: null, ing: null, off: 0, warned: new Set(), run: new Map(), uid: new Map(), seen: new Map(), boot: null, chain: Promise.resolve() };
  const once = (k, m) => { if (!RL.warned.has(k)) { RL.warned.add(k); log.warn(m); } };
  const why = s => ({ 'X-Audit-Log-Reason': encodeURIComponent('Mana Orbit : ' + s) });
  const denied = e => e && e.kind === 'refused' && (e.status === 403 || e.code === 50013 || e.code === 50001);
  const PERM_MSG = 'Discord : rôles des comptes liés impossibles, le bot n\'a pas la permission « Gérer les rôles » (Manage Roles) : la cocher sur le rôle du bot (Paramètres du serveur › Rôles), README › « Bot Discord »';
  const errOf = e => (e.kind === 'refused' ? 'HTTP ' + e.status + (e.code ? ', code ' + e.code : '') : e.kind === 'limit' ? 'limite de débit' : 'Discord injoignable');      // jamais le message brut (il peut citer un id)

  /* ── Ids des rôles gérés (ADMIN_DIR/discord-roles.json : { v, ids: { key: id } }), écriture atomique ── */
  async function idsLoad() {
    if (RL.ids) return RL.ids;
    let ids = {}; try { const j = JSON.parse(await readFile(h.file, 'utf8')); ids = Object.fromEntries(Object.entries((j && j.ids) || {}).filter(([, v]) => ID_RE.test(String(v)))); } catch (e) { if (e && e.code !== 'ENOENT') log.warn('Discord : discord-roles.json illisible (' + (e.code || 'JSON') + '), rôles retrouvés par leur nom'); }
    return (RL.ids = ids);
  }
  function idsSave() {
    const run = RL.chain.then(async () => { await mkdir(dirname(h.file), { recursive: true }); await writeFile(h.file + '.tmp', JSON.stringify({ v: 1, ids: RL.ids })); await rename(h.file + '.tmp', h.file); });
    RL.chain = run.catch(() => {});
    return run.catch(e => log.warn('Discord : ids des rôles non enregistrés (' + (e && e.code || e) + ')'));
  }

  /** Rôles gérés du serveur (relus avec les salons, au plus toutes les 5 min) : key → rôle utilisable (sous le rôle du bot) ; les absents sont créés (une passe à la fois). */
  async function ready() {
    const d = await h.load();
    if (RL.d === d && RL.map) return RL.map;
    if (!RL.ing) RL.ing = (async () => {
      const ids = await idsLoad(), can = d.base === null || (d.base & (P_ADMIN | P_ROLES)) !== 0n, top = Math.max(0, ...d.roles.filter(r => d.mine.has(r.id)).map(r => Number(r.position) || 0));
      if (!can) once('perm', PERM_MSG);
      const map = {}; let changed = false;
      for (const def of DSC_ROLE_DEFS) {
        let r = ids[def.key] && d.roles.find(x => x.id === ids[def.key]);
        if (!r) r = d.roles.find(x => x.id !== d.gid && !x.managed && dscRoleName(x.name) === dscRoleName(def.name));
        if (!r && can && now() >= RL.off) {
          try {
            r = await h.call('POST', `/guilds/${d.gid}/roles`, { name: def.name, color: def.color, permissions: '0', hoist: false, mentionable: false }, undefined, why('rôle des comptes liés'));
            if (r && r.id) { d.roles.push(r); log.log(`Discord : rôle « ${def.name} » créé.`); } else r = null;
          } catch (e) {
            RL.off = now() + RETRY;
            if (denied(e)) once('perm', PERM_MSG); else once('create', 'Discord : rôles des comptes liés pas créés (' + errOf(e) + '), nouvel essai dans ' + Math.round(RETRY / 60e3) + ' min');
          }
        }
        if (!r) { if (!can || now() < RL.off) continue; once('none:' + def.key, `Discord : rôle « ${def.name} » absent du serveur, pas donné`); continue; }
        if (ids[def.key] !== r.id) { ids[def.key] = String(r.id); changed = true; }
        if (d.base !== null && !(d.base & P_ADMIN) && (Number(r.position) || 0) >= top) { once('high:' + def.key, `Discord : rôle « ${r.name} » au-dessus du rôle du bot, pas géré : placer le rôle du bot plus haut (Paramètres du serveur › Rôles)`); continue; }
        map[def.key] = r;
      }
      if (changed) await idsSave();
      RL.d = d; RL.map = map;
      return map;
    })().finally(() => { RL.ing = null; });
    return RL.ing;
  }
  /** Au démarrage du bot : rôles gérés retrouvés ou créés. */
  function boot() { if (!RL.boot) RL.boot = ready().catch(e => { once('boot', 'Discord : rôles des comptes liés pas encore vérifiés (' + errOf(e) + ')'); return null; }).finally(() => { RL.boot = null; }); return RL.boot; }

  /** Membre lu par la liaison (memberOf) : ses rôles gardés 60 s (la synchro qui suit ne le relit pas). */
  const seen = (id, m) => { if (RL.seen.size > 2000) RL.seen.clear(); if (m && Array.isArray(m.roles)) RL.seen.set(id, { roles: m.roles.map(String), at: now() }); };
  /** UID d'un compte vu à l'instant (jeton vérifié) : en mémoire seulement, 30 min (jamais écrit). */
  const uidSet = (tag, uid) => { if (RL.uid.size > 5000) for (const [k, v] of RL.uid) if (now() - v.at > UID_MS || RL.uid.size > 5000) RL.uid.delete(k); RL.uid.set(tag, { uid, at: now() }); };
  const uidOf = tag => { const x = RL.uid.get(tag); return x && now() - x.at < UID_MS ? x.uid : ''; };
  /** Rôles actuels d'un membre (null : pas membre). */
  async function rolesOf(gid, id) {
    const s = RL.seen.get(id); if (s && now() - s.at < 60e3) { RL.seen.delete(id); return new Set(s.roles); }
    try { const m = await h.call('GET', `/guilds/${gid}/members/${id}`); return new Set(((m && m.roles) || []).map(String)); }
    catch (e) { if (e.kind === 'refused' && (e.status === 404 || e.code === 10007 || e.code === 10013)) return null; throw e; }
  }
  /** Ajouts et retraits (PUT / DELETE …/roles/{r}) → { add, del } faits ; refus de permission : signalé une fois, le reste abandonné. */
  async function apply(gid, id, add, del, reason) {
    const done = { add: 0, del: 0 };
    for (const [m, list] of [['PUT', add], ['DELETE', del]]) for (const r of list) {
      try { await h.call(m, `/guilds/${gid}/members/${id}/roles/${r.id}`, undefined, undefined, why(reason)); done[m === 'PUT' ? 'add' : 'del']++; RL.warned.delete('perm'); }
      catch (e) {
        if (denied(e)) { once('perm', PERM_MSG); return done; }
        if (e.kind === 'refused' && (e.code === 10011 || e.code === 10007 || e.status === 404)) { RL.d = null; if (e.code === 10007) return done; continue; }      // rôle supprimé : relu à la prochaine passe ; membre parti : rien de plus
        throw e;
      }
    }
    return done;
  }
  const nOf = (l, k) => { const x = Array.isArray(l) ? l.find(y => y && y.id === k) : null; return x && Number.isFinite(Number(x.n)) ? Number(x.n) : null; };
  /** Synchro d'un compte lié et membre (x : sa liaison, gardée) : Compte lié + plus haut palier de chaque badge suivi. Une à la fois par compte. */
  function sync(tag, x, why2 = 'synchro') {
    if (RL.run.has(tag)) return RL.run.get(tag);
    const p = (async () => {
      const map = await ready(); if (!Object.keys(map).length) return;
      x.rt = now();
      const uid = uidOf(tag);
      if (uid && h.progress) { try { const doc = await h.progress(uid), v = doc ? Number(doc.c && doc.c.sc) : 0; if (Number.isFinite(v) && v >= 0) x.sc = Math.max(Number(x.sc) || 0, Math.round(v)); } catch (e) { /* Firestore en panne : dernière valeur connue */ } }      // aucun document : rien de scanné
      let dl = null; if (h.daily) { try { dl = await h.daily(tag); } catch (e) { dl = null; } }
      const val = b => (b.src === 'progress' ? (typeof x.sc === 'number' ? x.sc : null) : nOf(dl, b.key));
      const g = await h.guild(), have = await rolesOf(g.id, x.id); if (!have) return;
      const add = [], del = [];
      if (map.linked && !have.has(map.linked.id)) add.push(map.linked);
      for (const b of DSC_BADGES) {
        const v = val(b); if (v === null) continue;
        const t = dscTier(b.tiers, v);
        for (let i = 0; i < 4; i++) { const r = map[b.id + ':' + i]; if (!r) continue; if (i === t && !have.has(r.id)) add.push(r); else if (i !== t && have.has(r.id)) del.push(r); }
      }
      const cur = (await h.links()).get(tag); if (cur && cur.id === x.id) await h.linksSave();
      if (!add.length && !del.length) return;
      const n = await apply(g.id, x.id, add, del, why2);
      if (n.add || n.del) log.log(`Discord : rôles d'un compte lié mis à jour (${[n.add ? '+' + n.add : '', n.del ? '−' + n.del : ''].filter(Boolean).join(', ')}).`);
    })().catch(e => { log.warn('Discord : rôles d\'un compte lié pas mis à jour (' + errOf(e) + ')'); }).finally(() => RL.run.delete(tag));
    RL.run.set(tag, p);
    return p;
  }
  /** Compte Discord délié (délier, suppression du compte, autre liaison) : tous les rôles gérés retirés. */
  function drop(id, reason) {
    const k = 'drop:' + id; if (RL.run.has(k)) return RL.run.get(k);
    const p = (async () => {
      const map = await ready(), list = Object.values(map); if (!list.length) return;
      const g = await h.guild(), have = await rolesOf(g.id, id); if (!have) return;
      const del = list.filter(r => have.has(r.id)); if (!del.length) return;
      const n = await apply(g.id, id, [], del, reason);
      if (n.del) log.log(`Discord : rôles retirés à un compte délié (−${n.del}).`);
    })().catch(e => { log.warn('Discord : rôles d\'un compte délié pas retirés (' + errOf(e) + ')'); }).finally(() => RL.run.delete(k));
    RL.run.set(k, p);
    return p;
  }
  /** Synchro due ? (membre, fenêtre passée) */
  const due = x => !!(x && x.member && now() - (Number(x.rt) || 0) > WIN);
  /** Fin d'une journée de la Carte mystère (daily-srv.mjs › close) : comptes liés et membres parmi ses joueurs, synchronisés l'un après l'autre (fenêtre ignorée). */
  async function day(tags) {
    const m = await h.links(), list = [...new Set(tags || [])].filter(t => { const x = m.get(t); return x && x.member; });
    for (const t of list) { const x = m.get(t); if (x) await sync(t, x, 'Carte mystère'); }
    return list.length;
  }
  const idle = async () => { while (RL.run.size || RL.ing || RL.boot) await Promise.all([...RL.run.values(), RL.ing, RL.boot].filter(Boolean)); };
  return { ready, boot, sync, drop, due, day, seen, uidSet, idle, _rl: RL };
}
