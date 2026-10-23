// Carte mystère sur Discord : carte du jour annoncée (ping du rôle « 🔮 Carte mystère ») et classement de la semaine le dimanche dans #carte-mystère.
// 1) daily-srv.mjs seul (horloge injectée, faux Scryfall de daily-fakes.mjs, faux announce / weekly) : annonce une seule fois par jour dès que la carte est prête
//    (jamais avant), redémarrage, rattrapage dans la fenêtre, fenêtre dépassée, échec puis nouvel essai, arrêt en plein envoi, ordre (carte d'hier, classement,
//    annonce) ; classement du dimanche une seule fois (lundi → samedi, top 10, comptes établis seulement, « à vérifier », entraînement et adresse non vérifiée
//    exclus, pseudo masqué, sans pseudo), rien le reste de la semaine, personne de classé : rien. 2) discord-srv.mjs › discord-daily.mjs contre un faux Discord
//    HTTP : message, ping du rôle et allowed_mentions exacts, rôle absent ou impossible à pinger : sans ping, classement sans ping et pseudos neutralisés, panne,
//    salon absent, bot coupé. 3) Le vrai proxy.mjs (ports 19860–19861) : annonce postée par le tour de garde ; DISCORD_DAILY_ANNOUNCE=0 et DISCORD_WEEKLY=0 : rien.
import './setup-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dailyMake, dlyTag } from '../daily-srv.mjs';
import { discordMake, DSC_GAME } from '../discord-srv.mjs';
import { dscAnnounceMsg, dscWeeklyMsg, dscRoleKey } from '../discord-daily.mjs';
import { startDailyScry, LANGS } from './daily-fakes.mjs';

const TMP = mkdtempSync(join(tmpdir(), 'deckdeal-dscdaily-')); process.on('exit', () => { try { rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });
let nDir = 0; const newDir = () => { const d = join(TMP, 'd' + (++nDir)); mkdirSync(d, { recursive: true }); return d; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DDF = dir => (existsSync(join(dir, 'discord-daily.json')) ? JSON.parse(readFileSync(join(dir, 'discord-daily.json'), 'utf8')) : null);

/* ── 1) daily-srv.mjs : quand annoncer, quand poster le classement ─────────────────────────────────────────────────────────────── */
/** Faux envoi (announce, weekly, reveal) : infos reçues ; fail : refus restants ; hang : plus aucune réponse ; seq : ordre des appels (commun). */
function fake(kind, seq, o = {}) {
  const F = { got: [], fail: o.fail || 0, hang: !!o.hang };
  F.fn = async info => { F.got.push(info); if (seq) seq.push(kind + ':' + (info.week || info.day)); if (F.hang) return new Promise(() => {}); if (F.fail > 0) { F.fail--; throw new Error('Discord en panne'); } return true; };
  return F;
}
async function mk(at, dir, S, opts = {}) {
  const T = { now: at }, warns = [];
  const D = dailyMake({ dir, scry: S.url, imgHosts: [S.url + '/'], now: () => T.now, gapMs: 0, firstMs: 1e9, secret: 'secret-de-test', log: { log() {}, warn: m => warns.push(m) }, ...opts });
  const ready = async () => { await D.tick(); assert.equal(D._g.cur.st, 'ready', 'carte prête : ' + warns.join(' | ')); assert.ok(D._g.imgs.has(D._g.cur.day)); };
  return { T, D, warns, ready, stop: () => D.stop() };
}

test('annonce de la carte du jour : une fois par jour dès qu\'elle est prête (jamais avant), redémarrage, rattrapage dans la fenêtre, trop tard : rien, échec puis nouvel essai, arrêt en plein envoi, après la carte d\'hier', async () => {
  const dir = newDir(), S = await startDailyScry(), A = fake('announce');
  let h = await mk(Date.UTC(2026, 9, 15, 15, 30), dir, S, { announce: A.fn });      // 17:30 à Paris : carte du 14, sortie hier à 18:00 (plus de 2 h : trop tard)
  assert.equal(h.D.announceOn, true); assert.equal(h.D.weeklyOn, false);
  await h.ready(); await h.D.tick(); assert.equal(A.got.length, 0, 'carte d\'hier soir : trop tard pour l\'annoncer');
  h.T.now = Date.UTC(2026, 9, 15, 16, 0, 30); await h.D.tick();      // 18:00:30 : carte du 15, préparée d'avance
  assert.deepEqual(A.got, [{ day: '2026-10-15', no: 1 }], 'annoncée : jour et numéro, rien d\'autre (aucun indice)');
  await h.D.tick(); h.T.now += 3600e3; await h.D.tick(); assert.equal(A.got.length, 1, 'une seule fois par jour');
  assert.equal(DDF(dir).day, '2026-10-15', 'jour noté dans discord-daily.json');
  await h.stop();
  h = await mk(Date.UTC(2026, 9, 15, 16, 5), dir, S, { announce: A.fn }); await h.ready(); await h.D.tick();
  assert.equal(A.got.length, 1, 'redémarré à 18:05 (redéploiement) : pas de seconde annonce'); await h.stop();
  // Discord en panne : nouvel essai au tour suivant
  const A2 = fake('announce', null, { fail: 1 });
  h = await mk(Date.UTC(2026, 9, 16, 16, 0, 30), dir, S, { announce: A2.fn }); await h.ready();
  assert.equal(A2.got.length, 1); assert.equal(DDF(dir).day, '2026-10-15', 'échec : état remis comme avant'); assert.ok(h.warns.some(w => /pas encore posté sur Discord/.test(w)), h.warns.join(' | '));
  await h.D.tick(); assert.deepEqual(A2.got.map(x => x.day), ['2026-10-16', '2026-10-16'], 'nouvel essai'); assert.equal(DDF(dir).day, '2026-10-16');
  await h.D.tick(); assert.equal(A2.got.length, 2, 'puis plus rien'); await h.stop();
  // relancé 2 h 30 après 18:00 : rien ce jour-là ; le lendemain à 18:00 : annoncée
  const A3 = fake('announce');
  h = await mk(Date.UTC(2026, 9, 17, 18, 30), dir, S, { announce: A3.fn }); await h.ready(); await h.D.tick();
  assert.equal(A3.got.length, 0, 'fenêtre dépassée (2 h, comme la notification) : pas d\'annonce en retard');
  h.T.now = Date.UTC(2026, 9, 18, 16, 0, 20); await h.D.tick(); assert.deepEqual(A3.got.map(x => [x.day, x.no]), [['2026-10-18', 4]], 'lendemain 18:00 : annoncée'); await h.stop();
  // relancé 1 h 30 après 18:00 : rattrapage
  h = await mk(Date.UTC(2026, 9, 19, 17, 30), dir, S, { announce: A3.fn }); await h.ready();
  assert.deepEqual(A3.got.map(x => x.day), ['2026-10-18', '2026-10-19'], 'dans la fenêtre : rattrapage au redémarrage'); await h.stop();
  h = await mk(Date.UTC(2026, 9, 19, 17, 30), dir, S, { announce: A3.fn, announceWindowMs: 3600e3 }); await h.ready(); assert.equal(A3.got.length, 2); await h.stop();
  // jamais avant que la carte du jour soit prête (images impossibles à faire)
  const A4 = fake('announce'); for (const l of LANGS) S.pngFail.add('tst/17/' + l);
  h = await mk(Date.UTC(2026, 9, 20, 16, 0, 30), dir, S, { announce: A4.fn, retryMs: 30 });
  await h.D.tick(); await h.D.tick(); assert.notEqual(h.D._g.cur.st, 'ready'); assert.equal(A4.got.length, 0, 'carte pas prête : rien');
  S.pngFail.clear(); await sleep(80); await h.D.tick(); assert.equal(h.D._g.cur.st, 'ready'); assert.deepEqual(A4.got.map(x => x.day), ['2026-10-20'], 'prête : annoncée'); await h.stop();
  // arrêt en plein envoi : jour noté avant, jamais deux fois
  const A5 = fake('announce', null, { hang: true }), h1 = await mk(Date.UTC(2026, 9, 21, 16, 1), dir, S, { announce: A5.fn });
  h1.D.tick(); for (let i = 0; i < 200 && !A5.got.length; i++) await sleep(50);
  assert.deepEqual(A5.got.map(x => x.day), ['2026-10-21']);
  const A6 = fake('announce'), h2 = await mk(Date.UTC(2026, 9, 21, 16, 2), dir, S, { announce: A6.fn }); await h2.ready(); await h2.D.tick();
  assert.equal(A6.got.length, 0, 'redémarré après un arrêt en plein envoi : pas de doublon (au pire, pas d\'annonce)'); await h2.stop(); h1.stop().catch(() => {});
  // état illisible : rien (on ne sait pas ce qui est parti)
  const dirX = newDir(); writeFileSync(join(dirX, 'discord-daily.json'), '{abîmé'); const A7 = fake('announce');
  h = await mk(Date.UTC(2026, 9, 15, 16, 0, 30), dirX, S, { announce: A7.fn }); await h.ready(); await h.D.tick();
  assert.equal(A7.got.length, 0); assert.ok(h.warns.some(w => /discord-daily\.json illisible/.test(w))); await h.stop();
  // sans l'option : rien, aucun fichier
  const dir2 = newDir(); h = await mk(Date.UTC(2026, 9, 15, 16, 0, 30), dir2, S); await h.ready(); await h.D.tick();
  assert.equal(h.D.announceOn, false); assert.ok(!existsSync(join(dir2, 'discord-daily.json'))); await h.stop();
  S.stop();
});

test('ordre dans #carte-mystère : la carte d\'hier, puis l\'annonce (qui attend le nouvel essai de la carte d\'hier, 10 min au plus)', async () => {
  const S = await startDailyScry();
  let seq = [], R = fake('reveal', seq), A = fake('announce', seq), dir = newDir();
  let h = await mk(Date.UTC(2026, 9, 15, 15, 30), dir, S, { reveal: R.fn, announce: A.fn }); await h.ready();      // carte du 14 tirée
  h.T.now = Date.UTC(2026, 9, 15, 16, 0, 30); await h.D.tick();
  assert.deepEqual(seq, ['reveal:2026-10-14', 'announce:2026-10-15'], 'la carte d\'hier d\'abord'); await h.stop();
  seq = []; R = fake('reveal', seq, { fail: 99 }); A = fake('announce', seq); dir = newDir();
  h = await mk(Date.UTC(2026, 9, 15, 15, 30), dir, S, { reveal: R.fn, announce: A.fn }); await h.ready();
  h.T.now = Date.UTC(2026, 9, 15, 16, 0, 30); await h.D.tick(); await h.D.tick();
  assert.deepEqual(seq, ['reveal:2026-10-14', 'reveal:2026-10-14'], 'carte d\'hier refusée : l\'annonce attend');
  h.T.now = Date.UTC(2026, 9, 15, 16, 11); await h.D.tick();
  assert.deepEqual(seq.slice(2), ['reveal:2026-10-14', 'announce:2026-10-15'], 'au-delà de 10 min : l\'annonce part quand même (ping du jour)');
  await h.stop(); S.stop();
});

/* Semaine du jeu du lundi 19 au lundi 26 octobre 2026 (dimanche 25 : passage à l'heure d'hiver, carte à 17:00 UTC). */
const WEEK = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'];
let nK = 0; const K = () => 'k' + String(++nK).padStart(23, '0');
const play = (n, s, o = {}) => ({ k: K(), n, l: 'fr', st: s > 0 ? 'win' : 'lost', s, ms: 30000 + nK, at: Date.UTC(2026, 9, 20) + nK, t0: 1, step: 3, wrong: [], ...o });
/** Jours de la semaine écrits sur le disque (clos), comme après de vraies parties ; tag → uid lisible. */
function writeWeek(dir, { empty = false } = {}) {
  const days = new Map([...WEEK, '2026-10-18', '2026-10-25'].map(d => [d, {}])), add = (uid, d, p) => { days.get(d)[dlyTag(uid)] = p; };
  if (!empty) {
    WEEK.forEach(d => add('alice', d, play('Alice', 900)));
    WEEK.slice(0, 5).forEach(d => add('bob', d, play('Bob', 950)));
    WEEK.forEach(d => add('chloe', d, play('Chloé', 700)));
    WEEK.slice(0, 4).forEach(d => add('vilain', d, play('Vilain mot', 1000)));      // pseudo masqué par le panneau
    WEEK.slice(0, 3).forEach(d => add('ping', d, play('@everyone _x_ <@&1>', 1000)));
    WEEK.slice(0, 2).forEach(d => add('anon', d, play('', 1000)));      // sans pseudo : « Joueur XXXX »
    for (let i = 0; i < 7; i++) add('p' + i, WEEK[i % 6], play('Joueur' + i, 980 - 10 * i));
    add('bob', WEEK[5], play('Bob', 0));      // perdue : 0, mais un jour joué de plus
    add('alice', '2026-10-18', play('Alice', 1000)); add('old', '2026-10-18', play('Ancien', 1000));      // semaine d'avant
    add('alice', '2026-10-25', play('Alice', 1000));      // dimanche : la carte vient d'ouvrir, hors du classement posté
  }
  WEEK.forEach(d => { add('triche', d, play('Triche', 1000, { chk: 'ip' })); add('train', d, play('Entraîné', 1000, { lb: false, why: 'device', pr: 1 })); add('nover', d, play('Pasvérifié', 1000, { lb: false, why: 'mail' })); });
  add('enjeu', WEEK[0], play('En cours', 0, { st: 'play', s: 0 }));      // pas finie : rien
  for (const [d, plays] of days) writeFileSync(join(dir, d + '.json'), JSON.stringify({ v: 1, day: d, st: 'wait', card: null, plays, closed: d !== '2026-10-25', at: 0 }));
  writeFileSync(join(dir, 'hidden.json'), JSON.stringify({ v: 1, h: [{ t: dlyTag('vilain'), n: 'Vilain mot', at: 1 }] }));
}

test('classement de la semaine : le dimanche à l\'ouverture de la carte, une seule fois (redémarrage compris), lundi → samedi, top 10 des comptes établis, rien le reste de la semaine', async () => {
  const dir = newDir(), S = await startDailyScry(), W = fake('weekly'); writeWeek(dir);
  let h = await mk(Date.UTC(2026, 9, 19, 16, 0, 30), dir, S, { weekly: W.fn });
  assert.equal(h.D.weeklyOn, true); assert.equal(h.D.announceOn, false);
  await h.ready();
  for (const d of [20, 21, 22, 23, 24]) { h.T.now = Date.UTC(2026, 9, d, 16, 0, 30); await h.D.tick(); h.T.now += 5 * 3600e3; await h.D.tick(); }
  h.T.now = Date.UTC(2026, 9, 25, 16, 30); await h.D.tick();      // dimanche 17:30 (heure d'hiver) : encore la carte du samedi
  assert.equal(W.got.length, 0, 'lundi → samedi, et dimanche avant 18:00 : rien');
  h.T.now = Date.UTC(2026, 9, 25, 17, 0, 30); await h.D.tick();      // dimanche 18:00:30 heure de Paris
  assert.equal(h.D._g.cur.day, '2026-10-25'); assert.equal(W.got.length, 1, 'posté à l\'ouverture de la carte du dimanche');
  const x = W.got[0];
  assert.deepEqual([x.day, x.week, x.days, x.total, x.hour, x.tz, x.to], ['2026-10-25', '2026-10-19', 6, 13, 18, 'Europe/Paris', Date.UTC(2026, 9, 26, 17)], 'semaine du lundi 19, 6 cartes closes, 13 joueurs classés, fin lundi 18:00');
  const fall = 'Joueur ' + dlyTag('anon').slice(0, 4).toUpperCase();
  assert.deepEqual(x.rows, [
    { r: 1, n: 'Alice', s: 5400, d: 6 }, { r: 2, n: 'Bob', s: 4750, d: 6 }, { r: 3, n: 'Chloé', s: 4200, d: 6 }, { r: 4, n: '', s: 4000, d: 4, x: 1 }, { r: 5, n: '@everyone _x_ <@&1>', s: 3000, d: 3 },
    { r: 6, n: fall, s: 2000, d: 2 }, { r: 7, n: 'Joueur0', s: 980, d: 1 }, { r: 8, n: 'Joueur1', s: 970, d: 1 }, { r: 9, n: 'Joueur2', s: 960, d: 1 }, { r: 10, n: 'Joueur3', s: 950, d: 1 },
  ], 'top 10 : « à vérifier », entraînement, adresse non vérifiée, partie pas finie, semaine d\'avant et dimanche exclus ; pseudo masqué : vide (x) ; sans pseudo : « Joueur XXXX » ; aucun compte ni empreinte');
  assert.ok(!JSON.stringify(x).includes(dlyTag('alice')), 'aucune empreinte de compte');
  await h.D.tick(); h.T.now += 3 * 3600e3; await h.D.tick(); assert.equal(W.got.length, 1, 'une seule fois'); assert.equal(DDF(dir).week, '2026-10-19');
  await h.stop();
  h = await mk(Date.UTC(2026, 9, 25, 21), dir, S, { weekly: W.fn }); await h.ready(); await h.D.tick(); assert.equal(W.got.length, 1, 'redémarré le dimanche soir : pas deux fois');
  h.T.now = Date.UTC(2026, 9, 26, 17, 0, 30); await h.D.tick(); assert.equal(W.got.length, 1, 'lundi : rien (nouvelle semaine)');
  await h.stop(); S.stop();
});

test('classement de la semaine : échec puis nouvel essai, serveur relancé le dimanche soir : posté, ordre carte d\'hier → classement → annonce ; personne de classé : rien', async () => {
  const S = await startDailyScry(), seq = [];
  let dir = newDir(); writeWeek(dir);
  const R = fake('reveal', seq), W = fake('weekly', seq, { fail: 1 }), A = fake('announce', seq);
  let h = await mk(Date.UTC(2026, 9, 25, 16, 30), dir, S, { reveal: R.fn, weekly: W.fn, announce: A.fn }); await h.ready();      // carte du samedi tirée
  h.T.now = Date.UTC(2026, 9, 25, 17, 0, 30); await h.D.tick();
  assert.deepEqual(seq, ['reveal:2026-10-24', 'weekly:2026-10-19', 'announce:2026-10-25'], 'carte d\'hier, classement (refusé), annonce');
  assert.equal(DDF(dir).week, '', 'refusé : état remis'); assert.ok(h.warns.some(w => /classement de la semaine du 2026-10-19 pas encore posté/.test(w)), h.warns.join(' | '));
  await h.D.tick(); assert.deepEqual(seq.slice(3), ['weekly:2026-10-19'], 'nouvel essai'); assert.equal(DDF(dir).week, '2026-10-19'); assert.equal(DDF(dir).day, '2026-10-25');
  await h.D.tick(); assert.equal(seq.length, 4); await h.stop();
  // serveur arrêté à 18:00, relancé à 23:00 : le classement part quand même (l'annonce, elle, est trop tard)
  dir = newDir(); writeWeek(dir); const W2 = fake('weekly'), A2 = fake('announce');
  h = await mk(Date.UTC(2026, 9, 25, 22), dir, S, { weekly: W2.fn, announce: A2.fn }); await h.ready();
  assert.deepEqual([W2.got.length, A2.got.length], [1, 0], 'dimanche soir : classement posté, pas d\'annonce en retard'); await h.stop();
  // personne de classé (seulement « à vérifier », entraînement, adresse non vérifiée) : rien
  dir = newDir(); writeWeek(dir, { empty: true }); const W3 = fake('weekly');
  h = await mk(Date.UTC(2026, 9, 25, 17, 0, 30), dir, S, { weekly: W3.fn }); await h.ready(); await h.D.tick();
  assert.equal(W3.got.length, 0, 'personne de classé : rien'); assert.ok(!DDF(dir) || !DDF(dir).week); await h.stop();
  S.stop();
});

/* ── 2) discord-srv.mjs › discord-daily.mjs contre un faux Discord HTTP ────────────────────────────────────────────────────────── */
const TOKEN = 'jeton-du-bot-SECRET-0123456789', G = '910000000000000001', BOT = '910000000000000002';
const B = n => 1n << BigInt(n), VIEW = B(10), SEND = B(11), EMBED = B(14), ATTACH = B(15), MENTION = B(17);
const RL = { mystere: '920000000000000010', bot: '920000000000000003', lfg: '920000000000000011' }, CH = { mystere: '930000000000000006', general: '930000000000000005', cat: '939000000000000003' };
const world = () => ({
  roles: [
    { id: G, name: '@everyone', position: 0, permissions: String(VIEW | SEND), managed: false, mentionable: false },
    { id: RL.mystere, name: '🔮 Carte mystère', position: 2, permissions: '0', managed: false, mentionable: false },      // comme tools/discord-setup.mjs : non mentionnable
    { id: RL.lfg, name: '🎲 LFG', position: 1, permissions: '0', managed: false, mentionable: true },
    { id: RL.bot, name: 'Mana Orbit', position: 4, permissions: String(VIEW | SEND | EMBED | ATTACH | MENTION), managed: true, tags: { bot_id: BOT } },
  ],
  channels: [{ id: CH.cat, name: 'Communauté', type: 4, position: 2 }, { id: CH.mystere, name: '🔮・carte-mystère', type: 0, position: 1, parent_id: CH.cat, rate_limit_per_user: 10 }, { id: CH.general, name: '💬・général', type: 0, position: 0, parent_id: CH.cat }],
});
const DS = { ...world(), posts: [], down: 0, auth: new Set() };
const dsrv = http.createServer((q, r) => {
  const c = []; q.on('data', d => c.push(d)); q.on('end', () => {
    const send = (code, o) => { r.writeHead(code, { 'content-type': 'application/json' }); r.end(o === undefined ? '' : JSON.stringify(o)); };
    const p = new URL(q.url, 'http://x').pathname.replace(/^\/api\/v10/, ''), m = q.method; let x;
    DS.auth.add(q.headers.authorization || '');
    if (q.headers.authorization !== 'Bot ' + TOKEN) return send(401, { message: '401: Unauthorized', code: 0 });
    if (DS.down > 0 && m === 'POST') { DS.down--; return send(503, { message: 'upstream connect error' }); }
    if (m === 'GET' && p === '/users/@me') return send(200, { id: BOT, username: 'Mana Orbit', bot: true });
    if (m === 'GET' && p === '/users/@me/guilds') return send(200, [{ id: G, name: 'Mana Orbit' }]);
    if (m === 'GET' && p === `/guilds/${G}/channels`) return send(200, DS.channels);
    if (m === 'GET' && p === `/guilds/${G}/roles`) return send(200, DS.roles);
    if (m === 'GET' && p === `/guilds/${G}/members/${BOT}`) return send(200, { user: { id: BOT, bot: true }, roles: [RL.bot] });
    if ((x = /^\/channels\/(\d+)\/messages$/.exec(p)) && m === 'POST') {
      if (!DS.channels.some(y => y.id === x[1])) return send(404, { message: 'Unknown Channel', code: 10003 });
      DS.posts.push({ ch: x[1], body: JSON.parse(Buffer.concat(c).toString() || '{}') }); return send(200, { id: String(940000000000000000n + BigInt(DS.posts.length)) });
    }
    return send(404, { message: 'Unknown route ' + m + ' ' + p });
  });
});
await new Promise(r => dsrv.listen(0, '127.0.0.1', r)); dsrv.unref();
const DAPI = `http://127.0.0.1:${dsrv.address().port}/api/v10`;
const lastPost = () => DS.posts[DS.posts.length - 1];

test('discord-daily.mjs : annonce avec le ping du rôle « 🔮 Carte mystère » (allowed_mentions : ce rôle seul), sans ping si absent ou impossible à pinger ; classement sans ping, pseudos neutralisés ; panne, salon absent, bot coupé', async () => {
  const logs = [], bot = discordMake({ token: TOKEN, api: DAPI, cacheMs: 0, sleep: () => Promise.resolve(), log: { log: m => logs.push(m), warn: m => logs.push(m) } });
  assert.equal(dscRoleKey('🔮 Carte mystère'), 'carte mystere'); assert.equal(dscRoleKey('carte-MYSTERE'), 'carte mystere');
  assert.equal(await bot.announce({ day: '2026-10-25', no: 11 }), true);
  let m = lastPost(); assert.equal(m.ch, CH.mystere, '#carte-mystère');
  assert.equal(m.body.content, `<@&${RL.mystere}> 🔮 **Carte mystère n° 11 : une nouvelle carte t'attend !**\n🔮 **Mystery card #11: a new card is waiting for you!**\n<${DSC_GAME}>`, 'FR + EN, lien vers le jeu, aucun indice');
  assert.deepEqual(m.body.allowed_mentions, { parse: [], roles: [RL.mystere] }, 'seul le rôle de la Carte mystère peut être pingé');
  assert.equal(DSC_GAME, 'https://manaorbit.app/?mystere=1');
  // rôle non mentionnable et bot sans « Mentionner tous les rôles » : sans ping (signalé une fois) ; rôle mentionnable : ping
  DS.roles.find(r => r.id === RL.bot).permissions = String(VIEW | SEND | EMBED | ATTACH);
  await bot.announce({ day: '2026-10-25', no: 11 }); await bot.announce({ day: '2026-10-25', no: 11 });
  m = lastPost(); assert.deepEqual(m.body.allowed_mentions, { parse: [] }); assert.ok(!m.body.content.includes('<@&'), 'aucune mention écrite');
  assert.equal(logs.filter(l => /non mentionnable/.test(l)).length, 1, 'signalé une fois');
  DS.roles.find(r => r.id === RL.mystere).mentionable = true; await bot.announce({ day: '2026-10-25', no: 11 });
  assert.deepEqual(lastPost().body.allowed_mentions, { parse: [], roles: [RL.mystere] });
  // rôle absent : sans ping
  DS.roles = DS.roles.filter(r => r.id !== RL.mystere); await bot.announce({ day: '2026-10-26', no: 12 });
  m = lastPost(); assert.deepEqual(m.body.allowed_mentions, { parse: [] }); assert.match(m.body.content, /^🔮 \*\*Carte mystère n° 12 :/); assert.ok(logs.some(l => /rôle « 🔮 Carte mystère » introuvable/.test(l)));
  DS.roles = world().roles;
  // classement : top 10, aucun ping, pseudos neutralisés
  const rows = [{ r: 1, n: 'Alice', s: 5400, d: 6 }, { r: 2, n: 'Bob', s: 4750, d: 6 }, { r: 3, n: 'Chloé', s: 4200, d: 6 }, { r: 4, n: '', s: 4000, d: 4, x: 1 }, { r: 5, n: '@everyone _x_ <@&1>', s: 3000, d: 3 },
    ...Array.from({ length: 7 }, (_, i) => ({ r: 6 + i, n: 'Joueur' + i, s: 980 - 10 * i, d: 1 }))];
  assert.equal(await bot.weekly({ week: '2026-10-19', total: 13, rows, hour: 18, tz: 'Europe/Paris' }), true);
  m = lastPost(); const t = m.body.content;
  assert.equal(m.ch, CH.mystere); assert.deepEqual(m.body.allowed_mentions, { parse: [] }, 'aucun ping');
  assert.match(t, /^🏆 \*\*Carte mystère : classement de la semaine du 19 octobre\*\*\n🏆 \*\*Mystery card: leaderboard for the week of October 19\*\*/);
  assert.match(t, /\n🥇 \*\*Alice\*\* — 5 400 pts · 6 j\n🥈 \*\*Bob\*\* — 4 750 pts · 6 j\n🥉 \*\*Chloé\*\* — 4 200 pts · 6 j\n\*\*4\.\*\* \*pseudo masqué · hidden name\* — 4 000 pts · 4 j\n/);
  assert.ok(t.includes('**5.** **\\@everyone \\_x\\_ \\<\\@&1\\>** — 3 000 pts · 3 j'), 'markdown et mentions neutralisés : ' + t);
  assert.ok(t.includes('**10.** **Joueur4** — 940 pts · 1 j') && !t.includes('Joueur5'), 'top 10 seulement');
  assert.match(t, /13 joueurs classés · 13 ranked players/); assert.match(t, /jusqu'à lundi 18 h : classement final dans l'appli/); assert.match(t, /until Monday 6 pm \(Paris time\)/);
  assert.ok(t.includes(`<${DSC_GAME}>`)); assert.ok(t.length <= 2000);
  assert.match(dscWeeklyMsg({ week: '2026-11-02', total: 1, rows: [{ r: 1, n: 'Zoé', s: 50, d: 1 }], hour: 18 }, DSC_GAME).content, /semaine du 2 novembre[\s\S]*week of November 2[\s\S]*1 joueur classé · 1 ranked player\n/);
  assert.match(dscWeeklyMsg({ week: '2026-06-01', total: 2, rows: [], hour: 9, tz: 'America/New_York' }, DSC_GAME).content, /semaine du 1er juin[\s\S]*lundi 9 h \(America\/New_York\)[\s\S]*Monday 9 am \(America\/New_York\)/);
  assert.deepEqual(dscAnnounceMsg({ no: 3 }, 'pas un id', DSC_GAME).allowed_mentions, { parse: [] }, 'id de rôle mal formé : aucun ping');
  // panne de Discord (5xx deux fois) : erreur (daily-srv.mjs réessaie au tour suivant) ; salon absent ; bot coupé
  const n = DS.posts.length; DS.down = 2;
  await assert.rejects(bot.announce({ day: '2026-10-27', no: 13 }), /Discord indisponible/); assert.equal(DS.posts.length, n);
  DS.channels = DS.channels.filter(c => c.id !== CH.mystere);
  await assert.rejects(bot.announce({ day: '2026-10-27', no: 13 }), /carte-mystère introuvable/); await assert.rejects(bot.weekly({ week: '2026-10-19', total: 1, rows }), /carte-mystère introuvable/);
  DS.channels = world().channels;
  await assert.rejects(discordMake({ token: '', api: DAPI }).announce({ no: 1 }), /non configuré/); await assert.rejects(discordMake({ token: TOKEN, api: DAPI, off: true }).weekly({ week: '2026-10-19' }), /non configuré/);
  assert.ok(!logs.join('\n').includes(TOKEN) && !logs.join('\n').includes(RL.mystere), 'ni jeton ni id dans le journal');
});

/* ── 3) Le vrai proxy.mjs : tour de garde → #carte-mystère ─────────────────────────────────────────────────────────────────────── */
async function proxyUp(port, env) {
  const p = spawn('node', ['proxy.mjs'], { env: { ...process.env, PORT: String(port), EDH_SOURCE_URL: '', PRICES_SOURCE_URL: '', DAILY: '1', DAILY_FIRST_MS: '0', DAILY_GAP_MS: '0', DISCORD_PRESENCE: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
  process.on('exit', () => { try { p.kill(); } catch { /* ignore */ } });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/__ping`)).ok) break; } catch { /* pas encore */ } await sleep(100); }
  return { p, out: () => out, url: `http://127.0.0.1:${port}/` };
}
test('proxy.mjs : carte du jour annoncée dans #carte-mystère avec le ping du rôle ; DISCORD_DAILY_ANNOUNCE=0 et DISCORD_WEEKLY=0 : rien', async () => {
  const S = await startDailyScry(); DS.roles = world().roles; DS.channels = world().channels; DS.posts.length = 0;
  const base = { DISCORD_BOT_TOKEN: TOKEN, DISCORD_API: DAPI, SCRYFALL_UPSTREAM: S.url, DAILY_SECRET: 'abc', DAILY_PUSH_WINDOW_MS: String(2 * 86400e3) };      // fenêtre de 2 jours : l'annonce part quelle que soit l'heure du test
  const P = await proxyUp(19860, { ...base, DAILY_DIR: newDir() });
  for (let i = 0; i < 300 && !DS.posts.some(x => x.ch === CH.mystere); i++) await sleep(100);
  const a = DS.posts.filter(x => x.ch === CH.mystere);
  assert.equal(a.length, 1, 'une annonce : ' + P.out()); assert.match(a[0].body.content, new RegExp(`^<@&${RL.mystere}> 🔮 \\*\\*Carte mystère n° \\d+ : une nouvelle carte t'attend !\\*\\*`));
  assert.deepEqual(a[0].body.allowed_mentions, { parse: [], roles: [RL.mystere] });
  assert.ok(!P.out().includes(TOKEN), 'jeton jamais dans le journal'); assert.match(P.out(), /Carte mystère n° \d+ annoncée dans #carte-mystère \(rôle pingé\)/);
  P.p.kill();
  DS.posts.length = 0;
  const Q = await proxyUp(19861, { ...base, DAILY_DIR: newDir(), DISCORD_DAILY_ANNOUNCE: '0', DISCORD_WEEKLY: '0' });
  let st; for (let i = 0; i < 300; i++) { st = await (await fetch(Q.url + 'api/daily')).json(); if (st.st === 'ready') break; await sleep(100); }
  assert.equal(st.st, 'ready', Q.out()); await sleep(1500);
  assert.equal(DS.posts.length, 0, 'coupée : rien dans #carte-mystère'); Q.p.kill(); S.stop();
});
