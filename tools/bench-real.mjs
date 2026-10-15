// BANC D'ESSAI DU SCAN SUR DE VRAIES CARTES (outil de mesure, pas un test) : cartes tirées au hasard chez Scryfall dans chaque langue (récentes et d'avant 2015),
// image officielle de l'impression « photographiée » dans le navigateur (marge, rotation, flou, lumière, reflet, bruit, JPEG), lue par le vrai scan de l'appli
// (cadrage « carte entière », langue automatique, lot mélangé comme un vrai paquet) : nom, langue et édition comparés à la carte tirée.
// Réseau requis (api.scryfall.com, cards.scryfall.io, cdn.jsdelivr.net) : GitHub Actions (onglet Actions › « Banc d'essai du scan ») ou un poste ouvert.
// Rien n'est enregistré dans le dépôt : rapport dans le dossier de sortie (report.md, report.json, photos des cartes ratées).
//   node tools/bench-real.mjs [--n 4] [--langs fr,en,de,es,it,pt,ru,ja,ko,zhs,zht] [--cond net,photo] [--out bench-out]
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium, startWorld } from '../tests/e2e-world.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const N = Number(arg('n', 4)), LANGS = arg('langs', 'fr,en,de,es,it,pt,ru,ja,ko,zhs,zht').split(','), CONDS = arg('cond', 'net,photo').split(','), OUT = arg('out', 'bench-out');
const APP_LANG = { en: 'en', fr: 'fr', de: 'de', es: 'es', it: 'it', pt: 'pt', ru: 'ru', ja: 'jp', ko: 'kr', zhs: 'zh-CN', zht: 'zh-TW' };
mkdirSync(OUT + '/fails', { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = { 'User-Agent': 'ManaOrbit-bench/1.0 (+https://manaorbit.app)', Accept: 'application/json' };
async function scry(url) {
  for (let i = 0; i < 5; i++) { const r = await fetch(url, { headers: UA }); if (r.ok) return r.json(); if (r.status === 404) return null; await sleep(1500 * (i + 1)); }
  return null;
}
/** Une carte au hasard d'une langue et d'une époque, avec son image : { name, printed, lang, set, num, year, img (base64) } ou null. */
async function draw(l, recent) {
  const q = `lang:${l} game:paper -is:digital -t:basic -is:funny -layout:token -layout:art_series ${recent ? 'year>=2016' : 'year<2015'}`;
  for (let t = 0; t < 4; t++) {
    const c = await scry('https://api.scryfall.com/cards/random?q=' + encodeURIComponent(q)); await sleep(120);
    if (!c) return null;
    const im = c.image_uris || (c.card_faces && c.card_faces[0] && c.card_faces[0].image_uris), u = im && im.large;
    if (!u || c.lang !== l || (c.layout || '').includes('split') || c.layout === 'flip') continue;      // cartes coupées, retournées : cadrage à part
    const r = await fetch(u); if (!r.ok) continue;
    return { name: c.name, printed: c.printed_name || (c.card_faces && c.card_faces[0].printed_name) || '', lang: l, set: c.set, num: c.collector_number, year: Number(String(c.released_at).slice(0, 4)), img: Buffer.from(await r.arrayBuffer()).toString('base64') };
  }
  return null;
}

const TESS_DIR = new URL('../tests/node_modules', import.meta.url).pathname;
const world = await startWorld({ port: 19490 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', serviceWorkers: 'block' });
await ctx.addInitScript(() => { try { localStorage.setItem('deckdeal:onboard', '1'); } catch (e) { /* ignore */ } });
await ctx.route('https://cdn.jsdelivr.net/**', route => {      // Tesseract et ses modèles : depuis tests/node_modules s'ils y sont (plus rapide), sinon le vrai CDN
  const u = new URL(route.request().url()), m = /\/npm\/(tesseract\.js@5\.1\.1\/dist|tesseract\.js-core@5\.1\.1|@tesseract\.js-data\/(\w+)\/4\.0\.0_best_int)\/(.+)$/.exec(u.pathname);
  const f = m && (m[2] ? `${TESS_DIR}/@tesseract.js-data/${m[2]}/4.0.0_best_int/${m[3]}` : m[1].startsWith('tesseract.js-core') ? `${TESS_DIR}/tesseract.js-core/${m[3]}` : `${TESS_DIR}/tesseract.js/dist/${m[3]}`);
  if (!f || !existsSync(f)) return route.continue();
  return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: f.endsWith('.wasm') ? 'application/wasm' : f.endsWith('.gz') ? 'application/gzip' : 'text/javascript', body: readFileSync(f) });
});
const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(world.url); await p.waitForTimeout(1500);
await p.evaluate(() => { scsSet({ frame: 'card', lang: '' }); openScan(); }); await p.waitForSelector('.scan.on');

/** « Photo » de la carte dans le cadre de l'écran : net (capture propre) ou photo (rotation, flou, lumière chaude, reflet, bruit, JPEG). */
const shoot = (b64, cond, seed) => p.evaluate(async ([b64, cond, seed]) => {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const i = new Image(); i.src = 'data:image/jpeg;base64,' + b64; await i.decode();
  const H = cond === 'photo' ? 1100 : i.naturalHeight, k = H / i.naturalHeight, W = Math.round(i.naturalWidth * k), pad = Math.round(W * 0.02);
  const c = document.createElement('canvas'); c.width = W + 2 * pad; c.height = H + 2 * pad; const x = c.getContext('2d');
  x.fillStyle = cond === 'photo' ? '#5b5045' : '#202020'; x.fillRect(0, 0, c.width, c.height);
  x.save(); x.translate(c.width / 2, c.height / 2);
  if (cond === 'photo') { x.rotate((rnd() - 0.5) * 5 * Math.PI / 180); x.filter = `blur(${(0.5 + rnd() * 0.8).toFixed(2)}px) brightness(${(0.8 + rnd() * 0.35).toFixed(2)}) sepia(${(rnd() * 0.25).toFixed(2)})`; }
  x.drawImage(i, -W / 2, -H / 2, W, H); x.restore();
  if (cond === 'photo') {
    const gx = rnd() * c.width, gy = rnd() * c.height, g = x.createRadialGradient(gx, gy, 0, gx, gy, c.width * 0.45);
    g.addColorStop(0, 'rgba(255,255,255,0.28)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height), a = d.data; for (let j = 0; j < a.length; j += 4) { const n = (rnd() - 0.5) * 22; a[j] += n; a[j + 1] += n; a[j + 2] += n; } x.putImageData(d, 0, 0);
  }
  const jpg = c.toDataURL('image/jpeg', cond === 'photo' ? 0.72 : 0.9), j = new Image(); j.src = jpg; await j.decode();
  const o = document.createElement('canvas'); o.width = j.naturalWidth; o.height = j.naturalHeight; o.getContext('2d').drawImage(j, 0, 0);
  window.__shot = jpg; scanEnqueue({ label: 'Carte', src: o, strip: false, card: true, thumb: '' });
}, [b64, cond, seed]);
let seen = 0;
const idle = async () => {
  seen++;
  await p.waitForFunction(n => [...SC.items.values()].reduce((a, x) => a + x.q, 0) + SC.miss.length >= n, seen, { timeout: 120000 });
  await p.waitForFunction(() => !SC.working && !SC.queue.length && !SC.pend.length && ![...SC.items.values()].some(x => x.es === 'load' || x.artq), null, { timeout: 120000 }).catch(() => {});
};

const rows = [];
for (const l of LANGS) {
  for (let n = 0; n < N; n++) {
    const card = await draw(l, n % 2 === 0); if (!card) { console.log(`  ${l} : pas de carte tirée`); continue; }
    for (const cond of CONDS) {
      const before = await p.evaluate(() => ({ ids: [...SC.items.keys()], miss: SC.miss.length, q: Object.fromEntries([...SC.items.values()].map(x => [x.id, x.q])) })), t0 = Date.now();
      await shoot(card.img, cond, 1 + rows.length * 7919); await idle();
      const got = await p.evaluate(b => {
        if (SC.miss.length > b.miss) { const m = SC.miss[SC.miss.length - 1]; return { miss: true, raw: m.raw || '', foot: SC.foot && SC.foot.raw || '' }; }
        const x = SC.lastIt || [...SC.items.values()].find(y => !b.ids.includes(y.id) || y.q !== b.q[y.id]);
        return x ? { key: x.key, l: x.l || 'en', e: x.e || '', es: x.es, maybe: x.maybe, via: x.via || '', raw: x.raw || '', foot: SC.foot && SC.foot.raw || '' } : { miss: true };
      }, before);
      const want = { key: (await p.evaluate(n => ownKey(n), card.name)), l: APP_LANG[l], e: card.set + '|' + String(card.num).toLowerCase() };
      const r = { lang: l, cond, era: card.year >= 2015 ? 'récente' : 'ancienne', card: `${card.name} (${card.printed || '—'}) ${card.set.toUpperCase()} ${card.num} ${card.year}`, ms: Date.now() - t0, got,
        name: !got.miss && got.key === want.key, lng: !got.miss && got.l === want.l, ed: !got.miss && got.e === want.e, sure: !got.miss && !got.maybe };
      rows.push(r);
      console.log(`${r.name ? '✓' : '✗'} ${l} ${cond.padEnd(5)} ${r.card} → ${got.miss ? 'non reconnue « ' + (got.raw || '') + ' »' : `${got.key} ${got.l} ${got.e || '—'} (${got.es}${got.maybe ? ', à vérifier' : ''}) « ${got.raw} »`}${!r.lng && !got.miss ? ' [langue]' : ''}${!r.ed && !got.miss ? ' [édition]' : ''} · bas « ${got.foot} » · ${Math.round(r.ms / 100) / 10} s`);
      if (!r.name || !r.lng) { const b64 = (await p.evaluate(() => window.__shot)).split(',')[1]; writeFileSync(`${OUT}/fails/${rows.length}-${l}-${cond}.jpg`, Buffer.from(b64, 'base64')); }
    }
  }
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) + ' %' : '–');
const sum = list => ({ n: list.length, name: list.filter(r => r.name).length, lng: list.filter(r => r.name && r.lng).length, ed: list.filter(r => r.name && r.ed).length, sure: list.filter(r => r.name && r.sure).length, wrongSure: list.filter(r => r.sure && (!r.name || !r.lng)).length, ms: list.reduce((a, r) => a + r.ms, 0) / (list.length || 1) });
const line = (k, s) => `| ${k} | ${s.n} | ${pct(s.name, s.n)} | ${pct(s.lng, s.n)} | ${pct(s.ed, s.n)} | ${pct(s.sure, s.n)} | ${s.wrongSure} | ${(s.ms / 1000).toFixed(1)} s |`;
const head = '| | cartes | nom | nom + langue | nom + édition exacte | sûres (sans « à vérifier ») | fausses sûres | temps moyen |\n|---|---|---|---|---|---|---|---|';
let md = `# Banc d'essai du scan — vraies cartes Scryfall\n\n${rows.length} lectures (${N} cartes par langue, conditions : ${CONDS.join(', ')}), lot mélangé, langue automatique, cadrage carte entière.\n\n`;
md += '## Par langue\n\n' + head + '\n' + LANGS.map(l => line(l, sum(rows.filter(r => r.lang === l)))).join('\n') + '\n' + line('**total**', sum(rows)) + '\n\n';
md += '## Par condition et époque\n\n' + head + '\n' + CONDS.flatMap(c => ['récente', 'ancienne'].map(e => line(`${c} · ${e}`, sum(rows.filter(r => r.cond === c && r.era === e))))).join('\n') + '\n\n';
md += '## Ratées ou fausses\n\n' + (rows.filter(r => !r.name || !r.lng || (r.sure && !r.ed)).map(r => `- ${r.lang} · ${r.cond} · ${r.card} → ${r.got.miss ? 'non reconnue' : `${r.got.key} ${r.got.l} ${r.got.e || '—'}${r.got.maybe ? ' (à vérifier)' : ''}`} — lu « ${r.got.raw || ''} », bas « ${r.got.foot || ''} »`).join('\n') || 'Aucune.') + '\n';
if (errs.length) md += '\n## Erreurs de la page\n\n' + errs.map(e => '- ' + e).join('\n') + '\n';
writeFileSync(OUT + '/report.md', md); writeFileSync(OUT + '/report.json', JSON.stringify(rows.map(({ ...r }) => r), null, 1));
console.log('\n' + md);
await browser.close(); world.stop(); process.exit(0);
