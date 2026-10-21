// E2E liens https://manaorbit.app et appli Android (src/applink.js, port 19470).
// Navigateur Android : barre « Ouvrir dans l'appli Mana Orbit » sur une page ouverte par un lien (?p=, ?troc=, ?partie=) : adresse intent:// (chemin et paramètres,
// paquet, fiche Play en repli), « L'installer » vers PLAY_URL, place laissée à la page (dernière ligne et « Signaler » au-dessus d'elle, carte en grand), sous les
// feuilles, ✕ retenu pour la session, jamais avec la bannière d'installation de la PWA, textes traduits ; jamais sans lien, sur iPhone, sur ordinateur, dans la
// PWA installée, en mode streamer ni dans l'appli. Appli Android simulée (window.Capacitor, plugin App comme Capacitor 8 : getLaunchUrl rendu tant que l'appli
// vit, « appUrlOpen » gardé jusqu'au premier addListener) : lancée par un lien → une seule navigation vers ce lien, pas rejouée au rechargement ; appli ouverte →
// sur place, sans rechargement (?table= aussi) ; autre origine, adresse illisible, adresse déjà affichée : rien ; paramètre que seul le démarrage lit : page chargée.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok } from './e2e-world.mjs';

const world = await startWorld({ port: 19470 });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const WEBVIEW = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const PLAY = 'https://play.google.com/store/apps/details?id=app.manaorbit';
const intentOf = q => `intent://manaorbit.app/${q}#Intent;scheme=https;package=app.manaorbit;S.browser_fallback_url=${encodeURIComponent(PLAY)};end`;
const errsOf = [];

// Partages publics simulés (API REST Firestore, lecture seule) : Alice a 40 cartes à échanger (la liste dépasse l'écran), Bob 2.
const card = i => ({ n: 'Carte numéro ' + i, q: 1 + (i % 3) });
const SHARES = {
  ShareApl00000001: { by: 'Alice', at: Date.now() - 60e3, have: Array.from({ length: 40 }, (_, i) => card(i)), want: [] },
  ShareApl00000002: { by: 'Bob', at: Date.now() - 60e3, have: [card(1), card(2)], want: [] },
};
async function page(o = {}) {
  const pg = await newPage(browser, world, { goto: false, init: o.init, ctx: { userAgent: o.ua || ANDROID, ...(o.ctx || {}) } });
  errsOf.push(pg.errs);
  await pg.p.route('https://firestore.googleapis.com/**', route => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop()), s = SHARES[id], h = { 'access-control-allow-origin': '*' };
    assert.equal(route.request().method(), 'GET', 'lecture seule');
    if (!s) return route.fulfill({ status: 404, headers: h, json: { error: { code: 404, status: 'NOT_FOUND' } } });
    route.fulfill({ status: 200, headers: h, json: { fields: { o: { stringValue: 'x' }, kind: { stringValue: 'trade' }, v: { integerValue: '1' }, updatedAt: { integerValue: '1' }, d: { stringValue: JSON.stringify(s) } } } });
  });
  await pg.p.route('https://www.gstatic.com/**', r => r.abort());      // SDK Firebase : inutile ici
  pg.docs = []; pg.p.on('request', r => { if (r.resourceType() === 'document' && r.frame() === pg.p.mainFrame()) pg.docs.push(r.url()); });
  if (o.path !== undefined) await pg.p.goto(world.url + o.path);
  return pg;
}
const bar = p => p.$('#aplBar');
const noBar = async (p, why) => { await p.waitForTimeout(1500); assert.equal(await bar(p), null, why); };
const pubOn = (p, who) => p.waitForFunction(w => { const el = document.querySelector('.pubv.on .dv-title b'); return el && el.textContent.includes(w); }, who, { timeout: 8000 });

/* ── 1) Navigateur Android, lien d'échange ?p= : la barre, son adresse intent://, la page reste utilisable ───────────────────── */
{
  const { p, ctx } = await page({ path: '?p=ShareApl00000001' });
  await pubOn(p, 'Alice'); await p.waitForSelector('#aplBar');
  assert.equal(await txt(p, '#aplBar .apl-go'), 'Ouvrir dans l\'appli Mana Orbit');
  assert.equal(await txt(p, '#aplBar .apl-get'), 'Pas encore l\'appli ? L\'installer');
  assert.equal(await p.$eval('#aplBar .apl-go', a => a.getAttribute('href')), intentOf('?p=ShareApl00000001'), 'intent://manaorbit.app/<chemin et paramètres>, paquet, fiche Play en repli');
  assert.deepEqual(await p.$eval('#aplBar .apl-get a', a => [a.getAttribute('href'), a.target, a.rel]), [PLAY, '_blank', 'noopener']);
  assert.equal(await p.evaluate(() => PLAY_URL), PLAY, 'une seule constante pour la fiche Play (help.js)');
  assert.equal(await p.evaluate(() => [RATE_ASK, RATE.url].join('|')), 'false|', 'demande de note toujours coupée (RATE_ASK)');
  assert.equal(await p.$eval('#aplBar .apl-x', b => b.getAttribute('aria-label')), 'Fermer');
  await p.waitForFunction(() => WGT_LAUNCH.done, null, { timeout: 8000 });
  assert.equal(await p.evaluate(() => location.search), '', 'handleLaunch a nettoyé l\'adresse : la barre garde le lien lu au chargement');
  // l'adresse intent:// : chemin normalisé, ancre retirée, paramètres gardés tels quels (vérifiée aussi avec Intent.parseUri d'Android, voir docs/android.md)
  assert.deepEqual(await p.evaluate(() => [aplIntent('/index.html?troc=ABC234'), aplIntent('/?p=X1&lang=de#mig=abc'), aplIntent('?partie=Z9')]), [intentOf('?troc=ABC234'), intentOf('?p=X1&lang=de'), intentOf('?partie=Z9')]);
  ok('navigateur Android, ?p= : barre « Ouvrir dans l\'appli Mana Orbit » (intent://manaorbit.app/?p=…, package app.manaorbit, fiche Play en repli) et « L\'installer » (PLAY_URL)');

  // place laissée à la page : la barre est en bas de l'écran, la liste défile jusqu'au-dessus d'elle, rien n'est caché dessous
  await p.click('#pubSub [data-v="have"]'); await p.waitForSelector('.pubv .pub-row');
  const b = await p.$eval('#aplBar', e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: r.height, z: getComputedStyle(e).zIndex, sheet: getComputedStyle(document.querySelector('#sheetRoot')).zIndex }; });
  assert.ok(b.bottom <= 844 - 8 && b.h >= 50 && b.h <= 110, 'barre basse et discrète : ' + JSON.stringify(b));
  assert.equal(b.z, '84'); assert.ok(Number(b.sheet) > 84, 'les feuilles passent au-dessus de la barre');
  assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--apl-h').trim()), Math.round(b.h) + 'px', '--apl-h : hauteur de la barre');
  await p.$eval('.pubv .dv-scroll', s => { s.scrollTop = s.scrollHeight; }); await p.waitForTimeout(400);
  const last = await p.evaluate(() => { const r = [...document.querySelectorAll('.pubv .pub-report a, .pubv .pub-row')].pop().getBoundingClientRect(); const rep = document.querySelector('.pubv .pub-report a').getBoundingClientRect(); return { bottom: r.bottom, rep: rep.bottom, hit: document.elementFromPoint(rep.left + 4, rep.top + rep.height / 2)?.closest('.pub-report') !== null }; });
  assert.ok(last.rep <= b.top, '« Signaler ce partage » (bas de la page) au-dessus de la barre : ' + JSON.stringify([last, b.top]));
  assert.ok(last.hit, 'le bas de la page reste touchable');
  await p.screenshot({ path: 'shots/applink-1-barre.png' });
  await p.locator('.pubv .pub-row').first().click();      // localisateur relu au moment du clic : la liste se repeint quand les images arrivent (élément détaché sinon)
  await p.waitForFunction(() => typeof imgView !== 'undefined' && imgView, null, { timeout: 5000 });
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !imgView, null, { timeout: 5000 });
  ok('la page reste utilisable : barre en bas (z 84, sous les feuilles), liste et « Signaler » défilent au-dessus d\'elle, carte en grand au toucher');

  // ✕ : retenu pour la session (onglet), pas au-delà
  await p.click('#aplBar .apl-x'); await p.waitForFunction(() => !document.querySelector('#aplBar'), null, { timeout: 3000 });
  assert.equal(await p.evaluate(() => [sessionStorage.getItem('deckdeal:apl-x'), document.body.classList.contains('apl-on')].join('|')), '1|false');
  await p.goto(world.url + '?p=ShareApl00000001'); await pubOn(p, 'Alice'); await noBar(p, '✕ : plus de barre dans cet onglet');
  await ctx.close();
  const again = await page({ path: '?p=ShareApl00000001' }); await pubOn(again.p, 'Alice'); await again.p.waitForSelector('#aplBar'); await again.ctx.close();
  ok('✕ : barre fermée pour la session (rechargement compris), de retour dans un nouvel onglet');
}

/* ── 2) Jamais avec la bannière d'installation de la PWA ─────────────────────────────────────────────────────────────────────── */
{
  const prompt = `addEventListener('load', () => setTimeout(() => { const ev = new Event('beforeinstallprompt', { cancelable: true }); ev.prompt = async () => {}; ev.userChoice = Promise.resolve({ outcome: 'dismissed' }); dispatchEvent(ev); }, 50));`;
  const { p, ctx } = await page({ init: prompt, path: '?p=ShareApl00000002' });
  await pubOn(p, 'Bob'); await p.waitForSelector('#aplBar');
  assert.equal(await p.evaluate(() => [PWA.state(), PWA.wantsBanner(), document.querySelector('#installWrap').classList.contains('closed')].join('|')), 'ready|true|true', 'installation possible, mais bannière fermée tant que la barre est là');
  await p.click('.pubv [data-act="close"]'); await p.waitForFunction(() => !document.querySelector('.pubv.on'), null, { timeout: 4000 });
  assert.ok(await p.$eval('#installWrap', w => w.classList.contains('closed')), 'accueil : toujours une seule des deux');
  await p.click('#aplBar .apl-x'); await p.waitForFunction(() => !document.querySelector('#installWrap').classList.contains('closed'), null, { timeout: 3000 });
  await p.screenshot({ path: 'shots/applink-2-installation.png' });
  await ctx.close();
  ok('bannière « Installer Mana Orbit » (PWA) : attend que la barre soit fermée, jamais les deux');
}

/* ── 3) ?troc=, ?partie=, textes traduits ──────────────────────────────────────────────────────────────────────────── */
for (const [path, q] of [['?troc=ABC234', '?troc=ABC234'], ['?partie=Z9', '?partie=Z9']]) {
  const { p, ctx } = await page({ path });
  await p.waitForSelector('#aplBar', { timeout: 8000 });
  assert.equal(await p.$eval('#aplBar .apl-go', a => a.getAttribute('href')), intentOf(q), path);
  await ctx.close();
}
{
  const { p, ctx } = await page({ path: '?lang=en&p=ShareApl00000002', ctx: { colorScheme: 'dark', viewport: { width: 360, height: 640 } } });
  await p.waitForSelector('#aplBar');
  assert.equal(await txt(p, '#aplBar .apl-go'), 'Open in the Mana Orbit app'); assert.equal(await txt(p, '#aplBar .apl-get'), 'Don\'t have the app yet? Install it');
  assert.equal(await p.$eval('#aplBar .apl-x', b => b.getAttribute('aria-label')), 'Close');
  const fit = await p.$eval('#aplBar', e => { const r = e.getBoundingClientRect(), go = e.querySelector('.apl-go'); return r.left >= 0 && r.right <= innerWidth && go.scrollWidth <= go.clientWidth + 1; });
  assert.ok(fit, '360 px : la barre et son bouton tiennent dans l\'écran');
  await p.screenshot({ path: 'shots/applink-3-en-sombre-360.png' });
  await ctx.close();
}
ok('?troc= et ?partie= : barre aussi ; anglais, thème sombre, écran de 360 px');

/* ── 4) Pas de barre : sans lien, raccourci, iPhone, ordinateur, PWA installée, mode streamer, appli ─────────────────────────── */
{
  const cases = [
    ['/', {}, 'page sans lien'], ['?collection', {}, 'lien interne (?collection) : pas un lien d\'un autre joueur'],
    ['?p=ShareApl00000002', { ua: IPHONE }, 'iPhone'], ['?p=ShareApl00000002', { ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36' }, 'ordinateur'],
    ['?p=ShareApl00000002', { init: `{ const mm = window.matchMedia.bind(window); window.matchMedia = q => /display-mode: standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q); }` }, 'PWA installée (display-mode: standalone)'],
    ['?p=ShareApl00000002', { init: `localStorage.setItem('deckdeal:opn:cur', JSON.stringify({ id: 'o1', name: 'Stream', at: Date.now(), st: true, rows: [] }));` }, 'mode streamer'],
    ['?p=ShareApl00000002', { ua: WEBVIEW, init: `window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => false, Plugins: {} };` }, 'appli Android (WebView de la coque)'],
  ];
  for (const [path, o, why] of cases) {
    const { p, ctx } = await page({ ...o, path });
    if (path.includes('?p=')) await pubOn(p, 'Bob');
    await noBar(p, why);
    if (why === 'mode streamer') assert.ok(await p.evaluate(() => streamOn()), 'mode streamer bien actif');
    await ctx.close();
  }
  ok('pas de barre : page sans lien, lien interne, iPhone, ordinateur, PWA installée, mode streamer, appli Android');
}

/* ── 5) Appli Android simulée : lien reçu d'Android (App Links) ─────────────────────────────────────────────────────────────── */
// Plugin App comme Capacitor 8 : getLaunchUrl rend le lien de lancement tant que l'appli vit (ici : tant que __launch est posé), « appUrlOpen » émis sans
// personne à l'écoute est gardé jusqu'au premier addListener (au lancement, Capacitor le rejoue ainsi une fois). Un rechargement de la page ne relance pas l'appli.
const shell = launch => `(() => {
  if (${JSON.stringify(launch)} && !localStorage.getItem('__proc')) { localStorage.setItem('__proc', '1'); localStorage.setItem('__launch', ${JSON.stringify(launch)}); localStorage.setItem('__held', ${JSON.stringify(launch)}); }
  const L = [];
  window.__apl = { fire: url => { if (L.length) L.forEach(f => f({ url })); else localStorage.setItem('__held', url); } };
  window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => n === 'App', Plugins: { App: {
    addListener: async (ev, fn) => { if (ev === 'appUrlOpen') { L.push(fn); const h = localStorage.getItem('__held'); if (h) { localStorage.removeItem('__held'); setTimeout(() => fn({ url: h }), 0); } } return { remove: async () => {} }; },
    getLaunchUrl: async () => { const u = localStorage.getItem('__launch'); return u ? { url: u } : undefined; },
    minimizeApp: async () => {}, exitApp: async () => {},
  } } };
})();`;
{
  const L = world.url + '?p=ShareApl00000001';
  const { p, ctx, docs } = await page({ ua: WEBVIEW, init: shell(L), path: '' });
  await pubOn(p, 'Alice'); await p.waitForFunction(() => WGT_LAUNCH.done && location.search === '', null, { timeout: 8000 }); await sleep(2000);
  assert.deepEqual(docs, [world.url, L], 'appli lancée par le lien : server.url, puis UNE navigation vers le lien (getLaunchUrl et « appUrlOpen » rejoué : une seule fois)');
  assert.equal(await bar(p), null, 'jamais de barre dans l\'appli');
  ok('appli fermée, lien scanné : page chargée sur le lien (comme le navigateur), une seule fois, liste d\'échange ouverte');

  await p.reload(); await p.waitForFunction(() => typeof WGT_LAUNCH !== 'undefined' && WGT_LAUNCH.done, null, { timeout: 8000 }); await sleep(2000);
  assert.equal(docs.length, 3, 'rechargement (mise à jour, langue) : aucune navigation de plus'); assert.equal(await p.$('.pubv.on'), null, 'le lien de lancement n\'est pas rejoué');
  ok('rechargement de la page : le lien de lancement (encore rendu par getLaunchUrl) n\'est pas rejoué');

  await p.evaluate(u => window.__apl.fire(u), L); await pubOn(p, 'Alice');
  assert.equal(docs.length, 3, 'même QR code scanné de nouveau, appli ouverte : liste rouverte sur place');
  await p.click('.pubv [data-act="close"]'); await p.waitForFunction(() => !document.querySelector('.pubv.on'), null, { timeout: 4000 });
  ok('même lien de nouveau, appli ouverte : rouvert (seul le lien de lancement n\'est pas rejoué)');

  await p.evaluate(() => { window.__mark = 7; });
  await p.evaluate(u => window.__apl.fire(u), world.url + '?p=ShareApl00000002'); await pubOn(p, 'Bob');
  assert.equal(await p.evaluate(() => window.__mark), 7, 'sur place : pas de rechargement'); assert.equal(docs.length, 3);
  assert.equal(await p.evaluate(() => location.search), '', 'adresse nettoyée comme au lancement');
  ok('appli ouverte, autre lien (« appUrlOpen ») : liste ouverte sur place, sans recharger la page');

  await p.click('.pubv [data-act="close"]'); await p.waitForFunction(() => !document.querySelector('.pubv.on'), null, { timeout: 4000 });
  for (const u of ['https://evil.example/?p=ShareApl00000001', 'javascript:alert(1)', 'pas une adresse', '']) await p.evaluate(x => window.__apl.fire(x), u);
  await sleep(1200);
  assert.equal(await p.$('.pubv.on'), null); assert.equal(docs.length, 3); assert.equal(await p.evaluate(() => window.__mark), 7);
  await p.evaluate(u => window.__apl.fire(u), world.url); await sleep(800);
  assert.equal(docs.length, 3, 'adresse déjà affichée : aucun rechargement'); assert.equal(await p.evaluate(() => window.__mark), 7);
  ok('autre origine, adresse illisible ou vide : ignorées ; adresse déjà affichée : rien à recharger');

  await p.evaluate(u => window.__apl.fire(u), world.url + '?open=trade');
  await p.waitForFunction(() => document.querySelector('.dv.coll.m-trade.on'), null, { timeout: 6000 });
  assert.equal(await p.evaluate(() => window.__mark), 7); assert.equal(docs.length, 3);
  ok('routage existant réutilisé sur place (handleLaunch) : ?open=trade ouvre l\'onglet Échange');

  await p.evaluate(u => window.__apl.fire(u), world.url + '?table=ABCDEF');
  await p.waitForFunction(() => document.querySelector('.dv.pu-join.on'), null, { timeout: 6000 });
  assert.equal(await p.evaluate(() => window.__mark), 7); assert.equal(docs.length, 3);
  await p.evaluate(() => { if (PU.joinEl) PU.joinEl.__close(); });
  ok('?table= (partie de Commander) : écran « Rejoindre la partie » sur place, sans rechargement');

  await p.evaluate(u => window.__apl.fire(u), world.url + '?inconnu=Z9');
  await p.waitForFunction(() => window.__mark !== 7, null, { timeout: 8000 }); await p.waitForFunction(() => typeof WGT_LAUNCH !== 'undefined' && WGT_LAUNCH.done, null, { timeout: 8000 }); await sleep(2000);
  assert.deepEqual(docs.slice(3), [world.url + '?inconnu=Z9'], 'paramètre que seul le démarrage lit : page chargée sur le lien, et le lien de lancement n\'est pas rejoué ensuite');
  assert.equal(await p.$('.pubv.on'), null);
  ok('paramètre inconnu : page chargée sur le lien, comme dans un navigateur');
  await ctx.close();
}
{ // appli déjà ouverte depuis l'icône, lien reçu pendant le démarrage (gardé par Capacitor jusqu'à l'écoute) : chargé comme au lancement
  const { p, ctx, docs } = await page({ ua: WEBVIEW, init: shell(''), path: '' });
  await p.waitForFunction(() => typeof WGT_LAUNCH !== 'undefined' && WGT_LAUNCH.done, null, { timeout: 8000 });
  await p.evaluate(() => localStorage.setItem('__held', location.origin + '/?p=ShareApl00000002'));
  await p.reload(); await pubOn(p, 'Bob'); await sleep(1500);
  assert.deepEqual(docs, [world.url, world.url, world.url + '?p=ShareApl00000002']);
  await ctx.close();
  ok('lien arrivé pendant le démarrage de la page : chargé une fois, comme au lancement');
}

assert.deepEqual(errsOf.flat().filter(e => !/WebAssembly|worker|closed|Target|gstatic|firebase|navigator\.vibrate/i.test(e)), []);      // vibration avant tout toucher : écran ouvert par un lien (?collection, ?open=), comme widget-e2e
await browser.close(); world.stop();
console.log('\nAPPLINK E2E OK'); process.exit(0);
