// Contrôle des voix off (personne n'écoute à la place du propriétaire) : Gemini transcrit tools/shorts/voix/<id>.wav, le compare au texte de voix.json
// et signale ce qui cloche (mots ajoutés ou sautés, prononciation des noms propres, bruit, coupure, souffle en fin). Clé : GEMINI_API_KEY.
// Usage : node tools/shorts/ecoute.mjs [id…] [--modele=gemini-3.8-flash]   (sans id : toutes) → une ligne OK / À REFAIRE par voix, et le détail
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const KEY = process.env.GEMINI_API_KEY, MODEL = arg('modele', 'gemini-3.8-flash');
if (!KEY) { console.error('GEMINI_API_KEY absente'); process.exit(1); }
const cfg = JSON.parse(readFileSync(join(DIR, 'voix.json'), 'utf8')), ids = process.argv.slice(2).filter(a => !a.startsWith('--'));
// mots comparés sans accents ni ponctuation ; écarts d'écriture de la transcription ramenés à une forme (« 18h » = « dix-huit heures », « t'as » = « tu as »,
// « ce qu'il » = « ce qui », homophones à l'oreille)
const SAME = [[/\bdix huit heures\b/g, '18h'], [/\b18 h\b/g, '18h'], [/\bt as\b/g, 'tu as'], [/\bqu il\b/g, 'qui'], [/\bechanges\b/g, 'echange']];
const norm = s => SAME.reduce((t, [re, to]) => t.replace(re, to), s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim());
/** Part des mots du texte prévu retrouvés dans l'ordre (plus longue sous-suite commune), et mots en trop dans la transcription. */
function compare(want, got) {
  const a = norm(want).split(' '), b = norm(got).split(' '), L = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) L[i][j] = a[i - 1] === b[j - 1] ? L[i - 1][j - 1] + 1 : Math.max(L[i - 1][j], L[i][j - 1]);
  return { score: L[a.length][b.length] / a.length, extra: b.length - L[a.length][b.length], missing: a.length - L[a.length][b.length] };
}
const ASK = `Tu contrôles une voix off française générée pour une courte vidéo. Écoute le fichier en entier.
Réponds en JSON strict : {"transcription": "...mot pour mot, ponctuation comprise...", "problemes": ["..."], "fin_propre": true|false, "naturel": 1-5}
- problemes : tout ce qui gênerait à l'écoute (mot ajouté, répété ou improvisé, phrase sautée, mauvaise prononciation d'un nom comme ManaBox, Mana Orbit, Cardmarket, Commander, CSV, Google Play, accent qui n'est pas français de France, bruit, clic, souffle ou « pfff » à la fin, coupure au milieu d'un mot, longs silences). Liste vide si rien.
- fin_propre : la voix se termine sans bruit ni souffle parasite.
- naturel : 5 = on dirait une vraie personne, 1 = robotique.`;
for (const v of cfg.videos.filter(x => !ids.length || ids.includes(x.id))) {
  const f = join(DIR, 'voix', v.id + '.wav'); if (!existsSync(f)) { console.log(`${v.id} : pas de voix (node tools/shorts/voix.mjs ${v.id})`); continue; }
  const body = { contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/wav', data: readFileSync(f).toString('base64') } }, { text: ASK }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } };
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify(body) });
    const j = await r.json(); if (!r.ok) throw new Error(`HTTP ${r.status} ${(j.error && j.error.message) || ''}`.slice(0, 200));
    const out = JSON.parse(((((j.candidates || [])[0] || {}).content || {}).parts || []).map(p => p.text || '').join('')), c = compare(v.texte, out.transcription || '');
    const ok = c.score >= 0.95 && c.extra <= 2 && out.fin_propre !== false && !(out.problemes || []).length;
    console.log(`${ok ? 'OK       ' : 'À REFAIRE'} ${v.id} : ${(c.score * 100).toFixed(0)} % du texte, ${c.extra} mot(s) en trop, ${c.missing} manquant(s), naturel ${out.naturel}/5, fin ${out.fin_propre ? 'propre' : 'à revoir'}`);
    if (!ok || process.argv.includes('--detail')) { console.log(`    entendu : « ${out.transcription} »`); for (const p of out.problemes || []) console.log(`    - ${p}`); }
  } catch (e) { console.log(`?         ${v.id} : contrôle impossible (${e.message})`); process.exitCode = 1; }
}
