// E2E animations : tout ce qui tourne en boucle s'anime par le compositeur seul (transform, opacity, filter), jamais en repeignant (fond qui défile,
// background-position, couleurs…) : sinon la page entière était repeinte à chaque image, en continu (clignotement dans la WebView Android, sans bandeau
// de pub surtout ; batterie). Accueil, collection, feuilles, badges (palier ultime d'une fête : couronne, braises), feuille de la fête, avec et sans fête
// (Halloween forcée, port 19893). Mesure aussi les repeintes réelles sur 1,5 s (trace Chromium) : accueil et fiche des badges.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, ok } from './e2e-world.mjs';

const world = await startWorld({ port: 19893, env: { EVENT: '1', EVENT_FORCE: 'halloween-2026', EVENT_SECRET: 'e2e' } });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const { p, errs } = await newPage(browser, world, { goto: false, ctx: { viewport: { width: 393, height: 852 } } });
await p.addInitScript(() => { localStorage.setItem('deckdeal:ev', JSON.stringify({ seen: { 'halloween-2026': 1 } })); });
await p.goto(world.url + '?event'); await p.waitForFunction(() => typeof EV !== 'undefined' && EV.st && EV.st.me, null, { timeout: 15000 });
await p.evaluate(() => collAdd([{ k: 'sol ring', n: 'Sol Ring', q: 2 }], 'add')); await p.waitForTimeout(800);
const OKP = ['transform', 'opacity', 'filter', 'translate', 'rotate', 'scale'];
/** Animations en cours qui ne sont pas de la composition seule : [« nom:propriétés@cible »]. */
const painting = () => p.evaluate(okp => [...new Set(document.getAnimations().filter(a => a.playState === 'running').map(a => {
  const kf = a.effect && a.effect.getKeyframes ? a.effect.getKeyframes() : [], props = [...new Set(kf.flatMap(f => Object.keys(f).filter(x => !['offset', 'easing', 'composite', 'computedOffset'].includes(x))))], t = a.effect.target;
  return props.some(x => !okp.includes(x)) ? (a.animationName || '?') + ':' + props.join('+') + '@' + (t.id || (t.className && t.className.baseVal !== undefined ? t.className.baseVal : t.className) || t.tagName) + (a.effect.pseudoElement || '') : '';
}).filter(Boolean))], OKP);
const cdp = await p.context().newCDPSession(p);
/** Repeintes pendant ms (trace Chromium). */
async function paints(ms = 1500) {
  const ev = [], h = d => ev.push(...d.value); cdp.on('Tracing.dataCollected', h);
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
  await p.waitForTimeout(ms); const done = new Promise(r => cdp.once('Tracing.tracingComplete', r)); await cdp.send('Tracing.end'); await done; cdp.off('Tracing.dataCollected', h);
  return ev.filter(e => e.name === 'Paint').length;
}
const closeAll = () => p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); for (const d of document.querySelectorAll('body > .dv.on')) if (d.__close) d.__close(); navGo('home'); window.scrollTo(0, 0); });

assert.deepEqual(await painting(), [], 'accueil : rien ne repeint en boucle'); assert.ok(await paints() <= 10, 'accueil au repos : (presque) aucune repeinte');
ok('accueil (orbe et son reflet foil, ambiance d\'Halloween) : animations par composition seule, pas de repeinte en continu');
for (const [nm, fn] of [['collection', () => openCollection()], ['réglages', () => openSettings()], ['feuille de la fête', () => evSheetOpen()], ['prix d\'une liste', () => showView('input')]]) {
  await closeAll(); await p.waitForTimeout(300); await p.evaluate(fn); await p.waitForTimeout(900);
  assert.deepEqual(await painting(), [], nm + ' : rien ne repeint en boucle');
}
ok('collection, réglages, feuille de la fête, prix d\'une liste : idem');
// fiche des badges avec le palier ultime d'Halloween (couronne qui tourne, halo, braises)
await closeAll(); await p.waitForTimeout(300);
await p.evaluate(() => { prgSheet(); }); await p.waitForSelector('.prg-sheet.open');
await p.evaluate(() => { const s = document.querySelector('.prg-sheet .sheet-body') || document.querySelector('.prg-sheet'), d = document.createElement('div'); d.className = 'prg-b'; d.innerHTML = evBadgeHtml('halloween-2026', 3, true); s.prepend(d); });
await p.waitForTimeout(800);
assert.equal(await p.$$eval('.prg-sheet .evb.ult', l => l.length), 1);
assert.deepEqual(await painting(), [], 'badge ultime : couronne, halo et braises par composition seule');
const n = await paints(); assert.ok(n <= 10, 'fiche des badges : ' + n + ' repeintes en 1,5 s (avant : une par image, toute la feuille)');
ok('fiche des badges, palier ultime animé : ' + n + ' repeinte(s) en 1,5 s (avant : ~90, toute la feuille)');
assert.deepEqual(errs, []);
world.stop(); await browser.close();
console.log('ANIM E2E OK');
