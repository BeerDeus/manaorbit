// E2E « Messages de l'équipe » (src/inbox.js) : vrai proxy.mjs (/api/inbox, /api/admin/inbox, « Prévenir : réglé ») branché sur un faux Firebase (jetons, Firestore, FCM).
// Compte connecté : message de l'équipe envoyé depuis le panneau → point sur le bouton du compte (et son libellé), ligne « Messages de l'équipe · 1 nouveau » dans
// Compte et réglages → feuille : le message (retours à la ligne gardés), mis en évidence, marqué lu au serveur → « Voir le fil sur Discord » d'une réponse à un avis
// → Supprimer → notification touchée (./?inbox=1) et lien au démarrage → la feuille ; anglais ; déconnecté ou serveur sans boîte : rien. Port 19623.
// Captures : INBOX_SHOTS (dossier, facultatif).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, startWorld, newPage, ok, signInFake, openMe, closeSheets } from './e2e-world.mjs';
import { startFakes, tag } from './amis-fakes.mjs';
import { ADMIN } from './admin-fakes.mjs';

const F = await startFakes();
const world = await startWorld({ port: 19623, env: { ...F.env, ADMIN_EMAILS: ADMIN } });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const SHOTS = process.env.INBOX_SHOTS || ''; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p, name) => { if (SHOTS) { await p.waitForTimeout(450); await p.screenshot({ path: `${SHOTS}/${name}.png` }); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { for (let t = 0; t < ms && !(await fn()); t += 100) await sleep(100); return fn(); };
const UA = 'uid-alice-inbox', TA = tag(UA);
const send = async body => { const r = await fetch(world.url + 'api/admin/inbox', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-firebase-token': F.jwt('uid-admin-00', 3600, { email: ADMIN, email_verified: true }) }, body: JSON.stringify(body) }); return { s: r.status, o: await r.json() }; };
const box = async () => (await (await fetch(world.url + 'api/inbox', { headers: { 'x-firebase-token': F.jwt(UA) } })).json());

async function login(p, uid) {
  await p.route('https://www.gstatic.com/**', r => r.abort());      // pas de SDK Firebase : comptes simulés (signInFake)
  await p.goto(world.url); await p.waitForTimeout(600);
  await p.evaluate(t => { window.__idTok = t; }, F.jwt(uid, 3 * 3600));
  await signInFake(p, { uid, email: uid + '@test.dev', displayName: 'Alice' });
  await p.waitForFunction(() => CTX.inbox === true, null, { timeout: 8000 });
}

/* ── 1) Rien tant qu'il n'y a pas de message ; puis un message du panneau : point, ligne, feuille ───────────────────────── */
const A = await newPage(browser, world, { goto: false }), p = A.p;
await login(p, UA);
await p.evaluate(() => ibLoad(true));
await openMe(p); assert.equal(await p.$('#meInbox'), null, 'aucun message : pas de ligne'); await closeSheets(p);
assert.equal(await p.$eval('#btnAccount', e => e.dataset.dot), '0');
let r = await send({ to: TA, text: 'Bonjour Alice,\nla carte « Lieur de foi bénalian » est maintenant reconnue.\nMerci !' }); assert.equal(r.s, 200, JSON.stringify(r.o));
await p.evaluate(() => ibLoad(true));
assert.equal(await p.$eval('#btnAccount', e => e.dataset.dot), '1', 'point sur le bouton du compte');
assert.match(await p.$eval('#btnAccount', e => e.getAttribute('aria-label')), /1 message de l'équipe/);
await openMe(p); await p.waitForSelector('#meInbox');
assert.match(await p.$eval('#meInbox', e => e.textContent.replace(/\s+/g, ' ')), /Messages de l'équipe.*1 nouveau/);
await shot(p, 'inbox-1-compte');
await p.click('#meInbox'); await p.waitForSelector('.tmb-sheet .tmb-it');
const it = await p.$eval('.tmb-sheet .tmb-it', e => ({ cls: e.className, h: e.querySelector('.tmb-h b').textContent, x: e.querySelector('.tmb-x').innerText }));
assert.match(it.cls, /\bnew\b/, 'nouveau : en évidence'); assert.equal(it.h, 'Message de l\'équipe Mana Orbit');
assert.equal(it.x, 'Bonjour Alice,\nla carte « Lieur de foi bénalian » est maintenant reconnue.\nMerci !', 'retours à la ligne gardés');
assert.ok(await until(async () => (await box()).unread === 0), 'feuille ouverte : marqué lu au serveur');
assert.equal(await p.$eval('#btnAccount', e => e.dataset.dot), '0', 'plus de point');
await shot(p, 'inbox-2-feuille');
await closeSheets(p); await closeSheets(p);
ok('message du panneau : point sur le bouton du compte (et son libellé), ligne « Messages de l\'équipe · 1 nouveau », feuille (retours à la ligne gardés, en évidence), marqué lu');

/* ── 2) Scan réglé et réponse à un avis (enregistrés directement dans la boîte) : textes de l'appli, lien du fil, Supprimer ── */
{
  const R = await (await fetch(world.url + 'api/scan-report', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-firebase-token': F.jwt(UA) }, body: JSON.stringify({ img: 'data:image/jpeg;base64,' + (await import('node:fs')).readFileSync('tests/fixtures/swords.jpg').toString('base64'), what: 'miss', note: '', meta: { read: { first: 'Émérite de l\'abondance' } } }) })).json();
  const n = await fetch(world.url + 'api/admin/scans/' + R.id + '/notify', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-firebase-token': F.jwt('uid-admin-00', 3600, { email: ADMIN, email_verified: true }) }, body: '{}' });
  assert.equal(n.status, 200);
  await p.evaluate(() => { pushOpen('./?inbox=1'); });      // notification touchée
  await p.waitForSelector('.tmb-sheet .tmb-it'); await p.waitForTimeout(400);
  const t = await p.$$eval('.tmb-sheet .tmb-it', es => es.map(e => [e.querySelector('.tmb-h b').textContent, (e.querySelector('.tmb-l') || {}).textContent || '', !!e.querySelector('[data-ib="see"]')]));
  assert.deepEqual(t[0], ['Ton scan signalé est réglé', '« Émérite de l\'abondance » est maintenant reconnue. Merci pour ton signalement !', false], 'scan réglé : phrase de l\'appli avec la carte');
  await shot(p, 'inbox-3-scan');
  await p.click('.tmb-sheet .tmb-it [data-ib="del"]');
  assert.ok(await until(async () => (await box()).items.length === 1), 'supprimé au serveur'); assert.ok(await until(async () => (await p.$$eval('.tmb-sheet .tmb-it', es => es.length)) === 1), 'et dans la feuille');
  await closeSheets(p);
  ok('scan réglé : « Ton scan signalé est réglé », la carte dans la phrase de l\'appli ; notification touchée (./?inbox=1) : la feuille ; Supprimer');
}
{
  const AV = { id: 'zz00000-aaaaaa', t: Date.now(), k: 'avis', s: 'Les prix ne se chargent plus', ev: { replies: 1, tags: ['Corrigé'], close: true }, x: 'Corrigé dans la 1.1.3, merci !', u: './?avis=1569428139807867807&g=910000000000000001', r: 1 };
  await p.route(world.url + 'api/inbox', async route => { if (route.request().method() !== 'GET') return route.continue(); const res = await route.fetch(), j = await res.json(); j.items.unshift(AV); route.fulfill({ response: res, json: j }); });      // réponse à un avis (relève du bot) : ajoutée à la boîte lue
  await p.evaluate(() => openInbox()); await p.waitForSelector('.tmb-sheet [data-ib="see"]');
  assert.equal(await p.$$eval('.tmb-sheet .tmb-it', es => es.length), 2);
  const a = await p.$eval('.tmb-sheet .tmb-it', e => [e.querySelector('.tmb-h b').textContent, e.querySelector('.tmb-l').textContent, e.querySelector('.tmb-x').textContent]);
  assert.deepEqual(a, ['Du nouveau sur ton avis', '« Les prix ne se chargent plus » · 1 réponse de l\'équipe · marqué Corrigé · fil fermé', 'Corrigé dans la 1.1.3, merci !']);
  await shot(p, 'inbox-4-avis');
  await p.click('.tmb-sheet [data-ib="see"]'); await p.waitForSelector('.fb-avis a[data-fb="see"]');
  assert.equal(await p.$eval('.fb-avis a[data-fb="see"]', e => e.href), 'https://discord.com/channels/910000000000000001/1569428139807867807', 'le fil sur Discord');
  await closeSheets(p); await closeSheets(p); await p.unroute(world.url + 'api/inbox');
  ok('réponse à un avis : texte de la réponse lisible dans l\'appli, étiquettes traduites, « Voir le fil sur Discord »');
}

/* ── 3) Anglais, sombre, lien au démarrage ; déconnecté : rien ──────────────────────────────────────────────────────── */
{
  await send({ to: TA, text: 'Hello from the team' });
  const E = await newPage(browser, world, { goto: false, ctx: { viewport: { width: 360, height: 780 }, colorScheme: 'dark', locale: 'en-US' }, init: "try { localStorage.setItem('deckdeal:lang', 'en'); } catch (e) {}" }), q = E.p;
  await login(q, UA);
  await q.evaluate(() => { history.replaceState(null, '', './?inbox=1'); handleLaunch(); });
  await q.waitForSelector('.tmb-sheet .tmb-it', { timeout: 10000 });
  assert.equal(await q.$eval('.tmb-sheet h2', e => e.textContent), 'Team messages');
  assert.equal(await q.$eval('.tmb-sheet .tmb-it .tmb-h b', e => e.textContent), 'Message from the Mana Orbit team');
  assert.equal(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'pas de défilement horizontal à 360 px');
  await shot(q, 'inbox-5-en-sombre');
  await closeSheets(q);
  await q.evaluate(() => D.cloud.signOut()); await q.waitForTimeout(800);
  assert.equal(await q.$eval('#btnAccount', e => e.dataset.dot), '0', 'déconnecté : plus de point');
  assert.equal(await q.evaluate(() => ibUnread()), 0);
  await E.ctx.close();
  ok('anglais et sombre à 360 px (« Team messages »), lien ./?inbox=1 au démarrage : la feuille ; déconnecté : rien');
}
assert.deepEqual(A.errs.filter(e => !/WebAssembly|worker|ERR_|Tesseract|favicon/i.test(e)), []);
await browser.close(); world.stop(); F.stop(); console.log('\nINBOX E2E OK'); process.exit(0);
