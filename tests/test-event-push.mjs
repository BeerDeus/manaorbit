// Notifications push des événements, côté serveur (event-push.mjs, branché par event-srv.mjs) : textes du pack dans les 6 langues (dates dans la langue),
// étapes (J-3, J0, mi-parcours, dernier jour : celles des annonces Discord, sans le récapitulatif), appareils enregistrés avec ou sans compte (jeton d'appareil
// x-event-device), retrait seulement par leur compte ou leur appareil, plafonds ; annonces automatiques avec une horloge injectée : chaque étape une fois, une
// par jour au plus (deux éditions le même jour), entre 10 h et 21 h à Paris, rattrapage, redémarrage en plein envoi (jamais deux fois), édition coupée dans
// /admin, EVENT=0, sans compte de service (push null) ; cibles refusées retirées ; envois manuels du panneau (FR + EN exigés, repli FR, longueurs, cible
// « événements » ou « tous » sans doublon, un par heure, programmés, annulés, historique). Puis le vrai proxy.mjs (ports 19881–19882) avec le faux FCM
// (amis-fakes.mjs) : /__ping › evpush, enregistrement sans compte, envoi manuel par le panneau (tag et collapse_key « mo-event », lien ./?fete=1),
// panneau réservé, EVENT_PUSH=0 et sans compte de service : rien.
import './setup-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { eventMake } from '../event-srv.mjs';
import { evPushDue, evPushText, evPushReady, evPushWindows, evPushDate, EVP_LANGS, EVP_STEPS } from '../event-push.mjs';
import { startFakes } from './amis-fakes.mjs';
const require = createRequire(import.meta.url);
const E = require('../src/evpacks.js');

const TMP = mkdtempSync(join(tmpdir(), 'deckdeal-evp-')); process.on('exit', () => { try { rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });
let nDir = 0; const newDir = () => join(TMP, 'd' + (++nDir));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pushK = t => createHash('sha1').update('fcm:' + t).digest('hex').slice(0, 24);      // comme proxy.mjs / daily-srv.mjs
/** Heure de Paris → instant : '2026-10-22 10:01' (heure d'été jusqu'au 25 octobre 3 h, d'hiver ensuite). */
const paris = s => { const [d, hm] = s.split(' '), [h, m] = hm.split(':').map(Number), off = d < '2026-10-25' || (d === '2026-10-25' && h < 2) ? 2 : 1; return Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), h - off, m); };
const HW = E.EV_PACKS.find(p => p.id === 'halloween');

/** Faux envoi (proxy.mjs › sendPush) : messages reçus ; jeton GONE… : 404, OLD… : 410, FAIL… : 500 ; hang : au-delà de ce nombre d'envois, plus aucune réponse. */
function fakePush(o = {}) {
  const P = { sent: [], hang: o.hang ?? Infinity };
  P.send = async m => { P.sent.push(m); if (P.sent.length > P.hang) return new Promise(() => {}); const t = m.sub.fcm; return t.startsWith('GONE') ? 404 : t.startsWith('OLD') ? 410 : t.startsWith('FAIL') ? 500 : 200; };
  P.target = s => (s && typeof s.fcm === 'string' && /^[\w:-]{6,200}$/.test(s.fcm) ? { fcm: s.fcm } : null);
  P.to = t => P.sent.filter(m => m.sub.fcm === t);
  return P;
}
/** Moteur derrière un petit serveur HTTP ; clock.t : l'heure ; users : jeton → uid ; push : faux envoi (null : aucun compte de service). */
async function up(o = {}) {
  const clock = { t: o.t || paris('2026-10-20 12:00') }, users = { 'tok-zoe': 'uid-zoe', 'tok-max': 'uid-max' };
  const verify = async tok => { const uid = users[tok]; if (!uid) throw Object.assign(new Error('x'), { authCode: 'invalid' }); return { uid, emailVerified: true, provider: 'google.com' }; };
  const F = o.push === undefined ? fakePush() : o.push, logs = [];
  const ev = eventMake({ dir: o.dir || newDir(), secret: 'sekret', now: () => clock.t, verify, on: o.on, push: F ? { send: F.send, target: F.target } : null, pushExtra: o.extra || null,
    pushOpts: { batch: o.batch || 100, waitMs: 3000, warmMs: 0, ...(o.opts || {}) }, log: { log: m => logs.push(m), warn: m => logs.push('! ' + m) }, adminLog: o.adminLog });
  const srv = http.createServer((req, res) => { const u = new URL(req.url, 'http://x'); const p = u.pathname.replace(/^\/api\//, ''); (p.startsWith('admin/') ? ev.admin(req, res, p.slice(6), u, { email: 'ed@x.fr', uid: 'uid-ed' }) : ev.api(req, res, p, u)).catch(e => { console.error(e); res.writeHead(500); res.end('{}'); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); srv.unref();
  const base = `http://127.0.0.1:${srv.address().port}/api/`;
  const call = async (path, { tok, dev, body, method } = {}) => {
    const h = { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(tok ? { 'x-firebase-token': tok } : {}), ...(dev ? { 'x-event-device': dev } : {}) };
    const r = await fetch(base + path, { method: method || (body ? 'POST' : 'GET'), headers: h, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, j: await r.json() };
  };
  const devTok = async () => (await call('event')).j.dev;
  /** Appareil enregistré (sans compte) : jeton FCM, langue → clé. */
  const reg = async (fcm, l, extra = {}) => { const dev = extra.dev || await devTok(); const r = await call('event/push', { dev, tok: extra.tok, body: { sub: { fcm }, l } }); assert.equal(r.status, 200, JSON.stringify(r.j)); return { k: r.j.k, dev }; };
  const at = async s => { clock.t = typeof s === 'number' ? s : paris(s); await ev.pushTick(); };
  return { ev, F, clock, call, reg, at, devTok, logs, stop: () => { srv.closeAllConnections(); srv.close(); } };
}

test('textes et étapes : 6 langues, dates dans la langue, J-3 / J0 / mi-parcours / dernier jour', () => {
  assert.equal(evPushReady(HW), true, 'pack Halloween complet');
  for (const p of E.EV_PACKS.filter(x => !x.ready)) assert.equal(evPushReady(p), false, p.id + ' : pas prêt, aucune notification');
  const ed = E.evById('halloween-2026');
  assert.deepEqual(evPushWindows(ed).map(w => [w.kind, w.a, w.b]), [['soon', '2026-10-22', '2026-10-24'], ['open', '2026-10-25', '2026-10-25'], ['mid', '2026-11-01', '2026-11-03'], ['last', '2026-11-08', '2026-11-08']], 'étapes de Discord, sans le récapitulatif');
  const due = (d, done) => evPushDue(d, [ed], done).map(x => x.kind).join();
  assert.equal(due('2026-10-21'), ''); assert.equal(due('2026-10-22'), 'soon'); assert.equal(due('2026-10-24'), 'soon', 'J-3 rattrapé jusqu\'à la veille');
  assert.equal(due('2026-10-24', { 'halloween-2026|soon': 1 }), '', 'déjà partie'); assert.equal(due('2026-10-25', { 'halloween-2026|soon': 1 }), 'open');
  assert.equal(due('2026-10-26'), '', 'J0 le jour même seulement'); assert.equal(due('2026-11-01'), 'mid'); assert.equal(due('2026-11-03'), 'mid'); assert.equal(due('2026-11-04'), '');
  assert.equal(due('2026-11-08'), 'last'); assert.equal(due('2026-11-09'), '', 'pas de récapitulatif en notification');
  assert.deepEqual(evPushText(HW, 'open', ed, '2026-10-25', 'fr'), ['🎃 La chasse aux citrouilles est ouverte !', '30 citrouilles se cachent dans l\'appli jusqu\'au 8 novembre, 5 par jour. À toi de jouer !']);
  assert.deepEqual(evPushText(HW, 'soon', ed, '2026-10-22', 'en'), ['🎃 The pumpkin hunt is coming', 'From October 25 to November 8, 30 pumpkins hide in the app: Halloween 2026 badges to win.']);
  assert.match(evPushText(HW, 'soon', ed, '2026-10-22', 'de')[1], /^Vom 25\. Oktober bis 8\. November verstecken sich 30 Kürbisse/);
  assert.match(evPushText(HW, 'soon', ed, '2026-10-22', 'es')[1], /^Del 25 de octubre al 8 de noviembre, 30 calabazas/);
  assert.match(evPushText(HW, 'soon', ed, '2026-10-22', 'pt')[1], /^De 25 de outubro a 8 de novembro, 30 abóboras/);
  assert.match(evPushText(HW, 'soon', ed, '2026-10-22', 'it')[1], /^25 ottobre – 8 novembre: 30 zucche/);
  assert.equal(evPushText(HW, 'mid', ed, '2026-11-01', 'fr')[0], '🕸️ Plus que 8 jours de chasse', 'jours restants, aujourd\'hui compris');
  assert.equal(evPushText(HW, 'mid', ed, '2026-11-03', 'en')[0], '🕸️ 6 days of hunting left', 'rattrapé deux jours plus tard : le compte dit vrai');
  assert.deepEqual(evPushText(HW, 'last', ed, '2026-11-08', 'xx'), evPushText(HW, 'last', ed, '2026-11-08', 'fr'), 'langue inconnue : français');
  for (const k of EVP_STEPS) for (const l of EVP_LANGS) { const [t, b] = evPushText(HW, k, ed, k === 'mid' ? '2026-11-01' : ed.from, l); assert.ok(t && b && !/[{}]/.test(t + b) && t.length <= 65 && b.length <= 180, `${k} ${l} : ${t} / ${b}`); }
  assert.equal(evPushDate('2026-11-01', 'fr'), '1 novembre'); assert.equal(evPushDate('2026-11-01', 'en'), 'November 1');
  // deux éditions dues le même jour : la plus importante d'abord (ouverture avant J-3)
  const other = { ...ed, id: 'zz-2026', from: '2026-10-22', to: '2026-11-05', days: 15 };
  assert.deepEqual(evPushDue('2026-10-22', [ed, other], {}).map(x => x.ed.id + '|' + x.kind), ['zz-2026|open', 'halloween-2026|soon']);
});

test('appareils : avec ou sans compte, retrait par leur compte ou leur appareil, plafonds, sans compte de service', async () => {
  const dir2 = newDir(), S = await up({ dir: dir2 });
  const r0 = await S.call('event/push', { body: { sub: { fcm: 'tokA-xxxxxx' }, l: 'de' } });
  assert.equal(r0.status, 400); assert.equal(r0.j.error, 'device'); assert.match(r0.j.dev, /^[\w-]{22}\.[\w-]{16}$/, 'ni compte ni appareil : jeton d\'appareil donné');
  const dev = r0.j.dev, A = await S.call('event/push', { dev, body: { sub: { fcm: 'tokA-xxxxxx' }, l: 'de' } });
  assert.equal(A.status, 200); assert.equal(A.j.k, pushK('tokA-xxxxxx'), 'clé : celle de la Carte mystère');
  assert.equal((await S.call('event/push', { dev, body: { sub: { fcm: 'x' } } })).status, 400, 'abonnement refusé');
  assert.equal((await S.call('event/push', { dev: 'faux.' + 'a'.repeat(16), body: { sub: { fcm: 'tokB-xxxxxx' } } })).j.error, 'device', 'jeton d\'appareil faux : refusé');
  assert.equal((await S.call('event/push', { dev, method: 'GET' })).status, 405);
  const dev2 = await S.devTok(), Z = await S.call('event/push', { dev: dev2, tok: 'tok-zoe', body: { sub: { fcm: 'tokZ-xxxxxx' }, l: 'en' } }); assert.equal(Z.status, 200);
  await S.ev.flush(); const G = S.ev._push._g.st;
  assert.equal(G.d.get(A.j.k).t, '', 'sans compte'); assert.equal(G.d.get(A.j.k).l, 'de'); assert.ok(G.d.get(Z.j.k).t.length === 64 && G.d.get(Z.j.k).dv, 'compte (empreinte) et appareil');
  // retrait : un autre appareil ou un autre compte ne peut rien ; le sien, oui
  await S.call('event/push', { dev: dev2, body: { off: A.j.k } }); await S.call('event/push', { dev: dev2, tok: 'tok-max', body: { off: A.j.k } }); assert.ok(G.d.has(A.j.k), 'retiré par un autre : gardé');
  await S.call('event/push', { dev, body: { off: A.j.k } }); assert.ok(!G.d.has(A.j.k), 'retiré par son appareil');
  await S.call('event/push', { dev: await S.devTok(), tok: 'tok-zoe', body: { off: Z.j.k } }); assert.ok(!G.d.has(Z.j.k), 'retiré par son compte (depuis un autre appareil)');
  // même appareil, autre compte : il change de propriétaire ; 3 jetons au plus par appareil, 8 par compte
  for (const t of ['tok1-xxxxxx', 'tok2-xxxxxx', 'tok3-xxxxxx', 'tok4-xxxxxx']) await S.call('event/push', { dev, body: { sub: { fcm: t }, l: 'fr' } });
  assert.deepEqual([...G.d.values()].filter(x => x.dv === dev.split('.')[0]).map(x => x.sub.fcm), ['tok2-xxxxxx', 'tok3-xxxxxx', 'tok4-xxxxxx'], '3 par appareil : le plus ancien part');
  for (let i = 0; i < 10; i++) await S.call('event/push', { dev: await S.devTok(), tok: 'tok-max', body: { sub: { fcm: 'tokM' + i + '-xxxxx' }, l: 'fr' } });
  assert.equal([...G.d.values()].filter(x => x.t && x.t === [...G.d.values()].find(y => y.sub.fcm === 'tokM9-xxxxx').t).length, 8, '8 par compte');
  await S.ev.flush(); const file = JSON.parse(readFileSync(join(dir2, 'push.json'), 'utf8')); assert.equal(Object.keys(file.d).length, G.d.size, 'écrit sur le disque');
  S.stop();
  const N = await up({ push: null }); const d3 = await N.devTok();
  assert.equal(N.ev.pushOn, false); assert.equal((await N.call('event/push', { dev: d3, body: { sub: { fcm: 'tokA-xxxxxx' } } })).status, 404, 'sans compte de service : rien');
  assert.equal((await N.call('admin/events/push')).status, 404); N.stop();
  const O = await up({ on: false }); assert.equal(O.ev.pushOn, false, 'EVENT=0 : coupées'); O.stop();
});

test('annonces automatiques : chaque étape une fois, une par jour, entre 10 h et 21 h à Paris, dans la langue de l\'appareil', async () => {
  const S = await up();
  await S.reg('tokFR-xxxxx', 'fr'); await S.reg('tokEN-xxxxx', 'en'); await S.reg('tokDE-xxxxx', 'de');
  await S.at('2026-10-21 12:00'); await S.at('2026-10-22 09:59'); assert.equal(S.F.sent.length, 0, 'avant J-3, puis J-3 avant 10 h : rien');
  await S.at('2026-10-22 10:01'); assert.equal(S.F.sent.length, 3, 'J-3 à 10 h : les 3 appareils');
  const m = S.F.to('tokDE-xxxxx')[0]; assert.deepEqual([m.title, m.url, m.kind, m.tag, m.topic, m.urgency], ['🎃 Die Kürbisjagd kommt', './?fete=1', 'open', 'mo-event', 'mo-event', 'normal']);
  assert.ok(m.ttl >= 60 && m.ttl <= 14 * 3600, 'gardée par le service jusqu\'à minuit : ' + m.ttl); assert.equal(S.F.to('tokEN-xxxxx')[0].title, '🎃 The pumpkin hunt is coming');
  for (const s of ['2026-10-22 18:00', '2026-10-23 10:30', '2026-10-24 11:00', '2026-10-25 09:59']) await S.at(s);
  assert.equal(S.F.sent.length, 3, 'J-3 une seule fois ; J0 pas avant 10 h');
  await S.at('2026-10-25 10:00'); assert.equal(S.F.to('tokFR-xxxxx').at(-1).title, '🎃 La chasse aux citrouilles est ouverte !'); assert.equal(S.F.sent.length, 6);
  for (let d = 26; d <= 31; d++) await S.at(`2026-10-${d} 12:00`);
  await S.at('2026-11-01 20:59'); assert.equal(S.F.to('tokFR-xxxxx').at(-1).title, '🕸️ Plus que 8 jours de chasse', 'mi-parcours, jusqu\'à 20:59'); assert.equal(S.F.sent.length, 9);
  for (const s of ['2026-11-02 12:00', '2026-11-03 12:00', '2026-11-07 12:00', '2026-11-08 06:00', '2026-11-08 21:00']) await S.at(s);
  assert.equal(S.F.sent.length, 9, 'rien d\'autre ; dernier jour : ni la nuit, ni après 21 h');
  await S.at('2026-11-09 12:00'); await S.at('2026-11-10 12:00'); assert.equal(S.F.sent.length, 9, 'dernier jour manqué (seulement le jour même) ; pas de récapitulatif');
  for (const t of ['tokFR-xxxxx', 'tokEN-xxxxx', 'tokDE-xxxxx']) assert.equal(new Set(S.F.to(t).map(x => x.title)).size, S.F.to(t).length, t + ' : jamais deux fois la même');
  const v = (await S.call('admin/events/push')).j; assert.deepEqual(v.hist.map(x => [x.kind, x.step, x.n, x.ok]), [['auto', 'mid', 3, 3], ['auto', 'open', 3, 3], ['auto', 'soon', 3, 3]], 'historique du panneau');
  assert.equal(v.hist[0].title, '🕸️ Plus que 8 jours de chasse'); assert.deepEqual(v.next, { day: '2026-11-28', step: 'soon', ev: 'noel-2026', title: '🎄 Le calendrier de l\'Avent arrive' }, 'suivante : le calendrier de l\'Avent');
  S.stop();
  // dernier jour, à 10 h
  const L = await up(); await L.reg('tokFR-xxxxx', 'fr'); await L.at('2026-11-08 10:05'); assert.deepEqual(L.F.sent.map(x => x.title), ['🦇 Dernier jour de la chasse !']);
  const nx = (await L.call('admin/events/push')).j.next; assert.deepEqual(nx, { day: '2026-11-28', step: 'soon', ev: 'noel-2026', title: '🎄 Le calendrier de l\'Avent arrive' }); L.stop();
  const N = await up({ t: paris('2026-10-20 12:00') }); assert.deepEqual((await N.call('admin/events/push')).j.next, { day: '2026-10-22', step: 'soon', ev: 'halloween-2026', title: '🎃 La chasse aux citrouilles arrive' }, 'prochaine annonce affichée au panneau'); N.stop();
});

test('rattrapage, une par jour avec deux éditions, édition coupée, cibles refusées retirées', async () => {
  // serveur arrêté les 22 et 23 : J-3 rattrapé le 24 ; arrêté tout le 25 : J0 perdu (jamais en retard)
  const S = await up(); await S.reg('tokFR-xxxxx', 'fr');
  await S.at('2026-10-24 15:00'); assert.deepEqual(S.F.sent.map(x => x.title), ['🎃 La chasse aux citrouilles arrive']);
  await S.at('2026-10-26 10:00'); await S.at('2026-10-27 10:00'); assert.equal(S.F.sent.length, 1, 'J0 manqué : pas envoyé le lendemain'); S.stop();
  // deux éditions le même jour : une seule notification, l'autre le lendemain (fenêtre J-3)
  const Z = { ...HW, id: 'zztest', when: y => ({ from: `${y}-10-22`, to: `${y}-11-05` }) }, list = [HW, Z];
  const evPack = id => list.find(p => p.id === String(id).replace(/-\d{4}$/, '')) || null;
  const packs = { ...E, EV_PACKS: list, evPack, evById: id => { const mm = /^([a-z]+)-(\d{4})$/.exec(String(id)); const p = mm && evPack(mm[1]); return p ? E.evEdition(p, +mm[2]) : null; } };
  const T2 = await up({ opts: { packs } }); await T2.reg('tokFR-xxxxx', 'fr');
  await T2.at('2026-10-22 10:00'); await T2.at('2026-10-22 15:00'); assert.deepEqual(T2.F.sent.map(x => x.title), ['🎃 La chasse aux citrouilles est ouverte !'], 'une par jour : l\'ouverture d\'abord');
  await T2.at('2026-10-23 10:00'); assert.equal(T2.F.sent.at(-1).title, '🎃 La chasse aux citrouilles arrive', 'le J-3 de l\'autre le lendemain'); assert.equal(T2.F.sent.length, 2);
  await T2.at('2026-10-24 10:00'); assert.equal(T2.F.sent.length, 2); T2.stop();
  // édition coupée dans /admin : rien (et plus rien de prévu)
  const C = await up(); await C.reg('tokFR-xxxxx', 'fr');
  assert.equal((await C.call('admin/events/switch', { body: { id: 'halloween-2026', on: false } })).status, 200);
  await C.at('2026-10-22 10:00'); await C.at('2026-10-25 10:00'); assert.equal(C.F.sent.length, 0, 'coupée : aucune annonce');
  assert.deepEqual((await C.call('admin/events/push')).j.next, { day: '2026-11-28', step: 'soon', ev: 'noel-2026', title: '🎄 Le calendrier de l\'Avent arrive' }, 'Halloween coupé : la suivante est Noël');
  await C.call('admin/events/switch', { body: { id: 'halloween-2026', on: true } }); await C.at('2026-11-01 10:00'); assert.equal(C.F.sent.length, 1, 'rallumée : la suivante part'); C.stop();
  // cibles refusées (404, 410) : retirées ; échec passager (500) : gardée
  const R = await up(); for (const t of ['GONE1-xxxxx', 'OLD1-xxxxxx', 'FAIL1-xxxxx', 'tokOK-xxxxx']) await R.reg(t, 'fr');
  await R.at('2026-10-22 10:00'); const h = (await R.call('admin/events/push')).j;
  assert.deepEqual([h.hist[0].n, h.hist[0].ok, h.hist[0].gone, h.hist[0].fail], [4, 1, 2, 1]); assert.equal(h.counts.ev, 2, 'périmées retirées'); R.stop();
});

test('mise en route : aucune annonce automatique pendant les 2 h qui suivent le premier démarrage (gardé au redémarrage)', async () => {
  const dir = newDir(), S = await up({ dir, opts: { warmMs: 2 * 3600e3 }, t: paris('2026-10-25 10:30') }); await S.reg('tokFR-xxxxx', 'fr');
  await S.at('2026-10-25 11:00'); await S.at('2026-10-25 12:29'); assert.equal(S.F.sent.length, 0, 'déployé à 10:30 : rien avant 12:30');
  const v = (await S.call('admin/events/push')).j; assert.equal(v.warm, paris('2026-10-25 12:30'), 'fin de la mise en route montrée au panneau'); await S.ev.flush(); S.stop();
  const S2 = await up({ dir, opts: { warmMs: 2 * 3600e3 }, t: paris('2026-10-25 12:00') }); await S2.at('2026-10-25 12:10'); assert.equal(S2.F.sent.length, 0, 'redémarré : la mise en route ne repart pas de zéro, et ne s\'arrête pas avant');
  await S2.at('2026-10-25 12:31'); assert.deepEqual(S2.F.sent.map(x => x.title), ['🎃 La chasse aux citrouilles est ouverte !'], 'ensuite : J0 le jour même'); S2.stop();
});

test('jamais deux fois : redémarrage en plein envoi, fichier illisible', async () => {
  const dir = newDir(), A = fakePush({ hang: 4 }), B = fakePush(), toks = Array.from({ length: 7 }, (_, i) => 'tokX' + i + '-xxxxx'), order = toks.slice().sort((a, b) => (pushK(a) < pushK(b) ? -1 : 1));
  const h1 = await up({ dir, push: A, batch: 3 }); for (const t of toks) await h1.reg(t, 'fr'); await h1.ev.flush();
  h1.clock.t = paris('2026-10-25 10:00'); h1.ev.pushTick(); await sleep(400);
  assert.deepEqual(A.sent.map(x => x.sub.fcm), order.slice(0, 6), 'lots dans l\'ordre des clés ; le 2e lot reste sans réponse (serveur arrêté en plein envoi)');
  h1.stop();
  const h2 = await up({ dir, push: B, batch: 3, t: paris('2026-10-25 10:01') }); await h2.ev.pushTick();
  assert.deepEqual(B.sent.map(x => x.sub.fcm), [order[6]], 'redémarré : seulement le lot suivant (le lot interrompu n\'est pas renvoyé)');
  const all = [...A.sent, ...B.sent].map(x => x.sub.fcm); assert.equal(new Set(all).size, all.length, 'jamais deux fois le même appareil');
  await h2.at('2026-10-25 15:00'); assert.equal(B.sent.length, 1, 'même jour : rien de plus'); h2.stop();
  // redémarré le lendemain : l'envoi d'hier n'est jamais repris
  const h3 = await up({ dir, push: fakePush(), batch: 3, t: paris('2026-10-26 12:00') }); await h3.ev.pushTick(); assert.equal(h3.F.sent.length, 0); h3.stop();
  // fichier illisible : rien n'est envoyé ni écrit (on ne sait pas ce qui est parti)
  const bad = newDir(); mkdirSync(bad, { recursive: true }); writeFileSync(join(bad, 'push.json'), '{ pas du json');
  const X = await up({ dir: bad, t: paris('2026-10-25 10:00') }); await X.ev.pushTick(); assert.equal(X.F.sent.length, 0);
  assert.equal((await X.call('event/push', { dev: await X.devTok(), body: { sub: { fcm: 'tokA-xxxxxx' } } })).status, 503);
  assert.equal(readFileSync(join(bad, 'push.json'), 'utf8'), '{ pas du json', 'gardé tel quel'); X.stop();
});

test('envois manuels : FR + EN exigés, repli FR, cible, un par heure, programmés, annulés, historique', async () => {
  const extra = [{ k: pushK('tokFR-xxxxx'), sub: { fcm: 'tokFR-xxxxx' }, l: 'fr' }, { k: pushK('tokMY-xxxxx'), sub: { fcm: 'tokMY-xxxxx' }, l: 'it' }];      // appareils de la Carte mystère (l'un aussi aux événements)
  const logs = [], S = await up({ extra: async () => extra, adminLog: r => logs.push(r), t: paris('2026-10-27 09:00') });
  await S.reg('tokFR-xxxxx', 'fr'); await S.reg('tokEN-xxxxx', 'en'); await S.reg('tokDE-xxxxx', 'de');
  const T = { fr: 'Nouveau : les badges', en: 'New: badges' }, B = { fr: 'Ouvre l\'appli pour les voir.', en: 'Open the app to see them.' };
  const post = b => S.call('admin/events/push', { body: b });
  assert.equal((await post({ title: { fr: 'x' }, body: { fr: 'y' }, target: 'ev' })).j.error, 'bad_text', 'anglais exigé');
  assert.equal((await post({ title: T, body: B, target: 'moi' })).j.error, 'bad_target');
  assert.equal((await post({ title: { ...T, fr: 'x'.repeat(66) }, body: B, target: 'ev' })).j.error, 'too_long');
  assert.equal((await post({ title: T, body: { ...B, en: 'y'.repeat(181) }, target: 'ev' })).j.error, 'too_long');
  assert.equal((await post({ title: { ...T, de: 'Neu' }, body: B, target: 'ev' })).j.error, 'bad_text', 'allemand : titre sans texte refusé');
  const v0 = (await S.call('admin/events/push')).j; assert.deepEqual(v0.counts, { ev: 3, all: 4 }, '« tous » : sans doublon'); assert.equal(v0.wait, 0);
  const r1 = await post({ title: T, body: B, target: 'ev' }); assert.equal(r1.status, 200, JSON.stringify(r1.j));
  assert.deepEqual([r1.j.entry.st, r1.j.entry.n, r1.j.entry.ok, r1.j.entry.by, r1.j.entry.target], ['done', 3, 3, '', 'ev']);
  assert.deepEqual(S.F.sent.map(m => [m.sub.fcm, m.title]).sort(), [['tokDE-xxxxx', 'Nouveau : les badges'], ['tokEN-xxxxx', 'New: badges'], ['tokFR-xxxxx', 'Nouveau : les badges']], 'repli français pour l\'allemand');
  assert.deepEqual([S.F.sent[0].url, S.F.sent[0].tag, S.F.sent[0].topic], ['./?fete=1', 'mo-event', 'mo-event']);
  assert.match(logs[0].d, /^Notification envoyée \(événements\) : « Nouveau : les badges »$/, 'noté au journal du panneau');
  const r2 = await post({ title: T, body: B, target: 'all' }); assert.equal(r2.status, 429); assert.equal(r2.j.error, 'too_soon'); assert.ok(r2.j.retry > 3500 && r2.j.retry <= 3600);
  assert.equal((await S.call('admin/events/push')).j.wait > 0, true);
  S.clock.t += 61 * 60e3; S.F.sent.length = 0;
  const r3 = await post({ title: { ...T, de: 'Neu: Abzeichen' }, body: { ...B, de: 'Öffne die App.' }, target: 'all' }); assert.equal(r3.status, 200);
  assert.deepEqual(S.F.sent.map(m => [m.sub.fcm, m.title]).sort(), [['tokDE-xxxxx', 'Neu: Abzeichen'], ['tokEN-xxxxx', 'New: badges'], ['tokFR-xxxxx', 'Nouveau : les badges'], ['tokMY-xxxxx', 'Nouveau : les badges']], '« tous » : la Carte mystère aussi, une fois chacun');
  // programmés : à l'heure dite, annulable, un par heure (programmés compris)
  S.F.sent.length = 0; const t0 = S.clock.t;
  assert.equal((await post({ title: T, body: B, target: 'ev', at: t0 + 30e3 })).j.error, 'bad_time', 'dans une minute au moins');
  assert.equal((await post({ title: T, body: B, target: 'ev', at: t0 + 31 * 864e5 })).j.error, 'bad_time');
  const p1 = await post({ title: T, body: B, target: 'ev', at: t0 + 2 * 3600e3 }); assert.equal(p1.status, 200); assert.equal(p1.j.entry.st, 'scheduled');
  assert.equal((await post({ title: T, body: B, target: 'ev', at: t0 + 2.5 * 3600e3 })).j.error, 'too_soon', 'une heure entre deux envois, programmés compris');
  const p2 = await post({ title: { fr: 'Annulé', en: 'Cancelled' }, body: B, target: 'ev', at: t0 + 5 * 3600e3 }); assert.equal(p2.status, 200);
  assert.equal((await S.call('admin/events/push/cancel', { body: { id: p2.j.entry.id } })).status, 200);
  assert.equal((await S.call('admin/events/push/cancel', { body: { id: p2.j.entry.id } })).status, 404, 'déjà annulé');
  await S.at(t0 + 3600e3); assert.equal(S.F.sent.length, 0, 'pas encore l\'heure');
  await S.at(t0 + 2 * 3600e3 + 30e3); assert.equal(S.F.sent.length, 3, 'programmé : parti à son heure');
  await S.at(t0 + 6 * 3600e3); assert.equal(S.F.sent.length, 3, 'annulé : jamais parti');
  const h = (await S.call('admin/events/push')).j.hist;
  assert.deepEqual(h.map(x => [x.kind, x.target, x.st, x.title]), [['manual', 'ev', 'cancelled', 'Annulé'], ['manual', 'ev', 'done', 'Nouveau : les badges'], ['manual', 'all', 'done', 'Nouveau : les badges'], ['manual', 'ev', 'done', 'Nouveau : les badges']]);
  assert.deepEqual(h[2].langs, ['fr', 'en', 'de']); assert.ok(h.every(x => !('sub' in x) && !('txt' in x)), 'rien des appareils dans le panneau');
  // programmé pendant un arrêt du serveur de plus de 2 h : abandonné (jamais en retard)
  const p3 = await post({ title: T, body: B, target: 'ev', at: S.clock.t + 3600e3 + 60e3 }); assert.equal(p3.status, 200);
  await S.at(S.clock.t + 5 * 3600e3); assert.equal(S.F.sent.length, 3); assert.equal((await S.call('admin/events/push')).j.hist[0].cut, true);
  S.stop();
});

/* ── Le vrai proxy.mjs ─────────────────────────────────────────────────────────────────────────────────────────── */
async function proxyUp(port, env) {
  const p = spawn('node', ['proxy.mjs'], { env: { ...process.env, PORT: String(port), EDH_SOURCE_URL: '', PRICES_SOURCE_URL: '', EVENT_DIR: newDir(), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
  process.on('exit', () => { try { p.kill(); } catch { /* ignore */ } });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/__ping`)).ok) break; } catch { /* pas encore */ } await sleep(100); }
  return { p, out: () => out, url: `http://127.0.0.1:${port}/`, stop: () => p.kill() };
}
test('proxy.mjs : /__ping › evpush, appareil sans compte, envoi manuel par le panneau (FCM : tag et collapse_key « mo-event », ./?fete=1), EVENT_PUSH=0, sans compte de service', async () => {
  const F = await startFakes(), ADMIN = 'ed.itor@test.dev', TOK = 'eP1:APA91b' + 'p'.repeat(120);
  const P = await proxyUp(19881, { ...F.env, EVENT: '1', EVENT_PUSH: '1', EVENT_PUSH_FIRST_MS: '600000', ADMIN_EMAILS: ADMIN });
  assert.equal((await (await fetch(P.url + '__ping')).json()).evpush, true, 'compte de service : proposées');
  const dev = (await (await fetch(P.url + 'api/event')).json()).dev;
  const r = await fetch(P.url + 'api/event/push', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-event-device': dev }, body: JSON.stringify({ sub: { fcm: TOK }, l: 'en' }) });
  const j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j) + P.out()); assert.equal(j.k, pushK(TOK));
  assert.equal((await fetch(P.url + 'api/event/push', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-event-device': dev }, body: JSON.stringify({ sub: { fcm: 'court' } }) })).status, 400, 'jeton FCM mal formé (parseTarget)');
  const H = { 'Content-Type': 'application/json', 'x-firebase-token': F.jwt('uid-ed', 3600, { email: ADMIN, email_verified: true }) };
  const body = JSON.stringify({ title: { fr: 'Bonjour', en: 'Hello' }, body: { fr: 'Un texte.', en: 'Some text.' }, target: 'ev' });
  assert.equal((await fetch(P.url + 'api/admin/events/push', { method: 'POST', headers: { ...H, 'x-firebase-token': F.jwt('uid-bob') }, body })).status, 403, 'panneau réservé');
  const s = await fetch(P.url + 'api/admin/events/push', { method: 'POST', headers: H, body }), sj = await s.json();
  assert.equal(s.status, 200, JSON.stringify(sj)); assert.deepEqual([sj.entry.n, sj.entry.ok, sj.entry.target], [1, 1, 'ev']); assert.match(sj.entry.by, /•••@/, 'éditeur : e-mail masqué');
  const m = F.fcmFor(TOK); assert.equal(m.length, 1);
  assert.deepEqual([m[0].notification.title, m[0].notification.body, m[0].data.url, m[0].android.collapse_key, m[0].android.notification.tag], ['Hello', 'Some text.', './?fete=1', 'mo-event', 'mo-event'], 'dans la langue de l\'appareil');
  const v = await (await fetch(P.url + 'api/admin/events/push', { headers: H })).json(); assert.equal(v.hist.length, 1); assert.equal(v.counts.ev, 1);
  assert.equal((await fetch(P.url + 'api/admin/events/push', { method: 'POST', headers: H, body })).status, 429, 'un envoi par heure');
  P.stop();
  const Q = await proxyUp(19882, { ...F.env, EVENT: '1', EVENT_PUSH: '0' });
  assert.equal((await (await fetch(Q.url + '__ping')).json()).evpush, false, 'EVENT_PUSH=0 : coupées');
  const d2 = (await (await fetch(Q.url + 'api/event')).json()).dev;
  assert.equal((await fetch(Q.url + 'api/event/push', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-event-device': d2 }, body: JSON.stringify({ sub: { fcm: TOK } }) })).status, 404);
  Q.stop(); await sleep(300);
  const R = await proxyUp(19882, { EVENT: '1', EVENT_PUSH: '1', FCM_SERVICE_ACCOUNT: '' }); assert.equal((await (await fetch(R.url + '__ping')).json()).evpush, false, 'sans compte de service : rien'); R.stop();
  F.stop();
});
