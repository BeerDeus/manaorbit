// Mana Orbit — « Messages de l'équipe » : la boîte de réception d'un compte dans l'appli (src/inbox.js), chargée par proxy.mjs.
// Ce que l'équipe a à dire à un utilisateur précis, lisible dans l'appli même sans Discord et même si la notification a été balayée :
//   · scan signalé réglé (panneau /admin › Scans signalés › « Prévenir : réglé ») : k 'scan', s = carte signalée, x = mot de l'équipe (facultatif) ;
//   · réponse à un avis (discord-forum.mjs : réponses de l'équipe dans le fil recopiées, étiquettes, fil fermé ; ou « Répondre dans l'appli » du panneau) : k 'avis',
//     s = titre de l'avis, ev = { replies, tags, close }, x = texte des réponses, u = lien du fil (./?avis=<fil>&g=<serveur>) ;
//   · message libre du panneau : k 'msg', x = le message.
// Chaque message part aussi en notification sur les appareils du compte (notify : notifyUser de proxy.mjs, dans la langue de chaque appareil ; toucher :
// ./?inbox=1, la feuille de l'appli). Sans appareil enregistré (notifications coupées, ou serveur sans compte de service) : gardé quand même, lu à la prochaine
// ouverture de l'appli (pastille).
// Compte : empreinte SHA-256 de l'UID (amTag, 64 hex), jamais l'UID. Fichier ADMIN_DIR/inbox.json (écriture atomique, une à la fois) : 30 messages par compte
// (les plus anciens partent), oubliés après 180 jours, 5 000 comptes au plus ; compte supprimé (DELETE /api/friends/me) : sa boîte effacée (forget).
// API (jeton Firebase, x-firebase-token) : GET /api/inbox → { items (plus récents d'abord), unread } · POST /api/inbox/read { ids } ou { all: true } → { unread }
// · DELETE /api/inbox/<id>. Budget : 240 requêtes par 10 min et par réseau. INBOX=0 : coupé (404, /__ping inbox: false, l'appli cache tout).
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fbfNote, FBF_TXT } from './discord-forum.mjs';

export const IB_TAG = /^[0-9a-f]{64}$/, IB_ID = /^[0-9a-z]{6,10}-[0-9a-f]{6}$/, IB_KINDS = ['scan', 'avis', 'msg'];
/** Textes des notifications (et défauts), dans la langue de l'appareil ; l'appli a les mêmes dans ses dictionnaires (src/inbox.js). */
export const IB_TXT = {
  fr: { scanT: 'Ton scan signalé est réglé', scan: s => `« ${s} » est maintenant reconnue. Merci pour ton signalement !`, scan0: 'La carte que tu as signalée est maintenant reconnue. Merci pour ton signalement !', msgT: 'Message de l\'équipe Mana Orbit' },
  en: { scanT: 'Your scan report is fixed', scan: s => `“${s}” is now recognized. Thanks for reporting it!`, scan0: 'The card you reported is now recognized. Thanks for reporting it!', msgT: 'Message from the Mana Orbit team' },
  de: { scanT: 'Dein gemeldeter Scan ist behoben', scan: s => `„${s}“ wird jetzt erkannt. Danke für deine Meldung!`, scan0: 'Die gemeldete Karte wird jetzt erkannt. Danke für deine Meldung!', msgT: 'Nachricht vom Mana-Orbit-Team' },
  es: { scanT: 'Tu escaneo reportado está resuelto', scan: s => `«${s}» ya se reconoce. ¡Gracias por avisarnos!`, scan0: 'La carta que reportaste ya se reconoce. ¡Gracias por avisarnos!', msgT: 'Mensaje del equipo de Mana Orbit' },
  it: { scanT: 'La tua segnalazione di scansione è risolta', scan: s => `«${s}» ora viene riconosciuta. Grazie della segnalazione!`, scan0: 'La carta che hai segnalato ora viene riconosciuta. Grazie della segnalazione!', msgT: 'Messaggio dal team di Mana Orbit' },
  pt: { scanT: 'Seu escaneamento relatado foi corrigido', scan: s => `“${s}” agora é reconhecida. Obrigado por relatar!`, scan0: 'A carta que você relatou agora é reconhecida. Obrigado por relatar!', msgT: 'Mensagem da equipe Mana Orbit' },
};
const clip = (s, n) => { const a = [...String(s == null ? '' : s).replace(/[\p{Cc}\p{Cf}]/gu, c => (c === '\n' ? '\n' : ' '))]; return (a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join('')).trim(); };
/** Notification d'un message, dans la langue l : { title, body }. */
export function ibNote(l, it) {
  const L = IB_TXT[l] || IB_TXT.fr, one = s => clip(String(s || '').replace(/\s+/g, ' '), 180);
  if (it.k === 'scan') return { title: L.scanT, body: it.x ? one(it.x) : it.s ? L.scan(it.s) : L.scan0 };
  if (it.k === 'avis') {      // texte de la réponse recopié : « titre » : réponse (guillemets et ponctuation de la langue, comme fbfNote) ; sinon ce qui a changé
    const n = fbfNote(l, it.s, it.ev || { replies: it.x ? 1 : 0, tags: [], close: false }), F = FBF_TXT[l] || FBF_TXT.fr;
    return { title: n.title, body: it.x ? one((it.s ? F.q(clip(it.s, 60)) + (l === 'fr' || !FBF_TXT[l] ? ' : ' : ': ') : '') + it.x) : n.body };
  }
  return { title: L.msgT, body: one(it.x) };
}

/** o : { dir, file, notify (notifyUser, ou null), now, log, json, readBody, rateWait, tooMany, verify (jeton → { uid }), amTag, isLocked, badKey, keepMs (180 j), per (30), max (5 000), on } */
export function inboxMake(o) {
  const now = o.now || Date.now, log = o.log || console, ON = o.on !== false;
  const FILE = o.file || join(o.dir || join(process.cwd(), '.data', 'admin'), 'inbox.json'), KEEP = o.keepMs ?? 180 * 86400e3, PER = o.per ?? 30, MAX = o.max ?? 5000;
  const S = { map: null, loading: null, chain: Promise.resolve() };
  function store() {
    if (S.map) return Promise.resolve(S.map);
    if (!S.loading) S.loading = (async () => {
      const m = new Map();
      try {
        const j = JSON.parse(await readFile(FILE, 'utf8'));
        for (const b of Array.isArray(j && j.list) ? j.list : []) if (b && IB_TAG.test(String(b.a)) && Array.isArray(b.items)) m.set(b.a, b.items.filter(it => it && IB_ID.test(String(it.id)) && IB_KINDS.includes(it.k)));
      } catch (e) { if (e && e.code !== 'ENOENT') log.warn('Messages de l\'équipe : fichier illisible (' + (e.code || 'JSON') + '), repris à vide'); }
      return (S.map = m);
    })().finally(() => { S.loading = null; });
    return S.loading;
  }
  function save() {
    const run = S.chain.then(async () => { await mkdir(dirname(FILE), { recursive: true }); await writeFile(FILE + '.tmp', JSON.stringify({ v: 1, list: [...S.map].map(([a, items]) => ({ a, items })) })); await rename(FILE + '.tmp', FILE); });
    S.chain = run.catch(() => {});
    return run.catch(e => { log.warn('Messages de l\'équipe : non enregistrés (' + (e && e.code || e) + ')'); throw e; });
  }
  /** Messages trop vieux oubliés, comptes vides retirés, MAX comptes au plus (les moins récents d'abord). */
  function purge(m) {
    const old = now() - KEEP;
    for (const [a, items] of m) { const k = items.filter(it => it.t > old); if (!k.length) m.delete(a); else if (k.length !== items.length) m.set(a, k); }
    if (m.size > MAX) for (const [a] of [...m].sort((x, y) => Math.max(...x[1].map(i => i.t)) - Math.max(...y[1].map(i => i.t))).slice(0, m.size - MAX)) m.delete(a);
  }
  /** Nouveau message pour le compte tag : gardé, puis notification sur ses appareils (sans attendre). it : { k, s?, x?, ev?, u? } → { id, sent (promesse : appareils prévenus) } ou null. */
  async function put(tag, it) {
    if (!ON || !IB_TAG.test(String(tag || '')) || !it || !IB_KINDS.includes(it.k)) return null;
    const x = { id: now().toString(36) + '-' + randomBytes(3).toString('hex'), t: now(), k: it.k, ...(it.s ? { s: clip(it.s, 120) } : {}), ...(it.x ? { x: clip(it.x, 1500) } : {}),
      ...(it.ev ? { ev: { replies: Math.max(0, Number(it.ev.replies) || 0), tags: (Array.isArray(it.ev.tags) ? it.ev.tags : []).map(t => clip(t, 40)).slice(0, 5), close: !!it.ev.close } } : {}),
      ...(typeof it.u === 'string' && /^\.\/\?avis=\d{5,25}&g=\d{5,25}$/.test(it.u) ? { u: it.u } : {}), r: 0 };
    if ((x.k === 'msg' && !x.x) || (x.k === 'avis' && !x.x && !(x.ev && (x.ev.replies || x.ev.tags.length || x.ev.close)))) return null;      // rien à dire
    const m = await store(); purge(m);
    const prev = m.get(tag) || []; m.delete(tag); m.set(tag, [x, ...prev].slice(0, PER));      // compte remis en dernier : le plus récent (purge)
    await save();
    const sent = o.notify ? Promise.resolve().then(() => o.notify(tag, l => ({ ...ibNote(l, x), url: './?inbox=1', tag: 'mo-inbox', ttl: 7 * 86400 }))).catch(e => { log.warn('Messages de l\'équipe : notification non partie (' + (e && e.message || e) + ')'); return 0; }) : Promise.resolve(0);
    return { id: x.id, sent };
  }
  /** Compte supprimé : sa boîte effacée → nombre de messages. */
  async function forget(tag) { const m = await store(), n = (m.get(tag) || []).length; if (m.delete(tag)) await save().catch(() => {}); return n; }
  /** Résumé pour le panneau : comptes, messages, non lus. */
  async function stats() { const m = await store(); let n = 0, u = 0; for (const items of m.values()) { n += items.length; u += items.filter(i => !i.r).length; } return { accounts: m.size, n, unread: u }; }

  async function auth(req, res) {
    const tok = String(req.headers['x-firebase-token'] || '');
    if (!tok) { o.json(res, 401, { error: 'auth_required', message: 'Connecte-toi.' }); return ''; }
    if (o.isLocked && o.isLocked(req)) { o.json(res, 429, { error: 'too_many_attempts', message: 'Trop d\'essais invalides : réessaie dans quelques minutes.' }, { 'Retry-After': '300' }); return ''; }
    try { return o.amTag(String((await o.verify(tok)).uid)); }
    catch (e) {
      const code = e && e.authCode;
      if (code === 'expired') o.json(res, 401, { error: 'token_expired', message: 'Session expirée.' });
      else if (code === 'unavailable') o.json(res, 503, { error: 'auth_unavailable', message: 'Vérification du compte impossible pour le moment.' }, { 'Retry-After': '5' });
      else if (o.badKey) await o.badKey(req, res, 'bad_token', 401); else o.json(res, 401, { error: 'bad_token' });
      return '';
    }
  }
  const out = items => ({ items: items.map(({ id, t, k, s, x, ev, u, r }) => ({ id, t, k, ...(s ? { s } : {}), ...(x ? { x } : {}), ...(ev ? { ev } : {}), ...(u ? { u } : {}), r: r ? 1 : 0 })), unread: items.filter(i => !i.r).length });
  /** /api/inbox… */
  async function api(req, res, path) {
    const hd = { 'Cache-Control': 'no-store' };
    if (!ON) return o.json(res, 404, { error: 'not_found' });
    const w = o.rateWait(req, 'inbox', 240, 600e3); if (w) return o.tooMany(res, w);
    const tag = await auth(req, res); if (!tag) return;
    const sub = path.replace(/^inbox\/?/, ''), m = await store(); purge(m);
    const items = m.get(tag) || [];
    if (!sub && req.method === 'GET') return o.json(res, 200, out(items), hd);
    if (sub === 'read' && req.method === 'POST') {
      let b; try { b = JSON.parse((await o.readBody(req, 8 * 1024)).toString('utf8') || '{}'); } catch (e) { return o.json(res, 400, { error: 'bad_request', message: 'JSON invalide' }); }
      const ids = b && b.all === true ? null : new Set(Array.isArray(b && b.ids) ? b.ids.filter(i => typeof i === 'string').slice(0, 50) : []);
      let ch = false; for (const it of items) if (!it.r && (!ids || ids.has(it.id))) { it.r = 1; ch = true; }
      if (ch) await save().catch(() => {});
      return o.json(res, 200, { unread: items.filter(i => !i.r).length }, hd);
    }
    if (IB_ID.test(sub) && req.method === 'DELETE') {
      const k = items.filter(i => i.id !== sub); if (k.length === items.length) return o.json(res, 404, { error: 'not_found' }, hd);
      if (k.length) m.set(tag, k); else m.delete(tag);
      await save().catch(() => {});
      return o.json(res, 200, { unread: k.filter(i => !i.r).length }, hd);
    }
    const known = !sub || sub === 'read' || IB_ID.test(sub);
    return o.json(res, known ? 405 : 404, { error: known ? 'method_not_allowed' : 'not_found' }, hd);
  }
  return { on: ON, put, forget, stats, api, _store: store };
}
