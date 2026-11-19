// Aperçu des liens partagés (server/og-srv.mjs, branché dans proxy.mjs sur « / ») : robots des messageries (Discordbot, WhatsApp, facebookexternalhit…)
// → petite page de balises Open Graph / Twitter (titre = nom du deck, description : format, commandant, cartes, réserve, « partagé par », image = art du
// commandant chez Scryfall) ; personnes → la page de l'appli, inchangée. Faux Firestore REST (shares/{id}) et faux Scryfall ; partage absent ou serveur muet :
// la page de l'appli ; échappement HTML ; anglais (Accept-Language) ; liste d'échange ; cache (une lecture Firestore pour deux robots). Ports 19960–19962.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { ogInfo, ogHtml, ogIsBot, ogLang } from '../server/og-srv.mjs';

const ok = m => console.log('✓ ' + m);
const core = createRequire(import.meta.url)('../src/core.js');
const TEXT = 'Commander\n1 Edgar Markov\n\nDeck\n1 Sol Ring\n1 Swords to Plowshares\n10 Plains\nSB: 1 Wrath of God';

/* ── 0) Fonctions pures ─────────────────────────────────────────────────────────────────────── */
{
  for (const ua of ['Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)', 'WhatsApp/2.23.20.0', 'facebookexternalhit/1.1 Facebot Twitterbot/1.0', 'TelegramBot (like TwitterBot)', 'Slackbot-LinkExpanding 1.0'])
    assert.ok(ogIsBot(ua), ua);
  for (const ua of ['Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', 'Mozilla/5.0 (iPhone) Mobile/15E148 Snapchat/12.0 (like Safari/604.1)', 'Mozilla/5.0 (Linux; Android 13) Chrome/120.0 Mobile Safari/537.36 KAKAOTALK 10.4.5', 'Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile [FBAN/EMA;FBLC/fr_FR;FBAV/400.0]', 'Googlebot/2.1 (+http://www.google.com/bot.html)', ''])
    assert.ok(!ogIsBot(ua), ua);
  assert.deepEqual(['', 'fr-FR,fr;q=0.9', 'en-US,en;q=0.8', 'de', '*'].map(ogLang), ['fr', 'fr', 'en', 'en', 'fr']);
  const i = ogInfo({ kind: 'deck', name: 'Edgar partagé', text: TEXT, by: 'Martin' }, core, 'fr');
  assert.equal(i.title, 'Edgar partagé'); assert.equal(i.card, 'Edgar Markov');
  assert.match(i.desc, /^Deck Commander · Commandant : Edgar Markov · 13\/100 cartes · réserve 1 · partagé par Martin\. Voir le deck en lecture seule, sans compte/);
  const e = ogInfo({ kind: 'deck', name: 'Burn', text: '4 Lightning Bolt\n4 Goblin Guide\n20 Mountain' }, core, 'en');
  assert.match(e.desc, /^Deck · 28 cards\. View the deck read-only, no account needed/); assert.ok(['Lightning Bolt', 'Goblin Guide'].includes(e.card), 'sans commandant : une carte du deck');
  assert.equal(ogInfo({ kind: 'deck', name: 'C', text: '// Deck Deal : commander\n// Deck Deal cover: Sol Ring\nCommander\n1 Edgar Markov\nDeck\n1 Sol Ring' }, core, 'fr').card, 'Sol Ring', 'carte de présentation choisie d\'abord');
  const t = ogInfo({ kind: 'trade', by: 'Jeanne', have: [{ k: 'a' }, { k: 'b' }, { k: 'b' }], want: [{ k: 'c' }] }, core, 'fr');
  assert.deepEqual([t.title, t.desc, t.card], ['Liste d\'échange de Jeanne', '2 à échanger · 1 recherchées · Voir la liste en lecture seule, sans compte.', '']);
  const h = ogHtml({ title: 'A "<b>" & B', desc: '<script>x</script>', url: 'https://manaorbit.app/?p=abc', img: 'https://img/x.jpg', lang: 'fr', big: true });
  assert.ok(!/<b>|<script>x/.test(h), 'échappé'); assert.match(h, /<meta property="og:title" content="A &quot;&lt;b&gt;&quot; &amp; B">/);
  assert.match(h, /<meta name="twitter:card" content="summary_large_image">/); assert.match(h, /<meta name="robots" content="noindex">/);
  ok('pures : robots reconnus (navigateurs, navigateurs intégrés des applis et moteurs de recherche non), langue, description du deck (format, commandant, cartes x/100, réserve, auteur), carte de l\'image, liste d\'échange, échappement');
}

/* ── Faux Firestore REST et faux Scryfall ───────────────────────────────────────────────────── */
const SID = 'OgShareDeck00001', TID = 'OgShareTrade0001', BAD = 'OgShareXSS000001';
const shares = new Map([
  [SID, { kind: 'deck', d: JSON.stringify({ name: 'Edgar partagé', text: TEXT, by: 'Martin', at: 5 }) }],
  [TID, { kind: 'trade', d: JSON.stringify({ have: [{ k: 'sol ring', n: 'Sol Ring', q: 2 }], want: [], by: 'Jeanne', at: 5 }) }],
  [BAD, { kind: 'deck', d: JSON.stringify({ name: '"><script>alert(1)</script>', text: TEXT, at: 5 }) }],
]);
const hits = { fs: 0, scry: 0 }; let fsDown = false;
const upFs = http.createServer((req, res) => {
  hits.fs++; const id = decodeURIComponent(req.url.split('?')[0].split('/').pop()), s = shares.get(id);
  if (fsDown) { res.writeHead(503); return res.end(); }
  if (!s) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"error":{"code":404}}'); }
  res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ fields: { kind: { stringValue: s.kind }, d: { stringValue: s.d }, o: { stringValue: 'x' } } }));
}).listen(19961, '127.0.0.1');
const upScry = http.createServer((req, res) => {
  hits.scry++; const n = new URL(req.url, 'http://x').searchParams.get('exact');
  if (n === 'Edgar Markov') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ name: n, image_uris: { normal: 'https://cards.scryfall.io/normal/front/e/d/edgar.jpg', art_crop: 'https://cards.scryfall.io/art_crop/front/e/d/edgar.jpg' } })); }
  res.writeHead(404, { 'content-type': 'application/json' }); res.end('{}');
}).listen(19962, '127.0.0.1');

const port = 19960;
const proc = spawn('node', ['server/proxy.mjs'], { env: { ...process.env, EDH_SOURCE_URL: '', PORT: String(port), ALERTS: '0', FIRESTORE_BASE_URL: 'http://127.0.0.1:19961', SCRYFALL_UPSTREAM: 'http://127.0.0.1:19962', SITE_URL: 'https://manaorbit.app' } });
let out = ''; proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
process.on('exit', () => { try { proc.kill(); } catch { /* ignore */ } upFs.close(); upScry.close(); });
for (let i = 0; i < 100 && !/Mana Orbit →/.test(out); i++) await new Promise(r => setTimeout(r, 100));
assert.match(out, /Mana Orbit →/, out);
const get = async (path, ua, al) => { const r = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { 'User-Agent': ua, ...(al ? { 'Accept-Language': al } : {}) } }); return { st: r.status, hd: r.headers, body: await r.text() }; };
const BOT = 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)', HUMAN = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36';
const meta = (h, p) => { const m = h.match(new RegExp(`<meta (?:property|name)="${p}" content="([^"]*)">`)); return m ? m[1] : null; };

/* ── 1) Robot : deck partagé ─────────────────────────────────────────────────────────────────── */
{
  const r = await get('/?p=' + SID, BOT);
  assert.equal(r.st, 200); assert.match(r.hd.get('content-type'), /text\/html/); assert.ok(r.body.length < 4000, 'petite page');
  assert.equal(meta(r.body, 'og:title'), 'Edgar partagé'); assert.equal(meta(r.body, 'og:url'), 'https://manaorbit.app/?p=' + SID);
  assert.match(meta(r.body, 'og:description'), /^Deck Commander · Commandant : Edgar Markov · 13\/100 cartes · réserve 1 · partagé par Martin\./);
  assert.equal(meta(r.body, 'og:image'), 'https://cards.scryfall.io/art_crop/front/e/d/edgar.jpg', 'art du commandant');
  assert.equal(meta(r.body, 'twitter:card'), 'summary_large_image'); assert.match(r.hd.get('vary'), /User-Agent/); assert.equal(r.hd.get('x-robots-tag'), 'noindex');
  const fs0 = hits.fs, sc0 = hits.scry, r2 = await get('/?p=' + SID, 'WhatsApp/2.23.20.0');
  assert.equal(meta(r2.body, 'og:title'), 'Edgar partagé'); assert.deepEqual([hits.fs, hits.scry], [fs0, sc0], 'gardé : ni Firestore ni Scryfall relus');
  const en = await get('/?p=' + SID, BOT, 'en-US,en;q=0.8');
  assert.match(meta(en.body, 'og:description'), /^Commander deck · Commander: Edgar Markov · 13\/100 cards · sideboard 1 · shared by Martin\./); assert.match(en.body, /<html lang="en">/);
  ok('robot : page de balises (titre, description, image du commandant, lien canonique, noindex, Vary), gardée en mémoire, anglais selon Accept-Language');
}

/* ── 2) Personne : la page de l'appli ; partage absent, invalide ou serveur muet : la page de l'appli ─── */
{
  const h = await get('/?p=' + SID, HUMAN); assert.equal(h.st, 200); assert.ok(h.body.length > 100000, 'page de l\'appli'); assert.equal(meta(h.body, 'og:title'), null);
  const gone = await get('/?p=OgShareMissing01', BOT); assert.ok(gone.body.length > 100000, 'partage arrêté : page de l\'appli');
  const bad = await get('/?p=a/../b', BOT); assert.ok(bad.body.length > 100000, 'identifiant invalide : page de l\'appli');
  fsDown = true; const down = await get('/?p=OgShareDown00001', BOT); fsDown = false; assert.ok(down.body.length > 100000, 'Firestore muet : page de l\'appli');
  const plain = await get('/', BOT); assert.ok(plain.body.length > 100000, 'sans partage : page de l\'appli');
  ok('personne → page de l\'appli inchangée ; robot sur un partage arrêté, invalide, injoignable ou sans partage → page de l\'appli');
}

/* ── 3) Liste d'échange, nom piégé, deck sans image connue ────────────────────────────────────── */
{
  const t = await get('/?p=' + TID, BOT);
  assert.equal(meta(t.body, 'og:title'), 'Liste d\'échange de Jeanne'); assert.equal(meta(t.body, 'og:image'), 'https://manaorbit.app/icons/icon-512.png'); assert.equal(meta(t.body, 'twitter:card'), 'summary');
  const x = await get('/?p=' + BAD, BOT);
  assert.ok(!x.body.includes('<script>'), 'nom échappé'); assert.equal(meta(x.body, 'og:title'), '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  ok('liste d\'échange : titre avec le pseudo, icône de l\'appli ; nom de deck piégé échappé');
}
console.log('OG OK');
process.exit(0);
