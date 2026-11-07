// E2E : lecture publique des prix CardTrader (token du serveur pour tous, CT_PUBLIC) et « Envoyer sur CardTrader » (liste de souhaits).
// Serveur réservé à un compte (ALLOWED_UIDS) ; visiteur sans compte ni token : prix et offres lus sans token, panier et liste de souhaits demandent SON token.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, dvAct } from './e2e-world.mjs';

const world = await startWorld({ port: 19850, env: { ALLOWED_UIDS: 'uid-owner' } });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const UT = 'utilisateur-token-abcdef123456';
try {
  const { p, errs } = await newPage(browser, world);
  await p.waitForFunction(() => CTX.proxy === true);

  /* ── 1) Lecture publique annoncée par /__ping : prix CardTrader sans token, panier réservé ── */
  assert.deepEqual(await p.evaluate(() => [CTX.ctPub, ctReady(), ctOwn(), priceSrc()]), [true, true, false, 'cm'], 'sans token : CardTrader lisible, Cardmarket par défaut');
  await p.evaluate(() => { S.src = 'ct'; });
  assert.equal(await p.evaluate(() => priceSrc()), 'ct', 'CardTrader choisi : offres lues par le serveur');
  const r = await p.evaluate(() => ct('marketplace/products', { params: { blueprint_id: 1 } }).then(() => 'ok', e => e.code || e.message));
  assert.equal(r, 'ok', 'offres relayées sans token ni compte');
  const cart = await p.evaluate(() => ct('cart').then(() => 'ok', e => e.code));
  assert.equal(cart, 'auth', 'panier : refusé sans token');
  await p.evaluate(() => setPrixSheet()); await p.waitForSelector('#connMsg');
  assert.match(await txt(p, '#connMsg'), /Prix et offres CardTrader disponibles sans token/);
  assert.equal(await p.$eval('#btnTest', b => b.hidden), true, 'pas de test du compte du serveur');
  ok('lecture publique : offres sans token, Cardmarket par défaut, panier refusé, réglages explicites');

  /* ── 2) « Envoyer sur CardTrader » : token demandé, puis liste de souhaits privée avec les cartes à acheter ── */
  await p.evaluate(() => { for (const s of [...document.querySelectorAll('.sheet-wrap')]) s.remove(); });
  await p.evaluate(() => putDeck('dk-ctw', deckDoc({ name: 'Edgar envoyé', text: 'Commander\n1 Edgar Markov\n\nDeck\n2 Sol Ring\n1 Arcane Signet\n30 Plains', opts: { ...S.opts } })));
  await p.evaluate(() => { COLL.map = collFromText('1 Arcane Signet'); collChanged(); });
  await p.evaluate(() => openDeckViewer({ id: 'dk-ctw' })); await p.waitForSelector('.dv.on .dv-acts');
  await dvAct(p, '.dv-ctw'); await p.waitForSelector('.ct-get-sheet');
  assert.match(await txt(p, '.ct-get-sheet .ct-get-t'), /Envoyer un deck sur CardTrader demande ton token/);
  await p.fill('#ctgsTok', UT); await p.click('.ct-get-sheet [data-ctg="test"]');
  await p.waitForSelector('#ctwGo', { timeout: 10000 });
  assert.match(await txt(p, '#ctwHint'), /3 cartes seront ajoutées/, 'à acheter : Edgar + 2 Sol Ring (Arcane Signet possédée, Plains exclues)');
  await p.click('#ctwSeg .seg-opt[data-v="all"]'); assert.match(await txt(p, '#ctwHint'), /4 cartes seront ajoutées/);
  await p.click('#ctwSeg .seg-opt[data-v="miss"]');
  await p.fill('#ctwName', 'Edgar à acheter'); await p.click('#ctwGo');
  await p.waitForFunction(() => /créée/.test((document.querySelector('.ctw-m') || {}).textContent || ''));
  assert.equal(world.wished.length, 1); const w = world.wished[0];
  assert.equal(w.auth, 'Bearer ' + UT, 'avec le token de l\'utilisateur');
  assert.deepEqual({ ...w.deck, deck_items_from_text_deck: undefined }, { game_id: 1, name: 'Edgar à acheter', public: false, deck_items_from_text_deck: undefined });
  assert.deepEqual(w.deck.deck_items_from_text_deck.split('\n').sort(), ['1 Edgar Markov', '2 Sol Ring']);
  assert.match(await p.$eval('.sheet-wrap.open:last-child a.btn', a => a.href), /cardtrader\.com\/fr-FR\/wishlists\/4242\?share_code=/);
  ok('envoyer sur CardTrader : token demandé, cartes à acheter ou tout le deck, liste privée créée avec le token de l\'utilisateur');
  assert.deepEqual(errs, []);
} finally { await browser.close(); world.stop(); }
console.log('\nCTPUB OK'); process.exit(0);
