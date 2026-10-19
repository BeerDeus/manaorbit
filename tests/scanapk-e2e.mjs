// E2E scan des cartes chinoises, japonaises, coréennes et russes dans l'appli Android (problème du 19 octobre : « le chinois ne se scanne jamais dans l'APK »).
// Cartes dessinées dans Chromium avec de vrais noms des catalogues (pwa/names-zhs.tsv, names-ja.tsv, names-ko.tsv, names-all.tsv), lues par le chemin de l'appli :
// Capacitor simulé (caméra native, plugin ML Kit), ML Kit latin simulé par Tesseract anglais (il ne lit que l'alphabet latin, comme ML Kit : « | BEE » sur un nom
// chinois, « Conneunoe Konno » sur un nom russe), vrais moteurs Tesseract chi_sim, jpn, kor, rus et vrais catalogues. Langue des cartes « Auto », appli en français.
// 1) APK 1.0.5 (ML Kit latin seul) : avant, ces noms n'étaient jamais lus par le moteur de leur écriture (ocrLangs = fra, eng → ML Kit), seule une carte récente
//    passait par sa ligne du bas (et le russe restait « à vérifier ») ; maintenant : moteurs des autres écritures quand ML Kit ne lit rien de sûr (scan.js › readMore).
// 2) APK 1.0.6 : ML Kit chinois, japonais, coréen (ManaOrbit.detectText avec script, simulé), sans Tesseract ; modèle en téléchargement : Tesseract en attendant.
// Polices : WenQuanYi Zen Hei (chinois, coréen), IPAGothic (japonais), DejaVu Serif (latin, russe) ; modèles : TESS_DIR (tests/node_modules). Absents : test ignoré.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { chromium, startWorld, newPage, ok, toHome } from './e2e-world.mjs';

const TESS_DIR = process.env.TESS_DIR || new URL('../tests/node_modules', import.meta.url).pathname;
const MODELS = ['eng', 'chi_sim', 'jpn', 'kor', 'rus'], has = l => existsSync(`${TESS_DIR}/@tesseract.js-data/${l}/4.0.0_best_int/${l}.traineddata.gz`);
if (!existsSync(TESS_DIR + '/tesseract.js') || !MODELS.every(has)) { console.log('· tesseract.js ou modèles ' + MODELS.filter(l => !has(l)).join(', ') + ' absents (TESS_DIR) : test ignoré'); process.exit(0); }
let fonts = ''; try { fonts = execSync('fc-list', { encoding: 'utf8' }); } catch (e) { /* fontconfig absent */ }
const FONTS = { zh: 'WenQuanYi Zen Hei', ja: 'IPAGothic', ko: 'WenQuanYi Zen Hei', ru: 'DejaVu Serif', en: 'DejaVu Serif' };
if (!Object.values(FONTS).every(f => fonts.includes(f))) { console.log('· polices ' + [...new Set(Object.values(FONTS))].filter(f => !fonts.includes(f)).join(', ') + ' absentes (fc-list) : test ignoré'); process.exit(0); }
const PWA = new URL('../pwa/', import.meta.url).pathname;
const map = [
  [/\/npm\/tesseract\.js@5\.1\.1\/dist\/(.+)$/, m => `${TESS_DIR}/tesseract.js/dist/${m[1]}`, 'text/javascript'],
  [/\/npm\/tesseract\.js-core@5\.1\.1\/(.+)$/, m => `${TESS_DIR}/tesseract.js-core/${m[1]}`, null],
  [/\/npm\/@tesseract\.js-data\/(\w+)\/4\.0\.0_best_int\/(.+)$/, m => `${TESS_DIR}/@tesseract.js-data/${m[1]}/4.0.0_best_int/${m[2]}`, 'application/gzip'],
];
const world = await startWorld({ port: 19496 });
Object.assign(world.psets, { 'Sol Ring': ['cmm', 'blb', 'dsk', 'm21'] });      // n° 200, 201, 202, 203
world.setnum = { 'dsk/202': { name: 'Sol Ring', printed: { zhs: '阳光戒', ja: '太陽の指輪', ru: 'Солнечное Кольцо' } } };
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });

/** Page de l'appli Android simulée. cjk : APK 1.0.6 (ManaOrbit.detectText : ML Kit de l'écriture, simulé par le texte que le test pose pour la carte, window.__nat.cjk). */
async function apk(cjk) {
  const pg = await newPage(browser, world, { goto: false }), hits = {}, models = [], block = new Set();      // block : modèles introuvables (404)
  await pg.ctx.route(/\/names-(ja|ko|zhs|zht|all)\.tsv$/, r => { const f = new URL(r.request().url()).pathname.slice(1); hits[f] = (hits[f] || 0) + 1; return r.fulfill({ status: 200, contentType: 'text/tab-separated-values; charset=utf-8', body: readFileSync(PWA + f) }); });
  await pg.ctx.route('https://cdn.jsdelivr.net/**', route => {
    const u = new URL(route.request().url());
    for (const [re, file, type] of map) {
      const m = re.exec(u.pathname); if (!m) continue;
      if (m[2]) models.push(m[1]);
      const f = file(m); if (!existsSync(f) || (m[2] && block.has(m[1]))) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: type || (f.endsWith('.wasm') ? 'application/wasm' : 'text/javascript'), body: readFileSync(f) });
    }
    return route.fulfill({ status: 404, body: 'nf' });
  });
  await pg.ctx.addInitScript(cjk => {
    window.__nat = { ml: 0, cjk: null, calls: [], fail: {} };
    // ML Kit latin simulé : Tesseract anglais (son propre moteur, hors d'OCR.workers), à la taille reçue et à la moitié (gros titre et petite ligne du bas)
    const mlw = () => window.__mlw || (window.__mlw = (async () => { const T = await ocrLib(), w = await T.createWorker('eng', 1, { workerPath: TESS.worker, corePath: TESS.core, langPath: TESS.langs.eng }); await w.setParameters({ tessedit_pageseg_mode: '6' }); return w; })());
    const latin = async o => {
      window.__nat.ml++;
      const w = await mlw(), img = new Image(); img.src = 'data:image/jpeg;base64,' + o.base64Image; await img.decode();
      const ls = [];
      for (const k of [1, 0.5]) {
        const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        for (const t of String((await w.recognize(c)).data.text || '').split('\n').map(x => x.trim()).filter(Boolean)) if (!ls.includes(t)) ls.push(t);
      }
      return { text: ls.join('\n'), blocks: [{ text: ls.join('\n'), lines: ls.map(text => ({ text })) }] };
    };
    const P = { CameraPreview: { start: async () => ({}), stop: async () => ({}), captureSample: async () => ({ value: '' }) }, CapacitorPluginMlKitTextRecognition: { detectText: latin } };
    if (cjk) P.ManaOrbit = { info: async () => ({ version: '1.0.6', build: 7 }), detectText: async o => {      // ML Kit de l'écriture : le nom de la carte posée si c'est la sienne, sinon rien
      window.__nat.calls.push(o.script);
      if (window.__nat.fail[o.script] > 0) { window.__nat.fail[o.script]--; throw Object.assign(new Error('Waiting for the text optional module to be downloaded. Please wait.'), { code: 'wait' }); }
      const c = window.__nat.cjk, t = c && c.script === o.script ? c.text : '';
      return { text: t, blocks: t ? [{ text: t, lines: [{ text: t }] }] : [], script: o.script };
    } };
    window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => !!P[n], Plugins: P };
  }, !!cjk);
  await pg.p.goto(world.url); await pg.p.waitForTimeout(700); await toHome(pg.p);
  await pg.p.evaluate(() => scsSet({ frame: 'card', lang: '' }));
  await pg.p.evaluate(() => openScan()); await pg.p.waitForSelector('.scan.on');
  await pg.p.waitForFunction(() => document.querySelector('.sc-stage').dataset.native === '1', null, { timeout: 6000 });
  pg.seen = 0;      // cartes attendues dans ce scan (remis à zéro quand le scan est rouvert)
  /** Carte dessinée (nom dans sa police, ligne du bas « l1 / l2 » s'il y en a une), mise dans la file comme une capture de la caméra native ; attend sa lecture. */
  pg.shoot = async (o, ms = 240000) => {
    const t0 = Date.now();
    await pg.p.evaluate(async o => {
      window.__nat.cjk = o.cjk || null;
      const H = 1400, W = Math.round(H * 63 / 88), k = H / 1040, c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d'), rr = (a, b, w, h, r, f) => { x.fillStyle = f; x.beginPath(); x.roundRect(a, b, w, h, r); x.fill(); };
      x.fillStyle = '#0c0c0c'; x.fillRect(0, 0, W, H);
      rr(26 * k, 26 * k, W - 52 * k, H * 0.915 - 26 * k, 20 * k, 'rgb(214,196,150)');
      rr(44 * k, 44 * k, W - 88 * k, 68 * k, 12 * k, 'rgb(236,226,196)'); x.strokeStyle = 'rgb(60,50,40)'; x.lineWidth = 3 * k; x.stroke();
      x.fillStyle = 'rgb(25,20,15)'; x.textBaseline = 'middle'; x.font = `bold ${Math.round(42 * k)}px "${o.font}"`; x.fillText(o.name, 62 * k, 78 * k);
      x.fillStyle = 'rgb(70,100,140)'; x.fillRect(60 * k, 128 * k, W - 120 * k, 442 * k);
      rr(44 * k, 590 * k, W - 88 * k, 60 * k, 8 * k, 'rgb(236,226,196)'); x.fillStyle = 'rgb(236,226,196)'; x.fillRect(60 * k, 670 * k, W - 120 * k, 260 * k);
      const fs = Math.round(H * 0.0155); x.fillStyle = 'rgb(235,235,235)'; x.textBaseline = 'top'; x.font = `bold ${fs}px "Liberation Sans", "DejaVu Sans"`;
      if (o.l1) x.fillText(o.l1, W * 0.05, H * 0.928); if (o.l2) x.fillText(o.l2, W * 0.05, H * 0.952);
      scanEnqueue({ label: 'Carte', src: c, strip: false, card: true, thumb: '' });
    }, o);
    pg.seen++;
    await pg.p.waitForFunction(n => [...SC.items.values()].reduce((a, x) => a + x.q, 0) + SC.miss.length >= n, pg.seen, { timeout: ms });
    await pg.p.waitForFunction(() => !SC.working && !SC.queue.length && !SC.pend.length && ![...SC.items.values()].some(x => x.es === 'load'), null, { timeout: ms });
    const r = await pg.p.evaluate(() => ({ miss: SC.miss.length, it: SC.lastIt ? { key: SC.lastIt.key, l: SC.lastIt.l, maybe: SC.lastIt.maybe, raw: SC.lastIt.raw, via: SC.lastIt.via } : null, workers: Object.keys(OCR.workers).sort() }));
    console.log(`  ${o.name || '(sans nom)'}${o.l2 ? ' · ' + o.l2 : ''} : ${JSON.stringify(r)} (${Date.now() - t0} ms)`);
    return r;
  };
  pg.hits = hits; pg.models = models; pg.block = block;
  return pg;
}
/** Dernière carte du scan : [clé, langue, à vérifier]. */
const card = r => (r.it ? [r.it.key, r.it.l, r.it.maybe] : null);

/* ── 1) APK 1.0.5 : ML Kit latin seul ─────────────────────────────────────────────────────────────────────────── */
{
  const pg = await apk(false), { p } = pg;
  let r = await pg.shoot({ name: 'Sol Ring', font: FONTS.en });
  assert.deepEqual(card(r), ['sol ring', 'en', false], 'carte anglaise : lue par ML Kit');
  assert.deepEqual(r.workers, [], 'carte latine sûre : aucun moteur Tesseract démarré (rien de plus lent qu\'avant)');
  ok('APK 1.0.5, carte anglaise : ML Kit seul, aucun autre moteur');

  r = await pg.shoot({ name: '阳光戒', font: FONTS.zh });      // carte chinoise d'avant 2015 : rien en bas
  assert.equal(r.miss, 0, 'carte chinoise reconnue (avant : « Nom non reconnu », ML Kit latin lisait « | BEE »)');
  assert.deepEqual(card(r), ['sol ring', 'zh-CN', false], '« 阳光戒 » → Sol Ring chinoise, sûre');
  assert.ok(r.workers.includes('chi_sim'), 'lue par le moteur chinois'); assert.equal(pg.hits['names-zhs.tsv'], 1, 'catalogue chinois téléchargé une fois');
  assert.deepEqual(await p.evaluate(() => ocrMore(false)[0]), 'chi_sim', 'pour la suite du scan, le moteur chinois passe d\'abord');
  r = await pg.shoot({ name: '秘法印记', font: FONTS.zh });
  assert.deepEqual(card(r), ['arcane signet', 'zh-CN', false], 'deuxième carte chinoise : « 秘法印记 » → Arcane Signet');
  assert.deepEqual(r.workers, ['chi_sim'], 'le moteur chinois d\'abord : aucun autre moteur essayé');
  ok('APK 1.0.5, carte chinoise sans rien imposer : ML Kit latin ne lit rien, le moteur chinois relit la bande → Sol Ring ZH, puis Arcane Signet ZH');

  r = await pg.shoot({ name: 'Солнечное Кольцо', font: FONTS.ru, l1: '0202 U', l2: 'DSK • RU' });      // carte russe récente
  assert.deepEqual(card(r), ['sol ring', 'ru', false], 'carte russe récente : sûre (avant : « à vérifier », le nom russe n\'était pas relu)');
  r = await pg.shoot({ name: 'Гнев Божий', font: FONTS.ru });      // carte russe d'avant 2015
  assert.deepEqual(card(r), ['wrath of god', 'ru', false], '« Гнев Божий » → Wrath of God russe (names-all.tsv)');
  assert.ok(r.workers.includes('rus'), 'moteur russe');
  ok('APK 1.0.5, russe : carte récente confirmée par le moteur russe (DSK • RU), carte ancienne lue par lui (ML Kit latin lisait « Conneunoe Konno »)');

  r = await pg.shoot({ name: '神の怒り', font: FONTS.ja });
  assert.deepEqual(card(r), ['wrath of god', 'jp', false], '« 神の怒り » → Wrath of God japonaise');
  r = await pg.shoot({ name: '라노워 엘프', font: FONTS.ko });
  assert.deepEqual(card(r), ['llanowar elves', 'kr', false], '« 라노워 엘프 » → Llanowar Elves coréenne');
  ok('APK 1.0.5, japonaise et coréenne sans rien imposer : moteurs japonais et coréen');

  r = await pg.shoot({ name: '', font: FONTS.en });
  assert.equal(r.miss, 1, 'nom illisible : toujours « Nom non reconnu », aucune carte au hasard');
  r = await pg.shoot({ name: 'Sol Ring', font: FONTS.en });
  assert.deepEqual(card(r), ['sol ring', 'en', false], 'carte anglaise après les autres écritures : toujours anglaise');
  ok('APK 1.0.5 : nom illisible → non reconnue (pas de fausse carte d\'Asie) ; carte anglaise toujours lue en anglais');
  assert.deepEqual(pg.errs.filter(e => !/WebAssembly|worker/i.test(e)), []); await pg.ctx.close();
}

/* ── 2) APK 1.0.6 : ML Kit chinois, japonais, coréen (ManaOrbit.detectText) ───────────────────────────────────── */
{
  const pg = await apk(true), { p } = pg;
  let r = await pg.shoot({ name: '阳光戒', font: FONTS.zh, cjk: { script: 'chinese', text: '阳光戒' } });
  assert.deepEqual(card(r), ['sol ring', 'zh-CN', false], 'APK 1.0.6 : carte chinoise lue par ML Kit chinois');
  assert.deepEqual(r.workers, [], 'aucun moteur Tesseract'); assert.ok((await p.evaluate(() => window.__nat.calls)).includes('chinese'));
  await p.evaluate(() => { window.__nat.calls = []; window.__nat.fail.japanese = 1; });      // modèle japonais pas encore téléchargé : refusé une fois
  r = await pg.shoot({ name: '神の怒り', font: FONTS.ja, cjk: { script: 'japanese', text: '神の怒り' } });
  assert.deepEqual(card(r), ['wrath of god', 'jp', false], 'modèle japonais en téléchargement : la carte est lue quand même');
  assert.ok(r.workers.includes('jpn'), 'Tesseract japonais en attendant'); assert.ok(await p.evaluate(() => NATW.japanese > Date.now()), 'ML Kit japonais réessayé plus tard');
  await p.evaluate(() => { NATW.japanese = 0; window.__nat.calls = []; });
  r = await pg.shoot({ name: '라노워 엘프', font: FONTS.ko, cjk: { script: 'korean', text: '라노워 엘프' } });
  assert.deepEqual(card(r), ['llanowar elves', 'kr', false]); assert.ok(!r.workers.includes('kor'), 'coréen : ML Kit, pas Tesseract');
  ok('APK 1.0.6 : ML Kit chinois, japonais, coréen sur le téléphone ; modèle pas encore là → Tesseract en attendant, ML Kit ensuite');
  await p.evaluate(() => { scsSet({ lang: 'kr' }); closeScan(); window.__nat.calls = []; openScan(); });
  await p.waitForFunction(() => window.__nat.calls.includes('korean'), null, { timeout: 8000 });
  ok('APK 1.0.6, coréen imposé : son modèle ML Kit est demandé dès l\'ouverture du scan');
  // modèle russe introuvable (CDN, 404) : Tesseract.js reste pendu sans erreur ; le scan l'abandonne après OCR.wait, la carte finit « non reconnue », la file continue
  await p.evaluate(() => { scsSet({ lang: '' }); closeScan(); openScan(); OCR.wait = 1500; }); await p.waitForSelector('.scan.on'); pg.seen = 0; pg.block.add('rus');
  r = await pg.shoot({ name: '', font: FONTS.en }, 60000);
  assert.equal(r.miss, 1, 'nom illisible, modèle russe introuvable : non reconnue, sans bloquer la file');
  assert.ok(await p.evaluate(() => OCR.bad.rus > Date.now() && !OCR.workers.rus), 'moteur russe laissé de côté (10 min)');
  assert.deepEqual(await p.evaluate(() => [...new Set(window.__nat.calls)].sort()), ['chinese', 'japanese', 'korean'], 'ML Kit : les trois écritures d\'Asie essayées (chinois simplifié et traditionnel : un seul modèle)');
  r = await pg.shoot({ name: 'Sol Ring', font: FONTS.en });
  assert.deepEqual(card(r), ['sol ring', 'en', false], 'la carte suivante est lue normalement');
  ok('modèle introuvable (Tesseract.js pendu) : moteur abandonné après le délai, carte non reconnue, la file du scan continue');
  assert.deepEqual(pg.errs.filter(e => !/WebAssembly|worker/i.test(e)), []); await pg.ctx.close();
}

await browser.close(); world.stop(); console.log('\nSCAN APK E2E OK'); process.exit(0);
