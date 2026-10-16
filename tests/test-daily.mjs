// Carte mystère, côté serveur (daily-srv.mjs) : décodeur et encodeur PNG (filtres, formats, Adam7, fichiers abîmés), découpe aux proportions du cadre moderne et
// gros plans (point riche en détails, dézoom), tirage de la carte avec un faux Scryfall (langues vérifiées, 30 essais, repli anglais, reproductible), score, nom dévoilé par la fin, jours /
// semaines / saisons à l'heure de Paris (changement d'heure compris), parties (classée ou non, une par compte et par jour), classements, badges, masque d'un
// pseudo, purge, relecture du disque ; anti-triche : ni nom, ni identifiant, ni extension, ni adresse Scryfall dans les réponses avant la fin, images sans
// la bande du titre ni la ligne du bas. Puis le vrai proxy.mjs (ports 19700–19702) : /__ping, jetons Firebase, DAILY=0, panneau /admin. Traductions de src/daily.js.
import './setup-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import * as M from '../daily-srv.mjs';
import { startDailyScry, fakeCardImg, SERRA, RED, BLUE, MAGENTA, LANGS } from './daily-fakes.mjs';
import { startFakes } from './amis-fakes.mjs';

const { pngDecode, pngEncode, pngChunks, crc32, imgCrop, imgResize, imgBilinear, dlyFocus, dlyWins, dlyZoomRel, dlyZone, dlyStages, dlyScore, dlyStepAt, dlyMask, dlyNorm, dlyClock, dlyAdd, dlyPrintOk, dlyNamed, dlyName, dailyMake, DLY_ZONES, DLY_ZOOM, DLY_ART_W } = M;
const TMP = mkdtempSync(join(tmpdir(), 'deckdeal-daily-')); process.on('exit', () => { try { rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });
let nDir = 0; const newDir = () => join(TMP, 'd' + (++nDir));
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const rnd = (w, h, alpha) => { const d = new Uint8Array(w * h * 4); let s = 7; for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) >>> 0; d[i] = s >>> 24; } if (!alpha) for (let i = 3; i < d.length; i += 4) d[i] = 255; return { w, h, data: d }; };
/** PNG écrit à la main (filtre 0) : format quelconque, entrelacé (Adam7) ou non. rows(pw, ph, x0, y0, dx, dy) → octets d'une passe sans les filtres. */
function rawPng(w, h, depth, ct, rows, { il = 0, plte, trns } = {}) {
  const chunk = (t, d) => { const hd = Buffer.alloc(8); hd.writeUInt32BE(d.length); hd.write(t, 4, 'latin1'); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(hd.subarray(4), d)); return Buffer.concat([hd, d, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w); ihdr.writeUInt32BE(h, 4); ihdr[8] = depth; ihdr[9] = ct; ihdr[12] = il;
  const passes = il ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  const parts = [];
  for (const [x0, y0, dx, dy] of passes) { const pw = Math.ceil((w - x0) / dx), ph = Math.ceil((h - y0) / dy); if (pw > 0 && ph > 0) for (const r of rows(pw, ph, x0, y0, dx, dy)) parts.push(Buffer.from([0]), Buffer.from(r)); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), ...(plte ? [chunk('PLTE', Buffer.from(plte))] : []), ...(trns ? [chunk('tRNS', Buffer.from(trns))] : []), chunk('IDAT', deflateSync(Buffer.concat(parts))), chunk('IEND', Buffer.alloc(0))]);
}
const px = (img, x, y) => Array.from(img.data.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4));
const has = (img, c) => { for (let i = 0; i < img.data.length; i += 4) if (img.data[i] === c[0] && img.data[i + 1] === c[1] && img.data[i + 2] === c[2]) return true; return false; };

test('PNG : aller-retour, chaque filtre, RVB et RVBA, morceaux IHDR · IDAT · IEND seulement', () => {
  for (const alpha of [false, true]) for (const filter of [0, 1, 2, 3, 4, undefined]) {
    const im = rnd(37, 23, alpha), b = pngEncode(im, { alpha, filter }), d = pngDecode(b);
    assert.equal(d.w, 37); assert.equal(d.h, 23); assert.ok(same(d.data, im.data), `filtre ${filter} alpha ${alpha}`);
    assert.deepEqual(pngChunks(b), ['IHDR', 'IDAT', 'IEND']);
  }
  const t = { w: 2, h: 1, data: Uint8Array.from([200, 100, 50, 128, 10, 20, 30, 0]) };      // RVB : alpha posé sur du noir
  assert.deepEqual(Array.from(pngDecode(pngEncode(t)).data), [100, 50, 25, 255, 0, 0, 0, 255]);
});
test('PNG : fichiers d\'un autre encodeur (icônes du dépôt), gris 1 bit, palette + tRNS, 16 bits, gris + alpha, entrelacé Adam7', () => {
  for (const f of readdirSync('pwa/icons').filter(f => f.endsWith('.png'))) {
    const b = readFileSync(join('pwa/icons', f)), d = pngDecode(b);
    assert.equal(d.w, b.readUInt32BE(16), f); assert.equal(d.h, b.readUInt32BE(20), f);
    assert.ok(same(pngDecode(pngEncode(d, { alpha: true })).data, d.data), f + ' : aller-retour');
  }
  const W = 13, H = 11, gray = (x, y) => ((x * 3 + y * 5) % 2), fill = (fn, bytes) => (pw, ph, x0, y0, dx, dy) => Array.from({ length: ph }, (_, y) => bytes(pw, x => fn(x0 + x * dx, y0 + y * dy)));
  const bits1 = (pw, v) => { const r = new Uint8Array(Math.ceil(pw / 8)); for (let x = 0; x < pw; x++) if (v(x)) r[x >> 3] |= 128 >> (x & 7); return r; };
  for (const il of [0, 1]) {
    const d = pngDecode(rawPng(W, H, 1, 0, fill(gray, bits1), { il }));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) assert.deepEqual(px(d, x, y), gray(x, y) ? [255, 255, 255, 255] : [0, 0, 0, 255], `gris 1 bit ${x},${y} il=${il}`);
    const pal = [10, 20, 30, 40, 50, 60, 70, 80, 90], idx = (x, y) => (x + y) % 3;
    const d2 = pngDecode(rawPng(W, H, 8, 3, fill(idx, (pw, v) => Uint8Array.from({ length: pw }, (_, x) => v(x))), { il, plte: pal, trns: [255, 0] }));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = idx(x, y); assert.deepEqual(px(d2, x, y), [pal[i * 3], pal[i * 3 + 1], pal[i * 3 + 2], i === 1 ? 0 : 255]); }
    const d3 = pngDecode(rawPng(W, H, 16, 2, fill((x, y) => [x * 1000, y * 2000, 65535], (pw, v) => { const r = Buffer.alloc(pw * 6); for (let x = 0; x < pw; x++) v(x).forEach((c, k) => r.writeUInt16BE(c, x * 6 + k * 2)); return r; }), { il }));
    assert.deepEqual(px(d3, 5, 7), [(5000 >> 8), (14000 >> 8), 255, 255], '16 bits : octet de poids fort');
    const d4 = pngDecode(rawPng(W, H, 8, 4, fill((x, y) => [x * 9, y * 20], (pw, v) => Uint8Array.from({ length: pw * 2 }, (_, k) => v(k >> 1)[k & 1])), { il }));
    assert.deepEqual(px(d4, 4, 3), [36, 36, 36, 60], 'gris + alpha');
  }
});
test('PNG : fichiers refusés (signature, CRC, tronqué, trop grand, morceau critique inconnu)', () => {
  const ok = pngEncode(rnd(8, 8));
  assert.throws(() => pngDecode(Buffer.from('pas une image du tout, vraiment pas une image')), /signature/);
  const bad = Buffer.from(ok); bad[bad.length - 20] ^= 0xff; assert.throws(() => pngDecode(bad), /CRC|illisible/);
  assert.throws(() => pngDecode(ok.subarray(0, ok.length - 12)), /incomplet|tronqu/);
  assert.throws(() => pngDecode(pngEncode(rnd(100, 100)), 5000), /taille/);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  const ck = (t, d) => { const hd = Buffer.alloc(8); hd.writeUInt32BE(d.length); hd.write(t, 4, 'latin1'); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(hd.subarray(4), d)); return Buffer.concat([hd, d, c]); };
  assert.throws(() => pngDecode(Buffer.concat([ok.subarray(0, 8), ck('IHDR', ihdr), ck('ZZZZ', Buffer.alloc(4)), ck('IDAT', deflateSync(Buffer.from([0, 1, 2, 3]))), ck('IEND', Buffer.alloc(0))])), /critique/);
});

test('découpe : zones du cadre moderne sans la bande du titre ni la ligne du bas ; gros plans de plus en plus larges ; 7 images d\'étapes', () => {
  const card = fakeCardImg('fr', 1), art = dlyZone(card, 'art'), type = dlyZone(card, 'type'), text = dlyZone(card, 'text');
  assert.ok(DLY_ZONES.art[1] > 0.1 && DLY_ZONES.text[3] < 0.93, 'sous le titre, au-dessus de la ligne du bas');
  assert.deepEqual([art.w, art.h], [Math.round(0.83 * 745), Math.round(0.431 * 1040)]);
  for (const [n, z] of [['art', art], ['type', type], ['text', text]]) { assert.ok(!has(z, RED), n + ' : pas de titre'); assert.ok(!has(z, MAGENTA), n + ' : pas de ligne du bas'); }
  assert.ok(!has(art, BLUE), 'illustration : pas la ligne de type');
  for (let i = 0; i < type.data.length; i += 4) assert.deepEqual(Array.from(type.data.subarray(i, i + 3)), BLUE, 'ligne de type entière');
  const small = imgResize(imgCrop(card, 0, 0, 40, 30), 4, 3), mean = [0, 0, 0]; for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) px(card, x, y).slice(0, 3).forEach((c, k) => { mean[k] += c / 100; });
  assert.deepEqual(px(small, 0, 0).slice(0, 3), mean.map(Math.round), 'bloc = moyenne de ses pixels');
  const sq = { w: 2, h: 2, data: Uint8Array.from([0, 0, 0, 255, 200, 0, 0, 255, 0, 200, 0, 255, 0, 0, 200, 255]) }, up = imgBilinear(sq, 8, 8);
  assert.deepEqual([px(up, 0, 0), px(up, 7, 0), px(up, 0, 7), px(up, 7, 7)], [[0, 0, 0, 255], [200, 0, 0, 255], [0, 200, 0, 255], [0, 0, 200, 255]], 'agrandissement bilinéaire : coins gardés');
  const mid = px(up, 3, 0)[0]; assert.ok(mid > 0 && mid < 200, 'dégradé doux, sans blocs');
  // point du gros plan : un damier fin dans le quart en bas à droite, le reste uni → toujours dans le damier, quel que soit le tirage
  const flat = { w: 400, h: 300, data: new Uint8Array(400 * 300 * 4).fill(120) }; for (let y = 200; y < 300; y++) for (let x = 280; x < 400; x++) { const o = (y * 400 + x) * 4, v = ((x >> 2) ^ (y >> 2)) & 1 ? 230 : 20; flat.data[o] = flat.data[o + 1] = flat.data[o + 2] = v; }
  for (const r of [0, 0.5, 0.99]) { const f = dlyFocus(flat, () => r); assert.ok(f.x > 0.62 && f.y > 0.6, 'point dans le détail : ' + JSON.stringify(f)); }
  const ws = dlyWins({ x: 0.97, y: 0.03 }); assert.deepEqual(ws.map(w => w[2]), [...DLY_ZOOM, 1], 'de plus en plus large, puis toute l\'illustration');
  for (const [x, y, w, h] of ws) assert.ok(x >= 0 && y >= 0 && x + w <= 1.0000001 && y + h <= 1.0000001, 'fenêtre dans l\'illustration');
  for (let i = 1; i < ws.length; i++) { const [a, b] = [ws[i - 1], ws[i]]; assert.ok(a[0] >= b[0] - 1e-9 && a[1] >= b[1] - 1e-9 && a[0] + a[2] <= b[0] + b[2] + 1e-9 && a[1] + a[3] <= b[1] + b[3] + 1e-9, 'chaque gros plan contient le précédent'); }
  const z2 = dlyZoomRel({ x: 0.5, y: 0.5 }, 2); assert.deepEqual(z2.map(n => Math.round(n * 100)), [20, 20, 59, 59], 'étape 2 : la 1re au centre, 59 % de la largeur');
  assert.equal(dlyZoomRel({ x: 0.5, y: 0.5 }, 6), null);
  const st = dlyStages(card, { x: 0.3, y: 0.6 }); assert.equal(st.length, 7);
  const dec = st.map(b => pngDecode(b)), H = Math.round(DLY_ART_W * art.h / art.w);
  assert.deepEqual(dec.map(d => d.w), [480, 480, 480, 480, 480, type.w, text.w]); assert.deepEqual(dec.slice(0, 5).map(d => d.h), [H, H, H, H, H], 'gros plans aux proportions de l\'illustration');
  assert.notDeepEqual(px(dec[0], 0, 0), px(dec[4], 0, 0), 'étape 1 : un détail, pas l\'illustration entière'); assert.ok(type.w <= 640 && text.w <= 640);
  dec.forEach((d, i) => { assert.ok(!has(d, RED) && !has(d, MAGENTA), 'étape ' + (i + 1) + ' : ni titre ni ligne du bas'); assert.deepEqual(pngChunks(st[i]), ['IHDR', 'IDAT', 'IEND']); });
  const colors = d => { const c = new Set(); for (let i = 0; i < d.data.length; i += 4) c.add(d.data[i] << 16 | d.data[i + 1] << 8 | d.data[i + 2]); return c.size; };
});

test('règles : score, nom dévoilé par la fin, comparaison des noms, pseudo', () => {
  assert.deepEqual([0, 500, 501, 1500, 12e3, 60e3, 120e3].map(dlyScore), [1000, 1000, 1000, 993, 914, 554, 104], '1 000 jusqu\'à 0,5 s, puis −7,5 par seconde (≈ 914 à 12 s, 554 à 1 min, 104 à 2 min)');
  assert.equal(dlyScore(130e3), 50, 'plancher : 50 tant que la carte est trouvée'); assert.equal(dlyScore(3600e3), 50);
  assert.deepEqual([0, 11999, 12e3, 23999, 24e3, 107999, 108e3, 600e3].map(x => dlyStepAt(x)), [1, 1, 2, 2, 3, 9, 10, 10], 'une étape toutes les 12 s, 10 étapes en 2 min');
  assert.equal(dlyMask('Anneau solaire', 7), '______ _______');
  assert.equal(dlyMask('Anneau solaire', 8), '______ ____ire', '20 % des lettres, par la fin');
  assert.equal(dlyMask('Anneau solaire', 9), '______ __laire');
  assert.equal(dlyMask('Anneau solaire', 10), '______ _olaire', 'jamais plus de la moitié des lettres (13 → 6)');
  assert.equal(dlyMask('Ange de Serra', 10), '____ __ Serra');
  for (const n of ['Opt', 'Ox', 'Ange de Serra', "Ajani's Pridemate", 'Jace, the Mind Sculptor', 'Ángel de Serra']) for (let s = 1; s <= 10; s++) {
    const m = Array.from(dlyMask(n, s)), c = Array.from(n), letter = x => /[\p{L}\p{N}]/u.test(x);
    assert.ok(m.includes('_'), `${n} à l'étape ${s} : jamais tout`); assert.equal(m.length, c.length);
    assert.ok(m.filter((x, i) => letter(c[i]) && x !== '_').length <= Math.floor(c.filter(letter).length / 2), `${n} à l'étape ${s} : la moitié des lettres au plus`);
    assert.ok(m.every((x, i) => x === '_' || x === c[i]), 'lettres à leur place');
    const last = m.lastIndexOf('_'); assert.ok(m.every((x, i) => i <= last || !letter(c[i]) || x === c[i]) && m.every((x, i) => i >= last || !letter(c[i]) || x === '_'), `${n} à l'étape ${s} : dévoilé par la fin`);
  }
  assert.equal(dlyMask("Ajani's Pridemate", 8), "_____'_ ______ate", 'apostrophe visible, lettres comptées');
  assert.equal(dlyNorm('Ángel  de SERRA'), 'angel de serra'); assert.equal(dlyNorm('Fire // Ice'), 'fire'); assert.equal(dlyNorm('Æther Vial'), 'aether vial');
  assert.equal(dlyName('  Max\u0007 <b>  le\tgrand  ', () => false), 'Max b le grand'); assert.equal(dlyName('x'.repeat(40)).length, 24); assert.equal(dlyName('vilain', s => s === 'vilain'), '');
});

test('heure de Paris : journée de 18:00 à 18:00, changement d\'heure, semaine du lundi, saison du mois', () => {
  const C = dlyClock(18, 'Europe/Paris');
  assert.equal(C.dayOf(Date.UTC(2026, 9, 15, 15, 59, 59)), '2026-10-14', '17:59:59 à Paris : encore la carte de la veille');
  assert.equal(C.dayOf(Date.UTC(2026, 9, 15, 16, 0, 0)), '2026-10-15', '18:00 : nouvelle carte');
  assert.equal(C.startOf('2026-10-15'), Date.UTC(2026, 9, 15, 16), 'heure d\'été : 16:00 UTC');
  assert.equal(C.startOf('2026-10-25'), Date.UTC(2026, 9, 25, 17), 'le jour du passage à l\'heure d\'hiver (3 h → 2 h) : 17:00 UTC');
  assert.equal(C.nextOf('2026-10-24'), Date.UTC(2026, 9, 25, 17), 'journée de 25 h');
  assert.equal(C.startOf('2027-03-28'), Date.UTC(2027, 2, 28, 16), 'passage à l\'heure d\'été');
  assert.equal(C.dayOf(Date.UTC(2026, 9, 25, 16, 30)), '2026-10-24', '17:30 heure d\'hiver : encore la veille');
  assert.equal(C.dayOf(Date.UTC(2027, 0, 1, 16, 59)), '2026-12-31'); assert.equal(C.dayOf(Date.UTC(2027, 0, 1, 17, 0)), '2027-01-01');
  assert.equal(C.weekOf('2026-10-19'), '2026-10-19', 'lundi 18:00 : nouvelle semaine'); assert.equal(C.weekOf('2026-10-18'), '2026-10-12', 'dimanche : semaine d\'avant');
  assert.equal(C.weekOf('2027-01-03'), '2026-12-28'); assert.equal(C.seasonOf('2026-10-31'), '2026-10'); assert.equal(dlyAdd('2026-12-31', 1), '2027-01-01');
  const U = dlyClock(0, 'UTC'); assert.equal(U.dayOf(Date.UTC(2026, 0, 2, 0, 0)), '2026-01-02'); assert.equal(U.startOf('2026-01-02'), Date.UTC(2026, 0, 2));
  const X = dlyClock(18, 'Pas/UnFuseau'); assert.equal(X.tz, 'UTC', 'fuseau inconnu : UTC');
});

test('impressions jouables : cadre, présentation, vitrine, plein art, terrain de base, texte qui cite la carte', () => {
  const base = { lang: 'pt', layout: 'normal', frame: '2015', border_color: 'black', frame_effects: [], name: 'Serra Angel', printed_name: 'Anjo de Serra', set: 'tst', collector_number: '1', type_line: 'Creature — Angel', image_status: 'highres_scan', image_uris: { png: 'p', large: 'l' }, oracle_text: 'Flying', printed_text: 'Voar' };
  assert.ok(dlyPrintOk(base, 'pt'));
  for (const [k, v] of [['lang', 'fr'], ['layout', 'transform'], ['frame', '1997'], ['full_art', true], ['border_color', 'borderless'], ['frame_effects', ['showcase']], ['frame_effects', ['extendedart']], ['digital', true], ['promo', true],
    ['type_line', 'Basic Land — Forest'], ['type_line', 'Token Creature — Angel'], ['type_line', 'Legendary Planeswalker — Jace'], ['image_status', 'missing'], ['image_uris', { large: 'l' }], ['textless', true], ['oracle_text', 'When Serra Angel enters, draw a card.'], ['printed_text', 'Quando Anjo de Serra entrar…'], ['flavor_text', 'Serra angel watches.']])
    assert.ok(!dlyPrintOk({ ...base, [k]: v }, 'pt'), k + ' = ' + JSON.stringify(v));
  assert.ok(dlyNamed('Whenever Isamaru attacks', 'Isamaru, Hound of Konda')); assert.ok(!dlyNamed('Angelic flyer', 'Angel')); assert.ok(dlyNamed('Sol Ring.', 'Sol Ring'));
});

/* ── Jeu complet derrière un petit serveur HTTP (horloge, Scryfall et jetons simulés) ─────────────────────────────────── */
/** Jetons des tests : « tok:<uid> » ; uid « nover… » : adresse non vérifiée ; « new… » : compte créé il y a 2 jours ; « nodate… » : date inconnue (repli : première fois vu par le jeu). */
const verify = async tok => { if (/^tok:[\w-]+$/.test(tok)) { const uid = tok.slice(4); return { uid, emailVerified: !uid.startsWith('nover'), provider: 'password' }; } throw Object.assign(new Error('jeton'), { authCode: tok === 'expired' ? 'expired' : 'invalid' }); };
async function harness(o = {}) {
  const T = { now: o.at || Date.UTC(2026, 9, 15, 17, 0) }, warns = [];      // 19:00 à Paris : carte du 15 octobre
  const S = o.scry || await startDailyScry(o.fake);
  const account = async uid => (uid.startsWith('nodate') ? null : { created: T.now - (uid.startsWith('new') ? 2 : 60) * 86400e3 });
  const D = dailyMake({ dir: o.dir || newDir(), scry: S.url, imgHosts: [S.url + '/'], now: () => T.now, verify, account, net: req => String(req.headers['x-test-net'] || ''), gapMs: 0, firstMs: 1e9, secret: o.secret ?? 'secret-de-test', log: { log() {}, warn: m => warns.push(m) }, ...(o.opts || {}) });
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x'), path = url.pathname.replace(/^\/api\//, '');
    try { if (path.startsWith('admin/')) await D.admin(req, res, path.slice(6), url); else if (path === 'level' || path.startsWith('level/')) await D.level(req, res, path, url); else await D.api(req, res, path, url); } catch (e) { res.writeHead(500); res.end(String(e && e.stack)); }
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const call = async (method, path, { tok, body, dev, net } = {}) => {
    const r = await fetch(base + path, { method, headers: { ...(tok ? { 'x-firebase-token': tok } : {}), ...(dev ? { 'x-daily-device': dev } : {}), ...(net ? { 'x-test-net': net } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const raw = r.headers.get('content-type') === 'image/png' ? Buffer.from(await r.arrayBuffer()) : await r.text();
    let j = null; if (typeof raw === 'string') try { j = JSON.parse(raw); } catch { /* pas du JSON */ }
    return { status: r.status, j, raw, type: r.headers.get('content-type') };
  };
  const ready = async () => { await D.tick(); const s = await call('GET', 'api/daily'); assert.equal(s.j.st, 'ready', 'carte prête : ' + warns.join(' | ')); return s.j; };
  return { T, S, D, call, ready, warns, stop: async () => { await D.stop(); srv.close(); if (!o.scry) S.stop(); } };
}
/** Rien qui identifie la carte : nom (toutes langues), extension, numéro, identifiants, adresse Scryfall. */
function noLeak(raw, c = SERRA, what = '') {
  const t = String(raw).toLowerCase();
  for (const n of [c.en, ...Object.values(c.names)]) assert.ok(!t.includes(n.toLowerCase()), `${what} : nom « ${n} » dans la réponse`);
  for (const x of ['scryfall', 'or-' + c.set, 'id-' + c.set, '"' + c.set + '"', '"' + c.num + '"', 'test set', '.png', '.jpg']) assert.ok(!t.includes(x), `${what} : « ${x} » dans la réponse`);
}

test('tirage : impressions portugaises puis chaque langue vérifiée, nouvel essai si une langue manque, reproductible d\'après la date', async () => {
  const A = { ...SERRA, num: '1' }, B = { ...SERRA, num: '2', en: 'Lonely Angel', names: { fr: 'Ange solitaire', de: 'Einsamer Engel', es: 'Ángel solitario', it: 'Angelo solitario', pt: 'Anjo solitário' }, miss: ['de'] };
  const Cx = { ...B, num: '3', en: 'Named Angel', names: { fr: 'Ange nommé', de: 'Benannter Engel', es: 'Ángel nombrado', it: 'Angelo nominato', pt: 'Anjo nomeado' }, miss: [], text: 'When Named Angel enters, you win.' };
  const Dx = { ...B, num: '4', en: 'Shiny Angel', names: { fr: 'Ange brillant', de: 'Glänzender Engel', es: 'Ángel brillante', it: 'Angelo lucente', pt: 'Anjo brilhante' }, miss: [], bad: { frame_effects: ['showcase'] } };
  const Bs = Array.from({ length: 6 }, (_, i) => ({ ...B, num: String(20 + i), en: 'Lonely Angel ' + i }));
  const S = await startDailyScry({ cards: [...Bs.slice(0, 3), Cx, A, Dx, ...Bs.slice(3)], per: 3 });
  const picks = [];
  for (const day of [0, 0, 1]) {
    const h = await harness({ scry: S, at: Date.UTC(2026, 9, 15 + day, 17) }); const st = await h.ready();
    const rec = h.D._g.cur; picks.push(rec.card.en);
    assert.equal(rec.card.en, 'Serra Angel', 'seule carte complète et jouable : ' + h.warns.join(' | '));
    assert.deepEqual(Object.keys(rec.card.l).sort(), LANGS.slice().sort()); assert.ok(!Object.values(rec.card.l).some(x => x.fb), 'aucun repli');
    assert.equal(rec.card.l.de.n, 'Serra-Engel'); assert.ok(/\/png\/tst\/1\/de\.png$/.test(rec.card.l.de.png));
    assert.equal(st.day, '2026-10-' + (15 + day));
    await h.stop();
  }
  assert.ok(S.hits.some(x => /\/cards\/tst\/2\d\/de$/.test(x)), 'une carte sans allemand a été vérifiée puis écartée');
  assert.ok(!S.hits.some(x => /\/cards\/tst\/[34]\//.test(x)), 'carte qui se nomme dans son texte, vitrine : écartées sans rien vérifier');
  assert.ok(S.hits.filter(x => x.startsWith('/cards/search')).every(x => decodeURIComponent(x).includes('lang:pt') && decodeURIComponent(x).includes('frame:2015')), 'recherche : portugais, cadre moderne');
  S.stop();
  // reproductible : même graine (date + secret) → même ordre d'essai ; autre secret → autre ordre possible
  const many = Array.from({ length: 12 }, (_, i) => ({ ...SERRA, num: String(100 + i), en: 'Angel ' + i, names: Object.fromEntries(Object.keys(SERRA.names).map(l => [l, l + ' Ange ' + i])) }));
  const S2 = await startDailyScry({ cards: many, per: 3 }), order = async (secret, at) => { const h = await harness({ scry: S2, secret, at }); await h.ready(); const e = h.D._g.cur.card.en; await h.stop(); return e; };
  const a1 = await order('s1', Date.UTC(2026, 9, 15, 17)), a2 = await order('s1', Date.UTC(2026, 9, 15, 23)), others = new Set();
  assert.equal(a1, a2, 'même jour, même secret : même carte');
  for (let d = 0; d < 8; d++) others.add(await order('s1', Date.UTC(2026, 9, 16 + d, 17)));
  assert.ok(others.size >= 3, 'les jours suivants changent de carte : ' + [...others]);
  S2.stop();
});
test('tirage : 30 essais au plus, puis repli : même carte pour tous, image et nom anglais pour la langue qui manque', async () => {
  const noIt = Array.from({ length: 50 }, (_, i) => ({ ...SERRA, num: String(i + 1), en: 'Angel ' + i, names: { fr: 'Ange ' + i, de: 'Engel ' + i, es: 'Ángel ' + i, it: 'Angelo ' + i, pt: 'Anjo ' + i }, miss: i % 7 ? ['it'] : ['it', 'de'] }));
  const S = await startDailyScry({ cards: noIt, per: 10 }), h = await harness({ scry: S }); await h.ready();
  const c = h.D._g.cur.card, look = S.hits.filter(x => /^\/cards\/[^/]+\/[^/]+\/[a-z]+$/.test(x));
  assert.equal(c.tries, 30, '30 essais'); assert.equal(look.length, 30 * 5, '5 langues vérifiées par essai');
  assert.ok(c.l.it.fb && c.l.it.n === c.en && c.l.it.png === c.l.en.png, 'italien : image et nom anglais');
  assert.ok(!c.l.de.fb, 'la plus complète est gardée (allemand présent)');
  const it = await h.call('POST', 'api/daily/start', { tok: 'tok:luigi', body: { l: 'it', n: 'Luigi' } });
  assert.equal(it.j.fb, true, 'l\'appli sait que l\'image est anglaise (recherche aussi en anglais)');
  for (let s = 1; s < 8; s++) await h.call('POST', 'api/daily/next', { tok: 'tok:luigi', body: { k: it.j.k } });
  const m = await h.call('POST', 'api/daily/next', { tok: 'tok:luigi', body: { k: it.j.k } });
  assert.equal(m.j.mask, dlyMask(c.en, 9), 'nom anglais dévoilé');
  const fr = await h.call('POST', 'api/daily/start', { tok: 'tok:marie', body: { l: 'fr' } });
  assert.equal(fr.j.fb, false);
  const imIt = await h.call('GET', it.j.imgs.art), imEn = await h.call('GET', (await h.call('POST', 'api/daily/start', { tok: 'tok:john', body: { l: 'en' } })).j.imgs.art);
  assert.ok(imIt.raw.equals(imEn.raw), 'même image que l\'anglais');
  assert.ok(new Set(S.pngs).size <= 5, 'PNG de l\'anglais téléchargé une fois pour les deux langues');
  await h.stop(); S.stop();
  // image d'une langue qui ne se télécharge pas : repli anglais, le reste continue
  const S3 = await startDailyScry({ pngFail: new Set(['tst/17/es']) }), h3 = await harness({ scry: S3 }); await h3.ready();
  assert.ok(h3.D._g.cur.card.l.es.fb, 'espagnol : image anglaise'); assert.ok(h3.warns.some(w => /es illisible/.test(w)));
  await h3.stop(); S3.stop();
  // rien de jouable : « wait », nouvel essai plus tard
  const S4 = await startDailyScry({ cards: [{ ...SERRA, miss: ['en'] }] }), h4 = await harness({ scry: S4 }); await h4.D.tick();
  const st = await h4.call('GET', 'api/daily'); assert.equal(st.j.st, 'wait');
  assert.equal((await h4.call('POST', 'api/daily/start', { body: { l: 'fr' } })).status, 503);
  await h4.stop(); S4.stop();
});

test('partie chronométrée : le serveur tient l\'horloge (départ à l\'image de l\'étape 1, image refusée avant son heure, « Indice suivant » qui avance l\'horloge, +10 s par erreur), score à la réception, une seule partie par compte et par jour ; anti-triche', async () => {
  const h = await harness(); const st0 = await h.ready();
  noLeak(JSON.stringify(st0), SERRA, 'état du jour');
  const s1 = await h.call('POST', 'api/daily/start', { tok: 'tok:alice', body: { l: 'fr', n: 'Alice' } });
  assert.equal(s1.status, 200); assert.deepEqual([s1.j.step, s1.j.ranked, s1.j.left, s1.j.t0, s1.j.clock, s1.j.stepMs, s1.j.pen], [1, true, 6, 0, 0, 12000, 10000], 'horloge arrêtée jusqu\'au décompte'); assert.ok(!s1.j.mask && !s1.j.res);
  assert.deepEqual(Object.keys(s1.j.imgs), ['art']); noLeak(s1.raw, SERRA, 'début');
  const k = s1.j.k, img = s => h.call('GET', `api/daily/img?k=${k}&s=${s}`), view = () => h.call('GET', 'api/daily/play?k=' + k, { tok: 'tok:alice' }).then(r => r.j);
  assert.equal((await img(2)).status, 403, 'avant le départ : rien au-delà de l\'étape 1');
  h.T.now += 5000;      // le décompte 3-2-1
  const i1 = await img(1); assert.equal(i1.status, 200); assert.equal(i1.type, 'image/png'); assert.deepEqual(pngChunks(i1.raw), ['IHDR', 'IDAT', 'IEND']);
  const T0 = h.T.now; assert.equal((await view()).t0, T0, 't0 : l\'envoi de l\'image de l\'étape 1');
  const d1 = pngDecode(i1.raw); assert.equal(d1.w, 480); assert.ok(!has(d1, RED));
  h.T.now = T0 + 11999; const early = await img(2); assert.equal(early.status, 403, 'étape 2 avant 12 s : refusée'); assert.equal(early.j.at, T0 + 12000, 'et son heure');
  assert.equal((await view()).step, 1);
  h.T.now = T0 + 12000; assert.equal((await img(2)).status, 200, 'à 12 s : servie (dévoilée toute seule)'); assert.equal((await view()).step, 2);
  assert.equal((await img(4)).status, 403);
  assert.equal((await h.call('GET', `api/daily/img?k=${'x'.repeat(24)}&s=1`)).status, 404, 'clé inconnue');
  const again = await h.call('POST', 'api/daily/start', { tok: 'tok:alice', body: { l: 'de', n: 'Alice' } });
  assert.equal(again.j.k, k, 'même partie reprise'); assert.equal(again.j.step, 2); assert.equal(again.j.t0, T0, 'l\'horloge continue');
  assert.equal((await h.call('POST', 'api/daily/next', { tok: 'tok:bob', body: { k } })).status, 404, 'la partie d\'un autre compte : introuvable');
  assert.equal((await h.call('POST', 'api/daily/next', { body: { k } })).status, 404, 'sans le compte : introuvable');
  assert.equal((await h.call('GET', 'api/daily/play?k=' + k)).status, 404, 'vue d\'une partie classée : son compte seulement');
  h.T.now = T0 + 15000;
  let v = (await h.call('POST', 'api/daily/next', { tok: 'tok:alice', body: { k } })).j;
  assert.deepEqual([v.step, v.clock, v.sh], [3, 24000, 9000], '« Indice suivant » à 15 s : l\'horloge saute au début de l\'étape 3 (24 s), aucun avantage');
  assert.equal((await img(3)).status, 200, 'horloge avancée : image servie aussitôt');
  for (let st = 4; st <= 7; st++) { v = (await h.call('POST', 'api/daily/next', { tok: 'tok:alice', body: { k } })).j; assert.equal(v.step, st); noLeak(JSON.stringify(v), SERRA, 'étape ' + st); }
  assert.deepEqual(Object.keys(v.imgs).sort(), ['art', 'text', 'type']); assert.ok(v.imgs.art.endsWith('&s=5'), 'illustration nette à partir de l\'étape 5');
  for (const st of [5, 6, 7]) { const im = await img(st); const d = pngDecode(im.raw); assert.ok(!has(d, RED) && !has(d, MAGENTA), 'étape ' + st + ' : ni nom ni ligne du bas'); }
  assert.ok(has(pngDecode((await img(6)).raw), BLUE), 'étape 6 : ligne de type');
  v = (await h.call('POST', 'api/daily/next', { tok: 'tok:alice', body: { k } })).j;
  assert.deepEqual([v.step, v.clock], [8, 84000]); assert.equal(v.mask, '____ __ __rra', 'étape 8 : fin du nom (français : Ange de Serra), 20 % des lettres');
  const w1 = (await h.call('POST', 'api/daily/guess', { tok: 'tok:alice', body: { k, n: 'Guardian Angel', p: 'Ange gardien' } }));
  assert.equal(w1.j.ok, false); assert.deepEqual(w1.j.wrong, [{ n: 'Guardian Angel', p: 'Ange gardien' }]); assert.equal(w1.j.left, 5); assert.equal(w1.j.clock, 94000, 'mauvaise proposition : +10 s'); noLeak(w1.raw, SERRA, 'mauvaise proposition');
  const dup = await h.call('POST', 'api/daily/guess', { tok: 'tok:alice', body: { k, n: 'guardian ANGEL' } }); assert.equal(dup.j.dup, true); assert.equal(dup.j.left, 5); assert.equal(dup.j.clock, 94000, 'déjà proposée : ni essai ni pénalité');
  assert.equal((await h.call('POST', 'api/daily/guess', { tok: 'tok:alice', body: { k, n: '  ' } })).status, 400);
  h.T.now += 3250;
  const win = await h.call('POST', 'api/daily/guess', { tok: 'tok:alice', body: { k, n: 'serra angel', p: 'Ange de Serra' } });
  assert.equal(win.j.ok, true); assert.equal(win.j.st, 'win');
  assert.deepEqual([win.j.res.ms, win.j.res.s, win.j.res.step], [97250, dlyScore(97250), 9], 'score à la réception : horloge 97,25 s (84 + 10 de pénalité + 3,25)');
  assert.equal(win.j.res.s, 274);
  assert.deepEqual(win.j.res.card, { name: 'Ange de Serra', en: 'Serra Angel', img: 'https://cards.scryfall.io/large/front/x/tst-17-fr.jpg', set: 'Test Set TST' }, 'la carte entière, à la fin seulement');
  assert.equal(win.j.res.r, 1); assert.equal(win.j.res.total, 1);
  h.T.now += 60e3; const after = (await h.call('POST', 'api/daily/next', { tok: 'tok:alice', body: { k } })).j; assert.deepEqual([after.st, after.clock, after.res.s], ['win', 97250, 274], 'terminée : horloge figée');
  const re = await h.call('POST', 'api/daily/start', { tok: 'tok:alice', body: { l: 'fr' } }); assert.equal(re.j.res.s, win.j.res.s, 'une seule partie classée par jour');
  // Bob : décompte, image, trouvée en 5 s ; Carla : 6 mauvaises propositions (60 s de pénalité) ; Dany : abandon
  const b = (await h.call('POST', 'api/daily/start', { tok: 'tok:bob', body: { l: 'en', n: 'Bob' } })).j; await h.call('POST', 'api/daily/go', { tok: 'tok:bob', body: { k: b.k } }); h.T.now += 5e3;
  const bw = await h.call('POST', 'api/daily/guess', { tok: 'tok:bob', body: { k: b.k, n: 'Serra Angel' } }); assert.deepEqual([bw.j.res.ms, bw.j.res.s, bw.j.res.r], [5000, 966, 1], 'Bob passe devant');
  assert.equal(bw.j.res.card.img, 'https://cards.scryfall.io/large/front/x/tst-17-en.jpg');
  const c = (await h.call('POST', 'api/daily/start', { tok: 'tok:carla', body: { l: 'es', n: 'Carla' } })).j; let cl;
  for (let i = 0; i < 6; i++) { cl = await h.call('POST', 'api/daily/guess', { tok: 'tok:carla', body: { k: c.k, n: 'Wrong ' + i } }); if (i < 5) noLeak(cl.raw, SERRA, 'mauvaise ' + i); }
  assert.equal(cl.j.st, 'lost'); assert.equal(cl.j.res.s, 0); assert.equal(cl.j.res.win, false); assert.deepEqual([cl.j.res.ms, cl.j.step], [60000, 6], 'perdue à l\'étape 6 (6 × 10 s)');
  assert.equal(cl.j.res.card, undefined, 'perdue : jamais la réponse avant la carte suivante'); assert.equal(cl.j.res.reveal, Date.UTC(2026, 9, 16, 16), 'réponse à 18:00 demain'); noLeak(cl.raw, SERRA, 'perdue');
  assert.equal((await h.call('GET', `api/daily/img?k=${c.k}&s=7`)).status, 403, 'perdue : pas d\'image au-delà de l\'étape atteinte (un second compte ne gagne rien)');
  assert.equal((await h.call('GET', `api/daily/img?k=${b.k}&s=7`)).status, 200, 'trouvée : toutes les étapes visibles');
  const ab = (await h.call('POST', 'api/daily/start', { tok: 'tok:dany', body: { l: 'it' } })).j, gu = await h.call('POST', 'api/daily/giveup', { tok: 'tok:dany', body: { k: ab.k } });
  assert.deepEqual([gu.j.st, gu.j.res.s, gu.j.res.card], ['lost', 0, undefined], 'abandon : perdue, sans la réponse'); noLeak(gu.raw, SERRA, 'abandon');
  // sans compte : partie pour le plaisir, reprise par sa clé, jamais classée
  const a = (await h.call('POST', 'api/daily/start', { body: { l: 'fr', n: 'Anonyme' } })).j; assert.equal(a.ranked, false);
  assert.equal((await h.call('POST', 'api/daily/start', { body: { l: 'fr', k: a.k } })).j.k, a.k, 'reprise par la clé');
  await h.call('POST', 'api/daily/next', { body: { k: a.k } });
  const aw = await h.call('POST', 'api/daily/guess', { body: { k: a.k, n: 'Serra Angel' } }); assert.equal(aw.j.res.s, 914); assert.equal(aw.j.res.r, undefined, 'pas de place');
  const st = await h.call('GET', 'api/daily?k=' + a.k); assert.equal(st.j.me.st, 'win');
  const bd = await h.call('GET', 'api/daily/board?p=day', { tok: 'tok:alice' }), dany = 'Joueur ' + createHash('sha256').update('dany').digest('hex').slice(0, 4).toUpperCase();
  assert.deepEqual(bd.j.rows.map(r => [r.r, r.n, r.s]), [[1, 'Bob', 966], [2, 'Alice', 274], [3, dany, 0], [4, 'Carla', 0]], 'classement du jour (sans la partie sans compte), à égalité : le temps exact');
  assert.equal(bd.j.me.r, 2); assert.equal(bd.j.rows[1].me, 1); assert.ok(!JSON.stringify(bd.j).includes('tok:') && !/[0-9a-f]{64}/.test(bd.raw), 'ni compte ni empreinte');
  assert.equal((await h.call('GET', 'api/daily', { tok: 'tok:bob' })).j.me.r, 1);
  assert.equal((await h.call('GET', 'api/daily', { tok: 'expired' })).status, 401);
  assert.equal((await h.call('GET', 'api/daily/badges')).status, 401, 'badges : compte exigé');
  assert.equal((await h.call('GET', 'api/daily/nope')).status, 404); assert.equal((await h.call('GET', 'api/daily/start')).status, 405);
  await h.stop();
});

test('classements : top 100 et ma place, semaine (lundi 18:00) et saison (mois) = somme des jours, pseudo masqué par le panneau, badges, carte d\'hier terminée', async () => {
  const dir = newDir(), S = await startDailyScry({ cards: [SERRA, { ...SERRA, num: '18' }, { ...SERRA, num: '19' }] });
  const h = await harness({ dir, scry: S, at: Date.UTC(2026, 9, 18, 17) });      // dimanche 18 octobre, 19:00
  await h.ready();
  const play = async (who, steps, wrong = 0, ms = 0, name = who) => {      // horloge : (steps − 1) × 12 s sautées + 10 s par erreur + ms
    const s = (await h.call('POST', 'api/daily/start', { tok: 'tok:' + who, body: { l: 'fr', n: name } })).j; await h.call('POST', 'api/daily/go', { tok: 'tok:' + who, body: { k: s.k } });
    for (let i = 1; i < steps; i++) await h.call('POST', 'api/daily/next', { tok: 'tok:' + who, body: { k: s.k } });
    for (let i = 0; i < wrong; i++) await h.call('POST', 'api/daily/guess', { tok: 'tok:' + who, body: { k: s.k, n: 'Nope ' + i } });
    const t0 = h.T.now; h.T.now += ms; const r = await h.call('POST', 'api/daily/guess', { tok: 'tok:' + who, body: { k: s.k, n: wrong >= 6 ? 'x' : 'Serra Angel' } }); h.T.now = t0; return r.j;
  };
  for (let i = 0; i < 120; i++) await play('p' + i, 1 + (i % 10), i % 3, i * 1000);
  const top = (await h.call('GET', 'api/daily/board?p=day', { tok: 'tok:p119' })).j;
  assert.equal(top.total, 120); assert.equal(top.rows.length, 100, 'top 100'); assert.ok(top.rows.every((r, i) => r.r === i + 1 && (i === 0 || top.rows[i - 1].s >= r.s)), 'trié par score');
  assert.ok(top.me.r > 100 && top.me.n === 'p119', 'ma place, hors du top 100');
  const tie = top.rows.filter(r => r.s === top.rows[0].s); assert.deepEqual(tie.map(r => r.n), ['p0', 'p30', 'p60', 'p90'].filter(n => tie.some(r => r.n === n)), 'à égalité : le plus rapide');
  // admin : masquer un pseudo
  const adm = (await h.call('GET', 'api/admin/daily')).j; assert.equal(adm.day, '2026-10-18'); assert.equal(adm.done, 120); assert.equal(adm.card.en, 'Serra Angel', 'le panneau voit la réponse');
  const id = adm.rows.find(r => r.n === 'p0').id; assert.ok(/^[\w-]{12}$/.test(id));
  const hid = await h.call('POST', 'api/admin/daily/hide', { body: { id, on: true } }); assert.equal(hid.j.hidden, 1); assert.equal(hid.j.rows.find(r => r.id === id).x, 1);
  const masked = (await h.call('GET', 'api/daily/board?p=day')).j.rows[0]; assert.deepEqual([masked.n, masked.x], ['', 1], 'pseudo masqué, score gardé');
  assert.equal((await h.call('POST', 'api/admin/daily/hide', { body: { id: 'inconnu' } })).status, 404);
  // alice joue dimanche (étape 2 : 914, 2e derrière p0), puis lundi 19 octobre (nouvelle carte, nouvelle semaine) ; bob lundi seulement
  const alice = await play('alice', 2, 0, 0, 'Alice'); assert.equal(alice.res.s, 914); assert.equal(alice.res.r, 2);
  const old = alice.k; h.T.now = Date.UTC(2026, 9, 19, 16, 1);      // lundi 18:01 à Paris
  await h.ready(); assert.equal(h.D._g.cur.day, '2026-10-19');
  const ov = await h.call('POST', 'api/daily/next', { tok: 'tok:alice', body: { k: old } }); assert.equal(ov.status, 410); assert.equal(ov.j.error, 'over'); assert.equal(ov.j.card.name, 'Ange de Serra', 'carte d\'hier terminée : la réponse');
  assert.equal((await h.call('GET', 'api/daily?l=de')).j.prev.name, 'Serra-Engel', 'nouvelle carte : la réponse d\'hier, dans la langue');
  const a2 = await play('alice', 1, 0, 0, 'Alice'); assert.equal(a2.res.s, 1000);
  const bob = await play('bob', 2, 0, 0, 'Bob'); assert.equal(bob.res.s, 914);
  const wk = (await h.call('GET', 'api/daily/board?p=week', { tok: 'tok:alice' })).j;
  assert.equal(wk.key, '2026-10-19'); assert.deepEqual(wk.rows.map(r => [r.n, r.s, r.d]), [['Alice', 1000, 1], ['Bob', 914, 1]], 'semaine du lundi : le dimanche n\'en fait pas partie');
  assert.equal(wk.from, Date.UTC(2026, 9, 19, 16)); assert.equal(wk.to, Date.UTC(2026, 9, 26, 17), 'jusqu\'au lundi suivant 18:00 (heure d\'hiver)');
  const se = (await h.call('GET', 'api/daily/board?p=season', { tok: 'tok:alice' })).j;
  assert.equal(se.key, '2026-10'); assert.equal(se.rows[0].n, 'Alice'); assert.equal(se.rows[0].s, 1914); assert.equal(se.rows[0].d, 2); assert.equal(se.me.r, 1, 'saison : somme des jours du mois');
  assert.equal(se.total, 122); assert.equal(se.to, Date.UTC(2026, 10, 1, 17));
  // badges du jour clos (18 octobre) : p0 premier (pseudo masqué ou non), top 100, podium ; alice : 2e (top 100, podium), série de 2 jours, points
  const bp0 = Object.fromEntries((await h.call('GET', 'api/daily/badges', { tok: 'tok:p0' })).j.badges.map(b => [b.id, b]));
  assert.deepEqual(Object.keys(bp0), ['played', 'streak', 'top100', 'podium', 'first', 'stage1', 'points'], 'identifiants stables');
  assert.deepEqual([bp0.played.n, bp0.top100.n, bp0.podium.n, bp0.first.n, bp0.stage1.n, bp0.points.n], [1, 1, 1, 1, 1, 1000]);
  assert.equal(bp0.first.at, Date.UTC(2026, 9, 18, 16), 'date du jour gagné');
  const bal = Object.fromEntries((await h.call('GET', 'api/daily/badges', { tok: 'tok:alice' })).j.badges.map(b => [b.id, b]));
  assert.deepEqual([bal.played.n, bal.streak.n, bal.streak.cur, bal.points.n, bal.stage1.n, bal.top100.n, bal.podium.n, bal.first.n], [2, 2, 2, 1914, 1, 1, 1, 0]);
  const bnone = (await h.call('GET', 'api/daily/badges', { tok: 'tok:nobody' })).j.badges; assert.ok(bnone.every(b => b.n === 0 && b.at === 0), 'compte sans partie : zéros');
  // mercredi : alice saute mardi → série en cours remise à 1, meilleure série gardée
  h.T.now = Date.UTC(2026, 9, 21, 17); await h.ready(); await play('alice', 3, 0, 0, 'Alice');
  const b3 = Object.fromEntries((await h.call('GET', 'api/daily/badges', { tok: 'tok:alice' })).j.badges.map(b => [b.id, b]));
  assert.deepEqual([b3.played.n, b3.streak.n, b3.streak.cur, b3.points.n], [3, 2, 1, 1914 + 824]);
  await h.D.flush(); await h.stop();
  // relecture du disque (redémarrage) : parties, clés, images et masques gardés, aucun PNG retéléchargé
  const before = S.pngs.length, h2 = await harness({ dir, scry: S, at: Date.UTC(2026, 9, 21, 18) }); await h2.ready();
  assert.equal(S.pngs.length, before, 'images relues du disque');
  const again = await h2.call('POST', 'api/daily/start', { tok: 'tok:alice', body: { l: 'fr' } }); assert.equal(again.j.st, 'win'); assert.equal(again.j.res.s, 824);
  assert.equal((await h2.call('GET', 'api/daily/board?p=season')).j.rows.find(r => r.x === 1).s, 1000, 'masque relu');
  // purge : jours de plus de 400 jours et images de plus de 2 jours effacés
  writeFileSync(join(dir, '2025-09-01.json'), JSON.stringify({ v: 1, day: '2025-09-01', plays: {}, closed: true })); writeFileSync(join(dir, '2025-10-01.json'), JSON.stringify({ v: 1, day: '2025-10-01', plays: {}, closed: true }));
  h2.T.now = Date.UTC(2026, 9, 22, 17); await h2.ready();
  assert.ok(!existsSync(join(dir, '2025-09-01.json')), 'plus de 400 jours : effacé'); assert.ok(existsSync(join(dir, '2025-10-01.json')), '386 jours : gardé');
  assert.ok(!existsSync(join(dir, 'img', '2026-10-18')) && existsSync(join(dir, 'img', '2026-10-21')), 'images de plus de 2 jours effacées');
  await h2.stop(); S.stop();
});

test('préparation d\'avance : la carte du lendemain est prête avant 18:00, servie à l\'heure pile', async () => {
  const h = await harness({ at: Date.UTC(2026, 9, 15, 15, 30) });      // 17:30 à Paris : carte du 14
  await h.ready(); assert.equal(h.D._g.cur.day, '2026-10-14');
  await h.D.tick(); assert.equal(h.D._g.next && h.D._g.next.day, '2026-10-15'); assert.equal(h.D._g.next.st, 'ready', 'demain préparé 30 min avant');
  const pngs = h.S.pngs.length; h.T.now = Date.UTC(2026, 9, 15, 16, 0, 0);
  const st = (await h.call('GET', 'api/daily')).j; assert.deepEqual([st.day, st.st], ['2026-10-15', 'ready'], '18:00 pile : prête'); assert.equal(h.S.pngs.length, pngs, 'rien à télécharger à l\'heure');
  assert.equal(st.next, Date.UTC(2026, 9, 16, 16)); assert.equal(st.no, 1);
  await h.stop();
});

/* ── Le vrai serveur ───────────────────────────────────────────────────────────────────────────────────────────────── */
async function proxyUp(port, env) {
  const p = spawn('node', ['proxy.mjs'], { env: { ...process.env, PORT: String(port), EDH_SOURCE_URL: '', PRICES_SOURCE_URL: '', DAILY: '1', DAILY_FIRST_MS: '0', DAILY_GAP_MS: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
  process.on('exit', () => { try { p.kill(); } catch { /* ignore */ } });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/__ping`)).ok) break; } catch { /* pas encore */ } await new Promise(r => setTimeout(r, 100)); }
  return { p, out: () => out, url: `http://127.0.0.1:${port}/` };
}
test('proxy.mjs : /__ping daily, jetons Firebase vérifiés, DAILY=0, panneau /admin réservé', async () => {
  const F = await startFakes(), S = await startDailyScry(), dir = newDir();
  const P = await proxyUp(19700, { SCRYFALL_UPSTREAM: S.url, FIREBASE_JWKS_URL: F.env.FIREBASE_JWKS_URL, DAILY_DIR: dir, DAILY_SECRET: 'abc' });
  assert.equal((await (await fetch(P.url + '__ping')).json()).daily, true);
  let st; for (let i = 0; i < 150; i++) { st = await (await fetch(P.url + 'api/daily')).json(); if (st.st === 'ready') break; await new Promise(r => setTimeout(r, 200)); }
  assert.equal(st.st, 'ready', 'carte du jour prête : ' + P.out());
  const H = t => ({ 'Content-Type': 'application/json', ...(t ? { 'x-firebase-token': t } : {}) });
  const r = await fetch(P.url + 'api/daily/start', { method: 'POST', headers: H(F.jwt('uid-zoe')), body: JSON.stringify({ l: 'de', n: 'Zoé' }) }), j = await r.json(), raw = JSON.stringify(j);
  assert.equal(r.status, 200, raw); assert.equal(j.acct, true); noLeak(raw, SERRA, 'proxy');
  assert.deepEqual([j.ranked, j.why, j.minAge], [false, 'age', 7], 'sans compte de service : date de création inconnue, le compte vient d\'être vu → pas encore au classement');
  assert.ok(typeof j.dev === 'string' && /^[\w-]{22}\.[\w-]{16}$/.test(j.dev), 'jeton d\'appareil remis à l\'appli');
  assert.equal(r.headers.get('cache-control'), 'no-store'); assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  const im = await fetch(P.url + j.imgs.art); assert.equal(im.headers.get('content-type'), 'image/png'); assert.deepEqual(pngChunks(Buffer.from(await im.arrayBuffer())), ['IHDR', 'IDAT', 'IEND']);
  assert.equal((await fetch(P.url + 'api/daily/start', { method: 'POST', headers: H('a.b.c'), body: '{}' })).status, 401, 'jeton falsifié');
  assert.equal((await fetch(P.url + 'api/daily/start', { method: 'POST', headers: H(F.jwt('uid-zoe', -10)), body: '{}' })).status, 401, 'jeton expiré');
  const w = await (await fetch(P.url + 'api/daily/guess', { method: 'POST', headers: H(F.jwt('uid-zoe')), body: JSON.stringify({ k: j.k, n: 'Serra Angel' }) })).json();
  assert.equal(w.res.card.name, 'Serra-Engel'); assert.equal(w.res.s, dlyScore(w.res.ms), 'score continu à l\'horloge du serveur');
  assert.equal((await fetch(P.url + 'api/admin/daily', { headers: H(F.jwt('uid-zoe')) })).status, 403, 'panneau : compte de l\'éditeur seulement');
  const lv = await (await fetch(P.url + 'api/level', { method: 'POST', headers: H(F.jwt('uid-zoe')), body: JSON.stringify({ xp: 123456, n: 'Zoé' }) })).json();
  assert.deepEqual([lv.xp, lv.lv, lv.capped, lv.r], [50000, require('../src/progress.js').prgLevel(50000).lv, true, 1], '/api/level : premier envoi borné, niveau de progress.js');
  assert.ok(existsSync(join(dir, '.secret')) === false, 'DAILY_SECRET fourni : aucun secret écrit');
  assert.ok(readdirSync(join(dir, 'img')).length === 1, 'images dans DAILY_DIR/img/<jour>');
  P.p.kill();
  const Q = await proxyUp(19701, { DAILY: '0', DAILY_DIR: newDir() });
  assert.equal((await (await fetch(Q.url + '__ping')).json()).daily, false);
  assert.equal((await fetch(Q.url + 'api/daily')).status, 404); assert.equal((await fetch(Q.url + 'api/daily/start', { method: 'POST', headers: H(), body: '{}' })).status, 404);
  Q.p.kill(); S.stop(); F.stop();
});

test('src/daily.js : chaque texte visible a sa traduction (en.daily.json), clés de pluriel distinctes', () => {
  const src = readFileSync('src/daily.js', 'utf8'), en = JSON.parse(readFileSync('src/i18n/en.daily.json', 'utf8')), keys = new Set();
  const all = Object.assign({}, ...readdirSync('src/i18n').filter(f => /^en(\.[a-z0-9-]+)?\.json$/.test(f)).map(f => JSON.parse(readFileSync('src/i18n/' + f, 'utf8'))));
  const lit = /'((?:[^'\\]|\\.)*)'/y;
  for (const m of src.matchAll(/\bTN?\(/g)) {
    let i = m.index + m[0].length; const isN = m[0].startsWith('TN');
    if (isN) { const c = src.indexOf(',', i); if (c < 0) continue; i = c + 1; }
    for (let n = 0; n < (isN ? 2 : 1); n++) { while (src[i] === ' ') i++; lit.lastIndex = i; const x = lit.exec(src); if (!x) break; keys.add(x[1].replace(/\\'/g, '\'')); i = lit.lastIndex; while (src[i] === ' ' || src[i] === ',') i++; }
  }
  assert.ok(keys.size > 40, 'textes trouvés : ' + keys.size);
  const known = k => k in all;
  assert.deepEqual([...keys].filter(k => !known(k)), [], 'textes sans traduction anglaise');
  for (const m of src.matchAll(/TN\([^,]+,\s*'((?:[^'\\]|\\.)*)',\s*'((?:[^'\\]|\\.)*)'/g)) assert.notEqual(m[1], m[2], 'pluriel distinct du singulier : ' + m[1]);
  for (const l of ['de', 'es', 'it', 'pt']) assert.deepEqual(Object.keys(JSON.parse(readFileSync(`src/i18n/${l}.daily.json`, 'utf8'))).sort(), Object.keys(en).sort(), l + ' : mêmes clés');
});

test('anti-triche : un appareil = un compte classé par jour (sinon entraînement), partie sans compte avancée sur l\'appareil, jeton d\'appareil falsifié', async () => {
  const h = await harness(); await h.ready();
  const st = await h.call('GET', 'api/daily'), D1 = st.j.dev; assert.ok(/^[\w-]{22}\.[\w-]{16}$/.test(D1), 'jeton d\'appareil signé');
  assert.equal((await h.call('GET', 'api/daily', { dev: D1 })).j.dev, undefined, 'jeton valable : pas renouvelé');
  const a = (await h.call('POST', 'api/daily/start', { tok: 'tok:anna', dev: D1, body: { l: 'fr', n: 'Anna' } })).j; assert.deepEqual([a.ranked, a.why], [true, '']);
  const b = (await h.call('POST', 'api/daily/start', { tok: 'tok:boris', dev: D1, body: { l: 'fr', n: 'Boris' } })).j;
  assert.deepEqual([b.acct, b.ranked, b.why], [true, false, 'device'], 'même appareil, autre compte : entraînement');
  const bw = (await h.call('POST', 'api/daily/guess', { tok: 'tok:boris', dev: D1, body: { k: b.k, n: 'Serra Angel' } })).j; assert.equal(bw.res.s, 1000); assert.equal(bw.res.r, undefined, 'pas de place');
  assert.equal((await h.call('POST', 'api/daily/start', { tok: 'tok:anna', dev: D1, body: { l: 'fr' } })).j.ranked, true, 'le premier compte de l\'appareil reste classé');
  const bb = Object.fromEntries((await h.call('GET', 'api/daily/badges', { tok: 'tok:boris' })).j.badges.map(x => [x.id, x.n])); assert.deepEqual([bb.played, bb.points, bb.stage1], [0, 0, 0], 'entraînement : aucun badge');
  assert.ok(!(await h.call('GET', 'api/daily/board?p=day')).j.rows.some(r => r.n === 'Boris'), 'entraînement : jamais au classement');
  // sans compte d'abord : au-delà de l'étape 1, l'appareil a « vu » la carte
  const D2 = (await h.call('GET', 'api/daily')).j.dev, an = (await h.call('POST', 'api/daily/start', { dev: D2, body: { l: 'fr' } })).j; await h.call('POST', 'api/daily/next', { dev: D2, body: { k: an.k } });
  assert.equal((await h.call('POST', 'api/daily/start', { tok: 'tok:carl', dev: D2, body: { l: 'fr' } })).j.why, 'device', 'partie sans compte avancée sur cet appareil : le compte joue pour l\'entraînement');
  const D3 = (await h.call('GET', 'api/daily')).j.dev; await h.call('POST', 'api/daily/start', { dev: D3, body: { l: 'fr' } });
  assert.equal((await h.call('POST', 'api/daily/start', { tok: 'tok:dora', dev: D3, body: { l: 'fr' } })).j.ranked, true, 'sans compte resté à l\'étape 1 (« Se connecter » tout de suite) : classé');
  const fake = D1.slice(0, 23) + 'A'.repeat(16), f = await h.call('POST', 'api/daily/start', { tok: 'tok:eve', dev: fake, body: { l: 'fr' } });
  assert.ok(f.j.dev && f.j.dev !== fake, 'jeton falsifié : ignoré, un nouveau est remis'); assert.equal(f.j.ranked, true);
  await h.stop();
});

test('anti-triche : même réseau, un autre compte trouve juste après → « à vérifier » (hors du top 100 public et de son badge, sans le lui dire), « Valider » au panneau ; empreintes effacées en fin de journée', async () => {
  const dir = newDir(), h = await harness({ dir }); await h.ready();
  const T0 = h.T.now, N = '203.0.113.7', play = async (tok, net, steps, at) => {
    h.T.now = at; const s = (await h.call('POST', 'api/daily/start', { tok, net, body: { l: 'fr', n: tok.slice(4) } })).j; await h.call('GET', s.imgs.art, { net });      // l'image de l'étape 1 lance l'horloge
    for (let i = 1; i < steps; i++) { const v = (await h.call('POST', 'api/daily/next', { tok, net, body: { k: s.k } })).j; const u = v.step <= 5 ? v.imgs.art : v.imgs[v.step === 6 ? 'type' : 'text']; if (v.step <= 7) await h.call('GET', u, { net }); }      // comme l'appli : l'image de chaque étape
    return { s, win: async t => { h.T.now = t; return (await h.call('POST', 'api/daily/guess', { tok, net, body: { k: s.k, n: 'Serra Angel' } })).j; } };
  };
  const A = await play('tok:ana', N, 3, T0); const aw = await A.win(T0 + 60e3); assert.equal(aw.res.r, 1);
  const B = await play('tok:ben', N, 1, T0 + 230e3); const bw = await B.win(T0 + 4 * 60e3);      // 3 min après la fin de A, trouvée en 10 s
  assert.equal(bw.res.s, dlyScore(10e3), 'B voit son score normalement'); assert.equal(bw.res.r, 1, 'et sa place, comme si de rien n\'était');
  const pubBd = (await h.call('GET', 'api/daily/board?p=day', { tok: 'tok:ana' })).j; assert.deepEqual(pubBd.rows.map(r => r.n), ['ana'], 'top 100 public : sans B'); assert.equal(pubBd.total, 1);
  const bBd = (await h.call('GET', 'api/daily/board?p=day', { tok: 'tok:ben' })).j; assert.deepEqual(bBd.rows.map(r => [r.n, r.me]), [['ben', 1], ['ana', undefined]], 'B se voit à sa place');
  const C = await play('tok:cid', N, 1, T0 + 2 * 60e3); assert.equal((await C.win(T0 + 15 * 60e3)).res.s > 0, true);      // 11 min après B, 14 après A
  const Dn = await play('tok:dan', '198.51.100.9', 1, T0 + 2 * 60e3); await Dn.win(T0 + 5 * 60e3);      // autre réseau
  // E a vu l'étape 5 sans finir ; F trouve à l'étape 3 (≤ 5) 5 min plus tard → à vérifier ; G trouve à l'étape 6 (> 5) → rien
  const N2 = '192.0.2.44'; await play('tok:eli', N2, 5, T0 + 20 * 60e3);
  const F = await play('tok:fay', N2, 3, T0 + 24.5 * 60e3); await F.win(T0 + 24.5 * 60e3);      // étape 3, 4 min 30 après la dernière image de eli
  const Gp = await play('tok:gus', N2, 6, T0 + 36 * 60e3); await Gp.win(T0 + 36 * 60e3);      // étape 6, 11 min 30 après F
  const names = (await h.call('GET', 'api/daily/board?p=day')).j.rows.map(r => r.n).sort();
  assert.deepEqual(names, ['ana', 'cid', 'dan', 'gus'], 'ben et fay exclus en silence ; cid (plus de 10 min), dan (autre réseau), gus (plus d\'étapes que eli) : classés');
  const adm = (await h.call('GET', 'api/admin/daily')).j;
  assert.deepEqual(adm.chk.map(x => [x.n, x.by, x.step]).sort(), [['ben', 'win', 1], ['fay', 'step', 3]], 'le panneau liste les parties à vérifier');
  assert.ok(!JSON.stringify(adm).includes(N) && !JSON.stringify(adm).includes('203.0.113'), 'jamais l\'adresse');
  const rawDay = readFileSync(join(dir, '2026-10-15.json'), 'utf8'); await h.D.flush();
  assert.ok(!(await import('node:fs')).readFileSync(join(dir, '2026-10-15.json'), 'utf8').includes(N), 'adresse jamais écrite, seulement son empreinte du jour'); void rawDay;
  // fin de journée : badges (B exclu du top 100), empreintes effacées ; puis « Valider » B (même box) : top 100 recompté
  h.T.now = Date.UTC(2026, 9, 16, 17); await h.ready();
  const disk = JSON.parse(readFileSync(join(dir, '2026-10-15.json'), 'utf8'));
  assert.equal(disk.salt, undefined); assert.equal(disk.devs, undefined); assert.ok(Object.values(disk.plays).every(p => p.ip === undefined && p.dh === undefined), 'empreintes du réseau et des appareils effacées avec la journée');
  const top = tok => h.call('GET', 'api/daily/badges', { tok }).then(r => Object.fromEntries(r.j.badges.map(x => [x.id, x.n])));
  assert.deepEqual([(await top('tok:ana')).top100, (await top('tok:ben')).top100, (await top('tok:ben')).stage1], [1, 0, 1], 'B : pas de badge top 100 (badges perso gardés)');
  const ben = (await h.call('GET', 'api/admin/daily')).j.chk.find(x => x.n === 'ben');
  const ok = await h.call('POST', 'api/admin/daily/ok', { body: { id: ben.id } }); assert.equal(ok.status, 200); assert.ok(!ok.j.chk.some(x => x.n === 'ben'));
  assert.equal((await top('tok:ben')).top100, 1, 'validée : top 100 recompté pour le jour clos');
  assert.ok((await h.call('GET', 'api/daily/board?p=week')).j.rows.some(r => r.n === 'ben'), 'validée : de retour au classement');
  await h.stop();
});

test('anti-triche : classement réservé aux comptes de plus de 7 jours, Google ou adresse vérifiée (la partie compte pour les badges)', async () => {
  const h = await harness(); await h.ready();
  const nw = (await h.call('POST', 'api/daily/start', { tok: 'tok:newbie', body: { l: 'fr', n: 'Novice' } })).j;
  assert.deepEqual([nw.acct, nw.ranked, nw.why, nw.minAge], [true, false, 'age', 7], 'compte de 2 jours');
  const w = (await h.call('POST', 'api/daily/guess', { tok: 'tok:newbie', body: { k: nw.k, n: 'Serra Angel' } })).j; assert.equal(w.res.s, 1000); assert.equal(w.res.r, undefined);
  assert.deepEqual(Object.fromEntries((await h.call('GET', 'api/daily/badges', { tok: 'tok:newbie' })).j.badges.map(x => [x.id, x.n])).points, 1000, 'compte pour ses badges');
  assert.equal((await h.call('POST', 'api/daily/start', { tok: 'tok:nover-x', body: { l: 'fr' } })).j.why, 'age', 'adresse non vérifiée');
  assert.equal((await h.call('POST', 'api/daily/start', { tok: 'tok:nodate-y', body: { l: 'fr' } })).j.why, 'age', 'date inconnue : vu pour la première fois aujourd\'hui');
  assert.equal((await h.call('GET', 'api/daily/board?p=day')).j.total, 0, 'personne au classement');
  await h.stop();
  // la même date « vue pour la première fois » 8 jours plus tard : classé
  const dir = newDir(), h2 = await harness({ dir }); await h2.ready(); await h2.call('GET', 'api/daily', { tok: 'tok:nodate-z' }); await h2.D.flush(); await h2.stop();
  const h3 = await harness({ dir, at: Date.UTC(2026, 9, 23, 17) }); await h3.ready();
  assert.equal((await h3.call('POST', 'api/daily/start', { tok: 'tok:nodate-z', body: { l: 'fr' } })).j.ranked, true, '8 jours après la première visite');
  await h3.stop();
  const h4 = await harness({ opts: { minAgeDays: 0 } }); await h4.ready();
  assert.equal((await h4.call('POST', 'api/daily/start', { tok: 'tok:newbie', body: { l: 'fr' } })).j.ranked, true, 'DAILY_MIN_AGE_DAYS=0 : tout compte vérifié');
  assert.equal((await h4.call('POST', 'api/daily/start', { tok: 'tok:nover-q', body: { l: 'fr' } })).j.ranked, false, 'adresse non vérifiée : jamais');
  await h4.stop();
});

test('anti-triche : soupçon statistique (trop souvent trouvée à l\'étape 1) signalé au panneau, jamais exclu', async () => {
  const S = await startDailyScry({ cards: [SERRA, { ...SERRA, num: '18' }] }), dir = newDir();
  for (let d = 0; d < 7; d++) {
    const h = await harness({ dir, scry: S, at: Date.UTC(2026, 9, 15 + d, 17) }); await h.ready();
    for (let i = 0; i < 6; i++) { const s = (await h.call('POST', 'api/daily/start', { tok: 'tok:pl' + i, body: { l: 'en', n: 'pl' + i } })).j; for (let k = 1; k < 4; k++) await h.call('POST', 'api/daily/next', { tok: 'tok:pl' + i, body: { k: s.k } }); await h.call('POST', 'api/daily/guess', { tok: 'tok:pl' + i, body: { k: s.k, n: 'Serra Angel' } }); }
    if (d !== 3) { const s = (await h.call('POST', 'api/daily/start', { tok: 'tok:ace', body: { l: 'en', n: 'Ace' } })).j; await h.call('POST', 'api/daily/guess', { tok: 'tok:ace', body: { k: s.k, n: 'Serra Angel' } }); }
    if (d === 6) {
      const adm = (await h.call('GET', 'api/admin/daily')).j; assert.deepEqual(adm.sus.map(x => [x.n, x.c, x.of]), [['Ace', 6, 6]], 'Ace : 6 fois à l\'étape 1 sur 6');
      assert.ok((await h.call('GET', 'api/daily/board?p=day')).j.rows.some(r => r.n === 'Ace'), 'pas exclu');
      const v = await h.call('POST', 'api/admin/daily/ok', { body: { id: adm.sus[0].id } }); assert.deepEqual(v.j.sus, [], 'validé');
    }
    await h.D.flush(); await h.stop();
  }
  S.stop();
});

test('signaler un pseudo : une fois par personne (compte ou appareil), pas le sien, 3 personnes → masqué en attendant le panneau, « Rétablir » efface les signalements, 20 par jour', async () => {
  const h = await harness(); await h.ready();
  const play = async (tok, n) => { const s = (await h.call('POST', 'api/daily/start', { tok, body: { l: 'en', n } })).j; await h.call('POST', 'api/daily/guess', { tok, body: { k: s.k, n: 'Serra Angel' } }); };
  await play('tok:bad', 'Grossier'); await play('tok:ann', 'Ann'); await play('tok:bob', 'Bob');
  const rowOf = async n => (await h.call('GET', 'api/daily/board?p=day')).j.rows.find(r => r.n === n || (r.x && n === null));
  const g = await rowOf('Grossier'); assert.match(g.id, /^[\w-]{12}$/, 'identifiant public de la ligne');
  const rp = (o, id = g.id) => h.call('POST', 'api/daily/report', { ...o, body: { id } });
  assert.equal((await rp({ tok: 'tok:bad' })).j.error, 'self', 'pas son propre pseudo');
  assert.equal((await rp({ tok: 'tok:ann' }, 'xxxxxxxxxxxx')).status, 404);
  assert.deepEqual((await rp({ tok: 'tok:ann' })).j, { ok: true, hid: false }); assert.deepEqual((await rp({ tok: 'tok:ann' })).j, { ok: true, dup: true }, 'une fois par personne');
  const nodev = await rp({}); assert.equal(nodev.j.error, 'device', 'sans compte ni appareil : refusé'); assert.ok(nodev.j.dev, 'jeton d\'appareil remis');
  assert.deepEqual((await rp({ dev: nodev.j.dev })).j, { ok: true, hid: false }, 'sans compte : par l\'appareil');
  assert.deepEqual((await rp({ tok: 'tok:bob' })).j, { ok: true, hid: true }, '3 personnes : masqué');
  const masked = (await h.call('GET', 'api/daily/board?p=day')).j.rows.find(r => r.id === g.id); assert.deepEqual([masked.n, masked.x], ['', 1], 'pseudo masqué, score gardé');
  let adm = (await h.call('GET', 'api/admin/daily')).j; assert.deepEqual(adm.reports.map(r => [r.n, r.k, r.hid]), [['Grossier', 3, true]]); assert.equal(adm.repHide, 3);
  adm = (await h.call('POST', 'api/admin/daily/hide', { body: { id: adm.reports[0].id, on: false } })).j; assert.deepEqual(adm.reports, [], 'rétabli : signalements effacés');
  assert.equal((await rowOf('Grossier')).x, undefined, 'pseudo rétabli');
  await rp({ tok: 'tok:ann' }); adm = (await h.call('GET', 'api/admin/daily')).j; assert.equal(adm.reports[0].k, 1, 'compté de nouveau après la décision');
  adm = (await h.call('POST', 'api/admin/daily/report', { body: { id: adm.reports[0].id } })).j; assert.deepEqual(adm.reports, [], 'ignorer');
  let last; for (let i = 0; i < 20; i++) last = await rp({ tok: 'tok:zoe' }); assert.equal(last.status, 200); assert.equal((await rp({ tok: 'tok:zoe' })).status, 429, '20 signalements par jour au plus');
  const lv = await h.call('POST', 'api/level', { tok: 'tok:bad', body: { xp: 500, n: 'Grossier' } }); assert.equal(lv.status, 200);
  const lb = (await h.call('GET', 'api/level/board')).j.rows[0]; assert.equal(lb.id, g.id, 'même identifiant dans le classement des niveaux');
  await h.D.flush(); await h.stop();
});

test('classement des niveaux : premier envoi borné à 50 000 XP, puis 20 000 XP par jour au plus (cumulables sur 7 jours), jamais en baisse ; top 100, ma place, pseudo masqué', async () => {
  const dir = newDir(), h = await harness({ dir }); await h.ready();
  const lvOf = require('../src/progress.js').prgLevel, post = (tok, xp, n) => h.call('POST', 'api/level', { tok, body: { xp, ...(n ? { n } : {}) } }).then(r => r.j);
  assert.equal((await h.call('POST', 'api/level', { body: { xp: 10 } })).status, 401, 'compte exigé');
  assert.equal((await h.call('POST', 'api/level', { tok: 'tok:lea', body: { xp: -5 } })).status, 400);
  let r = await post('tok:lea', 9e6, 'Léa'); assert.deepEqual([r.xp, r.sent, r.capped, r.lv], [50000, 9e6, true, lvOf(50000).lv], 'premier envoi : l\'historique, 50 000 XP au plus');
  r = await post('tok:lea', 9e6); assert.equal(r.xp, 50000, 'aussitôt après : rien de plus');
  h.T.now += 12 * 3600e3; r = await post('tok:lea', 9e6); assert.equal(r.xp, 60000, 'une demi-journée : +10 000');
  h.T.now += 3 * 86400e3; r = await post('tok:lea', 9e6); assert.equal(r.xp, 120000, '3 jours sans envoi : +60 000 (cumulés)');
  h.T.now += 30 * 86400e3; r = await post('tok:lea', 9e6); assert.equal(r.xp, 260000, '30 jours : 7 jours au plus (+140 000)');
  r = await post('tok:lea', 100); assert.equal(r.xp, 260000, 'jamais en baisse');
  h.T.now += 3600e3; r = await post('tok:lea', 260500); assert.deepEqual([r.xp, r.capped], [260500, false], 'joueur honnête : sa vraie XP');
  assert.ok(r.lv < 999, 'pas de saut au niveau 999');
  await post('tok:max', 1200, 'Max'); await post('tok:zed', 49000, 'Zed'); h.T.now += 1000; await post('tok:amy', 49000, 'Amy');
  const bd = (await h.call('GET', 'api/level/board', { tok: 'tok:max' })).j;
  assert.deepEqual(bd.rows.map(x => [x.r, x.n, x.lv, x.xp]), [[1, 'Léa', lvOf(260500).lv, 260500], [2, 'Zed', lvOf(49000).lv, 49000], [3, 'Amy', lvOf(49000).lv, 49000], [4, 'Max', lvOf(1200).lv, 1200]], 'XP retenue, niveau ; à égalité : arrivé le premier');
  assert.deepEqual([bd.total, bd.me.r, bd.rows[3].me], [4, 4, 1]);
  const id = (await h.call('GET', 'api/admin/daily')).j.rows.find(x => x.n === 'Zed').id;
  await h.call('POST', 'api/admin/daily/hide', { body: { id, on: true } });
  assert.deepEqual((await h.call('GET', 'api/level/board')).j.rows[1], { r: 2, n: '', lv: lvOf(49000).lv, xp: 49000, x: 1 }, 'pseudo masqué par le panneau, comme pour le jeu');
  await h.D.flush(); assert.ok(JSON.parse(readFileSync(join(dir, 'levels.json'), 'utf8')).p, 'gardé dans levels.json'); assert.ok(!readFileSync(join(dir, 'levels.json'), 'utf8').includes('tok:'));
  await h.stop();
});
