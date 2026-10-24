/* ── scanfoot.js : la petite ligne en bas à gauche d'une carte → son édition exacte ──────────────────────────────────────────────────────────
   Cartes imprimées depuis 2014 (M15) : « 123/269 R » puis « M15 • EN » ; format récent : « 0123 R » puis « MKM • FR » (★ au lieu de • : foil).
   La lecture n'a pas à être parfaite : seules les impressions de la carte déjà reconnue par son nom sont candidates (scaned.js, une à quelques
   centaines pour un terrain de base), et un code d'extension ou un numéro lus de travers se comparent en tenant compte des confusions de l'OCR (0/O, 1/I, 5/S…).
   Avant 2014 : pas de code d'extension sur la carte ; le total « 123/249 » (2003-2022) départage deux impressions au même numéro (footTotOk). */

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
/** Code d'extension connu de l'appli (liste des extensions Scryfall, sets.js › SETIC, aux confusions de l'OCR près) ; null : liste pas encore là (sous Node, ou pas chargée). */
function footKnown(code) {
  const m = typeof SETIC !== 'undefined' && SETIC && SETIC.m; if (!m || !Object.keys(m).length) return null;
  const c = String(code || '').toLowerCase(); if (m[c]) return true;
  const u = c.toUpperCase(); return Object.keys(m).some(k => k.length === u.length && footSame(u, k.toUpperCase()));
}
const FOOT_SEP = /^[★*✶☆•·]$/;
const footCode = t => /^[A-Z0-9]{2,5}$/.test(t) && /[A-Z]/.test(t);
/**
 * Lignes lues dans le coin bas gauche → { nums: ['123', …], codes: ['MKM', …], lang ('fr' | ''), langs [{ code, lang, sep, li }], foil (true : ★ lue) }, ou null si rien d'utile.
 * La zone lue déborde souvent sur la fin du texte d'ambiance : « … qui vient DE la forêt », « … and IT burned » ne sont pas des langues. Une langue n'est retenue que
 * dans la forme « CODE • LANGUE » (puce, étoile ou point lus ; Tesseract perd souvent la puce : « DSK FR » accepté aussi), et la plus basse l'emporte (la vraie ligne
 * est la dernière de la carte) ; sans puce, elle doit être dans les deux dernières lignes, et son code ne pas être une extension inconnue (liste chargée). Les autres
 * couples restent dans langs, départagés par footMatch avec les éditions de la carte.
 */
function footParse(lines) {
  const arr = (Array.isArray(lines) ? lines.map(l => (l && l.text != null ? l.text : l)) : [lines]).flatMap(t => String(t == null ? '' : t).toUpperCase().split('\n'));
  if (!arr.join('').trim()) return null;
  const nums = [], codes = [], strong = [], langs = [], tots = [];
  let foil = false;
  arr.forEach((ln, li) => {
    for (const m of ln.matchAll(/([0-9OQDIL|!ZSBGT]{1,4})\s*[/\\]\s*([0-9OQDIL|!ZSBGT]{2,4})/g)) {      // « 123/269 » : le numéro ; le total à part (tots : taille imprimée de l'extension, footTotOk)
      const n = footNum(m[1]), t = footNum(m[2]); if (n && !nums.includes(n)) nums.push(n);
      if (n && /^\d+$/.test(t) && /^\d+/.test(n) && parseInt(t, 10) >= parseInt(n, 10) && !tots.includes(t)) tots.push(t);
    }
    const norm = ln.replace(/[/\\]\s*[0-9OQDIL|!ZSBGT]{2,4}/g, ' ').replace(/([A-Z0-9])\s*[.·•]\s*(?=[A-Z]{2,3}\b)/g, '$1 • ');      // « DSK.FR », « DSK · FR » : la puce
    const toks = norm.split(/[^A-Z0-9|!★*✶☆•·]+/).flatMap(t => t.split(/(?=[★*✶☆•·])|(?<=[★*✶☆•·])/)).filter(Boolean);
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i], prev = toks[i - 1] || '', prev2 = toks[i - 2] || '';
      if (FOOT_SEP.test(t)) { if (/^[★*✶☆]$/.test(t) && footCode(prev) && FOOT_LANG[toks[i + 1]]) foil = true; continue; }      // « MKM ★ FR » : foil
      if (FOOT_LANG[t] && t.length <= 3) {
        if (FOOT_SEP.test(prev) && footCode(prev2)) { langs.push({ code: prev2, lang: FOOT_LANG[t], sep: true, li }); if (!strong.includes(prev2)) strong.push(prev2); if (t.length === 2) continue; }
        else if (footCode(prev)) { langs.push({ code: prev, lang: FOOT_LANG[t], sep: false, li }); if (t.length === 2) continue; }
      }
      const n = footNum(t); if (n) { if (!nums.includes(n)) nums.push(n); if (!/[A-Z]$/.test(t)) continue; }      // « 40K », « 10E » : numéro à lettre ou code d'extension, gardé des deux côtés
      if (footCode(t) && !codes.includes(t)) codes.push(t);
    }
  });
  const last = arr.length - 1, ok = c => c.sep || (c.li >= last - 1 && footKnown(c.code) !== false);
  const best = langs.filter(ok).sort((a, b) => b.li - a.li || (b.sep ? 1 : 0) - (a.sep ? 1 : 0))[0] || null;      // la plus basse ; à égalité, celle qui a sa puce
  if (best && !strong.includes(best.code)) strong.push(best.code);
  if (strong.length) codes.splice(0, codes.length, ...strong.filter(c => c === (best && best.code)).concat(strong.filter(c => c !== (best && best.code))));      // code suivi de la langue : le nom de l'artiste, le texte d'ambiance ne sont pas des codes
  if (!nums.length && !strong.length) return null;      // ni numéro, ni « CODE • FR » : pas une ligne du bas (un nom de carte lu, « Llanowar Elves »)
  return { nums, codes, lang: best ? best.lang : '', lsep: !!(best && best.sep), langs, foil, tots };      // lsep : langue lue avec sa puce (« DSK • FR »), la plus sûre
}
/** Impression compatible avec le total lu en bas (« 123/249 » : 249 cartes imprimées dans l'extension, sets.js › SETIC, printed_size) ? Oui si rien n'est lu
 *  ou si la taille de l'extension est inconnue. Ne fait que départager des impressions au même numéro (rééditions : M12 et M13 ont chacune leur n° 123). */
function footTotOk(f, p) {
  if (!f || !f.tots || !f.tots.length || !p) return true;
  const m = typeof SETIC !== 'undefined' && SETIC && SETIC.m, x = m && m[String(p.set || '').toLowerCase()];
  return !x || !x[3] || f.tots.includes(String(x[3]));
}
/** Impressions au numéro lu, celles dont l'extension a le total lu d'abord (aucune : total lu de travers, toutes gardées). */
function footByNum(f, prints, pn) {
  const all = (prints || []).filter(p => f && f.nums.includes(pn(p))), fit = all.filter(p => footTotOk(f, p));
  return fit.length ? fit : all;
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
    const byLang = extra.lang ? list.filter(p => FOOT_SL[p.l || 'en'] === extra.lang) : [];
    const pool = byLang.length ? byLang : list;
    return pool.length === 1 ? pool[0] : null;
  };
  const known = c => prints.some(p => footSame(c.code, String(p.set || '').toUpperCase()));
  const vl = (f.langs || []).filter(known).sort((a, b) => b.li - a.li || (b.sep ? 1 : 0) - (a.sep ? 1 : 0))[0];      // couple « CODE LANGUE » dont le code est une édition de la carte : la langue sûre
  const extra = { lang: vl ? vl.lang : f.lang, foil: f.foil };
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
  const byNum = footByNum(f, prints, pn), nums = new Set(byNum.map(p => p.set + '/' + pn(p)));
  if (nums.size === 1) { const p = pick(byNum); if (p) return { p, how: 'num', ...extra }; }
  return null;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { footParse, footMatch, footSame, footNum, footKnown, footTotOk, footByNum, FOOT_LANG };
