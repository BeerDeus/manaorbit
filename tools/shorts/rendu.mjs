// Rendu d'une vidéo courte (Reels / Shorts) : page HTML animée tools/shorts/<id>.html → images (Playwright) → MP4 (ffmpeg) avec la voix off voix/<id>.wav.
// La page expose : window.DUREE (s), window.DECALAGE_VOIX (s, début de la voix), window.COUVERTURE (s, facultatif : image de couverture, page en classe
// « couv ») et window.seek(ms) qui place toutes les animations à l'instant voulu (rendu déterministe). Avant la page, on injecte window.MANA (symboles
// de mana, tools/fonts/mana-symbols.mjs) et window.MOTS_VOIX (mots de voix.json et leurs instants dans le WAV, mots.mjs) pour lancement.js.
// Usage : node tools/shorts/rendu.mjs <id> [--ips=30] [--crf=20] [--garder-images] [--apercu=1.2,4,7.5]
//   → tools/shorts/rendu/<id>.mp4 + <id>.png (couverture) ; --apercu : seulement les images à ces instants (rendu/<id>-<t>.png), sans MP4
import { createRequire } from 'node:module';
import { mkdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { MANA } from '../fonts/mana-symbols.mjs';
import { mots } from './mots.mjs';

const DIR = dirname(fileURLToPath(import.meta.url)), OUT = join(DIR, 'rendu');
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const id = process.argv.slice(2).find(a => !a.startsWith('--'));
if (!id || !existsSync(join(DIR, id + '.html'))) { console.error('Usage : node tools/shorts/rendu.mjs <id>   (page tools/shorts/<id>.html)'); process.exit(1); }
const IPS = Number(arg('ips', 30)), W = 1080, H = 1920, apercu = arg('apercu', '');
const voix = join(DIR, 'voix', id + '.wav'), images = join(OUT, id + '-images');
const texte = (JSON.parse(readFileSync(join(DIR, 'voix.json'), 'utf8')).videos.find(v => v.id === id) || {}).texte;
const MOTS = existsSync(voix) && texte ? mots(voix, texte, 0) : [];
mkdirSync(OUT, { recursive: true });

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const fail = m => { console.error(`${id} : ${m}`); process.exit(1); };
page.on('pageerror', e => fail(e.message));
page.on('requestfailed', r => fail(`introuvable : ${r.url()}`));
await page.addInitScript(`window.MANA = ${JSON.stringify(MANA)}; window.MOTS_VOIX = ${JSON.stringify(MOTS)};`);
await page.goto('file://' + join(DIR, id + '.html'));
await page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map(i => i.decode().catch(() => {}))]));
const { DUREE, DECALAGE_VOIX = 0, COUVERTURE } = await page.evaluate(() => ({ DUREE: window.DUREE, DECALAGE_VOIX: window.DECALAGE_VOIX, COUVERTURE: window.COUVERTURE }));
const shot = async (t, path) => { await page.evaluate(ms => window.seek(ms), t * 1000); await page.screenshot({ path, type: 'png' }); };

if (apercu) {
  for (const t of apercu.split(',').map(Number)) { await shot(t, join(OUT, `${id}-${t}.png`)); console.log(join(OUT, `${id}-${t}.png`)); }
  await browser.close(); process.exit(0);
}
rmSync(images, { recursive: true, force: true }); mkdirSync(images, { recursive: true });
const n = Math.round(DUREE * IPS);
console.log(`${id} : ${DUREE} s, ${n} images à ${IPS} i/s${existsSync(voix) ? `, voix à +${DECALAGE_VOIX} s` : ', sans voix'}`);
for (let i = 0; i < n; i++) {
  await shot(i / IPS, join(images, String(i).padStart(4, '0') + '.png'));
  if (i % IPS === 0) process.stdout.write(`\r  ${(i / IPS).toFixed(0)} s`);
}
process.stdout.write('\n');
await page.evaluate(() => document.body.classList.add('couv'));
await shot(COUVERTURE ?? 0.8, join(OUT, id + '.png'));
await browser.close();

const mp4 = join(OUT, id + '.mp4');
const args = ['-y', '-loglevel', 'error', '-framerate', String(IPS), '-i', join(images, '%04d.png')];
if (existsSync(voix)) args.push('-i', voix, '-filter_complex', `[1:a]adelay=${Math.round(DECALAGE_VOIX * 1000)}|${Math.round(DECALAGE_VOIX * 1000)},apad[a]`, '-map', '0:v', '-map', '[a]', '-c:a', 'aac', '-b:a', '192k', '-shortest');
args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', arg('crf', '20'), '-preset', 'medium', '-r', String(IPS), '-movflags', '+faststart', mp4);
execFileSync('ffmpeg', args, { stdio: 'inherit' });
if (!process.argv.includes('--garder-images')) rmSync(images, { recursive: true, force: true });
console.log(`${mp4}\n${join(OUT, id + '.png')} (couverture)`);
