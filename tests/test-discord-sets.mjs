// Sorties d'extensions annoncées dans #spoilers (discord-sets.mjs, branché dans proxy.mjs) : horloge injectée, faux Scryfall /sets, faux Discord (discordMake
// et son fetch, puis un vrai proxy.mjs avec des serveurs HTTP simulés). J-7 (« Sortie dans 7 jours », Précommander) et jour J (« Sortie aujourd'hui », Acheter)
// à partir de 10 h heure de Paris, rien avant ni les autres jours, une seule fois (état sur le disque, redémarrage), rattrapage borné (J-7 jusqu'à J-5, J le jour
// même seulement), date changée → annoncée de nouveau, types filtrés comme l'accueil (src/sets.js : promo, jetons, Alchemy, numériques écartés, decks Commander
// fondus dans leur parent), message (embed, liens Cardmarket de l'appli, aucun ping, Markdown neutralisé), Scryfall lu au plus toutes les 6 h et pas avant
// l'heure, salon absent / Discord en panne / refus / Scryfall en panne → nouvel essai sans planter, fichier illisible → rien, entrées anciennes purgées,
// DISCORD_SETS=0. Ports 19870–19871.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { discordMake } from '../discord-srv.mjs';
import { dssMake, dssMsg, dssStage, dssDate } from '../discord-sets.mjs';
import { dlyClock, dlyAdd } from '../daily-srv.mjs';

const require = createRequire(import.meta.url);
const { cmUrl } = require('../src/core.js');
const ok = m => console.log('✓ ' + m);
const TOKEN = 'jeton-du-bot-SECRET-0123456789', G = '910000000000000001', BOT = '910000000000000002';
const SPOIL = '930000000000000021', GEN = '930000000000000022', B = n => 1n << BigInt(n), VIEW = B(10), SEND = B(11);
const P0 = dlyClock(0, 'Europe/Paris'), at = (day, h, mi = 0) => P0.startOf(day) + (h * 60 + mi) * 60e3;      // heure de Paris
const D0 = '2026-11-09', add = n => dlyAdd(D0, n);
const tmp = () => join(mkdtempSync(join(tmpdir(), 'dss-')), 'admin');

/* ── Faux Discord (fetch de discordMake) ── */
function fakeDiscord({ spoilers = true } = {}) {
  const D = { chans: [{ id: GEN, name: '💬・général', type: 0, position: 0 }, ...(spoilers ? [{ id: SPOIL, name: '✨・spoilers', type: 0, position: 1 }] : [])], posts: [], down: 0, refuse: 0, auth: new Set() };
  D.fetch = async (url, init = {}) => {
    const u = new URL(url), p = u.pathname.replace(/^\/api\/v10/, ''), m = init.method || 'GET';
    D.auth.add(init.headers && init.headers.Authorization);
    const send = (s, j) => new Response(j === undefined ? null : JSON.stringify(j), { status: s, headers: { 'content-type': 'application/json' } });
    if (p === '/users/@me/guilds') return send(200, [{ id: G, name: 'Mana Orbit' }]);
    if (p === '/users/@me') return send(200, { id: BOT });
    if (p === `/guilds/${G}/channels`) return send(200, D.chans);
    if (p === `/guilds/${G}/roles`) return send(200, [{ id: G, name: '@everyone', permissions: String(VIEW | SEND) }]);
    if (p === `/guilds/${G}/members/${BOT}`) return send(200, { roles: [] });
    const x = /^\/channels\/(\d+)\/messages$/.exec(p);
    if (x && m === 'POST') {
      if (D.down > 0) { D.down--; return send(503, { message: 'down' }); }
      if (D.refuse > 0) { D.refuse--; return send(403, { message: 'Missing Permissions', code: 50013 }); }
      if (!D.chans.some(c => c.id === x[1])) return send(404, { message: 'Unknown Channel', code: 10003 });
      D.posts.push({ ch: x[1], body: JSON.parse(init.body) }); return send(200, { id: String(9e17 + D.posts.length) });
    }
    return send(404, { message: 'route ' + m + ' ' + p });
  };
  return D;
}
/* ── Faux Scryfall /sets ── */
const set = (code, name, day, type, o = {}) => ({ object: 'set', code, name, released_at: day, set_type: type, digital: false, card_count: 0, printed_size: undefined,
  scryfall_uri: `https://scryfall.com/sets/${code}`, icon_svg_uri: `https://svgs.scryfall.io/sets/${code}.svg?1700000000`, ...o });
const DUSK = 'Duskmourn: *House* (of) Horror';
const SETS0 = () => [
  set('fdn', 'Foundations Two', add(7), 'expansion', { card_count: 42 }), set('fdc', 'Foundations Two Commander', add(7), 'commander', { parent_set_code: 'fdn', card_count: 400 }),
  set('tdy', 'Today Core', add(0), 'core', { printed_size: 280, card_count: 310 }), set('mst', 'Late Masters', add(3), 'masters'),
  set('six', DUSK, add(6), 'draft_innovation'), set('fiv', 'Lonely Commander', add(5), 'commander'), set('fou', 'Four Expansion', add(4), 'expansion', { card_count: 1234 }),
  set('pro', 'Promo Pack', add(7), 'promo'), set('alc', 'Alchemy Thing', add(7), 'alchemy'), set('tok', 'Today Tokens', add(0), 'token', { parent_set_code: 'tdy' }),
  set('dig', 'Digital Expansion', add(7), 'expansion', { digital: true }), set('old', 'Old Expansion', add(-1), 'expansion'), set('far', 'Far Expansion', add(30), 'expansion'),
  set('anc', 'Ancient', '1993-08-05', 'core'),
];
function fakeScry() {
  const SC = { sets: SETS0(), calls: 0, fail: 0, ua: '', urls: [] };
  SC.fetch = async (url, init = {}) => {
    SC.calls++; SC.urls.push(url); SC.ua = init.headers['User-Agent'];
    if (SC.fail > 0) { SC.fail--; return new Response('oops', { status: 500 }); }
    return new Response(JSON.stringify({ object: 'list', has_more: false, data: SC.sets }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return SC;
}
const logs = [], LOG = { log: m => logs.push(m), warn: m => logs.push('W ' + m) };
let T = at(D0, 9, 59);
/** Annonceur branché sur un faux Discord (discordMake réel) et un faux Scryfall ; même dir = même serveur redémarré. */
function mk(dir, DF, SC, extra = {}) {
  const dsc = discordMake({ token: TOKEN, api: 'http://discord.test/api/v10', fetch: DF.fetch, now: () => T, sleep: async () => {}, log: LOG, presence: false });
  const h = dsc.helpers;
  return dssMake({ find: h.find, post: h.post, types: h.chanTypes, dir, scry: 'http://scry.test', fetch: SC.fetch, now: () => T, log: LOG, ...extra });
}
const codesOf = posts => posts.map(p => p.body.embeds[0].fields.find(f => f.name === 'Code').value);
const stateOf = dir => JSON.parse(readFileSync(join(dir, 'discord-sets.json'), 'utf8'));

/* ── 1) Fonctions pures ── */
{
  assert.deepEqual([7, 6, 5, 4, 3, 1, 0, -1, 8].map(dssStage), ['j7', 'j7', 'j7', '', '', '', 'j', '', '']);
  assert.deepEqual(dssDate('2026-11-16'), ['lundi 16 novembre 2026', 'Monday, November 16, 2026']);
  assert.deepEqual(dssDate('2027-01-01'), ['vendredi 1er janvier 2027', 'Friday, January 1, 2027']);
  const m = dssMsg({ code: 'six', name: DUSK, at: '2026-11-15', d: 6, url: 'javascript:alert(1)', cmd: false }, 'j7', { cm: { fr: cmUrl(DUSK, 'fr'), en: '' } });
  assert.equal(m.content, '✨ **Sortie dans 6 jours : Duskmourn: \\*House\\* \\(of\\) Horror**\n-# Out in 6 days: Duskmourn: \\*House\\* \\(of\\) Horror');
  assert.deepEqual(m.allowed_mentions, { parse: [] });
  const e = m.embeds[0];
  assert.equal(e.url, 'https://scryfall.com/sets/six', 'adresse Scryfall non https : celle de l\'extension');
  assert.match(e.description, /\[Précommander sur Cardmarket\]\(https:\/\/www\.cardmarket\.com\/fr\/Magic\/Products\/Search\?searchString=Duskmourn%3A%20\*House\*%20%28of%29%20Horror\)/, 'parenthèses encodées dans le lien masqué');
  assert.doesNotMatch(e.description, /Pre-order/, 'lien anglais absent : pas de libellé');
  ok('étapes (J-7 à J-5, J), dates FR / EN en toutes lettres (1er), Markdown du nom neutralisé, aucun ping, lien Cardmarket aux parenthèses encodées');
}

/* ── 2) J-7 et J à 10 h, rien avant, une seule fois, types filtrés, Scryfall au plus toutes les 6 h ── */
const dirA = tmp(), DF = fakeDiscord(), SC = fakeScry();
let A = mk(dirA, DF, SC);
{
  T = at(D0, 9, 59);
  assert.equal(await A.tick(), 0); assert.equal(SC.calls, 0, 'avant 10 h : Scryfall pas lu'); assert.equal(DF.posts.length, 0);
  T = at(D0, 10, 0);
  assert.equal(await A.tick(), 4);
  assert.equal(SC.calls, 1); assert.equal(SC.urls[0], 'http://scry.test/sets'); assert.ok(SC.ua);
  assert.deepEqual(codesOf(DF.posts), ['TDY', 'FIV', 'SIX', 'FDN'], 'J d\'abord, puis J-5, J-6, J-7 ; ni promo, ni jetons, ni Alchemy, ni numérique, ni decks Commander rattachés, ni passées, ni lointaines');
  assert.ok(DF.posts.every(p => p.ch === SPOIL && JSON.stringify(p.body.allowed_mentions) === '{"parse":[]}'), 'dans #spoilers, aucun ping');
  assert.deepEqual([...DF.auth], ['Bot ' + TOKEN]);
  const [tdy, fiv, six, fdn] = DF.posts.map(p => p.body);
  assert.equal(tdy.content, '🎉 **Sortie aujourd\'hui : Today Core**\n-# Out today: Today Core');
  const te = tdy.embeds[0];
  assert.equal(te.title, 'Today Core'); assert.equal(te.url, 'https://scryfall.com/sets/tdy'); assert.equal(te.color, 0xf59e0b);
  assert.deepEqual(te.fields, [{ name: 'Code', value: 'TDY', inline: true }, { name: 'Cartes · Cards', value: '280 cartes · cards', inline: true }]);
  assert.equal(te.description, '📅 **lundi 9 novembre 2026** · Monday, November 9, 2026\n'
    + `🛒 [Acheter sur Cardmarket](${cmUrl('Today Core', 'fr')}) · [Buy](${cmUrl('Today Core', 'en')})\n`
    + '📱 [Voir dans Mana Orbit · Open in the app](https://manaorbit.app/) · [Scryfall](https://scryfall.com/sets/tdy)');
  assert.match(cmUrl('Today Core', 'fr'), /^https:\/\/www\.cardmarket\.com\/fr\/Magic\/Products\/Search\?searchString=Today%20Core$/);
  assert.match(fiv.content, /^✨ \*\*Sortie dans 5 jours : Lonely Commander\*\*\n-# Out in 5 days: Lonely Commander$/);
  assert.match(six.content, /Sortie dans 6 jours/);
  assert.match(fdn.content, /^✨ \*\*Sortie dans 7 jours : Foundations Two\*\*\n-# Out in 7 days: Foundations Two$/);
  const fe = fdn.embeds[0];
  assert.equal(fe.color, 0x8b5cf6);
  assert.deepEqual(fe.fields, [{ name: 'Code', value: 'FDN', inline: true }, { name: 'Cartes · Cards', value: '42 révélées · revealed', inline: true }, { name: 'Avec · With', value: 'decks Commander · Commander decks', inline: true }]);
  assert.match(fe.description, /^📅 \*\*lundi 16 novembre 2026\*\* · Monday, November 16, 2026\n🛒 \[Précommander sur Cardmarket\]\(https:\/\/www\.cardmarket\.com\/fr\/Magic\/Products\/Search\?searchString=Foundations%20Two\) · \[Pre-order\]\(https:\/\/www\.cardmarket\.com\/en\//);
  assert.ok(logs.some(l => /sortie de Foundations Two \(FDN, 2026-11-16\) annoncée dans #spoilers \(J-7\)/.test(l)));
  assert.ok(!logs.join('\n').includes(TOKEN) && !logs.join('\n').includes(SPOIL), 'ni jeton ni id dans le journal');
  ok('10 h (Paris) : jour J et J-7 (rattrapés à J-6, J-5) postés dans #spoilers, extensions de l\'accueil seulement ; avant 10 h : ni Scryfall ni Discord ; message (embed, Acheter / Précommander FR + EN, appli, Scryfall, cartes, decks Commander)');

  T = at(D0, 10, 10); assert.equal(await A.tick(), 0); assert.equal(SC.calls, 1, 'Scryfall gardé');
  T = at(D0, 16, 5); assert.equal(await A.tick(), 0); assert.equal(SC.calls, 2, 'relu après 6 h');
  assert.deepEqual(Object.keys(stateOf(dirA).done).sort(), ['fdn|j7|2026-11-16', 'fiv|j7|2026-11-14', 'six|j7|2026-11-15', 'tdy|j|2026-11-09']);
  A.stop(); A = mk(dirA, DF, SC); T = at(D0, 18);
  assert.equal(await A.tick(), 0); assert.equal(DF.posts.length, 4, 'redémarrage : rien de reposté');
  T = at(add(1), 10); assert.equal(await A.tick(), 0, 'J+1 : la sortie d\'hier n\'est pas reprise, J-6 déjà fait');
  T = at(add(2), 23, 59); assert.equal(await A.tick(), 0);
  ok('une seule fois (même jour, après 6 h, après un redémarrage, les jours suivants) ; Scryfall relu au plus toutes les 6 h ; état dans discord-sets.json');

  T = at(add(3), 10); assert.equal(await A.tick(), 1); assert.deepEqual(codesOf(DF.posts.slice(4)), ['MST'], 'Late Masters : jour J (jamais de J-7 : vue à J-3)');
  T = at(add(4), 9, 30); assert.equal(await A.tick(), 0, 'avant 10 h');
  T = at(add(4), 23, 30); assert.equal(await A.tick(), 1); assert.deepEqual(codesOf(DF.posts.slice(5)), ['FOU'], 'jour J rattrapé le soir même');
  assert.deepEqual(DF.posts[5].body.embeds[0].fields[1], { name: 'Cartes · Cards', value: '1\u202f234 cartes · cards', inline: true });
  T = at(add(5), 10); assert.equal(await A.tick(), 1); assert.deepEqual(codesOf(DF.posts.slice(6)), ['FIV']);
  ok('extension vue à J-3 : seulement le jour J ; J rattrapé tard le jour même (23 h 30), jamais avant 10 h ; nombre de cartes');
}

/* ── 3) Date changée : annoncée de nouveau à J-7 et J de la nouvelle date ── */
{
  T = at(add(6), 10);
  SC.sets.find(s => s.code === 'fdn').released_at = add(14);
  SC.sets.find(s => s.code === 'fdc').released_at = add(14);
  const n0 = DF.posts.length;
  assert.equal(await A.tick(), 1); assert.deepEqual(codesOf(DF.posts.slice(n0)), ['SIX']);
  T = at(add(7), 10); assert.equal(await A.tick(), 1, 'ancienne date de Foundations Two : pas de jour J, mais J-7 de la nouvelle');
  const p = DF.posts[DF.posts.length - 1].body;
  assert.match(p.content, /Sortie dans 7 jours : Foundations Two/);
  assert.match(p.embeds[0].description, /^📅 \*\*lundi 23 novembre 2026\*\* · Monday, November 23, 2026\n🔁 Nouvelle date \(annoncée avant pour le lundi 16 novembre 2026\) · New date \(was Monday, November 16, 2026\)\n/);
  T = at(add(13), 10); assert.equal(await A.tick(), 0, 'J-1 de la nouvelle date : rien');
  T = at(add(14), 10); assert.equal(await A.tick(), 1); assert.match(DF.posts[DF.posts.length - 1].body.content, /Sortie aujourd'hui : Foundations Two/);
  assert.ok(Object.keys(stateOf(dirA).done).includes('fdn|j7|2026-11-23'));
  ok('date repoussée d\'une semaine : pas de jour J à l\'ancienne date, J-7 de la nouvelle (« Nouvelle date, avant : … ») puis jour J');
}

/* ── 4) Rattrapage borné au premier démarrage ── */
{
  const dir = tmp(), DFb = fakeDiscord(), SCb = fakeScry(), Bt = mk(dir, DFb, SCb);
  T = at(add(1), 10, 30);
  assert.equal(await Bt.tick(), 2); assert.deepEqual(codesOf(DFb.posts), ['SIX', 'FDN'], 'J+1 : la sortie d\'hier oubliée ; J-6 et J-5 rattrapés ; J-4 non');
  assert.match(DFb.posts[1].body.content, /Sortie dans 6 jours : Foundations Two/);
  const dir2 = tmp(), DFc = fakeDiscord(), C = mk(dir2, DFc, fakeScry());
  T = at(add(3), 15);
  assert.equal(await C.tick(), 1); assert.deepEqual(codesOf(DFc.posts), ['MST'], 'J-4 de Foundations Two, J-1 de Four : rien ; jour J de Late Masters');
  ok('bot découvert en retard : J-7 rattrapé jusqu\'à J-5 seulement, jour J le jour même seulement');
}

/* ── 5) Salon absent, Discord en panne ou refus, Scryfall en panne : rien ne plante, nouvel essai ── */
{
  const dir = tmp(), DFd = fakeDiscord({ spoilers: false }), SCd = fakeScry(), Dd = mk(dir, DFd, SCd);
  logs.length = 0; T = at(D0, 10);
  assert.equal(await Dd.tick(), 0); T = at(D0, 10, 10); assert.equal(await Dd.tick(), 0);
  assert.equal(DFd.posts.length, 0); assert.equal(logs.filter(l => /salon #spoilers introuvable, 4 sorties/.test(l)).length, 1, 'une ligne de journal par jour');
  assert.ok(!existsSync(join(dir, 'discord-sets.json')) || !Object.keys(stateOf(dir).done).length, 'rien de noté');
  DFd.chans.push({ id: SPOIL, name: '✨・spoilers', type: 0, position: 1 });
  T = at(D0, 10, 20); assert.equal(await Dd.tick(), 4, 'salon créé : posté au tour suivant (liste relue)');
  ok('salon #spoilers absent : rien, sans planter, une ligne de journal ; créé ensuite : annonces postées au tour suivant');

  const dir2 = tmp(), DFe = fakeDiscord(), E = mk(dir2, DFe, fakeScry());
  T = at(D0, 10); DFe.down = 2;
  assert.equal(await E.tick(), 0, 'Discord en panne (503 deux fois) : arrêt du tour');
  assert.deepEqual(Object.keys(stateOf(dir2).done), [], 'entrée retirée');
  DFe.refuse = 1; T = at(D0, 10, 10);
  assert.equal(await E.tick(), 3, 'refus (403) pour la première : les autres partent'); assert.deepEqual(codesOf(DFe.posts), ['FIV', 'SIX', 'FDN']);
  T = at(D0, 10, 20); assert.equal(await E.tick(), 1); assert.deepEqual(codesOf(DFe.posts.slice(3)), ['TDY']);
  T = at(D0, 10, 30); assert.equal(await E.tick(), 0);
  ok('Discord en panne ou refus : pas noté, nouvel essai au tour suivant, chaque extension une seule fois');

  const dir3 = tmp(), DFf = fakeDiscord(), SCf = fakeScry(), F = mk(dir3, DFf, SCf);
  SCf.fail = 1; T = at(D0, 10);
  assert.equal(await F.tick(), 0); assert.equal(SCf.calls, 1);
  T = at(D0, 10, 30); assert.equal(await F.tick(), 0); assert.equal(SCf.calls, 1, 'pas de nouvel essai avant 1 h');
  T = at(D0, 11, 1); assert.equal(await F.tick(), 4); assert.equal(SCf.calls, 2);
  ok('Scryfall en panne : rien, nouvel essai après 1 h');
}

/* ── 6) Fichier illisible, purge des vieilles entrées, coupé ── */
{
  const dir = tmp(); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'discord-sets.json'), '{pas du json');
  const DFg = fakeDiscord(), SCg = fakeScry(), Gg = mk(dir, DFg, SCg); T = at(D0, 10); logs.length = 0;
  assert.equal(await Gg.tick(), 0); assert.equal(DFg.posts.length, 0); assert.equal(SCg.calls, 0); assert.ok(logs.some(l => /discord-sets\.json illisible/.test(l)));
  const dir2 = tmp(); mkdirSync(dir2, { recursive: true });
  writeFileSync(join(dir2, 'discord-sets.json'), JSON.stringify({ v: 1, done: { 'vie|j|2026-09-01': 1, 'tdy|j|2026-11-09': 5, 'bad': 3 } }));
  const DFh = fakeDiscord(), H = mk(dir2, DFh, fakeScry());
  assert.equal(await H.tick(), 3, 'jour J déjà noté : pas reposté'); assert.deepEqual(codesOf(DFh.posts), ['FIV', 'SIX', 'FDN']);
  assert.deepEqual(Object.keys(stateOf(dir2).done).sort(), ['fdn|j7|2026-11-16', 'fiv|j7|2026-11-14', 'six|j7|2026-11-15', 'tdy|j|2026-11-09'], 'entrée de plus de 30 jours et clé mal formée retirées');
  const off = mk(tmp(), fakeDiscord(), SCg, { off: true });
  assert.equal(off.on, false); assert.equal(await off.tick(), 0); assert.equal(SCg.calls, 0);
  assert.equal(dssMake({ sets: null, find: undefined }).on, false, 'sans bot : coupé');
  ok('fichier illisible : rien d\'annoncé (une ligne de journal) ; entrées de plus de 30 jours purgées ; off (DISCORD_SETS=0) ou sans bot : rien');
}

/* ── 7) Branché dans proxy.mjs : DISCORD_SETS, DISCORD_SETS_HOUR, SCRYFALL_UPSTREAM ── */
{
  const today = P0.dayOf(Date.now());
  const SH = { calls: 0 }, sDsc = { posts: [], auth: new Set() };
  const scry = http.createServer((req, res) => {
    SH.calls++; SH.ua = req.headers['user-agent'];
    if (req.url !== '/sets') { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: [set('pxj', 'Proxy Day', today, 'expansion'), set('pxp', 'Proxy Promo', today, 'promo')] }));
  });
  const dsc = http.createServer((req, res) => {
    let b = ''; req.on('data', d => { b += d; }); req.on('end', () => {
      sDsc.auth.add(req.headers.authorization);
      const p = req.url.replace(/^\/api\/v10/, ''), send = (s, j) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
      if (p === '/users/@me/guilds') return send(200, [{ id: G, name: 'Mana Orbit' }]);
      if (p === '/users/@me') return send(200, { id: BOT });
      if (p === `/guilds/${G}/channels`) return send(200, [{ id: SPOIL, name: '✨・spoilers', type: 0 }]);
      if (p === `/guilds/${G}/roles`) return send(200, [{ id: G, permissions: String(VIEW | SEND) }]);
      if (p === `/guilds/${G}/members/${BOT}`) return send(200, { roles: [] });
      if (req.method === 'POST' && p === `/channels/${SPOIL}/messages`) { sDsc.posts.push(JSON.parse(b)); return send(200, { id: '1' }); }
      return send(404, { message: 'route' });
    });
  });
  await new Promise(r => scry.listen(0, '127.0.0.1', r)); await new Promise(r => dsc.listen(0, '127.0.0.1', r));
  const procs = [];
  const start = (env, port) => new Promise((resolve, reject) => {
    const c = spawn('node', ['proxy.mjs'], { env: { ...process.env, EDH_SOURCE_URL: '', PORT: String(port), ALERTS: '0', PUBDECKS: '0', DISCORD_BOT_TOKEN: TOKEN, DISCORD_API: `http://127.0.0.1:${dsc.address().port}/api/v10`,
      DISCORD_PRESENCE: '0', SCRYFALL_UPSTREAM: `http://127.0.0.1:${scry.address().port}`, ADMIN_DIR: tmp(), DISCORD_SETS_FIRST_MS: '50', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; c.log = () => out;
    c.stdout.on('data', d => { out += d; if (/Mana Orbit →/.test(out)) resolve(c); }); c.stderr.on('data', d => { out += d; });
    c.on('exit', code => { if (code) reject(new Error('exit ' + code + ': ' + out)); });
    procs.push(c);
  });
  const stop = p => new Promise(r => { p.once('exit', r); p.kill(); });
  const until = async (f, ms = 8000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) return false; await new Promise(r => setTimeout(r, 25)); } return true; };
  try {
    let P = await start({ DISCORD_SETS: '0' }, 19870);
    await new Promise(r => setTimeout(r, 600));
    assert.equal(SH.calls, 0, 'DISCORD_SETS=0 : Scryfall jamais lu'); assert.doesNotMatch(P.log(), /sorties d'extensions/);
    await stop(P);
    P = await start({ DISCORD_SETS: '1', DISCORD_SETS_HOUR: '0' }, 19871);
    assert.ok(await until(() => sDsc.posts.length >= 1), 'annonce postée par le proxy : ' + P.log());
    await new Promise(r => setTimeout(r, 200));
    assert.equal(sDsc.posts.length, 1, 'promo écartée');
    assert.match(sDsc.posts[0].content, /^🎉 \*\*Sortie aujourd'hui : Proxy Day\*\*/); assert.deepEqual(sDsc.posts[0].allowed_mentions, { parse: [] });
    assert.match(sDsc.posts[0].embeds[0].description, /\[Acheter sur Cardmarket\]\(https:\/\/www\.cardmarket\.com\/fr\/Magic\/Products\/Search\?searchString=Proxy%20Day\)/);
    assert.equal(SH.calls, 1); assert.ok(SH.ua); assert.deepEqual([...sDsc.auth], ['Bot ' + TOKEN]);
    assert.match(P.log(), /Bot Discord : sorties d'extensions annoncées dans #spoilers \(J-7 et jour J, 0 h, Europe\/Paris\)/);
    assert.ok(!P.log().includes(TOKEN), 'jeton jamais dans le journal');
    await stop(P);
    ok('proxy.mjs : DISCORD_SETS=0 coupe (Scryfall jamais lu) ; allumé : SCRYFALL_UPSTREAM lu, jour J posté dans #spoilers (DISCORD_SETS_HOUR, ADMIN_DIR), jeton absent du journal');
  } finally { for (const p of procs) try { p.kill(); } catch { /* ignore */ } scry.close(); dsc.close(); }
}
console.log('\nTous les tests des sorties d\'extensions (Discord) passent.');
