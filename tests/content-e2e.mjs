// E2E contenus (sets.js, setview.js, help.js) : « Prochaines extensions » de l'accueil (faux Scryfall /sets : tri, éditions numériques et hors sujet écartées,
// produits rattachés à leur parent, cache 24 h relu au 2e lancement, carte cachée en erreur ou hors ligne) ; page d'une extension (faux /cards/search :
// grille, noms et images dans la langue des cartes, recherche, rareté, versions spéciales, tri, pastilles, étoiles de la liste de souhaits, carte en grand,
// extension sans carte révélée, copie gardée) ; Réglages › Aide et avis (feuille d'aide, lien d'avis mailto encodé, « Rejoindre le Discord ») ; avis par le Discord
// (/__ping feedback et api/feedback simulés : feuille, requis, captures réduites, 3 au plus, corps du contrat, erreurs, « Merci ! », brouillon, 404 et absent → mailto, anglais) ; demande de note neutre (coupée tant que RATE_ASK est faux, appli Android seulement, bons moments, fréquence, session sans erreur).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chromium, startWorld, newPage, txt, ok, toHome, rcGo, openMe, closeSheets, signInFake } from './e2e-world.mjs';

const world = await startWorld({ port: 18990 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const DAY = 86400000, PLAY = 'https://play.google.com/store/apps/details?id=app.manaorbit';
const errsAll = [];
const iso = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const set = (code, name, days, type, o = {}) => ({ object: 'set', code, name, released_at: iso(days), set_type: type, digital: false, card_count: 100,
  icon_svg_uri: `https://svgs.scryfall.io/sets/${code}.svg?1700000000`, scryfall_uri: `https://scryfall.com/sets/${code}`, ...o });
// Scryfall /sets simulé (ordre de Scryfall : du plus récent au plus ancien, peu importe) : 4 lignes attendues
const SETS = [
  set('old', 'Old Expansion', -40, 'expansion'), set('rc2', 'Older Recent Core', -10, 'core'), set('rec', 'Recent Expansion', -5, 'expansion'),
  set('dig', 'Alchemy Digital', 3, 'alchemy', { digital: true }), set('dg2', 'Digital Only Expansion', 2, 'expansion', { digital: true }),
  set('tok', 'Alpha Tokens', 12, 'token', { parent_set_code: 'aaa' }), set('pro', 'Promo Pack', 2, 'promo'),
  set('aaa', 'Alpha Future', 12, 'expansion'), set('aac', 'Alpha Future Commander', 12, 'commander', { parent_set_code: 'aaa' }),
  set('bbb', 'Beta Masters', 1, 'masters'), set('xss', '<img src=x onerror="window.__xss=1">', 150, 'expansion', { icon_svg_uri: 'javascript:alert(1)', scryfall_uri: 'https://evil.example/sets/xss' }),
  set('ccc', 'Gamma Core', 200, 'core'), set('ddd', 'Delta Draft', 400, 'draft_innovation'),
];
/** Page branchée sur un /sets simulé : mode 'ok' (liste), 'err' (500), sinon le faux Scryfall commun (404). Compteur de requêtes /sets dans hits.
 *  o.routes(p) : routes de plus, posées avant le chargement (avis par le Discord : /__ping, api/feedback). */
async function page(o = {}) {
  const pg = await newPage(browser, world, { goto: false, ...(o.ctx ? { ctx: o.ctx } : {}), init: o.init });
  const hits = { n: 0 };
  await pg.p.route('https://api.scryfall.com/sets', route => { hits.n++; const h = { 'access-control-allow-origin': '*' };
    return o.sets === 'err' ? route.fulfill({ status: 500, headers: h, json: { object: 'error' } }) : o.sets === 'ok' ? route.fulfill({ status: 200, headers: h, json: { object: 'list', has_more: false, data: SETS } }) : route.fallback(); });
  await pg.p.route('https://svgs.scryfall.io/**', route => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>' }));
  if (o.routes) await o.routes(pg.p);
  await pg.p.goto(world.url + (o.path || '')); await pg.p.waitForTimeout(700);
  await pg.p.evaluate(() => { BACKOFF.scry = [60, 60, 60]; BACKOFF.cool429 = 100; });
  errsAll.push(pg.errs);
  return { ...pg, hits };
}
const rows = p => p.$$eval('#hmSetsList .hm-set', ls => ls.map(l => { const a = l.querySelector('.hm-set-a'), c = l.querySelector('.hm-set-cm');
  return { name: a.querySelector('b').textContent, sub: a.querySelector('.hm-set-t span').textContent, when: l.querySelector('em').textContent,
    set: a.dataset.set, tag: a.tagName, icon: (a.querySelector('img') || {}).src || '',
    cm: c && { href: c.getAttribute('href'), target: c.target, rel: c.rel, text: c.textContent, label: c.getAttribute('aria-label') } }; }));
const CM = (site, name) => `https://www.cardmarket.com/${site}/Magic/Products/Search?searchString=${encodeURIComponent(name)}`;
/** Géométrie des lignes : débordements, zone de toucher du lien Cardmarket, alignement des deux pastilles, liens jamais imbriqués,
 *  et ce que touche un doigt au centre de chaque pastille (lien Cardmarket sur la sienne, lien Scryfall étiré sur la date). */
const geo = p => p.$$eval('#hmSetsList .hm-set', ls => ls.map((l, i) => {
  if (!i) document.getElementById('hmSets').scrollIntoView({ block: 'center', behavior: 'instant' });      // elementFromPoint : la carte doit être à l'écran
  const c = l.querySelector('.hm-set-cm'), cb = c.getBoundingClientRect(), pill = c.querySelector('span').getBoundingClientRect(), em = l.querySelector('em').getBoundingClientRect(), lb = l.getBoundingClientRect();
  const hit = r => { const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2), x = e && e.closest('a, button'); return x ? x.className : ''; };
  return { over: l.scrollWidth > l.clientWidth || cb.right > lb.right + 0.5 || cb.left < lb.left, w: cb.width, h: cb.height, align: Math.abs(pill.right - em.right) <= 1,
    nested: !!c.parentElement.closest('a') || !!c.querySelector('a') || !!l.querySelector('.hm-set-a .hm-set-cm'), hitCm: hit(pill), hitWhen: hit(em) };
}));

/* ── 0) Decks › « Prix d'une liste » (barre du bas, nav.js) : la saisie, avec les onglets de la section Decks ; Accueil y revient ─────────── */
{
  const { p, ctx } = await page({});
  await p.click('#nav [data-nav="decks"]'); await p.waitForSelector('.dks.on .dk-tab[data-dtab="price"]');
  await p.click('.dks .dk-tab[data-dtab="price"]'); await p.waitForFunction(() => S.view === 'input' && !document.querySelector('.dks'));
  assert.equal(await txt(p, '#inTabs .dk-tab[aria-current="page"]'), 'Prix d\'une liste'); assert.equal(await p.getAttribute('#nav [data-nav="decks"]', 'aria-current'), 'page', 'barre du bas : Decks');
  assert.equal(await p.evaluate(() => S.isSample), true, 'appareil neuf : l\'exemple est dans le champ');
  await p.click('#nav [data-nav="home"]'); await p.waitForFunction(() => S.view === 'home'); await ctx.close();
}
ok('Decks › « Prix d\'une liste » : la saisie avec les onglets Decks, barre du bas sur Decks, Accueil y revient');

/* ── 1) Prochaines extensions : tri, filtres, parent, cache, erreurs ───────────────────────────────────────────── */
{
  const { p, ctx, hits } = await page({ sets: 'ok', ctx: { colorScheme: 'dark' } });
  assert.equal(await p.$eval('#hmSets', e => e.hidden), true, 'cachée tant que rien n\'est lu');
  await p.waitForSelector('#hmSets:not([hidden]) .hm-set', { timeout: 9000 });
  const r = await rows(p);
  assert.deepEqual(r.map(x => x.name), ['Recent Expansion', 'Beta Masters', 'Alpha Future', '<img src=x onerror="window.__xss=1">'], 'dernière sortie récente puis prochaines, par date ; 4 au plus');
  assert.deepEqual(r.map(x => x.when), ['Sortie récente', 'Demain', 'dans 12 jours', 'dans 5 mois']);
  assert.match(r[3].sub, /^\d{1,2} [a-zéû]+( \d{4})?$/, 'date seule (année si ce n\'est pas l\'année en cours) : ' + r[3].sub);
  assert.match(r[2].sub, /^\d{1,2} [a-zéû]+( \d{4})? · decks Commander$/, 'decks Commander rattachés à leur extension : ' + r[2].sub);
  assert.equal(r.filter(x => /Commander|Tokens|Digital|Promo|Older|Old /.test(x.name)).length, 0, 'enfants, numériques, jetons, promos, anciennes : écartés');
  assert.deepEqual([r[2].set, r[2].tag], ['aaa', 'BUTTON'], 'la ligne ouvre la page de l\'extension dans l\'appli');
  assert.match(r[2].icon, /^https:\/\/svgs\.scryfall\.io\/sets\/aaa\.svg/);
  assert.equal(r[3].icon, '', 'icône d\'une autre origine : écartée');
  assert.equal(await p.evaluate(() => setsPick(SETS.list).find(x => x.code === 'xss').url), 'https://scryfall.com/sets/xss', 'adresse inattendue : remplacée par la page Scryfall de l\'édition');
  assert.equal(await p.evaluate(() => window.__xss), undefined, 'nom échappé');
  await p.waitForFunction(() => { const a = document.getElementById('hmSetsSl'); return a && a.getBoundingClientRect().height >= 40; }, null, { timeout: 5000 }).catch(() => {});      // carte de l'accueil encore en train d'apparaître (CI lente) : hauteur mesurée une fois posée
  assert.deepEqual(await p.$eval('#hmSetsSl', a => [a.href, a.target, a.rel, a.textContent.trim(), a.getBoundingClientRect().height >= 40]), ['https://secretlair.wizards.com/', '_blank', 'noopener', 'Secret Lair : drops en cours et à venir↗', true], 'lien Secret Lair sous la liste (les drops ne sont pas des éditions sur Scryfall)');
  assert.equal(hits.n, 1);
  assert.equal(await p.$eval('#hmSets', e => getComputedStyle(e.querySelector('.hm-set-ic img')).filter), 'invert(1) brightness(0.92)', 'icônes noires éclaircies en thème sombre');
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'pas de défilement horizontal à 390 px');
  ok('accueil : extensions à venir triées, numériques / jetons / promos écartés, Commander rattaché, page de l\'extension, noms échappés');
  // Cardmarket : « Précommander » sur les éditions à venir, « Acheter » sur la sortie récente ; recherche du nom encodé, site français
  assert.deepEqual(r.map(x => x.cm), [
    { href: CM('fr', 'Recent Expansion'), target: '_blank', rel: 'noopener', text: 'Acheter↗', label: 'Acheter Recent Expansion sur Cardmarket' },
    { href: CM('fr', 'Beta Masters'), target: '_blank', rel: 'noopener', text: 'Précommander↗', label: 'Précommander Beta Masters sur Cardmarket' },
    { href: CM('fr', 'Alpha Future'), target: '_blank', rel: 'noopener', text: 'Précommander↗', label: 'Précommander Alpha Future sur Cardmarket' },
    { href: 'https://www.cardmarket.com/fr/Magic/Products/Search?searchString=%3Cimg%20src%3Dx%20onerror%3D%22window.__xss%3D1%22%3E', target: '_blank', rel: 'noopener', text: 'Précommander↗', label: 'Précommander <img src=x onerror="window.__xss=1"> sur Cardmarket' },
  ]);
  assert.equal(r[2].cm.href, 'https://www.cardmarket.com/fr/Magic/Products/Search?searchString=Alpha%20Future', 'adresse exacte (espace en %20)');
  assert.deepEqual(await p.evaluate(() => [setsCm('Duskmourn: House of Horror'), setsCm("Marvel's Spider-Man"), setsCm('  ')]),
    ['https://www.cardmarket.com/fr/Magic/Products/Search?searchString=Duskmourn%3A%20House%20of%20Horror', "https://www.cardmarket.com/fr/Magic/Products/Search?searchString=Marvel's%20Spider-Man", ''], 'nom Scryfall tel quel, encodé ; nom vide : pas de lien');
  for (const w of [390, 360]) {
    await p.setViewportSize({ width: w, height: 844 }); await p.waitForTimeout(250); const g = await geo(p);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'pas de défilement horizontal à ' + w + ' px');
    for (const x of g) {
      assert.equal(x.over, false, w + ' px : rien ne déborde de la ligne'); assert.ok(x.h >= 40 && x.w >= 40, w + ' px : zone de toucher ≥ 40 px (' + x.w + '×' + x.h + ')');
      assert.equal(x.align, true, 'pastilles alignées à droite'); assert.equal(x.nested, false, 'liens séparés, jamais imbriqués');
      assert.deepEqual([x.hitCm, x.hitWhen], ['hm-set-cm', 'hm-set-a'], w + ' px : la pastille Cardmarket au-dessus ; la date ouvre la page de l\'extension');
    }
  }
  assert.deepEqual(await p.$eval('#hmSetsList .hm-set:last-child b', b => [b.scrollWidth > b.clientWidth, getComputedStyle(b).textOverflow]), [true, 'ellipsis'], 'nom long coupé par « … »');
  await p.setViewportSize({ width: 390, height: 844 });
  // toucher : chaque lien ouvre son seul onglet (Cardmarket ou Scryfall, simulés)
  const opened = [];
  await ctx.route(/^https:\/\/(www\.cardmarket\.com|scryfall\.com)\//, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>ok</title>' }));
  p.on('popup', pp => opened.push(pp));
  const tapTo = async (sel, o) => {
    const n = opened.length; await p.tap(sel, o);
    for (let i = 0; i < 40 && opened.length === n; i++) await p.waitForTimeout(50);
    await p.waitForTimeout(400);      // un 2e onglet (liens imbriqués) aurait eu le temps de s'ouvrir
    const got = opened.slice(n); for (const pp of got) await pp.waitForLoadState('domcontentloaded'); return got.map(pp => pp.url());
  };
  // sans force : Playwright vérifie que la pastille reçoit bien le toucher (rien posé dessus)
  assert.deepEqual(await tapTo('#hmSetsList .hm-set:nth-child(3) .hm-set-cm span'), [CM('fr', 'Alpha Future')], 'toucher « Précommander » : Cardmarket seul, pas la page Scryfall');
  // force : la date est sous le bouton étiré de la ligne, c'est lui qui reçoit le toucher : la page de l'extension, aucun onglet
  assert.deepEqual(await tapTo('#hmSetsList .hm-set:nth-child(3) em', { force: true }), [], 'toucher la date : pas d\'onglet');
  await p.waitForSelector('.setv.on'); assert.equal(await txt(p, '.setv .dv-title b'), 'Alpha Future'); await p.evaluate(() => closeSetView()); await p.waitForFunction(() => !document.querySelector('.setv'));
  for (const pp of opened) await pp.close();
  ok('Cardmarket : « Précommander » (à venir) / « Acheter » (sortie récente), recherche du nom encodé sur le site français, onglet séparé, ≥ 40 px, sans débordement à 390 et 360 px');
  // capture : accueil sombre, carte visible
  await p.$eval('#hmSets', e => e.scrollIntoView({ block: 'center', behavior: 'instant' })); await p.waitForTimeout(900);
  await p.screenshot({ path: 'shots/content-1-extensions.png' });
  await p.reload(); await p.waitForTimeout(400);
  await p.waitForSelector('#hmSets:not([hidden]) .hm-set', { timeout: 2000 });
  await p.waitForTimeout(3200);
  assert.equal(hits.n, 1, '2e lancement : liste gardée 24 h, aucune nouvelle requête');
  assert.equal((await rows(p)).length, 4);
  ok('2e lancement : liste relue dans le cache (aucune requête Scryfall)');
  // cache de plus de 24 h : relu chez Scryfall
  await p.evaluate(() => new Promise(res => { const r = indexedDB.open('deckdeal', 1); r.onsuccess = () => { const s = r.result.transaction('kv', 'readwrite').objectStore('kv'), g = s.get('sets:v1'); g.onsuccess = () => { const v = g.result; v.t -= 25 * 3600e3; s.put(v, 'sets:v1').onsuccess = res; }; }; }));
  await p.reload(); await p.waitForFunction(() => SETS.st === 'done', null, { timeout: 9000 });
  assert.equal(hits.n, 2, 'cache périmé : nouvelle lecture'); ok('cache de plus de 24 h : relu chez Scryfall');
  await ctx.close();
}
{ // anglais : « Pre-order » / « Buy », site Cardmarket anglais ; anglais choisi sur un téléphone allemand (l'interface allemande existe) : site anglais aussi
  const { p, ctx } = await page({ sets: 'ok', path: '?lang=en' });
  await p.waitForSelector('#hmSets:not([hidden]) .hm-set', { timeout: 9000 });
  const r = await rows(p);
  assert.deepEqual(r.slice(0, 3).map(x => [x.cm.href, x.cm.text, x.cm.label]), [[CM('en', 'Recent Expansion'), 'Buy↗', 'Buy Recent Expansion on Cardmarket'],
    [CM('en', 'Beta Masters'), 'Pre-order↗', 'Pre-order Beta Masters on Cardmarket'], [CM('en', 'Alpha Future'), 'Pre-order↗', 'Pre-order Alpha Future on Cardmarket']]);
  assert.equal(r[2].cm.href, 'https://www.cardmarket.com/en/Magic/Products/Search?searchString=Alpha%20Future');
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await ctx.close();
  const de = await page({ sets: 'ok', path: '?lang=en', ctx: { locale: 'de-DE' } });
  await de.p.waitForSelector('#hmSets:not([hidden]) .hm-set', { timeout: 9000 });
  assert.equal((await rows(de.p))[2].cm.href, CM('en', 'Alpha Future'), 'anglais choisi sur un téléphone allemand : cardmarket.com/en (langue de l\'utilisateur)');
  await de.ctx.close();
}
ok('Cardmarket en anglais : « Pre-order » / « Buy », site /en/ (même sur un téléphone allemand : l\'anglais y est un choix)');
{ // Scryfall en erreur (500, puis un nouvel essai) : carte cachée, sans message
  const { p, ctx, hits, errs } = await page({ sets: 'err' });
  await p.waitForFunction(() => SETS.st === 'fail', null, { timeout: 9000 });
  assert.ok(hits.n >= 1); assert.equal(await p.$eval('#hmSets', e => e.hidden), true); assert.equal(await p.$('.toast.on'), null, 'aucun message');
  assert.deepEqual(errs, []); await ctx.close();
}
{ // faux Scryfall commun (404 sur /sets) : cachée aussi
  const { p, ctx } = await page({});
  await p.waitForFunction(() => SETS.st === 'fail', null, { timeout: 9000 }); assert.equal(await p.$eval('#hmSets', e => e.hidden), true); await ctx.close();
}
{ // hors ligne : aucune requête, cachée
  const { p, ctx, hits } = await page({ sets: 'ok', init: 'Object.defineProperty(navigator, "onLine", { get: () => false });' });
  await p.waitForFunction(() => SETS.st === 'fail', null, { timeout: 9000 }); assert.equal(hits.n, 0); assert.equal(await p.$eval('#hmSets', e => e.hidden), true); await ctx.close();
}
{ // accueil pas à l'écran au moment prévu (collection ouverte) : rien ; lu au retour sur l'accueil
  const { p, ctx, hits } = await page({ sets: 'ok' });
  await p.click('#btnColl'); await p.waitForSelector('.coll.on'); await p.waitForTimeout(3200);
  assert.equal(hits.n, 0, 'collection ouverte : pas de lecture');
  await p.click('#nav [data-nav="home"]'); await p.waitForFunction(() => !COLL.el); await p.evaluate(() => homeSoon(0));
  await p.waitForSelector('#hmSets:not([hidden]) .hm-set', { timeout: 9000 }); assert.equal(hits.n, 1); await ctx.close();
}
ok('extensions : cachées en erreur (500, 404) et hors ligne, lues seulement quand l\'accueil est à l\'écran');
/* ── 1 bis) page d'une extension (setview.js) : cartes révélées (faux /cards/search), langue des cartes, recherche, rareté, tri, souhaits ───── */
{
  const IMG = (n, l = 'en') => `https://cards.scryfall.io/normal/front/a/a/aaa-${n}${l === 'en' ? '' : '-' + l}.jpg`;
  const card = (num, name, o = {}) => ({ object: 'card', id: 'id-' + num, name, collector_number: String(num), rarity: 'common', set: 'aaa', set_name: 'Alpha Future', lang: 'en', cmc: 2,
    mana_cost: '{1}{G}', type_line: 'Creature — Elf', colors: ['G'], image_uris: { normal: IMG(num) }, prices: { eur: null }, border_color: 'black', frame_effects: [], ...o });
  const AAA = [
    card(1, 'Zap Bolt', { cmc: 1, mana_cost: '{R}', type_line: 'Instant', colors: ['R'], prices: { eur: '0.20' } }),
    card(2, 'Elder Wurm', { rarity: 'mythic', cmc: 7, mana_cost: '{5}{G}{G}', type_line: 'Creature — Wurm', prices: { eur: '12.50' } }),
    card(3, 'Sky Angel', { rarity: 'rare', cmc: 4, mana_cost: '{3}{W}', type_line: 'Creature — Angel', colors: ['W'] }),
    card(4, 'Mind Thief', { rarity: 'uncommon', cmc: 3, mana_cost: '{2}{U}', type_line: 'Sorcery', colors: ['U'] }),
    card(5, 'Twin Door // Twin Room', { rarity: 'uncommon', image_uris: undefined, colors: undefined, type_line: 'Enchantment — Room // Enchantment — Room',
      card_faces: [{ name: 'Twin Door', mana_cost: '{1}{B}', colors: ['B'], image_uris: { normal: IMG(5) } }, { name: 'Twin Room', mana_cost: '{3}{B}', colors: ['B'], image_uris: { normal: IMG('5b') } }] }),
    card(6, 'Elder Wurm', { rarity: 'mythic', cmc: 7, mana_cost: '{5}{G}{G}', type_line: 'Creature — Wurm', border_color: 'borderless' }),
    card(7, 'Forest', { cmc: 0, mana_cost: '', type_line: 'Basic Land — Forest', colors: [] }),
  ];
  const FR = [{ ...AAA[0], lang: 'fr', printed_name: 'Éclair zap', image_uris: { normal: IMG(1, 'fr') } }];
  const pg = await page({ sets: 'ok', init: `try { localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: '3 Zap Bolt', u: 1, s: '', b: null })); } catch (e) {}` });
  const { p, ctx } = pg, searches = [];
  await p.route(/^https:\/\/api\.scryfall\.com\/cards\/search\?/, route => {
    const u = new URL(route.request().url()), q = u.searchParams.get('q') || '', h = { 'access-control-allow-origin': '*' };
    if (!/^e:/.test(q)) return route.fallback();
    searches.push(q + (u.searchParams.get('page') ? ' p' + u.searchParams.get('page') : ''));
    const data = q === 'e:aaa' ? AAA : q === 'e:aaa lang:fr' ? FR : [];
    if (!data.length) return route.fulfill({ status: 404, headers: h, json: { object: 'error', code: 'not_found' } });
    const page2 = u.searchParams.get('page') === '2', part = q === 'e:aaa' ? (page2 ? data.slice(4) : data.slice(0, 4)) : data;
    route.fulfill({ status: 200, headers: h, json: { object: 'list', has_more: q === 'e:aaa' && !page2, ...(q === 'e:aaa' && !page2 ? { next_page: 'https://api.scryfall.com/cards/search?q=e%3Aaaa&unique=prints&order=set&page=2' } : {}), data: part } });
  });
  await p.waitForSelector('#hmSets:not([hidden]) .hm-set', { timeout: 9000 });
  await p.click('#hmSetsList .hm-set-a[data-set="aaa"]'); await p.waitForSelector('.setv.on');
  await p.waitForFunction(() => document.querySelectorAll('.setv-c').length === 7, null, { timeout: 8000 });
  assert.deepEqual(searches, ['e:aaa', 'e:aaa p2', 'e:aaa lang:fr'], 'impressions de l\'extension (2 pages), puis les mêmes en français');
  assert.equal(await txt(p, '.setv .dv-title b'), 'Alpha Future'); assert.match(await txt(p, '.setv .dv-title span'), /^Sortie le \d{1,2} [a-zéû]+( \d{4})? · dans 12 jours$/);
  assert.equal(await txt(p, '.setv-n'), '7 cartes révélées');
  const tiles = () => p.$$eval('.setv-c', l => l.map(c => [c.querySelector('.setv-open').getAttribute('aria-label'), (c.querySelector('.dvc-q') || {}).textContent || '', (c.querySelector('.dvc-p') || {}).textContent || '',
    c.querySelector('.setv-star') ? c.querySelector('.setv-star').className.replace('setv-star', '').trim() || 'off' : '-', (c.querySelector('img') || {}).src || '']));
  let t = await tiles();
  assert.deepEqual(t.map(x => x[0]), ['Éclair zap', 'Elder Wurm', 'Sky Angel', 'Mind Thief', 'Twin Door // Twin Room', 'Elder Wurm', 'Forest'], 'ordre de l\'extension, nom français quand Scryfall l\'a');
  assert.equal(t[0][4], IMG(1, 'fr'), 'image française'); assert.equal(t[4][4], IMG(5), 'carte à deux faces : la face avant');
  assert.deepEqual([t[0][1], t[0][2].replace(/\s/g, ' '), t[1][2].replace(/\s/g, ' '), t[2][2]], ['× 3', '0,20 €', '12,50 €', ''], 'exemplaires de la collection, prix Cardmarket quand il est connu');
  assert.deepEqual(t.map(x => x[3]), ['off', 'off', 'off', 'off', 'off', 'off', '-'], 'étoile sur chaque carte, sauf les terrains de base');
  ok('page d\'une extension : cartes révélées dans l\'ordre, nom et image en français si Scryfall les a, possédées et prix');
  // recherche (nom anglais ou français), rareté, versions spéciales, tri, filtre de couleur
  const names = async () => (await tiles()).map(x => x[0]);
  await p.fill('.setv .fsearch input', 'zap'); await p.waitForFunction(() => document.querySelectorAll('.setv-c').length === 1); assert.deepEqual(await names(), ['Éclair zap']);
  await p.fill('.setv .fsearch input', 'eclair'); await p.waitForTimeout(300); assert.deepEqual(await names(), ['Éclair zap'], 'nom français, sans accent');
  assert.equal(await txt(p, '.setv-n'), '1 carte sur 7');
  await p.fill('.setv .fsearch input', ''); await p.waitForFunction(() => document.querySelectorAll('.setv-c').length === 7);
  await p.click('.setv-rar[data-r="mythic"]'); await p.waitForFunction(() => document.querySelectorAll('.setv-c').length === 2); assert.deepEqual(await names(), ['Elder Wurm', 'Elder Wurm']);
  await p.click('.setv-sp'); await p.waitForFunction(() => document.querySelectorAll('.setv-c').length === 1); assert.equal((await tiles())[0][4], IMG(2), 'sans la version sans bordure');
  await p.click('.setv-sp'); await p.click('.setv-rar[data-r="mythic"]'); await p.waitForFunction(() => document.querySelectorAll('.setv-c').length === 7);
  await p.selectOption('.setv-sort', 'price'); await p.waitForTimeout(200); assert.deepEqual((await names()).slice(0, 2), ['Elder Wurm', 'Éclair zap'], 'tri par prix');
  await p.selectOption('.setv-sort', 'name'); await p.waitForTimeout(200); assert.deepEqual(await names(), ['Éclair zap', 'Elder Wurm', 'Elder Wurm', 'Forest', 'Mind Thief', 'Sky Angel', 'Twin Door // Twin Room'], 'tri par nom affiché');
  await p.selectOption('.setv-sort', 'num'); await p.evaluate(() => { SETV.f.colors.add('W'); setvPaint(); }); assert.deepEqual(await names(), ['Sky Angel'], 'filtre de couleur (filters.js)');
  await p.evaluate(() => { SETV.f.colors.clear(); setvPaint(); });
  ok('recherche (nom anglais ou français), rareté, versions spéciales, tri (prix, nom), couleur');
  // étoiles : ajoute cette illustration, la remplace par une autre, la retire ; français : langue retenue
  const star = i => p.click(`.setv-c[data-i="${i}"] .setv-star`), wish = k => p.evaluate(k => TR.wish[k] || null, k);
  await star(1); assert.deepEqual(await wish('elder wurm'), { n: 'Elder Wurm', q: 1, i: IMG(2), w: 'Alpha Future · AAA 2' });
  t = await tiles(); assert.deepEqual([t[1][3], t[5][3]], ['on', 'other'], 'cette illustration : étoile pleine ; l\'autre version : contour');
  await star(5); assert.equal((await wish('elder wurm')).i, IMG(6), 'version sans bordure à la place'); assert.match(await txt(p, '#toast'), /Illustration mise à jour/);
  await star(5); assert.equal(await wish('elder wurm'), null, 'retirée'); assert.match(await txt(p, '#toast'), /retirée de ta liste de souhaits/);
  await star(0); assert.deepEqual(await wish('zap bolt'), { n: 'Zap Bolt', q: 1, i: IMG(1, 'fr'), w: 'Alpha Future · AAA 1', l: 'fr' }, 'carte française : image et langue retenues');
  ok('étoiles : ajoute l\'illustration de la vignette, la remplace, la retire (Annuler dans le message) ; langue des cartes retenue');
  // carte en grand : toute la liste affichée, « Liste de souhaits » ; l'étoile suit à la fermeture
  await p.click('.setv-c[data-i="2"] .setv-open'); await p.waitForSelector('.imgv'); await p.waitForFunction(() => !document.querySelector('.imgv-wish').hidden, null, { timeout: 5000 });
  assert.deepEqual(await p.evaluate(() => [document.querySelector('.imgv-cap b').textContent, document.querySelector('.imgv-count').textContent]), ['Sky Angel', '3 / 7']);
  await p.click('.imgv-wish'); assert.equal((await wish('sky angel')).w, 'Alpha Future · AAA 3');
  await p.evaluate(() => closeCardImage()); await p.waitForFunction(() => document.querySelector('.setv-c[data-i="2"] .setv-star.on'), null, { timeout: 3000 });
  ok('carte en grand : précédente / suivante sur la liste affichée, « Liste de souhaits » ; étoile mise à jour');
  // 360 px : rien ne déborde ; fermeture ; extension sans carte révélée ; copie gardée (aucune nouvelle requête)
  await p.setViewportSize({ width: 360, height: 780 }); await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => document.querySelector('.setv .dv-scroll').scrollWidth <= innerWidth), true, 'pas de défilement horizontal à 360 px');
  await p.screenshot({ path: 'shots/content-1b-extension.png' });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.click('.setv .dv-back'); await p.waitForFunction(() => !document.querySelector('.setv'));
  await p.click('#hmSetsList .hm-set-a[data-set="bbb"]'); await p.waitForSelector('.setv .dv-empty');
  assert.equal(await txt(p, '.setv .dv-empty b'), 'Aucune carte révélée pour l\'instant');
  await p.evaluate(() => closeSetView()); await p.waitForFunction(() => !document.querySelector('.setv'));
  const n = searches.length; await p.click('#hmSetsList .hm-set-a[data-set="aaa"]'); await p.waitForFunction(() => document.querySelectorAll('.setv-c').length === 7);
  assert.equal(searches.length, n, 'rouverte : copie de l\'appareil, aucune requête');
  assert.deepEqual(pg.errs, []); await ctx.close();
  ok('extension sans carte révélée : message ; rouverte : copie gardée ; 360 px sans débordement');
}


/* ── 2) Réglages › Aide et avis ; feuille d'aide ; avis par e-mail ──────────────────────────────────────────────── */
{
  const seed = `localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: '2 Sol Ring\\n1 Craterhoof Behemoth', u: 1, s: '', b: null }));`;
  const { p, ctx } = await page({ init: seed, ctx: { colorScheme: 'dark' } });
  await openMe(p, 'aide'); await p.waitForSelector('#helpBox .btn');
  assert.equal(await txt(p, '.sheet-wrap.open:last-child .sheet-head h2'), 'Aide et avis');
  assert.deepEqual(await p.$$eval('#helpBox .btn', b => b.map(x => x.textContent)), ['Comment ça marche', 'Visite guidée', 'Envoyer un avis', 'Rejoindre le Discord'], 'navigateur : pas de « Noter » (« Visite guidée » : tour.js)');
  assert.equal(await p.$eval('#helpBox a[data-help="discord"]', a => [a.getAttribute('href'), a.target, a.rel].join()), 'https://discord.gg/TTwrP94agb,_blank,noopener', '« Rejoindre le Discord » : invitation, onglet à part');
  assert.notEqual(await p.evaluate(() => CTX.feedback), true, 'serveur des tests sans bot Discord : /__ping sans feedback');
  assert.match(await txt(p, '#helpBox .hint'), /ton appli mail s.ouvre/, 'texte du mailto');
  const href = await p.$eval('#helpBox a[data-help="mail"]', a => a.getAttribute('href'));
  const m = /^mailto:contact@manaorbit\.app\?subject=([^&]*)&body=([^&]*)$/.exec(href);
  assert.ok(m, 'mailto : adresse, objet, corps : ' + href.slice(0, 120));
  assert.equal(m[1], 'Mana%20Orbit%20%C2%B7%20avis', 'objet encodé (espaces en %20, point médian en UTF-8)');
  assert.doesNotMatch(href, /[ +\n]/, 'aucun espace, « + » ni retour à la ligne bruts');
  const body = decodeURIComponent(m[2]), lines = body.split('\r\n'), info = await p.evaluate(() => [DD_BUILD, navigator.userAgent]);
  assert.deepEqual(lines.slice(0, 3), ['', '', ''], 'place pour le message en tête');
  assert.ok(lines.includes('Ces informations aident à reproduire un bug. Ta collection n\'est pas envoyée.'));
  assert.ok(lines.includes('Version : ' + info[0])); assert.ok(lines.includes('Plateforme : web')); assert.ok(lines.some(l => /^Langue : fr \(/.test(l)));
  assert.ok(lines.includes('Navigateur : ' + info[1]), 'navigateur (user agent)');
  assert.doesNotMatch(body, /Sol Ring|Craterhoof/, 'jamais la collection');
  assert.ok(!/\r\n/.test(body.replace(/\r\n/g, '')) && !/[^\r]\n/.test(body), 'fins de ligne CRLF');
  ok('Réglages : « Aide et avis », mailto encodé (objet, version, plateforme, langue, navigateur, phrase de confidentialité), sans la collection');
  await p.$eval('#helpBox', e => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await p.click('#helpBox [data-help="open"]'); await p.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 3);      // Compte et réglages › Aide et avis › Comment ça marche
  assert.equal(await txt(p, '.hp-sheet .sheet-head h2'), 'Comment ça marche');
  assert.equal(await p.$$eval('.hp-sheet .hp-q', q => q.length), 16, '16 questions (dont « Je viens de ManaBox », le classeur, « Ouvrir des boosters » (opening.js), les amis, l\'échange en face à face (troc.js) et les fonctions moins visibles (tour.js))');
  assert.equal(await p.$$eval('.hp-sheet .hp-q[open]', q => q.length), 0, 'toutes repliées');
  await p.click('.hp-sheet .hp-q[data-i="0"] summary'); await p.waitForTimeout(150);
  assert.match(await txt(p, '.hp-sheet .hp-q[data-i="0"] p'), /« Prix d'une liste » › Critères › Prix/);
  await p.click('.hp-sheet .hp-q[data-i="2"] summary'); await p.waitForTimeout(150);
  assert.deepEqual(await p.$$eval('.hp-sheet .hp-q[open]', q => q.map(x => x.dataset.i)), ['2'], 'une seule question ouverte à la fois');
  assert.match(await p.$eval('.hp-sheet .sheet-foot a[data-help="mail"]', a => a.getAttribute('href')), /^mailto:contact@manaorbit\.app\?subject=Mana%20Orbit%20%C2%B7%20avis&body=/);
  await p.waitForTimeout(500); await p.screenshot({ path: 'shots/content-2-aide.png' });
  await p.keyboard.press('Escape'); await p.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2);
  ok('feuille « Comment ça marche » depuis les Réglages : 16 questions repliables, une ouverte à la fois, avis en pied');
  await closeSheets(p);
  await toHome(p); await p.click('#btnHelp'); await p.waitForSelector('.hp-sheet.open');
  ok('accueil : « Comment ça marche ? » ouvre la même aide');
  await ctx.close();
}
{ // anglais : rubrique, aide et lien de l'accueil traduits
  const { p, ctx } = await page({ path: '?lang=en' });
  assert.equal(await txt(p, '#btnHelp'), '? How does it work?');
  await openMe(p, 'aide'); await p.waitForSelector('#helpBox .btn');
  assert.equal(await txt(p, '.sheet-wrap.open:last-child .sheet-head h2'), 'Help and feedback'); assert.match(await txt(p, '#helpBox'), /Send feedback/);
  const body = decodeURIComponent(/body=(.*)$/.exec(await p.$eval('#helpBox a[data-help="mail"]', a => a.getAttribute('href')))[1]);
  assert.match(body, /This information helps us reproduce a bug\. Your collection is not sent\.\r\nVersion: \w+\r\nPlatform: web\r\nLanguage: en/);
  await p.click('#helpBox [data-help="open"]'); await p.waitForSelector('.hp-sheet.open');
  assert.deepEqual((await p.$$eval('.hp-sheet summary', s => s.map(x => x.textContent))).slice(0, 2), ['Cardmarket or CardTrader: which prices?', 'How do I add my cards?']);
  await ctx.close();
}
ok('anglais : « Help and feedback », aide et corps du mail traduits');

/* ── 2b) Avis par le Discord (help.js › fbOpen) : /__ping feedback: true et api/feedback simulés (routes Playwright) ──────────────────────── */
// Images de test : BMP 24 bits fabriqués ici (dégradé 3 000 × 1 500, bruit 1 600 × 1 600 qui dépasse 1,5 Mo en JPEG 0,82, petite image), fichier abîmé.
const bmp = (w, h, px) => {
  const row = Math.ceil(w * 3 / 4) * 4, size = 54 + row * h, b = Buffer.alloc(size);
  b.write('BM', 0); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14); b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(row * h, 34);
  if (!px) randomBytes(row * h).copy(b, 54);      // bruit : incompressible
  else for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, bl] = px(x, h - 1 - y), o = 54 + y * row + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
};
const IMG = {
  big: { name: 'grande.bmp', mimeType: 'image/bmp', buffer: bmp(3000, 1500, (x, y) => [x * 255 / 3000 | 0, y * 255 / 1500 | 0, 128]) },
  noise: { name: 'bruit.bmp', mimeType: 'image/bmp', buffer: bmp(1600, 1600, null) },
  small: { name: 'petite.bmp', mimeType: 'image/bmp', buffer: bmp(200, 300, x => [20, x, 200]) },
  small2: { name: 'petite-2.bmp', mimeType: 'image/bmp', buffer: bmp(120, 90, () => [200, 40, 40]) },
  bad: { name: 'abimee.png', mimeType: 'image/png', buffer: Buffer.from('pas une image du tout') },
};
/** Taille d'un JPEG (segment SOF) : { w, h } ; null si ce n'en est pas un. */
const jpegSize = buf => {
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  for (let i = 2; i + 9 < buf.length;) { if (buf[i] !== 0xFF) return null; const m = buf[i + 1], len = buf.readUInt16BE(i + 2); if (m >= 0xC0 && m <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(m)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }; i += 2 + len; }
  return null;
};
const FB_URL = 'https://discord.com/channels/111/222', FB_SHEET = '.fb-sheet.open';
/** Page avec le bot Discord annoncé (/__ping du vrai proxy + feedback: true, sauf o.ping false) et api/feedback simulé : fb.calls (corps, en-têtes),
 *  fb.next (réponses suivantes : { status, json, headers, delay, abort }), sinon 200 { ok, url, id }. */
async function fbPage(o = {}) {
  const fb = { calls: [], next: [] };
  const pg = await page({ ...o, routes: async p => {
    if (o.ping !== false) await p.route(u => new URL(u).pathname.endsWith('/__ping'), async route => { const r = await route.fetch(), j = await r.json(); return route.fulfill({ response: r, json: { ...j, feedback: true } }); });
    await p.route(u => new URL(u).pathname.endsWith('/api/feedback'), async route => {
      const req = route.request(), r = fb.next.shift() || { status: 200, json: { ok: true, url: FB_URL, id: '222' } };
      fb.calls.push({ method: req.method(), headers: req.headers(), body: req.postDataJSON() });
      if (r.delay) await new Promise(ok => setTimeout(ok, r.delay));
      return r.abort ? route.abort('connectionrefused') : route.fulfill({ status: r.status, headers: r.headers || {}, json: r.json });
    });
  } });
  if (o.ping !== false) await pg.p.waitForFunction(() => CTX.feedback === true, null, { timeout: 8000 });
  return { ...pg, fb };
}
const fbVals = p => p.evaluate(() => ({ kind: (document.querySelector('.fb-kind .seg-opt[aria-checked="true"]') || {}).dataset?.v, area: document.querySelector('#fbArea').value, title: document.querySelector('#fbTitle').value,
  text: document.querySelector('#fbText').value, contact: document.querySelector('#fbContact').value, imgs: document.querySelectorAll('.fb-th:not(.busy) img').length }));
const fbErr = p => p.$eval('.fb-sheet .fb-err', e => (e.hidden ? '' : e.textContent));
const fbThumbs = (p, n) => p.waitForFunction(n => document.querySelectorAll('.fb-th:not(.busy)').length === n && !document.querySelector('.fb-th.busy'), n, { timeout: 15000 });
/** « Envoyer » : retourne la réponse de la feuille une fois l'envoi fini (bouton réactivé ou écran « Merci ! »). */
async function fbSend(p) {
  await p.click('.fb-sheet [data-fb="go"]');
  await p.waitForFunction(() => { const b = document.querySelector('.fb-sheet [data-fb="go"]'); return !b || !b.disabled; }, null, { timeout: 10000 });
}
/** Clic sur un lien « Envoyer un avis » : la feuille s'ouvre-t-elle, le mailto est-il empêché ? (le lien n'est jamais suivi : le test garde la page) */
async function mailClick(p, sel) {
  await p.evaluate(() => { window.__mail = null; document.addEventListener('click', e => { if (e.target.closest('a[data-help="mail"]')) { window.__mail = { prevented: e.defaultPrevented, href: e.target.closest('a').getAttribute('href') }; e.preventDefault(); } }, { once: true }); });
  await p.click(sel); await p.waitForTimeout(600);
  return p.evaluate(() => ({ ...window.__mail, sheet: !!document.querySelector('.fb-sheet') }));
}
{ // serveur sans bot (feedback absent de /__ping, cas du serveur des tests) : « Envoyer un avis » reste le mailto, sans feuille ; hors ligne avec le bot : mailto aussi
  const { p, ctx } = await fbPage({ ping: false });
  await openMe(p, 'aide'); await p.waitForSelector('#helpBox .btn');
  const m = await mailClick(p, '#helpBox a[data-help="mail"]');
  assert.equal(m.prevented, false, 'mailto suivi'); assert.equal(m.sheet, false, 'aucune feuille d\'avis'); assert.match(m.href, /^mailto:contact@manaorbit\.app\?subject=Mana%20Orbit%20%C2%B7%20avis&body=/);
  assert.equal(await p.evaluate(() => prgC().fb), 1, 'badge « Voix du peuple » au clic, comme avant');
  await ctx.close();
}
{
  const { p, ctx, fb } = await fbPage({});
  await ctx.setOffline(true);
  await openMe(p, 'aide'); await p.waitForSelector('#helpBox .btn');
  const m = await mailClick(p, '#helpBox a[data-help="mail"]');
  assert.equal(m.prevented, false); assert.equal(m.sheet, false, 'hors ligne : le mailto, qui partira plus tard'); assert.equal(fb.calls.length, 0);
  await ctx.close();
}
ok('avis : serveur sans bot Discord (feedback absent) ou hors ligne : « Envoyer un avis » reste le mailto (badge au clic), aucune feuille');
{ // la feuille, à 360 px en sombre : champs, requis, captures (réduites, 3 au plus, ✕, illisible), brouillon, 429, 503, réseau, 400, 413, succès, connecté, 404 → mailto
  const seed = `localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: '2 Sol Ring\\n1 Craterhoof Behemoth', u: 1, s: '', b: null }));`;
  const { p, ctx, fb } = await fbPage({ init: seed, ctx: { colorScheme: 'dark', viewport: { width: 360, height: 780 } } });
  await openMe(p, 'aide'); await p.waitForSelector('#helpBox .btn');
  assert.deepEqual(await p.$$eval('#helpBox .btn', b => b.map(x => x.textContent)), ['Comment ça marche', 'Visite guidée', 'Envoyer un avis', 'Rejoindre le Discord']);
  assert.match(await txt(p, '#helpBox .hint'), /arrive sur le Discord de Mana Orbit/, 'texte : l\'avis part sur le Discord');
  const m = await mailClick(p, '#helpBox a[data-help="mail"]');
  assert.equal(m.prevented, true, 'mailto empêché'); assert.equal(m.sheet, true, 'feuille d\'avis ouverte');
  await p.waitForSelector(FB_SHEET);
  assert.equal(await txt(p, '.fb-sheet .sheet-head h2'), 'Envoyer un avis');
  assert.equal(await p.evaluate(() => prgC().fb || 0), 0, 'pas de badge avant un envoi réussi');
  assert.deepEqual(await p.$$eval('.fb-kind .seg-opt', b => b.map(x => [x.dataset.v, x.textContent, x.getAttribute('aria-checked')].join(':'))), ['bug:Bug:true', 'idea:Idée:false', 'help:Question:false'], 'type : Bug par défaut');
  assert.equal(await p.$eval('.fb-kind', e => e.getAttribute('role')), 'radiogroup');
  assert.deepEqual(await p.$$eval('#fbArea option', o => o.map(x => x.value)), ['scan', 'collection', 'decks', 'prix', 'compte', 'alertes', 'echange', 'partie', 'mystere', 'amis', 'autre'], 'parties du contrat');
  assert.deepEqual(await p.$$eval('#fbArea option', o => o.map(x => x.textContent)), ['Scan', 'Collection', 'Decks', 'Prix', 'Compte et synchro', 'Alertes', 'Échange', 'Partie', 'Carte mystère', 'Amis', 'Autre']);
  assert.equal(await p.$eval('#fbArea', s => s.value), 'autre', 'partie : « Autre » par défaut');
  // chaque champ a son libellé (label for, ou aria-labelledby)
  assert.deepEqual(await p.$$eval('.fb input:not([type=file]), .fb textarea, .fb select', els => els.filter(e => !(e.labels && e.labels.length)).map(e => e.id)), [], 'libellés');
  assert.deepEqual(await p.$$eval('.fb [required]', e => e.map(x => x.id)), ['fbTitle', 'fbText'], 'titre et description requis');
  assert.equal(await p.$eval('#fbTitle', e => e.maxLength), 90); assert.equal(await p.$eval('#fbText', e => e.maxLength), 1500); assert.equal(await p.$eval('#fbContact', e => e.maxLength), 60);
  assert.match(await p.$eval('#fbText', e => e.placeholder), /^Étapes : .*\nAttendu : .*\nObtenu : /, 'bug : étapes, attendu, obtenu');
  assert.match(await p.$eval('#fbTitle', e => e.placeholder), /scan ne lit pas/);
  assert.match(await txt(p, '.fb-why'), /version de Mana Orbit, la plateforme, la langue et le navigateur ; jamais ta collection\. Ton message sera public sur le Discord de Mana Orbit\./);
  assert.equal(await txt(p, '.fb-sheet .fb-cnt'), '0 / 1500');
  // requis : rien ne part
  await fbSend(p);
  assert.match(await fbErr(p), /Donne un titre/); assert.equal(await p.$eval('#fbTitle', e => [e.getAttribute('aria-invalid'), document.activeElement === e].join()), 'true,true', 'titre : invalide et focus');
  await p.fill('#fbTitle', '  ab  '); await fbSend(p); assert.match(await fbErr(p), /3 caractères au moins/, 'titre de 2 caractères refusé');
  await p.fill('#fbTitle', 'Le classeur  ne\tdéfile plus'); assert.equal(await fbErr(p), '', 'saisie : message effacé'); assert.equal(await p.$eval('#fbTitle', e => e.getAttribute('aria-invalid')), null);
  await fbSend(p); assert.match(await fbErr(p), /Décris ton avis/); assert.equal(await p.evaluate(() => document.activeElement.id), 'fbText');
  assert.equal(fb.calls.length, 0, 'champs requis : rien envoyé');
  // type et partie
  await p.click('.fb-kind .seg-opt[data-v="idea"]');
  assert.match(await p.$eval('#fbText', e => e.placeholder), /Ton idée/, 'idée : autre texte d\'aide'); assert.match(await p.$eval('#fbTitle', e => e.placeholder), /trier mes decks/);
  await p.click('.fb-kind .seg-opt[data-v="bug"]'); await p.selectOption('#fbArea', 'scan');
  await p.click('#fbText'); await p.keyboard.type('Étapes : ouvrir le classeur.'); await p.keyboard.press('Enter'); await p.keyboard.type('Obtenu : rien ne bouge.');
  assert.equal(await txt(p, '.fb-sheet .fb-cnt'), (await fbVals(p)).text.length + ' / 1500', 'compteur');
  await p.fill('#fbContact', 'jace_beleren');
  // captures : 2 grandes (réduites), une illisible (message), 2 petites dont une de trop (3 au plus), ✕
  await p.setInputFiles('#fbFile', [IMG.big, IMG.noise]); await fbThumbs(p, 2);
  const dims = await p.$$eval('.fb-th img', im => im.map(x => [x.naturalWidth, x.naturalHeight]));
  assert.deepEqual(dims[0], [1600, 800], 'dégradé 3 000 × 1 500 → 1 600 × 800'); assert.ok(dims[1][0] < 1600 && dims[1][0] === dims[1][1], 'bruit : JPEG trop lourd à 1 600 px, refait plus petit (' + dims[1] + ')');
  await p.setInputFiles('#fbFile', [IMG.bad]); await p.waitForFunction(() => !document.querySelector('.fb-th.busy') && !document.querySelector('.fb-err').hidden, null, { timeout: 8000 });
  assert.match(await fbErr(p), /Image illisible : abimee\.png/); assert.equal((await fbVals(p)).imgs, 2);
  await p.setInputFiles('#fbFile', [IMG.small, IMG.small2]); await fbThumbs(p, 3);
  assert.match(await fbErr(p), /3 captures au plus/, 'la 4e capture n\'est pas ajoutée'); assert.equal(await p.$eval('.fb-add', b => b.disabled), true, 'bouton d\'ajout coupé à 3');
  assert.equal(await txt(p, '.fb-add'), 'Ajouter une capture (3/3)');
  assert.deepEqual(await p.$$eval('.fb-x', b => b.map(x => x.getAttribute('aria-label'))), ['Retirer la capture 1', 'Retirer la capture 2', 'Retirer la capture 3']);
  await p.click('.fb-x[data-fb-x="2"]'); await fbThumbs(p, 2);
  assert.equal(await p.$eval('.fb-add', b => b.disabled), false); assert.equal(await p.evaluate(() => document.activeElement.className), 'fb-x', '✕ : le focus reste sur une vignette');
  await p.setInputFiles('#fbFile', [IMG.small2]); await fbThumbs(p, 3);
  assert.deepEqual(await p.$$eval('.fb-th img', im => im.map(x => x.naturalWidth)).then(w => w[2]), 120, '✕ : la 3e capture remplacée');
  // 360 px : rien ne déborde
  const over = await p.evaluate(() => { const W = innerWidth, out = []; for (const e of document.querySelectorAll('.fb-sheet .sheet *')) { const r = e.getBoundingClientRect(); if (r.width && (r.right > W + 0.5 || r.left < -0.5)) out.push(e.className || e.tagName); } return { out, sw: document.documentElement.scrollWidth, W, body: document.querySelector('.fb-sheet .sheet-body').scrollWidth - document.querySelector('.fb-sheet .sheet-body').clientWidth }; });
  assert.deepEqual(over.out, [], '360 px : éléments hors de l\'écran'); assert.ok(over.sw <= over.W && over.body <= 0, '360 px : aucun défilement horizontal');
  await p.waitForTimeout(300); await p.screenshot({ path: 'shots/content-2b-avis.png' });
  // brouillon : feuille fermée (Échap) puis rouverte depuis le pied de « Comment ça marche »
  const before = await fbVals(p);
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.fb-sheet.open'));
  await p.$eval('#helpBox', e => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await p.click('#helpBox [data-help="open"]'); await p.waitForSelector('.hp-sheet.open');
  assert.equal((await mailClick(p, '.hp-sheet .sheet-foot a[data-help="mail"]')).sheet, true, 'pied de l\'aide : la feuille d\'avis');
  await p.waitForSelector(FB_SHEET);
  assert.deepEqual(await fbVals(p), before, 'brouillon gardé (type, partie, titre, description, pseudo, captures)');
  assert.deepEqual(await p.evaluate(() => Object.keys(JSON.parse(sessionStorage.getItem('deckdeal:fb')))), ['kind', 'area', 'title', 'text', 'contact'], 'textes aussi dans la session (pas les captures)');
  // 429 : « réessaie dans N min », bouton coupé pendant l'envoi, saisie gardée
  fb.next.push({ status: 429, json: { error: 'rate_limited', message: 'Trop d\'avis', retry: 540 }, headers: { 'retry-after': '540' }, delay: 500 });
  await p.click('.fb-sheet [data-fb="go"]'); await p.waitForTimeout(150);
  assert.deepEqual(await p.$eval('.fb-sheet [data-fb="go"]', b => [b.disabled, b.textContent]), [true, 'Envoi…'], 'bouton désactivé pendant l\'envoi');
  assert.equal(await p.$eval('#fbTitle', e => e.disabled), true, 'champs figés pendant l\'envoi');
  await p.waitForFunction(() => !document.querySelector('.fb-sheet [data-fb="go"]').disabled);
  assert.match(await fbErr(p), /réessaie dans 9 min/); assert.deepEqual(await fbVals(p), before, '429 : saisie gardée');
  // 503, réseau coupé, 400 (code connu), 413 : messages, saisie gardée
  fb.next.push({ status: 503, json: { error: 'unavailable', message: 'Discord injoignable' } }); await fbSend(p);
  assert.match(await fbErr(p), /Envoi impossible pour le moment : réessaie plus tard, ton message est gardé/); assert.deepEqual(await fbVals(p), before, '503 : saisie gardée');
  fb.next.push({ abort: true }); await fbSend(p); assert.match(await fbErr(p), /Serveur injoignable.*réessaie plus tard/i, 'réseau : réessaie plus tard');
  fb.next.push({ status: 400, json: { error: 'bad_image', message: 'Capture refusée' } }); await fbSend(p); assert.match(await fbErr(p), /Une capture n'a pas été acceptée/);
  fb.next.push({ status: 400, json: { error: 'bad_request', message: 'Message du serveur, tel quel' } }); await fbSend(p); assert.equal(await fbErr(p), 'Message du serveur, tel quel', '400 inconnu : message du serveur (français)');
  fb.next.push({ status: 413, json: { error: 'too_large' } }); await fbSend(p); assert.match(await fbErr(p), /Captures trop lourdes/);
  assert.deepEqual(await fbVals(p), before, 'erreurs : saisie gardée'); assert.equal(await p.evaluate(() => prgC().fb || 0), 0);
  // succès : corps exact
  const n0 = fb.calls.length; await fbSend(p);
  await p.waitForSelector('.fb-sheet .fb-done');
  const c = fb.calls[n0], b = c.body, info = await p.evaluate(() => [DD_BUILD, navigator.userAgent, I18N.nav]);
  assert.equal(c.method, 'POST'); assert.match(c.headers['content-type'], /^application\/json/); assert.equal(c.headers['x-firebase-token'], undefined, 'pas connecté : pas de jeton');
  assert.deepEqual(Object.keys(b).sort(), ['area', 'contact', 'imgs', 'kind', 'meta', 'text', 'title']);
  assert.deepEqual([b.kind, b.area, b.title, b.contact], ['bug', 'scan', 'Le classeur ne défile plus', 'jace_beleren'], 'titre nettoyé (espaces resserrés, tabulation)');
  assert.equal(b.text, 'Étapes : ouvrir le classeur.\nObtenu : rien ne bouge.', 'saut de ligne gardé');
  assert.deepEqual(b.meta, { v: info[0], plat: 'web', apk: '', lang: 'fr', nav: info[2], ua: info[1] }, 'meta du contrat');
  assert.equal(b.imgs.length, 3);
  const sizes = b.imgs.map(u => { assert.match(u, /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/); const buf = Buffer.from(u.slice(23), 'base64'); assert.ok(buf.length <= 1.5 * 1024 * 1024, 'capture ≤ 1,5 Mo : ' + buf.length); return jpegSize(buf); });
  assert.deepEqual(sizes[0], { w: 1600, h: 800 }); assert.ok(sizes[1].w < 1600 && sizes[1].w >= 800); assert.deepEqual(sizes[2], { w: 120, h: 90 }, 'petite image : taille gardée');
  assert.doesNotMatch(JSON.stringify(b), /Sol Ring|Craterhoof/, 'jamais la collection');
  assert.equal(await txt(p, '.fb-done h3'), 'Merci !'); assert.equal(await p.evaluate(() => document.activeElement.tagName), 'H3', 'focus sur « Merci ! »');
  assert.equal(await p.$eval('.fb-done [data-fb="see"]', a => [a.textContent, a.getAttribute('href'), a.target, a.rel].join()), 'Voir sur Discord,' + FB_URL + ',_blank,noopener');
  assert.equal(await p.$eval('.fb-done [data-fb="join"]', a => [a.textContent, a.getAttribute('href'), a.target].join()), 'Rejoindre le serveur,https://discord.gg/TTwrP94agb,_blank');
  assert.equal(await p.evaluate(() => prgC().fb), 1, 'badge « Voix du peuple » après l\'envoi');
  await p.waitForTimeout(300); await p.screenshot({ path: 'shots/content-2b-merci.png' });
  // brouillon vidé ; connecté : jeton Firebase ; adresse reçue qui n'est pas un fil Discord : pas de « Voir sur Discord »
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.fb-sheet.open'));
  assert.equal(await p.evaluate(() => sessionStorage.getItem('deckdeal:fb')), null, 'brouillon vidé (session)');
  await closeSheets(p); await p.evaluate(() => { window.__idTok = 'jeton-test'; }); await signInFake(p);
  await openMe(p, 'aide'); await p.waitForSelector('#helpBox .btn'); await mailClick(p, '#helpBox a[data-help="mail"]'); await p.waitForSelector(FB_SHEET);
  assert.deepEqual(await fbVals(p), { kind: 'bug', area: 'autre', title: '', text: '', contact: '', imgs: 0 }, 'feuille vide après un envoi réussi');
  await p.click('.fb-kind .seg-opt[data-v="help"]'); await p.fill('#fbTitle', 'Exporter ?'); await p.fill('#fbText', 'Comment exporter ?');
  fb.next.push({ status: 200, json: { ok: true, url: 'https://evil.example/x', id: '1' } });
  await p.focus('#fbText'); await p.keyboard.press('Control+Enter'); await p.waitForSelector('.fb-sheet .fb-done');
  const c2 = fb.calls.at(-1);
  assert.equal(c2.headers['x-firebase-token'], 'jeton-test', 'connecté : jeton Firebase'); assert.deepEqual([c2.body.kind, c2.body.area, c2.body.imgs.length, c2.body.contact], ['help', 'autre', 0, '']);
  assert.equal(await p.$('.fb-done [data-fb="see"]'), null, 'adresse qui n\'est pas un fil Discord : pas de lien'); assert.ok(await p.$('.fb-done [data-fb="join"]'));
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.fb-sheet.open'));
  // 404 : envoi coupé → repli mailto (message recopié), et « Envoyer un avis » repasse au mailto
  await mailClick(p, '#helpBox a[data-help="mail"]'); await p.waitForSelector(FB_SHEET);
  await p.fill('#fbTitle', 'Bot coupé'); await p.fill('#fbText', 'Ligne 1\nLigne 2');
  fb.next.push({ status: 404, json: { error: 'not_found' } }); await p.click('.fb-sheet [data-fb="go"]'); await p.waitForSelector('.fb-sheet [data-fb="mail"]');
  assert.match(await fbErr(p), /par e-mail/); assert.equal(await p.evaluate(() => CTX.feedback), false, '404 : CTX.feedback = false');
  const mh = await p.$eval('.fb-sheet [data-fb="mail"]', a => a.getAttribute('href'));
  assert.match(mh, /^mailto:contact@manaorbit\.app\?subject=Mana%20Orbit%20%C2%B7%20avis&body=/);
  assert.match(decodeURIComponent(mh.split('body=')[1]), /^Bot coupé\r\n\r\nLigne 1\r\nLigne 2\r\n\r\n———\r\nCes informations aident/, 'mailto : le message déjà écrit, puis la version');
  await closeSheets(p); await openMe(p, 'aide'); await p.waitForSelector('#helpBox .btn');
  const m2 = await mailClick(p, '#helpBox a[data-help="mail"]'); assert.equal(m2.prevented, false); assert.equal(m2.sheet, false, 'après le 404 : mailto');
  await ctx.close();
}
ok('avis par le Discord : feuille au lieu du mailto (réglages, pied de l\'aide), type / partie / titre / description / pseudo, requis, captures réduites (1 600 px, ≤ 1,5 Mo, JPEG), 3 au plus, ✕, image illisible, 360 px sombre');
ok('avis : corps exact (kind, area, meta, imgs), bouton coupé pendant l\'envoi, 429 (N min), 503, réseau, 400, 413 (saisie gardée), « Merci ! » (Voir sur Discord, Rejoindre le serveur, badge), brouillon gardé puis vidé, jeton Firebase, 404 → mailto');
{ // anglais, depuis le pied de « Comment ça marche », thème clair
  const { p, ctx, fb } = await fbPage({ path: '?lang=en' });
  await p.click('#btnHelp'); await p.waitForSelector('.hp-sheet.open');
  await mailClick(p, '.hp-sheet .sheet-foot a[data-help="mail"]'); await p.waitForSelector(FB_SHEET);
  assert.equal(await txt(p, '.fb-sheet .sheet-head h2'), 'Send feedback'); assert.match(await txt(p, '.fb-sheet .sheet-head p'), /It goes to the Mana Orbit Discord/);
  assert.deepEqual(await p.$$eval('.fb-kind .seg-opt', b => b.map(x => x.textContent)), ['Bug', 'Idea', 'Question']);
  assert.deepEqual(await p.$$eval('#fbArea option', o => o.map(x => x.textContent)), ['Scan', 'Collection', 'Decks', 'Price', 'Account and sync', 'Alerts', 'Trade', 'Game', 'Mystery card', 'Friends', 'Other']);
  assert.match(await p.$eval('#fbText', e => e.placeholder), /^Steps: .*\nExpected: .*\nActual: /);
  assert.match(await txt(p, '.fb-why'), /never your collection\. Your message will be public on the Mana Orbit Discord\./);
  assert.deepEqual(await p.$$eval('.fb .label', l => l.map(x => x.textContent)), ['Type', 'Part of the app', 'Title', 'Description', 'Screenshots', 'Discord username (optional)']);
  await fbSend(p); assert.match(await fbErr(p), /Give your feedback a title/);
  await p.setInputFiles('#fbFile', [IMG.bad]); await p.waitForFunction(() => /Unreadable image/.test(document.querySelector('.fb-err').textContent));
  await p.fill('#fbTitle', 'Dark mode'); await p.fill('#fbText', 'More contrast please'); await p.click('.fb-kind .seg-opt[data-v="idea"]');
  fb.next.push({ status: 429, json: { error: 'rate_limited', retry: 30 } }); await fbSend(p); assert.match(await fbErr(p), /try again in 1 min/);
  await fbSend(p); await p.waitForSelector('.fb-sheet .fb-done');
  assert.equal(fb.calls.at(-1).body.meta.lang, 'en'); assert.equal(fb.calls.at(-1).body.kind, 'idea');
  assert.equal(await txt(p, '.fb-done h3'), 'Thank you!'); assert.equal(await txt(p, '.fb-done [data-fb="see"]'), 'View on Discord'); assert.equal(await txt(p, '.fb-done [data-fb="join"]'), 'Join the server');
  await closeSheets(p); await openMe(p, 'aide'); await p.waitForSelector('#helpBox .btn');
  assert.match(await txt(p, '#helpBox'), /Join the Discord/); assert.match(await txt(p, '#helpBox .hint'), /goes to the Mana Orbit Discord/);
  await ctx.close();
}
ok('avis en anglais : feuille, types, parties, textes d\'aide, erreurs (titre, image illisible, 429), « Thank you! », « Join the Discord »');
{ // textes de l'avis (help.js) : traduits dans les 5 langues
  const { readFileSync, readdirSync } = await import('node:fs');
  const src = readFileSync('src/help.js', 'utf8'), keys = new Set();
  for (const m of src.matchAll(/\bTN?\(\s*(?:[\w.]+\s*,\s*)?'((?:[^'\\]|\\.)*)'(?:\s*,\s*'((?:[^'\\]|\\.)*)')?/g)) for (const k of [m[1], m[2]]) if (k) keys.add(k.replace(/\\'/g, '\'').replace(/\\n/g, '\n'));
  for (const m of src.matchAll(/\['[a-z]+', '([^']+)'\]/g)) keys.add(m[1]);      // libellés de FB_KINDS et FB_AREAS
  assert.ok(keys.size >= 60, 'textes trouvés : ' + keys.size);
  for (const l of ['en', 'de', 'es', 'it', 'pt']) {
    const all = Object.assign({}, ...readdirSync('src/i18n').filter(f => f.startsWith(l + '.')).map(f => JSON.parse(readFileSync('src/i18n/' + f, 'utf8'))));
    assert.deepEqual([...keys].filter(k => !(k in all)), [], l + ' : textes de help.js sans traduction');
  }
  ok(keys.size + ' textes de help.js traduits en anglais, allemand, espagnol, italien et portugais');
}

/* ── 3) Demande de note ───────────────────────────────────────────────────────────────────────────────────────── */
// appli Android simulée (coque avec le plugin ManaOrbit : version de l'APK), collection et deck enregistré prêts à être « complets »
const shell = `window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => n === 'ManaOrbit', Plugins: { ManaOrbit: {
  setWidget: async () => ({}), info: async () => ({ firebase: true, version: '1.0', build: 1 }), addListener: () => ({ remove: async () => {} }) } } };`;
const seedRate = (o = {}) => `try { const now = Date.now();
  localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: '2 Sol Ring\\n1 Arcane Signet\\n1 Command Tower\\n1 Wrath of God', u: 1, s: '', b: null }));
  localStorage.setItem('deckdeal:decks:v1', JSON.stringify(['d1', 'd2', 'd3', 'd4', 'd5'].map((id, i) => ({ id, name: 'Deck ' + (i + 1), text: '1 Sol Ring\\n1 Arcane Signet', opts: {}, cards: 2, updatedAt: now - 3600e3 }))));
  ${o.onboard === false ? '' : `localStorage.setItem('deckdeal:onboard', String(now - ${o.days ?? 5} * ${DAY}));`}
  ${o.state ? `localStorage.setItem('deckdeal:rate', ${JSON.stringify(JSON.stringify(o.state))}.replace('"AT"', String(now - ${o.ago || 0})));` : ''}
  } catch (e) {}`;
// APK 1.0.6 : ManaOrbit.requestReview (In-App Review de Google Play) ; 'ok' : parcours fini (Google affiche sa carte ou non), 'fail' : Play Store absent ou refus
const review = how => `window.__rv = 0; window.Capacitor.Plugins.ManaOrbit.requestReview = async () => { window.__rv++; ${how === 'fail' ? "throw new Error('Play Store absent');" : 'return { ok: true };'} };`;
const mount = (p, id) => p.evaluate(id => { const d = findDeck(id); engSet(id, d.name, d.text); }, id);
const sheetUp = p => p.$('.rate-sheet');
const rateSt = p => p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:rate') || 'null'));
async function ratePage(o = {}) {
  const pg = await page({ init: seedRate(o) + (o.web ? '' : shell) + (o.review ? review(o.review) : ''), ctx: o.ctx });
  await pg.p.evaluate(url => { RATE.wait = 300; if (url) RATE.url = url; }, o.url === undefined ? PLAY : o.url);
  await pg.p.evaluate(() => { document.addEventListener('click', e => { if (e.target.closest('[data-rate="go"]')) e.preventDefault(); }, true); });      // « Noter » : on garde la page (le lien est vérifié à part)
  await pg.p.evaluate(() => homeSoon(0)); await pg.p.waitForTimeout(300);                                                                               // premier relevé des decks complets (aucun)
  return pg;
}
{ // RATE_ASK faux (valeur livrée) : rien, même dans l'appli et après un bon moment, alors que PLAY_URL est rempli (barre « Ouvrir dans l'appli », applink.js)
  const { p, ctx } = await ratePage({ url: '' });
  assert.equal(await p.evaluate(() => [RATE_ASK, PLAY_URL, RATE.url, isNativeApp()].join('|')), 'false|https://play.google.com/store/apps/details?id=app.manaorbit||true');
  await mount(p, 'd1'); await p.waitForTimeout(1500);
  assert.equal(await sheetUp(p), null, 'aucune demande'); assert.equal(await rateSt(p), null, 'rien d\'enregistré');
  await openMe(p, 'aide'); await p.waitForSelector('#helpBox .btn');
  assert.equal(await p.$('#helpBox [data-help="rate"]'), null, 'pas de bouton « Noter »');
  await ctx.close();
}
ok('note : coupée tant que RATE_ASK est faux (ni demande, ni bouton, ni compteur)');
{ // appli Android, adresse de test : deck devenu complet → demande neutre, après la fermeture de la feuille ouverte
  const { p, ctx } = await ratePage({ ctx: { colorScheme: 'dark' } });
  assert.deepEqual((await rateSt(p)).dk, [], 'premier relevé des decks complets');
  await openMe(p, 'aide'); await p.waitForSelector('#helpBox [data-help="rate"]');
  assert.equal(await p.$eval('#helpBox [data-help="rate"]', a => [a.getAttribute('href'), a.target].join()), PLAY + ',_blank', 'Réglages : « Noter sur le Play Store »');
  assert.match(await p.$eval('#helpBox a[data-help="mail"]', a => decodeURIComponent(a.getAttribute('href'))), /Plateforme : appli Android 1\.0 \(1\)/, 'avis : version de l\'APK');
  await mount(p, 'd1'); await p.waitForTimeout(1200);
  assert.equal(await sheetUp(p), null, 'feuille ouverte (Réglages) : la demande attend');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); assert.equal(await sheetUp(p), null, 'encore une feuille (Compte et réglages) : la demande attend'); await p.keyboard.press('Escape');
  await p.waitForSelector('.rate-sheet.open', { timeout: 4000 });
  assert.equal(await txt(p, '.rate-sheet .sheet-head h2'), 'Noter Mana Orbit');
  assert.equal(await txt(p, '.rate-sheet .rate-hero p'), 'Si Mana Orbit t\'est utile, une note sur le Play Store aide beaucoup.');
  assert.deepEqual(await p.$$eval('.rate-sheet .sheet-foot .btn', b => b.map(x => x.textContent)), ['Plus tard', 'Noter'], 'deux choix, aucune question sur l\'avis');
  assert.equal(await p.$eval('.rate-sheet [data-rate="go"]', a => [a.getAttribute('href'), a.target, a.rel].join()), PLAY + ',_blank,noopener');
  assert.equal(await p.$$eval('.rate-sheet input, .rate-sheet [role="radio"], .rate-sheet .star', e => e.length), 0, 'aucune note à choisir dans l\'appli');
  await p.waitForTimeout(500); await p.screenshot({ path: 'shots/content-3-note.png' });
  let st = await rateSt(p); assert.equal(st.n, 1); assert.ok(Date.now() - st.at < 60000);
  await p.click('.rate-sheet [data-close].btn'); await p.waitForFunction(() => !document.querySelector('.rate-sheet'));
  ok('note : demande neutre « Noter » / « Plus tard » après un deck devenu complet, une fois la feuille ouverte fermée');
  // « Plus tard » : plus rien pendant 120 jours, même après un nouveau bon moment
  await mount(p, 'd2'); await p.waitForTimeout(1500); assert.equal(await sheetUp(p), null, '« Plus tard » : rien avant 120 jours');
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('deckdeal:rate')); s.at -= 119 * 864e5; localStorage.setItem('deckdeal:rate', JSON.stringify(s)); });
  await mount(p, 'd3'); await p.waitForTimeout(1500); assert.equal(await sheetUp(p), null, '119 jours : toujours rien');
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('deckdeal:rate')); s.at -= 2 * 864e5; localStorage.setItem('deckdeal:rate', JSON.stringify(s)); });
  await mount(p, 'd4'); await p.waitForSelector('.rate-sheet.open', { timeout: 4000 });
  st = await rateSt(p); assert.equal(st.n, 2, '121 jours plus tard : de nouveau');
  await p.click('.rate-sheet [data-rate="go"]'); await p.waitForFunction(() => !document.querySelector('.rate-sheet'));
  assert.equal((await rateSt(p)).done, 1, '« Noter » : plus jamais');
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('deckdeal:rate')); s.at -= 400 * 864e5; localStorage.setItem('deckdeal:rate', JSON.stringify(s)); });
  await mount(p, 'd5'); await p.waitForTimeout(1500); assert.equal(await sheetUp(p), null, 'après « Noter » : jamais plus');
  ok('note : « Plus tard » = 120 jours ; « Noter » = plus jamais');
  await ctx.close();
}
{ // un deck démonté puis remonté, ou déjà complet au premier relevé : pas un nouveau moment ; 3 demandes au plus
  const { p, ctx } = await ratePage({ state: { n: 3, at: 'AT', dk: [] }, ago: 200 * DAY });
  await mount(p, 'd1'); await p.waitForTimeout(1500); assert.equal(await sheetUp(p), null, '3 demandes déjà faites : plus jamais'); await ctx.close();
}
for (const [o, why] of [[{ web: true }, 'navigateur (pas l\'appli Android)'], [{ days: 3 }, 'première utilisation il y a 3 jours'], [{ onboard: false }, 'première utilisation inconnue']]) {
  const { p, ctx } = await ratePage(o);
  await mount(p, 'd1'); await p.waitForTimeout(1500); assert.equal(await sheetUp(p), null, why + ' : aucune demande'); await ctx.close();
}
{ // session avec une erreur : aucune demande
  const { p, ctx } = await ratePage();
  await p.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: 'test' })));
  await mount(p, 'd1'); await p.waitForTimeout(1500); assert.equal(await sheetUp(p), null, 'erreur dans la session : aucune demande'); await ctx.close();
}
ok('note : seulement dans l\'appli Android, après 4 jours d\'utilisation, 3 fois au plus, jamais dans une session avec une erreur');
{ // fin d'un scan : 5 exemplaires ajoutés ou plus = bon moment (la demande attend la fin du toast « Annuler ») ; moins de 5 : rien
  const { p, ctx } = await ratePage();
  const scanAdd = items => p.evaluate(items => { SC.items = new Map(items.map(([name, q], i) => ['s' + i, { id: 's' + i, key: ownKey(name), name, q, l: 'fr', maybe: false }])); scanRecap(); }, items);
  await scanAdd([['Llanowar Elves', 2], ['Edgar Markov', 2]]); await p.waitForSelector('.rc-sheet.open [data-rc="go"]'); await rcGo(p);
  await p.waitForSelector('#toast.on'); await p.evaluate(() => document.querySelector('#toast').classList.remove('on')); await p.waitForTimeout(1500);
  assert.equal(await sheetUp(p), null, '4 exemplaires : pas assez');
  await scanAdd([['Swords to Plowshares', 3], ['Llanowar Elves', 2]]); await p.waitForSelector('.rc-sheet.open [data-rc="go"]'); await rcGo(p);
  await p.waitForSelector('#toast.on'); await p.waitForTimeout(1200);
  assert.equal(await sheetUp(p), null, 'toast « Annuler » à l\'écran : la demande attend');
  await p.evaluate(() => document.querySelector('#toast').classList.remove('on'));
  await p.waitForSelector('.rate-sheet.open', { timeout: 4000 });
  assert.equal(await p.evaluate(() => COLL.map[ownKey('Swords to Plowshares')].q), 3, 'cartes bien ajoutées');
  await ctx.close();
}
ok('note : après 5 exemplaires ou plus ajoutés d\'un scan, une fois le toast parti');
{ // APK 1.0.6 : au même bon moment, la carte de note de Google Play (In-App Review) au lieu de notre feuille ; comptée comme une demande (120 jours, 3 au plus)
  const { p, ctx } = await ratePage({ review: 'ok' });
  await openMe(p, 'aide'); await p.waitForSelector('#helpBox [data-help="rate"]');
  assert.equal(await p.$eval('#helpBox [data-help="rate"]', a => a.getAttribute('href')), PLAY, 'Réglages : « Noter sur le Play Store » reste un lien vers la fiche (jamais la carte de Google depuis un bouton)');
  assert.equal(await p.evaluate(() => window.__rv), 0, 'le bouton des réglages n\'appelle pas In-App Review');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); await p.keyboard.press('Escape');
  await mount(p, 'd1'); await p.waitForFunction(() => window.__rv === 1, null, { timeout: 5000 }); await p.waitForTimeout(600);
  assert.equal(await sheetUp(p), null, 'pas notre feuille : la carte de Google');
  let st = await rateSt(p); assert.equal(st.n, 1, 'comptée comme une demande'); assert.ok(Date.now() - st.at < 60000); assert.ok(!st.done, 'Google ne dit pas si une note a été laissée : pas de « plus jamais »');
  await mount(p, 'd2'); await p.waitForTimeout(1500); assert.equal(await p.evaluate(() => window.__rv), 1, 'pas avant 120 jours');
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('deckdeal:rate')); s.at -= 121 * 864e5; localStorage.setItem('deckdeal:rate', JSON.stringify(s)); });
  await mount(p, 'd3'); await p.waitForFunction(() => window.__rv === 2, null, { timeout: 5000 });
  st = await rateSt(p); assert.equal(st.n, 2, '121 jours plus tard : de nouveau');
  await ctx.close();
}
{ // Play Store absent ou refus (appli installée hors du Play Store) : notre feuille, qui ouvre la fiche
  const { p, ctx } = await ratePage({ review: 'fail' });
  await mount(p, 'd1'); await p.waitForSelector('.rate-sheet.open', { timeout: 5000 });
  assert.equal(await p.evaluate(() => window.__rv), 1); assert.equal(await p.$eval('.rate-sheet [data-rate="go"]', a => a.getAttribute('href')), PLAY);
  assert.equal((await rateSt(p)).n, 1, 'une seule demande comptée');
  await ctx.close();
}
ok('note, APK 1.0.6 : carte In-App Review de Google au bon moment (mêmes limites, 120 jours, comptée), jamais depuis le bouton des réglages ; refus du Play Store : notre feuille');

assert.deepEqual(errsAll.flat(), [], 'aucune erreur page : ' + errsAll.flat().join(' | '));
await browser.close(); world.stop();
console.log('\nCONTENT E2E OK'); process.exit(0);
