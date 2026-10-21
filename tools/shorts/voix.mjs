// Voix off des vidéos courtes (Reels / Shorts) : Gemini TTS (API Google AI Studio), un fichier WAV par vidéo dans tools/shorts/voix/.
// Clé : variable d'environnement GEMINI_API_KEY (réglages de l'environnement, jamais dans le dépôt). Textes : tools/shorts/voix.json.
// Usage : node tools/shorts/voix.mjs [id…]   (sans id : toutes) · voix.json : modele, voix, temperature, coupe (s retirées en fin de voix) · options : --voix=Achird --modele=gemini-3.8-flash-tts --temperature=1.25 --suffixe=-aoede (nom de fichier, pour comparer des voix) --force
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url)), OUT = join(DIR, 'voix');
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY absente : à ajouter dans les réglages de l\'environnement (nouvelle session).'); process.exit(1); }
const cfg = JSON.parse(readFileSync(join(DIR, 'voix.json'), 'utf8'));
const MODEL = arg('modele', cfg.modele), VOICE = arg('voix', cfg.voix), SUFFIX = arg('suffixe', ''), TEMP = Number(arg('temperature', cfg.temperature)) || undefined, FORCE = process.argv.includes('--force');
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
  // consigne de style en « notes de direction » séparées du transcript : le modèle 3.x ne la lit pas (collée devant le texte, il la lisait).
  // Le texte peut contenir des balises d'expression du modèle : <short pause>, <sigh>, <chuckles>…
  const body = { contents: [{ role: 'user', parts: [{ text: `# AUDIO DIRECTOR'S NOTES\n${style}\n\n# TRANSCRIPT\n${text}` }] }],
    generationConfig: { responseModalities: ['AUDIO'], temperature: TEMP, speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } } };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`HTTP ${r.status} : ${(j.error && j.error.message) || ''}`.slice(0, 300));
  const part = (((j.candidates || [])[0] || {}).content || {}).parts || [], d = part.find(p => p.inlineData && p.inlineData.data);
  if (!d) throw new Error('pas d\'audio dans la réponse');
  const { pcm, rate } = pcmOf(Buffer.from(d.inlineData.data, 'base64'), d.inlineData.mimeType);
  return wav(coupe(pcm, rate), rate);
}
/** Son de la réponse : PCM brut (audio/L16;rate=…), ou fichier WAV (audio/wav, depuis octobre 2026) dont on ne garde que le bloc « data ». Le WAV porte après
 *  le son un bloc de provenance « C2PA » (≈ 6 Ko) : lu comme du son, il faisait un « pfff » d'environ 0,13 s à la fin de chaque voix. */
function pcmOf(buf, mime) {
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WAVE') {
    let rate = 24000, pcm = null;
    for (let o = 12; o + 8 <= buf.length;) {
      const id = buf.toString('latin1', o, o + 4), n = buf.readUInt32LE(o + 4);
      if (id === 'fmt ') { rate = buf.readUInt32LE(o + 12); if (buf.readUInt16LE(o + 8) !== 1 || buf.readUInt16LE(o + 10) !== 1 || buf.readUInt16LE(o + 22) !== 16) throw new Error('WAV inattendu (PCM 16 bits mono attendu)'); }
      if (id === 'data') pcm = buf.subarray(o + 8, Math.min(buf.length, o + 8 + n));
      o += 8 + n + (n & 1);
    }
    if (!pcm) throw new Error('WAV sans données');
    return { pcm, rate };
  }
  return { pcm: buf, rate: Number((/rate=(\d+)/.exec(mime || '') || [])[1]) || 24000 };
}
/** Retire la fin du PCM (cfg.coupe s, 0,2 par défaut : demandé par le propriétaire, la voix finit souvent sur un souffle) avec un fondu de 50 ms. */
function coupe(pcm, rate) {
  const s = Number(cfg.coupe ?? 0.2), n = Math.max(0, pcm.length / 2 - Math.round(s * rate)), out = pcm.subarray(0, n * 2), f = Math.min(n, Math.round(0.05 * rate));
  for (let i = n - f; i < n; i++) out.writeInt16LE(Math.round(out.readInt16LE(i * 2) * (n - i) / f), i * 2);
  return out;
}
for (const v of cfg.videos.filter(x => !ids.length || ids.includes(x.id))) {
  const f = join(OUT, v.id + SUFFIX + '.wav');
  if (existsSync(f) && !FORCE) { console.log(`${v.id} : déjà là (--force pour refaire)`); continue; }
  try { const buf = await say(v.texte, [cfg.style, v.ton].filter(Boolean).join(' ')); writeFileSync(f, buf); console.log(`${v.id} : ${(buf.length / 48000).toFixed(1)} s → ${f}`); }
  catch (e) { console.error(`${v.id} : échec (${e.message})`); process.exitCode = 1; }
}
