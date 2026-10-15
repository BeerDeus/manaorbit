// E2E « Passer de ManaBox » (src/switch.js) et images à partager (src/simg.js) :
// · le guide s'ouvre depuis Collection › Importer, la collection vide, l'aide et le premier lancement ; « Choisir mon fichier » ouvre le sélecteur de l'import :
//   un vrai export ManaBox (tests/fixtures/import/manabox.csv) est lu et importé (quantités, éditions, langues) ;
// · la page publique /passer-de-manabox (servie par proxy.mjs, sans défilement de côté à 390 px) et son « Importer ma collection » (?import) ;
// · simgShare : un PNG 1080 × 1350 pour chaque sorte (coll, deck, trade avec QR, opening : le contrat de la session d'ouverture), image injoignable →
//   dos de carte, sans erreur ; entrées : Stats (« Partager en image »), feuille « Partager le deck » (sans compte : l'image seule), Échange (« Image avec QR ») ;
// · partage : navigateur → navigator.share({ files }) ; sans partage de fichiers → téléchargement ; APK 1.0.4 → ManaOrbit.shareImage / saveImage
//   (PNG en base64) ; APK plus ancienne → le lien (liste d'échange) ou l'image en grand (« appui long »).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium, startWorld, newPage, ok, txt, toHome, signInFake, openMe, closeSheets } from './e2e-world.mjs';
const SHOTS = process.env.PARTAGE_SHOTS || 'shots'; mkdirSync(SHOTS, { recursive: true });

const world = await startWorld({ port: 19250 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const errsAll = [];
const MANABOX = new URL('./fixtures/import/manabox.csv', import.meta.url).pathname;
const seed = t => `try { localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: ${JSON.stringify(t)}, u: 1, s: '', b: null })); } catch (e) {}`;
// navigateur avec partage de fichiers : navigator.share noté (fichiers : nom, type, taille ; texte), canShare({ files }) vrai
const webShare = `window.__ws = []; Object.defineProperty(navigator, 'canShare', { configurable: true, value: d => !!(d && d.files && d.files.length) });
  Object.defineProperty(navigator, 'share', { configurable: true, value: async d => { window.__ws.push({ title: d.title, text: d.text, url: d.url, files: (d.files || []).map(f => ({ name: f.name, type: f.type, size: f.size })) }); } });`;
// coque Android simulée (APK 1.0.4) : shareImage / saveImage notent leurs arguments ; window.__mo.old : APK plus ancienne (sans ces méthodes)
const shell = `window.__mo = { share: [], img: [], save: [] };
  try { Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); } catch (e) {}
  const mo = { share: async o => { window.__mo.share.push(JSON.parse(JSON.stringify(o))); return { ok: true }; }, info: async () => ({ firebase: true, version: '1.0.4', build: 5 }), setWidget: async () => ({}), addListener: () => ({ remove: async () => {} }) };
  if (!localStorage.getItem('__old')) { mo.shareImage = async o => { window.__mo.img.push({ len: o.data.length, head: o.data.slice(0, 12), name: o.name, text: o.text, title: o.title, chooser: o.chooser }); return { ok: true }; };
    mo.saveImage = async o => { window.__mo.save.push({ len: o.data.length, name: o.name }); return { ok: true, uri: 'content://media/1' }; }; }
  window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => n === 'ManaOrbit', Plugins: { ManaOrbit: mo } };`;
const sheetOpen = (p, cls) => p.waitForSelector(`.sheet-wrap.open.${cls}`);
const imgReady = p => p.waitForSelector('.sheet-wrap.open.simg-sheet .simg-prev[data-st="ok"]', { timeout: 15000 });
/** PNG produit par simgRender : dimensions décodées, signature. */
const render = (p, spec) => p.evaluate(async s => { const b = await simgRender(s), bm = await createImageBitmap(b), h = new Uint8Array(await b.slice(0, 8).arrayBuffer()); return { w: bm.width, h: bm.height, type: b.type, size: b.size, sig: [...h].join(',') }; }, spec);
const PNG_SIG = '137,80,78,71,13,10,26,10';

/* ── 1) Guide depuis Collection › Importer, puis le vrai export ManaBox ─────────────────────────────────────────────── */
{
  const { p, errs } = await newPage(browser, world); errsAll.push(errs);
  await toHome(p); await p.click('#btnColl'); await p.waitForSelector('.coll.on');
  assert.ok(await p.$('.coll.on .coll-swg'), 'collection vide : « Tu viens de ManaBox ? »');
  await p.click('.coll.on .coll-tools [data-act="import"]'); await p.waitForSelector('.sheet-wrap.open #ciFile');
  assert.match(await txt(p, '.sheet-wrap.open .ci-swg'), /Tu viens de ManaBox ou d'une autre appli \? Le guide en 2 minutes/);
  await p.click('.sheet-wrap.open [data-swg="open"]'); await sheetOpen(p, 'swg-sheet');
  assert.equal(await txt(p, '.swg-sheet .sheet-head h2'), 'Passer de ManaBox en 2 minutes');
  assert.equal(await p.$$eval('.swg-sheet .swg-step', l => l.length), 3, 'trois étapes');
  assert.match(await txt(p, '.swg-sheet .swg-step:first-child'), /Onglet Collection : menu en haut à droite › Export/);
  assert.deepEqual(await p.$$eval('.swg-sheet .swg-keep li', l => l.map(x => x.className)), ['ok', 'ok', 'ok', 'no', 'no'], 'gardé : quantités, éditions, langues ; pas : foil et état, classeurs');
  assert.deepEqual(await p.$$eval('.swg-sheet .swg-q summary', l => l.map(x => x.textContent.trim())), ['Moxfield', 'Archidekt', 'Deckbox', 'Dragon Shield', 'Delver Lens', 'Une autre appli', 'Moxfield, Archidekt, ManaBox…']);
  assert.equal(await p.getAttribute('.swg-sheet .swg-web a', 'href'), 'passer-de-manabox', 'lien vers la page web du guide');
  await p.click('.swg-sheet .swg-q:nth-child(5) summary'); await p.waitForTimeout(250);
  await p.waitForTimeout(400); await p.screenshot({ path: SHOTS + '/partage-1-guide.png' });
  assert.equal(await txt(p, '.swg-sheet [data-swg="go"]'), 'Choisir mon fichier', 'depuis l\'import : le sélecteur de fichier directement');
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('.swg-sheet [data-swg="go"]')]);
  await fc.setFiles(MANABOX);
  await p.waitForFunction(() => /6 cartes différentes/.test((document.querySelector('#ciSum') || {}).textContent || ''));
  assert.match(await txt(p, '#ciSum'), /6 cartes différentes · 14 exemplaires\s*Fichier CSV/);
  assert.equal(await p.evaluate(() => sheets.length), 1, 'le guide s\'est refermé, l\'import reste');
  await p.click('#ciGo'); await p.waitForFunction(() => collCount() === 6);
  const coll = await p.evaluate(() => Object.fromEntries(Object.entries(COLL.map).map(([k, x]) => [x.n, collLines(x).map(([g, q]) => g + ':' + q).join(' ')])));
  assert.equal(coll['Sol Ring'], 'fr|c21|263#cex:1 en|cmm|410:2 en|cmm|410*:1', 'la foil sur sa propre ligne, état « excellent » gardé (Near Mint ignoré)'); assert.equal(coll['Swords to Plowshares'], 'zh-CN|sta|10*:1'); assert.equal(coll['Ragavan, Nimble Pilferer'], '|mh2|138:1');
  ok('Importer › « Tu viens de ManaBox ? » → guide (3 étapes, ce qui suit, autres applis) → « Choisir mon fichier » → export ManaBox lu et importé (éditions, langues)');
  await p.context().close();
}

/* ── 2) Autres entrées du guide : aide, premier lancement ; page publique ; ?import ─────────────────────────────────── */
{
  const { p, errs } = await newPage(browser, world); errsAll.push(errs);
  await openMe(p, 'aide'); await p.click('.sheet-wrap.open [data-help="open"]'); await p.waitForSelector('.sheet-wrap.open.hp-sheet');
  await p.click('.hp-sheet .hp-q:nth-child(3) summary'); assert.match(await txt(p, '.hp-sheet .hp-q:nth-child(3)'), /Je viens de ManaBox/);
  await p.click('.hp-sheet [data-help="switch"]'); await sheetOpen(p, 'swg-sheet');
  assert.equal(await txt(p, '.swg-sheet [data-swg="go"]'), 'Importer mon fichier');
  await p.click('.swg-sheet [data-swg="go"]'); await p.waitForSelector('.sheet-wrap.open #ciFile');
  ok('Aide › « Je viens de ManaBox » → guide → « Importer mon fichier » ouvre l\'import');
  await closeSheets(p);
  // premier lancement (appareil vierge) : 2e écran, « Tu viens de ManaBox ? »
  await p.evaluate(() => localStorage.removeItem('deckdeal:onboard')); await p.goto(world.url + '?onboarding'); await p.waitForSelector('.ob.on');
  await p.click('.ob [data-ob="next"]'); await p.waitForTimeout(400);
  await p.screenshot({ path: SHOTS + '/partage-2-premier-lancement.png' });
  await p.click('.ob [data-ob="swg"]'); await sheetOpen(p, 'swg-sheet'); assert.equal(await p.evaluate(() => !!document.querySelector('.ob.on')), false, 'premier lancement refermé');
  ok('Premier lancement › « Tu viens de ManaBox ? Voir comment l\'exporter » → guide');
  // page publique
  const r = await fetch(world.url + 'passer-de-manabox'), html = await r.text();
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /text\/html/);
  for (const re of [/<meta name="description" content="Exporte ta collection ManaBox/, /<link rel="canonical" href="https:\/\/manaorbit.app\/passer-de-manabox">/, /href="\.\/\?import"/, /"@type":"HowTo"/, /Fan Content Policy/]) assert.match(html, re);
  assert.equal((await fetch(world.url + 'passer-de-manabox.html')).status, 200);
  await p.goto(world.url + 'passer-de-manabox'); await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'aucun défilement de côté à 390 px');
  await p.screenshot({ path: SHOTS + '/partage-3-page.png', fullPage: true });
  await Promise.all([p.waitForURL(u => !/passer-de-manabox/.test(u)), p.click('.hero .btn.main')]);
  await p.waitForSelector('.sheet-wrap.open #ciFile', { timeout: 10000 }); assert.ok(await p.$('.coll.on'), '?import : collection + import ouverts');
  ok('/passer-de-manabox : servie (description, canonique, HowTo), 390 px sans défilement de côté ; « Importer ma collection » → ?import → collection et import');
  await p.context().close();
}

/* ── 3) simgShare : un PNG 1080 × 1350 par sorte ; image injoignable → dos de carte ──────────────────────────────────── */
const S = 'https://cards.scryfall.io/normal/front/a/b/';
const OPENING = { kind: 'opening', name: 'Boîte de Bloomburrow', date: Date.parse('2026-10-12T20:00:00Z'), n: 420, value: 187.4, paid: 150,
  best: [{ name: 'Craterhoof Behemoth', img: S + 'craterhoof-behemoth.jpg', eur: 42.5 }, { name: 'Edgar Markov', img: S + 'edgar-markov.jpg', eur: 18.2 }, { name: 'Wrath of God', img: S + 'wrath-of-god.jpg', eur: 12 }, { name: 'Llanowar Elves', img: S + 'llanowar-elves.jpg', eur: 3.4 }, { name: 'Introuvable', img: S + 'broken.jpg', eur: 2.2 }] };
{
  const { p, errs } = await newPage(browser, world, { goto: false, init: webShare }); errsAll.push(errs);
  await p.route('https://cards.scryfall.io/**/broken.jpg', r => r.fulfill({ status: 404, body: 'nf' }));
  await p.goto(world.url); await p.waitForTimeout(600);
  const specs = {
    coll: { kind: 'coll', value: 1234.56, n: 812, copies: 1530, date: Date.now(), top: [{ name: 'Sol Ring', img: S + 'sol-ring.jpg', eur: 1.5 }] },
    deck: { kind: 'deck', name: 'Edgar', sub: 'Edgar Markov', colors: 'WBR', img: S + 'edgar-markov.jpg', value: 245.3, n: 100 },
    trade: { kind: 'trade', by: 'Martin', n: 12, copies: 20, value: 45.6, want: 3, url: world.url + '?p=Abc123', top: [] },
    opening: OPENING,
    opening0: { kind: 'opening', name: 'Sans prix payé', date: Date.now(), n: 15, value: 3, paid: null, best: [] },
  };
  for (const [k, s] of Object.entries(specs)) { const r = await render(p, s); assert.deepEqual([r.w, r.h, r.type, r.sig], [1080, 1350, 'image/png', PNG_SIG], k); assert.ok(r.size > 20000, k + ' : image pleine'); }
  assert.equal(await p.evaluate(() => simgShare({ kind: 'inconnue' })), null, 'sorte inconnue : null, rien d\'ouvert'); assert.equal(await p.evaluate(() => sheets.length), 0);
  // contrat de la session d'ouverture : simgShare ouvre l'aperçu et rend { blob, w, h }
  const got = await p.evaluate(async s => { const r = await simgShare(s); return r && { w: r.w, h: r.h, type: r.blob.type }; }, OPENING);
  assert.deepEqual(got, { w: 1080, h: 1350, type: 'image/png' }, 'simgShare({ kind: \'opening\', … }) → { blob, w, h }');
  await imgReady(p); assert.equal(await txt(p, '.simg-sheet .sheet-head p'), 'Session d\'ouverture');
  await p.waitForTimeout(400); await p.screenshot({ path: SHOTS + '/partage-4-apercu.png' });
  await p.click('.simg-sheet [data-simg="share"]'); await p.waitForFunction(() => window.__ws.length === 1);
  const sh = await p.evaluate(() => window.__ws[0]);
  assert.equal(sh.files.length, 1); assert.equal(sh.files[0].type, 'image/png'); assert.match(sh.files[0].name, /^mana-orbit-opening-\d{4}-\d{2}-\d{2}\.png$/); assert.ok(sh.files[0].size > 20000);
  assert.equal(sh.text, 'Boîte de Bloomburrow · session d\'ouverture Magic · manaorbit.app');
  ok('simgRender : PNG 1080 × 1350 pour coll, deck, trade (QR), opening (avec et sans prix payé, image 404 → dos de carte) ; simgShare (contrat opening) → aperçu → navigator.share({ files })');
  await p.context().close();
}

/* ── 4) Entrées : Stats, feuille « Partager le deck » (sans compte), Échange (« Image avec QR ») ─────────────────────── */
{
  const { p, errs } = await newPage(browser, world, { goto: false, init: seed('3 Sol Ring\n2 Craterhoof Behemoth\n1 Edgar Markov\n4 Llanowar Elves') + webShare }); errsAll.push(errs);
  await p.goto(world.url); await p.waitForTimeout(600);
  await toHome(p); await p.click('#btnColl'); await p.waitForSelector('.coll.on'); await p.click('#collSeg [data-v="stats"]'); await p.waitForSelector('.cs-tiles');
  await p.waitForFunction(() => /€/.test(document.querySelector('.cs-val b').textContent), null, { timeout: 15000 });
  assert.equal(await p.$$eval('.cs-tiles > div', d => d.length), 3, 'les tuiles des stats ne changent pas');
  await p.click('.simg-coll [data-act="simgcoll"]'); await imgReady(p);
  assert.equal(await txt(p, '.simg-sheet .sheet-head p'), 'Ma collection');
  await p.click('.simg-sheet [data-simg="share"]'); await p.waitForFunction(() => window.__ws.length === 1);
  assert.match((await p.evaluate(() => window.__ws[0])).files[0].name, /^mana-orbit-coll-/);
  ok('Stats › « Partager en image » → image de la collection → navigator.share');
  await closeSheets(p); await p.evaluate(() => closeCollection()); await p.waitForTimeout(300);
  // deck, sans compte : la feuille propose l'image seule et la connexion
  await p.evaluate(() => openDeckViewer({ text: 'Commander\n1 Edgar Markov\n\nDeck\n1 Sol Ring\n1 Arcane Signet\n1 Command Tower\n8 Plains', name: 'Edgar' })); await p.waitForSelector('.dv.on [data-act="share"]');
  await p.click('.dv.on [data-act="share"]'); await p.waitForSelector('.sheet-wrap.open [data-act="dimg"]');
  assert.match(await txt(p, '.sheet-wrap.open .sheet-body .hint'), /Connecte-toi pour partager un lien en lecture seule/); assert.ok(await p.$('.sheet-wrap.open [data-act="dlogin"]'));
  await p.waitForTimeout(400); await p.screenshot({ path: SHOTS + '/partage-5-deck-sans-compte.png' });
  await p.click('.sheet-wrap.open [data-act="dimg"]'); await imgReady(p); assert.equal(await txt(p, '.simg-sheet .sheet-head p'), 'Mon deck');
  ok('Deck sans compte : « Partager le deck » → image seule (et « Se connecter ») → aperçu du deck');
  await closeSheets(p); await p.evaluate(() => closeDeckViewer()); await p.waitForTimeout(300);
  // échange : lien actif → « Image avec QR »
  await p.route('https://www.gstatic.com/**', r => r.abort()); await signInFake(p);
  await p.click('#nav [data-nav="trade"]'); await p.waitForSelector('.tr-box [data-act="tron"]'); await p.click('[data-act="tron"]'); await p.waitForSelector('.tr-box.on', { timeout: 15000 });
  assert.match(await txt(p, '.tr-box.on .tr-qrs'), /QR code\s*Image avec QR/);
  await p.waitForTimeout(400); await p.screenshot({ path: SHOTS + '/partage-6-echange.png' });
  await p.click('.tr-box.on [data-act="trimg"]'); await imgReady(p);
  await p.click('.simg-sheet [data-simg="share"]'); await p.waitForFunction(() => window.__ws.length === 2);
  const tr = await p.evaluate(() => window.__ws[1]), id = await p.evaluate(() => TR.share);
  assert.equal(tr.text, 'Ma liste d\'échange Magic ' + world.url + '?p=' + id, 'le lien suit l\'image'); assert.match(tr.files[0].name, /^mana-orbit-trade-/);
  ok('Échange › lien actif › « Image avec QR » → image avec le QR code du lien → navigator.share (fichier + lien)');
  // navigateur sans partage de fichiers : « Partager » télécharge l'image ; « Enregistrer » aussi
  await p.evaluate(() => { Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }); });
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.simg-sheet [data-simg="share"]')]);
  assert.match(dl.suggestedFilename(), /^mana-orbit-trade-\d{4}-\d{2}-\d{2}\.png$/);
  const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('.simg-sheet [data-simg="save"]')]);
  assert.match(dl2.suggestedFilename(), /\.png$/); await p.waitForFunction(() => /Image téléchargée/.test(document.querySelector('#toast').textContent));
  ok('Sans partage de fichiers : « Partager » et « Enregistrer » téléchargent le PNG');
  await p.context().close();
}

/* ── 5) APK : 1.0.4 (shareImage, saveImage) puis plus ancienne (lien, sinon mise à jour demandée) ──────────────────────────── */
{
  const { p, errs } = await newPage(browser, world, { goto: false, init: seed('3 Sol Ring\n2 Craterhoof Behemoth') + shell, ctx: { colorScheme: 'dark' } }); errsAll.push(errs);
  await p.route('https://www.gstatic.com/**', r => r.abort());
  await p.goto(world.url); await p.waitForTimeout(600);
  await p.evaluate(s => simgShare(s), OPENING); await imgReady(p);
  await p.waitForTimeout(400); await p.screenshot({ path: SHOTS + '/partage-7-apercu-sombre.png' });
  await p.click('.simg-sheet [data-simg="share"]'); await p.waitForFunction(() => window.__mo.img.length === 1);
  const a = await p.evaluate(() => window.__mo.img[0]);
  assert.equal(a.head, 'iVBORw0KGgoA', 'PNG en base64, sans préfixe data:'); assert.ok(a.len > 25000); assert.match(a.name, /^mana-orbit-opening-.*\.png$/);
  assert.deepEqual([a.title, a.chooser], ['Session d\'ouverture', 'Partager']);
  await p.click('.simg-sheet [data-simg="save"]'); await p.waitForFunction(() => window.__mo.save.length === 1);
  await p.waitForFunction(() => /Image enregistrée dans tes photos/.test(document.querySelector('#toast').textContent));
  ok('APK 1.0.4 : « Partager » → ManaOrbit.shareImage({ data: PNG base64, name, text, title, chooser }) ; « Enregistrer » → saveImage, toast');
  await closeSheets(p);
  // APK plus ancienne : sans shareImage ni saveImage
  await p.evaluate(() => localStorage.setItem('__old', '1')); await p.reload(); await p.waitForTimeout(600);
  assert.equal(await p.evaluate(() => typeof Capacitor.Plugins.ManaOrbit.shareImage), 'undefined');
  await p.evaluate(s => simgShare(s), OPENING); await imgReady(p);
  assert.equal(await txt(p, '.simg-sheet .simg-note'), 'Mets à jour l\'appli (Play Store) pour envoyer l\'image directement', 'prévenu dès l\'aperçu');
  await p.click('.simg-sheet [data-simg="share"]'); await p.waitForFunction(() => /Mets à jour l'appli/.test(document.querySelector('#toast').textContent));
  assert.equal(await p.$('.simg-full-sheet'), null, 'plus d\'image en grand « appui long » (la WebView ne l\'enregistre pas)');
  await p.click('.simg-sheet [data-simg="save"]'); await p.waitForFunction(() => /Mets à jour l'appli/.test(document.querySelector('#toast').textContent));
  assert.deepEqual(await p.evaluate(() => [window.__mo.img.length, window.__mo.save.length]), [0, 0], 'aucun appel natif (méthodes absentes)');
  ok('APK plus ancienne, sans lien : « mets à jour l\'appli » (Partager et Enregistrer), plus d\'image en grand');
  await closeSheets(p);
  await signInFake(p);
  await toHome(p); await p.click('#btnColl'); await p.waitForSelector('.coll.on'); await p.click('#nav [data-nav="trade"]'); await p.waitForSelector('.tr-box [data-act="tron"]');
  await p.click('[data-act="tron"]'); await p.waitForSelector('.tr-box.on', { timeout: 15000 });
  await p.click('.tr-box.on [data-act="trimg"]'); await imgReady(p);
  await p.click('.simg-sheet [data-simg="share"]'); await p.waitForFunction(() => window.__mo.share.length === 1);
  assert.equal((await p.evaluate(() => window.__mo.share[0])).url, world.url + '?p=' + (await p.evaluate(() => TR.share)), 'le lien, par le partage habituel');
  ok('APK plus ancienne, liste d\'échange : le lien part par ManaOrbit.share');
  await p.context().close();
}

errsAll.forEach((e, i) => assert.deepEqual(e, [], 'erreurs page ' + i + ' : ' + e.join(' | ')));
await browser.close(); world.stop();
console.log('PARTAGE E2E OK');
process.exit(0);
