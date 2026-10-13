// Instants des phrases d'une voix off (silences mesurés par ffmpeg), pour caler les --in / --out d'une page <id>.html.
// Usage : node tools/shorts/phrases.mjs <id> [--decalage=0.4] [--seuil=-35] [--pause=0.25]
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const id = process.argv.slice(2).find(a => !a.startsWith('--')), dec = Number(arg('decalage', 0.4));
if (!id) { console.error('Usage : node tools/shorts/phrases.mjs <id> [--decalage=0.4]'); process.exit(1); }
const f = join(dirname(fileURLToPath(import.meta.url)), 'voix', id + '.wav');
const out = spawnSync('ffmpeg', ['-i', f, '-af', `silencedetect=noise=${arg('seuil', -35)}dB:d=${arg('pause', 0.25)}`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr; // ffmpeg écrit sur stderr
const total = Number(/Duration: (\d+):(\d+):([\d.]+)/.exec(out).slice(1).reduce((a, x, i) => a + Number(x) * [3600, 60, 1][i], 0));
const cuts = [...out.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
let t = 0, n = 0;
console.log(`${id} : ${total.toFixed(2)} s de voix, décalage +${dec} s dans la vidéo`);
for (const [s, e] of [...cuts, [total, total]]) { console.log(`  phrase ${++n} : ${(t + dec).toFixed(2)} → ${(s + dec).toFixed(2)} s`); t = e; }
console.log(`  fin de la voix : ${(total + dec).toFixed(2)} s`);
