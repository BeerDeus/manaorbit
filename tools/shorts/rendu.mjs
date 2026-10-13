// Rendu d'une vidéo courte (Reels / Shorts) : page HTML animée tools/shorts/<id>.html → images (Playwright) → MP4 (ffmpeg) avec la voix off voix/<id>.wav.
// La page expose : window.DUREE (s), window.DECALAGE_VOIX (s, début de la voix) et window.seek(ms) qui place toutes les animations à l'instant voulu (rendu déterministe).
// Usage : node tools/shorts/rendu.mjs <id> [--ips=30] [--garder-images]   → tools/shorts/rendu/<id>.mp4 + <id>.png (couverture)
import { createRequire } from 'node:module';
import { mkdirSync, existsSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const DIR = dirname(fileURLToPath(import.meta.url)), OUT = join(DIR, 'rendu');
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const id = process.argv.slice(2).find(a => !a.startsWith('--'));
if (!id || !existsSync(join(DIR, id + '.html'))) { console.error('Usage : node tools/shorts/rendu.mjs <id>   (page tools/shorts/<id>.html)'); process.exit(1); }
const IPS = Number(arg('ips', 30)), W = 1080, H = 1920;
const voix = join(DIR, 'voix', id + '.wav'), images = join(OUT, id + '-images');
rmSync(images, { recursive: true, force: true }); mkdirSync(images, { recursive: true });

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto('file://' + join(DIR, id + '.html'));
await page.evaluate(() => document.fonts.ready);
const { DUREE, DECALAGE_VOIX = 0 } = await page.evaluate(() => ({ DUREE: window.DUREE, DECALAGE_VOIX: window.DECALAGE_VOIX }));
const n = Math.round(DUREE * IPS);
console.log(`${id} : ${DUREE} s, ${n} images à ${IPS} i/s${existsSync(voix) ? `, voix à +${DECALAGE_VOIX} s` : ', sans voix'}`);
for (let i = 0; i < n; i++) {
  await page.evaluate(ms => window.seek(ms), (i / IPS) * 1000);
  await page.screenshot({ path: join(images, String(i).padStart(4, '0') + '.png'), type: 'png' });
  if (i % IPS === 0) process.stdout.write(`\r  ${(i / IPS).toFixed(0)} s`);
}
process.stdout.write('\n');
await browser.close();

mkdirSync(OUT, { recursive: true });
const mp4 = join(OUT, id + '.mp4');
const args = ['-y', '-loglevel', 'error', '-framerate', String(IPS), '-i', join(images, '%04d.png')];
if (existsSync(voix)) args.push('-i', voix, '-filter_complex', `[1:a]adelay=${Math.round(DECALAGE_VOIX * 1000)}|${Math.round(DECALAGE_VOIX * 1000)},apad[a]`, '-map', '0:v', '-map', '[a]', '-c:a', 'aac', '-b:a', '192k', '-shortest');
args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-r', String(IPS), '-movflags', '+faststart', mp4);
execFileSync('ffmpeg', args, { stdio: 'inherit' });
copyFileSync(join(images, String(Math.min(n - 1, Math.round(0.8 * IPS))).padStart(4, '0') + '.png'), join(OUT, id + '.png'));
if (!process.argv.includes('--garder-images')) rmSync(images, { recursive: true, force: true });
console.log(`${mp4}\n${join(OUT, id + '.png')} (couverture)`);
