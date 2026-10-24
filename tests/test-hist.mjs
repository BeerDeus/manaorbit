// Historique des prix sur 30 jours : format MOPH1 (prices-hist.mjs), fabrication jour après jour (gen-prices.mjs › histWrite : fenêtre roulante, jour manqué,
// 2e relevé du même jour, relevé plus ancien refusé, veille illisible ou panne : rien de perdu) ; serveur (proxy.mjs) : relecture depuis « GitHub »
// (faux), copie dans .data/ relue au redémarrage, GET /api/hist (une ou plusieurs cartes, clé de carte comme l'appli, cache HTTP et 304, 400, 405, 429, 503).
// Port fixe : 19860.
import './setup-env.mjs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { histPack, histUnpack, histRoll, histRow, histDay, histIso, HIST_DAYS } from '../prices-hist.mjs';
import { histWrite } from '../gen-prices.mjs';

const ok = m => console.log('✓ ' + m);
const M = o => new Map(Object.entries(o));

/* ── Format : aller-retour, grands prix, devises ──────────────────────────────────────────────── */
{
  const h = { d0: histDay('2026-10-01'), days: 3, names: ['Black Lotus', 'Fire // Ice', 'Sol Ring'], e: Uint32Array.from([3000000000, 2999999000, 3000000500, 0, 25, 0, 150, 120, 175]), u: Uint32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
  const back = histUnpack(histPack(h));
  assert.equal(histIso(back.d0), '2026-10-01'); assert.equal(back.days, 3); assert.deepEqual(back.names, h.names);
  assert.deepEqual([...back.e], [...h.e], 'centimes jusqu\'à 2^32, trous (0), baisses et hausses'); assert.deepEqual([...back.u], [...h.u]);
  const eo = histUnpack(histPack({ ...h, u: null })); assert.equal(eo.u, null, 'sans dollars');
  assert.deepEqual(histRow(back, [1]), { e: [null, 25, null], u: [4, 5, 6] }, '0 → null');
  assert.deepEqual(histRow(back, [1, 2]).e, [150, 25, 175], 'deux noms de la même carte : le plus bas de chaque jour');
  assert.throws(() => histUnpack(gzipSync(Buffer.from('MOPX1 pas ça'))), /pas un historique/);
  assert.throws(() => histUnpack(histPack(h).subarray(0, 30)), /./, 'fichier coupé');
  ok('format MOPH1 : aller-retour exact (grands prix, trous, € et $), relevés d\'une carte, fichier illisible refusé');
}

/* ── Fabrication jour après jour : fenêtre de 30 jours, jour manqué, même jour, plus ancien, carte disparue ── */
{
  let h = histRoll(null, M({ 'Sol Ring': { e: 100, u: 90 }, 'Gone': { e: 50, u: 0 }, 'Sans prix': { e: 0, u: 0 } }), '2026-09-01T09:05:52.991+00:00');
  assert.equal(h.days, 1); assert.deepEqual(h.names, ['Gone', 'Sol Ring'], 'carte sans aucun prix : absente');
  for (let d = 2; d <= 3; d++) h = histRoll(h, M({ 'Sol Ring': { e: 100 + d, u: 90 } }), `2026-09-0${d}T09:00:00Z`);
  h = histRoll(h, M({ 'Sol Ring': { e: 110, u: 91 }, 'New': { e: 7, u: 0 } }), '2026-09-05T09:00:00Z');      // le 4 manqué
  assert.equal(h.days, 5); assert.deepEqual(histRow(h, [h.names.indexOf('Sol Ring')]).e, [100, 102, 103, null, 110], 'jour manqué : vide');
  assert.deepEqual(histRow(h, [h.names.indexOf('New')]).e, [null, null, null, null, 7]);
  h = histRoll(h, M({ 'Sol Ring': { e: 111, u: 91 } }), '2026-09-05T20:00:00Z');      // 2e relevé du 5 : remplace le premier (New n'a plus de prix ce jour-là)
  assert.equal(h.days, 5); assert.deepEqual(histRow(h, [h.names.indexOf('Sol Ring')]).e, [100, 102, 103, null, 111]); assert.ok(!h.names.includes('New'), 'carte seulement dans le relevé remplacé : partie');
  assert.throws(() => histRoll(h, M({ 'Sol Ring': { e: 1, u: 1 } }), '2026-09-03'), /plus ancien/);
  for (let d = 6; d <= 40; d++) h = histRoll(histUnpack(histPack(h)), M({ 'Sol Ring': { e: 100 + d, u: 90 } }), histIso(histDay('2026-09-01') + d - 1));
  assert.equal(h.days, HIST_DAYS); assert.equal(histIso(h.d0), '2026-09-11'); assert.equal(histIso(h.d0 + h.days - 1), '2026-10-10');
  const sr = histRow(h, [h.names.indexOf('Sol Ring')]).e; assert.equal(sr.length, 30); assert.equal(sr[0], 111); assert.equal(sr[29], 140);
  assert.ok(!h.names.includes('Gone'), 'sans prix depuis plus de 30 jours : sortie de l\'historique');
  const big = histRoll(null, M({ A: { e: 1, u: 1 } }), '2026-10-10'), jump = histRoll(big, M({ A: { e: 2, u: 2 } }), '2026-12-25');
  assert.equal(jump.days, 30); assert.deepEqual(histRow(jump, [0]).e.filter(Boolean), [2], 'deux mois d\'arrêt : seul le relevé du jour reste');
  ok('fabrication : fenêtre roulante de 30 jours, jour manqué vide, 2e relevé du jour remplace, plus ancien refusé, carte sans prix sortie');
}

/* ── histWrite (gen-prices.mjs) : veille absente, illisible, panne ─────────────────────────── */
const dir = mkdtempSync(join(tmpdir(), 'hist-')), F = n => join(dir, n);
{
  const day1 = M({ 'Sol Ring': { e: 150, u: 120 } });
  let h = histWrite(day1, '2026-10-01T09:00:00Z', F('h1.gz'), F('absent.gz')); assert.equal(h.days, 1); assert.ok(existsSync(F('h1.gz')));
  h = histWrite(M({ 'Sol Ring': { e: 160, u: 120 } }), '2026-10-02T09:00:00Z', F('h2.gz'), F('h1.gz')); assert.deepEqual(histRow(h, [0]).e, [150, 160]);
  writeFileSync(F('bad.gz'), 'n\'importe quoi');
  h = histWrite(day1, '2026-10-03T09:00:00Z', F('h3.gz'), F('bad.gz')); assert.equal(h.days, 1, 'veille illisible : repart du jour');
  h = histWrite(day1, '2026-09-01T09:00:00Z', F('h4.gz'), F('h2.gz'));      // relevé plus ancien : la veille recopiée telle quelle
  assert.deepEqual(readFileSync(F('h4.gz')), readFileSync(F('h2.gz'))); assert.equal(h.days, 2);
  ok('gen-prices › histWrite : premier jour, suite, veille illisible, panne : l\'historique de la veille est recopié');
}

/* ── Serveur : faux GitHub, relecture, /api/hist ────────────────────────────────────────────── */
// 30 jours, 1 200 cartes ; Sol Ring monte de 1,00 € à 1,58 € (le 15 sans prix) ; « Fire // Ice » et « Fire » : même clé de carte que l'appli (ownKey)
const names = ['Sol Ring', 'Fire // Ice', 'Fire', ...Array.from({ length: 1200 }, (_, i) => 'Filler ' + i)];
let H = null;
for (let d = 0; d < 30; d++) {
  const m = new Map(names.map((n, i) => [n, { e: i === 0 ? (d === 14 ? 0 : 100 + d * 2) : i === 1 ? 300 : i === 2 ? 250 + d : 10 + (i % 7), u: i === 0 ? 120 : 0 }]));
  H = histRoll(H, m, histIso(histDay('2026-09-25') + d));
}
let GH = histPack(H), ghHits = 0, ghStatus = 200;
const gh = http.createServer((req, res) => {
  ghHits++;
  if (ghStatus !== 200) { res.writeHead(ghStatus); return res.end(); }
  if (req.url !== '/data/prices-hist.bin.gz') { res.writeHead(404); return res.end(); }
  const tag = '"gh' + GH.length + '"'; if (req.headers['if-none-match'] === tag) { res.writeHead(304); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', ETag: tag }); res.end(GH);
});
await new Promise(r => gh.listen(0, '127.0.0.1', r));
const procs = [];
process.on('exit', () => { for (const c of procs) try { c.kill(); } catch { /* ignore */ } });
const start = env => new Promise((resolve, reject) => {
  const c = spawn('node', ['proxy.mjs'], { env: { ...process.env, EDH_SOURCE_URL: '', PRICES_SOURCE_URL: '', PORT: '19860', ALERTS: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.stdout.on('data', d => { out += d; if (/Mana Orbit →/.test(out)) resolve(c); }); c.stderr.on('data', d => { out += d; });
  c.on('exit', code => { if (code) reject(new Error('exit ' + code + ': ' + out)); });
  c.log = () => out; procs.push(c);
});
const stop = c => new Promise(r => { c.once('exit', r); c.kill(); });
const B = 'http://127.0.0.1:19860';
const J = async (path, headers = {}) => { const r = await fetch(B + path, { headers }); const t = await r.text(); let o; try { o = JSON.parse(t); } catch { o = t; } return { s: r.status, o, h: r.headers }; };
const until = async (fn, ms = 8000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('délai dépassé'); await new Promise(r => setTimeout(r, 50)); } };
const DATA = mkdtempSync(join(tmpdir(), 'hist-data-'));
{
  // sans historique (relecture coupée, pas de copie) : 503, l'appli garde la variation connue
  let px = await start({ PRICES_HIST_SOURCE_URL: '', EDH_DATA_DIR: DATA });
  let r = await J('/api/hist?n=Sol%20Ring'); assert.equal(r.s, 503); assert.equal(r.h.get('cache-control'), 'no-store');
  assert.equal((await J('/__prices')).o.hist.source, '', 'PRICES_SOURCE_URL vide : historique coupé aussi');
  await stop(px);

  // relecture depuis le faux GitHub (premier passage EDH_SYNC_FIRST_MS + 4 s)
  px = await start({ PRICES_HIST_SOURCE_URL: `http://127.0.0.1:${gh.address().port}/data/prices-hist.bin.gz`, EDH_SYNC_FIRST_MS: '0', EDH_DATA_DIR: DATA, HIST_RATE_PER_MIN: '6' });
  const st = await until(async () => { const o = (await J('/__prices')).o; return o.hist.days ? o.hist : null; });
  assert.deepEqual({ from: st.from, d0: st.d0, d1: st.d1, days: st.days, cards: st.cards }, { from: 'GitHub', d0: '2026-09-25', d1: '2026-10-24', days: 30, cards: 1203 });
  assert.ok(existsSync(join(DATA, 'prices-hist.bin.gz')), 'copie dans .data/');
  r = await J('/api/hist?n=Sol%20Ring');
  assert.equal(r.s, 200); assert.equal(r.o.d, '2026-09-25'); assert.equal(r.o.e.length, 30);
  assert.equal(r.o.e[0], 100); assert.equal(r.o.e[14], null, 'jour sans prix : null'); assert.equal(r.o.e[29], 158); assert.equal(r.o.u[0], 120);
  assert.equal(r.h.get('cache-control'), 'public, max-age=3600'); const tag = r.h.get('etag'); assert.ok(tag);
  assert.equal((await fetch(B + '/api/hist?n=Sol%20Ring', { headers: { 'If-None-Match': tag } })).status, 304, 'ETag : 304');
  assert.deepEqual((await J('/api/hist?n=sol%20ring')).o.e, r.o.e, 'clé de carte (minuscules)');
  const fi = await J('/api/hist?n=' + encodeURIComponent('Fire // Ice')); assert.deepEqual(fi.o.e.slice(0, 2), [250, 251], 'même clé que « Fire » : le plus bas de chaque jour');
  r = await J('/api/hist?n=Inconnue'); assert.equal(r.s, 200); assert.deepEqual(r.o, { d: '2026-09-25', e: [], u: [] }, 'carte inconnue : vide');
  // plusieurs cartes
  r = await J('/api/hist?n=Sol%20Ring&n=Filler%203&n=__proto__');
  assert.deepEqual(Object.keys(r.o.cards), ['Sol Ring', 'Filler 3', '__proto__']); assert.equal(r.o.cards['Filler 3'].e[5], 16); assert.deepEqual(r.o.cards.__proto__.e, []);
  // requêtes refusées
  assert.equal((await J('/api/hist')).s, 400); assert.equal((await J('/api/hist?n=')).s, 400);
  assert.equal((await J('/api/hist?' + Array.from({ length: 21 }, (_, i) => 'n=A' + i).join('&'))).s, 400, '21 noms');
  assert.equal((await J('/api/hist?n=' + 'x'.repeat(151))).s, 400, 'nom trop long');
  assert.equal((await fetch(B + '/api/hist?n=Sol%20Ring', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 405);
  // budget par IP (6 par minute ici) : 429 + Retry-After ; une autre IP passe
  const xff = { 'X-Forwarded-For': '203.0.113.7' }; let last;
  for (let i = 0; i < 7; i++) last = await J('/api/hist?n=Sol%20Ring', xff);
  assert.equal(last.s, 429); assert.ok(Number(last.h.get('retry-after')) >= 1);
  assert.equal((await J('/api/hist?n=Sol%20Ring', { 'X-Forwarded-For': '203.0.113.8' })).s, 200);
  ok('serveur : historique relu sur GitHub (copie dans .data/), /api/hist une ou plusieurs cartes, clé de carte, cache HTTP et 304, 400 / 405 / 429');

  // redémarrage, GitHub en panne : la copie de .data/ est servie
  await stop(px); ghStatus = 500;
  px = await start({ PRICES_HIST_SOURCE_URL: `http://127.0.0.1:${gh.address().port}/data/prices-hist.bin.gz`, EDH_SYNC_FIRST_MS: '0', EDH_DATA_DIR: DATA, SYNC_RETRY_MS: '100000' });
  let s2 = await until(async () => { const o = (await J('/__prices')).o.hist; return o.from ? o : null; }); assert.equal(s2.from, 'copie'); assert.equal(s2.days, 30);
  assert.equal((await J('/api/hist?n=Sol%20Ring')).o.e[29], 158);
  await until(async () => (await J('/__prices')).o.hist.err);
  assert.equal((await J('/__prices')).o.hist.from, 'copie', 'panne : la copie reste');
  await stop(px);
  // fichier plus récent sur GitHub (un jour de plus) : remplace la copie
  ghStatus = 200; H = histRoll(H, new Map([['Sol Ring', { e: 170, u: 0 }]]), '2026-10-25'); GH = histPack(H);
  px = await start({ PRICES_HIST_SOURCE_URL: `http://127.0.0.1:${gh.address().port}/data/prices-hist.bin.gz`, EDH_SYNC_FIRST_MS: '0', EDH_DATA_DIR: DATA });
  s2 = await until(async () => { const o = (await J('/__prices')).o.hist; return o.from === 'GitHub' ? o : null; });
  assert.equal(s2.d1, '2026-10-25'); r = await J('/api/hist?n=Sol%20Ring'); assert.equal(r.o.d, '2026-09-26'); assert.equal(r.o.e[29], 170);
  assert.notEqual(r.h.get('etag'), tag, 'nouveau jour : nouvel ETag');
  await stop(px);
  ok('serveur : redémarrage sur la copie de .data/ (GitHub en panne), puis jour suivant relu');
}
gh.close();
console.log('\nHIST OK');
