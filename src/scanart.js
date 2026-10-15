/* ── scanart.js : l'illustration de la carte photographiée → son édition, quand la ligne du bas ne suffit pas (cartes d'avant 2014, ligne illisible) ──────────
   Tout se passe sur le téléphone : seules les impressions de la carte déjà reconnue par son nom sont comparées (scaned.js : SC.pr), avec leurs petites images Scryfall
   (cards.scryfall.io, lisibles en CORS, gardées par le service worker). Empreinte : la moitié haute de la carte (nom, illustration) réduite à ART_W × ART_H, chaque canal
   ramené à moyenne 0 et écart type 1 (la lumière et la balance des blancs du téléphone comptent peu), plus les écarts entre cases voisines (formes). Distance : écart
   quadratique moyen. Retenue si nettement plus proche que les autres (ART_RATIO) ; plusieurs impressions de la même illustration (rééditions) : le groupe est rendu,
   l'extension du scan départage (scaned.js). Seulement en cadrage « carte entière » (la capture est la carte). Images en Wi-Fi au-delà de ART_MOBILE impressions. */
const ART_W = 12, ART_H = 16, ART_BOX = { x: 0.05, y: 0.035, w: 0.9, h: 0.54 };      // haut de la carte : nom, mana, illustration (le texte, différent d'une langue à l'autre, est laissé)
const ART_RATIO = 1.3, ART_MAX = 0.9, ART_CAND = 60, ART_MOBILE = 16;      // 2e plus proche ≥ 1,3 × la 1re ; distance au-delà de laquelle rien n'est sûr ; impressions comparées au plus
const SART = { cache: new Map(), load: new Map(), busy: false, last: null };

/** Pixels RGBA (w × h, déjà réduits à ART_W × ART_H) → empreinte : 3 canaux normalisés, puis écarts horizontaux et verticaux du gris. */
function artSigData(d, w, h) {
  const n = w * h, out = new Float32Array(n * 3 + (w - 1) * h + w * (h - 1));
  for (let c = 0; c < 3; c++) {
    let m = 0; for (let i = 0; i < n; i++) m += d[i * 4 + c]; m /= n;
    let s = 0; for (let i = 0; i < n; i++) { const v = d[i * 4 + c] - m; s += v * v; } s = Math.sqrt(s / n) || 1;
    for (let i = 0; i < n; i++) out[c * n + i] = (d[i * 4 + c] - m) / s;
  }
  const g = i => (out[i] + out[n + i] + out[2 * n + i]) / 3;
  let k = n * 3;
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) out[k++] = g(y * w + x + 1) - g(y * w + x);
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) out[k++] = g((y + 1) * w + x) - g(y * w + x);
  return out;
}
/** Distance entre deux empreintes (écart quadratique moyen) ; Infinity si l'une manque. */
function artDist(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let s = 0; for (let i = 0; i < a.length; i++) { const v = a[i] - b[i]; s += v * v; }
  return Math.sqrt(s / a.length);
}
/** Empreinte d'une image (canvas, image) : zone ART_BOX de la carte qui occupe box (toute l'image par défaut). */
function artSig(src, box) {
  try {
    const W = src.naturalWidth || src.width, H = src.naturalHeight || src.height, b = box || { x: 0, y: 0, w: W, h: H };
    const c = document.createElement('canvas'); c.width = ART_W; c.height = ART_H;
    const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(src, b.x + b.w * ART_BOX.x, b.y + b.h * ART_BOX.y, b.w * ART_BOX.w, b.h * ART_BOX.h, 0, 0, ART_W, ART_H);
    const sig = artSigData(x.getImageData(0, 0, ART_W, ART_H).data, ART_W, ART_H); c.width = c.height = 0;
    return sig;
  } catch (e) { return null; }      // image non lisible (CORS refusé) : pas d'empreinte
}
/** Empreinte d'une impression d'après sa petite image Scryfall (gardée en mémoire, 800 au plus) ; null si l'image ne vient pas. */
function artPrintSig(p) {
  const u = p && p.th; if (!u) return Promise.resolve(null);
  if (SART.cache.has(u)) return Promise.resolve(SART.cache.get(u));
  if (SART.load.has(u)) return SART.load.get(u);
  const pr = new Promise(res => {
    const i = new Image(); i.crossOrigin = 'anonymous'; i.decoding = 'async';
    const t = setTimeout(() => done(null), 8000);
    const done = s => { clearTimeout(t); i.onload = i.onerror = null; SART.load.delete(u); if (s) { if (SART.cache.size >= 800) SART.cache.delete(SART.cache.keys().next().value); SART.cache.set(u, s); } res(s); };
    i.onload = () => done(artSig(i)); i.onerror = () => done(null);
    i.src = u;
  });
  SART.load.set(u, pr); return pr;
}
/** Réseau mobile ou économiseur de données. */
const artMetered = () => { try { const c = navigator.connection; return !!c && (c.saveData === true || c.type === 'cellular'); } catch (e) { return false; } };
/** Empreinte de la photo → { p (impression la plus proche, sûre), group (impressions de même illustration, à départager), d1, d2, n } ou null.
 *  prints : les candidates (une seule langue d'image suffit : l'illustration est la même). Lots de 6 images à la fois. */
async function artPick(sig, prints) {
  if (!sig || !Array.isArray(prints) || prints.length < 2) return null;
  const seen = new Set(), list = prints.filter(p => p && p.th && !seen.has(p.th) && seen.add(p.th)).slice(0, ART_CAND);
  if (list.length < 2 || (list.length > ART_MOBILE && artMetered())) return null;
  const sigs = []; for (let i = 0; i < list.length; i += 6) sigs.push(...await Promise.all(list.slice(i, i + 6).map(artPrintSig)));
  const scored = list.map((p, i) => ({ p, d: artDist(sig, sigs[i]) })).filter(x => Number.isFinite(x.d)).sort((a, b) => a.d - b.d);
  if (!scored.length) return null;
  const d1 = scored[0].d, d2 = scored[1] ? scored[1].d : Infinity, out = { d1, d2, n: scored.length };
  if (d1 > ART_MAX) return out;      // rien de proche (photo floue, autre cadrage)
  if (d2 >= d1 * ART_RATIO) return { ...out, p: scored[0].p };
  return { ...out, group: scored.filter(x => x.d < d1 * ART_RATIO).map(x => x.p) };      // même illustration (réédition) : départagée par les extensions du scan
}

if (typeof module !== 'undefined' && module.exports) module.exports = { artSigData, artDist, ART_W, ART_H, ART_RATIO, ART_MAX };
