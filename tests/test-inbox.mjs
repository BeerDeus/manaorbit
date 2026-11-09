// « Messages de l'équipe » côté serveur (inbox-srv.mjs, proxy.mjs › /api/inbox, /api/admin/inbox, /api/admin/scans/<id>/notify) : boîte d'un compte (jeton Firebase),
// non lus, marqués lus, suppression ; « Prévenir : réglé » d'un scan signalé (empreinte entière gardée dans les nouveaux signalements, jamais montrée ; préfixe de 16
// d'un ancien signalement retrouvé ; sans compte : personne à prévenir), message libre du panneau, notification FCM dans la langue de l'appareil (toucher : ./?inbox=1),
// sans appareil : gardé quand même ; compte supprimé : boîte effacée ; panneau réservé à l'éditeur ; INBOX=0 : coupé. Textes : ibNote (6 langues), traductions de
// l'appli. Faux Firebase (jetons, Firestore, FCM) : aucun accès réseau réel. Ports 19621 et 19622.
import './setup-env.mjs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFakes, tag } from './amis-fakes.mjs';
import { ADMIN } from './admin-fakes.mjs';
import { ibNote, IB_TXT } from '../server/inbox-srv.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = m => console.log('✓ ' + m);
const until = async (fn, ms = 5000) => { for (let t = 0; t < ms && !(await fn()); t += 50) await sleep(50); return fn(); };
const F = await startFakes();
const procs = [];
process.on('exit', () => { for (const p of procs) try { p.kill(); } catch {} F.stop(); });
const start = (env, port) => new Promise((resolve, reject) => {
  const c = spawn('node', ['server/proxy.mjs'], { env: { ...process.env, EDH_SOURCE_URL: '', PORT: String(port), CARDTRADER_TOKEN: '', ALERTS: '0', PUBDECKS: '0', BAD_KEY_DELAY_MS: '20', ADMIN_EMAILS: ADMIN, ...F.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.log = () => out;
  c.stdout.on('data', d => { out += d; if (/Mana Orbit →/.test(out)) resolve(c); }); c.stderr.on('data', d => { out += d; });
  c.on('exit', code => { if (code) reject(new Error('exit ' + code + ': ' + out)); });
  procs.push(c);
});
const j = async (url, init = {}) => { const r = await fetch(url, init); const t = await r.text(); let o; try { o = JSON.parse(t); } catch { o = t; } return { s: r.status, o, h: r.headers }; };
let ipN = 0; const ip = () => '198.51.100.' + (++ipN % 250);
const TOKA = 'fcm-alice:' + 'A'.repeat(140);      // jeton FCM plausible (100 caractères au moins)
const U = { a: 'uid-alice-0001', b: 'uid-bob-00002', adm: 'uid-admin-00' };
const tok = uid => F.jwt(uid, 3600, uid === U.adm ? { email: ADMIN, email_verified: true } : {});
const ib = (B, uid, path = '', method = 'GET', body) => j(B + '/api/inbox' + path, { method, headers: { 'X-Forwarded-For': ip(), ...(uid ? { 'x-firebase-token': tok(uid) } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
const adm = (B, path, method = 'GET', body, uid = U.adm) => j(B + '/api/admin' + path, { method, headers: { 'X-Forwarded-For': ip(), 'x-firebase-token': tok(uid), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
const JPG = readFileSync('tests/fixtures/swords.jpg');
const report = (B, uid, first) => j(B + '/api/scan-report', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip(), ...(uid ? { 'x-firebase-token': tok(uid) } : {}) },
  body: JSON.stringify({ img: 'data:image/jpeg;base64,' + JPG.toString('base64'), what: 'miss', note: 'Inconnue', meta: { v: 1, read: { first, frame: 'card' } } }) });

/* ── 0) Textes des notifications ─────────────────────────────────────────────────────────────────────────────────────── */
{
  assert.deepEqual(ibNote('fr', { k: 'scan', s: 'Lieur de foi bénalian' }), { title: 'Ton scan signalé est réglé', body: '« Lieur de foi bénalian » est maintenant reconnue. Merci pour ton signalement !' });
  assert.equal(ibNote('de', { k: 'scan' }).body, IB_TXT.de.scan0, 'sans carte : la phrase générale');
  assert.equal(ibNote('fr', { k: 'scan', s: 'X', x: 'Corrigé, merci !' }).body, 'Corrigé, merci !', 'mot de l\'équipe à la place de la phrase');
  assert.deepEqual(ibNote('en', { k: 'avis', s: 'Scan lent', ev: { replies: 1, tags: [], close: false }, x: 'C\'est réglé dans la 1.1.3' }), { title: 'Update on your feedback', body: '“Scan lent”: C\'est réglé dans la 1.1.3' });
  assert.match(ibNote('fr', { k: 'avis', s: 'Scan lent', ev: { replies: 0, tags: ['Corrigé'], close: true } }).body, /Scan lent.*marqué Corrigé, fil fermé/);
  assert.equal(ibNote('xx', { k: 'msg', x: 'Bonjour' }).title, 'Message de l\'équipe Mana Orbit', 'langue inconnue : français');
  assert.equal([...ibNote('fr', { k: 'msg', x: 'é'.repeat(400) }).body].length, 180, 'notification : 180 caractères au plus');
  for (const l of ['fr', 'en', 'de', 'es', 'it', 'pt']) for (const k of ['scanT', 'scan', 'scan0', 'msgT']) assert.ok(IB_TXT[l][k], l + '.' + k);
  ok('notifications : scan réglé (carte, phrase générale, mot de l\'équipe), réponse à un avis (texte recopié, étiquettes, fermé), message libre ; 6 langues, 180 caractères');
}

const DIR = mkdtempSync(join(tmpdir(), 'inbox-')), SR = join(DIR, 'scan-reports'), ADM = join(DIR, 'admin'); mkdirSync(SR, { recursive: true });
// un signalement d'avant (empreinte de 16 caractères seulement) : retrouvée par la boîte déjà connue du compte
const OLD = Date.now().toString(36) + '-0a0b0c0d';
writeFileSync(join(SR, OLD + '.jpg'), JPG); writeFileSync(join(SR, OLD + '.json'), JSON.stringify({ v: 1, id: OLD, t: parseInt(OLD, 36), what: 'card', note: '', acct: tag(U.b).slice(0, 16), img: { w: 1, h: 1, bytes: 1 }, meta: { read: { first: 'Émérite de l\'abondance' } } }));
const P = await start({ SCAN_REPORTS_DIR: SR, ADMIN_DIR: ADM }, 19621), B = 'http://127.0.0.1:19621';
for (let t = 0; t < 40 && !/Administration/.test(P.log()); t++) await sleep(50);

/* ── 1) Boîte d'un compte : vide, sans jeton ─────────────────────────────────────────────────────────────────────────── */
{
  assert.equal((await j(B + '/__ping')).o.inbox, true, '/__ping inbox : l\'appli montre la boîte');
  assert.deepEqual((await ib(B, U.a)).o, { items: [], unread: 0 });
  assert.equal((await ib(B, '')).s, 401, 'sans jeton');
  assert.equal((await j(B + '/api/inbox', { headers: { 'x-firebase-token': 'faux' } })).s, 401);
  assert.equal((await ib(B, U.a, '', 'POST', {})).s, 405); assert.equal((await ib(B, U.a, '/autre')).s, 404);
  ok('boîte : vide au départ, jeton exigé, routes inconnues refusées');
}

/* ── 2) « Prévenir : réglé » d'un scan signalé : notification FCM (langue de l'appareil), boîte, signalement marqué ─────── */
{
  assert.equal((await j(B + '/api/friends/me', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-firebase-token': tok(U.a), 'X-Forwarded-For': ip() }, body: JSON.stringify({ dev: { fcm: TOKA }, l: 'en' }) })).s, 200, 'appareil d\'Alice enregistré (anglais)');
  const r = await report(B, U.a, 'Lieur de foi bénalian'); assert.equal(r.s, 200);
  const rec = JSON.parse(readFileSync(join(SR, r.o.id + '.json'), 'utf8'));
  assert.equal(rec.who, tag(U.a), 'empreinte entière gardée dans le signalement'); assert.equal(rec.acct, tag(U.a).slice(0, 16));
  let l = await adm(B, '/scans'); const row = l.o.rows.find(x => x.id === r.o.id);
  assert.equal(row.to, 1, 'auteur à prévenir'); assert.equal('who' in row, false, 'empreinte entière jamais montrée au panneau');
  assert.equal((await adm(B, '/scans/' + r.o.id + '/notify', 'POST', {}, U.a)).s, 403, 'pas l\'éditeur');
  assert.equal((await adm(B, '/scans/' + r.o.id + '/notify', 'GET')).s, 405);
  const n = await adm(B, '/scans/' + r.o.id + '/notify', 'POST', { card: 'Lieur de foi bénalian', text: '' });
  assert.equal(n.s, 200, JSON.stringify(n.o)); assert.equal(n.o.ok, true); assert.equal(n.o.sent, 1, 'un appareil prévenu'); assert.ok(n.o.done.t > 0);
  await until(() => F.fcmFor(TOKA).length === 1);
  const m = F.fcmFor(TOKA)[0]; assert.deepEqual(m.notification, { title: 'Your scan report is fixed', body: '“Lieur de foi bénalian” is now recognized. Thanks for reporting it!' });
  assert.equal(m.data.url, './?inbox=1', 'toucher : la boîte de l\'appli');
  const box = await ib(B, U.a); assert.equal(box.o.unread, 1); assert.equal(box.o.items.length, 1);
  assert.deepEqual((({ k, s, r }) => ({ k, s, r }))(box.o.items[0]), { k: 'scan', s: 'Lieur de foi bénalian', r: 0 }); assert.equal(box.h.get('cache-control'), 'no-store');
  l = await adm(B, '/scans'); assert.ok(l.o.rows.find(x => x.id === r.o.id).done.t > 0, 'signalement marqué « prévenu »');
  ok('« Prévenir : réglé » : notification sur l\'appareil (anglais, toucher ./?inbox=1), message dans la boîte, signalement marqué ; empreinte entière gardée mais jamais montrée');
}

/* ── 3) Sans appareil : gardé ; signalement d'avant (16 caractères) ; sans compte : personne ─────────────────────────────── */
{
  await adm(B, '/inbox', 'POST', { to: tag(U.b), text: 'Bienvenue !' });      // Bob a déjà une boîte : son préfixe se retrouve
  let n = await adm(B, '/scans/' + OLD + '/notify', 'POST', { text: 'Réglé dans la dernière version, merci !' });
  assert.equal(n.s, 200, JSON.stringify(n.o)); assert.equal(n.o.sent, 0, 'aucun appareil : gardé seulement');
  const box = await ib(B, U.b); assert.equal(box.o.unread, 2); assert.deepEqual(box.o.items.map(x => [x.k, x.s || '', x.x]), [['scan', 'Émérite de l\'abondance', 'Réglé dans la dernière version, merci !'], ['msg', '', 'Bienvenue !']], 'plus récents d\'abord');
  const anon = await report(B, '', 'Offre'); n = await adm(B, '/scans/' + anon.o.id + '/notify', 'POST', {});
  assert.equal(n.s, 409); assert.match(n.o.message, /sans compte/);
  assert.equal((await adm(B, '/scans')).o.rows.find(x => x.id === anon.o.id).to, 0, 'sans compte : pas de bouton');
  ok('sans appareil : message gardé (lu à la prochaine ouverture) ; ancien signalement : compte retrouvé par son préfixe ; sans compte : personne à prévenir (409)');
}

/* ── 4) Message libre : refus, préfixe inconnu ; lu, supprimé ───────────────────────────────────────────────────────── */
{
  assert.equal((await adm(B, '/inbox', 'POST', { to: tag(U.a), text: '' })).s, 400);
  assert.equal((await adm(B, '/inbox', 'POST', { to: tag(U.a), text: 'x'.repeat(1501) })).s, 400);
  assert.equal((await adm(B, '/inbox', 'POST', { to: 'ffffffffffffffff', text: 'Coucou' })).s, 404, 'préfixe inconnu');
  assert.equal((await adm(B, '/inbox', 'POST', { id: 'ligne-inconnue', text: 'Coucou' })).s, 404);
  assert.equal((await adm(B, '/inbox', 'POST', { to: tag(U.a), text: 'Coucou' }, U.b)).s, 403, 'pas l\'éditeur');
  const s0 = await adm(B, '/inbox'); assert.equal(s0.s, 200); assert.equal(s0.o.accounts, 2);
  const n = await adm(B, '/inbox', 'POST', { to: tag(U.a).slice(0, 16), text: 'Ligne 1\nLigne 2' }); assert.equal(n.s, 200); assert.equal(n.o.sent, 1);
  await until(() => F.fcmFor(TOKA).length === 2); assert.deepEqual(F.fcmFor(TOKA)[1].notification, { title: 'Message from the Mana Orbit team', body: 'Ligne 1 Ligne 2' });
  let box = await ib(B, U.a); assert.equal(box.o.unread, 2); assert.equal(box.o.items[0].x, 'Ligne 1\nLigne 2', 'retours à la ligne gardés dans la boîte');
  assert.deepEqual((await ib(B, U.a, '/read', 'POST', { ids: [box.o.items[0].id] })).o, { unread: 1 });
  assert.deepEqual((await ib(B, U.a, '/read', 'POST', { all: true })).o, { unread: 0 });
  assert.equal((await ib(B, U.b, '/' + box.o.items[0].id, 'DELETE')).s, 404, 'le message d\'un autre : introuvable');
  assert.deepEqual((await ib(B, U.a, '/' + box.o.items[0].id, 'DELETE')).o, { unread: 0 });
  box = await ib(B, U.a); assert.equal(box.o.items.length, 1);
  ok('message libre : texte vide ou trop long, compte inconnu, autre que l\'éditeur refusés ; préfixe de 16 ; marqué lu (un, tous), supprimé (le sien seulement)');
}

/* ── 5) 30 messages au plus ; fichier relu après un redémarrage ; compte supprimé : boîte effacée ───────────────────── */
{
  for (let i = 0; i < 32; i++) await adm(B, '/inbox', 'POST', { to: tag(U.b), text: 'n' + i });
  let box = await ib(B, U.b); assert.equal(box.o.items.length, 30, '30 au plus'); assert.equal(box.o.items[0].x, 'n31');
  P.kill(); await sleep(300);
  const P2 = await start({ SCAN_REPORTS_DIR: SR, ADMIN_DIR: ADM }, 19621);
  box = await ib(B, U.b); assert.equal(box.o.items.length, 30, 'relu du fichier après un redémarrage');
  assert.equal((await j(B + '/api/friends/me', { method: 'DELETE', headers: { 'x-firebase-token': tok(U.b), 'X-Forwarded-For': ip() } })).s, 200);
  assert.deepEqual((await ib(B, U.b)).o, { items: [], unread: 0 }, 'compte supprimé : boîte effacée');
  assert.ok(!readFileSync(join(ADM, 'inbox.json'), 'utf8').includes(tag(U.b)), 'plus rien dans le fichier');
  P2.kill();
  ok('30 messages au plus par compte, relus après un redémarrage ; compte supprimé (DELETE /api/friends/me) : boîte effacée');
}

/* ── 6) INBOX=0 : coupé ─────────────────────────────────────────────────────────────────────────────────────────────── */
{
  const P3 = await start({ INBOX: '0', SCAN_REPORTS_DIR: SR, ADMIN_DIR: join(DIR, 'a3') }, 19622), B3 = 'http://127.0.0.1:19622';
  assert.equal((await j(B3 + '/__ping')).o.inbox, false);
  assert.equal((await ib(B3, U.a)).s, 404); assert.equal((await adm(B3, '/inbox')).s, 404);
  assert.equal((await adm(B3, '/scans')).o.rows.every(x => x.to === 0), true, 'aucun bouton « Prévenir »');
  assert.ok(!existsSync(join(DIR, 'a3', 'inbox.json')));
  P3.kill();
  ok('INBOX=0 : boîte et panneau 404, /__ping inbox: false, aucun bouton « Prévenir »');
}

/* ── 7) Textes de l'appli traduits (src/inbox.js) ───────────────────────────────────────────────────────────────────── */
{
  const src = readFileSync('src/inbox.js', 'utf8'), keys = new Set();
  for (const m of src.matchAll(/\bTN?\(\s*(?:[\w.]+\s*,\s*)?'((?:[^'\\]|\\.)*)'(?:\s*,\s*'((?:[^'\\]|\\.)*)')?/g)) for (const k of [m[1], m[2]]) if (k) keys.add(k.replace(/\\'/g, '\''));
  for (const v of Object.values(Object.fromEntries([...src.matchAll(/'([^']+)': '((?:[^'\\]|\\.)*)'/g)].filter(m => /IB_TAGS/.test(src.slice(Math.max(0, m.index - 400), m.index))).map(m => [m[1], m[2]])))) keys.add(v.replace(/\\'/g, '\''));
  for (const l of ['en', 'de', 'es', 'it', 'pt']) {
    const all = Object.assign({}, ...readdirSync('src/i18n').filter(f => f.startsWith(l + '.')).map(f => JSON.parse(readFileSync(join('src/i18n', f), 'utf8'))));
    assert.deepEqual([...keys].filter(k => !(k in all)), [], l + ' : textes de inbox.js sans traduction');
  }
  ok(keys.size + ' textes de inbox.js traduits en anglais, allemand, espagnol, italien et portugais');
}
console.log('\nINBOX OK');
process.exit(0);
