// Mana Orbit — aperçu des liens partagés (Open Graph, cartes Twitter ; aucune dépendance npm). Chargé par proxy.mjs (ogMake), testé par tests/test-og.mjs.
//   Un lien collé dans WhatsApp, Messenger, Discord, iMessage, Telegram, Slack… est lu par le robot de l'appli de messagerie, qui ne lance pas le JavaScript :
//   la page de l'appli (≈ 5 Mo) ne lui donnait que « Mana Orbit » et sa description générale. Pour ces robots seulement (User-Agent, OG_BOTS), / ?p=<id> (deck
//   ou liste d'échange partagés) et / ?pd=<id> (deck de la communauté) répondent une petite page de balises : titre (nom du deck), description (format,
//   commandant, cartes, « partagé par »), image (art du commandant ou de la carte de présentation, lue chez Scryfall), lien. Les personnes, elles, reçoivent
//   toujours la page de l'appli, inchangée (aucun coût de plus). Partage arrêté, illisible ou serveur muet : rien de servi ici, la page de l'appli suit.
//   Partage lu sur Firestore en REST, sans compte (lecture publique de shares/{id}, comme le visiteur : src/cloud.js › shareFetch), gardé TTL (5 min) ;
//   image d'une carte gardée par nom. Jamais de pseudo ou de photo hors du champ by (texte court déjà nettoyé par core.js › readShare).
import { createRequire } from 'node:module';

const REQ = createRequire(import.meta.url);
/** Robots d'aperçu de lien (messageries, réseaux, moteurs d'aperçu). iMessage se présente en facebookexternalhit + Twitterbot, Signal en WhatsApp.
 *  Jamais un nom que porte aussi le navigateur intégré d'une appli (Snapchat, KakaoTalk, Teams, Viber…) ni un moteur de recherche (même page pour lui et pour tous). */
export const OG_BOTS = /facebookexternalhit|facebot|meta-externalagent|whatsapp\/|discordbot|twitterbot|slackbot|slack-imgproxy|telegrambot|linkedinbot|pinterestbot|skypeuripreview|microsoftpreview|redditbot|embedly|iframely|vkshare|mastodon\/|cardyb|kakaotalk-scrap|line-poker|bingpreview/i;
export const ogIsBot = ua => OG_BOTS.test(String(ua || ''));
const ID_RE = /^[A-Za-z0-9]{12,40}$/, PD_RE = /^[0-9a-f]{64}_[0-9]$/;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);      // attributs entre guillemets doubles
const line = s => String(s || '').replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, ' ').replace(/\s+/g, ' ').trim();
const cut = (s, n) => { const a = [...s]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : s; };
const nf = (n, lang) => Number(n || 0).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US');
/** Langue de l'aperçu : français sauf Accept-Language qui commence par une autre langue (la plupart des robots n'en envoient pas). */
export const ogLang = al => { const a = String(al || '').trim().toLowerCase(); return !a || /^fr\b/.test(a) || a === '*' ? 'fr' : 'en'; };
const L = {
  fr: { deck: 'Deck', cmdDeck: 'Deck Commander', stdDeck: 'Deck Standard', cards: n => n + (n === '1' ? ' carte' : ' cartes'), side: n => 'réserve ' + n, by: b => 'partagé par ' + b,
    cmd: 'Commandant', cmds: 'Commandants', trade: 'Liste d\'échange', tradeOf: b => 'Liste d\'échange de ' + b, have: n => n + ' à échanger', want: n => n + ' recherchées',
    view: 'Voir le deck en lecture seule, sans compte : images, courbe de mana, valeur estimée.', viewT: 'Voir la liste en lecture seule, sans compte.', open: 'Ouvrir dans Mana Orbit', locale: 'fr_FR', sep: ' : ', community: 'Deck de la communauté' },
  en: { deck: 'Deck', cmdDeck: 'Commander deck', stdDeck: 'Standard deck', cards: n => n + (n === '1' ? ' card' : ' cards'), side: n => 'sideboard ' + n, by: b => 'shared by ' + b,
    cmd: 'Commander', cmds: 'Commanders', trade: 'Trade list', tradeOf: b => b + '\'s trade list', have: n => n + ' for trade', want: n => n + ' wanted',
    view: 'View the deck read-only, no account needed: card images, mana curve, estimated value.', viewT: 'View the list read-only, no account needed.', open: 'Open in Mana Orbit', locale: 'en_US', sep: ': ', community: 'Community deck' },
};

/**
 * Aperçu d'un partage lu (core.js › readShare) : { title, desc, card (nom anglais de la carte de l'image, ou ''), alt }.
 * core : src/core.js (deckModel, dkCount, dkFmtOf, dkCover). lang : 'fr' | 'en'.
 */
export function ogInfo(sh, core, lang) {
  const t = L[lang] || L.fr;
  if (!sh) return null;
  if (sh.kind === 'trade') {
    const n = l => new Set((l || []).map(x => x.k)).size, have = n(sh.have), want = n(sh.want);
    return { title: sh.by ? t.tradeOf(sh.by) : t.trade, desc: [have ? t.have(nf(have, lang)) : '', want ? t.want(nf(want, lang)) : '', t.viewT].filter(Boolean).join(' · '), card: '', alt: '' };
  }
  if (sh.kind !== 'deck') return null;
  const md = core.deckModel(sh.text), c = core.dkCount(sh.text), fmt = core.dkFmtOf(sh.text), cmd = md.cmdr.map(x => x.name);
  const sb = md.side.reduce((a, x) => a + x.qty, 0);
  const kind = fmt === 'commander' ? t.cmdDeck : fmt === 'standard' ? t.stdDeck : t.deck;
  const cards = t.cards(c.size ? nf(c.n, lang) + '/' + c.size : nf(c.n, lang));
  const desc = [kind, cmd.length ? (cmd.length > 1 ? t.cmds : t.cmd) + t.sep + cmd.join(' + ') : '', cards, sb ? t.side(sb) : '', sh.by ? t.by(sh.by) : ''].filter(Boolean).join(' · ');
  const card = core.dkCover(sh.text) || cmd[0] || (md.main.slice().sort((a, b) => b.qty - a.qty)[0] || {}).name || '';
  return { title: cut(line(sh.name) || kind, 120), desc: cut(desc + '. ' + t.view, 300), card, alt: card };
}

/** Petite page de balises pour un robot : { title, desc, img, url, lang, alt, big (grande image) }. */
export function ogHtml(x) {
  const t = L[x.lang] || L.fr, title = esc(cut(line(x.title), 120)), desc = esc(cut(line(x.desc), 300)), url = esc(x.url), img = x.img ? esc(x.img) : '';
  return `<!doctype html><html lang="${x.lang === 'en' ? 'en' : 'fr'}"><head><meta charset="utf-8">
<title>${title} · Mana Orbit</title>
<meta name="description" content="${desc}">
<meta name="robots" content="noindex">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#7c6cff">
<meta property="og:site_name" content="Mana Orbit">
<meta property="og:type" content="website">
<meta property="og:locale" content="${t.locale}">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
${img ? `<meta property="og:image" content="${img}">
<meta property="og:image:alt" content="${esc(line(x.alt || x.title))}">
` : ''}<meta name="twitter:card" content="${img && x.big ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
${img ? `<meta name="twitter:image" content="${img}">
` : ''}</head><body><h1>${title}</h1><p>${desc}</p><p><a href="${url}">${esc(t.open)}</a></p></body></html>`;
}

/**
 * o : { fetch, fsBase (Firestore REST, défaut googleapis), scry (API Scryfall), site (SITE_URL), icon (image par défaut), ttl (ms, 5 min), max (partages gardés, 500),
 *   pubDeck (id → { name, cmd: [noms], n, by } ou null : deck de la communauté ; absent : ?pd= non servi), now, log }.
 * Retourne { handle(req, res, url) → Promise<boolean> } : true quand la page des balises a été servie (robot, lien de partage lisible).
 */
export function ogMake(o = {}) {
  const fetchFn = o.fetch || fetch, now = o.now || Date.now, log = o.log || console, TTL = Number(o.ttl ?? 300e3), MAX = Number(o.max ?? 500);
  const FS = (o.fsBase || 'https://firestore.googleapis.com').replace(/\/+$/, ''), SCRY = (o.scry || 'https://api.scryfall.com').replace(/\/+$/, '');
  const SITE = String(o.site || 'https://manaorbit.app').replace(/\/+$/, ''), ICON = o.icon || SITE + '/icons/icon-512.png', UA = 'ManaOrbit/1.0 (+https://manaorbit.app)';
  const core = o.core || REQ('../src/core.js'), cloud = o.cloud || REQ('../src/cloud.js');
  const shares = new Map(), imgs = new Map();
  const keep = (m, k, v) => { m.delete(k); m.set(k, v); while (m.size > MAX) m.delete(m.keys().next().value); return v; };
  /** Partage lu (readShare), null s'il n'existe plus ; gardé TTL (une erreur réseau : 30 s). */
  async function share(id) {
    const c = shares.get(id); if (c && now() - c.t < c.ttl) return c.v;
    const viaFs = (u, opt) => fetchFn(String(u).replace('https://firestore.googleapis.com', FS), { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(3000), redirect: 'manual', ...(opt && opt.method ? { method: opt.method } : {}) });
    try { return keep(shares, id, { t: now(), ttl: TTL, v: await cloud.shareFetch(id, viaFs) }).v; }
    catch (e) { const gone = e && (e.code === 'gone' || e.code === 'bad' || e.code === 'denied'); keep(shares, id, { t: now(), ttl: gone ? TTL : 30e3, v: null }); if (!gone) log.warn('Aperçu de lien : partage illisible (' + (e && e.code || 'erreur') + ')'); return null; }
  }
  /** Image d'une carte (art seul, sinon la carte entière ; face avant d'une double face) ; Scryfall muet : son adresse de redirection, que les robots suivent. */
  async function cardImg(name) {
    const n = String(name || '').split('//')[0].trim(); if (!n) return '';
    const c = imgs.get(n.toLowerCase()); if (c && now() - c.t < 7 * 86400e3) return c.v;
    const fallback = SCRY + '/cards/named?exact=' + encodeURIComponent(n) + '&format=image&version=art_crop';
    try {
      const r = await fetchFn(SCRY + '/cards/named?exact=' + encodeURIComponent(n), { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(2500), redirect: 'manual' });
      if (!r.ok) return r.status === 404 ? keep(imgs, n.toLowerCase(), { t: now(), v: '' }).v : fallback;
      const j = await r.json(), u = j.image_uris || (j.card_faces && j.card_faces[0] && j.card_faces[0].image_uris) || {};
      const v = typeof (u.art_crop || u.normal) === 'string' && /^https:\/\//.test(u.art_crop || u.normal) ? u.art_crop || u.normal : fallback;
      return keep(imgs, n.toLowerCase(), { t: now(), v }).v;
    } catch (e) { return fallback; }
  }
  async function handle(req, res, url) {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !ogIsBot(req.headers['user-agent'])) return false;
    const p = url.searchParams.get('p'), pd = url.searchParams.get('pd'), lang = ogLang(req.headers['accept-language']);
    let info = null, link = '';
    if (p && ID_RE.test(p)) { info = ogInfo(await share(p), core, lang); link = SITE + '/?p=' + p; }
    else if (pd && PD_RE.test(pd) && o.pubDeck) {
      let d = null; try { d = await o.pubDeck(pd); } catch (e) { d = null; }
      if (d) {
        const t = L[lang], cmd = (d.cmd || []).map(line).filter(Boolean);
        info = { title: cut(line(d.name) || cmd.join(' + ') || t.community, 120), desc: cut([t.community, cmd.length ? (cmd.length > 1 ? t.cmds : t.cmd) + t.sep + cmd.join(' + ') : '', d.n ? t.cards(nf(d.n, lang)) : '', d.by ? t.by(line(d.by)) : ''].filter(Boolean).join(' · ') + '. ' + t.view, 300), card: cmd[0] || '', alt: cmd[0] || '' };
        link = SITE + '/?pd=' + pd;
      }
    }
    if (!info) return false;
    const img = info.card ? await cardImg(info.card) : '';
    const html = ogHtml({ ...info, lang, url: link, img: img || ICON, big: !!img });
    const body = Buffer.from(html, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'private, max-age=300', Vary: 'User-Agent, Accept-Language', 'X-Robots-Tag': 'noindex', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  }
  return { handle, share, cardImg };
}
