// E2E alertes de prix en message privé Discord (src/alerts.js ; serveur : tests/test-discord-dm.mjs) : vrai proxy, faux Discord, faux Firebase (jetons signés),
// faux Scryfall et faux push ; liaisons écrites d'avance (ADMIN_DIR/discord-links.json), /api/discord/me répondu par le vrai serveur.
// Feuille « Alertes de prix » : choix « Recevoir les alertes : Notification · Discord (MP) · Les deux » absent sans compte et pour un compte lié pas membre ;
// compte lié et membre : choix (Notification par défaut) et indication sur les MP des membres du serveur ; « Discord (MP) » → PUT avec dm et le jeton Firebase,
// alerte reçue en MP (pas de notification) ; MP refusés (50007) → notification à la place, « MP Discord refusés : vérifie tes réglages… » dans la feuille ;
// « Les deux » ; retour à « Notification » (mode effacé sur le serveur, message parti) ; 360 px sans débordement ; anglais ; appareil aux notifications refusées
// mais compte lié et membre : alertes activées en MP seulement (sans abonnement, clé d'appareil). Port 19837.
import './setup-env.mjs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, createECDH, randomBytes } from 'node:crypto';
import { chromium, startWorld, newPage, txt, ok, signInFake } from './e2e-world.mjs';
import { startFakes, tag } from './amis-fakes.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const TOKEN = 'jeton-du-bot-SECRET-0123456789', G = '910000000000000001', JEANNE = '940000000000000001', PAUL = '940000000000000002';
const D = { members: new Set([JEANNE]), chans: new Map(), closed: new Set(), dms: [] };
const dsc = http.createServer((q, r) => {
  const c = []; q.on('data', d => c.push(d)); q.on('end', () => {
    const send = (code, o) => { r.writeHead(code, { 'content-type': 'application/json' }); r.end(JSON.stringify(o)); };
    const p = new URL(q.url, 'http://x').pathname.replace(/^\/api\/v10/, ''), m = q.method, body = c.length ? JSON.parse(Buffer.concat(c).toString()) : null; let x;
    if (q.headers.authorization !== 'Bot ' + TOKEN) return send(401, { message: '401: Unauthorized', code: 0 });
    if (m === 'GET' && p === '/users/@me/guilds') return send(200, [{ id: G, name: 'Mana Orbit' }]);
    if (m === 'GET' && (x = /^\/guilds\/\d+\/members\/(\d+)$/.exec(p))) return D.members.has(x[1]) ? send(200, { user: { id: x[1] }, roles: [] }) : send(404, { message: 'Unknown Member', code: 10007 });
    if (m === 'POST' && p === '/users/@me/channels') { const id = '96' + body.recipient_id.slice(-10); D.chans.set(id, body.recipient_id); return send(200, { id, type: 1 }); }
    if (m === 'POST' && (x = /^\/channels\/(\d+)\/messages$/.exec(p))) { const to = D.chans.get(x[1]); if (D.closed.has(to)) return send(403, { message: 'Cannot send messages to this user', code: 50007 }); D.dms.push({ to, body }); return send(200, { id: '97' + D.dms.length }); }
    return send(404, { message: 'Unknown route' });
  });
});
const price = new Map([['sol ring', '3.00'], ['swords to plowshares', '1.20'], ['wrath of god', '2.50'], ['arcane signet', '1.00']]);
const upScry = http.createServer((req, res) => {
  const c = []; req.on('data', x => c.push(x)); req.on('end', () => {
    const b = JSON.parse(Buffer.concat(c).toString() || '{}'), data = [];
    for (const i of b.identifiers || []) { const v = price.get(i.name.toLowerCase()); if (v) data.push({ name: i.name, prices: { eur: v } }); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ object: 'list', not_found: [], data }));
  });
});
const pushed = [];
const upPush = http.createServer((req, res) => { req.resume(); req.on('end', () => { pushed.push(req.url); res.writeHead(201); res.end(); }); });
for (const s of [dsc, upScry, upPush]) await new Promise(r => s.listen(0, '127.0.0.1', r));
const F = await startFakes();
const vk = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' });
const VPUB = Buffer.concat([Buffer.from([4]), Buffer.from(vk.x, 'base64url'), Buffer.from(vk.y, 'base64url')]).toString('base64url');
const dir = mkdtempSync(join(tmpdir(), 'aldm-e2e-')), ADMIN_DIR = join(dir, 'admin'), UJ = 'uid-e2e-jeanne', UP = 'uid-e2e-paul';
mkdirSync(ADMIN_DIR, { recursive: true });
writeFileSync(join(ADMIN_DIR, 'discord-links.json'), JSON.stringify({ v: 1, links: { [tag(UJ)]: { id: JEANNE, name: 'Jeanne', member: true, at: Date.now() }, [tag(UP)]: { id: PAUL, name: 'Paul', member: false, at: Date.now() } } }));
const world = await startWorld({ port: 19837, env: { VAPID_PUBLIC_KEY: VPUB, VAPID_PRIVATE_KEY: vk.d, VAPID_SUBJECT: 'mailto:test@example.com', PUSH_ALLOW_HOSTS: `127.0.0.1:${upPush.address().port}`,
  SCRYFALL_UPSTREAM: `http://127.0.0.1:${upScry.address().port}`, ALERT_FILE: join(dir, 'alerts.json'), ALERT_EVERY_MS: '3600000', ALERT_FIRST_MS: '3600000', ALERT_SEED_MS: '150', ALERT_CHECK_GAP_MS: '0', ALERT_HIST_GAP_MS: '0',
  DISCORD_BOT_TOKEN: TOKEN, DISCORD_API: `http://127.0.0.1:${dsc.address().port}/api/v10`, DISCORD_CLIENT_ID: '950000000000000001', DISCORD_CLIENT_SECRET: 'secret-oauth-SECRET-abcdef', DISCORD_PRESENCE: '0', ADMIN_DIR, FIREBASE_JWKS_URL: F.env.FIREBASE_JWKS_URL } });
await sleep(700);
// Notifications simulées (comme alerts-e2e) ; arg.perm 'denied' : refusées sur l'appareil
const stub = arg => {
  const g = k => { try { return JSON.parse(localStorage.getItem('__t_' + k)); } catch (e) { return null; } }, s = (k, v) => localStorage.setItem('__t_' + k, JSON.stringify(v));
  Object.defineProperty(Notification, 'permission', { configurable: true, get: () => arg.perm || g('perm') || 'default' });
  Notification.requestPermission = async () => { if (arg.perm) return arg.perm; s('perm', 'granted'); return 'granted'; };
  const mgr = { getSubscription: async () => { const x = g('sub'); return x ? { endpoint: x.endpoint, toJSON: () => x, unsubscribe: async () => { s('sub', null); return true; } } : null; }, subscribe: async () => { s('sub', arg.sub); return mgr.getSubscription(); } };
  Object.defineProperty(ServiceWorkerRegistration.prototype, 'pushManager', { configurable: true, get: () => mgr });
  try { if (!localStorage.getItem('deckdeal:decks:v1')) localStorage.setItem('deckdeal:decks:v1', JSON.stringify([{ id: 'dA', name: 'Deck A', text: '1 Sol Ring\n1 Swords to Plowshares\n1 Wrath of God', updatedAt: Date.now() - 1000 }])); } catch (e) { /* ignore */ }
};
const SUB = k => { const e = createECDH('prime256v1'); e.generateKeys(); return { endpoint: `http://127.0.0.1:${upPush.address().port}/send/${k}`, keys: { p256dh: e.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } }; };
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const errsAll = [];
async function page(o = {}) {
  const pg = await newPage(browser, world, { sw: true, goto: false, init: `(${stub})(${JSON.stringify({ sub: SUB(o.key || 'dev'), perm: o.perm || '' })})` });
  const puts = [];
  pg.p.on('request', r => { if (r.method() === 'PUT' && /\/api\/alerts$/.test(new URL(r.url()).pathname)) puts.push({ tok: r.headers()['x-firebase-token'] || '', body: JSON.parse(r.postData() || '{}') }); });
  await pg.p.goto(world.url + (o.path || '')); await pg.p.waitForFunction(() => CTX.proxy === true && CTX.alerts === true, null, { timeout: 15000 });
  if (o.uid) { await pg.p.evaluate(t => { window.__idTok = t; }, F.jwt(o.uid)); await signInFake(pg.p, { uid: o.uid }); await pg.p.waitForFunction(() => DL.st && DL.st.u === dlWho(), null, { timeout: 20000 }); }
  errsAll.push(pg.errs);
  return { ...pg, puts };
}
const server = async id => (await fetch(world.url + 'api/alerts?id=' + id)).json();
const openSheet = async p => { await p.evaluate(() => openAlertSheet()); await p.waitForSelector('.al-row', { timeout: 15000 }); };
const closeAll = p => p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); }).then(() => p.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 5000 }));
const checkNow = async p => { await p.evaluate(() => { document.querySelector('#toast').textContent = ''; }); await p.click('#alCheck'); await toastIs(p, /1 alerte envoyée/); };
const toastIs = (p, re) => p.waitForFunction(r => new RegExp(r).test(document.querySelector('#toast').textContent), re.source, { timeout: 15000 });

/* ── 1) Sans compte, puis compte lié mais pas membre : pas de choix ───────────────────────────────────────────────────────── */
{
  const { p, ctx } = await page({ key: 'anon' });
  assert.equal((await p.evaluate(() => alEnable())).ok, true); await openSheet(p);
  assert.equal(!!(await p.$('#alDmBox')), false, 'sans compte : pas de choix');
  await ctx.close();
  const P2 = await page({ key: 'paul', uid: UP });
  assert.deepEqual(await P2.p.evaluate(() => [DL.st.l, DL.st.m]), [true, false]);
  assert.equal((await P2.p.evaluate(() => alEnable())).ok, true); await openSheet(P2.p);
  assert.equal(!!(await P2.p.$('#alDmBox')), false, 'lié pas membre : pas de choix');
  assert.ok(P2.puts.length && P2.puts.every(x => !x.body.dm), 'aucun mode envoyé');
  await P2.ctx.close();
  ok('sans compte, compte lié pas membre : pas de choix « Recevoir les alertes », aucun mode envoyé');
}

/* ── 2) Compte lié et membre : choix, MP, MP refusés, les deux, retour à Notification ──────────────────────────────────────── */
{
  const { p, ctx, puts } = await page({ key: 'jeanne', uid: UJ });
  assert.equal((await p.evaluate(() => alEnable())).ok, true); await openSheet(p);
  await p.waitForSelector('#alDmBox');
  assert.equal(await txt(p, '#alDmBox .label'), 'Recevoir les alertes');
  assert.deepEqual(await p.$$eval('#alDm .seg-opt', l => l.map(b => [b.textContent.trim(), b.getAttribute('aria-checked')])), [['Notification', 'true'], ['Discord (MP)', 'false'], ['Les deux', 'false']], 'Notification par défaut');
  assert.match(await txt(p, '#alDmBox .hint'), /accepte les messages privés des membres du serveur Mana Orbit/);
  assert.equal(!!(await p.$('#alDmErr')), false);
  // « Discord (MP) »
  const n0 = puts.length; await p.click('#alDm .seg-opt[data-v="only"]');
  await p.waitForFunction(() => AC.dm === 'only' && AC.info && AC.info.dm === 'only', null, { timeout: 15000 });
  const pu = puts.slice(n0).at(-1); assert.equal(pu.body.dm, 'only'); assert.ok(pu.body.sub, 'abonnement gardé (repli)'); assert.ok(pu.tok.split('.').length === 3, 'jeton Firebase envoyé');
  const id = await p.evaluate(() => AC.id); let s = await server(id); assert.deepEqual([s.dm, s.push], ['only', true]);
  assert.equal(await p.$eval('#alDm .seg-opt[data-v="only"]', b => b.getAttribute('aria-checked')), 'true');
  await sleep(400); price.set('sol ring', '1.50'); const p0 = pushed.length;
  await checkNow(p);
  assert.equal(D.dms.length, 1, 'MP reçu'); assert.equal(D.dms[0].to, JEANNE); assert.equal(D.dms[0].body.content, '📉 **Sol Ring : −50 %**'); assert.equal(pushed.length, p0, 'pas de notification');
  ok('compte lié et membre : choix « Notification · Discord (MP) · Les deux » (Notification par défaut, indication sur les MP) ; « Discord (MP) » → PUT avec dm et le jeton, alerte reçue en MP seulement');
  // MP refusés : notification à la place, message dans la feuille
  D.closed.add(JEANNE); price.set('wrath of god', '1.00');
  await checkNow(p);
  assert.equal(pushed.length, p0 + 1, 'notification à la place'); assert.equal(D.dms.length, 1);
  await p.waitForSelector('#alDmErr'); assert.equal(await txt(p, '#alDmErr'), 'MP Discord refusés : vérifie tes réglages de confidentialité Discord.');
  for (const w of [360, 390]) {
    await p.setViewportSize({ width: w, height: 800 }); await p.waitForTimeout(200);
    assert.deepEqual(await p.evaluate(() => { const b = document.getElementById('alDm').getBoundingClientRect(), s = document.querySelector('.sheet-body').getBoundingClientRect(); return [document.documentElement.scrollWidth <= innerWidth, b.right <= s.right + 0.5, [...document.querySelectorAll('#alDm .seg-opt span')].every(x => x.scrollWidth <= x.parentElement.clientWidth + 1)]; }), [true, true, true], w + ' px : rien ne déborde');
  }
  await p.$eval('#alDmBox', e => e.scrollIntoView({ block: 'center', behavior: 'instant' })); await p.screenshot({ path: 'shots/alerts-dm-1-refus.png' });
  // « Les deux » : MP rouverts → MP et notification, message effacé
  D.closed.delete(JEANNE); await p.click('#alDm .seg-opt[data-v="both"]');
  await p.waitForFunction(() => AC.dm === 'both' && AC.info && AC.info.dm === 'both' && !document.querySelector('#alDmErr'), null, { timeout: 15000 });      // mode changé : raison oubliée
  price.set('swords to plowshares', '0.50'); await checkNow(p);
  assert.equal(D.dms.length, 2, 'MP'); assert.equal(pushed.length, p0 + 2, 'et notification');
  // retour à « Notification »
  await p.click('#alDm .seg-opt[data-v="push"]'); await p.waitForFunction(() => AC.dm === '' && AC.info && AC.info.dm === '', null, { timeout: 15000 });
  s = await server(id); assert.equal(s.dm, ''); assert.equal(puts.at(-1).body.dm, undefined, 'plus de mode envoyé');
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:alert:v1')).dm), '', 'choix gardé sur l\'appareil');
  await closeAll(p); await ctx.close();
  ok('MP refusés (50007) : notification à la place et « MP Discord refusés : vérifie tes réglages de confidentialité Discord. » dans la feuille ; « Les deux » : MP et notification ; retour à « Notification » : mode effacé sur le serveur ; 360 et 390 px sans débordement');
}

/* ── 3) Anglais ; appareil aux notifications refusées : alertes en MP seulement ───────────────────────────────────────────── */
{
  const { p, ctx } = await page({ key: 'en', uid: UJ, path: '?lang=en' });
  assert.equal((await p.evaluate(() => alEnable())).ok, true); await openSheet(p); await p.waitForSelector('#alDmBox');
  assert.deepEqual(await p.$$eval('#alDm .seg-opt', l => l.map(b => b.textContent.trim())), ['Notification', 'Discord (DM)', 'Both']);
  assert.equal(await txt(p, '#alDmBox .label'), 'Receive alerts');
  await ctx.close();
  const Q = await page({ key: 'denied', uid: UJ, perm: 'denied' });
  const r = await Q.p.evaluate(() => alEnable()); assert.deepEqual([r.ok, r.dmOnly], [true, true], 'notifications refusées : MP seulement');
  const pu = Q.puts.at(-1); assert.equal(pu.body.sub, undefined, 'sans abonnement'); assert.match(pu.body.dev, /^[\w-]{16,64}$/, 'clé d\'appareil'); assert.equal(pu.body.dm, 'only');
  const s = await server(await Q.p.evaluate(() => AC.id)); assert.deepEqual([s.dm, s.push], ['only', false]);
  await openSheet(Q.p); await Q.p.waitForSelector('#alDmBox');
  assert.equal(await Q.p.$eval('#alDm .seg-opt[data-v="only"]', b => b.getAttribute('aria-checked')), 'true');
  await Q.p.click('#alDm .seg-opt[data-v="both"]'); await toastIs(Q.p, /Notifications bloquées/);
  assert.equal(await Q.p.evaluate(() => AC.dm), 'only', 'notifications refusées : reste en MP seulement');
  await Q.ctx.close();
  ok('anglais (Receive alerts, Discord (DM), Both) ; notifications refusées sur l\'appareil : alertes activées en MP seulement (sans abonnement, clé d\'appareil), « Les deux » refusé avec le message des réglages');
}

const errs = errsAll.flat().filter(e => !/Firebase|firestore|gstatic|googleapis|ERR_|net::/i.test(e));
assert.deepEqual(errs, [], 'aucune erreur de page');
await browser.close(); world.stop(); F.stop();
console.log('OK alerts-dm-e2e');
process.exit(0);
