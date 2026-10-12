// E2E « prix Cardmarket » : sans token CardTrader, l'appli donne le prix tendance de chaque carte (relevé du serveur, sinon Scryfall),
// sans livraison ni vendeurs ; avec un token perso, elle cherche les offres CardTrader avec CE token (en-tête X-CT-Token).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, toInput, toHome, openMe, closeSheets } from './e2e-world.mjs';

const world = await startWorld({ port: 18930, env: { CARDTRADER_TOKEN: '' } });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const DECK = '1 Sol Ring\n2 Craterhoof Behemoth\n1 Carte Qui N Existe Pas';
const settle = p => p.waitForFunction(() => S.run && S.run.status !== 'running', null, { timeout: 30000 });
const amt = (p, re) => p.waitForFunction(r => new RegExp(r).test(document.querySelector('#heroAmt').textContent), re.source, { timeout: 5000 });
const run = async p => { await toInput(p); await p.fill('#deckText', DECK); await p.waitForTimeout(250); await p.click('#btnRun'); await settle(p); await p.waitForTimeout(400); };

{ // 1) sans relevé du serveur : Scryfall (prix de l'impression par défaut)
  const { p, errs } = await newPage(browser, world);
  await p.goto(world.url); await p.waitForTimeout(700);
  assert.equal(await p.evaluate(() => priceSrc()), 'cm'); assert.equal(await p.$eval('#srcField', e => e.hidden), false, 'choix CardTrader toujours visible'); assert.equal(await p.$eval('#segSrcRun', e => e._v), 'cm');
  assert.equal(await p.$eval('#ctGet', e => e.hidden), true); assert.equal(await p.$('#modeChip'), null); ok('serveur sans token, aucun token perso : prix Cardmarket par défaut, CardTrader proposé quand même, plus de pastille');
  await run(p);
  assert.equal(await p.evaluate(() => S.run.status), 'done');
  assert.equal(await txt(p, '#progTitle'), 'Prix Cardmarket');
  assert.equal(await txt(p, '#heroLabel'), 'Prix Cardmarket, à partir de');
  await amt(p, /19,50/);      // 1 × 1,50 + 2 × 9,00
  assert.equal(await p.$eval('#segDeliv', e => e.hidden), true); assert.equal(await p.$eval('#segTab', e => e.closest('.toolbar').hidden), true);
  assert.equal(await txt(p, '#btnCartTxt'), 'Copier pour Cardmarket');
  assert.equal(world.reqs(), 0, 'aucune requête CardTrader');
  assert.ok(world.scry.some(s => s.startsWith('POST /cards/collection')), 'Scryfall interrogé (pas de relevé serveur)');
  assert.match(await txt(p, '.row[data-key="carte qui n existe pas"]'), /Nom introuvable/);
  assert.match(await txt(p, '.row[data-key="craterhoof behemoth"]'), /Cardmarket.*Tendance · 2 × 9,00/);
  assert.match(await txt(p, '#recap'), /Prix tendance Cardmarket · impression la moins chère · hors port/);
  ok('recherche : prix tendance par carte (Scryfall), total 19,50 €, ni livraison ni vendeurs, aucune requête CardTrader, nom inconnu signalé');
  await p.click('.row[data-key="sol ring"]'); await p.waitForSelector('.sheet-wrap.open .cm-price');
  assert.match(await txt(p, '.cm-price'), /1,50/); assert.match(await p.$eval('.sheet-wrap.open a[href*="cardmarket.com"]', a => a.href), /cardmarket\.com\/fr\/Magic\/Products\/Search\?searchString=Sol%20Ring/);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400); ok('fiche carte : prix par exemplaire + lien Cardmarket');
  await p.evaluate(() => { window.__clip = ''; navigator.clipboard.writeText = t => { window.__clip = t; return Promise.resolve(); }; });
  await p.click('#btnCart'); await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => window.__clip), '1 Sol Ring\n2 Craterhoof Behemoth\n1 Carte Qui N Existe Pas'); assert.match(await txt(p, '#toast'), /Wants list Cardmarket/);
  ok('« Copier pour Cardmarket » : liste prête pour une Wants list');
  assert.deepEqual(errs, []); await p.context().close();
}

{ // 1 b) CardTrader choisi sans token : encart « Obtenir mon token » (page API de CardTrader), champ, « Tester » ; tuile valeur des Stats : même encart
  const { p, errs } = await newPage(browser, world);
  await p.goto(world.url); await p.waitForTimeout(700); await toInput(p);
  await p.click('#segSrcRun [data-v="ct"]'); await p.waitForSelector('#ctGet:not([hidden])');
  assert.equal(await p.evaluate(() => [S.src, priceSrc(), JSON.parse(localStorage.getItem('deckdeal:v1')).src].join()), 'ct,cm,ct', 'CardTrader choisi (retenu), prix Cardmarket en attendant le token');
  assert.match(await txt(p, '#ctGet'), /il faut ton token CardTrader.*Obtenir mon token.*ne le partage avec personne/);
  assert.deepEqual(await p.$eval('#ctGet a', a => [a.href, a.target]), ['https://www.cardtrader.com/fr-FR/full_api_app', '_blank']);
  assert.equal(await p.$eval('#optCond', e => e.offsetParent), null, 'critères CardTrader cachés sans token'); assert.equal(await p.$eval('#srcHint', e => e.hidden), true);
  await p.click('#segSrcRun [data-v="cm"]'); await p.waitForSelector('#ctGet', { state: 'hidden' }); assert.equal(await p.evaluate(() => S.src), 'cm');
  await p.reload(); await p.waitForTimeout(600); await toInput(p); await p.click('#segSrcRun [data-v="ct"]'); await p.waitForSelector('#ctGet:not([hidden])');
  await p.fill('#ctgTok', 'mon-token-cardtrader-1234567890'); await p.waitForTimeout(150);
  assert.equal(await p.isVisible('#ctGet'), true, 'encart gardé pendant la saisie');
  await p.click('#ctGet [data-ctg="test"]'); await p.waitForFunction(() => document.querySelector('#ctGet .status').dataset.ok === '1', null, { timeout: 8000 });
  assert.match(await txt(p, '#ctGet .status'), /Connexion réussie/);
  await p.waitForSelector('#ctGet', { state: 'hidden' });
  assert.equal(await p.evaluate(() => [S.token, priceSrc()].join()), 'mon-token-cardtrader-1234567890,ct'); assert.equal(await p.$eval('#optCond', e => e.offsetParent !== null), true, 'token validé : critères CardTrader');
  ok('Nouveau panier : CardTrader choisi sans token → encart (lien vers la page API, champ, Tester, avertissement), puis offres CardTrader');
  // tuile valeur des Stats sans token : touchée → feuille « CardTrader » (même encart)
  await p.evaluate(() => { S.token = ''; syncCTX(); saveStore(); localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: '2 Sol Ring', u: 1, s: '', b: null })); });
  await p.reload(); await p.waitForTimeout(600); await toHome(p); await p.click('#btnColl'); await p.waitForSelector('.coll.on'); await p.click('#collSeg [data-v="stats"]'); await p.waitForSelector('.cs-val[data-ctno]');
  assert.match(await txt(p, '.cs-val'), /CT : prix réels avec ton token CardTrader/);
  await p.click('.cs-val'); await p.waitForSelector('.ct-get-sheet .ct-get a[href*="full_api_app"]');
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  assert.deepEqual(errs, []); await p.context().close();
  ok('Stats sans token : la tuile valeur propose d\'ajouter le token (même encart)');
}

{ // 2) avec le relevé du serveur : prix « à partir de » sans Scryfall ; puis token perso → CardTrader avec ce token
  world.scry.length = 0;
  const { p, errs } = await newPage(browser, world);
  await p.route('**/prices.tsv', r => r.fulfill({ status: 200, contentType: 'text/tab-separated-values', body: '#MOPX1 2026-10-08T09:00:00Z 2\nSol Ring\t120\t100\nCraterhoof Behemoth\t800\t950\n' }));
  await p.goto(world.url); await p.waitForTimeout(700);
  await run(p);
  await amt(p, /17,20/);      // 1,20 + 2 × 8,00 (relevé)
  await p.waitForFunction(() => document.querySelectorAll('#list .row .thumb img').length === 2, null, { timeout: 8000 });      // vignettes des 2 cartes du relevé : lues après les prix
  assert.equal(world.scry.filter(s => s.startsWith('POST /cards/collection')).length, 2, 'Scryfall : la carte absente du relevé (prix), puis les vignettes en arrière-plan');
  assert.match(await txt(p, '.step[data-id="prints"]'), /8 oct/);
  ok('relevé du serveur : prix « à partir de » sans Scryfall (sauf carte absente), date du relevé affichée');

  // réglages : source des prix + token perso
  const ctHdr = []; p.on('request', r => { if (/\/api\/(marketplace|blueprints|expansions|info|jobs)/.test(r.url())) ctHdr.push(r.headers()['x-ct-token'] || ''); });
  await openMe(p, 'prix'); await p.waitForSelector('#setToken');
  assert.equal(await p.$('#segSrc'), null, 'plus de choix de source dans les réglages'); assert.match(await txt(p, '#connMsg'), /Sans token.*Ajoute ton token/);
  await p.fill('#setToken', 'mon-token-cardtrader-1234567890'); await p.waitForTimeout(150);
  assert.match(await txt(p, '#connMsg'), /CardTrader actif avec ton token/);
  ok('réglages : token CardTrader et statut à jour (le choix de la source est sur « Nouveau panier »)');
  await closeSheets(p); await p.waitForTimeout(200);
  await p.click('#btnBack'); await p.waitForSelector('#srcField:not([hidden])');
  assert.equal(await p.$eval('#segSrcRun', e => e._v), 'ct', 'token ajouté : CardTrader choisi'); assert.match(await txt(p, '#btnRunLabel'), /Chercher les offres/); assert.equal(await p.$eval('#optCond', e => e.offsetParent !== null), true, 'critères CardTrader visibles');
  await p.click('#btnRun'); await settle(p);
  assert.equal(await p.evaluate(() => S.run.src), 'ct'); assert.ok(world.reqs() > 0, 'offres CardTrader lues');
  assert.ok(ctHdr.length && ctHdr.every(h => h === 'mon-token-cardtrader-1234567890'), 'chaque requête CardTrader porte le token de l\'utilisateur');
  assert.equal(await p.$eval('#segDeliv', e => e.hidden), false); assert.equal(await txt(p, '#btnCartTxt'), 'Remplir le panier');
  ok('token perso : recherche CardTrader via le serveur avec ce token (X-CT-Token), livraison et panier de retour');
  await p.click('#btnBack'); await p.waitForSelector('#segSrcRun'); await p.click('#segSrcRun [data-v="cm"]'); await p.waitForTimeout(150);
  assert.equal(await p.evaluate(() => [S.src, priceSrc()].join()), 'cm,cm'); assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:v1')).src), 'cm');
  assert.match(await txt(p, '#btnRunLabel'), /Voir les prix/); assert.equal(await p.$eval('#optCond', e => e.offsetParent), null, 'Cardmarket : critères CardTrader masqués');
  ok('« Nouveau panier » : choix Cardmarket gardé même avec un token, critères CardTrader masqués');
  assert.deepEqual(errs, []); await p.context().close();
}

await browser.close(); world.stop();
console.log('\nCM E2E OK');
process.exit(0);
