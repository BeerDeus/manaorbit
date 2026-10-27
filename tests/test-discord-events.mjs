// Annonces des événements saisonniers dans #annonces (discord-events.mjs, branché dans discord-srv.mjs › discordMake → DSC.events).
// 1) Fonctions pures : fenêtres (J-3, J0, mi-parcours, dernier jour, fin), une seule annonce due par édition (la plus récente), message FR + EN (dates, nombres,
//    singulier, J-3 rattrapé), embed (visuel, vignette, couleur du pack, lien), top des pseudos neutralisé, ping du rôle, pack sans messages complets, nonce.
// 2) discordMake contre un faux Discord HTTP (port 19897), horloge injectée : chaque étape une fois sur toute l'édition Halloween 2026 (minuit de Paris compris),
//    statistiques au mi-parcours et à la fin, publication du salon d'annonces, rattrapage après redémarrage (état relu), échec de Discord puis nouvel essai
//    (même nonce), statistiques illisibles, état illisible, ping du rôle « 🎃 Événements » (allowed_mentions exacts), sans rôle ou rôle impossible à pinger :
//    aucun ping, édition coupée, pack pas prêt, DISCORD_EVENTS=0, DISCORD_EVENTS_CHANNEL, SITE_URL.
import './setup-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discordMake } from '../server/discord-srv.mjs';
import { evDscMake, evDscMsg, evDscDue, evDscWindows, evDscNonce, evDscReady, EV_DSC_STEPS } from '../server/discord-events.mjs';

process.env.DISCORD_EVENTS = '1'; delete process.env.DISCORD_EVENTS_CHANNEL; delete process.env.SITE_URL;
const P = createRequire(import.meta.url)('../src/evpacks.js');
const TMP = mkdtempSync(join(tmpdir(), 'deckdeal-dscev-')); process.on('exit', () => { try { rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });
let nDir = 0; const newDir = () => { const d = join(TMP, 'd' + (++nDir)); mkdirSync(d, { recursive: true }); return d; };
const EVF = dir => (existsSync(join(dir, 'discord-events.json')) ? JSON.parse(readFileSync(join(dir, 'discord-events.json'), 'utf8')) : null);
const HW = P.EV_PACKS.find(p => p.id === 'halloween'), ED = P.evEdition(HW, 2026);
/** Midi UTC d'un jour (13 h ou 14 h à Paris : même jour). */
const noon = day => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), 12);

/* ── 1) Fonctions pures ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
test('fenêtres et annonces dues : J-3 (rattrapé jusqu\'à la veille), J0 le jour même, mi-parcours dans les 2 jours, dernier jour, fin dans les 3 jours ; une seule par édition', () => {
  assert.deepEqual([ED.id, ED.from, ED.to, ED.days], ['halloween-2026', '2026-10-25', '2026-11-08', 15]);
  assert.deepEqual(evDscWindows(ED), [
    { kind: 'soon', a: '2026-10-22', b: '2026-10-24' }, { kind: 'open', a: '2026-10-25', b: '2026-10-25' }, { kind: 'mid', a: '2026-11-01', b: '2026-11-03' },
    { kind: 'last', a: '2026-11-08', b: '2026-11-08' }, { kind: 'end', a: '2026-11-09', b: '2026-11-11' }]);
  const exp = { '2026-10-21': '', '2026-10-22': 'soon', '2026-10-23': 'soon+', '2026-10-24': 'soon+', '2026-10-25': 'open', '2026-10-26': '', '2026-10-31': '', '2026-11-01': 'mid',
    '2026-11-02': 'mid+', '2026-11-03': 'mid+', '2026-11-04': '', '2026-11-07': '', '2026-11-08': 'last', '2026-11-09': 'end', '2026-11-11': 'end+', '2026-11-12': '' };
  for (const [day, k] of Object.entries(exp)) {
    const d = evDscDue(day, [ED], {});
    assert.deepEqual(d.map(x => x.kind + (x.late ? '+' : '')), k ? [k] : [], day);
  }
  assert.deepEqual(evDscDue('2026-11-02', [ED], { 'halloween-2026|mid': 1 }), [], 'déjà partie : rien');
  assert.deepEqual(evDscDue('2026-10-24', [ED], { 'halloween-2026|open': 1 }).map(x => x.kind), ['soon'], 'clé par étape');
  // aucun jour n'a deux annonces dues pour la même édition (même sur une édition courte), mi-parcours absent d'une édition de 2 jours
  for (const e of [ED, { id: 'x-2026', from: '2026-12-01', to: '2026-12-03', days: 3 }, { id: 'y-2026', from: '2026-12-01', to: '2026-12-02', days: 2 }]) {
    for (let d = P.evAdd(e.from, -5); d <= P.evAdd(e.to, 5); d = P.evAdd(d, 1)) assert.ok(evDscDue(d, [e], {}).length <= 1, e.id + ' ' + d);
  }
  assert.ok(!evDscWindows({ from: '2026-12-01', to: '2026-12-02', days: 2 }).some(w => w.kind === 'mid'));
  assert.deepEqual(evDscDue('pas un jour', [ED], {}), []);
  assert.equal(evDscNonce('halloween-2026', 'soon'), 'mo-ev-halloween-2026-soon');
  const long = evDscNonce('anniversairemagic-2026', 'soon'); assert.ok(long.length <= 25 && long.startsWith('mo-ev-') && long !== evDscNonce('anniversairemagic-2026', 'open'), 'trop long : empreinte, distincte par étape');
});

test('message : FR puis EN aux dates en toutes lettres, nombres, embed aux couleurs du pack, top neutralisé, ping du rôle seulement avec un id', () => {
  const R = '920000000000000020';
  let m = evDscMsg('soon', ED, HW, null, R, 'https://manaorbit.app');
  assert.equal(m.content, `<@&${R}> 🎃 **La chasse aux citrouilles arrive dans 3 jours !** Du 25 octobre au 8 novembre, 30 citrouilles se cachent dans Mana Orbit : 5 par jour, des badges collector d'Halloween 2026 à la clé.\n` +
    '🎃 **The pumpkin hunt starts in 3 days!** From October 25 to November 8, 30 pumpkins hide in Mana Orbit: 5 a day, with collectible Halloween 2026 badges.\n<https://manaorbit.app/>');
  assert.deepEqual(m.allowed_mentions, { parse: [], roles: [R] });
  const e = m.embeds[0];
  assert.deepEqual([e.title, e.url, e.color, e.image.url, e.thumbnail.url], ['🎃 Chasse aux citrouilles 2026', 'https://manaorbit.app/', 0xff7a1a,
    'https://manaorbit.app/icons/events/halloween/social-1200x630.png', 'https://manaorbit.app/icons/events/halloween/discord-512.png']);
  assert.match(e.description, /^Du 25 octobre au 8 novembre 2026 · October 25 – November 8, 2026\n/);
  // J-3 rattrapé : le délai dit vrai
  assert.match(evDscMsg('soon', { ...ED, day: '2026-10-23' }, HW, null, '', '').content, /^🎃 \*\*La chasse aux citrouilles arrive dans 2 jours !\*\*[^\n]*\n🎃 \*\*The pumpkin hunt starts in 2 days!\*\*/);
  assert.match(evDscMsg('soon', { ...ED, day: '2026-10-24' }, HW, null, '', '').content, /arrive demain !\*\*[^\n]*\n[^\n]*starts tomorrow!\*\*/);
  // mi-parcours : jours restants, chasseurs (singulier), nombres à la française / à l'anglaise
  m = evDscMsg('mid', { ...ED, day: '2026-11-01' }, HW, { hunters: 1234, full: 1 }, '', 'https://manaorbit.app');
  assert.match(m.content, /^🕸️ \*\*Mi-parcours de la chasse aux citrouilles\*\* : il reste 8 jours\. 1\u202f234 chasseurs en piste, 1 déjà à 30\/30\.\n🕸️ \*\*Pumpkin hunt halfway point\*\*: 8 days left\. 1,234 hunters so far, 1 already at 30\/30\.\n/);
  assert.deepEqual(m.allowed_mentions, { parse: [] }, 'sans rôle : aucun ping');
  assert.deepEqual(m.embeds[0].fields.map(f => f.value), ['1\u202f234', '1', '8']);
  assert.match(evDscMsg('mid', { ...ED, day: '2026-11-03' }, HW, { hunters: 1, full: 0 }, '', '').content, /il reste 6 jours\. 1 chasseur en piste[\s\S]*6 days left\. 1 hunter so far/);
  assert.match(evDscMsg('mid', { ...ED, to: '2026-11-03', day: '2026-11-03' }, HW, { hunters: 2 }, '', '').content, /il reste 1 jour\.[\s\S]*1 day left/, 'singulier : 1 jour, 1 day');
  // fin : récapitulatif et top des pseudos publics, markdown et mentions neutralisés, 10 au plus
  const top = [{ n: '@everyone _x_ <@&1>', c: 30 }, { n: '**Gras**', c: 30 }, { n: 'Chloé', c: 28 }, ...Array.from({ length: 9 }, (_, i) => ({ n: 'Joueur' + i, c: 20 - i })), { n: '', c: 30 }];
  m = evDscMsg('end', ED, HW, { hunters: 42, full: 7, top }, R, '');
  const t = m.content;
  assert.match(t, new RegExp(`^<@&${R}> 🎃 \\*\\*La chasse aux citrouilles est terminée\\.\\*\\* 42 chasseurs, 7 au grade ultime \\(30/30\\)\\. Merci à tous, rendez-vous à la prochaine fête !\\n🎃 \\*\\*The pumpkin hunt is over\\.\\*\\* 42 hunters, 7 reached the ultimate rank \\(30/30\\)\\.`));
  assert.ok(t.includes('\n\n🏆 **Meilleurs chasseurs · Top hunters**\n🥇 **\\@everyone \\_x\\_ \\<\\@&1\\>** — 30/30\n🥈 **\\*\\*Gras\\*\\*** — 30/30\n🥉 **Chloé** — 28/30\n**4.** **Joueur0** — 20/30\n'), t);
  assert.ok(t.includes('**10.** **Joueur6** — 14/30') && !t.includes('Joueur7'), 'top 10 seulement');
  assert.ok(t.endsWith('\n<https://manaorbit.app/>'));
  assert.deepEqual(m.allowed_mentions, { parse: [], roles: [R] }, 'seul le rôle peut être pingé (jamais @everyone écrit dans un pseudo)');
  assert.ok(!evDscMsg('end', ED, HW, { hunters: 3, full: 0, top: [] }, '', '').content.includes('🏆'), 'personne au classement : pas de top');
  // rôle mal formé : aucun ping ; adresse du site donnée ; étape inconnue ; pack sans messages complets
  assert.deepEqual(evDscMsg('open', ED, HW, null, 'pas un id', '').allowed_mentions, { parse: [] });
  m = evDscMsg('open', ED, HW, null, '', 'https://exemple.test/');
  assert.equal(m.embeds[0].image.url, 'https://exemple.test/icons/events/halloween/social-1200x630.png'); assert.ok(m.content.endsWith('<https://exemple.test/>'));
  assert.equal(evDscMsg('open', ED, HW, null, '', 'javascript:alert(1)').embeds[0].url, 'https://manaorbit.app/', 'adresse douteuse : manaorbit.app');
  assert.equal(evDscMsg('bof', ED, HW, null, '', ''), null);
  const mg = P.EV_PACKS.find(p => p.id === 'magic');
  assert.equal(evDscReady(mg), false); assert.equal(evDscMsg('open', P.evEdition(mg, 2027), mg, null, '', ''), null, 'pack sans dsc : rien');
  const paq = P.EV_PACKS.find(p => p.id === 'paques'), pm = evDscMsg('mid', P.evEdition(paq, 2027), paq, { hunters: 12, full: 3, days: [] }, '', '');
  assert.equal(evDscReady(paq), true, 'nid de Pâques : messages prêts'); assert.match(pm.content, /cloches sont revenues de Rome.*12 joueurs.*3 ont fait éclore les 6 poussins/s);
  assert.equal(evDscReady(P.EV_PACKS.find(p => p.id === 'noel')), true, 'Noël (calendrier de l\'Avent) : messages prêts');
  assert.equal(evDscReady({ ...HW, dsc: { ...HW.dsc, end: ['seulement le français'] } }), false, 'dsc incomplet : rien');
  assert.equal(evDscReady({ ...HW, ready: false }), false, 'pack pas prêt : rien');
  for (const k of EV_DSC_STEPS) { const x = evDscMsg(k, ED, HW, { hunters: 5, full: 2, top: [{ n: 'A', c: 3 }] }, '', ''); assert.ok(x.content.length <= 2000 && !/\{\w+\}/.test(x.content), k + ' : tout remplacé'); }
});

/* ── 2) discordMake contre un faux Discord HTTP ───────────────────────────────────────────────────────────────────────────────────── */
const PORT = 19897;
const TOKEN = 'jeton-du-bot-SECRET-0123456789', G = '910000000000000001', BOT = '910000000000000002';
const B = n => 1n << BigInt(n), VIEW = B(10), SEND = B(11), EMBED = B(14), ATTACH = B(15), MENTION = B(17);
const RL = { ev: '920000000000000020', bot: '920000000000000003', mystere: '920000000000000010' }, CH = { ann: '930000000000000007', news: '930000000000000008', general: '930000000000000005', cat: '939000000000000003' };
const world = () => ({
  roles: [
    { id: G, name: '@everyone', position: 0, permissions: String(VIEW | SEND), managed: false, mentionable: false },
    { id: RL.ev, name: '🎃 Événements', position: 2, permissions: '0', managed: false, mentionable: false },
    { id: RL.mystere, name: '🔮 Carte mystère', position: 1, permissions: '0', managed: false, mentionable: false },
    { id: RL.bot, name: 'Mana Orbit', position: 4, permissions: String(VIEW | SEND | EMBED | ATTACH | MENTION), managed: true, tags: { bot_id: BOT } },
  ],
  channels: [{ id: CH.cat, name: 'Infos', type: 4, position: 0 }, { id: CH.ann, name: '📣・annonces', type: 5, position: 1, parent_id: CH.cat },
    { id: CH.news, name: '📰・nouvelles', type: 0, position: 2, parent_id: CH.cat }, { id: CH.general, name: '💬・général', type: 0, position: 3, parent_id: CH.cat }],
});
const DS = { ...world(), posts: [], cross: [], down: 0, refuse: 0 };
const dsrv = http.createServer((q, r) => {
  const c = []; q.on('data', d => c.push(d)); q.on('end', () => {
    const send = (code, o) => { r.writeHead(code, { 'content-type': 'application/json' }); r.end(o === undefined ? '' : JSON.stringify(o)); };
    const p = new URL(q.url, 'http://x').pathname.replace(/^\/api\/v10/, ''), m = q.method; let x;
    if (q.headers.authorization !== 'Bot ' + TOKEN) return send(401, { message: '401: Unauthorized', code: 0 });
    if (m === 'GET' && p === '/users/@me') return send(200, { id: BOT, username: 'Mana Orbit', bot: true });
    if (m === 'GET' && p === '/users/@me/guilds') return send(200, [{ id: G, name: 'Mana Orbit' }]);
    if (m === 'GET' && p === `/guilds/${G}/channels`) return send(200, DS.channels);
    if (m === 'GET' && p === `/guilds/${G}/roles`) return send(200, DS.roles);
    if (m === 'GET' && p === `/guilds/${G}/members/${BOT}`) return send(200, { user: { id: BOT, bot: true }, roles: [RL.bot] });
    if ((x = /^\/channels\/(\d+)\/messages\/(\d+)\/crosspost$/.exec(p)) && m === 'POST') { DS.cross.push({ ch: x[1], id: x[2] }); return send(200, { id: x[2] }); }
    if ((x = /^\/channels\/(\d+)\/messages$/.exec(p)) && m === 'POST') {
      const body = JSON.parse(Buffer.concat(c).toString() || '{}');
      if (DS.down > 0) { DS.down--; DS.tried = (DS.tried || []).concat(body.nonce); return send(503, { message: 'upstream connect error' }); }
      if (DS.refuse > 0) { DS.refuse--; DS.tried = (DS.tried || []).concat(body.nonce); return send(403, { message: 'Missing Permissions', code: 50013 }); }
      if (!DS.channels.some(y => y.id === x[1])) return send(404, { message: 'Unknown Channel', code: 10003 });
      DS.posts.push({ ch: x[1], body }); return send(200, { id: String(940000000000000000n + BigInt(DS.posts.length)) });
    }
    return send(404, { message: 'Unknown route ' + m + ' ' + p });
  });
});
await new Promise((res, rej) => { dsrv.once('error', rej); dsrv.listen(PORT, '127.0.0.1', res); }); dsrv.unref();
const DAPI = `http://127.0.0.1:${PORT}/api/v10`;
const reset = () => { Object.assign(DS, world(), { posts: [], cross: [], down: 0, refuse: 0, tried: [] }); };
/** Bot (vrai discordMake) avec son dossier d'état et son journal. */
function mkBot(dir, extra = {}) {
  const logs = [], bot = discordMake({ token: TOKEN, api: DAPI, cacheMs: 0, sleep: () => Promise.resolve(), retryMs: 0, dir, log: { log: m => logs.push(m), warn: m => logs.push(m) }, ...extra });
  return { bot, logs };
}
/** Statistiques simulées de event-srv.mjs (appels notés). */
function mkStats(o = {}) {
  const S = { calls: [], fail: o.fail || 0, val: o.val || { hunters: 128, full: 9, top: [{ n: 'Alice', c: 30 }, { n: '@here *Bob*', c: 29 }] } };
  S.fn = async id => { S.calls.push(id); if (S.fail > 0) { S.fail--; throw new Error('event-srv en panne'); } return S.val; };
  return S;
}
const kinds = () => DS.posts.map(x => x.body.nonce.replace(/^mo-ev-halloween-2026-/, ''));

test('Halloween 2026 de bout en bout : chaque annonce une seule fois (J-3, J0 à minuit de Paris, mi-parcours, dernier jour, fin avec les statistiques), ping du rôle, publiée', async () => {
  reset(); const dir = newDir(), { bot, logs } = mkBot(dir), S = mkStats();
  assert.equal(typeof bot.events.tick, 'function', 'DSC.events exposé');
  const seen = [];
  for (let d = '2026-10-18'; d <= '2026-11-16'; d = P.evAdd(d, 1)) {
    for (const h of [0, 6, 12, 21]) {      // heures UTC : la bascule du jour suit Paris (21 h UTC le 24 = 23 h à Paris, encore le 24)
      const t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), h, 1), n = DS.posts.length;
      await bot.events.tick({ now: t, stats: S.fn, off: () => [] });
      if (DS.posts.length > n) seen.push(P.evDay(t) + ' ' + kinds().slice(n).join(','));
    }
  }
  assert.deepEqual(seen, ['2026-10-22 soon', '2026-10-25 open', '2026-11-01 mid', '2026-11-08 last', '2026-11-09 end'], 'chaque étape une fois, au bon jour : ' + logs.join(' | '));
  // J0 : posté dès minuit de Paris (24 octobre 22:01 UTC = 25 octobre 00:01, heure d'été)
  reset(); const dir0 = newDir(), b0 = mkBot(dir0); writeFileSync(join(dir0, 'discord-events.json'), JSON.stringify({ v: 1, done: { 'halloween-2026|soon': 1 } }));
  await b0.bot.events.tick({ now: Date.UTC(2026, 9, 24, 21, 59), stats: S.fn, off: () => [] }); assert.equal(DS.posts.length, 0, '23:59 à Paris : pas encore');
  await b0.bot.events.tick({ now: Date.UTC(2026, 9, 24, 22, 1), stats: S.fn, off: () => [] }); assert.deepEqual(kinds(), ['open'], '00:01 à Paris : la chasse est ouverte');
  reset();
  const { bot: b1 } = mkBot(dir); await b1.events.tick({ now: noon('2026-11-10'), stats: S.fn });
  assert.equal(DS.posts.length, 0, 'redémarré pendant la fenêtre de fin : déjà partie (état relu)');
  assert.deepEqual(Object.keys(EVF(dir).done).sort(), ['halloween-2026|end', 'halloween-2026|last', 'halloween-2026|mid', 'halloween-2026|open', 'halloween-2026|soon'], 'état gardé dans discord-events.json');
});

test('contenu posté : salon #annonces, FR + EN, nonce fixe, allowed_mentions exacts, statistiques du mi-parcours et de la fin, publication du salon d\'annonces', async () => {
  reset(); const dir = newDir(), { bot, logs } = mkBot(dir), S = mkStats();
  for (const d of ['2026-10-22', '2026-10-25', '2026-11-01', '2026-11-08', '2026-11-09']) await bot.events.tick({ now: noon(d), stats: S.fn, off: () => [] });
  assert.deepEqual(kinds(), ['soon', 'open', 'mid', 'last', 'end']);
  assert.deepEqual(S.calls, ['halloween-2026', 'halloween-2026'], 'statistiques lues au mi-parcours et à la fin seulement');
  for (const x of DS.posts) {
    assert.equal(x.ch, CH.ann, '#annonces (nom utile, salon d\'annonces)');
    assert.deepEqual(x.body.allowed_mentions, { parse: [], roles: [RL.ev] }, 'seul le rôle « 🎃 Événements » peut être pingé');
    assert.ok(x.body.content.startsWith(`<@&${RL.ev}> `), 'ping du rôle en tête');
    assert.equal(x.body.enforce_nonce, true);
    const [fr, en] = x.body.content.split('\n');
    assert.match(fr, /citrouilles/); assert.match(en, /pumpkin/i, 'FR puis EN');
    assert.equal(x.body.embeds[0].image.url, 'https://manaorbit.app/icons/events/halloween/social-1200x630.png');
    assert.equal(x.body.embeds[0].color, 0xff7a1a);
  }
  assert.deepEqual(DS.posts.map(x => x.body.nonce), EV_DSC_STEPS.map(k => 'mo-ev-halloween-2026-' + k));
  assert.match(DS.posts[2].body.content, /il reste 8 jours\. 128 chasseurs en piste, 9 déjà à 30\/30\./);
  const end = DS.posts[4].body.content;
  assert.match(end, /128 chasseurs, 9 au grade ultime \(30\/30\)/); assert.match(end, /128 hunters, 9 reached the ultimate rank/);
  assert.ok(end.includes('🥇 **Alice** — 30/30\n🥈 **\\@here \\*Bob\\*** — 29/30'), 'top des pseudos publics neutralisé : ' + end);
  assert.deepEqual(DS.cross.map(x => x.ch), Array(5).fill(CH.ann), 'salon d\'annonces : chaque annonce publiée aux serveurs abonnés');
  assert.ok(logs.some(l => /annonce « open » de halloween-2026 postée dans #annonces \(rôle pingé\)/.test(l)), logs.join(' | '));
  assert.ok(!logs.join('\n').includes(TOKEN) && !logs.join('\n').includes(RL.ev), 'ni jeton ni id dans le journal');
});

test('rattrapage après un arrêt du serveur : J-3 jusqu\'à la veille, J0 le jour même seulement, mi-parcours dans les 2 jours, fin dans les 3 jours ; jamais deux d\'un coup', async () => {
  reset(); const dir = newDir(), S = mkStats();
  let { bot } = mkBot(dir);
  await bot.events.tick({ now: noon('2026-10-24'), stats: S.fn });      // arrêté les 22 et 23 : rattrapé la veille du début
  assert.deepEqual(kinds(), ['soon']); assert.match(DS.posts[0].body.content, /arrive demain !\*\*[\s\S]*starts tomorrow!/, 'délai juste');
  ({ bot } = mkBot(dir)); await bot.events.tick({ now: noon('2026-10-24') + 3600e3, stats: S.fn }); assert.equal(DS.posts.length, 1, 'redémarré : état relu, pas de doublon');
  ({ bot } = mkBot(dir)); await bot.events.tick({ now: noon('2026-10-26'), stats: S.fn }); assert.equal(DS.posts.length, 1, 'J0 manqué (arrêté le 25) : pas d\'ouverture en retard');
  ({ bot } = mkBot(dir)); await bot.events.tick({ now: noon('2026-11-03'), stats: S.fn });
  assert.deepEqual(kinds(), ['soon', 'mid'], 'mi-parcours rattrapé le 2e jour'); assert.match(DS.posts[1].body.content, /il reste 6 jours/);
  await bot.events.tick({ now: noon('2026-11-04'), stats: S.fn }); await bot.events.tick({ now: noon('2026-11-07'), stats: S.fn }); assert.equal(DS.posts.length, 2);
  ({ bot } = mkBot(dir)); await bot.events.tick({ now: noon('2026-11-11'), stats: S.fn });
  assert.deepEqual(kinds(), ['soon', 'mid', 'end'], 'dernier jour manqué : seulement la fin (3e jour après), pas deux annonces en retard');
  ({ bot } = mkBot(dir)); await bot.events.tick({ now: noon('2026-11-11'), stats: S.fn }); assert.equal(DS.posts.length, 3);
  // fin trop tard (4e jour) : rien ; mi-parcours trop tard : rien
  reset(); const d2 = newDir(); ({ bot } = mkBot(d2));
  for (const d of ['2026-11-04', '2026-11-12', '2026-11-20']) await bot.events.tick({ now: noon(d), stats: S.fn });
  assert.equal(DS.posts.length, 0, 'hors des fenêtres : rien');
});

test('échec de Discord puis nouvel essai (même nonce), statistiques illisibles, salon absent, état illisible', async () => {
  reset(); const dir = newDir(), { bot, logs } = mkBot(dir), S = mkStats({ fail: 1 });
  DS.down = 2;      // 5xx deux fois : discord-srv.mjs réessaie une fois puis abandonne
  assert.deepEqual(await bot.events.tick({ now: noon('2026-10-25'), stats: S.fn }), []);
  assert.equal(DS.posts.length, 0); assert.deepEqual(EVF(dir).done, {}, 'refusé : état remis');
  assert.equal(logs.filter(l => /annonce « open » de halloween-2026 pas encore postée/.test(l)).length, 1);
  DS.refuse = 1; await bot.events.tick({ now: noon('2026-10-25') + 60e3, stats: S.fn }); assert.equal(DS.posts.length, 0, 'refus 403 : rien');
  assert.equal(logs.filter(l => /pas encore postée/.test(l)).length, 1, 'une ligne de journal par annonce, pas à chaque tour');
  assert.deepEqual(await bot.events.tick({ now: noon('2026-10-25') + 120e3, stats: S.fn }), ['halloween-2026|open'], 'nouvel essai au tour suivant');
  assert.deepEqual(kinds(), ['open']); assert.ok(DS.tried.every(n => n === 'mo-ev-halloween-2026-open'), 'même nonce à chaque essai : jamais de doublon');
  assert.ok(EVF(dir).done['halloween-2026|open'] > 0);
  // statistiques illisibles au mi-parcours : rien de noté, nouvel essai
  await bot.events.tick({ now: noon('2026-11-01'), stats: S.fn }); assert.equal(DS.posts.length, 1); assert.ok(!EVF(dir).done['halloween-2026|mid']);
  assert.ok(logs.some(l => /« mid » de halloween-2026 en attente \(statistiques illisibles/.test(l)));
  await bot.events.tick({ now: noon('2026-11-01') + 60e3, stats: S.fn }); assert.deepEqual(kinds(), ['open', 'mid']);
  // salon absent : en attente, puis posté quand il revient
  DS.channels = DS.channels.filter(c => c.id !== CH.ann);
  await bot.events.tick({ now: noon('2026-11-08'), stats: S.fn }); assert.equal(DS.posts.length, 2); assert.ok(logs.some(l => /salon #annonces introuvable/.test(l)));
  DS.channels = world().channels; await bot.events.tick({ now: noon('2026-11-08') + 60e3, stats: S.fn }); assert.deepEqual(kinds(), ['open', 'mid', 'last']);
  // état illisible : rien (on ne sait pas ce qui est parti)
  reset(); const dx = newDir(); writeFileSync(join(dx, 'discord-events.json'), '{abîmé'); const X = mkBot(dx);
  await X.bot.events.tick({ now: noon('2026-10-25'), stats: S.fn }); assert.equal(DS.posts.length, 0); assert.ok(X.logs.some(l => /discord-events\.json illisible/.test(l)));
  assert.equal(readFileSync(join(dx, 'discord-events.json'), 'utf8'), '{abîmé', 'jamais réécrit');
});

test('rôle « Événements » : ping s\'il existe et peut être pingé (allowed_mentions exacts), sinon aucun ping ; « Events » aussi', async () => {
  reset(); let dir = newDir(), B1 = mkBot(dir);
  DS.roles = DS.roles.filter(r => r.id !== RL.ev);
  await B1.bot.events.tick({ now: noon('2026-10-25') }); let m = DS.posts[0].body;
  assert.deepEqual(m.allowed_mentions, { parse: [] }, 'sans rôle : aucun ping'); assert.ok(!m.content.includes('<@'), 'aucune mention écrite'); assert.match(m.content, /^🎃 \*\*La chasse/);
  assert.ok(B1.logs.some(l => /rôle « Événements » absent/.test(l)));
  // rôle non mentionnable et bot sans « Mentionner tous les rôles » : sans ping, une ligne de journal
  reset(); DS.roles.find(r => r.id === RL.bot).permissions = String(VIEW | SEND | EMBED | ATTACH); dir = newDir(); B1 = mkBot(dir);
  await B1.bot.events.tick({ now: noon('2026-10-25') }); await B1.bot.events.tick({ now: noon('2026-11-08') });
  assert.deepEqual(DS.posts.map(x => x.body.allowed_mentions), [{ parse: [] }, { parse: [] }]); assert.equal(B1.logs.filter(l => /non mentionnable/.test(l)).length, 1, 'signalé une fois');
  // rôle mentionnable (même sans la permission) : ping ; nom « Events » (emoji, casse)
  reset(); DS.roles.find(r => r.id === RL.bot).permissions = String(VIEW | SEND); DS.roles.find(r => r.id === RL.ev).mentionable = true; DS.roles.find(r => r.id === RL.ev).name = '📅 EVENTS';
  dir = newDir(); B1 = mkBot(dir); await B1.bot.events.tick({ now: noon('2026-10-25') });
  assert.deepEqual(DS.posts[0].body.allowed_mentions, { parse: [], roles: [RL.ev] }); assert.ok(DS.posts[0].body.content.startsWith(`<@&${RL.ev}> 🎃`));
  // un rôle géré par un bot du même nom n'est jamais pingé
  reset(); DS.roles.find(r => r.id === RL.ev).managed = true; dir = newDir(); B1 = mkBot(dir); await B1.bot.events.tick({ now: noon('2026-10-25') });
  assert.deepEqual(DS.posts[0].body.allowed_mentions, { parse: [] });
});

test('édition coupée par l\'admin, pack pas prêt ou sans messages, DISCORD_EVENTS=0, bot coupé : rien ; DISCORD_EVENTS_CHANNEL et SITE_URL', async () => {
  reset(); let dir = newDir(), B1 = mkBot(dir);
  await B1.bot.events.tick({ now: noon('2026-10-25'), off: () => ['halloween-2026'] }); assert.equal(DS.posts.length, 0, 'édition coupée : rien');
  await B1.bot.events.tick({ now: noon('2026-10-25'), off: () => ['halloween'] }); assert.equal(DS.posts.length, 0, 'pack coupé : rien');
  await B1.bot.events.tick({ now: noon('2026-10-25'), off: () => { throw new Error('x'); } }); assert.deepEqual(kinds(), ['open'], 'interrupteur illisible : rien de coupé');
  // anniversaire de Magic (pas prêt, sans messages) : rien pendant sa période ; Pâques (prêt) : le mi-parcours tombe le dimanche de Pâques
  reset(); for (const d of ['2027-08-01', '2027-08-05', '2027-08-12']) await B1.bot.events.tick({ now: noon(d) });
  assert.equal(DS.posts.length, 0, 'anniversaire de Magic pas prêt : rien');
  reset(); for (const d of ['2027-03-18', '2027-03-21', '2027-03-28', '2027-04-04', '2027-04-05']) await B1.bot.events.tick({ now: noon(d), stats: async () => ({ hunters: 0, full: 0, days: [] }) });
  assert.deepEqual(kinds().map(k => k.replace('mo-ev-paques-2027-', '')), ['soon', 'open', 'mid', 'last', 'end'], 'nid de Pâques 2027 : J-3, ouverture, dimanche de Pâques, dernier jour, fin');
  // packs passés à evDscMake directement (contrat : helpers de discordMake) : Halloween pas prêt, ou sans un message
  const h = { on: true, find: B1.bot.helpers.find, post: B1.bot.helpers.post, log: { log() {}, warn() {} }, TX: 0, NEWS: 5 };
  for (const pk of [{ ...HW, ready: false }, { ...HW, dsc: { ...HW.dsc, mid: undefined } }]) {
    const E = evDscMake(h, { dir: newDir(), packs: { ...P, EV_PACKS: [pk], evPack: () => pk } });
    for (const d of ['2026-10-22', '2026-10-25', '2026-11-01', '2026-11-09']) assert.deepEqual(await E.tick({ now: noon(d), stats: async () => ({ hunters: 1, full: 0, top: [] }) }), []);
  }
  assert.equal(DS.posts.length, 0, 'pack pas prêt ou messages incomplets : rien');
  assert.deepEqual(await evDscMake({ ...h, on: false }, { dir: newDir() }).tick({ now: noon('2026-10-25') }), [], 'bot coupé : rien');
  // DISCORD_EVENTS=0 : pas d'annonces (DSC.events absent) ; sans jeton : absent aussi
  process.env.DISCORD_EVENTS = '0';
  try { assert.equal(mkBot(newDir()).bot.events, undefined, 'DISCORD_EVENTS=0 : coupé'); } finally { process.env.DISCORD_EVENTS = '1'; }
  assert.equal(discordMake({ token: '', api: DAPI }).events, undefined, 'bot non configuré : rien');
  assert.equal(discordMake({ token: TOKEN, api: DAPI, off: true }).events, undefined, 'DISCORD=0 : rien');
  // DISCORD_EVENTS_CHANNEL : autre salon (nom utile) ; SITE_URL : visuels de ce site
  reset(); process.env.DISCORD_EVENTS_CHANNEL = 'nouvelles'; process.env.SITE_URL = 'https://essai.manaorbit.test/';
  try {
    dir = newDir(); B1 = mkBot(dir); await B1.bot.events.tick({ now: noon('2026-10-25') });
    assert.equal(DS.posts[0].ch, CH.news, '#nouvelles'); assert.equal(DS.cross.length, 0, 'salon écrit : pas de publication');
    assert.equal(DS.posts[0].body.embeds[0].thumbnail.url, 'https://essai.manaorbit.test/icons/events/halloween/discord-512.png');
    assert.ok(B1.logs.some(l => /postée dans #nouvelles/.test(l)));
  } finally { delete process.env.DISCORD_EVENTS_CHANNEL; delete process.env.SITE_URL; }
  assert.ok(existsSync(join(dir, 'discord-events.json')), 'état dans le dossier du bot (ADMIN_DIR)');
});
