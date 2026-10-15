/* ── scanfoot.js : la petite ligne en bas à gauche d'une carte → son édition exacte ──────────────────────────────────────────────────────────
   Cartes imprimées depuis 2014 (M15) : « 123/269 R » puis « M15 • EN » ; format récent : « 0123 R » puis « MKM • FR » (★ au lieu de • : foil).
   La lecture n'a pas à être parfaite : seules les impressions de la carte déjà reconnue par son nom sont candidates (scaned.js, une à quelques
   centaines pour un terrain de base), et un code d'extension ou un numéro lus de travers se comparent en tenant compte des confusions de l'OCR (0/O, 1/I, 5/S…).
   Avant 2014 : pas de code d'extension sur la carte, rien de sûr (null). */

/** Code de langue imprimé → langue des cartes de l'appli. */
const FOOT_LANG = { EN: 'en', FR: 'fr', DE: 'de', ES: 'es', IT: 'it', PT: 'pt', JA: 'jp', JP: 'jp', KO: 'kr', KR: 'kr', RU: 'ru', CS: 'zh-CN', ZHS: 'zh-CN', CT: 'zh-TW', ZHT: 'zh-TW' };
/** Langue Scryfall d'une impression (p.l) → langue de l'appli. */
const FOOT_SL = { en: 'en', fr: 'fr', de: 'de', es: 'es', it: 'it', pt: 'pt', ja: 'jp', ko: 'kr', ru: 'ru', zhs: 'zh-CN', zht: 'zh-TW' };
/** Caractères que l'OCR confond : même classe = même caractère. */
const FOOT_CLS = { 0: '0', O: '0', Q: '0', D: '0', 1: '1', I: '1', L: '1', '|': '1', '!': '1', 2: '2', Z: '2', 5: '5', S: '5', 6: '6', G: '6', 8: '8', B: '8', 7: '7', T: '7' };
const footCls = ch => FOOT_CLS[ch] || ch;
/** Deux codes de même longueur égaux aux confusions de l'OCR près (« M1S » = « M15 », « 0NE » = « ONE »). */
function footSame(a, b) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && footCls(a[i]) !== footCls(b[i])) return false;
  return true;
}
/** Jeton lu comme un numéro (« 0123 », « O123 », « 12S ») → numéro sans les zéros de tête (« 123 »), sinon ''. */
function footNum(t) {
  const m = /^([0-9OQDIL|!ZSBGT]{1,4})([A-Z]?)$/.exec(t); if (!m) return '';
  if ((m[1].match(/\d/g) || []).length * 2 < m[1].length) return '';      // au moins la moitié de vrais chiffres : « BL8 » est un code, « O28O » un numéro
  const d = [...m[1]].map(footCls).join('');
  if (!/^\d+$/.test(d)) return '';
  return (d.replace(/^0+(?=\d)/, '') + m[2].toLowerCase());
}
/** Lignes lues dans le coin bas gauche → { nums: ['123', …], codes: ['MKM', …], lang ('fr' | ''), foil (true : ★ lue) }, ou null si rien d'utile. */
function footParse(lines) {
  const raw = (Array.isArray(lines) ? lines.map(l => (l && l.text != null ? l.text : l)) : [lines]).join('\n').toUpperCase();
  if (!raw.trim()) return null;
  const nums = [], codes = [], strong = [];
  let lang = '', foil = false;
  for (const m of raw.matchAll(/([0-9OQDIL|!ZSBGT]{1,4})\s*[/\\]\s*([0-9OQDIL|!ZSBGT]{2,4})/g)) { const n = footNum(m[1]); if (n) nums.push(n); }      // « 123/269 » : le numéro, pas le total
  const toks = raw.replace(/[/\\]\s*[0-9OQDIL|!ZSBGT]{2,4}/g, ' ').split(/[^A-Z0-9|!★*✶☆•·]+/).flatMap(t => t.split(/(?=[★*✶☆•·])|(?<=[★*✶☆•·])/)).filter(Boolean);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (/^[★*✶☆]$/.test(t)) { if (i > 0 && /^[A-Z0-9]{2,5}$/.test(toks[i - 1]) && FOOT_LANG[toks[i + 1]]) foil = true; continue; }      // « MKM ★ FR » : foil
    if (/^[•·]$/.test(t)) continue;
    if (FOOT_LANG[t] && t.length <= 3 && i > 0 && /^[A-Z0-9]{2,5}$|^[★*✶☆•·]$/.test(toks[i - 1]) && !lang) { lang = FOOT_LANG[t]; if (t.length === 2) continue; }
    const n = footNum(t); if (n) { if (!nums.includes(n)) nums.push(n); if (!/[A-Z]$/.test(t)) continue; }      // « 40K », « 10E » : numéro à lettre ou code d'extension, gardé des deux côtés
    if (/^[A-Z0-9]{2,5}$/.test(t) && /[A-Z]/.test(t) && !codes.includes(t)) { codes.push(t); if (/^[★*✶☆•·]$/.test(toks[i + 1] || '') || FOOT_LANG[toks[i + 1]]) strong.push(t); }
  }
  if (strong.length) codes.splice(0, codes.length, ...strong);      // code suivi de la puce, de l'étoile ou de la langue : le nom de l'artiste (même ligne) n'est pas un code
  if (!nums.length && !strong.length) return null;      // ni numéro, ni code suivi de « • FR » : pas une ligne du bas (un nom de carte lu, « Llanowar Elves »)
  return { nums, codes, lang, foil };
}
/** Édition d'après la ligne du bas, parmi les impressions de la carte reconnue (prints : [{ set, num, l, fx }]) :
 *  { p (impression), how: 'both' (extension et numéro : sûre) | 'set' (extension seule, une seule impression dedans) | 'num' (numéro seul, unique), lang, foil }
 *  ou { set, lang, foil } (extension lue, plusieurs impressions dedans : à départager), ou null. */
function footMatch(lines, prints) {
  const f = Array.isArray(lines) || typeof lines === 'string' ? footParse(lines) : lines;
  if (!f || !Array.isArray(prints) || !prints.length) return null;
  const pn = p => String(p.num || '').toLowerCase().replace(/^0+(?=\d)/, '');
  const setOk = p => f.codes.some(c => footSame(c, String(p.set || '').toUpperCase()));
  const numOk = p => f.nums.includes(pn(p));
  const pick = list => {      // à égalité : l'impression dans la langue lue, puis celle qui n'est pas une variante (promo, showcase…)
    if (list.length < 2) return list[0] || null;
    const byLang = f.lang ? list.filter(p => FOOT_SL[p.l || 'en'] === f.lang) : [];
    const pool = byLang.length ? byLang : list;
    return pool.length === 1 ? pool[0] : null;
  };
  const extra = { lang: f.lang, foil: f.foil };
  const both = prints.filter(p => setOk(p) && numOk(p)), b = pick(both);
  if (b) return { p: b, how: 'both', ...extra };
  if (both.length) return null;      // même extension et même numéro dans deux langues sans langue lue : rien de sûr
  const inSet = prints.filter(setOk), sets = [...new Set(inSet.map(p => p.set))];
  if (sets.length === 1) {
    const one = [...new Map(inSet.map(p => [pn(p), p])).values()];
    if (one.length === 1) { const p = pick(inSet); if (p) return { p, how: 'set', ...extra }; }
    return { set: sets[0], ...extra };
  }
  if (sets.length > 1) return null;      // deux extensions possibles (code lu de travers) : rien de sûr
  const byNum = prints.filter(numOk), nums = new Set(byNum.map(p => p.set + '/' + pn(p)));
  if (nums.size === 1) { const p = pick(byNum); if (p) return { p, how: 'num', ...extra }; }
  return null;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { footParse, footMatch, footSame, footNum, FOOT_LANG };
