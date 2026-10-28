// E2E nid de Pâques (pack « paques », pas encore ouvert : EVENT_FORCE=paques-2027, 1er jour ; port 19887) : carte du nid de l'accueil (6 couvées, couvée en cours
// et ses 5 œufs du mana), 5 œufs du jour trouvés → la couvée se fêle puis éclot : plein écran « Un poussin est né ! », badge « Premier poussin » ; badges comptés
// en poussins (1, 2, 4, 6) ; 6e poussin : célébration « Les 6 poussins sont nés ». Puis (port 19888, œuf d'or forcé : EVENT_GOLD_P=1, aperçu du compte de
// l'éditeur au jour choisi) : Jeudi saint (cloches parties à Rome), dimanche de Pâques (retour des cloches en plein écran, 10 œufs), œuf d'or trouvé (plein écran,
// couleur de classeur « Œuf d'or » acquise). Captures : NEST_SHOTS=<dossier>.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, startWorld, newPage, signInFake, ok } from './e2e-world.mjs';
import { startFakes } from './amis-fakes.mjs';

const world = await startWorld({ port: 19887, env: { EVENT: '1', EVENT_FORCE: 'paques-2027', EVENT_SECRET: 'e2e', EVENT_GOLD_P: '0' } });      // pas d'œuf d'or ici (tiré au hasard : 1 %)
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
  await p.waitForFunction(s => { evScan(); const y = EV.pks.get(s); return y && y.ok; }, x.s, { timeout: 8000 }).catch(async e => {      // diagnostic (échec intermittent sur la CI, jamais en local)
    const d = await p.evaluate(s => { const y = EV.pks.get(s); return { has: !!y, ok: !!(y && y.ok), dead: !!(y && y.dead), k: y ? y.k : null, tries: y ? y.tries : null, hunt: evHuntOk(), over: [...document.querySelectorAll('.ev-intro, .ev-party, .ev-msg, .sheet-wrap.open, #splash')].map(o => o.className || o.id) }; }, x.s);
    throw new Error(`œuf ${i + 1} (${x.s}) jamais posé : ${JSON.stringify(d)} · ${e.message}`);
  });
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
await p.evaluate(() => { EV.st.me.n = 30; nestAfterFind(29, null, EV.st.me); });
await p.waitForSelector('.nest-open.on'); assert.match(await p.textContent('.nest-open'), /Couvée 6 sur 6.*Les 6 poussins sont nés.*Lapin d'or/s);
await p.click('.nest-open [data-adv-close]'); await p.waitForSelector('.ev-party.on', { timeout: 5000 });
assert.match(await p.textContent('.ev-party'), /6 sur 6.*Les 6 poussins sont nés/s);
await p.waitForTimeout(900); await shot(p, 'fin');
ok('6e poussin : éclosion, puis « Les 6 poussins sont nés » (Lapin d\'or)');

assert.deepEqual(errs, []);
world.stop();

/* ── 5) Cloches de Pâques et œuf d'or (aperçu de l'éditeur, jour choisi) ── */
const F = await startFakes();
const w2 = await startWorld({ port: 19888, env: { EVENT: '1', EVENT_SECRET: 'e2e', EVENT_GOLD_P: '1', ADMIN_EMAILS: 'uid-e2e-ed@test.dev', FIREBASE_JWKS_URL: F.env.FIREBASE_JWKS_URL } });
{
  const { p, errs } = await newPage(browser, w2, { path: '?event', ctx: { viewport: { width: 393, height: 852 } } });
  await p.addInitScript(() => { localStorage.setItem('deckdeal:ev', JSON.stringify({ seen: { 'paques-2026': 1 } })); });
  await p.goto(w2.url + '?event'); await p.waitForTimeout(500);
  await p.evaluate(tok => { window.__idTok = tok; }, F.jwt('uid-e2e-ed')); await signInFake(p);
  await p.evaluate(() => { EV.adm = EV.uid; evPvSet('paques~5', true); });      // Jeudi saint (5e jour)
  await p.waitForFunction(() => EV.st && EV.st.ev.preview && EV.st.ev.day === '2026-04-02' && EV.st.me, null, { timeout: 15000 });
  await p.evaluate(() => { evLsSet({ seen: { ...evLs().seen, 'paques-2026': 1 } }); evHomePaint(); document.getElementById('hmEvent').scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(400);
  assert.equal(await p.evaluate(() => document.documentElement.dataset.evphase), 'away');
  assert.match(await p.textContent('#hmEvent .nest-n-away'), /Jeudi saint.*parties à Rome/); assert.equal(await p.evaluate(() => EV.st.me.spots.length), 5);
  await shot(p, 'jeudi-saint');
  ok('Jeudi saint : les cloches sont parties à Rome (mot sur la carte, data-evphase="away"), 5 œufs');
  await p.evaluate(() => { EV.adm = EV.uid; openSettings(); }); await p.waitForSelector('[data-evpv="next"]');      // « Passer au jour suivant » : jeudi → vendredi
  assert.match(await p.textContent('[data-evpv="next"]'), /Jour 5 → jour 6/); await p.click('[data-evpv="next"]');
  await p.waitForFunction(() => EV.st && EV.st.ev.day === '2026-04-03' && EV.pv === 'paques~6', null, { timeout: 15000 });
  await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); });
  ok('« Passer au jour suivant » (aperçu) : jeudi → vendredi saint');
  // « Badges débloqués » (aperçu) : les 4 paliers en couleur, l'ultime animé ; rien de gardé
  await p.evaluate(() => openSettings()); await p.waitForSelector('#setEvPvB');
  const xp0 = await p.evaluate(() => prgNow().xp);
  await p.$eval('#setEvPvB', i => { i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); evHomePaint(); });
  assert.equal(await p.$$eval('#hmEvent .hm-ev-bdg .evb.got', l => l.length), 4); assert.equal(await p.$$eval('#hmEvent .hm-ev-bdg .evb.ult', l => l.length), 1, 'l\'ultime : couronne animée');
  assert.equal(await p.evaluate(() => evBadges().find(b => b.ev === 'paques-2026').v()), 6);
  assert.equal(await p.evaluate(() => prgNow().xp), xp0, 'paliers d\'essai : aucune XP');
  await p.evaluate(() => prgSheet('ev_paques-2026')); await p.waitForSelector('.prg-sheet.open .prg-b[data-b="ev_paques-2026"] .evb.ult');
  await shot(p, 'badges-debloques');
  assert.equal(await p.evaluate(() => (JSON.parse(localStorage.getItem('deckdeal:prg:got') || '{}') || {})['ev_paques-2026']), undefined, 'rien de gardé dans les badges acquis');
  await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); openSettings(); }); await p.waitForSelector('#setEvPvB');
  await p.$eval('#setEvPvB', i => { i.checked = false; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); evHomePaint(); });
  assert.equal(await p.$$eval('#hmEvent .hm-ev-bdg .evb.got', l => l.length), 0, 'coupé : les vrais paliers (aucun)');
  ok('« Badges débloqués » (aperçu) : 4 paliers en couleur, l\'ultime animé (accueil, fiche des badges), rien de gardé');
  await p.evaluate(() => evPvSet('paques~8', true));      // dimanche de Pâques
  await p.waitForFunction(() => EV.st && EV.st.ev.day === '2026-04-05' && EV.st.me && EV.st.me.spots.length === 10, null, { timeout: 15000 });
  await p.evaluate(() => { evLsSet({ seen: { ...evLs().seen, 'paques-2026': 1 } }); while (sheets.length) sheets[sheets.length - 1].close(); evHomePaint(); });
  await p.waitForSelector('.nest-bells.on', { timeout: 15000 });
  assert.match(await p.textContent('.nest-bells'), /Les cloches sont revenues de Rome.*Jeudi saint.*5 œufs de plus/s);
  await p.waitForTimeout(2600); await shot(p, 'cloches');
  await p.click('.nest-bells [data-nb="go"]'); await p.waitForFunction(() => !document.querySelector('.nest-bells'));
  assert.equal(await p.evaluate(() => document.documentElement.dataset.evphase), 'bells');
  await p.evaluate(() => document.getElementById('hmEvent').scrollIntoView({ block: 'center' })); assert.match(await p.textContent('#hmEvent .nest-n-bells'), /revenues de Rome : elles sèment 5 œufs de plus/);
  await p.evaluate(() => { evHomePaint(); }); assert.equal(await p.$$('.nest-bells.on').then(l => l.length), 0, 'une fois par jour');
  ok('dimanche de Pâques : retour des cloches en plein écran (une fois), 10 œufs à dénicher');
  // œuf d'or (forcé) : en or dans sa cachette, trouvé → plein écran, couleur rare acquise
  const x = await p.evaluate(() => EV.st.me.spots[0]); assert.equal(x.g, 1);
  await p.evaluate(s => { EV_HIDE[s] = () => document.querySelector('#viewHome .hm-hero'); window.scrollTo(0, 0); evScan(); }, x.s);
  await p.waitForFunction(s => { evScan(); const y = EV.pks.get(s); return y && y.ok; }, x.s, { timeout: 8000 });
  assert.equal(await p.evaluate(s => EV.pks.get(s).el.classList.contains('ev-gold') && !!EV.pks.get(s).el.querySelector('.evo-egg-gold'), x.s), true, 'œuf d\'or dans sa cachette');
  await shot(p, 'oeuf-dor-cachette');
  await p.evaluate(s => EV.pks.get(s).el.click(), x.s);
  await p.waitForSelector('.nest-open.nest-goldo.on', { timeout: 8000 });
  assert.match(await p.textContent('.nest-open'), /Un œuf d'or !.*Couleur rare : « Œuf d'or »/s);
  await p.waitForTimeout(1800); await shot(p, 'oeuf-dor');
  await p.click('.nest-open [data-adv-close]'); await p.waitForFunction(() => !document.querySelector('.nest-open'));
  assert.equal(await p.evaluate(() => evCoverOk('oeufdor')), true, 'couleur « Œuf d\'or » acquise');
  await p.evaluate(() => { document.querySelectorAll('.ev-msg').forEach(e => e.remove()); evHomePaint(); document.getElementById('hmEvent').scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(300);
  assert.match(await p.textContent('#hmEvent .nest-n-gold'), /œuf d'or/); await shot(p, 'nid-or');
  ok('œuf d\'or : en or dans sa cachette, plein écran, couleur de classeur « Œuf d\'or » acquise, mot sur la carte');
  assert.deepEqual(errs, []);
}
w2.stop(); F.stop(); await browser.close();
console.log('NEST E2E OK');
