/* ── brackets.js : LA table des règles des brackets Commander (Wizards, mise à jour du 9 février 2026 ; docs/deckbuilder/recherche.md § 4.2) ──────────
   Une seule table, lue partout : bracket estimé (core.js › edhBracket, deckana.js › dwBracketOf), générateur et suggestions du coach (deckwiz.js),
   audit du coach (dwBracketHtml), prochaines étapes et cartes à retirer (deckux.js), note (deckopt.js), vérification du deck dans l'éditeur (core.js › dkCheck).
   Chargé avant core.js (build.mjs › JS_A) ; dans Node : require('./brackets.js') ; dans les vm du banc d'essai : chargé avant deckwiz.js. */
/** Par bracket : gc = Game Changers permis · mld = destruction massive de terrains permise · xt = tours supplémentaires permis (nombre) ;
 *  xtw = permis « sans les enchaîner » (rappelé) · c2 = combos à 2 cartes : 'no' interdits, 'late' pas avant le tour 6, 'ok' · c3 = combos à 3 cartes : 'avoid' à éviter
 *  (pas interdits par les règles officielles, mais hors du niveau d'un deck préconstruit : jamais proposés, signalés), 'ok'.
 *  Tours supplémentaires : aucun en bracket 1 ; bracket 2 « en petit nombre, jamais enchaînés » (Wizards) : un au plus ; bracket 3 « pas d'enchaînement ». Tuteurs : plus de limite depuis octobre 2025. */
const BRACKET_RULES = {
  1: { gc: 0, mld: false, xt: 0, xtw: false, c2: 'no', c3: 'avoid' },
  2: { gc: 0, mld: false, xt: 1, xtw: true, c2: 'no', c3: 'avoid' },
  3: { gc: 3, mld: false, xt: Infinity, xtw: true, c2: 'late', c3: 'ok' },
  4: { gc: Infinity, mld: true, xt: Infinity, xtw: false, c2: 'ok', c3: 'ok' },
  5: { gc: Infinity, mld: true, xt: Infinity, xtw: false, c2: 'ok', c3: 'ok' },
};
/** Règles d'un bracket (inconnu : celles du bracket 3). */
const brRule = b => BRACKET_RULES[b] || BRACKET_RULES[3];
const brN = v => (Array.isArray(v) ? v.length : Number(v) || 0);
const brList = (v, n = 99) => (Array.isArray(v) ? v.slice(0, n).join(', ') : '');
const brT = (s, o) => (typeof T === 'function' ? T(s, o) : String(s).replace(/\{(\w+)\}/g, (m, k) => (o && o[k] != null ? o[k] : m)));
/** Le deck respecte-t-il les règles du bracket b ? f = { gc, mld, xt, c2, c3 } : listes (noms) ou nombres de Game Changers, cartes de destruction massive
 *  de terrains, de tours supplémentaires, combos à 2 et à 3 cartes. Rapide (sans texte) : bracketEstimate l'appelle pour chaque deck EDHREC. */
function bracketOk(b, f) {
  const r = brRule(b);
  return brN(f.gc) <= r.gc && (r.mld || !brN(f.mld)) && brN(f.xt) <= r.xt && (r.c2 !== 'no' || !brN(f.c2)) && (r.c3 !== 'avoid' || !brN(f.c3));
}
/** Bracket estimé d'après la liste : le plus bas de 2 à 4 dont les règles sont tenues (1 et 5 ne se devinent pas sur une liste). */
function bracketEstimate(f) { for (const b of [2, 3]) if (bracketOk(b, f)) return b; return 4; }
/** Écarts aux règles du bracket b : [{ lv: 'bad' (règle enfreinte) | 'warn' (permis, sous condition) | 'info', k: 'gc' | 'mld' | 'xt' | 'c2' | 'c3', t }].
 *  Listes de f affichées telles quelles (combos : déjà mis en texte). */
function bracketBreaks(b, f) {
  const r = brRule(b), out = [], n = k => brN(f[k]), l = k => brList(f[k], k === 'c2' || k === 'c3' ? 4 : 99);
  if (n('gc') > r.gc) out.push({ lv: 'bad', k: 'gc', t: r.gc ? brT('{n} Game Changers pour {max} permis en bracket {b} : {list}', { n: n('gc'), max: r.gc, b, list: l('gc') }) : brT('Game Changers interdits en bracket {b} : {list}', { b, list: l('gc') }) });
  if (n('mld') && !r.mld) out.push({ lv: 'bad', k: 'mld', t: brT('Destruction massive de terrains interdite en bracket {b} : {list}', { b, list: l('mld') }) });
  if (n('xt')) {
    if (!r.xt) out.push({ lv: 'bad', k: 'xt', t: brT('Tours supplémentaires interdits en bracket {b} : {list}', { b, list: l('xt') }) });
    else if (n('xt') > r.xt) out.push({ lv: 'bad', k: 'xt', t: brT('{n} tours supplémentaires pour {max} permis en bracket {b}, jamais enchaînés : {list}', { n: n('xt'), max: r.xt, b, list: l('xt') }) });
    else if (r.xtw && r.xt < Infinity) out.push({ lv: 'info', k: 'xt', t: brT('Tour supplémentaire permis en bracket {b} ({max} au plus, jamais enchaîné) : {list}', { b, max: r.xt, list: l('xt') }) });
    else if (r.xtw) out.push({ lv: 'warn', k: 'xt', t: brT('Tours supplémentaires : à ne pas enchaîner en bracket {b} ({list})', { b, list: l('xt') }) });
  }
  if (n('c2') && r.c2 === 'no') out.push({ lv: 'bad', k: 'c2', t: brT('Combo à 2 cartes interdit en bracket {b} : {list}', { b, list: l('c2') }) });
  else if (n('c2') && r.c2 === 'late') out.push({ lv: 'warn', k: 'c2', t: brT('Combo à 2 cartes : pas avant le tour 6 en bracket {b} ({list})', { b, list: l('c2') }) });
  if (n('c3') && r.c3 === 'avoid') out.push({ lv: 'bad', k: 'c3', t: brT('Combo à 3 cartes à éviter en bracket {b} : {list}', { b, list: l('c3') }) });
  else if (n('c3') && b <= 3) out.push({ lv: 'info', k: 'c3', t: brT('Combo à 3 cartes, permis en bracket {b} : {list}', { b, list: l('c3') }) });
  return out;
}
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { BRACKET_RULES, brRule, bracketOk, bracketEstimate, bracketBreaks });
