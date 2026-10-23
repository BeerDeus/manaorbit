// Mana Orbit — « Partager sur Discord » d'un deck public (aucune dépendance npm). Chargé par proxy.mjs (dscDeckMake, avec les helpers du bot : discordMake › kit),
// testé par tests/test-discord-deck.mjs (faux Discord, faux Firestore, vrai proxy.mjs).
//   POST /api/discord/deck { id } (jeton Firebase obligatoire, même origine, JSON) : l'auteur d'un deck public (pubdecks/{empreinte}_{0…9}) le poste dans #🃏・decks
//   (salon trouvé par son nom utile « decks »). Vérifié avant : le deck est au compte (empreinte de l'identifiant = amTag de l'UID, sinon 403) et dans la liste
//   publique servie (/api/pubdecks : déjà filtrée, format, mots refusés, signalements ; sinon 404). Message : une ligne FR · EN, un embed (titre = nom du deck,
//   sinon le ou les commandants ; couleur de l'identité : mono → couleur de mana, multicolore → or, incolore → gris ; commandants, nombre de cartes, prix « à partir
//   de » estimé avec prices.tsv du serveur, auteur ; image du commandant chez Scryfall) et un bouton lien « Voir le deck » (?pd=<id> : la page du deck dans l'appli).
//   Auteur : le membre Discord lié au compte (liaison OAuth2, ADMIN_DIR/discord-links.json) s'il est sur le serveur, mentionné SANS ping (allowed_mentions vide) ;
//   sinon le pseudo public de l'appli. Garde-fous : le même deck n'est pas repartagé dans les 24 h (le lien du message déjà posté revient, again: true),
//   perDay partages par compte et par 24 h (5), perH par heure et par réseau (10), un envoi à la fois par deck. Historique : ADMIN_DIR/discord-decks.json
//   ({ t, id, url }, une écriture à la fois, atomique ; 30 jours, HIST_MAX lignes au plus). Réponse { ok, url } (url : le message sur Discord).
//   Journal : ni UID, ni id Discord, ni jeton ; seulement « deck partagé dans #decks (membre mentionné) ».
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { dscName } from './discord-srv.mjs';

const TX = 0, NEWS = 5, ID_RE = /^[0-9a-f]{64}_[0-9]$/, DAY = 86400e3, KEEP = 30 * DAY, HIST_MAX = 2000;
// Couleurs de l'embed : celles des planètes du logo (src/simg.js › SIMG_PIPS), or pour un deck multicolore, gris pour un incolore
export const DSC_DECK_COLORS = { W: 0xf8f6d8, U: 0x7fb0ff, B: 0xb5a3c8, R: 0xff7a5c, G: 0x6fd08c, gold: 0xd4af37, none: 0x9ca3af };
/** Identité de couleur (« WUBRG », '' incolore) → couleur de l'embed. */
export const dscDeckColor = ci => { const s = String(ci || '').replace(/[^WUBRG]/g, ''); return !s ? DSC_DECK_COLORS.none : s.length === 1 ? DSC_DECK_COLORS[s] : DSC_DECK_COLORS.gold; };
const line = s => String(s).replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, ' ').replace(/\s+/g, ' ').trim();
const md = s => String(s).replace(/[\\`*_~|>[\]()<@#]/g, '\\$&');
const cut = (s, n) => { const a = [...s]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : s; };
/** Image d'une carte chez Scryfall (même adresse que l'appli : lot.js, opening.js) ; face avant d'une carte double. */
export const dscCardImg = n => 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(String(n).split('//')[0].trim()) + '&format=image&version=normal';
/** Prix « à partir de » (centimes d'euro) → « ≈ 1 234 € (Cardmarket) ». */
export const dscEuros = c => '≈ ' + Math.max(1, Math.round(c / 100)).toLocaleString('fr-FR') + ' € (Cardmarket)';

/** Message du deck : x = { title, cmd: [noms], ci, n (cartes), price (centimes ou null), url (lien du deck), by (pseudo de l'appli), member (id Discord vérifié, ou '') }. */
export function dscDeckMsg(x) {
  const cmd = (x.cmd || []).map(c => cut(line(c), 150)).filter(Boolean), who = x.member ? `<@${x.member}>` : `**${md(cut(line(x.by || '?'), 30))}**`;
  const title = cut(line(x.title || '') || cmd.join(' + ') || 'Deck', 256), two = cmd.length > 1;
  const fields = [
    { name: two ? 'Commandants · Commanders' : 'Commandant · Commander', value: cmd.map(md).join('\n').slice(0, 1024) || '?', inline: true },
    { name: 'Cartes · Cards', value: String(Math.max(0, Math.floor(Number(x.n) || 0))), inline: true },
    ...(x.price > 0 ? [{ name: 'Prix estimé · Estimated price', value: dscEuros(x.price), inline: true }] : []),
    { name: 'Auteur · Author', value: who, inline: true },
  ];
  const embed = { title, url: x.url, color: dscDeckColor(x.ci), fields, ...(cmd.length ? { thumbnail: { url: dscCardImg(cmd[0]) } } : {}), footer: { text: 'Mana Orbit · Decks › À monter › Communauté' } };
  return {
    content: `🃏 ${who} partage son deck · shares a deck`,
    embeds: [embed],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: 'Voir le deck · View deck', url: x.url }] }],
    allowed_mentions: { parse: [] },      // aucun ping, pas même l'auteur mentionné
  };
}

/** o : { kit (discordMake › kit : find, post, links, acctOf), json, readBody, rateWait, tooLarge, now, log, dir (ADMIN_DIR), histFile,
 *  pubDeck (id → deck de la liste servie { id, by, cmd, ci, cards: [[nom, qté]] } ou null ; lève une erreur si la liste est illisible),
 *  deckName (id → nom du deck dans Firestore, '' si inconnu), bad (texte → mot refusé ou ''), prices (→ nom → centimes, ou null sans fichier de prix),
 *  deckUrl (req, id → lien du deck dans l'appli), perDay (5), perH (10) }. Retourne la route (req, res). */
export function dscDeckMake(o) {
  const K = o.kit, json = o.json, now = o.now || Date.now, log = o.log || console, PER_DAY = Number(o.perDay ?? 5), PER_H = Number(o.perH ?? 10);
  const FILE = o.histFile || join(o.dir || join(process.cwd(), '.data', 'admin'), 'discord-decks.json');
  const H = { list: null, chain: Promise.resolve(), busy: new Map() };
  /** Historique (du plus récent au plus ancien), relu une fois. */
  async function hist() {
    if (H.list) return H.list;
    try { const j = JSON.parse(await readFile(FILE, 'utf8')); H.list = (Array.isArray(j.list) ? j.list : []).filter(x => x && ID_RE.test(String(x.id)) && typeof x.url === 'string' && Number(x.t) > 0).slice(0, HIST_MAX); }
    catch (e) { if (e && e.code !== 'ENOENT') log.warn('Discord : historique des decks illisible (' + (e.code || 'JSON') + '), repris à vide'); H.list = []; }
    return H.list;
  }
  function histSave() {
    const t = now(); H.list = H.list.filter(x => t - x.t < KEEP).slice(0, HIST_MAX);
    const run = H.chain.then(async () => { await mkdir(dirname(FILE), { recursive: true }); await writeFile(FILE + '.tmp', JSON.stringify({ v: 1, list: H.list })); await rename(FILE + '.tmp', FILE); });
    H.chain = run.catch(() => {});
    return run.catch(e => log.warn('Discord : historique des decks non enregistré (' + (e && e.code || e) + ')'));
  }
  /** Poste le deck (d : deck de la liste servie, tag : empreinte du compte) → url du message. */
  async function share(req, d, tag) {
    const { d: g, c } = await K.find(['decks'], [TX, NEWS]);
    if (!c) throw Object.assign(new Error('salon #decks introuvable'), { kind: 'nochan' });
    let name = ''; try { name = line(await o.deckName(d.id) || '').slice(0, 120); } catch (e) { name = ''; }
    if (name && o.bad && o.bad(name)) name = '';      // nom refusé par le filtre des decks publics : le commandant à la place
    let price = null;
    try {
      const px = await o.prices();
      if (px) { let sum = 0, got = 0, all = 0; for (const [n, q] of [...d.cmd.map(n => [n, 1]), ...d.cards]) { const v = px(n); all += q; if (v > 0) { sum += v * q; got += q; } } if (all && got >= all * 0.9) price = sum; }      // 10 % de cartes sans prix au plus : sinon omis
    } catch (e) { price = null; }
    const ln = (await K.links()).get(tag), member = ln && ln.member && /^\d{5,25}$/.test(String(ln.id)) ? String(ln.id) : '';
    const n = d.cmd.length + d.cards.reduce((a, x) => a + (Number(x[1]) || 0), 0);
    const m = await K.post(c, `/channels/${c.id}/messages`, dscDeckMsg({ title: name, cmd: d.cmd, ci: d.ci, n, price, url: o.deckUrl(req, d.id), by: d.by, member }));
    const url = `https://discord.com/channels/${g.gid}/${c.id}/${String(m && m.id || '')}`;
    (await hist()).unshift({ t: now(), id: d.id, url }); await histSave();
    log.log(`Discord : deck public partagé dans #${dscName(c.name)}${member ? ' (membre mentionné, sans ping)' : ''}${price ? '' : ', sans prix'}.`);
    return url;
  }
  return async function route(req, res) {
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
    const sf = String(req.headers['sec-fetch-site'] || '');
    if (sf && sf !== 'same-origin' && sf !== 'none') return json(res, 403, { error: 'cross_site', message: 'Action refusée : demande venue d\'une autre page.' });
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return json(res, 415, { error: 'bad_content_type', message: 'Content-Type: application/json attendu.' });
    const w = o.rateWait(req, 'dscdeck', PER_H, 3600e3); if (w) return json(res, 429, { error: 'rate_limited', message: 'Trop de partages depuis ce réseau : réessaie plus tard.', retry: w }, { 'Retry-After': String(w) });
    let b; try { b = JSON.parse((await o.readBody(req, 4096)).toString('utf8') || '{}'); } catch (e) { return e.status === 413 ? o.tooLarge(res) : json(res, 400, { error: 'bad_request', message: 'JSON invalide' }); }
    const id = b && typeof b.id === 'string' ? b.id : '';
    if (!ID_RE.test(id)) return json(res, 400, { error: 'bad_id', message: 'Deck public attendu (id).' });
    const tag = await K.acctOf(req, res); if (!tag) return;
    if (id.slice(0, 64) !== tag) return json(res, 403, { error: 'not_owner', message: 'Seul l\'auteur d\'un deck public peut le partager sur Discord.' });
    let d; try { d = await o.pubDeck(id); } catch (e) { return json(res, 503, { error: 'unavailable', message: 'Decks publics momentanément indisponibles : réessaie plus tard.' }, { 'Retry-After': '60' }); }
    if (!d) return json(res, 404, { error: 'not_public', message: 'Ce deck n\'est pas (ou plus) dans la communauté : publie-le, ou attends quelques minutes après la publication.' });
    const list = await hist(), t = now(), was = list.find(x => x.id === id && t - x.t < DAY);
    if (was) return json(res, 200, { ok: true, url: was.url, again: true });      // déjà partagé dans les 24 h : le message existant
    const mine = list.filter(x => x.id.slice(0, 64) === tag && t - x.t < DAY);
    if (PER_DAY > 0 && mine.length >= PER_DAY) { const s = Math.max(60, Math.ceil((mine[mine.length - 1].t + DAY - t) / 1000)); return json(res, 429, { error: 'daily_limit', message: `${PER_DAY} partages par jour au plus : réessaie demain.`, retry: s }, { 'Retry-After': String(s) }); }
    if (!H.busy.has(id)) H.busy.set(id, share(req, d, tag).finally(() => H.busy.delete(id)));      // deux appuis à la fois : un seul message
    try { return json(res, 200, { ok: true, url: await H.busy.get(id) }); }
    catch (e) {
      log.warn('Discord : deck public non partagé (' + e.message + ')');
      if (e.kind === 'limit') return json(res, 503, { error: 'unavailable', message: 'Discord est très demandé : réessaie dans une minute.' }, { 'Retry-After': String(e.retry || 60) });
      return json(res, 503, { error: 'unavailable', message: e.kind === 'nochan' ? 'Salon #decks introuvable sur le Discord : réessaie plus tard.' : 'Discord est injoignable pour le moment : réessaie plus tard.' }, { 'Retry-After': '60' });
    }
  };
}
