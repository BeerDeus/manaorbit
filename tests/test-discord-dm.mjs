// Alertes de prix en message privé Discord (proxy.mjs › alertsApi / alPass, discord-srv.mjs › dm) contre un faux Discord HTTP, un faux Scryfall et un faux
// service de push (aucun accès réseau) ; passages d'alertes forcés par « Vérifier les prix » (POST /api/alerts/check). Liaisons écrites d'avance dans
// ADMIN_DIR/discord-links.json (empreinte du compte → compte Discord, membre). Cas : 'both' (MP + notification ; canal privé ouvert une fois ; embed : cartes,
// prix, lien Cardmarket et lien de l'appli ; allowed_mentions vide ; Markdown des noms neutralisé), 'only' (MP seul, en anglais), MP refusés (50007) → notification
// à la place et dmErr 'closed' (GET), effacé au MP suivant réussi ; pas lié → 'unlinked' ; plus membre (adhésion relue) → 'member' ; Discord en panne → 'down' ;
// jeton absent, faux ou expiré → mode ignoré (PUT 200, dm '') ; appareil sans notification : 'only' avec une clé d'appareil (MP seul, rien sans jeton,
// 5 appareils par compte) ; redémarrage : mode gardé, ni UID ni jeton dans alerts.json ni le journal ; bot coupé : mode ignoré. Ports 19830–19832 ; faux Firebase de amis-fakes.mjs.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createECDH, randomBytes, hkdfSync, createDecipheriv, generateKeyPairSync } from 'node:crypto';
import { startFakes, tag } from './amis-fakes.mjs';

const ok = m => console.log('✓ ' + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TOKEN = 'jeton-du-bot-SECRET-0123456789', G = '910000000000000001', BOT = '910000000000000002';
const DU = { jeanne: '940000000000000001', paul: '940000000000000002', marc: '940000000000000003', zoe: '940000000000000004' };      // comptes Discord
// ── faux Discord : membres du serveur, canaux privés ouverts (recipient → canal), MP refusés (closed), panne (down), messages reçus (dms)
const D = { members: new Set([DU.jeanne, DU.paul]), chans: new Map(), opened: [], closed: new Set(), down: 0, dms: [], calls: [] };
const srv = http.createServer((q, r) => {
  const c = []; q.on('data', d => c.push(d)); q.on('end', () => {
    const send = (code, o) => { r.writeHead(code, { 'content-type': 'application/json' }); r.end(o === undefined ? '' : JSON.stringify(o)); };
    const p = new URL(q.url, 'http://x').pathname.replace(/^\/api\/v10/, ''), m = q.method, body = c.length ? JSON.parse(Buffer.concat(c).toString()) : null; let x;
    D.calls.push(m + ' ' + p);
    if (q.headers.authorization !== 'Bot ' + TOKEN) return send(401, { message: '401: Unauthorized', code: 0 });
    if (D.down > 0 && m === 'POST') { D.down--; return send(503, { message: 'upstream connect error' }); }
    if (m === 'GET' && p === '/users/@me/guilds') return send(200, [{ id: G, name: 'Mana Orbit' }]);
    if (m === 'GET' && (x = /^\/guilds\/(\d+)\/members\/(\d+)$/.exec(p))) return D.members.has(x[2]) ? send(200, { user: { id: x[2] }, roles: [] }) : send(404, { message: 'Unknown Member', code: 10007 });
    if (m === 'POST' && p === '/users/@me/channels') {
      const id = '96' + String(body.recipient_id).slice(-12); D.opened.push(body.recipient_id); D.chans.set(id, body.recipient_id);
      return send(200, { id, type: 1, recipients: [{ id: body.recipient_id }] });
    }
    if (m === 'POST' && (x = /^\/channels\/(\d+)\/messages$/.exec(p))) {
      const to = D.chans.get(x[1]); if (!to) return send(404, { message: 'Unknown Channel', code: 10003 });
      if (D.closed.has(to)) return send(403, { message: 'Cannot send messages to this user', code: 50007 });
      D.dms.push({ to, body }); return send(200, { id: '97' + D.dms.length, channel_id: x[1], ...body });
    }
    return send(404, { message: 'Unknown route ' + m + ' ' + p });
  });
});
// ── faux Scryfall et faux push (comme test-alerts.mjs)
const price = new Map();
const upScry = http.createServer((req, res) => {
  const c = []; req.on('data', x => c.push(x)); req.on('end', () => {
    const b = JSON.parse(Buffer.concat(c).toString() || '{}'), data = [];
    for (const i of b.identifiers || []) { const v = price.get(i.name.toLowerCase()); if (v !== undefined) data.push({ name: i.name, prices: { eur: v } }); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ object: 'list', not_found: [], data }));
  });
});
const pushed = [];
const upPush = http.createServer((req, res) => { const c = []; req.on('data', x => c.push(x)); req.on('end', () => { pushed.push({ url: req.url, body: Buffer.concat(c) }); res.writeHead(201); res.end(); }); });
for (const s of [srv, upScry, upPush]) await new Promise(r => s.listen(0, '127.0.0.1', r));
const port = s => s.address().port, DAPI = `http://127.0.0.1:${port(srv)}/api/v10`;
const vk = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' });
const VPUB = Buffer.concat([Buffer.from([4]), Buffer.from(vk.x, 'base64url'), Buffer.from(vk.y, 'base64url')]).toString('base64url');
const browser = t => { const e = createECDH('prime256v1'); e.generateKeys(); const auth = randomBytes(16); return { e, pub: e.getPublicKey(), auth, sub: { endpoint: `http://127.0.0.1:${port(upPush)}/send/${t}`, keys: { p256dh: e.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } } }; };
function decrypt(body, br) {
  const salt = body.subarray(0, 16), idlen = body[20], keyid = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const ikm = Buffer.from(hkdfSync('sha256', br.e.computeSecret(keyid), br.auth, Buffer.concat([Buffer.from('WebPush: info\0'), br.pub, keyid]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16)), nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(-16));
  const plain = Buffer.concat([d.update(ct.subarray(0, -16)), d.final()]); let n = plain.length; while (n > 0 && plain[n - 1] === 0) n--; return JSON.parse(plain.subarray(0, n - 1).toString());
}
const pushesFor = br => pushed.filter(x => x.url.endsWith('/' + br.sub.endpoint.split('/').pop()));
const dmsTo = id => D.dms.filter(x => x.to === id);
const F = await startFakes();

// Liaisons gardées par discord-srv.mjs (empreinte du compte → compte Discord) ; Marc : lié il y a 2 jours (adhésion à relire), parti du serveur depuis
const dir = mkdtempSync(join(tmpdir(), 'dscdm-')), ADMIN_DIR = join(dir, 'admin'), FILE = join(dir, 'alerts.json'), now = Date.now();
const UID = { jeanne: 'uid-jeanne-01', paul: 'uid-paul-02', marc: 'uid-marc-03', zoe: 'uid-zoe-04' };
mkdirSync(ADMIN_DIR, { recursive: true });
writeFileSync(join(ADMIN_DIR, 'discord-links.json'), JSON.stringify({ v: 1, links: {
  [tag(UID.jeanne)]: { id: DU.jeanne, name: 'Jeanne', member: true, at: now }, [tag(UID.paul)]: { id: DU.paul, name: 'Paul', member: true, at: now },
  [tag(UID.marc)]: { id: DU.marc, name: 'Marc', member: true, at: now - 2 * 86400e3 } } }));
const JWT = k => F.jwt(UID[k]);

const procs = [];
const start = (env, p) => new Promise((resolve, reject) => {
  const c = spawn('node', ['proxy.mjs'], { env: { ...process.env, EDH_SOURCE_URL: '', PORT: String(p), CARDTRADER_TOKEN: 'tok', PUBDECKS: '0', DAILY: '0', BAD_KEY_DELAY_MS: '20', FIREBASE_JWKS_URL: F.env.FIREBASE_JWKS_URL, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.stdout.on('data', d => { out += d; if (/Mana Orbit →/.test(out)) resolve(c); }); c.stderr.on('data', d => { out += d; });
  c.on('exit', code => { if (code) reject(new Error('exit ' + code + ': ' + out)); });
  c.log = () => out; c.url = `http://127.0.0.1:${p}`; procs.push(c);
});
const stop = p => new Promise(r => { p.once('exit', r); p.kill(); });
process.on('exit', () => { for (const p of procs) try { p.kill(); } catch { /* ignore */ } F.stop(); for (const s of [srv, upScry, upPush]) s.close(); });
const ENV = { VAPID_PUBLIC_KEY: VPUB, VAPID_PRIVATE_KEY: vk.d, VAPID_SUBJECT: 'mailto:test@example.com', PUSH_ALLOW_HOSTS: `127.0.0.1:${port(upPush)}`, SCRYFALL_UPSTREAM: `http://127.0.0.1:${port(upScry)}`,
  ALERT_FILE: FILE, ALERT_EVERY_MS: '3600000', ALERT_FIRST_MS: '3600000', ALERT_SEED_MS: '100', ALERT_CHECK_GAP_MS: '0', ALERT_COOLDOWN_MS: '5000', ALERT_HIST_GAP_MS: '0',
  DISCORD_BOT_TOKEN: TOKEN, DISCORD_API: DAPI, DISCORD_CLIENT_ID: '950000000000000001', DISCORD_CLIENT_SECRET: 'secret-oauth-SECRET-abcdef', DISCORD_PRESENCE: '0', ADMIN_DIR };
let BASE = '', ipN = 0;
const J = async (path, { method = 'GET', body, tok, ip = `10.${(++ipN >> 8) & 255}.${ipN & 255}.1` } = {}) => {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip, ...(tok ? { 'x-firebase-token': tok } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let o; try { o = JSON.parse(t); } catch { o = t; } return { s: r.status, o };
};
const put = (b, tok) => J('/api/alerts', { method: 'PUT', body: b, tok });
const check = id => J('/api/alerts/check?id=' + id, { method: 'POST', body: {} });
const get = id => J('/api/alerts?id=' + id);
const setPx = o => { for (const [k, v] of Object.entries(o)) price.set(k.toLowerCase(), v); };
/** Enregistre, attend le relevé de départ, puis fait chuter les prix donnés et force un passage. */
async function drop(id, o) { setPx(o); const r = await check(id); assert.equal(r.s, 200, JSON.stringify(r.o)); assert.equal(r.o.ok, true, JSON.stringify(r.o)); return r.o; }

let P = await start(ENV, 19830); BASE = P.url;
assert.equal((await J('/__ping')).o.discordLink, true);

/* ── 1) 'both' : MP et notification ─────────────────────────────────────────────────────────────────────────────────────── */
{
  const A = browser('devA');
  setPx({ 'Sol Ring': '3.00', 'Arcane Signet': '2.00', 'Mana Vault': '40.00', 'Swords to Plowshares': '1.50' });
  let r = await put({ sub: A.sub, thr: 30, lang: 'fr', dm: 'both', items: [{ k: 'sol ring', n: 'Sol Ring', d: ['Deck *A*'] }, { k: 'arcane signet', n: 'Arcane Signet' }, { k: 'mana vault', n: 'Mana Vault', t: 3500 }, { k: 'swords to plowshares', n: 'Swords to Plowshares' }] }, JWT('jeanne'));
  assert.equal(r.s, 200); assert.equal(r.o.dm, 'both', 'mode gardé (jeton vérifié)'); const ID = r.o.id; await sleep(500);
  r = await get(ID); assert.deepEqual([r.o.dm, r.o.dmErr, r.o.push], ['both', undefined, true]);
  assert.equal(JSON.stringify(r.o).includes(UID.jeanne) || JSON.stringify(r.o).includes(tag(UID.jeanne)), false, 'ni UID ni empreinte rendus à l\'appli');
  const o = await drop(ID, { 'Sol Ring': '1.80' }); assert.equal(o.last.hits, 1);
  assert.equal(pushesFor(A).length, 1, 'notification aussi'); assert.equal(decrypt(pushesFor(A)[0].body, A).title, 'Sol Ring : −40 %');
  assert.equal(dmsTo(DU.jeanne).length, 1, 'MP envoyé'); assert.deepEqual(D.opened, [DU.jeanne], 'canal privé ouvert (recipient_id)');
  const b = dmsTo(DU.jeanne)[0].body, e = b.embeds[0];
  assert.deepEqual(b.allowed_mentions, { parse: [] }, 'aucun ping');
  assert.equal(b.content, '📉 **Sol Ring : −40 %**');
  assert.equal(e.title, 'Alertes de prix · Mana Orbit'); assert.equal(e.url, 'https://manaorbit.app/?alerts=1'); assert.match(e.description, /\[Ouvrir mes alertes dans Mana Orbit\]\(https:\/\/manaorbit\.app\/\?alerts=1\)/);
  assert.equal(e.fields.length, 1); assert.equal(e.fields[0].name, 'Sol Ring : −40 %');
  assert.equal(e.fields[0].value, '3,00 € → 1,80 € \\(tendance Cardmarket\\). · manque à Deck \\*A\\*\n[Voir sur Cardmarket](https://www.cardmarket.com/fr/Magic/Products/Search?searchString=Sol%20Ring)', 'prix habituel → actuel, deck (Markdown neutralisé), lien Cardmarket');
  assert.match(e.footer.text, /Tu reçois ce message parce que/);
  // prix cible + deuxième baisse : un seul message (résumé), canal privé déjà ouvert
  await drop(ID, { 'Mana Vault': '30.00', 'Swords to Plowshares': '0.90' });
  assert.equal(dmsTo(DU.jeanne).length, 2); assert.equal(D.opened.length, 1, 'canal privé gardé en mémoire');
  const e2 = dmsTo(DU.jeanne)[1].body.embeds[0]; assert.equal(dmsTo(DU.jeanne)[1].body.content, '📉 **2 cartes en baisse**');
  assert.deepEqual(e2.fields.map(f => f.name), ['Mana Vault à 30,00 €', 'Swords to Plowshares : −40 %']);
  assert.match(e2.fields[0].value, /^Sous ton prix cible de 35,00 € \\\(tendance Cardmarket\\\)\.\n\[Voir sur Cardmarket\]/, 'prix cible');
  assert.equal(pushesFor(A).length, 2, 'notification aussi (résumé)');
  await drop(ID, { 'Mana Vault': '29.00' }); assert.equal(dmsTo(DU.jeanne).length, 2, 'règles inchangées : rien de nouveau sous la cible');
  ok('« Les deux » : MP + notification ; canal privé ouvert une fois ; embed (prix habituel → actuel, cible, deck, Cardmarket, lien de l\'appli), allowed_mentions vide, Markdown neutralisé ; résumé et règles inchangés');
}

/* ── 2) 'only' : MP seul (anglais) ; MP refusés (50007) → notification, dmErr ; rouverts → MP, dmErr effacé ─────────────────── */
{
  const B = browser('devB');
  setPx({ 'Mox Diamond': '50.00', 'Chrome Mox': '60.00', 'Mox Opal': '30.00' });
  let r = await put({ sub: B.sub, thr: 30, lang: 'en', dm: 'only', items: [{ k: 'mox diamond', n: 'Mox Diamond' }, { k: 'chrome mox', n: 'Chrome Mox' }, { k: 'mox opal', n: 'Mox Opal' }] }, JWT('paul'));
  assert.equal(r.o.dm, 'only'); const ID = r.o.id; await sleep(500);
  let o = await drop(ID, { 'Mox Diamond': '25.00' }); assert.equal(o.last.hits, 1);
  assert.equal(pushesFor(B).length, 0, 'MP seulement : pas de notification');
  const b = dmsTo(DU.paul)[0].body; assert.equal(b.content, '📉 **Mox Diamond: −50%**'); assert.equal(b.embeds[0].title, 'Price alerts · Mana Orbit');
  assert.match(b.embeds[0].fields[0].value, /^€50\.00 → €25\.00 \\\(Cardmarket trend\\\)\.\n\[View on Cardmarket\]\(https:\/\/www\.cardmarket\.com\/en\/Magic\//);
  D.closed.add(DU.paul);
  o = await drop(ID, { 'Chrome Mox': '30.00' }); assert.equal(o.last.hits, 1, 'alerte arrivée quand même');
  assert.equal(pushesFor(B).length, 1, 'MP refusés (50007) : notification à la place'); assert.equal(decrypt(pushesFor(B)[0].body, B).title, 'Chrome Mox: −50%');
  r = await get(ID); assert.equal(r.o.dmErr, 'closed', 'raison rendue à l\'appli');
  assert.match(P.log(), /MP Discord impossible \(closed\), notification à la place/);
  D.closed.delete(DU.paul);
  await drop(ID, { 'Mox Opal': '15.00' }); assert.equal(dmsTo(DU.paul).length, 2); assert.equal(pushesFor(B).length, 1);
  r = await get(ID); assert.equal(r.o.dmErr, undefined, 'MP réussi : dmErr effacé');
  ok('« Discord (MP) » : MP seul, dans la langue de l\'appli ; MP refusés (50007) → notification à la place, dmErr « closed » dans GET ; MP rouverts → dmErr effacé');
}

/* ── 3) pas lié, plus membre, Discord en panne : notification à la place ──────────────────────────────────────────────────── */
{
  const Z = browser('devZ'), M = browser('devM'), J2 = browser('devJ2');
  setPx({ 'Lotus Petal': '5.00', 'Mana Crypt': '100.00', 'Jeweled Lotus': '80.00' });
  let r = await put({ sub: Z.sub, dm: 'only', items: [{ k: 'lotus petal', n: 'Lotus Petal' }] }, JWT('zoe')); assert.equal(r.o.dm, 'only', 'jeton vérifié : mode gardé même sans liaison (elle peut lier plus tard)'); const IZ = r.o.id;
  r = await put({ sub: M.sub, dm: 'both', items: [{ k: 'mana crypt', n: 'Mana Crypt' }] }, JWT('marc')); const IM = r.o.id;
  r = await put({ sub: J2.sub, dm: 'only', items: [{ k: 'jeweled lotus', n: 'Jeweled Lotus' }] }, JWT('jeanne')); const IJ = r.o.id;
  await sleep(500);
  const n0 = D.dms.length;
  await drop(IZ, { 'Lotus Petal': '2.00' }); assert.equal(pushesFor(Z).length, 1, 'pas lié : notification'); assert.equal((await get(IZ)).o.dmErr, 'unlinked');
  await drop(IM, { 'Mana Crypt': '50.00' }); assert.equal(pushesFor(M).length, 1); assert.equal((await get(IM)).o.dmErr, 'member', 'adhésion relue (2 jours) : parti du serveur');
  assert.ok(D.calls.includes(`GET /guilds/${G}/members/${DU.marc}`), 'adhésion relue par le bot');
  D.down = 4; await drop(IJ, { 'Jeweled Lotus': '40.00' }); D.down = 0;
  assert.equal(pushesFor(J2).length, 1, 'Discord en panne : notification'); assert.equal((await get(IJ)).o.dmErr, 'down');
  assert.equal(D.dms.length, n0, 'aucun MP parti');
  ok('pas lié (« unlinked »), plus membre (« member », adhésion relue), Discord en panne (« down ») : notification à la place, raison dans GET');
}

/* ── 4) jeton absent, faux, expiré : mode ignoré, sans erreur ─────────────────────────────────────────────────────────────── */
{
  const X = browser('devX');
  setPx({ 'Mox Amber': '10.00' });
  const its = [{ k: 'mox amber', n: 'Mox Amber' }];
  for (const [tok, why] of [[undefined, 'absent'], ['abc.def.ghi', 'faux'], [F.jwt(UID.jeanne, -60), 'expiré']]) {
    const r = await put({ sub: X.sub, dm: 'both', items: its }, tok); assert.equal(r.s, 200, why); assert.equal(r.o.dm, '', 'jeton ' + why + ' : mode ignoré');
  }
  let r = await put({ sub: X.sub, dm: 'both', items: its }, JWT('jeanne')); assert.equal(r.o.dm, 'both');
  r = await put({ sub: X.sub, dm: 'both', items: its }, 'abc.def.ghi'); assert.equal(r.o.dm, '', 'mode d\'avant effacé : jeton faux'); const IX = r.o.id;
  r = await put({ sub: X.sub, dm: 'carrier-pigeon', items: its }, JWT('jeanne')); assert.equal(r.o.dm, '', 'mode inconnu : ignoré');
  await sleep(400); const n0 = D.dms.length;
  await drop(IX, { 'Mox Amber': '5.00' }); assert.equal(pushesFor(X).length, 1); assert.equal(D.dms.length, n0, 'pas de MP');
  r = await get(IX); assert.deepEqual([r.o.dm, r.o.dmErr], ['', undefined]);
  assert.doesNotMatch(P.log(), /bad_token|trop d'essais/i);
  ok('jeton absent, faux ou expiré, mode inconnu : PUT 200, mode ignoré (dm ""), notification seule, pas de MP');
}

/* ── 5) appareil sans notification : 'only' avec une clé d'appareil ───────────────────────────────────────────────────────── */
{
  setPx({ 'Grim Monolith': '40.00' });
  const dev = 'dev-' + randomBytes(12).toString('hex'), its = [{ k: 'grim monolith', n: 'Grim Monolith' }];
  let r = await put({ dm: 'only', dev, lang: 'fr', items: its }); assert.equal(r.s, 400, 'sans jeton : refusé (pas de cible)'); assert.equal(r.o.error, 'bad_subscription');
  r = await put({ dm: 'only', dev: 'court', items: its }, JWT('jeanne')); assert.equal(r.s, 400, 'clé d\'appareil mal formée');
  r = await put({ dm: 'both', dev, items: its }, JWT('jeanne')); assert.equal(r.s, 400, '« Les deux » sans notification : refusé');
  r = await put({ dm: 'only', dev, items: its }, JWT('jeanne')); assert.equal(r.s, 200); assert.equal(r.o.dm, 'only'); const ID = r.o.id;
  assert.equal((await put({ dm: 'only', dev, items: its }, JWT('jeanne'))).o.id, ID, 'même appareil : même enregistrement');
  assert.notEqual((await put({ dm: 'only', dev, items: its }, JWT('paul'))).o.id, ID, 'autre compte : autre enregistrement');
  r = await get(ID); assert.deepEqual([r.o.dm, r.o.push], ['only', false]); await sleep(400);
  const n0 = dmsTo(DU.jeanne).length, p0 = pushed.length;
  await drop(ID, { 'Grim Monolith': '20.00' }); assert.equal(dmsTo(DU.jeanne).length, n0 + 1, 'MP'); assert.equal(pushed.length, p0, 'aucune notification');
  for (let i = 0; i < 4; i++) assert.equal((await put({ dm: 'only', dev: 'dev-' + randomBytes(12).toString('hex'), items: its }, JWT('jeanne'))).s, 200);
  r = await put({ dm: 'only', dev: 'dev-' + randomBytes(12).toString('hex'), items: its }, JWT('jeanne')); assert.equal(r.s, 429, '5 appareils sans notification par compte'); assert.equal(r.o.error, 'too_many_devices');
  // MP impossible : rien d'autre, raison gardée
  D.closed.add(DU.jeanne); setPx({ 'Grim Monolith': '40.00' }); await check(ID); await drop(ID, { 'Grim Monolith': '10.00' }); D.closed.delete(DU.jeanne);
  r = await get(ID); assert.equal(r.o.dmErr, 'closed'); assert.equal(pushed.length, p0, 'rien sur cet appareil');
  // liste vide : désinscrit
  r = await put({ dm: 'only', dev, items: [] }, JWT('jeanne')); assert.equal(r.o.watching, 0); assert.equal((await get(ID)).s, 404);
  ok('appareil sans notification : « Discord (MP) » avec une clé d\'appareil (jeton exigé, MP seul, même enregistrement, 5 par compte, MP refusés : dmErr, liste vide : désinscrit)');
}

/* ── 6) redémarrage : mode gardé ; ni UID, ni jeton, ni id Discord dans alerts.json et le journal ────────────────────────────── */
{
  await sleep(1800); assert.ok(existsSync(FILE)); const raw = readFileSync(FILE, 'utf8');
  for (const s of [...Object.values(UID), TOKEN, ...Object.values(DU)]) assert.equal(raw.includes(s), false, 'alerts.json sans ' + s);
  assert.ok(raw.includes(tag(UID.paul)), 'empreinte du compte gardée');
  for (const s of [...Object.values(UID), TOKEN, ...Object.values(DU), tag(UID.jeanne)]) assert.equal(P.log().includes(s), false, 'journal sans ' + s);
  const ids = JSON.parse(raw).subs.filter(r => r.dm).map(r => [r.id, r.dm]);
  await stop(P); P = await start(ENV, 19831); BASE = P.url;
  for (const [id, dm] of ids) assert.equal((await get(id)).o.dm, dm, 'mode retrouvé après un redémarrage');
  ok('redémarrage : mode et empreinte retrouvés ; ni UID, ni jeton, ni id Discord dans alerts.json ou le journal');
}

/* ── 7) bot coupé : mode ignoré, notification seule ───────────────────────────────────────────────────────────────────────── */
{
  await stop(P); P = await start({ ...ENV, DISCORD_BOT_TOKEN: '', ALERT_FILE: join(dir, 'off.json') }, 19832); BASE = P.url;
  const Y = browser('devY'); setPx({ 'Mana Drain': '50.00' });
  let r = await put({ sub: Y.sub, dm: 'both', items: [{ k: 'mana drain', n: 'Mana Drain' }] }, JWT('jeanne')); assert.deepEqual([r.s, r.o.dm], [200, '']);
  r = await put({ dm: 'only', dev: 'dev-' + randomBytes(12).toString('hex'), items: [{ k: 'mana drain', n: 'Mana Drain' }] }, JWT('jeanne')); assert.equal(r.s, 400, 'sans bot : pas d\'appareil sans notification');
  await sleep(400); await drop((await put({ sub: Y.sub, items: [{ k: 'mana drain', n: 'Mana Drain' }] })).o.id, { 'Mana Drain': '20.00' }); assert.equal(pushesFor(Y).length, 1);
  await stop(P);
  ok('bot coupé : mode ignoré (dm ""), notification seule');
}

console.log('DISCORD DM OK'); process.exit(0);
