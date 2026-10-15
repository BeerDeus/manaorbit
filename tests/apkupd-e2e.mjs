// E2E « Mise à jour de l'appli » : le serveur annonce la dernière appli Android publiée (APK_LATEST → /__ping apk) ; appli simulée plus ancienne (ManaOrbit.info
// build 5, ou sans le plugin) : carte au lancement, « Mettre à jour » vers la fiche Play Store, « Plus tard » ; appli à jour, navigateur, APK_LATEST=0 : rien.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, ok } from './e2e-world.mjs';

const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const shell = build => `window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => ${build === null ? 'false' : "n === 'ManaOrbit'"}, Plugins: { ManaOrbit: { info: async () => ({ version: '1.0.' + (${build} - 1), build: ${build}, firebase: false }) } } };`;
const seen = async (world, init) => {
  const x = await newPage(browser, world, { init: (init || '') + "try { localStorage.setItem('deckdeal:onboard', '1'); } catch (e) {}" });
  await x.p.waitForFunction(() => CTX.proxy, null, { timeout: 8000 }); await x.p.waitForTimeout(3500);
  const on = !!(await x.p.$('#apkPop.on'));
  return { ...x, on };
};

let world = await startWorld({ port: 19330, env: { APK_LATEST: '6' } });
let a = await seen(world, shell(5));
assert.equal(a.on, true, 'appli 1.0.4 (build 5) : carte');
assert.match(await a.p.$eval('#apkPop', e => e.textContent), /Mise à jour de l'appli[\s\S]*QR codes et liens Mana Orbit s'ouvrent directement dans l'appli/);
assert.equal(await a.p.$eval('#apkPop [data-a="go"]', e => e.getAttribute('href')), 'https://play.google.com/store/apps/details?id=app.manaorbit');
await a.p.screenshot({ path: 'shots/apk-maj.png' });
await a.p.click('#apkPop [data-a="later"]'); await a.p.waitForFunction(() => !document.getElementById('apkPop'));
assert.deepEqual(a.errs, []); await a.ctx.close();
ok('appli plus ancienne : « Mise à jour de l\'appli » (fiche Play Store), « Plus tard »');
for (const [init, why] of [[shell(6), 'appli à jour'], [shell(7), 'appli plus récente que l\'annonce'], ['', 'navigateur']]) {
  const b = await seen(world, init); assert.equal(b.on, false, why); assert.deepEqual(b.errs, []); await b.ctx.close();
}
const c = await seen(world, shell(null)); assert.equal(c.on, true, 'appli sans le plugin ManaOrbit : très ancienne'); await c.ctx.close();
ok('à jour, plus récente ou navigateur : rien ; sans plugin : carte');
world.stop();
world = await startWorld({ port: 19331, env: { APK_LATEST: '0' } });
const d = await seen(world, shell(5)); assert.equal(d.on, false, 'APK_LATEST=0 : jamais'); await d.ctx.close();
ok('APK_LATEST=0 : jamais (valeur par défaut, 5 = 1.0.4 : test-proxy.mjs)');
await browser.close(); world.stop(); console.log('\nAPK MAJ E2E OK'); process.exit(0);
