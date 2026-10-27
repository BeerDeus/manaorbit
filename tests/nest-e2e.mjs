// E2E nid de Pâques (pack « paques », pas encore ouvert : EVENT_FORCE=paques-2027, 1er jour ; port 19887) : carte du nid de l'accueil (6 couvées, couvée en cours
// et ses 5 œufs du mana), 5 œufs du jour trouvés → la couvée se fêle puis éclot : plein écran « Un poussin est né ! », badge « Premier poussin » ; badges comptés
// en poussins (1, 2, 4, 6) ; 6e poussin : célébration « Les 6 poussins sont nés ». Captures : NEST_SHOTS=<dossier>.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, startWorld, newPage, ok } from './e2e-world.mjs';

const world = await startWorld({ port: 19887, env: { EVENT: '1', EVENT_FORCE: 'paques-2027', EVENT_SECRET: 'e2e' } });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const SHOTS = process.env.NEST_SHOTS || ''; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = (p, n) => (SHOTS ? p.screenshot({ path: `${SHOTS}/${n}.png` }) : null);
const ready = p => p.waitForFunction(() => typeof EV !== 'undefined' && EV.st && EV.st.me, null, { timeout: 15000 });

const { p, errs } = await newPage(browser, world, { path: '?event', ctx: { viewport: { width: 393, height: 852 } } });
await p.addInitScript(() => { localStorage.setItem('deckdeal:ev', JSON.stringify({ seen: { 'paques-2027': 1 } })); });
await p.goto(world.url + '?event'); await ready(p);

/* ── 1) Accueil : le nid ── */
assert.equal(await p.evaluate(() => document.documentElement.dataset.event), 'paques');
await p.waitForSelector('#hmEvent.hm-nest .nest-row');
await p.evaluate(() => document.getElementById('hmEvent').scrollIntoView({ block: 'center' }));
assert.equal(await p.$$eval('#hmEvent .nest-b', l => l.length), 6, '6 couvées');
assert.equal(await p.$$eval('#hmEvent .nest-b.cur', l => l.map(f => f.dataset.i).join()), '0', 'la 1re en cours');
assert.equal(await p.$$eval('#hmEvent .nest-egg', l => l.length), 5, '5 œufs du mana dans la couvée');
assert.match(await p.textContent('#hmEvent .hm-ev-h'), /Nid de Pâques 2027.*Encore 5 œufs à dénicher aujourd'hui.*0\s*\/\s*6/s);
assert.match(await p.textContent('#hmEvent .nest-cur'), /Couvée 1 sur 6/);
await shot(p, 'nid-0');
ok('accueil : le nid, 6 couvées, la couvée en cours et ses 5 œufs du mana, 0 / 6 poussins');

/* ── 2) Les 5 œufs du jour : la couvée se remplit, se fêle, puis éclot ── */
const me = await p.evaluate(() => EV.st.me); assert.equal(me.spots.length, 5);
for (const [i, x] of me.spots.entries()) {
  await p.evaluate(s => { EV_HIDE[s] = () => document.querySelector('#viewHome .hm-hero'); window.scrollTo(0, 0); evScan(); }, x.s);
  await p.waitForFunction(s => { evScan(); const y = EV.pks.get(s); return y && y.ok; }, x.s, { timeout: 8000 });
  await p.evaluate(s => EV.pks.get(s).el.click(), x.s);
  await p.waitForFunction(k => !EV.fly && EV.st.me.found.length === k + 1, i, { timeout: 8000 });
  if (i === 3) {
    await p.evaluate(() => { document.querySelectorAll('.ev-msg').forEach(e => e.remove()); document.getElementById('hmEvent').scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(300);
    assert.equal(await p.$$eval('#hmEvent .nest-egg.on', l => l.length), 4); assert.equal(await p.$eval('#hmEvent .nest-b.cur svg', s => s.classList.contains('evo-hatch-2')), true, '4 œufs sur 5 : le poussin regarde par la fêlure');
    await shot(p, 'nid-4');
  }
}
await p.waitForSelector('.nest-open.on', { timeout: 8000 });
assert.match(await p.textContent('.nest-open'), /Couvée 1 sur 6.*Un poussin est né !.*1 poussin dans ton nid.*Badge « Premier poussin »/s);
await p.waitForTimeout(2600); await shot(p, 'eclosion');
await p.click('.nest-open [data-adv-close]'); await p.waitForFunction(() => !document.querySelector('.nest-open'));
await p.evaluate(() => { document.querySelectorAll('.ev-msg').forEach(e => e.remove()); document.getElementById('hmEvent').scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(300);
assert.equal(await p.$$eval('#hmEvent .nest-b.done', l => l.length), 1); assert.equal(await p.$$eval('#hmEvent .nest-b.cur', l => l.map(f => f.dataset.i).join()), '1');
assert.match(await p.textContent('#hmEvent .hm-ev-h'), /1\s*\/\s*6/); assert.match(await p.textContent('#hmEvent .hm-ev-ft'), /prochain badge à 2 poussins/);
await shot(p, 'nid-1');
ok('5 œufs : la couvée se fêle puis éclot (plein écran, badge « Premier poussin »), 1 / 6 poussins, couvée 2 en cours');

/* ── 3) Badges comptés en poussins ── */
const b = await p.evaluate(() => { const x = evBadges().find(z => z.ev === 'paques-2027'); return { v: x.v(), tiers: x.tiers, d: x.d, names: x.names }; });
assert.deepEqual(b.tiers, [1, 2, 4, 6]); assert.equal(b.v, 1); assert.deepEqual(b.d, ['{n} poussin éclos', '{n} poussins éclos']);
assert.deepEqual(b.names, ['Premier poussin', 'Couveur', 'Gardien du nid', 'Lapin d\'or']);
await p.evaluate(() => evSheetOpen()); await p.waitForSelector('.ev-sheet.open .ev-sbs');
assert.match(await p.textContent('.ev-sheet.open .ev-sh-top'), /1 poussin éclos/); assert.match(await p.textContent('.ev-sheet.open .ev-sbs'), /Couveur.*2 poussins éclos.*Lapin d'or.*6 poussins éclos/s);
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); });
ok('badges du nid : 1, 2, 4, 6 poussins éclos (feuille de la fête)');

/* ── 4) Dernière couvée (progression simulée) : éclosion puis célébration ── */
await p.evaluate(() => { EV.st.me.n = 30; nestAfterFind(29, EV.st.me); });
await p.waitForSelector('.nest-open.on'); assert.match(await p.textContent('.nest-open'), /Couvée 6 sur 6.*Les 6 poussins sont nés.*Lapin d'or/s);
await p.click('.nest-open [data-adv-close]'); await p.waitForSelector('.ev-party.on', { timeout: 5000 });
assert.match(await p.textContent('.ev-party'), /6 sur 6.*Les 6 poussins sont nés/s);
await p.waitForTimeout(900); await shot(p, 'fin');
ok('6e poussin : éclosion, puis « Les 6 poussins sont nés » (Lapin d\'or)');

assert.deepEqual(errs, []);
world.stop(); await browser.close();
console.log('NEST E2E OK');
