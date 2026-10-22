// E2E pub (appli Android simulée : faux window.Capacitor + faux plugin AdMob) : bandeau SOUS L'EN-TÊTE après le démarrage (marge = bas de l'en-tête + écart),
// contenu décalé de sa hauteur
// (événement bannerAdSizeChanged), masqué pendant le scan natif, l'accueil et la carte en grand puis rétabli, seulement sur les écrans de consultation
// (accueil, collection, decks ; ni saisie, ni résultats, ni éditeur de deck), jamais pour un compte autorisé
// (détruit quand checkServer le confirme), attente de la vérification du compte, consentement refusé, et rien du tout sur le web.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, ok, openMe } from './e2e-world.mjs';

const world = await startWorld({ port: 18950 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const TEST_ID = 'ca-app-pub-3940256099942544/6300978111', H = 61;

/** Faux pont natif : AdMob journalise ses appels et émet ses événements comme le plugin Android (chargé → hauteur, masqué/détruit → 0). */
function fakeNative(o) {
  const L = {}, emit = (ev, d) => (L[ev] || []).forEach(f => f(d)), sv = () => (typeof CTX !== 'undefined' ? CTX.serverOk : 'absent');
  let banner = false, visible = false;
  const log = window.__ad = { calls: [], seen: {} }, rec = (m, a) => { log.calls.push(m); log.seen[m] = log.seen[m] || { serverOk: sv(), args: a }; };
  const consent = o.consent || { status: 'NOT_REQUIRED', isConsentFormAvailable: false, canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' };
  const AdMob = {
    addListener: (ev, f) => { (L[ev] = L[ev] || []).push(f); return { remove: async () => {} }; },      // pont natif brut : un objet, pas une promesse
    requestConsentInfo: async a => { rec('requestConsentInfo', a); return consent; },
    showConsentForm: async () => { rec('showConsentForm'); return consent; },
    initialize: async a => { rec('initialize', a); },
    showBanner: async a => { rec('showBanner', a); log.last = a; banner = visible = true; setTimeout(() => { if (banner && visible) { emit('bannerAdSizeChanged', { width: 390, height: 61 }); emit('bannerAdLoaded', {}); } }, 80); },
    hideBanner: async () => { rec('hideBanner'); if (!banner) throw new Error('You tried to hide a banner that was never shown'); visible = false; emit('bannerAdSizeChanged', { width: 0, height: 0 }); },
    resumeBanner: async () => { rec('resumeBanner'); if (banner) { visible = true; emit('bannerAdSizeChanged', { width: 390, height: 61 }); } },
    removeBanner: async () => { rec('removeBanner'); if (banner) { banner = visible = false; setTimeout(() => emit('bannerAdSizeChanged', { width: 0, height: 0 }), 0); } },
    showPrivacyOptionsForm: async () => { rec('showPrivacyOptionsForm'); },
  };
  const Plugins = { AdMob,
    CameraPreview: { start: async () => ({}), stop: async () => ({}), captureSample: async () => ({ value: '' }) },
    CapacitorPluginMlKitTextRecognition: { detectText: async () => ({ text: '', blocks: [] }) } };
  window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => n in Plugins, Plugins };
}
const n = (p, m) => p.evaluate(m => window.__ad.calls.filter(c => c === m).length, m);
// en-tête en haut (sous la zone de la caméra : 0 ici) ; contenu (.wrap) décalé de la hauteur du bandeau + 8 px au-dessus + 12 px au-dessous
const pad = p => p.evaluate(() => ({ on: document.documentElement.classList.contains('ad-on'), top: getComputedStyle(document.querySelector('#app .wrap')).paddingTop, bar: getComputedStyle(document.querySelector('.bar')).top }));
const shown = p => p.waitForFunction(h => document.documentElement.classList.contains('ad-on') && getComputedStyle(document.querySelector('#app .wrap')).paddingTop === (20 + h + 20) + 'px', H, { timeout: 8000 });      // hauteur du bandeau + 16 px d'écart
const gone = p => p.waitForFunction(() => !document.documentElement.classList.contains('ad-on') && getComputedStyle(document.querySelector('#app .wrap')).paddingTop === '20px', null, { timeout: 8000 });
/** Page de l'appli « Android ». firebase : 'abort' (SDK injoignable, compte connu tout de suite) ou 'hang' (session qui tarde : pg.held, à relâcher). */
async function natPage(o = {}) {
  const pg = await newPage(browser, world, { goto: false });
  pg.held = []; await pg.p.route('https://www.gstatic.com/**', r => (o.firebase === 'hang' ? pg.held.push(r) : r.abort()));
  if (o.ping) await pg.p.route('**/__ping', async r => { const res = await r.fetch(); r.fulfill({ response: res, json: { ...(await res.json()), ...o.ping } }); });
  if (o.native !== false) await pg.p.addInitScript(fakeNative, o);
  await pg.p.goto(world.url); await pg.p.waitForTimeout(400);
  return pg;
}

{ // 1) appli Android : bandeau après le démarrage, marge, écrans pleins, réglages, compte autorisé
  const { p, errs } = await natPage();
  assert.equal(await n(p, 'showBanner'), 0, 'rien au lancement');
  assert.equal(await n(p, 'requestConsentInfo'), 0, 'pas de consentement demandé au lancement');
  await p.evaluate(() => { AD.grace = 0; AD.offMs = 0; AD.delay = 700; AD.back = 200; AD.idle = 0; adsRefresh(); });      // délais de test
  await p.waitForFunction(() => window.__ad.calls.includes('showBanner'), null, { timeout: 8000 });
  assert.deepEqual(await p.evaluate(() => window.__ad.calls.filter(c => c !== 'removeBanner')), ['requestConsentInfo', 'initialize', 'showBanner'], 'consentement, SDK initialisé, puis bandeau');
  assert.deepEqual(await p.evaluate(() => window.__ad.seen.initialize.args), { maxAdContentRating: 'ParentalGuidance' }, 'annonces « accord parental » au plus (PEGI 3-7 / E10+)');
  assert.deepEqual(await p.evaluate(() => window.__ad.last), { adId: TEST_ID, isTesting: true, adSize: 'ADAPTIVE_BANNER', position: 'TOP_CENTER', margin: 71 }, 'bandeau de test sous l\'en-tête (63 px + 8 px d\'écart ; pas d\'ADMOB_BANNER_ID)');
  assert.equal(await p.evaluate(() => window.__ad.calls[0]), 'removeBanner', 'bandeau d\'une page précédente retiré au démarrage');
  await shown(p);
  assert.deepEqual(await pad(p), { on: true, top: (20 + H + 20) + 'px', bar: '0px' }, 'en-tête en haut, contenu décalé de la hauteur reçue + 8 et 12 px d\'écart (règle AdMob)');
  assert.deepEqual(await p.evaluate(() => [document.querySelector('.bar').getBoundingClientRect().bottom, getComputedStyle(document.documentElement, '::after').top, getComputedStyle(document.documentElement, '::after').height]), [63, '63px', (H + 20) + 'px'], 'bande fixe sous l\'en-tête, à la place du bandeau');
  ok('bandeau après le démarrage (consentement → initialisation → bandeau de test sous l\'en-tête), contenu décalé de sa hauteur');

  await p.evaluate(() => openCollection()); await p.waitForSelector('.coll.on');
  assert.deepEqual(await p.$eval('.coll .dv-head', e => [getComputedStyle(e).paddingTop, getComputedStyle(e).marginBottom, Math.round(e.getBoundingClientRect().height)]), ['10px', (H + 20) + 'px', 63], 'écran plein (collection) : en-tête en haut, même hauteur, la place du bandeau dessous');
  assert.equal(await n(p, 'hideBanner'), 0, 'collection : le bandeau reste');
  await p.evaluate(() => openScan()); await p.waitForSelector('.scan.on');
  await p.waitForFunction(() => document.documentElement.classList.contains('nat-cam'), null, { timeout: 5000 });
  await gone(p); assert.equal(await n(p, 'removeBanner'), 2, 'scan natif : bandeau détruit (la caméra native laisse la page au-dessus : un bandeau masqué reviendrait dessous)'); assert.equal(await n(p, 'hideBanner'), 0);
  assert.equal(await p.$eval('.scan .sc-tools', e => getComputedStyle(e).paddingTop), '8px', 'scan : plus de marge (boutons posés sur l\'image, en haut)');
  await p.waitForTimeout(500); assert.equal(await n(p, 'showBanner'), 1, 'pas de retour tant que le scan est ouvert');
  await p.evaluate(() => SC.el && SC.el.__close('done')); await shown(p);
  assert.equal(await n(p, 'showBanner'), 2, 'scan fermé : nouveau bandeau, au-dessus de la page'); assert.equal(await n(p, 'resumeBanner'), 0);
  await p.evaluate(() => closeCollection()); await p.waitForTimeout(300);
  ok('collection : en-tête sous le bandeau ; scan natif (html.nat-cam) : bandeau détruit et marge retirée, recréé à la fermeture');

  await p.evaluate(() => openCardViewer([{ key: 'sol ring', name: 'Sol Ring', small: 'https://cards.scryfall.io/small/front/a/b/sol-ring.jpg' }], 0)); await p.waitForSelector('.imgv');
  await gone(p); assert.equal(await n(p, 'hideBanner'), 1);
  await p.evaluate(() => closeCardImage()); await shown(p); assert.equal(await n(p, 'resumeBanner'), 1);
  await p.evaluate(() => obOpen()); await p.waitForSelector('.ob');
  await gone(p); assert.equal(await n(p, 'hideBanner'), 2);
  await p.evaluate(() => obClose()); await shown(p); assert.equal(await n(p, 'resumeBanner'), 2);
  ok('carte en grand et accueil du premier lancement : bandeau masqué puis rétabli');

  // emplacement « par moments » (9 octobre) : saisie, résultats, éditeur de deck → masqué ; accueil, collection, decks → rétabli
  await p.evaluate(() => showView('input')); await gone(p); assert.equal(await n(p, 'hideBanner'), 3, 'saisie : masqué');
  await p.evaluate(() => openCollection()); await p.waitForSelector('.coll.on'); await shown(p); assert.equal(await n(p, 'resumeBanner'), 3, 'collection ouverte par-dessus la saisie : rétabli');
  await p.evaluate(() => closeCollection()); await gone(p); assert.equal(await n(p, 'hideBanner'), 4, 'collection refermée sur la saisie : masqué');
  await p.evaluate(() => showView('results')); await p.waitForTimeout(500); assert.equal(await n(p, 'resumeBanner'), 3, 'résultats : toujours masqué');
  await p.evaluate(() => showView('home')); await shown(p); assert.equal(await n(p, 'resumeBanner'), 4, 'accueil : rétabli');
  await p.evaluate(() => openDecks()); await p.waitForSelector('.dks.on'); await p.waitForTimeout(500); assert.equal(await n(p, 'hideBanner'), 4, 'Mes decks : le bandeau reste');
  await p.evaluate(() => openBuilder({})); await p.waitForSelector('.bd.on'); await gone(p); assert.equal(await n(p, 'hideBanner'), 5, 'éditeur de deck : masqué');
  await p.evaluate(() => bdClose(true)); await shown(p); assert.equal(await n(p, 'resumeBanner'), 5, 'retour sur Mes decks : rétabli');
  await p.evaluate(() => closeDecks()); await p.waitForTimeout(400); assert.equal(await n(p, 'showBanner'), 2, 'jamais recréé : masqué puis rétabli');
  ok('écrans de consultation seulement : masqué en saisie, résultats, éditeur de deck ; rétabli sur l\'accueil, la collection, Mes decks');

  await p.setViewportSize({ width: 390, height: 520 });
  await openMe(p, 'conf'); await p.waitForSelector('#privBox[data-ads]');
  assert.match(await p.textContent('#privBox .hint'), /bandeau publicitaire Google AdMob/); assert.doesNotMatch(await p.textContent('#privBox .hint'), /Aucune publicité/);
  await p.waitForTimeout(500);
  assert.ok(await p.$eval('.sheet', (e, h) => e.getBoundingClientRect().top >= h, H), 'feuille haute : elle s\'arrête sous le bandeau');
  await p.click('#btnAdChoices'); await p.waitForFunction(() => window.__ad.calls.includes('showPrivacyOptionsForm'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(450); await p.setViewportSize({ width: 390, height: 844 });
  assert.equal(await n(p, 'hideBanner'), 5, 'feuille : le bandeau reste');
  ok('réglages : mention de la pub, « Choix publicitaires » (formulaire Google), feuille sous le bandeau');

  await p.evaluate(() => { CTX.serverOk = true; adsRefresh(); }); await gone(p);
  assert.equal(await n(p, 'removeBanner'), 3, 'compte autorisé : bandeau détruit');
  await p.waitForTimeout(1200); assert.equal(await n(p, 'showBanner'), 2, 'et jamais remontré');
  await p.evaluate(() => { CTX.serverOk = false; adsRefresh(); }); await shown(p); assert.equal(await n(p, 'showBanner'), 3, 'autre compte : bandeau recréé');
  await p.route('**/__me', r => r.fulfill({ json: { server: true } }));
  await p.evaluate(async () => { CTX.proxy = CTX.hasToken = CTX.needsLogin = true; CTX.idToken = async () => 'jeton'; await checkServer(); });
  await gone(p); assert.equal(await n(p, 'removeBanner'), 4, 'checkServer() confirme un compte autorisé : bandeau retiré');
  assert.equal(await p.evaluate(() => CTX.serverOk), true);
  assert.equal(await n(p, 'initialize'), 1, 'SDK initialisé une seule fois'); assert.equal(await n(p, 'requestConsentInfo'), 2, 'consentement : au lancement, puis après « Choix publicitaires »');
  assert.deepEqual(errs, []); await p.context().close();
  ok('compte autorisé : bandeau détruit (et via checkServer), jamais remontré ; SDK initialisé une fois');
}

{ // 2) connexion exigée par le serveur : rien tant que le compte n'est pas vérifié ; bloc d'annonces réel donné par /__ping
  const pg = await natPage({ firebase: 'hang', ping: { needsLogin: true, adUnit: 'ca-app-pub-1234567890123456/9876543210' } }), { p, errs } = pg;
  await p.evaluate(() => { AD.grace = 0; AD.offMs = 0; AD.delay = 200; AD.idle = 0; adsRefresh(); });
  await p.waitForTimeout(2500);
  assert.deepEqual(await p.evaluate(() => [CTX.serverOk == null, D.authReady]), [true, false], 'session pas encore revenue : compte inconnu');
  assert.deepEqual(await p.evaluate(() => window.__ad.calls.filter(c => c !== 'removeBanner')), [], 'ni consentement ni bandeau avant la vérification du compte');
  for (const r of pg.held.splice(0)) r.abort().catch(() => {});      // la session revient (sans compte) : checkServer() conclut « non autorisé »
  await p.waitForFunction(() => window.__ad.calls.includes('showBanner'), null, { timeout: 12000 });
  assert.deepEqual(await p.evaluate(() => [window.__ad.seen.requestConsentInfo.serverOk, window.__ad.seen.showBanner.serverOk]), [false, false], 'consentement et bandeau seulement une fois le compte vérifié (non autorisé)');
  assert.deepEqual(await p.evaluate(() => window.__ad.last), { adId: 'ca-app-pub-1234567890123456/9876543210', isTesting: false, adSize: 'ADAPTIVE_BANNER', position: 'TOP_CENTER', margin: 71 }, 'bloc réel du serveur, sans mode test');
  await shown(p);
  assert.deepEqual(errs, []); await p.context().close();
  ok('compte en cours de vérification : rien ; ensuite bandeau avec le bloc d\'annonces du serveur (ADMOB_BANNER_ID)');
}

{ // 3) compte autorisé dès le départ : aucun appel au SDK, réglages inchangés
  const { p, errs } = await natPage();
  await p.evaluate(() => { CTX.serverOk = true; AD.grace = 0; AD.offMs = 0; AD.delay = 200; AD.idle = 0; adsRefresh(); });
  await p.waitForTimeout(1500);
  assert.deepEqual(await p.evaluate(() => window.__ad.calls), ['removeBanner'], 'ni consentement, ni initialisation, ni bandeau');
  assert.deepEqual(await pad(p), { on: false, top: '20px', bar: '0px' });
  await openMe(p, 'conf'); await p.waitForSelector('#privBox'); await p.waitForTimeout(200);
  assert.match(await p.textContent('#privBox .hint'), /Aucune publicité/); assert.equal(await p.$('#btnAdChoices'), null);
  assert.deepEqual(errs, []); await p.context().close();
  ok('compte autorisé dès le lancement : jamais de pub, aucun appel au SDK');
}

{ // 4) consentement refusé (UE) : formulaire montré, puis aucune pub
  const no = { status: 'REQUIRED', isConsentFormAvailable: true, canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' };
  const { p, errs } = await natPage({ consent: no });
  await p.evaluate(() => { AD.grace = 0; AD.offMs = 0; AD.delay = 200; AD.idle = 0; adsRefresh(); });
  await p.waitForFunction(() => window.__ad.calls.includes('showConsentForm'), null, { timeout: 5000 }); await p.waitForTimeout(800);
  assert.deepEqual(await p.evaluate(() => window.__ad.calls.filter(c => c !== 'removeBanner')), ['requestConsentInfo', 'showConsentForm'], 'pas d\'initialisation ni de bandeau sans consentement');
  assert.equal((await pad(p)).on, false);
  assert.deepEqual(errs, []); await p.context().close();
  ok('consentement impossible : formulaire Google, puis aucune pub');
}

{ // 5) navigateur / PWA : aucune pub, aucune marge
  const { p, errs } = await natPage({ native: false });
  await p.evaluate(() => { AD.grace = 0; AD.offMs = 0; AD.delay = 100; adsRefresh(); }); await p.waitForTimeout(800);
  assert.deepEqual(await p.evaluate(() => [typeof adsRefresh, AD.on, AD.st, typeof window.Capacitor]), ['function', false, 'off', 'undefined']);
  assert.deepEqual(await pad(p), { on: false, top: '20px', bar: '0px' });
  await openMe(p, 'conf'); await p.waitForSelector('#privBox'); await p.waitForTimeout(200);
  assert.match(await p.textContent('#privBox .hint'), /Aucune publicité/);
  assert.deepEqual(errs, []); await p.context().close();
  ok('web : aucune pub, page intacte');
}

{ // 7) pas tout le temps : rien les premières minutes d'utilisation (comptées sur ce téléphone, gardées au rechargement), puis par cycles
  //    (2 min sur 5 en vrai) ; hors fenêtre le bandeau est DÉTRUIT (jamais seulement caché) et il ne part jamais sous le doigt
  const { p, errs } = await natPage();
  const shows = () => p.evaluate(() => window.__ad.calls.filter(c => c === 'showBanner').length);
  const lastRm = () => p.evaluate(() => window.__ad.calls.lastIndexOf('removeBanner') > window.__ad.calls.lastIndexOf('showBanner'));
  await p.evaluate(() => { AD.grace = 2000; AD.onMs = 1500; AD.offMs = 1500; AD.delay = 100; AD.back = 100; AD.idle = 0; adsRefresh(); });
  await p.waitForTimeout(900); assert.equal(await shows(), 0, 'premières minutes : aucun bandeau');
  await p.waitForFunction(() => window.__ad.calls.includes('showBanner'), null, { timeout: 8000 });
  await p.waitForFunction(() => window.__ad.calls.lastIndexOf('removeBanner') > window.__ad.calls.lastIndexOf('showBanner'), null, { timeout: 8000 });
  assert.equal(await p.evaluate(() => document.documentElement.classList.contains('ad-on')), false, 'pause : bandeau détruit, marge retirée');
  assert.equal(await p.evaluate(() => window.__ad.calls.includes('hideBanner')), false, 'jamais seulement caché');
  await p.waitForFunction(() => window.__ad.calls.filter(c => c === 'showBanner').length >= 2, null, { timeout: 8000 });
  // fin de fenêtre pendant qu'on touche l'écran : le bandeau attend AD.idle sans toucher avant de partir
  await p.evaluate(() => { AD.idle = 1200; });
  for (let i = 0; i < 12; i++) { await p.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))); await p.waitForTimeout(250); }
  assert.equal(await lastRm(), false, 'pas retiré sous le doigt');
  await p.waitForFunction(() => window.__ad.calls.lastIndexOf('removeBanner') > window.__ad.calls.lastIndexOf('showBanner'), null, { timeout: 6000 });
  // le temps d'utilisation est gardé : rechargé, il compte toujours
  await p.evaluate(() => { adsUse(); localStorage.setItem('deckdeal:aduse', String(Math.round(AD.use))); });
  const used = await p.evaluate(() => Number(localStorage.getItem('deckdeal:aduse')));
  assert.ok(used >= 4000, 'temps d\'utilisation enregistré : ' + used);
  await p.reload(); await p.waitForTimeout(600);
  assert.ok(await p.evaluate(() => AD.use) >= used, 'relu au lancement suivant');
  assert.deepEqual(errs, []); await p.context().close();
  ok('pub pas tout le temps : rien les premières minutes (temps gardé), puis cycles avec / sans bandeau, détruit hors fenêtre, jamais sous le doigt');
}

{ // 6) plein écran (appli) : barre d'état cachée (SystemBars de Capacitor), barre de gestes gardée, recachée au retour (volet des notifications) et au
  //    premier appui ; bande de 24 px en haut ; découpe de la caméra au milieu (ManaOrbit.cutout, APK 1.0.2) → en-tête sur la ligne de la caméra, à 24 px
  //    du bord (html.cut-mid) ; découpe dans un coin, ou APK sans la méthode : en-tête sous la caméra
  const run = async cut => {
    const pg = await newPage(browser, world, { goto: false });
    await pg.p.route('https://www.gstatic.com/**', r => r.abort());
    await pg.p.addInitScript(cut => {
      window.__sb = [];
      const MO = { info: async () => ({}), setWidget: async () => ({}), setTradeWidget: async () => ({}), addListener: async () => ({ remove: async () => {} }) };
      if (cut) MO.cutout = async () => cut;
      const Plugins = { SystemBars: { hide: async a => { window.__sb.push(a); } }, ManaOrbit: MO };
      window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => n in Plugins, Plugins };
    }, cut);
    await pg.p.goto(world.url); await pg.p.waitForFunction(() => window.__sb.length, null, { timeout: 5000 }); await pg.p.waitForTimeout(300);
    return pg;
  };
  const cls = pg => pg.p.evaluate(() => [...document.documentElement.classList].filter(c => c === 'fs' || c === 'cut-mid').sort().join());
  let pg = await run({ w: 390, h: 844, rects: [{ l: 188, t: 0, r: 202, b: 30 }] });
  const sbOnly = async () => { const a = await pg.p.evaluate(() => window.__sb); assert.ok(a.length && a.every(x => x && x.bar === 'StatusBar' && Object.keys(x).length === 1), 'barre d\'état cachée seulement (barre de gestes gardée) : ' + JSON.stringify(a)); return a.length; };
  const band = () => pg.p.evaluate(() => [getComputedStyle(document.documentElement).paddingTop, document.querySelector('#app .bar').getBoundingClientRect().top]);
  const tap = () => pg.p.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));      // appui (sans rien ouvrir)
  let n = await sbOnly();
  assert.equal(await cls(pg), 'cut-mid,fs', 'découpe au milieu : en-tête sur sa ligne');
  assert.equal(await pg.p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--cut-h').trim()), '30px');
  assert.deepEqual(await band(), ['24px', 24], 'bande de 24 px au-dessus de l\'en-tête');
  await pg.p.waitForTimeout(1100); await pg.p.evaluate(() => { dispatchEvent(new Event('blur')); dispatchEvent(new Event('focus')); });      // volet refermé
  await pg.p.waitForFunction(n => window.__sb.length > n, n, { timeout: 2000 }); n = await sbOnly();
  await pg.p.waitForTimeout(1100); await tap(); await pg.p.waitForFunction(n => window.__sb.length > n, n, { timeout: 2000 }); n = await sbOnly();
  await tap(); await pg.p.waitForTimeout(200); assert.equal(await sbOnly(), n, 'pas plus d\'une fois par seconde');
  await pg.p.evaluate(() => openDecks()); await pg.p.waitForSelector('.dks.on');
  assert.ok(await pg.p.$eval('.dks .dv-title', e => e.getBoundingClientRect().right <= 390 / 2 - 6), 'titre arrêté avant la caméra');
  assert.deepEqual(pg.errs, []); await pg.ctx.close();
  pg = await run({ w: 390, h: 844, rects: [{ l: 16, t: 0, r: 40, b: 30 }] });
  assert.equal(await cls(pg), 'fs', 'découpe dans un coin : l\'en-tête reste sous la caméra'); assert.deepEqual(await band(), ['24px', 24], 'bande de 24 px (au moins)'); assert.deepEqual(pg.errs, []); await pg.ctx.close();
  pg = await run(null);
  assert.equal(await cls(pg), 'fs', 'APK sans ManaOrbit.cutout : barre d\'état cachée, en-tête sous la caméra'); assert.deepEqual(await band(), ['24px', 24]); assert.deepEqual(pg.errs, []); await pg.ctx.close();
  ok('plein écran : barre d\'état cachée, recachée au retour et au 1er appui ; bande de 24 px en haut ; découpe au milieu → en-tête sur la ligne de la caméra, titres arrêtés avant ; coin ou APK ancienne → sous la caméra');
}

await browser.close(); world.stop(); console.log('\nADS E2E OK'); process.exit(0);
