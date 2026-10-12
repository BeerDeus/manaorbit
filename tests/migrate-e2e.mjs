// E2E déménagement card.m2s-photo.fr → manaorbit.app (proxy.mjs › oldHost, src/migrate.js). Ici l'ancienne adresse est 127.0.0.1:PORT et la nouvelle localhost:PORT :
// même serveur, deux origines (données du navigateur séparées). Page de déménagement : les données de l'appareil suivent, sans rien écraser, chemin et ?p= gardés ;
// un lien piégé (#mig= sans venir de l'ancienne adresse) ne remplit rien ; sw.js de l'ancienne adresse se désinstalle ; ancienne APK servie comme avant ; app-ads.txt.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, ok, txt } from './e2e-world.mjs';

const PORT = 18987, OLD = `127.0.0.1:${PORT}`, NEW = `http://localhost:${PORT}`;
process.env.OLD_HOSTS = OLD; process.env.SITE_URL = NEW; process.env.ADMOB_APP_ID = 'ca-app-pub-1234567890123456~9876543210';
const world = await startWorld({ port: PORT });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const WV = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36';
const get = (path, ua) => fetch(`http://${OLD}${path}`, { headers: ua ? { 'user-agent': ua } : {} });

/* ── 1) serveur : ancienne adresse ─────────────────────────────────────────────────────────────────────────── */
let r = await get('/');
assert.match(await r.text(), /<title>Mana Orbit déménage<\/title>/, 'ancienne adresse : page de déménagement');
assert.match(r.headers.get('content-security-policy') || '', /default-src 'none'/);
r = await get('/sw.js'); const sw = await r.text();
assert.match(sw, /registration\.unregister\(\)/, 'sw.js : se désinstalle'); assert.match(sw, /caches\.delete/);
r = await get('/', WV); assert.doesNotMatch(await r.text(), /<title>Mana Orbit déménage<\/title>/, 'ancienne APK (WebView) : l\'appli, comme avant');
r = await get('/sw.js', WV); assert.doesNotMatch(await r.text(), /unregister\(\)/, 'ancienne APK : son vrai service worker');
r = await get('/?mig=app', WV); assert.match(await r.text(), /<title>Mana Orbit déménage<\/title>/, 'nouvelle APK (?mig=app) : page de déménagement');
r = await get('/__mig'); assert.deepEqual(await r.json(), { ok: true }); assert.equal(r.headers.get('access-control-allow-origin'), NEW, '/__mig : lisible par le nouveau site');
r = await get('/privacy'); assert.equal(r.status, 200, 'autres pages : servies comme avant');
r = await fetch(`${NEW}/`); assert.doesNotMatch(await r.text(), /<title>Mana Orbit déménage<\/title>/, 'nouvelle adresse : l\'appli');
r = await fetch(`${NEW}/__mig`); assert.notEqual(r.status, 200, '/__mig seulement sur l\'ancienne adresse');
r = await fetch(`${NEW}/app-ads.txt`); assert.equal(await r.text(), 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n', 'app-ads.txt tiré de l\'ID d\'application');
ok('serveur : ancienne adresse → page de déménagement, sw.js qui se désinstalle, /__mig ; ancienne APK servie comme avant ; app-ads.txt');

/* ── 2) navigateur : les données suivent, chemin et ?p= gardés, rien d'écrasé ───────────────────────────────── */
const { p, errs } = await newPage(browser, world, { goto: false, init: `window.__MIG_FROM = ['${OLD}'];` });
await p.goto(`http://${OLD}/privacy`);      // l'ancienne adresse, page qui n'est pas celle du déménagement : on y pose des données
await p.evaluate(() => {
  localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: '3 Sol Ring *FR*\n1 Arcane Signet', u: 1, s: '', b: null }));
  localStorage.setItem('deckdeal:lang', 'fr'); localStorage.setItem('deckdeal:fcm', 'jeton-de-cet-appareil'); localStorage.setItem('autre-site', 'x');
  localStorage.setItem('deckdeal:onboard', 'ancien');
});
await p.goto(`${NEW}/privacy`); await p.evaluate(() => localStorage.setItem('deckdeal:onboard', 'nouveau'));      // la nouvelle adresse connaît déjà « onboard »
await p.goto(`http://${OLD}/?p=Abcdef1234567890XyZw`);
await p.waitForURL(u => u.origin === NEW && !u.hash, { timeout: 10000 });
assert.equal(new URL(p.url()).search, '?p=Abcdef1234567890XyZw', 'lien d\'échange : ?p= gardé'); assert.equal(new URL(p.url()).hash, '', 'adresse nettoyée');
const ls = await p.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k => !/^deckdeal:(migrated|v1|seen|cam|scnote)/.test(k)).map(k => [k, localStorage.getItem(k)])));
assert.match(ls['deckdeal:coll:v1'] || '', /3 Sol Ring/, 'collection reprise'); assert.equal(ls['deckdeal:onboard'], 'nouveau', 'rien d\'écrasé');
assert.equal(ls['deckdeal:fcm'], undefined, 'ce qui tient à l\'appareil reste derrière'); assert.equal(ls['autre-site'], undefined, 'seulement les données de Mana Orbit');
assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:migrated')).n >= 2), true);
await p.waitForFunction(() => /déménagé sur manaorbit\.app/.test((document.querySelector('#toast') || {}).textContent || ''), null, { timeout: 6000 });
assert.equal(await p.evaluate(() => collQty('sol ring')), 3, 'l\'appli démarre avec la collection');
ok('navigateur : ancienne adresse → nouvelle, collection et réglages repris sans rien écraser, ?p= gardé, adresse nettoyée, toast');

/* ── 3) lien piégé : #mig= sans venir de l'ancienne adresse → rien ───────────────────────────────────────────── */
const B = await newPage(browser, world, { goto: false, init: `window.__MIG_FROM = ['${OLD}'];` });
const evil = Buffer.from(JSON.stringify({ 'deckdeal:coll:v1': JSON.stringify({ t: '99 Black Lotus', u: 1, s: '', b: null }) })).toString('base64url');
await B.p.goto(`${NEW}/#mig=${evil}`); await B.p.waitForTimeout(500);
assert.equal(await B.p.evaluate(() => localStorage.getItem('deckdeal:migrated')), null, 'rien de repris');
assert.doesNotMatch(await B.p.evaluate(() => localStorage.getItem('deckdeal:coll:v1') || ''), /Black Lotus/); assert.equal(new URL(B.p.url()).hash, '', 'adresse nettoyée quand même');
ok('lien piégé (#mig= venu d\'ailleurs) : rien de repris');

assert.deepEqual([...errs, ...B.errs], [], 'erreurs page');
await browser.close(); world.stop();
console.log('\nMIGRATE E2E OK');
