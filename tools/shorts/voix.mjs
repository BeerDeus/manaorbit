// Voix off des vidéos courtes (Reels / Shorts) : Gemini TTS (API Google AI Studio), un fichier WAV par vidéo dans tools/shorts/voix/.
// Clé : variable d'environnement GEMINI_API_KEY (réglages de l'environnement, jamais dans le dépôt). Textes : tools/shorts/voix.json.
// Usage : node tools/shorts/voix.mjs [id…]   (sans id : toutes) · options : --voix=Achird --modele=gemini-3.8-flash-tts --suffixe=-aoede (nom de fichier, pour comparer des voix) --force
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url)), OUT = join(DIR, 'voix');
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY absente : à ajouter dans les réglages de l\'environnement (nouvelle session).'); process.exit(1); }
const cfg = JSON.parse(readFileSync(join(DIR, 'voix.json'), 'utf8'));
const MODEL = arg('modele', cfg.modele), VOICE = arg('voix', cfg.voix), SUFFIX = arg('suffixe', ''), FORCE = process.argv.includes('--force');
const ids = process.argv.slice(2).filter(a => !a.startsWith('--'));
mkdirSync(OUT, { recursive: true });

/** PCM 16 bits (audio/L16;rate=24000) → WAV mono. */
function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
async function say(text, style) {
  // le style passe en consigne devant le texte (marche avec tous les modèles TTS de Gemini)
  const body = { contents: [{ role: 'user', parts: [{ text: `${style}\n\n${text}` }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } } };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`HTTP ${r.status} : ${(j.error && j.error.message) || ''}`.slice(0, 300));
  const part = (((j.candidates || [])[0] || {}).content || {}).parts || [], d = part.find(p => p.inlineData && p.inlineData.data);
  if (!d) throw new Error('pas d\'audio dans la réponse');
  const rate = Number((/rate=(\d+)/.exec(d.inlineData.mimeType || '') || [])[1]) || 24000;
  return wav(Buffer.from(d.inlineData.data, 'base64'), rate);
}
for (const v of cfg.videos.filter(x => !ids.length || ids.includes(x.id))) {
  const f = join(OUT, v.id + SUFFIX + '.wav');
  if (existsSync(f) && !FORCE) { console.log(`${v.id} : déjà là (--force pour refaire)`); continue; }
  try { const buf = await say(v.texte, [cfg.style, v.ton].filter(Boolean).join(' ')); writeFileSync(f, buf); console.log(`${v.id} : ${(buf.length / 48000).toFixed(1)} s → ${f}`); }
  catch (e) { console.error(`${v.id} : échec (${e.message})`); process.exitCode = 1; }
}
