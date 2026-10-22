// E2E statistiques des parties et invitation à installer l'appli : « Mes parties » › Statistiques (chiffres clés, mes decks, adversaires, commandants
// vus à ma table) depuis l'historique de l'appareil ; page d'un deck joué (victoires sur parties) ; fin de partie avec un invité (QR code « Fais
// découvrir Mana Orbit », partager le lien) ; lien ?invite=partie ouvert dans le navigateur d'un téléphone Android (Google Play) ou d'un ordinateur (rien) ; partie Standard : marquée dans la liste, statistiques par format (Tous, Commander, Standard).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, toHome } from './e2e-world.mjs';

const world = await startWorld({ port: 19484 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const T0 = 1760000000000;
const pl = (pos, nom, o = {}) => ({ pos, nom, sorte: pos === 1 ? 'moi' : 'invite', rang: o.w ? 1 : 2, vainqueur: !!o.w, ...(o.deck ? { deck: o.deck } : {}), ...(o.cmd ? { commandant: o.cmd } : {}) });
const g = (i, places) => ({ id: 'e2estat' + String(i).padStart(3, '0'), date: T0 + i * 86400e3, duree: 3000, tours: 9, format: 40, places, moi: 1, src: 'h', at: T0 + i * 86400e3, u: '', sv: 0 });
const HIST = [
  g(1, [pl(1, 'Max', { deck: 'Krenko tokens', cmd: 'Krenko, Mob Boss', w: true }), pl(2, 'Léa', { cmd: 'Edgar Markov' }), pl(3, 'Bob', { cmd: 'Atraxa, Praetors\' Voice' })]),
  g(2, [pl(1, 'Max', { deck: 'Krenko tokens', cmd: 'Krenko, Mob Boss' }), pl(2, 'Léa', { cmd: 'Edgar Markov', w: true })]),
  g(3, [pl(1, 'Max', { deck: 'Krenko tokens', cmd: 'Krenko, Mob Boss', w: true }), pl(2, 'Bob', { cmd: 'Atraxa, Praetors\' Voice' })]),
];
const seed = `try { localStorage.setItem('deckdeal:onboard', '1'); localStorage.setItem('deckdeal:partie:hist', ${JSON.stringify(JSON.stringify(HIST))}); } catch (e) {}`;
const { p, errs, ctx } = await newPage(browser, world, { init: seed });

/* ── Mes parties › Statistiques ─────────────────────────────────────────────────────────────────────────────── */
await toHome(p); await p.waitForSelector('#hmPartie');
await p.click('#hmPartie .hm-tr-acts [data-pu="hist"]'); await p.waitForSelector('.pu-sheet .pu-tabs');
assert.equal(await p.$$eval('.pu-sheet .pu-hist li', l => l.length), 3, 'onglet Parties d\'abord : la liste');
await p.click('.pu-tabs [data-v="stats"]'); await p.waitForSelector('.pu-kpis');
assert.deepEqual(await p.$$eval('.pu-kpis > div', d => d.map(x => [...x.children].map(c => c.textContent).join(' '))), ['3 parties', '67 % 2 victoires', '50 min 9 tours en moyenne', '1 d\'affilée (record 1)']);
const rows = await p.$$eval('.pu-st', u => u.map(x => [...x.querySelectorAll('li')].map(li => [...li.querySelectorAll('b, small')].map(e => e.textContent.trim()).filter(Boolean).join(' '))));
assert.deepEqual(rows[0], ['Krenko tokens Krenko, Mob Boss 67 % 2 sur 3'], 'mes decks');
assert.deepEqual(rows[1], ['Léa 2 parties ensemble 1 – 1', 'Bob 2 parties ensemble 2 – 0'], 'adversaires : mes victoires – les siennes');
assert.deepEqual(rows[2], ['Edgar Markov vu 2 fois 1 victoire', 'Atraxa, Praetors\' Voice vu 2 fois 0 victoire'], 'commandants vus à ma table');
await p.screenshot({ path: 'shots/partie-stats.png' });
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); });
ok('Mes parties › Statistiques : 3 parties, 67 %, durée, série ; Krenko tokens 2 sur 3 ; Léa 1 – 1, Bob 2 – 0 ; Edgar Markov vu 2 fois');

/* ── Page d'un deck joué ────────────────────────────────────────────────────────────────────────────────────── */
assert.match(await p.evaluate(() => puDeckStatHtml('krenko TOKENS')), /2 victoires sur 3 parties \(67 %\)/, 'deck retrouvé par son nom, sans casse');
assert.equal(await p.evaluate(() => puDeckStatHtml('Jamais joué')), '', 'deck jamais joué : rien');
ok('page d\'un deck : « 2 victoires sur 3 parties (67 %) », lien vers les statistiques');

/* ── Fin de partie avec un invité : faire découvrir l'appli ───────────────────────────────────────────────── */
await p.evaluate(() => { let st = partieNew({ moi: { nom: 'Max' } }); st = partieAddPlace(st, { sorte: 'invite', nom: 'Bob' }); st = partieStart(st); puOpen(st); });
await p.waitForSelector('.pu.on'); await p.evaluate(() => puEndSheet()); await p.waitForSelector('.pu-wins');
await p.click('.pu-wins [data-w="1"]'); await p.click('.sheet [data-ok]'); await p.waitForSelector('.pu-inv');
assert.match(await txt(p, '.pu-inv'), /Fais découvrir Mana Orbit Les invités le scannent/);
assert.ok(await p.$('.pu-inv .pu-qr-img svg'), 'QR code du lien d\'invitation');
await p.evaluate(() => { window.__shared = null; window.shareOut = o => { window.__shared = o; }; });
await p.click('.pu-inv [data-pu="share-app"]'); assert.equal(await p.evaluate(() => window.__shared.url), 'https://manaorbit.app/?invite=partie');
assert.equal(await p.evaluate(() => partieStats(partieHist()).n), 4, 'la partie gagnée rejoint les statistiques');
await p.screenshot({ path: 'shots/partie-invite.png' });
ok('fin de partie avec un invité : QR code « Fais découvrir Mana Orbit » et lien à partager ; partie comptée dans les statistiques');
await p.evaluate(() => puClose()); await p.waitForFunction(() => !document.querySelector(".pu"));
/* ── Partie Standard dans l'historique : marquée dans la liste, comptée à part dans les statistiques (Tous / Commander / Standard) ─────────── */
await p.evaluate(T0 => partieHistAdd({ id: 'e2estd000001', date: T0 + 9 * 86400e3, duree: 900, tours: 7, format: 20, jeu: 'standard', moi: 1, src: 'h', at: T0, u: '', sv: 0,
  places: [{ pos: 1, nom: 'Max', sorte: 'moi', deck: 'Mono-rouge', rang: 1, vainqueur: true }, { pos: 2, nom: 'Léa', sorte: 'invite', deck: 'Azorius', rang: 2, vainqueur: false }] }), T0);
await p.evaluate(() => puHist()); await p.waitForSelector('.pu-hist li');
assert.equal(await p.$$eval('.pu-hist li', l => l.filter(x => x.querySelector('.pu-jtag')).map(x => x.querySelector('.pu-jtag').textContent).join()), 'Standard', 'liste : la partie Standard marquée, les autres non');
await p.click('.pu-tabs [data-v="stats"]'); await p.waitForSelector('.pu-sjeu');
assert.deepEqual(await p.$$eval('.pu-sjeu button', b => b.map(x => x.textContent.replace(/\s+/g, ' ').trim())), ['Tous 5', 'Commander 4', 'Standard 1']);
assert.equal(await p.$eval('.pu-kpis > div b', b => b.textContent), '5', 'Tous : les deux formats');
await p.click('.pu-sjeu [data-sj="standard"]'); await p.waitForFunction(() => document.querySelector('.pu-kpis > div b').textContent === '1');
const rowsS = await p.$$eval('.pu-st', u => u.map(x => [...x.querySelectorAll('li')].map(li => [...li.querySelectorAll('b, small')].map(e => e.textContent.trim()).filter(Boolean).join(' '))));
assert.deepEqual(rowsS, [['Mono-rouge 100 % 1 sur 1'], ['Léa 1 partie ensemble 1 – 0']], 'Standard : mes decks et adversaires, pas de commandants');
await p.screenshot({ path: 'shots/partie-stats-standard.png' });
await p.click('.pu-sjeu [data-sj="commander"]'); await p.waitForFunction(() => document.querySelector('.pu-kpis > div b').textContent === '4');
assert.match(await txt(p, '.pu-hbody'), /Commandants à ta table/);
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); });
assert.match(await p.evaluate(() => puDeckStatHtml('Mono-rouge')), /1 victoire sur 1 partie \(100 %\)/, 'page d\'un deck : ses parties, tous formats');
ok('partie Standard : marquée dans Mes parties, statistiques Tous 5 / Commander 4 / Standard 1, decks et adversaires du Standard à part');
assert.deepEqual(errs, []); await ctx.close();

/* ── Lien ?invite=partie : téléphone Android dans le navigateur, ordinateur ──────────────────────────────────── */
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const a = await newPage(browser, world, { path: '?invite=partie', ctx: { userAgent: UA } });
await a.p.waitForFunction(() => sheets.length && /Bienvenue sur Mana Orbit/.test(sheets[sheets.length - 1].wrap.textContent), null, { timeout: 8000 });
assert.equal(await a.p.$eval('.pu-getapp a', e => e.getAttribute('href')), 'https://play.google.com/store/apps/details?id=app.manaorbit');
assert.equal(await a.p.evaluate(() => !!OB.el), false, 'accueil du premier lancement passé');
await a.p.screenshot({ path: 'shots/partie-invite-android.png' });
assert.match(await a.p.evaluate(() => puGetAppHtml()), /Installer depuis Google Play/, 'navigateur Android : carte Google Play (aussi après une table rejointe ou un résultat scanné)');
assert.deepEqual(a.errs, []); await a.ctx.close();
const b = await newPage(browser, world, { path: '?invite=partie', ctx: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', isMobile: false, hasTouch: false } });
await b.p.waitForTimeout(1500);
assert.equal(await b.p.evaluate(() => sheets.some(s => /Bienvenue sur Mana Orbit/.test(s.wrap.textContent))), false, 'ordinateur : pas d\'appli à installer, rien de plus');
assert.equal(await b.p.evaluate(() => puGetAppHtml()), '');
assert.deepEqual(b.errs, []); await b.ctx.close();
ok('lien d\'invitation : Android (navigateur) → « Bienvenue sur Mana Orbit » et Google Play ; ordinateur → rien');

await browser.close(); world.stop(); console.log('\nPARTIE STATS E2E OK'); process.exit(0);
