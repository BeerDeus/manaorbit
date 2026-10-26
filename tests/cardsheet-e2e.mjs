// E2E fiche d'une carte (src/cardsheet.js) : ouverture depuis la collection (ligne, pas la vignette), l'Échange (propriétaire) et le scan ; exemplaires par
// langue × édition × foil (− / + et « Annuler », emplacement, édition, langue, « Ajouter un exemplaire ») ; prix Cardmarket normal et foil de l'édition, valeur,
// offre CardTrader (« Voir les offres ») ; decks qui l'utilisent (monté, ouvrir le deck), « Ajouter à un deck » (Annuler, singleton Commander) ; Échange (« Garder »,
// « Je recherche ») ; « Suivre le prix » (hausse et baisse : u envoyé au serveur) ; texte Oracle FR + EN et légalités (faux Scryfall de ce test) ; évolution du prix
// sur 30 jours (faux /api/hist : courbe, 7 et 30 jours, plus bas et plus haut ; sans historique, un seul relevé ou hors ligne : la variation connue) ; hors ligne.
// Captures : 393 clair et sombre, 360 clair, 1280 clair (fenêtre), hors ligne → $SHOTS (défaut shots/cardsheet).
import './setup-env.mjs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, createECDH, randomBytes } from 'node:crypto';
import { chromium, startWorld, newPage, txt, ok, toHome, closeSheets } from './e2e-world.mjs';

const SHOTS = process.env.SHOTS || 'shots/cardsheet'; mkdirSync(SHOTS, { recursive: true });
// serveur des alertes : faux Scryfall (relevés) et faux service de push
const upScry = http.createServer((req, res) => { const c = []; req.on('data', x => c.push(x)); req.on('end', () => { const b = JSON.parse(Buffer.concat(c).toString() || '{}'); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ object: 'list', not_found: [], data: (b.identifiers || []).map(i => ({ name: i.name, prices: { eur: '1.50' } })) })); }); });
const upPush = http.createServer((req, res) => { req.resume(); req.on('end', () => { res.writeHead(201); res.end(); }); });
for (const s of [upScry, upPush]) await new Promise(r => s.listen(0, '127.0.0.1', r));
const vk = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' });
const VPUB = Buffer.concat([Buffer.from([4]), Buffer.from(vk.x, 'base64url'), Buffer.from(vk.y, 'base64url')]).toString('base64url');
const sub = (() => { const e = createECDH('prime256v1'); e.generateKeys(); return { endpoint: `http://127.0.0.1:${upPush.address().port}/send/cs`, keys: { p256dh: e.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } }; })();
const world = await startWorld({ port: 19810, env: { VAPID_PUBLIC_KEY: VPUB, VAPID_PRIVATE_KEY: vk.d, VAPID_SUBJECT: 'mailto:test@example.com', PUSH_ALLOW_HOSTS: `127.0.0.1:${upPush.address().port}`,
  SCRYFALL_UPSTREAM: `http://127.0.0.1:${upScry.address().port}`, ALERT_FILE: join(mkdtempSync(join(tmpdir(), 'cs-')), 'alerts.json'), ALERT_FIRST_MS: '3600000', ALERT_SEED_MS: '150' } });
world.eds['cmm|400'] = { n: 'Sol Ring', langs: ['fr'] };      // Sol Ring CMM 400 : 2,00 € et 6,00 € foil (faux Scryfall de e2e-world)
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });

// Notifications simulées (comme alerts-e2e) ; decks et collection posés avant le chargement
const init = arg => {
  Object.defineProperty(Notification, 'permission', { configurable: true, get: () => localStorage.getItem('__perm') || 'default' });
  Notification.requestPermission = async () => { localStorage.setItem('__perm', 'granted'); return 'granted'; };
  const mgr = { getSubscription: async () => { const x = JSON.parse(localStorage.getItem('__sub') || 'null'); return x ? { endpoint: x.endpoint, toJSON: () => x, unsubscribe: async () => true } : null; }, subscribe: async () => { localStorage.setItem('__sub', JSON.stringify(arg.sub)); return mgr.getSubscription(); } };
  Object.defineProperty(ServiceWorkerRegistration.prototype, 'pushManager', { configurable: true, get: () => mgr });
  if (!localStorage.getItem('deckdeal:decks:v1')) localStorage.setItem('deckdeal:decks:v1', JSON.stringify([
    { id: 'dA', name: 'Deck A', text: '1 Sol Ring\n1 Arcane Signet\n1 Swords to Plowshares', updatedAt: Date.now() - 1000 },
    { id: 'dB', name: 'Edgar', text: '// Deck Deal : commander\nCommander\n1 Edgar Markov\n\nDeck\n1 Sol Ring\n1 Command Tower', updatedAt: Date.now() - 2000 },
    { id: 'dC', name: 'Burn', text: '4 Wrath of God\n2 Llanowar Elves\n\nSB: 2 Swords to Plowshares', updatedAt: Date.now() - 3000 }]));
};
const { ctx, p, errs } = await newPage(browser, world, { sw: true, init: `(${init})(${JSON.stringify({ sub })})` });
// faux Scryfall en plus : texte Oracle et légalités (/cards/named sans format=image), texte imprimé français (recherche « lang:fr », unique=prints, order=released, sans dir)
const ORACLE = { 'Sol Ring': { type_line: 'Artifact', mana_cost: '{1}', oracle_text: '{T}: Add {C}{C}.', rarity: 'uncommon', legalities: { standard: 'not_legal', pioneer: 'not_legal', modern: 'not_legal', legacy: 'banned', vintage: 'restricted', pauper: 'not_legal', commander: 'legal', oathbreaker: 'banned', brawl: 'not_legal', historic: 'not_legal' } },
  'Arcane Signet': { type_line: 'Artifact', mana_cost: '{2}', oracle_text: '{T}: Add one mana of any color in your commander\'s color identity.', rarity: 'common', legalities: { commander: 'legal', legacy: 'legal', vintage: 'legal' } } };
const orHits = [];
// noms imprimés français (fr-names.tsv, « imprimé \t anglais \t image ») : les cartes du monde de test + remplissage (500 lignes au moins)
await ctx.route('**/fr-names.tsv', r => r.fulfill({ status: 200, contentType: 'text/tab-separated-values; charset=utf-8', body: '# fr-names\n' + [['Anneau solaire', 'Sol Ring'], ['Sceau arcanique', 'Arcane Signet'], ['Colère de Dieu', 'Wrath of God'], ['Elfes de Llanowar', 'Llanowar Elves'], ['Béhémoth Cratérosabot', 'Craterhoof Behemoth'], ...Array.from({ length: 520 }, (_, i) => ['Vrombl ' + i, 'Vrombl Card ' + i])].map(([a, b]) => a + '\t' + b + '\t').join('\n') + '\n' }));
await p.route('https://api.scryfall.com/cards/**', route => {
  const u = new URL(route.request().url()), h = { 'access-control-allow-origin': '*' };
  if (u.pathname === '/cards/named' && u.searchParams.get('format') !== 'image') {
    const n = u.searchParams.get('exact'), o = ORACLE[n]; orHits.push('named ' + n);
    return o ? route.fulfill({ status: 200, headers: h, json: { object: 'card', name: n, lang: 'en', set: 'cmm', set_name: 'Commander Masters', collector_number: '400', scryfall_uri: 'https://scryfall.com/card/cmm/400/sol-ring', ...o } }) : route.fulfill({ status: 404, headers: h, json: { object: 'error' } });
  }
  const q = u.searchParams.get('q') || '';
  if (u.pathname === '/cards/search' && u.searchParams.get('unique') === 'prints' && u.searchParams.get('order') === 'released' && !u.searchParams.get('dir') && /lang:fr/.test(q)) {
    orHits.push('fr ' + q);
    if (/Sol Ring/.test(q)) return route.fulfill({ status: 200, headers: h, json: { object: 'list', has_more: false, data: [{ name: 'Sol Ring', lang: 'fr', printed_name: 'Anneau solaire', printed_type_line: 'Artefact', printed_text: '{T} : Ajoutez {C}{C}.' }] } });
    return route.fulfill({ status: 404, headers: h, json: { object: 'error' } });
  }
  return route.fallback();
});
const sheetOpen = () => p.waitForSelector('.cs-sheet.open .cs-hd', { timeout: 6000 });
const csClose = async () => { await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.cs-sheet'), null, { timeout: 4000 }); };
const lnTxt = () => p.$$eval('.cs-sheet .cs-ln', r => r.map(x => x.dataset.g + ' ' + x.querySelector('.qstep b').textContent));
const toastTxt = () => txt(p, '#toast');
const shot = async (name, o = {}) => { await p.waitForTimeout(o.wait || 350); await p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); };

/* ── Collection : Sol Ring FR × 2 sans édition, EN CMM 400 × 1 et foil × 1 ; Arcane Signet FR × 3 ; Deck A monté ───────────── */
await p.evaluate(() => {
  COLL.map = { 'sol ring': collFromLines({ n: 'Sol Ring', d: 1760000000 }, [['fr', 2], ['en|cmm|400', 1], ['en|cmm|400*', 1]]), 'arcane signet': collFromLines({ n: 'Arcane Signet', d: 1760000000 }, [['fr', 3]]), 'craterhoof behemoth': collFromLines({ n: 'Craterhoof Behemoth' }, [['en', 1]]) };
  collChanged(); engSet('dA', 'Deck A', findDeck('dA').text);
});
await toHome(p); await p.click('#btnColl'); await p.waitForSelector('.coll.on');
await p.waitForFunction(() => document.querySelectorAll('.crow[data-k="sol ring"]').length === 3 && COLL.meta['sol ring'] && COLL.ed['cmm|400'], null, { timeout: 10000 });
await p.waitForFunction(() => FRX.ix && frOf('sol ring'), null, { timeout: 10000 }).catch(() => {});
const fr = await p.evaluate(() => frOf('sol ring'));

// la vignette garde la carte en grand ; le reste de la ligne ouvre la fiche
await p.evaluate(() => collPaint());      // infos lues : vignettes et noms imprimés
await p.click('.crow[data-k="sol ring"] .thumb'); await p.waitForSelector('.imgv.on'); assert.equal(await p.$('.cs-sheet'), null, 'vignette : carte en grand, pas la fiche');
await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.imgv'));
await p.click('.crow[data-k="sol ring"][data-ln="fr"] .qstep [data-d="1"]'); assert.equal(await p.$('.cs-sheet'), null, '+ de la liste : pas de fiche');
assert.equal(await p.evaluate(() => collQty('sol ring')), 5); await p.evaluate(() => collBump('sol ring', 'Sol Ring', -1, { lang: 'fr' }));
await p.click('.crow[data-k="sol ring"][data-ln="fr"] .row-name'); await sheetOpen();
assert.equal(await p.evaluate(() => CS.o.from), 'coll');
assert.equal(await txt(p, '.cs-sheet .sheet-head h2'), fr || 'Sol Ring', 'titre : nom imprimé de la carte française');
if (fr) assert.equal(await txt(p, '.cs-sheet .sheet-head p'), 'Sol Ring', 'l\'autre nom en petit');
assert.deepEqual(await lnTxt(), ['fr 2', 'en|cmm|400 1', 'en|cmm|400* 1'], 'une ligne par langue × édition × foil');
assert.match(await txt(p, '.cs-ln[data-g="fr"]'), /Sans édition/); assert.match(await txt(p, '.cs-ln[data-g="en|cmm|400*"] .cs-lt'), /^CMM Set ✦ Foil CMM 400 · 6,00 € pièce$/);
assert.equal(await p.$eval('.cs-ln[data-g="fr"]', r => r.classList.contains('on')), true, 'ligne touchée mise en avant');
await p.waitForSelector('.cs-sheet .cs-or .cs-lg', { timeout: 6000 });
assert.match(await txt(p, '.cs-sheet .cs-hd'), /CMM Set · CMM 400 Rare Artefact/, 'extension (une ligne en a une), rareté de l\'édition, type imprimé en français'); assert.match(await txt(p, '.cs-hd .cs-sum'), /4 exemplaires · 2 langues/);
ok('collection : la ligne ouvre la fiche (vignette et − / + gardent leur geste) ; une ligne par langue × édition × foil ; nom imprimé et anglais');

/* ── Prix : normal et foil de l'édition, carte sans édition, valeur ───────────────────────────── */
const prs = await p.$$eval('.cs-sheet .cs-pr:not(.cs-ph)', r => r.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
assert.equal(prs.length, 2); assert.match(prs[0], /Sans édition.*1,50 €.*—/); assert.match(prs[1], /CMM 400 2,00 € 6,00 €/);
assert.match(await txt(p, '.cs-sheet .cs-val'), /Valeur de tes 4 exemplaires 11,00 €/, '2 × 1,50 + 2,00 + 6,00 (foil)');
assert.match(await txt(p, '.cs-ln[data-g="en|cmm|400*"] .cs-lt small'), /6,00 € pièce/, 'ligne foil : prix foil');
// offre CardTrader : « Voir les offres » (une carte, comme le prix rapide), puis le lien CardTrader
assert.equal(await p.$('.cs-sheet a[href^="https://www.cardtrader.com/cards/"]'), null);
await p.click('.cs-sheet [data-cs="ct"]'); await p.waitForFunction(() => COLL.px['sol ring'] && COLL.px['sol ring'].t && !document.querySelector('.cs-ct .cs-spin'), null, { timeout: 15000 });
assert.match(await txt(p, '.cs-sheet .cs-ct'), /CardTrader offre la moins chère · FR 1,50 €/);
assert.equal(await p.$eval('.cs-sheet a[href^="https://www.cardtrader.com/cards/"]', a => a.getAttribute('href')), 'https://www.cardtrader.com/cards/100?share_code=manaorbit');
assert.match(await p.$eval('.cs-sheet a[href*="cardmarket.com"]', a => a.href), /cardmarket\.com\/fr\/Magic\/Products\/Search\?searchString=Sol%20Ring/);
ok('prix : tendance Cardmarket normal et foil de l\'édition, référence sans édition, valeur ; offre CardTrader lue pour cette carte, lien CardTrader et Cardmarket');

/* ── Decks : Deck A (monté) et Edgar ; texte et légalités ─────────────────────────────────────── */
assert.deepEqual(await p.$$eval('.cs-sheet .cs-dk', b => b.map(x => x.innerText.replace(/\s+/g, ' ').trim())), ['Deck A × 1 monté · 1 réservée', 'Edgar Commander · × 1']);
const ortxt = await txt(p, '.cs-sheet .cs-or');
assert.match(ortxt, /Texte imprimé Anneau solaire Artefact \{T\} : Ajoutez \{C\}\{C\}\./); assert.match(ortxt, /Oracle \(anglais\) Artifact · \{1\} \{T\}: Add \{C\}\{C\}\./);
assert.deepEqual(await p.$$eval('.cs-sheet .cs-lgi', l => l.map(x => x.className.split(' ')[1] + ':' + x.querySelector('b').textContent)), ['not_legal:Standard', 'not_legal:Pioneer', 'not_legal:Modern', 'banned:Legacy', 'restricted:Vintage', 'not_legal:Pauper', 'legal:Commander', 'banned:Oathbreaker', 'not_legal:Brawl', 'not_legal:Historic']);
assert.ok(orHits.some(h => /^fr .*Sol Ring/.test(h)), 'texte imprimé lu en français');
ok('decks qui l\'utilisent (monté, format) ; texte imprimé FR, Oracle EN, légalités par format');

/* ── Évolution du prix sur 30 jours (/api/hist) ──────────────────────────────────────────────── */
// serveur de ce test sans historique (503) : la variation connue reste, rien de gardé
await p.waitForFunction(() => CS.h === null, null, { timeout: 6000 });
assert.equal(await p.$('.cs-sheet .cs-hist'), null); assert.match(await txt(p, '.cs-sheet'), /Variation du prix : connue après une semaine de relevés\./, 'sans historique : la variation connue');
// faux historique : 30 jours jusqu'à aujourd'hui, de 1,20 € à 1,50 €, un jour sans prix, plus bas 1,10 € (jour 20)
const D0 = new Date(Date.now() - 29 * 86400e3).toISOString().slice(0, 10), HE = Array.from({ length: 30 }, (_, i) => (i === 10 ? null : i === 20 ? 110 : i === 29 ? 150 : 120 + i));
const histHits = [];
await ctx.route('**/api/hist?**', r => { histHits.push(new URL(r.request().url()).searchParams.getAll('n')); return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'public, max-age=3600' }, body: JSON.stringify({ d: D0, e: HE, u: [] }) }); });
await csClose(); await p.evaluate(() => openCardSheet('sol ring', { l: 'fr' })); await sheetOpen();
await p.waitForSelector('.cs-sheet .cs-hist .vl-svg', { timeout: 6000 });
assert.deepEqual(histHits, [['Sol Ring']], 'une lecture, nom anglais de la carte');
const hs = await p.$eval('.cs-sheet .cs-hist', el => ({ t: el.innerText.replace(/\s+/g, ' ').trim(), tiles: [...el.querySelectorAll('.vl-d')].map(d => d.innerText.replace(/\s+/g, ' ').trim()), vb: el.querySelector('.vl-svg').getAttribute('viewBox'), w: Math.round(el.querySelector('.vl-svg').getBoundingClientRect().width), lbl: el.querySelector('.vl-svg').getAttribute('aria-label').replace(/\s+/g, ' '), up: el.querySelector('.vl-d b').className }));
assert.match(hs.tiles[0], /^7 jours \+0,08 € \+6 % · depuis le /, '7 jours : 1,42 € → 1,50 €'); assert.equal(hs.up, 'vu');
assert.match(hs.tiles[1], /^30 jours \+0,30 € \+25 % · depuis le /, '30 jours : 1,20 € → 1,50 €');
assert.match(hs.t, /Plus bas 1,10 € le .* Plus haut 1,50 € le /); assert.match(hs.t, /Prix « à partir de » : l'impression la moins chère de la carte, non foil\./, 'pas le prix d\'une ligne foil ou d\'une édition');
assert.match(hs.lbl, /^Prix « à partir de » du .* au .* : de 1,20 € à 1,50 €$/);
assert.equal(Number(hs.vb.split(' ')[2]), hs.w, 'courbe à la largeur réelle de la fiche');
assert.doesNotMatch(await txt(p, '.cs-sheet'), /Variation du prix : connue après/, 'la courbe remplace la variation connue');
await csClose(); await p.evaluate(() => openCardSheet('sol ring', { l: 'fr' })); await sheetOpen(); await p.waitForSelector('.cs-sheet .cs-hist .vl-svg', { timeout: 4000 });
assert.equal(histHits.length, 1, 'gardé 6 h : pas de nouvelle lecture');
// moins de 2 relevés (carte toute nouvelle) : la variation connue
await p.evaluate(() => Cache.set('ph1:arcane signet', { d: Date.now(), e: [null, 95] }));
await csClose(); await p.evaluate(() => openCardSheet('arcane signet')); await sheetOpen(); await p.waitForFunction(() => CS.h && CS.h.e, null, { timeout: 4000 });
assert.equal(await p.$('.cs-sheet .cs-hist'), null, 'un seul relevé : pas de courbe'); assert.match(await txt(p, '.cs-sheet'), /Variation du prix : connue après/);
await csClose(); await p.evaluate(() => openCardSheet('sol ring', { l: 'fr' })); await sheetOpen(); await p.waitForSelector('.cs-sheet .cs-hist .vl-svg', { timeout: 4000 });
// captures : la courbe, 393 clair et sombre, 1280 clair
const histShot = async name => { await p.evaluate(() => { const el = document.querySelector('.cs-sheet .cs-hist'); CS.api.body.scrollTop = el.offsetTop - 120; }); await shot(name); };
await p.setViewportSize({ width: 393, height: 852 }); await csClose(); await p.evaluate(() => openCardSheet('sol ring', { l: 'fr' })); await sheetOpen(); await p.waitForSelector('.cs-sheet .cs-hist .vl-svg');
assert.equal(await p.evaluate(() => { const b = document.querySelector('.cs-sheet .sheet-body'); return b.scrollWidth <= b.clientWidth + 1; }), true, '393 : aucun débordement');
await histShot('cs-hist-393-light'); await p.emulateMedia({ colorScheme: 'dark' }); await histShot('cs-hist-393-dark'); await p.emulateMedia({ colorScheme: 'light' });
await p.setViewportSize({ width: 1280, height: 860 }); await csClose(); await p.evaluate(() => openCardSheet('sol ring', { l: 'fr' })); await sheetOpen(); await p.waitForSelector('.cs-sheet .cs-hist .vl-svg');
const hw = await p.$eval('.cs-sheet .cs-hist .vl-svg', s => [Number(s.getAttribute('viewBox').split(' ')[2]), Math.round(s.getBoundingClientRect().width)]); assert.equal(hw[0], hw[1], '1280 : redessinée à sa largeur');
await histShot('cs-hist-1280-light');
ok('évolution du prix : sans historique la variation connue ; courbe 30 jours, 7 et 30 jours, plus bas et plus haut, mention « à partir de » ; gardée 6 h ; un seul relevé : variation connue');

/* ── Captures : 393 clair / sombre, la carte la plus complète ─────────────────────────────────── */
await p.setViewportSize({ width: 393, height: 852 });
await p.evaluate(() => { CS.api.body.scrollTop = 0; }); await shot('cs-393-light');
await p.evaluate(() => { CS.api.body.scrollTop = 99999; }); await shot('cs-393-light-bas');
await p.emulateMedia({ colorScheme: 'dark' }); await p.evaluate(() => { CS.api.body.scrollTop = 0; }); await shot('cs-393-dark');
await p.evaluate(() => { CS.api.body.scrollTop = 520; }); await shot('cs-393-dark-milieu');
await p.emulateMedia({ colorScheme: 'light' }); await p.evaluate(() => { CS.api.body.scrollTop = 0; });

/* ── − / + et « Annuler » (pas de confirmation à chaque −) ───────────────────────────────────── */
const qIs = (g, n) => p.waitForFunction(([g, n]) => { const b = document.querySelector(`.cs-ln[data-g="${g}"] .qstep b`); return b && b.textContent === String(n); }, [g, n], { timeout: 4000 });
await p.click('.cs-ln[data-g="fr"] [data-cs="inc"]'); await qIs('fr', 3);
assert.deepEqual(await lnTxt(), ['fr 3', 'en|cmm|400 1', 'en|cmm|400* 1']);
await p.click('.cs-ln[data-g="fr"] [data-cs="dec"]'); await qIs('fr', 2);
assert.equal(await p.$$eval('.sheet-wrap', w => w.length), 1, 'aucune confirmation ouverte');
assert.match(await toastTxt(), /Sol Ring : un exemplaire retiré \(FR\) · il en reste 2\s*Annuler/);
await p.click('.cs-ln[data-g="en|cmm|400"] [data-cs="dec"]'); await p.waitForFunction(() => document.querySelectorAll('.cs-ln').length === 2);
assert.deepEqual(await lnTxt(), ['fr 2', 'en|cmm|400* 1'], 'dernier exemplaire de la ligne : elle disparaît');
assert.match(await toastTxt(), /Sol Ring : dernier exemplaire \(EN · CMM 400\) retiré/);
await p.click('#toast .toast-act'); await p.waitForFunction(() => document.querySelectorAll('.cs-ln').length === 3);
assert.deepEqual(await lnTxt(), ['fr 2', 'en|cmm|400 1', 'en|cmm|400* 1'], 'Annuler : la ligne revient');
assert.equal(await p.$$eval('.crow[data-k="sol ring"]', r => r.length), 3, 'la liste suit, derrière la fiche');
ok('− sans confirmation, toast « Annuler » (la ligne revient) ; + ; la liste suit');

/* ── Langue d'une ligne, emplacement (feuille existante), édition (rond existant) ────────────── */
await p.selectOption('.cs-ln[data-g="fr"] .lchip select', 'it'); await p.waitForFunction(() => document.querySelector('.cs-ln[data-g="it"]'));
assert.deepEqual(await lnTxt(), ['en|cmm|400 1', 'en|cmm|400* 1', 'it 2'], 'langue changée : la ligne suit');
await p.selectOption('.cs-ln[data-g="it"] .lchip select', 'fr'); await p.waitForFunction(() => document.querySelector('.cs-ln[data-g="fr"]'));
const red = await p.evaluate(() => plcCreate('binder', 'Classeur rouge'));
await p.click('.cs-ln[data-g="fr"] [data-act="cex"]'); await p.waitForSelector('.cex .plc-cur');
await p.click('.cex [data-pp]'); await p.click(`.plc-opt[data-p="${red}"]`); await p.click('.cex-det summary'); await p.click('.cex [data-cc="ex"]'); await p.click('.cex [data-ok]');
await p.waitForFunction(id => document.querySelector(`.cs-ln[data-g="fr#p${id}-cex"]`), red, { timeout: 4000 });
assert.match(await txt(p, `.cs-ln[data-g="fr#p${red}-cex"] .tag.plc`), /Classeur rouge\s*EX/, 'emplacement et état sur la ligne');
await p.click(`.cs-ln[data-g="fr#p${red}-cex"] [data-act="ed"]`); await p.waitForSelector('.ced-sheet.open .ced-t');
await p.click('.ced-sheet .ced-t[data-i="0"]'); await p.waitForFunction(() => collLines(COLL.map['sol ring']).some(([g]) => g.startsWith('fr|cmm|100')), null, { timeout: 4000 });
await p.waitForFunction(() => document.querySelector('.cs-ln[data-g^="fr|cmm|100"]'));
assert.match(await txt(p, '.cs-ln[data-g^="fr|cmm|100"] .cs-lt'), /^Commander Masters CMM 100 · 1,00 € pièce$/, 'édition choisie dans la feuille existante (prix de l\'édition, emplacement gardé)');
assert.equal(await p.evaluate(() => sheets.length), 1, 'retour sur la fiche');
ok('ligne : langue (puce), emplacement et état (fiche d\'exemplaire), édition (feuille d\'édition) ; la fiche suit');

/* ── « Ajouter un exemplaire » : langue, foil ────────────────────────────────────────────────── */
await p.click('.cs-sheet [data-cs="add"]'); await p.waitForSelector('.cs-addw.open #csAl');
await p.selectOption('#csAl', 'de'); await p.click('.cs-addw .switch'); await p.click('.cs-addw [data-ok]');
await p.waitForFunction(() => document.querySelector('.cs-ln[data-g="de*"]'));
assert.match(await toastTxt(), /Sol Ring : un exemplaire ajouté \(DE · Foil ✦\)/);
await p.click('#toast .toast-act'); await p.waitForFunction(() => !document.querySelector('.cs-ln[data-g="de*"]'));
ok('« Ajouter un exemplaire » (allemand, foil) puis Annuler');

/* ── Ajouter à un deck : Burn (+1), Edgar (Commander : déjà, refusé), Annuler ────────────────── */
await p.click('.cs-sheet [data-cs="adddeck"]'); await p.waitForSelector('.cs-pickw.open .cs-dk[data-id="dC"]');
assert.equal(await p.$eval('.cs-pickw .cs-dk[data-id="dB"]', b => b.getAttribute('aria-disabled')), 'true', 'Commander : déjà là, un seul exemplaire');
await p.waitForTimeout(500); await p.click('.cs-pickw .cs-dk[data-id="dB"]', { force: true }); await p.waitForFunction(() => !document.querySelector('.cs-pickw')); assert.match(await toastTxt(), /Sol Ring est déjà dans « Edgar »/);
await p.click('.cs-sheet [data-cs="adddeck"]'); await p.waitForSelector('.cs-pickw.open .cs-dk[data-id="dC"]');
await p.click('.cs-pickw .cs-dk[data-id="dC"]'); await p.waitForFunction(() => /1 Sol Ring/.test(findDeck('dC').text));
assert.equal(await p.evaluate(() => findDeck('dC').text), '4 Wrath of God\n2 Llanowar Elves\n1 Sol Ring\n\nSB: 2 Swords to Plowshares', 'ajoutée à la fin de la section principale, réserve intacte');
await p.waitForFunction(() => document.querySelectorAll('.cs-sheet .cs-dk').length === 3);
assert.match(await toastTxt(), /Sol Ring ajoutée à « Burn »/);
await p.click('#toast .toast-act'); await p.waitForFunction(() => !/Sol Ring/.test(findDeck('dC').text));
await p.click('.cs-sheet [data-cs="adddeck"]'); await p.waitForSelector('.cs-pickw.open .cs-dk[data-id="dA"]'); await p.click('.cs-pickw .cs-dk[data-id="dA"]');
await p.waitForFunction(() => /^2 Sol Ring/.test(findDeck('dA').text)); assert.equal(await p.evaluate(() => XS.eng.dA.q['sol ring']), 2, 'deck monté : ses cartes réservées suivent');
await p.evaluate(() => { const d = findDeck('dA'); putDeck('dA', deckDoc({ ...d, text: d.text.replace(/^2 Sol Ring/, '1 Sol Ring') })); engRefresh('dA', d.name, findDeck('dA').text); });
ok('« Ajouter à un deck » : +1 dans la section principale (Annuler), singleton Commander refusé, quantité d\'une ligne existante');

/* ── Suivre le prix : alertes en hausse ET baisse ────────────────────────────────────────────── */
await p.click('.cs-sheet [data-cs="watch"]'); await p.waitForFunction(() => AC.on && AC.watch['sol ring'], null, { timeout: 8000 });
assert.deepEqual(await p.evaluate(() => AC.watch['sol ring']), { n: 'Sol Ring', u: 1 });
assert.equal(await p.evaluate(() => alItems().find(x => x.k === 'sol ring').u), 1, 'u : hausse et baisse, envoyé au serveur');
assert.match(await txt(p, '.cs-sheet [data-cs="watch"]'), /Prix suivi : hausse et baisse/); assert.match(await toastTxt(), /hausse ou baisse/);
await p.waitForFunction(() => AC.id && AC.info, null, { timeout: 8000 });
const srv = await (await fetch(world.url + 'api/alerts?id=' + await p.evaluate(() => AC.id))).json(); assert.ok(srv.watching >= 1, 'liste enregistrée par le serveur');
await p.click('.cs-sheet [data-cs="watch"]'); await p.waitForFunction(() => !AC.watch['sol ring']); assert.match(await txt(p, '.cs-sheet [data-cs="watch"]'), /^Suivre le prix$/);
await p.click('#toast .toast-act'); await p.waitForFunction(() => AC.watch['sol ring'] && AC.watch['sol ring'].u === 1);
ok('« Suivre le prix » : alertes activées, carte suivie en hausse et en baisse (u), enregistrée par le serveur ; ne plus suivre, Annuler');

/* ── Ouvrir un deck depuis la fiche ──────────────────────────────────────────────────────────── */
await p.click('.cs-sheet .cs-dk[data-id="dB"]'); await p.waitForFunction(() => !sheets.length && DV.el && DV.deckId === 'dB', null, { timeout: 5000 });
await p.evaluate(() => closeDeckViewer()); await p.waitForTimeout(300);
ok('toucher un deck : la fiche se ferme, le deck s\'ouvre');

/* ── Image de la fiche : la carte en grand (foil pour la ligne foil) ─────────────────────────── */
await p.evaluate(() => openCardSheet('sol ring', { l: 'en|cmm|400*' })); await sheetOpen();
assert.equal(await p.$eval('.cs-img', b => b.classList.contains('foil')), true);
await p.click('.cs-sheet .cs-img'); await p.waitForSelector('.imgv.on'); assert.equal(await p.$eval('.imgv-card', c => c.classList.contains('foil')), true, 'ligne foil : étincelles');
await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.imgv')); assert.equal(await p.evaluate(() => sheets.length), 1, 'Échap : la carte en grand seule');
await csClose();
ok('image : carte en grand (foil) ; Échap ferme la carte puis la fiche');

/* ── Échange : doublons, « Garder » (même effet que le bouton de l'Échange), Je recherche ───── */
await p.click('.crow[data-k="arcane signet"] .row-name'); await sheetOpen();
assert.match(await txt(p, '.cs-sheet'), /1 exemplaire proposé/, '3 − Deck A − réserve de 1');
await p.click('.cs-sheet .cs-keep .switch'); await p.waitForFunction(() => TR.kept.has('arcane signet'));
assert.match(await txt(p, '.cs-sheet'), /1 exemplaire en trop, gardé/); assert.match(await toastTxt(), /Gardée : elle n'est plus proposée/);
await csClose();
await p.click('#collSeg [data-v="list"]').catch(() => {});
await p.evaluate(() => { COLL.el.__close(); }); await p.waitForTimeout(300);
await p.evaluate(() => openCollection('trade')); await p.waitForSelector('.coll.on .tr-list, .coll.on .tr-held');
assert.equal(await p.$('.tr-row[data-k="arcane signet"] [data-act="tkeep"]'), null, 'gardée : plus dans « À échanger »');
await p.click('.tr-held summary'); await p.click('.tr-held .tr-row[data-k="arcane signet"] .row-name'); await sheetOpen();
assert.equal(await p.evaluate(() => CS.o.from), 'trade'); assert.equal(await p.$eval('.cs-keep input', i => i.checked), true);
await p.click('.cs-sheet .cs-keep .switch'); await p.waitForFunction(() => !TR.kept.has('arcane signet')); await csClose();
await p.waitForSelector('.tr-row[data-k="arcane signet"] [data-act="tkeep"]');
await p.click('.tr-row[data-k="arcane signet"] [data-act="tkeep"]'); await p.waitForFunction(() => TR.kept.has('arcane signet')); assert.equal(await p.$('.cs-sheet'), null, '« Garder » de la liste : pas de fiche');
await p.evaluate(() => { TR.kept.delete('arcane signet'); trChanged(); });
// Je recherche : carte souhaitée, pas possédée
await p.evaluate(() => { TR.wish['wrath of god'] = { n: 'Wrath of God', q: 2 }; trChanged(); TR.sub = 'want'; collPaintBody(true); });
await p.waitForSelector('.tr-row[data-k="wrath of god"]'); await p.click('.tr-row[data-k="wrath of god"] .row-name'); await sheetOpen();
assert.match(await txt(p, '.cs-sheet .cs-hd'), /Pas dans ta collection/); assert.match(await txt(p, '.cs-sheet'), /Je recherche × 6.*manque à tes decks × 4.*souhait × 2/);
assert.equal(await txt(p, '.cs-sheet .sheet-head h2').then(t => /Wrath of God|Colère de Dieu/.test(t)), true);
await csClose(); await p.evaluate(() => { TR.sub = 'have'; delete TR.wish['wrath of god']; trChanged(); COLL.el.__close(); }); await p.waitForTimeout(300);
ok('Échange : exemplaires proposés, « Garder » (liste « Gardées à la main »), ouverture depuis l\'onglet Échange, carte recherchée non possédée');

/* ── Scan : toucher une carte reconnue ; − / + du scan gardent leur geste ────────────────────── */
await p.evaluate(() => openScan()); await p.waitForSelector('.scan.on');
await p.evaluate(() => scanAdd({ key: 'llanowar elves', name: 'Llanowar Elves', score: 0.99, raw: 'Llanowar Elves', card: 'fr' }, 1, false));
await p.waitForSelector('.sc-item[data-k="llanowar elves"] .qstep');
await p.click('.sc-item[data-k="llanowar elves"] [data-a="inc"]'); assert.equal(await p.$('.cs-sheet'), null, '+ du scan : pas de fiche');
await p.click('.sc-item[data-k="llanowar elves"] .sc-n b'); await sheetOpen();
assert.equal(await p.evaluate(() => CS.o.from), 'scan'); assert.match(await txt(p, '.cs-sheet .cs-hd'), /Pas dans ta collection/);
assert.equal(await p.$('.cs-sheet [data-cs="add"]'), null, 'depuis le scan : pas d\'« Ajouter un exemplaire » (les cartes passent par « Ajouter » du scan)');
await p.waitForFunction(() => document.querySelector('.cs-sheet .cs-pr:not(.cs-ph)') && !/…/.test(document.querySelector('.cs-sheet .cs-pr:not(.cs-ph)').innerText), null, { timeout: 6000 });
assert.match(await txt(p, '.cs-sheet .cs-pr:not(.cs-ph)'), /0,20 €/, 'prix lu pour une carte pas encore possédée');
await csClose(); assert.ok(await p.$('.scan.on'), 'Échap : la fiche seule, le scan reste');
await p.evaluate(() => SC.el.__close('done')); await p.waitForTimeout(300);
ok('scan : la ligne d\'une carte reconnue ouvre sa fiche (prix lu) ; + du scan inchangé ; Échap ferme la fiche seule');

/* ── 360 clair, 1280 clair (fenêtre) ─────────────────────────────────────────────────────────── */
await p.setViewportSize({ width: 360, height: 780 }); await p.evaluate(() => openCardSheet('sol ring', { l: 'fr' })); await sheetOpen(); await shot('cs-360-light');
assert.equal(await p.evaluate(() => document.querySelector('.cs-sheet .sheet-body').scrollWidth <= document.querySelector('.cs-sheet .sheet-body').clientWidth + 1), true, '360 : aucun débordement horizontal');
await csClose();
await p.setViewportSize({ width: 1280, height: 860 }); await p.evaluate(() => openCardSheet('sol ring', { l: 'en|cmm|400' })); await sheetOpen(); await shot('cs-1280-light');
const box = await p.$eval('.cs-sheet .sheet', s => { const r = s.getBoundingClientRect(); return { l: r.left, w: r.width, t: r.top }; });
assert.ok(box.w <= 620 && box.l > 200 && box.t > 0, 'ordinateur : fenêtre centrée ' + JSON.stringify(box));
await csClose();

/* ── Hors ligne : carte jamais lue → pas de section texte ; carte lue → texte gardé ────────────── */
await p.setViewportSize({ width: 393, height: 852 });
const hitsOnline = histHits.length;
await ctx.setOffline(true); await p.evaluate(() => window.dispatchEvent(new Event('offline')));
await p.evaluate(() => openCardSheet('craterhoof behemoth')); await sheetOpen(); await p.waitForTimeout(600);
assert.equal(await p.$('.cs-sheet .cs-or'), null, 'hors ligne : texte et légalités masqués');
assert.equal(await p.$('.cs-sheet .cs-hist'), null, 'hors ligne, historique jamais lu : pas de courbe'); assert.match(await txt(p, '.cs-sheet'), /Variation du prix : connue après/, 'la variation connue reste');
assert.equal(histHits.length, hitsOnline, 'hors ligne : aucune lecture de /api/hist'); assert.equal(await p.$('.cs-sheet [data-cs="ct"]'), null, 'hors ligne : pas de « Voir les offres »'); assert.match(await txt(p, '.cs-sheet .cs-hd'), /1 exemplaire/);
await shot('cs-393-horsligne');
await csClose();
await p.evaluate(() => openCardSheet('sol ring')); await sheetOpen(); await p.waitForSelector('.cs-sheet .cs-or .cs-lg', { timeout: 4000 });
await p.waitForSelector('.cs-sheet .cs-hist .vl-svg', { timeout: 4000 });      // historique lu il y a moins de 6 h : gardé sur l'appareil
await csClose(); await ctx.setOffline(false);
ok('hors ligne : section texte absente pour une carte jamais lue, gardée pour une carte déjà lue ; historique : variation connue sans copie, courbe gardée sinon');

assert.deepEqual(errs, [], errs.join('\n'));
await browser.close(); world.stop(); upScry.close(); upPush.close();
console.log('cardsheet-e2e : OK');
