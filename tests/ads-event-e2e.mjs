// E2E pub pendant une fête (appli Android simulée comme ads-e2e : faux window.Capacitor + faux plugin AdMob ; Halloween forcé : EVENT_FORCE=halloween-2026, port 18951) :
// bandeau SOUS L'EN-TÊTE, la vue native couvre la page de l'en-tête à --ad-bot (css/ads.css). Rien de la fête n'y reste caché :
// · objets cachés (event.js › evFind) : jamais posés dans la bande du bandeau, même quand un bloc de l'accueil défile dessous (avant : posés là, invisibles) ;
// · ambiance du haut de l'écran (.ev-amb : lune, toile… sous l'en-tête) descendue de la place du bandeau (avant : la lune et la toile cachées) ;
// · compteur « 12 / 30 » (.ev-cnt) posé sous la zone du bandeau ; célébration plein écran (AD_FULL) : bandeau masqué ;
// sans bandeau (compte autorisé) : tout revient à sa place d'origine.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, ok } from './e2e-world.mjs';

const world = await startWorld({ port: 18951, env: { EVENT: '1', EVENT_FORCE: 'halloween-2026', EVENT_SECRET: 'e2e' } });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const H = 61;

/** Faux plugin AdMob (le même qu'ads-e2e, réduit) : chargé → hauteur H, masqué / détruit → 0. */
function fakeNative() {
  const L = {}, emit = (ev, d) => (L[ev] || []).forEach(f => f(d)); let banner = false, visible = false;
  const log = window.__ad = { calls: [] };
  const AdMob = {
    addListener: (ev, f) => { (L[ev] = L[ev] || []).push(f); return { remove: async () => {} }; },
    requestConsentInfo: async () => ({ status: 'NOT_REQUIRED', isConsentFormAvailable: false, canRequestAds: true }), showConsentForm: async () => ({}), initialize: async () => {},
    showBanner: async a => { log.calls.push('showBanner'); log.last = a; banner = visible = true; setTimeout(() => { if (banner && visible) emit('bannerAdSizeChanged', { width: 390, height: 61 }); }, 80); },
    hideBanner: async () => { log.calls.push('hideBanner'); visible = false; emit('bannerAdSizeChanged', { width: 0, height: 0 }); },
    resumeBanner: async () => { log.calls.push('resumeBanner'); if (banner) { visible = true; emit('bannerAdSizeChanged', { width: 390, height: 61 }); } },
    removeBanner: async () => { log.calls.push('removeBanner'); if (banner) { banner = visible = false; setTimeout(() => emit('bannerAdSizeChanged', { width: 0, height: 0 }), 0); } },
  };
  const Plugins = { AdMob };
  window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => n in Plugins, Plugins };
}
const adOn = p => p.evaluate(() => document.documentElement.classList.contains('ad-on'));

const { p, errs, ctx } = await newPage(browser, world, { goto: false, ctx: { viewport: { width: 393, height: 852 } } });
await p.route('https://www.gstatic.com/**', r => r.abort());
await p.addInitScript(fakeNative);
await p.goto(world.url + '?event');
await p.waitForFunction(() => typeof EV !== 'undefined' && EV.st && EV.st.me, null, { timeout: 15000 });
await p.waitForSelector('.ev-intro.on', { timeout: 8000 }); await p.click('.ev-in-go'); await p.waitForFunction(() => !document.querySelector('.ev-intro'));
await p.evaluate(() => { collAdd(Array.from({ length: 12 }, (_, i) => ({ k: 'carte ' + i, n: 'Carte ' + i, q: 1 + (i % 3) })), 'add'); Object.assign(AD, { grace: 0, offMs: 0, delay: 200, back: 100, idle: 0 }); adsRefresh(); });
await p.waitForFunction(() => document.documentElement.classList.contains('ad-on'), null, { timeout: 10000 });
const band = await p.evaluate(() => [document.querySelector('.bar').getBoundingClientRect().bottom, adsBot()]);
assert.deepEqual(band, [63, 63 + H + 20], 'bande du bandeau : du bas de l\'en-tête à --ad-bot');

// ambiance : la lune (sous l'en-tête d'ordinaire) descend sous la bande du bandeau
const moon = () => p.evaluate(() => { const a = document.querySelector('body > .ev-amb'), m = a && a.querySelector('.eva-moon'); return a ? [Math.round(a.getBoundingClientRect().top), Math.round(m.getBoundingClientRect().top)] : null; });
assert.deepEqual(await moon(), [H + 20, H + 20 + 56], 'ambiance descendue de la place du bandeau (lune sous la bande, plus cachée)');
ok('bandeau pendant la fête : ambiance du haut (lune, toile) descendue sous la bande du bandeau');

// objets cachés : les 5 cachettes du jour posées sur les blocs de l'accueil, page défilée pas à pas (blocs à cheval sur la bande) ; à chaque pose, l'objet est hors de la bande
const placed = await p.evaluate(async b => {
  const bl = [...document.querySelectorAll('#viewHome > *')].filter(e => e.offsetHeight > 60), out = [], seen = new Set();
  EV.st.me.spots.forEach((x, i) => { EV_HIDE[x.s] = () => bl[i % bl.length]; });
  for (let y = 0; y <= document.documentElement.scrollHeight; y += 70) {
    scrollTo({ top: y, behavior: 'instant' }); await new Promise(r => setTimeout(r, 60)); evScan(); await new Promise(r => setTimeout(r, 60)); evScan();
    for (const [s, x] of EV.pks) if (x.ok && !seen.has(s)) { seen.add(s); const r = x.el.getBoundingClientRect(); out.push({ s, y, top: Math.round(r.top), bottom: Math.round(r.bottom), inBand: r.bottom > b[0] && r.top < b[1] }); }
    for (const [s, x] of EV.pks) if (x.ok) { evUnmount(s); seen.delete(s); }      // reposé au pas suivant : chaque position de défilement est essayée
  }
  return out;
}, band);
assert.ok(placed.length >= 20, 'objets posés à de nombreuses positions de défilement : ' + placed.length);
assert.deepEqual(placed.filter(x => x.inBand), [], 'aucun objet posé sous la vue native du bandeau');
ok('objets cachés : jamais posés dans la bande du bandeau (' + placed.length + ' poses, accueil défilé pas à pas)');

// compteur flottant : sous la zone du bandeau ; célébration plein écran : bandeau masqué puis rétabli
await p.evaluate(() => { scrollTo({ top: 0, behavior: 'instant' }); evCounterEl(12, 30).bump(); }); await p.waitForTimeout(700);
const cnt = await p.$eval('.ev-cnt', e => { const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; });
assert.equal(cnt[0], 63 + H + 20 + 12, 'compteur « 12 / 30 » sous la zone du bandeau');
await p.evaluate(() => evParty()); await p.waitForFunction(() => !document.documentElement.classList.contains('ad-on'), null, { timeout: 5000 });
assert.ok(await p.evaluate(() => window.__ad.calls.includes('hideBanner')), 'célébration : bandeau masqué');
await p.evaluate(() => document.querySelector('.ev-party [data-ev="close"]').click()); await p.waitForFunction(() => document.documentElement.classList.contains('ad-on'), null, { timeout: 8000 });
ok('compteur sous la zone du bandeau ; célébration plein écran : bandeau masqué puis rétabli');

// sans bandeau : places d'origine
await p.evaluate(() => { CTX.serverOk = true; adsRefresh(); }); await p.waitForFunction(() => !document.documentElement.classList.contains('ad-on'), null, { timeout: 5000 });
assert.equal(await adOn(p), false);
assert.deepEqual(await moon(), [0, 56], 'sans bandeau : ambiance en haut, lune sous l\'en-tête');
await p.evaluate(() => evCounterEl(13, 30).bump()); await p.waitForTimeout(400);
assert.equal(await p.$eval('.ev-cnt', e => Math.round(e.getBoundingClientRect().top)), 74, 'sans bandeau : compteur à sa place d\'origine');
assert.equal(await p.evaluate(() => evAdBand()), null, 'sans bandeau : aucune bande réservée');
assert.deepEqual(errs, []); await ctx.close();
ok('sans bandeau : ambiance, compteur et objets à leur place d\'origine');

await browser.close(); world.stop(); console.log('\nADS EVENT E2E OK'); process.exit(0);
