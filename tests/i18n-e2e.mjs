// E2E anglais : ?lang=en (gardé ensuite), textes de la page et du code traduits, nombres et prix au format anglais, retour au français par les réglages.
// Relève aussi les textes encore en français sur les écrans principaux (liste affichée, à relire), sans faire échouer le test pour autant.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, toInput, toHome, openMe } from './e2e-world.mjs';

const world = await startWorld({ port: 18940, env: { CARDTRADER_TOKEN: '' } });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const FR = /\b(les|des|une|ton|tes|avec|pour|dans|cartes?|prix|aucune?|réglages|vérifie|ajoute|choisis|enregistr\w+|à|é\w*)\b/i;
const leftovers = async p => p.evaluate(fr => {
  const re = new RegExp(fr, 'i'), out = new Set(), w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const n = w.currentNode, el = n.parentElement; if (!el || el.closest('script,style,textarea,[hidden]') || !el.offsetParent) continue;
    const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t.length > 2 && re.test(t)) out.add(t.slice(0, 90));
  }
  return [...out];
}, FR.source);

const { p, errs } = await newPage(browser, world, { goto: false });
await p.goto(world.url + '?lang=en'); await p.waitForTimeout(800);
assert.equal(await p.evaluate(() => [I18N.lang, document.documentElement.lang, localStorage.getItem('deckdeal:lang')].join()), 'en,en,en');
assert.equal(await p.evaluate(() => location.search), '', 'adresse nettoyée');
assert.equal(await txt(p, '#nav [data-nav="home"]'), 'Home'); assert.equal(await txt(p, '#nav [data-nav="trade"]'), 'Trade'); assert.match(await txt(p, '#hmTrade'), /Trade/); assert.equal(await p.evaluate(() => priceSrc()), 'cm');
assert.match(await txt(p, '#hmPartie'), /^Life counter Commander, Standard or free-form New game My games/, 'compteur de vie : nom global traduit');
const home = await leftovers(p); console.log('  accueil, encore en français :', home.length ? home : 'rien');
await p.evaluate(() => puGo()); await p.waitForSelector('.pu.on .pu-jeu');
assert.deepEqual(await p.$$eval('.pu-jeu .seg-opt', b => b.map(x => x.textContent.trim())), ['Commanderup to 8', 'Standard1 vs 1', 'Free-formany life'], 'formats de la partie en anglais');
assert.equal(await p.$eval('.pu.on', e => e.getAttribute('aria-label')), 'Life counter');
const pu = await leftovers(p); console.log('  compteur de vie (préparation), encore en français :', pu.length ? pu : 'rien');
await p.evaluate(() => { partieClear(); puClose(); }); await p.waitForFunction(() => !document.querySelector('.pu'));
ok('?lang=en : langue gardée, accueil en anglais');
// dictionnaire : bloc JSON inerte de la page (jamais compilé comme du code), analysé seulement pour l'anglais
assert.equal(await p.evaluate(() => [typeof I18N_ALL, document.getElementById('i18n-en').type, T('Nouvelle version disponible'), T('Recharger')].join('|')), 'undefined|application/json|New version available|Reload');
ok('dictionnaire anglais lu depuis son bloc JSON (toast de mise à jour traduit)');

await toInput(p); await p.fill('#deckText', '1 Sol Ring\n2 Craterhoof Behemoth'); await p.waitForTimeout(250); await p.click('#btnRun');
await p.waitForFunction(() => S.run && S.run.status === 'done', null, { timeout: 20000 }); await p.waitForTimeout(900);
assert.match(await txt(p, '#heroAmt'), /€19\.50/, 'prix au format anglais'); assert.match(await txt(p, '#heroLabel'), /Cardmarket/); assert.doesNotMatch(await txt(p, '#heroLabel'), /partir/);
assert.match(await txt(p, '#btnCartTxt'), /Cardmarket/); assert.doesNotMatch(await txt(p, '#btnCartTxt'), /Copier/);
const res = await leftovers(p); console.log('  résultats, encore en français :', res.length ? res : 'rien');
ok('recherche au prix Cardmarket : libellés et montants en anglais (€19.50)');

await openMe(p, 'conf'); assert.match(await txt(p, '.sheet-wrap.open:last-child .sheet-body .fan'), /unofficial Fan Content/); await p.keyboard.press('Escape'); await p.waitForTimeout(400);      // Confidentialité et mentions, puis retour
await p.waitForSelector('#setLang'); await p.waitForSelector('.sheet-wrap.open .sheet-head');      // classe « open » posée deux images après l'ouverture
assert.match(await txt(p, '.sheet-wrap.open .sheet-head'), /Account and settings/); assert.match(await txt(p, '.me-sheet'), /Preferences.*Language.*Theme/i);
const set = await leftovers(p); console.log('  réglages, encore en français :', set.length ? set : 'rien');
await Promise.all([p.waitForEvent('load'), p.selectOption('#setLang', 'fr')]); await p.waitForTimeout(700);
assert.equal(await p.evaluate(() => I18N.lang), 'fr'); await toHome(p); assert.equal(await txt(p, '#nav [data-nav="home"]'), 'Accueil');
assert.equal(await p.evaluate(() => I18N.dict), null, 'français : aucun dictionnaire analysé');
ok('Réglages › Langue : retour au français (rechargement), choix gardé');
assert.deepEqual(errs, []);
await browser.close(); world.stop();
console.log('\nI18N E2E OK'); process.exit(0);
