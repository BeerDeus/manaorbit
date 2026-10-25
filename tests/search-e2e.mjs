// E2E recherche avancée de la collection (src/search.js) : Cartes › Filtres › « Plus de filtres » (rareté lue sur Scryfall seulement quand on filtre dessus, langue,
// finition, prix à l'unité, emplacement unifié avec Rangement, doublons, decks, échange, ajout récent), lignes affichées, pastilles des filtres actifs (✕),
// recherches enregistrées (nom proposé, appliquer / retirer, appui long, ⋯, renommer, supprimer et Annuler, rechargement), Échange sans ces groupes.
// Captures (393 clair / sombre, 360 clair, 1280 clair) : SRCH_SHOTS=<dossier>.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, startWorld, newPage, txt, ok, toHome, closeSheets } from './e2e-world.mjs';

const SHOTS = process.env.SRCH_SHOTS || ''; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const world = await startWorld({ port: 19820 });
const RAR = { 'Sol Ring': 'uncommon', 'Craterhoof Behemoth': 'mythic', 'Llanowar Elves': 'common', 'Edgar Markov': 'mythic', 'Wrath of God': 'rare' };
for (const [n, r] of Object.entries(RAR)) world.prints[n][0].rarity = r;      // rareté de l'impression que Scryfall renvoie pour le nom
const LG = { 'Sol Ring': { commander: 'legal', vintage: 'restricted', legacy: 'banned', modern: 'not_legal' }, 'Craterhoof Behemoth': { commander: 'legal', legacy: 'legal', vintage: 'legal', modern: 'legal' },
  'Llanowar Elves': { commander: 'legal', legacy: 'legal', vintage: 'legal', modern: 'legal', pauper: 'legal', standard: 'legal' }, 'Edgar Markov': { commander: 'legal', legacy: 'legal', vintage: 'legal' }, 'Wrath of God': { commander: 'legal', legacy: 'legal', vintage: 'legal', modern: 'legal' } };
for (const [n, l] of Object.entries(LG)) world.prints[n][0].legalities = l;      // formats (filtre « Format »)
world.eds['cmm|400'] = { n: 'Sol Ring', langs: ['fr'] };      // Sol Ring CMM 400 : rare, 2,00 € (faux Scryfall)
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const cardSvg = u => { const h = [...u].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="488" height="680" viewBox="0 0 488 680"><rect width="488" height="680" rx="24" fill="#141418"/><rect x="18" y="18" width="452" height="644" rx="12" fill="hsl(${h} 32% 50%)"/><rect x="30" y="30" width="428" height="44" rx="7" fill="hsl(${h} 30% 86%)"/><rect x="36" y="84" width="416" height="300" fill="hsl(${(h + 120) % 360} 55% 45%)"/><circle cx="${180 + h % 140}" cy="210" r="74" fill="hsl(${(h + 90) % 360} 85% 78%)" opacity=".55"/><rect x="36" y="436" width="416" height="204" rx="5" fill="hsl(${h} 22% 92%)"/></svg>`; };

const { p, errs } = await newPage(browser, world);
if (SHOTS) await p.route('https://cards.scryfall.io/**', r => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'image/svg+xml', body: cardSvg(r.request().url()) }));
async function shot(name, o = {}) {
  if (!SHOTS) return;
  const vp = p.viewportSize();      // full : écran allongé le temps de la capture (la collection défile dans son propre cadre, fullPage n'y voit rien)
  if (o.full) { await p.setViewportSize({ width: vp.width, height: o.full }); await p.evaluate(() => { const s = document.querySelector('.coll .dv-scroll'); if (s) s.scrollTop = 0; }); }
  for (const cs of o.schemes || ['light', 'dark']) { await p.emulateMedia({ colorScheme: cs }); await p.waitForTimeout(250); await p.screenshot({ path: `${SHOTS}/${name}-${cs}.png` }); }
  await p.emulateMedia({ colorScheme: 'light' }); if (o.full) await p.setViewportSize(vp);
}
/** Lignes affichées : « clé ligne × exemplaires ». */
const rows = () => p.$$eval('.coll .coll-list .crow', r => r.map(x => `${x.dataset.k}${(x.dataset.g ?? x.dataset.ln) ? ' ' + (x.dataset.g ?? x.dataset.ln) : ''} ×${x.querySelector('.qstep b').textContent}`));
const keys = async () => [...new Set((await rows()).map(r => r.split(' ×')[0].replace(/ [a-z*|0-9#-]+$/, '')))];
const cardKeys = () => p.$$eval('.coll .coll-list .crow', r => [...new Set(r.map(x => x.dataset.k))]);
const badge = () => p.$eval('.coll .fbtn b', b => (b.hidden ? '' : b.textContent));
const chips = () => p.$$eval('.coll .srch-act .srch-chip', b => b.map(x => x.innerText.trim()));
const opt = (k, v) => p.click(`.coll .fmore-box [data-fk="${k}"][data-fv="${v}"]`);
const settle = () => p.waitForTimeout(200);

const now = Math.floor(Date.now() / 1000), DAY = 86400;
await p.evaluate(({ now, DAY }) => {
  COLL.map = collFromText('2 Sol Ring (CMM) 400 *FR*\n1 Sol Ring *EN*\n1 Craterhoof Behemoth *EN* *F*\n3 Llanowar Elves *DE*\n1 Edgar Markov *FR*\n1 Wrath of God *IT*');
  const d = { 'sol ring': now - 2 * DAY, 'wrath of god': now - 20 * DAY }; for (const k of Object.keys(COLL.map)) COLL.map[k] = { ...COLL.map[k], d: d[k] || now - 60 * DAY };
  D.localList = [readDeck('elfes', { name: 'Elfes', text: '1 Llanowar Elves\n1 Craterhoof Behemoth', updatedAt: Date.now() })];      // « Mes decks » (sans compte)
  collChanged();
}, { now, DAY });
await toHome(p); await p.click('#btnColl'); await p.waitForSelector('.coll.on .crow');
await p.waitForFunction(() => Object.keys(COLL.meta).length >= 5 && !COLL.enrich && Object.keys(COLL.ed).length >= 1, null, { timeout: 15000 });
assert.equal(await p.evaluate(() => COLL.meta['edgar markov'].rr), 'mythic', 'rareté gardée avec les infos des cartes (scryCollection › rr)');
await p.evaluate(() => { for (const k in COLL.meta) if (COLL.meta[k]) delete COLL.meta[k].rr; collPaint(); });      // infos lues par une version d'avant : sans rareté
const scry0 = world.scry.length;
assert.deepEqual(await cardKeys(), ['craterhoof behemoth', 'edgar markov', 'llanowar elves', 'sol ring', 'wrath of god']);

/* ── Panneau : « Plus de filtres » ──────────────────────────────────────────────────────────────────────────── */
await p.click('.coll .fbtn'); await p.waitForSelector('.coll .fpanel:not([hidden]) .fmore');
assert.equal(await p.$eval('.coll .fmore', b => b.getAttribute('aria-expanded')), 'false'); assert.ok(await p.$eval('.coll .fmore-box', b => b.hidden), 'groupes avancés repliés par défaut');
await p.click('.coll .fmore'); await p.waitForSelector('.coll .fmore-box:not([hidden]) [data-fk]');
assert.deepEqual(await p.$$eval('.coll .fmore-box .fgl', l => l.map(x => x.textContent)), ['Rareté', 'Format', 'Langue', 'Finition', 'Prix à l\'unité', 'Exemplaires', 'Ajout'], 'pas d\'emplacement tant qu\'aucun n\'existe');
assert.deepEqual(await p.$$eval('.coll .fmore-box [data-fk="lang"]', b => b.map(x => x.dataset.fv)), ['fr', 'en', 'de', 'it'], 'langues présentes, dans l\'ordre de la puce langue');
assert.equal(world.scry.length, scry0, 'aucune lecture Scryfall à l\'ouverture du panneau');
ok('« Plus de filtres » : groupes repliés, langues présentes');

/* ── Langue : lignes de la langue seules ─────────────────────────────────────────────────────────────────────── */
await opt('lang', 'fr'); await settle();
assert.deepEqual(await rows(), ['edgar markov fr ×1', 'sol ring fr|cmm|400 ×2'], 'Sol Ring : la ligne française seule (2 exemplaires)');
assert.equal(await badge(), '1'); assert.equal(await p.$eval('.coll .fmore b', b => b.textContent), '1');
assert.deepEqual(await chips(), ['FR']); assert.match(await txt(p, '.coll-count'), /2 cartes sur 5/);
await opt('lang', 'de'); await settle();
assert.deepEqual(await cardKeys(), ['edgar markov', 'llanowar elves', 'sol ring'], 'plusieurs langues : l\'une ou l\'autre'); assert.equal(await badge(), '1');
await p.click('.coll .srch-chip:nth-child(1)'); await settle();
assert.deepEqual(await chips(), ['DE'], '✕ d\'une pastille : ce filtre seul'); assert.deepEqual(await cardKeys(), ['llanowar elves']);
await p.click('.coll .srch-chip'); await settle(); assert.equal(await badge(), ''); assert.equal(await p.$('.coll .srch-act'), null);
ok('Langue : FR, FR + DE, pastilles ✕');

/* ── Finition, prix à l'unité ────────────────────────────────────────────────────────────────────────────────── */
await opt('foil', 'f'); await settle(); assert.deepEqual(await rows(), ['craterhoof behemoth en* ×1']);
await opt('foil', 'n'); await settle(); assert.deepEqual(await cardKeys(), ['edgar markov', 'llanowar elves', 'sol ring', 'wrath of god'], 'Non foil remplace Foil');
await opt('foil', 'n'); await settle();
await opt('px', '5-20'); await settle(); assert.deepEqual(await cardKeys(), ['craterhoof behemoth', 'edgar markov'], '5–20 € : 9 € (foil sans prix foil : prix normal, comme la valeur) et 5 €');
await opt('px', '1-5'); await settle(); assert.deepEqual(await rows(), ['sol ring fr|cmm|400 ×2', 'sol ring en ×1', 'wrath of god it ×1'], '1–5 € : CMM 400 à 2 € (prix de l\'édition), Sol Ring sans édition 1,50 €');
await opt('px', 'lt1'); await settle(); assert.deepEqual(await cardKeys(), ['llanowar elves']);
await opt('px', 'gt20'); await settle(); assert.match(await txt(p, '.coll-main'), /Aucune carte ne correspond/);
await opt('px', 'gt20'); await settle();
ok('Finition (Foil / Non foil) et prix à l\'unité (édition et foil compris)');

/* ── Doublons, decks, échange, ajout ─────────────────────────────────────────────────────────────────────────── */
await opt('dup', '1'); await settle(); assert.deepEqual(await cardKeys(), ['llanowar elves', 'sol ring'], 'doublons : 2 exemplaires ou plus');
await opt('dup', '1'); await opt('dk', 'in'); await settle(); assert.deepEqual(await cardKeys(), ['craterhoof behemoth', 'llanowar elves'], 'dans une liste de Mes decks');
await opt('dk', 'out'); await settle(); assert.deepEqual(await cardKeys(), ['edgar markov', 'sol ring', 'wrath of god']);
await p.evaluate(() => { XS.eng = { ...XS.eng, vamp: { n: 'Vampires', at: Date.now(), q: { 'edgar markov': 1 } } }; collPaintBody(true); }); await settle();
assert.deepEqual(await cardKeys(), ['sol ring', 'wrath of god'], 'deck monté : compté aussi (et la liste suit sans recharger)');
await opt('dk', 'out'); await opt('tr', '1'); await settle(); assert.deepEqual(await cardKeys(), ['llanowar elves', 'sol ring'], 'à l\'échange : doublons libres');
await opt('tr', '1'); await opt('add', '7'); await settle(); assert.deepEqual(await cardKeys(), ['sol ring'], '7 derniers jours');
await opt('add', '30'); await settle(); assert.deepEqual(await cardKeys(), ['sol ring', 'wrath of god'], '30 derniers jours');
assert.deepEqual(await chips(), ['30 derniers jours']); await opt('add', '30'); await settle();
ok('Doublons, Dans un deck / aucun deck (listes et decks montés), À l\'échange, 7 / 30 derniers jours');

/* ── Rareté : lue sur Scryfall au premier filtre, ligne par ligne ───────────────────────────────────────────── */
await opt('rar', 'mythic');
await p.waitForFunction(() => document.querySelectorAll('.coll .coll-list .crow').length === 2, null, { timeout: 10000 });
assert.ok(world.scry.slice(scry0).some(x => x.startsWith('POST /cards/collection')), 'raretés manquantes lues sur Scryfall');
assert.deepEqual(await cardKeys(), ['craterhoof behemoth', 'edgar markov']);
await p.waitForFunction(() => !SRCH.rar); assert.equal(await p.$('.coll .srch-rh'), null, 'plus de « Lecture des raretés » une fois lues');
await opt('rar', 'mythic'); await opt('rar', 'rare'); await settle();
assert.deepEqual(await rows(), ['sol ring fr|cmm|400 ×2', 'wrath of god it ×1'], 'rare : le Sol Ring CMM 400 (rareté de son édition), pas le Sol Ring sans édition (peu commune)');
const scry1 = world.scry.length; await opt('rar', 'uncommon'); await settle(); assert.equal(world.scry.length, scry1, 'raretés déjà lues : aucune nouvelle lecture');
assert.deepEqual(await rows(), ['sol ring fr|cmm|400 ×2', 'sol ring en ×1', 'wrath of god it ×1']);
await opt('rar', 'uncommon'); await opt('rar', 'rare'); await settle();
ok('Rareté : lue une fois à la demande, rareté de l\'édition pour une ligne qui en a une');

/* ── Format : légalités de Scryfall (restreinte : légale), lues à la demande si elles manquent ou datent de plus de 30 jours ─── */
await p.evaluate(() => { for (const k of Object.keys(COLL.map)) if (COLL.meta[k]) { const { lg, la, ...m } = COLL.meta[k]; COLL.meta[k] = m; } });      // infos lues par une version d'avant : sans formats
const scry2 = world.scry.length;
await opt('fmt', 'm'); await p.waitForFunction(() => !SRCH.lg && document.querySelectorAll('.coll .coll-list .crow').length === 3, null, { timeout: 10000 });
assert.ok(world.scry.slice(scry2).some(x => x.startsWith('POST /cards/collection')), 'formats manquants lus sur Scryfall');
assert.deepEqual(await cardKeys(), ['craterhoof behemoth', 'llanowar elves', 'wrath of god'], 'Modern'); assert.deepEqual(await chips(), ['Légal en Modern']);
await opt('fmt', 'v'); await settle(); assert.ok((await cardKeys()).includes('sol ring'), 'Vintage : Sol Ring restreinte, donc jouable');
await opt('fmt', 'a'); await settle(); assert.deepEqual(await cardKeys(), ['llanowar elves'], 'Pauper');
await opt('fmt', 'l'); await settle(); assert.ok(!(await cardKeys()).includes('sol ring'), 'Legacy : Sol Ring bannie');
const scry3 = world.scry.length; await opt('fmt', 'c'); await settle(); assert.equal(world.scry.length, scry3, 'formats lus : aucune nouvelle lecture'); assert.equal((await cardKeys()).length, 5, 'Commander : toutes');
await p.evaluate(() => { const k = 'sol ring'; COLL.meta[k] = { ...COLL.meta[k], la: Math.floor(Date.now() / 864e5) - 31 }; SRCH.lgTried.clear(); });
await opt('fmt', 'c'); await opt('fmt', 's'); await p.waitForFunction(n => !SRCH.lg && window.__n !== n, scry3); await settle();
assert.ok(world.scry.length > scry3, 'plus de 30 jours : relue (bannissements)'); assert.deepEqual(await cardKeys(), ['llanowar elves'], 'Standard');
await opt('fmt', 's'); await settle();
ok('Format : légal en Standard, Modern, Legacy, Vintage (restreinte comprise), Commander, Pauper ; lu à la demande, relu après 30 jours');

/* ── Emplacement : le même filtre que Rangement ──────────────────────────────────────────────────────────────── */
const blue = await p.evaluate(() => { const id = plcCreate('binder', 'Classeur bleu'); COLL.map = linesMove(COLL.map, 'edgar markov', 'fr', 1, lineKey('fr', '', false, { p: id })); collChanged(); return id; });
await settle();
assert.deepEqual(await p.$$eval('.coll .fmore-box [data-fk="place"]', b => b.map(x => x.textContent)), ['Non rangées', 'Classeur bleu'], 'Emplacement : non rangées puis les emplacements');
await opt('rar', 'mythic'); await opt('place', '-'); await p.waitForSelector('.coll .plc-bar');
assert.deepEqual(await cardKeys(), ['craterhoof behemoth'], 'mythiques non rangées'); assert.equal(await p.evaluate(() => COLL.place), '-', 'COLL.place : le filtre du panneau');
assert.equal(await badge(), '2'); assert.deepEqual(await chips(), ['Mythiques'], 'emplacement : son bandeau, pas de pastille en double');
await p.click('.plc-bar [data-act="plcclear"]'); await p.waitForFunction(() => !document.querySelector('.plc-bar'));
assert.equal(await badge(), '1', '✕ du bandeau : la pastille « Filtres » suit'); assert.equal(await p.$eval(`.coll [data-fk="place"][data-fv="-"]`, b => b.getAttribute('aria-pressed')), 'false');
await p.evaluate(id => plcShow(id), blue); await p.waitForSelector('.coll .plc-bar');
assert.equal(await p.$eval(`.coll [data-fk="place"][data-fv="${blue}"]`, b => b.getAttribute('aria-pressed')), 'true', 'Rangement › un emplacement : coché dans le panneau'); assert.deepEqual(await cardKeys(), ['edgar markov']);
await p.click('.plc-bar .plc-mv'); await p.waitForSelector('.sheet-wrap.open .plc-opt'); assert.match(await txt(p, '.sheet-wrap.open .sheet-head'), /Ranger 1 exemplaire/); await closeSheets(p);
await p.click('.coll .freset'); await settle();
assert.ok(await p.$('.coll .plc-bar'), '« Effacer les filtres » : on reste dans l\'emplacement ouvert'); assert.equal(await badge(), '1'); assert.ok(await p.$eval('.coll .freset', b => b.hidden), 'l\'emplacement seul : pas d\'« Effacer les filtres »');
await opt('rar', 'mythic'); await opt('place', blue); await settle();
ok('Emplacement : panneau et Rangement unifiés (bandeau, ✕, « Ranger ces cartes… »)');
const shown = () => p.$$eval('.coll .fgrp-fold [data-fk="place"]', b => b.filter(x => x.offsetParent).map(x => x.textContent));
if (await p.evaluate(() => COLL.place)) await p.click('.plc-bar [data-act="plcclear"]');
await p.click('.coll [data-fold="place"]'); await settle();
assert.equal(await p.$eval('.coll .fgrp-fold', g => g.classList.contains('shut')), true, 'Emplacement replié'); assert.deepEqual(await shown(), [], 'replié sans choix : rien');
assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:srch:fold')).place), 1, 'gardé sur l\'appareil');
await p.click('.coll [data-fold="place"]'); await settle(); assert.deepEqual(await shown(), ['Non rangées', 'Classeur bleu'], 'déplié');
await opt('place', blue); await p.click('.coll [data-fold="place"]'); await settle(); assert.deepEqual(await shown(), ['Classeur bleu'], 'replié : seul l\'emplacement choisi reste');
await opt('place', blue); await p.click('.coll [data-fold="place"]'); await settle();
ok('Emplacement repliable : seul le choix reste, gardé sur l\'appareil');
await shot('panneau-393');
if (SHOTS) { await p.evaluate(() => { document.querySelector('.coll .fbar').scrollIntoView(); }); }

/* ── Recherches enregistrées ─────────────────────────────────────────────────────────────────────────────────── */
await opt('lang', 'fr'); await settle(); assert.deepEqual(await cardKeys(), ['edgar markov']);
await p.click('.coll [data-ssave]'); await p.waitForSelector('.sheet-wrap.open #srchName');
assert.equal(await p.$eval('#srchName', i => i.value), 'Mythiques · FR', 'nom proposé');
await p.fill('#srchName', 'Mythiques FR'); await p.click('.sheet-wrap.open [data-ok]'); await p.waitForFunction(() => !sheets.length);
await p.waitForSelector('.coll .srch-pw.on .srch-pill');
assert.equal(await txt(p, '.coll .srch-pw.on .srch-pill'), 'Mythiques FR'); assert.equal(await p.$('.coll [data-ssave]'), null, 'recherche appliquée : pas de second « Enregistrer »');
assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:srch:v1')).map(x => [x.n, x.f])), [['Mythiques FR', { la: ['fr'], ra: ['mythic'] }]]);
await opt('place', '-'); await opt('rar', 'mythic'); await settle();      // non rangées, toutes raretés, FR : Sol Ring FR
await p.click('.coll [data-ssave]'); await p.waitForSelector('.sheet-wrap.open #srchName');
assert.equal(await p.$eval('#srchName', i => i.value), 'FR · non rangées'); await p.click('.sheet-wrap.open [data-ok]'); await p.waitForFunction(() => !sheets.length);
await p.click('.coll .fbtn'); await settle();      // panneau fermé : la liste juste sous les rangées
assert.deepEqual(await p.$$eval('.coll .srch-pill', b => b.map(x => x.textContent.trim() + (x.getAttribute('aria-pressed') === 'true' ? '*' : ''))), ['Mythiques FR', 'FR · non rangées*']);
await shot('enregistrees-393');
await p.click('.coll .srch-pill[aria-pressed="true"]'); await settle();
assert.equal(await badge(), '', 're-toucher : recherche retirée'); assert.equal(await p.evaluate(() => COLL.place), ''); assert.equal((await cardKeys()).length, 5);
await p.click('.coll .srch-pill:not([aria-pressed="true"])'); await settle();
assert.deepEqual(await cardKeys(), ['edgar markov'], 'une touche : appliquée'); assert.equal(await badge(), '2'); assert.deepEqual(await chips(), ['Mythiques', 'FR']);
// appui long : renommer
const pill = await p.$('.coll .srch-pill[aria-pressed="true"]'), bx = await pill.boundingBox();
await p.mouse.move(bx.x + 20, bx.y + bx.height / 2); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up();
await p.waitForSelector('.sheet-wrap.open #srchName'); assert.equal(await top(), 'Recherche enregistrée');
await p.fill('#srchName', 'Mes mythiques'); await p.press('#srchName', 'Enter'); await p.waitForFunction(() => !sheets.length); await settle();
assert.deepEqual(await p.$$eval('.coll .srch-pill', b => b.map(x => x.textContent.trim())), ['Mes mythiques', 'FR · non rangées']);
assert.equal(await badge(), '2', 'appui long : la recherche reste appliquée (pas de clic en plus)');
// ⋯ : supprimer, puis Annuler
await p.click('.coll .srch-pmore'); await p.waitForSelector('.sheet-wrap.open [data-del]'); await p.click('.sheet-wrap.open [data-del]'); await p.waitForFunction(() => !sheets.length); await settle();
assert.deepEqual(await p.$$eval('.coll .srch-pill', b => b.map(x => x.textContent.trim())), ['FR · non rangées']);
assert.ok(await p.$('.coll [data-ssave]'), 'supprimée : « Enregistrer » revient');
await p.click('#toast button'); await settle();
assert.deepEqual(await p.$$eval('.coll .srch-pill', b => b.map(x => x.textContent.trim())), ['Mes mythiques', 'FR · non rangées'], 'Annuler : remise à sa place');
// texte de recherche enregistré
await p.click('.coll .srch-pill[aria-pressed="true"]'); await settle();
await p.fill('.coll .fsearch input', 'sol'); await p.waitForTimeout(400);
await p.click('.coll [data-ssave]'); await p.waitForSelector('.sheet-wrap.open #srchName'); assert.equal(await p.$eval('#srchName', i => i.value), '« sol »'); await p.click('.sheet-wrap.open [data-ok]'); await p.waitForFunction(() => !sheets.length);
await p.click('.coll .fclear'); await settle(); assert.equal((await cardKeys()).length, 5);
await p.click('.coll .srch-pill >> text=« sol »'); await settle();
assert.equal(await p.$eval('.coll .fsearch input', i => i.value), 'sol', 'texte remis dans le champ'); assert.deepEqual(await cardKeys(), ['sol ring']);
ok('Recherches enregistrées : nom proposé, appliquer / retirer, appui long (renommer), ⋯ (supprimer, Annuler), texte');

/* ── Rechargement : recherches et « Plus de filtres » gardés ; Échange sans groupes avancés ─────────────────── */
await p.reload(); await p.waitForTimeout(700); await toHome(p); await p.click('#btnColl'); await p.waitForSelector('.coll.on .crow');
assert.deepEqual(await p.$$eval('.coll .srch-pill', b => b.map(x => x.textContent.trim())), ['Mes mythiques', 'FR · non rangées', '« sol »']);
await p.click('.coll .fbtn'); await p.waitForSelector('.coll .fpanel:not([hidden])'); assert.equal(await p.$eval('.coll .fmore', b => b.getAttribute('aria-expanded')), 'true', '« Plus de filtres » resté ouvert');
await p.evaluate(() => openCollection('trade')); await p.waitForSelector('.coll.m-trade.on');
assert.equal(await p.$('.coll.m-trade .fmore'), null, 'Échange : pas de groupes avancés'); assert.equal(await p.$('.coll.m-trade .fext'), null);
await p.evaluate(() => openCollection('list')); await p.waitForSelector('.coll.m-coll.on .crow');
ok('Rechargement : recherches et panneau gardés ; Échange inchangé');

/* ── Captures : 360 clair, 1280 clair ─────────────────────────────────────────────────────────────────────────── */
if (SHOTS) {
  await p.click('.coll .srch-pill >> text=FR · non rangées'); await settle();
  await p.click('.coll .fbtn'); await settle(); await shot('panneau-ouvert-393', { full: 2200 });
  await p.setViewportSize({ width: 360, height: 780 }); await settle(); await shot('panneau-360', { schemes: ['light'], full: 2300 });
  await p.click('.coll .fbtn'); await settle(); await shot('enregistrees-360', { schemes: ['light'] });
  // ordinateur (souris, sans écran tactile) : même collection et mêmes recherches, groupes avancés sur deux colonnes
  const st = await p.evaluate(() => ({ c: localStorage.getItem('deckdeal:coll:v1'), s: localStorage.getItem('deckdeal:srch:v1') }));
  const pc = await newPage(browser, world, { ctx: { viewport: { width: 1280, height: 1300 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false }, init: `try { localStorage.setItem('deckdeal:onboard', '1'); localStorage.setItem('deckdeal:coll:v1', ${JSON.stringify(st.c)}); localStorage.setItem('deckdeal:srch:v1', ${JSON.stringify(st.s)}); localStorage.setItem('deckdeal:srch:more', '1'); } catch (e) {}` });
  await pc.p.route('https://cards.scryfall.io/**', r => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'image/svg+xml', body: cardSvg(r.request().url()) }));
  await toHome(pc.p); await pc.p.click('#btnColl'); await pc.p.waitForSelector('.coll.on .crow'); await pc.p.waitForTimeout(800);
  await pc.p.click('.coll .srch-pill >> text=Mes mythiques'); await pc.p.click('.coll .fbtn'); await pc.p.waitForTimeout(500);
  await pc.p.screenshot({ path: `${SHOTS}/panneau-1280-light.png` }); await pc.p.context().close();
}
assert.deepEqual(errs, []);
await browser.close(); world.stop();
console.log('\nSEARCH E2E OK'); process.exit(0);
async function top() { return p.evaluate(() => { const s = sheets[sheets.length - 1]; return s ? s.wrap.querySelector('h2').textContent : ''; }); }
