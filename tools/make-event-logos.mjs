// Logos de l'appli aux couleurs des fêtes (Halloween, Noël, Nouvel an, Pâques, anniversaire de Magic), depuis les dessins de src/evlogo.js (une seule source).
// Rendu par Chromium (Playwright, comme make-icons.mjs). node tools/make-event-logos.mjs [pack…] [--quick] [--sheet]   (sans pack : tous, puis la planche ; --quick : sans l'icône Android)
//  · docs/evenements/logos/<pack>/ : sources SVG (logo.svg, logo-maskable.svg, android-foreground.svg, android-background.svg) et android/ (icône adaptative,
//    mipmaps mdpi → xxxhdpi nommées ic_launcher_<pack>*, prêtes pour un <activity-alias> : docs/evenements/icones-android.md) ;
//  · pwa/icons/events/<pack>/ : icon.svg, icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png, favicon-32.png, discord-512.png, social-1200x630.png ;
//  · shots/event-logos.png (non versionnée) : 512, 192, maskable, 32 px et le logo de l'en-tête à 28 px sur fond clair et sombre, pour chaque pack.
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const ROOT = new URL('../', import.meta.url).pathname;
const req = createRequire(import.meta.url);
let pw; try { pw = req('playwright-core'); } catch (e) { pw = createRequire(ROOT + 'tests/package.json')('playwright-core'); }   // aucune dépendance à la racine : celle des tests
const { EV_LOGO } = req('../src/evlogo.js');

/* Par pack : nom de la fête, titre de la chasse (evpacks.js › txt.title), fond des icônes (dégradé radial : centre, milieu, bord), encre (liseré des billes),
   couleurs du texte de l'image des réseaux, petits décors du fond (étoiles, neige…). */
const PACKS = {
  halloween: { name: 'Halloween', hello: 'Joyeux Halloween', hunt: 'La chasse aux citrouilles est ouverte', bg: ['#4b2596', '#1d0c3a', '#0c0518'], ink: '#0c0518', hi: ['#ffc35c', '#ff7a1a'], dots: '#ffd9a0' },
  noel: { name: 'Noël', hello: 'Joyeux Noël', hunt: 'La chasse aux cadeaux est ouverte', bg: ['#9a1d31', '#45091a', '#1c040b'], ink: '#1c040b', hi: ['#ffe17a', '#f4c542'], dots: '#ffffff' },
  nouvelan: { name: 'Nouvel an', hello: 'Bonne année', hunt: 'La chasse aux étoiles filantes est ouverte', bg: ['#3035a6', '#10124a', '#05061a'], ink: '#05061a', hi: ['#ffe9a8', '#f2c230'], dots: '#fff1c4' },
  paques: { name: 'Pâques', hello: 'Joyeuses Pâques', hunt: 'La chasse aux œufs est ouverte', bg: ['#8a78d6', '#45367f', '#211941'], ink: '#211941', hi: ['#ffd1e6', '#ffb3d1'], dots: '#ffe0ef' },
  magic: { name: 'Anniversaire de Magic', hello: 'Joyeux anniversaire, Magic', hunt: 'La chasse aux bougies est ouverte', bg: ['#33407f', '#141a3d', '#0b0f1c'], ink: '#0b0f1c', hi: ['#fff1b8', '#f2c230'], dots: '#ffe7a3' },
};
const ALL = Object.keys(PACKS);
const ARGS = process.argv.slice(2).filter(a => !a.startsWith('-'));
for (const a of ARGS) if (!PACKS[a] || !EV_LOGO[a]) { console.error('pack inconnu : ' + a + ' (' + ALL.join(', ') + ')'); process.exit(1); }
const TODO = ARGS.length ? ARGS : ALL;

/** Petits points lumineux du fond (étoiles, neige), toujours au même endroit : graine fixe. */
function dots(p, n = 22, k = 1) {
  let s = 0x9e3779b9 ^ p.length * 7919, out = '';
  const rnd = () => ((s = Math.imul(s ^ s >>> 15, 0x2c1b3c6d) ^ Math.imul(s ^ s >>> 12, 0x297a2d39)) >>> 0) / 4294967296;
  for (let i = 0; i < n; i++) {
    const x = rnd() * 512, y = rnd() * 512, r = (.7 + rnd() * rnd() * 2) * k, o = .16 + rnd() * .42;
    if (Math.hypot(x - 256, y - 256) < 150) continue;   // pas derrière le dessin
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill-opacity="${o.toFixed(2)}"/>`;
  }
  return `<g fill="${PACKS[p].dots}">${out}</g>`;
}

/** Cadre du dessin (unités du logo, celles de #i-logo) : complet, et version du favicon (sans evl-fine) ; halos ignorés. Mesuré dans Chromium. */
let BOX = {};
/** Icône 512 × 512 : bleed (plein cadre, sinon carré arrondi à coins transparents), bg (fond), logo (dessin), fit (plus grand côté du dessin / 512),
 *  mini (favicon : détails fins retirés, orbite épaissie), dy (décalage vertical en px). */
function icon(p, { bleed = false, bg = true, logo = true, fit = .8, mini = false, dy = 0, deco = true } = {}) {
  const P = PACKS[p], b = BOX[p][mini ? 'mini' : 'full'];
  const k = fit * 512 / Math.max(b.w, b.h), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><radialGradient id="mo-bg-${p}" cx=".3" cy=".22" r="1.05"><stop offset="0" stop-color="${P.bg[0]}"/><stop offset=".62" stop-color="${P.bg[1]}"/><stop offset="1" stop-color="${P.bg[2]}"/></radialGradient></defs>
  ${mini ? '<style>.evl-fine,.evl-glow{display:none}.evl-o{stroke-width:3.8}</style>' : ''}
  ${bg ? `<rect width="512" height="512" ${bleed ? '' : 'rx="118"'} fill="url(#mo-bg-${p})"/>${deco && !mini ? dots(p) : ''}` : ''}
  ${logo ? `<g color="${P.ink}" transform="translate(256 ${256 + dy}) scale(${+k.toFixed(4)}) translate(${+(-cx).toFixed(3)} ${+(-cy).toFixed(3)})">${EV_LOGO[p]}</g>` : ''}
</svg>`;
}
const FIT = { any: .8, mask: .62, fav: .96, discord: .64, fg: .54 };

const font = (fam, f) => existsSync(ROOT + f) ? `@font-face{font-family:'${fam}';font-weight:200 800;src:url(data:font/woff2;base64,${readFileSync(ROOT + f).toString('base64')}) format('woff2')}` : '';
const FACES = font('MO Display', 'tools/fonts/bricolage-grotesque-latin-opsz-normal.woff2') + font('MO Text', 'tools/fonts/instrument-sans-latin-wght-normal.woff2');
/** Image des réseaux (1200 × 630) : le logo, « Mana Orbit », la fête et sa chasse. */
const social = p => { const P = PACKS[p]; return `<style>${FACES}html,body{margin:0}
  .s{position:relative;width:1200px;height:630px;overflow:hidden;background:radial-gradient(90% 120% at 22% 30%,${P.bg[0]},${P.bg[1]} 58%,${P.bg[2]});font-family:'MO Text',Inter,sans-serif;color:#fff}
  .s>svg.bgd{position:absolute;inset:0;width:1200px;height:630px}
  .lg{position:absolute;left:46px;top:50%;width:500px;height:500px;transform:translateY(-50%)}
  .tx{position:absolute;left:560px;right:60px;top:50%;transform:translateY(-52%)}
  .k{font-weight:700;font-size:25px;letter-spacing:.2em;text-transform:uppercase;background:linear-gradient(90deg,${P.hi[0]},${P.hi[1]});-webkit-background-clip:text;color:transparent}
  h1{margin:12px 0 20px;font:800 112px/.92 'MO Display',Inter,sans-serif;letter-spacing:-.025em}
  .sub{font-size:33px;font-weight:500;line-height:1.25;color:rgba(255,255,255,.86);max-width:560px}
  .u{position:absolute;right:56px;bottom:38px;font-size:22px;font-weight:600;letter-spacing:.06em;color:rgba(255,255,255,.55)}
  .rule{width:84px;height:5px;border-radius:3px;margin-top:30px;background:linear-gradient(90deg,${P.hi[0]},${P.hi[1]})}</style>
  <div class="s"><svg class="bgd" viewBox="0 0 512 269" preserveAspectRatio="xMidYMid slice">${dots(p, 46, .45).replace(/cy="([\d.]+)"/g, (m, y) => `cy="${(y * .525).toFixed(1)}"`)}</svg>
  <div class="lg">${icon(p, { bg: false, fit: .94 })}</div>
  <div class="tx"><div class="k">${P.hello}</div><h1>Mana Orbit</h1><div class="sub">${P.hunt}</div><div class="rule"></div></div><div class="u">manaorbit.app</div></div>`; };

const browser = await pw.chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const page = await browser.newPage();

// Cadres des dessins
await page.setContent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1000" height="1000"><style>.evl-glow,.m .evl-fine{display:none}</style>
  ${ALL.map(p => `<g id="f-${p}">${EV_LOGO[p]}</g><g id="m-${p}" class="m">${EV_LOGO[p]}</g>`).join('')}</svg>`);
BOX = await page.evaluate(ps => Object.fromEntries(ps.map(p => {
  const pad = b => ({ x: b.x - 1.6, y: b.y - 1.6, w: b.width + 3.2, h: b.height + 3.2 });
  return [p, { full: pad(document.getElementById('f-' + p).getBBox()), mini: pad(document.getElementById('m-' + p).getBBox()) }];
})), ALL);

/** Capture d'un balisage (SVG ou HTML) en PNG w × h, fond transparent ; round : découpé en rond (icône ronde d'Android). */
const shot = async (file, w, h, html, round) => {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<style>html,body{margin:0;background:transparent}body>svg{display:block;width:${w}px;height:${h}px${round ? ';border-radius:50%' : ''}}</style>${html}`);
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
};

for (const p of TODO) {
  const SRC = ROOT + `docs/evenements/logos/${p}/`, OUT = ROOT + `pwa/icons/events/${p}/`, AND = SRC + 'android/';
  for (const d of [SRC, OUT, AND + 'mipmap-anydpi-v26/']) mkdirSync(d, { recursive: true });
  const any = icon(p, { fit: FIT.any }), mask = icon(p, { bleed: true, fit: FIT.mask });
  const fg = icon(p, { bg: false, fit: FIT.fg }), bgl = icon(p, { bleed: true, logo: false });
  writeFileSync(SRC + 'logo.svg', any + '\n');
  writeFileSync(SRC + 'logo-maskable.svg', mask + '\n');
  writeFileSync(SRC + 'android-foreground.svg', fg + '\n');
  writeFileSync(SRC + 'android-background.svg', bgl + '\n');
  writeFileSync(OUT + 'icon.svg', any + '\n');
  await shot(OUT + 'icon-512.png', 512, 512, any);
  await shot(OUT + 'icon-192.png', 192, 192, any);
  await shot(OUT + 'maskable-512.png', 512, 512, mask);
  await shot(OUT + 'apple-touch-icon.png', 180, 180, mask);
  await shot(OUT + 'favicon-32.png', 32, 32, icon(p, { fit: FIT.fav, mini: true }));
  await shot(OUT + 'discord-512.png', 512, 512, icon(p, { bleed: true, fit: FIT.discord }));
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(social(p));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUT + 'social-1200x630.png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
  // Android : icônes classiques et rondes (avant Android 8), icône adaptative (fond + dessin dans la zone sûre de 66 dp sur 108), mêmes tailles que make-icons.mjs
  const n0 = 'ic_launcher_' + p;
  if (process.argv.includes('--quick')) { console.log(p, ': icônes (--quick : sans Android)'); continue; }
  for (const [d, n] of [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]) {
    const dir = AND + 'mipmap-' + d + '/'; mkdirSync(dir, { recursive: true });
    await shot(dir + n0 + '.png', 48 * n, 48 * n, any);
    await shot(dir + n0 + '_round.png', 48 * n, 48 * n, mask, true);
    await shot(dir + n0 + '_foreground.png', 108 * n, 108 * n, fg);
    await shot(dir + n0 + '_background.png', 108 * n, 108 * n, bgl);
  }
  const xml = `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@mipmap/${n0}_background"/>\n    <foreground android:drawable="@mipmap/${n0}_foreground"/>\n</adaptive-icon>\n`;
  writeFileSync(AND + `mipmap-anydpi-v26/${n0}.xml`, xml);
  writeFileSync(AND + `mipmap-anydpi-v26/${n0}_round.xml`, xml);
  console.log(p, ': icônes, favicon, Discord, réseaux, Android');
}

// Planche de contrôle : PNG produits (relus du disque) + logo de l'en-tête (symbole de viewBox 6 8 88 88, comme #i-logo) à 28 px sur fond clair et sombre.
if (!ARGS.length || process.argv.includes('--sheet')) {
  const b64 = f => 'data:image/png;base64,' + readFileSync(f).toString('base64');
  const base = (/<symbol id="i-logo" viewBox="6 8 88 88">([\s\S]*?)<\/symbol>/.exec(readFileSync(ROOT + 'src/body.html', 'utf8')) || [])[1] || '';   // logo normal, pour comparer
  const sym = `<symbol id="sym-base" viewBox="6 8 88 88">${base}</symbol>` + ALL.map(p => `<symbol id="sym-${p}" viewBox="6 8 88 88">${EV_LOGO[p]}</symbol>`).join('');
  const head = (p, dark) => `<div class="hd ${dark ? 'dk' : ''}"><svg class="logo"><use href="#sym-${p}"/></svg><b>Mana Orbit</b><svg class="logo big"><use href="#sym-${p}"/></svg></div>`;
  // Icône adaptative d'Android telle qu'un lanceur la montre : fond + dessin (108 dp), 72 dp visibles au centre, en rond
  const adaptive = p => { const m = ROOT + `docs/evenements/logos/${p}/android/mipmap-xxxhdpi/ic_launcher_${p}`; return existsSync(m + '_foreground.png')
    ? `<div class="adp"><img src="${b64(m + '_background.png')}"><img src="${b64(m + '_foreground.png')}"></div>` : ''; };
  const row = (p, name, d) => `<div class="row"><div class="lab">${name}</div>
    <img src="${b64(d + 'icon-512.png')}" width="256" height="256"><img src="${b64(d + 'icon-192.png')}" width="192" height="192">
    <img class="circ" src="${b64(d + 'maskable-512.png')}" width="192" height="192">
    <div class="fav"><img src="${b64(d + 'favicon-32.png')}" width="32" height="32"><img class="px" src="${b64(d + 'favicon-32.png')}" width="128" height="128"></div>
    <div class="hds">${head(p, false)}${head(p, true)}</div>${adaptive(p, d)}
    ${existsSync(d + 'social-1200x630.png') ? `<img src="${b64(d + 'social-1200x630.png')}" width="300" height="158" class="soc">` : ''}</div>`;
  const rows = row('base', 'Normal', ROOT + 'pwa/icons/') + ALL.map(p => row(p, PACKS[p].name, ROOT + `pwa/icons/events/${p}/`)).join('');
  const html = `<style>${FACES}body{margin:0;background:#c9ceda;font-family:'MO Text',sans-serif}.sh{padding:20px;display:grid;gap:14px}
    .row{display:flex;align-items:center;gap:22px;background:#e9ecf3;border-radius:18px;padding:14px 20px}.lab{width:110px;font:700 17px 'MO Display';color:#10152b}
    .circ{border-radius:50%;outline:2px dashed #0003;outline-offset:6px}.fav{display:flex;align-items:center;gap:14px}.px{image-rendering:pixelated}
    .hds{display:grid;gap:10px}.hd{display:flex;align-items:center;gap:10px;width:260px;white-space:nowrap;padding:10px 16px;border-radius:12px;background:#fff;color:#10152b;font:700 17px 'MO Display'}
    .hd.dk{background:#0b0f1c;color:#eaeefb}.logo{width:28px;height:28px;flex:none;color:currentColor;overflow:visible;filter:drop-shadow(0 3px 8px rgba(127,176,255,.45))}
    .logo.big{width:112px;height:112px;margin-left:10px;filter:none}.soc{border-radius:8px}
    .adp{position:relative;width:132px;height:132px;border-radius:50%;overflow:hidden;flex:none}.adp img{position:absolute;left:-33px;top:-33px;width:198px;height:198px}</style>
    <svg width="0" height="0" style="position:absolute">${sym}</svg><div class="sh">${rows}</div>`;
  mkdirSync(ROOT + 'shots', { recursive: true });
  await page.setViewportSize({ width: 1860, height: 400 });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const h = await page.evaluate(() => document.querySelector('.sh').offsetHeight);
  await page.setViewportSize({ width: 1860, height: h });
  await page.screenshot({ path: ROOT + 'shots/event-logos.png', fullPage: true });
  console.log('planche : shots/event-logos.png');
}
await browser.close();
