// E2E niveau et badges (progress.js) sur le lien de test (https://manaorbit.app/test : même page, window.MO_TEST posé par le serveur) : pastille « Niv. N »
// à côté du compte dans Compte et réglages (rien sur l'adresse normale), fiche « Niveau et badges » (niveau, XP, paliers bronze → diamant, badges uniques),
// badges venus des vraies données (parties, collection) et des compteurs (scan), toast d'un nouveau palier (jamais au premier calcul), vitrine de 3 badges
// au plus sur la liste d'échange publique (aller-retour par readShare).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok } from './e2e-world.mjs';

const world = await startWorld({ port: 19488 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const T0 = Date.now() - 30 * 864e5;
const pl = (pos, nom, o = {}) => ({ pos, nom, sorte: pos === 1 ? 'moi' : 'invite', rang: o.w ? 1 : 2, vainqueur: !!o.w, ...(o.deck ? { deck: o.deck } : {}), ...(o.cmd ? { commandant: o.cmd } : {}) });
const HIST = [1, 2, 3].map(i => ({ id: 'prge2e00' + i, date: T0 + i * 864e5, duree: 8000, tours: 5, format: 40, places: [pl(1, 'Max', { deck: 'Krenko', cmd: 'Krenko, Mob Boss', w: true }), pl(2, 'Léa'), pl(3, 'Bob'), pl(4, 'Zoé'), pl(5, 'Ana'), pl(6, 'Tom')], moi: 1, src: 'h', at: T0, u: '', sv: 0 }));
const seed = `try { localStorage.setItem('deckdeal:onboard', '${T0}'); localStorage.setItem('deckdeal:partie:hist', ${JSON.stringify(JSON.stringify(HIST))}); } catch (e) {}`;

/* ── Adresse normale : rien ─────────────────────────────────────────────────────────────────────────────────── */
const n = await newPage(browser, world, { init: seed });
await n.p.evaluate(() => openSettings()); await n.p.waitForSelector('.me-sheet .me-stats');
assert.equal(await n.p.$('.prg-pill'), null, 'adresse normale : pas de niveau'); assert.equal(await n.p.evaluate(() => MO_TEST), false);
assert.deepEqual(n.errs, []); await n.ctx.close();
ok('adresse normale : aucune trace du niveau ni des badges');

/* ── Lien de test ───────────────────────────────────────────────────────────────────────────────────────────── */
const { p, errs, ctx } = await newPage(browser, world, { path: 'test', init: seed });
assert.equal(await p.evaluate(() => [MO_TEST, document.querySelector('base').getAttribute('href'), location.pathname]).then(x => x.join(' ')), 'true / /test');
await p.waitForFunction(() => CTX.proxy, null, { timeout: 8000 });
await p.evaluate(() => { prgCheck(); prgScan(Array.from({ length: 150 }, (_, i) => ({ key: 'sol ring', q: 1, l: i < 3 ? 'jp' : 'fr', es: i < 20 ? 'read' : 'auto', pk: null }))); });      // 150 cartes scannées, dont 3 japonaises, 20 éditions lues
await p.evaluate(() => openSettings()); await p.waitForSelector('.me-sheet .prg-pill');
const lv = await p.$eval('.prg-pill', b => b.textContent); assert.match(lv, /^Niv\. \d+$/);
await p.click('.prg-pill'); await p.waitForSelector('.prg-sheet .prg-grid');
const tile = id => p.evaluate(id => { const b = document.querySelector(`.prg-sheet [data-pin="${id}"]`); const t = b ? b.closest('.prg-b') : [...document.querySelectorAll('.prg-sheet .prg-b')].find(x => x.title === id); return t ? [t.className.replace('prg-b ', ''), t.querySelector('small').textContent] : null; }, id);
assert.deepEqual(await tile('sc_cards'), ['t0', '100 cartes scannées · bronze'], '150 cartes scannées : bronze');
assert.deepEqual(await tile('sc_city_jp'), ['tu', 'Une carte scannée dans cette langue'], 'Tokyo : badge unique');
assert.deepEqual(await tile('gm_wins'), ['t0', '1 victoire · bronze'], 'parties de l\'historique : 3 victoires → bronze');
assert.deepEqual(await tile('gm_table'), ['t0', '1 partie à 6 joueurs ou plus · bronze']);
assert.deepEqual(await tile('gm_fast'), ['t0', '1 victoire en 6 tours ou moins · bronze']);
assert.deepEqual(await tile('gm_streak'), ['t1', '3 victoires d\'affilée · argent']);
assert.match(await txt(p, '.prg-head'), new RegExp(`Niveau ${lv.replace('Niv. ', '')} [\\d  ]+ XP · encore`, 'i'));
assert.ok(await p.$('.prg-sheet .prg-b.off'), 'badges pas encore obtenus : grisés');
assert.equal(await p.$('.prg-sheet [data-pin="co_value"]'), null, 'badge pas obtenu : pas épinglable');
await p.screenshot({ path: 'shots/progress-badges.png' });
ok('lien de test : « ' + lv + ' » à côté du compte ; fiche : niveau, XP, bronze (150 scans), Tokyo (unique), victoires, grande tablée, série en argent');

/* ── Vitrine : 3 badges au plus ─────────────────────────────────────────────────────────────────────────────── */
for (const id of ['sc_cards', 'sc_city_jp', 'gm_streak']) { await p.click(`.prg-sheet [data-pin="${id}"]`); await p.waitForFunction(id => document.querySelector(`.prg-sheet [data-pin="${id}"]`).getAttribute('aria-pressed') === 'true', id); }
await p.click('.prg-sheet [data-pin="gm_wins"]'); await p.waitForFunction(() => /3 badges au plus/.test(document.querySelector('#toast').textContent));
assert.deepEqual(await p.evaluate(() => prgShare()), { bg: [['sc_cards', 0], ['sc_city_jp', 0], ['gm_streak', 1]] });
const back = await p.evaluate(() => readShare('trade', JSON.stringify({ have: [], want: [], by: 'Max', ...prgShare() })).bg);
assert.deepEqual(back, [['sc_cards', 0], ['sc_city_jp', 0], ['gm_streak', 1]], 'relu par readShare');
assert.deepEqual(await p.evaluate(() => readShare('trade', JSON.stringify({ have: [], want: [], bg: [['x<y', 0], ['sc_cards', 9], ['sc_cards', 1], ['a', 1], ['b', 1], ['c', 1]] })).bg), [['sc_cards', 1]], 'badges abîmés écartés, 3 au plus');
assert.match(await p.evaluate(b => { const d = document.createElement('div'); d.innerHTML = prgShowHtml(b); return d.textContent; }, back), /🔍Scanner.*🇯🇵Tokyo.*🔥Invincible/);
ok('vitrine : 3 badges au plus choisis dans la fiche (📌), envoyés avec la liste d\'échange, relus et montrés chez le visiteur');

/* ── Nouveau palier : toast ─────────────────────────────────────────────────────────────────────────────────── */
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); document.querySelector('#toast').textContent = ''; prgCheck(); prgScan(Array.from({ length: 900 }, () => ({ key: 'sol ring', q: 1, l: 'fr', es: 'auto', pk: null }))); });
await p.waitForFunction(() => /Nouveau badge : Scanner · argent|nouveaux badges/.test(document.querySelector('#toast').textContent), null, { timeout: 8000 });
ok('nouveau palier (1 000 cartes scannées) : toast « Nouveau badge : Scanner · argent » (jamais au premier calcul)');

assert.deepEqual(errs, []);
await browser.close(); world.stop(); console.log('\nPROGRESS E2E OK'); process.exit(0);
