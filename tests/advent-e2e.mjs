// E2E calendrier de l'Avent (Noël forcé : EVENT_FORCE=noel-2026, 1er jour ; port 19879) : carte de l'accueil (24 boosters : celui du jour, à venir), lumières
// autour de l'orbe, 2 cadeaux du jour trouvés → le booster s'ouvre (carte du jour, anecdote), compteur 1 / 24, badge « Lutin » ; porte à venir : sa date ;
// récompenses d'un calendrier complet (couleur animée du classeur, orbe de Noël, XP) ; couleurs rares jamais proposées sans tirage. Captures : ADV_SHOTS=<dossier>.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, startWorld, newPage, ok } from './e2e-world.mjs';

const world = await startWorld({ port: 19879, env: { EVENT: '1', EVENT_FORCE: 'noel-2026', EVENT_SECRET: 'e2e' } });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const SHOTS = process.env.ADV_SHOTS || ''; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = (p, n) => (SHOTS ? p.screenshot({ path: `${SHOTS}/${n}.png` }) : null);
const ready = p => p.waitForFunction(() => typeof EV !== 'undefined' && EV.st && EV.st.me, null, { timeout: 15000 });

const { p, errs } = await newPage(browser, world, { path: '?event', ctx: { viewport: { width: 393, height: 852 } } });
await p.addInitScript(() => { localStorage.setItem('deckdeal:ev', JSON.stringify({ seen: { 'noel-2026': 1 } })); });
await p.goto(world.url + '?event'); await ready(p);
await p.evaluate(() => collAdd([{ k: 'sol ring', n: 'Sol Ring', q: 2 }], 'add')); await p.waitForTimeout(300);

/* ── 1) Accueil : le calendrier ── */
assert.equal(await p.evaluate(() => document.documentElement.dataset.event), 'noel');
await p.waitForSelector('#hmEvent.hm-adv .adv-grid');
assert.equal(await p.$$eval('#hmEvent .adv-d', l => l.length), 24, '24 boosters');
assert.deepEqual(await p.$$eval('#hmEvent .adv-d', l => [l[0].className, l[1].className].map(c => c.replace('adv-d ', ''))), ['today', 'lock'], '1er décembre : le booster du jour, puis ceux à venir');
assert.match(await p.textContent('#hmEvent .hm-ev-h'), /Calendrier de l'Avent 2026.*Encore 2 cadeaux pour ouvrir le booster du jour.*0\s*\/\s*24/s);
assert.equal(await p.$$eval('.hm-stage .adv-orbit i', l => l.length), 24, '24 lumières autour de l\'orbe');
assert.equal(await p.$eval('.hm-stage .adv-orbit i', i => i.className), 'now');
assert.equal(await p.evaluate(() => document.querySelectorAll('#hmEvent svg').length > 20), true, 'boosters dessinés en SVG');
await p.click('#hmEvent .adv-d[data-adv="5"]'); await p.waitForFunction(() => /Patience : ce booster s'ouvre le 5 décembre/.test(document.querySelector('#toast').textContent));
await shot(p, 'calendrier');
ok('accueil : 24 boosters (celui du jour, à venir avec leur date), lumières autour de l\'orbe, « Encore 2 cadeaux »');

/* ── 2) Les 2 cadeaux du jour → le booster s'ouvre ── */
const me = await p.evaluate(() => EV.st.me); assert.equal(me.spots.length, 2); assert.equal(me.left, 2);
for (const [k, x] of me.spots.entries()) {
  await p.evaluate(s => { EV_HIDE[s] = () => document.querySelector('#viewHome .hm-hero'); window.scrollTo(0, 0); evScan(); }, x.s);
  await p.waitForFunction(s => { evScan(); const y = EV.pks.get(s); return y && y.ok; }, x.s, { timeout: 8000 });
  assert.match(await p.evaluate(s => EV.pks.get(s).el.innerHTML, x.s), /<svg/, 'cadeau en SVG');
  await p.evaluate(s => EV.pks.get(s).el.click(), x.s);
  if (k === 0) { await p.waitForFunction(() => !EV.fly && EV.st.me.found.length === 1, null, { timeout: 8000 }); await p.waitForSelector('.ev-msg.on'); assert.match(await p.textContent('.ev-msg'), /Un cadeau !.*Encore 1 cadeau pour ouvrir le booster du jour/s); }
}
await p.waitForSelector('.adv-open.on', { timeout: 10000 });
await p.waitForTimeout(2400); await shot(p, 'ouverture');
const rv = await p.textContent('.adv-open');
assert.match(rv, /Jour 1 · booster ouvert/); assert.match(rv, /Le saviez-vous \?.*Ère glaciaire/s, 'porte 1 : anecdote');
assert.match(await p.$eval('.adv-front img', i => i.getAttribute('src')), /api\.scryfall\.com\/cards\/named\?exact=Snow-Covered%20Plains/);
assert.equal(await p.$('.ev-msg.on'), null, 'pas de message par-dessus l\'ouverture');
await p.click('.adv-open [data-adv-close]'); await p.waitForFunction(() => !document.querySelector('.adv-open'));
await p.waitForFunction(() => /1\s*\/\s*24/.test(document.querySelector('#hmEvent .hm-ev-n').textContent));
assert.equal(await p.$eval('#hmEvent .adv-d[data-adv="1"]', b => b.className), 'adv-d open');
assert.equal(await p.$eval('.hm-stage .adv-orbit i', i => i.className), 'on');
const bd = await p.evaluate(() => { const x = prgBadges().find(y => y.b.id === 'ev_noel-2026'); return [x.v, x.t, prgName(x.b, x.t), prgLabel(x.b, x.b.tiers[0])]; });
assert.deepEqual(bd, [1, 0, 'Lutin', '1 booster ouvert'], 'badge : boosters ouverts');
await p.click('#hmEvent .adv-d[data-adv="1"]'); await p.waitForSelector('.adv-open.on'); assert.match(await p.textContent('.adv-open h2 ~ *, .adv-open small'), /Jour 1/);
await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.adv-open'));
ok('2 cadeaux du jour (SVG) → le booster s\'ouvre : carte du jour (image Scryfall), anecdote ; 1 / 24, lumière allumée, badge « Lutin » ; porte ouverte revue');

/* ── 3) Récompenses : calendrier complet (simulé côté appli) ── */
const before = await p.evaluate(() => [evXp(), evCoverOk('noel'), advOrb(), prgXp()]);
assert.deepEqual(before.slice(0, 3), [0, false, false], 'porte 1 : ni XP, ni couleur, ni orbe');
await p.evaluate(() => { const j = {}; for (let i = 1; i <= 24; i++) j[evAdd('2026-12-01', i - 1)] = ['a', 'b']; EV.st.me.jours = j; ADV.rw = null; });
const after = await p.evaluate(() => [evXp(), evCoverOk('noel'), advOrb(true), evCoverOk('sapin'), prgXp()]);
assert.equal(after[0], await p.evaluate(() => evPack('noel').advent.list.reduce((s, d) => s + (d.r.xp || 0), 0)), 'XP de toutes les portes');
assert.deepEqual(after.slice(1, 4), [true, true, false], 'couleur animée et orbe gagnés au 24 ; couleur rare : seulement par tirage');
assert.ok(after[4] > before[3], 'XP comptée dans le niveau');
await p.evaluate(() => advOrbApply()); assert.equal(await p.evaluate(() => document.documentElement.classList.contains('ev-orb-noel')), true, 'orbe de Noël sur l\'accueil');
await p.evaluate(() => { EV.st.me.dr = { 7: 'houx' }; ADV.rw = null; }); assert.equal(await p.evaluate(() => evCoverOk('houx')), true, 'couleur rare tirée par le serveur : acquise');
await p.evaluate(() => openCollection('trade')); await p.waitForTimeout(600); await p.evaluate(() => bndOpenSettings()); await p.waitForSelector('.bnd-covers');
const covs = await p.$$eval('.bnd-covers .bnd-cv', l => l.map(b => b.dataset.c));
assert.ok(covs.includes('noel') && covs.includes('houx') && !covs.includes('sapin'), 'classeur : couleurs gagnées seulement ' + covs);
await shot(p, 'classeur');
ok('récompenses : XP des portes dans le niveau, décoration animée du classeur et orbe de Noël au 24e booster, couleurs rares seulement si tirées');

assert.deepEqual(errs.filter(e => !/scryfall|ERR_|net::/i.test(e)), []);
await browser.close(); world.stop();
console.log('ADVENT E2E OK');
