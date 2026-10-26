// « Signaler un problème de scan », côté serveur (proxy.mjs › /api/scan-report, /api/admin/scans…) : envoi valide (photo JPEG + lecture nettoyée, sans compte,
// ou avec un compte : empreinte seulement), refus (type, commentaire, données, image, taille, JSON), limites par réseau et par compte, place (nombre, Mo),
// durée (jours), restes d'un envoi interrompu, panneau d'administration (liste, photo, suppression, résumé) réservé au compte de l'éditeur,
// interrupteur SCAN_REPORTS=0 (404, /__ping scanrep: false). Dictionnaires : chaque texte de src/scanreport.js traduit dans les 5 langues. Ports 19610 à 19613.
import './setup-env.mjs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFakes } from './amis-fakes.mjs';
import { ADMIN } from './admin-fakes.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = m => console.log('✓ ' + m);
const F = await startFakes();
const procs = [];
process.on('exit', () => { for (const p of procs) try { p.kill(); } catch {} F.stop(); });
const start = (env, port) => new Promise((resolve, reject) => {
  const c = spawn('node', ['server/proxy.mjs'], { env: { ...process.env, EDH_SOURCE_URL: '', PORT: String(port), CARDTRADER_TOKEN: '', ALERTS: '0', PUBDECKS: '0', BAD_KEY_DELAY_MS: '20', FIREBASE_JWKS_URL: F.env.FIREBASE_JWKS_URL, ADMIN_EMAILS: ADMIN, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.log = () => out;
  c.stdout.on('data', d => { out += d; if (/Mana Orbit →/.test(out)) resolve(c); }); c.stderr.on('data', d => { out += d; });
  c.on('exit', code => { if (code) reject(new Error('exit ' + code + ': ' + out)); });
  procs.push(c);
});
const j = async (url, init = {}) => { const r = await fetch(url, init); const b = Buffer.from(await r.arrayBuffer()), t = b.toString('utf8'); let o; try { o = JSON.parse(t); } catch { o = t; } return { s: r.status, o, b, h: r.headers }; };
const JPG = readFileSync('tests/fixtures/swords.jpg'), JPG2 = readFileSync('tests/fixtures/anneau.jpg');
const url64 = b => 'data:image/jpeg;base64,' + b.toString('base64');
const META = { v: 1, build: 'abc12345', app: 'android', ui: 'fr', ocr: 'mlkit', frame: 'card', read: { raw: 'Anneau solaire', hit: { name: 'Sol Ring', card: 'de', score: 0.91 }, foot: { raw: '0202 U / DSK • DE', ft: { codes: ['DSK'], nums: ['202'], lang: 'de' } } } };
const body = (o = {}) => JSON.stringify({ img: url64(JPG), what: 'lang', note: 'Carte française lue en allemand', meta: META, ...o });
let ipN = 0;
const ip = () => '198.51.100.' + (++ipN % 250);      // une adresse par envoi : la limite par réseau ne gêne pas les autres essais
const send = (B, o = {}, { tok = '', from = ip(), raw = null } = {}) => j(B + '/api/scan-report', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': from, ...(tok ? { 'x-firebase-token': tok } : {}) }, body: raw != null ? raw : body(o) });
const ADM = () => F.jwt('uid-admin-00', 3600, { email: ADMIN, email_verified: true });
const JEANNE = () => F.jwt('uid-jeanne-01', 3600, { email: 'jeanne@example.net', email_verified: true });
const adm = (B, path = '', { tok = ADM(), method = 'GET' } = {}) => j(B + '/api/admin' + path, { method, headers: tok ? { 'x-firebase-token': tok } : {} });
const files = dir => (existsSync(dir) ? readdirSync(dir).sort() : []);
const idOf = (t, hex = '0a0b0c0d') => t.toString(36) + '-' + hex;

/* ── 1) Envoi valide, données nettoyées, compte ─────────────────────────────────────────────────────────────────────────────── */
const DIR = join(mkdtempSync(join(tmpdir(), 'scanrep-')), 'scan-reports'); mkdirSync(DIR, { recursive: true });
// reste du disque : un signalement de 91 jours (effacé), un de 2 jours (gardé), une image sans fiche et un fichier temporaire anciens (effacés)
const OLD = idOf(Date.now() - 91 * 86400e3, '11111111'), KEEP = idOf(Date.now() - 2 * 86400e3, '22222222'), ORPH = idOf(Date.now() - 3600e3, '33333333'), TMP = idOf(Date.now() - 3600e3, '44444444');
for (const id of [OLD, KEEP]) { writeFileSync(join(DIR, id + '.jpg'), JPG2); writeFileSync(join(DIR, id + '.json'), JSON.stringify({ v: 1, id, t: parseInt(id, 36), what: 'card', note: '', acct: '', img: { w: 1, h: 1, bytes: JPG2.length }, meta: {} })); }
writeFileSync(join(DIR, ORPH + '.jpg'), JPG2); writeFileSync(join(DIR, TMP + '.json.tmp'), '{');
const P1 = await start({ SCAN_REPORTS_DIR: DIR, SCAN_REPORTS_MAX: '6', SCAN_REPORTS_PER_H: '6' }, 19610), B1 = 'http://127.0.0.1:19610';
for (let t = 0; t < 40 && !/Administration/.test(P1.log()); t++) await sleep(50);
assert.match(P1.log(), /Scans signalés : 6 au plus, 200 Mo, gardés 90 jours\./);
{
  const ping = await j(B1 + '/__ping'); assert.equal(ping.o.scanrep, true, '/__ping scanrep : bouton montré par l\'appli');
  const weird = { ...META, read: { ...META.read, raw: 'Anneau\u0000‮ solaire' }, deep: { a: { b: { c: { d: { e: 1 } } } } }, list: Array.from({ length: 30 }, (_, i) => i), long: 'x'.repeat(500), nan: 'NaN', 'bad key!': 1, ['__proto__']: { polluted: true }, fn: { f: 1.5 } };
  const r = await send(B1, { note: '  Carte\u0007 française\n lue en allemand  ', meta: weird });
  assert.equal(r.s, 200, JSON.stringify(r.o)); assert.equal(r.o.ok, true); assert.match(r.o.id, /^[0-9a-z]{8,10}-[0-9a-f]{8}$/);
  const id = r.o.id, rec = JSON.parse(readFileSync(join(DIR, id + '.json'), 'utf8'));
  assert.deepEqual(readFileSync(join(DIR, id + '.jpg')), JPG, 'photo gardée telle quelle');
  assert.equal(rec.what, 'lang'); assert.equal(rec.note, 'Carte française lue en allemand', 'commentaire : contrôles et espaces en trop retirés');
  assert.equal(rec.acct, '', 'sans compte : aucune empreinte'); assert.deepEqual(rec.img, { w: 745, h: 1040, bytes: JPG.length }, 'dimensions lues dans le JPEG');
  assert.ok(Math.abs(rec.t - Date.now()) < 10000); assert.equal(rec.id, id);
  assert.equal(rec.meta.read.raw, 'Anneau   solaire', 'caractères de contrôle et de mise en forme retirés');
  assert.equal(rec.meta.read.hit.name, 'Sol Ring'); assert.equal(rec.meta.read.foot.ft.lang, 'de'); assert.equal(rec.meta.ocr, 'mlkit'); assert.equal(rec.meta.build, 'abc12345');
  assert.deepEqual(rec.meta.deep, { a: { b: { c: { d: null } } } }, '5 niveaux au plus'); assert.equal(rec.meta.list.length, 20, '20 éléments au plus'); assert.equal(rec.meta.long.length, 300, 'textes de 300 caractères au plus');
  assert.ok(!('bad key!' in rec.meta), 'clé invalide retirée'); assert.equal(Object.getPrototypeOf(rec.meta), Object.prototype); assert.equal({}.polluted, undefined); assert.ok(!Object.keys(rec.meta).includes('__proto__'));
  const all = readFileSync(join(DIR, id + '.json'), 'utf8'); assert.ok(!/198\.51\.100|Mozilla|node/i.test(all), 'ni adresse IP, ni navigateur');
  assert.ok(!existsSync(join(DIR, OLD + '.json')) && !existsSync(join(DIR, OLD + '.jpg')), 'signalement de 91 jours effacé');
  assert.ok(existsSync(join(DIR, KEEP + '.json')), 'signalement de 2 jours gardé');
  assert.ok(!existsSync(join(DIR, ORPH + '.jpg')) && !existsSync(join(DIR, TMP + '.json.tmp')), 'restes d\'un envoi interrompu effacés');
  assert.ok(!files(DIR).some(f => f.endsWith('.tmp')), 'aucun fichier temporaire après l\'envoi');
  ok('envoi valide sans compte : photo et fiche sur le disque (JPEG intact, dimensions lues), commentaire et données nettoyés (contrôles, 5 niveaux, 20 éléments, 300 caractères, clés, __proto__), ni IP ni navigateur ; au premier envoi : plus de 90 jours et restes effacés');

  const tok = F.jwt('uid-tester-42', 3600, { email: 'tester@example.net' });
  const r2 = await send(B1, { what: 'card', note: '' }, { tok }); assert.equal(r2.s, 200);
  const rec2 = JSON.parse(readFileSync(join(DIR, r2.o.id + '.json'), 'utf8'));
  assert.equal(rec2.acct, createHash('sha256').update('uid-tester-42').digest('hex').slice(0, 16), 'connecté : empreinte du compte');
  assert.ok(!readFileSync(join(DIR, r2.o.id + '.json'), 'utf8').includes('uid-tester-42') && !readFileSync(join(DIR, r2.o.id + '.json'), 'utf8').includes('tester@'), 'jamais l\'UID ni l\'e-mail');
  let x = await send(B1, {}, { tok: F.jwt('uid-tester-42', -60) }); assert.equal(x.s, 401); assert.equal(x.o.error, 'token_expired', 'jeton expiré : l\'appli le renouvelle');
  x = await send(B1, {}, { tok: tok.slice(0, -6) + 'AAAAAA' }); assert.equal(x.s, 401); assert.equal(x.o.error, 'bad_token');
  ok('avec un compte : seule l\'empreinte (16 caractères du SHA-256 de l\'UID) est gardée, ni UID ni e-mail ; jeton expiré 401 token_expired, jeton faux 401 bad_token');
}

/* ── 2) Refus ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
{
  const n0 = files(DIR).length;
  const cases = [
    [{ what: 'oops' }, 400, 'bad_what'], [{ what: undefined }, 400, 'bad_what'], [{ note: 'x'.repeat(301) }, 400, 'bad_note'], [{ note: 42 }, 400, 'bad_note'],
    [{ meta: undefined }, 400, 'bad_meta'], [{ meta: [1, 2] }, 400, 'bad_meta'], [{ meta: { big: 'x'.repeat(9000) } }, 413, 'too_large'],
    [{ img: undefined }, 400, 'bad_image'], [{ img: 'https://exemple.fr/a.jpg' }, 400, 'bad_image'], [{ img: 'data:image/png;base64,' + JPG.toString('base64') }, 400, 'bad_image'],
    [{ img: url64(Buffer.concat([Buffer.from('GIF89a'), JPG.subarray(6)])) }, 400, 'bad_image'], [{ img: url64(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xd9]), Buffer.alloc(400)])) }, 400, 'bad_image'],
    [{ img: url64(Buffer.concat([JPG.subarray(0, 4), Buffer.alloc(352 * 1024)])) }, 413, 'too_large'], [{ img: 'data:image/jpeg;base64,@@@' }, 400, 'bad_image'],
  ];
  for (const [o, s, e] of cases) { const r = await send(B1, o); assert.equal(r.s, s, JSON.stringify(o).slice(0, 80) + ' → ' + JSON.stringify(r.o)); assert.equal(r.o.error, e, JSON.stringify(o).slice(0, 80)); }
  let r = await send(B1, {}, { raw: '{abîmé' }); assert.equal(r.s, 400); assert.equal(r.o.error, 'bad_request');
  r = await send(B1, {}, { raw: '[1]' }); assert.equal(r.s, 400);
  r = await send(B1, {}, { raw: JSON.stringify({ img: 'data:image/jpeg;base64,' + 'A'.repeat(600 * 1024), what: 'card', meta: {} }) }); assert.equal(r.s, 413, 'corps trop gros : 413 sans tout lire'); assert.equal(r.o.error, 'too_large');
  r = await j(B1 + '/api/scan-report'); assert.equal(r.s, 405, 'GET : rien à lire publiquement');
  r = await j(B1 + '/api/scan-report', { method: 'POST', headers: { 'Content-Type': 'text/plain', 'X-Forwarded-For': ip() }, body: body() }); assert.equal(r.s, 415, 'serveur local : JSON exigé');
  assert.equal(files(DIR).length, n0, 'rien d\'écrit pour un refus');
  ok('refus : type inconnu, commentaire trop long ou pas du texte, données absentes ou trop longues (413), pas une photo JPEG (URL, PNG, GIF, sans dimensions, base64 invalide), photo de plus de 350 Ko (413), corps trop gros (413), JSON invalide, GET 405 ; rien n\'est écrit');
}

/* ── 3) Limites par réseau et par compte ──────────────────────────────────────────────────────────────────────────────────── */
{
  let r; const from = '203.0.113.9';
  for (let i = 0; i < 6; i++) { r = await send(B1, { what: 'other' }, { from }); assert.equal(r.s, 200, 'envoi ' + (i + 1) + ' du réseau'); }
  r = await send(B1, {}, { from }); assert.equal(r.s, 429, '7e envoi de l\'heure depuis ce réseau'); assert.equal(r.o.error, 'rate_limited'); assert.ok(Number(r.h.get('retry-after')) >= 1);
  r = await send(B1, { what: 'other' }, { from: '203.0.113.77' }); assert.equal(r.s, 200, 'autre réseau : son propre budget');
  const tok = F.jwt('uid-busy-07', 3600);
  for (let i = 0; i < 6; i++) { r = await send(B1, { what: 'ed' }, { tok }); assert.equal(r.s, 200, 'envoi ' + (i + 1) + ' du compte'); }
  r = await send(B1, {}, { tok }); assert.equal(r.s, 429, '7e envoi du compte, depuis un autre réseau'); assert.match(r.o.message, /ce compte/);
  ok('limites : SCAN_REPORTS_PER_H envois par heure et par réseau (429, Retry-After ; autre réseau libre), autant par compte quel que soit le réseau');
}

/* ── 4) Place : SCAN_REPORTS_MAX ; panneau d'administration ─────────────────────────────────────────────────────────────────── */
{
  const jsons = files(DIR).filter(f => f.endsWith('.json')), jpgs = files(DIR).filter(f => f.endsWith('.jpg'));
  assert.equal(jsons.length, 6, 'au plus SCAN_REPORTS_MAX signalements (' + jsons.length + ')'); assert.equal(jpgs.length, 6, 'photos effacées avec leur fiche');
  assert.ok(!existsSync(join(DIR, KEEP + '.json')), 'les plus anciens partent d\'abord');
  // accès : sans jeton, autre compte, adresse non vérifiée
  for (const path of ['/scans', '/scans/' + jsons[0].replace('.json', '.jpg')]) {
    let r = await adm(B1, path, { tok: '' }); assert.equal(r.s, 401, path + ' sans jeton');
    r = await adm(B1, path, { tok: JEANNE() }); assert.equal(r.s, 403, path + ' autre compte'); assert.deepEqual(r.o, { error: 'forbidden', message: 'Accès réservé.' });
    r = await adm(B1, path, { tok: F.jwt('uid-admin-00', 3600, { email: ADMIN, email_verified: false }) }); assert.equal(r.s, 403, path + ' adresse non vérifiée');
  }
  let r = await adm(B1, '/scans/' + jsons[0].replace('.json', ''), { tok: JEANNE(), method: 'DELETE' }); assert.equal(r.s, 403, 'supprimer : compte de l\'éditeur seulement');
  assert.equal(files(DIR).length, 12, 'rien d\'effacé');
  // liste
  r = await adm(B1, '/scans'); assert.equal(r.s, 200); assert.equal(r.h.get('cache-control'), 'no-store'); assert.match(r.h.get('x-robots-tag'), /noindex/);
  assert.equal(r.o.total, 6); assert.equal(r.o.n, 6); assert.equal(r.o.rows.length, 6); assert.equal(r.o.page, 1); assert.equal(r.o.days, 90); assert.equal(r.o.max, 6); assert.ok(r.o.mb > 0);
  const ts = r.o.rows.map(x => x.t); assert.deepEqual(ts, ts.slice().sort((a, b) => b - a), 'plus récents d\'abord');
  assert.deepEqual(Object.keys(r.o.rows[0]).sort(), ['acct', 'id', 'img', 'meta', 'note', 't', 'v', 'what']);
  const acc = r.o.rows.find(x => x.what === 'ed'); assert.equal(acc.acct, createHash('sha256').update('uid-busy-07').digest('hex').slice(0, 16));
  // photo
  const id = r.o.rows[0].id;
  let im = await adm(B1, `/scans/${id}.jpg`); assert.equal(im.s, 200); assert.equal(im.h.get('content-type'), 'image/jpeg'); assert.equal(im.h.get('cache-control'), 'no-store'); assert.match(im.h.get('x-robots-tag'), /noindex/);
  assert.deepEqual(im.b, readFileSync(join(DIR, id + '.jpg')), 'photo servie telle quelle');
  im = await j(B1 + `/scans/${id}.jpg`); assert.equal(im.s, 404, 'aucune adresse publique pour la photo');
  for (const bad of ['/scans/..%2F..%2Fproxy.mjs', '/scans/' + id + '%2F..', '/scans/zz.jpg', '/scans/' + id + '.png', '/scans/' + id.toUpperCase() + '.jpg']) { const x = await adm(B1, bad); assert.equal(x.s, 404, bad); }
  assert.equal((await adm(B1, `/scans/${id}.jpg`, { method: 'DELETE' })).s, 405);
  assert.equal((await adm(B1, '/scans', { method: 'DELETE' })).s, 405);
  // suppression
  r = await adm(B1, '/scans/' + id, { method: 'DELETE' }); assert.equal(r.s, 200); assert.equal(r.o.ok, true); assert.equal(r.o.n, 5);
  assert.ok(!existsSync(join(DIR, id + '.json')) && !existsSync(join(DIR, id + '.jpg')), 'photo et fiche effacées');
  assert.equal((await adm(B1, '/scans/' + id, { method: 'DELETE' })).s, 404, 'déjà effacé');
  assert.equal((await adm(B1, `/scans/${id}.jpg`)).s, 404);
  // résumé du panneau
  r = await adm(B1, ''); assert.equal(r.s, 200); assert.deepEqual([r.o.scans.n, r.o.scans.n7, r.o.scans.max, r.o.scans.days], [5, 5, 6, 90]); assert.equal(r.o.srv.flags.scans, true);
  ok('place : au plus SCAN_REPORTS_MAX signalements, les plus anciens partent (photo et fiche) ; panneau : liste (plus récents d\'abord, no-store, noindex), photo (route admin seulement, intacte), suppression, résumé (nombre, 7 jours, Mo) ; sans jeton 401, autre compte ou adresse non vérifiée 403 sans rien, chemins douteux 404');
}
P1.kill();

/* ── 5) Place en Mo, durée ────────────────────────────────────────────────────────────────────────────────────────────────── */
{
  const dir = join(mkdtempSync(join(tmpdir(), 'scanrep-')), 'r'), P = await start({ SCAN_REPORTS_DIR: dir, SCAN_REPORTS_MB: '0.2' }, 19611), B = 'http://127.0.0.1:19611';      // 0,2 Mo : deux photos de 87 Ko, pas trois
  for (let i = 0; i < 4; i++) assert.equal((await send(B)).s, 200);
  assert.equal(files(dir).filter(f => f.endsWith('.json')).length, 2, 'au plus SCAN_REPORTS_MB : les plus anciens partent');
  P.kill();
  const dir2 = join(mkdtempSync(join(tmpdir(), 'scanrep-')), 'r'), P2 = await start({ SCAN_REPORTS_DIR: dir2, SCAN_REPORTS_DAYS: String(1.5 / 86400) }, 19612), B2 = 'http://127.0.0.1:19612';      // 1,5 s
  assert.equal((await send(B2)).s, 200); assert.equal(files(dir2).length, 2);
  let r = await adm(B2, '/scans'); assert.equal(r.o.total, 1);
  await sleep(1700);
  r = await adm(B2, '/scans'); assert.equal(r.s, 200); assert.equal(r.o.total, 0, 'plus vieux que SCAN_REPORTS_DAYS : effacé à la lecture du panneau'); assert.deepEqual(files(dir2), []);
  P2.kill();
  ok('place en Mo (SCAN_REPORTS_MB) : les plus anciens partent ; durée (SCAN_REPORTS_DAYS) : effacés à la lecture du panneau (et à chaque envoi, au démarrage, toutes les 6 h)');
}

/* ── 6) SCAN_REPORTS=0 : coupé ───────────────────────────────────────────────────────────────────────────────────────────── */
{
  const dir = join(mkdtempSync(join(tmpdir(), 'scanrep-')), 'r'), P = await start({ SCAN_REPORTS: '0', SCAN_REPORTS_DIR: dir }, 19613), B = 'http://127.0.0.1:19613';
  for (let t = 0; t < 40 && !/Administration/.test(P.log()); t++) await sleep(50);
  assert.doesNotMatch(P.log(), /Scans signalés/);
  assert.equal((await j(B + '/__ping')).o.scanrep, false, '/__ping scanrep: false : l\'appli cache le bouton');
  let r = await send(B); assert.equal(r.s, 404); assert.equal(files(dir).length, 0);
  r = await adm(B, '/scans'); assert.equal(r.s, 404);
  r = await adm(B, ''); assert.equal(r.s, 200); assert.equal(r.o.scans, null, 'panneau : section cachée'); assert.equal(r.o.srv.flags.scans, false);
  P.kill();
  ok('SCAN_REPORTS=0 : envoi et panneau 404, /__ping scanrep: false, résumé null, rien sur le disque');
}

/* ── 7) Textes de l'appli : traduits dans les 5 langues (src/i18n/<langue>.scanreport.json) ─────────────────────────────────── */
{
  const src = readFileSync('src/scanreport.js', 'utf8'), keys = new Set();
  for (const m of src.matchAll(/\bTN?\(\s*(?:[\w.]+\s*,\s*)?'((?:[^'\\]|\\.)*)'(?:\s*,\s*'((?:[^'\\]|\\.)*)')?/g)) { for (const k of [m[1], m[2]]) if (k) keys.add(k.replace(/\\'/g, '\'').replace(/\\n/g, '\n')); }
  assert.ok(keys.size >= 20, 'textes trouvés : ' + keys.size);
  for (const l of ['en', 'de', 'es', 'it', 'pt']) {
    const all = Object.assign({}, ...readdirSync('src/i18n').filter(f => f.startsWith(l + '.')).map(f => JSON.parse(readFileSync(join('src/i18n', f), 'utf8'))));
    const own = JSON.parse(readFileSync(`src/i18n/${l}.scanreport.json`, 'utf8'));
    const miss = [...keys].filter(k => !(k in all)); assert.deepEqual(miss, [], l + ' : textes sans traduction');
    assert.ok(Object.keys(own).length >= 15, l + '.scanreport.json');
  }
  ok(keys.size + ' textes de scanreport.js traduits en anglais, allemand, espagnol, italien et portugais');
}
console.log('\nSCANREPORT OK');
process.exit(0);
