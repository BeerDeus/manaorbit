/* ── cardsheet.js : fiche d'une carte (toucher une ligne de la collection, de l'Échange ou du scan) ─────────────────────────────
   openCardSheet(k, { l, from, n }) : k = clé de collection (ownKey) ; l = ligne visée (clé de ligne 'fr|cmm|400*', ou une langue 'fr') ;
   from = 'coll' | 'trade' | 'scan' | 'deck' (d'où elle s'ouvre) ; n = nom anglais d'une carte qui n'est pas (ou plus) dans la collection.
   Feuille du bas sur téléphone (openSheet : glisser pour fermer, Retour, Échap), fenêtre centrée sur ordinateur (zz-desktop.css).
   Tout passe par les fonctions de la liste : collBump (− / +, ici avec « Annuler » plutôt qu'une confirmation à chaque −), collEdPick (rond d'édition),
   cexSheet (emplacement et état), collSetLang (langue), trChanged (« Garder »), alWatch (suivre le prix), putDeck (ajouter à un deck).
   Prix : tendance Cardmarket (Scryfall) normal et foil de l'édition de chaque ligne (COLL.ed), sinon de la carte (COLL.meta) ; offre CardTrader : COLL.px
   (lue à la demande, une carte, comme le prix rapide du scan). Historique : prix « à partir de » des 30 derniers jours (serveur, GET /api/hist : relevé quotidien
   gardé par la GitHub Action des prix, prices-hist.mjs), lu à l'ouverture et gardé 6 h : courbe, variation sur 7 et 30 jours, plus bas et plus haut ; sans
   serveur, hors ligne sans copie ou moins de 2 relevés : la variation connue (prix de référence de la semaine d'avant, VAL.base). Relevé du serveur des alertes en plus.
   Texte Oracle et légalités : Scryfall /cards/named (+ texte imprimé dans la langue de la carte), lus à l'ouverture, gardés 7 jours ; hors ligne sans copie : section absente. */
const CS = { api: null, k: '', o: {}, n: '', g: '', m: null, or: undefined, h: undefined, hw: 0, srv: null, srvAt: 0, ct: '', ctErr: '', t: 0 };
const CS_FMT = [['standard', 'Standard'], ['pioneer', 'Pioneer'], ['modern', 'Modern'], ['legacy', 'Legacy'], ['vintage', 'Vintage'], ['pauper', 'Pauper'], ['commander', 'Commander'], ['oathbreaker', 'Oathbreaker'], ['brawl', 'Brawl'], ['historic', 'Historic']];      // noms des formats : tels quels dans toutes les langues
const CS_LEGAL = { legal: T('Légale'), not_legal: T('Non légale'), banned: T('Interdite'), restricted: T('Restreinte') };
const CS_RAR = { common: T('Commune'), uncommon: T('Peu commune'), rare: T('Rare'), mythic: T('Mythique'), special: T('Spéciale') };
const CS_OR_TTL = 7 * DAY;      // texte et légalités : une interdiction peut tomber dans la semaine

/** Ligne visée : la clé exacte, sinon la première ligne de cette langue, sinon la plus fournie ; '' si la carte n'est pas possédée. */
function csLine(k, l) {
  const ls = collLines(COLL.map[k]); if (!ls.length) return '';
  if (l != null && ls.some(([g]) => g === l)) return l;
  const sameL = l != null ? ls.find(([g]) => lineLang(g) === l) : null;
  return sameL ? sameL[0] : collDomLang(ls);
}
/** Infos Scryfall de la carte : collection, cartes des decks (dmOf), sinon celles lues pour cette fiche. */
const csMeta = k => COLL.meta[k] || (typeof dmOf === 'function' ? dmOf(k) : null) || (CS.k === k ? CS.m : null) || null;
const csOpen = () => !!CS.api && sheets.includes(CS.api);
/** Repeint la fiche ouverte (collChanged l'appelle : − / +, édition, emplacement, langue, et tout autre changement de la collection). */
function csSoon() { if (!csOpen()) return; clearTimeout(CS.t); CS.t = setTimeout(csPaint, 0); }

function openCardSheet(k, opts) {
  const o = opts || {}; k = String(k || ''); if (!k) return null;
  if (csOpen()) CS.api.close();
  const x = COLL.map[k], n = (x && x.n) || o.n || (TR.wish[k] || {}).n || k;
  Object.assign(CS, { k, o, n, g: csLine(k, o.l), m: null, or: undefined, h: undefined, srv: null, srvAt: 0, ct: '', ctErr: '' });
  const l = CS.g ? lineLang(CS.g) : (o.l && !String(o.l).includes('|') ? o.l : ''), dn = frName(k, l) || n, other = dn !== n ? n : frOf(k) || '';
  haptic('tap');
  CS.api = openSheet(dn, other !== dn ? other : '', api => {
    api.wrap.classList.add('cs-sheet');
    api.body.addEventListener('load', e => { if (e.target.tagName === 'IMG') e.target.classList.add('ok'); }, true);
    api.body.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.remove(); }, true);
    api.body.addEventListener('click', csClick);
    api.body.addEventListener('change', csChange);
  });
  csPaint();
  setIcLoad(csSoon);      // symboles des extensions : repeint dès qu'ils arrivent
  csLoad(k);
  requestAnimationFrame(() => { const on = CS.api && $('.cs-ln.on', CS.api.body); if (on && on.scrollIntoView && collLines(COLL.map[k]).length > 3) on.scrollIntoView({ block: 'nearest' }); });
  return CS.api;
}

/** Lectures de la fiche, en parallèle, chacune repeint à son arrivée : infos de la carte (carte pas encore dans la collection), prix des éditions,
 *  prix de référence de la semaine d'avant (variation), historique des 30 jours, relevé du serveur des alertes (carte suivie), texte et légalités. */
function csLoad(k) {
  const mine = () => csOpen() && CS.k === k, x = COLL.map[k];
  if (!csMeta(k) && !collOffline() && scryLeft() <= 0) scryCollection([CS.n], undefined, undefined, true).then(r => { if (mine()) { CS.m = r.get(k) || null; csPaint(); } }, () => {});
  if (x && collLines(x).some(([g]) => lineEd(g) && !COLL.ed[lineEd(g)])) Promise.resolve(edRefresh()).then(() => { if (mine()) csPaint(); }, () => {});
  if (typeof valLoad === 'function' && !VAL.base) valLoad().then(() => { if (mine()) csPaint(); });
  csSrvLoad(k);
  csHist(k, CS.n).then(h => { if (mine()) { CS.h = h; csPaint(); } }, () => { if (mine()) { CS.h = null; csPaint(); } });
  const g = CS.g, l = g ? lineLang(g) : (CS.o.l && !String(CS.o.l).includes('|') ? CS.o.l : '');
  csOracle(k, CS.n, l, g ? lineEd(g) : '').then(r => { if (mine()) { CS.or = r; csPaint(); } }, () => { if (mine()) { CS.or = null; csPaint(); } });
}
/** Relevé du serveur des alertes pour une carte suivie (prix du dernier passage, prix habituel = médiane des relevés d'avant). */
function csSrvLoad(k) {
  if (!AC.on || !AC.id || !AC.watch[k] || !alAvail() || collOffline()) return;
  ct('alerts', { params: { id: AC.id } }).then(j => { const p = j && j.prices && j.prices[k]; if (csOpen() && CS.k === k && p && p.c > 0) { CS.srv = p; CS.srvAt = (j.last && j.last.at) || 0; csPaint(); } }, () => {});
}

/* ── Texte Oracle et légalités (Scryfall) ──────────────────────────────────────────────────────── */
const csFaces = c => (Array.isArray(c.card_faces) && c.card_faces.length > 1 && !c.oracle_text ? c.card_faces : [c]);
const csPrinted = c => !!c && csFaces(c).some(f => f.printed_text);
const SCRY_URI_RE = /^https:\/\/scryfall\.com\/card\/[\w./%-]+(\?[\w=&%-]*)?$/;
/** { en: [{ n, tl, mc, t }] (faces), loc?: { l, f: [{ n, tl, t }] } (texte imprimé dans la langue l), lg (légalités), r (rareté), set, sn, num, uri } ; null hors ligne sans copie. */
async function csOracle(k, name, l, e) {
  const sl = l && l !== 'en' && SCRY_LANG[l] ? SCRY_LANG[l] : '', key = 'or1:' + k + ':' + (sl ? sl + ':' + (e || '') : 'en');
  const hit = await Cache.get(key, CS_OR_TTL); if (hit) return hit;
  if (collOffline() || scryLeft() > 0) return null;
  const nm = String(name || '').split('//')[0].trim(), get = async url => { try { return await httpJson(limScry, url, SCRY_JSON, undefined, 1, true); } catch (x) { if (x.code === '404') return null; throw x; } };
  const j = await get('https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(nm)); if (!j || !j.name) return null;
  const out = { en: csFaces(j).map(f => ({ n: String(f.name || ''), tl: String(f.type_line || ''), mc: String(f.mana_cost || ''), t: String(f.oracle_text || '') })), lg: j.legalities && typeof j.legalities === 'object' ? j.legalities : {},
    r: String(j.rarity || ''), set: String(j.set || ''), sn: String(j.set_name || ''), num: String(j.collector_number || ''), uri: SCRY_URI_RE.test(j.scryfall_uri || '') ? j.scryfall_uri : '' };
  if (sl) {      // texte imprimé : l'impression de la ligne (édition connue), sinon la plus récente dans cette langue
    let c = e ? await get('https://api.scryfall.com/cards/' + encodeURIComponent(edSet(e)) + '/' + encodeURIComponent(edNum(e)) + '/' + sl).catch(() => null) : null;
    if (!csPrinted(c)) { const s = await get('https://api.scryfall.com/cards/search?q=' + encodeURIComponent('!"' + nm + '" lang:' + sl) + '&unique=prints&order=released').catch(() => null); c = ((s && s.data) || []).find(csPrinted) || null; }
    if (c) out.loc = { l, f: csFaces(c).map(f => ({ n: String(f.printed_name || ''), tl: String(f.printed_type_line || ''), t: String(f.printed_text || '') })) };
  }
  await Cache.set(key, out);
  return out;
}
const csText = s => esc(s).replace(/\n/g, '<br>');
function csOracleHtml() {
  const r = CS.or; if (r === null) return '';      // hors ligne sans copie, ou Scryfall injoignable : la section n'apparaît pas
  if (r === undefined) return collOffline() ? '' : `<section class="cs-sec cs-or" aria-busy="true"><h3 class="cs-h">${T('Texte et légalités')}</h3><p class="hint">${T('Lecture sur Scryfall…')}</p></section>`;
  const face = (f, en) => `<div class="cs-face">${f.n && (r.en.length > 1 || !en) ? `<b>${esc(f.n)}</b>` : ''}${f.tl ? `<small>${esc(f.tl)}${en && f.mc ? ' · ' + esc(f.mc) : ''}</small>` : ''}${f.t ? `<p>${csText(f.t)}</p>` : ''}</div>`;
  const loc = r.loc && r.loc.f.some(f => f.t) ? `<div class="cs-txt" lang="${esc(SCRY_LANG[r.loc.l] || r.loc.l)}"><span class="cs-tl">${flag(r.loc.l)}${esc(T('Texte imprimé'))}</span>${r.loc.f.map(f => face(f, false)).join('')}</div>` : '';
  const en = r.en.some(f => f.t || f.tl) ? `<div class="cs-txt" lang="en"><span class="cs-tl">${flag('en')}${esc(T('Oracle (anglais)'))}</span>${r.en.map(f => face(f, true)).join('')}</div>` : '';
  const lg = CS_FMT.filter(([f]) => r.lg[f]).map(([f, name]) => { const s = CS_LEGAL[r.lg[f]] ? r.lg[f] : 'not_legal'; return `<span class="cs-lgi ${s}"><b>${name}</b><small>${esc(CS_LEGAL[s])}</small></span>`; }).join('');
  if (!loc && !en && !lg) return '';
  return `<section class="cs-sec cs-or"><h3 class="cs-h">${T('Texte et légalités')}</h3>${loc}${en}${lg ? `<div class="cs-lg" role="list" aria-label="${esc(T('Légalités par format'))}">${lg}</div>` : ''}</section>`;
}

/* ── Sections ───────────────────────────────────────────────────────────────────────────────────── */
function csHeadHtml(k, x, m) {
  const g = CS.g, l = g ? lineLang(g) : '', e = g ? lineEd(g) || (collLines(x).map(([h]) => lineEd(h)).find(Boolean) || '') : '', f = g ? lineFoil(g) : false;
  const im = x ? collLineImage(k, g, m && m.im).src : (m && m.im) || '', nm = frName(k, l) || CS.n, hue = hash32(k) % 360;
  const set = e ? edSet(e) : '', sn = set ? setName(set) || (COLL.ed[e] || {}).sn || '' : '', r = (e && (COLL.ed[e] || {}).r) || (CS.or && CS.or.r) || '';
  const ls = collLines(x), langs = langLines(ls).length, loc = CS.or && CS.or.loc && CS.or.loc.l === l ? CS.or.loc.f[0] : null, tl = (loc && loc.tl) || (m && m.tl) || '';      // type imprimé dans la langue de la carte, sinon l'anglais
  const sum = x ? TN(x.q, '{n} exemplaire', '{n} exemplaires') + (langs > 1 ? ' · ' + TN(langs, '{n} langue', '{n} langues') : '') : T('Pas dans ta collection');
  return `<div class="cs-hd"><button type="button" class="cs-img thumb${f ? ' foil' : ''}" data-cs="zoom" style="--h:${hue}" aria-label="${esc(T('Agrandir {name}', { name: nm }))}">${esc((nm.trim()[0] || '?').toUpperCase())}${im ? `<img alt="" decoding="async" src="${esc(im)}">` : ''}</button>
    <div class="cs-ht">${set ? `<span class="cs-ext">${setIcHtml(set) || `<span class="ed-code">${esc(set.toUpperCase())}</span>`}<span>${esc([sn, edLabel(e)].filter(Boolean).join(' · '))}</span></span>` : ''}
      ${r ? `<span class="tag cs-rar ${esc(r)}">${esc(CS_RAR[r] || r)}</span>` : ''}${tl ? `<span class="cs-tline">${esc(tl)}</span>` : ''}
      <span class="cs-sum">${esc(sum)}</span></div></div>`;
}
function csLinesHtml(k, x) {
  const ls = collLines(x), name = CS.n;
  const rows = ls.map(([g, q]) => {
    const l = lineLang(g), e = lineEd(g), f = lineFoil(g), sn = e ? setName(edSet(e)) || (COLL.ed[e] || {}).sn || '' : '', u = collLineEu(k, g), nm = frName(k, l) || x.n;
    const tagline = [langCode(l) || T('sans langue'), e ? edLabel(e) : '', f ? T('Foil') : ''].filter(Boolean).join(' · ');
    return `<div class="cs-ln${g === CS.g ? ' on' : ''}" data-g="${esc(g)}" role="group" aria-label="${esc(tagline + ' · ' + TN(q, '{n} exemplaire', '{n} exemplaires'))}">
      ${langChip(k, l, x.n, 'cs-lc', g)}
      <span class="cs-lt"><b><span>${esc(e ? sn || edLabel(e) : T('Sans édition'))}</span>${f ? `<span class="tag foil">✦ ${T('Foil')}</span>` : ''}</b><small>${esc([e && sn ? edLabel(e) : '', u > 0 ? T('{p} pièce', { p: fmt(u, mkCur()) }) : T('sans prix')].filter(Boolean).join(' · '))}</small></span>
      <span class="cs-lp">${plcRowTag(g) || `<button type="button" class="tag plc add" data-act="cex">${esc(T('Ranger, état…'))}</button>`}</span>
      ${edBtn({ e, f }, nm)}
      <span class="qstep"><button type="button" data-cs="dec" aria-label="${esc(T('Retirer un exemplaire de {name}', { name: nm }))}">−</button><b>${q}</b><button type="button" data-cs="inc" aria-label="${esc(T('Ajouter un exemplaire de {name}', { name: nm }))}">+</button></span></div>`;
  }).join('');
  return `<section class="cs-sec"><h3 class="cs-h">${T('Mes exemplaires')}</h3>${rows || `<p class="hint">${esc(T('Aucun exemplaire dans ta collection.'))}</p>`}
    ${CS.o.from === 'scan' ? '' : `<button type="button" class="btn ghost block cs-add" data-cs="add"><svg class="i" aria-hidden="true"><use href="#i-plus"/></svg>${T('Ajouter un exemplaire')}</button>`}</section>`;      // depuis le scan : les cartes lues arrivent par « Ajouter » du scan (édition, « Ranger dans », deck, lot), pas d'ici
}
/** Variation connue du prix de référence Cardmarket : celui de la période précédente (value.js, 7 à 14 jours) face à celui d'aujourd'hui ; null sans point de comparaison. */
function csMove(k) {
  if (typeof VAL === 'undefined') return null;
  const ref = baseRef(VAL.base), m = COLL.meta[k]; if (!ref || !ref.p || !m || VAL.at - ref.t < VAL_EVERY) return null;
  const u0 = ref.p[k], u1 = m.eu; return u0 > 0 && u1 > 0 ? { u0, u1, t: ref.t, d: u1 - u0, pct: (u1 - u0) / u0 * 100 } : null;
}
/* ── Historique des prix « à partir de » (30 jours) ────────────────────────────────────────────── */
const CS_H_TTL = 6 * 3600e3;      // le serveur relit l'historique toutes les 6 h (un relevé par jour)
/** Relevés quotidiens de la carte : { d: premier jour (ms, UTC), e: [centimes | null] } ; null sans serveur, hors ligne sans copie, ou panne (503 : pas encore
 *  d'historique). Gardés 6 h (mémoire et appareil : Cache), carte inconnue du relevé comprise (e vide). */
async function csHist(k, n) {
  const key = 'ph1:' + k, hit = await Cache.get(key, CS_H_TTL); if (hit) return hit;
  if (!CTX.proxy || collOffline()) return null;
  const r = await fetch('api/hist?' + new URLSearchParams({ n: String(n || k).slice(0, 150) }), { headers: { Accept: 'application/json' } });
  if (!r.ok) return null;
  const j = await r.json(), d = Date.parse(String(j && j.d) + 'T00:00:00Z'), col = mkUs() ? j && j.u : j && j.e; if (!Number.isFinite(d) || !Array.isArray(col)) return null;      // marché TCGplayer : relevés en dollars (u)
  const out = { d, e: col.slice(0, 400).map(v => (Number(v) > 0 ? Math.round(Number(v)) : null)) };
  await Cache.set(key, out); return out;
}
/** Jours qui ont un prix : [{ t, v }] ; null sous 2 relevés (la variation connue reste alors). */
function csHistPts(h) {
  if (!h || !Array.isArray(h.e)) return null;
  const pts = []; h.e.forEach((v, i) => { if (v > 0) pts.push({ t: h.d + i * DAY, v }); });
  return pts.length >= 2 ? pts : null;
}
/** Courbe (même dessin que la valeur de la collection, value.js : SVG à l'échelle, min / max réels, temps proportionnel), à la largeur réelle de la fiche (W). */
function csHistSvg(pts, W) {
  W = Math.max(240, Math.round(W || 320)); const H = Math.round(Math.max(112, Math.min(150, W * 0.34)));
  const pl = 8, pr = 8, pt = 16, pb = 20, vs = pts.map(x => x.v), min = Math.min(...vs), max = Math.max(...vs), t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const pad = (max - min) * 0.14 || max * 0.03 || 1, lo = min - pad, hi = max + pad, f = n => n.toFixed(1);
  const X = t => pl + (W - pl - pr) * (t1 > t0 ? (t - t0) / (t1 - t0) : 1), Y = v => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo));
  const xy = pts.map(x => f(X(x.t)) + ',' + f(Y(x.v))), last = pts[pts.length - 1], grid = max === min ? [max] : [max, min];
  return `<svg class="vl-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T('Prix « à partir de » du {d0} au {d1} : de {v0} à {v1}', { d0: valDate(t0), d1: valDate(t1), v0: fmt(pts[0].v, mkCur()), v1: fmt(last.v, mkCur()) }))}">
    ${grid.map((v, i) => `<line x1="${pl}" x2="${W - pr}" y1="${f(Y(v))}" y2="${f(Y(v))}" class="vl-grid"/><text x="${pl}" y="${f(Y(v) + (i ? 11 : -4))}" class="vl-txt">${esc(fmt(v, mkCur()))}</text>`).join('')}
    <path d="M${f(X(t0))},${f(H - pb)} L${xy.join(' L')} L${f(X(t1))},${f(H - pb)} Z" class="vl-area"/><polyline points="${xy.join(' ')}" class="vl-line" fill="none"/>
    <circle cx="${f(X(last.t))}" cy="${f(Y(last.v))}" r="3.4" class="vl-dot"/>
    <text x="${pl}" y="${H - 5}" class="vl-txt">${esc(valDate(t0))}</text><text x="${W - pr}" y="${H - 5}" class="vl-txt" text-anchor="end">${esc(valDate(t1))}</text></svg>`;
}
/** Variation sur 7 jours (relevé d'au moins 7 jours avant le dernier ; sinon pas encore de recul) et sur toute la période (30 jours au plus), plus bas, plus haut. */
function csHistStats(pts) {
  const last = pts[pts.length - 1], d = from => (from && from.t < last.t ? { d: last.v - from.v, pct: from.v > 0 ? (last.v - from.v) / from.v * 100 : null, from } : null);
  let w7 = null; for (const x of pts) if (x.t <= last.t - 7 * DAY) w7 = x;
  let lo = pts[0], hi = pts[0]; for (const x of pts) { if (x.v < lo.v) lo = x; if (x.v > hi.v) hi = x; }
  return { d7: d(w7), dAll: d(pts[0]), days: Math.round((last.t - pts[0].t) / DAY), lo, hi };
}
/** Section de la courbe ; '' sous 2 relevés (la variation connue s'affiche à la place). */
function csHistHtml() {
  const pts = csHistPts(CS.h); if (!pts || typeof valDeltaHtml !== 'function') return '';
  const s = csHistStats(pts), allLab = s.days >= 28 ? TN(30, '{n} jour', '{n} jours') : TN(s.days, '{n} jour', '{n} jours');
  return `<div class="cs-hist"><div class="cs-hh"><b>${esc(T('Évolution du prix'))}</b><small>${esc(T('Tendance Cardmarket'))}</small></div>
    <div class="cs-hc">${csHistSvg(pts, CS.hw)}</div>
    <div class="vl-ds">${valDeltaHtml(esc(TN(7, '{n} jour', '{n} jours')), s.d7)}${valDeltaHtml(esc(allLab), s.dAll)}</div>
    <p class="cs-hmm"><span>${esc(T('Plus bas {p} le {d}', { p: fmt(s.lo.v, mkCur()), d: valDate(s.lo.t) }))}</span><span>${esc(T('Plus haut {p} le {d}', { p: fmt(s.hi.v, mkCur()), d: valDate(s.hi.t) }))}</span></p>
    <p class="hint">${esc(T('Prix « à partir de » : l\'impression la moins chère de la carte, non foil. Une édition précise ou un foil peut valoir bien plus.'))}</p></div>`;
}
/** Courbe redessinée à la largeur réelle de la fiche (un pixel du dessin = un pixel de l'écran : textes à leur taille sur téléphone comme sur ordinateur). */
function csHistFit() {
  const s = CS.api && $('.cs-hc .vl-svg', CS.api.body); if (!s) return;
  const w = Math.round(s.getBoundingClientRect().width); if (!w || Math.abs(w - CS.hw) < 2) return;
  CS.hw = w; const pts = csHistPts(CS.h); if (pts) s.outerHTML = csHistSvg(pts, w);
}
function csPxHtml(k, x, m) {
  const eds = x ? [...new Set(collLines(x).map(([g]) => lineEd(g)))] : [''], cell = (v, wait, cls) => `<span class="px cm${cls ? ' ' + cls : ''}${wait || !(v > 0) ? ' none' : ''}"><b>${wait ? '…' : v > 0 ? esc(fmt(v, mkCur())) : '—'}</b></span>`;
  const rows = eds.map(e => {
    const d = e ? COLL.ed[e] : m, wait = e ? !d : !m, set = edSet(e), sn = e ? setName(set) || (d || {}).sn || '' : '';
    const lab = e ? `${setIcHtml(set) || `<span class="ed-code">${esc(set.toUpperCase())}</span>`}<span>${esc(sn || edLabel(e))}${sn ? `<small>${esc(edLabel(e))}</small>` : ''}</span>` : `<span>${esc(eds.length > 1 ? T('Sans édition') : T('Carte'))}<small>${esc(T('impression la moins chère'))}</small></span>`;
    return `<div class="cs-pr" role="row"><span class="cs-pn" role="cell">${lab}</span>${cell(d && d.eu, wait)}${cell(d && d.ef, wait, 'foil')}</div>`;
  }).join('');
  const px = COLL.px[k], canCt = !!x && !mkUs() && !BASIC_NAMES.has(k) && !S.demo && (CTX.proxy || !!S.token) && !collOffline();      // hors ligne : seulement l'offre déjà lue
  const ctv = CS.ct === 'run' ? `<span class="cs-ctv"><span class="cs-spin" aria-hidden="true"></span>${esc(T('Lecture…'))}</span>`
    : px && Number.isFinite(px.p) ? `<span class="cs-ctv"><b>${esc(fmt(px.p, px.c || 'EUR'))}</b><small>${esc(pxAgo(px.t))}</small></span>`
    : px && px.p === null && px.t ? `<span class="cs-ctv"><b>${esc(T('aucune offre'))}</b><small>${esc(pxAgo(px.t))}</small></span>` : '';
  const ctBtn = canCt && CS.ct !== 'run' && (!px || Date.now() - px.t > PX_TTL || !ctv) ? `<button type="button" class="btn ghost small" data-cs="ct">${esc(T('Voir les offres'))}</button>` : '';
  const ct = canCt || ctv ? `<div class="cs-ct"><span class="px ct"><i>CT</i></span><span class="cs-ctl"><b>CardTrader</b><small>${esc(T('offre la moins chère · {lang}', { lang: langCode(pxLangOf(x || {})) }))}</small></span>${ctv}${ctBtn}</div>${CS.ct === 'err' && CS.ctErr ? `<p class="hint warn">${esc(CS.ctErr)}</p>` : ''}` : '';
  const v = x ? collCardVal(k) : 0, mv = csMove(k), hist = csHistHtml();
  const move = hist ? hist : mv ? `<p class="cs-mv ${mv.d > 0 ? 'vu' : 'vd'}">${esc(T('Depuis le {d} : {a} → {b}', { d: valDate(mv.t), a: fmt(mv.u0, mkCur()), b: fmt(mv.u1, mkCur()) }))} <b>${mv.d > 0 ? '▲' : '▼'} ${esc(valPct(mv.pct))}</b></p>`
    : x ? `<p class="hint">${esc(T('Variation du prix : connue après une semaine de relevés.'))}</p>` : '';
  const srv = CS.srv ? `<p class="hint">${esc(T('Relevé des alertes {when} : {c}', { when: CS.srvAt ? relTime(CS.srvAt) : '', c: fmt(CS.srv.c, mkCur()) }))}${CS.srv.b > 0 ? ' · ' + esc(T('habituel {b}', { b: fmt(CS.srv.b, mkCur()) })) : ''}</p>` : '';
  return `<section class="cs-sec"><h3 class="cs-h">${T('Prix')}</h3>
    <div class="cs-pt" role="table" aria-label="${esc(T('Tendance Cardmarket'))}"><div class="cs-pr cs-ph" role="row"><span role="columnheader">${T('Tendance Cardmarket')}</span><span role="columnheader">${T('Normal')}</span><span role="columnheader">${T('Foil')} ✦</span></div>${rows}</div>
    ${ct}${v > 0 ? `<div class="cs-val"><span>${esc(TN(x.q, 'Valeur de ton exemplaire', 'Valeur de tes {n} exemplaires'))}</span><b>${esc(fmt(v, mkCur()))}</b></div>` : ''}${move}${srv}</section>`;
}
/** Decks de « Mes decks » qui contiennent la carte : [{ id, n, q (deck, commandant compris), sq (réserve), on (monté), held (exemplaires réservés), fk (format) }]. */
function csDecks(k) {
  const out = [];
  for (const d of allDecks()) {
    const q = csDeckQty(d.text, k); if (!q.q && !q.sq) continue;
    out.push({ id: d.id, n: d.name, ...q, on: typeof engIsOn === 'function' && engIsOn(d.id), held: (typeof XS !== 'undefined' && XS.eng[d.id] && XS.eng[d.id].q[k]) || 0, fk: dkFmtOf(d.text) });
  }
  return out;
}
function csDeckQty(text, k) {
  const pd = parseDeck(text), c = [...pd.cards, ...pd.basics].find(y => ownKey(y.key) === k), s = dkSideCards(text).find(y => y.key === k);
  return { q: c ? c.qty : 0, sq: s ? s.qty : 0 };
}
function csDecksHtml(k) {
  const ds = csDecks(k);
  const rows = ds.map(d => `<button type="button" class="cs-dk" data-cs="deck" data-id="${esc(d.id)}"><span class="cs-dkt"><b>${esc(d.n)}</b><small>${esc([d.fk ? DK_FORMATS[d.fk].label : '', d.q ? '× ' + nf0(d.q) : '', d.sq ? T('réserve × {n}', { n: nf0(d.sq) }) : ''].filter(Boolean).join(' · '))}</small></span>${d.on ? `<span class="tag mount">${esc(d.held ? TN(d.held, 'monté · {n} réservée', 'monté · {n} réservées') : T('monté'))}</span>` : ''}<svg class="i" aria-hidden="true"><use href="#i-chev"/></svg></button>`).join('');
  return `<section class="cs-sec"><h3 class="cs-h">${T('Utilisée dans')}</h3>${rows ? `<div class="cs-dks">${rows}</div>` : `<p class="hint">${esc(T('Dans aucun de tes decks.'))}</p>`}</section>`;
}
/** Échange : exemplaires proposés (tradeLists de cette seule carte : decks, réserve, règles des rangements), gardée à la main, « Je recherche ». null : terrain de base. */
function csTrade(k, x) {
  if (BASIC_NAMES.has(k) || typeof TR === 'undefined') return null;
  const use = deckUse(trDeckTexts()), one = x ? { [k]: x } : {}, tl = tradeLists(one, use, TR.keep, TR.kept, COLL.places);
  const w = tradeWant(one, new Map(use.has(k) ? [[k, use.get(k)]] : []), TR.wish[k] ? { [k]: TR.wish[k] } : {})[0] || null;
  return { have: tl.have[0] || null, held: tl.held[0] || null, kept: TR.kept.has(k), want: w };
}
function csTradeHtml(k, x) {
  const t = csTrade(k, x); if (!t) return '';
  const ll = t.have ? langLines(t.have.lines) : [];
  const offer = t.have ? `<p class="cs-tr"><b>${esc(TN(t.have.q, '{n} exemplaire proposé', '{n} exemplaires proposés'))}</b>${ll.map(([l, q]) => `<span class="tag">${l ? flag(l) : esc(T('sans langue'))}${ll.length > 1 ? ' × ' + q : ''}</span>`).join('')}</p>`
    : t.held ? `<p class="cs-tr">${esc(TN(t.held.q, '{n} exemplaire en trop, gardé', '{n} exemplaires en trop, gardés'))}</p>`
    : x ? `<p class="hint">${esc(T('Aucun exemplaire en trop : tes decks et ta réserve ({n}) les gardent.', { n: nf0(TR.keep) }))}</p>` : '';
  const sw = t.have || t.held || t.kept ? `<label class="switch-row cs-keep"><span class="t"><b>${T('Garder')}</b><span class="hint">${esc(T('Ne pas la proposer à l\'échange'))}</span></span><span class="switch"><input type="checkbox" data-cs="keep"${t.kept ? ' checked' : ''} aria-label="${esc(T('Garder'))}"><i></i></span></label>` : '';
  const want = t.want ? `<p class="cs-tr"><span class="tag accent">${esc(T('Je recherche'))} × ${nf0(t.want.q)}</span>${t.want.d ? `<span class="tag warn">${esc(T('manque à tes decks'))}${t.want.d > 1 ? ' × ' + t.want.d : ''}</span>` : ''}${t.want.w ? `<span class="tag">${esc(T('souhait'))}${t.want.w > 1 ? ' × ' + t.want.w : ''}</span>` : ''}</p>` : '';
  if (!offer && !sw && !want) return '';
  return `<section class="cs-sec"><h3 class="cs-h">${T('Échange')}</h3>${offer}${sw}${want}</section>`;
}
function csActsHtml(k, x) {
  const al = alAvail(), w = AC.watch[k];
  const watch = al ? `<button type="button" class="btn ghost small${w ? ' on' : ''}" data-cs="watch" aria-pressed="${!!w}"><svg class="i" aria-hidden="true"><use href="#i-coin"/></svg>${esc(w ? (w.u ? T('Prix suivi : hausse et baisse') : T('Prix suivi : baisse')) : T('Suivre le prix'))}</button>` : '';
  const px = COLL.px[k], bp = px && px.b > 0 ? px.b : 0;
  return `<section class="cs-sec"><h3 class="cs-h">${T('Actions')}</h3><div class="cs-acts">${watch}
    <button type="button" class="btn ghost small" data-cs="adddeck"><svg class="i" aria-hidden="true"><use href="#i-layers"/></svg>${T('Ajouter à un deck')}</button>
    <a class="btn ghost small" href="${esc(mkUrl(CS.n, userLang()))}" target="_blank" rel="noopener noreferrer">${mkName()} ↗</a>
    ${bp ? `<a class="btn ghost small" href="${esc(ctCardUrl(bp))}" target="_blank" rel="noopener noreferrer">CardTrader ↗</a>` : ''}
    <button type="button" class="btn ghost small" data-cs="share"><svg class="i" aria-hidden="true"><use href="#i-share"/></svg>${T('Partager')}</button></div>
    ${!al ? `<p class="hint">${esc(S.demo ? T('Suivre le prix : indisponible en mode démo.') : T('Suivre le prix : il faut le serveur Mana Orbit et les notifications.'))}</p>` : ''}</section>`;
}
function csPaint() {
  if (!csOpen()) return;
  const k = CS.k, x = COLL.map[k], api = CS.api, body = api.body, m = csMeta(k);
  if (CS.g && !(x && collLines(x).some(([g]) => g === CS.g))) CS.g = csLine(k, lineLang(CS.g));      // ligne fusionnée ou retirée : la ligne de la même langue, sinon la plus fournie
  const ae = document.activeElement, ar = ae && body.contains(ae) ? ae.closest('[data-g]') : null, top = body.scrollTop;
  const focus = ae && body.contains(ae) ? { g: ar ? ar.dataset.g : null, cs: ae.dataset.cs || '', act: ae.dataset.act || '', id: ae.dataset.id || '' } : null;
  body.innerHTML = csHeadHtml(k, x, m) + csLinesHtml(k, x) + csPxHtml(k, x, m) + csDecksHtml(k) + csTradeHtml(k, x) + csActsHtml(k, x) + csOracleHtml();
  csHistFit();
  body.scrollTop = top;
  if (focus) {      // focus clavier rendu à son équivalent après le repeint (le bouton touché, dans la même ligne)
    const row = focus.g != null ? $$('[data-g]', body).find(r => r.dataset.g === focus.g) : null, scope = row || body;
    const sel = focus.cs ? `[data-cs="${focus.cs}"]${focus.id ? `[data-id="${CSS.escape(focus.id)}"]` : ''}` : focus.act ? `[data-act="${focus.act}"]` : '';
    const el = sel && $(sel, scope); if (el) el.focus({ preventScroll: true });
  }
}

/* ── Gestes ─────────────────────────────────────────────────────────────────────────────────────── */
function csClick(e) {
  const k = CS.k, x = COLL.map[k], row = e.target.closest('.cs-ln'), g = row ? row.dataset.g : '';
  if (e.target.closest('.lchip')) return;
  const b = e.target.closest('[data-cs],[data-act]'); if (!b) return;
  const cs = b.dataset.cs, act = b.dataset.act;
  if (act === 'ed' && row) { collEdPick(k, g); return; }      // rond d'édition : la feuille d'édition de la liste (foil compris)
  if (act === 'cex' && row) { cexSheet('map', k, g); return; }      // emplacement et état : la fiche d'exemplaire du Rangement
  if (cs === 'inc' && row) { haptic('tap'); CS.g = g; collBump(k, x.n, 1, { lang: g }); return; }
  if (cs === 'dec' && row) { csMinus(k, g); return; }
  if (cs === 'zoom') { csZoom(k); return; }
  if (cs === 'add') { csAddSheet(k); return; }
  if (cs === 'deck') { haptic('tap'); const id = b.dataset.id; while (sheets.length) sheets[sheets.length - 1].close(); setTimeout(() => openDeckViewer({ id }), reduceMotion() ? 0 : 200); return; }
  if (cs === 'adddeck') { csDeckPick(k); return; }
  if (cs === 'watch') { csWatch(k, b); return; }
  if (cs === 'ct') { csCtRead(k); return; }
  if (cs === 'share') { haptic('tap'); const u = (CS.or && CS.or.uri) || 'https://scryfall.com/search?q=' + encodeURIComponent('!"' + CS.n.split('//')[0].trim() + '"'); shareOut({ title: CS.n, text: frName(k, CS.g ? lineLang(CS.g) : '') || CS.n, url: u }); }
}
function csChange(e) {
  const k = CS.k;
  const sel = e.target.closest('.lchip select');
  if (sel) { const ch = sel.closest('.lchip'), from = ch.dataset.g ?? (ch.dataset.l || ''), l = sel.value; haptic('tap'); sel.blur(); CS.g = lineKey(l, lineEd(from), lineFoil(from), lineAw(from)); collSetLang(k, l, from); return; }      // la ligne change de langue (et peut rejoindre celle de l'autre langue)
  const kp = e.target.closest('input[data-cs="keep"]');
  if (kp) {      // même effet que « Garder » de l'onglet Échange
    haptic('tap'); if (kp.checked) TR.kept.add(k); else TR.kept.delete(k); trChanged(); csPaint();
    if (kp.checked) toast(T('Gardée : elle n\'est plus proposée'), { label: T('Annuler'), fn: () => { TR.kept.delete(k); trChanged(); csSoon(); } });
  }
}
/** « − » de la fiche : pas de confirmation, un toast « Annuler » (la ligne revient, la carte aussi avec sa date d'ajout si c'était son dernier exemplaire). */
function csMinus(k, g) {
  const c = COLL.map[k]; if (!c) return;
  const name = c.n, date = c.d, multi = collLines(c).length > 1, left = collBump(k, name, -1, { lang: g }); haptic('tap');
  const what = multi || lineEd(g) || lineFoil(g) ? ' (' + lineTag(g) + ')' : '';
  toast(left ? T('{name} : un exemplaire retiré{line} · il en reste {n}', { name, line: what, n: left }) : COLL.map[k] ? T('{name} : dernier exemplaire{line} retiré', { name, line: what }) : T('{name} retirée de la collection', { name: name + what }),
    { label: T('Annuler'), fn: () => { collBump(k, name, 1, { lang: g, date }); } });
}
/** Image de la fiche : la carte en grand (3D, reflet, foil), précédente / suivante parmi les lignes de la carte. */
function csZoom(k) {
  const x = COLL.map[k], ls = collLines(x), m = csMeta(k);
  const items = ls.map(([g]) => collViewItem(k, g)).filter(Boolean);
  if (items.length) { const i = Math.max(0, items.findIndex(it => it.lid === k + '|' + CS.g)); openCardViewer(items, i); return; }
  const l = CS.g ? lineLang(CS.g) : (CS.o.l && !String(CS.o.l).includes('|') ? CS.o.l : '');
  openCardViewer([m && m.im ? { key: k, name: frName(k, l) || CS.n, ln: CS.n, wl: l && l !== 'en' ? l : '', small: m.im, lang: 'en', plain: true, extra: '' } : zoomNamed(k, frName(k, l) || CS.n, CS.n, l)], 0);
}
/** « Suivre le prix » : alertes de prix (alerts.js), en hausse ET en baisse (u) ; le serveur qui ne connaît pas encore la hausse ne prévient que des baisses. */
async function csWatch(k, b) {
  const w = AC.watch[k];
  if (w) { alUnwatch(k); haptic('tap'); toast(T('{name} : prix plus suivi', { name: CS.n }), { label: T('Annuler'), fn: () => { AC.watch = { ...AC.watch, [k]: w }; alWrite(); alSoon(); csSoon(); } }); csPaint(); return; }
  if (!AC.on) { b.disabled = true; const r = await alEnable(); b.disabled = false; if (!r.ok) { toast(alWhy(r)); return; } }
  alWatch(CS.n, 0, true); haptic('ok'); csPaint();
  toast(T('{name} : tu seras prévenu si son prix bouge fort (hausse ou baisse)', { name: CS.n }), { label: T('Régler'), fn: () => openAlertSheet() });
}
/** Offre CardTrader la moins chère de cette seule carte (dans la langue de ses exemplaires), comme le prix rapide du scan : gardée dans COLL.px
 *  (comme « Prix réels »), avec le blueprint de l'offre pour le lien « CardTrader ↗ ». */
async function csCtRead(k) {
  const x = COLL.map[k]; if (!x || CS.ct === 'run') return;
  if (S.run && S.run.status === 'running') { toast(T('Une recherche est en cours : attends sa fin')); return; }
  if (!ctReady()) { ctGetSheet(() => csCtRead(k)); return; }
  CS.ct = 'run'; CS.ctErr = ''; csPaint(); haptic('tap');
  try {
    readOpts(); const lang = pxLangOf(x), opts = { ...S.opts, lang, fallbackEn: false, skip: new Set(), fresh: false, push: null }; let off = null;
    await runLive([{ key: k, name: x.n, qty: 1 }], opts, { step() {}, progress() {}, rate() {}, hint() {}, cacheAge() {}, needsEn: () => false, card: (key, p) => { off = p.notFound ? null : cheapestOffer(p.offers, opts); } }, new AbortController().signal);
    COLL.px[k] = { p: off ? off.price : null, t: Date.now(), s: pxSig(lang, opts), c: off ? off.cur : '', ...(off && off.bpId > 0 ? { b: off.bpId } : {}) };
    pxSave(); collPaintSoon(); CS.ct = '';
  } catch (e) { CS.ct = 'err'; CS.ctErr = pxError(e); }
  if (CS.k === k) csPaint();
}

/* ── Ajouter un exemplaire (langue, édition, foil) ─────────────────────────────────────────────── */
function csAddSheet(k) {
  const x = COLL.map[k], n = (x && x.n) || CS.n; let l = CS.g ? lineLang(CS.g) : x ? collMainLang(collLines(x)) : (CS.o.l && !String(CS.o.l).includes('|') ? CS.o.l : collImportLang()), p = null, f = false;
  const LN = c => { const s = T(LANGS[c]); return s[0].toUpperCase() + s.slice(1); };
  openSheet(T('Ajouter un exemplaire'), frName(k, l) || n, api => {
    api.wrap.classList.add('cs-addw');
    const paint = () => {
      const e = p ? edKey(p.set, p.num) : '', set = p ? p.set : '';
      api.body.innerHTML = `<div class="field-in"><label class="label" for="csAl">${T('Langue')}</label><div class="sel"><select id="csAl"><option value=""${l ? '' : ' selected'}>${T('Non précisée')}</option>${CARD_LANG_LIST.map(c => `<option value="${c}"${c === l ? ' selected' : ''}>${esc(LN(c))}</option>`).join('')}</select></div></div>
        <button type="button" class="plc-cur cs-aed" data-ed><span class="cs-aic">${set ? setIcHtml(set) || `<span class="ed-code">${esc(set.toUpperCase())}</span>` : ''}</span><span><small>${T('Édition')}</small><b>${esc(p ? [p.sn, edLabel(e)].filter(Boolean).join(' · ') : T('Sans édition'))}</b></span><svg class="i" aria-hidden="true"><use href="#i-back"/></svg></button>
        <label class="switch-row"><span class="t"><b>${T('Foil')} ✦</b><span class="hint">${esc(T('Exemplaire foil : prix foil Cardmarket'))}</span></span><span class="switch"><input type="checkbox" id="csAf"${f ? ' checked' : ''} aria-label="${T('Foil')}"><i></i></span></label>`;
    };
    paint(); setIcLoad(() => { if (sheets.includes(api)) paint(); });
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn" type="button" data-ok>${T('Ajouter')}</button>`);
    api.body.addEventListener('change', e => { if (e.target.id === 'csAl') { l = e.target.value; p = null; paint(); } else if (e.target.id === 'csAf') f = e.target.checked; });
    api.body.addEventListener('click', e => {
      if (!e.target.closest('[data-ed]')) return;
      edSheet({ name: frName(k, l) || n, sub: l ? T('Exemplaires {lang}', { lang: langCode(l) }) : '', cur: p ? edKey(p.set, p.num) : '', foil: f, load: () => scryArtPrints(n, l || 'en'), find: q => scryPrintsFind(n, l || 'en', q), onPick: pp => { p = pp; if (sheets.includes(api)) paint(); } });
    });
    api.foot.addEventListener('click', e => {
      if (!e.target.closest('[data-ok]')) return;
      const ed = p ? edKey(p.set, p.num) : '', g = lineKey(l, ed, f);
      if (p) edRemember(k, l, ed, edInfoOf(p, l));
      api.close(); CS.g = g; collBump(k, n, 1, { lang: g }); haptic('ok'); if (ed) edSoon();
      toast(T('{name} : un exemplaire ajouté ({line})', { name: n, line: lineTag(g) || T('sans langue') }), { label: T('Annuler'), fn: () => { collBump(k, n, -1, { lang: g }); } });
    });
  });
}

/* ── Ajouter à un deck de « Mes decks » ────────────────────────────────────────────────────────── */
function csDeckPick(k) {
  const ds = allDecks(), n = CS.n;
  if (!ds.length) { toast(T('Aucun deck pour l\'instant : crée-en un dans Decks')); return; }
  openSheet(T('Ajouter à un deck'), frName(k, CS.g ? lineLang(CS.g) : '') || n, api => {
    api.wrap.classList.add('cs-pickw');
    api.body.innerHTML = `<div class="cs-dks">${ds.map(d => { const q = csDeckQty(d.text, k), full = q.q >= dkMaxCopies(dkFmtOf(d.text), k); return `<button type="button" class="cs-dk" data-id="${esc(d.id)}"${full ? ' aria-disabled="true"' : ''}><span class="cs-dkt"><b>${esc(d.name)}</b><small>${esc(dkCountText(d.text))}${q.q ? ' · ' + esc(T('déjà × {n}', { n: nf0(q.q) })) : ''}</small></span><svg class="i" aria-hidden="true"><use href="#i-plus"/></svg></button>`; }).join('')}</div>`;
    api.body.addEventListener('click', e => { const b = e.target.closest('.cs-dk'); if (!b) return; api.close(); csDeckAdd(b.dataset.id, k, n); });
  });
}
/** Un exemplaire de plus dans le deck : la ligne de la carte (section principale) prend +1, sinon « 1 Nom » après la dernière carte de la section principale.
 *  Le reste du texte (commentaires, éditions, réserve) ne bouge pas. */
function csTextAdd(text, k, n) {
  const src = String(text || ''), lines = src.split(/\r?\n/), secs = deckSecs(src); let last = -1;
  for (let i = 0; i < secs.length; i++) {
    const [raw, sec] = secs[i]; if (sec !== 'main') continue;
    const p = parseLine(raw); if (!p || p.ignored) continue;
    if (ownKey(p.name) === k) { lines[i] = /^\s*\d+/.test(raw) ? raw.replace(/^(\s*)(\d+)/, (_, a, q) => a + (Number(q) + 1)) : '2 ' + raw.trim(); return lines.join('\n'); }
    last = i;
  }
  if (last < 0) return (src.trim() ? src.replace(/\s*$/, '') + '\n' : '') + '1 ' + n;
  lines.splice(last + 1, 0, '1 ' + n); return lines.join('\n');
}
function csDeckSave(d, text) {
  putDeck(d.id, deckDoc({ ...d, text }));
  if (typeof engRefresh === 'function') engRefresh(d.id, d.name, text);      // deck monté : ses cartes réservées suivent la liste
  if (S.deckId === d.id) { $('#deckText').value = text; refreshDeck(); updateSaveButtons(); }
  csSoon();
}
function csDeckAdd(id, k, n) {
  const d = findDeck(id); if (!d) return;
  if (csDeckQty(d.text, k).q >= dkMaxCopies(dkFmtOf(d.text), k)) { toast(T('{name} est déjà dans « {deck} » (exemplaires au maximum pour ce format)', { name: n, deck: d.name })); return; }
  const prev = d.text; csDeckSave(d, csTextAdd(prev, k, n)); haptic('ok');
  toast(T('{name} ajoutée à « {deck} »', { name: n, deck: d.name }), { label: T('Annuler'), fn: () => { const c = findDeck(id); if (c) csDeckSave(c, prev); } });
}
