#!/usr/bin/env node
// REJEU DES SCANS SIGNALÉS (outil d'enquête, pas un test) : chaque photo récupérée par tools/scan-reports.mjs repasse dans le vrai scan de l'appli (Chromium, code
// actuel du dépôt, vrais catalogues de pwa/, vrai Scryfall lu par Node avec cache disque : tools/real-world.mjs), avec le cadrage et les réglages du signalement.
// Moteur : Tesseract (navigateur) ; l'appli Android lit avec ML Kit : les textes lus peuvent différer un peu, la suite (catalogues, ligne du bas, décisions) est la même.
//   node tools/scan-replay.mjs [dossier] [--ids id1,id2] [--expect id=Nom anglais[|set|numéro]]…
//   dossier : défaut .data/scan-pull ; <dossier>/expect.json (facultatif) : { "<id>": "Nom anglais" | { "name", "set", "num" } } : la bonne carte, pour ✓ / ✗.
// Affiche, pour chaque photo : avant (ce que l'appli avait retenu) → maintenant (carte, langue, édition, à vérifier, cartes proposées, texte lu, ligne du bas).
// Réseau : api.scryfall.com, cards.scryfall.io, cdn.jsdelivr.net (Tesseract, si tests/node_modules ne l'a pas).
import { existsSync, readFileSync, readdirSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const CA = '/root/.ccr/ca-bundle.crt';
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {      // session cloud : Node passe par le proxy de la session
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', ...(existsSync(CA) && !process.env.NODE_EXTRA_CA_CERTS ? { NODE_EXTRA_CA_CERTS: CA } : {}) } });
  process.exit(r.status ?? 1);
}
const { chromium, startWorld, newPage } = await import('./real-world.mjs');

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const DIR = args[0] && !args[0].startsWith('--') ? args[0] : '.data/scan-pull';
const want = existsSync(join(DIR, 'expect.json')) ? JSON.parse(readFileSync(join(DIR, 'expect.json'), 'utf8')) : {};
args.forEach((a, i) => { if (a === '--expect' && args[i + 1]) { const [id, v] = args[i + 1].split(/=(.*)/s); const [name, set, num] = v.split('|'); want[id] = { name, set, num }; } });
const only = arg('ids', '') ? arg('ids', '').split(',') : null;
const ids = readdirSync(DIR).filter(f => /^[0-9a-z]{8,10}-[0-9a-f]{8}\.json$/.test(f)).map(f => f.slice(0, -5)).filter(id => existsSync(join(DIR, id + '.jpg')) && (!only || only.includes(id))).sort();
if (!ids.length) { console.log('Aucun signalement dans ' + DIR + ' (node tools/scan-reports.mjs d\'abord).'); process.exit(0); }

for (const f of readdirSync('pwa')) if (/^(fr-names|names-[a-z-]+)\.tsv$/.test(f)) copyFileSync('pwa/' + f, process.env.PWA_DIR + '/' + f);      // vrais catalogues des noms
const TESS = new URL('../tests/node_modules', import.meta.url).pathname;
const world = await startWorld({ port: 19985 });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const init = `try { localStorage.setItem('deckdeal:onboard', '1'); localStorage.setItem('deckdeal:lang', 'fr'); } catch (e) {}`;
const { ctx, p, errs } = await newPage(browser, world, { width: 390, height: 844, init });
await ctx.route('https://cdn.jsdelivr.net/**', route => {      // Tesseract et ses modèles depuis tests/node_modules s'ils y sont
  const u = new URL(route.request().url()), m = /\/npm\/(tesseract\.js@5\.1\.1\/dist|tesseract\.js-core@5\.1\.1|@tesseract\.js-data\/(\w+)\/4\.0\.0_best_int)\/(.+)$/.exec(u.pathname);
  const f = m && (m[2] ? `${TESS}/@tesseract.js-data/${m[2]}/4.0.0_best_int/${m[3]}` : m[1].startsWith('tesseract.js-core') ? `${TESS}/tesseract.js-core/${m[3]}` : `${TESS}/tesseract.js/dist/${m[3]}`);
  if (!f || !existsSync(f)) return route.continue();
  return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: f.endsWith('.wasm') ? 'application/wasm' : f.endsWith('.gz') ? 'application/gzip' : 'text/javascript', body: readFileSync(f) });
});
await p.reload(); await p.waitForTimeout(1200);

let good = 0, known = 0;
for (const id of ids) {
  const rec = JSON.parse(readFileSync(join(DIR, id + '.json'), 'utf8')), m = rec.meta || {}, rd = m.read || {}, sc = m.scan || {}, frame = rd.frame || sc.frame || 'card';
  await p.evaluate(([frame, sc]) => {      // chaque photo seule : liste vidée, ni extension collante ni langue du lot des photos d'avant
    scsSet({ frame: frame === 'name' ? 'name' : 'card', lang: sc.lang || '', ed: sc.ed || 'scan' });
    if (!SC.el) openScan();
    SC.items.clear(); SC.miss = []; SC.sets.clear(); SC.stick = ''; SC.lv = []; SC.lastIt = null; SC.foot = null; scanPaintList();
  }, [frame, sc]);
  await p.waitForSelector('.scan.on');
  const t0 = Date.now(), b64 = readFileSync(join(DIR, id + '.jpg')).toString('base64');
  await p.evaluate(async ([b64, frame]) => {
    const i = new Image(); i.src = 'data:image/jpeg;base64,' + b64; await i.decode();
    const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0);
    scanEnqueue({ label: 'Signalement', src: c, strip: frame === 'name', card: frame !== 'name' && frame !== 'photo', thumb: '' });
  }, [b64, frame]);
  await p.waitForFunction(() => [...SC.items.values()].length + SC.miss.length > 0, null, { timeout: 180000 }).catch(() => {});
  await p.waitForFunction(() => !SC.working && !SC.queue.length && !SC.pend.length && ![...SC.items.values()].some(x => x.es === 'load' || x.artq), null, { timeout: 120000 }).catch(() => {});
  await p.waitForTimeout(1500);      // carte proposée par la ligne du bas (scaned.js › scanContraAlt) : une requête de plus
  const got = await p.evaluate(() => {
    const x = [...SC.items.values()].pop(), f = SC.foot || {};
    if (!x) { const mm = SC.miss[SC.miss.length - 1]; return { miss: true, raw: (mm && mm.raw) || SC.raw || '', foot: f.raw || '', turn: SC.turned || 0 }; }
    return { name: x.name, key: x.key, l: x.l || 'en', e: x.e || '', es: x.es, maybe: !!x.maybe, alts: x.alts || null, via: x.via || '', raw: x.raw || '', score: x.score, foot: f.raw || '', ft: x.ft ? { codes: x.ft.codes, nums: x.ft.nums, lang: x.ft.lang } : null, turn: SC.turned || 0 };
  });
  const h = rd.hit, before = h ? `${h.name} (${h.card}) ${Math.round((h.score || 0) * 100)} %` : 'non reconnue';
  const now = got.miss ? `non reconnue « ${got.raw} »` : `${got.name} (${got.l}) ${got.e || '—'} [${got.es}] ${Math.round(got.score * 100)} %${got.maybe ? ' · à vérifier' : ''}${got.alts ? ' · proposées : ' + got.alts.join(' / ') : ''}${got.via ? ' · via ' + got.via : ''}${got.turn ? ' · tournée ' + got.turn : ''}`;
  let mark = '·';
  const w = typeof want[id] === 'string' ? { name: want[id] } : want[id];
  if (w && w.name) {
    known++;
    const k = await p.evaluate(n => ownKey(n), w.name), cands = got.miss ? [] : [got.key, ...(got.maybe && got.alts ? await p.evaluate(a => a.map(ownKey), got.alts) : [])];
    const ok = cands.includes(k) && (!w.set || got.key !== k || !got.e || got.e === w.set + '|' + w.num);
    mark = ok ? (got.key === k && !got.maybe ? '✓' : '≈') : '✗'; if (ok) good++;
  }
  console.log(`${mark} ${id} · ${rec.what}${rec.note ? ' « ' + rec.note + ' »' : ''}\n   avant : ${before} · lu « ${rd.first || ''} » · bas « ${(rd.foot || {}).raw || ''} »\n   maintenant : ${now} · lu « ${got.raw} » · bas « ${got.foot} »${got.ft ? ' ' + JSON.stringify(got.ft) : ''} · ${Math.round((Date.now() - t0) / 100) / 10} s${w ? '\n   attendu : ' + [w.name, w.set, w.num].filter(Boolean).join(' ') : ''}\n`);
}
if (known) console.log(`${good} / ${known} retrouvées (✓ sûre, ≈ proposée ou à vérifier, ✗ ratée).`);
if (errs.length) console.log('Erreurs de la page :\n' + errs.slice(0, 10).join('\n'));
await browser.close(); world.stop(); process.exit(0);
