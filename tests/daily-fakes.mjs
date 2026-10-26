// Faux Scryfall côté serveur pour la Carte mystère (test-daily.mjs, daily-e2e.mjs par e2e-world.mjs) : impressions par langue (/cards/search « lang:pt … »,
// /cards/{set}/{num}/{lang}) et images PNG de cartes fabriquées ici (cadre 2015 schématique, 745 × 1040, encodées par daily-srv.mjs) :
// bande du titre rouge pur (le nom), illustration (dégradé teinté selon la langue), ligne de type bleu pur, zone de texte claire rayée, ligne du bas magenta pur
// (numéro, extension, artiste). Les tests vérifient qu'aucune image servie ne contient de rouge ni de magenta : ni le nom, ni la ligne du bas.
import http from 'node:http';
import { pngEncode } from '../server/daily-srv.mjs';

export const RED = [255, 0, 0], BLUE = [0, 0, 255], MAGENTA = [255, 0, 255];
const TINT = { en: [40, 160, 90], fr: [60, 90, 200], de: [200, 170, 40], es: [190, 80, 60], it: [90, 190, 190], pt: [150, 90, 190] };
/** Image (RGBA) d'une carte schématique. lang : teinte de l'illustration ; seed : motif (deux cartes diffèrent). */
export function fakeCardImg(lang = 'en', seed = 0, w = 745, h = 1040) {
  const data = new Uint8Array(w * h * 4), t = TINT[lang] || [128, 128, 128];
  const at = (x0, y0, x1, y1, fn) => { for (let y = Math.round(y0 * h); y < Math.round(y1 * h); y++) for (let x = Math.round(x0 * w); x < Math.round(x1 * w); x++) { const o = (y * w + x) * 4, c = fn(x, y); data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255; } };
  at(0, 0, 1, 1, () => [34, 30, 28]);                                                             // cadre
  at(0.055, 0.04, 0.945, 0.1, () => RED);                                                        // bande du titre : le nom de la carte
  at(0.077, 0.113, 0.923, 0.558, (x, y) => [(t[0] + x * 0.12 + seed * 17) % 200 + 20, (t[1] + y * 0.15) % 200 + 20, (t[2] + ((x >> 4) ^ (y >> 4)) * 9 + seed * 5) % 200 + 20]);      // illustration (jamais rouge, bleu ni magenta purs)
  at(0.062, 0.558, 0.938, 0.62, () => BLUE);                                                    // ligne de type
  at(0.07, 0.62, 0.93, 0.905, (x, y) => ((y >> 3) % 3 === 0 && x % 11 < 8 ? [40, 40, 40] : [236, 230, 218]));      // zone de texte (lignes de « texte »)
  at(0.06, 0.935, 0.94, 0.975, () => MAGENTA);                                                  // ligne du bas : numéro, extension, artiste
  for (const [cx, cy] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) for (let dy = 0; dy < 24; dy++) for (let dx = 0; dx < 24; dx++) { const x = Math.abs(cx - dx), y = Math.abs(cy - dy); if (dx * dx + dy * dy > 0 && Math.hypot(24 - dx, 24 - dy) > 24) data[(y * w + x) * 4 + 3] = 0; }      // coins arrondis transparents (comme Scryfall)
  return { w, h, data };
}
export const fakeCardPng = (lang, seed) => pngEncode(fakeCardImg(lang, seed), { alpha: true, level: 1 });

/** Une carte du faux catalogue : en (anglais), names { fr, de, es, it, pt } ; miss : langues absentes ; bad : champs qui la rendent injouable (frame_effects…). */
export const SERRA = { set: 'tst', num: '17', en: 'Serra Angel', names: { fr: 'Ange de Serra', de: 'Serra-Engel', es: 'Ángel de Serra', it: 'Angelo di Serra', pt: 'Anjo de Serra' }, type: 'Creature — Angel', text: 'Flying, vigilance' };
export const LANGS = ['fr', 'en', 'de', 'es', 'it', 'pt'];

/** Démarre le faux Scryfall. o : { cards, per (cartes par page de recherche), pngFail: Set('set/num/lang'), png?: (set, num, lang) => Buffer PNG }. → { url, hits, cards, pngs, stop } */
export async function startDailyScry(o = {}) {
  const S = { cards: o.cards || [SERRA], per: o.per || 175, hits: [], pngs: [], pngFail: o.pngFail || new Set(), cache: new Map() };
  const cardOf = (c, l, base) => ({
    object: 'card', id: `id-${c.set}-${c.num}-${l}`, oracle_id: 'or-' + c.set + c.num, name: c.en, ...(l !== 'en' ? { printed_name: c.names[l] } : {}), lang: l, layout: 'normal', frame: '2015', border_color: 'black', frame_effects: [], full_art: false, textless: false,
    promo: false, digital: false, oversized: false, set: c.set, set_name: 'Test Set ' + c.set.toUpperCase(), set_type: 'expansion', collector_number: c.num, type_line: c.type || 'Creature — Angel', oracle_text: c.text || '', ...(l !== 'en' ? { printed_text: c.ptext || c.text || '' } : {}),
    flavor_text: c.flavor || '', image_status: 'highres_scan', ...(c.bad || {}),
    image_uris: { small: `https://cards.scryfall.io/small/front/x/${c.set}-${c.num}-${l}.jpg`, normal: `https://cards.scryfall.io/normal/front/x/${c.set}-${c.num}-${l}.jpg`, large: `https://cards.scryfall.io/large/front/x/${c.set}-${c.num}-${l}.jpg`, png: `${base}/png/${c.set}/${c.num}/${l}.png` } });
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'), base = `http://127.0.0.1:${srv.address().port}`; S.hits.push(u.pathname + u.search);
    const send = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (u.pathname === '/cards/search') {
      const q = u.searchParams.get('q') || '', l = (/lang:([a-z]+)/.exec(q) || [])[1] || 'en', page = Number(u.searchParams.get('page') || 1);
      const all = S.cards.filter(c => !(c.miss || []).includes(l)).map(c => cardOf(c, l, base)), data = all.slice((page - 1) * S.per, page * S.per);
      if (!data.length) return send(404, { object: 'error', code: 'not_found' });
      return send(200, { object: 'list', total_cards: all.length, has_more: page * S.per < all.length, data });
    }
    let m = /^\/cards\/([^/]+)\/([^/]+)\/([a-z]+)$/.exec(u.pathname);
    if (m) { const c = S.cards.find(x => x.set === m[1] && x.num === m[2]); return c && !(c.miss || []).includes(m[3]) ? send(200, cardOf(c, m[3], base)) : send(404, { object: 'error', code: 'not_found' }); }
    m = /^\/png\/([^/]+)\/([^/]+)\/([a-z]+)\.png$/.exec(u.pathname);
    if (m) {
      const k = m.slice(1).join('/'); S.pngs.push(k);
      if (S.pngFail.has(k)) { res.writeHead(500); return res.end('boom'); }
      const i = S.cards.findIndex(x => x.set === m[1] && x.num === m[2]);
      if (!S.cache.has(k)) S.cache.set(k, o.png ? o.png(m[1], m[2], m[3]) : fakeCardPng(m[3], i));      // o.png : images fournies (visuels de la fiche, tools/store-assets.mjs)
      res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(S.cache.get(k));
    }
    send(404, { object: 'error' });
  });
  await new Promise(r => srv.listen(o.port || 0, '127.0.0.1', r));
  S.url = `http://127.0.0.1:${srv.address().port}`;
  S.stop = () => srv.close();
  return S;
}
