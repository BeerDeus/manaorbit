// E2E « marché TCGplayer » (core.js › MK) : ?mkt=us → prix du marché TCGplayer en dollars (Scryfall usd), libellés TCGplayer, lien et Mass Entry TCGplayer,
// aucun CardTrader (choix, ligne des réglages) ; Compte et réglages › Prix › Marché des prix : retour à Cardmarket (euros), l'appli redémarre. Port 18945.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, toInput, openMe } from './e2e-world.mjs';

const world = await startWorld({ port: 18945, env: { CARDTRADER_TOKEN: '' } });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const DECK = '1 Sol Ring\n2 Craterhoof Behemoth';
const settle = p => p.waitForFunction(() => S.run && S.run.status !== 'running', null, { timeout: 30000 });
const amt = (p, re) => p.waitForFunction(r => new RegExp(r).test(document.querySelector('#heroAmt').textContent), re.source, { timeout: 5000 });      // total animé : sa valeur finale
const run = async p => { await toInput(p); await p.fill('#deckText', DECK); await p.waitForTimeout(250); await p.click('#btnRun'); await settle(p); await p.waitForTimeout(400); };

{
  const { p, errs } = await newPage(browser, world);
  await p.goto(world.url + '?mkt=us'); await p.waitForTimeout(800);
  assert.deepEqual(await p.evaluate(() => [MK.id, MK.pick, mkCur(), localStorage.getItem('deckdeal:mkt'), document.documentElement.dataset.mkt]), ['us', 'us', 'USD', 'us', 'us'], '?mkt=us gardé comme un choix');
  assert.equal(await p.evaluate(() => ctReady()), false); assert.equal(await txt(p, '[data-hm="price"] small'), 'TCGplayer');
  await toInput(p);
  assert.equal(await p.$eval('#segSrcRun', e => e.hidden), true, 'pas de choix CardTrader');
  assert.match(await txt(p, '#viewInput .intro p'), /prix du marché TCGplayer de chaque carte\.$/);
  ok('marché TCGplayer : choix gardé, accueil et « Prix d\'une liste » sans CardTrader');
  await run(p);
  assert.equal(await txt(p, '#heroLabel'), 'Prix TCGplayer, à partir de');
  await amt(p, /25,35\s*\$/);      // dollars : 1 × 1,95 + 2 × 11,70
  assert.match(await txt(p, '.row[data-key="craterhoof behemoth"]'), /TCGplayer.*Prix du marché · 2 × 11,70/);
  assert.equal(await txt(p, '#btnCartTxt'), 'Copier pour TCGplayer'); assert.equal(world.reqs(), 0, 'aucune requête CardTrader');
  ok('recherche : prix du marché TCGplayer en dollars, libellés TCGplayer');
  await p.click('.row[data-key="sol ring"]'); await p.waitForSelector('.sheet-wrap.open .cm-price');
  assert.match(await txt(p, '.cm-price'), /1,95/); assert.match(await p.$eval('.sheet-wrap.open a[href*="tcgplayer.com"]', a => a.href), /tcgplayer\.com\/search\/magic\/product\?productLineName=magic&q=Sol%20Ring/);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.evaluate(() => { window.__clip = ''; navigator.clipboard.writeText = t => { window.__clip = t; return Promise.resolve(); }; window.__open = []; window.open = (...a) => { window.__open.push(a); return null; }; });
  await p.click('#btnCart'); await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => window.__clip), '1 Sol Ring\n2 Craterhoof Behemoth'); assert.match(await txt(p, '#toast'), /Mass Entry TCGplayer/);
  await p.click('#toast button'); assert.equal(await p.evaluate(() => window.__open[0][0]), 'https://www.tcgplayer.com/massentry');
  ok('fiche carte : lien TCGplayer ; « Copier pour TCGplayer » → Mass Entry');
  await openMe(p);
  assert.match(await txt(p, '[data-me="marche"]'), /Marché des prix TCGplayer · \$/); assert.equal(await p.$('[data-me="prix"]'), null, 'pas de ligne CardTrader');
  await p.click('[data-me="marche"]'); await p.waitForSelector('#segMkt');
  assert.match(await p.$eval('#segMkt', e => e.closest('.sheet').innerText.replace(/\s+/g, ' ')), /Automatique : Europe, Cardmarket en euros/);
  assert.equal(await p.$eval('#segMkt', e => e._v), 'us');
  await Promise.all([p.waitForNavigation(), p.click('#segMkt [data-v="eu"]')]); await p.waitForTimeout(800);
  assert.deepEqual(await p.evaluate(() => [MK.id, mkCur(), localStorage.getItem('deckdeal:mkt')]), ['eu', 'EUR', 'eu'], 'Cardmarket choisi : l\'appli redémarre en euros');
  await run(p);
  assert.equal(await txt(p, '#heroLabel'), 'Prix Cardmarket, à partir de'); await amt(p, /19,50\s*€/);
  ok('Marché des prix › Cardmarket : retour aux euros (19,50 €)');
  assert.deepEqual(errs, []); await p.context().close();
}

{ // anglais, TCGplayer : textes réécrits, dollars à l'américaine
  const { p, errs } = await newPage(browser, world);
  await p.goto(world.url + '?mkt=us&lang=en'); await p.waitForTimeout(800);
  await run(p);
  assert.equal(await txt(p, '#heroLabel'), 'TCGplayer price, from'); await amt(p, /\$25\.35/);
  ok('anglais : « TCGplayer price, from », $25.35');
  assert.deepEqual(errs, []); await p.context().close();
}

await browser.close(); world.stop(); console.log('MARKET OK'); process.exit(0);
