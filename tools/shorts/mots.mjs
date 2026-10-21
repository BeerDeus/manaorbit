// Instant de chaque mot d'une voix off (sans modèle de reconnaissance : l'accès aux modèles est fermé dans le conteneur), pour les sous-titres et les
// apparitions calées sur la voix (data-in="scannes" dans les pages). Méthode : énergie du WAV par tranches de 10 ms → pauses ; les grandes pauses sont
// appariées aux ponctuations du texte (programmation dynamique sur l'instant attendu) ; entre deux repères, les mots se partagent le temps parlé
// au prorata de leurs syllabes. Précision de l'ordre de 0,1 à 0,2 s, suffisante pour des sous-titres par groupes de mots.
// Usage : node tools/shorts/mots.mjs <id> [--decalage=0.4]   → un mot par ligne avec ses instants dans la vidéo
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOP = 0.01;
/** PCM 16 bits mono d'un WAV (morceaux RIFF lus un par un : Gemini ajoute un morceau de provenance après les données). */
function pcm(buf) {
  let rate = 24000, data = null;
  for (let o = 12; o + 8 <= buf.length;) {
    const id = buf.toString('latin1', o, o + 4), n = buf.readUInt32LE(o + 4);
    if (id === 'fmt ') rate = buf.readUInt32LE(o + 12);
    if (id === 'data') data = buf.subarray(o + 8, Math.min(buf.length, o + 8 + n));
    o += 8 + n + (n & 1);
  }
  const s = new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + (data.length & ~1)));
  return { s, rate };
}
/** Niveau (dB) par tranche de 10 ms, fenêtre de 20 ms. */
function niveaux({ s, rate }) {
  const hop = Math.round(rate * HOP), win = hop * 2, out = [];
  for (let i = 0; i + win <= s.length; i += hop) { let e = 0; for (let j = i; j < i + win; j++) e += s[j] * s[j]; out.push(10 * Math.log10(e / win / 32768 / 32768 + 1e-10)); }
  return out;
}
const syllabes = w => Math.max(1, (w.toLowerCase().replace(/es?$/, '').match(/[aeiouyàâäéèêëîïôöûùü]+/g) || []).length);
/** Mots du texte (ponctuation gardée pour l'affichage) et force de la ponctuation qui suit chacun (0 : aucune, 1 : virgule, 2 : point). */
export function decoupe(texte) {
  return texte.replace(/\s+([:;?!»])/g, ' $1').split(/[ \t\n]+/).filter(Boolean).map(w => ({ w, syl: syllabes(w.replace(/[^\p{L}\p{N}]/gu, '') || 'a'), ponct: /[.?!]$/.test(w) ? 2 : /[,:;]$/.test(w) ? 1 : 0 }));
}

export function mots(wav, texte, decalage = 0.4) {
  const db = niveaux(pcm(readFileSync(wav))), sorted = [...db].sort((a, b) => a - b);
  const bas = sorted[Math.floor(sorted.length * 0.1)], haut = sorted[Math.floor(sorted.length * 0.95)], seuil = Math.max(bas + 8, haut - 32);
  const voix = db.map(d => d > seuil);
  for (let i = 0; i < voix.length;) { if (voix[i]) { i++; continue; } let j = i; while (j < voix.length && !voix[j]) j++; if (i > 0 && j < voix.length && j - i < 5) voix.fill(true, i, j); i = j; }      // trous < 50 ms : dans le mot
  let debut = voix.indexOf(true); const fin = voix.lastIndexOf(true) + 1;
  for (let n = 0; n < 5; n++) { let j = debut; while (voix[j]) j++; let k = j; while (k < fin && !voix[k]) k++; if (j - debut < 30 && k - j >= 8 && k < fin) debut = k; else break; }      // souffle avant la première phrase (< 300 ms puis silence) : ignoré
  const pauses = [];
  for (let i = debut; i < fin;) { if (voix[i]) { i++; continue; } let j = i; while (!voix[j]) j++; if (j - i >= 12) pauses.push({ a: i, b: j }); i = j; }      // pauses ≥ 120 ms
  const W = decoupe(texte), poids = W.map(w => w.syl), total = poids.reduce((a, b) => a + b, 0) + W.reduce((a, w) => a + w.ponct * 1.2, 0);
  // instant attendu (en tranches) de chaque frontière ponctuée, à débit constant
  const parle = fin - debut, fr = [];
  let cum = 0;
  W.forEach((w, i) => { cum += w.syl; if (w.ponct && i < W.length - 1) fr.push({ i, t: debut + parle * (cum + w.ponct * 0.6) / total, f: w.ponct }); cum += w.ponct * 1.2; });
  // appariement frontières ↔ pauses (ordre conservé) : coût = écart d'instant ; frontière sans pause ou pause sans frontière : pénalité
  const F = fr.length, P = pauses.length, C = Array.from({ length: F + 1 }, () => new Float64Array(P + 1).fill(Infinity)), Z = Array.from({ length: F + 1 }, () => new Int8Array(P + 1));
  C[0][0] = 0;
  for (let i = 0; i <= F; i++) for (let k = 0; k <= P; k++) {
    if (i && C[i - 1][k] + 40 * fr[i - 1].f < C[i][k]) { C[i][k] = C[i - 1][k] + 40 * fr[i - 1].f; Z[i][k] = 1; }
    if (k && C[i][k - 1] + (pauses[k - 1].b - pauses[k - 1].a) * 1.5 < C[i][k]) { C[i][k] = C[i][k - 1] + (pauses[k - 1].b - pauses[k - 1].a) * 1.5; Z[i][k] = 2; }
    if (i && k) { const p = pauses[k - 1], c = C[i - 1][k - 1] + Math.abs((p.a + p.b) / 2 - fr[i - 1].t) * 0.6; if (c < C[i][k]) { C[i][k] = c; Z[i][k] = 3; } }
  }
  const lien = new Map();
  for (let i = F, k = P; i || k;) { const z = Z[i][k]; if (z === 3) lien.set(fr[i - 1].i, pauses[k - 1]); if (z !== 2) i--; if (z !== 1) k--; }
  // segments entre repères : temps parlé partagé au prorata des syllabes
  const out = [];
  let s0 = debut, w0 = 0;
  const pose = (w1, s1) => {
    const ts = []; for (let t = s0; t < s1; t++) if (voix[t]) ts.push(t);
    const tot = poids.slice(w0, w1).reduce((a, b) => a + b, 0); let c = 0;
    for (let i = w0; i < w1; i++) {
      const at = f => ts.length ? ts[Math.min(ts.length - 1, Math.floor(f * ts.length))] : s0 + f * (s1 - s0);
      const a = at(c / tot); c += poids[i]; const b = i === w1 - 1 ? s1 : at(c / tot);
      out.push({ ...W[i], t0: +(a * HOP + decalage).toFixed(2), t1: +(b * HOP + decalage).toFixed(2) });
    }
  };
  for (const [i, p] of [...lien].sort((x, y) => x[0] - y[0])) { pose(i + 1, p.a); s0 = p.b; w0 = i + 1; }
  pose(W.length, fin);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const DIR = dirname(fileURLToPath(import.meta.url)), id = process.argv[2];
  const dec = Number((process.argv.find(a => a.startsWith('--decalage=')) || '=0.4').split('=')[1]);
  const v = JSON.parse(readFileSync(join(DIR, 'voix.json'), 'utf8')).videos.find(x => x.id === id);
  if (!v) { console.error('Usage : node tools/shorts/mots.mjs <id> [--decalage=0.4]'); process.exit(1); }
  for (const m of mots(join(DIR, 'voix', id + '.wav'), v.texte, dec)) console.log(`${m.t0.toFixed(2)} → ${m.t1.toFixed(2)}  ${m.w}`);
}
