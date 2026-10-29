/* ── core.js : logique pure (parse, filtres, optimiseur, démo). Testable sous Node. ───────── */

/* ── Langue de l'interface ─────────────────────────────────────────────────────────────────────
   Les textes sont écrits en français dans le code. T('Texte {n}', { n }) donne leur traduction dans la langue choisie
   (dictionnaires src/i18n/<langue>.json, posés par build.mjs dans un bloc JSON inerte par langue, script « application/json » d'id i18n-en), sinon le texte tel quel.
   TN(n, '{n} carte', '{n} cartes') choisit le pluriel selon la règle de la langue (Intl.PluralRules : français 0 et 1 au singulier, anglais et allemand 1 seul).
   Ajouter une langue = ses dictionnaires (src/i18n/<code>*.json) + une entrée dans I18N_LANGS (et LOC_DEF) ; sans dictionnaire, elle n'est proposée nulle part. */
const I18N_LANGS = { fr: 'Français', en: 'English', de: 'Deutsch', es: 'Español', it: 'Italiano', pt: 'Português' };
const I18N = { lang: 'fr', nav: 'fr-FR', navs: ['fr-FR'], dict: null };

/* ── Marché des prix ─────────────────────────────────────────────────────────────────────────────
   eu : Europe, prix Cardmarket en euros (ce que l'appli a toujours fait) · us : États-Unis et reste du monde, prix TCGplayer (« market price ») en dollars.
   Les deux viennent de Scryfall (prices.eur / eur_foil, prices.usd / usd_foil / usd_etched) et du fichier de prix du jour (colonnes € et $) : aucune autre API.
   Choix gardé (Réglages › Marché des prix), sinon deviné au premier lancement puis figé (fuseau horaire Europe/… → eu, sinon région de la langue du téléphone,
   sinon eu) : un voyage ne fait pas changer de devise. Les champs de prix (eu, ef, prix des relevés…) gardent leur nom : ils portent le prix du marché choisi.
   Le texte des écrans est écrit pour Cardmarket ; mkText le réécrit pour TCGplayer (nom, « tendance » → « prix du marché », €  → $) dans chaque langue. */
const MKTS = { eu: { cur: 'EUR', name: 'Cardmarket', ab: 'CM' }, us: { cur: 'USD', name: 'TCGplayer', ab: 'TCG' } };
const MK = { id: 'eu', pick: '', guess: 'eu' };      // pick : choix de l'utilisateur ('eu' | 'us' | '' = automatique) ; guess : marché deviné et figé
const MK_SAVE = 'deckdeal:mkt', MK_GUESS = 'deckdeal:mkt:auto';
/** Pays où Cardmarket vend et livre (Union européenne, EEE, Suisse, Royaume-Uni, micro-États, Balkans) : tout autre pays → TCGplayer. */
const MK_EU = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO CH GB UK AD MC SM VA GI FO AL BA ME MK RS XK RE GP MQ GF YT'.split(' '));
const MK_EU_TZ = /^(Europe\/|Atlantic\/(Canary|Madeira|Azores|Reykjavik|Faroe)$|Indian\/Reunion$|America\/(Guadeloupe|Martinique|Cayenne)$|Indian\/Mayotte$)/;
/** Marché deviné : fuseau horaire d'abord (où est le téléphone ; un Français avec un téléphone en anglais américain reste en Europe), sinon région de la
 *  première langue du téléphone qui en donne une (« en-US » → us, « es-419 » → us, « fr-FR » → eu), sinon eu. o.tz, o.navs : pour les tests. */
function mkGuess(o = {}) {
  let tz = o.tz; if (tz === undefined) { try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { tz = ''; } }
  tz = String(tz || '');
  if (tz && !/^(UTC|GMT|Etc\/)/i.test(tz)) return MK_EU_TZ.test(tz) ? 'eu' : 'us';
  for (const t of [].concat(o.navs || [])) {
    const r = /^[a-z]{2,3}(?:[-_][A-Za-z]{4})?[-_]([A-Za-z]{2}|\d{3})(?:[-_]|$)/.exec(String(t)); if (!r) continue;
    return MK_EU.has(r[1].toUpperCase()) ? 'eu' : 'us';
  }
  return 'eu';
}
/** Marché de l'appli : choix gardé (o.saved), sinon ?mkt=, sinon le marché deviné une fois (o.frozen) ou maintenant ; o.old : appareil qui avait déjà
 *  des données avant le choix du marché (prix en euros) → eu. Navigateurs pilotés par les tests : eu, sauf choix explicite. */
function mkPick(o = {}) {
  const ok = v => v === 'eu' || v === 'us';
  MK.pick = ok(o.saved) ? o.saved : ok(o.query) ? o.query : '';
  MK.guess = ok(o.frozen) ? o.frozen : o.robot || o.old ? 'eu' : mkGuess(o);
  MK.id = MK.pick || MK.guess;
  return MK.id;
}
const mkUs = () => MK.id === 'us';
const mkCur = () => MKTS[MK.id].cur;
const mkName = () => MKTS[MK.id].name;
const mkAb = () => MKTS[MK.id].ab;
/** Suffixe des clés de stockage qui gardent des montants (courbe de valeur, sessions d'ouverture, échanges) : chaque marché a les siens. */
const mkSfx = () => (mkUs() ? ':us' : '');
/** Nom d'un marché pour le choisir (Réglages) : jamais réécrit par mkText (« Cardmarket » y reste Cardmarket). */
const mkLabel = id => (id === 'us' ? T('États-Unis et autres pays, TCGplayer en dollars', null, true) : T('Europe, Cardmarket en euros', null, true));
/** Prix Scryfall d'une impression ({ eur, eur_foil, usd, usd_foil, usd_etched }) → { eu, ef } en centimes du marché (null si absent). */
function mkPx(p) {
  p = p || {};
  if (!mkUs()) return { eu: eurCents(p.eur), ef: eurCents(p.eur_foil) };
  return { eu: eurCents(p.usd), ef: eurCents(p.usd_foil) || eurCents(p.usd_etched) };
}
/** Réécritures du texte pour TCGplayer, par langue : d'abord les tournures (« tendance Cardmarket » → « prix du marché TCGplayer », Wants list → Mass Entry),
 *  puis le nom seul et le symbole de l'euro. */
const MK_TXT = {
  fr: [[/prix tendance Cardmarket/g, 'prix du marché TCGplayer'], [/Prix tendance Cardmarket/g, 'Prix du marché TCGplayer'], [/tendance Cardmarket/g, 'prix du marché TCGplayer'], [/Tendance Cardmarket/g, 'Prix du marché TCGplayer'],
    [/Wants list Cardmarket/g, 'Mass Entry TCGplayer'], [/Wants lists?/g, 'Mass Entry'], [/prix tendance/g, 'prix du marché'], [/Prix tendance/g, 'Prix du marché'], [/ ?\(Shopping Wizard\)/g, '']],
  en: [[/Cardmarket trend prices/g, 'TCGplayer market prices'], [/Cardmarket trend price/g, 'TCGplayer market price'], [/Cardmarket trend/g, 'TCGplayer market price'], [/Cardmarket Wants list/g, 'TCGplayer Mass Entry'],
    [/Wants lists?/g, 'Mass Entry'], [/trend price/g, 'market price'], [/Trend price/g, 'Market price'], [/ ?\(Shopping Wizard\)/g, '']],
  de: [[/Cardmarket-Trendpreise/g, 'TCGplayer-Marktpreise'], [/Cardmarket-Trendpreis/g, 'TCGplayer-Marktpreis'], [/Cardmarket-Trend/g, 'TCGplayer-Marktpreis'], [/Cardmarket-Wants-Liste/g, 'TCGplayer-Mass-Entry'],
    [/Wants-Liste/g, 'Mass Entry'], [/Trendpreis/g, 'Marktpreis'], [/ ?\(Shopping Wizard\)/g, '']],
  es: [[/precios? de tendencia de Cardmarket/g, m => (/precios/.test(m) ? 'precios' : 'precio') + ' de mercado de TCGplayer'], [/tendencia de Cardmarket/g, 'precio de mercado de TCGplayer'],
    [/lista de deseos de Cardmarket/g, 'Mass Entry de TCGplayer'], [/precio de tendencia/g, 'precio de mercado'], [/precios de tendencia/g, 'precios de mercado'], [/ ?\(Shopping Wizard\)/g, '']],
  it: [[/prezz([oi]) di tendenza Cardmarket/g, 'prezz$1 di mercato TCGplayer'], [/tendenza Cardmarket/g, 'prezzo di mercato TCGplayer'], [/lista dei desideri di Cardmarket/g, 'Mass Entry di TCGplayer'],
    [/prezz([oi]) di tendenza/g, 'prezz$1 di mercato'], [/ ?\(Shopping Wizard\)/g, '']],
  pt: [[/preç(os?) de tendência da Cardmarket/g, 'preç$1 de mercado da TCGplayer'], [/tendência da Cardmarket/g, 'preço de mercado da TCGplayer'], [/lista de desejos \(Wants\) da Cardmarket/g, 'Mass Entry da TCGplayer'],
    [/preç(os?) de tendência/g, 'preç$1 de mercado'], [/ ?\(Shopping Wizard\)/g, '']],
};
/** Le mot « Tendance » seul (étiquette d'une ligne au prix du marché), par langue. */
const MK_WORD = { Tendance: 'Prix du marché', Trend: 'Marktpreis', Tendencia: 'Precio de mercado', Tendenza: 'Prezzo di mercato', 'Tendência': 'Preço de mercado' };
function mkText(s) {
  if (!mkUs() || typeof s !== 'string') return s;
  if (s === 'Trend' && I18N.lang === 'en') return 'Market price';
  if (Object.prototype.hasOwnProperty.call(MK_WORD, s)) return MK_WORD[s];
  if (!/Cardmarket|€|endan|endenc|endên|Trend|trend|Wants|\bCM\b/.test(s)) return s;
  for (const [re, to] of MK_TXT[I18N.lang] || MK_TXT.en) s = s.replace(re, to);
  return s.replace(/Cardmarket/g, 'TCGplayer').replace(/€/g, '$').replace(/\bCM\b/g, 'TCG');
}
function T(s, v, raw) {
  let out = I18N.dict && Object.prototype.hasOwnProperty.call(I18N.dict, s) ? I18N.dict[s] : s;
  if (MK.id === 'us' && !raw) out = mkText(out);      // avant les valeurs : un nom de carte ou un prix passé en {valeur} n'est jamais réécrit
  if (v) out = out.replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? v[k] : m);
  return out;
}
/** Règle de pluriel de chaque langue (créée une fois) : catégorie 'one' → singulier, toute autre (other, many…) → pluriel. */
const PLURAL = {};
function TN(n, one, many, v) {
  const x = Number(n || 0), l = I18N.lang;
  let pr = PLURAL[l]; if (pr === undefined) { try { pr = PLURAL[l] = new Intl.PluralRules(l); } catch (e) { pr = PLURAL[l] = null; } }
  const key = (pr ? pr.select(x) === 'one' : x === 1) ? one : many;
  return T(key, { n: x.toLocaleString(LOC()), ...v });
}
/** Locale des nombres et des dates : fr-FR ; anglais : celle du navigateur (en-US, en-GB…) ; autre langue : sa variante du téléphone (de-AT, es-MX, it-CH, pt-PT…),
 *  sinon celle de LOC_DEF (de-DE, es-ES, it-IT ; portugais : pt-BR, celui des cartes Magic). Les prix restent en euros : la locale n'en change que l'écriture (« 1.234,56 € » en allemand). */
const LOC_DEF = { de: 'de-DE', es: 'es-ES', it: 'it-IT', pt: 'pt-BR' }, LOC_MEMO = {};
const LOC = () => I18N.lang === 'fr' ? 'fr-FR' : I18N.lang === 'en' ? (/^en(-|$)/i.test(I18N.nav) ? I18N.nav : 'en-GB') : locOf(I18N.lang, I18N.navs);
function locOf(l, navs) {
  const k = l + '|' + navs; if (LOC_MEMO[k]) return LOC_MEMO[k];
  let v = [].concat(navs || []).find(t => String(t).toLowerCase().split(/[-_]/)[0] === l) || '';
  try { v = v ? Intl.getCanonicalLocales(String(v).replace(/_/g, '-'))[0] : ''; } catch (e) { v = ''; }      // étiquette illisible : jamais d'erreur dans Intl
  return (LOC_MEMO[k] = v.includes('-') ? v : LOC_DEF[l] || l);
}
/** Ordre alphabétique des noms de cartes, accents et casse ignorés : un Intl.Collator par langue de l'interface, créé une fois (localeCompare(…, 'fr', options) en recrée un à chaque comparaison : ×40 sur le tri de 5 000 cartes). */
const NAME_COLL = {};
const NAME_CMP = (a, b) => (NAME_COLL[I18N.lang] || (NAME_COLL[I18N.lang] = new Intl.Collator(I18N.lang, { sensitivity: 'base' }).compare))(a, b);
/** Ordre anglais (listes d'échange, export) : même résultat que localeCompare(…, 'en'), avec un seul Intl.Collator (localeCompare en recrée un à chaque comparaison). */
let EN_COLL = null;
const EN_CMP = (a, b) => (EN_COLL || (EN_COLL = new Intl.Collator('en').compare))(a, b);
/** Langue livrée : le français (celle du code), sinon une langue de I18N_LANGS dont le dictionnaire est dans la page (bloc i18n-<code>),
 *  ou dans all / I18N_ALL sous Node. Une langue sans dictionnaire n'est ni choisie ni proposée (jamais une interface à moitié traduite). */
function i18nHas(code, all) {
  if (!code || !Object.prototype.hasOwnProperty.call(I18N_LANGS, code)) return false;
  if (code === 'fr') return true;
  const a = all || (typeof I18N_ALL !== 'undefined' ? I18N_ALL : null);
  if (a) return !!a[code];
  try { return !!document.getElementById('i18n-' + code); } catch (e) { return false; }
}
/** Langues proposées (Réglages › Langue, accueil) : [code, nom dans sa langue], dans l'ordre de I18N_LANGS. */
const i18nLangs = all => Object.entries(I18N_LANGS).filter(([c]) => i18nHas(c, all));
/** Langue : choix gardé, sinon ?lang=xx, sinon la première langue du téléphone qui est livrée (de-AT → de, es-MX → es…), sinon l'anglais.
 *  Navigateurs pilotés par les tests (webdriver, jsdom) : français, sauf choix explicite. o.nav : une étiquette ou la liste (navigator.languages). */
function i18nPick(o = {}) {
  const has = c => i18nHas(c, o.all);
  const navs = [].concat(o.nav || (typeof navigator !== 'undefined' && (navigator.languages && navigator.languages.length ? [...navigator.languages] : navigator.language)) || 'fr-FR').map(String);
  const robot = o.robot != null ? o.robot : typeof navigator !== 'undefined' && (navigator.webdriver || /jsdom/i.test(navigator.userAgent || ''));
  const dev = () => navs.map(t => t.toLowerCase().split(/[-_]/)[0]).find(has);
  const code = o.saved && has(o.saved) ? o.saved : o.query && has(o.query) ? o.query : robot ? 'fr' : dev() || 'en';
  I18N.lang = code; I18N.nav = navs[0]; I18N.navs = navs; I18N.dict = code === 'fr' ? null : i18nDict(code, o.all);
  return code;
}
/** Dictionnaire d'une langue : o.all (tests sous Node), sinon le bloc JSON de la page, analysé seulement quand il sert (changer de langue recharge la page). */
function i18nDict(code, all) {
  if (all) return all[code] || null;
  try { const el = document.getElementById('i18n-' + code); return el ? JSON.parse(el.textContent) : null; } catch (e) { return null; }
}
// Dans la page : la langue est choisie avant tout le reste (les autres fichiers peuvent appeler T dès leur chargement).
if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  let saved = '', q = '';
  try { q = new URLSearchParams(location.search).get('lang') || ''; if (q && i18nHas(q)) localStorage.setItem('deckdeal:lang', q); else q = ''; } catch (e) { /* ignore */ }
  try { saved = localStorage.getItem('deckdeal:lang') || ''; } catch (e) { /* ignore */ }
  i18nPick({ saved: q || saved });
  try { document.documentElement.lang = I18N.lang; } catch (e) { /* ignore */ }
  // Marché des prix : ?mkt=eu|us gardé comme un choix (tests, liens d'aide) ; deviné une fois puis figé ; appareil déjà utilisé avant (collection, réglages) : eu
  const mo = { robot: typeof navigator !== 'undefined' && (navigator.webdriver || /jsdom/i.test(navigator.userAgent || '')), navs: I18N.navs };
  try { const mq = new URLSearchParams(location.search).get('mkt') || ''; if (mq === 'eu' || mq === 'us') localStorage.setItem(MK_SAVE, mq); } catch (e) { /* ignore */ }
  try { mo.saved = localStorage.getItem(MK_SAVE) || ''; mo.frozen = localStorage.getItem(MK_GUESS) || ''; mo.old = !mo.frozen && !!(localStorage.getItem('deckdeal:coll:v1') || localStorage.getItem('deckdeal:v1')); } catch (e) { /* ignore */ }
  mkPick(mo);
  try { if (!mo.frozen && !mo.robot) localStorage.setItem(MK_GUESS, MK.guess); } catch (e) { /* ignore */ }
  try { document.documentElement.dataset.mkt = MK.id; } catch (e) { /* ignore */ }
}
/** Textes fixes de la page (body.html) : nœuds texte et attributs lisibles traduits une fois au démarrage. */
function i18nDom(root) {
  if (!root || (!I18N.dict && !mkUs())) return;      // marché TCGplayer : textes fixes réécrits aussi en français (mkText)
  const tr = s => { const k = s.trim(), d = I18N.dict; return mkText(k && d && Object.prototype.hasOwnProperty.call(d, k) ? s.replace(k, d[k]) : s); };
  const w = root.ownerDocument.createTreeWalker(root, 4 /* texte */), nodes = [];
  while (w.nextNode()) nodes.push(w.currentNode);
  for (const n of nodes) { if (n.parentNode && /^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName)) continue; const v = tr(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
  for (const el of root.querySelectorAll('[aria-label],[placeholder],[title],[alt]')) for (const a of ['aria-label', 'placeholder', 'title', 'alt']) { const v = el.getAttribute(a); if (v) { const t = tr(v); if (t !== v) el.setAttribute(a, t); } }
}

const CONDITIONS = ['Mint', 'Near Mint', 'Slightly Played', 'Moderately Played', 'Played', 'Heavily Played', 'Poor'];
const COND_SHORT = { 'Mint': 'MT', 'Near Mint': 'NM', 'Slightly Played': 'SP', 'Moderately Played': 'MP', 'Played': 'PL', 'Heavily Played': 'HP', 'Poor': 'PO' };
const BASIC_NAMES = new Set(['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes',
  'snow covered plains', 'snow covered island', 'snow covered swamp', 'snow covered mountain', 'snow covered forest', 'snow covered wastes']);

function normPart(s) {
  const t = String(s || '').replace(/æ/gi, 'ae').replace(/œ/gi, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’‘`´]/g, '').replace(/[^a-z0-9а-я\u3040-\u30fa\u30fc-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u1100-\u11ff\uac00-\ud7af\u3099\u309a]+/g, ' ').trim();      // lettres latines, cyrilliques (« молния ») ; ё et й perdent leur signe (lecture OCR tolérante)
  return CJK_RE.test(t) ? t.normalize('NFC').replace(/([\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]) +(?=[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af])/g, '$1') : t;      // japonais, coréen, chinois : signes recomposés (« が », syllabes coréennes), sans les espaces que Tesseract glisse entre les caractères ; « ・ » séparateur
}
/** Écritures d'Asie (kana, idéogrammes, hangûl) : un nom lu ou imprimé en japonais, coréen, chinois. */
const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u1100-\u11ff\uac00-\ud7af]/;
/** Lettres d'un nom de carte lu (latin accentué, cyrillique, japonais, coréen, chinois) : part des tests « assez de lettres » de l'OCR. */
const NAME_LETTER_RE = /[A-Za-zÀ-ÿЀ-ӿ\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g;
/** Longueur minimale d'un nom lu : 3 lettres, 2 caractères en écriture d'Asie (« 稲妻 », Lightning Bolt en japonais). */
const nameMin = k => (CJK_RE.test(k) ? 2 : 3);
function normName(s) { return String(s || '').split('//').map(normPart).filter(Boolean).join(' // '); }
function frontName(s) { return normName(s).split(' // ')[0]; }

/** Langue d'une carte de collection : code de l'app (fr en de es it pt jp zh-CN ru kr zh-TW) depuis un code (FR, ja, fra…) ou un nom (French, Français…), '' si inconnue. */
const LANG_ALIAS = { fr: 'fr', fra: 'fr', fre: 'fr', french: 'fr', francais: 'fr', en: 'en', eng: 'en', english: 'en', anglais: 'en', de: 'de', deu: 'de', ger: 'de', german: 'de', allemand: 'de', deutsch: 'de',
  es: 'es', spa: 'es', spanish: 'es', espagnol: 'es', it: 'it', ita: 'it', italian: 'it', italien: 'it', pt: 'pt', por: 'pt', portuguese: 'pt', portugais: 'pt', ja: 'jp', jp: 'jp', jpn: 'jp', japanese: 'jp', japonais: 'jp', zh: 'zh-CN', zhs: 'zh-CN', zht: 'zh-TW', zhcn: 'zh-CN', zhtw: 'zh-TW', cn: 'zh-CN', chs: 'zh-CN', cht: 'zh-TW', chinese: 'zh-CN', chinois: 'zh-CN', simplifiedchinese: 'zh-CN', chinesesimplified: 'zh-CN', traditionalchinese: 'zh-TW', chinesetraditional: 'zh-TW',
  ptbr: 'pt', portuguesebrazil: 'pt', brazilianportuguese: 'pt', portuguesbresil: 'pt', zhhans: 'zh-CN', zhhant: 'zh-TW', ru: 'ru', rus: 'ru', russian: 'ru', russe: 'ru',
  kr: 'kr', ko: 'kr', kor: 'kr', korean: 'kr', coreen: 'kr', chinoistraditionnel: 'zh-TW', chinoissimplifie: 'zh-CN', tchinese: 'zh-TW', schinese: 'zh-CN' };      // coréen, chinois traditionnel (Cardmarket : « S-Chinese », « T-Chinese ») : langues de l'appli      // « Portuguese (Brazil) » (Delver Lens, TCGplayer), « zh-Hans »
const cardLang = x => LANG_ALIAS[String(x == null ? '' : x).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')] || '';
/** Code court d'une langue pour l'affichage et le texte de la collection : « FR », « EN »… ; le chinois s'écrit « ZH », le traditionnel « ZHT » (lettres seules : les codes CardTrader « zh-CN », « zh-TW » ont un tiret). */
const langCode = l => (l === 'zh-CN' ? 'ZH' : l === 'zh-TW' ? 'ZHT' : String(l || '').toUpperCase());      // chinois traditionnel : « ZHT » (relu par cardLang)
/** Langue des cartes par défaut (offres cherchées, aperçus) tant que « Langue » n'a pas été choisie : celle de l'interface, sauf l'anglais quand il n'est
 *  qu'un repli (téléphone allemand, espagnol, japonais… : cartes de sa langue d'abord, l'anglais ensuite par le repli). navLangs : navigator.languages. */
function defaultCardLang(ui, navLangs) {
  const base = t => String(t || '').toLowerCase().split(/[-_]/)[0], card = t => { const c = cardLang(base(t)); return OPT_LANGS.includes(c) ? c : ''; };
  const u = card(ui);
  if (u && u !== 'en') return u;                                                       // interface en français, allemand… : jamais un repli (langue du téléphone ou choix)
  for (const t of [].concat(navLangs || [])) {
    if (i18nHas(base(t))) return u || 'en';                                            // le téléphone parle une langue livrée de l'interface : celle de l'interface fait foi (anglais choisi sur un téléphone français)
    const c = card(t); if (c) return c;                                                // sinon la première langue du téléphone qui existe en cartes (coréen, russe… : absentes de CardTrader ici)
  }
  return u || 'en';
}
/** Langues du téléphone, la préférée d'abord. */
const navLangs = () => { try { return navigator.languages && navigator.languages.length ? [...navigator.languages] : navigator.language ? [navigator.language] : []; } catch (e) { return []; } };
/** Langue de lecture de l'utilisateur (site Cardmarket…) : sa langue de cartes par défaut, même s'il cherche des cartes d'une autre langue. */
const userLang = () => defaultCardLang(I18N.lang, navLangs());

const HEADER_RE = /^(commander|companion|deck|main(board)?|sideboard|maybeboard|considering|about|name|creatures?|lands?|artifacts?|enchantments?|instants?|sorceries|sorcery|planeswalkers?|battles?|other|tokens?)\s*(\(\d+\))?\s*:?\s*$/i;

/* ── Noms français tapés ou importés → carte anglaise : index construit depuis le catalogue français (fr-names.tsv) ; tant qu'il n'est pas chargé, les noms restent tels qu'écrits ──
   Même mécanique pour les autres langues à alphabet latin (names-de.tsv…) : un seul catalogue à la fois, celui de la langue des noms (namesLangOf) ; FRX.l : sa langue. */
const FRX = { ix: null, l: 'fr' };
/** Langues dont les noms imprimés sont reconnus (catalogue servi par le site, clés latines de frKey) ; japonais, chinois… : pas encore (clé Unicode à faire). */
const NAMES_LANGS = ['fr', 'de', 'es', 'it', 'pt', 'ru'];
/** Langues d'Asie : noms imprimés lus au scan avec leur propre moteur (scan.js › asiaMatch), catalogue names-<code Scryfall>.tsv téléchargé à la demande. */
const ASIA_LANGS = ['jp', 'kr', 'zh-CN', 'zh-TW'];
const NAMES_ALL_LANGS = [...NAMES_LANGS, ...ASIA_LANGS];
/** Langue des noms imprimés reconnus : celle des cartes si elle a un catalogue, sinon celle de l'interface (français) ; cartes anglaises sur une interface anglaise : '' (aucun catalogue). */
const namesLangOf = (card, ui) => (NAMES_LANGS.includes(card) ? card : NAMES_LANGS.includes(ui) ? ui : '');
/** Clé d'un nom pour l'index français : accents, casse, apostrophes, tirets et espaces ignorés (« L'Aquilon », « l aquilon », « Laquilon » se rejoignent). */
const frKey = s => normPart(s).replace(/ /g, '');
const frUse = (ix, l = 'fr') => { FRX.ix = ix || null; FRX.l = l; };

/** Une ligne de decklist → undefined (vide) · { ignored: true } (commentaire, en-tête : + quiet ; invalide : signalée) · { qty, name, key }.
 *  Nom français reconnu (index chargé, sauf o.fr === false) : name et key de la carte anglaise, dn = nom imprimé français, fr = 1 ; nom français de plusieurs cartes : amb = [noms anglais], le nom reste tel qu'écrit.
 *  o.prefer === 'fr' (ou « *FR* » sur la ligne) : un nom qui existe dans les deux langues pour deux cartes différentes est lu en français. */
function parseLine(raw, o) {
  const line = String(raw == null ? '' : raw).trim();
  if (!line) return undefined;
  if (/^(\/\/|#)/.test(line) || /^SB:/i.test(line) || HEADER_RE.test(line)) return { ignored: true, quiet: true };   // commentaire, banc, en-tête : volontaire, pas signalé
  let qty = 1, name = line;
  const m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
  if (m) { qty = parseInt(m[1], 10); name = m[2]; }
  let lang = '', foil = false, nf = false, ed = '';
  for (let again = true; again;) {      // repères de fin, dans n'importe quel ordre : « *FR* » (langue), « *F* » / « *E* » (foil, foil etched : Moxfield, ManaBox), « *N* » (normale, sans foil : masterset ; l'ancienne version l'ignore)
    again = false;
    name = name.replace(/\s+\*([A-Za-z]+(?:-[A-Za-z]+)?)\*\s*$/, (_, t) => { if (t.length > 1) lang = cardLang(t); else if (/^[FE]$/i.test(t)) foil = true; else if (/^N$/i.test(t)) nf = true; again = true; return ''; });
  }
  name = name.replace(/\s+\(FOIL\)\s*$/i, () => { foil = true; return ''; })      // « (FOIL) » : texte de la collection (collToText), écrit avant l'édition (déjà retirée par parseCollection)
    .replace(/\s+\(([A-Za-z0-9]{2,8})\)(?:\s+([A-Za-z0-9★-]+))?\s*$/, (_, set, num) => { if (num) ed = edKey(set, num); return ''; })      // « (CMM) 400 » : l'édition, gardée (recherche aux éditions exactes)
    .trim();
  if (!name || qty < 1 || qty > 999) return { ignored: true };
  const key = normName(name); if (!key) return { ignored: true };
  const out = { qty, name, key, ...(lang ? { lang } : {}), ...(foil ? { foil: 1 } : nf ? { nf: 1 } : {}), ...(ed ? { ed } : {}) };
  if (FRX.ix && !(o && o.fr === false)) {
    const f = frLookup(name, lang === FRX.l || !!(o && o.prefer === FRX.l), key.replace(/[ /]/g, ''));
    if (f && f.en) { out.name = f.en; out.key = normName(f.en); out.dn = f.p; out.fr = 1; } else if (f && f.amb) out.amb = f.amb;
  }
  return out;
}

/** Section d'un en-tête de decklist (« Sideboard », « // Maybeboard », « Commander (1) »…), null si la ligne n'en est pas un. */
const headerSec = line => {
  const h = line.replace(/^(\/\/|#)\s*/, '');
  if (/^(commanders?|commandants?)\s*(\(\d+\))?\s*:?\s*$/i.test(h)) return 'cmdr';
  if (!HEADER_RE.test(h)) return null;
  return /^sideboard/i.test(h) ? 'side' : /^companion/i.test(h) ? 'comp' : /^(maybeboard|considering|tokens?)/i.test(h) ? 'skip' : /^about/i.test(h) ? 'about' : 'main';
};
/** Lignes d'une decklist avec leur section : [[ligne, section]]. Sections des exports Moxfield, Archidekt, MTGA, MTGO (en-tête jusqu'au suivant) :
 *  'cmdr' (Commander, jusqu'à la ligne vide) · 'comp' (Companion : dans le deck) · 'side' (Sideboard : la réserve, comme les lignes « SB: ») ·
 *  'skip' (Maybeboard, Considering, Tokens : hors du deck ; « About » / « Name … » de MTGA, jusqu'à la ligne vide) · 'main' (le reste : Deck, Creatures, Lands…).
 *  Liste sans aucun en-tête (ni « SB: ») faite de deux blocs (MTGO .txt, ancien export MTGA) : 60 à 80 cartes, une ligne vide, puis 15 cartes au plus sans terrain de base → ce bloc est la réserve. */
function deckSecs(text) {
  const out = []; let sec = 'main', hdr = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim(), h = line && headerSec(line);
    if (!line) { if (sec === 'cmdr' || sec === 'about') sec = 'main'; }
    else if (h) { sec = h; hdr = true; }
    else if (/^SB:/i.test(line)) hdr = true;
    out.push([raw, h || sec === 'about' ? 'skip' : sec]);      // l'en-tête lui-même : jamais une carte (« Commanders »)
  }
  if (!hdr) {
    const blocks = []; let cur = null;
    out.forEach(([raw], i) => {
      const p = parseLine(raw); if (p === undefined) { cur = null; return; } if (p.ignored) return;
      if (!cur) blocks.push(cur = { at: i, n: 0, basic: false });
      cur.n += p.qty; if (BASIC_NAMES.has(p.key)) cur.basic = true;
    });
    const [a, b] = blocks;
    if (blocks.length === 2 && a.n >= 60 && a.n <= 80 && b.n <= 15 && !b.basic) for (let i = b.at; i < out.length; i++) out[i][1] = 'side';
  }
  return out;
}

/** Lit une decklist (EDHREC, Moxfield, Archidekt, MTGA, MTGO). Terrains de base séparés. Réserve (« SB: », section Sideboard), maybeboard et tokens : ni comptés ni cherchés (voir deckSecs). */
function parseDeck(text) {
  const cards = new Map();
  const basics = new Map();
  let lines = 0, ignored = 0;
  for (const [raw, sec] of deckSecs(text)) {
    const p = parseLine(raw);
    if (!p) continue;
    lines++;
    if (p.ignored) { if (!p.quiet) ignored++; continue; }
    if (sec === 'side' || sec === 'skip') continue;      // réserve, maybeboard : volontaire, pas signalé
    const bucket = BASIC_NAMES.has(p.key) ? basics : cards;
    const cur = bucket.get(p.key);
    if (cur) cur.qty += p.qty; else bucket.set(p.key, { key: p.key, name: p.name, qty: p.qty, ...(p.dn ? { dn: p.dn } : {}), ...(p.amb ? { amb: p.amb } : {}) });      // dn : nom français à afficher (name reste l'anglais : prix, collection, liens)
    const x = cur || bucket.get(p.key);      // éditions de la carte (« (CMM) 400 ») : seulement si chacune de ses lignes en donne une (une ligne sans édition : n'importe laquelle)
    if (!p.ed) x.anyEd = true; else if (!(x.eds || (x.eds = [])).includes(p.ed)) x.eds.push(p.ed);
    const f = p.foil ? 'yes' : p.nf ? 'no' : '', l = p.lang || '', ls = x.ls || (x.ls = []), g = ls.find(y => y.f === f && y.l === l);      // foil et langue de la ligne (« *F* », « *N* », « *FR* »)
    if (g) g.q += p.qty; else ls.push({ q: p.qty, f, l });
  }
  // ln : les lignes de la carte par foil et langue ({ q, f?: 'yes' | 'no', l? }), seulement si l'une en donne (sinon la recherche garde ses critères, comme avant)
  for (const m of [cards, basics]) for (const x of m.values()) { if (x.anyEd) delete x.eds; delete x.anyEd; if (x.ls.some(y => y.f || y.l)) x.ln = x.ls.map(y => ({ q: y.q, ...(y.f ? { f: y.f } : {}), ...(y.l ? { l: y.l } : {}) })); delete x.ls; }
  const c = [...cards.values()], b = [...basics.values()];
  const copies = c.reduce((a, x) => a + x.qty, 0);
  const basicCopies = b.reduce((a, x) => a + x.qty, 0);
  return { cards: c, basics: b, lines, ignored, copies: copies + basicCopies, basicCopies };
}

/** Retire de la decklist toutes les lignes d'une carte. Retourne le nouveau texte et les lignes retirées (pour annuler). */
function dropCard(text, key) {
  const kept = [], removed = [];
  String(text || '').split('\n').forEach((raw, i) => { const p = parseLine(raw); if (p && !p.ignored && p.key === key) removed.push({ i, raw }); else kept.push(raw); });
  return { text: kept.join('\n'), removed };
}
/** Remet des lignes retirées par dropCard, à leur place d'origine (ou à la fin si la liste a rétréci). */
function restoreLines(text, removed) {
  const lines = String(text || '').split('\n');
  for (const { i, raw } of removed.slice().sort((a, b) => a.i - b.i)) lines.splice(Math.min(i, lines.length), 0, raw);
  return lines.join('\n');
}

/** Ordre d'affichage. items : { name, i (rang dans la liste), cost (centimes ou null) } ; sans prix → toujours en fin de liste. */
function sortCards(items, mode) {
  const byI = (a, b) => a.i - b.i, arr = items.slice();
  if (mode === 'name') arr.sort((a, b) => NAME_CMP(a.name, b.name) || byI(a, b));
  else if (mode === 'price-desc' || mode === 'price-asc') {
    const sg = mode === 'price-desc' ? -1 : 1;
    arr.sort((a, b) => ((a.cost == null) - (b.cost == null)) || (a.cost != null && sg * (a.cost - b.cost)) || byI(a, b));
  } else arr.sort(byI);
  return arr;
}

/** Code de parrainage CardTrader : ajouté à chaque lien ouvert vers cardtrader.com (CardTrader reverse 1 % du prix des cartes achetées dans les 48 h après le clic, rien ne change pour l'acheteur). */
const CT_SHARE = 'manaorbit';
const ctShare = u => u + (u.includes('?') ? '&' : '?') + 'share_code=' + CT_SHARE;
/** Page d'une carte sur CardTrader (par identifiant de blueprint). */
const ctCardUrl = bpId => ctShare('https://www.cardtrader.com/cards/' + encodeURIComponent(bpId));
/** Panier CardTrader : page française pour l'interface en français ; sinon sans langue dans l'adresse (CardTrader prend celle du compte ou du navigateur, comme pour ctCardUrl). */
const ctCartUrl = () => ctShare('https://www.cardtrader.com/' + (I18N.lang === 'fr' ? 'fr-FR/' : '') + 'cart/edit');

/** Une offre passe-t-elle les critères (état, foil, hors vendeurs en vacances, etc.) ? */
function passes(o, f) {
  if (!o || o.vac || o.graded || o.signed || o.altered) return false;
  if ((o.bundle || 1) > 1) return false;
  const ci = CONDITIONS.indexOf(o.cond), mi = CONDITIONS.indexOf(f.cond);
  if (ci < 0 || ci > mi) return false;
  if (f.foil === 'no' && o.foil) return false;
  if (f.foil === 'yes' && !o.foil) return false;
  return o.price > 0 && o.qty > 0;
}

/* ── Foil et langue par ligne de la liste (c.ln, voir parseDeck) : chaque ligne a ses offres ; sans foil ou sans langue, ceux de la recherche ── */
/** Exemplaires encore à acheter sur une ligne (l.need, posé par applyOwned ; avant : toute la ligne). */
const lnLeft = l => (l.need == null ? l.q : l.need);
/** Offres qui conviennent à une ligne (l : { f?, l? }) : critères de la recherche (état, vendeurs…) avec le foil de la ligne s'il est donné ; langue de la ligne
 *  seulement, sinon celle de la recherche (et l'anglais après le repli, fb). */
function lnOffers(offers, l, opts, fb) {
  const f = l.f ? { ...opts, foil: l.f } : opts;
  return (offers || []).filter(o => passes(o, f) && (!o.lang || (l.l ? o.lang === l.l : o.lang === opts.lang || (!!fb && o.lang === 'en'))));
}
/** Requêtes CardTrader d'une carte (offres d'un blueprint dans une langue, foil ou non) : [{ lang, foil }], une par langue de ses lignes à acheter, avec le foil de la
 *  ligne, sinon celui de la recherche ('any' quand les lignes d'une même langue diffèrent : une requête, le tri se fait ici). Sans critères de ligne : ceux de la recherche.
 *  en : repli anglais, pour les lignes sans langue imposée seulement. */
function lnQueries(c, opts, en) {
  if (!c.ln) return [{ lang: en ? 'en' : opts.lang, foil: opts.foil }];
  const by = new Map();
  for (const l of c.ln) {
    if (!(lnLeft(l) > 0) || (en && l.l)) continue;
    const lang = en ? 'en' : l.l || opts.lang, foil = l.f || opts.foil, cur = by.get(lang);
    by.set(lang, cur == null || cur === foil ? foil : 'any');
  }
  return [...by].map(([lang, foil]) => ({ lang, foil }));
}
/** Repli anglais utile pour une carte aux critères de ligne : une ligne à acheter sans langue imposée n'a aucune offre utilisable dans la langue de la recherche. */
const lnNeedsEn = (c, offers, opts) => c.ln.some(l => !l.l && lnLeft(l) > 0 && !lnOffers(offers, l, opts, false).some(o => (opts.mode !== 'zero' || o.hub) && o.lang === opts.lang));

/** Produit CardTrader (/marketplace/products) → offre normalisée. */
function normalizeProduct(p, info) {
  const h = p.properties_hash || {};
  const u = p.user || {};
  const e = p.expansion || {};
  return {
    id: p.id, productId: p.id, bpId: p.blueprint_id,
    sellerId: u.id, seller: u.username || '?', country: u.country_code || '', hub: !!u.can_sell_via_hub, type: u.user_type || '',
    price: p.price ? p.price.cents : 0, cur: p.price ? p.price.currency : 'EUR', qty: p.quantity || 0,
    cond: h.condition, foil: !!h.mtg_foil, lang: h.mtg_language || '',
    signed: !!h.signed, altered: !!h.altered, graded: !!p.graded, vac: !!p.on_vacation, bundle: p.bundle_size || 1,
    set: e.code || (info && info.set) || '', setName: e.name_en || (info && info.setName) || '',
    num: (info && info.num) || h.collector_number || '', img: (info && info.img) || null,
    sset: (info && info.set) || '',                           // code d'extension Scryfall (celui de CardTrader peut différer)
    ref: info ? (h.mtg_foil ? info.ef : info.eu) ?? null : null,   // prix de référence Cardmarket (Scryfall, centimes) de cette impression, foil ou non
  };
}

/* ── Optimiseur ─────────────────────────────────────────────────────────────────────────── */
const byPrice = (a, b) => (a.price - b.price) || (b.qty - a.qty) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function allocate(sorted, qty, allowed) {
  const parts = []; let need = qty, cost = 0;
  for (const o of sorted) {
    if (need <= 0) break;
    if (allowed && !allowed.has(o.sellerId)) continue;
    const n = Math.min(need, o.qty);
    if (n > 0) { parts.push({ offer: o, n }); need -= n; cost += o.price * n; }
  }
  return { parts, short: need, cost };
}

function sellersOf(keys, alloc) {
  const m = new Map();
  for (const k of keys) for (const p of alloc[k].parts) {
    let s = m.get(p.offer.sellerId);
    if (!s) { s = new Set(); m.set(p.offer.sellerId, s); }
    s.add(k);
  }
  return m;
}

function summarize(keys, alloc, ship, mode) {
  let items = 0; const sellers = new Map(); const picks = {}; const missing = [], partial = [];
  for (const k of keys) {
    const a = alloc[k]; picks[k] = a; items += a.cost;
    if (!a.parts.length) missing.push(k); else if (a.short > 0) partial.push(k);
    for (const p of a.parts) {
      const o = p.offer;
      let g = sellers.get(o.sellerId);
      if (!g) { g = { sellerId: o.sellerId, seller: o.seller, country: o.country, hub: o.hub, items: [], subtotal: 0, count: 0 }; sellers.set(o.sellerId, g); }
      g.items.push({ key: k, offer: o, n: p.n }); g.subtotal += o.price * p.n; g.count += p.n;
    }
  }
  const sellerCount = sellers.size;
  const shipCents = mode === 'direct' ? ship * sellerCount : 0;
  return { mode, items, ship: shipCents, total: items + shipCents, sellerCount, picks, missing, partial,
    sellers: [...sellers.values()].sort((a, b) => b.subtotal - a.subtotal) };
}

function localSearch(keys, qtyOf, sorted, alloc, ship, locked) {
  const offersBySeller = new Map();
  for (const k of keys) for (const o of sorted[k]) {
    let s = offersBySeller.get(o.sellerId);
    if (!s) { s = new Set(); offersBySeller.set(o.sellerId, s); }
    s.add(k);
  }
  for (let iter = 0; iter < 60; iter++) {
    let improved = false;
    // 1) supprimer un vendeur : ses cartes sont reprises chez les autres vendeurs déjà utilisés
    const order = [...sellersOf(keys, alloc).entries()].sort((a, b) => a[1].size - b[1].size);
    for (const [s] of order) {
      const cur = sellersOf(keys, alloc);
      const mine = cur.get(s);
      if (!mine) continue;
      let blocked = false;
      for (const k of mine) if (locked.has(k)) { blocked = true; break; }
      if (blocked) continue;
      const allowed = new Set(cur.keys()); allowed.delete(s);
      let delta = -ship, ok = true; const next = {};
      for (const k of mine) {
        const na = allocate(sorted[k], qtyOf[k], allowed);
        if (na.short > alloc[k].short) { ok = false; break; }
        delta += na.cost - alloc[k].cost; next[k] = na;
      }
      if (ok && delta < 0) { Object.assign(alloc, next); improved = true; }
    }
    // 2) ajouter un vendeur : on le prend s'il économise plus que son port
    const used = sellersOf(keys, alloc);
    const cands = [...offersBySeller.entries()].filter(([s]) => !used.has(s)).sort((a, b) => b[1].size - a[1].size).slice(0, 80);
    for (const [t, ks] of cands) {
      const cur = sellersOf(keys, alloc);
      if (cur.has(t)) continue;
      const allowed = new Set(cur.keys()); allowed.add(t);
      let delta = ship; const next = {};
      for (const k of ks) {
        if (locked.has(k)) continue;
        const na = allocate(sorted[k], qtyOf[k], allowed);
        const d = na.cost - alloc[k].cost;
        if (na.short <= alloc[k].short && (d < 0 || na.short < alloc[k].short)) { next[k] = na; delta += d; }
      }
      if (Object.keys(next).length && delta < 0) { Object.assign(alloc, next); improved = true; }
    }
    if (!improved) break;
  }
}

/** Lignes d'une même carte (demande grp : foil, langue par ligne) : leurs listes peuvent partager des offres ; aucune n'est prise au-delà de son stock, la ligne
 *  suivante reprend ce qui reste, au moins cher (offre copiée avec la quantité restante). Les choix manuels (locked) restent, leur stock est compté. */
function shareStock(keys, grp, sorted, qtyOf, alloc, locked) {
  const used = new Map();
  for (const k of keys) {
    const g = grp[k]; if (!g) continue;
    let u = used.get(g); if (!u) used.set(g, (u = new Map()));
    const left = o => o.qty - (u.get(o.productId) || 0);
    if (!locked.has(k) && alloc[k].parts.some(p => p.n > left(p.offer))) alloc[k] = allocate(sorted[k].map(o => (left(o) === o.qty ? o : { ...o, qty: left(o) })).filter(o => o.qty > 0), qtyOf[k], null);
    for (const p of alloc[k].parts) u.set(p.offer.productId, (u.get(p.offer.productId) || 0) + p.n);
  }
}

/**
 * demand: [{key, qty, grp?}] ; offersByKey: {key: [offre]} (déjà filtrées par critères) ; grp : carte d'une ligne (foil, langue par ligne), stock partagé
 * opts: {mode:'zero'|'direct', ship:centimes, forced:{key: offerId}}
 */
function optimize(demand, offersByKey, opts) {
  const mode = opts.mode === 'direct' ? 'direct' : 'zero';
  const ship = mode === 'direct' ? (opts.ship || 0) : 0;
  const forced = opts.forced || {};
  const keys = [], qtyOf = {}, sorted = {}, alloc = {}, locked = new Set(), grp = {};
  for (const d of demand) {
    keys.push(d.key); qtyOf[d.key] = d.qty; if (d.grp) grp[d.key] = d.grp;
    sorted[d.key] = (offersByKey[d.key] || []).filter(o => mode !== 'zero' || o.hub).slice().sort(byPrice);
  }
  for (const k of keys) {
    const fo = forced[k] ? sorted[k].find(o => o.id === forced[k]) : null;
    if (fo) {
      const n = Math.min(qtyOf[k], fo.qty);
      const rest = allocate(sorted[k].filter(o => o !== fo), qtyOf[k] - n, null);
      alloc[k] = { parts: [{ offer: fo, n }, ...rest.parts], short: rest.short, cost: fo.price * n + rest.cost };
      locked.add(k);
    } else alloc[k] = allocate(sorted[k], qtyOf[k], null);
  }
  const shared = Object.keys(grp).length > 0;
  if (shared) shareStock(keys, grp, sorted, qtyOf, alloc, locked);
  const base = summarize(keys, alloc, ship, mode);
  if (mode === 'direct') { localSearch(keys, qtyOf, sorted, alloc, ship, locked); if (shared) shareStock(keys, grp, sorted, qtyOf, alloc, locked); }
  const out = summarize(keys, alloc, ship, mode);
  out.baseline = { items: base.items, total: base.total, sellers: base.sellerCount };
  return out;
}
/** Résultat de l'optimiseur sur les lignes des cartes (subs[clé de ligne] = { key : la carte, i : sa ligne, w : langue voulue }) → une sélection par carte : parts de
 *  toutes ses lignes (chacune garde li et w), coût et manque additionnés ; vendeurs à la clé de la carte. Sans lignes : le résultat tel quel. */
function lnJoin(res, subs) {
  if (!subs || !Object.keys(subs).length) return res;
  const picks = {};
  for (const [k, p] of Object.entries(res.picks)) {
    const s = subs[k]; if (!s) { picks[k] = p; continue; }
    const t = picks[s.key] || (picks[s.key] = { parts: [], short: 0, cost: 0 });
    for (const x of p.parts) t.parts.push({ ...x, li: s.i, w: s.w });
    t.short += p.short; t.cost += p.cost;
  }
  for (const g of res.sellers) g.items = g.items.map(it => (subs[it.key] ? { ...it, key: subs[it.key].key } : it));
  const ks = Object.keys(picks);
  return { ...res, picks, missing: ks.filter(k => !picks[k].parts.length), partial: ks.filter(k => picks[k].parts.length && picks[k].short > 0) };
}

/* ── Démo : offres simulées, déterministes ───────────────────────────────────────────────── */
function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const DEMO_SELLERS = [
  { id: 101, name: 'cartes_du_midi', country: 'FR', hub: true }, { id: 102, name: 'magic_boutique', country: 'FR', hub: true },
  { id: 103, name: 'lotus_noir_fr', country: 'FR', hub: false }, { id: 104, name: 'tcg_bordeaux', country: 'FR', hub: true },
  { id: 105, name: 'carta_viva', country: 'IT', hub: true }, { id: 106, name: 'singles_roma', country: 'IT', hub: true },
  { id: 107, name: 'kartenhain', country: 'DE', hub: true }, { id: 108, name: 'mox_und_mehr', country: 'DE', hub: false },
  { id: 109, name: 'cartomania_es', country: 'ES', hub: true }, { id: 110, name: 'brussels_cards', country: 'BE', hub: true },
  { id: 111, name: 'poldeck', country: 'PL', hub: true }, { id: 112, name: 'lusa_magic', country: 'PT', hub: true },
  { id: 113, name: 'tulip_tcg', country: 'NL', hub: true }, { id: 114, name: 'alsace_cartes', country: 'FR', hub: false },
];
const DEMO_SETS = [['cmm', 'Commander Masters'], ['c21', 'Commander 2021'], ['mh2', 'Modern Horizons 2'], ['2x2', 'Double Masters 2022'],
  ['fdn', 'Foundations'], ['clb', "Commander Legends: Battle for Baldur's Gate"], ['ncc', 'New Capenna Commander'], ['dmu', 'Dominaria United']];
const DEMO_BASE = { 'sol ring': 1.6, 'swords to plowshares': 2.4, 'path to exile': 3.2, 'sword of fire and ice': 31, 'sword of light and shadow': 9,
  'sword of hearth and home': 4.5, 'sun titan': 3.1, 'mother of runes': 5.5, 'giver of runes': 1.2, 'arcane signet': 1.1, 'restoration angel': 3.4,
  'skyclave apparition': 3.5, 'flickerwisp': 0.5, 'panharmonicon': 2.2, 'fellwar stone': 1.4, 'pearl medallion': 1.8, 'teleportation circle': 0.7,
  'ephemerate': 0.9, 'monumental henge': 2.6, 'minas tirith': 2.1, 'emeria the sky ruin': 1.3, 'cloister gargoyle': 0.4, 'felidar guardian': 0.5 };

/** Offres simulées pour une carte. lang='fr' : ~8 % des cartes n'en ont aucune (sert à tester le repli EN). */
/** Offre « prix Cardmarket » (sans token CardTrader) : une seule par carte, au prix tendance, qui passe tous les filtres (langue, état, Zero). */
function cmOffer(card, cents, opts) {
  const id = 'cm:' + card.key;
  return { id, productId: id, bpId: null, sellerId: 'cm', seller: mkName(), country: '', hub: true, type: 'cm', cm: true,
    price: cents, cur: mkCur(), qty: 999, cond: opts.cond === 'Mint' ? 'Mint' : 'Near Mint', foil: opts.foil === 'yes', lang: opts.lang,
    signed: false, altered: false, graded: false, vac: false, bundle: 1, set: '', setName: '', num: '', img: null, ref: null };
}
/** Langue du site Cardmarket la plus proche : fr, de, es, it, sinon en (seules langues du site). */
const cmSite = l => (['fr', 'de', 'es', 'it'].includes(l) ? l : 'en');
/** Lien de recherche Cardmarket d'une carte (lang : langue de l'utilisateur, voir userLang). */
const cmUrl = (name, lang) => `https://www.cardmarket.com/${cmSite(lang)}/Magic/Products/Search?searchString=${encodeURIComponent(String(name || '').split('//')[0].trim())}`;
/** Lien de recherche TCGplayer d'une carte (site en anglais seulement). */
const tcgUrl = name => `https://www.tcgplayer.com/search/magic/product?productLineName=magic&q=${encodeURIComponent(String(name || '').split('//')[0].trim())}&view=grid`;
/** Lien de la carte sur le marché choisi : Cardmarket dans la langue de l'utilisateur, ou TCGplayer. */
const mkUrl = (name, lang) => (mkUs() ? tcgUrl(name) : cmUrl(name, lang));
/** Page où coller la liste « 2 Sol Ring » : Wants list de Cardmarket, ou Mass Entry de TCGplayer (panier rempli d'un coup, le moins cher choisi par TCGplayer). */
const mkWantsUrl = lang => (mkUs() ? 'https://www.tcgplayer.com/massentry' : 'https://www.cardmarket.com/' + cmSite(lang) + '/Magic/Wants');
function makeDemoOffers(card, lang) {
  const key = card.key;
  const r = mulberry32(hash32(key + '|' + lang));
  const noLang = lang !== 'en' && (hash32(key + '|nolang') % 100) < 8;
  if (noLang) return [];
  const rb = mulberry32(hash32(key + '|base'));
  const base = DEMO_BASE[key] != null ? DEMO_BASE[key] : 0.18 + Math.pow(rb(), 3) * 6.5;
  const out = [];
  for (const s of DEMO_SELLERS) {
    if (r() > 0.56) continue;
    const n = 1 + (r() < 0.25 ? 1 : 0);
    for (let j = 0; j < n; j++) {
      const cond = ['Near Mint', 'Near Mint', 'Slightly Played', 'Slightly Played', 'Moderately Played', 'Played'][Math.floor(r() * 6)];
      const mult = { 'Near Mint': 1, 'Slightly Played': 0.92, 'Moderately Played': 0.82, 'Played': 0.7 }[cond];
      const foil = r() < 0.12;
      const price = Math.max(5, Math.round(base * (0.88 + r() * 0.55) * mult * (foil ? 2.3 : 1) * 100));
      const set = DEMO_SETS[Math.floor(r() * DEMO_SETS.length)];
      const id = hash32(key + '|' + s.id + '|' + j + '|' + lang);
      out.push({ id, productId: id, bpId: hash32(key + set[0]), sellerId: s.id, seller: s.name, country: s.country, hub: s.hub, type: 'normal',
        price, cur: 'EUR', qty: 1 + Math.floor(r() * 4), cond, foil, lang, signed: false, altered: false, graded: false, vac: false, bundle: 1,
        set: set[0], setName: set[1], num: String(1 + Math.floor(r() * 380)), img: null, ref: Math.max(5, Math.round(base * (foil ? 2.3 : 1) * 100)) });
    }
  }
  return out;
}

/* ── Decks enregistrés : normalisation, historique de prix, temps relatif ───────────────────── */
const HISTORY_MAX = 40, NAME_MAX = 120, TEXT_MAX = 60000;
const OPT_LANGS = ['fr', 'en', 'de', 'es', 'it', 'pt', 'jp', 'zh-CN', 'ru'];
const OPT_FOIL = ['no', 'any', 'yes'];
const OPT_MODE = ['zero', 'direct', 'cm'];
/** Modes d'un relevé gardé (historique d'un deck, prix carte par carte) : ceux de la recherche, plus 'us' (prix du marché TCGplayer, en dollars). */
const SNAP_MODES = [...OPT_MODE, 'us'];
/** Devise des montants d'un relevé : dollars pour TCGplayer, euros sinon (Cardmarket, CardTrader). */
const modeCur = m => (m === 'us' ? 'USD' : 'EUR');
/** Mode d'une recherche au prix du marché (sans CardTrader) : 'cm' (Cardmarket) ou 'us' (TCGplayer). */
const mkMode = () => (mkUs() ? 'us' : 'cm');

/** Options de recherche : on ne garde que des valeurs connues (le document est lu depuis le cloud). */
function sanitizeOpts(o) {
  o = o || {};
  const ship = Number(o.ship);
  return {
    lang: OPT_LANGS.includes(o.lang) ? o.lang : 'fr',
    cond: CONDITIONS.includes(o.cond) ? o.cond : 'Slightly Played',
    foil: OPT_FOIL.includes(o.foil) ? o.foil : 'no',
    mode: OPT_MODE.includes(o.mode) ? o.mode : 'zero',
    ship: Number.isFinite(ship) ? Math.max(0, Math.min(5000, Math.round(ship))) : 280,
    fallbackEn: o.fallbackEn !== false,
  };
}

/** Nom proposé : la première carte de la liste (le commandant, dans un export EDHREC). */
function suggestName(text) {
  const d = parseDeck(text);
  const first = d.cards[0];
  return first ? first.name.slice(0, NAME_MAX) : T('Nouveau deck');
}

/** Deux relevés sont comparables s'ils portent sur le même mode, le même nombre de cartes trouvées et les mêmes critères. */
const sameKind = (a, b) => a.mode === b.mode && a.found === b.found && (a.sig || '') === (b.sig || '');

/** Ajoute un relevé de prix. Même nature, même total, moins de 30 min : on rafraîchit la date au lieu d'empiler. */
function pushHistory(history, entry) {
  const h = (Array.isArray(history) ? history : []).filter(e => e && Number.isFinite(e.at) && Number.isFinite(e.total)).slice();
  const last = h[h.length - 1];
  if (last && sameKind(last, entry) && last.total === entry.total && entry.at - last.at < 30 * 60 * 1000) h[h.length - 1] = entry;
  else h.push(entry);
  return h.slice(-HISTORY_MAX);
}

/** Variation entre le dernier relevé et le précédent comparable. */
function priceDelta(history) {
  const h = Array.isArray(history) ? history : [];
  const last = h[h.length - 1]; if (!last) return null;
  for (let i = h.length - 2; i >= 0; i--) {
    const p = h[i];
    if (sameKind(p, last)) return { mode: last.mode, total: last.total, prev: p.total, diff: last.total - p.total, at: last.at, prevAt: p.at };
  }
  return { mode: last.mode, total: last.total, prev: null, diff: 0, at: last.at, prevAt: null };
}

/** Série de prix comparable au dernier relevé, pour le mini-graphique. */
function priceSeries(history) {
  const h = Array.isArray(history) ? history : []; const last = h[h.length - 1]; if (!last) return [];
  return h.filter(e => sameKind(e, last)).map(e => e.total);
}

/* ── Prix gardés carte par carte + regroupements du deck viewer ───────────────────────────── */
const SNAP_MAX = 400, SNAP_STATES = ['ok', 'none', 'nohub', 'nf', 'basic', 'own'];
/** Relevé compact d'une recherche : { at, mode, lang, sig, items:[{k,n,q,s, c,l,d,st,nu,sn,im,cm,mc,tl,cl,sl,fb,sh, rf,ow,cmd}], pv, pa }. null si inutilisable.
 *  rf : prix de référence Cardmarket par exemplaire (centimes) · ow : exemplaires déjà possédés · cmd : commandant · pv/pa : prix unitaires du relevé précédent et sa date. */
function sanitizeSnap(x) {
  if (!x || typeof x !== 'object' || !Array.isArray(x.items) || !Number.isFinite(x.at)) return null;
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const int = (v, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : null);
  const items = [];
  for (const i of x.items) {
    if (items.length >= SNAP_MAX) break;
    if (!i || typeof i.k !== 'string' || typeof i.n !== 'string' || !i.k || !i.n) continue;
    const o = { k: str(i.k, 80), n: str(i.n, 100), q: int(i.q, 1, 999) || 1, s: SNAP_STATES.includes(i.s) ? i.s : 'none' };
    const c = int(i.c, 0, 100000000); if (c != null && o.s === 'ok') o.c = c;
    for (const [f, n] of [['l', 8], ['d', 8], ['st', 12], ['nu', 12], ['sn', 80], ['im', 200], ['mc', 60], ['tl', 120], ['cl', 6], ['sl', 60]]) { const v = str(i[f], n); if (v) o[f] = v; }
    const cm = int(i.cm, 0, 99); if (cm != null) o.cm = cm;
    const sh = int(i.sh, 1, 999); if (sh != null) o.sh = sh;
    const rf = int(i.rf, 1, 10000000); if (rf != null && o.s === 'ok') o.rf = rf;
    const ow = int(i.ow, 1, 999); if (ow != null) o.ow = Math.min(ow, o.q);
    if (i.fb) o.fb = 1;
    if (i.cmd) o.cmd = 1;
    items.push(o);
  }
  if (!items.length) return null;
  const out = { at: x.at, mode: SNAP_MODES.includes(x.mode) ? x.mode : 'zero', lang: str(x.lang, 8), sig: str(x.sig, 40), items };
  if (x.pv && typeof x.pv === 'object' && !Array.isArray(x.pv) && Number.isFinite(x.pa)) {
    const pv = {}; let n = 0;
    for (const k of Object.keys(x.pv)) { if (n >= SNAP_MAX) break; const v = x.pv[k]; if (Number.isFinite(v) && v >= 0.5 && k && k.length <= 80) { pv[k] = Math.min(10000000, Math.round(v)); n++; } }
    if (n) { out.pv = pv; out.pa = x.pa; }
  }
  return out;
}
/** Le plus récent de plusieurs relevés (cloud / appareil), ou null. */
const newestSnap = (...a) => a.filter(Boolean).sort((p, q) => q.at - p.at)[0] || null;

const TYPE_ORDER = ['Créatures', 'Planeswalkers', 'Batailles', 'Artefacts', 'Enchantements', 'Éphémères', 'Rituels', 'Terrains', 'Autres'];
/** Famille d'une carte d'après sa ligne de type (Artifact Creature → Créatures ; Artifact Land → Terrains). */
function typeBucket(tl) {
  const t = String(tl || '').toLowerCase();
  if (t.includes('creature')) return 'Créatures';
  if (t.includes('planeswalker')) return 'Planeswalkers';
  if (t.includes('battle')) return 'Batailles';
  if (t.includes('land')) return 'Terrains';
  if (t.includes('artifact')) return 'Artefacts';
  if (t.includes('enchantment')) return 'Enchantements';
  if (t.includes('instant')) return 'Éphémères';
  if (t.includes('sorcery')) return 'Rituels';
  return 'Autres';
}
const isLand = i => i.s === 'basic' || (i.tl ? typeBucket(i.tl) === 'Terrains' : false);
const byName = (a, b) => NAME_CMP(a.dn || a.n, b.dn || b.n);      // dn : nom affiché si différent de n (carte française)
const byCmcName = (a, b) => ((a.cm ?? 99) - (b.cm ?? 99)) || byName(a, b);
const sumGroup = items => ({ count: items.reduce((a, i) => a + i.q, 0), cost: items.reduce((a, i) => a + (i.c || 0), 0) });
/**
 * Regroupe les cartes pour le viewer. sort : 'mana' (colonnes par coût converti, terrains à part) · 'price' (du plus cher au moins cher) · 'type'.
 * ref : relevé de référence (valeur estimée, pas d'offres) : « Sans prix » au lieu de « Sans offre ». sb : carte de la réserve, groupe « Réserve » avant « Introuvables », toujours en fin de liste. Retourne [{ id, label, items, count, cost }] — les groupes vides n'existent pas.
 */
function groupSnap(items, sort, ref) {
  const list = items.filter(i => !i.sb), side = items.filter(i => i.sb), out = [];
  const add = (id, label, arr) => { if (arr.length) out.push({ id, label, items: arr, ...sumGroup(arr) }); };      // label : texte affiché (traduit) ; id : stable
  const nf = list.filter(i => i.s === 'nf').sort(byName), rest = list.filter(i => i.s !== 'nf');
  if (sort === 'price') {
    const priced = rest.filter(i => i.s === 'ok').sort((a, b) => (b.c - a.c) || byName(a, b));
    add('p', T('Du plus cher au moins cher'), priced);
    add('own', T('Dans ta collection'), rest.filter(i => i.s === 'own').sort(byName));
    add('np', T(ref ? 'Sans prix' : 'Sans offre'), rest.filter(i => i.s === 'none' || i.s === 'nohub').sort(byName));
    add('b', T('Terrains de base'), rest.filter(i => i.s === 'basic').sort(byName));
  } else if (sort === 'type') {
    const by = new Map(TYPE_ORDER.map(t => [t, []]));
    for (const i of rest) by.get(i.s === 'basic' ? 'Terrains' : typeBucket(i.tl)).push(i);
    for (const t of TYPE_ORDER) add('t-' + t, T(t), by.get(t).sort((a, b) => (a.s === 'basic') - (b.s === 'basic') || byCmcName(a, b)));
  } else {
    const nonLand = rest.filter(i => !isLand(i)), lands = rest.filter(isLand);
    for (let m = 0; m <= 7; m++) add('m' + m, m === 7 ? T('7 et plus') : String(m), nonLand.filter(i => Math.min(i.cm ?? 0, 7) === m).sort(byName));
    add('land', T('Terrains'), lands.sort((a, b) => (a.s === 'basic') - (b.s === 'basic') || byName(a, b)));
  }
  add('sb', T('Réserve'), side.sort(byName));        // réserve (Standard) : à part, quel que soit le tri
  add('nf', T('Introuvables'), nf);
  return out;
}
/** Courbe de mana : nombre d'exemplaires par coût (0 à 7+), hors terrains. */
function curveOf(items) {
  const c = new Array(8).fill(0);
  for (const i of items) if (i.s !== 'nf' && !isLand(i)) c[Math.min(i.cm ?? 0, 7)] += i.q;
  return c;
}
/** Fraîcheur d'un relevé : 'fresh' (< 24 h) ou 'old'. */
const snapAge = (snap, now) => ((now || Date.now()) - snap.at >= 24 * 3600e3 ? 'old' : 'fresh');

/** Document deck propre (même forme en local et dans Firestore). */
function deckDoc(x, now) {
  now = Number.isFinite(now) ? now : Date.now();
  const text = String(x.text || '').slice(0, TEXT_MAX);
  const name = String(x.name || '').trim().slice(0, NAME_MAX) || suggestName(text);
  const cards = parseDeck(text).cards.length;
  const history = (Array.isArray(x.history) ? x.history : []).filter(e => e && Number.isFinite(e.at) && Number.isFinite(e.total)).slice(-HISTORY_MAX)
    .map(e => ({ at: e.at, total: Math.round(e.total), mode: SNAP_MODES.includes(e.mode) ? e.mode : 'zero', found: Math.max(0, e.found | 0), count: Math.max(0, e.count | 0), sig: typeof e.sig === 'string' ? e.sig.slice(0, 40) : '' }));
  const out = { name, text, opts: sanitizeOpts(x.opts), cards, history, createdAt: Number.isFinite(x.createdAt) ? x.createdAt : now, updatedAt: now };
  const snap = sanitizeSnap(x.snap); if (snap) out.snap = snap;          // prix gardés carte par carte (viewer) : absent tant qu'aucune recherche n'a été enregistrée
  return out;
}

/** Lecture tolérante d'un document venu du stockage (local ou cloud). */
function readDeck(id, d) {
  d = d || {};
  const n = (v, f) => Number.isFinite(v) ? v : f;
  const out = deckDoc({ name: d.name, text: d.text, opts: d.opts, history: d.history, snap: d.snap, createdAt: n(d.createdAt, 0) }, n(d.updatedAt, 0));
  out.id = String(id); return out;
}

/** « à l'instant », « il y a 3 h », « hier », « 12 sept. » */
function relTime(ts, now) {
  now = now || Date.now();
  const s = Math.round((now - ts) / 1000);
  if (!Number.isFinite(s)) return '';
  if (s < 45) return T('à l\'instant');
  const rtf = new Intl.RelativeTimeFormat(LOC(), { numeric: 'auto' });
  if (s < 3600) return rtf.format(-Math.max(1, Math.round(s / 60)), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  if (s < 7 * 86400) return rtf.format(-Math.round(s / 86400), 'day');
  return new Date(ts).toLocaleDateString(LOC(), { day: 'numeric', month: 'short' });
}

/** Ancienneté d'une date 'AAAA-MM-JJ' en mots : « aujourd'hui », « hier », « il y a 5 jours », « il y a 3 semaines », « il y a 2 mois », « il y a 1 an » ('' si illisible). */
function agoDay(day, now) {
  const t = Date.parse(String(day || '') + 'T12:00:00Z'); if (!Number.isFinite(t)) return '';
  const d = Math.max(0, Math.floor(((now || Date.now()) - t) / 86400000));
  if (d < 1) return T('aujourd\'hui'); if (d < 2) return T('hier'); if (d < 14) return T('il y a {n} jours', { n: d });
  if (d < 60) return T('il y a {n} semaines', { n: Math.floor(d / 7) });
  if (d < 365) { const m = Math.floor(d / 30.44); return m === 1 ? T('il y a 1 mois') : T('il y a {n} mois', { n: m }); }      // « mois » : même mot au singulier et au pluriel en français, pas en anglais
  const y = Math.floor(d / 365.25); return TN(y, 'il y a {n} an', 'il y a {n} ans', { n: y });
}

/** Identifiant de document : valable pour Firestore, sans dépendre d'une API. */
function newDeckId() {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789'; let out = '';
  try { const b = new Uint8Array(20); crypto.getRandomValues(b); for (const x of b) out += a[x % a.length]; }
  catch (e) { for (let i = 0; i < 20; i++) out += a[Math.floor(Math.random() * a.length)]; }
  return out;
}

/* Export Node pour les tests. */
/* ── Langue des offres, repli anglais, récapitulatif ──────────────────────────────────────── */
/** Offres dans la langue demandée s'il y en a, sinon toutes (repli). Évite qu'une offre EN moins chère masque une offre FR. */
function preferLang(list, lang) { const w = list.filter(o => o.lang === lang); return w.length ? w : list; }

/**
 * Remplace une ligne de panier devenue indisponible : offres de remplacement qui couvrent `need` exemplaires, au moindre coût.
 * offers : offres déjà filtrées par l'appelant (critères, langue, mode, hors offres écartées).
 * opts : {mode, prefer:Set<sellerId> (vendeurs déjà dans le panier : en Direct, le port est déjà payé), ship:centimes}
 * Retourne [{offer, n}] ; la somme des n peut être inférieure à `need` si le stock manque.
 */
function replaceParts(offers, need, opts = {}) {
  const mode = opts.mode === 'direct' ? 'direct' : 'zero', ship = mode === 'direct' ? (opts.ship || 0) : 0, prefer = opts.prefer || new Set();
  const pool = offers.filter(o => o && o.qty > 0 && o.price > 0 && (mode !== 'zero' || o.hub));
  const eff = o => o.price + (ship && !prefer.has(o.sellerId) ? ship / Math.max(1, Math.min(need, o.qty)) : 0);  // nouveau vendeur = un port de plus, réparti sur ses exemplaires
  pool.sort((a, b) => (eff(a) - eff(b)) || byPrice(a, b));
  return allocate(pool, need, null).parts;
}

/** Offres exploitables dans un mode : Zero = vendeurs « hub » seulement ; langue demandée prioritaire (sauf choix manuel `keepAll`). */
function forMode(list, mode, lang, keepAll) {
  const l = mode === 'zero' ? list.filter(o => o.hub) : list;
  return keepAll ? l : preferLang(l, lang);
}

/** La carte a-t-elle au moins une offre utilisable dans ce mode, dans la langue demandée ? (sinon : repli anglais utile) */
function needsEnglish(offers, opts) {
  return !offers.some(o => passes(o, opts) && (opts.mode !== 'zero' || o.hub) && o.lang === opts.lang);
}

/**
 * Récapitulatif d'un résultat.
 * items : [{state:'ok'|'none'|'nohub'|'notfound'|'loading', qty, short, parts:[{lang, n}]}]
 * → {total, found, copies, byLang:{lang:{cards, copies}}, none, nohub, notfound, partial, loading}
 */
function recapOf(items) {
  const r = { total: items.length, found: 0, copies: 0, byLang: {}, none: 0, nohub: 0, notfound: 0, partial: 0, loading: 0 };
  for (const it of items) {
    if (it.state === 'ok') {
      r.found++;
      if (it.short > 0) r.partial++;
      const parts = it.parts || [];
      for (const p of parts) { r.copies += p.n; const b = r.byLang[p.lang || '?'] || (r.byLang[p.lang || '?'] = { cards: 0, copies: 0 }); b.copies += p.n; }
      const top = (parts[0] && parts[0].lang) || '?';
      (r.byLang[top] || (r.byLang[top] = { cards: 0, copies: 0 })).cards++;
    } else if (it.state === 'none') r.none++;
    else if (it.state === 'nohub') r.nohub++;
    else if (it.state === 'notfound') r.notfound++;
    else r.loading++;
  }
  return r;
}


/* ── Prix de référence Cardmarket (donnés par Scryfall) ──────────────────────────────────────── */
/** « 1.23 » (euros, texte Scryfall) → 123 centimes ; null si absent ou nul. */
const eurCents = v => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null; };
/** Référence la moins chère parmi les impressions (foil ou non) : sert quand l'impression de l'offre n'a pas de prix. */
function minRef(bps, foil) {
  let m = null;
  for (const b of bps || []) { const v = foil ? b.ef : b.eu; if (Number.isFinite(v) && v > 0 && (m == null || v < m)) m = v; }
  return m;
}
/** Prix retenu pour une carte (parts : [{offer, n}]) comparé à la référence Cardmarket. Retourne null sans référence exploitable.
 *  level : good (au plus 5 % au-dessus) · ok · warn (plus de 40 % au-dessus ET au moins 0,30 €). unit/ref : centimes par exemplaire. */
function refInfo(parts, bps) {
  let n = 0, cost = 0, ref = 0;
  for (const p of parts || []) {
    const r = Number.isFinite(p.offer.ref) && p.offer.ref > 0 ? p.offer.ref : minRef(bps, p.offer.foil);
    if (r == null) return null;
    n += p.n; cost += p.offer.price * p.n; ref += r * p.n;
  }
  if (!n || !ref) return null;
  const unit = cost / n, rf = ref / n, diff = unit - rf;
  return { unit: Math.round(unit), ref: Math.round(rf), diff: Math.round(diff), pct: Math.round(diff / rf * 100), level: unit <= rf * 1.05 ? 'good' : (unit > rf * 1.4 && diff >= 30) ? 'warn' : 'ok' };
}
/** Total du relevé face à la référence, sur les cartes qui en ont une : { ref, cost, n, cards }. */
function refTotals(items) {
  let ref = 0, cost = 0, n = 0, cards = 0;
  for (const i of items) {
    if (i.s !== 'ok' || !i.rf || i.c == null) continue;
    const m = Math.max(1, i.q - (i.ow || 0) - (i.sh || 0));
    ref += i.rf * m; cost += i.c; n += m; cards++;
  }
  return { ref, cost, n, cards, pct: ref ? Math.round((cost - ref) / ref * 100) : 0 };
}

/* ── Évolution des prix carte par carte ────────────────────────────────────────────────────── */
/** Prix unitaire (centimes) d'une carte du relevé, ou null. */
const unitOf = i => (i.s === 'ok' && i.c != null ? Math.round(i.c / Math.max(1, i.q - (i.ow || 0) - (i.sh || 0))) : null);
/** Prix unitaires d'un relevé, à garder dans le suivant : { clé: centimes }. */
function pvOf(snap) {
  if (!snap) return null;
  const pv = {}; let n = 0;
  for (const i of snap.items) { const u = unitOf(i); if (u != null && u > 0 && n < SNAP_MAX) { pv[i.k] = u; n++; } }
  return n ? pv : null;
}
/** Variations par rapport au relevé précédent : Map(clé → { unit, prev, diff, tot }) ; tot = écart sur le prix payé pour la quantité demandée. */
function snapDeltas(items, pv) {
  const out = new Map(); if (!pv) return out;
  for (const i of items) {
    const u = unitOf(i), p = pv[i.k];
    if (u != null && Number.isFinite(p) && p !== u) out.set(i.k, { unit: u, prev: p, diff: u - p, tot: (u - p) * Math.max(1, i.q - (i.ow || 0) - (i.sh || 0)) });
  }
  return out;
}
/** Plus fortes variations : { up: [...], down: [...] } (n par sens), triées par écart total. */
function topMovers(items, deltas, n = 3) {
  const by = new Map(items.map(i => [i.k, i])), all = [...deltas].map(([k, d]) => ({ item: by.get(k), ...d })).filter(x => x.item);
  return { up: all.filter(x => x.tot > 0).sort((a, b) => b.tot - a.tot).slice(0, n), down: all.filter(x => x.tot < 0).sort((a, b) => a.tot - b.tot).slice(0, n) };
}

/* ── Commandant ───────────────────────────────────────────────────────────────────────────────── */
/** Cartes sous un en-tête « Commander » de la liste (export Archidekt, MTGO…). Vide si la liste n'en a pas. */
function commanderKeys(text) {
  const out = []; let on = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { on = false; continue; }
    if (/^(commanders?|commandants?)\s*(\(\d+\))?\s*:?\s*$/i.test(line)) { on = true; continue; }
    if (HEADER_RE.test(line)) { on = false; continue; }
    if (on) { const p = parseLine(line); if (p && !p.ignored && !out.includes(p.key)) out.push(p.key); }
  }
  return out;
}
/** Sans en-tête : la première carte de la liste (export EDHREC) est le commandant si elle est légendaire (créature ou planeswalker). */
const canLead = tl => /legendary/i.test(String(tl || '')) && /(creature|planeswalker)/i.test(String(tl || ''));

/* ── Créateur de deck (Standard / Commander) ──────────────────────────────────────────────────── */
const DK_FORMATS = {
  standard: { label: T('Standard'), size: 60, copies: 4, side: 15, hint: T('60 cartes, 4 exemplaires d\'une même carte au maximum (terrains de base exclus), réserve de 15 facultative.') },
  commander: { label: 'Commander', size: 100, copies: 1, side: 0, hint: T('100 cartes dont ton commandant, un seul exemplaire de chaque carte (terrains de base exclus).') },
};
/** Cartes dont le texte Oracle lève la limite d'exemplaires : clé (ownKey) → maximum dans un deck, quel que soit le format. « A deck can have any number of cards named … » : sans limite ;
 *  « up to seven / nine » : Seven Dwarves, Nazgûl. Liste en dur (le texte Oracle n'est pas gardé dans les infos des cartes) : recherche Scryfall o:"deck can have" du 24 octobre 2026,
 *  cartes légales seulement (Once More with Feeling : interdite). À compléter quand une nouvelle carte de ce genre sort. */
const DK_ANY = new Map([
  ['relentless rats', Infinity], ['shadowborn apostle', Infinity], ['persistent petitioners', Infinity], ['rat colony', Infinity],
  ['dragons approach', Infinity], ['sphinxs approach', Infinity], ['slime against humanity', Infinity], ['hare apparent', Infinity],
  ['templar knight', Infinity], ['tempest hawk', Infinity], ['cid timeless artificer', Infinity],
  ['seven dwarves', 7], ['nazgul', 9],
]);
/** Exemplaires d'une même carte permis dans un deck (deck et réserve) : terrains de base sans limite, cartes de DK_ANY à leur maximum, sinon la règle du format (4 · Commander : 1). */
const dkMaxCopies = (fmt, k) => (BASIC_NAMES.has(k) ? Infinity : DK_ANY.get(k) || (DK_FORMATS[fmt] || DK_FORMATS.standard).copies);
/** Format noté en tête d'une liste par le créateur (« // Deck Deal : commander »), '' sinon. */
function dkFormat(text) { const m = String(text || '').match(/^\/\/\s*Deck Deal\s*:\s*(standard|commander)\b/im); return m ? m[1].toLowerCase() : ''; }
/** Format d'un deck : celui noté par le créateur, sinon « commander » si la liste a un en-tête Commander, sinon ''. */
const dkFmtOf = text => dkFormat(text) || (commanderKeys(text).length ? 'commander' : '');
/** Un deck passe-t-il le filtre de l'écran « Mes decks » ? f = { fmt ('' = tous | 'commander' | 'standard'), colors (« WU » : le deck doit avoir toutes ces couleurs, d'après ses terrains de base) }. */
function dkMatch(text, f) {
  const fmt = f && f.fmt, colors = (f && f.colors) || '';
  if (fmt && dkFmtOf(text) !== fmt) return false;
  if (colors) { const have = dkColors(text); for (const c of colors) if (!have.includes(c)) return false; }
  return true;
}
/** Réserve d'une liste : lignes « SB: 2 Negate » et section « Sideboard » d'un export (deckSecs) : [{ key, name, qty }] (additionnée par carte). parseDeck ne les voit pas. */
function dkSideCards(text) {
  const out = new Map();
  for (const [raw, sec] of deckSecs(text)) {
    const m = raw.trim().match(/^SB:\s*(.+)$/i); if (!m && sec !== 'side') continue;
    const p = parseLine(m ? m[1] : raw); if (!p || p.ignored) continue;
    const k = ownKey(p.name), cur = out.get(k); if (cur) cur.qty += p.qty; else out.set(k, { key: k, name: p.name, qty: p.qty });
  }
  return [...out.values()];
}
/* Carte de présentation d'un deck (liste des decks) : ligne de commentaire « // Deck Deal cover : Sol Ring » dans le texte, donc synchronisée avec lui sans champ de plus. */
const COVER_LINE = '// Deck Deal cover : ', COVER_RE = /^\s*\/\/\s*Deck Deal cover\s*:\s*(.*?)\s*$/i;
function dkCover(text) { for (const l of String(text || '').split(/\r?\n/)) { const m = l.match(COVER_RE); if (m && m[1]) return m[1]; } return ''; }
/** Texte avec cette carte de présentation (juste après la ligne de format) ; name vide : la retire. */
function dkSetCover(text, name) {
  const lines = String(text || '').split(/\r?\n/).filter(l => !COVER_RE.test(l)), n = String(name || '').trim();
  if (n) { const at = lines.findIndex(l => /^\s*\/\/\s*Deck Deal\s*:/i.test(l)); lines.splice(at >= 0 ? at + 1 : 0, 0, COVER_LINE + n); }
  return lines.join('\n');
}
/** Carte qui illustre un deck : { key, name, auto } — celle choisie (si elle y est encore), sinon le commandant, sinon la carte la plus chère hors terrains (metaOf(clé) → { eu, tl }), sinon la première. null : deck vide. */
function dkCoverCard(text, metaOf) {
  const pd = parseDeck(text), pool = [...pd.cards, ...dkSideCards(text)];
  if (!pool.length) return null;
  const pick = (c, auto) => ({ key: ownKey(c.key), name: c.name, auto });
  const want = ownKey(dkCover(text));
  if (want) { const c = pool.find(x => ownKey(x.key) === want); if (c) return pick(c, false); }
  const cmd = commanderKeys(text).map(k => pd.cards.find(c => c.key === k)).find(Boolean); if (cmd) return pick(cmd, true);
  let best = null, bp = -1, any = null, ap = -1;
  for (const c of pd.cards) {
    const m = metaOf(ownKey(c.key)), eu = m && Number.isFinite(m.eu) ? m.eu : -1;
    if (eu > ap) { any = c; ap = eu; }
    if (eu > bp && !(m && /\bland\b/i.test(m.tl || ''))) { best = c; bp = eu; }
  }
  return pick(best || any || pd.cards[0] || pool[0], true);
}
/** Liste du créateur → texte : { fmt, main:[{ name, qty }], side:[{ name, qty }], cmdr:[{ name }], cover (nom de la carte de présentation, facultatif) }.
 *  Même syntaxe que les exports du marché (en-tête « Commander », lignes « SB: ») : le reste de l'app la lit sans rien savoir du créateur. */
function dkBuildText({ fmt, main, side, cmdr, cover }) {
  const out = ['// Deck Deal : ' + (fmt === 'commander' ? 'commander' : 'standard')];
  if (cover) out.push(COVER_LINE + cover);
  if (fmt === 'commander' && cmdr && cmdr.length) { out.push('Commander'); cmdr.forEach(c => out.push('1 ' + c.name)); out.push(''); }
  out.push('Deck');
  (main || []).forEach(c => out.push(c.qty + ' ' + c.name));
  if (fmt !== 'commander' && side && side.length) { out.push(''); side.forEach(c => out.push('SB: ' + c.qty + ' ' + c.name)); }
  return out.join('\n');
}
/** Texte → { fmt ('' si inconnu), main, side, cmdr } : cartes dans l'ordre de la liste, doublons additionnés, clé = clé de collection (face avant).
 *  Lit aussi les listes venues d'ailleurs (sections de deckSecs) : « Commander », « Sideboard » et « Companion » (réserve), lignes « SB: », Creatures, Lands… ; Maybeboard, Tokens, About : laissés de côté. */
function dkParse(text) {
  const main = new Map(), side = new Map(), cmdr = [];
  const add = (m, p) => { const k = ownKey(p.name), cur = m.get(k); if (cur) cur.qty += p.qty; else m.set(k, { key: k, name: p.name, qty: p.qty }); };
  for (const [raw, sec] of deckSecs(text)) {
    const line = raw.trim();
    if (!line || /^(\/\/|#)/.test(line)) continue;
    const sb = line.match(/^SB:\s*(.+)$/i);
    if (sb) { const p = parseLine(sb[1]); if (p && !p.ignored) add(side, p); continue; }
    const p = parseLine(line); if (!p || p.ignored || sec === 'skip') continue;
    if (sec === 'cmdr') { const k = ownKey(p.name); if (!cmdr.some(c => c.key === k)) cmdr.push({ key: k, name: p.name }); }
    else add(sec === 'side' || sec === 'comp' ? side : main, p);
  }
  return { fmt: dkFormat(text), main: [...main.values()], side: [...side.values()], cmdr, cover: dkCover(text) };
}
/** Valeur estimée d'un deck : prix tendance Cardmarket (centimes) × exemplaires de chaque carte du deck, terrains de base et réserve exclus, cartes possédées comprises.
 *  metaOf(clé) → infos de la carte { eu } ; null/undefined = pas encore lue (à chercher : « missing »). → { cents, known (cartes chiffrées), total (cartes différentes), missing: [{ key, name }], noPrice (lues mais sans prix) } */
function dkValue(text, metaOf) {
  let cents = 0, known = 0, noPrice = 0; const missing = [], cards = parseDeck(text).cards;
  for (const c of cards) {
    const k = ownKey(c.key), m = metaOf(k);
    if (!m) missing.push({ key: k, name: c.name }); else if (Number.isFinite(m.eu)) { cents += m.eu * c.qty; known++; } else noPrice++;
  }
  return { cents: Math.round(cents), known, total: cards.length, missing, noPrice };
}
/** Taille d'un deck comptée comme le viewer : tous les exemplaires, commandant et terrains de base compris, réserve « SB: » à part.
 *  size : 100 si le format Commander est connu (noté par le créateur ou en-tête « Commander »), sinon 0. → { n, size } */
function dkCount(text) { return { n: parseDeck(text).copies, size: dkFmtOf(text) === 'commander' ? DK_FORMATS.commander.size : 0 }; }
/** « 41/100 cartes » (Commander), sinon « 36 cartes » : même chiffre dans Mes decks, la feuille d'un deck et l'enregistrement. */
function dkCountText(text) { const c = dkCount(text); return c.size ? T('{n}/{size} cartes', { n: c.n.toLocaleString(LOC()), size: c.size }) : TN(c.n, '{n} carte', '{n} cartes'); }
/** Couleurs d'un deck d'après ses terrains de base (« WUBRG », dans cet ordre ; Wastes ignorés) : '' si le deck n'en a pas. */
function dkColors(text) {
  const have = new Set(), by = { plains: 'W', island: 'U', swamp: 'B', mountain: 'R', forest: 'G' };
  for (const b of parseDeck(text).basics) { const c = by[b.key.replace(/^snow covered /, '')]; if (c && b.qty > 0) have.add(c); }
  return [...'WUBRG'].filter(c => have.has(c)).join('');
}
/** Vérifie un deck du créateur. d = { main, side, cmdr } (comme dkParse) ; metaOf(clé) → { ci } ou null (identité de couleur, si connue).
 *  Retourne { n (cartes du deck, commandant compris), side, size, issues: [{ lv: 'bad'|'warn', t }] } : « bad » = règle enfreinte, « warn » = deck pas fini. */
function dkCheck(fmt, d, metaOf) {
  const f = DK_FORMATS[fmt] || DK_FORMATS.standard, main = d.main || [], side = d.side || [], cmdr = d.cmdr || [], issues = [];
  const sum = a => a.reduce((x, c) => x + c.qty, 0), n = sum(main) + cmdr.length, ns = sum(side);
  if (fmt === 'commander') {
    if (!cmdr.length) issues.push({ lv: 'bad', t: T('Aucun commandant : choisis-en un.') });
    else if (cmdr.length > 2) issues.push({ lv: 'bad', t: T('Deux commandants au maximum (partenaires).') });
    if (n < f.size) issues.push({ lv: 'warn', t: TN(f.size - n, 'Il manque {n} carte pour arriver à {size}.', 'Il manque {n} cartes pour arriver à {size}.', { n: f.size - n, size: f.size }) });
    else if (n > f.size) issues.push({ lv: 'bad', t: TN(n - f.size, '{n} carte en trop ({size} exactement).', '{n} cartes en trop ({size} exactement).', { n: n - f.size, size: f.size }) });
    for (const c of main) {
      if (BASIC_NAMES.has(c.key)) continue;
      const max = dkMaxCopies(fmt, c.key);
      if (c.qty > max) issues.push({ lv: 'bad', t: max === 1 ? T('{name} : {n} exemplaires (un seul en Commander).', { name: c.name, n: c.qty }) : T('{name} : {n} exemplaires ({max} au maximum).', { name: c.name, n: c.qty, max }) });
      if (cmdr.some(x => x.key === c.key)) issues.push({ lv: 'bad', t: T('{name} est déjà ton commandant.', { name: c.name }) });
    }
    for (const c of cmdr) { const m = metaOf && metaOf(c.key); if (m && m.cd === 0) issues.push({ lv: 'warn', t: T('{name} ne peut normalement pas être commandant.', { name: c.name }) }); }      // cd : 0 = carte lue sur Scryfall et non éligible (absent = pas encore lue)
    const ci = new Set(); let known = cmdr.length > 0;
    for (const c of cmdr) { const m = metaOf && metaOf(c.key); if (m && typeof m.ci === 'string') for (const x of m.ci) ci.add(x); else known = false; }
    if (known) for (const c of main) { const m = metaOf(c.key); if (m && typeof m.ci === 'string' && [...m.ci].some(x => !ci.has(x))) issues.push({ lv: 'warn', t: T('{name} sort de l\'identité de couleur du commandant.', { name: c.name }) }); }
  } else {
    if (n < f.size) issues.push({ lv: 'warn', t: TN(f.size - n, 'Il manque {n} carte ({size} minimum).', 'Il manque {n} cartes ({size} minimum).', { n: f.size - n, size: f.size }) });
    if (ns > f.side) issues.push({ lv: 'bad', t: T('Réserve de {n} cartes ({max} au maximum).', { n: ns, max: f.side }) });
    const tot = new Map(), nm = new Map();
    for (const c of [...main, ...side]) { if (BASIC_NAMES.has(c.key)) continue; tot.set(c.key, (tot.get(c.key) || 0) + c.qty); nm.set(c.key, c.name); }
    for (const [k, q] of tot) { const max = dkMaxCopies(fmt, k); if (q > max) issues.push({ lv: 'bad', t: T('{name} : {n} exemplaires ({max} au maximum).', { name: nm.get(k), n: q, max }) }); }
  }
  return { n, side: ns, size: f.size, issues };
}

/* ── Collection : lecture CSV / texte, cartes possédées ──────────────────────────────────────── */
/** Clé d'une carte pour la collection : nom de la première face, normalisé (« Fire // Ice » et « Fire » se rejoignent). */
const ownKey = name => frontName(name);
const COLL_MAX = 20000;

function csvSplit(line, d) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === d) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out.map(x => x.trim());
}
/** Colonnes du nom, dans l'ordre de préférence : « Simple Name » de TCGplayer d'abord (« Name » y garde la variante : « Sol Ring (Foil Etched) »). */
const NAME_COLS = ['simple name', 'name', 'card name', 'card', 'cardname', 'product name', 'nom', 'nom de la carte', 'carte'];
const LANG_COLS = ['language', 'langue', 'lang', 'card language'];
const QTY_COLS = ['quantity', 'qty', 'count', 'amount', 'quantite', 'reg qty', 'total qty', 'owned'];
/** Colonnes de l'édition : code d'extension (dans cet ordre : « Set code » de ManaBox, « Edition Code » d'Archidekt, « Set ID » de MTGGoldfish, « Edition » de Moxfield… ;
 *  un nom d'extension en toutes lettres est ignoré, voir csvSetCode) et numéro de collection. */
const SET_COLS = ['set code', 'edition code', 'expansion code', 'set id', 'edition', 'set', 'code'];
/** Colonnes qui ne contiennent qu'un code (les autres, « Edition » ou « Set », portent un code chez Moxfield mais un nom chez Deckbox ou TCGplayer). */
const SET_CODE_COLS = ['set code', 'edition code', 'expansion code', 'set id', 'code'];
/** Code d'extension lu dans une colonne « Edition » / « Set » : « cmm », « CMM » ou « pmps06 » oui ; « Ixalan », « Theros » (nom Deckbox, 6 lettres comme un code) non. */
const csvSetCode = (v, codeCol) => { const s = String(v == null ? '' : v).trim(); return codeCol || (/^[A-Za-z0-9]{2,6}$/.test(s) && (s === s.toLowerCase() || s === s.toUpperCase())) ? s : ''; };
/** Exemplaires foil comptés à part (Decked Builder : « Reg Qty » + « Foil Qty ») : leur propre ligne foil. */
const FOIL_QTY_RE = /^foil (qty|quantity|count)$/;
/** Colonne qui dit si la ligne est foil : « Foil » (ManaBox : foil / normal / etched ; Moxfield, Deckbox, Delver : foil ou vide ; « true »), « Finish » (Archidekt : Foil / Normal / Etched), « Printing » (Dragon Shield, TCGplayer : Foil / Normal). */
const FOIL_FLAG_COLS = ['foil', 'finish', 'printing'];
const csvFoil = v => /^\s*(foil|etched|foil etched|true|yes|oui|1|x)\s*$/i.test(String(v == null ? '' : v));
/** Colonne « Binder Type » de ManaBox : une liste (« list », souhaits, achats) n'est pas dans la collection (FAQ ManaBox : les classeurs pour les cartes possédées, les listes pour les autres). */
const LIST_TYPE_RE = /^\s*(list|wish ?list|buy ?list)\s*$/i;
/** État de l'exemplaire (« Condition » : ManaBox near_mint, Moxfield Near Mint, Cardmarket NM…) → échelle Cardmarket (COND_CM) ; '' si illisible. */
const COND_COLS = ['condition', 'etat', 'card condition'];
const COND_IN = { m: 'mt', mt: 'mt', mint: 'mt', nm: 'nm', nearmint: 'nm', ex: 'ex', excellent: 'ex', sp: 'ex', slightlyplayed: 'ex', lightlyplayed: 'ex', lightplayed: 'lp', gd: 'gd', good: 'gd', mp: 'gd', moderatelyplayed: 'gd', lp: 'lp', pl: 'pl', played: 'pl', hp: 'pl', heavilyplayed: 'pl', po: 'po', poor: 'po', d: 'po', damaged: 'po' };
const csvCond = v => COND_IN[String(v == null ? '' : v).toLowerCase().replace(/[^a-z]/g, '')] || '';
const NUM_COLS = ['collector number', 'card number', 'collector s number', 'collector', 'number', 'cn', 'nr', 'numero'];
const colNorm = x => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Repère de date d'ajout dans le texte de la collection : « 3 Sol Ring (Dh7zqkx) *FR* », secondes en base 36. Une ligne que l'ancienne version lit encore : elle y voit un code d'extension et l'ignore. */
const DATE_MARK_RE = /\s+\(D([0-9a-z]{5,7})\)(?=(?:\s+\*[A-Za-z]+(?:-[A-Za-z]+)?\*)?\s*$)/;
/** Édition dans le texte de la collection, avant la date et la langue : « 2 Sol Ring (CMM) 400 (Dh7zqkx) *FR* » ; aussi « 1 Sol Ring (CMM) 400 *F* » (Moxfield, ManaBox).
 *  L'ancienne version la lit comme un code d'extension et l'ignore (la carte et sa langue restent justes). */
const ED_MARK_RE = /\s+\(([A-Za-z0-9]{2,6})\)\s+([^\s()|*,;"#]{1,12})(?=(?:\s+\*[A-Za-z]+(?:-[A-Za-z]+)?\*)*\s*$)/;
/** Emplacement et détails dans le texte de la collection, avant « (FOIL) » et l'édition : « 1 Sol Ring (DETAILS) pk3x9a-cnm (FOIL) (CMM) 400 (Dh7zqkx) *FR* ».
 *  L'ancienne version le lit comme un code d'extension suivi d'un numéro et l'ignore (carte, foil, édition et langue restent justes) ; 7 lettres : jamais pris pour une édition. */
const ATTR_MARK_RE = /\s+\(DETAILS\)\s+([a-z0-9-]{1,80})(?=(?:\s+\(FOIL\))?(?:\s+\*[A-Za-z]+(?:-[A-Za-z]+)?\*)*\s*$)/;
const dateNowSec = () => Math.floor(Date.now() / 1000);
/* ── Une carte, plusieurs lignes : entrée { n, q (total), l (langue la plus fournie), x? { ligne: exemplaires } (plusieurs lignes, ou une ligne avec édition), d? } ───
   Une ligne = une langue, et une édition si elle est connue (« 2 Sol Ring (CMM) 400 *FR* » + « 1 Sol Ring *EN* » dans le texte) ; la langue '' = non précisée.
   Clé de ligne : 'fr' (sans édition) ou 'fr|cmm|400' (langue|code d'extension Scryfall|numéro de collection), suivie de '*' pour des exemplaires foil ('fr*', 'fr|cmm|400*', '*' : foil sans langue).
   Les totaux (q) servent partout ailleurs (decks, paniers). */
const LINE_RANK = ['fr', 'en', 'de', 'es', 'it', 'pt', 'jp', 'zh-CN', 'ru', 'kr', 'zh-TW', ''];
const lineRank = l => { const i = LINE_RANK.indexOf(l || ''); return i < 0 ? LINE_RANK.length : i; };
/** Édition d'un exemplaire : 'cmm|400' (code d'extension en minuscules, numéro de collection tel qu'imprimé), '' si incomplète ou illisible. */
const edKey = (set, num) => {
  const s = String(set == null ? '' : set).trim().toLowerCase(), n = String(num == null ? '' : num).trim();
  return /^[a-z0-9]{2,6}$/.test(s) && /^[^\s()|*,;"#]{1,12}$/.test(n) ? s + '|' + n : '';
};
const edSet = e => String(e || '').split('|')[0];
const edNum = e => { const s = String(e || ''), i = s.indexOf('|'); return i < 0 ? '' : s.slice(i + 1); };
/** Édition comparable : « cmm|0400 » et « CMM|400 » → 'cmm|400' (zéros de tête du numéro ignorés, comme les numéros CardTrader) ; '' sans édition. */
const edNorm = e => (e ? edSet(e).toLowerCase() + '|' + edNum(e).trim().toLowerCase().replace(/^0+(?=[0-9a-z])/, '') : '');
/** « CMM 400 » */
const edLabel = e => (e ? edSet(e).toUpperCase() + ' ' + edNum(e) : '');
/* ── Emplacement et détails d'un exemplaire (facultatifs), en fin de clé de ligne après « # » : 'fr|cmm|400*#pk3x9a-cnm-s'.
   Mots, dans cet ordre : p<emplacement> · o<emplacement d'origine> (cartes d'un deck monté : où elles retournent au démontage) · c<état Cardmarket> · s (signée) · a (altérée) · m (erreur d'impression). */
const COND_CM = ['mt', 'nm', 'ex', 'gd', 'lp', 'pl', 'po'];
const PLACE_ID_RE = /^[a-z0-9]{2,12}$/;
/** Détails lus dans un mot : { p?, o?, c?, s?, a?, m? } ; les mots inconnus sont ignorés. */
function attrOf(w) {
  const a = {};
  for (const t of String(w || '').split('-')) {
    const k = t[0], v = t.slice(1);
    if ((k === 'p' || k === 'o') && PLACE_ID_RE.test(v)) a[k] = v;
    else if (k === 'c' && COND_CM.includes(v)) a.c = v;
    else if ((k === 's' || k === 'a' || k === 'm') && !v) a[k] = 1;
  }
  return a;
}
/** Mot des détails, toujours dans le même ordre ('' : aucun). */
const attrWord = a => (a ? [a.p && 'p' + a.p, a.o && 'o' + a.o, a.c && 'c' + a.c, a.s && 's', a.a && 'a', a.m && 'm'].filter(Boolean).join('-') : '');
const lineKey = (l, e, f, a) => { const w = a && typeof a === 'object' ? attrWord(a) : a || ''; return (l || '') + (e ? '|' + e : '') + (f ? '*' : '') + (w ? '#' + w : ''); };
/** Clé sans emplacement ni détails : 'fr|cmm|400*'. */
const lineHead = g => { const s = String(g || ''), i = s.indexOf('#'); return i < 0 ? s : s.slice(0, i); };
/** Mot des détails d'une ligne ('' : aucun). */
const lineAw = g => { const s = String(g || ''), i = s.indexOf('#'); return i < 0 ? '' : s.slice(i + 1); };
const lineAttrs = g => attrOf(lineAw(g));
/** Emplacement d'une ligne ('' : non rangé). */
const linePlace = g => lineAttrs(g).p || '';
/** Exemplaires foil ? (repère '*' en fin de clé, avant les détails). */
const lineFoil = g => lineHead(g).endsWith('*');
/** Clé sans le repère foil ni les détails : 'fr|cmm|400'. */
const lineBase = g => { const s = lineHead(g); return s.endsWith('*') ? s.slice(0, -1) : s; };
const lineLang = g => { const s = lineBase(g), i = s.indexOf('|'); return i < 0 ? s : s.slice(0, i); };
const lineEd = g => { const s = lineBase(g), i = s.indexOf('|'); return i < 0 ? '' : s.slice(i + 1); };
/** La même ligne avec d'autres détails : patch { p: 'abc' } pose l'emplacement, { p: '' } le retire ; les autres détails restent. */
const lineSet = (g, patch) => { const a = { ...lineAttrs(g), ...patch }; for (const k in patch) if (!patch[k]) delete a[k]; return lineKey(lineLang(g), lineEd(g), lineFoil(g), a); };
/** Ordre d'affichage des lignes : langue (fr, en, autres, non précisée), puis sans édition, puis éditions par code et numéro ; les foil après les non foil de la même édition ; puis emplacement et détails. */
const lineCmp = (a, b) => lineRank(lineLang(a)) - lineRank(lineLang(b)) || (lineEd(a) ? 1 : 0) - (lineEd(b) ? 1 : 0) || lineEd(a).localeCompare(lineEd(b), 'en', { numeric: true }) || (lineFoil(a) ? 1 : 0) - (lineFoil(b) ? 1 : 0) || (lineAw(a) < lineAw(b) ? -1 : lineAw(a) > lineAw(b) ? 1 : 0);
/** Lignes d'une entrée : [[clé de ligne, exemplaires]] dans l'ordre d'affichage ; toujours au moins une ligne si la carte existe. */
function collLines(x) {
  if (!x || !(x.q > 0)) return [];
  const ls = x.x ? Object.entries(x.x).filter(e => e[1] > 0) : [[x.l || '', x.q]];
  return ls.sort((a, b) => lineCmp(a[0], b[0]));
}
/** Ligne la plus fournie d'une liste de lignes (sa clé ; '' si c'est la non précisée) ; à égalité la première dans l'ordre d'affichage. */
const collDomLang = lines => { let d = null; for (const e of lines) if (!d || e[1] > d[1]) d = e; return d ? d[0] : ''; };
/** Langue la plus fournie (éditions confondues) ; à égalité la première dans l'ordre d'affichage. */
const collMainLang = lines => { const by = new Map(); for (const [g, q] of lines.slice().sort((a, b) => lineCmp(a[0], b[0]))) { const l = lineLang(g); by.set(l, (by.get(l) || 0) + q); } let d = null; for (const e of by) if (!d || e[1] > d[1]) d = e; return d ? d[0] : ''; };
/** Lignes regroupées par langue (éditions confondues) : [[langue, exemplaires]], dans l'ordre d'affichage. */
const langLines = lines => { const m = new Map(); for (const [g, q] of lines.slice().sort((a, b) => lineCmp(a[0], b[0]))) { const l = lineLang(g); m.set(l, (m.get(l) || 0) + q); } return [...m]; };
/** Exemplaires foil d'une langue l parmi des lignes (entrée, doublons de tradeLists) : « fo » d'une carte partagée, pochette foil du classeur. */
const langFoil = (lines, l) => (lines || []).reduce((a, [g, q]) => a + (lineFoil(g) && lineLang(g) === (l || '') ? q : 0), 0);
/** Lignes regroupées par langue et édition (finitions confondues) : [[langue, édition ('' : sans), exemplaires, dont foil]], dans l'ordre d'affichage (langues comme langLines, puis sans édition, puis éditions) :
 *  une pochette du classeur et une carte du partage par impression (les foil à part ensuite, bndFoil). */
const langEdLines = lines => { const m = new Map(); for (const [g, q] of (lines || []).slice().sort((a, b) => lineCmp(a[0], b[0]))) { const l = lineLang(g), e = lineEd(g), id = l + '|' + e, x = m.get(id) || m.set(id, [l, e, 0, 0]).get(id); x[2] += q; if (lineFoil(g)) x[3] += q; } return [...m.values()]; };
/** Entrée reconstruite depuis ses lignes (base : n, d… gardés) : q = total, x avec plusieurs lignes ou une édition, l = langue la plus fournie. null s'il ne reste rien. */
function collFromLines(base, lines) {
  const m = new Map();
  for (const [g, q] of lines) if (q > 0) m.set(g || '', Math.min(9999, (m.get(g || '') || 0) + q));
  if (!m.size) return null;
  const ls = [...m].sort((a, b) => lineCmp(a[0], b[0])), out = { ...base }; delete out.x; delete out.l;
  out.q = ls.reduce((a, e) => a + e[1], 0);
  const dom = collMainLang(ls); if (dom) out.l = dom;
  if (ls.length > 1 || lineEd(ls[0][0]) || lineFoil(ls[0][0]) || lineAw(ls[0][0])) out.x = Object.fromEntries(ls);
  return out;
}
/** Union de deux répartitions de la même carte sans état commun connu, langue par langue : le plus grand total ; une édition, le plus grand nombre des deux côtés,
 *  le reste de la langue sans édition (« 2 FR » d'un côté, « 2 FR CMM 400 » de l'autre : les mêmes cartes, l'édition en plus). Les exemplaires « non précisée »
 *  ne s'ajoutent pas à une langue connue de l'autre côté (c'est probablement la même carte). */
function unionLines(la, lb) {
  const by = new Map(); let ta = 0, tb = 0;
  const put = (ls, s) => { for (const [g, q] of ls) { const l = lineKey(lineLang(g), '', lineFoil(g)), e = lineKey('', lineEd(g), false, lineAw(g)); let o = by.get(l); if (!o) by.set(l, o = { t: [0, 0], ed: new Map() }); o.t[s] += q; if (e) o.ed.set(e, Math.max(o.ed.get(e) || 0, q)); } };      // un « groupe » = langue + foil ou non ; e : édition et détails (« |cmm|400#pabc »)
  for (const [, q] of la) ta += q;
  for (const [, q] of lb) tb += q;
  put(la, 0); put(lb, 1);
  const out = []; let spec = 0;
  for (const [l, o] of by) {
    const f = lineFoil(l), ll = lineLang(l);
    let es = 0; for (const [e, q] of o.ed) { out.push([lineKey(ll, lineEd(e), f, lineAw(e)), q]); es += q; }
    spec += es;
    if (l) { const plain = Math.max(0, Math.max(o.t[0], o.t[1]) - es); if (plain) out.push([l, plain]); spec += plain; }
  }
  const none = Math.max(0, Math.max(ta, tb) - spec);
  return none ? [...out, ['', none]] : out;
}
/** Empreinte des lignes d'une entrée (comparaison, fusion). */
const collSig = x => collLines(x).map(e => e[0] + ':' + e[1]).join(',');

/**
 * Lit une collection : export CSV (ManaBox, Moxfield, Archidekt, Deckbox, Dragon Shield, Delver Lens, TCGplayer… : exemples réels dans tests/fixtures/import, tests/test-import.mjs) ou texte « 3 Sol Ring ».
 * Retourne { items:[{k, n, q, l?, x?, d?}] (l : langue si le fichier la donne : colonne « Language », ou « *FR* » en fin de ligne ; x : lignes par langue et édition — colonnes « Set code » / « Collector number », ou « (CMM) 400 » ;
 * d : date d'ajout en secondes, seulement avec o.dates : repère « (Dxxxxxx) » écrit par collToText), lines, skipped, listed (lignes d'une liste ManaBox, laissées de côté), format:'csv'|'text', copies, fr, amb }.
 * Les quantités d'une même carte, langue et édition s'additionnent. Foil, état, prix d'achat, classeurs : pas gardés (la collection ne les connaît pas).
 * Import (o.fr, index français chargé) : un nom français devient la carte anglaise, exemplaire français sauf langue donnée par la ligne (fr : nombre de lignes lues ainsi ; amb : noms français de plusieurs cartes, laissés tels quels).
 * o.lang : langue des lignes qui n'en donnent pas (choix « Langue de ces cartes »). Sans o.fr ni o.lang (texte enregistré de la collection) : lecture inchangée, quel que soit l'index.
 */
function parseCollection(text, o) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/);
  let i0 = 0; while (i0 < lines.length && (!lines[i0].trim() || /^"?sep=.?"?$/i.test(lines[i0].trim()))) i0++;      // « sep=, » (Excel), entre guillemets chez Dragon Shield
  const first = lines[i0] || '';
  let delim = null, nameCol = -1, qtyCol = -1, foilCol = -1, flagCol = -1, langCol = -1, setCol = -1, setCode = false, numCol = -1, listCol = -1, condCol = -1, binCol = -1;
  for (const d of [',', ';', '\t']) {
    const cols = csvSplit(first, d).map(colNorm);
    if (cols.length < 2) continue;
    let ni = -1; for (const want of NAME_COLS) { ni = cols.indexOf(want); if (ni >= 0) break; }
    if (ni < 0) continue;
    delim = d; nameCol = ni; langCol = cols.findIndex(c => LANG_COLS.includes(c));
    for (const want of SET_COLS) { const i = cols.indexOf(want); if (i >= 0) { setCol = i; setCode = SET_CODE_COLS.includes(want); break; } }
    for (const want of NUM_COLS) { const i = cols.indexOf(want); if (i >= 0) { numCol = i; break; } }
    for (const want of QTY_COLS) { const qi = cols.findIndex(c => c === want); if (qi >= 0) { qtyCol = qi; break; } }
    if (qtyCol < 0) qtyCol = cols.findIndex(c => /(quantity|qty|count)/.test(c) && !/(trade|tradelist|wish|foil)/.test(c));      // « QuantityX » de Delver Lens (valeurs « 2x »)
    foilCol = cols.findIndex(c => FOIL_QTY_RE.test(c)); if (foilCol === qtyCol) foilCol = -1;
    for (const want of FOIL_FLAG_COLS) { const i = cols.indexOf(want); if (i >= 0 && i !== qtyCol && i !== foilCol) { flagCol = i; break; } }
    listCol = cols.indexOf('binder type'); condCol = cols.findIndex(c => COND_COLS.includes(c)); binCol = cols.indexOf('binder name');
    break;
  }
  const bins = new Map();      // classeurs ManaBox (« Binder Name ») : id d'emplacement (même nom → même id) → { t, n }
  const map = new Map(), fr = !!(o && o.fr && FRX.ix), dl = (o && cardLang(o.lang)) || '', amb = []; let n = 0, skipped = 0, nfr = 0, listed = 0;
  const add = (name, q, l, d, e, f, a) => {
    name = String(name || '').trim(); q = Math.max(1, Math.min(9999, Math.round(q) || 1));
    if (fr && name) {
      const f = frLookup(name, (l === '-' ? '' : l || dl) === FRX.l);
      if (f && f.en) { name = f.en; if (!l) l = FRX.l; nfr++; } else if (f && f.amb && amb.length < 50 && !amb.includes(name)) amb.push(name);
    }
    if (!l) l = dl; else if (l === '-') l = '';
    const k = ownKey(name); if (!name || !k) { skipped++; return; }
    const cur = map.get(k), lg = lineKey(l, e, f, a); if (cur) { cur.b.set(lg, Math.min(9999, (cur.b.get(lg) || 0) + q)); if (d && !(cur.d <= d)) cur.d = d; } else if (map.size < COLL_MAX) map.set(k, { k, n: name, b: new Map([[lg, q]]), ...(d ? { d } : {}) });      // une ligne par langue, édition et foil
  };
  if (delim) {
    for (let i = i0 + 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue; n++;
      const c = csvSplit(lines[i], delim), name = c[nameCol];
      if (!name) { skipped++; continue; }
      if (listCol >= 0 && LIST_TYPE_RE.test(c[listCol] || '')) { listed++; continue; }      // liste ManaBox (souhaits, achats) : cartes que l'on n'a pas
      let q = qtyCol >= 0 ? parseInt(c[qtyCol], 10) : 1;
      const fq = foilCol >= 0 ? parseInt(c[foilCol], 10) || 0 : 0;      // « Reg Qty » + « Foil Qty » (Decked Builder) : les foil sur leur propre ligne
      if (foilCol >= 0) { q = Number.isFinite(q) ? q : 0; if (!q && !fq) q = 1; }
      const lr = langCol >= 0 ? String(c[langCol] || '').trim() : '', l = lr ? cardLang(lr) || '-' : '';      // « Phyrexian » : langue donnée mais absente de l'appli → non précisée, pas la langue choisie pour les autres lignes
      const e = setCol >= 0 && numCol >= 0 ? edKey(csvSetCode(c[setCol], setCode), c[numCol]) : '', f = flagCol >= 0 && csvFoil(c[flagCol]), cd = condCol >= 0 ? csvCond(c[condCol]) : '', bn = binCol >= 0 ? placeName(c[binCol]) : '', pid = bn ? 'i' + hash32(bn.toLowerCase()).toString(36) : '';
      if (pid && !bins.has(pid)) bins.set(pid, { t: listCol >= 0 && /^\s*deck\s*$/i.test(c[listCol] || '') ? 'deck' : 'binder', n: bn });
      const a = cd && cd !== 'nm' ? { c: cd, ...(pid ? { p: pid } : {}) } : pid ? { p: pid } : null;      // « Near Mint » : la valeur par défaut des exports, pas un détail
      if (q || foilCol < 0) add(name, q || 1, l, 0, e, f, a);
      if (fq) add(name, fq, l, 0, e, true, a);
    }
  } else {
    let sec = 'main';      // decklist collée (Moxfield, Archidekt, MTGA) : Maybeboard, Considering, Tokens et About ne sont pas des cartes possédées ; réserve, commandant, compagnon : gardés
    for (let raw of lines) {
      const h = headerSec(raw.trim());
      if (h) { sec = h; continue; }
      if (!raw.trim() && sec === 'about') sec = 'main';
      if (sec === 'skip' || sec === 'about') continue;
      let d = 0;
      let e = '', a = '';
      if (o && o.dates) raw = raw.replace(DATE_MARK_RE, (_, t) => { d = parseInt(t, 36) || 0; return ''; });
      raw = raw.replace(ED_MARK_RE, (m, x, y) => { e = edKey(x, y); return e ? '' : m; });
      raw = raw.replace(ATTR_MARK_RE, (_, w) => { a = attrWord(attrOf(w)); return ''; });
      const p = parseLine(raw, { fr: false }); if (!p) continue; n++;      // noms français lus par add(), comme ceux d'un CSV
      if (p.ignored) { skipped++; continue; }
      add(p.name, p.qty, p.lang, d, e, !!p.foil, a);
    }
  }
  let items = [...map.values()].map(({ b, ...base }) => collFromLines(base, [...b]));
  if (bins.size === 1) items = items.map(x => collFromLines(x, collLines(x).map(([g, q]) => [lineSet(g, { p: '' }), q])));      // un seul classeur : rien de rangé (tout au même endroit)
  const places = bins.size > 1 ? Object.fromEntries(bins) : {};
  return { items, lines: n, skipped, listed, format: delim ? 'csv' : 'text', copies: items.reduce((a, x) => a + x.q, 0), fr: nfr, amb, places };
}

/** Export CSV au format Moxfield (« Count,Tradelist Count,Name,Edition,Condition,Language,Foil,Collector Number ») : relu par Moxfield, ManaBox, Archidekt, Deckbox… et par cette appli.
 *  Une ligne par langue et édition ; langue ou édition non précisée : colonnes vides. « Tradelist Count » : exemplaires de cette ligne à échanger (trade : tradeLists(…).have), 0 sinon. */
/** État Cardmarket → colonne « Condition » de Moxfield. */
const COND_OUT = { mt: 'Mint', nm: 'Near Mint', ex: 'Lightly Played', gd: 'Moderately Played', lp: 'Moderately Played', pl: 'Heavily Played', po: 'Damaged' };
const CSV_LANG = { fr: 'French', en: 'English', de: 'German', es: 'Spanish', it: 'Italian', pt: 'Portuguese', jp: 'Japanese', 'zh-CN': 'Chinese Simplified', kr: 'Korean', 'zh-TW': 'Chinese Traditional', ru: 'Russian' };
/** Cellule texte : un nom venu d'une liste importée ou partagée qui commence par = + - @ (ou tabulation, retour) serait lu comme une formule par Excel ou LibreOffice → préfixé d'une apostrophe.
 *  Sauf « +2 Mace » et ses pareils (signe, chiffres, espace, puis des mots) : vrais noms de cartes, aucune formule possible. */
const csvCell = v => {
  let s = String(v);
  if (typeof v === 'string' && (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-]\d+ [\p{L}' ,-]+$/u.test(s)))) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
// trade absent : dans l'appli, la liste d'échange de l'onglet « Échange » (trSpare, share.js, chargé après ce fichier) ; sous Node, aucune.
function collToCsv(map, trade = typeof trSpare === 'function' ? trSpare(map) : null) {
  const rows = ['Count,Tradelist Count,Name,Edition,Condition,Language,Foil,Collector Number'], tl = new Map();
  for (const x of trade || []) if (x && x.k) tl.set(x.k, new Map(x.lines || []));
  for (const [k, x] of Object.entries(map || {}).filter(([, x]) => x && x.n).sort(([, a], [, b]) => EN_CMP(a.n, b.n)))
    for (const [g, q] of collLines(x)) { const e = lineEd(g); rows.push([q, Math.min(q, (tl.get(k) && tl.get(k).get(g)) || 0), csvCell(x.n), edSet(e), COND_OUT[lineAttrs(g).c] || 'Near Mint', CSV_LANG[lineLang(g)] || '', lineFoil(g) ? 'foil' : '', csvCell(edNum(e))].join(',')); }
  return rows.join('\n') + '\n';
}

/** Fusionne des cartes dans une collection (objet clé → { n, q, … }). mode : 'add' (somme) · 'replace' (remplace le reste, garde les infos Scryfall déjà lues). Retourne la nouvelle collection. */
function mergeColl(base, add, mode, now) {
  const out = mode === 'replace' ? {} : { ...base }, t = now || dateNowSec();
  for (const it of add) {
    const prev = base[it.k], cur = out[it.k], lines = collLines(cur).map(e => e.slice()), dom = collMainLang(lines);
    for (const [g, q] of collLines(it)) {
      const to = lineHead(g) ? g : lineKey(dom, '', false, lineAw(g));      // sans langue ni édition, les exemplaires rejoignent la langue déjà connue de la carte (sans édition) ; une langue ou une édition lue (scan, CSV) a sa propre ligne
      const e = lines.find(x => x[0] === to); if (e) e[1] = Math.min(9999, e[1] + q); else lines.push([to, q]);
    }
    out[it.k] = collFromLines({ ...(prev || {}), n: (prev && prev.n) || it.n, ...(!prev && (it.d || t) ? { d: it.d || t } : {}) }, lines);       // date d'ajout : posée à la première entrée de la carte, jamais modifiée ensuite (une carte retirée puis ré-ajoutée en reçoit une nouvelle)
  }
  return out;
}
/** Texte compact d'une collection (une ligne par carte, langue et édition : « 3 Sol Ring (CMM) 400 *FR* ») pour le cloud, et son inverse. dates : ajoute la date d'ajout « (Dxxxxxx) » (stockage et compte ; pas l'export). */
/** Texte de la collection : « 2 Sol Ring (FOIL) (CMM) 400 (Dh7zqkx) *FR* ». « (FOIL) » avant l'édition : l'ancienne version le lit comme un code d'extension et l'ignore (carte, édition et langue restent justes). */
const collToText = (coll, dates) => Object.values(coll).filter(x => x && x.q > 0 && x.n).sort((a, b) => EN_CMP(a.n, b.n)).flatMap(x => {
  let ls = collLines(x);
  if (!dates && ls.some(e => lineAw(e[0]))) { const m = new Map(); for (const [g, q] of ls) m.set(lineHead(g), (m.get(lineHead(g)) || 0) + q); ls = [...m]; }      // export : sans emplacement ni détails, les lignes de même édition regroupées
  return ls.map(([g, q]) => { const l = lineLang(g), e = lineEd(g), w = dates ? lineAw(g) : ''; return q + ' ' + x.n + (w ? ' (DETAILS) ' + w : '') + (lineFoil(g) ? ' (FOIL)' : '') + (e ? ' (' + edSet(e).toUpperCase() + ') ' + edNum(e) : '') + (dates && x.d > 0 ? ' (D' + Math.floor(x.d).toString(36) + ')' : '') + (l ? ' *' + langCode(l) + '*' : ''); });
}).join('\n');
const collFromText = text => { const o = {}; for (const it of parseCollection(text, { dates: true }).items) o[it.k] = { n: it.n, q: it.q, ...(it.l ? { l: it.l } : {}), ...(it.x ? { x: it.x } : {}), ...(it.d ? { d: it.d } : {}) }; return o; };

/* ── Emplacements et proxys : enregistrés avec la collection, dans le même texte (même compte, même fusion), en lignes que l'ancienne version ignore (commentaires « // »).
   « //@P 2 Sol Ring (CMM) 400 *FR* » : un proxy (même format qu'une carte) ; « //@L k3x9a box Boîte doublons » : un emplacement (id, type, nom).
   Les proxys ne comptent jamais dans la valeur, l'échange, les statistiques ni le widget : ils restent dans leur propre liste. */
const PLACE_TYPES = ['binder', 'box', 'deck', 'sale', 'other'];
/** Nom d'emplacement : une ligne, sans séparateur de CSV ni guillemet (le texte de la collection reste lisible comme avant), 40 caractères au plus. */
const placeName = n => String(n == null ? '' : n).replace(/[\p{Cc}\p{Cf},;"]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
const PLACE_TRADES = ['skip', 'all'];      // règle d'échange d'un emplacement (share.js › « Mes rangements ») : skip = jamais proposé (compte dans la réserve), all = tout part, même le dernier ; absent = classique
/** Emplacement lu ou créé : { t (type), n (nom), x? (règle d'échange, jamais sur un deck monté), r? (deck monté : id du deck) } ; null si illisible. */
function placeNorm(x) {
  if (!x) return null;
  const n = placeName(x.n), t = PLACE_TYPES.includes(x.t) ? x.t : 'other', r = /^[A-Za-z0-9_-]{1,40}$/.test(x.r || '') ? x.r : '', tr = t !== 'deck' && PLACE_TRADES.includes(x.x) ? x.x : '';
  return n ? { t, n, ...(tr ? { x: tr } : {}), ...(r ? { r } : {}) } : null;
}
/** Règle d'échange d'un emplacement ('' : classique, aussi pour un deck monté ou un emplacement inconnu). */
const placeTrade = (places, id) => { const x = id && places && places[id]; return x && x.t !== 'deck' && PLACE_TRADES.includes(x.x) ? x.x : ''; };
/** Nouvel identifiant d'emplacement : date en base 36 et deux caractères au hasard (deux appareils ne se croisent pas). */
const placeNewId = () => (Math.floor(Date.now() / 1000).toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')).slice(-12);
const placesText = places => Object.keys(places || {}).sort().map(id => { const x = places[id]; return x ? '//@L ' + id + ' ' + x.t + (x.x ? '!' + x.x : '') + (x.r ? ':' + x.r : '') + ' ' + x.n : ''; }).filter(Boolean).join('\n');      // « //@L k3x9a box!skip Boîte à garder »
/** Collection complète : { map (cartes), prox (proxys, même forme), places (id → emplacement) }. */
const collDoc = (map, prox, places) => ({ map: map || {}, prox: prox || {}, places: places || {} });
const collDocText = d => [collToText(d.map, true), collToText(d.prox, true).split('\n').filter(Boolean).map(x => '//@P ' + x).join('\n'), placesText(d.places)].filter(Boolean).join('\n');
function collDocFromText(text) {
  const main = [], px = [], places = {};
  for (const ln of String(text || '').split('\n')) {
    if (ln.startsWith('//@P ')) px.push(ln.slice(5));
    else if (ln.startsWith('//@L ')) { const m = /^\/\/@L ([a-z0-9]{2,12}) ([a-z]+)(?:!([a-z]+))?(?::(\S+))? (.+)$/.exec(ln.trimEnd()); const x = m && placeNorm({ t: m[2], x: m[3], r: m[4], n: m[5] }); if (x) places[m[1]] = x; }
    else main.push(ln);
  }
  return collDoc(collFromText(main.join('\n')), px.length ? collFromText(px.join('\n')) : {}, places);
}
const samePlaces = (a, b) => placesText(a) === placesText(b);
const sameDoc = (a, b) => sameColl(a && a.map, b && b.map) && sameColl(a && a.prox, b && b.prox) && samePlaces(a && a.places, b && b.places);
/** Emplacements fusionnés comme les cartes (base · appareil · compte) : changé d'un seul côté → ce côté ; des deux → cet appareil ; une modification l'emporte sur un retrait. */
function placesMerge3(base, local, remote) {
  const out = {}, b0 = base || {}, l0 = local || {}, r0 = remote || {}, same = (x, y) => JSON.stringify(x || null) === JSON.stringify(y || null);
  for (const id of new Set([...Object.keys(l0), ...Object.keys(r0)])) {
    const b = b0[id], l = l0[id], r = r0[id], v = same(l, b) ? r : same(r, b) ? l : l || r;
    if (v) out[id] = { ...v };
  }
  return out;
}
/** Fusion à trois de la collection complète (base null : inconnue → union). */
const mergeDoc3 = (b, l, r) => collDoc(merge3(b && b.map, l.map, r.map), merge3(b && b.prox, l.prox, r.prox), placesMerge3(b && b.places, l.places, r.places));

/** Même carte au même état (quantité, langue) ? Deux absences sont identiques. */
const sameEntry = (a, b) => (!a && !b) || (!!a && !!b && collSig(a) === collSig(b));
/**
 * Fusion à trois : base (dernier état connu du compte), local (cet appareil), remote (compte maintenant). Carte par carte, sans horloge :
 * · rien de changé ici depuis la base → on prend le compte (ajouts, retraits et quantités de l'autre appareil) ;
 * · changé seulement ici → on garde ici ;
 * · changé pareil des deux côtés → cette valeur (rejouer une fusion ne double rien) ;
 * · changé différemment : une modification l'emporte sur un retrait ; deux modifications de quantité s'additionnent (compte + ce qui a bougé ici), langue d'ici si elle a changé ; sans base, la plus grande quantité.
 * Retourne une nouvelle collection (clé → { n, q, l? }).
 */
function merge3(base, local, remote) {
  const out = {}, b0 = base || {}, l0 = local || {}, r0 = remote || {};
  for (const k of new Set([...Object.keys(l0), ...Object.keys(r0)])) {
    const b = b0[k], l = l0[k], r = r0[k];
    let v;
    if (sameEntry(l, b)) v = r;
    else if (sameEntry(r, b)) v = l;
    else if (sameEntry(l, r)) v = l;
    else if (!l) v = r;
    else if (!r) v = l;
    else {      // changé des deux côtés : ligne par ligne (une langue = une ligne) ; deux changements de quantité d'une même ligne s'additionnent
      const B = new Map(collLines(b)), L = new Map(collLines(l)), R = new Map(collLines(r)); let lines = [];
      if (!b) lines = unionLines(collLines(l), collLines(r));      // première connexion : pas d'état commun
      else for (const g of new Set([...B.keys(), ...L.keys(), ...R.keys()])) {      // une ligne = une langue et une édition : une édition choisie ailleurs déplace ses exemplaires d'une ligne à l'autre
        const bq = B.get(g) || 0, lq = L.get(g) || 0, rq = R.get(g) || 0;
        lines.push([g, lq === rq ? lq : Math.max(0, rq + (lq - bq))]);
      }
      v = collFromLines({ ...r, ...l, n: l.n || r.n }, lines) || undefined;
    }
    if (v && v.q > 0) {
      out[k] = { ...v };
      const ds = [l, r, b].map(x => x && x.d).filter(d => d > 0);      // la date d'ajout survit à un appareil qui ne la connaît pas (ancienne version) : la plus ancienne connue
      if (ds.length) out[k].d = Math.min(...ds);
    }
  }
  return out;
}
/** Union de deux collections (première connexion : appareil + compte) : pour chaque carte, la plus grande quantité. */
function unionColl(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    const cur = out[k]; if (!cur) { out[k] = { ...v }; continue; }
    out[k] = collFromLines({ ...v, ...cur }, unionLines(collLines(cur), collLines(v)));      // langue par langue : la plus grande quantité
  }
  return out;
}
/** Deux collections contiennent-elles la même chose (clés, quantités, langues) ? */
function sameColl(a, b) {
  const ka = Object.keys(a || {}), kb = Object.keys(b || {});
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!b[k] || collSig(b[k]) !== collSig(a[k])) return false;
  return true;
}

/** Pose sur chaque carte de la liste : own (déjà possédées, au plus la quantité demandée) et need (à acheter). owned : clé de carte → exemplaires, ou null. */
function applyOwned(cards, owned, ownedLine) {
  for (const c of cards) {
    const o = owned ? Math.max(0, Math.floor(Number(owned(ownKey(c.key), c)) || 0)) : 0;      // c : la carte de la liste (éditions exactes : ses éditions seules comptent)
    c.own = Math.min(o, c.qty); c.need = c.qty - c.own;
    if (c.ln) lnOwn(c, owned && ownedLine ? ownedLine(ownKey(c.key), c) : null);      // ownedLine(k, c) : null, ou l → exemplaires qui conviennent à la ligne l (foil, langue ; éditions exactes)
  }
  return cards;
}
/** Possédées réparties entre les lignes de la carte (c.ln : l.own, l.need ; c.own, c.need en suivent). Compte par ligne (of) : au plus ce qu'elle a de cette finition
 *  et de cette langue ; sinon les lignes sans critère d'abord (un exemplaire de finition ou de langue inconnue les sert sûrement), puis dans l'ordre de la liste. */
function lnOwn(c, of) {
  let left = c.own;
  for (const l of of ? c.ln : [...c.ln.filter(l => !l.f && !l.l), ...c.ln.filter(l => l.f || l.l)]) { l.own = Math.min(l.q, left, of ? Math.max(0, Math.floor(Number(of(l)) || 0)) : l.q); left -= l.own; }
  for (const l of c.ln) l.need = l.q - l.own;
  c.own = c.ln.reduce((a, l) => a + l.own, 0); c.need = c.qty - c.own;
}

/* ── Filtres : recherche texte, couleurs, famille, coût (viewer du deck et collection) ───────── */
const BASIC_COLOR = { plains: 'W', island: 'U', swamp: 'B', mountain: 'R', forest: 'G' };
const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'];
/** Couleurs d'une carte du viewer (« WU »), '' si incolore ; les terrains de base ont la couleur de leur mana. */
const itemColors = i => (i.s === 'basic' ? BASIC_COLOR[String(i.k).replace(/^snow covered /, '')] || '' : i.cl || '');
const itemType = i => (i.s === 'basic' ? 'Terrains' : typeBucket(i.tl));
const hasMeta = i => i.s === 'basic' || i.tl != null || i.cm != null;
/* Filtres avancés de la collection (search.js) : ils ne valent que pour les cartes préparées par srchPrep (i.sl : une entrée par ligne
   { l: langue, f: 1 foil, u: prix d'un exemplaire en centimes ou null, r: rareté, p: emplacement ('' non rangé), s: extension ('' sans édition) } ;
   i.sk : 1 dans un deck ; i.st : 1 à l'échange ; i.q, i.d : exemplaires, date d'ajout en secondes ; i.lg : formats où elle est légale, LG_FMT). Ailleurs (deck, échange, masterset) : ignorés. */
const FLT_ADV = ['lang', 'foil', 'rar', 'px', 'place', 'dup', 'dk', 'tr', 'add', 'fmt'];
/** Formats du filtre « Format » : [lettre gardée dans COLL.meta[k].lg, clé Scryfall (legalities), nom]. Restreinte (Vintage) : jouable, donc légale. */
const LG_FMT = [['s', 'standard', 'Standard'], ['p', 'pioneer', 'Pioneer'], ['m', 'modern', 'Modern'], ['l', 'legacy', 'Legacy'], ['v', 'vintage', 'Vintage'], ['c', 'commander', 'Commander'], ['a', 'pauper', 'Pauper']];
/** Formats où une carte est jouable (legalities de Scryfall) : « smlvc ». */
const lgOf = L => (L && typeof L === 'object' ? LG_FMT.filter(([, k]) => L[k] === 'legal' || L[k] === 'restricted').map(x => x[0]).join('') : '');
/** Tranches de prix à l'unité (centimes ; borne basse comprise, haute non comprise). */
const FLT_PX = { lt1: [0, 100], '1-5': [100, 500], '5-20': [500, 2000], gt20: [2000, Infinity] };
const fltOn = v => (v instanceof Set ? v.size > 0 : !!v);
/** Nombre de filtres avancés actifs (une langue ou plusieurs : 1). */
const fltAdvCount = f => (f ? FLT_ADV.reduce((a, k) => a + (fltOn(f[k]) ? 1 : 0), 0) : 0);
/** Un filtre de ligne (langue, finition, rareté, prix) est-il actif ? L'emplacement et l'extension se jugent alors sur la même ligne. */
const fltLineOn = f => !!f && (fltOn(f.lang) || !!f.foil || fltOn(f.rar) || !!f.px);
/** Rareté telle que filtrée (« special », « bonus » : avec les mythiques, comme le masterset). */
const rarNorm = r => (r === 'special' || r === 'bonus' ? 'mythic' : r || '');
/** La ligne x (entrée de i.sl) passe-t-elle les filtres de ligne de f ? Emplacement ('-' : non rangées) et extension ('-' : sans édition) compris. */
function fltLineOk(x, f) {
  if (fltOn(f.lang) && !f.lang.has(x.l || '')) return false;
  if (f.foil && (f.foil === 'f') !== !!x.f) return false;
  if (fltOn(f.rar) && !f.rar.has(rarNorm(x.r))) return false;
  if (f.px) { const b = FLT_PX[f.px]; if (b && !(x.u != null && x.u >= b[0] && x.u < b[1])) return false; }      // prix inconnu : écartée
  if (f.place && (f.place === '-' ? !!x.p : x.p !== f.place)) return false;
  if (f.set && (f.set === '-' ? !!x.s : x.s !== f.set)) return false;
  return true;
}
/** Filtres avancés d'une carte préparée : doublons (2 exemplaires ou plus), decks, échange, ajout, puis au moins une ligne qui passe tous les filtres de ligne à la fois. now : secondes. */
function fltAdvOk(i, f, now) {
  if (f.dup && !(i.q >= 2)) return false;
  if (f.dk && (f.dk === 'in') !== !!i.sk) return false;
  if (f.tr && !i.st) return false;
  if (f.add) { const days = Number(f.add) || 0; if (!(i.d > 0 && i.d >= now - days * 86400)) return false; }
  if (f.fmt && !String(i.lg || '').includes(f.fmt)) return false;      // légalité inconnue (pas encore lue) : écartée
  if (fltLineOn(f) || f.place) return i.sl.some(x => fltLineOk(x, f));
  return true;
}
/** f : { q:texte, colors:Set('W','U',… ,'C'), type:'Créatures'…, cmc:0..7 (7 = 7 et plus), set: code d'extension ou '-' (sans édition) } — champ absent ou vide = pas de filtre.
 *  Filtres avancés (FLT_ADV) : cartes préparées seulement (i.sl, voir plus haut) ; f.now : heure en secondes (tests). */
function filterItems(items, f) {
  if (!f) return items;
  const q = normPart(f.q || ''), colors = f.colors && f.colors.size ? f.colors : null, type = f.type || '', cmc = f.cmc === '' || f.cmc == null ? null : Number(f.cmc), cmdr = f.cmdr === 'can' || f.cmdr === 'played' ? f.cmdr : '';
  const set = f.set === '-' ? '' : f.set || null;      // '' : lignes sans édition ; null : toutes
  const adv = fltAdvCount(f) > 0, now = Number(f.now) || Math.floor(Date.now() / 1000);
  if (!q && !colors && !type && cmc == null && !cmdr && set == null && !adv) return items;
  return items.filter(i => {
    if (set != null && i.eds && !i.eds.includes(set)) return false;      // eds : extensions des lignes de la carte (collection, échange), '' pour une ligne sans édition ; sans eds (deck) : pas de filtre
    if (q && !normPart(i.n).includes(q) && !(i.dn && normPart(i.dn).includes(q)) && !(i.fn && normPart(i.fn).includes(q))) return false;      // nom anglais, nom affiché (FR) ou nom français de la carte même si l'exemplaire est anglais
    if (cmdr && (i.cx || 0) < (cmdr === 'played' ? 2 : 1)) return false;      // cx : 0 pas commandant · 1 peut l'être · 2 joué comme commandant (EDHREC)
    if (colors || type || cmc != null) {
      if (!hasMeta(i)) return false;
      if (colors) { const c = itemColors(i); if (c ? ![...c].some(x => colors.has(x)) : !colors.has('C')) return false; }
      if (type && itemType(i) !== type) return false;
      if (cmc != null && Math.min(i.cm ?? 0, 7) !== cmc) return false;
    }
    if (adv && i.sl && !fltAdvOk(i, f, now)) return false;
    return true;
  });
}
const filterActive = f => !!f && !!((f.q || '').trim() || (f.colors && f.colors.size) || f.type || (f.cmc !== '' && f.cmc != null) || f.cmdr || f.set || fltAdvCount(f));

/* ── Valeur de la collection dans le temps : relevés quotidiens, variations de prix carte par carte ─────────────── */
const VAL_MAX = 400;
const dayOf = t => Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / 86400000);     // jour calendaire local
/** Ajoute un relevé { t, v (centimes), n (cartes), q (exemplaires) } : un seul par jour (le dernier remplace), trié, VAL_MAX au plus (les plus anciens partent). */
function histPush(hist, snap, max = VAL_MAX) {
  const out = (Array.isArray(hist) ? hist : []).filter(h => h && Number.isFinite(h.t) && Number.isFinite(h.v) && dayOf(h.t) !== dayOf(snap.t));
  out.push({ t: snap.t, v: Math.round(snap.v), n: snap.n | 0, q: snap.q | 0 });
  out.sort((a, b) => a.t - b.t);
  return out.length > max ? out.slice(out.length - max) : out;
}
/** Variation sur ~days jours : le relevé le plus proche de « maintenant − days » (écart toléré 60 % de la durée), jamais le dernier lui-même. { from, to, d, pct } ou null. */
function histDelta(hist, days) {
  if (!hist || hist.length < 2) return null;
  const to = hist[hist.length - 1], target = to.t - days * 86400000;
  let best = null;
  for (const h of hist) { if (h === to || h.t > to.t - days * 86400000 * 0.5) continue; if (!best || Math.abs(h.t - target) < Math.abs(best.t - target)) best = h; }
  if (!best || Math.abs(best.t - target) > days * 86400000 * 0.6) return null;
  return { from: best, to, d: to.v - best.v, pct: best.v > 0 ? (to.v - best.v) / best.v * 100 : null };
}
/** Prix de référence de départ pour les variations : base = { cur: { t, p: {clé: centimes} }, prev } ; la période courante dure 7 jours puis devient « précédente ». Retourne la nouvelle base. */
function baseRoll(base, prices, now, period = 7 * 86400000) {
  const snap = { t: now, p: prices };
  if (!base || !base.cur) return { cur: snap, prev: null };
  if (now - base.cur.t >= period) return { cur: snap, prev: base.cur };
  return base;
}
/** Référence à comparer aux prix actuels : la période précédente si elle existe, sinon la courante. */
const baseRef = base => (base && (base.prev || base.cur)) || null;
/** Cartes dont le prix a bougé depuis ref ({ t, p }) : items = [{ k, n, q, eu }]. thr : seuil en % ; un écart de moins de 20 centimes par exemplaire est ignoré.
 *  → { total (centimes, valeur de la collection actuelle : prix d'aujourd'hui − prix de la référence), list: [{ k, n, q, u0, u1, d (par exemplaire), lot, pct }] triée par |variation du lot|, all: tous les mouvements }. */
function pxMovers(items, ref, thr = 25) {
  const out = { total: 0, list: [], all: 0 };
  if (!ref || !ref.p) return out;
  for (const i of items) {
    const u0 = ref.p[i.k], u1 = i.eu;
    if (!(u0 > 0) || !(u1 > 0)) continue;
    const d = u1 - u0; out.total += d * i.q;
    if (!d) continue; out.all++;
    const pct = d / u0 * 100;
    if (Math.abs(pct) >= thr && Math.abs(d) >= 20) out.list.push({ k: i.k, n: i.n, q: i.q, u0, u1, d, lot: d * i.q, pct });
  }
  out.list.sort((a, b) => Math.abs(b.lot) - Math.abs(a.lot) || a.n.localeCompare(b.n));
  return out;
}

/* ── Achats (« J'ai acheté »), cartes engagées dans des decks, fusion des données annexes du compte ──────────────── */
const BUY_MAX = 800;
/** Panier en attente de validation : { at, items:[{k, n, q, l?}] } (k : clé de collection). added : cartes qui viennent d'être mises au panier CardTrader ({ n, q, l? }) ; replace : le panier avait été vidé avant, on repart de zéro. null si rien. */
function buyMerge(cart, added, replace, now) {
  const by = new Map();
  if (cart && !replace) for (const it of cart.items || []) if (it && it.k && it.q > 0) by.set(it.k, { ...it });
  for (const a of added || []) {
    const name = String((a && a.n) || '').trim(), k = ownKey(name), q = Math.floor(Number(a && a.q));
    if (!name || !k || !(q > 0)) continue;
    const cur = by.get(k), l = a.l ? cardLang(a.l) : '';
    by.set(k, { k, n: (cur && cur.n) || name, q: Math.min(999, (cur ? cur.q : 0) + q), ...(l ? { l } : cur && cur.l ? { l: cur.l } : {}) });
  }
  const items = [...by.values()].sort((x, y) => EN_CMP(x.n, y.n)).slice(0, BUY_MAX);
  return items.length ? { at: Number.isFinite(now) ? now : Date.now(), items } : null;
}
/** Lecture tolérante du panier en attente (stockage local) ; null si illisible, vide ou vieux de plus de 30 jours. */
function buyClean(raw, now) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items) || !Number.isFinite(raw.at)) return null;
  if ((Number.isFinite(now) ? now : Date.now()) - raw.at > 30 * 86400000) return null;
  const items = raw.items.filter(i => i && typeof i.n === 'string' && i.n && ownKey(i.n) && i.q > 0).slice(0, BUY_MAX)
    .map(i => ({ k: ownKey(i.n), n: i.n.slice(0, 150), q: Math.min(999, Math.floor(i.q)), ...(cardLang(i.l) ? { l: cardLang(i.l) } : {}) }));
  return items.length ? { at: raw.at, items } : null;
}

const ENG_DECKS_MAX = 80, ENG_CARDS_MAX = 400, ENG_KEEP = 60 * 86400000;
/** Cartes engagées : { [idDeck]: { n: nom du deck, at: ms, q: { cléCarte: exemplaires } } }. q vide = deck démonté (la trace est gardée 60 jours pour que les autres appareils l'apprennent). */
function engClean(raw, now) {
  const out = {}; if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  now = Number.isFinite(now) ? now : Date.now();
  for (const [id, e] of Object.entries(raw)) {
    if (Object.keys(out).length >= ENG_DECKS_MAX) break;
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || !e || typeof e !== 'object') continue;
    const at = Number.isFinite(e.at) ? e.at : 0, q = {}; let n = 0;
    for (const [k, v] of Object.entries(e.q && typeof e.q === 'object' && !Array.isArray(e.q) ? e.q : {})) { const c = Math.floor(Number(v)); if (k && k.length <= 120 && c > 0 && n < ENG_CARDS_MAX) { q[k] = Math.min(999, c); n++; } }
    if (!n && now - at > ENG_KEEP) continue;
    out[id] = { n: String(e.n || '').slice(0, 120), at, q };
  }
  return out;
}
/** Exemplaires de la carte k engagés dans les decks, sauf deck exceptId (le deck qu'on est en train de chercher peut utiliser ses propres cartes). */
function engTotal(eng, k, exceptId) {
  let t = 0; if (!eng) return 0;
  for (const id in eng) if (id !== exceptId) t += (eng[id].q && eng[id].q[k]) || 0;
  return t;
}
/** Exemplaires encore libres : possédés − engagés ailleurs. */
const engFree = (owned, eng, k, exceptId) => Math.max(0, (Number(owned) || 0) - engTotal(eng, k, exceptId));
/** Decks qui engagent la carte k : [{ id, n, q }]. */
function engDecksOf(eng, k) { const out = []; for (const id in eng || {}) { const q = (eng[id].q && eng[id].q[k]) || 0; if (q > 0) out.push({ id, n: eng[id].n, q }); } return out; }
/** Deck monté : pour chaque carte du texte (hors terrains de base), les exemplaires possédés, au plus la quantité du deck. ownedOf : clé → exemplaires possédés. */
function engSnapshot(text, ownedOf) {
  const want = new Map();      // clé → exemplaires voulus : deck + réserve (« SB: »), la réserve est dans la boîte du deck aussi
  for (const c of parseDeck(text).cards) { const k = ownKey(c.key); if (k && !BASIC_NAMES.has(k)) want.set(k, (want.get(k) || 0) + c.qty); }
  for (const c of dkSideCards(text)) if (c.key && !BASIC_NAMES.has(c.key)) want.set(c.key, (want.get(c.key) || 0) + c.qty);
  const q = {};
  for (const [k, w] of want) {
    const n = Math.min(w, Math.max(0, Math.floor(Number(ownedOf(k)) || 0)));
    if (n > 0) q[k] = Math.min(999, n);
  }
  return q;
}
/** Fusion de deux états engagés, deck par deck : la trace la plus récente gagne. */
function engMerge(a, b, now) {
  const out = { ...engClean(a, now) }, rb = engClean(b, now);
  for (const id in rb) if (!out[id] || rb[id].at > out[id].at) out[id] = rb[id];
  return engClean(out, now);
}
const engCanon = e => JSON.stringify(Object.keys(e).sort().map(id => [id, e[id].n, e[id].at, Object.keys(e[id].q).sort().map(k => [k, e[id].q[k]])]));
const engSame = (a, b) => engCanon(engClean(a, 0)) === engCanon(engClean(b, 0));
const engActive = eng => Object.entries(eng || {}).filter(([, e]) => e && e.q && Object.keys(e.q).length);

/** Fusion de deux historiques de valeur : un relevé par jour (le plus tardif de la journée l'emporte), les plus anciens partent au-delà de VAL_MAX. */
function histMerge(a, b, max = VAL_MAX) {
  const by = new Map();
  for (const h of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    if (!h || !Number.isFinite(h.t) || !Number.isFinite(h.v)) continue;
    const d = dayOf(h.t), cur = by.get(d); if (!cur || h.t > cur.t) by.set(d, { t: h.t, v: Math.round(h.v), n: h.n | 0, q: h.q | 0 });
  }
  const out = [...by.values()].sort((x, y) => x.t - y.t);
  return out.length > max ? out.slice(out.length - max) : out;
}
const histSame = (a, b) => { const x = histMerge(a, []), y = histMerge(b, []); return x.length === y.length && x.every((h, i) => h.t === y[i].t && h.v === y[i].v); };

/* ── Commander : éligibilité d'une carte, données EDHREC (edh.tsv), decks à compléter ─────────────────────────── */
/** Carte Scryfall → 1 si elle peut être commandant, sinon 0 : légendaire créature (face avant ; les deux faces d'une double face modale), Véhicule ou Vaisseau légendaire avec force/endurance, texte « can be your commander » ; légale en Commander. */
function canBeCommander(c) {
  if (!c) return 0;
  const lg = c.legalities && c.legalities.commander; if (lg && lg !== 'legal') return 0;
  const faces = Array.isArray(c.card_faces) && c.card_faces.length ? c.card_faces : [c];
  const txt = faces.map(f => f.oracle_text || '').join('\n') || String(c.oracle_text || '');
  if (/can be your commander/i.test(txt)) return 1;
  for (const f of c.layout === 'modal_dfc' ? faces : faces.slice(0, 1)) {
    const tl = String(f.type_line || (faces.length === 1 ? c.type_line : '') || '');
    if (!/\blegendary\b/i.test(tl)) continue;
    if (/\bcreature\b/i.test(tl)) return 1;
    if (/\b(vehicle|spacecraft)\b/i.test(tl) && (f.power != null || c.power != null)) return 1;
  }
  return 0;
}
/** Sans l'info précise (cartes lues avant l'ajout du champ) : d'après la ligne de type. */
const isCmdrType = tl => /\blegendary\b/i.test(String(tl || '')) && /\bcreature\b/i.test(String(tl || ''));
/** Classe « commander » d'une carte de la collection : { cx, ed } — cx 0 pas commandant · 1 peut l'être · 2 joué comme commandant dans des decks EDHREC (ed : nombre de decks). edh : résultat de parseEdh, ou null. */
function cmdrClass(i, edh) {
  const e = edh && edh.by && edh.by.get(i.k);
  if (e) return { cx: 2, ed: e.decks };
  return { cx: (i.cd != null ? i.cd : isCmdrType(i.tl)) ? 1 : 0, ed: 0 };
}
/** Lit le texte d'un edh.tsv en modèle { v, at, cmds:[{ slug, decks, ci, names, img }], decks:[{ slug, src, label, url, cards:[[nom, qté]] }], price:[[nom, centimes]], gc:[nom] } (voir edhPack). */
function edhModelFromTsv(text) {
  const m = { v: 0, at: '', cmds: [], decks: [], price: [], gc: [] }, bySlug = new Map();
  let cur = null;
  for (const line of String(text || '').split('\n')) {
    if (!line) continue;
    const t = line.replace(/\r$/, '').split('\t'), tag = t[0];
    if (tag === '#edh') { m.v = Number(t[1]) || 0; m.at = t[2] || ''; }
    else if (tag === 'C' && t.length >= 5) {
      const names = t.slice(4).map(x => x.trim()).filter(Boolean); if (!names.length || !t[1]) continue;
      const c = { slug: t[1], decks: Math.max(0, Number(t[2]) || 0), ci: String(t[3] || '').replace(/[^WUBRG]/g, ''), names, img: '' };
      m.cmds.push(c); bySlug.set(c.slug, c);
    }
    else if (tag === 'I' && t.length >= 3) { const c = bySlug.get(t[1]); if (c && /^[\w\-./]+$/.test(t[2])) c.img = t[2]; }
    else if (tag === 'D' && t[1]) { const c = bySlug.get(t[1]); cur = c ? { slug: t[1], src: t[2] || 'edhrec', label: t[3] || '', url: /^https:\/\//.test(t[4] || '') ? t[4] : '', cards: [] } : null; if (cur) m.decks.push(cur); }
    else if (tag === 'K' && cur && t.length >= 3) { const n = t.slice(2).join('\t').trim(); if (n) cur.cards.push([n, Math.max(1, Math.min(99, Number(t[1]) || 1))]); }
    else if (tag === 'P' && t.length >= 3) { const v = Number(t[1]); if (v > 0) m.price.push([t.slice(2).join('\t').trim(), Math.round(v)]); }
    else if (tag === 'G' && t.length >= 2) { const n = t.slice(1).join('\t').trim(); if (n) m.gc.push(n); }
  }
  return m;
}
const EDHB = typeof module !== 'undefined' && module.exports ? require('./edhbin.js') : { edhPack, edhUnpack, edhFilter };
/** Types de decks, dans l'ordre d'affichage du filtre : Communauté (decks publiés par les joueurs, voir pubClean), deck moyen EDHREC, Budget, Premium, cEDH, Populaire (un seul deck récent), Archidekt (ancien fichier). */
const EDH_KINDS = ['comm', 'avg', 'budget', 'premium', 'cedh', 'pop', 'arch'];
/** Un deck de l'index : ses cartes restent dans les grands tableaux de l'index ; `cards` ([[clé, nom, qté]], terrains de base compris, commandant exclu) n'est construit qu'à la demande.
 *  k : type ('avg' deck moyen · 'budget' · 'premium' · 'pop' · 'cedh' · 'arch' deck Archidekt d'un ancien fichier) · u : mise à jour 'AAAA-MM-JJ' ('' inconnue) · v : vues · p : prix du deck en centimes (0 inconnu). */
class EdhDeck {
  constructor(e, i, cmd, src, label, url, k, u, v, p, pid) {
    this._e = e; this.i = i; this.cmd = cmd; this.slug = cmd.slug; this.src = src || 'edhrec'; this.label = label || ''; this.pid = pid ? String(pid) : '';      // pid : identifiant du deck public (Communauté), pour le signaler
    this.k = EDH_KINDS.includes(k) ? k : this.src === 'edhrec' ? 'avg' : 'arch'; this.u = /^\d{4}-\d{2}-\d{2}$/.test(u || '') ? u : ''; this.v = Math.max(0, Number(v) || 0); this.p = Math.max(0, Number(p) || 0);
    this.url = url === 0 ? 'https://edhrec.com/average-decks/' + cmd.slug : typeof url === 'number' ? 'https://archidekt.com/decks/' + url : /^https:\/\//.test(url || '') ? url : '';
  }
  get cards() { const e = this._e, out = []; for (let j = e.off[this.i], z = e.off[this.i + 1]; j < z; j++) { const id = e.ids[j]; out.push([e.keys[id], e.names[id], e.qty[j]]); } return out; }
}
/** Index de recherche à partir d'un fichier EDH2 lu (edhUnpack) :
 *  { v, at, cmds:[{ slug, decks, ci, names, keys, ids, img, rank (1 = le plus joué), tier ('S'…'D'), i, th:[[indice de thème, decks EDHREC]] (du plus au moins fréquent), thSet }], by: clé → commandant, bySlug,
 *    themes:[{ slug, label, cmds, decks }] (thèmes EDHREC : nombre de commandants et de decks qui les ont ; ceux d'un commandant valent pour tous ses decks, Archidekt compris), themeIx: slug → indice, themeOrder: indices des thèmes présents, du plus au moins fréquent, decks:[EdhDeck], price: clé → centimes, gc: Set de clés,
 *    names / keys / idOf : carte ↔ numéro, off / ids / qty : entrées des decks, pr : prix par numéro, bs / gcA : terrain de base · Game Changer par numéro }. */
function edhIndex(raw) {
  const names = raw.names, nn = names.length, keys = new Array(nn), idOf = new Map(), bs = new Uint8Array(nn), gcA = new Uint8Array(nn);
  for (let i = 0; i < nn; i++) { const k = ownKey(names[i]); keys[i] = k; if (!idOf.has(k)) idOf.set(k, i); if (BASIC_NAMES.has(k)) bs[i] = 1; }
  const themes = (raw.themes || []).map(t => ({ slug: String(t && t[0]), label: String((t && t[1]) || (t && t[0])), cmds: 0, decks: 0 })), themeIx = new Map(themes.map((t, i) => [t.slug, i]));
  const out = { v: raw.v, at: raw.at, rk: '', cmds: [], by: new Map(), bySlug: new Map(), decks: [], price: new Map(), gc: new Set(), names, keys, idOf, off: raw.off, ids: raw.ids, qty: raw.qty, pr: raw.pr, bs, gcA, themes, themeIx, themeOrder: [] };
  for (let i = 0; i < nn; i++) if (raw.pr[i] > 0) out.price.set(keys[i], raw.pr[i]);
  for (const id of raw.gc) { gcA[id] = 1; out.gc.add(keys[id]); }
  for (const r of raw.cmds) {
    const ck = r.names.map(ownKey), th = (r.th || []).filter(t => Array.isArray(t) && themes[t[0]] && t[1] > 0).map(t => [t[0], t[1]]).sort((a, b) => b[1] - a[1]);
    const c = { slug: r.slug, decks: r.decks, dm: r.dm || 0, ci: String(r.ci || '').replace(/[^WUBRG]/g, ''), names: r.names, comm: !!r.comm, keys: ck, ids: ck.map(k => idOf.get(k)).filter(x => x !== undefined), img: r.img && /^[\w\-./]+$/.test(r.img) ? FR_IMG + r.img : '', i: out.cmds.length, th, thSet: new Set(th.map(t => t[0])) };
    out.cmds.push(c); out.bySlug.set(c.slug, c);
    for (const t of th) themes[t[0]].cmds++;
    for (const k of c.keys) { const p = out.by.get(k); if (!p || c.decks > p.decks) out.by.set(k, c); }
  }
  out.rk = raw.rk === 'month' && out.cmds.some(c => c.dm > 0) ? 'month' : '';      // classement du mois (à jour) ; ancien fichier : compte long
  [...out.cmds].sort((a, b) => (out.rk ? (b.dm - a.dm) : 0) || b.decks - a.decks).forEach((c, i) => { c.rank = i + 1; c.tier = c.comm ? '' : edhTier(c.rank); });      // le tri est stable : à égalité, l'ordre du fichier (celui d'EDHREC) ; commandant venu de la communauté seule : classé dernier, sans tier ni rang affiché
  raw.dk.forEach(([ci, src, label, url, k, u, v, p, pid], i) => out.decks.push(new EdhDeck(out, i, out.cmds[ci], src, label, url, k, u, v, p, pid)));
  for (const d of out.decks) for (const t of d.cmd.th) themes[t[0]].decks++;
  out.themeOrder = themes.map((t, i) => i).filter(i => themes[i].decks > 0).sort((a, b) => themes[b].decks - themes[a].decks || themes[a].label.localeCompare(themes[b].label));      // les plus présents d'abord
  return out;
}
/** Lit edh.tsv (généré par gen-edhrec.mjs ; ancien format, gardé en repli) :
 *    #edh \t version \t date
 *    C \t slug \t decks \t identité \t nom [\t nom 2]        un commandant (ou une paire), avec son nombre de decks EDHREC
 *    I \t slug \t chemin d'image                            petite image du commandant (après cards.scryfall.io/small/)
 *    D \t slug \t source \t libellé \t lien                  début d'un deck de ce commandant (source : edhrec · archidekt…)
 *    K \t quantité \t nom                                    une carte du deck courant (commandant exclu)
 *    P \t centimes \t nom                                    prix Cardmarket (tendance Scryfall) au moment de la génération
 *    G \t nom                                                une carte de la liste Game Changers (Scryfall `is:gamechanger`)
 *  Retourne l'index (voir edhIndex). */
function parseEdh(text, keep, comm) { const b = EDHB.edhPack(edhModelFromTsv(text), ownKey); return edhIndex(edhAddComm(EDHB.edhUnpack(keep ? EDHB.edhFilter(b, keep) : b), comm)); }
/** Lit un fichier binaire EDH2 (edh.bin) : même index que parseEdh. Lève une erreur si le fichier est illisible. keep (facultatif, les deux) : decks gardés (edhFilter : interrupteur Archidekt du serveur) ;
 *  comm (facultatif, les deux) : decks de la communauté à ajouter (edhAddComm). */
function parseEdhBin(buf, keep, comm) { return edhIndex(edhAddComm(EDHB.edhUnpack(keep ? EDHB.edhFilter(buf, keep) : buf), comm)); }

/* ── Decks publics (« Communauté ») : publiés depuis Mes decks, relus par le serveur (proxy.mjs › /api/pubdecks), ajoutés aux decks EDHREC ── */
const PUB_MAX = 10;      // decks publiés par compte (firestore.rules : identifiants <empreinte de l'UID>_0 … _9)
const PUB_SIZE = 100;      // Commander : 100 cartes, commandant(s) compris
/** Deck à publier d'après son texte : { cmd: [noms des commandants], cards: ['3 Island', …] (commandants exclus), n: cartes en tout, commandants compris }. cmdKeys : clés des commandants (commandersOf), 2 au plus. */
function pubFromText(text, cmdKeys) {
  const pd = parseDeck(text), ks = new Set(cmdKeys || []), cmd = [], cards = []; let n = 0;
  for (const c of [...pd.cards, ...pd.basics]) {
    let q = c.qty; n += q;
    if (ks.has(c.key) && cmd.length < 2) { cmd.push(c.name); q--; }
    if (q > 0) cards.push(q + ' ' + c.name);
  }
  return { cmd, cards, n };
}
/* Filtre des mots publiés (pseudo, commandants et cartes d'un deck public) : insultes, injures racistes, homophobes ou sexuelles, nazisme (fr, en, de, es, it, pt),
   et noms qui se feraient passer pour l'appli. Texte ramené à des lettres simples : accents retirés, chiffres et symboles « l33t » lus comme des lettres
   (0→o 1→i 3→e 4→a 5→s 7→t @→a $→s). Chaque lettre peut se répéter (« fuuuck ») ; une lettre doublée doit le rester (« ass », pas « as »).
   PUB_BAD_W : mots entiers seulement (courts, ou cachés dans de vrais noms : « pute » dans « Dispute », « rapist » dans « Cabal Therapist ») ;
   PUB_BAD_P : aussi au milieu d'un mot ou en lettres séparées (« f.u.c.k », « fuckface »). Aucun des ≈ 31 000 noms de cartes anglais n'est refusé (test-pubdecks). */
const pubNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss')
  .replace(/[013457@$!|]/g, c => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i', '|': 'i' })[c]).replace(/[^a-z]+/g, ' ').trim();
/** Mot → motif : chaque lettre peut se répéter, une lettre doublée au moins deux fois. */
const pubPat = w => w.replace(/([a-z])\1*/g, (m, c) => (m.length > 1 ? c + '{' + m.length + ',}' : c + '+'));
const PUB_BAD_W = new RegExp('(?:^| )(?:' + ('ass asses arse cunt cunts dick dicks cock cocks cum fag fags rape rapes raped rapist rapists porn penis vagina anal kike kikes spic spics chink chinks gook gooks tranny twat twats '
  + 'wank wanker shit shits slut sluts nigga niggas pedo pedos nazi nazis admin '
  + 'pute putes pd pede pedes fdp ntm encule encules tapette negre negres couille couilles niquer salaud '
  + 'hure huren spast fick ficken neger '
  + 'puta putas puto putos zorra mierda joder cabron culo '
  + 'merda troia stronza '
  + 'porra viado foda fodase').split(' ').map(pubPat).join('|') + ')(?= |$)');
const PUB_BAD_P = new RegExp(('fuck motherfucker nigger faggot whore bitch pussy dickhead asshole cocksucker pedophile paedophile hitler swastika heilhitler siegheil manaorbit '
  + 'enculer salope connard connasse putain bougnoule youpin niquetamere petasse grognasse '
  + 'fotze hurensohn wichser schlampe missgeburt schwuchtel arschloch '
  + 'hijodeputa gilipollas maricon pendejo '
  + 'vaffanculo cazzo stronzo puttana frocio coglione minchia '
  + 'caralho buceta filhodaputa').split(' ').map(pubPat).join('|'));
/** Premier mot refusé du texte ('' : rien à redire). */
function pubBad(s) {
  const n = pubNorm(s); if (!n) return '';
  const m = PUB_BAD_W.exec(n) || PUB_BAD_P.exec(n.replace(/ /g, ''));
  return m ? m[0].trim() : '';
}
const pubStr = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n) : '');
/** Deck public relu (champs du document Firestore) : { by, cmd, ci, cards: [[nom, qté]], u: 'AAAA-MM-JJ' }, ou null s'il sort du format (pseudo, 1 ou 2 commandants, identité de couleur, 100 cartes pile,
 *  aucun mot refusé). known (facultatif) : clés (ownKey) des noms de cartes existants ; un nom absent (texte libre déguisé en carte) écarte le deck. */
function pubClean(x, known) {
  if (!x || typeof x !== 'object') return null;
  const by = pubStr(x.by, 30), cmd = Array.isArray(x.cmd) ? x.cmd.map(v => pubStr(v, 150)) : [];
  if (!by || cmd.length < 1 || cmd.length > 2 || cmd.some(c => !c) || new Set(cmd.map(ownKey)).size !== cmd.length) return null;
  const ci = typeof x.ci === 'string' && /^W?U?B?R?G?$/.test(x.ci) ? x.ci : null; if (ci === null) return null;
  if (!Array.isArray(x.cards) || !x.cards.length || x.cards.length > PUB_SIZE) return null;
  const m = new Map(); let n = cmd.length;
  for (const l of x.cards) {
    const r = /^(\d{1,2}) (.+)$/.exec(pubStr(l, 160)); if (!r) return null;
    const q = Number(r[1]), nm = r[2]; if (q < 1 || !ownKey(nm)) return null;
    const k = ownKey(nm), cur = m.get(k); if (cur) cur[1] += q; else m.set(k, [nm, q]); n += q;
  }
  if (n !== PUB_SIZE) return null;
  if (pubBad(by) || cmd.some(pubBad) || [...m.values()].some(c => pubBad(c[0]))) return null;      // mot refusé (pseudo, commandant, carte) : jamais servi
  if (known && known.size && ![...cmd, ...[...m.values()].map(c => c[0])].every(n => known.has(ownKey(n)) || known.has(ownKey(n.split('//')[0])))) return null;      // vraies cartes seulement : aucun texte libre
  const at = Number(x.updatedAt);
  return { by, cmd, ci, cards: [...m.values()], u: at > 0 && at < 8.64e15 ? new Date(at).toISOString().slice(0, 10) : '' };
}
/** Ajoute les decks de la communauté ([{ id, by, cmd, ci, cards: [[nom, qté]], u }], voir pubClean) aux données EDHREC lues (edhUnpack), avant edhIndex :
 *  type 'comm', libellé = pseudo de l'auteur, pid = identifiant du deck public. Commandant absent du fichier : ajouté (aucun deck EDHREC, identité de couleur de l'auteur).
 *  Cartes inconnues du fichier : ajoutées, sans prix. Le commandant est retiré des cartes du deck, comme dans le fichier EDHREC. */
function edhAddComm(raw, list) {
  if (!raw || !Array.isArray(list) || !list.length) return raw;
  const names = raw.names.slice(), idOf = new Map();
  names.forEach((n, i) => { const k = ownKey(n); if (!idOf.has(k)) idOf.set(k, i); });
  const idFor = n => { const k = ownKey(n); let i = idOf.get(k); if (i === undefined) { i = names.length; names.push(n); idOf.set(k, i); } return i; };
  const cmds = raw.cmds.slice(), bySig = new Map(cmds.map((c, i) => [c.names.map(ownKey).sort().join('|'), i])), dk = raw.dk.slice(), add = [];
  for (const d of list) {
    if (!d || !Array.isArray(d.cmd) || !d.cmd.length || !Array.isArray(d.cards) || typeof d.id !== 'string') continue;
    const ck = new Set(d.cmd.map(ownKey)), es = [];
    for (const c of d.cards) { const k = Array.isArray(c) && typeof c[0] === 'string' ? ownKey(c[0]) : ''; if (!k) continue; const left = (ck.has(k) ? c[1] - 1 : c[1]) | 0; if (left > 0) es.push([idFor(c[0]), Math.min(255, left)]); }      // une ligne du commandant dans les cartes : déjà compté
    if (!es.length) continue;
    d.cmd.forEach(idFor);
    const sig = d.cmd.map(ownKey).sort().join('|'); let ci = bySig.get(sig);
    if (ci === undefined) { ci = cmds.length; bySig.set(sig, ci); cmds.push({ comm: 1, slug: 'comm-' + sig.replace(/[^a-z0-9]+/g, '-').slice(0, 80), decks: 0, dm: 0, ci: String(d.ci || '').replace(/[^WUBRG]/g, ''), names: d.cmd.slice(0, 2), img: '', th: [] }); }
    dk.push([ci, 'comm', String(d.by || ''), '', 'comm', /^\d{4}-\d{2}-\d{2}$/.test(d.u || '') ? d.u : '', 0, 0, d.id]); add.push(es);
  }
  if (!add.length) return raw;
  const extra = add.reduce((a, es) => a + es.length, 0), base = raw.ids.length;
  const ids = new (names.length > 65535 ? Uint32Array : raw.ids.constructor)(base + extra), qty = new Uint8Array(base + extra), off = new Uint32Array(raw.off.length + add.length), pr = new Uint32Array(names.length);
  ids.set(raw.ids); qty.set(raw.qty); off.set(raw.off); pr.set(raw.pr);
  let j = base, o = raw.off.length;
  for (const es of add) { for (const [id, q] of es) { ids[j] = id; qty[j] = q; j++; } off[o++] = j; }
  return { ...raw, names, cmds, dk, ids, qty, off, pr };
}
/** Tier d'un commandant selon son rang de popularité (nombre de decks EDHREC) : S = les 30 premiers, A jusqu'à 150, B 500, C 1 500, D le reste. */
const EDH_TIERS = [['S', 30], ['A', 150], ['B', 500], ['C', 1500], ['D', Infinity]];
const edhTier = rank => (EDH_TIERS.find(t => rank <= t[1]) || EDH_TIERS[EDH_TIERS.length - 1])[0];
/** Bracket estimé d'un deck d'après son nombre de Game Changers : 0 → 2 (Core), 1 à 3 → 3 (Upgraded), 4 et plus → 4 (Optimized). Estimation : les autres critères du bracket (terrains détruits, tours supplémentaires, combos) ne sont pas lus. */
const edhBracket = n => (n <= 0 ? 2 : n <= 3 ? 3 : 4);
/** Mots d'une recherche de deck (sans accents ni ponctuation, comme les clés de cartes) ; [] si rien à chercher. */
const edhTokens = q => normName(q).replace(/ \/\/ /g, ' ').split(' ').filter(Boolean);
/** Le commandant (ou la paire) contient tous les mots (début de mot) : « tymna » et « thrasios triton » trouvent la paire Tymna + Thrasios. */
const edhWords = (s, toks) => { const w = ' ' + s; return toks.every(t => w.includes(' ' + t)); };      // chaque mot cherché commence un mot du nom : « smite » ne trouve pas « Prismite »
/** alt (facultatif) : clé de carte → nom imprimé dans la langue des noms (normalisé) ou '' ; la recherche vaut alors pour les deux noms (« foudre » et « bolt » trouvent Lightning Bolt). */
const edhCmdHas = (c, toks, alt) => edhWords(c.keys.join(' '), toks) || !!(alt && edhWords(c.keys.map(k => alt(k) || '').join(' '), toks));
/** Une ligne du classement. Les listes `missing`, `owned` et `gc` (longues, utiles seulement à la feuille d'un deck) ne sont calculées qu'au premier accès. */
class EdhRow {
  constructor(deck, cmd, total, have, cost, unpriced, mine, br, hit, e, own, eng, held) {
    this.deck = deck; this.cmd = cmd; this.total = total; this.have = have; this.eng = eng || 0; this.miss = total - have; this.cost = cost; this.unpriced = unpriced; this.mine = mine;
    this.tier = cmd.tier; this.rank = cmd.rank; this.br = br; this.hit = hit; this._e = e; this._o = own; this._h = held || null;
  }
  get missing() { edhDetail(this); return this.missing; }
  get owned() { edhDetail(this); return this.owned; }
  get gc() { edhDetail(this); return this.gc; }
}
function edhDetail(r) {
  const e = r._e, own = r._o, hold = r._h, c = r.cmd, d = r.deck, missing = [], owned = [], gcs = [];
  const one = (id, q) => {
    if (e.bs[id]) return;
    const h = Math.min(q, own[id]), m = q - h, g = e.gcA[id] === 1; if (g) gcs.push(e.names[id]);
    if (m) { const u = e.pr[id]; missing.push({ k: e.keys[id], n: e.names[id], q: m, u: u > 0 ? u : null, gc: g }); }
    if (h) owned.push({ k: e.keys[id], n: e.names[id], q: h, gc: g, eg: h - Math.min(h, Math.max(0, own[id] - (hold ? hold[id] : 0))) });      // eg : parmi ces exemplaires, ceux déjà réservés par un deck monté
  };
  for (const id of c.ids) one(id, 1);
  for (let j = e.off[d.i], z = e.off[d.i + 1]; j < z; j++) one(e.ids[j], e.qty[j]);
  missing.sort((a, b) => ((b.u || 0) * b.q - (a.u || 0) * a.q) || a.n.localeCompare(b.n));
  Object.defineProperties(r, { missing: { value: missing, configurable: true }, owned: { value: owned, configurable: true }, gc: { value: gcs, configurable: true } });
}
/** Decks EDHREC comparés à la collection. qty(clé) : exemplaires possédés. o : { held (clé → exemplaires réservés par des decks montés : sert à compter `eng`, les exemplaires possédés du deck déjà engagés ailleurs), cols:Set (identités de couleur permises : celle du commandant doit y tenir), mine (je possède un des commandants), budget (centimes, 0 = sans limite), tiers:Set ('S'…'D' : seulement ces tiers), themes:Set (identifiants de thèmes EDHREC : le commandant doit les avoir tous), sort: 'have' (le plus de cartes possédées) | 'miss' | 'cost' | 'pop' (meilleur rang : celui du mois si le fichier en a un), then (second tri, même choix : le premier se fait alors par paliers, voir EDH_SORT_STEP), kinds:Set (types de decks, voir EDH_KINDS), q (recherche : tous les mots), qm: 'cmd' (dans le nom du commandant) | 'card' (dans les cartes du deck, commandant compris, hors terrains de base) }.
 *  Terrains de base ignorés. Une ligne par deck : { deck, cmd, total, have, miss, cost, unpriced, mine, tier, rank, br (bracket estimé, 0 sans liste Game Changers), hit ([[clé, nom]] des cartes trouvées par une recherche « carte », sinon null), et à la demande : missing:[{ k, n, q, u, gc }], owned:[{ k, n, q, gc }], gc:[noms des Game Changers du deck, commandant compris] }.
 *  Calcul sur tableaux typés (un passage sur toutes les entrées de tous les decks) : quelques millisecondes pour 10 000 decks. */
function edhRank(edh, qty, o = {}) {
  const rows = []; if (!edh || !edh.decks || !edh.decks.length) return rows;
  const cols = o.cols && o.cols.size ? o.cols : null, card = o.qm === 'card'; let toks = o.q ? edhTokens(o.q) : null; if (toks && !toks.length) toks = null;
  const names = edh.names, keys = edh.keys, nn = names.length, own = new Uint16Array(nn), hold = typeof o.held === 'function' ? new Uint16Array(nn) : null;
  for (let i = 0; i < nn; i++) { const q = qty(keys[i]); if (q > 0) { own[i] = q > 65535 ? 65535 : q; if (hold) { const h = o.held(keys[i]); if (h > 0) hold[i] = h > 65535 ? 65535 : h; } } }
  const { off, ids, qty: qa, pr, bs, gcA } = edh, gset = edh.gc && edh.gc.size > 0;
  let thIx = null;      // thèmes demandés (identifiants) → indices ; un thème absent du fichier ne correspond à aucun deck
  if (o.themes && o.themes.size) { thIx = []; for (const t of o.themes) { const i = edh.themeIx && edh.themeIx.get(t); if (i === undefined) return rows; thIx.push(i); } }
  let hitF = null, cmdOk = null;
  const alt = typeof o.alt === 'function' ? o.alt : null;      // noms imprimés dans la langue des noms (edh.js › edhAlt) : cherchés en plus de l'anglais
  if (toks && card) { hitF = new Uint8Array(nn); for (let i = 0; i < nn; i++) if (!bs[i] && (edhWords(names[i].includes('//') ? normName(names[i]) : keys[i], toks) || (alt && edhWords(alt(keys[i]) || '', toks)))) hitF[i] = 1; }
  else if (toks) cmdOk = new Int8Array(edh.cmds.length);
  for (const d of edh.decks) {
    const c = d.cmd; let mine = false; for (const id of c.ids) if (own[id] > 0) { mine = true; break; }
    if (o.mine && !mine) continue;
    if (cols && ![...c.ci].every(x => cols.has(x))) continue;
    if (o.tiers && o.tiers.size && !o.tiers.has(c.tier)) continue;
    if (o.kinds && o.kinds.size && !o.kinds.has(d.k)) continue;
    if (thIx && !thIx.every(i => c.thSet.has(i))) continue;
    const a = off[d.i], z = off[d.i + 1]; let hit = null;
    if (hitF) {
      hit = []; for (const id of c.ids) if (hitF[id]) hit.push([keys[id], names[id]]);
      for (let j = a; j < z; j++) if (hitF[ids[j]]) hit.push([keys[ids[j]], names[ids[j]]]);
      if (!hit.length) continue;
    } else if (cmdOk) { if (!cmdOk[c.i]) cmdOk[c.i] = edhCmdHas(c, toks, alt) ? 1 : -1; if (cmdOk[c.i] < 0) continue; }
    let total = 0, have = 0, cost = 0, unpriced = 0, gcN = 0, eng = 0;
    for (const id of c.ids) { if (bs[id]) continue; total++; if (gcA[id]) gcN++; if (own[id] > 0) { have++; if (hold && own[id] <= hold[id]) eng++; } else { const u = pr[id]; if (u > 0) cost += u; else unpriced++; } }
    for (let j = a; j < z; j++) {
      const id = ids[j]; if (bs[id]) continue;
      const q = qa[j], ow = own[id], h = ow < q ? ow : q; total += q; have += h; if (gcA[id]) gcN++;
      if (hold && h) { const fr = ow > hold[id] ? ow - hold[id] : 0; eng += h - (fr < h ? fr : h); }
      if (h < q) { const m = q - h, u = pr[id]; if (u > 0) cost += u * m; else unpriced += m; }
    }
    if (total < 20 || total > 105) continue;      // liste tronquée, ou faussée (cartes en trop : un deck de Commander en compte 100)
    if (o.budget > 0 && cost > o.budget) continue;
    const row = new EdhRow(d, c, total, have, cost, unpriced, mine, gset ? edhBracket(gcN) : 0, hit, edh, own, eng, hold); row.gcn = gset ? gcN : 0; rows.push(row);
  }
  const exact = EDH_SORT_BY, sort = exact[o.sort] ? o.sort : 'have', then = o.then && o.then !== sort && exact[o.then] ? o.then : '';
  const by = then ? (a, b) => (EDH_SORT_STEP[sort](a) - EDH_SORT_STEP[sort](b)) || exact[then](a, b) || exact[sort](a, b) : exact[sort];
  return rows.sort((a, b) => by(a, b) || (a.cmd.rank - b.cmd.rank) || a.cmd.names[0].localeCompare(b.cmd.names[0]));
}
/** Tris des decks EDHREC : have (le plus de cartes possédées), miss, cost (le moins cher à compléter), pop (meilleur rang : celui du mois si le fichier en a un). */
const EDH_SORT_BY = {
  have: (a, b) => (b.have - a.have) || (a.miss - b.miss) || (a.cost - b.cost), miss: (a, b) => (a.miss - b.miss) || (a.cost - b.cost),
  cost: (a, b) => (a.cost - b.cost) || (a.miss - b.miss), pop: (a, b) => (a.cmd.rank - b.cmd.rank) || (a.miss - b.miss),
};
/** Paliers d'un tri suivi d'un second (« Meilleur tier, puis moins cher ») : à palier égal, le second départage. Tier (S → D) · part possédée par tranches de 10 % · cartes manquantes par 10 · coût à compléter par tranches (30 / 60 / 100 / 200 / 400 €). */
const EDH_COST_STEPS = [0, 3000, 6000, 10000, 20000, 40000];
const EDH_SORT_STEP = {
  pop: r => 'SABCD'.indexOf(r.tier || 'D'), have: r => -Math.floor(10 * r.have / Math.max(1, r.total)), miss: r => Math.floor(r.miss / 10),
  cost: r => { const i = EDH_COST_STEPS.findIndex(x => r.cost <= x); return i < 0 ? EDH_COST_STEPS.length : i; },
};
/** Nombre de decks de `rows` (résultat d'edhRank) qui portent chaque thème, indexé comme edh.themes. Les compteurs de la liste des thèmes en dépendent : ils suivent tous les filtres en cours (couleurs, tiers, budget, recherche, thèmes déjà choisis). */
function edhThemeCounts(edh, rows) {
  const n = new Array(edh && edh.themes ? edh.themes.length : 0).fill(0);
  for (const r of rows || []) for (const t of r.cmd.th) n[t[0]]++;
  return n;
}
/** Indices des thèmes du fichier, du plus au moins présent dans `counts` ; à égalité : les thèmes déjà choisis (sel : Set de slugs), puis la présence dans tout le fichier, puis le nom. Ceux à zéro viennent en dernier. */
function edhThemeOrder(edh, counts, sel) {
  const th = edh.themes, pick = new Set(); for (const s of sel || []) { const i = edh.themeIx.get(s); if (i !== undefined) pick.add(i); }
  return (edh.themeOrder || []).slice().sort((a, b) => (counts[b] - counts[a]) || (pick.has(b) - pick.has(a)) || (th[b].decks - th[a].decks) || th[a].label.localeCompare(th[b].label));
}
/** Liste à charger dans la page de saisie : commandant(s) puis cartes du deck (terrains de base compris). */
function edhDeckText(d) {
  const c = d.cmd, cmd = c.names.map(n => '1 ' + n);
  return ['Commander', ...cmd, '', ...d.cards.filter(x => !c.keys.includes(x[0])).map(x => x[2] + ' ' + x[1])].join('\n');
}

/* ── Prix réels de la collection (offre CardTrader la moins chère) ─────────────────────────────── */
/** Prix unitaire d'une carte de la collection, en centimes : prix réel (rp, offre CardTrader la plus basse) s'il est connu, sinon l'estimation Cardmarket (eu), sinon null. */
const unitPrice = i => (Number.isFinite(i.rp) && i.rp > 0 ? i.rp : Number.isFinite(i.eu) && i.eu > 0 ? i.eu : null);
/** L'offre la moins chère qu'on achèterait vraiment : mêmes critères que la recherche (état, foil, hors vacances/gradées/lots…), vendeurs hub seulement en mode Zero, langue demandée. null si aucune. */
function cheapestOffer(offers, opts) {
  let best = null;
  for (const o of offers || []) {
    if (!passes(o, opts) || (opts.mode !== 'direct' && !o.hub) || (opts.lang && o.lang && o.lang !== opts.lang)) continue;
    if (!best || byPrice(o, best) < 0) best = o;
  }
  return best;
}
/** Signature des critères d'un prix réel (langue des offres, état, foil, mode) : si elle change, le prix est à relire. */
const pxSig = (lang, o) => [lang, o.cond, o.foil, o.mode === 'direct' ? 'direct' : 'zero'].join('|');
/** Prix réel (px : { p, t, s }) à relire ? absent, trop ancien (ttl ms) ou calculé avec d'autres critères. */
const pxStale = (px, sig, now, ttl) => !px || px.s !== sig || !(now - px.t <= ttl);

/* ── Statistiques de la collection ─────────────────────────────────────────────────────────── */
/** Prix unitaire selon la source : 'ct' = prix réel CardTrader, à défaut l'estimation Cardmarket ; 'cm' = estimation Cardmarket seule. { u, real } ou null. */
function srcPrice(i, src) {
  if (src === 'cm') return Number.isFinite(i.eu) && i.eu > 0 ? { u: i.eu, real: false } : null;
  const u = unitPrice(i);
  return u == null ? null : { u, real: Number.isFinite(i.rp) && i.rp > 0 };
}
/** items : [{ k, n, q, cm, tl, cl, eu, rp }] (cm/tl/cl/eu absents tant que Scryfall n'a pas répondu ; rp : prix réel CardTrader si lu). src : 'ct' (défaut) = prix réel sinon estimation, 'cm' = estimation Cardmarket pour tout. alt = valeur de l'autre source. */
function collStats(items, src) {
  src = src === 'cm' ? 'cm' : 'ct';
  const st = { src, unique: items.length, copies: 0, known: 0, unknown: 0, lands: 0, spells: 0, value: 0, valued: 0, real: 0, alt: { value: 0, valued: 0 }, curve: new Array(8).fill(0), colors: { W: 0, U: 0, B: 0, R: 0, G: 0, M: 0, C: 0 }, types: {}, top: [], topUnit: [] };
  for (const t of TYPE_ORDER) st.types[t] = 0;
  const valued = [];
  for (const i of items) {
    st.copies += i.q;
    if (i.tl == null && i.cm == null) { st.unknown++; continue; }
    st.known++;
    const t = typeBucket(i.tl); st.types[t] += i.q;
    const p = srcPrice(i, src), a = srcPrice(i, src === 'cm' ? 'ct' : 'cm');
    if (p) { st.value += p.u * i.q; st.valued++; if (p.real) st.real++; valued.push({ ...i, up: p.u, lot: p.u * i.q, rl: p.real }); }
    if (a) { st.alt.value += a.u * i.q; st.alt.valued++; }
    if (t === 'Terrains') { st.lands += i.q; continue; }
    st.spells += i.q;
    st.curve[Math.min(i.cm ?? 0, 7)] += i.q;
    const c = i.cl || ''; if (!c) st.colors.C += i.q; else if (c.length > 1) st.colors.M += i.q; else if (st.colors[c] != null) st.colors[c] += i.q; else st.colors.C += i.q;
  }
  st.top = valued.slice().sort((a, b) => b.lot - a.lot || b.up - a.up || a.n.localeCompare(b.n));           // « les plus chères » par lot (prix × exemplaires) : toutes, l'écran en affiche par tranches
  st.topUnit = valued.sort((a, b) => b.up - a.up || b.lot - a.lot || a.n.localeCompare(b.n));                // …ou par prix de la carte
  return st;
}

/* ── Reconnaissance d'un nom de carte dans un texte lu par OCR ───────────────────────────────── */
/** Distance de Levenshtein bornée : retourne max + 1 dès qu'elle dépasse max. */
function lev(a, b, max) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  if (!la) return lb; if (!lb) return la;
  let prev = new Array(lb + 1), cur = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur[0] = i; let rowMin = i; const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      let v = prev[j - 1] + (ca === b.charCodeAt(j - 1) ? 0 : 1);
      const del = prev[j] + 1, ins = cur[j - 1] + 1;
      if (del < v) v = del; if (ins < v) v = ins;
      cur[j] = v; if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const t = prev; prev = cur; cur = t;
  }
  return prev[lb];
}
/** Paires de lettres que l'OCR confond (stockées triées) : la substitution ne coûte que 0,5. */
const OCR_CONF = ['il', '1i', '1l', '0o', '5s', 'ce', 'uv', 'ft', 'hn', 'gq'];
const COST_PLAIN = new Float32Array(128 * 128).fill(1), COST_OCR = new Float32Array(128 * 128).fill(1);
for (let i = 0; i < 128; i++) COST_PLAIN[i * 128 + i] = COST_OCR[i * 128 + i] = 0;
for (const p of OCR_CONF) { const x = p.charCodeAt(0), y = p.charCodeAt(1); COST_OCR[x * 128 + y] = COST_OCR[y * 128 + x] = 0.5; }
let LEVW_A = new Float32Array(256), LEVW_B = new Float32Array(256);
/** Distance de Levenshtein bornée, pondérée pour l'OCR : lettres confondues (i/l, c/e, u/v…) et espaces ajoutés ou perdus = 0,5 (disc : false pour les mots courts, où une confusion peut changer le mot).
 *  Textes normalisés (a-z, 0-9, espace). Retourne max + 1 dès que la distance dépasse max. */
function levw(a, b, max, disc = true) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) * 0.5 > max) return max + 1;
  if (!la) return lb; if (!lb) return la;
  if (lb + 1 > LEVW_A.length) { LEVW_A = new Float32Array(lb + 64); LEVW_B = new Float32Array(lb + 64); }
  const T = disc ? COST_OCR : COST_PLAIN, sg = disc ? 0.5 : 1;
  let prev = LEVW_A, cur = LEVW_B;
  prev[0] = 0; for (let j = 1; j <= lb; j++) prev[j] = prev[j - 1] + (b.charCodeAt(j - 1) === 32 ? sg : 1);
  for (let i = 1; i <= la; i++) {
    const ca = a.charCodeAt(i - 1) & 127, ga = ca === 32 ? sg : 1, row = ca * 128; cur[0] = prev[0] + ga; let rowMin = cur[0];
    for (let j = 1; j <= lb; j++) {
      const cb = b.charCodeAt(j - 1);
      let v = prev[j - 1] + T[row + (cb & 127)];
      const del = prev[j] + ga, ins = cur[j - 1] + (cb === 32 ? sg : 1);
      if (del < v) v = del; if (ins < v) v = ins;
      cur[j] = v; if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const t = prev; prev = cur; cur = t;
  }
  return prev[lb];
}
const spaces = k => { let n = 0; for (let i = 0; i < k.length; i++) if (k.charCodeAt(i) === 32) n++; return n; };
/** Index des noms de cartes : { list:[{k, n}], by: Map(k → n) } ; k = première face normalisée. */
function nameIndex(names) {
  const by = new Map(), list = [];
  for (const n of names || []) { const k = frontName(n); if (k.length >= 2 && !by.has(k)) { by.set(k, n); list.push({ k, n, s: spaces(k) }); } }
  return { list, by };
}
/** Variantes d'une ligne lue par OCR : la ligne, puis sans les petits mots parasites de fin (coût de mana lu comme du texte) ou de début. */
function lineVariants(raw) {
  const clean = String(raw || '').replace(/[|_~=<>{}\[\]\\\/@#*•·®©™]+/g, ' '), key = normPart(clean), t = key.split(' ').filter(Boolean), out = [];
  if (!t.length) return out;
  const last = (clean.trim().split(/\s+/).pop() || '');
  out.push({ key: t.join(' '), penalty: 0 });
  if (t.length > 1 && t[t.length - 1].length <= 2) out.push({ key: t.slice(0, -1).join(' '), penalty: 0.03 });
  else if (t.length > 1 && /^[A-Z0-9]{3,4}$/.test(last)) out.push({ key: t.slice(0, -1).join(' '), penalty: 0.04 });   // coût de mana lu comme un mot en capitales (« LLB », « RHO », « WUBG »)
  if (t.length > 2 && t[t.length - 1].length <= 3 && t[t.length - 2].length <= 3) out.push({ key: t.slice(0, -2).join(' '), penalty: 0.05 });
  if (t.length > 2 && t[0].length <= 2) out.push({ key: t.slice(1).join(' '), penalty: 0.03 });
  return out;
}
/** Meilleur nom de carte pour une ligne : { name, score (0..1), key } ou null. ≥ 0.84 fiable · ≥ 0.72 à vérifier. */
function matchName(raw, idx, minScore = 0.72) {
  let best = null;
  for (const v of lineVariants(raw)) {
    if (v.key.length < nameMin(v.key)) continue;
    let name = idx.by.get(v.key), d = 0, k = v.key; const vsp = name === undefined ? spaces(v.key) : 0;
    if (name === undefined) {
      let max = Math.max(1, Math.floor(v.key.length * 0.3)), bn = null;
      if (minScore > 0.8) max = Math.max(1, Math.min(max, Math.floor((1 - minScore) * v.key.length) + 1));   // seuil exigeant : on écarte tôt les noms trop différents
      for (const st of max > 4 ? [2, 4, max] : max > 2 ? [2, max] : [max]) {                              // recherche par paliers : une lecture propre est trouvée en quelques calculs, le résultat est le même qu'avec la borne maximale d'emblée
        let limit = st;
        for (const e of idx.list) {
          if (limit < 0) break;
          const dl = e.k.length - v.key.length, ad = dl < 0 ? -dl : dl, sp = dl < 0 ? vsp : e.s, cheap = ad < sp ? ad : sp;      // écart de longueur : au mieux des espaces à 0,5, le reste à 1
          if (cheap * 0.5 + (ad - cheap) > limit) continue;
          const dd = levw(v.key, e.k, limit, Math.min(e.k.length, v.key.length) >= 6);
          if (dd <= limit) { bn = e; d = dd; limit = dd - 0.1; }
        }
        if (bn) break;
      }
      if (!bn) continue;
      name = bn.n; k = bn.k;
    }
    const score = 1 - d / Math.max(v.key.length, k.length) - v.penalty;
    if (score >= minScore && (!best || score > best.score)) best = { name, score: Math.round(score * 1000) / 1000, key: ownKey(name) };
  }
  return best;
}
/** Plusieurs noms sur une même ligne (cartes côte à côte) : groupes de mots reconnus (≥ 0.9), sans chevauchement, dans l'ordre de lecture. */
function spanMatches(text, idx, minScore = 0.9) {
  const w = String(text || '').replace(/[|_~=<>{}\[\]\\\/@#*•·®©™]+/g, ' ').split(/\s+/).filter(Boolean);
  if (w.length < 2 || w.length > 16) return [];
  const found = [];
  for (let i = 0; i < w.length; i++) for (let j = Math.min(w.length, i + 7); j > i; j--) {
    const sp = w.slice(i, j).join(' '); if (sp.length < 5 || !/[A-Za-zÀ-ÿЀ-ӿ]{3}/.test(sp)) continue;          // « Opt », « Fog » : trop courts pour être sûrs au milieu d'une ligne
    const m = matchName(sp, idx, minScore); if (m) found.push({ ...m, i, j, raw: sp });
  }
  found.sort((a, b) => b.score - a.score || (b.j - b.i) - (a.j - a.i));
  const used = new Array(w.length).fill(false), out = [];
  for (const f of found) { let free = true; for (let k = f.i; k < f.j; k++) if (used[k]) { free = false; break; } if (!free) continue; for (let k = f.i; k < f.j; k++) used[k] = true; out.push(f); }
  return out.sort((a, b) => a.i - b.i).map(({ i, j, ...m }) => m);
}
/** Lignes lues par OCR [{ text, y }] → cartes reconnues [{ name, key, score, q, raw }] (une même carte lue deux fois = 2 exemplaires).
 *  spans : une ligne peut contenir plusieurs noms (photo de plusieurs cartes côte à côte). */
function ocrMatches(lines, idx, spans = false) {
  const out = [], seen = new Map();
  for (const l of lines || []) {
    const text = String(l.text || '').trim(); if (text.length < nameMin(text) || text.length > (spans ? 140 : 60)) continue;
    const letters = (text.match(NAME_LETTER_RE) || []).length; if (letters < (CJK_RE.test(text) ? text.replace(/\s+/g, '') : text).length * 0.6) continue;      // écriture d'Asie : sans les espaces que l'OCR glisse entre les caractères
    const one = matchName(text, idx);
    let ms = one ? [one] : [];
    if (spans && (!one || one.score < 0.84)) { const sp = spanMatches(text, idx); if (sp.length) ms = sp; }
    for (const m of ms) {
      const cur = seen.get(m.key);
      if (cur) { cur.q++; if (m.score > cur.score) { cur.score = m.score; cur.raw = m.raw || text; } } else { const e = { ...m, q: 1, raw: m.raw || text }; seen.set(m.key, e); out.push(e); }
    }
  }
  return out;
}

/** Meilleure carte reconnue parmi des lignes lues : { name, key, score, raw } ou null. */
function bestMatch(lines, idx) { return ocrMatches(lines, idx, false).sort((a, b) => b.score - a.score)[0] || null; }
/** Préfixe des miniatures Scryfall gardées dans le catalogue français (seul le chemin « front/a/b/id.jpg » est stocké). */
const FR_IMG = 'https://cards.scryfall.io/small/';
/** Face avant d'un nom imprimé (« A // B » → « A ») : la collection ne garde que la face avant. */
const frFront = p => String(p).split(/\s+\/\/\s+/)[0].trim();
/** Nom anglais normalisé (ownKey) → nom imprimé français, sans l'index de recherche floue (léger) : sert à afficher les cartes FR de la collection.
 *  Ligne « … \t a » (4e colonne, gen-fr-names.mjs) : autre traduction, d'une impression plus ancienne : reconnue au scan, affichée seulement à défaut de la traduction actuelle. */
function frNames(rows) {
  const m = new Map(), al = new Set();
  for (const r of rows || []) { const t = String(r).split('\t'), p = t[0], en = t[1]; if (!p || !en) continue; const ek = frontName(en), a = t[3] === 'a'; if (ek && (!m.has(ek) || (!a && al.has(ek)))) { m.set(ek, frFront(p)); if (a) al.add(ek); else al.delete(ek); } }
  return m;
}
/** Catalogue français : lignes « nom imprimé \t nom anglais \t chemin de l'image » → { n, idx (recherche floue sur les noms imprimés), by (nom imprimé normalisé → { en, img }) }. */
function frCatalog(rows, l = 'fr') {
  const by = new Map(), amb = new Set(), names = [], fr = new Map(), ambEn = new Map(), al = new Set();
  for (const r of rows || []) {
    const [p, en, img, alias] = String(r).split('\t'); if (!p || !en) continue;
    const ek = frontName(en), a = alias === 'a'; if (ek && (!fr.has(ek) || (!a && al.has(ek)))) { fr.set(ek, frFront(p)); if (a) al.add(ek); else al.delete(ek); }      // nom anglais → nom imprimé français (affichage des cartes FR de la collection) ; ancienne traduction (a) : à défaut
    const k = frontName(p); if (k.length < 2) continue;
    if (by.has(k)) { if (frontName(by.get(k).en) !== ek) { amb.add(k); const a = ambEn.get(k) || [by.get(k).en]; if (!a.some(x => frontName(x) === ek)) a.push(en); ambEn.set(k, a); } continue; }      // même nom français pour deux cartes différentes (≈ 0,1 %, « Voie de la pyromancienne ») : la 1re gardée, toutes notées
    by.set(k, { en, img: img || '' }); names.push(p);
  }
  return { n: names.length, idx: nameIndex(names), by, amb, ambEn, fr, l };
}
function matchFr(lines, fc) {
  if (!fc || !fc.n) return null;
  const m = bestMatch(lines, fc.idx); if (!m) return null;
  const e = fc.by.get(frontName(m.name)); if (!e) return null;
  const dup = !!(fc.amb && fc.amb.has(frontName(m.name)));      // nom français partagé par plusieurs cartes : jamais « sûr », la photo permet de trancher
  return { name: e.en, key: ownKey(e.en), score: dup ? Math.min(m.score, 0.83) : m.score, ...(dup ? { pre: m.score } : {}), raw: m.raw, card: fc.l || 'fr', img: e.img ? (/^https?:/.test(e.img) ? e.img : FR_IMG + e.img) : '', ...(dup ? { amb: true, ...(fc.ambEn && fc.ambEn.get(frontName(m.name)) ? { alts: fc.ambEn.get(frontName(m.name)) } : {}) } : {}) };
}
/* ── Noms imprimés des autres langues (scan : carte italienne lue avec l'appli en français) : un catalogue par langue, mêmes règles que frCatalog / matchFr.
   Partagé par le serveur (proxy.mjs › /api/names/find, fichiers names-*.tsv) et l'appli (pwa/names-all.tsv, scan.js › scanOther) : même résultat des deux côtés. */
/** Chaîne autonome : une sous-chaîne garderait en mémoire tout le fichier lu. */
const nmFlat = s => (s ? JSON.parse(JSON.stringify(s)) : '');
/** Catalogue vide d'une langue : idx (index de nameIndex dont chaque nom porte « imprimé \t anglais [\t image] » : une seule chaîne par carte), amb (noms imprimés partagés par deux cartes), first (construction). */
const nmCat = () => ({ n: 0, idx: { list: [], by: new Map() }, amb: new Set(), ambEn: new Map(), first: new Map() });      // ambEn : nom imprimé partagé → noms anglais des cartes
/** Ajoute le nom imprimé p de la carte anglaise en (img : chemin de la miniature, serveur seulement ; ek : frontName(en) déjà calculé) : 1er nom gardé, nom partagé par deux cartes noté (jamais « sûr »). */
function nmPut(c, p, en, img, ek) {
  let k = frontName(p); if (k.length < 2) return;
  const cur = c.first.get(k); if (cur !== undefined) {
    const e2 = ek || frontName(en); if (cur === e2) return;
    const kf = nmFlat(k), a = c.ambEn.get(kf) || [String(c.idx.by.get(kf) || '').split('\t')[1]].filter(Boolean); if (!a.some(x => frontName(x) === e2)) a.push(nmFlat(en));
    c.amb.add(kf); c.ambEn.set(kf, a); return;
  }
  k = nmFlat(k); c.first.set(k, ek || frontName(en)); const n = nmFlat(img === undefined ? p + '\t' + en : p + '\t' + en + '\t' + img);      // nom déjà normalisé : frontName peut rendre p lui-même, donc une sous-chaîne du fichier
  c.idx.by.set(k, n); c.idx.list.push({ k, n, s: spaces(k) }); c.n++;
}
/** Catalogue terminé (table de construction libérée) ; null s'il est tronqué (< 500 noms). */
const nmDone = c => { c.first = null; return c.n >= 500 ? c : null; };
/** Meilleure carte d'un catalogue pour les lignes lues (mêmes règles que matchFr) : { name (anglais), printed, score, raw, img, amb? } ou null. */
function nmMatch(c, lines) {
  const m = c && bestMatch(lines, c.idx); if (!m) return null;
  const [printed, name, img] = m.name.split('\t'), dup = c.amb.has(frontName(printed)), alts = dup && c.ambEn ? c.ambEn.get(frontName(printed)) : null;
  return { name, printed, score: dup ? Math.min(m.score, 0.83) : m.score, ...(dup ? { pre: m.score } : {}), raw: m.raw, img: img || '', ...(dup ? { amb: true, ...(alts && alts.length > 1 ? { alts } : {}) } : {}) };
}
/** Lettres lues, accents gardés : « relámpago » (es) ≠ « relâmpago » (pt). */
const nmAcc = s => String(s || '').toLowerCase().normalize('NFC').replace(/[^\p{L}]+/gu, '');
/** Meilleures cartes de chaque langue [{ …nmMatch, lang }] (dans l'ordre des langues) → la carte retenue { …, lang, alt? } ou null.
 *  Même nom lu, cartes différentes selon la langue (« Relámpago » es = Lightning Bolt, « Relâmpago » pt = Thunderbolt) : les accents lus tels quels tranchent, sinon à vérifier (0,83).
 *  alt : autres langues où la même carte porte ce nom (« Elfos de Llanowar » es / pt). */
function nmPick(found) {
  if (!found || !found.length) return null;
  const all = found.slice().sort((a, b) => b.score - a.score), key = f => frontName(f.name);      // tri stable : à égalité, l'ordre des langues
  let top = all.filter(f => all[0].score - f.score < 0.001);
  if (new Set(top.map(key)).size > 1) {
    const exact = top.filter(f => nmAcc(f.raw).includes(nmAcc(f.printed)));
    const alts = [...new Map(top.map(f => [key(f), f.name])).values()];      // cartes possibles (une par langue) : la ligne du bas ou l'illustration tranchent au scan
    top = new Set(exact.map(key)).size === 1 ? exact : top.map(f => ({ ...f, score: Math.min(f.score, 0.83), amb: true, alts }));
  }
  const h = top[0], alt = top.filter(f => f.lang !== h.lang && key(f) === key(h)).map(f => f.lang);
  return alt.length ? { ...h, alt } : h;
}
/** pwa/names-all.tsv (1re ligne « # anglais \t fr \t de… », puis « anglais \t noms fr \t noms de… », noms d'une langue séparés par « | ») → { langue: catalogue } pour les langues ls
 *  (les autres colonnes ne sont pas lues). Construit par tranches : await tick() entre deux (l'écran reste fluide) ; tick() renvoie false : abandon (null). Catalogue tronqué : absent. */
async function namesAllCats(text, ls, tick) {
  const rows = String(text || '').split('\n'), head = rows[0] && rows[0][0] === '#' ? rows[0].split('\t').slice(1).map(s => s.trim()) : NAMES_LANGS;
  const cols = ls.map(l => [l, head.indexOf(l) + 1]).filter(([, i]) => i > 0), cats = cols.map(() => nmCat());
  for (let i = 0; i < rows.length; i += 500) {
    for (let j = i, end = Math.min(rows.length, i + 500); j < end; j++) {
      const r = rows[j]; if (!r || r[0] === '#') continue;
      const t = r.split('\t'), en = t[0]; if (!en) continue;
      let ek = '';      // nom anglais normalisé : calculé une fois pour toutes les langues de la ligne
      for (let c = 0; c < cols.length; c++) { const v = t[cols[c][1]]; if (v) for (const p of v.split('|')) if (p) nmPut(cats[c], p, en, undefined, ek || (ek = frontName(en))); }
    }
    if (tick && (await tick()) === false) return null;
  }
  const out = {}; cols.forEach(([l], c) => { const x = nmDone(cats[c]); if (x) out[l] = x; });
  return out;
}
/** Index des noms français tapés (decklist, import, saisie) depuis les lignes du catalogue « imprimé \t anglais \t image » :
 *  by : clé frKey (nom entier, et face avant d'une carte double) → { en, p } (anglais, imprimé) ou { amb: [anglais…], p } (même nom français pour plusieurs cartes : jamais choisi à la place de l'utilisateur) ;
 *  en : clés frKey des noms anglais (un nom anglais reste anglais) ; fr : ownKey anglais → nom imprimé (comme frNames) ; img : ownKey anglais → chemin de la miniature française ;
 *  list : [{ k (normPart), n (imprimé), en }] pour la saisie assistée et les suggestions.
 *  ix : index à compléter (construction par tranches, sans bloquer l'écran : ≈ 31 000 lignes). */
function frIndex(rows, ix) {
  ix = ix || { by: new Map(), en: new Set(), fr: new Map(), img: new Map(), list: [], n: 0, al: new Set() };
  const { by, en, fr, img, list } = ix, fk = s => normPart(s.split('//')[0]) || frontName(s);
  for (const r of rows || []) {
    const t = String(r).split('\t'), p = t[0], e = t[1]; if (!p || !e) continue;
    const ek = fk(e); if (!ek) continue;
    en.add(ek.replace(/ /g, '')); if (e.includes('//')) en.add(frKey(e));
    const pf = frFront(p), pn = normPart(pf);
    const a = t[3] === 'a'; if (!fr.has(ek) || (!a && ix.al && ix.al.has(ek))) { fr.set(ek, pf); if (t[2]) img.set(ek, t[2]); if (ix.al) { if (a) ix.al.add(ek); else ix.al.delete(ek); } }      // ancienne traduction (a) : affichée à défaut de l'actuelle
    for (let i = 0; i < (pf === p ? 1 : 2); i++) {
      const k = i ? frKey(p) : pn.replace(/ /g, ''); if (k.length < 2) continue;
      const cur = by.get(k), pp = i ? p : pf;      // nom entier tapé (« Feu // Glace ») : affiché entier ; face avant seule (« Feu ») : affichée seule
      if (!cur) { by.set(k, { en: e, p: pp }); if (!i) list.push({ k: pn, n: pf, en: e }); }
      else if (cur.amb) { if (!cur.amb.some(x => fk(x) === ek)) { cur.amb.push(e); if (!i) list.push({ k: pn, n: pf, en: e }); } }
      else if (fk(cur.en) !== ek) { by.set(k, { amb: [cur.en, e], p: cur.p }); if (!i) list.push({ k: pn, n: pf, en: e }); }
    }
  }
  ix.n = by.size; return ix;
}
/** Nom tapé → { en, p } (nom français d'une autre carte anglaise) · { amb: [anglais…], p } (plusieurs cartes) · null (pas un nom français connu, ou le même en anglais).
 *  Un nom qui est aussi le nom anglais d'une autre carte reste anglais (« Desolation », « Endurance ») sauf preferFr (exemplaire dit français) ou accents du nom imprimé tapés tels quels (« Désolation » = Badlands).
 *  ck : clé frKey déjà calculée. */
const frAccent = s => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
function frLookup(name, preferFr, ck) {
  const ix = FRX.ix; if (!ix) return null;
  const k = ck || frKey(name); if (k.length < 2) return null;
  const e = ix.by.get(k); if (!e) return null;
  if (ix.en.has(k)) {
    if (!preferFr && !(e.p && /[^\x00-\x7f]/.test(name) && frAccent(name) === frAccent(e.p))) return null;
    if (!e.amb && frKey(String(e.en).split('//')[0]) === k) return null;      // même nom dans les deux langues (« Aberrant ») : rien à changer
  }
  return e.amb ? { amb: e.amb.slice(), p: e.p } : { en: e.en, p: e.p };
}
/** Nom anglais d'un nom français connu sans ambiguïté, sinon '' (pour les autres écrans : liste de souhaits…). */
const frToEn = name => { const f = frLookup(name); return f && f.en ? f.en : ''; };
/** Nom imprimé français d'une carte (nom anglais ou clé), '' si l'index ne la connaît pas. */
const enToFr = name => (FRX.ix && FRX.ix.fr.get(ownKey(name))) || '';
/** Noms proches d'un nom inconnu (faute de frappe, nom français approché) : [{ n (anglais), p? (imprimé français), score }], les meilleurs d'abord, sans doublon de carte.
 *  idx : nameIndex des noms anglais (ou null) ; les noms français de l'index chargé sont aussi essayés. Nom français exact mais ambigu : ses cartes d'abord. */
function nameSuggest(raw, idx, n = 3, minScore = 0.6) {
  const name = String(raw || '').trim(), key = normPart(name.split('//')[0]); if (key.length < 2) return [];
  const out = new Map(), put = (en, p, score) => { const k = ownKey(en); const cur = out.get(k); if (!cur || score > cur.score) out.set(k, { n: en, ...(p ? { p } : {}), score: Math.round(score * 1000) / 1000 }); };
  const f = frLookup(name, true); if (f && f.en) put(f.en, f.p, 1); else if (f && f.amb) f.amb.forEach(en => put(en, f.p, 0.99));
  const max = Math.max(1, Math.floor(key.length * (1 - minScore)));
  const scan = (list, get) => {
    for (const e of list) {
      const dl = e.k.length - key.length; if (dl > max || -dl > max) continue;
      const d = lev(key, e.k, max); if (d > max) continue;
      const s = 1 - d / Math.max(key.length, e.k.length); if (s >= minScore) get(e, s);
    }
  };
  if (idx && idx.list) scan(idx.list, (e, s) => put(e.n, '', s));
  if (FRX.ix) scan(FRX.ix.list, (e, s) => put(e.en, e.n, s));
  return [...out.values()].sort((a, b) => b.score - a.score || a.n.localeCompare(b.n)).slice(0, n);
}
/** Départage une lecture française et une lecture anglaise du même texte : la plus sûre ; à égalité (nom identique dans les deux langues) le français, langue de la plupart des cartes. */
const bestOf = (fr, en) => (fr && (!en || fr.score >= en.score) ? fr : en || null);
/* ── Noms alternatifs (pwa/names-flavor.tsv, gen-flavor-names.mjs) : « Thrum of the Vestige » imprimé en gros au-dessus de « Lightning Bolt » (Secret Lair, Final Fantasy…).
   Lignes « nom alternatif \t nom anglais \t extension|numéro \t langue Scryfall ». */
const FV_LANG = { en: 'en', fr: 'fr', de: 'de', es: 'es', it: 'it', pt: 'pt', ja: 'jp', ko: 'kr', ru: 'ru', zhs: 'zh-CN', zht: 'zh-TW' };
/** Lignes → { idx (recherche floue), by (nom alternatif normalisé → impressions [{ en, e, l }]), n } ou null. */
function fvCatalog(rows) {
  const by = new Map(), names = [];
  for (const r of rows || []) {
    const [f, en, e, l] = String(r).split('\t'); if (!f || !en) continue;
    const k = frontName(f); if (k.length < 3) continue;
    if (!by.has(k)) { by.set(k, []); names.push(f); }
    by.get(k).push({ en, e: e || '', l: l || 'en' });
  }
  return names.length ? { idx: nameIndex(names), by, n: names.length } : null;
}
/** Lignes lues → carte au nom alternatif : { name (anglais), key, score, raw, flavor, card (langue de l'appli), img: '', ft (extension et numéro, comme la ligne du bas) } ou null. */
function fvMatch(lines, c) {
  const m = c && bestMatch(lines, c.idx); if (!m) return null;
  const hs = c.by.get(frontName(m.name)) || [], ens = [...new Set(hs.map(h => h.en))]; if (ens.length !== 1) return null;      // même nom alternatif pour deux cartes : rien de sûr
  const eds = hs.map(h => h.e).filter(e => /^[a-z0-9]+\|./i.test(e)), ls = [...new Set(hs.map(h => h.l))];
  const ft = eds.length ? { nums: [...new Set(eds.map(e => e.split('|')[1].toLowerCase().replace(/^0+(?=\d)/, '')))], codes: [...new Set(eds.map(e => e.split('|')[0].toUpperCase()))], lang: '', lsep: false, langs: [], foil: false, tots: [] } : null;
  return { name: ens[0], key: ownKey(ens[0]), score: m.score, raw: m.raw, flavor: m.name, card: ls.length === 1 ? FV_LANG[ls[0]] || 'en' : 'en', img: '', ...(ft ? { ft } : {}) };
}
/** Rectangle d'écran (x, y, w, h) dans un conteneur cw×ch qui affiche une vidéo vw×vh en « object-fit: cover » → rectangle en pixels de la vidéo. */
function coverMap(cw, ch, vw, vh, r) {
  const s = Math.max(cw / vw, ch / vh), ox = (cw - vw * s) / 2, oy = (ch - vh * s) / 2;
  const x = Math.max(0, (r.x - ox) / s), y = Math.max(0, (r.y - oy) / s);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(Math.max(1, Math.min(vw - x, r.w / s))), h: Math.round(Math.max(1, Math.min(vh - y, r.h / s))) };
}
/** Mots utiles d'un nom lu (≥ 4 lettres, le trait d'union et l'apostrophe séparent), les plus longs d'abord : sert à chercher le nom imprimé chez Scryfall. */
const frWords = text => [...new Set(String(text || '').replace(/[^\p{L}\s'’-]/gu, ' ').split(/[\s'’-]+/).filter(w => w.length >= 4))].sort((a, b) => b.length - a.length);
/** Fluidité de l'aperçu caméra : feed(date en ms de chaque image affichée) → { fps, low }.
 *  low = true (une seule fois, puis la mesure repart) quand il y a moins de `min` images/s pendant `hold` ms de suite. Une pause de plus de 5 s (onglet masqué) remet à zéro. */
function makeFpsWatch(min = 14, hold = 3000, win = 2000) {
  let t = [], lowSince = 0, last = 0;
  return {
    feed(now) {
      if (last && now - last > 5000) { t = []; lowSince = 0; }
      last = now; t.push(now); while (t.length && now - t[0] > win) t.shift();
      const span = now - t[0]; if (t.length < 3 || span < win * 0.75) return { fps: 0, low: false };
      const fps = (t.length - 1) * 1000 / span;
      if (fps >= min) { lowSince = 0; return { fps, low: false }; }
      if (!lowSince) lowSince = now;
      if (now - lowSince >= hold) { lowSince = 0; t = []; return { fps, low: true }; }
      return { fps, low: false };
    },
    reset() { t = []; lowSince = 0; last = 0; }
  };
}
/* ── Partage vers l'app (Web Share Target) ───────────────────────────────────────────────────── */
const URL_RE = /https?:\/\/[^\s<>"')]+/gi;
/** Paramètres reçus (title, text, url) → { text, urls } : le texte est gardé s'il ressemble à une decklist (3 cartes ou plus), les liens sont listés. */
function extractShared(p) {
  const text0 = String((p && p.text) || ''), urls = [];
  for (const part of [text0, (p && p.url) || '', (p && p.title) || '']) for (const m of String(part).matchAll(URL_RE)) { const u = m[0].replace(/[.,;:!?]+$/, ''); if (!urls.includes(u)) urls.push(u); }
  const body = text0.replace(URL_RE, '').trim();
  return { text: parseDeck(body).cards.length >= 3 ? body : '', urls };
}

/* ── Liste d'échange : doublons à proposer, cartes recherchées ─────────────────────────────────────────────
   Échangeable = possédé − exemplaires utilisés par tous les decks (additionnés : chaque deck peut être monté en même temps) − réserve de sécurité.
   Terrains de base jamais proposés ni cherchés. Les exemplaires gardés le sont d'abord dans l'ordre des langues de la collection (fr, en, …). */
/** Exemplaires utilisés par une liste de decks (textes) : Map clé → { n, q } (deck + réserve, commandant compris ; terrains de base exclus). */
function deckUse(texts) {
  const use = new Map();
  const add = (name, q) => { const k = ownKey(name); if (!k || BASIC_NAMES.has(k) || !(q > 0)) return; const cur = use.get(k); if (cur) cur.q += q; else use.set(k, { n: name, q }); };
  for (const t of texts || []) { for (const c of parseDeck(t).cards) add(c.name, c.qty); for (const c of dkSideCards(t)) add(c.name, c.qty); }
  return use;
}
/**
 * Cartes à échanger. coll : clé → { n, q, l?, x? } · use : deckUse(…) · keep : réserve gardée en plus des decks (0, 1, 2…) · kept : Set des clés que l'utilisateur garde
 * · places : emplacements (COLL.places) pour leur règle d'échange (placeTrade) : « skip » : ses exemplaires ne sont jamais proposés et remplissent la réserve (decks + keep) en premier ;
 *   « all » : ses exemplaires partent tous, même le dernier, même s'ils manquent à un deck ; sans règle (ou deck monté) : classique, la réserve se prend sur eux, dans l'ordre d'affichage.
 * Retourne { have: [{ k, n, q, lines: [[langue, exemplaires]] }], held: [{ k, n, q }] } (held : cartes gardées à la main qui auraient été proposées), triés par nom.
 */
function tradeLists(coll, use, keep, kept, places) {
  const have = [], held = [], kp = Math.max(0, Math.floor(Number(keep) || 0)), rule = places ? g => placeTrade(places, lineAttrs(g).p) : () => '';
  for (const [k, x] of Object.entries(coll || {})) {
    if (!x || !(x.q > 0) || BASIC_NAMES.has(k)) continue;
    const u = use && use.get(k), hold = (u ? u.q : 0) + kp, ls = collLines(x);
    let ign = 0, forced = 0, std = 0; for (const [g, q] of ls) { const m = rule(g); if (m === 'skip') ign += q; else if (m === 'all') forced += q; else std += q; }
    let skip = Math.max(0, hold - ign); const spare = Math.max(0, std - skip) + forced;
    if (spare <= 0) continue;
    if (kept && kept.has(k)) { held.push({ k, n: x.n, q: spare }); continue; }
    const lines = [];
    for (const [l, q] of ls) {      // sans emplacement ni détails : ils ne quittent pas l'appareil
      const m = rule(l); if (m === 'skip') continue;
      let g = q; if (m !== 'all') { g = Math.max(0, q - skip); skip = Math.max(0, skip - q); }
      const h = lineHead(l), e = lines.find(y => y[0] === h); if (g) { if (e) e[1] += g; else lines.push([h, g]); }
    }
    have.push({ k, n: x.n, q: spare, lines });
  }
  const byN = (a, b) => EN_CMP(a.n, b.n);
  return { have: have.sort(byN), held: held.sort(byN) };
}
/** Cartes recherchées : ce qui manque aux decks (somme des decks − possédé) + la liste de souhaits (wish : clé → { n, q, i?, w?, l? }, exemplaires voulus en plus ;
 *  i/w/l : illustration retenue — image, « Extension · CODE 123 », langue). [{ k, n, q, d (manque aux decks), w (souhait), p? { i, w, l } }] triés par nom. */
function tradeWant(coll, use, wish) {
  const out = new Map();
  for (const [k, u] of use || []) { const own = (coll && coll[k] && coll[k].q) || 0; if (u.q > own) out.set(k, { k, n: u.n, q: u.q - own, d: u.q - own, w: 0 }); }
  for (const [k, w] of Object.entries(wish || {})) {
    if (!w || BASIC_NAMES.has(k)) continue;
    const q = Math.max(1, Math.min(99, Math.floor(Number(w.q) || 1))), cur = out.get(k);
    const x = cur || { k, n: String(w.n || k), q: 0, d: 0, w: 0 };
    x.w = q; x.q += q; if (w.i) x.p = { i: w.i, ...(w.w ? { w: w.w } : {}), ...(w.l ? { l: w.l } : {}) };      // illustration choisie (carte en grand)
    if (!cur) out.set(k, x);
  }
  return [...out.values()].sort((a, b) => EN_CMP(a.n, b.n));
}
/**
 * Échange possible avec la liste partagée d'un autre joueur (côté visiteur) : ce qu'il a et que je cherche, ce qu'il cherche et que j'ai EN TROP.
 * sh : readShare('trade', …) · want : mes cartes recherchées (tradeWant) · spare : mes doublons échangeables (tradeLists(…).have, jamais le brut possédé : mes decks gardent leurs cartes)
 * · price(k) : prix unitaire en centimes, ou null. Retourne { get, give, sum: { get, give }, n } :
 *   get  : [{ k, n, q (min de ses exemplaires et de ma recherche), has (ses exemplaires), it (sa carte, avec image si possible), ls (ses langues), w (ma ligne de tradeWant), u, v }]
 *   give : [{ k, n, q (min de sa recherche et de mes doublons), it (sa carte recherchée : illustration voulue…), s (ma ligne de tradeLists), u, v }]
 *   u : prix unitaire, v : u × q (null sans prix) ; triées par valeur puis par nom. sum : { n cartes, q exemplaires, v centimes (cartes chiffrées), nv cartes sans prix }.
 */
function tradeMatch(sh, want, spare, price) {
  const wm = new Map(), sm = new Map(), g = new Map(), give = [];
  for (const x of want || []) if (x && x.q > 0) wm.set(x.k, x);
  for (const x of spare || []) if (x && x.q > 0) sm.set(x.k, x);
  for (const it of (sh && sh.have) || []) {      // une ligne par langue chez lui : additionnées
    const w = it && wm.get(it.k); if (!w) continue;
    let e = g.get(it.k); if (!e) g.set(it.k, e = { k: it.k, n: it.n, has: 0, it, ls: [], w });
    e.has += it.q; if (it.l && !e.ls.includes(it.l)) e.ls.push(it.l); if (!e.it.im && it.im) e.it = it;
  }
  for (const it of (sh && sh.want) || []) { const s = it && sm.get(it.k); if (s && !give.some(x => x.k === it.k)) give.push({ k: it.k, n: it.n, q: Math.min(it.q, s.q), it, s }); }
  const by = (a, b) => (b.v || 0) - (a.v || 0) || EN_CMP(a.n, b.n);
  const get = [...g.values()].map(e => tradePriced({ ...e, q: Math.min(e.has, e.w.q) }, price)).sort(by);
  give.forEach(x => tradePriced(x, price)); give.sort(by);
  return { get, give, sum: { get: tradeSum(get), give: tradeSum(give) }, n: get.length + give.length };
}
/** Pose sur x (modifié) u : prix unitaire en centimes (null sans prix), et v = u × x.q. price(k, x) : centimes, ou null ; ou { u, v, … } quand les exemplaires
 *  n'ont pas tous le même prix (lignes foil, éditions : share.js › trRowPx) : posé tel quel (v : la valeur de la ligne). */
function tradePriced(x, price) {
  const r = price ? price(x.k, x) : 0;
  if (r && typeof r === 'object') { const u = r.u > 0 ? Math.round(r.u) : null; return Object.assign(x, r, { u, v: r.v > 0 ? Math.round(r.v) : u == null ? null : u * x.q }); }
  const c = Number(r), u = c > 0 ? Math.round(c) : null; return Object.assign(x, { u, v: u == null ? null : u * x.q });
}
/** Total d'une liste chiffrée (tradePriced) : { n cartes, q exemplaires, v centimes (cartes chiffrées), nv cartes sans prix }. */
const tradeSum = list => (list || []).reduce((t, x) => { t.n++; t.q += x.q; if (x.v == null) t.nv++; else t.v += x.v; return t; }, { n: 0, q: 0, v: 0, nv: 0 });
/**
 * Onglet « Échange » du propriétaire : ses lignes (tradeLists(…).have ou tradeWant) chiffrées (copies, avec u et v), triées et filtrées, et leur total.
 * o : { price(k), sort : 'name' (ordre reçu) | 'price' (prix unitaire décroissant, sans prix à la fin, puis nom), min : prix unitaire minimal en centimes (0 : tout ; sinon les cartes sans prix sont écartées) }.
 * Retourne { rows, sum } ; sum porte sur les lignes gardées.
 */
function tradeView(list, o = {}) {
  let rows = (list || []).map(x => tradePriced({ ...x }, o.price));
  if (o.min > 0) rows = rows.filter(x => x.u != null && x.u >= o.min);
  if (o.sort === 'price') rows.sort((a, b) => (b.u == null ? -1 : b.u) - (a.u == null ? -1 : a.u) || EN_CMP(a.n, b.n));
  return { rows, sum: tradeSum(rows) };
}

/* ── Export Cardmarket : une ligne « 2 Sol Ring » par carte (noms anglais), à coller dans une Wants list (Shopping Wizard) ── */
/** items : [{ n, q }] → texte ; cartes additionnées par nom, terrains de base exclus, quantités ≤ 0 ignorées. */
function cmText(items) {
  const m = new Map();
  for (const x of items || []) {
    const k = ownKey(x.n), q = Math.floor(Number(x.q) || 0); if (!k || q <= 0 || BASIC_NAMES.has(k)) continue;
    const cur = m.get(k); if (cur) cur.q += q; else m.set(k, { n: String(x.n).trim(), q });
  }
  return [...m.values()].map(x => x.q + ' ' + x.n).join('\n');
}
/** Cardmarket n'accepte que 150 lignes par Wants list : le texte de cmText découpé en parties de max lignes au plus (une seule partie s'il tient). */
const CM_MAX = 150;
function cmParts(text, max = CM_MAX) {
  const lines = String(text || '').split('\n').filter(Boolean), out = [], n = Math.max(1, Math.floor(max) || CM_MAX);
  for (let i = 0; i < lines.length; i += n) out.push(lines.slice(i, i + n).join('\n'));
  return out;
}
/** Cartes qui manquent à un deck (texte) : deck + réserve − owned(clé) ; owned absent = rien n'est possédé. [{ n, q }] */
function deckMissing(text, owned) {
  const need = new Map();
  const add = (name, q) => { const k = ownKey(name); if (!k || BASIC_NAMES.has(k)) return; const cur = need.get(k); if (cur) cur.q += q; else need.set(k, { n: name, q }); };
  for (const c of parseDeck(text).cards) add(c.name, c.qty);
  for (const c of dkSideCards(text)) add(c.name, c.qty);
  const out = [];
  for (const [k, x] of need) { const q = x.q - (owned ? Math.max(0, Number(owned(k)) || 0) : 0); if (q > 0) out.push({ n: x.n, q }); }
  return out;
}

/* ── Partage public (liste d'échange, deck) : document shares/{id}, lisible par quiconque a le lien. Le contenu vient d'un autre compte : tout est revérifié ici. ── */
const SHARE_IMG_RE = /^https:\/\/cards\.scryfall\.io\/(?![\w./-]*(?:\/\/|\.\.))[\w./-]+(\?\d+)?$/;      // images Scryfall seulement, sans « // » ni « .. »
const SHARE_LANGS = ['fr', 'en', 'de', 'es', 'it', 'pt', 'jp', 'zh-CN', 'ru', 'kr', 'zh-TW'];
/** Image Scryfall en petit format (vignettes) : …/large/… ou …/normal/… → …/small/… */
const SCRY_IMG = 'https://cards.scryfall.io/';
/** Adresse d'image raccourcie pour un partage : « small/front/6/d/….jpg » (sans le domaine ni le ?horodatage) ; '' si ce n'est pas une image Scryfall. */
const imgShort = u => { const s = String(u || ''); return SHARE_IMG_RE.test(s) ? s.slice(SCRY_IMG.length).replace(/\?\d+$/, '') : ''; };
const scrySmall = u => String(u || '').replace(/\/(large|normal|png|border_crop)\//, '/small/');
const shStr = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const shNum = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : null; };
/** Édition d'une carte partagée : 'cmm|400' → « cmm/400 » (code d'extension / numéro de collection), '' sans édition. */
const edShare = e => (e ? edSet(e) + '/' + edNum(e) : '');
/** « cmm/400 » relu d'un partage (contenu d'un autre compte) → 'cmm|400' ; '' si absent ou illisible (code de 2 à 6 lettres et chiffres, numéro de 12 signes au plus, lettres, chiffres, ★ † Φ • -). */
const edUnshare = v => { if (typeof v !== 'string' || v.length > 19) return ''; const i = v.indexOf('/'), n = v.slice(i + 1); return i > 0 && /^[\p{L}\p{N}★†Φ•-]{1,12}$/u.test(n) ? edKey(v.slice(0, i), n) : ''; };
/** Une carte d'un partage : { n, q, l?, e? (édition « cmm/400 »), fo? (exemplaires foil parmi q), p? / pf? (prix à l'unité de l'impression, de ses foil), f? (nom français), i? (image), c? (coût), t? (type), o? (couleurs), m? (symboles) } → item d'affichage, null si illisible. */
function shareCard(x) {
  if (!x || typeof x !== 'object') return null;
  const n = shStr(x.n, 160).trim(), q = shNum(x.q, 1, 9999); if (!n || q == null) return null;
  const it = { k: ownKey(n), n, q };
  if (!it.k) return null;
  if (SHARE_LANGS.includes(x.l)) it.l = x.l;
  const e = edUnshare(x.e); if (e) it.e = e;      // impression exacte de ces exemplaires (classeur, liste : son image) ; absente d'un partage d'avant ou sans édition
  const fo = shNum(x.fo, 0, q); if (fo) it.fo = fo;      // foil (classeur : pochette à part) ; absent d'un partage d'avant
  const p = shNum(x.p, 0, 1e7), pf = fo ? shNum(x.pf, 0, 1e7) : 0; if (p) it.p = p; if (pf) it.pf = pf;      // prix à l'unité (centimes) de cette impression et de ses foil, publiés par le propriétaire ; absents : prix de la carte
  const pu = shNum(x.pu, 0, 1e7), pfu = fo ? shNum(x.pfu, 0, 1e7) : 0; if (pu) it.pu = pu; if (pfu) it.pfu = pfu;      // les mêmes en dollars (propriétaire au marché TCGplayer) : lus par un visiteur du même marché seulement
  const f = shStr(x.f, 160).trim(); if (f) { it.fn = f; if (it.l === (SHARE_LANGS.includes(x.fl) ? x.fl : 'fr')) it.dn = f; }      // fl : langue de f (partage d'un appareil en allemand…), français sans elle
  { const iv = shStr(x.i, 300), full = !iv || /^https:/.test(iv) ? iv : SCRY_IMG + iv; if (SHARE_IMG_RE.test(full)) it.im = full; }      // adresse complète ou raccourcie (imgShort)
  const pw = shStr(x.w, 90).trim(); if (pw) it.pw = pw;      // illustration recherchée : « Extension · CODE 123 »
  const c = shNum(x.c, 0, 99); if (c != null) it.cm = c;
  const t = shStr(x.t, 120); if (t) it.tl = t;
  const o = shStr(x.o, 5); if (/^[WUBRG]*$/.test(o)) it.cl = o;
  const m = shStr(x.m, 80); if (/^(\{[^{}]{1,6}\})*$/.test(m) && m) it.mc = m;
  return it;
}
/** Classeur publié avec une liste d'échange (binder.js) : { c couverture, s tri, k cartes épinglées (clés), u date du réglage } ; null sans classeur. */
function shareBd(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const c = shStr(x.c, 12), s = shStr(x.s, 8);
  return { c: /^[a-z]{2,12}$/.test(c) ? c : '', s: ['value', 'color', 'set', 'name'].includes(s) ? s : 'name', k: Array.isArray(x.k) ? x.k.slice(0, 24).map(k => shStr(k, 160)).filter(Boolean) : [], u: shNum(x.u, 0, 1e15) || 0 };
}
/** Document de partage lu (champ d : JSON) → { kind: 'trade', at, have, want, bd? } | { kind: 'deck', at, name, text } ; null si illisible. */
function readShare(kind, d) {
  let o; try { o = typeof d === 'string' ? JSON.parse(d) : d; } catch (e) { return null; }
  if (!o || typeof o !== 'object') return null;
  const at = shNum(o.at, 0, 1e15) || 0;
  // pseudo et photo du propriétaire (facultatifs) : texte court sans balise, image seulement en data:image (aucune adresse externe)
  const by = shStr(o.by, 200).replace(/[\p{Cc}\p{Cf}<>]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 30).trim(), bp = typeof o.bp === 'string' && o.bp.length <= 40000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(o.bp) ? o.bp : '';
  const bg = Array.isArray(o.bg) ? o.bg.slice(0, 3).filter(x => Array.isArray(x) && typeof x[0] === 'string' && /^[a-z0-9_]{2,24}$/.test(x[0]) && Number.isInteger(x[1]) && x[1] >= 0 && x[1] <= 3).map(x => [x[0], x[1]]) : [];      // badges choisis par le propriétaire (progress.js), 3 au plus
  const who = { ...(by ? { by } : {}), ...(bp ? { bp } : {}), ...(bg.length ? { bg } : {}) };
  if (kind === 'trade') {
    const list = a => (Array.isArray(a) ? a.slice(0, 20000).map(shareCard).filter(Boolean) : []);
    const bd = shareBd(o.bd);
    return { kind, at, have: list(o.have), want: list(o.want), ...(o.cut ? { cut: true } : {}), ...(bd ? { bd } : {}), ...who };      // cut : liste tronquée par le propriétaire (trop longue) ; bd : son classeur
  }
  if (kind === 'deck') {
    const text = shStr(o.text, 60000), name = shStr(o.name, 120).trim() || 'Deck';
    return parseDeck(text).cards.length || parseDeck(text).basics.length ? { kind, at, name, text, ...who } : null;
  }
  return null;
}

/* ── Main de départ ────────────────────────────────────────────────────────────────────────────── */
/** Terrain ? D'après la ligne de type de la face avant (« Land », « Legendary Land »… ; une carte modale « Sort // Terrain » n'en est pas un). */
const isLandType = tl => /\bland\b/i.test(String(tl || '').split('//')[0]);
/** Bibliothèque d'un deck : un élément par exemplaire (commandants retirés : ils restent dans la zone de commandement). */
function libraryOf(items) {
  const out = [];
  for (const it of items || []) if (!it.cmd && !it.sb) for (let i = 0; i < Math.min(it.q || 0, 99); i++) out.push(it);
  return out;
}
/** n cartes tirées au hasard sans remise (Fisher-Yates partiel). rnd() → [0, 1). */
function drawHand(lib, n, rnd) {
  const a = lib.slice(), m = Math.min(n, a.length), r = rnd || Math.random;
  for (let i = 0; i < m; i++) { const j = i + Math.floor(r() * (a.length - i)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a.slice(0, m);
}
/** Loi hypergéométrique : probabilité d'avoir exactement k terrains (k = 0..n) en tirant n cartes d'un paquet de N cartes dont L terrains. */
function handLandOdds(N, L, n = 7) {
  const m = Math.min(n, N), lc = (a, b) => { if (b < 0 || b > a) return -Infinity; let s = 0; for (let i = 1; i <= b; i++) s += Math.log(a - b + i) - Math.log(i); return s; };
  const tot = lc(N, m), out = [];
  for (let k = 0; k <= m; k++) { const v = lc(L, k) + lc(N - L, m - k) - tot; out.push(Number.isFinite(v) ? Math.exp(v) : 0); }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { T, TN, LOC, I18N, I18N_LANGS, i18nPick, i18nHas, i18nLangs,collToCsv, cmOffer, cmUrl, cmText, cmParts, CM_MAX, deckMissing, deckUse, tradeLists, tradeWant, tradeMatch, tradeView, shareCard, shareBd, readShare, SHARE_IMG_RE, scrySmall, imgShort, isLandType, libraryOf, drawHand, handLandOdds,
    parseLine, dropCard, restoreLines, sortCards, ctCardUrl, ctShare, replaceParts, preferLang, forMode, needsEnglish, recapOf, CONDITIONS, COND_SHORT, normPart, normName, frontName, parseDeck, passes, normalizeProduct, optimize, allocate,
    hash32, mulberry32, makeDemoOffers, DEMO_SELLERS,
    sanitizeOpts, suggestName, sameKind, pushHistory, priceDelta, priceSeries, deckDoc, readDeck, relTime, newDeckId, HISTORY_MAX,
    sanitizeSnap, newestSnap, typeBucket, groupSnap, curveOf, snapAge, TYPE_ORDER, SNAP_MAX,
    eurCents, minRef, refInfo, refTotals, unitOf, pvOf, snapDeltas, topMovers, commanderKeys, canLead, DK_FORMATS, dkMaxCopies, dkFormat, dkValue, dkColors, dkSideCards, dkBuildText, dkParse, dkCheck, dkFmtOf, dkMatch, dkCover, dkSetCover, dkCoverCard, dkCount, dkCountText,
    ownKey, cardLang, langCode, merge3, sameEntry, unitPrice, cheapestOffer, pxSig, pxStale, parseCollection, mergeColl, unionColl, sameColl, collToText, collFromText, applyOwned, itemColors, itemType, filterItems, filterActive, collStats, srcPrice, canBeCommander, isCmdrType, cmdrClass, parseEdh, parseEdhBin, edhModelFromTsv, edhIndex, edhAddComm, pubFromText, pubClean, pubBad, pubNorm, PUB_MAX, PUB_SIZE, edhTokens, edhCmdHas, edhRank, EDH_KINDS, EDH_SORT_STEP, agoDay, edhThemeCounts, edhThemeOrder, edhDeckText, edhTier, edhBracket, EDH_TIERS, dayOf, histPush, histDelta, baseRoll, baseRef, pxMovers, buyMerge, buyClean, engClean, engTotal, engFree, engDecksOf, engSnapshot, engMerge, engSame, engActive, histMerge, histSame,
    lev, levw, nameIndex, lineVariants, matchName, frCatalog, frNames, fvCatalog, fvMatch, frFront, collLines, collFromLines, collDomLang, collMainLang, collSig, unionLines, edKey, edSet, edNum, edNorm, edLabel, lineKey, lineLang, lineEd, lineFoil, lineBase, langLines, langFoil, matchFr, bestOf, FR_IMG, spanMatches, ocrMatches, bestMatch, coverMap, makeFpsWatch, frWords, extractShared };
}

// Tri des noms (test.mjs) : exporté à part, hors de la grande liste que d'autres modifient
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { NAME_CMP, byName });
// Emplacements, détails d'exemplaire et proxys (test-places.mjs)
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { COND_CM, PLACE_TRADES, placeTrade, lineCmp, attrOf, attrWord, lineHead, lineAw, lineAttrs, linePlace, lineSet, csvCond, PLACE_TYPES, placeName, placeNorm, placeNewId, placesText, collDoc, collDocText, collDocFromText, samePlaces, sameDoc, placesMerge3, mergeDoc3 });
// Noms français tapés ou importés (frnames) : exportés à part, hors de la grande liste que d'autres modifient
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { FRX, frKey, frUse, frIndex, frLookup, frToEn, enToFr, nameSuggest });
// Langue des cartes et liens selon la langue de l'utilisateur (test.mjs) : exportés à part, eux aussi
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { MK, MKTS, MK_EU, mkGuess, mkPick, mkUs, mkSfx, mkCur, modeCur, mkMode, SNAP_MODES, mkName, mkAb, mkLabel, mkPx, mkText, tcgUrl, mkUrl, mkWantsUrl });
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { defaultCardLang, cmSite, ctCartUrl, namesLangOf, NAMES_LANGS, ASIA_LANGS, NAMES_ALL_LANGS, CJK_RE });
// Noms imprimés des autres langues (scan, proxy.mjs › /api/names/find) : exportés à part, eux aussi
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { nmFlat, nmCat, nmPut, nmDone, nmMatch, nmAcc, nmPick, namesAllCats });
// Foil et langue par ligne de la liste (recherche CardTrader) : exportés à part
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { lnLeft, lnOffers, lnQueries, lnNeedsEn, lnOwn, lnJoin, shareStock });
// Impression exacte des cartes partagées (classeur : une pochette par langue et édition) : exportés à part
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { langEdLines, edShare, edUnshare });
// Filtres avancés de la collection (search.js) : exportés à part
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { FLT_ADV, FLT_PX, LG_FMT, lgOf, fltAdvCount, fltLineOn, fltLineOk, fltAdvOk, rarNorm });
