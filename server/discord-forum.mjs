// Mana Orbit — fils « Aide et avis » du bot Discord : ce qui se passe autour du fil créé par POST /api/feedback (discord-srv.mjs › discordMake › feedback,
// qui passe ses helpers : call, load, forums…). Testé par tests/test-discord-forum.mjs (faux Discord, vrai proxy.mjs). Quatre choses :
//   · ping de l'équipe : rôles 👑 Créateur, Admin, Modo, Support (DISCORD_STAFF_ROLES : noms séparés par des virgules ; 0 : aucun) trouvés par leur nom utile
//     (emoji, casse et accents ignorés ; absent : ignoré), mentionnés en fin du premier message ; allowed_mentions.roles = exactement ceux-là ;
//   · un seul fil par envoi : nonce de l'appli (gardé dans son brouillon jusqu'au succès) par compte ou réseau, 30 min ; même nonce → le fil déjà créé
//     ({ dup: true }), envoi encore en cours → son résultat attendu ; sans nonce (appli d'avant) : même compte ou réseau, même type, titre et texte identiques
//     une fois pliés ;
//   · titres proches : après la création (la réponse n'attend pas), titre plié (accents, casse, mots vides fr et en) comparé aux fils ouverts des trois forums
//     (Dice sur les trigrammes et sur les mots) ; ressemblants → « 🔁 Peut-être lié à : <#id> · <#id> » dans le nouveau fil (3 au plus, aucun ping, silencieux) ;
//   · l'auteur prévenu dans l'appli quand son fil avance (compte connu et notifications des amis en marche : notifyUser de proxy.mjs) : étiquette de l'équipe
//     ajoutée (étiquettes modérées du forum), réponse d'un autre que l'auteur, fil fermé. Fils suivis dans ADMIN_DIR/discord-feedback.json (empreinte du compte,
//     langue, type, titre, état connu : étiquettes, nombre de messages, dernier message vu, fermé), 2 000 au plus, oubliés après 90 jours, à la suppression du
//     fil depuis /admin et à la suppression du compte (DELETE /api/friends/me). Sources : actions du panneau /admin (tout de suite) et relève toutes les
//     DISCORD_FEEDBACK_POLL_MS (10 min ; 0 : coupée). Une notification par fil et par relève, regroupée, dans la langue de l'appareil ; toucher : ./?avis=<fil>&g=<serveur>
//     (l'appli ouvre le fil sur Discord : help.js › fbAvisOpen). Aucun id d'utilisateur, ni UID, ni texte dans un journal.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

export const FBF_STAFF = ['Créateur', 'Admin', 'Modo', 'Support'];
const fold = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
/** Nom utile d'un rôle : emoji et ponctuation retirés, plié (« 👑 Créateur » → « createur »). */
const roleKey = s => fold(String(s || '').replace(/[^\p{L}\p{N}' -]+/gu, ' ').replace(/\s+/g, ' '));
/** Mots vides (pliés) : articles, prépositions, mots-outils fr et en, et les mots que tout avis répète (bug, idée, problème…). */
const STOP = new Set(('le la les l un une des du de d au aux et ou a en dans sur sous pour par avec sans ne n pas plus moins que qu qui quoi est sont etre ete fait faire ce c cet cette ces '
  + 'mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs je j tu il elle on nous vous ils elles me m te t se s y lorsque quand comment pourquoi peut peux veux tout tous toute toutes tres '
  + 'the an and or of to in on at for with without is are be been was were it its this that these those my your his her our their i you he she we they me can cannot cant not no when how why what '
  + 'do does dont did please would could should will just bug bugs probleme problemes souci idee idees question questions aide erreur problem problems issue idea ideas help error').split(' '));
/** Titre → { w : mots utiles (pliés, sans mots vides, pluriel simple retiré), g : trigrammes des mots }. */
export function fbfPrep(s) {
  const w = [...new Set(fold(s).replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(x => x && !STOP.has(x)).map(x => (x.length > 3 ? x.replace(/[sx]$/, '') : x)))];
  const g = new Set(); for (const x of w) { const p = ` ${x} `; for (let i = 0; i + 3 <= p.length; i++) g.add(p.slice(i, i + 3)); }
  return { w: new Set(w), g };
}
const dice = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return (2 * n) / (a.size + b.size); };
/** Ressemblance de deux titres préparés (0 à 1) : moyenne du Dice des mots et du Dice des trigrammes (fautes de frappe, pluriels, mots composés). */
export const fbfSim = (a, b) => (a.w.size && b.w.size ? (dice(a.w, b.w) + dice(a.g, b.g)) / 2 : 0);

/* Notification « ton avis a avancé », dans la langue de l'appareil (notifyUser : fr, en, de, es, it, pt) ; étiquettes de l'équipe traduites quand on les connaît. */
const TAGS_TX = {
  'confirme': ['Confirmed', 'Bestätigt', 'Confirmado', 'Confermato', 'Confirmado'], 'prochaine version': ['Next version', 'Nächste Version', 'Próxima versión', 'Prossima versione', 'Próxima versão'],
  'corrige': ['Fixed', 'Behoben', 'Corregido', 'Corretto', 'Corrigido'], 'pas un bug': ['Not a bug', 'Kein Fehler', 'No es un error', 'Non è un bug', 'Não é um bug'],
  'doublon': ['Duplicate', 'Duplikat', 'Duplicado', 'Duplicato', 'Duplicado'], 'envisage': ['Under consideration', 'In Erwägung', 'En estudio', 'In valutazione', 'Em análise'],
  'prevu': ['Planned', 'Geplant', 'Previsto', 'Pianificato', 'Planejado'], 'fait': ['Done', 'Erledigt', 'Hecho', 'Fatto', 'Feito'],
  'pas pour l\'instant': ['Not for now', 'Vorerst nicht', 'Por ahora no', 'Non per ora', 'Por enquanto não'],
};
const TX_I = { en: 0, de: 1, es: 2, it: 3, pt: 4 };
export const FBF_TXT = {
  fr: { t: 'Du nouveau sur ton avis', q: s => `« ${s} »`, r1: 'une réponse', rN: n => `${n} réponses`, tag: s => `marqué ${s}`, close: 'fil fermé' },
  en: { t: 'Update on your feedback', q: s => `“${s}”`, r1: 'a reply', rN: n => `${n} replies`, tag: s => `tagged ${s}`, close: 'thread closed' },
  de: { t: 'Neues zu deinem Feedback', q: s => `„${s}“`, r1: 'eine Antwort', rN: n => `${n} Antworten`, tag: s => `markiert als ${s}`, close: 'Thread geschlossen' },
  es: { t: 'Novedades sobre tu comentario', q: s => `«${s}»`, r1: 'una respuesta', rN: n => `${n} respuestas`, tag: s => `marcado como ${s}`, close: 'hilo cerrado' },
  it: { t: 'Novità sul tuo feedback', q: s => `«${s}»`, r1: 'una risposta', rN: n => `${n} risposte`, tag: s => `segnato come ${s}`, close: 'discussione chiusa' },
  pt: { t: 'Novidades sobre o seu feedback', q: s => `“${s}”`, r1: 'uma resposta', rN: n => `${n} respostas`, tag: s => `marcado como ${s}`, close: 'tópico fechado' },
};
/** Texte de la notification : { title, body } ; ev : { replies, tags (noms), close }. */
export function fbfNote(lang, title, ev) {
  const L = FBF_TXT[lang] || FBF_TXT.fr, tr = n => { const x = TAGS_TX[fold(n)]; return x && lang in TX_I ? x[TX_I[lang]] : n; };
  const parts = [ev.replies ? (ev.replies > 1 ? L.rN(ev.replies) : L.r1) : '', ev.tags && ev.tags.length ? L.tag(ev.tags.map(tr).join(', ')) : '', ev.close ? L.close : ''].filter(Boolean);
  const t = [...String(title || '')], q = L.q(t.length > 80 ? t.slice(0, 79).join('') + '…' : t.join(''));
  return { title: L.t, body: q + (lang === 'fr' || !FBF_TXT[lang] ? ' : ' : ': ') + parts.join(', ') + '.' };
}

/** h : { call, load, forums (→ { d, list: [{ key, c }] }), now, log, notify (notifyUser de proxy.mjs, ou null : rien n'est suivi), dir, file, staff (DISCORD_STAFF_ROLES),
 *  pollMs (DISCORD_FEEDBACK_POLL_MS), similar (seuil, 0,6), dupMs (30 min), keepMs (90 jours), max (2 000), on (bot en marche) }. */
export function forumMake(h) {
  const now = h.now || Date.now, log = h.log || console, call = h.call, ID_RE = /^\d{5,25}$/, TAG_RE = /^[0-9a-f]{64}$/, NONCE_RE = /^[\w-]{16,64}$/;
  const DUP_MS = h.dupMs ?? 30 * 60e3, SIM = h.similar ?? 0.6, KEEP = h.keepMs ?? 90 * 86400e3, MAX = h.max ?? 2000, POLL = Number(h.pollMs ?? 10 * 60e3);
  const FILE = h.file || join(h.dir || join(process.cwd(), '.data', 'admin'), 'discord-feedback.json'), ACT_MS = 30e3;
  const S = { dup: new Map(), map: null, loading: null, chain: Promise.resolve(), act: null, actP: null, timer: null, run: false };
  const sha = s => createHash('sha256').update(s).digest('base64url').slice(0, 32);
  const snowMs = id => { try { return Number(BigInt(id) >> 22n) + 1420070400000; } catch (e) { return 0; } };
  const isoMs = s => { const t = Date.parse(s || ''); return Number.isFinite(t) ? t : 0; };
  const big = id => { try { return BigInt(id); } catch (e) { return 0n; } };

  /* ── Ping de l'équipe ── */
  const NAMES = (() => { const v = h.staff == null ? '' : String(h.staff).trim(); if (v === '0') return []; const l = v ? v.split(',').map(s => s.trim()).filter(Boolean) : FBF_STAFF; return [...new Set(l.map(roleKey).filter(Boolean))]; })();
  /** Rôles de l'équipe trouvés sur le serveur (ids, dans l'ordre des noms ; ni @everyone ni rôle géré par un bot ou une intégration). */
  function staff(d) {
    const out = [];
    for (const n of NAMES) { const r = (d.roles || []).find(x => x && x.id !== d.gid && !x.managed && roleKey(x.name) === n); if (r && !out.includes(String(r.id))) out.push(String(r.id)); }
    return out;
  }

  /* ── Un seul fil par envoi ── */
  const norm = s => fold(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  /** Clés de l'envoi : nonce (par compte, sinon réseau), sinon titre et texte pliés ; [] : rien pour reconnaître un doublon. */
  function keys(acct, net, nonce, f) {
    const scope = acct ? 'a:' + acct : net ? 'n:' + sha(String(net)) : '';
    if (typeof nonce === 'string' && NONCE_RE.test(nonce)) return [sha((scope || '-') + '|n|' + nonce)];
    return scope ? [sha(scope + '|c|' + f.kind + '|' + norm(f.title) + '|' + norm(f.text))] : [];
  }
  /** make() une seule fois par clé pendant DUP_MS : déjà fait → { ...résultat, dup: true } ; en cours → son résultat attendu (échec : on recommence). */
  async function once(ks, make) {
    for (let i = 0; i < 3; i++) {
      const hit = ks.map(k => S.dup.get(k)).find(x => x && now() - x.at < DUP_MS); if (!hit) break;
      if (hit.r) return { ...hit.r, dup: true };
      const r = await hit.p.catch(() => null); if (r) return { ...r, dup: true };
    }
    const e = { at: now(), r: null, p: null };
    if (S.dup.size > 2000) for (const [k, x] of S.dup) if (x.r && now() - x.at >= DUP_MS) S.dup.delete(k);
    e.p = Promise.resolve().then(make); for (const k of ks) S.dup.set(k, e);
    try { const r = await e.p; e.r = r; e.at = now(); return r; }
    catch (err) { for (const k of ks) if (S.dup.get(k) === e) S.dup.delete(k); throw err; }
  }

  /* ── Fils actifs du serveur (forums bugs, idées, aide) : lecture partagée avec le panneau /admin ── */
  /** Fils actifs (objets de Discord), gardés maxMs ; une seule lecture à la fois. */
  async function actives(maxMs = ACT_MS) {
    if (S.act && now() - S.act.at <= maxMs) return S.act.list;
    if (!S.actP) S.actP = (async () => { const d = await h.load(), t0 = now(), j = await call('GET', `/guilds/${d.gid}/threads/active`); seen(j, t0); return S.act.list; })().finally(() => { S.actP = null; });
    return S.actP;
  }
  /** Réponse de /guilds/{g}/threads/active (lue ici ou par le panneau) gardée ; at : heure de la demande. */
  function seen(j, at) { S.act = { at: at || now(), list: (j && Array.isArray(j.threads) ? j.threads : []).filter(t => t && t.id) }; }

  /** Titres proches du nouveau fil parmi les fils ouverts des trois forums → message dans le fil. */
  async function related(id, title) {
    if (!(SIM > 0)) return;
    const { list } = await h.forums(), ids = new Set(list.map(x => String(x.c.id))), me = fbfPrep(title);
    if (!me.w.size) return;
    const hits = (await actives(0)).filter(t => String(t.id) !== id && ids.has(String(t.parent_id || '')) && !(t.thread_metadata && t.thread_metadata.archived))
      .map(t => [String(t.id), fbfSim(me, fbfPrep(t.name))]).filter(([, s]) => s >= SIM).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1)).slice(0, 3);
    if (!hits.length) return;
    const m = await call('POST', `/channels/${id}/messages`, { content: '🔁 Peut-être lié à : ' + hits.map(([x]) => `<#${x}>`).join(' · '), allowed_mentions: { parse: [] }, flags: 4096 });      // 4096 : silencieux
    const x = S.map && S.map.get(id); if (x && m && m.id) { x.n++; if (big(m.id) > big(x.last)) x.last = String(m.id); save(); }
    log.log(`Discord : avis, ${hits.length} fil${hits.length > 1 ? 's' : ''} au titre proche signalé${hits.length > 1 ? 's' : ''}.`);
  }

  /* ── Fils suivis (ADMIN_DIR/discord-feedback.json) ── */
  function store() {
    if (S.map) return Promise.resolve(S.map);
    if (!S.loading) S.loading = (async () => {
      const m = new Map();
      try {
        const j = JSON.parse(await readFile(FILE, 'utf8'));
        for (const x of Array.isArray(j && j.list) ? j.list : []) if (x && ID_RE.test(String(x.id)) && TAG_RE.test(String(x.a)) && Array.isArray(x.tags)) m.set(String(x.id), { ...x, id: String(x.id), n: Number(x.n) || 0, last: String(x.last || x.id) });
      } catch (e) { if (e && e.code !== 'ENOENT') log.warn('Discord : fils suivis illisibles (' + (e.code || 'JSON') + '), repris à vide'); }
      return (S.map = m);
    })().finally(() => { S.loading = null; });
    return S.loading;
  }
  function save() {
    if (!S.map) return Promise.resolve();
    const run = S.chain.then(async () => { await mkdir(dirname(FILE), { recursive: true }); await writeFile(FILE + '.tmp', JSON.stringify({ v: 1, list: [...S.map.values()] })); await rename(FILE + '.tmp', FILE); });
    S.chain = run.catch(() => {});
    return run.catch(e => log.warn('Discord : fils suivis non enregistrés (' + (e && e.code || e) + ')'));
  }
  /** Fils de plus de 90 jours oubliés, 2 000 au plus (les plus anciens d'abord) → true si la liste a changé. */
  function purge(m) {
    let ch = false;
    for (const [id, x] of m) if (!(now() - (Number(x.at) || 0) < KEEP)) { m.delete(id); ch = true; }
    if (m.size > MAX) { const old = [...m.values()].sort((a, b) => (a.at || 0) - (b.at || 0)).slice(0, m.size - MAX); for (const x of old) m.delete(x.id); ch = true; }
    return ch;
  }
  /** Fil créé (feedback) : suivi si un compte peut être prévenu, puis titres proches cherchés (sans retarder la réponse). */
  function created({ id, tag, f, tags }) {
    if (!ID_RE.test(id)) return;
    const track = !!(h.notify && TAG_RE.test(String(tag || '')));
    (async () => {
      if (track) {
        const m = await store();
        m.set(id, { id, a: tag, l: String(f.meta && f.meta.lang || '').slice(0, 12), k: f.kind, t: [...f.title].slice(0, 90).join(''), at: now(), m: f.by || '', tags: (tags || []).map(String), n: 0, last: id, c: false });
        purge(m); await save(); arm();
      }
      await related(id, f.title).catch(e => log.warn('Discord : titres proches non cherchés (' + e.message + ')'));
    })().catch(e => log.warn('Discord : avis non suivi (' + (e && e.message || e) + ')'));
  }

  /* ── Ce qui a changé sur un fil suivi ── */
  /** Fermé par Discord faute d'activité (auto_archive_duration écoulée depuis le dernier message) plutôt que par l'équipe ? */
  function autoArc(t) {
    const md = t.thread_metadata || {}, dur = Number(md.auto_archive_duration) || 0, last = Math.max(isoMs(md.create_timestamp) || snowMs(t.id), t.last_message_id ? snowMs(t.last_message_id) : 0);
    return dur > 0 && isoMs(md.archive_timestamp) >= last + dur * 60e3 - 5 * 60e3;
  }
  /** État du fil (objet de Discord) comparé à l'état connu x (mis à jour) → { tags : étiquettes de l'équipe ajoutées (noms), close }. */
  function diff(x, t, fc, admin) {
    const mod = new Map((Array.isArray(fc && fc.available_tags) ? fc.available_tags : []).filter(g => g && g.moderated).map(g => [String(g.id), String(g.name || '')]));
    const cur = (Array.isArray(t.applied_tags) ? t.applied_tags : x.tags).map(String), tags = cur.filter(g => mod.has(g) && !x.tags.includes(g)).map(g => mod.get(g));
    const arc = !!(t.thread_metadata && t.thread_metadata.archived), close = arc && !x.c && (admin || !autoArc(t));
    x.tags = cur; x.c = arc;
    return { tags, close, replies: 0 };
  }
  /** Prévient l'auteur (une notification regroupée) ; rien de neuf : rien. */
  function tell(x, ev, gid) {
    if (!h.notify || !(ev.replies || ev.tags.length || ev.close)) return;
    const url = `./?avis=${x.id}&g=${gid}`;
    Promise.resolve().then(() => h.notify(x.a, l => ({ ...fbfNote(l, x.t, ev), url, tag: 'mo-avis-' + x.id, ttl: 7 * 86400 })))
      .then(n => log.log(`Discord : avis, auteur prévenu (${[ev.replies ? 'réponse' : '', ev.tags.length ? 'étiquette' : '', ev.close ? 'fermé' : ''].filter(Boolean).join(', ')}${n ? '' : ', aucun appareil'}).`), e => log.warn('Discord : auteur non prévenu (' + (e && e.message || e) + ')'));
  }
  /** Réponses arrivées depuis le dernier message vu, d'un autre que l'auteur (ni bot, ni le membre qui a signalé, ni message système). */
  async function replies(x) {
    const ms = await call('GET', `/channels/${x.id}/messages?after=${x.last}&limit=50`), list = Array.isArray(ms) ? ms.filter(m => m && m.id) : [];
    let n = 0;
    for (const m of list) {
      if (big(m.id) > big(x.last)) x.last = String(m.id);
      const a = m.author || {}; if (!a.bot && String(a.id || '') !== x.m && (m.type == null || m.type === 0 || m.type === 19)) n++;
    }
    return n;
  }
  /** Action du panneau /admin sur un fil (discord-srv.mjs › threadWrite) : t = le fil après l'action (ou null), fc = son forum, mid = réponse du bot. */
  async function admin(id, t, fc, mid) {
    if (!h.notify) return;
    const m = await store(), x = m.get(String(id)); if (!x) return;
    S.act = null; x.u = now();      // état connu plus récent que toute lecture déjà faite ou en cours : une relève ne le défait pas
    const ev = t ? diff(x, t, fc, true) : { tags: [], close: false, replies: 0 };
    if (mid) { ev.replies = 1; if (big(mid) > big(x.last)) x.last = String(mid); x.n = Math.max(x.n + 1, Number(t && t.message_count) || 0); }
    await save();
    const d = await h.load().catch(() => null); if (d) tell(x, ev, d.gid);
  }
  /** Fil supprimé depuis /admin : plus suivi. */
  async function drop(id) { const m = await store(); if (m.delete(String(id))) await save(); }
  /** Compte supprimé : ses fils oubliés → nombre. */
  async function forget(tag) {
    const m = await store(); let n = 0;
    for (const [id, x] of m) if (x.a === tag) { m.delete(id); n++; }
    if (n) { await save(); log.log(`Discord : ${n} fil${n > 1 ? 's' : ''} d'avis oublié${n > 1 ? 's' : ''} (compte supprimé).`); }
    return n;
  }

  /** Relève : fils actifs (1 lecture, partagée), fermés récents des forums (si un fil suivi ouvert n'est plus actif), puis 5 fils lus un par un au plus,
   *  et les nouveaux messages de 10 fils au plus (le reste à la relève suivante). */
  async function poll() {
    if (S.run || !h.on || !h.notify) return;
    S.run = true;
    try {
      const m = await store(); let ch = purge(m);
      if (!m.size) { if (ch) await save(); return; }
      const { d, list } = await h.forums(), cur = new Map(), when = new Map();      // when : heure de la lecture de chaque fil (une action du panneau plus récente l'emporte)
      const act = await actives(Math.min(ACT_MS, POLL / 2)), at0 = S.act ? S.act.at : 0;
      for (const t of act) if (m.has(String(t.id))) { cur.set(String(t.id), t); when.set(String(t.id), at0); }
      let miss = [...m.values()].filter(x => !x.c && !cur.has(x.id));
      if (miss.length) {
        const t1 = now(); for (const x of miss) when.set(x.id, t1);
        for (const f of list) { const j = await call('GET', `/channels/${f.c.id}/threads/archived/public?limit=50`); for (const t of (j && Array.isArray(j.threads) ? j.threads : [])) if (t && m.has(String(t.id))) cur.set(String(t.id), t); }
        miss = miss.filter(x => !cur.has(x.id));
        for (const x of miss.slice(0, 5)) {
          try { const t = await call('GET', `/channels/${x.id}`); if (t && t.id) cur.set(x.id, t); }
          catch (e) { if (e.kind === 'refused' && (e.status === 404 || e.code === 10003)) { m.delete(x.id); ch = true; } else throw e; }      // fil supprimé sur Discord
        }
      }
      let reads = 0;
      for (const [id, t] of cur) {
        const x = m.get(id), f = list.find(y => y.c.id === String(t.parent_id || '')); if (!x || !f || (x.u && (when.get(id) || 0) < x.u)) continue;      // lu avant la dernière action du panneau : la relève suivante
        const was = JSON.stringify(x), ev = diff(x, t, f.c, false), n = Number(t.message_count) || 0;
        if (n > x.n && reads < 10) {
          reads++;
          try { ev.replies = await replies(x); }
          catch (e) { if (e.kind !== 'refused') throw e; if (!S.warned) { S.warned = true; log.warn('Discord : réponses des avis illisibles (' + e.message + ') : permission « Lire l\'historique des messages » du bot dans les forums ?'); } }
          x.n = n;
        } else if (n < x.n) x.n = n;      // messages supprimés : compte suivi
        if (JSON.stringify(x) !== was) ch = true;
        tell(x, ev, d.gid);
      }
      if (ch) await save();
    } catch (e) { log.warn('Discord : relève des avis impossible (' + (e && e.message || e) + ')'); }
    finally { S.run = false; }
  }
  function arm() { if (!S.timer && h.on && h.notify && POLL > 0) { S.timer = setInterval(() => { poll(); }, Math.max(100, POLL)); if (S.timer.unref) S.timer.unref(); } }
  /** Démarrage : relève armée s'il y a déjà des fils suivis. */
  function start() { if (h.on && h.notify && POLL > 0) store().then(m => { if (m.size) arm(); }, () => {}); }
  function stop() { clearInterval(S.timer); S.timer = null; }

  return { staff, keys, once, seen, actives, created, admin, drop, forget, poll, start, stop, _s: S };
}
