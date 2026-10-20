// E2E notification « nouvelle Carte mystère » (port 19712) : vrai proxy.mjs (faux Scryfall de la Carte mystère, faux compte de service : jetons Firebase,
// OAuth2, FCM : amis-fakes.mjs), appli Android simulée (plugin PushNotifications). Compte connecté, notifications pas encore activées : Réglages › Notifications ›
// « Nouvelle Carte mystère » coupé, rien d'enregistré ; « Prévenir quand la recherche est finie » activé → appareil enregistré d'office (jeton FCM, langue) et
// interrupteur allumé ; coupé → retiré du serveur (l'abonnement reste pour la fin de recherche) ; rallumé ; tout coupé → plus d'abonnement (unregister).
// Notification touchée (./?mystere=1) → « Participer ? » ; reçue appli ouverte → toast « Jouer » (jamais en mode streamer) ; notifications bloquées dans
// Android → retiré ; déconnexion → retiré ; appli lancée par le toucher, déconnectée → « Connecte-toi pour jouer ». L'envoi lui-même : test-daily.mjs.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, startWorld, newPage, ok, signInFake, openMe, closeSheets } from './e2e-world.mjs';
import { startFakes, tag } from './amis-fakes.mjs';
import { SERRA } from './daily-fakes.mjs';

const F = await startFakes(), DIR = process.env.DAILY_DIR;      // dossier temporaire de setup-env.mjs, lu par le proxy du monde
// rattrapage nul (DAILY_PUSH_WINDOW_MS=0) : le serveur n'envoie rien pendant le test, seuls l'enregistrement et l'appli sont vérifiés ici
const world = await startWorld({ port: 19712, daily: { cards: [SERRA] }, env: { ...F.env, DAILY_MIN_AGE_DAYS: '0', DAILY_PUSH_WINDOW_MS: '0' } });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
process.on('exit', () => { try { world.stop(); F.stop(); } catch { /* ignore */ } });
for (let i = 0; i < 200; i++) { try { const j = await (await fetch(world.url + 'api/daily')).json(); if (j.st === 'ready') break; } catch { /* serveur pas encore là */ } await new Promise(r => setTimeout(r, 200)); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { for (let t = 0; t < ms && !(await fn()); t += 100) await sleep(100); return fn(); };
const UID = 'uid-mia-e2e', TOK = 'eM1:APA91b' + 'm'.repeat(120), KEY = createHash('sha1').update('fcm:' + TOK).digest('hex').slice(0, 24);
/** Appareils enregistrés sur le serveur (DAILY_DIR/push.json, écrit 1,5 s après un changement). */
const devs = () => { try { return JSON.parse(readFileSync(join(DIR, 'push.json'), 'utf8')).d; } catch { return {}; } };
const onSrv = () => until(() => !!devs()[KEY]), offSrv = () => until(() => !devs()[KEY]);

// ── coque Android simulée : plugin PushNotifications ; permission et toucher « au lancement » gardés dans localStorage (survivent au rechargement)
const shell = tok => {
  const g = k => { try { return JSON.parse(localStorage.getItem('__t_' + k)); } catch (e) { return null; } }, s = (k, v) => localStorage.setItem('__t_' + k, JSON.stringify(v));
  const L = {}, held = {}, calls = [];
  const fire = (ev, data) => { if (L[ev] && L[ev].length) L[ev].forEach(f => f(data)); else (held[ev] = held[ev] || []).push(data); };
  window.__pn = { calls, fire };
  const launch = g('launch'); if (launch) { s('launch', null); fire('pushNotificationActionPerformed', { actionId: 'tap', notification: { id: 'm0', data: { url: launch } } }); }
  window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => n === 'PushNotifications', Plugins: { PushNotifications: {
    checkPermissions: async () => ({ receive: g('perm') || 'prompt' }), requestPermissions: async () => { if (g('perm') !== 'denied') s('perm', 'granted'); return { receive: g('perm') }; },
    register: async () => { calls.push('register'); setTimeout(() => fire('registration', { value: tok }), 50); }, unregister: async () => { calls.push('unregister'); },
    addListener: async (ev, fn) => { (L[ev] = L[ev] || []).push(fn); for (const d of (held[ev] || []).splice(0)) setTimeout(() => fn(d), 0); return { remove: async () => {} }; },
  } } };
};
const { p, errs } = await newPage(browser, world, { goto: false, init: `(${shell})(${JSON.stringify(TOK)})`, ctx: { timezoneId: 'Europe/Paris' } });
await p.route('https://www.gstatic.com/**', r => r.abort());      // SDK Firebase injoignable : compte simulé (signInFake)
const reqs = []; p.on('request', r => { if (/\/api\/daily\/push$/.test(r.url())) { let b = null; try { b = JSON.parse(r.postData() || 'null'); } catch { /* ignore */ } reqs.push(b); } });
await p.goto(world.url); await p.waitForTimeout(600);
await p.evaluate(t => { window.__idTok = t; }, F.jwt(UID, 3 * 3600)); await signInFake(p, { uid: UID, email: UID + '@test.dev' });
await p.waitForFunction(() => CTX.daily === true && CTX.fcm === true && DY.st && DY.st.push === true, null, { timeout: 10000 });
const tc = sel => p.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim());
const calls = () => p.evaluate(() => window.__pn.calls.slice());
const sw = id => p.$eval('#' + id, c => c.checked);
const flip = async id => { await p.click(`label[for="${id}"] .switch`); await p.waitForFunction(i => !document.getElementById(i).disabled, id, { timeout: 8000 }); };
const openSet = async () => { await closeSheets(p).catch(() => {}); await openMe(p); await p.click('#btnNotif'); await p.waitForSelector('.sheet-wrap.open #dlyPushBox #dlyPushSw', { timeout: 8000 }); await p.waitForSelector('#pushBox #setPush', { timeout: 5000 }); };

/* ── Notifications pas encore activées : interrupteur coupé, rien d'enregistré ─────────────────────────────────────────── */
await openSet();
assert.equal(await sw('dlyPushSw'), false); assert.match(await tc('#dlyPushBox'), /^Nouvelle Carte mystère\s*Chaque jour à 18:00, dès que la carte du jour est là : devine-la avant les autres\.$/);
assert.deepEqual(await p.$$eval('.sheet-wrap.open .sec-title', l => l.map(x => x.textContent)), ['Fin de recherche', 'Alertes de prix', 'Amis', 'Carte mystère'], 'rubrique à côté des autres notifications');
assert.equal(reqs.length, 0, 'notifications coupées sur l\'appareil : rien d\'enregistré');
ok('Réglages › Notifications : rubrique « Carte mystère », « Nouvelle Carte mystère » coupé tant que les notifications ne sont pas autorisées');

/* ── Activée d'office là où les notifications le sont ─────────────────────────────────────────────────────────────────── */
await flip('setPush'); assert.equal(await sw('setPush'), true);
assert.ok(await until(() => reqs.some(b => b && b.sub && b.sub.fcm === TOK && b.l === 'fr')), 'appareil enregistré (jeton FCM, langue de l\'appli)');
assert.ok(await onSrv(), 'enregistré sur le serveur'); assert.equal(devs()[KEY].t, tag(UID), 'pour ce compte (empreinte)'); assert.equal(devs()[KEY].l, 'fr');
await openSet(); assert.equal(await sw('dlyPushSw'), true, 'interrupteur allumé');
await p.$eval('#dlyPushBox', e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(400); await p.screenshot({ path: 'shots/daily-push-reglages.png' });
ok('« Prévenir quand la recherche est finie » activé : appareil enregistré d\'office pour la nouvelle Carte mystère (POST /api/daily/push), interrupteur allumé');

/* ── Coupée : retirée du serveur ; l'abonnement reste pour la fin de recherche ─────────────────────────────────────────── */
await flip('dlyPushSw'); assert.equal(await sw('dlyPushSw'), false);
assert.ok(await offSrv(), 'retiré du serveur'); assert.ok(reqs.some(b => b && b.off === KEY));
assert.ok(!(await calls()).includes('unregister'), 'abonnement gardé (fin de recherche)');
const n0 = reqs.length; await p.evaluate(() => dlyStatus(true)); await sleep(2500); assert.equal(reqs.length, n0, 'coupée : jamais réenregistrée d\'elle-même');
await openSet(); assert.equal(await sw('dlyPushSw'), false, 'reste coupée');
await flip('dlyPushSw'); assert.equal(await sw('dlyPushSw'), true); assert.match(await tc('#toast'), /Tu seras prévenu de la nouvelle Carte mystère/);
assert.ok(await onSrv(), 'rallumée : de nouveau enregistrée');
ok('« Nouvelle Carte mystère » coupée : appareil retiré du serveur, abonnement gardé pour les autres notifications ; rallumée : réenregistré');

/* ── Tout coupé : plus d'abonnement (la Carte mystère le garde tant qu'elle est allumée) ─────────────────────────────────── */
await flip('setPush'); assert.ok(!(await calls()).includes('unregister'), 'fin de recherche coupée : la Carte mystère garde l\'abonnement');
await flip('dlyPushSw'); assert.ok(await offSrv()); assert.ok(!(await calls()).includes('unregister'), 'les amis le gardent encore');
await flip('amPushSw'); assert.ok(await until(async () => (await calls()).includes('unregister')), 'plus rien ne s\'en sert : désinscrit');
await flip('dlyPushSw'); assert.equal(await sw('dlyPushSw'), true); assert.ok(await onSrv(), 'rallumée seule : autorisation, jeton, enregistrée');
await closeSheets(p);
ok('tout coupé : désinscrit (unregister) ; la Carte mystère garde l\'abonnement tant qu\'elle est allumée, et se rallume seule');

/* ── Notification touchée, reçue appli ouverte, mode streamer ─────────────────────────────────────────────────────────── */
const ask = () => p.waitForFunction(() => { const s = document.querySelector('.dly-ask.open'); return s && /Participer à la Carte mystère du jour \?/.test(s.textContent); }, null, { timeout: 8000 });
await p.evaluate(() => window.__pn.fire('pushNotificationActionPerformed', { actionId: 'tap', notification: { id: 'm1', data: { url: './?mystere=1' } } }));
await ask(); await closeSheets(p);
ok('notification touchée (./?mystere=1, pushOpen) : « Participer à la Carte mystère du jour ? »');
const recv = () => p.evaluate(() => window.__pn.fire('pushNotificationReceived', { id: 'm2', title: 'La Carte mystère du jour est là', body: 'Devine-la avant les autres.', data: { url: './?mystere=1' } }));
await recv();
await p.waitForFunction(() => /^La Carte mystère du jour est là · Devine-la avant les autres\.\s*Jouer$/.test(document.querySelector('#toast').textContent.trim()) && document.querySelector('#toast .toast-act'), null, { timeout: 6000 });
await p.click('#toast .toast-act'); await ask(); await closeSheets(p);
ok('reçue appli ouverte : toast « La Carte mystère du jour est là · Devine-la avant les autres. » avec « Jouer » → « Participer ? »');
await p.evaluate(() => { window.__so = window.streamOn; window.streamOn = () => true; document.querySelector('#toast').textContent = ''; });
await recv(); await sleep(1500); assert.doesNotMatch(await tc('#toast'), /Carte mystère/, 'mode streamer : aucun toast');
await p.evaluate(() => { window.streamOn = window.__so; });
ok('mode streamer : notification reçue appli ouverte, rien à l\'écran');

/* ── Notifications bloquées dans Android : retirée ; déconnexion : retirée ─────────────────────────────────────────────── */
await p.evaluate(() => localStorage.setItem('__t_perm', '"denied"')); await p.evaluate(() => dlyDev()); assert.ok(await offSrv(), 'bloquées : retirée du serveur');
await p.evaluate(() => localStorage.setItem('__t_perm', '"granted"')); await p.evaluate(() => dlyDev()); assert.ok(await onSrv(), 'autorisées de nouveau : réenregistrée (interrupteur resté allumé)');
await p.evaluate(() => meSignOut()); assert.ok(await offSrv(), 'déconnexion : retirée'); assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:daily:push')).dev), undefined);
ok('notifications bloquées dans Android : appareil retiré ; déconnexion : retiré du compte');

/* ── Appli lancée par le toucher, sans compte : se connecter pour jouer ───────────────────────────────────────────────── */
await p.evaluate(() => localStorage.setItem('__t_launch', JSON.stringify('./?mystere=1'))); await p.reload();
await p.waitForFunction(() => [...document.querySelectorAll('.sheet-wrap.open')].some(s => /Connecte-toi pour jouer/.test(s.textContent)), null, { timeout: 12000 });
ok('appli lancée par le toucher (évènement gardé jusqu\'à l\'écoute), déconnectée : « Connecte-toi pour jouer »');

assert.deepEqual(errs.filter(e => !/WebAssembly|worker|closed|Target/i.test(e)), [], 'aucune erreur dans la console');
await browser.close(); world.stop(); F.stop();
console.log('\nDAILY PUSH E2E OK'); process.exit(0);
