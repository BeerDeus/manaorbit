// E2E nuit des étoiles filantes (Nouvel an forcé : EVENT_FORCE=nouvelan-2026, 1er jour ; port 19881) : carte du ciel de l'accueil (5 constellations, compte
// à rebours), 5 étoiles du jour attrapées → 5 / 30, la constellation du Soleil s'allume ; 6e étoile : plein écran « Constellation du Soleil », badge « Fêtard » ;
// récompenses (couverture unique pour les 30 étoiles, couleurs rares seulement par tirage) ; passé minuit : « Bonne année », feu d'artifice, « Ton année Magic »
// et son image à partager. Captures : SKY_SHOTS=<dossier>.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, startWorld, newPage, ok } from './e2e-world.mjs';

const world = await startWorld({ port: 19881, env: { EVENT: '1', EVENT_FORCE: 'nouvelan-2026', EVENT_SECRET: 'e2e' } });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const SHOTS = process.env.SKY_SHOTS || ''; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = (p, n) => (SHOTS ? p.screenshot({ path: `${SHOTS}/${n}.png` }) : null);
const ready = p => p.waitForFunction(() => typeof EV !== 'undefined' && EV.st && EV.st.me, null, { timeout: 15000 });

const { p, errs } = await newPage(browser, world, { path: '?event', ctx: { viewport: { width: 393, height: 852 } } });
await p.addInitScript(() => { localStorage.setItem('deckdeal:ev', JSON.stringify({ seen: { 'nouvelan-2026': 1 } })); });
await p.goto(world.url + '?event'); await ready(p);
await p.evaluate(() => collAdd([{ k: 'sol ring', n: 'Sol Ring', q: 2 }], 'add')); await p.waitForTimeout(300);

/* ── 1) Accueil : le ciel ── */
assert.equal(await p.evaluate(() => document.documentElement.dataset.event), 'nouvelan');
await p.waitForSelector('#hmEvent.hm-sky .sky-cons');
assert.deepEqual(await p.$$eval('#hmEvent .sky-c', l => l.map(f => f.dataset.k)), ['W', 'U', 'B', 'R', 'G'], '5 constellations, une par couleur');
assert.equal(await p.$$eval('#hmEvent .sky-cd > span', l => l.length), 4, 'compte à rebours : jours, heures, minutes, secondes');
assert.match(await p.textContent('#hmEvent .hm-ev-h'), /Nuit des étoiles filantes 2026.*Encore 5 étoiles filantes à attraper aujourd'hui.*0\s*\/\s*30/s);
const s0 = await p.$eval('#hmEvent .sky-cd > span:last-child b', b => b.textContent); await p.waitForTimeout(1200);
assert.notEqual(await p.$eval('#hmEvent .sky-cd > span:last-child b', b => b.textContent), s0, 'les secondes défilent');
await shot(p, 'ciel');
ok('accueil : ciel de nuit, 5 constellations, compte à rebours jusqu\'à minuit qui défile');

/* ── 2) Les 5 étoiles du jour ── */
const me = await p.evaluate(() => EV.st.me); assert.equal(me.spots.length, 5); assert.equal(me.left, 5);
for (const x of me.spots) {
  await p.evaluate(s => { EV_HIDE[s] = () => document.querySelector('#viewHome .hm-hero'); window.scrollTo(0, 0); evScan(); }, x.s);
  await p.waitForFunction(s => { evScan(); const y = EV.pks.get(s); return y && y.ok; }, x.s, { timeout: 8000 });
  const n = await p.evaluate(() => EV.st.me.found.length);
  await p.evaluate(s => EV.pks.get(s).el.click(), x.s);
  await p.waitForFunction(k => !EV.fly && EV.st.me.found.length === k + 1, n, { timeout: 8000 });
}
await p.waitForFunction(() => /5\s*\/\s*30/.test(document.querySelector('#hmEvent .hm-ev-n').textContent));
assert.equal(await p.$eval('#hmEvent .sky-c[data-k="W"] small', s => s.textContent.trim()), '5 / 6');
assert.equal(await p.$('.adv-open'), null, '5 étoiles : pas encore de constellation complète');
assert.equal(await p.evaluate(() => Object.keys(EV.st.me.dr || {}).every(k => k === '1')), true, 'couleur rare : seulement pour le jour joué');
ok('5 étoiles attrapées → 5 / 30, la constellation du Soleil à 5 / 6');

/* ── 3) Constellation complète ── */
await p.evaluate(() => { EV.st.me.n = 6; skyAfterFind(5, EV.st.me.dr || {}, EV.st.me); });
await p.waitForSelector('.sky-open.on'); await p.waitForTimeout(1200); await shot(p, 'constellation');
const rv = await p.textContent('.sky-open');
assert.match(rv, /Constellation 1 sur 5/); assert.match(rv, /Constellation du Soleil/); assert.match(rv, /Badge « Fêtard »/);
await p.click('.sky-open [data-adv-close]'); await p.waitForFunction(() => !document.querySelector('.sky-open'));
const bd = await p.evaluate(() => { const x = prgBadges().find(y => y.b.id === 'ev_nouvelan-2026'); return [x.v, x.t, prgName(x.b, x.t), prgLabel(x.b, x.b.tiers[0])]; });
assert.deepEqual(bd, [1, 0, 'Fêtard', '1 constellation complète'], 'badge : constellations complètes');
ok('6e étoile : plein écran « Constellation du Soleil », badge « Fêtard » (constellations complètes)');

/* ── 4) Récompenses ── */
assert.deepEqual(await p.evaluate(() => [evCoverOk('constellation'), evCoverOk('aurore')]), [false, false]);
await p.evaluate(() => { EV.st.me.n = 30; EV.st.me.dr = { 3: 'comete' }; ADV.rw = null; });
assert.deepEqual(await p.evaluate(() => [evCoverOk('constellation'), evCoverOk('comete'), evCoverOk('aurore')]), [true, true, false], 'couverture unique aux 30 étoiles ; rare : seulement tirée');
await p.evaluate(() => openCollection('trade')); await p.waitForTimeout(600); await p.evaluate(() => bndOpenSettings()); await p.waitForSelector('.bnd-covers');
const covs = await p.$$eval('.bnd-covers .bnd-cv', l => l.map(b => b.dataset.c));
assert.ok(covs.includes('constellation') && covs.includes('comete') && !covs.includes('eclipse'), 'classeur : ' + covs);
await shot(p, 'classeur');
await p.evaluate(() => { while (typeof sheets !== 'undefined' && sheets.length) sheets[sheets.length - 1].close(); closeCollection(); showView('home'); });
await p.waitForTimeout(500);
ok('récompenses : couverture « Constellations » aux 30 étoiles, couleurs rares seulement si tirées');

/* ── 5) Minuit : « Bonne année », feu d'artifice, « Ton année Magic » ── */
await p.evaluate(() => { EV.st.me.n = 5; const mid = skyMidnight(EV.st.ev), d0 = Date.now; Date.now = () => d0() + Math.max(0, mid - d0()) + 5000; const b = document.getElementById('hmEvent'); b.dataset.sig = ''; evHomePaint(); });
await p.waitForSelector('#hmEvent .sky-ny'); assert.match(await p.textContent('#hmEvent .sky-ny'), /Bonne année 2027 !.*Ton année Magic 2026/s);
await p.evaluate(() => skyFireworks()); await p.waitForSelector('.sky-fw.on'); await p.waitForTimeout(1500); await shot(p, 'feu-artifice');
assert.match(await p.textContent('.sky-fw'), /Bonne année 2027 !.*Voir mon année 2026/s);
assert.equal(await p.evaluate(() => !!evLs().fw['nouvelan-2026']), true, 'une seule fois par appareil');
await p.click('.sky-fw [data-fw="year"]'); await p.waitForSelector('.sky-sheet .sky-ts'); await p.waitForTimeout(600);
assert.match(await p.textContent('.sky-sheet'), /Ton année Magic 2026/); assert.equal(await p.$$eval('.sky-sheet .sky-t', l => l.length), 7);
await shot(p, 'annee');
await p.click('.sky-sheet [data-sky="share"]'); await p.waitForSelector('.simg-prev[data-st="ok"]', { timeout: 15000 }); await shot(p, 'annee-image');
ok('minuit : « Bonne année 2027 », feu d\'artifice (une fois), « Ton année Magic 2026 » et son image à partager');

assert.deepEqual(errs.filter(e => !/scryfall|ERR_|net::/i.test(e)), []);
await browser.close(); world.stop();
console.log('SKY E2E OK');
