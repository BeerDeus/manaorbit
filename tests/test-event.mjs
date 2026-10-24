// Événements saisonniers, côté serveur (event-srv.mjs + src/evpacks.js) : packs (dates, Pâques, quotas : au moins 6 jours pour tout trouver), calendrier à l'heure
// de Paris (bascule à minuit, changement d'heure), EVENT_FORCE ; cachettes du jour (déterministes, par joueur, selon les capacités, jetons), quota de 5 par jour,
// jetons faux ou d'un autre jour refusés, total plafonné, reçus signés, progression relue depuis Firestore (sync), progression sans compte rattachée au compte
// (merge : une seule fois, jamais vers un 2e compte), statistiques et classement, interrupteur du panneau (gardé au redémarrage), fichier illisible jamais écrasé.
// Puis le vrai proxy.mjs (ports 19870–19872) : /__ping › event, EVENT=0, EVENT_FORCE, jetons Firebase, /admin réservé, fichiers des badges servis.
import './setup-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { eventMake, evTag, evName } from '../event-srv.mjs';
import { startFakes } from './amis-fakes.mjs';
const require = createRequire(import.meta.url);
const E = require('../src/evpacks.js');

const TMP = mkdtempSync(join(tmpdir(), 'deckdeal-evt-')); process.on('exit', () => { try { rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });
let nDir = 0; const newDir = () => join(TMP, 'd' + (++nDir));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T0 = Date.parse('2026-10-25T08:00:00Z');      // 25 octobre 2026, 10 h à Paris : 1er jour d'Halloween

/** Moteur derrière un petit serveur HTTP (vraies requêtes) ; clock.t : l'heure ; users : jeton → uid. */
async function up(o = {}) {
  const clock = { t: o.t || T0 }, users = { 'tok-zoe': 'uid-zoe', 'tok-max': 'uid-max' };
  const verify = async tok => { if (tok === 'expired') throw Object.assign(new Error('x'), { authCode: 'expired' }); const uid = users[tok]; if (!uid) throw Object.assign(new Error('x'), { authCode: 'invalid' }); return { uid, emailVerified: true, provider: 'google.com' }; };
  const ev = eventMake({ dir: o.dir || newDir(), secret: o.secret ?? 'sekret', now: () => clock.t, verify, bad: s => /merde/i.test(s), on: o.on, force: o.force, log: { log() {}, warn() {} } });
  const srv = http.createServer((req, res) => { const u = new URL(req.url, 'http://x'); const p = u.pathname.replace(/^\/api\//, ''); (p.startsWith('admin/') ? ev.admin(req, res, p.slice(6), u, { email: 'ed@x' }) : ev.api(req, res, p, u)).catch(e => { console.error(e); res.writeHead(500); res.end('{}'); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/api/`;
  const call = async (path, { tok, dev, body, method } = {}) => {
    const h = { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(tok ? { 'x-firebase-token': tok } : {}), ...(dev ? { 'x-event-device': dev } : {}) };
    const r = await fetch(base + path, { method: method || (body ? 'POST' : 'GET'), headers: h, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, j: await r.json() };
  };
  srv.unref();
  return { ev, clock, call, stop: () => { srv.closeAllConnections(); srv.close(); } };
}

test('packs : dates, Pâques, quotas, calendrier à l\'heure de Paris', () => {
  assert.deepEqual(E.evCheck(2026), []); assert.deepEqual(E.evCheck(2027), []); assert.deepEqual(E.evCheck(2030), []);
  assert.equal(E.evEaster(2026), '2026-04-05'); assert.equal(E.evEaster(2027), '2027-03-28'); assert.equal(E.evEaster(2025), '2025-04-20'); assert.equal(E.evEaster(2038), '2038-04-25');
  const h = E.evById('halloween-2026'); assert.equal(h.from, '2026-10-25'); assert.equal(h.to, '2026-11-08'); assert.equal(h.days, 15); assert.equal(h.total, 30); assert.equal(h.per, 5);
  assert.ok(Math.ceil(h.total / h.per) >= E.EV_MIN_DAYS, 'au moins 6 jours de jeu pour tout trouver');
  for (const p of E.EV_PACKS) { const e = E.evEdition(p, 2026); assert.ok(e.days >= 12 && e.days <= 18, p.id + ' : environ deux semaines'); assert.ok(e.total / e.per >= E.EV_MIN_DAYS, p.id + ' : 6 jours au moins'); }
  assert.equal(E.evDay(Date.parse('2026-10-24T21:59:59Z')), '2026-10-24'); assert.equal(E.evDay(Date.parse('2026-10-24T22:00:00Z')), '2026-10-25', 'minuit à Paris (UTC+2)');
  assert.equal(E.evDay(Date.parse('2026-10-25T23:00:00Z')), '2026-10-26', 'après le changement d\'heure : UTC+1');
  assert.equal(new Date(E.evNextMidnight(Date.parse('2026-10-25T08:00:00Z'))).toISOString(), '2026-10-25T23:00:00.000Z', 'nuit du changement d\'heure (25 h)');
  assert.equal(E.evActive(Date.parse('2026-10-24T21:00:00Z')), null); assert.equal(E.evActive(Date.parse('2026-10-24T22:00:00Z')).id, 'halloween-2026');
  assert.equal(E.evActive(Date.parse('2026-11-08T22:30:00Z')).day, '2026-11-08'); assert.equal(E.evActive(Date.parse('2026-11-08T23:00:00Z')), null, 'fin le 8 novembre à minuit');
  assert.equal(E.evActive(Date.parse('2026-12-15T12:00:00Z')), null, 'Noël pas encore prêt : jamais ouvert tout seul');
  assert.equal(E.evActive(Date.parse('2026-06-01T12:00:00Z'), { force: 'halloween-2026' }).day, '2026-10-25', 'forcé avant la date : 1er jour');
  assert.equal(E.evActive(Date.parse('2026-12-15T12:00:00Z'), { force: 'noel' }).id, 'noel-2026', 'pack pas prêt : seulement forcé');
  assert.equal(E.evActive(Date.parse('2026-10-26T12:00:00Z'), { off: ['halloween-2026'] }), null, 'coupée');
  assert.equal(E.evUpcoming('2026-10-22').id, 'halloween-2026'); assert.equal(E.evUpcoming('2026-10-22').in, 3);
  assert.equal(new Set(E.EV_SPOTS.map(s => s.id)).size, E.EV_SPOTS.length, 'cachettes uniques'); assert.ok(E.EV_SPOTS.length >= 40, 'une quarantaine de cachettes');
  assert.ok(E.EV_SPOTS.filter(s => !s.need).length >= 15, 'assez de cachettes pour tout le monde (sans compte, collection vide)');
  assert.ok(E.EV_SPOTS.filter(s => !s.need && s.lvl === 2).length >= 12, 'assez de sous-menus pour tout le monde');
  assert.equal(evName('  Zoé  la <b> ', null), 'Zoé la b'); assert.equal(evName('merde', s => /merde/.test(s)), '');
});

test('cachettes du jour : déterministes, par joueur, selon les capacités, jetons', async () => {
  const S = await up();
  const a = await S.call('event'); assert.equal(a.status, 200); assert.equal(a.j.on, true); assert.equal(a.j.ev.id, 'halloween-2026'); assert.equal(a.j.ev.dayNo, 1); assert.equal(a.j.ev.left, 14);
  assert.ok(/^[\w-]{22}\.[\w-]{16}$/.test(a.j.dev), 'jeton d\'appareil donné'); assert.equal(a.j.me, null, 'sans appareil ni compte : rien');
  const dev = a.j.dev, b = await S.call('event?c=0', { dev }), sp = b.j.me.spots;
  assert.equal(sp.length, 5); assert.equal(new Set(sp.map(x => x.s)).size, 5);
  const lv = sp.map(x => E.EV_SPOTS.find(s => s.id === x.s).lvl); assert.ok(lv.filter(l => l === 0).length <= 1 && lv.filter(l => l === 1).length <= 2, 'au plus 1 en vue et 2 à un geste : le reste caché dans les sous-menus'); assert.ok(sp.every(x => E.EV_SPOTS.find(s => s.id === x.s).need === 0), 'capacités 0 : cachettes visibles par tous');
  assert.deepEqual((await S.call('event?c=0', { dev })).j.me.spots, sp, 'mêmes cachettes à chaque lecture');
  const zoe = (await S.call('event?c=7', { tok: 'tok-zoe' })).j.me.spots, max = (await S.call('event?c=7', { tok: 'tok-max' })).j.me.spots;
  assert.notDeepEqual(zoe.map(x => x.s), max.map(x => x.s), 'chacun les siennes');
  S.clock.t += 864e5; const zoe2 = (await S.call('event?c=7', { tok: 'tok-zoe' })).j.me.spots;
  assert.notDeepEqual(zoe2.map(x => x.s), zoe.map(x => x.s), 'nouvelles cachettes le lendemain');
  assert.equal(zoe2.filter(x => zoe.some(y => y.s === x.s)).length, 0, 'pas les mêmes que la veille');
  assert.equal((await S.call('event', { tok: 'expired' })).status, 401); assert.equal((await S.call('event', { tok: 'faux' })).status, 401);
  S.stop();
});

test('chasse : quota de 5 par jour, jetons refusés, total, reçus, statistiques', async () => {
  const S = await up(), dev = (await S.call('event')).j.dev;
  let me = (await S.call('event', { dev })).j.me; const day = me.day;
  const claim = (x, o = {}) => S.call('event/claim', { dev, ...o, body: { ev: 'halloween-2026', day, s: x.s, t: x.t, ...(o.b || {}) } });
  assert.equal((await claim(me.spots[0], { b: { t: 'A'.repeat(16) } })).status, 403, 'jeton faux');
  assert.equal((await claim(me.spots[0], { b: { s: me.spots[1].s } })).status, 403, 'jeton d\'une autre cachette');
  assert.equal((await claim(me.spots[0], { b: { day: '2026-10-24' } })).status, 410, 'autre jour');
  assert.equal((await claim(me.spots[0], { b: { ev: 'noel-2026' } })).status, 404, 'autre événement');
  assert.equal((await S.call('event/claim', { body: { ev: 'halloween-2026', day, s: me.spots[0].s, t: me.spots[0].t } })).status, 400, 'sans appareil ni compte');
  const other = (await S.call('event')).j.dev; assert.equal((await claim(me.spots[0], { dev: other })).status, 403, 'jeton d\'un autre joueur');
  for (let i = 0; i < 5; i++) { const r = await claim(me.spots[i]); assert.equal(r.status, 200, JSON.stringify(r.j)); assert.equal(r.j.n, i + 1); assert.equal(r.j.left, 4 - i); assert.ok(/^[\w-]{22}$/.test(r.j.sig)); }
  const dup = await claim(me.spots[2]); assert.equal(dup.status, 200); assert.equal(dup.j.dup, true); assert.equal(dup.j.n, 5, 'deux fois la même : comptée une fois');
  me = (await S.call('event', { dev })).j.me; assert.equal(me.left, 0); assert.equal(me.found.length, 5); assert.ok(me.spots.every(x => x.f === 1));
  // 6e : quota du jour (même avec un jeton valable pour une capacité différente)
  const extra = (await S.call('event?c=255', { dev })).j.me.spots.find(x => !x.f);
  if (extra) { const r = await claim(extra); assert.equal(r.status, 409); assert.equal(r.j.error, 'day_quota'); }
  // ancien jeton le lendemain : refusé
  const old = me.spots[0]; S.clock.t += 864e5; assert.equal((await claim(old, { b: { day } })).status, 410);
  // 6 jours pour tout trouver, puis plus rien
  for (let d = 1; d < 6; d++) { const m = (await S.call('event', { dev })).j.me; for (const x of m.spots.filter(y => !y.f)) assert.equal((await S.call('event/claim', { dev, body: { ev: 'halloween-2026', day: m.day, s: x.s, t: x.t } })).status, 200); if (d < 5) S.clock.t += 864e5; }
  me = (await S.call('event', { dev })).j.me; assert.equal(me.n, 30); assert.equal(me.left, 0); assert.equal(me.spots.filter(x => !x.f).length, 0, '30/30 : plus aucune cachette');
  assert.equal(Object.keys(me.sig).length, 6, 'un reçu par jour joué');
  const st = await S.ev.stats('halloween-2026'); assert.equal(st.hunters, 1); assert.equal(st.full, 1); assert.equal(st.finds, 30); assert.equal(st.days.length, 6); assert.equal(st.dist[30], 1); assert.equal(st.devices, 1);
  await S.ev.flush(); S.stop();
});

test('progression : relue depuis Firestore (reçus), rattachée au compte, une seule fois', async () => {
  const dir = newDir(); let S = await up({ dir });
  let me = (await S.call('event?c=7', { tok: 'tok-zoe' })).j.me;
  for (const x of me.spots.slice(0, 3)) assert.equal((await S.call('event/claim', { tok: 'tok-zoe', body: { ev: 'halloween-2026', day: me.day, s: x.s, t: x.t, n: 'Zoé' } })).status, 200);
  me = (await S.call('event?c=7', { tok: 'tok-zoe' })).j.me; const saved = { jours: me.jours, sig: me.sig };      // copie gardée par l'appli (Firestore)
  await S.ev.flush(); S.stop();
  // serveur reparti sans son dossier (déploiement qui vide .data/), même secret : la copie de l'appli fait foi
  S = await up({ dir: newDir() });
  assert.equal((await S.call('event?c=7', { tok: 'tok-zoe' })).j.me.n, 0);
  const forged = { jours: { [me.day]: [...saved.jours[me.day], 'help-top'] }, sig: saved.sig };
  assert.equal((await S.call('event/sync', { tok: 'tok-zoe', body: { ev: 'halloween-2026', ...forged } })).j.me.n, 0, 'reçu qui ne correspond pas : ignoré');
  assert.equal((await S.call('event/sync', { tok: 'tok-max', body: { ev: 'halloween-2026', ...saved } })).j.me.n, 0, 'reçu d\'un autre compte : ignoré');
  const sy = await S.call('event/sync', { tok: 'tok-zoe', body: { ev: 'halloween-2026', ...saved } }); assert.equal(sy.status, 200); assert.equal(sy.j.me.n, 3, 'relu');
  assert.equal((await S.call('event/sync', { body: { ev: 'halloween-2026', ...saved } })).status, 401);
  // sans compte sur un appareil, puis connexion : rattaché au compte
  const dev = (await S.call('event')).j.dev; let dm = (await S.call('event', { dev })).j.me;
  for (const x of dm.spots.slice(0, 2)) await S.call('event/claim', { dev, body: { ev: 'halloween-2026', day: dm.day, s: x.s, t: x.t } });
  const mg = await S.call('event/merge', { tok: 'tok-zoe', dev, body: { ev: 'halloween-2026', n: 'Zoé' } }); assert.equal(mg.status, 200, JSON.stringify(mg.j)); assert.equal(mg.j.me.n, 5, '3 + 2');
  assert.equal(mg.j.me.found.length, 5); assert.equal((await S.call('event/merge', { tok: 'tok-zoe', dev, body: { ev: 'halloween-2026' } })).j.merged, false, 'une seule fois');
  assert.equal((await S.call('event/merge', { tok: 'tok-max', dev, body: { ev: 'halloween-2026' } })).status, 409, 'jamais vers un 2e compte');
  assert.equal((await S.call('event/merge', { tok: 'tok-zoe', body: { ev: 'halloween-2026' } })).status, 400, 'sans appareil');
  const st = await S.ev.stats('halloween-2026'); assert.equal(st.hunters, 1, 'l\'appareil rattaché ne compte plus à part'); assert.equal(st.top[0].n, 'Zoé'); assert.equal(st.top[0].c, 5);
  const bd = await S.call('event/board', { tok: 'tok-zoe' }); assert.equal(bd.j.rows[0].n, 'Zoé'); assert.equal(bd.j.me.r, 1); assert.ok(!JSON.stringify(bd.j).includes(evTag('uid-zoe')), 'aucune empreinte dans le classement');
  S.stop();
});

test('interrupteur du panneau, EVENT=0, fichier illisible', async () => {
  const dir = newDir(); let S = await up({ dir });
  let a = await S.call('admin/events'); assert.equal(a.status, 200); assert.equal(a.j.cur, 'halloween-2026'); assert.equal(a.j.list[0].state, 'live'); assert.equal(a.j.list[0].off, false);
  const sw = await S.call('admin/events/switch', { body: { id: 'halloween-2026', on: false } }); assert.equal(sw.status, 200); assert.deepEqual(sw.j.off, ['halloween-2026']);
  assert.equal(S.ev.ping(), null, '/__ping : plus rien'); assert.equal((await S.call('event')).j.on, false);
  assert.equal((await S.call('admin/events/switch', { body: { id: 'zzz-2026', on: false } })).status, 404);
  assert.equal((await S.call('admin/events/switch', { body: { id: 'halloween-2026' } })).status, 400);
  S.stop(); S = await up({ dir }); assert.equal(S.ev.ping(), null, 'gardé au redémarrage');
  await S.call('admin/events/switch', { body: { id: 'halloween-2026', on: true } }); assert.equal(S.ev.ping().id, 'halloween-2026'); S.stop();
  S = await up({ on: false }); assert.equal(S.ev.ping(), null); assert.equal((await S.call('event')).j.on, false); assert.equal((await S.call('admin/events')).j.on, false); S.stop();
  S = await up({ t: Date.parse('2026-06-01T10:00:00Z'), force: 'halloween-2026' }); assert.equal(S.ev.ping().day, '2026-10-25', 'EVENT_FORCE'); S.stop();
  const d2 = newDir(); mkdirSync(d2, { recursive: true }); writeFileSync(join(d2, 'halloween-2026.json'), '{abîmé');
  S = await up({ dir: d2 }); const dev = (await S.call('event')).j.dev, m = (await S.call('event', { dev })).j.me;
  assert.equal((await S.call('event/claim', { dev, body: { ev: 'halloween-2026', day: m.day, s: m.spots[0].s, t: m.spots[0].t } })).status, 200);
  await S.ev.flush(); assert.equal(readFileSync(join(d2, 'halloween-2026.json'), 'utf8'), '{abîmé', 'fichier illisible jamais écrasé'); S.stop();
});

test('panneau : liste des chasseurs, remise à zéro d\'un joueur et de sa propre avancée, anciennes copies ignorées', async () => {
  const S = await up();
  const users = { 'tok-zoe': 1 };
  let me = (await S.call('event?c=7', { tok: 'tok-zoe' })).j.me;
  for (const x of me.spots.slice(0, 3)) await S.call('event/claim', { tok: 'tok-zoe', body: { ev: 'halloween-2026', day: me.day, s: x.s, t: x.t, n: 'Zoé' } });
  const dev = (await S.call('event')).j.dev, dm = (await S.call('event', { dev })).j.me;
  await S.call('event/claim', { dev, body: { ev: 'halloween-2026', day: dm.day, s: dm.spots[0].s, t: dm.spots[0].t } });
  me = (await S.call('event?c=7', { tok: 'tok-zoe' })).j.me; const copy = { jours: me.jours, sig: me.sig, rs: me.rs };      // copie Firestore d'avant la remise à zéro
  let a = (await S.call('admin/events')).j.stats['halloween-2026'];
  assert.equal(a.players.length, 2); assert.equal(a.players[0].n, 'Zoé'); assert.equal(a.players[0].c, 3); assert.equal(a.players[0].today, 3); assert.equal(a.players[0].days, 1); assert.equal(a.players[1].acct, false);
  assert.ok(a.players.every(x => /^[\w-]{12}$/.test(x.id)) && !JSON.stringify(a.players).includes(evTag('uid-zoe')), 'identifiants opaques, jamais l\'empreinte');
  const r = await S.call('admin/events/reset', { body: { id: 'halloween-2026', p: a.players[1].id } }); assert.equal(r.status, 200); assert.equal(r.j.stats.players.length, 1, 'appareil remis à zéro');
  assert.equal((await S.call('admin/events/reset', { body: { id: 'halloween-2026', p: 'zzz' } })).status, 404);
  // « me » : le compte de l'éditeur (ici, le faux panneau passe { email } sans uid → introuvable)
  assert.equal((await S.call('admin/events/reset', { body: { id: 'halloween-2026', p: 'me' } })).status, 404);
  await S.call('admin/events/reset', { body: { id: 'halloween-2026', p: a.players[0].id } });
  me = (await S.call('event?c=7', { tok: 'tok-zoe' })).j.me; assert.equal(me.n, 0); assert.ok(me.rs > 0, 'remise à zéro annoncée à l\'appli (rs)');
  assert.equal((await S.call('event/sync', { tok: 'tok-zoe', body: { ev: 'halloween-2026', ...copy } })).j.me.n, 0, 'copie d\'avant la remise à zéro : ignorée');
  const x = me.spots.find(q => !q.f); assert.equal((await S.call('event/claim', { tok: 'tok-zoe', body: { ev: 'halloween-2026', day: me.day, s: x.s, t: x.t } })).j.n, 1, 'la chasse repart de zéro');
  assert.equal(users['tok-zoe'], 1); S.stop();
});

async function proxyUp(port, env) {
  const p = spawn('node', ['proxy.mjs'], { env: { ...process.env, PORT: String(port), EDH_SOURCE_URL: '', PRICES_SOURCE_URL: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
  process.on('exit', () => { try { p.kill(); } catch { /* ignore */ } });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/__ping`)).ok) break; } catch { /* pas encore */ } await sleep(100); }
  return { p, out: () => out, url: `http://127.0.0.1:${port}/`, stop: () => p.kill() };
}
test('proxy.mjs : /__ping › event, EVENT=0, EVENT_FORCE, jetons Firebase, panneau réservé, badges servis', async () => {
  const F = await startFakes();
  let P = await proxyUp(19870, { EVENT: '0', EVENT_FORCE: 'halloween-2026', FIREBASE_JWKS_URL: F.env.FIREBASE_JWKS_URL });
  assert.equal((await (await fetch(P.url + '__ping')).json()).event, null, 'EVENT=0 : coupé'); assert.equal((await (await fetch(P.url + 'api/event')).json()).on, false); P.stop();
  P = await proxyUp(19871, { EVENT: '1', EVENT_FORCE: 'halloween-2026', EVENT_SECRET: 's', FIREBASE_JWKS_URL: F.env.FIREBASE_JWKS_URL });
  const ping = (await (await fetch(P.url + '__ping')).json()).event; assert.equal(ping.id, 'halloween-2026'); assert.equal(ping.pack, 'halloween'); assert.equal(ping.total, 30);
  const H = { 'Content-Type': 'application/json', 'x-firebase-token': F.jwt('uid-ana') };
  const g = await (await fetch(P.url + 'api/event?c=3', { headers: H })).json(); assert.equal(g.acct, true); assert.equal(g.me.spots.length, 5);
  const c = await fetch(P.url + 'api/event/claim', { method: 'POST', headers: H, body: JSON.stringify({ ev: 'halloween-2026', day: g.me.day, s: g.me.spots[0].s, t: g.me.spots[0].t, n: 'Ana' }) });
  assert.equal(c.status, 200); assert.equal((await c.json()).n, 1);
  assert.equal((await fetch(P.url + 'api/event', { headers: { 'x-firebase-token': 'abc.def.ghi' } })).status, 401, 'jeton faux');
  assert.equal((await fetch(P.url + 'api/admin/events', { headers: H })).status, 403, 'panneau : compte de l\'éditeur seulement');
  assert.equal((await fetch(P.url + 'api/admin/events')).status, 401);
  const svg = await fetch(P.url + 'icons/events/badges/halloween-2026-3.svg');
  if (svg.status === 200) assert.match(svg.headers.get('content-type'), /svg/); else assert.equal(svg.status, 404, 'badge pas encore généré : 404 propre');
  assert.equal((await fetch(P.url + 'icons/events/../../proxy.mjs')).status, 404, 'aucun chemin pris dans l\'adresse');
  P.stop(); F.stop();
});
