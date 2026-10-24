// E2E notifications des événements (port 19883) : vrai proxy.mjs (EVENT_FORCE=halloween-2026, EVENT_PUSH=1, faux compte de service : jetons Firebase, OAuth2,
// FCM : amis-fakes.mjs ; Carte mystère allumée avec son faux Scryfall), appli Android simulée (plugin PushNotifications). Premier lancement : après « Sauvegarde
// ta collection », l'étape « Ne rate aucune fête » (exemple de l'annonce de la fête en cours, Carte mystère, 4 points) ; « Activer les notifications » → fenêtre
// native (requestPermissions), jeton FCM, appareil enregistré SANS compte (jeton d'appareil des événements), « Notifications activées » ; jamais redemandé.
// Notifications bloquées dans Android : pas d'étape (3 points). Navigateur : Notification.requestPermission (refus : un mot, l'appli) ; iPhone hors app installée :
// pas d'étape. Réglages › Notifications › « Événements » allumé d'office, coupé → retiré du serveur (et désinscrit si plus rien ne s'en sert), rallumé.
// Notification touchée (./?fete=1) → l'accueil et la feuille de la fête ; reçue appli ouverte → toast « Voir » ; appli lancée par le toucher → la feuille ;
// connexion → l'appareil suit le compte. Captures (393 × 852, clair et sombre) dans shots/push/ (non committées).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, startWorld, newPage, ok, signInFake, openMe, closeSheets } from './e2e-world.mjs';
import { startFakes, tag } from './amis-fakes.mjs';
import { SERRA } from './daily-fakes.mjs';

const F = await startFakes(), DIR = process.env.EVENT_DIR, SHOTS = 'shots/push'; mkdirSync(SHOTS, { recursive: true });
const world = await startWorld({ port: 19883, daily: { cards: [SERRA] }, env: { ...F.env, EVENT: '1', EVENT_FORCE: 'halloween-2026', EVENT_PUSH: '1', EVENT_PUSH_FIRST_MS: '600000', DAILY_MIN_AGE_DAYS: '0', DAILY_PUSH_WINDOW_MS: '0' } });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
process.on('exit', () => { try { world.stop(); F.stop(); } catch { /* ignore */ } });
for (let i = 0; i < 100; i++) { try { if ((await (await fetch(world.url + '__ping')).json()).evpush) break; } catch { /* serveur pas encore là */ } await new Promise(r => setTimeout(r, 200)); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { for (let t = 0; t < ms && !(await fn()); t += 100) await sleep(100); return fn(); };
const TOK = 'eE1:APA91b' + 'e'.repeat(120), KEY = createHash('sha1').update('fcm:' + TOK).digest('hex').slice(0, 24), UID = 'uid-eva-e2e';
/** Appareils enregistrés sur le serveur (EVENT_DIR/push.json, écrit 1,5 s après un changement). */
const devs = () => { try { return JSON.parse(readFileSync(join(DIR, 'push.json'), 'utf8')).d; } catch { return {}; } };
const onSrv = () => until(() => !!devs()[KEY]), offSrv = () => until(() => !devs()[KEY]);

// ── coque Android simulée : plugin PushNotifications ; permission (« prompt » d'abord) et toucher « au lancement » gardés dans localStorage
const shell = ([tok, perm0]) => {
  const g = k => { try { return JSON.parse(localStorage.getItem('__t_' + k)); } catch (e) { return null; } }, s = (k, v) => localStorage.setItem('__t_' + k, JSON.stringify(v));
  if (perm0 && !g('perm')) s('perm', perm0);
  const L = {}, held = {}, calls = [];
  const fire = (ev, data) => { if (L[ev] && L[ev].length) L[ev].forEach(f => f(data)); else (held[ev] = held[ev] || []).push(data); };
  window.__pn = { calls, fire };
  const launch = g('launch'); if (launch) { s('launch', null); fire('pushNotificationActionPerformed', { actionId: 'tap', notification: { id: 'e0', data: { url: launch } } }); }
  window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => n === 'PushNotifications', Plugins: { PushNotifications: {
    checkPermissions: async () => ({ receive: g('perm') || 'prompt' }), requestPermissions: async () => { calls.push('ask'); if (g('perm') !== 'denied') s('perm', 'granted'); return { receive: g('perm') }; },
    register: async () => { calls.push('register'); setTimeout(() => fire('registration', { value: tok }), 50); }, unregister: async () => { calls.push('unregister'); },
    addListener: async (ev, fn) => { (L[ev] = L[ev] || []).push(fn); for (const d of (held[ev] || []).splice(0)) setTimeout(() => fn(d), 0); return { remove: async () => {} }; },
  } } };
};
const VP = { viewport: { width: 393, height: 852 }, timezoneId: 'Europe/Paris' };
const tc = (p, sel) => p.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim());
/** Premier lancement sur un appareil vierge (?onboarding : les navigateurs pilotés ne le voient pas sinon). */
async function fresh(o = {}) {
  const S = await newPage(browser, world, { goto: false, init: o.init, ctx: { ...VP, colorScheme: o.dark ? 'dark' : 'light' } });
  await S.p.route('https://www.gstatic.com/**', r => r.abort());      // SDK Firebase injoignable : « Sauvegarde ta collection » propose « Plus tard »
  S.reqs = []; S.p.on('request', r => { if (/\/api\/event\/push$/.test(r.url())) { let b = null; try { b = JSON.parse(r.postData() || 'null'); } catch { /* ignore */ } S.reqs.push({ b, dev: r.headers()['x-event-device'] || '', tok: r.headers()['x-firebase-token'] || '' }); } });
  if (o.before) await o.before(S.p);
  await S.p.goto(world.url + '?onboarding'); await S.p.waitForSelector('.ob.on', { timeout: 10000 });
  return S;
}
/** Étapes 1 → 3 → « Plus tard » (ou « C'est parti ») de « Sauvegarde ta collection ». */
async function toStep4(p) {
  await p.click('.ob-s:nth-child(1) [data-ob="next"]'); await p.waitForTimeout(450);
  await p.click('.ob-s:nth-child(2) [data-ob="next"]'); await p.waitForTimeout(450);
  await p.waitForSelector('#obSave [data-ob="done"]'); await p.click('#obSave [data-ob="done"]'); await p.waitForTimeout(800);
}

/* ── Appli Android : l'étape « Notifications » du premier lancement ───────────────────────────────────────────────────── */
const A = await fresh({ init: `(${shell})(${JSON.stringify([TOK, ''])})` }), p = A.p;
await p.waitForSelector('.ob .ob-push', { state: 'attached', timeout: 10000 });
assert.equal(await p.$$eval('.ob-dots i', l => l.length), 4, '4 points : l\'étape des notifications s\'ajoute');
assert.deepEqual(await p.evaluate(() => window.__pn.calls.slice()), [], 'rien demandé avant l\'étape');
await toStep4(p);
assert.equal(await p.evaluate(() => OB.i), 3, '« Plus tard » de l\'étape 3 : les notifications'); assert.equal(await p.$eval('.ob-skip', b => b.hidden), true, 'pas de « Passer » : « Plus tard »');
assert.equal(await tc(p, '.ob-push h2'), 'Ne rate aucune fête');
assert.equal(await tc(p, '.ob-push > p'), 'Active les notifications : on te prévient quand un événement commence, avant qu\'il se termine, et quand la nouvelle Carte mystère est là.');
assert.deepEqual(await p.$$eval('.ob-push .ob-nc b', l => l.map(x => x.textContent)), ['🎃 La chasse aux citrouilles est ouverte !', 'La Carte mystère du jour est là'], 'exemples : l\'annonce de la fête en cours, la Carte mystère');
assert.equal(await tc(p, '.ob-push .ob-nc.a .ob-nc-t > span'), '30 citrouilles se cachent dans l\'appli jusqu\'au 8 novembre, 5 par jour. À toi de jouer !');
assert.deepEqual(await p.$$eval('.ob-push .ob-acts button', l => l.map(x => x.textContent.trim())), ['Activer les notifications', 'Plus tard']);
assert.equal(await tc(p, '.ob-push .ob-np-h'), 'Jamais la nuit. Tu changes d\'avis quand tu veux dans Compte et réglages › Notifications.');
assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.dataset.ob), 'push', 'le bouton prend le focus');
const r4 = await p.$eval('.ob-push', s => { const a = s.getBoundingClientRect(), b = s.querySelector('[data-ob="done"]').getBoundingClientRect(); return { L: a.left, R: a.right, bb: b.bottom, sh: s.scrollHeight, ch: s.clientHeight }; });
assert.ok(r4.L >= 0 && r4.R <= 393 && r4.sh <= r4.ch + 1, 'étape entière à 393 × 852, sans défilement : ' + JSON.stringify(r4));
await p.waitForTimeout(900); await p.screenshot({ path: SHOTS + '/onboarding-notifications-clair.png' });
ok('premier lancement (appli Android) : après « Sauvegarde ta collection », l\'étape « Ne rate aucune fête » (annonce de la fête en cours, Carte mystère, 4 points, focus sur « Activer »)');

await p.click('.ob-push [data-ob="push"]');
await p.waitForFunction(() => !document.querySelector('.ob'), null, { timeout: 8000 });
assert.deepEqual((await p.evaluate(() => window.__pn.calls.slice())).slice(0, 2), ['ask', 'register'], 'fenêtre native (requestPermissions), puis le jeton FCM');
await p.waitForFunction(() => /Notifications activées/.test(document.querySelector('#toast').textContent), null, { timeout: 5000 });
assert.ok(await until(() => A.reqs.some(x => x.b && x.b.sub && x.b.sub.fcm === TOK && x.b.l === 'fr' && x.dev && !x.tok)), 'enregistré sans compte, avec le jeton d\'appareil des événements');
assert.ok(await onSrv(), 'enregistré sur le serveur'); assert.equal(devs()[KEY].t, '', 'sans compte'); assert.ok(devs()[KEY].dv, 'son appareil'); assert.equal(devs()[KEY].l, 'fr');
assert.ok(await p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:ev:push')).asked > 0), 'demandé : jamais redemandé');
ok('« Activer les notifications » : fenêtre native, jeton FCM, appareil enregistré sans compte (x-event-device), « Notifications activées »');

/* ── Réglages › Notifications › « Événements » ───────────────────────────────────────────────────────────────────────── */
const sw = () => p.$eval('#evpSw', c => c.checked);
const flip = async () => { await p.click('label[for="evpSw"] .switch'); await p.waitForFunction(() => !document.getElementById('evpSw').disabled, null, { timeout: 8000 }); };
const openSet = async () => { await closeSheets(p).catch(() => {}); await openMe(p); await p.click('#btnNotif'); await p.waitForSelector('.sheet-wrap.open #evpBox #evpSw', { timeout: 8000 }); };
await openSet();
assert.deepEqual(await p.$$eval('.sheet-wrap.open .sec-title', l => l.map(x => x.textContent)), ['Fin de recherche', 'Alertes de prix', 'Carte mystère', 'Événements'], 'rubrique « Événements », après la Carte mystère');
assert.equal(await sw(), true, 'allumé d\'office'); assert.match(await tc(p, '#evpBox'), /^Annonces des fêtes ?Le début d'une fête \(comme la chasse aux citrouilles d'Halloween\), un rappel à mi-parcours et le dernier jour : une notification par jour au plus, vers 10 h\.$/);
await p.$eval('#evpBox', e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(400); await p.screenshot({ path: SHOTS + '/reglages-evenements-clair.png' });
await flip(); assert.equal(await sw(), false); assert.ok(await offSrv(), 'coupé : retiré du serveur');
assert.ok(A.reqs.some(x => x.b && x.b.off === KEY)); assert.ok(await until(async () => (await p.evaluate(() => window.__pn.calls)).includes('unregister')), 'plus rien ne s\'en sert : désinscrit');
const n0 = A.reqs.length; await p.evaluate(() => evpDev()); await sleep(800); assert.equal(A.reqs.length, n0, 'coupé : jamais réenregistré de lui-même');
await openSet(); assert.equal(await sw(), false, 'reste coupé');
await flip(); assert.equal(await sw(), true); assert.match(await tc(p, '#toast'), /Tu seras prévenu des événements/); assert.ok(await onSrv(), 'rallumé : de nouveau enregistré');
await closeSheets(p);
ok('Réglages › Notifications : « Événements » allumé d\'office ; coupé → retiré du serveur et désinscrit ; rallumé → autorisation, jeton, enregistré');

/* ── Notification touchée, reçue appli ouverte, appli lancée par le toucher ───────────────────────────────────────────── */
const sheet = () => p.waitForFunction(() => { const s = document.querySelector('.sheet-wrap.open.ev-sheet'); return s && /Chasse aux citrouilles 2026/.test(s.textContent) && S.view === 'home'; }, null, { timeout: 10000 });
await p.evaluate(() => openCollection()); await p.waitForTimeout(500);
await p.evaluate(() => window.__pn.fire('pushNotificationActionPerformed', { actionId: 'tap', notification: { id: 'e1', data: { url: './?fete=1' } } }));
await sheet(); assert.equal(await p.evaluate(() => !!(COLL.el && COLL.el.isConnected && COLL.el.classList.contains('on'))), false, 'la collection se referme : l\'accueil');
await closeSheets(p);
ok('notification touchée (./?fete=1, pushOpen) : l\'accueil et la feuille de la chasse aux citrouilles');
await p.evaluate(() => window.__pn.fire('pushNotificationReceived', { id: 'e2', title: '🕸️ Plus que 8 jours de chasse', body: 'Mi-parcours de la chasse aux citrouilles : 5 nouvelles cachettes t\'attendent chaque jour.', data: { url: './?fete=1' } }));
await p.waitForFunction(() => /^🕸️ Plus que 8 jours de chasse · Mi-parcours/.test(document.querySelector('#toast').textContent.trim()) && document.querySelector('#toast .toast-act'), null, { timeout: 6000 });
await p.click('#toast .toast-act'); await sheet(); await closeSheets(p);
ok('reçue appli ouverte : toast avec « Voir » → la feuille de la fête');
await p.evaluate(() => localStorage.setItem('__t_launch', JSON.stringify('./?fete=1'))); await p.reload(); await sheet(); await closeSheets(p);
ok('appli lancée par le toucher (évènement gardé jusqu\'à l\'écoute) : la feuille de la fête');

/* ── Connexion : l'appareil suit le compte ─────────────────────────────────────────────────────────────────────────── */
await p.evaluate(t => { window.__idTok = t; }, F.jwt(UID, 3 * 3600)); await signInFake(p, { uid: UID, email: UID + '@test.dev' });
assert.ok(await until(() => devs()[KEY] && devs()[KEY].t === tag(UID), 10000), 'compte connecté : enregistré pour ce compte (empreinte)');
assert.ok(A.reqs.some(x => x.b && x.b.sub && x.tok), 'avec son jeton Firebase');
ok('connexion : l\'appareil enregistré suit le compte (empreinte), sans rien redemander');
assert.deepEqual(A.errs.filter(e => !/WebAssembly|worker|closed|Target|gstatic/i.test(e)), [], 'aucune erreur dans la console');
await A.ctx.close();

/* ── Sombre (captures), notifications bloquées dans Android, navigateur, iPhone ─────────────────────────────────────────── */
{ const B = await fresh({ dark: true, init: `(${shell})(${JSON.stringify([TOK + 'b', ''])})` });
  await B.p.waitForSelector('.ob .ob-push', { state: 'attached', timeout: 10000 }); await toStep4(B.p); await B.p.waitForTimeout(900);
  await B.p.screenshot({ path: SHOTS + '/onboarding-notifications-sombre.png' });
  await B.p.click('.ob-push [data-ob="done"]'); await B.p.waitForFunction(() => !document.querySelector('.ob'), null, { timeout: 5000 });
  assert.deepEqual(await B.p.evaluate(() => window.__pn.calls.slice()), [], '« Plus tard » : rien demandé'); assert.ok(await B.p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:ev:push')).asked > 0), 'ni redemandé');
  await B.p.evaluate(() => { localStorage.setItem('__t_perm', '"granted"'); }); await openMe(B.p); await B.p.click('#btnNotif'); await B.p.waitForSelector('.sheet-wrap.open #evpBox #evpSw', { timeout: 8000 });
  await B.p.click('label[for="evpSw"] .switch'); await B.p.waitForFunction(() => document.getElementById('evpSw').checked && !document.getElementById('evpSw').disabled, null, { timeout: 8000 });
  await B.p.$eval('#evpBox', e => e.scrollIntoView({ block: 'center' })); await B.p.waitForTimeout(3600); await B.p.screenshot({ path: SHOTS + '/reglages-evenements-sombre.png' });      // 3,6 s : le toast « Tu seras prévenu… » est reparti
  await B.ctx.close(); }
ok('« Plus tard » : rien demandé ni redemandé (Réglages pour changer d\'avis) ; captures en sombre');
{ const C = await fresh({ init: `(${shell})(${JSON.stringify([TOK + 'c', 'denied'])})` });
  await C.p.waitForTimeout(2500); assert.equal(await C.p.$('.ob .ob-push'), null, 'bloquées : pas d\'étape'); assert.equal(await C.p.$$eval('.ob-dots i', l => l.length), 3);
  await C.p.click('.ob-s:nth-child(1) [data-ob="next"]'); await C.p.waitForTimeout(400); await C.p.click('.ob-s:nth-child(2) [data-ob="next"]'); await C.p.waitForTimeout(400);
  await C.p.click('#obSave [data-ob="done"]'); await C.p.waitForFunction(() => !document.querySelector('.ob'), null, { timeout: 5000 });
  await C.ctx.close(); }
ok('notifications bloquées dans Android : pas d\'étape (3 points), « Plus tard » ferme le premier lancement');
{ const W = await fresh({ before: q => q.addInitScript(() => { addEventListener('DOMContentLoaded', () => { window.pushState = async () => 'off'; Notification.requestPermission = async () => { window.__asked = (window.__asked || 0) + 1; return 'denied'; }; }); }) });
  await W.p.waitForSelector('.ob .ob-push', { state: 'attached', timeout: 10000 }); await toStep4(W.p);
  await W.p.click('.ob-push [data-ob="push"]'); await W.p.waitForFunction(() => !document.querySelector('.ob'), null, { timeout: 5000 });
  assert.equal(await W.p.evaluate(() => window.__asked), 1, 'navigateur : la fenêtre du navigateur (Notification.requestPermission)');
  await W.p.waitForFunction(() => /^Pas de souci : tu pourras les activer dans Compte et réglages › Notifications\.$/.test(document.querySelector('#toast').textContent.trim()), null, { timeout: 5000 });
  await W.ctx.close(); }
{ const I = await fresh({ before: q => q.addInitScript(() => { addEventListener('DOMContentLoaded', () => { window.pushState = async () => 'ios'; }); }) });
  await I.p.waitForTimeout(2500); assert.equal(await I.p.$('.ob .ob-push'), null, 'iPhone hors app installée : pas d\'étape'); await I.ctx.close(); }
ok('navigateur : Notification.requestPermission (refus : « Pas de souci… », l\'appli) ; iPhone hors app installée : pas d\'étape');

await browser.close(); world.stop(); F.stop();
console.log('\nEVPUSH E2E OK'); process.exit(0);
