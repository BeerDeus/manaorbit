// E2E « Session d'ouverture » et « Mode streamer » (opening.js, opnbilan.js) : session commencée depuis les réglages du scan (nom, prix payé),
// cartes du scan (récap), de « Ajouter des cartes » (lot.js) et de « Saisir » dans la session et jamais dans la collection ; note de la collection,
// pastille de l'accueil ; rechargement en pleine session ; mode streamer : accueil, collection, stats, échange, compte (ni e-mail ni lien d'échange),
// QR code refusé, notification et toast « autre appareil » muets ; bilan (gain / perte, meilleures cartes, partage simgShare s'il existe, carte écartée),
// ajout à la collection, « Mes ouvertures » (détail, export texte, suppression) ; la vraie collection n'est JAMAIS réduite, ni sur l'appareil, ni dans
// le compte (faux cloud), ni dans le widget Android (faux plugin ManaOrbit), et la synchro continue ; pub (faux AdMob) retirée pendant le mode streamer.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, ok, txt, toHome, signInFake, rcGo } from './e2e-world.mjs';

const world = await startWorld({ port: 19160 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const REAL = '2 Sol Ring *FR*\\n1 Craterhoof Behemoth\\n3 Arcane Signet';
const seed = `try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: '${REAL}', u: 1, s: '', b: null })); } } catch (e) {}`;
const errsAll = [];
const closeAll = p => p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); }).then(() => p.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 5000 }));
const realColl = p => p.evaluate(() => Object.fromEntries(Object.entries(COLL.map).map(([k, x]) => [k, x.q])));
const rows = p => p.evaluate(() => (OPN.cur ? OPN.cur.rows.map(r => [r.k, r.g, r.q]) : null));
const add = (p, name, l = 'en') => p.evaluate(([name, l]) => scanAdd({ key: ownKey(name), name, score: 0.99, raw: name, card: l }, 1, false), [name, l]);
/** Faux plugin des notifications (appli Android) : pnListen s'y abonne ; window.__pn.pushNotificationReceived(n) simule une notification reçue appli ouverte. */
const pnFake = p => p.evaluate(() => { const L = {}; PN.on = false; pnListen({ addListener: (ev, f) => { L[ev] = f; return { remove: async () => {} }; } }); window.__pn = L; });
const toastTxt = p => p.evaluate(() => { const t = document.querySelector('#toast'); return t.classList.contains('on') ? t.textContent : ''; });

/* ── 1) session sans mode streamer : entrée du scan, cartes du scan, du lot et de « Saisir » dans la session, jamais dans la collection ───── */
{
  const { ctx, p, errs } = await newPage(browser, world, { init: seed }); errsAll.push(errs);
  await p.waitForTimeout(400); await toHome(p);
  await p.evaluate(() => scsSet({ ed: 'none' }));      // scan sans édition : la carte et sa langue suffisent ici
  const before = await realColl(p);
  assert.deepEqual(before, { 'sol ring': 2, 'craterhoof behemoth': 1, 'arcane signet': 3 });
  await p.evaluate(() => openScan()); await p.waitForSelector('.scan.on');
  assert.equal(!!(await p.$('.opn-bandw')), false, 'pas de session : pas de bandeau');
  await p.click('.scan .sc-set'); await p.waitForSelector('.scs-sheet.open .opn-scs');
  assert.match(await txt(p, '.opn-scs'), /Session d'ouverture/);
  await p.click('.opn-scs'); await p.waitForSelector('.opn-sheet.open #opnName');
  assert.match(await p.$eval('#opnName', i => i.value), /^Ouverture du \d\d\/\d\d$/, 'nom par défaut : « Ouverture du 13/10 »');
  assert.equal(!!(await p.$('.opn-sheet [data-opn="hist"]')), false, 'aucune ouverture terminée : pas encore de « Mes ouvertures »');
  await p.fill('#opnName', 'Display Bloomburrow'); await p.fill('#opnPaid', '120');
  await p.click('.opn-sheet [data-opn="go"]'); await p.waitForFunction(() => opnOn());
  assert.deepEqual(await p.evaluate(() => [OPN.cur.name, OPN.cur.paid, OPN.cur.st, streamOn(), document.documentElement.classList.contains('opn-on'), document.documentElement.classList.contains('streamer')]), ['Display Bloomburrow', 12000, false, false, true, false]);
  assert.ok(await p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:opn:cur')).name === 'Display Bloomburrow'), 'session gardée sur l\'appareil');
  await p.waitForSelector('.scan .opn-band'); assert.match(await txt(p, '.scan .opn-band'), /Display Bloomburrow\s*0 carte/);
  ok('session commencée depuis Réglages du scan (nom, prix payé) ; bandeau sur le scan');

  // scan → récap → « Ajouter » : dans la session
  await add(p, 'Sol Ring', 'fr'); await add(p, 'Edgar Markov'); await add(p, 'Craterhoof Behemoth');
  await p.click('.scan .dv-foot [data-act="done"]'); await p.waitForSelector('.rc-sheet .opn-rc');
  assert.match(await txt(p, '.rc-sheet .opn-rc'), /Session « Display Bloomburrow » : ces cartes vont dans la session/);
  await rcGo(p); await p.waitForFunction(() => !document.querySelector('.scan'));
  assert.deepEqual(await realColl(p), before, 'la collection ne bouge pas pendant la session');
  assert.deepEqual(await rows(p), [['craterhoof behemoth', 'en', 1], ['edgar markov', 'en', 1], ['sol ring', 'fr', 1]]);
  assert.match(await toastTxt(p), /3 cartes ajoutées à la session/);
  await p.click('#toast .toast-act'); await p.waitForFunction(() => OPN.cur.rows.length === 0); ok('« Annuler » du toast : la session revient comme avant');
  await p.evaluate(() => openScan()); await p.waitForSelector('.scan.on');
  await add(p, 'Sol Ring', 'fr'); await add(p, 'Edgar Markov'); await add(p, 'Craterhoof Behemoth');
  await p.click('.scan .dv-foot [data-act="done"]'); await p.waitForSelector('.rc-sheet [data-rc="go"]'); await rcGo(p); await p.waitForFunction(() => !document.querySelector('.scan'));
  assert.equal((await rows(p)).length, 3);
  ok('scan › Ajouter : 3 cartes dans la session (langue gardée), la collection inchangée, annulable');

  // « Ajouter des cartes » (lot.js) : dans la session, ni la collection ni le lot
  await toHome(p); await p.evaluate(() => openLot()); await p.waitForSelector('.lot.on #caName');
  await p.fill('#caName', 'wrath'); await p.waitForSelector('.ca-opt[data-n="Wrath of God"]'); await p.click('.ca-opt[data-n="Wrath of God"]'); await p.waitForSelector('.lot-card:not([hidden]) #lotAdd');
  await p.click('.lot-card [data-act="qp"]'); await p.click('#lotAdd');
  await p.waitForFunction(() => OPN.cur.rows.some(r => r.k === 'wrath of god'));
  assert.match(await txt(p, '#caStatus'), /Wrath of God · ajoutée à la session « Display Bloomburrow »/);
  assert.deepEqual(await p.evaluate(() => [collQty('wrath of god'), LOT.list.length, getComputedStyle(document.querySelector('.lot .lot-list')).display]), [0, 0, 'none'], 'ni dans la collection ni dans le lot (masqué pendant la session)');
  assert.equal((await rows(p)).find(r => r[0] === 'wrath of god')[2], 2, 'quantité choisie');
  await p.evaluate(() => closeLot()); await p.waitForTimeout(300);
  // « Saisir » (ajout d'une carte, collection.js) : dans la session aussi
  await p.evaluate(() => openCollAdd()); await p.waitForSelector('.sheet-wrap.open #caName');
  await p.fill('.sheet-wrap.open #caName', 'llanowar'); await p.waitForSelector('.sheet-wrap.open .ca-opt[data-n="Llanowar Elves"]'); await p.click('.sheet-wrap.open .ca-opt[data-n="Llanowar Elves"]');
  await p.waitForFunction(() => OPN.cur.rows.some(r => r.k === 'llanowar elves')); assert.equal(await p.evaluate(() => collQty('llanowar elves')), 0);
  await closeAll(p);
  // prix rapide › « + » : dans la session aussi (puis retirée de la session, « − »)
  await p.evaluate(() => { openScan(); scanPriceMode(true); SC.pq = [{ key: 'arcane signet', name: 'Arcane Signet', l: 'en', n: 1, cm: 40, ct: 'off' }]; scanPaintList(); });
  await p.click('.sc-item.pr[data-k="arcane signet"] [data-a="padd"]'); await p.waitForFunction(() => OPN.cur.rows.some(r => r.k === 'arcane signet'));
  assert.equal(await p.evaluate(() => [collQty('arcane signet'), OPN.cur.rows.find(r => r.k === 'arcane signet').eu].join()), '3,40', 'prix rapide : dans la session (prix lu gardé), la collection inchangée');
  await p.evaluate(() => { closeScan(); opnDec(OPN.cur.rows.find(r => r.k === 'arcane signet').id); }); await p.waitForFunction(() => !OPN.cur.rows.some(r => r.k === 'arcane signet'));
  await p.waitForTimeout(300);
  assert.deepEqual(await realColl(p), before);
  ok('« Ajouter des cartes », « Saisir », prix rapide › + : dans la session, jamais dans la collection ni dans le lot');

  // accueil et collection (sans mode streamer) : la vraie collection, et la session en note
  await toHome(p); await p.waitForSelector('#opnHm');
  assert.match(await txt(p, '#opnHm'), /Session · 6 cartes · /); assert.equal(await p.$eval('#collSub', e => getComputedStyle(e).display), 'none');
  assert.equal(await p.$eval('#hmTrade', e => getComputedStyle(e).display) !== 'none', true, 'échange visible hors mode streamer');
  await p.evaluate(() => openCollection('list')); await p.waitForSelector('.coll.on .opn-cnote');
  assert.match(await txt(p, '.opn-cnote'), /Session en cours : 6 cartes, ajoutées à la fin/);
  assert.deepEqual(await p.$$eval('.coll .coll-list .crow', r => [...new Set(r.map(x => x.dataset.k))].sort()), ['arcane signet', 'craterhoof behemoth', 'sol ring'], 'la vraie collection, seule');
  await p.click('.opn-cnote'); await p.waitForSelector('.opn-sheet.open .opn-list'); assert.equal(await p.$$eval('.opn-sheet .opn-row', r => r.length), 5);
  await closeAll(p); await p.evaluate(() => closeCollection()); await p.waitForTimeout(300);
  ok('accueil : pastille « Session · 6 cartes · … » ; collection : la vraie, avec la note de la session');

  // rechargement en pleine session : tout revient
  await p.reload(); await p.waitForTimeout(600); await toHome(p);
  assert.equal((await rows(p)).length, 5, 'session relue de l\'appareil'); await p.waitForSelector('#opnHm');
  ok('rechargement : session gardée (lignes, quantités), pastille de retour');

  // mode streamer, allumé pendant la session
  await p.click('#opnHm'); await p.waitForSelector('.opn-sheet.open #opnSt2');
  await p.click('.opn-sheet label[for="opnSt2"]'); await p.waitForFunction(() => streamOn() && document.documentElement.classList.contains('streamer'));
  await closeAll(p); await toHome(p);
  const sv = await p.evaluate(() => opnSv());
  assert.equal(sv.n, 6); assert.ok(sv.v > 0);
  await p.waitForFunction(v => document.querySelector('#hmCount').textContent === '6 cartes' && document.querySelector('#hmValue').textContent === hmEur(v), sv.v, { timeout: 5000 });      // orbe : valeur de la session
  assert.equal(await p.$eval('#hmTrade', e => getComputedStyle(e).display), 'none', 'mode streamer : ni lien ni QR code d\'échange sur l\'accueil');
  assert.equal(await p.$eval('#hmDelta', e => e.hidden), true);
  await p.waitForFunction(() => OPN.cur.rows.every(r => opnEu(r) > 0), null, { timeout: 8000 });
  await p.evaluate(() => openCollection('list')); await p.waitForSelector('.coll.on .opn-main');
  assert.deepEqual(await p.$$eval('.coll .coll-main .crow', r => r.map(x => x.querySelector('.row-name').textContent.replace('Anneau solaire', 'Sol Ring'))), ['Craterhoof Behemoth', 'Edgar Markov', 'Wrath of God', 'Sol Ring', 'Llanowar Elves'], 'la session seule, les plus chères d\'abord');
  assert.match(await txt(p, '.coll .dv-title span'), /^Session « Display Bloomburrow »$/); assert.match(await txt(p, '.coll .coll-val'), /5 cartes · 6 exemplaires/);
  assert.deepEqual(await p.evaluate(() => ['.coll-sync', '.coll-px', '.coll-fwrap', '[data-act="import"]', '[data-act="export"]', '.coll-dot'].map(s => { const e = document.querySelector('.coll ' + s); return !e || e.hidden || getComputedStyle(e).display === 'none'; })), [true, true, true, true, true, true], 'ni synchro, ni prix réels, ni filtres, ni import ni export');
  assert.ok(!(await txt(p, '.coll')).includes('Arcane Signet'), 'aucune carte de la vraie collection');
  // « − » dans la liste : un exemplaire de moins dans la session (pas dans la collection)
  await p.locator('.coll .opn-row', { hasText: 'Wrath of God' }).locator('[data-opn="dec"]').click(); await p.waitForFunction(() => OPN.cur.rows.find(r => r.k === 'wrath of god').q === 1);
  assert.deepEqual(await realColl(p), before);
  await p.click('.coll .cv[data-act="valtab"]'); await p.waitForSelector('.coll .opn-main .cs-tiles');
  assert.match(await txt(p, '.coll .opn-main .cs-tiles'), /5\s*cartes différentes\s*5\s*exemplaires/);
  await p.evaluate(() => closeCollection()); await p.waitForTimeout(300);
  await p.evaluate(() => openCollection('trade')); await p.waitForSelector('.coll.on .opn-hide');
  assert.match(await txt(p, '.coll .opn-hide'), /Échange masqué/); assert.equal(!!(await p.$('.coll .tr-link, .coll .tr-box')), false);
  await p.evaluate(() => closeCollection()); await p.waitForTimeout(300);
  await p.evaluate(() => trQrOpen()); await p.waitForTimeout(200);
  assert.equal(!!(await p.$('.sheet-wrap')), false, 'QR code d\'échange refusé'); assert.match(await toastTxt(p), /Masqué en mode streamer/);
  ok('mode streamer : orbe, collection, stats = la session seule ; échange, lien et QR code masqués ; « − » corrige la session');

  // notifications : rien à l'écran pendant le mode streamer (push reçue appli ouverte, autre appareil)
  await pnFake(p); await p.evaluate(() => document.querySelector('#toast').classList.remove('on'));
  await p.evaluate(() => window.__pn.pushNotificationReceived({ title: 'Alerte de prix', body: 'Sol Ring −40 %', data: { url: './?alerts=1' } }));
  await p.waitForTimeout(150); assert.equal(await toastTxt(p), '', 'mode streamer : aucune notification affichée');
  ok('mode streamer : alerte de prix reçue appli ouverte → aucun toast');

  // rechargement en mode streamer : la vraie collection ne s'affiche jamais, même au démarrage
  await p.reload(); await p.waitForFunction(() => document.documentElement.classList.contains('streamer'));
  await p.waitForTimeout(500); await toHome(p);
  await p.waitForFunction(() => document.querySelector('#hmCount').textContent === '5 cartes', null, { timeout: 5000 });      // orbe : la session dès le démarrage
  ok('rechargement en mode streamer : html.streamer posé avant l\'accueil, orbe = session');

  // bilan : prix payé → perte ou gain, meilleures cartes, partage (si simgShare existe), carte écartée, ajout à la collection
  await p.evaluate(() => opnSheet()); await p.waitForSelector('.opn-sheet.open [data-opn="end"]'); await p.click('.opn-sheet [data-opn="end"]');
  await p.waitForSelector('.opn-end.open .opnb .opnb-r');
  assert.equal(await p.$eval('#opnbPaid', i => i.value), '120');
  assert.match(await txt(p, '.opn-end .opnb-r'), /^PERTE\s*−\d/i, 'valeur < 120 € : perte');
  await p.fill('#opnbPaid', '5'); await p.waitForFunction(() => /GAIN|Gain/.test(document.querySelector('.opn-end .opnb-r').textContent));
  assert.equal(await p.evaluate(() => OPN.cur.paid), 500, 'prix payé modifiable dans le bilan, gardé avec la session');
  const best = await p.$$eval('.opn-end .opnb-c figcaption span', s => s.map(x => x.textContent.replace('Anneau solaire', 'Sol Ring')));
  assert.deepEqual(best, ['Craterhoof Behemoth', 'Edgar Markov', 'Wrath of God', 'Sol Ring', 'Llanowar Elves'], '5 meilleures cartes, la plus chère d\'abord');
  await p.evaluate(() => { window.simgShare = undefined; document.activeElement.blur(); opnSheets(); });      // simg.js absent (images à partager retirées) : pas de « Partager »
  await p.waitForFunction(() => !document.querySelector('.opn-end [data-opn="share"]'));
  assert.equal(!!(await p.$('.opn-end [data-opn="share"]')), false, 'sans simgShare : pas de « Partager »');
  await p.evaluate(() => { window.__share = []; window.simgShare = spec => window.__share.push(spec); document.activeElement.blur(); opnSheets(); });
  await p.waitForSelector('.opn-end [data-opn="share"]'); await p.click('.opn-end [data-opn="share"]');
  const spec = await p.evaluate(() => window.__share[0]);
  assert.equal(spec.kind, 'opening'); assert.equal(spec.name, 'Display Bloomburrow'); assert.equal(spec.n, 5); assert.equal(spec.paid, 5);
  assert.ok(Math.abs(spec.value * 100 - await p.evaluate(() => opnTotals(OPN.cur.rows).v)) < 1, 'valeur en euros'); assert.ok(spec.date > 0 && spec.best.length === 5);
  assert.deepEqual(Object.keys(spec.best[0]).sort(), ['eur', 'img', 'name']); assert.equal(spec.best[0].name, 'Craterhoof Behemoth'); assert.equal(spec.best[0].eur, 9);
  assert.match(spec.best[0].img, /^https:\/\/(cards\.scryfall\.io\/normal\/|api\.scryfall\.com\/cards\/named\?.*version=normal)/, 'image « normal »');
  await p.locator('.opn-end .opn-pick', { hasText: 'Llanowar Elves' }).click();
  assert.match(await txt(p, '.opn-end [data-opn="add"]'), /Ajouter 4 cartes/);
  await p.click('.opn-end [data-opn="add"]'); await p.waitForFunction(() => !opnOn());
  assert.deepEqual(await realColl(p), { 'sol ring': 3, 'craterhoof behemoth': 2, 'arcane signet': 3, 'edgar markov': 1, 'wrath of god': 1 }, 'cartes gardées ajoutées, Llanowar écartée');
  assert.deepEqual(await p.evaluate(() => COLL.map['sol ring'].x || COLL.map['sol ring'].l), 'fr', 'langue de chaque ligne gardée');
  assert.deepEqual(await p.evaluate(() => [document.documentElement.classList.contains('opn-on'), document.documentElement.classList.contains('streamer'), localStorage.getItem('deckdeal:opn:cur')]), [false, false, null]);
  assert.match(await toastTxt(p), /4 cartes ajoutées à ta collection/);
  ok('bilan : perte puis gain (prix payé modifié), 5 meilleures cartes, partage simgShare, carte écartée ; 4 cartes ajoutées, mode streamer fini');

  // après : notification de nouveau affichée, échange revenu
  await pnFake(p);
  await p.evaluate(() => window.__pn.pushNotificationReceived({ title: 'Alerte de prix', body: 'Sol Ring −40 %', data: { url: './?alerts=1' } }));
  await p.waitForFunction(() => /Alerte de prix/.test(document.querySelector('#toast').textContent));
  await toHome(p); assert.notEqual(await p.$eval('#hmTrade', e => getComputedStyle(e).display), 'none');
  // Mes ouvertures : la session, son détail, l'export texte, l'image à partager, la suppression (annulable)
  const h = await p.evaluate(() => opnHist());
  assert.equal(h.length, 1); assert.deepEqual([h[0].name, h[0].n, h[0].paid, h[0].st, h[0].rows.length], ['Display Bloomburrow', 4, 500, 1, 4]);
  await p.evaluate(() => opnHistSheet()); await p.waitForSelector('.opn-h'); assert.match(await txt(p, '.opn-h'), /Display Bloomburrow.*4 cartes.*\+/);
  await p.evaluate(() => { window.__copied = ''; copyText = t => { window.__copied = t; }; });
  await p.click('.opn-h'); await p.waitForSelector('.sheet-wrap.open [data-opn="copy"]');
  assert.equal(await p.$$eval('.sheet-wrap.open .opn-row', r => r.length), 4);
  await p.click('.sheet-wrap.open [data-opn="copy"]');
  const exp = await p.evaluate(() => window.__copied);
  assert.deepEqual(exp.split('\n').sort(), ['1 Craterhoof Behemoth *EN*', '1 Edgar Markov *EN*', '1 Sol Ring *FR*', '1 Wrath of God'], 'export texte réimportable');
  await p.evaluate(() => { window.__share = []; window.simgShare = spec => window.__share.push(spec); });
  await p.click('.sheet-wrap.open [data-opn="img"]');
  const hs = await p.evaluate(() => window.__share[0]);
  assert.deepEqual([hs.kind, hs.name, hs.n, hs.paid, hs.best.length], ['opening', 'Display Bloomburrow', 4, 5, 4], 'session passée : image à partager (prix du moment)');
  await p.click('.sheet-wrap.open [data-opn="del"]'); await p.waitForFunction(() => opnHist().length === 0);
  await p.click('#toast .toast-act'); await p.waitForFunction(() => opnHist().length === 1);
  await closeAll(p);
  // nouvelle session : « Mes ouvertures » proposé dans la feuille de départ
  await p.evaluate(() => opnStartSheet()); await p.waitForSelector('.opn-sheet.open [data-opn="hist"]'); assert.match(await txt(p, '.opn-sheet [data-opn="hist"]'), /Mes ouvertures\s*1/);
  await closeAll(p);
  ok('Mes ouvertures : la session (4 cartes, gain), détail, export texte, suppression annulable ; notifications et échange revenus');
  await ctx.close();
}

/* ── 2) la vraie collection n'est jamais réduite : compte (faux cloud) et widget Android (faux plugin), synchro qui continue ─────────── */
{
  const shell = `window.__mo = { calls: [] }; window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => n === 'ManaOrbit', Plugins: { ManaOrbit: {
    setWidget: async o => { window.__mo.calls.push(JSON.parse(o.data)); return {}; }, info: async () => ({ firebase: true, version: '1.0', build: 1 }), addListener: () => ({ remove: async () => {} }) } } };`;
  const hist = `try { const now = Date.now(); if (!localStorage.getItem('deckdeal:coll:hist')) { localStorage.setItem('deckdeal:coll:hist', JSON.stringify([{ t: now - 3600e3, v: 1100, n: 3, q: 6 }])); localStorage.setItem('deckdeal:coll:pxat', String(now - 3600e3)); } } catch (e) {}`;
  const { ctx, p, errs } = await newPage(browser, world, { init: seed + hist + shell }); errsAll.push(errs);
  await p.waitForTimeout(400); await toHome(p);
  await signInFake(p); await p.waitForFunction(() => COLL.cloud === 'ok' && COLL.base, null, { timeout: 8000 });
  await p.evaluate(() => { window.__writes = []; const tx = D.cloud.txColl; D.cloud.txColl = async (uid, fn) => { const out = await tx(uid, fn); if (out) window.__writes.push(out.text); return out; }; });
  await p.waitForFunction(() => window.__mo.calls.length >= 1, null, { timeout: 8000 });
  const real = await p.evaluate(() => [collCount(), Math.round(homeValue())]);
  await p.evaluate(() => { OPN.cur = { id: 'otest', name: 'Stream', at: Date.now(), paid: null, st: true, rows: [] }; opnSave(); opnRefresh();
    opnTake([{ k: 'edgar markov', n: 'Edgar Markov', q: 3, l: 'en' }, { k: 'wrath of god', n: 'Wrath of God', q: 1, l: 'fr' }]); window.__mark = { w: window.__writes.length, m: window.__mo.calls.length }; });
  await p.waitForFunction(() => document.documentElement.classList.contains('streamer'));
  // pendant le mode streamer : la collection change ailleurs (autre appareil) et ici (achat ajouté) → elle se synchronise, entière
  await p.evaluate(() => document.querySelector('#toast').classList.remove('on'));
  await p.evaluate(async () => { const d = { text: collToText({ ...COLL.map, 'command tower': { n: 'Command Tower', q: 1 } }, true), count: 4, updatedAt: Date.now() + 5000 }; await D.cloud.saveColl(D.uid, d); collFromCloud(D.uid, d, false, false); });      // autre appareil : le compte change, cet appareil l'écoute
  await p.waitForFunction(() => collQty('command tower') === 1);
  assert.equal(await toastTxt(p), '', 'mode streamer : pas de toast « autre appareil » (il montrerait la collection)');
  await p.evaluate(() => collBump('llanowar elves', 'Llanowar Elves', 2, { lang: 'en' }));
  await p.waitForFunction(() => window.__writes.length > window.__mark.w && /Llanowar Elves/.test(window.__writes[window.__writes.length - 1]), null, { timeout: 8000 });
  await p.evaluate(() => homeSoon(0));
  await p.waitForFunction(() => window.__mo.calls.length > window.__mark.m && window.__mo.calls[window.__mo.calls.length - 1].n === 5, null, { timeout: 8000 });
  const during = await p.evaluate(() => ({ writes: window.__writes.slice(window.__mark.w), widget: window.__mo.calls.slice(window.__mark.m), local: JSON.parse(localStorage.getItem('deckdeal:coll:v1')).t, n: collCount() }));
  for (const t of [...during.writes, during.local]) {
    for (const c of ['Sol Ring', 'Craterhoof Behemoth', 'Arcane Signet', 'Command Tower', 'Llanowar Elves']) assert.ok(t.includes(c), 'jamais réduite : ' + c + ' dans ' + JSON.stringify(t));
    for (const c of ['Edgar Markov', 'Wrath of God']) assert.ok(!t.includes(c), 'les cartes de la session n\'y sont pas avant la fin : ' + c);
  }
  const sess = await p.evaluate(() => opnTotals(OPN.cur.rows).v), realV = await p.evaluate(() => Math.round(homeValue()));
  assert.ok(during.widget.length >= 1 && during.widget.every(w => w.n >= real[0]), 'widget : toujours la vraie collection (' + JSON.stringify(during.widget.map(w => w.n)) + ')');
  assert.equal(during.widget[during.widget.length - 1].n, during.n); assert.equal(during.widget[during.widget.length - 1].v, realV, 'widget : la valeur de la vraie collection');
  assert.ok(sess > 0 && during.widget.every(w => w.v !== sess), 'widget : jamais la valeur de la session');
  await p.waitForFunction(() => document.querySelector('#hmCount').textContent === '4 cartes', null, { timeout: 8000 });      // à l'écran : la session seule (4 exemplaires)
  // compte et réglages : ni e-mail ni lien d'échange, la session à la place
  await p.click('#btnAccount'); await p.waitForSelector('.me-sheet.open [data-me="opn"]');
  const me = await txt(p, '.me-sheet');
  assert.ok(!me.includes('test@example.com'), 'pas d\'e-mail : ' + me); assert.equal(!!(await p.$('.me-sheet [data-me="trade"]')), false, 'pas de lien d\'échange');
  assert.match(me, /Mode streamer.*Session d'ouverture.*4 cartes/i); assert.match(await txt(p, '.me-sheet .me-stats'), /^4 cartes/);
  await p.evaluate(() => openAccount()); await p.waitForSelector('.sheet-wrap.open #acProfile');
  assert.ok(!(await txt(p, '.sheet-wrap.open:last-child')).includes('test@example.com'), 'feuille Compte : pas d\'e-mail');
  await closeAll(p);
  ok('mode streamer : la vraie collection continue de se synchroniser entière (autre appareil, achat), le widget garde ses chiffres ; écran, « Compte et réglages » et feuille Compte : la session, sans e-mail ni lien d\'échange');
  // fin : les cartes de la session partent dans le compte avec le reste
  await p.evaluate(() => opnFinish(OPN.cur, OPN.cur.rows.slice()));
  await p.waitForFunction(() => /Edgar Markov/.test(window.__writes[window.__writes.length - 1] || ''), null, { timeout: 8000 });
  const last = await p.evaluate(() => window.__writes[window.__writes.length - 1]);
  for (const c of ['Sol Ring', 'Craterhoof Behemoth', 'Arcane Signet', 'Command Tower', 'Llanowar Elves', 'Edgar Markov', 'Wrath of God']) assert.ok(last.includes(c), 'compte après la fin : ' + c);
  await p.click('#btnAccount'); await p.waitForSelector('.me-sheet.open [data-me="trade"]');
  assert.ok((await txt(p, '.me-sheet')).includes('test@example.com'), 'après la session : l\'e-mail revient'); await closeAll(p);
  ok('fin de la session : le compte reçoit la collection entière + les cartes ouvertes ; e-mail et lien d\'échange revenus');
  await ctx.close();
}

/* ── 3) parties retirées : sans opnbilan.js (récapitulatif simple), puis sans opening.js (crochets inertes, l'appli comme avant) ───────── */
{
  const { ctx, p, errs } = await newPage(browser, world, { init: seed }); errsAll.push(errs);
  await p.waitForTimeout(400); await toHome(p);
  await p.evaluate(() => { for (const f of ['opnbPaidHtml', 'opnbPaidRead', 'opnbHtml', 'opnbRes', 'opnbBind', 'opnbShare', 'opnbHistTag', 'opnbHistHtml']) window[f] = undefined; window.simgShare = () => {}; });
  await p.evaluate(() => opnStartSheet()); await p.waitForSelector('.opn-sheet.open #opnName');
  assert.equal(!!(await p.$('#opnPaid')), false, 'sans le bilan : pas de prix payé');
  await p.click('.opn-sheet [data-opn="go"]'); await p.waitForFunction(() => opnOn());
  await p.evaluate(() => opnTake([{ k: 'edgar markov', n: 'Edgar Markov', q: 1, l: 'en' }]));
  await p.evaluate(() => opnEndSheet()); await p.waitForSelector('.opn-end.open .opn-pick');
  assert.equal(await txt(p, '.opn-end h2'), 'Terminer la session'); assert.equal(!!(await p.$('.opn-end .opnb, .opn-end [data-opn="share"]')), false, 'ni bilan ni partage');
  await p.click('.opn-end [data-opn="add"]'); await p.waitForFunction(() => !opnOn() && collQty('edgar markov') === 1);
  assert.equal(await p.evaluate(() => opnHist()[0].paid), null);
  ok('sans opnbilan.js : session, récapitulatif simple (cartes à écarter, « Ajouter »), historique sans prix payé');
  await p.evaluate(() => { for (const f of ['opnTake', 'opnSay', 'opnCollHead', 'opnCollBody', 'opnCollClick', 'opnSv', 'streamOn', 'opnRcNote', 'opnBands', 'opnScsRow', 'opnEntry', 'opnSheet']) window[f] = undefined; });
  await p.evaluate(() => openScan()); await p.waitForSelector('.scan.on'); await add(p, 'Wrath of God');
  await p.click('.scan .dv-foot [data-act="done"]'); await p.waitForSelector('.rc-sheet [data-rc="go"]'); assert.equal(!!(await p.$('.rc-sheet .opn-rc')), false); await rcGo(p);
  await p.waitForFunction(() => collQty('wrath of god') === 1, null, { timeout: 5000 });
  await p.evaluate(() => scsSheet()); await p.waitForSelector('.scs-sheet.open .scs-ed'); assert.equal(!!(await p.$('.opn-scs')), false); await closeAll(p);
  await p.evaluate(() => openCollection('list')); await p.waitForSelector('.coll.on .coll-list'); assert.equal(!!(await p.$('.opn-cnote')), false);
  await p.evaluate(() => closeCollection()); await p.waitForTimeout(300); await toHome(p);
  await p.click('#btnAccount'); await p.waitForSelector('.me-sheet.open'); await closeAll(p);
  ok('sans opening.js : scan › Ajouter va dans la collection, réglages, collection et compte comme avant, aucune erreur');
  await ctx.close();
}

/* ── 4) pub : bandeau retiré pendant le mode streamer, rétabli après (appli Android simulée, faux AdMob) ───────────────────────────── */
{
  const fake = () => {
    const L = {}, emit = (ev, d) => (L[ev] || []).forEach(f => f(d)); let banner = false;
    const log = window.__ad = { calls: [] };
    const AdMob = {
      addListener: (ev, f) => { (L[ev] = L[ev] || []).push(f); return { remove: async () => {} }; },
      requestConsentInfo: async () => { log.calls.push('requestConsentInfo'); return { status: 'NOT_REQUIRED', isConsentFormAvailable: false, canRequestAds: true }; },
      showConsentForm: async () => ({ canRequestAds: true }), initialize: async () => { log.calls.push('initialize'); },
      showBanner: async () => { log.calls.push('showBanner'); banner = true; setTimeout(() => { if (banner) emit('bannerAdSizeChanged', { width: 390, height: 61 }); }, 50); },
      hideBanner: async () => { log.calls.push('hideBanner'); emit('bannerAdSizeChanged', { width: 0, height: 0 }); },
      resumeBanner: async () => { log.calls.push('resumeBanner'); },
      removeBanner: async () => { log.calls.push('removeBanner'); if (banner) { banner = false; setTimeout(() => emit('bannerAdSizeChanged', { width: 0, height: 0 }), 0); } },
    };
    window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => n === 'AdMob', Plugins: { AdMob } };
  };
  const { ctx, p, errs } = await newPage(browser, world, { goto: false }); errsAll.push(errs);
  await p.route('https://www.gstatic.com/**', r => r.abort()); await p.addInitScript(fake);
  await p.goto(world.url); await p.waitForTimeout(400); await toHome(p);
  await p.evaluate(() => { AD.grace = 0; AD.offMs = 0; AD.delay = 500; AD.back = 200; AD.idle = 0; adsRefresh(); });
  await p.waitForFunction(() => window.__ad.calls.includes('showBanner') && document.documentElement.classList.contains('ad-on'), null, { timeout: 8000 });
  const n0 = await p.evaluate(() => window.__ad.calls.length);
  await p.evaluate(() => { OPN.cur = { id: 'oad', name: 'Live', at: Date.now(), paid: null, st: true, rows: [] }; opnSave(); opnRefresh(); });
  await p.waitForFunction(n => window.__ad.calls.slice(n).includes('removeBanner') && !document.documentElement.classList.contains('ad-on'), n0, { timeout: 5000 });
  await p.waitForTimeout(1500);
  assert.ok(!(await p.evaluate(n => window.__ad.calls.slice(n), n0)).includes('showBanner'), 'aucun bandeau pendant le mode streamer');
  await p.evaluate(() => opnStreamer(false));
  await p.waitForFunction(n => window.__ad.calls.slice(n).includes('showBanner'), n0, { timeout: 8000 });
  ok('pub : bandeau détruit dès le mode streamer, aucun pendant, de retour après');
  await ctx.close();
}

assert.deepEqual(errsAll.flat(), [], 'erreurs page : ' + errsAll.flat().join(' | '));
await browser.close(); world.stop();
console.log('\nOPENING E2E OK');
