// Ta voix à la place de la voix Gemini : n'importe quel enregistrement (mémo vocal .m4a, .mp3, .wav, .ogg…) → voix/<id>.wav nettoyé, prêt pour rendu.mjs.
// Coupe les silences du début et de la fin (0,3 s gardées), retire le grondement (< 80 Hz) et un peu de souffle, resserre la dynamique ; le niveau final
// (-14 LUFS) est réglé au rendu. La voix Gemini d'origine est gardée en voix/<id>.gemini.wav. Puis : instants des mots (mots.mjs) et rapport.
// Usage : node tools/shorts/ma-voix.mjs <id> <enregistrement>   puis   node tools/shorts/ecoute.mjs <id>   et   node tools/shorts/rendu.mjs <id>
import { existsSync, copyFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mots } from './mots.mjs';

const DIR = dirname(fileURLToPath(import.meta.url)), [id, src] = process.argv.slice(2);
const v = JSON.parse(readFileSync(join(DIR, 'voix.json'), 'utf8')).videos.find(x => x.id === id);
if (!v || !src || !existsSync(src)) { console.error('Usage : node tools/shorts/ma-voix.mjs <id> <enregistrement>   (id de voix.json)'); process.exit(1); }
const out = join(DIR, 'voix', id + '.wav'), gem = join(DIR, 'voix', id + '.gemini.wav');
const duree = f => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }));
if (existsSync(out) && !existsSync(gem)) copyFileSync(out, gem);
const avant = existsSync(gem) ? duree(gem) : 0;
const af = ['highpass=f=80', 'afftdn=nf=-30',
  'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.3', 'areverse', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.3', 'areverse',
  'acompressor=threshold=-22dB:ratio=2.5:attack=8:release=120:makeup=2'].join(',');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-af', af, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', out], { stdio: 'inherit' });
const apres = duree(out), M = mots(out, v.texte, 0.3);
console.log(`${id} : ${apres.toFixed(2)} s de voix${avant ? ` (Gemini : ${avant.toFixed(2)} s, ${apres > avant ? '+' : ''}${(apres - avant).toFixed(2)} s)` : ''} → voix/${id}.wav`);
console.log(`  premier mot ${M[0].t0.toFixed(2)} s, dernier ${M[M.length - 1].t1.toFixed(2)} s dans la vidéo ; la page s'allonge ou raccourcit d'autant`);
console.log(`  vérifier que le texte lu est bien celui de voix.json : node tools/shorts/ecoute.mjs ${id}   (sinon corriger « texte » : les sous-titres le reprennent)`);
