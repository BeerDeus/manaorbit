// E2E « une fiche de carte » (lot R3, 5 novembre 2026) : légalité et Game Changers d'une carte lus au même endroit partout (builder.js › cardMeta, metaPut, cardLegal, isGC),
// règles des brackets dans une seule table (brackets.js › BRACKET_RULES). Vérifie :
//   1. Mana Crypt, non possédée : « Pas légale en Commander » dans l'éditeur (pastille, alerte du résumé) et dans le viewer (pastille, rappel) ; sans fiche Scryfall : la base du coach ;
//   2. EDHREC coupé : pastilles GC dans l'éditeur et le viewer (Scryfall game_changer, puis la base du coach) ;
//   3. Time Warp en bracket 2 : même verdict pour l'audit du coach, le résumé de l'éditeur (dkCheck), le bracket estimé, la note et le générateur ;
//      2 tours supplémentaires en bracket 2 et 1 en bracket 1 : refusés partout ;
//   4. migration du cache des fiches (dm:meta) : une fiche ancienne (sans légalité) est relue et complétée, ses autres champs gardés.
// Captures (FICHE_SHOTS=<dossier>) : 393 × 852, échelle 2, thème clair.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, startWorld, newPage, txt, ok, signInFake, slug } from './e2e-world.mjs';

const SHOTS = process.env.FICHE_SHOTS || ''; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p, name) => { if (SHOTS) { await p.waitForTimeout(350); await p.screenshot({ path: `${SHOTS}/${name}.png` }); } };

const world = await startWorld({ port: 19876 });
// cartes de test (faux Scryfall) : Talrand (commandant bleu), Mana Crypt (interdite en Commander), Time Warp et Temporal Manipulation (tours supplémentaires),
// Rhystic Study (Game Changer d'après Scryfall), Mystical Tutor (Game Changer d'après la base du coach seulement), Ponder (rien), Old Card (fiche ancienne du cache)
const FAKE = [['Talrand, Sky Summoner', 4, 'Legendary Creature — Merfolk Wizard', '{2}{U}{U}', ['U']], ['Mana Crypt', 0, 'Artifact', '{0}', []], ['Time Warp', 5, 'Sorcery', '{3}{U}{U}', ['U']],
  ['Temporal Manipulation', 5, 'Sorcery', '{3}{U}{U}', ['U']], ['Rhystic Study', 3, 'Enchantment', '{2}{U}', ['U']], ['Mystical Tutor', 1, 'Instant', '{U}', ['U']], ['Ponder', 1, 'Sorcery', '{U}', ['U']], ['Old Card', 2, 'Instant', '{1}{U}', ['U']]];
FAKE.forEach(([n, cmc, tl, mc, colors], i) => {
  world.prints[n] = [{ id: 's-' + slug(n), set: 'cmm', set_name: 'Commander Masters', collector_number: String(700 + i), name: n, cmc, type_line: tl, mana_cost: mc, colors, color_identity: colors, prices: { eur: '2.00' },
    legalities: n === 'Mana Crypt' ? { commander: 'banned', vintage: 'restricted', legacy: 'banned' } : { commander: 'legal', legacy: 'legal', vintage: 'legal' }, ...(n === 'Rhystic Study' ? { game_changer: true } : n === 'Ponder' ? { game_changer: false } : {}),
    image_uris: { small: `https://cards.scryfall.io/small/front/a/b/${slug(n)}.jpg` } }];
});
// fausse base du coach : [nom, identité, coût, types, rôles, prix, drapeaux (1 GC · 2 tour sup. · 4 destruction de terrains · 8 tuteur · 16 interdite), couleurs produites, rang]
const R = { land: 1, ramp: 2, draw: 4, removal: 8, wipe: 16, counter: 32, tutor: 64, protect: 128, recursion: 256 };
const CARDS = [['Talrand, Sky Summoner', 'U', 4, 2 | 256, 0, 300, 0, '', 400], ['Mana Crypt', '', 0, 4, R.ramp, 20000, 16, 'C', 1], ['Time Warp', 'U', 5, 32, 0, 500, 2, '', 300],
  ['Temporal Manipulation', 'U', 5, 32, 0, 500, 2, '', 310], ['Rhystic Study', 'U', 3, 8, R.draw, 3000, 1, '', 5], ['Mystical Tutor', 'U', 1, 16, R.tutor, 1500, 1 | 8, '', 20],
  ['Ponder', 'U', 1, 32, R.draw, 30, 0, '', 30], ['Island', 'U', 0, 1, R.land, 0, 0, 'U', 0]];
const st = (lo, mid, hi) => [lo, mid, hi];
const TG = { n: 500, land: st(35, 36, 37), ramp: st(9, 10, 12), draw: st(8, 10, 12), removal: st(7, 9, 11), wipe: st(2, 3, 4), counter: st(0, 1, 3), tutor: st(0, 1, 3), protect: st(2, 3, 5), recursion: st(1, 2, 4), wincon: st(1, 2, 3), mv: st(2.8, 3.1, 3.4), cheap: st(6, 9, 12), gc: st(0, 0, 1) };
const CORE = { v: 1, at: '2026-11-01T00:00:00Z', roles: Object.keys(R).concat('wincon'), cards: CARDS, tg: { all: TG, recent: TG, br: {}, th: {}, nc: {} }, combos: [], cmds: ['talrand-sky-summoner'], themes: [], src: { decks: 1234 } };
const PACK = { slug: 'talrand-sky-summoner', n: 5000, land: 36, thl: [], cards: [['Time Warp', 60, 30], ['Temporal Manipulation', 55, 30], ['Rhystic Study', 70, 10], ['Mystical Tutor', 40, 10], ['Ponder', 80, 20], ['Mana Crypt', 30, 5]] };
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="146" height="204"><rect width="146" height="204" rx="8" fill="#36a"/></svg>';
let baseOn = false;

const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const { p, errs } = await newPage(browser, world, { ctx: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, colorScheme: 'light' } });
await p.route('https://cards.scryfall.io/**', r => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'image/svg+xml', body: SVG }));
await p.route('**/api/dkw*', r => {
  if (!baseOn) return r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' });
  const c = new URL(r.request().url()).searchParams.get('c');
  return r.fulfill({ status: c && c !== 'talrand-sky-summoner' ? 404 : 200, contentType: 'application/json', body: JSON.stringify(c ? PACK : CORE) });
});
await signInFake(p);
// EDHREC coupé par le serveur : ni liste Game Changers d'EDHREC, ni decks
await p.evaluate(() => { CTX.off = ['edhrec']; edhOffApply(); COLL.map = collFromText('1 Ponder'); collChanged(); });
assert.equal(await p.evaluate(() => !!(EDH.data && EDH.data.gc)), false, 'EDHREC coupé : pas de liste Game Changers d\'EDHREC');

const DECK = 'Commander\n1 Talrand, Sky Summoner\n\nDeck\n1 Mana Crypt\n1 Time Warp\n1 Rhystic Study\n1 Mystical Tutor\n1 Ponder\n94 Island';
const rowMeta = k => p.$eval(`#bdList .bd-row[data-k="${k}"]`, e => e.textContent.replace(/\s+/g, ' ').trim());
const hasGC = k => p.$eval(`#bdList .bd-row[data-k="${k}"]`, e => !!e.querySelector('.tag.gc'));

/* ── 1) Éditeur, base du coach absente : la fiche Scryfall dit tout (légalité, Game Changer) ─────────────── */
await p.evaluate(t => openBuilder({ name: 'Talrand', fmt: 'commander', text: t }), DECK); await p.waitForSelector('.bd.on');
await p.waitForFunction(() => ['mana crypt', 'time warp', 'rhystic study', 'mystical tutor'].every(k => { const m = cardMeta(k); return m && m.lg !== undefined; }), null, { timeout: 15000 });
await p.waitForFunction(() => /Mana Crypt n'est pas légale en Commander/.test(document.querySelector('#bdSum').textContent), null, { timeout: 5000 });
assert.equal(await p.evaluate(() => [COLL.meta['mana crypt'], collQty('mana crypt')].join()), ',0', 'Mana Crypt : pas dans la collection');
assert.match(await rowMeta('mana crypt'), /Pas légale en Commander/, 'éditeur : pastille sur la ligne de Mana Crypt');
assert.doesNotMatch(await rowMeta('time warp'), /Pas légale/, 'Time Warp : légale');
assert.doesNotMatch(await txt(p, '#bdSum'), /Deck complet et conforme/);
assert.deepEqual(await p.evaluate(() => ['mana crypt', 'time warp', 'ponder'].map(k => cardLegal(k, 'commander'))), [false, true, true], 'cardLegal : la fiche Scryfall');
assert.equal(await p.evaluate(() => cardLegal('mana crypt', 'vintage')), true, 'restreinte en Vintage : jouable');
assert.equal(await hasGC('rhystic study'), true, 'EDHREC coupé : GC d\'après Scryfall (game_changer)');
assert.equal(await hasGC('ponder'), false); assert.equal(await hasGC('mystical tutor'), false, 'ni Scryfall ni base du coach : inconnu, pas de pastille');
await shot(p, 'editeur-mana-crypt');
ok('éditeur : Mana Crypt non possédée signalée (pastille + résumé), GC sans EDHREC (Scryfall)');

/* ── 2) Base du coach arrivée : Mystical Tutor (GC de la base) ; légalité de la base pour une carte sans fiche ───── */
baseOn = true; await p.evaluate(() => { DW.err = ''; return dwLoad(); }); await p.evaluate(() => bdPaint());
assert.equal(await hasGC('mystical tutor'), true, 'GC d\'après la base du coach');
assert.equal(await hasGC('rhystic study'), true);
assert.deepEqual(await p.evaluate(() => { const m = DM['mana crypt']; delete DM['mana crypt']; const r = cardLegal('mana crypt', 'commander'); DM['mana crypt'] = m; return [r, cardLegal('unknown card', 'commander')]; }), [false, null], 'sans fiche Scryfall : la base du coach (drapeau 16) ; inconnue : null');
ok('base du coach : GC et légalité quand Scryfall ne dit rien');

/* ── 3) Time Warp en bracket 2 : un tour supplémentaire, permis (jamais enchaîné), partout ─────────────── */
const verdict = () => p.evaluate(() => {
  const prof = dwProfile(), cmd = dwCmdOf(), pack = DW.cmd.get(cmd.slug) || null, tgt = dwTargets(prof, cmd, pack);
  const audit = [...new DOMParser().parseFromString(dwBracketHtml(prof, BD.wiz), 'text/html').querySelectorAll('li')].map(li => (li.className || 'info') + ':' + li.textContent);
  const sum = bdCheck().issues.map(i => i.lv + ':' + i.t), est = dwBracketOf(prof), score = typeof dsScore === 'function' ? dsScore(BD) : null;
  const sug = dwSuggest('', cmd, pack, prof, tgt, 60, BD).map(s => s.k);
  return { audit, sum, est, tips: score ? score.tips.map(t => t.t) : null, sug };
});
await p.evaluate(() => dwPack('c', 'talrand-sky-summoner'));
await p.evaluate(() => { BD.main.delete('mana crypt'); BD.main.delete('rhystic study'); BD.main.delete('mystical tutor'); BD.wiz = { ...dwDefaults(), br: 2 }; bdPaint(); });
let v = await verdict();
assert.ok(v.audit.some(l => /^info:Tour supplémentaire permis en bracket 2 \(1 au plus, jamais enchaîné\) : Time Warp/.test(l)), 'audit du coach : permis, rappelé — ' + v.audit.join(' | '));
assert.ok(!v.audit.some(l => /^(bad|warn):/.test(l)), 'audit : rien de refusé');
assert.ok(!v.sum.some(t => /tour/i.test(t)), 'résumé de l\'éditeur : rien sur les tours supplémentaires — ' + v.sum.join(' | '));
assert.equal(v.est, 2, 'bracket estimé : 2');
if (v.tips) assert.ok(!v.tips.some(t => /tours supplémentaires/i.test(t)), 'note : pas de pénalité');
assert.ok(!v.sug.includes('temporal manipulation'), 'générateur : pas de second tour supplémentaire en bracket 2');
await p.evaluate(() => { BD.main.delete('time warp'); });
v = await verdict(); assert.ok(v.sug.includes('time warp'), 'sans tour supplémentaire : Time Warp proposé en bracket 2 (1 permis) — ' + v.sug.join(', '));
assert.ok(!v.sug.includes('mana crypt'), 'Mana Crypt : jamais proposée (interdite)');
await p.evaluate(() => { BD.main.set('time warp', { key: 'time warp', name: 'Time Warp', qty: 1 }); BD.main.set('temporal manipulation', { key: 'temporal manipulation', name: 'Temporal Manipulation', qty: 1 }); BD.main.set('island', { key: 'island', name: 'Island', qty: 93 }); bdPaint(); });
v = await verdict();
assert.ok(v.audit.some(l => /^bad:2 tours supplémentaires pour 1 permis en bracket 2/.test(l)), 'audit : 2 tours supplémentaires refusés en bracket 2');
assert.ok(v.sum.some(t => /^bad:2 tours supplémentaires pour 1 permis en bracket 2/.test(t)), 'résumé de l\'éditeur : le même refus');
assert.match(await txt(p, '#bdSum'), /2 tours supplémentaires pour 1 permis en bracket 2/);
assert.equal(v.est, 3, 'bracket estimé : 3');
if (v.tips) assert.ok(v.tips.some(t => /Trop de tours supplémentaires pour le bracket 2/.test(t)), 'note : pénalité');
await shot(p, 'editeur-bracket2-deux-tours');
await p.evaluate(() => { BD.main.delete('temporal manipulation'); BD.wiz.br = 1; bdPaint(); });
v = await verdict();
assert.ok(v.audit.some(l => /^bad:Tours supplémentaires interdits en bracket 1 : Time Warp/.test(l)) && v.sum.some(t => /^bad:Tours supplémentaires interdits en bracket 1/.test(t)), 'bracket 1 : refusé partout');
await p.evaluate(() => { BD.main.delete('time warp'); }); v = await verdict(); assert.ok(!v.sug.includes('time warp') && !v.sug.includes('temporal manipulation'), 'bracket 1 : jamais proposé');
await p.evaluate(() => { BD.wiz.ba = 1; BD.main.set('time warp', { key: 'time warp', name: 'Time Warp', qty: 1 }); bdPaint(); });
assert.ok(!(await p.evaluate(() => bdCheck().issues.map(i => i.t))).some(t => /tour/i.test(t)), 'bracket « estimé » (jamais choisi) : l\'éditeur ne juge pas le bracket');
ok('Time Warp : même verdict pour l\'audit, l\'éditeur, le bracket estimé, la note et le générateur (bracket 2 : 1 permis ; 2 refusés ; bracket 1 : refusé)');
await p.evaluate(() => bdClose(true)); await p.waitForFunction(() => !document.querySelector('.bd'));

/* ── 4) Viewer : Mana Crypt signalée, GC présents (EDHREC coupé) ─────────────── */
await p.evaluate(t => openDeckViewer({ text: t, name: 'Talrand' }), DECK); await p.waitForSelector('.dv-groups .dvc');
await p.waitForSelector('.dv-ill', { timeout: 8000 });
assert.match(await txt(p, '.dv-ill'), /Pas légale en Commander : Mana Crypt/, 'viewer : rappel en tête');
const tile = n => p.$$eval('.dv-groups .dvc', (els, n) => { const e = els.find(x => x.getAttribute('aria-label').startsWith(n)); return e ? { ill: !!e.querySelector('.dvc-ill'), gc: !!e.querySelector('.dvc-gc'), label: e.getAttribute('aria-label') } : null; }, n);
const mc = await tile('Mana Crypt'), rs = await tile('Rhystic Study'), mt = await tile('Mystical Tutor'), tw = await tile('Time Warp');
assert.ok(mc && mc.ill && /Pas légale en Commander/.test(mc.label), 'viewer : pastille sur Mana Crypt');
assert.ok(tw && !tw.ill && !tw.gc, 'Time Warp : rien');
assert.ok(rs && rs.gc && mt && mt.gc, 'viewer : pastilles GC sans EDHREC (Scryfall, base du coach)');
await p.evaluate(() => { DV.view = 'strips'; DV.anim = true; dvGroups(); });
assert.equal(await p.$$eval('.dv-groups .dvb', els => els.filter(e => e.querySelector('.dvc-ill')).map(e => e.querySelector('.dvb-n').textContent).join()), 'Mana Crypt', 'vue « Bandeaux » : pastille aussi');
await p.evaluate(() => { DV.view = 'grid'; DV.anim = true; dvGroups(); });
await shot(p, 'viewer-mana-crypt');
await p.evaluate(() => { const s = document.querySelector('.dv-groups'); s.scrollIntoView(); }); await shot(p, 'viewer-pastilles');
ok('viewer : Mana Crypt signalée (rappel, vignette, bandeau), GC présents EDHREC coupé');

/* ── 5) Migration du cache des fiches : une fiche ancienne (sans légalité) est relue et complétée ─────────────── */
const mig = await p.evaluate(async () => {
  DM['old card'] = { eu: 77, ci: 'U', cd: 0, im: 'https://cards.scryfall.io/small/front/a/b/old-card.jpg', cm: 2, mc: '{1}{U}', tl: 'Instant', cl: 'U', ar: 'Ancien', kept: 'oui' };
  const before = dmMissing([{ key: 'old card', name: 'Old Card' }]).length, got = await dmFetch([{ key: 'old card', name: 'Old Card' }]), m = DM['old card'];
  await new Promise(r => setTimeout(r, 900)); const c = await Cache.get('dm:meta', 864e5);
  return { before, got, lg: m.lg, kept: m.kept, gc: m.gc, after: dmMissing([{ key: 'old card', name: 'Old Card' }]).length, cached: !!(c && c['old card'] && c['old card'].lg) };
});
assert.deepEqual(mig, { before: 1, got: true, lg: 'lvc', kept: 'oui', gc: undefined, after: 0, cached: true }, 'fiche ancienne : relue une fois, complétée (légalité), le reste gardé, enregistrée');
assert.deepEqual(await p.evaluate(() => [metaPut('never seen', { lg: 'c' }), 'never seen' in DM]), [false, false], 'bout de fiche d\'une carte inconnue : rien de créé');
ok('cache des fiches : ancienne fiche complétée à la lecture suivante, sans tout relire');

assert.deepEqual(errs.filter(e => !/Failed to load resource|net::ERR/.test(e)), [], 'aucune erreur de page');
await browser.close(); world.stop();
console.log('fiche-e2e : OK');
process.exit(0);
