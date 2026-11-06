/* ── Recherche de cartes par nom : dans la LANGUE DE L'APPLI, puis en anglais (puis dans la langue des cartes si elle diffère et que son index est là) ──
   Un seul système pour toutes les recherches textuelles de cartes (collection et ses filtres, éditeur de deck, coach, échanges, amis, Communauté, saisie,
   lot, alertes, classeur, proxys, image du deck, decks À monter…). Les données enregistrées restent en anglais (clés ownKey) ; seuls la recherche et les noms
   affichés des résultats changent.
   Index : celui de la langue des cartes (FRX, collection.js › frLoad : affichage des exemplaires dans leur langue imprimée, decklists, import, scan) sert
   aussi la langue de l'appli quand c'est la même (cas courant : français / français) ; sinon un 2e index, CN.ix (core.js), lu une fois depuis le même
   catalogue (names-<langue>.tsv) et construit par tranches. Jamais plus de deux en mémoire : quand la langue des cartes rejoint celle de l'appli, FRX reprend
   l'index de CN (frLoad) ; quand elle la quitte, CN garde celui de FRX (namesSwitch). */

/** Langue des noms de l'appli : celle de l'interface si elle a un catalogue de noms imprimés ('' : anglais : noms anglais seuls). */
const cnLang = () => (NAMES_LANGS.includes(I18N.lang) ? I18N.lang : '');
/** Index des noms dans la langue de l'appli (frIndex : list, fr, by…) s'il est prêt, sinon null ; noLoad : sans lancer son chargement. */
function cnIx(noLoad) {
  const l = cnLang(); if (!l) return null;
  if (FRX.l === l && FRX.ix) return FRX.ix;
  if (CN.ix && CN.l === l) return CN.ix;
  if (!noLoad) cnLoad();
  return null;
}
/** Charge l'index de la langue de l'appli (appareil, sinon fichier du site ; local : appareil seulement, aucune requête). Même langue que les cartes : frLoad. */
function cnLoad(local) {
  const l = cnLang(); if (!l) return Promise.resolve(false);
  if (cnIx(true)) return Promise.resolve(true);
  if (typeof namesLang === 'function' && namesLang() === l) return frLoad(local);
  if (CN.p) return CN.local && !local ? CN.p.then(ok => ok || cnLoad()) : CN.p;
  if (!local && Date.now() - CN.fail < 60000) return Promise.resolve(false);
  CN.local = !!local;
  const p = CN.p = (async () => {
    const rec = (await scryFrCached(l).catch(() => null)) || (local ? null : await scryFrStatic(undefined, l).catch(() => null));
    if (cnIx(true)) return true;      // arrivé par l'autre index entre-temps (langue des cartes changée)
    if (!rec) { if (!local) CN.fail = Date.now(); return false; }
    const ix = frIndex([]), t0 = Date.now();
    for (let i = 0; i < rec.rows.length; i += 2500) { frIndex(rec.rows.slice(i, i + 2500), ix); await new Promise(r => setTimeout(r, 0)); }      // ≈ 31 000 noms par tranches : l'écran ne fige pas
    if (cnIx(true)) return true;
    CN.ix = ix; CN.l = l; CN.ms = Date.now() - t0; cnReady(); return true;
  })().catch(() => { if (!local) CN.fail = Date.now(); return !!cnIx(true); }).finally(() => { if (CN.p === p) CN.p = null; });
  return p;
}
/** Un index de noms est arrivé (langue de l'appli ou des cartes) : version des noms + 1 (recherches gardées refaites), écrans qui attendaient rappelés. */
function cnReady() {
  CN.v++;
  frReady();      // collection, decklist, feuilles ouvertes (comme à l'arrivée de l'index de la langue des cartes), puis cnFlush
}
/** Rappelle les écrans qui attendaient l'index de la langue de l'appli (cnWhen), s'il est là. */
function cnFlush() {
  if (!CN.on.size || !cnIx(true)) return;
  const fs = [...CN.on]; CN.on.clear();
  for (const f of fs) { try { f(); } catch (e) { /* écran fermé entre-temps */ } }
}
/** Rappelle fn (une fois) quand l'index de la langue de l'appli arrive ; vrai s'il est déjà là (rien à attendre). */
function cnWhen(fn) {
  if (!cnLang() || cnIx()) return true;
  if (fn) CN.on.add(fn);
  return false;
}
/** Nom imprimé d'une carte (nom anglais ou clé) dans la langue de l'appli, '' s'il n'est pas connu (index pas encore là, interface anglaise). */
const cnOf = n => { const ix = cnIx(true); return (ix && ix.fr.get(ownKey(n))) || ''; };
/** Nom affiché d'une carte : dans la langue de l'appli, sinon anglais. */
const cnName = n => cnOf(n) || n;
/** Libellé HTML (échappé) d'un résultat : le nom dans la langue de l'appli, le nom anglais en petit dessous quand il diffère. */
const cnLabel = n => { const p = cnOf(n); return p && p !== n ? `${esc(p)} <small class="ca-en">${esc(n)}</small>` : esc(n); };
/** Texte d'aide d'un champ de recherche de cartes : « Nom français ou anglais », « Nom en allemand ou en anglais »… (interface anglaise : langue des cartes). */
function cnPh() {
  const l = cnLang();
  if (l === 'fr') return T('Nom français ou anglais');
  if (l) return T('Nom en {lang} ou en anglais', { lang: (typeof LANGS !== 'undefined' && LANGS[l]) || l });
  return typeof nmT === 'function' ? nmT('Nom français ou anglais', 'Nom en {lang} ou en anglais', 'Nom de la carte') : T('Nom de la carte');
}
/** Langue de la recherche, pour les textes : celle de l'appli, sinon (interface anglaise) celle des cartes ('' : anglais seul). */
const cnTextLang = () => cnLang() || namesLang();
/** Comme nmT (collection.js) d'après cnTextLang : fr (texte d'origine), other ({lang} : allemand…), none (anglais seul ; sinon fr). */
const cnT = (fr, other, none, v) => { const l = cnTextLang(); return l === 'fr' ? T(fr, v) : l ? T(other, { ...v, lang: LANGS[l] || l }) : T(none || fr, v); };
/** Exemple des champs de saisie (« Sol Ring ou Anneau solaire », « Lightning Bolt ou Blitzschlag ») dans la langue de la recherche. */
const cnExample = () => nmExample(false, cnTextLang());
/** Les noms de la langue de recherche sont-ils là (« Aucune carte de ce nom » sans réserve) ? */
const cnHas = () => (cnLang() ? !!cnIx(true) : !!FRX.ix || !namesLang());
/** Requête normalisée (accents, casse, apostrophes, tirets : normPart) : { q, w (mots) } ou null. */
const cnQ = text => { const q = normPart(text); return q ? { q, w: q.split(' ') } : null; };
/** Rang d'un nom normalisé k : 0 nom exact · 1 commence par la requête · 2 la requête commence un mot, ou chaque mot tapé commence un mot du nom, dans n'importe quel ordre
 *  (« bolt lightning ») · 3 contient la requête (comme les filtres d'avant : « card 199 » ne trouve pas « Card 1199 ») · -1 */
function cnRank(k, Q) {
  if (!k) return -1;
  if (k === Q.q) return 0;
  if (k.startsWith(Q.q)) return 1;
  const i = k.indexOf(Q.q);
  if (i > 0) return k[i - 1] === ' ' ? 2 : 3;
  if (Q.w.length < 2) return -1;
  for (const w of Q.w) if (!k.startsWith(w) && !k.includes(' ' + w)) return -1;
  return 2;
}
/** Un des noms (texte brut) correspond-il à la requête ? (filtres de listes : correspondance n'importe où, comme avant) */
const cnHit = (Q, ...names) => names.some(s => s && cnRank(normPart(s), Q) >= 0);
/** Noms d'une rangée (n anglais, dn nom affiché, fn nom dans la langue des cartes, nm…) + celui de la langue de l'appli, normalisés une fois par index (WeakMap : rien d'ajouté aux objets). */
const CN_HAY = new WeakMap();
function cnHay(it, ix) {
  const h = CN_HAY.get(it); if (h && h.ix === ix && h.v === CN.v) return h.ks;
  const ks = [];
  for (const s of [it.n, it.dn, it.fn, it.nm, ix && ix.fr.get(it.k || ownKey(it.n))]) if (s) { const k = normPart(s); if (k && !ks.includes(k)) ks.push(k); }
  CN_HAY.set(it, { ix, v: CN.v, ks }); return ks;
}
/** La rangée it (au moins { n }) correspond-elle à la requête Q (cnQ) ? ix : cnIx(true), passé par l'appelant qui parcourt une liste. */
function cnItem(it, Q, ix) {
  const ks = cnHay(it, ix === undefined ? cnIx(true) : ix);
  for (let i = 0; i < ks.length; i++) if (cnRank(ks[i], Q) >= 0) return true;
  return false;
}
/**
 * Cartes dont le nom correspond au texte tapé, les meilleures d'abord : nom exact (toute langue), puis début du nom, puis début d'un mot, puis milieu d'un nom ;
 * à qualité égale : langue de l'appli, anglais, langue des cartes. La correspondance retenue donne la langue de l'exemplaire ajouté (p, l).
 * o.each(visit) : noms anglais candidats (visit(clé normalisée, nom anglais)) ; o.en : { list, norm } (catalogue Scryfall de collCatalog) ; sans eux : les cartes des index.
 * o.ok(k, en) : carte permise ; o.tie(k) : départage (rang EDHREC…) ; o.n : nombre de résultats (12) ; o.min : longueur minimale (2).
 * → [{ n (anglais), k, p? (nom imprimé qui correspond), l? (sa langue), r (rang 0-3) }] ; nom affiché : cnName(n).
 */
function cnFind(text, o = {}) {
  const Q = cnQ(text); if (!Q || Q.q.length < (o.min ?? 2)) return [];
  const n = o.n || 12, best = new Map(); let good = 0;
  const put = (en, k, r, tier, p, l) => {
    if (r === 3 && good >= n) return;      // assez de débuts de nom : les milieux ne passeront jamais devant
    const key = (r === 0 ? 0 : r === 3 ? 200 : 100) + r * 10 + tier, cur = best.get(k);      // qualité d'abord (début du nom > début d'un mot), langue ensuite : « llanowar » = Llanowar Elves (anglais), pas Elfes de Llanowar
    if (cur && cur.key <= key) return;
    if (o.ok && !cur && !o.ok(k, en)) return;
    if (!cur && key < 200) good++; else if (cur && cur.key >= 200 && key < 200) good++;
    best.set(k, { n: en, k, ...(p ? { p, l } : {}), r, key });
  };
  const app = cnIx(), al = cnLang(), card = FRX.ix && FRX.ix !== app ? FRX.ix : null;
  const scanIx = (ix, l, tier) => { const L = ix.list; for (let i = 0; i < L.length; i++) { const e = L[i], r = cnRank(e.k, Q); if (r >= 0) put(e.en, ownKey(e.en), r, tier, e.n, l); } };
  if (app) scanIx(app, al, 0);
  if (o.each) o.each((k, en) => { const r = cnRank(k, Q); if (r >= 0) put(en, ownKey(en), r, 1); });
  else if (o.en) { const { list, norm } = o.en; for (let i = 0; i < norm.length; i++) { const r = cnRank(norm[i], Q); if (r >= 0) put(list[i], ownKey(list[i]), r, 1); } }
  if (card) scanIx(card, FRX.l, 2);
  const tie = o.tie || (() => 0);
  return [...best.values()].sort((a, b) => a.key - b.key || tie(a.k) - tie(b.k) || (a.p || a.n).length - (b.p || b.n).length || NAME_CMP(a.p || a.n, b.p || b.n)).slice(0, n);
}
/** Nom anglais d'un nom tapé en entier (langue de l'appli, langue des cartes ou anglais d'un catalogue), sinon '' : champs sans liste (alertes…). */
function cnToEn(name, cat) {
  const k = ownKey(name); if (!k) return '';
  const f = nmLookup(name, [cnLang()]); if (f && f.en) return f.en;
  if (cat && cat.norm) { const i = cat.norm.indexOf(k); if (i >= 0) return cat.list[i]; }
  return '';
}
/* Un champ de recherche touché : l'index de la langue de l'appli se charge déjà (la première frappe trouve le plus souvent les noms traduits). */
if (typeof document !== 'undefined') document.addEventListener('focusin', e => { const t = e.target; if (t && t.matches && t.matches('input[type="search"], input[data-cn]')) cnLoad(); }, true);
