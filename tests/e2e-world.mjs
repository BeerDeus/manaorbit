// Monde de test commun aux e2e : faux CardTrader (derrière le vrai proxy.mjs), faux Scryfall (routes Playwright), images factices.
import './setup-env.mjs';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { routeFonts } from './fonts.mjs';
import { startDailyScry } from './daily-fakes.mjs';
export const { chromium } = createRequire(import.meta.url)('playwright-core');

const user = { id: 1, username: 'seller_a', country_code: 'FR', can_sell_via_hub: true };
const prod = (id, bp, cents, qty = 4, lang = 'fr', foil = false) => ({ id, blueprint_id: bp, quantity: qty, graded: false, on_vacation: false, bundle_size: 1, price: { cents, currency: 'EUR' },
  properties_hash: { condition: 'Near Mint', mtg_language: lang, mtg_foil: foil }, expansion: { code: 'cmm', name_en: 'Commander Masters' }, user });
// nom, bp, coût converti, type, coût de mana, prix FR (cts, null = aucune offre), couleurs, prix de référence Cardmarket (texte Scryfall), nom français imprimé
export const CARDS = [
  ['Sol Ring', 100, 1, 'Artifact', '{1}', 150, [], '1.50', 'Anneau solaire'], ['Swords to Plowshares', 101, 1, 'Instant', '{W}', 200, ['W'], '1.90', 'Épées aux charrues'],
  ['Arcane Signet', 102, 2, 'Artifact', '{2}', 50, [], '0.40', 'Sceau arcanique'], ['Wrath of God', 103, 4, 'Sorcery', '{2}{W}{W}', 300, ['W'], '1.50', 'Colère de Dieu'],
  ['Craterhoof Behemoth', 104, 8, 'Creature — Beast', '{5}{G}{G}{G}', 900, ['G'], '9.00', 'Béhémoth Cratérosabot'], ['Command Tower', 105, 0, 'Land', '', 30, [], '0.25', 'Tour de commandement'],
  ['Llanowar Elves', 106, 1, 'Creature — Elf Druid', '{G}', 20, ['G'], '0.20', 'Elfes de Llanowar'], ["Ranger's Hawk", 107, 1, 'Creature — Bird', '{W}', null, ['W'], '0.05', 'Faucon du rôdeur'],
  ['Edgar Markov', 108, 6, 'Legendary Creature — Vampire Knight', '{3}{R}{W}{B}', 500, ['R', 'W', 'B'], '5.00', 'Edgar Markov'],
];
export const slug = n => n.toLowerCase().replace(/[^a-z]+/g, '-');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="672" height="936"><rect width="672" height="936" fill="#456"/></svg>';
/** Extensions des impressions simulées (« Illustrations » : numéros 100, 101…) et prix Cardmarket de l'impression anglaise n° 100 + i (chaîne Scryfall, euros). */
const ED_SETS = [['cmm', 'Commander Masters'], ['2x2', 'Double Masters 2022'], ['lea', 'Limited Edition Alpha'], ['m21', 'Core Set 2021'], ['neo', 'Kamigawa: Neon Dynasty']];
const edEur = i => (1 + i * 2.5).toFixed(2);
const namesIn = q => [...String(q).matchAll(/!"(.+?)"/g)].map(m => m[1]);
const front = n => String(n).split('//')[0].trim().toLowerCase();

/** Démarre le faux CardTrader et le vrai proxy. opts : { port, env, bigCatalog, daily } ; daily : Carte mystère allumée, avec un faux Scryfall côté serveur
 *  (daily-fakes.mjs : impressions par langue, cartes PNG fabriquées ; daily = { cards, per, pngFail } ou true), world.dly : ce faux Scryfall (hits, pngs). */
export async function startWorld({ port = 18900, env = {}, bigCatalog = 0, daily = null } = {}) {
  const prices = {}; CARDS.forEach(([, bp, , , , c]) => { if (c != null) prices[bp] = c; });
  const log = [];
  const prints = {}; CARDS.forEach(([n, , cmc, tl, mc, , colors, eur], i) => { prints[n] = [{ id: 's-' + slug(n), set: 'cmm', set_name: 'Commander Masters', collector_number: String(400 + i), name: n, cmc, type_line: tl, mana_cost: mc, colors, prices: { eur }, color_identity: colors, legalities: { commander: 'legal' },
    image_uris: { small: `https://cards.scryfall.io/small/front/a/b/${slug(n)}.jpg` } }]; });
  const bps = CARDS.map(([n, bp]) => ({ id: bp, name: n, scryfall_id: 's-' + slug(n) }));
  // eds['cmm|400'] = { n: 'Sol Ring', langs: ['fr'] } : impression connue par son extension et son numéro (/cards/collection), avec ses langues (recherche « (set:cmm cn:400 or …) lang:fr ») ; edLangQ : ces recherches
  const world = { hidden: {}, eds: {}, edLangQ: [], edPrice: {}, solo: {}, carted: [], port, log, prices, prints, scry: [], delay: 0, extra: {}, big: bigCatalog, noFr: new Set(), variants: {}, psets: {}, symbols: {}, svgs: [], basics: false, en: {}, offers: {}, frPage: 0, frNew: new Set(), frFail: false, frFill: 600, frHits: [] };
  const up = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'), path = u.pathname.replace('/api/v2/', ''); log.push({ path, q: Object.fromEntries(u.searchParams) });
    const send = (o, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (path === 'info') return send({ id: 1, name: 'test' });
    if (path === 'expansions') return send([{ id: 1, game_id: 1, code: 'cmm', name: 'Commander Masters' }]);
    if (path === 'blueprints/export') return send(bps);
    if (path === 'marketplace/products') {
      // offres normales : françaises (prices), anglaises (world.en) ; world.offers[bp] = [{ lang, foil, cents, qty }] : foil, autres langues ; filtre foil suivi (true : foil seulement, false : sans foil)
      const bp = Number(u.searchParams.get('blueprint_id')), lang = u.searchParams.get('language'), foil = u.searchParams.get('foil'), fin = f => (foil === 'true' ? f : foil === 'false' ? !f : true);
      const base = !fin(false) ? [] : lang === 'fr' && prices[bp] != null ? [prod(9000 + bp, bp, prices[bp])] : lang === 'en' && world.en[bp] != null ? [prod(9500 + bp, bp, world.en[bp], 4, 'en')] : [];
      const more = (world.offers[bp] || []).map((o, i) => [o, i]).filter(([o]) => (!lang || o.lang === lang) && fin(!!o.foil)).map(([o, i]) => prod(9700 + bp * 10 + i, bp, o.cents, o.qty || 4, o.lang, !!o.foil));
      const go = () => send({ [bp]: [...base, ...more] });
      return world.delay ? setTimeout(go, world.delay) : go();
    }
    if (path === 'cart/add') { let b = ''; req.on('data', d => { b += d; }); req.on('end', () => { try { world.carted.push(JSON.parse(b || '{}')); } catch { /* ignore */ } send({ ok: true }); }); return; }
    if (path === 'cart') return send({ subtotal: { cents: 350, currency: 'EUR' }, ct_zero_fee_amount: { cents: 25, currency: 'EUR' }, shipping_cost: { cents: 0, currency: 'EUR' }, subcarts: [] });
    send({ error: 'nope' }, 404);
  });
  await new Promise(r => up.listen(0, '127.0.0.1', r));
  // faux EDHREC / Archidekt pour l'import de liens (menu « Partager »)
  const imp = http.createServer((req, res) => {
    const send = (o, st = 200) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/archidekt/api/decks/123/') return send({ name: 'Edgar partagé', cards: [{ quantity: 1, categories: ['Commander'], card: { oracleCard: { name: 'Edgar Markov' } } }, { quantity: 1, categories: [], card: { oracleCard: { name: 'Sol Ring' } } }, { quantity: 1, categories: [], card: { oracleCard: { name: 'Arcane Signet' } } }, { quantity: 1, categories: [], card: { oracleCard: { name: 'Command Tower' } } }] });
    send({ error: 'nf' }, 404);
  });
  await new Promise(r => imp.listen(0, '127.0.0.1', r));
  const dly = daily ? await startDailyScry(daily === true ? {} : daily) : null;
  const dlyEnv = dly ? { DAILY: '1', SCRYFALL_UPSTREAM: dly.url, DAILY_FIRST_MS: '0', DAILY_GAP_MS: '0' } : {};
  const proxy = spawn('node', ['server/proxy.mjs'], { env: { ...process.env, ...dlyEnv, EDH_SOURCE_URL: '', PORT: String(port), CARDTRADER_TOKEN: 'tok', CT_UPSTREAM: `http://127.0.0.1:${up.address().port}/api/v2`, IMPORT_UPSTREAM: `http://127.0.0.1:${imp.address().port}`, APK_LATEST: '0', ...env }, stdio: 'ignore' });
  process.on('exit', () => { try { proxy.kill(); } catch {} });
  await new Promise(r => setTimeout(r, 800));
  world.url = `http://127.0.0.1:${port}/`;
  world.reqs = bp => log.filter(l => l.path === 'marketplace/products' && (bp == null || Number(l.q.blueprint_id) === bp)).length;
  world.setPrice = (bp, cents) => { prices[bp] = cents; };
  world.dly = dly;
  world.stop = () => { try { proxy.kill(); } catch {} up.close(); imp.close(); if (dly) dly.stop(); };
  world.catalog = () => {
    const names = CARDS.map(c => c[0]);
    if (world.big) { const A = ['Aer', 'Bol', 'Cra', 'Dre', 'Eld', 'Fyr', 'Gor', 'Hal', 'Ith', 'Jun', 'Kor', 'Lum', 'Mor', 'Nex', 'Ori', 'Pyr', 'Qua', 'Rav', 'Sol', 'Tir', 'Umb', 'Vex', 'Wyr', 'Xan', 'Yav', 'Zul']; for (let i = 0; i < world.big; i++) names.push(`${A[i % 26]}${A[(i * 7 + 3) % 26].toLowerCase()}${i % 91} of ${A[(i * 11) % 26]}${A[(i * 5 + 1) % 26].toLowerCase()}`); }
    return names;
  };
  return world;
}

/** Nouvelle page mobile branchée sur le monde (Scryfall simulé). opts : { sw: true pour laisser le service worker, perms, ctx, pop: true pour laisser les bannières de nouveau badge (progress.js) } */
export async function newPage(browser, world, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: opts.sw ? 'allow' : 'block', permissions: opts.perms || [], ...(opts.ctx || {}) });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.route('https://api.scryfall.com/**', route => {
    const req = route.request(), u = new URL(req.url()); world.scry.push(req.method() + ' ' + u.pathname + u.search); const h = { 'access-control-allow-origin': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' } });
    const json = (o, status = 200) => route.fulfill({ status, headers: h, json: o });
    if (u.pathname === '/cards/search' && /\((?:set|cn):/.test(u.searchParams.get('q') || '') && namesIn(u.searchParams.get('q')).length) {      // (avec un nom : les images d'éditions du classeur, sans nom, sont plus bas) impressions cherchées par code d'extension ou numéro (data.js › scryPrintsFind) : world.hidden[nom] = [[set, n°, langue Scryfall facultative : impression de cette seule langue]] absentes de la liste complète
      const q = u.searchParams.get('q'), l = (/lang:([a-z]+)/.exec(q) || [])[1] || 'en', nm = namesIn(q)[0], sets = [...q.matchAll(/set:([a-z0-9]+)/g)].map(m => m[1]), nums = [...q.matchAll(/cn:([^\s)]+)/g)].map(m => m[1]);
      world.findQ = [...(world.findQ || []), q];
      const data = (world.hidden[nm] || []).filter(([s, n, hl]) => (!sets.length || sets.includes(s)) && (!nums.length || nums.includes(n)) && (!hl || hl === l || l === 'any')).map(([s, n, hl]) => ({ name: nm, lang: hl || (l === 'any' ? 'en' : l), set: s, set_name: s.toUpperCase() + ' Set', collector_number: n, released_at: '2022-02-18', full_art: true, border_color: 'black', frame_effects: [], promo: false, rarity: 'common', prices: { eur: l === 'en' ? '2.00' : null, eur_foil: null }, image_uris: { small: `https://cards.scryfall.io/small/front/${l}/${s}-${n}.jpg`, normal: `https://cards.scryfall.io/normal/front/${l}/${s}-${n}.jpg` } }));
      return data.length ? json({ object: 'list', has_more: false, data }) : json({ object: 'error', code: 'not_found' }, 404);
    }
    if (u.pathname === '/cards/search' && /\bcn:/.test(u.searchParams.get('q') || '')) {      // images d'impressions précises dans une langue (classeur) : celles de world.eds qui existent dans cette langue
      const q = u.searchParams.get('q'), l = (/lang:([a-z]+)/.exec(q) || [])[1] || 'en'; world.edLangQ.push(q);
      const data = [...q.matchAll(/set:([a-z0-9]+) cn:"?([^\s")]+)"?/g)].map(m => [m[1], m[2], world.eds[m[1] + '|' + m[2]]]).filter(([, , x]) => x && (x.langs || []).includes(l))
        .map(([set, num, x]) => ({ name: x.n, lang: l, set, collector_number: num, image_uris: { small: `https://cards.scryfall.io/small/front/${l}/ed-${set}-${num}.jpg` } }));
      return data.length ? json({ object: 'list', has_more: false, data }) : json({ object: 'error', code: 'not_found' }, 404);
    }
    if (u.pathname === '/cards/search' && u.searchParams.get('unique') === 'prints' && u.searchParams.get('dir') === 'desc' && /lang:[a-z]+/.test(u.searchParams.get('q'))) {      // impressions d'une carte dans une langue : « !"Nom" lang:fr game:paper » (world.variants[nom] = { fr, en } nombre d'impressions)
      const q = u.searchParams.get('q'), l = (/lang:([a-z]+)/.exec(q) || [])[1] || 'en', nm = namesIn(q)[0], c = CARDS.find(x => nm && front(x[0]) === front(nm));
      world.printsReq = (world.printsReq || 0) + 1;
      const ps = c && world.psets[c[0]];      // world.psets[nom] = ['dsk', 'blb', …] : une impression par extension (n° 200, 201…), dans toutes les langues ; 'p…' : promo
      if (ps) return json({ object: 'list', has_more: false, data: ps.map((s, i) => ({ name: c[0], lang: l, set: s, set_name: s.toUpperCase() + ' Set', collector_number: String(200 + i), released_at: (2024 - i) + '-01-01', full_art: false, border_color: 'black', frame_effects: [], promo: s[0] === 'p', rarity: 'common', prices: { eur: l === 'en' ? '0.' + (10 + i) : null, eur_foil: null }, image_uris: { small: `https://cards.scryfall.io/small/front/${l}/${slug(c[0])}-${s}.jpg`, large: `https://cards.scryfall.io/large/front/${l}/${slug(c[0])}-${s}.jpg` } })) });
      const n = c && !(l === 'fr' && world.noFr.has(c[0])) ? ((world.variants[c[0]] || { fr: 3, en: 4 })[l] ?? 0) : 0;
      if (!n) return json({ object: 'error', code: 'not_found' }, 404);
      const sets = ED_SETS;
      return json({ object: 'list', has_more: false, data: Array.from({ length: n }, (_, i) => ({ name: c[0], lang: l, set: sets[i % 5][0], set_name: sets[i % 5][1], collector_number: String(100 + i), released_at: (2023 - i) + '-01-01', full_art: i === 1, border_color: i === 2 ? 'borderless' : 'black', frame_effects: i === 0 ? ['extendedart'] : [], promo: false, rarity: 'rare', prices: { eur: l === 'en' ? edEur(i) : null, eur_foil: null }, image_uris: { small: `https://cards.scryfall.io/small/front/${l}/${slug(c[0])}-v${i}.jpg`, large: `https://cards.scryfall.io/large/front/${l}/${slug(c[0])}-v${i}.jpg` } })) });
    }
    if (u.pathname === '/cards/search' && /paperprints=1/.test(u.searchParams.get('q'))) {      // cartes imprimées une seule fois : celles de world.solo (nom → numéro dans NEO), aucune par défaut
      world.soloReq = (world.soloReq || 0) + 1;
      const data = namesIn(u.searchParams.get('q')).filter(n => world.solo[n]).map(n => ({ name: n, set: 'neo', set_name: 'Kamigawa: Neon Dynasty', collector_number: String(world.solo[n]), rarity: 'common', prices: { eur: '0.30', eur_foil: null }, image_uris: { small: `https://cards.scryfall.io/small/front/en/solo-${slug(n)}.jpg` } }));
      return data.length ? json({ object: 'list', has_more: false, data }) : json({ object: 'error', code: 'not_found' }, 404);
    }
    if (u.pathname === '/cards/search') {
      const q = u.searchParams.get('q'), lang = /lang:fr/.test(q);
      if (lang) {
        const frImg = c => ({ small: `https://cards.scryfall.io/small/front/fr/${slug(c[0])}.jpg` }), nm = namesIn(q);
        if (nm.length) {      // lot de noms exacts : « (!"A" or !"B") lang:fr » → les cartes qui existent en français
          const data = CARDS.filter(c => nm.some(n => front(n) === front(c[0])) && !world.noFr.has(c[0])).map(c => ({ name: c[0], printed_name: c[8], lang: 'fr', image_uris: frImg(c) }));
          return data.length ? json({ object: 'list', has_more: false, data }) : json({ object: 'error', code: 'not_found' }, 404);
        }
        if (!/name:/.test(q)) {      // catalogue des noms français : « lang:fr » paginé (frPage cartes par page), ou « lang:fr date>=… » = nouveautés
          const page = Number(u.searchParams.get('page') || 1), size = world.frPage || 175; world.frHits.push(page);
          if (world.frFail === true || (typeof world.frFail === 'number' && page > world.frFail)) return json({ object: 'error', code: 'bad_request' }, 500);      // true : toujours ; n : échoue après la page n
          const isNew = /date>=/.test(q), fill = isNew ? [] : Array.from({ length: world.frFill }, (_, i) => { const a = []; a[0] = 'Vrombl Card ' + i; a[8] = 'Vrombl ' + String(i).padStart(4, '0') + ' Quarnax'; return a; });      // remplissage : le catalogue réel compte des dizaines de milliers de noms (≥ 500 exigés)
          let all = CARDS.filter(c => !world.noFr.has(c[0]) && c[8]).concat(fill).sort((a, b) => a[8].localeCompare(b[8], 'fr')); if (isNew) all = all.filter(c => world.frNew.has(c[0]));
          if (!all.length) return json({ object: 'error', code: 'not_found' }, 404);
          const more = page * size < all.length;
          return json({ object: 'list', total_cards: all.length, has_more: more, ...(more ? { next_page: `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=cards&order=name&page=${page + 1}` } : {}), data: all.slice((page - 1) * size, page * size).map(c => ({ name: c[0], printed_name: c[8], lang: 'fr', image_uris: frImg(c) })) });
        }
        const words = [...q.matchAll(/name:(\S+)/g)].map(m => m[1].toLowerCase());
        const data = CARDS.filter(c => words.every(w => c[8].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(w.normalize('NFD').replace(/[̀-ͯ]/g, '')))).map(c => ({ name: c[0], printed_name: c[8], lang: 'fr', image_uris: frImg(c) }));
        return data.length ? json({ object: 'list', has_more: false, data }) : json({ object: 'error', code: 'not_found' }, 404);
      }
      if (/lang:[a-z]+/.test(q)) return json({ object: 'error', code: 'not_found' }, 404);      // autres langues : aucune impression dans ce faux Scryfall
      const data = namesIn(q).flatMap(n => world.prints[n] || []);
      return data.length ? json({ object: 'list', has_more: false, data }) : json({ object: 'error', code: 'not_found' }, 404);
    }
    if (u.pathname === '/cards/collection' && req.method() === 'POST') {
      const ids = (JSON.parse(req.postData() || '{}').identifiers || []), data = [], nf = [];
      for (const i of ids) {
        const ex = i.set && world.eds[i.set + '|' + i.collector_number];
        if (ex) { data.push({ name: ex.n, set: i.set, set_name: i.set.toUpperCase() + ' Set', collector_number: i.collector_number, rarity: 'rare', prices: { eur: '2.00', eur_foil: '6.00' }, image_uris: { small: `https://cards.scryfall.io/small/front/en/ed-${i.set}-${i.collector_number}.jpg` } }); continue; }      // world.eds
        if (i.set) {      // édition précise (code + numéro) : impressions des « Illustrations » (numéros 100, 101…), prix edEur, sinon inconnue
          const n = Number(i.collector_number) - 100, ok = n >= 0 && n < 5 && ED_SETS[n][0] === i.set;
          if (ok) data.push({ set: i.set, set_name: ED_SETS[n][1], collector_number: i.collector_number, rarity: 'rare', prices: { eur: world.edPrice[i.set + '|' + i.collector_number] ?? edEur(n), eur_foil: null }, image_uris: { small: `https://cards.scryfall.io/small/front/en/ed-${i.set}-${i.collector_number}.jpg` } }); else nf.push(i);
          continue;
        }
        const hit = Object.entries(world.prints).find(([n]) => front(n) === front(i.name));
        if (hit) data.push(hit[1][0]);
        else if (world.basics && /^(snow-covered )?(plains|island|swamp|mountain|forest|wastes)$/i.test(i.name)) data.push({ id: 's-' + slug(i.name), set: 'cmm', set_name: 'Commander Masters', collector_number: '900', name: i.name, cmc: 0, type_line: 'Basic Land', mana_cost: '', colors: [], color_identity: [], prices: { eur: null }, image_uris: { small: `https://cards.scryfall.io/small/front/b/${slug(i.name)}.jpg` } });      // terrains de base : seulement si le test les demande (world.basics)
        else nf.push(i);
      }
      return json({ object: 'list', not_found: nf, data });
    }
    if (u.pathname === '/catalog/card-names') return json({ object: 'catalog', data: world.catalog() });
    if (u.pathname === '/cards/named') return u.searchParams.get('format') === 'image' ? route.fulfill({ status: 200, headers: h, contentType: 'image/svg+xml', body: SVG }) : json({ object: 'error', code: 'not_found' }, 404);
    const m = /^\/cards\/([^/]+)\/([^/]+)(?:\/([a-z]+))?$/.exec(u.pathname);
    if (m) {      // world.setnum['dsk/202'] = { name, printed: { fr: 'Anneau solaire' } } : impression par extension et numéro (scan : nom illisible)
      const lang = m[3] || 'en', sn = (world.setnum || {})[m[1] + '/' + m[2]];
      if (sn && lang !== 'en' && !(sn.printed || {})[lang]) return json({ object: 'error' }, 404);
      return json({ object: 'card', lang, set: m[1], collector_number: m[2], ...(sn ? { name: sn.name, ...(lang !== 'en' ? { printed_name: sn.printed[lang] } : {}) } : {}), image_uris: { large: `https://cards.scryfall.io/large/front/${m[1]}/${m[2]}-${lang}.jpg`, small: `https://cards.scryfall.io/small/front/${m[1]}/${m[2]}-${lang}.jpg` } });
    }
    return json({ object: 'error' }, 404);
  });
  await p.route('https://svgs.scryfall.io/**', route => {      // symboles des extensions : world.symbols[code] (SVG) s'il existe, sinon un simple rond ; world.svgs : chaque demande (code, type : image, fetch…)
    const f = (/\/sets\/([^/]+)\.svg$/.exec(new URL(route.request().url()).pathname) || [])[1] || ''; world.svgs.push({ f, type: route.request().resourceType() });
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'image/svg+xml', body: world.symbols[f] || '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>' });
  });
  await p.route('https://cards.scryfall.io/**', route => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'image/svg+xml', body: SVG }));
  await routeFonts(p);
  if (!opts.pop) await p.addInitScript(() => { window.MO_NOPOP = true; });      // bannières de badge : elles couvrent le haut de l'écran 4,5 s (progress-e2e les teste)
  // Scan gardé sur l'appareil (scansess.js), testé par scansess-e2e ({ scanSess: true }) ; ailleurs, comme avant lui : chaque ouverture du scan repart à vide
  // (session effacée, scan déjà ouvert fermé sans reprise) et « Ajouter » sans rangement ne demande rien (« Ne plus me demander » déjà répondu).
  if (!opts.scanSess) await p.addInitScript(() => {
    try { localStorage.setItem('deckdeal:scdquiet', '1'); } catch (e) { /* stockage refusé */ }
    addEventListener('DOMContentLoaded', () => {
      const o0 = window.openScan; if (typeof o0 !== 'function') return;
      window.openScan = o => { if (SC.el) SC.el.__close('done'); try { Object.keys(localStorage).filter(k => k.startsWith('deckdeal:scansess:')).forEach(k => localStorage.removeItem(k)); } catch (e) { /* ignore */ } return o0(o); };
    });
  });
  // vue de la liste de la collection (densite.js) : la vue détaillée (− / +, édition, pastilles) que vérifient les tests ; densite-e2e.mjs : cview false (vue par défaut, compacte) ou une autre vue
  if (opts.cview !== false) await p.addInitScript(v => { try { if (!localStorage.getItem('deckdeal:coll:view')) localStorage.setItem('deckdeal:coll:view', v); } catch (e) { /* stockage indisponible */ } }, opts.cview || 'detail');
  if (opts.init) await p.addInitScript(opts.init);
  if (opts.goto !== false) { await p.goto(world.url + (opts.path || '')); await p.waitForTimeout(700); await p.evaluate(() => { BACKOFF.scry = [60, 60, 60]; BACKOFF.cool429 = 100; }); }
  return { ctx, p, errs };
}
export const done = p => p.waitForFunction(() => /terminée/.test(document.querySelector('#progTitle').textContent), null, { timeout: 40000 });
export const txt = (p, sel) => p.$eval(sel, e => e.innerText.replace(/\s+/g, ' ').trim());
export const ok = m => console.log('✓', m);
/** Cadrage « Nom seulement » imposé à chaque chargement (tests écrits pour la bande du nom : images de la caméra simulée = une bande ; le cadrage
 *  « carte entière », réglage par défaut depuis le 15 octobre 2026, a ses propres tests : scaned-e2e, scanfoot-e2e). */
export const bandOnly = ctx => ctx.addInitScript(() => { try { const k = 'deckdeal:scanset', j = JSON.parse(localStorage.getItem(k) || 'null') || { s: {}, u: 0 }; j.s = { ...(j.s || {}), frame: 'name' }; localStorage.setItem(k, JSON.stringify(j)); } catch (e) { /* stockage refusé */ } });
/** Accueil → écran « Nouveau panier » (saisie), ou retour à l'accueil. */
export const toInput = p => p.evaluate(() => { if (S.view !== 'input') showView('input'); });
export const toHome = p => p.evaluate(() => { if (S.view !== 'home') showView('home'); });
/** Compte connecté factice, adresse vérifiée (les decks EDHREC de la collection sont réservés aux comptes, voir gate-e2e) : faux cloud en mémoire
 *  (decks, collection, documents annexes, partages ; decks de l'appareil déjà dedans), puis onUser. À rappeler après chaque rechargement. user : champs à remplacer (emailVerified, providerData…). */
export async function signInFake(p, user = {}, o = {}) {
  if (!o.early) await p.waitForFunction(() => D.authReady, null, { timeout: 15000 });      // o.early : session restaurée pendant que le SDK se charge encore (lien ouvert avant que le compte soit connu)
  await p.evaluate(([u, o]) => {
    const decks = new Map(), meta = {}, subs = new Set(); let coll = null, n = 0;
    const docs = () => [...decks].map(([id, data]) => ({ id, data })).sort((a, b) => (b.data.updatedAt || 0) - (a.data.updatedAt || 0));
    const emit = () => queueMicrotask(() => subs.forEach(cb => cb(docs(), false))), copy = o => JSON.parse(JSON.stringify(o));      // comme Firestore : l'écriture locale est vue tout de suite (avant la réponse du serveur)
    D.cloud = {
      onUser() {}, signOut: async () => { onUser(null); }, verify: async () => {}, reload: async () => {},
      watch(uid, cb) { subs.add(cb); setTimeout(() => cb(docs(), false), 0); return () => subs.delete(cb); },
      newId: () => 'fk' + (++n), save: async (uid, id, data) => { decks.set(id, copy(data)); emit(); }, remove: async (uid, id) => { decks.delete(id); emit(); },
      saveMany: async (uid, items) => { items.forEach(x => decks.set(x.id, copy(x.data))); emit(); },
      watchColl(uid, cb) { setTimeout(() => cb(coll, false, false), 0); return () => {}; }, txColl: async (uid, fn) => { const out = fn(coll); if (out) coll = copy(out); return out; },
      pullColl: async () => ({ data: coll }), saveColl: async (uid, d) => { coll = copy(d); },
      watchMeta(uid, id, cb) { setTimeout(() => cb(meta[id] || null, false, false), 0); return () => {}; }, saveMeta: async (uid, id, d) => { meta[id] = copy(d); }, pullMeta: async (uid, id) => ({ data: meta[id] || null }),
      shareId: () => 'Fake' + Date.now().toString(36) + (++n), saveShare: async () => {}, dropShare: async () => {},
      // decks publics (pubdecks.js) : window.__pubs (id → document), window.__reps (signalements « deck~empreinte », un seul par compte comme les règles)
      pubMine: async tag => [...(window.__pubs || (window.__pubs = new Map()))].filter(([, x]) => x.o === tag).map(([id, data]) => ({ id, data: copy(data) })),
      pubSave: async (id, data) => { (window.__pubs || (window.__pubs = new Map())).set(id, copy(data)); (window.__pubLog || (window.__pubLog = [])).push('save:' + id); },
      pubDrop: async id => { if (window.__pubs) window.__pubs.delete(id); (window.__pubLog || (window.__pubLog = [])).push('drop:' + id); },
      pubReport: async (id, tag) => { const r = window.__reps || (window.__reps = []), k = id + '~' + tag; if (r.includes(k)) throw Object.assign(new Error('refusé'), { code: 'permission-denied' }); r.push(k); },
    };
    for (const d of D.localList) decks.set(d.id, copy(stripDeck(d)));      // le compte a déjà les decks de cet appareil : rien ne disparaît de « Mes decks » à la connexion
    D.state = 'ready'; D.err = '';
    // identifiant neuf à chaque appel : cet appareil n'a encore rien « vu » de ce compte (sinon un compte vide passerait pour supprimé ailleurs) ;
    // sa collection passe pour jamais synchronisée (COLL.s vide), sinon elle serait mise de côté comme celle d'un autre compte (collAside) ; o.owner : garder son compte
    if (!o.owner && typeof COLL !== 'undefined') COLL.s = '';
    onUser({ uid: 'u-test-' + Math.random().toString(36).slice(2, 8), email: 'test@example.com', displayName: 'Test', emailVerified: true, providerData: [{ providerId: 'password' }], reload: async () => {}, getIdToken: async () => window.__idTok || '', ...u });      // __idTok : jeton signé par le test (amis-e2e : le serveur le vérifie)
  }, [user, o]);
}
/** Fiche « Compte et réglages » (bouton du compte de l'en-tête, me.js) ; sub : rubrique ouverte par-dessus (prix, donnees, conf, app, aide, scan, widget,
 *  compte : la feuille Compte — connexion, ou gestion du compte connecté —, pub). Rubrique ouverte : attend sa fiche (une de plus, ouverte). */
export async function openMe(p, sub) {
  if (!(await p.$('.me-sheet.open'))) { await p.click('#btnAccount'); await p.waitForSelector('.me-sheet.open'); }      // une fiche qui se ferme encore (sans .open) ne compte pas
  if (!sub) return;
  const n = await p.evaluate(() => sheets.length);
  await p.click(`.me-sheet [data-me="${sub}"]`);
  await p.waitForFunction(n => sheets.length > n && document.querySelectorAll('.sheet-wrap.open').length > n, n, { timeout: 5000 });
}
/** Ferme toutes les fiches ouvertes (rubrique, puis « Compte et réglages »). */
export const closeSheets = p => p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); }).then(() => p.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 5000 }));
/** ← du scan ; cartes pas encore ajoutées (scansess.js : « Quitter le scan ? ») : « Tout effacer et quitter », comme avant la sauvegarde du scan (scan suivant vierge). */
export async function scanClose(p) {
  await p.click('.scan [data-act="close"]');
  await p.waitForFunction(() => !SC.el || document.querySelector('.sss-sheet'), null, { timeout: 3000 });
  if (await p.$('.sss-sheet')) { await p.click('.sss-sheet [data-ss="del"]'); await p.waitForFunction(() => !SC.el, null, { timeout: 3000 }); await p.evaluate(() => document.getElementById('toast').classList.remove('on')); }
}
/** « Ajouter » du récap du scan ; cartes sans édition (scaned.js), sans rangement (places.js › scdAsk) : « Ajouter quand même ». */
export async function rcGo(p) {
  await p.click('.rc-sheet [data-rc="go"]');
  await p.waitForFunction(() => !document.querySelector('.rc-sheet') || document.querySelector('.rc-sheet [data-rc="force"], .rc-sheet [data-rc="pforce"]') || !sheets.some(s => s.wrap.classList.contains('rc-sheet')), null, { timeout: 5000 });
  if (await p.$('.rc-sheet [data-rc="force"]')) await p.click('.rc-sheet [data-rc="force"]');
  await p.waitForFunction(() => !sheets.some(s => s.wrap.classList.contains('rc-sheet')) || document.querySelector('.rc-sheet [data-rc="pforce"]'), null, { timeout: 5000 });
  if (await p.$('.rc-sheet [data-rc="pforce"]')) await p.click('.rc-sheet [data-rc="pforce"]');      // sans rangement (scansess.js) : « Ajouter quand même »
}
