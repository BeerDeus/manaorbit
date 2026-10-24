// Mana Orbit — annonces des événements saisonniers par le bot Discord dans #annonces (aucune dépendance npm). Créé par discord-srv.mjs (discordMake → evDscMake,
// avec ses helpers : find, post, log…, exposé en DSC.events seulement si DISCORD_EVENTS n'est pas « 0 »), appelé chaque minute par proxy.mjs (tick, avec les
// statistiques et l'interrupteur de event-srv.mjs). Testé par tests/test-discord-events.mjs (horloge injectée, faux Discord).
//   · Quoi : pour chaque édition d'un pack prêt (src/evpacks.js › EV_PACKS, ready: true) dont les messages Discord (pack.dsc) sont complets, cinq annonces :
//     soon (J-3, « La chasse … arrive »), open (le jour du début), mid (jour du milieu : from + floor((jours − 1) / 2), « il reste X jours »), last (le jour de
//     fin, dernier jour de jeu), end (le lendemain de la fin : récapitulatif, chasseurs, nombre à total/total, top des pseudos publics s'il y en a).
//     Texte : pack.dsc[étape] (FR puis EN ; {from}, {to} « 25 octobre », {fromEn}, {toEn} « October 25 », {total}, {per}, {y}, {d}, {h}, {full}) ; embed aux couleurs
//     du pack (pal.a), visuel <site>/icons/events/<pack>/social-1200x630.png, vignette …/discord-512.png, lien vers l'appli.
//   · Ping du rôle « Événements » (« Events » aussi ; emoji, accents, casse ignorés) seulement s'il existe et peut être pingé (comme le rôle de la Carte mystère,
//     discord-daily.mjs) : allowed_mentions { parse: [], roles: [ce rôle] }, sinon { parse: [] } (une ligne de journal).
//   · Quand : jour de Paris (evpacks.js › evDay). Serveur arrêté : J-3 rattrapé jusqu'à la veille du début, J0 le jour même seulement, mi-parcours dans les 2 jours,
//     dernier jour le jour même, fin dans les 3 jours après la fin. Jamais deux annonces d'un coup pour la même édition : la plus récente seulement (evDscDue).
//     Édition coupée par l'admin (off() contient son identifiant, ou celui du pack) : rien.
//   · Une seule fois chacune : <dir>/discord-events.json { v: 1, done: { "halloween-2026|open": date d'envoi } }, écriture atomique, notée AVANT l'envoi (comme
//     discord-daily.json : un redémarrage en plein envoi ne la reposte jamais) ; Discord refuse, salon absent, statistiques illisibles : remise, nouvel essai au
//     tour suivant (une ligne de journal par annonce). Nonce fixe par annonce (mo-ev-<édition>-<étape>) : Discord ne crée pas de doublon. Fichier illisible au
//     départ : rien n'est annoncé (on ne sait pas ce qui est parti), une ligne de journal. Entrées de plus de 120 jours purgées.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dscRoleKey } from './discord-daily.mjs';

export const EV_DSC_STEPS = ['soon', 'open', 'mid', 'last', 'end'];
export const EV_DSC_SITE = 'https://manaorbit.app';
const ROLE_NAMES = ['evenements', 'evenement', 'events', 'event'];
const KEEP_MS = 120 * 86400e3, DAY_RE = /^\d{4}-\d\d-\d\d$/;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MEDAL = ['🥇', '🥈', '🥉'];
const DAY_MS = 86400000;
/** Date « AAAA-MM-JJ » + n jours (comme evpacks.js › evAdd, sans dépendre des packs passés). */
const add = (key, n) => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) + n * DAY_MS).toISOString().slice(0, 10);
/** Jours entre deux dates (b − a). */
const diff = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / DAY_MS);
/** Texte d'une ligne : sans caractère de contrôle ni de mise en forme invisible, espaces resserrés. */
const line = s => String(s).replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, ' ').replace(/\s+/g, ' ').trim();
/** Markdown de Discord neutralisé (pseudos affichés tels quels, jamais une mention). */
const md = s => String(s).replace(/[\\`*_~|>[\]()<@]/g, '\\$&');
const int = v => Math.max(0, Math.floor(Number(v) || 0));
/** « 25 octobre », « 1er novembre ». */
const dateFr = k => { const d = +k.slice(8, 10); return `${d === 1 ? '1er' : d} ${MOIS[+k.slice(5, 7) - 1]}`; };
/** « October 25 ». */
const dateEn = k => `${MONTHS[+k.slice(5, 7) - 1]} ${+k.slice(8, 10)}`;
/** Adresse du site : https?://hôte[:port][/chemin], sans / final ; sinon manaorbit.app. */
const siteOf = s => { const u = String(s || '').trim().replace(/\/+$/, ''); return /^https?:\/\/[^\s<>"'`]+$/.test(u) ? u : EV_DSC_SITE; };

/** Messages Discord d'un pack complets (les cinq étapes, FR et EN non vides) ? */
export const evDscReady = p => !!(p && p.ready && p.dsc && EV_DSC_STEPS.every(k => Array.isArray(p.dsc[k]) && p.dsc[k].length >= 2 && p.dsc[k].slice(0, 2).every(t => typeof t === 'string' && t.trim())));

/** Fenêtres d'une édition ({ from, to, days }) : [{ kind, a, b }] (jours « AAAA-MM-JJ » inclus), dans l'ordre des étapes. */
export function evDscWindows(ed) {
  const m = add(ed.from, Math.floor((Math.max(1, ed.days || diff(ed.from, ed.to) + 1) - 1) / 2)), out = [{ kind: 'soon', a: add(ed.from, -3), b: add(ed.from, -1) }, { kind: 'open', a: ed.from, b: ed.from }];
  if (m > ed.from && m < ed.to) { const b = add(m, 2); out.push({ kind: 'mid', a: m, b: b < ed.to ? b : add(ed.to, -1) }); }      // édition très courte : pas de mi-parcours
  out.push({ kind: 'last', a: ed.to, b: ed.to }, { kind: 'end', a: add(ed.to, 1), b: add(ed.to, 3) });
  return out;
}

/** Annonces dues le jour day pour ces éditions (state : { "<édition>|<étape>": date d'envoi }) → [{ ed, kind, late }] : au plus une par édition, l'étape la plus
 *  récente dont la fenêtre contient day (rattrapage), si elle n'est pas encore partie ; une plus ancienne encore dans sa fenêtre ne part plus. */
export function evDscDue(day, editions, state) {
  const done = state || {}, out = [];
  if (!DAY_RE.test(String(day || ''))) return out;
  for (const ed of editions || []) {
    if (!ed || !DAY_RE.test(String(ed.from || '')) || !DAY_RE.test(String(ed.to || ''))) continue;
    const w = evDscWindows(ed).filter(x => day >= x.a && day <= x.b).pop();
    if (w && !Object.hasOwn(done, ed.id + '|' + w.kind)) out.push({ ed, kind: w.kind, late: day > w.a });
  }
  return out;
}

/** Nonce de l'annonce (25 caractères au plus, discord-srv.mjs › call) : mo-ev-<édition>-<étape>, empreinte si plus long. */
export const evDscNonce = (id, kind) => { const n = `mo-ev-${id}-${kind}`; return n.length <= 25 ? n : 'mo-ev-' + createHash('sha256').update(id + '|' + kind).digest('base64url').slice(0, 19); };

/** Message d'une annonce. kind : étape ; edition : evpacks.js › evEdition (+ day : jour de l'envoi, sinon le premier de la fenêtre) ; pack : son pack ;
 *  stats : { hunters, full, top: [{ n, c }] } (mi-parcours et fin) ; roleId : rôle à pinger ou '' ; site : adresse du site. → { content, embeds, allowed_mentions }
 *  ou null (pack sans messages Discord complets, étape inconnue). */
export function evDscMsg(kind, edition, pack, stats, roleId, site) {
  if (!evDscReady(pack) || !EV_DSC_STEPS.includes(kind) || !edition) return null;
  const S = siteOf(site), app = S + '/', st = stats || {}, h = int(st.hunters), full = int(st.full), total = int(edition.total ?? pack.total), per = int(edition.per ?? pack.perDay);
  const win = evDscWindows(edition).find(x => x.kind === kind), day = DAY_RE.test(String(edition.day || '')) ? edition.day : (win ? win.a : edition.from);
  const left = Math.max(1, diff(day, edition.to) + 1), r = /^\d{5,25}$/.test(String(roleId || '')) ? String(roleId) : '';
  const fill = (t, loc) => {
    const num = v => v.toLocaleString(loc), vals = { from: dateFr(edition.from), to: dateFr(edition.to), fromEn: dateEn(edition.from), toEn: dateEn(edition.to), total: num(total), per: num(per), y: String(edition.year), d: num(left), h: num(h), full: num(full) };
    const one = { d: left === 1, h: h === 1 };
    return line(String(t))      // nettoyé avant : les espaces insécables des nombres (« 1 234 ») restent
      .replace(/\{(d|h)\}(\s+)(\p{L}+?)s(?!\p{L})/gu, (all, k, sp, w) => (one[k] ? `${vals[k]}${sp}${w}` : all))      // « 1 jour », « 1 hunter » (pas « 1 jours »)
      .replace(/\{(\w+)\}/g, (all, k) => (Object.hasOwn(vals, k) ? vals[k] : all));
  };
  let fr = fill(pack.dsc[kind][0], 'fr-FR'), en = fill(pack.dsc[kind][1], 'en-US');
  if (kind === 'soon') {      // J-3 rattrapé à J-2 ou J-1 : le délai dit vrai
    const n = diff(day, edition.from);
    if (n >= 1 && n !== 3) { fr = fr.replace(/dans 3 jours/, n === 1 ? 'demain' : `dans ${n} jours`); en = en.replace(/in 3 days/, n === 1 ? 'tomorrow' : `in ${n} days`); }
  }
  const lines = [(r ? `<@&${r}> ` : '') + fr, en];
  if (kind === 'end') {
    const top = (Array.isArray(st.top) ? st.top : []).filter(x => x && line(x.n || '')).slice(0, 10);
    if (top.length) lines.push('', '🏆 **Meilleurs chasseurs · Top hunters**', ...top.map((x, i) => `${MEDAL[i] || `**${i + 1}.**`} **${md(line(x.n).slice(0, 24))}** — ${Math.min(total || Infinity, int(x.c))}/${total}`));
  }
  lines.push(`<${app}>`);
  const name = line((pack.txt && pack.txt.short) || pack.name || pack.id), emo = (pack.obj && pack.obj.emoji) || '🎉', y = edition.year;
  const color = /^#[0-9a-f]{6}$/i.test(String(pack.pal && pack.pal.a || '')) ? parseInt(pack.pal.a.slice(1), 16) : 0x8b5cf6;
  const fields = kind === 'mid' || kind === 'end' ? [{ name: 'Chasseurs · Hunters', value: h.toLocaleString('fr-FR'), inline: true }, { name: `À ${total}/${total} · At ${total}/${total}`, value: full.toLocaleString('fr-FR'), inline: true }] : [];
  if (kind === 'mid') fields.push({ name: 'Jours restants · Days left', value: String(left), inline: true });
  const embed = {
    title: `${emo} ${name} ${y}`.slice(0, 256), url: app, color,
    description: `Du ${dateFr(edition.from)} au ${dateFr(edition.to)} ${y} · ${dateEn(edition.from)} – ${dateEn(edition.to)}, ${y}\n[Ouvrir Mana Orbit · Open Mana Orbit](${app})`,
    ...(fields.length ? { fields } : {}),
    image: { url: `${S}/icons/events/${pack.id}/social-1200x630.png` }, thumbnail: { url: `${S}/icons/events/${pack.id}/discord-512.png` },
    footer: { text: 'Mana Orbit · ' + S.replace(/^https?:\/\//, '') },
  };
  return { content: lines.join('\n').slice(0, 2000), embeds: [embed], allowed_mentions: r ? { parse: [], roles: [r] } : { parse: [] } };
}

/** h : helpers de discordMake { on, find, post, log, dErr, TX, NEWS, P_MENTION } ; o : { dir (ADMIN_DIR), packs (src/evpacks.js), site (SITE_URL), channel (nom utile du
 *  salon, « annonces »), file }. → { tick({ now, stats, off }) → Promise<[clés envoyées]> } : jamais d'erreur levée (proxy.mjs l'appelle chaque minute). */
export function evDscMake(h, o = {}) {
  const { find, post, log = console, TX = 0, NEWS = 5, P_MENTION = 1n << 17n } = h;
  const P = o.packs || createRequire(import.meta.url)('./src/evpacks.js'), SITE = siteOf(o.site), CHAN = line(o.channel || 'annonces').replace(/^#/, '') || 'annonces';
  const FILE = o.file || join(o.dir || join(process.cwd(), '.data', 'admin'), 'discord-events.json');
  const G = { st: undefined, chain: Promise.resolve(), busy: false, warn: new Map() }, W = { noRole: false, noPing: false };
  /** Une ligne de journal par sujet et par valeur (pas à chaque tour). */
  const once = (k, v, m) => { if (G.warn.get(k) !== v) { G.warn.set(k, v); log.warn(m); } };

  /** État relu une fois ; null : illisible (rien d'annoncé). */
  async function load() {
    if (G.st === undefined) {
      let j = null;
      try { j = JSON.parse(await readFile(FILE, 'utf8')); }
      catch (e) { if (!e || e.code !== 'ENOENT') { log.warn('Discord : discord-events.json illisible, aucune annonce d\'événement'); return (G.st = null); } }
      const done = {}; for (const [k, v] of Object.entries((j && j.done) || {})) if (/^[a-z]+-\d{4}\|(soon|open|mid|last|end)$/.test(k) && Number.isFinite(v)) done[k] = v;
      G.st = { done };
    }
    return G.st;
  }
  /** Écriture atomique, une à la fois ; entrées trop vieilles purgées. */
  function save(t) {
    const S = G.st; for (const [k, v] of Object.entries(S.done)) if (t - v > KEEP_MS) delete S.done[k];
    const body = JSON.stringify({ v: 1, done: S.done });
    const run = G.chain.then(async () => { await mkdir(dirname(FILE), { recursive: true }); await writeFile(FILE + '.tmp', body); await rename(FILE + '.tmp', FILE); });
    G.chain = run.catch(() => {});
    return run;
  }
  /** Rôle « Événements » à pinger dans ce salon → id, sinon ''. */
  function roleOf(d, c) {
    const r = (d.roles || []).find(x => x && x.id !== d.gid && !x.managed && ROLE_NAMES.includes(dscRoleKey(x.name)));
    if (!r) { if (!W.noRole) { W.noRole = true; log.log('Discord : rôle « Événements » absent, annonces d\'événement sans ping'); } return ''; }
    W.noRole = false;
    if (!r.mentionable && !d.can(c, P_MENTION)) { if (!W.noPing) { W.noPing = true; log.warn(`Discord : rôle « Événements » non mentionnable et bot sans « Mentionner @everyone, @here et tous les rôles » dans #${CHAN}, annonce sans ping`); } return ''; }
    W.noPing = false;
    return String(r.id);
  }
  /** Éditions à surveiller autour du jour : packs prêts aux messages complets, année d'avant, de ce jour et d'après ; coupées exclues. */
  function editions(day, offs) {
    const y = +day.slice(0, 4), out = [];
    for (const p of P.EV_PACKS || []) {
      if (!evDscReady(p) || offs.includes(p.id)) continue;
      for (const yy of [y - 1, y, y + 1]) { const e = P.evEdition(p, yy); if (!offs.includes(e.id)) out.push(e); }
    }
    return out;
  }
  /** Une annonce : notée, envoyée, remise si rien n'est parti. */
  async function send(t, day, ed, kind, stats) {
    const key = ed.id + '|' + kind, pack = P.evPack(ed.id);
    let st = null;
    if (kind === 'mid' || kind === 'end') {
      try { st = await stats(ed.id); if (!st || typeof st !== 'object') throw new Error('statistiques absentes'); }
      catch (e) { once(key, 'stats', `Discord : annonce « ${kind} » de ${ed.id} en attente (statistiques illisibles : ${e && e.message || e}) : nouvel essai à chaque tour`); return false; }
    }
    if (!h.on) return false;
    let r;
    try { r = await find([CHAN], [TX, NEWS]); } catch (e) { once(key, 'find', `Discord : annonce « ${kind} » de ${ed.id} pas encore postée (${e && e.message || e}) : nouvel essai à chaque tour`); return false; }
    if (!r.c) { once(key, 'chan', `Discord : salon #${CHAN} introuvable, annonce « ${kind} » de ${ed.id} en attente`); return false; }
    const role = roleOf(r.d, r.c), msg = evDscMsg(kind, { ...ed, day }, pack, st, role, SITE);
    if (!msg) return false;
    G.st.done[key] = t;
    try { await save(t); } catch (e) { delete G.st.done[key]; once(key, 'save', `Discord : discord-events.json non écrit (${e && e.code || e}), annonce « ${kind} » de ${ed.id} en attente`); return false; }      // sans l'état écrit, rien ne part
    let m;
    try { m = await post(r.c, `/channels/${r.c.id}/messages`, { ...msg, nonce: evDscNonce(ed.id, kind) }); }
    catch (e) {
      delete G.st.done[key]; await save(t).catch(() => {});
      once(key, 'post', `Discord : annonce « ${kind} » de ${ed.id} pas encore postée (${e && e.message || e}) : nouvel essai à chaque tour`);
      return false;
    }
    G.warn.delete(key);
    log.log(`Discord : annonce « ${kind} » de ${ed.id} postée dans #${CHAN}${role ? ' (rôle pingé)' : ' (sans ping)'}.`);
    if (r.c.type === NEWS && m && /^\d{5,25}$/.test(String(m.id || ''))) {      // salon d'annonces : publiée aussi aux serveurs abonnés
      try { await post(r.c, `/channels/${r.c.id}/messages/${m.id}/crosspost`); } catch (e) { log.warn(`Discord : annonce de ${ed.id} postée mais pas publiée (${e && e.message || e})`); }
    }
    return true;
  }
  /** Tour (chaque minute) : now (ms), stats(id) → Promise<{ hunters, full, top }>, off() → identifiants coupés. Un tour à la fois. */
  async function tick({ now = Date.now(), stats, off } = {}) {
    const sent = [];
    if (!h.on || G.busy) return sent;
    G.busy = true;
    try {
      const t = Number(now) || Date.now(), day = P.evDay(t), S = await load(); if (!S) return sent;
      let offs = []; try { offs = typeof off === 'function' ? [].concat(await off() || []).map(String) : []; } catch (e) { offs = []; }
      const due = evDscDue(day, editions(day, offs), S.done);
      const st = typeof stats === 'function' ? stats : () => Promise.reject(new Error('aucune source'));
      for (const x of due) if (await send(t, day, x.ed, x.kind, st)) sent.push(x.ed.id + '|' + x.kind);
    } catch (e) { once('tick', String(e && e.message), 'Discord : annonces d\'événement (' + (e && e.message || e) + ')'); }
    finally { G.busy = false; }
    return sent;
  }
  return { tick, file: FILE, channel: CHAN };
}
