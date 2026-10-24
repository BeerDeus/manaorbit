// Santé du serveur pour le panneau d'administration (/admin › Serveur) : srv-stat.mjs (familles de routes, compteur de requêtes en fenêtre glissante de
// 60 s et pic de l'heure avec une horloge injectée, dossier des données, plafond de mémoire, seuils), puis le vrai proxy.mjs (port 19880) :
// GET /api/admin/server réservé à l'éditeur (sans jeton 401, autre compte 403 sans données), mémoire et caches avec leurs plafonds, démarrages
// (redémarrage = même version, gardés dans boot.json), requêtes comptées par famille, en direct, disque (date du plus ancien fichier, relu au plus
// toutes les 10 min, ?disk=1 forcé), historique des prix, avis « VPS » d'après SERVER_MEM_MB ; rien de personnel (ni IP, ni UID, ni e-mail).
import './setup-env.mjs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { reqMeter, reqFam, REQ_FAMS, dirStat, memLimit, memNow, level, loadMeter } from '../srv-stat.mjs';
import { startFakes } from './amis-fakes.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = m => console.log('✓ ' + m);

/* ── 1) Familles de routes ──────────────────────────────────────────────────────────────────────────────────────────── */
{
  const want = { '/': 'page', '/index.html': 'page', '/sw.js': 'page', '/fr-names.tsv': 'page', '/__ping': 'page', '/flyer': 'page', '/q/discord': 'page',
    '/api/marketplace/products': 'prix', '/api/jobs': 'prix', '/api/jobs/abc': 'prix', '/api/expansions': 'prix', '/api/hist': 'prix',
    '/api/alerts': 'alertes', '/api/alerts/check': 'alertes', '/api/troc/s': 'troc', '/api/partie/op': 'partie', '/api/daily/guess': 'mystere', '/api/level': 'mystere',
    '/api/discord/link': 'discord', '/api/feedback': 'discord', '/api/feedback/members': 'discord', '/api/admin': 'admin', '/api/admin/server': 'admin', '/admin': 'admin', '/admin/app.js': 'admin',
    '/api/friends': 'autres', '/api/pubdecks': 'autres', '/api/import': 'autres', '/api/names/find': 'autres', '/__/auth/handler': 'autres', '/administration': 'page' };
  for (const [p, f] of Object.entries(want)) assert.equal(reqFam(p), f, p);
  assert.deepEqual(REQ_FAMS, ['page', 'prix', 'alertes', 'troc', 'partie', 'mystere', 'discord', 'admin', 'autres']);
  ok('familles de routes : page et fichiers, prix et recherches CardTrader, alertes, échange en direct, parties, Carte mystère, Discord, admin, autres');
}

/* ── 2) Compteur de requêtes : fenêtre glissante de 60 s, pic de l'heure (horloge injectée) ─────────────────────────────────────── */
{
  let t = Date.UTC(2026, 9, 24, 12, 0, 0); const M = reqMeter(() => t);
  for (let i = 0; i < 30; i++) M.hit('page'); for (let i = 0; i < 5; i++) M.hit('prix'); M.hit('inconnue');
  let s = M.snap(); assert.equal(s.total, 36); assert.equal(s.fams.page, 30); assert.equal(s.fams.prix, 5); assert.equal(s.fams.autres, 1, 'famille inconnue : autres'); assert.equal(s.win, 1);
  t += 30e3; for (let i = 0; i < 10; i++) M.hit('troc');
  s = M.snap(); assert.equal(s.total, 46, 'dans les 60 s'); assert.equal(s.win, 30);
  t += 31e3; s = M.snap(); assert.equal(s.total, 10, 'la première seconde est sortie de la fenêtre'); assert.equal(s.fams.troc, 10); assert.equal(s.fams.page, 0);
  t += 60e3; s = M.snap(); assert.equal(s.total, 0); assert.equal(s.win, 60);
  assert.equal(s.peak.n, 46, 'pic : la minute de 12 h 00 (36 + 10 à 12 h 00 min 30 s)'); assert.equal(s.peak.at, Date.UTC(2026, 9, 24, 12, 0, 0)); assert.equal(s.all, 46);
  // même case réutilisée 60 s plus tard : remise à zéro, jamais additionnée
  for (let i = 0; i < 3; i++) M.hit('admin'); assert.equal(M.snap().fams.admin, 3);
  t += 61 * 60e3; s = M.snap(); assert.equal(s.peak.n, 0, 'plus d\'une heure après : pic oublié'); assert.equal(s.total, 0);
  // coût O(1) : 200 000 requêtes en bien moins d'une seconde
  const M2 = reqMeter(), t0 = performance.now(); for (let i = 0; i < 200000; i++) M2.hit(REQ_FAMS[i % 9]); const ms = performance.now() - t0;
  assert.ok(ms < 1000, '200 000 requêtes comptées en ' + Math.round(ms) + ' ms'); assert.equal(M2.snap().all, 200000);
  ok('requêtes par minute : fenêtre glissante de 60 s (cases d\'une seconde réutilisées sans additionner), pic de l\'heure et sa minute, oublié après une heure ; 200 000 requêtes en ' + Math.round(ms) + ' ms');
}

/* ── 3) Dossier des données, mémoire, seuils, processeur ────────────────────────────────────────────────────────────── */
{
  const d = mkdtempSync(join(tmpdir(), 'srvstat-')); mkdirSync(join(d, 'admin', 'x'), { recursive: true });
  writeFileSync(join(d, 'a.json'), '12345'); writeFileSync(join(d, 'admin', 'journal.json'), '1234567890'); writeFileSync(join(d, 'admin', 'x', 'b.bin'), Buffer.alloc(100));
  const old = new Date(Date.UTC(2026, 8, 1)); utimesSync(join(d, 'admin', 'journal.json'), old, old);
  const s = await dirStat(d);
  assert.deepEqual({ ...s, newest: 0 }, { exists: true, files: 3, bytes: 115, oldest: old.getTime(), newest: 0, cut: false });
  assert.ok(s.newest > Date.now() - 60e3);
  assert.equal((await dirStat(d, { max: 2 })).cut, true, 'borné');
  assert.deepEqual(await dirStat(join(d, 'absent')), { exists: false, files: 0, bytes: 0, oldest: 0, newest: 0, cut: false });
  assert.deepEqual(memLimit({ SERVER_MEM_MB: '1536' }), { bytes: 1536 * 1048576, from: 'env' });
  const m = memNow(); assert.ok(m.rss > 0 && m.heapUsed > 0 && m.heapTotal >= m.heapUsed && m.heapMax > m.heapTotal && m.external >= 0);
  assert.deepEqual([level(0.5, 0.7, 0.85), level(0.7, 0.7, 0.85), level(0.9, 0.7, 0.85), level(NaN, 1, 2), level(3, 1, 10)], ['ok', 'warn', 'bad', '', 'warn']);
  const L = loadMeter({ every: 300 }); await sleep(60); const x = Date.now(); while (Date.now() - x < 150) { /* processeur occupé, boucle bloquée */ } await sleep(400);
  const l = L.snap(); L.stop(); assert.ok(l.n >= 1, 'relevé périodique'); assert.ok(l.cpuMax > 10, 'processeur relevé : ' + l.cpuMax + ' %'); assert.ok(Math.max(l.lagMax, l.lagHour) >= 50, 'boucle bloquée relevée : ' + l.lagMax + ' ms');
  ok('dossier des données : fichiers, taille, plus ancien fichier (sous-dossiers compris, borné, absent) ; plafond SERVER_MEM_MB ; mémoire ; seuils ok / warn / bad ; processeur ' + l.cpuMax + ' % et boucle bloquée ' + Math.max(l.lagMax, l.lagHour) + ' ms relevés');
}

/* ── 4) Le vrai proxy : GET /api/admin/server ──────────────────────────────────────────────────────────────────────── */
const F = await startFakes();
const ADMIN = 'editeur@example.org', PORT = 19880, BASE = `http://127.0.0.1:${PORT}`;
const DATA = mkdtempSync(join(tmpdir(), 'srvstat-data-'));
const procs = [];
process.on('exit', () => { for (const p of procs) try { p.kill(); } catch {} F.stop(); });
const start = env => new Promise((resolve, reject) => {
  const c = spawn('node', ['proxy.mjs'], { env: { ...process.env, EDH_SOURCE_URL: '', PORT: String(PORT), ALERTS: '0', PUBDECKS: '0', BAD_KEY_DELAY_MS: '20', FIREBASE_JWKS_URL: F.env.FIREBASE_JWKS_URL, ADMIN_EMAILS: ADMIN, EDH_DATA_DIR: DATA, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.log = () => out;
  c.stdout.on('data', d => { out += d; if (/Mana Orbit →/.test(out)) resolve(c); }); c.stderr.on('data', d => { out += d; });
  c.on('exit', code => { if (code) reject(new Error('exit ' + code + ': ' + out)); });
  procs.push(c);
});
const ADM = () => F.jwt('uid-admin-00', 3600, { email: ADMIN, email_verified: true });
const get = async (q = '', tok = ADM()) => { const r = await fetch(BASE + '/api/admin/server' + q, { headers: tok ? { 'x-firebase-token': tok } : {} }); const t = await r.text(); let o; try { o = JSON.parse(t); } catch { o = t; } return { s: r.status, o, t, h: r.headers }; };
const stop = async P => { const done = new Promise(r => P.once('exit', r)); P.kill(); await done; };

// un vieux fichier dans le dossier des données (gardé d'un déploiement à l'autre)
const OLD = Date.UTC(2026, 8, 15); writeFileSync(join(DATA, 'alerts.json'), '{}'); utimesSync(join(DATA, 'alerts.json'), new Date(OLD), new Date(OLD));
{
  let P = await start({ SERVER_MEM_MB: '40' });
  for (let t = 0; t < 40 && !existsSync(join(DATA, 'boot.json')); t++) await sleep(50);
  // accès
  assert.equal((await get('', '')).s, 401);
  const other = await get('', F.jwt('uid-jeanne-01', 3600, { email: 'jeanne@example.org', email_verified: true })); assert.equal(other.s, 403); assert.deepEqual(Object.keys(other.o), ['error', 'message']);
  // requêtes de chaque famille
  for (let i = 0; i < 6; i++) await fetch(BASE + '/__ping'); for (let i = 0; i < 3; i++) await fetch(BASE + '/api/alerts?id=x');
  await fetch(BASE + '/api/troc/s'); await fetch(BASE + '/api/partie/s'); await fetch(BASE + '/api/feedback'); await fetch(BASE + '/api/expansions'); await fetch(BASE + '/api/friends');
  const r = await get(); assert.equal(r.s, 200); assert.equal(r.h.get('cache-control'), 'no-store'); assert.match(r.h.get('x-robots-tag'), /noindex/);
  const o = r.o;
  // mémoire et caches
  assert.ok(o.mem.rss > 10e6 && o.mem.heapUsed > 0 && o.mem.heapMax > 0); assert.equal(o.mem.limit, 40 * 1048576); assert.equal(o.mem.from, 'env');
  assert.equal(o.lv.rss, 'bad', 'rss au-dessus de 85 % de 40 Mo');
  assert.deepEqual(o.caches.map(c => c.k), ['ct', 'offers', 'jobs', 'troc', 'ptlive', 'pthist', 'amis', 'files', 'data']);
  const c = Object.fromEntries(o.caches.map(x => [x.k, x]));
  assert.equal(c.ct.max, 48 * 1048576); assert.equal(c.offers.max, 40 * 1048576); assert.equal(c.jobs.max, 64 * 1048576); assert.equal(c.troc.max, 24 * 1048576); assert.equal(c.amis.max, 24 * 1048576);
  assert.equal(c.ptlive.max, 500 * 8 * 1024); assert.equal(c.ptlive.bound, true); assert.equal(c.files.max, 0);
  // démarrage
  assert.ok(Math.abs(o.boot.start - (Date.now() - o.boot.up * 1000)) < 3000); assert.equal(o.boot.node, process.version); assert.match(o.boot.build, /^[\w-]+$/);
  assert.equal((await (await fetch(BASE + '/__ping')).json()).build, o.boot.build, 'version : celle de /__ping');
  assert.equal(o.boot.known, 1); assert.equal(o.boot.restarts24, 0); assert.equal(o.boot.recent[0].b, o.boot.build);
  // requêtes
  assert.equal(o.req.fams.page, 6, 'page : /__ping'); assert.equal(o.req.fams.alertes, 3); assert.equal(o.req.fams.troc, 1); assert.equal(o.req.fams.partie, 1);
  assert.equal(o.req.fams.discord, 1); assert.equal(o.req.fams.prix, 1); assert.equal(o.req.fams.autres, 1); assert.ok(o.req.fams.admin >= 3, 'les appels du panneau comptent aussi');
  assert.equal(o.req.total, Object.values(o.req.fams).reduce((a, b) => a + b, 0)); assert.ok(o.req.peak.n >= o.req.total);
  // en direct
  assert.deepEqual(o.live.troc, { open: 0, two: 0, max: 300 }); assert.equal(o.live.jobs.max, 8); assert.equal(o.live.jobs.run, 0); assert.equal(o.live.jobs.busy, 0); assert.deepEqual(o.live.up, { active: 0, conc: 12, queue: 0 });
  assert.equal(o.live.alerts.on, false);
  // disque : vieux fichier gardé, premier démarrage noté
  assert.equal(o.disk.dir, DATA); assert.equal(o.disk.exists, true); assert.ok(o.disk.files >= 2); assert.equal(o.disk.oldest, OLD); assert.equal(o.disk.boots, 1);
  assert.equal(o.lv.disk, 'warn', 'premier démarrage avec ce dossier : à confirmer au déploiement suivant'); assert.equal(o.disk.fresh, true);
  // historique des prix : coupé (PRICES_SOURCE_URL vide)
  assert.equal(o.hist.on, false); assert.equal(o.lv.hist, '');
  // avis : mémoire au rouge
  assert.equal(o.vps.lv, 'bad'); assert.ok(o.vps.bad.includes('rss'));
  // rien de personnel
  for (const bad of ['127.0.0.1', 'uid-', ADMIN, 'jeanne', '@']) assert.ok(!r.t.includes(bad), 'jamais : ' + bad);
  // disque relu au plus toutes les 10 min (sauf ?disk=1, au plus une fois par minute)
  writeFileSync(join(DATA, 'nouveau.txt'), 'x'.repeat(1000));
  assert.equal((await get()).o.disk.bytes, o.disk.bytes, 'pas relu à chaque rafraîchissement');
  assert.equal((await get('?disk=1')).o.disk.bytes, o.disk.bytes, 'forcé moins d\'une minute après : pas relu');
  ok('/api/admin/server : 401 sans jeton, 403 sans données ; mémoire et plafond SERVER_MEM_MB (rouge), caches et leurs plafonds, version (= /__ping), Node, démarrage, requêtes par famille, en direct, disque (plus ancien fichier, relu au plus toutes les 10 min), avis VPS ; ni IP ni compte');

  // redémarrage avec la même version : compté ; dossier gardé : plus « premier démarrage » ; plafond large : mémoire au vert
  await stop(P); P = await start({ SERVER_MEM_MB: '100000' });
  const boot = () => JSON.parse(readFileSync(join(DATA, 'boot.json'), 'utf8'));
  for (let t = 0; t < 40 && boot().boots < 2; t++) await sleep(50);      // écrit juste après le démarrage
  const b = boot(); assert.equal(b.boots, 2); assert.equal(b.recent.length, 2); assert.ok(b.first > 0 && b.last >= b.first);
  const o2 = (await get()).o;
  assert.equal(o2.boot.restarts24, 1, 'même version : un redémarrage'); assert.equal(o2.boot.deploys24, 0); assert.equal(o2.boot.known, 2); assert.equal(o2.lv.restarts, 'ok');
  assert.equal(o2.disk.boots, 2); assert.equal(o2.disk.fresh, false); assert.equal(o2.lv.disk, 'ok'); assert.ok(o2.disk.bytes > o.disk.bytes, 'relu au démarrage suivant');
  assert.equal(o2.lv.rss, 'ok'); assert.ok(!o2.vps.bad.includes('rss'));
  // version d'avant (boot.json sans « recent ») : relu sans erreur
  await stop(P); writeFileSync(join(DATA, 'boot.json'), JSON.stringify({ first: OLD, boots: 7, last: OLD }));
  P = await start({ ADMIN: '0' }); assert.equal((await get()).s, 404, 'ADMIN=0 : coupé');
  for (let t = 0; t < 40 && boot().boots < 8; t++) await sleep(50);
  assert.deepEqual(JSON.parse(readFileSync(join(DATA, 'boot.json'), 'utf8')).recent.length, 1); assert.equal(JSON.parse(readFileSync(join(DATA, 'boot.json'), 'utf8')).boots, 8);
  await stop(P);
  ok('redémarrage avec la même version compté (boot.json : recent), dossier gardé → plus « premier démarrage », plafond large → mémoire au vert ; boot.json d\'avant relu ; ADMIN=0 → 404');
}
process.exit(0);
