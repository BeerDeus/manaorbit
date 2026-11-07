// Dictionnaires des langues de l'interface (src/i18n/<code>[.<partie>].json) face à l'anglais, la référence : mêmes fichiers et mêmes clés,
// mêmes {variables}, mêmes balises HTML, aucune valeur vide ni restée en français (sauf les mots qui s'écrivent pareil : SAME).
// Espaces de tête et de fin : les mêmes que la clé (le texte est collé à d'autres) ; ponctuation finale (« : », « … », « . »…) : différences listées, sans échec.
// Langue de I18N_LANGS sans dictionnaire (espagnol avant sa livraison) : sautée, l'appli ne la propose pas. Sans navigateur ni réseau.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { I18N_LANGS } = require('../src/core.js');

const DIR = new URL('../src/i18n/', import.meta.url);
// <code>.json → partie '' ; <code>.<partie>.json → partie ; même règle que build.mjs
const FILES = {};
for (const f of readdirSync(DIR).sort()) {
  const m = /^([a-z]{2}(?:-[A-Z]{2})?)(?:\.([a-z0-9-]+))?\.json$/.exec(f); if (!m) continue;
  let d; try { d = JSON.parse(readFileSync(new URL(f, DIR), 'utf8')); } catch (e) { d = e; }
  (FILES[m[1]] = FILES[m[1]] || {})[m[2] || ''] = { f, d };
}
const merged = l => Object.assign({}, ...Object.entries(FILES[l] || {}).sort(([a], [b]) => (a === '') - (b === '') || (a < b ? -1 : 1)).map(([, x]) => x.d));
const EN = merged('en');

// Clés dont la traduction peut rester identique au français : noms propres et de marques, termes du jeu repris tels quels (Commander, Deck, Planeswalker,
// Game Changer, Tier…), mots identiques dans la langue. '*' : toutes les langues ; sinon la liste d'une langue. Un texte sans lettre ({a} → {b}, {n} %) passe toujours.
const SAME = {
  '*': ['Mana Orbit', 'OK', 'Commander', 'cEDH', 'Archidekt', 'Game Changer', '{n} Game Changer', '{n} Game Changers', 'Planeswalkers', 'Deck', 'Decks', 'deck', '{n} deck', '{n} decks',
    'Tier', 'Tier {t}', 'tier {t}', 'Halloween', 'Premium', 'Budget', 'Widget', 'Auto', 'Auto · {n}', 'Cache', 'Vibration', 'web', 'Version {v}', 'non-foil', 'Foil', 'foil', 'Playset (4)', 'Format', 'Stats', 'Standard', 'QR code', '{n} proxy', '{n} min', '+{n} XP', '{h} h {m}', 'Top 100', 'Streamer', 'Playset', '{n} XP', '{n} foil', '{n} foils', 'Madrid', 'Fan', 'Babel', 'Otaku', 'Bug', 'Bracket', 'bracket {n}', 'Bracket {n} · {name}',
    'Game Changers', 'planeswalkers', 'blink', 'drain', 'ninjutsu', 'voltron', 'group hug'],
  de: ['Coach', 'Tags', 'Orange', 'Solide', 'Synergie', 'Berlin', 'Jackpot', 'Marathon', 'Profil', 'Liste', 'Mana', 'Decklist', 'Scan', 'Initiative', 'Partie', 'Cyborg', 'Arsenal', 'Shogun', 'Mentor', 'Saison', 'Flamme'],
  es: ['Niv. {n}', 'Rentable', 'de {name}', 'libre', 'Libre', 'Arsenal', 'Shogun', 'Mentor', 'Indestructible', 'Variantes', 'tribal', '{t} (tribal)', 'auras'],
  it: ['Coach', 'Taipei', 'Tokyo', '{n} PV', 'Mana', 'Test…', 'non foil', 'Multicolore', 'Incolore', 'incolore', 'Cyborg', 'Shogun', '{n} badge', 'sec'],
  pt: ['Moscou', 'Tags', 'Vitrine', 'Variantes', 'bronze', 'de {name}', 'Mana', 'Decklist', 'E-mail', 'ou', 'deck de {name}', 'CardTrader ou Scryfall', 'Cardmarket ou CardTrader', 'Decks EDHREC', '{n} decks EDHREC', '{n} deck EDHREC', 'Standard ou Commander', 'Sol Ring ou Anneau solaire', 'Lightning Bolt ou {name}', 'Decks de {name}', 'Arsenal', 'Mentor', 'tribal', '{t} (tribal)', 'auras'],
};
const sameOk = (l, k) => SAME['*'].includes(k) || (SAME[l] || []).includes(k) || !/\p{L}/u.test(k.replace(/\{\w+\}/g, '').replace(/<[^>]+>/g, ''));
const vars = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
const tags = s => [...String(s).matchAll(/<[^>]+>/g)].map(m => m[0]).sort();
const end = s => ((/(…|\.\.\.|[:.?!])\s*$/.exec(s) || [''])[0].trim().replace('...', '…'));

const LANGS = [...new Set([...Object.keys(I18N_LANGS), ...Object.keys(FILES)])].filter(l => l !== 'fr' && l !== 'en').sort();

test('anglais : référence lisible, chaque langue livrée est proposée par l\'appli', () => {
  for (const [l, parts] of Object.entries(FILES)) for (const { f, d } of Object.values(parts)) assert.ok(!(d instanceof Error) && d && typeof d === 'object' && !Array.isArray(d), f + ' : JSON illisible ' + (d && d.message || ''));
  assert.ok(Object.keys(EN).length > 1000, 'dictionnaires anglais');
  for (const l of Object.keys(FILES)) assert.ok(Object.prototype.hasOwnProperty.call(I18N_LANGS, l), `src/i18n/${l}*.json : langue absente de I18N_LANGS (core.js), jamais proposée`);
  assert.ok(!FILES.fr, 'le français est la langue du code : pas de dictionnaire');
});

for (const l of LANGS) {
  test(`${l} (${I18N_LANGS[l] || '?'}) : mêmes clés que l'anglais, variables, balises, rien de vide ni d'oublié`, t => {
    if (!FILES[l]) { console.log(`  ${l} : aucun dictionnaire (src/i18n/${l}*.json), langue sautée (l'appli ne la propose pas)`); t.skip('pas de dictionnaire'); return; }
    const parts = FILES[l], bad = [];
    // fichier par fichier : la même découpe que l'anglais (une partie = une fonction de l'appli)
    assert.deepEqual(Object.keys(parts).sort(), Object.keys(FILES.en).sort(), `${l} : mêmes fichiers que l'anglais (en.<partie>.json → ${l}.<partie>.json)`);
    for (const [p, { f, d }] of Object.entries(parts)) {
      const en = FILES.en[p].d, miss = Object.keys(en).filter(k => !(k in d)), extra = Object.keys(d).filter(k => !(k in en));
      if (miss.length || extra.length) bad.push(`${f} : ${miss.length} clé(s) manquante(s) ${JSON.stringify(miss.slice(0, 5))}, ${extra.length} en trop ${JSON.stringify(extra.slice(0, 5))}`);
      for (const [k, v] of Object.entries(d)) {
        if (typeof v !== 'string' || !v.trim()) { bad.push(`${f} : valeur vide pour ${JSON.stringify(k)}`); continue; }
        if (vars(k).join() !== vars(v).join()) bad.push(`${f} : variables ${JSON.stringify(vars(k))} ≠ ${JSON.stringify(vars(v))} : ${JSON.stringify(k)} → ${JSON.stringify(v)}`);
        if (tags(k).join('') !== tags(v).join('')) bad.push(`${f} : balises HTML différentes : ${JSON.stringify(k)} → ${JSON.stringify(v)}`);
        if (v === k && !sameOk(l, k)) bad.push(`${f} : resté en français : ${JSON.stringify(k)} (sinon l'ajouter à SAME)`);
        if (/^\s/.test(k) !== /^\s/.test(v) || /\s$/.test(k) !== /\s$/.test(v)) bad.push(`${f} : espaces de tête ou de fin différents : ${JSON.stringify(k)} → ${JSON.stringify(v)}`);
      }
    }
    assert.deepEqual(Object.keys(merged(l)).sort(), Object.keys(EN).sort(), `${l} : toutes les clés de l'anglais, aucune de plus`);
    assert.deepEqual(bad, [], `${l} : ${bad.length} problème(s)`);
    // à relire, sans échec : ponctuation finale différente de la clé, même clé traduite différemment selon le fichier (en.json / <code>.json tranche)
    const punct = [], twice = new Map();
    for (const { f, d } of Object.values(parts)) for (const [k, v] of Object.entries(d)) {
      if (end(k) !== end(v)) punct.push(`${f} : « ${end(k)} » → « ${end(v)} » : ${JSON.stringify(k.slice(-40))} → ${JSON.stringify(v.slice(-40))}`);
      const w = twice.get(k); if (w && w.v !== v) w.alt.add(v); else if (!w) twice.set(k, { v, alt: new Set() });
    }
    const conflicts = [...twice].filter(([, w]) => w.alt.size).map(([k, w]) => `${JSON.stringify(k)} : ${[w.v, ...w.alt].map(x => JSON.stringify(x)).join(' / ')}`);
    console.log(`  ${l} : ${Object.keys(merged(l)).length} textes, ${Object.keys(parts).length} fichiers ; ponctuation finale différente (à relire, sans échec) : ${punct.length}`);
    for (const x of punct) console.log('    · ' + x);
    if (conflicts.length) { console.log(`  ${l} : même clé, traductions différentes selon le fichier (à relire) : ${conflicts.length}`); for (const x of conflicts) console.log('    · ' + x); }
  });
}

/* ── Nombres, pourcentages, pluriels et « Afficher plus » (lot R4, 5 novembre) ─────────────────────────────────────────────────────────────
   Règles (DEV.md › « Textes ») : un nombre variable passe par TN (pluriel) ; un nombre écrit dans un texte par num (jamais toFixed) ; un
   pourcentage par pct (jamais « ' %' » collé hors de T) ; un bouton « Afficher plus » par moreBtn / moreLabel. */
const SRC = new URL('../src/', import.meta.url);
const SRCS = readdirSync(SRC).filter(f => f.endsWith('.js')).sort().map(f => ({ f, s: readFileSync(new URL(f, SRC), 'utf8') }));
/** Appels T( / nmT( / TN( : { f, line, fn, args (texte entre les parenthèses), keys (textes littéraux : le 1er pour T, 2e et 3e argument pour TN) }. */
function calls() {
  const out = [];
  for (const { f, s } of SRCS) for (const m of s.matchAll(/(?<![\w.$])(T|nmT|TN)\(/g)) {
    let j = m.index + m[0].length, d = 1, q = null; const st = j, cut = [];
    for (; j < s.length && d; j++) {
      const c = s[j];
      if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
      if (c === '\'' || c === '"' || c === '`') q = c; else if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--; else if (c === ',' && d === 1) cut.push(j);
    }
    const args = s.slice(st, j - 1), parts = [st, ...cut, j - 1].slice(0, -1).map((a, i, A) => s.slice(i ? a + 1 : a, i + 1 < A.length ? A[i + 1] : j - 1).trim());
    const lit = x => { const r = /^'((?:[^'\\]|\\.)*)'$|^"((?:[^"\\]|\\.)*)"$|^`((?:[^`\\$]|\\.)*)`$/.exec(x || ''); return r ? (r[1] ?? r[2] ?? r[3]).replace(/\\(.)/g, '$1') : null; };
    out.push({ f, line: s.slice(0, m.index).split('\n').length, fn: m[1], args, keys: (m[1] === 'TN' ? parts.slice(1, 3) : parts.slice(0, 1)).map(lit).filter(k => k != null) });
  }
  return out;
}
const CALLS = calls();
// Mots qui ne changent pas au pluriel, ou qui ne se rapportent pas au nombre (« {n} sans prix », « {n} dans ta collection », « {n} s »).
const PL_SAME = new Set(['sans', 'dans', 'depuis', 'mois', 'fois', 'plus', 's', 'ms', 'prix']);
// T('… {n} …s') gardés en T : le nombre ne vaut jamais 1 (constante, ou texte choisi seulement au-delà de 1 ; le singulier a son propre texte).
const PL_KEEP = {
  '{n} exemplaires au maximum (deck et réserve)': 'max ≥ 2 (1 : « Commander : un seul exemplaire… »)',
  'Réserve : {n} cartes au maximum': 'réserve du format : 15',
  '/ {n} cartes': 'taille du deck : 60 ou 100',
  '{name} : {n} exemplaires (un seul en Commander).': 'texte d\'erreur : 2 ou plus', '{name} : {n} exemplaires ({max} au maximum).': 'texte d\'erreur : plus que max',
  'Réserve de {n} cartes ({max} au maximum).': 'texte d\'erreur : plus de 15',
  'Classement ouvert aux comptes de plus de {n} jours, connectés avec Google ou une adresse vérifiée. Ta partie compte pour tes badges.': 'constante (7 jours)',
  'Simulation de {n} parties': 'constante (10 000)',
  'Cibles calculées sur {n} decks réels (Archidekt, EDHREC) et la formule des terrains de Frank Karsten.': 'corpus du coach (milliers)',
  'Banc d\'essai : sur {n} vrais decks jamais appris, le coach retrouve {p} % des cartes retirées dans ses 20 premières suggestions.': 'banc du coach (centaines)',
  'Coût moyen {mv}, {c} sorts de rampe ou de pioche à 2 mana ou moins : {n} terrains conseillés.': 'cible de terrains (≥ 30)',
  'Magic a {a} ans aujourd\'hui : {n} reliques de plus se cachent dans l\'appli.': 'constante de la fête (5)',
  'Le 5 août 1993 sortait Alpha. {a} ans plus tard, le musée fête ça : {n} reliques de plus se cachent dans l\'appli aujourd\'hui.': 'constante de la fête (5)',
  'Les cloches sont revenues de Rome : elles sèment {n} œufs de plus aujourd\'hui.': 'constante de la fête (5)',
  'Parties le Jeudi saint, elles ont sonné le retour de Pâques et semé {n} œufs de plus dans l\'appli aujourd\'hui.': 'constante de la fête (5)',
  'Les {n} salles sont ouvertes : le musée est complet.': 'toutes les salles (constante)', 'Les {n} poussins sont nés : ton nid est complet.': 'tous les poussins (constante)',
  'Dé à {n} faces': 'dé de 2 faces ou plus',
  'Ce lot compte {n} exemplaires de {name} : en retirer un': 'montré seulement au-delà de 1',
  '{n} pareilles': 'groupe de 2 ou plus (diagnostic du scan)',
  '{n} recherches enregistrées au plus : supprimes-en une d\'abord (appui long sur son nom)': 'constante (SRCH_MAX)',
  'Réservée par {n} decks montés': 'montré seulement au-delà de 1 deck',
  '{n} relevés · de {min} à {max}': 'courbe montrée à partir de 2 relevés',
};

test('pluriels : pas de T(\'… {n} mots…s\') (« 1 cartes ») : TN(n, singulier, pluriel), sauf nombre jamais égal à 1 (PL_KEEP)', () => {
  const bad = [], kept = new Set();
  for (const c of CALLS) if (c.fn !== 'TN') for (const k of c.keys) {
    const w = /\{n\}\s+(?:<\/?\w+>)?([\p{L}'’-]+)/u.exec(k);
    if (!w || !/s$/.test(w[1]) || PL_SAME.has(w[1])) continue;
    if (Object.prototype.hasOwnProperty.call(PL_KEEP, k)) { kept.add(k); continue; }
    bad.push(`src/${c.f}:${c.line} : ${JSON.stringify(k)}`);
  }
  assert.deepEqual(bad, [], 'texte au pluriel pour un nombre qui peut valoir 1 : TN(n, \'{n} carte\', \'{n} cartes\') (singulier traduit dans src/i18n/<langue>.*.json), ou PL_KEEP avec la raison');
  assert.deepEqual(Object.keys(PL_KEEP).filter(k => !kept.has(k)), [], 'PL_KEEP : texte disparu du code, à retirer de la liste');
});

test('pluriels : chaque TN(n, singulier, pluriel) traduit dans chaque langue', () => {
  const miss = [];
  const tn = CALLS.filter(c => c.fn === 'TN' && c.keys.length === 2);
  assert.ok(tn.length > 300, 'appels TN trouvés : ' + tn.length);
  const D = Object.fromEntries(['en', ...LANGS.filter(l => FILES[l])].map(l => [l, merged(l)]));
  for (const c of tn) {
    for (const [l, d] of Object.entries(D)) for (const k of c.keys) if (!(k in d)) miss.push(`${l} : src/${c.f}:${c.line} : ${JSON.stringify(k)}`);
  }
  assert.deepEqual(miss, [], 'forme sans traduction (nouveau texte : src/i18n/<langue>.r4.json ou le fichier de son module)');
});

test('pourcentages et nombres : pct et num, jamais « \' %\' » collé ni toFixed dans un texte', () => {
  const bad = [];
  for (const { f, s } of SRCS) s.split('\n').forEach((l, i) => {
    const code = l.replace(/\s\/\/ .*$/, '');      // commentaires ignorés ; '%' sans espace : CSS (largeurs)
    if (/^\s*(\*|\/\*|\/\/)/.test(code)) return;
    if (/' %'|" %"|\$\{[^{}`]*\} %/.test(code) && !/\b(width|height|left|top|--[\w-]+)\s*:\s*\$\{[^{}`]*\} ?%/.test(code)) bad.push(`src/${f}:${i + 1} : ${code.trim().slice(0, 120)}`);
  });
  assert.deepEqual(bad, [], 'pourcentage écrit hors de T : pct(v) (« 78 % » en français, « 78% » en anglais)');
  const fx = CALLS.filter(c => /\.toFixed\(/.test(c.args)).map(c => `src/${c.f}:${c.line} : ${c.args.slice(0, 100)}`);
  assert.deepEqual(fx, [], 'toFixed dans un texte (« 3.12 » en français) : num(v, décimales)');
});

test('num, pct, moreLabel, moreBtn : locale et dictionnaires de la langue', () => {
  const C = require('../src/core.js'), { num, pct, moreLabel, moreBtn, TN, i18nPick } = C;
  const all = Object.fromEntries(['en', 'de'].map(l => [l, merged(l)]));
  try {
    i18nPick({ nav: 'fr-FR', robot: true, all });
    assert.deepEqual([num(1234), num(3.14159, 2), num(0.5, 1), num(null), pct(78), pct(12.5, 1)], [(1234).toLocaleString('fr-FR'), '3,14', '0,5', '0', '78 %', '12,5 %']);
    assert.equal(moreLabel(1, 30), 'Afficher 1 de plus (1 autre)'); assert.equal(moreLabel(45, 30), 'Afficher 30 de plus (45 autres)');
    assert.equal(moreLabel(1234, 60), `Afficher 60 de plus (${(1234).toLocaleString('fr-FR')} autres)`, 'nombre à la française');
    assert.equal(moreBtn(10, 10, 5, 'data-act="more"'), '', 'tout est montré : pas de bouton'); assert.equal(moreBtn(12, 10, 5), '');
    assert.equal(moreBtn(0, 3, 2, 'data-act="more"'), '<button type="button" class="btn ghost block coll-more" data-act="more">Afficher 2 de plus (3 autres)</button>');
    assert.equal(moreBtn(5, 6, 5, 'class="link-btn df-more" data-df="more"'), '<button type="button" class="link-btn df-more" data-df="more">Afficher 1 de plus (1 autre)</button>', 'classe de l\'écran gardée');
    assert.deepEqual([TN(1, '{n} carte reçue', '{n} cartes reçues'), TN(2, '{n} carte reçue', '{n} cartes reçues')], ['1 carte reçue', '2 cartes reçues']);
    i18nPick({ nav: 'en-US', robot: false, saved: 'en', all });
    assert.deepEqual([num(1234), num(3.14159, 2), pct(78), moreLabel(1, 30), moreLabel(45, 30)], ['1,234', '3.14', '78%', 'Show 1 more (1 left)', 'Show 30 more (45 left)']);
    assert.deepEqual([TN(1, '{n} carte reçue', '{n} cartes reçues'), TN(1, 'Collection exportée ({n} carte)', 'Collection exportée ({n} cartes)'), TN(3, 'Collection exportée ({n} carte)', 'Collection exportée ({n} cartes)')], ['1 card received', 'Collection exported (1 card)', 'Collection exported (3 cards)']);
    i18nPick({ nav: 'de-DE', robot: false, saved: 'de', all });
    assert.deepEqual([num(1234.5, 1), pct(78), moreLabel(1, 30)], ['1.234,5', '78 %', '1 weitere anzeigen (noch 1)']);
  } finally { i18nPick({ nav: 'fr-FR', robot: true, all: {} }); }
});

test('moneyIn : montant tapé (budget, prix cible, frais de port) lu selon la locale, symboles et espaces ignorés', () => {
  const { moneyIn } = require('../src/core.js');
  const cases = [['50 €', 'fr-FR', 50], ['1 000', 'fr-FR', 1000], ['89,90 €', 'fr-FR', 89.9], ['4.90', 'fr-FR', 4.9], ['1.234,50', 'fr-FR', 1234.5], ['0,5', 'fr-FR', 0.5],
    ['$1,234.50', 'en-US', 1234.5], ['1,000', 'en-US', 1000], ['4,90', 'en-US', 4.9], ['1.000', 'de-DE', 1000], ['2.5', 'de-DE', 2.5], ['1.000,5 €', 'de-DE', 1000.5], ['1 000,00', 'fr-FR', 1000]];
  for (const [s, loc, v] of cases) assert.equal(moneyIn(s, loc), v, `${JSON.stringify(s)} (${loc})`);
  for (const s of ['', '  ', 'abc', '12,3,4', null]) assert.ok(Number.isNaN(moneyIn(s, 'fr-FR')), `illisible : ${JSON.stringify(s)}`);
});

test('« Annuler » d\'un toast (action qui défait) : tUndo (« Rückgängig », « Undo »…), jamais le « Annuler » des feuilles (« Abbrechen », « Cancel »)', () => {
  const bad = SRCS.flatMap(({ f, s }) => s.split('\n').map((l, i) => [f, i + 1, l]).filter(([, , l]) => /label:\s*(esc\()?T\('Annuler'\)/.test(l)).map(([f, n]) => `${f}:${n}`));
  assert.deepEqual(bad, [], 'bouton « Annuler » de toast sans tUndo()');
  const U = { en: 'Undo', de: 'Rückgängig', es: 'Deshacer', it: 'Annulla', pt: 'Desfazer' };      // italien : « Annulla » sert aux deux (usage d'Android et de Gmail)
  for (const l of Object.keys(U)) assert.equal(merged(l)['Annuler (défaire)'], U[l], l + ' : « Annuler (défaire) »');
});
