// Mana Orbit — sorties d'extensions annoncées par le bot Discord dans #spoilers (aucune dépendance npm). Chargé par proxy.mjs (dssMake, avec les helpers de
// discord-srv.mjs › discordMake : find, post), testé par tests/test-discord-sets.mjs (horloge injectée, faux Scryfall /sets, faux Discord).
//   · Quelles extensions : EXACTEMENT celles de la carte « Prochaines extensions » de l'accueil : src/sets.js lu tel quel (createRequire, comme src/progress.js
//     pour daily-srv.mjs) : setsKeep (types expansion, core, masters, draft_innovation, commander ; jamais une édition numérique) puis setsPick (produits
//     rattachés à une édition affichée, decks Commander…, fondus dans leur parent : pas d'annonce à part, « decks Commander » dans celle du parent).
//   · Quand : à J-7 (« Sortie dans 7 jours ») et le jour J (« Sortie aujourd'hui »), à partir de hour (10 h) heure de tz (Europe/Paris ; jours du fuseau :
//     daily-srv.mjs › dlyClock). Serveur arrêté ou extension apparue en retard : J-7 rattrapé jusqu'à J-5 (« Sortie dans 5 jours »), J le jour même seulement.
//     Une seule fois par extension, étape et date de sortie : extension dont la date change → annoncée de nouveau à J-7 / J de la nouvelle date (« Nouvelle
//     date, avant : … »). Plusieurs extensions le même jour : un message chacune (embed à part, lisible et partageable seul).
//   · Source : Scryfall GET /sets (scry : SCRY_UP de proxy.mjs), lue seulement après l'heure du jour, au plus toutes les fetchMs (6 h : 3 lectures par jour au
//     plus) ; échec : la copie gardée sert, nouvel essai après failMs (1 h). Gardée en mémoire réduite (sorties des 30 derniers jours et à venir).
//   · Message : FR puis EN court, embed (nom → page Scryfall, date en toutes lettres, code, nombre de cartes s'il est connu, liens « Précommander » (J-7) /
//     « Acheter » (J) vers la recherche des produits Cardmarket au nom de l'extension, construite comme l'appli : core.js › cmUrl vérifiée par
//     sets.js › SETS_CM_RE ; page de l'appli https://manaorbit.app/ (pas de lien profond vers une extension : setview.js ne s'ouvre que depuis l'accueil)).
//     Aucun ping (allowed_mentions vide).
//   · État : ADMIN_DIR/discord-sets.json { v: 1, done: { "code|j7|AAAA-MM-JJ": date d'envoi } }, écriture atomique, une à la fois, entrées de plus de 30 jours
//     (date de sortie) purgées. Noté AVANT l'envoi (comme la Carte mystère de la veille) : un redémarrage en plein envoi ne la reposte jamais ; échec de
//     Discord (panne, salon introuvable, refus) → entrée retirée, nouvel essai au tour suivant (tickMs, 10 min). Fichier illisible au départ : rien n'est
//     annoncé (on ne sait pas ce qui est parti), une ligne dans le journal.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { dlyClock, dlyAdd } from './daily-srv.mjs';

const REQ = createRequire(import.meta.url);
const need = f => { try { return REQ(f); } catch (e) { return null; } };
export const DSS_APP = 'https://manaorbit.app/';
const DAY_RE = /^\d{4}-\d\d-\d\d$/, KEEP_DAYS = 30;
const FR_M = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const FR_D = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const EN_M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EN_D = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Étape d'une extension à d jours de sa sortie : 'j7' de J-7 à J-5 (rattrapage), 'j' le jour même, sinon ''. */
export const dssStage = d => (d === 0 ? 'j' : d >= 5 && d <= 7 ? 'j7' : '');
/** « AAAA-MM-JJ » → [« vendredi 14 novembre 2026 », « Friday, November 14, 2026 »] (sans Intl : même texte partout). */
export function dssDate(at) {
  const [y, m, d] = String(at).split('-').map(Number), w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return [`${FR_D[w]} ${d === 1 ? '1er' : d} ${FR_M[m - 1]} ${y}`, `${EN_D[w]}, ${EN_M[m - 1]} ${d}, ${y}`];
}
/** « dans 7 jours » : [FR, EN]. */
const when = d => (d === 0 ? ['Sortie aujourd\'hui', 'Out today'] : d === 1 ? ['Sortie demain', 'Out tomorrow'] : [`Sortie dans ${d} jours`, `Out in ${d} days`]);
const line = s => String(s).replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, ' ').replace(/\s+/g, ' ').trim();
/** Markdown de Discord neutralisé (nom de l'extension : texte de Scryfall). */
const md = s => String(s).replace(/[\\`*_~|>[\]()<@]/g, '\\$&');
/** Adresse dans un lien masqué [texte](adresse) : parenthèses encodées (elles fermeraient le lien). */
const mdUrl = u => String(u).replace(/\(/g, '%28').replace(/\)/g, '%29');
const nf = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');

/** Message d'une sortie. r : ligne de setsPick (code, name, at, url, cmd) + d (jours avant la sortie), stage ('j7' | 'j'), n : { printed, count } (nombre de
 *  cartes de Scryfall, 0 : inconnu), prev : ancienne date déjà annoncée (date changée), cm : { fr, en } (recherche Cardmarket, '' : absente), app : page de l'appli. */
export function dssMsg(r, stage, { n = {}, prev = '', cm = {}, app = DSS_APP } = {}) {
  const name = line(r.name || r.code).slice(0, 200), code = String(r.code || '').toUpperCase().slice(0, 10), [wFr, wEn] = when(r.d), [dFr, dEn] = dssDate(r.at), j = stage === 'j';
  const https = u => (typeof u === 'string' && /^https:\/\/[^\s<>]+$/.test(u) ? u : '');
  const scry = https(r.url) || `https://scryfall.com/sets/${encodeURIComponent(String(r.code || ''))}`;
  const content = `${j ? '🎉' : '✨'} **${wFr} : ${md(name)}**\n-# ${wEn}: ${md(name)}`;
  const buy = j ? ['Acheter sur Cardmarket', 'Buy'] : ['Précommander sur Cardmarket', 'Pre-order'];
  const desc = [`📅 **${dFr}** · ${dEn}`];
  if (prev && DAY_RE.test(prev) && prev !== r.at) { const [pFr, pEn] = dssDate(prev); desc.push(`🔁 Nouvelle date (annoncée avant pour le ${pFr}) · New date (was ${pEn})`); }
  const cmL = [cm.fr ? `[${buy[0]}](${mdUrl(cm.fr)})` : '', cm.en ? `[${buy[1]}](${mdUrl(cm.en)})` : ''].filter(Boolean);
  if (cmL.length) desc.push('🛒 ' + cmL.join(' · '));
  desc.push(`📱 [Voir dans Mana Orbit · Open in the app](${mdUrl(https(app) || DSS_APP)}) · [Scryfall](${mdUrl(scry)})`);
  const printed = Number(n.printed) > 0 ? Math.floor(n.printed) : 0, count = Number(n.count) > 0 ? Math.floor(n.count) : 0;
  const cards = printed ? `${nf(printed)} cartes · cards` : count ? (r.d > 0 ? `${nf(count)} révélées · revealed` : `${nf(count)} cartes · cards`) : '';
  const fields = [{ name: 'Code', value: code || '?', inline: true }, ...(cards ? [{ name: 'Cartes · Cards', value: cards, inline: true }] : []),
    ...(r.cmd ? [{ name: 'Avec · With', value: 'decks Commander · Commander decks', inline: true }] : [])];
  const embed = { title: name.slice(0, 256), url: scry, description: desc.join('\n').slice(0, 4000), color: j ? 0xf59e0b : 0x8b5cf6, fields, footer: { text: 'Mana Orbit · manaorbit.app' } };
  return { content, embeds: [embed], allowed_mentions: { parse: [] } };
}

/** Crée l'annonceur. o : { find, post, types (salons écrits et d'annonces de discord-srv.mjs), off (DISCORD_SETS=0), dir (ADMIN_DIR), file, scry (API Scryfall),
 *  ua (User-Agent), fetch (Scryfall), now, log, hour (10), tz (Europe/Paris), tickMs (10 min), firstMs (30 s), fetchMs (6 h), failMs (1 h), timeoutMs (20 s),
 *  sets (src/sets.js), cmUrl (src/core.js), app (page de l'appli), channel ('spoilers') }. on false : rien (bot coupé, sets.js absent). */
export function dssMake(o = {}) {
  const S = o.sets || need('../src/sets.js'), cmUrl = o.cmUrl || (need('../src/core.js') || {}).cmUrl, log = o.log || console, now = o.now || Date.now, fetchFn = o.fetch || globalThis.fetch;
  const ON = !o.off && typeof o.find === 'function' && typeof o.post === 'function' && !!(S && S.setsKeep && S.setsPick);
  const h0 = Math.floor(Number(o.hour ?? 10)), HOUR = Number.isFinite(h0) ? Math.max(0, Math.min(23, h0)) : 10, TZ = o.tz || 'Europe/Paris', C0 = dlyClock(0, TZ), CH = dlyClock(HOUR, TZ);
  const SCRY = String(o.scry || 'https://api.scryfall.com').replace(/\/+$/, ''), UA = o.ua || 'ManaOrbit/1.0 (https://manaorbit.app)', TYPES = o.types || [0, 5], NAME = o.channel || 'spoilers';
  const TICK = Math.max(1000, o.tickMs || 10 * 60e3), FIRST = o.firstMs ?? 30e3, FETCH = o.fetchMs ?? 6 * 3600e3, FAIL = o.failMs ?? 3600e3, TIMEOUT = o.timeoutMs ?? 20e3;
  const FILE = o.file || join(o.dir || join(process.cwd(), '.data', 'admin'), 'discord-sets.json'), APP = o.app || DSS_APP;
  const G = { raw: null, at: 0, fail: 0, st: undefined, chain: Promise.resolve(), busy: null, warned: new Map(), timer: null };
  const warn = (k, day, m) => { if (G.warned.get(k) === day) return; G.warned.set(k, day); log.warn(m); };

  /** État des annonces (lu une fois) : { done } ; null si le fichier est illisible (rien n'est alors annoncé). */
  async function state() {
    if (G.st !== undefined) return G.st;
    try { const j = JSON.parse(await readFile(FILE, 'utf8')); G.st = { done: Object.fromEntries(Object.entries((j && j.done) || {}).filter(([k, v]) => k.split('|').length === 3 && Number.isFinite(v))) }; }
    catch (e) { if (e && e.code === 'ENOENT') G.st = { done: {} }; else { G.st = null; log.warn('Discord : discord-sets.json illisible (' + (e.code || 'JSON') + '), aucune sortie annoncée jusqu\'au prochain démarrage'); } }
    return G.st;
  }
  /** Écriture atomique (une à la fois), entrées dont la sortie date de plus de 30 jours retirées. Erreur levée si rien n'est écrit. */
  function save(today) {
    const old = dlyAdd(today, -KEEP_DAYS);
    for (const k of Object.keys(G.st.done)) { const at = k.split('|')[2]; if (!DAY_RE.test(at) || at < old) delete G.st.done[k]; }
    const run = G.chain.then(async () => { await mkdir(dirname(FILE), { recursive: true }); await writeFile(FILE + '.tmp', JSON.stringify({ v: 1, done: G.st.done })); await rename(FILE + '.tmp', FILE); });
    G.chain = run.catch(() => {});
    return run;
  }
  /** GET /sets de Scryfall, réduit aux sorties des 30 derniers jours et à venir (champs lus par sets.js et par le message). */
  async function load(today) {
    const r = await fetchFn(SCRY + '/sets', { headers: { Accept: 'application/json', 'User-Agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) { await r.arrayBuffer().catch(() => {}); throw new Error('Scryfall HTTP ' + r.status); }
    const j = await r.json(); if (!j || !Array.isArray(j.data)) throw new Error('Scryfall : réponse illisible');
    const from = dlyAdd(today, -KEEP_DAYS), keys = ['code', 'name', 'released_at', 'set_type', 'digital', 'parent_set_code', 'scryfall_uri', 'icon_svg_uri', 'printed_size', 'card_count'];
    return j.data.filter(s => s && typeof s.released_at === 'string' && s.released_at >= from).map(s => Object.fromEntries(keys.filter(k => s[k] !== undefined).map(k => [k, s[k]])));
  }
  /** Recherche Cardmarket de l'appli (sets.js › setsCm : core.js › cmUrl, format vérifié), site français et anglais. */
  const cmOf = name => { const one = l => { try { const u = cmUrl ? cmUrl(name, l) : ''; return S.SETS_CM_RE && S.SETS_CM_RE.test(u) ? u : ''; } catch (e) { return ''; } }; return { fr: one('fr'), en: one('en') }; };

  /** Un tour : rien avant l'heure ; sinon Scryfall relu si besoin, annonces dues postées. → nombre de messages postés. */
  async function run() {
    const t = now(), today = C0.dayOf(t);
    if (t < CH.startOf(today)) return 0;      // avant 10 h (Paris) : ni Scryfall, ni Discord
    const st = await state(); if (!st) return 0;
    if (!G.raw || t - G.at >= FETCH) {
      if (t - G.fail >= FAIL) {
        try { G.raw = await load(today); G.at = t; G.fail = 0; }
        catch (e) { G.fail = t; warn('scry', today, 'Discord : sorties d\'extensions, Scryfall illisible (' + (e && e.message || e) + '), nouvel essai dans ' + Math.round(FAIL / 60e3) + ' min'); }
      }
      if (!G.raw) return 0;
    }
    // Jours comptés comme l'accueil d'un appareil à l'heure de Paris : midi (heure du serveur) du jour de Paris, quel que soit le fuseau du serveur
    const [y, m, d] = today.split('-').map(Number), noon = new Date(y, m - 1, d, 12).getTime();
    const raw = new Map(G.raw.map(s => [String(s.code || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10), s]));
    const due = [];
    for (const r of S.setsPick(S.setsKeep(G.raw, noon), noon, Infinity)) {
      const stage = dssStage(r.d); if (!stage || !DAY_RE.test(r.at)) continue;
      const key = `${r.code}|${stage}|${r.at}`; if (st.done[key]) continue;
      const prev = Object.keys(st.done).filter(k => k.startsWith(r.code + '|' + stage + '|')).map(k => k.split('|')[2]).sort().pop() || '';      // date changée : la dernière annoncée
      due.push({ r, stage, key, prev });
    }
    if (!due.length) return 0;
    let c;
    try { c = (await o.find([NAME], TYPES)).c; }
    catch (e) { warn('dsc', today, 'Discord : sorties d\'extensions pas annoncées (' + e.message + '), nouvel essai au tour suivant'); return 0; }
    if (!c) { warn('chan', today, `Discord : salon #${NAME} introuvable, ${due.length} sortie${due.length > 1 ? 's' : ''} d'extension pas annoncée${due.length > 1 ? 's' : ''} (nouvel essai au tour suivant)`); return 0; }
    let sent = 0;
    for (const x of due) {
      const s = raw.get(x.r.code) || {};
      st.done[x.key] = t;
      try { await save(today); }      // noté AVANT l'envoi : sans écriture, rien ne part (sinon il repartirait à chaque tour)
      catch (e) { delete st.done[x.key]; warn('save', today, 'Discord : discord-sets.json non enregistré (' + (e && e.code || e) + '), sorties pas annoncées'); break; }
      try {
        await o.post(c, `/channels/${c.id}/messages`, { ...dssMsg(x.r, x.stage, { n: { printed: s.printed_size, count: s.card_count }, prev: x.prev, cm: cmOf(x.r.name), app: APP }), nonce: ('mo-' + x.stage + '-' + x.r.code + '-' + String(x.r.at).replace(/-/g, '')).slice(0, 25) });      // nonce par extension, étape et date
        sent++; log.log(`Discord : sortie de ${line(x.r.name)} (${x.r.code.toUpperCase()}, ${x.r.at}) annoncée dans #${NAME} (${x.stage === 'j' ? 'jour J' : 'J-' + x.r.d}).`);
      } catch (e) {
        delete st.done[x.key]; await save(today).catch(() => {});      // remis : nouvel essai au tour suivant
        warn('post:' + x.key, today, `Discord : sortie de ${line(x.r.name)} pas annoncée (${e.message}), nouvel essai au tour suivant`);
        if (e.kind === 'limit' || e.kind === 'down') break;
      }
    }
    return sent;
  }
  /** Un tour à la fois. */
  function tick() {
    if (!ON) return Promise.resolve(0);
    if (!G.busy) G.busy = run().catch(e => { log.warn('Discord : sorties d\'extensions, tour en erreur (' + (e && e.message || e) + ')'); return 0; }).finally(() => { G.busy = null; });
    return G.busy;
  }
  /** Premier tour firstMs après le démarrage, puis toutes les tickMs. */
  function start() {
    if (!ON || G.timer) return;
    G.timer = setTimeout(() => { tick(); G.timer = setInterval(tick, TICK); if (G.timer.unref) G.timer.unref(); }, FIRST); if (G.timer.unref) G.timer.unref();
  }
  function stop() { clearTimeout(G.timer); clearInterval(G.timer); G.timer = null; }
  return { on: ON, hour: HOUR, tz: C0.tz, tick, start, stop, _g: G };
}
