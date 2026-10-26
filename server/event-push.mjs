// Mana Orbit — notifications push des événements saisonniers (aucune dépendance npm). Créé par event-srv.mjs (o.push : { send, target } de proxy.mjs,
// Web Push ou FCM ; null sans compte de service FCM ou avec EVENT_PUSH=0 : rien, routes en 404). Testé par tests/test-event-push.mjs et tests/evpush-e2e.mjs.
//   · Appareils : un appareil aux notifications actives dont l'interrupteur « Événements » est allumé s'enregistre (POST /api/event/push { sub, l } ; { off: clé }
//     le retire), AVEC OU SANS COMPTE : le compte (empreinte SHA-256 de l'UID) s'il est connecté, et le jeton d'appareil des événements (x-event-device, signé par
//     le serveur) ; seul ce compte ou cet appareil peut le retirer. 8 appareils au plus par compte, 3 par jeton d'appareil, 20 000 en tout (le moins récemment
//     revu laisse sa place) ; plus revu depuis 90 jours (l'appli se réenregistre chaque semaine) : oublié ; refusé par le service (404, 410) : retiré.
//     Clé d'un appareil : la même que la Carte mystère (empreinte du jeton FCM ou de l'adresse Web Push) : la cible « tous » ne prévient jamais deux fois.
//   · Annonces automatiques (tick, chaque minute) : pour chaque édition d'un pack prêt aux textes push complets (src/evpacks.js › pack.push, 6 langues), les
//     étapes des annonces Discord (discord-events.mjs › evDscWindows : J-3 « arrive », J0 « ouverte », mi-parcours « il reste X jours », dernier jour ; pas
//     le récapitulatif du lendemain) ; une seule annonce par jour (la plus importante si deux tombent le même jour : ouverture, dernier jour, mi-parcours, J-3),
//     entre 10 h et 21 h à Paris (jamais la nuit ; serveur arrêté toute la journée : rattrapée le lendemain si sa fenêtre court encore, J-3 et mi-parcours),
//     seulement aux appareils enregistrés ci-dessus ; texte dans la langue de chaque appareil (français par défaut). Édition coupée dans /admin : rien.
//     Mise en route : aucune annonce automatique pendant les 2 h qui suivent le tout premier démarrage du module (born, gardé dans push.json ; warmMs) : les
//     appareils s'enregistrent quand ils ouvrent la nouvelle version, une annonce partie à la première minute n'aurait touché presque personne.
//   · Jamais deux fois : étape et jour notés AVANT l'envoi, puis position (clé du dernier appareil du lot, appareils triés par clé) écrite avant chaque lot,
//     comme daily-srv.mjs › pushRun : un redémarrage en plein envoi reprend après (au pire, un lot interrompu n'est pas prévenu). Fichier illisible au départ :
//     rien n'est envoyé ni écrit (on ne sait pas ce qui est parti).
//   · Envois manuels (/admin › Événements › Notifications) : titre et texte en français et en anglais (allemand, espagnol, italien, portugais facultatifs ;
//     sinon le français), cible « ev » (les appareils ci-dessus) ou « all » (les mêmes et ceux de la notification « nouvelle Carte mystère » : tous ceux qui
//     acceptent une annonce du serveur), tout de suite ou programmé (date et heure, 30 jours au plus) ; un envoi par heure au plus ; historique (60 derniers :
//     date, cible, appareils touchés, échecs, programmés annulables). Notification : tag et collapse_key « mo-event », lien ./?fete=1 (l'accueil et la feuille
//     de la fête : push.js › pushOpen, event.js › evPushOpen).
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { evDscWindows } from './discord-events.mjs';

const EVP = createRequire(import.meta.url)('../src/evpacks.js');
export const EVP_LANGS = ['fr', 'en', 'de', 'es', 'it', 'pt'];
export const EVP_STEPS = ['soon', 'open', 'mid', 'last'];
export const EVP_URL = './?fete=1', EVP_TAG = 'mo-event';
/** Longueurs bornées des envois manuels (une notification Android coupe vers 65 caractères de titre et 180 de texte replié). */
export const EVP_MAX = { title: 65, body: 180 };
const PRIO = { open: 0, last: 1, mid: 2, soon: 3 }, DAY_MS = 864e5, KEY_RE = /^[0-9a-f]{24}$/, DAY_RE = /^\d{4}-\d\d-\d\d$/, ID_RE = /^[\w-]{8,16}$/;
const LOC = { fr: 'fr-FR', en: 'en-US', de: 'de-DE', es: 'es-ES', it: 'it-IT', pt: 'pt-BR' };
const FMT = new Map();
/** « 25 octobre », « October 25 », « 25. Oktober »… (date « AAAA-MM-JJ », sans fuseau). */
export function evPushDate(key, lang) {
  const l = LOC[lang] ? lang : 'fr';
  if (!FMT.has(l)) { try { FMT.set(l, new Intl.DateTimeFormat(LOC[l], { day: 'numeric', month: 'long', timeZone: 'UTC' })); } catch (e) { FMT.set(l, null); } }
  const f = FMT.get(l), t = Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10));
  return f ? f.format(t) : key;
}
const diff = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / DAY_MS);
/** Texte d'une ligne : sans caractère de contrôle ni de mise en forme invisible, espaces resserrés. */
export const evPushLine = (s, n) => String(s == null ? '' : s).replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 1000).trim();

/** Textes push d'un pack complets (quatre étapes, six langues, titre et texte non vides) ? */
export const evPushReady = p => !!(p && p.ready && p.push && EVP_STEPS.every(k => p.push[k] && EVP_LANGS.every(l => Array.isArray(p.push[k][l]) && p.push[k][l].length === 2 && p.push[k][l].every(s => typeof s === 'string' && s.trim()))));
/** Étapes push d'une édition : celles des annonces Discord, sans le récapitulatif du lendemain. */
export const evPushWindows = ed => evDscWindows(ed).filter(w => w.kind !== 'end');
/** Annonces dues le jour day (done : { "<édition>|<étape>": date d'envoi }) → [{ ed, kind }], la plus importante d'abord : au plus une par édition (l'étape la
 *  plus récente dont la fenêtre contient day, si elle n'est pas encore partie). */
export function evPushDue(day, editions, done) {
  const out = []; if (!DAY_RE.test(String(day || ''))) return out;
  for (const ed of editions || []) {
    if (!ed || !DAY_RE.test(String(ed.from || '')) || !DAY_RE.test(String(ed.to || ''))) continue;
    const w = evPushWindows(ed).filter(x => day >= x.a && day <= x.b).pop();
    if (w && !Object.hasOwn(done || {}, ed.id + '|' + w.kind)) out.push({ ed, kind: w.kind });
  }
  return out.sort((a, b) => PRIO[a.kind] - PRIO[b.kind] || (a.ed.from < b.ed.from ? -1 : 1));
}
/** [titre, texte] d'une annonce dans une langue (français par défaut), le jour day. */
export function evPushText(pack, kind, ed, day, lang) {
  const l = EVP_LANGS.includes(lang) ? lang : 'fr', src = pack && pack.push && pack.push[kind] && (pack.push[kind][l] || pack.push[kind].fr);
  if (!src) return null;
  const loc = LOC[l], num = v => Number(v).toLocaleString(loc);
  const vals = { from: evPushDate(ed.from, l), to: evPushDate(ed.to, l), total: num(ed.total ?? pack.total), per: num(ed.per ?? pack.perDay), y: String(ed.year || ed.from.slice(0, 4)), d: num(Math.max(1, diff(day || ed.from, ed.to) + 1)) };
  return src.map(s => evPushLine(String(s).replace(/\{(\w+)\}/g, (all, k) => (Object.hasOwn(vals, k) ? vals[k] : all))));
}

/** o : { dir, now, push ({ send, target }), packs (src/evpacks.js), on (EVENT ≠ 0), off (→ identifiants coupés dans /admin), extra (→ promesse [{ k, sub, l }] :
 *  appareils de la Carte mystère, cible « tous »), log, hour (10), until (21), batch (100), max (20 000), gapMs (1 h entre deux envois manuels), staleMs (2 h :
 *  envoi interrompu plus vieux, abandonné), warmMs (2 h de mise en route), adminLog, adminMail }. → { reg, tick, view, send, cancel, flush } ; null sans o.push. */
export function evPushMake(o = {}) {
  const PUSH = o.push && typeof o.push.send === 'function' && typeof o.push.target === 'function' ? o.push : null;
  if (!PUSH) return null;
  const now = o.now || Date.now, log = o.log || console, P = o.packs || EVP, dir = o.dir || join(process.cwd(), '.data', 'events');
  const FILE = join(dir, 'push.json'), HOUR = o.hour ?? 10, UNTIL = o.until ?? 21, BATCH = Math.max(1, o.batch || 100), CONC = 8, ACCT = 8, DEVS = 3;
  const MAX = Math.max(1, o.max || 20000), OLD = 90 * DAY_MS, GAP = Math.max(0, o.gapMs ?? 3600e3), STALE = o.staleMs ?? 2 * 3600e3, HIST = 60, KEEP = 120 * DAY_MS, WARM = Math.max(0, o.warmMs ?? 2 * 3600e3);
  const off = () => { try { return [].concat((o.off && o.off()) || []).map(String); } catch (e) { return []; } };
  const G = { st: null, ld: null, bad: false, q: null, t: null, busy: false, running: new Set() };
  const keyOf = s => createHash('sha1').update(s.fcm ? 'fcm:' + s.fcm : String(s.endpoint)).digest('hex').slice(0, 24);      // comme daily-srv.mjs › pushKey

  /* ── Disque ── */
  async function put(f, s) { await mkdir(dirname(f), { recursive: true }); await writeFile(f + '.tmp', s); await rename(f + '.tmp', f); }
  /** État relu une fois : appareils (Map clé → { t : compte, dv : appareil, sub, l, at }), étapes parties (done), jour de la dernière annonce, historique. */
  function load() {
    if (!G.ld) G.ld = readFile(FILE, 'utf8').then(s => JSON.parse(s), e => (e && e.code === 'ENOENT' ? null : undefined)).catch(() => undefined).then(j => {
      if (j === undefined) { G.bad = true; log.warn('Événements : push.json illisible, aucune notification envoyée ni enregistrée (fichier gardé tel quel)'); }
      const d = new Map(j && j.d && typeof j.d === 'object' ? Object.entries(j.d).filter(([k, x]) => KEY_RE.test(k) && x && x.sub && typeof x.sub === 'object') : []);
      const done = {}; for (const [k, v] of Object.entries((j && j.done) || {})) if (/^[a-z]+-\d{4}\|(soon|open|mid|last)$/.test(k) && Number.isFinite(v)) done[k] = v;
      const hist = (j && Array.isArray(j.hist) ? j.hist : []).filter(x => x && typeof x === 'object' && ID_RE.test(String(x.id || ''))).slice(0, HIST);
      const born = j && Number(j.born) > 0 ? Number(j.born) : now();      // tout premier démarrage (mise en route)
      return (G.st = { d, done, day: j && DAY_RE.test(String(j.day || '')) ? j.day : '', hist, born });
    });
    return G.ld;
  }
  /** Écriture (une à la fois) ; strict : l'erreur remonte (sans l'état écrit, rien ne part). */
  function save(strict) {
    clearTimeout(G.t); G.t = null;
    if (G.bad || !G.st) return strict ? Promise.reject(Object.assign(new Error('push.json illisible'), { code: 'EBAD' })) : Promise.resolve();
    const S = G.st, t = now(); for (const [k, v] of Object.entries(S.done)) if (t - v > KEEP) delete S.done[k];
    const body = JSON.stringify({ v: 1, born: S.born, day: S.day, done: S.done, hist: S.hist.slice(0, HIST), d: Object.fromEntries(S.d) });
    const run = (G.q || Promise.resolve()).then(() => put(FILE, body)); G.q = run.catch(() => {});
    return strict ? run : run.catch(e => log.warn('Événements : notifications non enregistrées (' + (e && e.code || e) + ')'));
  }
  const soon = () => { if (!G.t) { G.t = setTimeout(() => { G.t = null; save(); }, 1500); if (G.t.unref) G.t.unref(); } };

  /* ── Appareils ── */
  /** POST /api/event/push : u (compte vérifié { tag } ou null), dev (jeton d'appareil vérifié ou ''), b : { sub, l } enregistre (→ { ok, k }) ; { off: k } retire
   *  (seulement par son compte ou son appareil). → [statut, corps]. */
  async function reg(u, dev, b) {
    const S = await load(); if (G.bad) return [503, { error: 'unavailable', message: 'Notifications indisponibles pour le moment.' }];
    if (typeof b.off === 'string') { const x = S.d.get(b.off); if (x && ((u && x.t && x.t === u.tag) || (dev && x.dv && x.dv === dev))) { S.d.delete(b.off); soon(); } return [200, { ok: true }]; }
    const sub = PUSH.target(b.sub); if (!sub) return [400, { error: 'bad_subscription', message: 'Abonnement push invalide ou refusé.' }];
    const k = keyOf(sub);
    S.d.delete(k); S.d.set(k, { t: u ? u.tag : '', dv: dev || '', sub, l: EVP_LANGS.includes(b.l) ? b.l : 'fr', at: now() });      // en dernier : les plus anciens d'abord quand il faut faire de la place
    const trim = (f, n) => { const l = [...S.d.keys()].filter(x => f(S.d.get(x))); for (const x of l.slice(0, Math.max(0, l.length - n))) S.d.delete(x); };
    if (u) trim(x => x.t === u.tag, ACCT);
    if (dev) trim(x => x.dv === dev, DEVS);
    while (S.d.size > MAX) S.d.delete(S.d.keys().next().value);
    soon(); return [200, { ok: true, k }];
  }
  /** Appareils d'une cible : Map clé → { sub, l } (« all » : avec ceux de la Carte mystère, sans doublon). */
  async function targets(target) {
    const S = await load(), m = new Map([...S.d].map(([k, x]) => [k, { sub: x.sub, l: x.l }]));
    if (target === 'all' && o.extra) { let l = []; try { l = await o.extra() || []; } catch (e) { l = []; } for (const x of l) if (x && KEY_RE.test(String(x.k || '')) && x.sub && !m.has(x.k)) m.set(x.k, { sub: x.sub, l: x.l }); }
    return m;
  }

  /* ── Envoi (annonce automatique ou envoi manuel) : une entrée de l'historique ── */
  /** Éditions à surveiller autour du jour : packs prêts aux textes push complets, coupées exclues. */
  function editions(day, offs) {
    const y = +day.slice(0, 4), out = [];
    for (const p of P.EV_PACKS || []) {
      if (!evPushReady(p) || offs.includes(p.id)) continue;
      for (const yy of [y - 1, y, y + 1]) { const e = P.evEdition(p, yy); if (!offs.includes(e.id)) out.push(e); }
    }
    return out;
  }
  /** [titre, texte] d'une entrée pour une langue. */
  function textOf(x, l) {
    if (x.kind === 'auto') { const ed = P.evById(x.ev), p = ed && P.evPack(x.ev); return (p && evPushText(p, x.step, ed, x.day, l)) || [x.title, x.body]; }
    const t = (x.txt && (x.txt[l] || x.txt.fr)) || [x.title, x.body]; return t;
  }
  const ttlOf = (x, t) => (x.kind === 'auto' ? Math.max(60, Math.min(86400, Math.floor((P.evNextMidnight(t) - t) / 1000))) : 6 * 3600);      // annonce : gardée par le service jusqu'à minuit
  async function run(x) {
    if (G.running.has(x.id)) return; G.running.add(x.id);
    try {
      const S = await load(), t0 = now(), devs = await targets(x.target);
      for (const [k, v] of S.d) if ((Number(v.at) || 0) < t0 - OLD) { S.d.delete(k); devs.delete(k); }
      if (x.n == null) x.n = devs.size;
      const ks = [...devs.keys()].filter(k => k > (x.cur || '')).sort(), ttl = ttlOf(x, t0);
      for (let i = 0; i < ks.length; i += BATCH) {
        if (x.kind === 'auto' && off().some(id => id === x.ev || id === String(x.ev).replace(/-\d{4}$/, ''))) { x.cut = true; break; }      // coupée pendant l'envoi : la suite ne part pas
        const part = ks.slice(i, i + BATCH), prev = x.cur; x.cur = part[part.length - 1];
        try { await save(true); } catch (e) { x.cur = prev; throw e; }      // position écrite avant l'envoi du lot, sinon rien ne part (nouvel essai au tour suivant)
        let j = 0;
        await Promise.all(Array.from({ length: Math.min(CONC, part.length) }, async () => {
          while (j < part.length) {
            const k = part[j++], d = devs.get(k); if (!d) continue;
            const [title, body] = textOf(x, d.l);
            let st = 0; try { st = await PUSH.send({ sub: d.sub, title, body, url: EVP_URL, kind: 'open', tag: EVP_TAG, topic: EVP_TAG, ttl, urgency: 'normal' }); } catch (e) { st = 0; }
            if (st && st < 300) x.ok = (x.ok || 0) + 1;
            else if (st === 404 || st === 410) { x.gone = (x.gone || 0) + 1; if (S.d.has(k)) S.d.delete(k); }
            else x.fail = (x.fail || 0) + 1;
          }
        }));
      }
      x.st = 'done'; x.end = now(); await save();
      log.log(`Événements : notification « ${x.title} » (${x.kind === 'auto' ? x.ev + ', ' + x.step : 'envoi manuel'}) : ${x.ok || 0} appareil${(x.ok || 0) > 1 ? 's' : ''} prévenu${(x.ok || 0) > 1 ? 's' : ''}${x.gone ? `, ${x.gone} périmé${x.gone > 1 ? 's' : ''} retiré${x.gone > 1 ? 's' : ''}` : ''}${x.fail ? `, ${x.fail} échec${x.fail > 1 ? 's' : ''}` : ''}.`);
    } finally { G.running.delete(x.id); }
  }
  const newId = () => randomBytes(8).toString('base64url');
  const push = x => { G.st.hist.unshift(x); if (G.st.hist.length > HIST) G.st.hist.length = HIST; };

  /** Annonce automatique du jour, si elle est due (heure de Paris entre HOUR et UNTIL, une par jour). */
  async function auto(t) {
    const S = G.st, h = P.evParts(t)[3]; if (h < HOUR || h >= UNTIL) return null;
    const day = P.evDay(t); if (S.day >= day) return null;      // déjà une annonce aujourd'hui (ou horloge revenue en arrière)
    if (t - S.born < WARM) { if (!G.born) { G.born = true; save(); } return null; }      // mise en route : les appareils s'enregistrent d'abord (born écrit une fois)
    const due = evPushDue(day, editions(day, off()), S.done); if (!due.length) return null;
    const { ed, kind } = due[0], pack = P.evPack(ed.id), [title, body] = evPushText(pack, kind, ed, day, 'fr'), key = ed.id + '|' + kind;
    const x = { id: newId(), kind: 'auto', step: kind, ev: ed.id, day, target: 'ev', title, body, at: t, st: 'sending', cur: '', n: null, ok: 0, fail: 0, gone: 0 };
    const prev = S.day; S.done[key] = t; S.day = day; push(x);
    try { await save(true); } catch (e) { delete S.done[key]; S.day = prev; S.hist.shift(); throw e; }      // sans l'état écrit, rien ne part (nouvel essai au tour suivant)
    await run(x); return x;
  }
  /** Tour de garde (chaque minute) : envoi interrompu par un redémarrage (repris, ou abandonné après staleMs ; annonce d'un autre jour : abandonnée), envois
   *  programmés arrivés à leur heure, puis l'annonce automatique du jour. Jamais d'erreur levée. */
  async function tick() {
    if (G.busy) return; G.busy = true;
    try {
      const S = await load(); if (G.bad) return;
      const t = now();
      for (const x of S.hist.filter(y => y.st === 'sending')) {
        if (G.running.has(x.id)) continue;
        if (t - (x.at || 0) > STALE || (x.kind === 'auto' && x.day !== P.evDay(t))) { x.st = 'done'; x.cut = true; x.end = t; await save(); continue; }
        await run(x);
      }
      for (const x of S.hist.filter(y => y.st === 'scheduled' && y.when <= t).reverse()) {
        if (t - x.when > STALE) { x.st = 'done'; x.cut = true; x.end = t; await save(); continue; }      // serveur arrêté à l'heure prévue : jamais un envoi en retard de plus de 2 h
        x.st = 'sending'; x.at = t; x.cur = ''; x.n = null; await save(true); await run(x);
      }
      if (o.on !== false) await auto(t);
    } catch (e) { log.warn('Événements : notification pas encore envoyée (' + (e && (e.code || e.message) || e) + ')'); }
    finally { G.busy = false; }
  }

  /* ── Panneau /admin ── */
  const pub = x => ({ id: x.id, kind: x.kind, step: x.step || '', ev: x.ev || '', target: x.target, title: x.title, body: x.body, langs: x.txt ? Object.keys(x.txt) : EVP_LANGS, at: x.at || 0, when: x.when || 0, end: x.end || 0, by: x.by || '', st: x.st, n: x.n ?? null, ok: x.ok || 0, fail: x.fail || 0, gone: x.gone || 0, ...(x.cut ? { cut: true } : {}) });
  /** Dernier envoi manuel (fait ou programmé) le plus proche de l'instant t : attente avant le prochain (ms, 0 : permis). */
  function wait(t) {
    let w = 0;
    for (const x of G.st.hist) if (x.kind === 'manual' && x.st !== 'cancelled') { const at = x.when || x.at || 0; if (Math.abs(t - at) < GAP) w = Math.max(w, at + GAP - t); }
    return Math.max(0, w);
  }
  /** Prochaine annonce automatique (60 jours) : { day, step, ev, title } ou null. */
  function next(t) {
    const S = G.st, h = P.evParts(t)[3]; let day = P.evDay(t);
    if (S.day >= day || h >= UNTIL) day = P.evAdd(day, 1);
    for (let i = 0; i < 60; i++, day = P.evAdd(day, 1)) {
      const due = evPushDue(day, editions(day, off()), S.done);
      if (due.length) { const { ed, kind } = due[0], [title] = evPushText(P.evPack(ed.id), kind, ed, day, 'fr'); return { day, step: kind, ev: ed.id, title }; }
    }
    return null;
  }
  async function view() {
    const S = await load(), t = now();
    if (G.bad) return { on: true, bad: true, counts: { ev: 0, all: 0 }, hist: [], next: null, wait: 0, gapMs: GAP, max: EVP_MAX, hour: HOUR, until: UNTIL };
    const all = await targets('all');
    return { on: true, auto: o.on !== false, counts: { ev: S.d.size, all: all.size }, hist: S.hist.map(pub), next: o.on !== false ? next(t) : null, wait: wait(t), gapMs: GAP, max: EVP_MAX, hour: HOUR, until: UNTIL, now: t, ...(t - S.born < WARM ? { warm: S.born + WARM } : {}) };
  }
  /** Envoi manuel : b { title: { fr, en, … }, body: { fr, en, … }, target: 'ev' | 'all', at? (programmé) } ; by : éditeur (e-mail masqué). → [statut, corps]. */
  async function send(b, by) {
    const S = await load(), t = now(); if (G.bad) return [503, { error: 'unavailable', message: 'push.json illisible sur le serveur : rien n\'est envoyé.' }];
    const target = b.target === 'all' ? 'all' : b.target === 'ev' ? 'ev' : '';
    if (!target) return [400, { error: 'bad_target', message: 'Cible inconnue (ev ou all).' }];
    const tt = b.title && typeof b.title === 'object' ? b.title : {}, bb = b.body && typeof b.body === 'object' ? b.body : {}, txt = {};
    for (const l of EVP_LANGS) {
      const ti = evPushLine(tt[l], 400), bo = evPushLine(bb[l], 1000);
      if (!ti && !bo) continue;
      if (!ti || !bo) return [400, { error: 'bad_text', message: 'Titre et texte attendus ensemble (' + l.toUpperCase() + ').' }];
      if (ti.length > EVP_MAX.title || bo.length > EVP_MAX.body) return [400, { error: 'too_long', message: `Trop long (${l.toUpperCase()}) : ${EVP_MAX.title} caractères au plus pour le titre, ${EVP_MAX.body} pour le texte.` }];
      txt[l] = [ti, bo];
    }
    if (!txt.fr || !txt.en) return [400, { error: 'bad_text', message: 'Titre et texte en français et en anglais attendus.' }];
    let when = 0;
    if (b.at != null && b.at !== '' && b.at !== 0) {
      when = Math.floor(Number(b.at));
      if (!Number.isFinite(when) || when < t + 60e3 || when > t + 30 * DAY_MS) return [400, { error: 'bad_time', message: 'Heure d\'envoi : dans une minute au moins, dans 30 jours au plus.' }];
      if (S.hist.filter(x => x.st === 'scheduled').length >= 5) return [429, { error: 'too_many', message: 'Déjà 5 envois programmés : annule-en un d\'abord.' }];
    }
    const w = wait(when || t); if (w) return [429, { error: 'too_soon', message: 'Un envoi par heure au plus : prochain possible dans ' + Math.ceil(w / 60e3) + ' min.', retry: Math.ceil(w / 1000) }];
    const x = { id: newId(), kind: 'manual', target, title: txt.fr[0], body: txt.fr[1], txt, by: String(by || ''), at: when ? 0 : t, when, st: when ? 'scheduled' : 'sending', cur: '', n: null, ok: 0, fail: 0, gone: 0 };
    push(x);
    try { await save(true); } catch (e) { S.hist.shift(); return [503, { error: 'unavailable', message: 'Envoi non enregistré sur le serveur : rien n\'est parti.' }]; }
    if (o.adminLog) await Promise.resolve(o.adminLog({ t, a: 'event', n: '', m: '', d: (when ? 'Notification programmée' : 'Notification envoyée') + ' (' + (target === 'all' ? 'tous les appareils' : 'événements') + ') : « ' + x.title + ' »', by: x.by, ok: true })).catch(() => {});
    if (!when) { const r = run(x).catch(e => log.warn('Événements : envoi manuel interrompu (' + (e && (e.code || e.message) || e) + '), repris au tour suivant')); await Promise.race([r, new Promise(res => { const h = setTimeout(res, o.waitMs ?? 8000); if (h.unref) h.unref(); })]); }
    return [200, { ok: true, entry: pub(x), push: await view() }];
  }
  /** Annule un envoi programmé. → [statut, corps]. */
  async function cancel(id, by) {
    const S = await load(), x = S.hist.find(y => y.id === id);
    if (!x || x.st !== 'scheduled') return [404, { error: 'not_found', message: 'Envoi programmé introuvable (déjà parti ?).' }];
    x.st = 'cancelled'; x.end = now(); await save();
    if (o.adminLog) await Promise.resolve(o.adminLog({ t: now(), a: 'event', n: '', m: '', d: 'Notification programmée annulée : « ' + x.title + ' »', by: String(by || ''), ok: true })).catch(() => {});
    return [200, { ok: true, push: await view() }];
  }
  return { reg, tick, view, send, cancel, flush: async () => { if (G.st && G.t) await save(); await (G.q || Promise.resolve()); }, _g: G };
}
