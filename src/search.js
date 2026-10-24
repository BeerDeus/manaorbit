/* ── search.js : recherche avancée de la collection (Cartes › Filtres › « Plus de filtres ») et recherches enregistrées ─────────────────────────────
   Filtres (valeurs dans COLL.f, core.js › FLT_ADV, fltAdvOk) : rareté, langue, finition, prix à l'unité, emplacement, doublons, decks, échange, ajout récent.
   Langue, finition, rareté, prix (et avec eux l'emplacement et l'extension) se jugent ligne par ligne : une carte passe si UNE de ses lignes passe tout à la fois,
   et seules ces lignes s'affichent (collRowItems, srchLineIn) — « Mythiques · FR · non rangées » montre les exemplaires français non rangés.
   Emplacement : le même filtre que l'onglet Rangement (COLL.place est ici un accès à COLL.f.place) : bandeau, « Ranger ces cartes… », « Retirer… » compris.
   Les cartes sont préparées une fois par version de la liste (srchPrep : lignes, decks, échange) : une frappe dans la recherche ne relit rien.
   Recherches enregistrées : sur l'appareil seulement (deckdeal:srch:v1) — users/{uid}/meta n'accepte aucun document de plus sans republier les règles Firestore. */
const SRCH_KEY = 'deckdeal:srch:v1', SRCH_MORE_KEY = 'deckdeal:srch:more', SRCH_MAX = 30, SRCH_NAME_MAX = 40;
const SRCH = { list: null, rar: null, rarErr: '', rarTried: new Set(), langs: null, lp: 0, lpAt: 0 };
const SRCH_RAR = [['common', 'Communes'], ['uncommon', 'Peu communes'], ['rare', 'Rares'], ['mythic', 'Mythiques']];
const SRCH_PX = [['lt1', '< 1 €'], ['1-5', '1–5 €'], ['5-20', '5–20 €'], ['gt20', '> 20 €']];

/* Emplacement : une seule valeur pour le panneau des filtres et l'onglet Rangement. COLL.place lit et écrit COLL.fs.coll.place (le filtre de la collection, jamais celui d'Échange). */
if (typeof COLL !== 'undefined' && COLL.fs && COLL.fs.coll) {
  COLL.fs.coll.place = COLL.place || '';
  Object.defineProperty(COLL, 'place', { get: () => COLL.fs.coll.place || '', set: v => { COLL.fs.coll.place = v || ''; }, enumerable: true, configurable: true });
}

/* ── Préparation des cartes (une fois par version de la liste) ─────────────────────────────────── */
/** Ligne g de la carte k, telle que les filtres la voient (core.js › fltLineOk) : langue, foil, prix d'un exemplaire (édition et foil compris, comme la valeur), rareté
 *  (celle de l'édition de la ligne, sinon celle que Scryfall donne pour le nom), emplacement, extension. */
function srchLine(k, g) {
  const e = lineEd(g), x = e && COLL.ed[e], m = COLL.meta[k];
  return { l: lineLang(g), f: lineFoil(g) ? 1 : 0, u: collLineEu(k, g), r: (x && x.r) || (m && m.rr) || '', p: plcOf(g), s: edSet(e) };
}
/** Empreinte des decks (Mes decks et decks montés) : la liste « dans un deck » est refaite quand elle change. */
const srchDeckSig = () => allDecks().map(d => d.id + ':' + (d.updatedAt || 0) + ':' + String(d.text || '').length).join() + '#' + (typeof engSig === 'function' ? engSig() : '');
/** Cartes présentes dans une liste de Mes decks (réserve comprise) ou réservées par un deck monté. */
function srchDeckKeys() {
  const ks = new Set(deckUse(allDecks().map(d => d.text || '')).keys());
  for (const id in XS.eng) { const q = XS.eng[id].q || {}; for (const k in q) if (q[k] > 0) ks.add(k); }
  return ks;
}
const srchTradeSig = () => [TR.keep, TR.kept.size, TR.u, srchDeckSig()].join('|');
/** Clé des filtres avancés pour le cache de la liste (collListOf) ; '' sans filtre avancé. Ajout récent : la minute courante (la liste suit l'heure). */
const srchKey = f => (fltAdvCount(f) ? [[...f.lang].sort().join(), f.foil, [...f.rar].sort().join(), f.px, f.place, f.dup ? 1 : 0, f.dk, f.tr ? 1 : 0, f.add, f.dk ? srchDeckSig() : '', f.tr ? srchTradeSig() : '', f.add ? Math.floor(Date.now() / 60000) : ''].join('|') : '');
/** Prépare les cartes de la liste v pour les filtres avancés de f (rien sans filtre avancé) : lignes une fois par version, decks et échange quand ils changent. */
function srchPrep(v, f) {
  if (!f || !fltAdvCount(f)) return;
  if (!v.srchL) { for (const it of v.all) it.sl = collLines(COLL.map[it.k]).map(([g]) => srchLine(it.k, g)); v.srchL = 1; }
  if (f.dk) { const s = srchDeckSig(); if (v.srchD !== s) { const ks = srchDeckKeys(); for (const it of v.all) it.sk = ks.has(it.k) ? 1 : 0; v.srchD = s; } }
  if (f.tr) { const s = srchTradeSig(); if (v.srchT !== s) { const ks = new Set(trSpare(COLL.map).map(x => x.k)); for (const it of v.all) it.st = ks.has(it.k) ? 1 : 0; v.srchT = s; } }
  if (f.rar && f.rar.size) srchRarSoon();
}
/** La ligne g de la carte k s'affiche-t-elle (filtres de ligne de la collection ; emplacement et extension : plcIn, collSetIn) ? */
function srchLineIn(k, g) {
  const f = COLL.f; if (!fltLineOn(f)) return true;
  return fltLineOk(srchLine(k, g), { lang: f.lang, foil: f.foil, rar: f.rar, px: f.px });
}

/* ── Rareté : lue sur Scryfall seulement quand on filtre dessus ───────────────────────────────── */
/** Cartes dont la rareté manque : infos lues avant que l'appli la garde (COLL.meta[k].rr absent) et une ligne au moins sans rareté d'édition. Infos jamais lues : collEnrich s'en charge (rareté comprise). */
function srchRarNeed() {
  const out = [];
  for (const [k, x] of Object.entries(COLL.map)) {
    const m = COLL.meta[k]; if (!m || m.rr !== undefined || BASIC_NAMES.has(k) || SRCH.rarTried.has(k)) continue;
    if (collLines(x).every(([g]) => { const e = lineEd(g); return e && COLL.ed[e] && COLL.ed[e].r; })) continue;
    out.push(k);
  }
  return out;
}
let srchRarT = 0;
function srchRarSoon() { if (SRCH.rar || srchRarT || SRCH.rarErr) return; srchRarT = setTimeout(() => { srchRarT = 0; srchRarLoad(); }, 250); }
/** Lit la rareté des cartes qui n'en ont pas (75 par requête, file Scryfall commune) ; la liste suit à chaque lot. */
async function srchRarLoad() {
  if (SRCH.rar) return;
  const keys = srchRarNeed(); if (!keys.length) return;
  if (collOffline()) { SRCH.rarErr = 'off'; srchSync(); return; }
  const st = SRCH.rar = { done: 0, total: keys.length, ctrl: new AbortController() }; SRCH.rarErr = ''; srchSync();
  try {
    for (let i = 0; i < keys.length; i += 75) {
      const chunk = keys.slice(i, i + 75); for (const k of chunk) SRCH.rarTried.add(k);
      const got = await scryCollection(chunk.map(k => (COLL.map[k] ? COLL.map[k].n : k)), st.ctrl.signal);
      for (const k of chunk) { const g = got.get(k), m = COLL.meta[k]; if (m) COLL.meta[k] = { ...m, rr: (g && g.rr) || '' }; }      // carte inconnue de Scryfall : '' (jamais relue)
      st.done = Math.min(keys.length, i + 75); collMetaSave(); collPaintSoon(); srchSync();
    }
  } catch (e) {
    if (e.name !== 'AbortError') { SRCH.rarErr = e.offline || collOffline() ? 'off' : 'err'; for (const k of keys.slice(st.done)) SRCH.rarTried.delete(k); }
  } finally { SRCH.rar = null; srchSync(); }
}
/** Barre des filtres repeinte (pastille, groupes, filtres actifs) : la collection ouverte seulement. */
function srchSync() { if (COLL.el && COLL.fb && COLL.mode === 'coll') COLL.fb.paint(); }

/* ── Groupes de « Plus de filtres » ────────────────────────────────────────────────────────────── */
/** Langues présentes dans la collection (ordre de la puce langue ; '' : non précisée, à la fin). */
function srchLangs() {
  if (SRCH.langs && SRCH.langs.map === COLL.map) return SRCH.langs.l;
  const s = new Set(); for (const x of Object.values(COLL.map)) for (const [g] of collLines(x)) s.add(lineLang(g));
  const l = [...CARD_LANG_LIST.filter(x => s.has(x)), ...[...s].filter(x => x && !CARD_LANG_LIST.includes(x)).sort(), ...(s.has('') ? [''] : [])];
  SRCH.langs = { map: COLL.map, l }; return l;
}
const srchGroupsSig = () => [srchLangs().join(), plcList().map(x => x.id + ':' + x.n).join(), SRCH.rar ? SRCH.rar.done + '/' + SRCH.rar.total : '', SRCH.rarErr, I18N.lang].join('|');
const srchOpt = (k, v, html, label) => `<button type="button" class="fopt" data-fk="${k}" data-fv="${esc(v)}" aria-pressed="false"${label ? ` aria-label="${esc(label)}"` : ''}>${html}</button>`;
const srchGrp = (label, body, extra) => `<div class="fgrp"><span class="fgl">${esc(label)}</span><div class="fopts" role="group" aria-label="${esc(label)}">${body}</div>${extra || ''}</div>`;
const srchLangName = l => (l ? (T(LANGS[l] || l)[0] || '').toUpperCase() + T(LANGS[l] || l).slice(1) : T('Langue non précisée'));
function srchGroupsHtml(f) {
  const langs = srchLangs(), keep = [...f.lang].filter(l => !langs.includes(l));      // langue d'une recherche enregistrée qui n'est plus dans la collection : reste proposée
  const rh = SRCH.rar ? `<p class="hint srch-rh" role="status">${esc(T('Lecture des raretés… {a} / {b}', { a: nf0(SRCH.rar.done), b: nf0(SRCH.rar.total) }))}</p>`
    : SRCH.rarErr ? `<p class="hint srch-rh" role="status">${esc(SRCH.rarErr === 'off' ? T('Hors ligne : raretés à lire au retour du réseau.') : T('Scryfall injoignable : raretés non lues.'))} <button type="button" class="link-btn link-inline" data-srch="rar">${T('Réessayer')}</button></p>` : '';
  const pl = typeof plcAny === 'function' && plcAny() ? plcList() : [];
  return srchGrp(T('Rareté'), SRCH_RAR.map(([r, l]) => srchOpt('rar', r, `<i class="setv-r ${r}" aria-hidden="true"></i>${esc(T(l))}`)).join(''), rh)
    + srchGrp(T('Langue'), [...langs, ...keep].map(l => srchOpt('lang', l, l ? `${flag(l)}<span>${esc(l.toUpperCase())}</span>` : esc(T('Non précisée')), srchLangName(l))).join(''))
    + srchGrp(T('Finition'), srchOpt('foil', 'f', `<span class="srch-foil" aria-hidden="true">✦</span>${esc(T('Foil'))}`) + srchOpt('foil', 'n', esc(T('Non foil'))))
    + srchGrp(T('Prix à l\'unité'), SRCH_PX.map(([v, l]) => srchOpt('px', v, esc(T(l)))).join(''))
    + (pl.length || (f.place && f.place !== '-') ? srchGrp(T('Emplacement'), srchOpt('place', '-', esc(T('Non rangées'))) + pl.map(x => srchOpt('place', x.id, `<i class="srch-dot" style="--c:${plcColor(x.id)}" aria-hidden="true"></i>${esc(plcName(x.id))}`)).join('')) : '')
    + srchGrp(T('Exemplaires'), srchOpt('dup', '1', esc(T('Doublons (2 et +)'))) + srchOpt('dk', 'in', esc(T('Dans un deck'))) + srchOpt('dk', 'out', esc(T('Dans aucun deck'))) + srchOpt('tr', '1', esc(T('À l\'échange'))))
    + srchGrp(T('Ajout'), srchOpt('add', '7', esc(T('7 derniers jours'))) + srchOpt('add', '30', esc(T('30 derniers jours'))));
}

/* ── Filtres actifs en pastilles (✕ pour en retirer un) ───────────────────────────────────────── */
/** Filtres actifs de f, un par valeur : { k, v (valeur retirée ; '' : tout le champ), t (texte), h (html) }. place : à part (bandeau de l'emplacement), name : pour le nom proposé. */
function srchChips(f, name) {
  const out = [], add = (k, v, t, h) => out.push({ k, v, t, h: h || esc(t) });
  if (name && (f.q || '').trim()) add('q', '', '« ' + f.q.trim() + ' »');
  for (const [c, n] of COLOR_DEF) if (f.colors.has(c)) add('colors', c, n, `${manaHtml('{' + c + '}')}${esc(n)}`);
  if (f.type) add('type', '', T(f.type));
  if (f.cmc !== '' && f.cmc != null) add('cmc', '', T('Coût {n}', { n: f.cmc === 7 ? '7+' : f.cmc }));
  if (f.cmdr) add('cmdr', '', f.cmdr === 'played' ? T('Joués en commandant') : T('Peuvent être commandant'));
  if (f.set) { const n = f.set === '-' ? T('Sans édition') : (typeof setName === 'function' && setName(f.set)) || f.set.toUpperCase(); add('set', '', n, `${f.set !== '-' && typeof setIcHtml === 'function' ? setIcHtml(f.set) : ''}${esc(n)}`); }
  for (const [r, l] of SRCH_RAR.slice().reverse()) if (f.rar.has(r)) add('rar', r, T(l), `<i class="setv-r ${r}" aria-hidden="true"></i>${esc(T(l))}`);
  for (const l of f.lang) add('lang', l, l ? l.toUpperCase() : T('Langue non précisée'), l ? `${flag(l)}${esc(l.toUpperCase())}` : esc(T('Langue non précisée')));
  if (f.foil) add('foil', '', f.foil === 'f' ? T('Foil') : T('Non foil'));
  if (f.px) add('px', '', T((SRCH_PX.find(x => x[0] === f.px) || ['', f.px])[1]));
  if (name && f.place) add('place', '', f.place === '-' ? T('non rangées') : plcName(f.place));
  if (f.dup) add('dup', '', T('Doublons'));
  if (f.dk) add('dk', '', f.dk === 'in' ? T('Dans un deck') : T('Dans aucun deck'));
  if (f.tr) add('tr', '', T('À l\'échange'));
  if (f.add) add('add', '', f.add === '7' ? T('7 derniers jours') : T('30 derniers jours'));
  return out;
}
/** Retire un filtre (pastille ✕). */
function srchDrop(f, k, v) {
  const cur = f[k];
  if (cur instanceof Set) { if (v) cur.delete(v); else cur.clear(); } else if (typeof cur === 'boolean') f[k] = false; else f[k] = '';
}
/** Nom proposé : « Mythiques · FR · non rangées » (40 caractères au plus). */
function srchAutoName(f) {
  const s = srchChips(f, true).map(c => c.t).join(' · ');
  return s.length > SRCH_NAME_MAX ? s.slice(0, SRCH_NAME_MAX - 1).trim() + '…' : s || T('Ma recherche');
}

/* ── Recherches enregistrées (sur l'appareil) ──────────────────────────────────────────────────── */
/** Filtres de f, compacts (seulement ceux qui sont actifs, listes triées) : ce qui est gardé, et l'empreinte qui dit si une recherche est appliquée. */
function srchSer(f) {
  const o = {}, arr = s => [...s].sort(), q = (f.q || '').trim();
  if (q) o.q = q;
  if (f.colors.size) o.c = arr(f.colors).join('');
  if (f.type) o.t = f.type;
  if (f.cmc !== '' && f.cmc != null) o.m = f.cmc;
  if (f.cmdr) o.x = f.cmdr;
  if (f.set) o.s = f.set;
  if (f.lang.size) o.la = arr(f.lang);
  if (f.foil) o.fo = f.foil;
  if (f.rar.size) o.ra = arr(f.rar);
  if (f.px) o.px = f.px;
  if (f.place) o.p = f.place;
  if (f.dup) o.du = 1;
  if (f.dk) o.dk = f.dk;
  if (f.tr) o.tr = 1;
  if (f.add) o.ad = f.add;
  return o;
}
/** Applique une recherche gardée à f (sur place), valeurs vérifiées une à une : texte abîmé ou d'une autre version ignoré, emplacement supprimé depuis oublié. */
function srchLoad(f, o) {
  f.q = ''; fltClear(f); if (!o || typeof o !== 'object') return f;
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  f.q = str(o.q, 80);
  for (const c of str(o.c, 6)) if ('WUBRGC'.includes(c)) f.colors.add(c);
  if (TYPE_ORDER.includes(o.t)) f.type = o.t;
  if (Number.isInteger(o.m) && o.m >= 0 && o.m <= 7) f.cmc = o.m;
  if (o.x === 'can' || o.x === 'played') f.cmdr = o.x;
  if (/^(-|[a-z0-9]{2,8})$/.test(str(o.s, 8))) f.set = o.s;
  for (const l of Array.isArray(o.la) ? o.la.slice(0, 12) : []) if (typeof l === 'string' && /^[a-zA-Z-]{0,6}$/.test(l)) f.lang.add(l);
  if (o.fo === 'f' || o.fo === 'n') f.foil = o.fo;
  for (const r of Array.isArray(o.ra) ? o.ra : []) if (SRCH_RAR.some(x => x[0] === r)) f.rar.add(r);
  if (FLT_PX[o.px]) f.px = o.px;
  if (o.p === '-' || (typeof o.p === 'string' && COLL.places[o.p])) f.place = o.p;
  if (o.du) f.dup = true;
  if (o.dk === 'in' || o.dk === 'out') f.dk = o.dk;
  if (o.tr) f.tr = true;
  if (o.ad === '7' || o.ad === '30') f.add = o.ad;
  return f;
}
const srchSigOf = o => JSON.stringify(srchSer(srchLoad(newFilter(), o)));
function srchRead() {
  if (SRCH.list) return SRCH.list;
  let l = []; try { const j = JSON.parse(localStorage.getItem(SRCH_KEY) || '[]'); if (Array.isArray(j)) l = j; } catch (e) { /* stockage refusé ou abîmé */ }
  SRCH.list = l.filter(x => x && typeof x.id === 'string' && typeof x.n === 'string' && x.f && typeof x.f === 'object').slice(0, SRCH_MAX).map(x => ({ id: x.id.slice(0, 16), n: x.n.slice(0, SRCH_NAME_MAX), f: x.f }));
  return SRCH.list;
}
function srchWrite(l) { SRCH.list = l; try { localStorage.setItem(SRCH_KEY, JSON.stringify(l)); } catch (e) { /* stockage plein ou refusé : gardées pour la session */ } }

/* ── Rangées sous la barre : recherches enregistrées, puis filtres actifs ──────────────────────── */
function srchBarPaint(box, f, api) {
  box.__f = f; box.__api = api;
  if (!box.dataset.on) { box.dataset.on = '1'; srchBarBind(box); }
  const list = srchRead(), cur = JSON.stringify(srchSer(f)), on = list.find(s => srchSigOf(s.f) === cur);
  const chips = srchChips(f), act = filterActive(f);
  const key = [cur, list.map(s => s.id + s.n + JSON.stringify(s.f)).join(), typeof SETIC !== 'undefined' && SETIC.m ? 1 : 0, I18N.lang].join('|');
  if (box.dataset.k === key) return; box.dataset.k = key;
  const saved = list.length ? `<div class="srch-saved" role="group" aria-label="${esc(T('Recherches enregistrées'))}">${list.map(s => {
    const p = s === on;
    return `<span class="srch-pw${p ? ' on' : ''}"><button type="button" class="srch-pill" data-sid="${esc(s.id)}" aria-pressed="${p}" title="${esc(p ? T('Retirer cette recherche') : T('Appliquer cette recherche'))}"><svg class="i" aria-hidden="true"><use href="#i-bookmark"/></svg><span>${esc(s.n)}</span></button>${p ? `<button type="button" class="srch-pmore" data-smore="${esc(s.id)}" aria-label="${esc(T('Renommer ou supprimer « {name} »', { name: s.n }))}"><svg class="i" aria-hidden="true"><use href="#i-more"/></svg></button>` : ''}</span>`;
  }).join('')}</div>` : '';
  const row = chips.length || (act && !on) ? `<div class="srch-act" role="group" aria-label="${esc(T('Filtres actifs'))}">${chips.map((c, i) => `<button type="button" class="srch-chip" data-ci="${i}" aria-label="${esc(T('Retirer le filtre : {name}', { name: c.t }))}">${c.h}<svg class="i" aria-hidden="true"><use href="#i-close"/></svg></button>`).join('')}${act && !on ? `<button type="button" class="srch-save" data-ssave aria-label="${esc(T('Enregistrer cette recherche'))}"><svg class="i" aria-hidden="true"><use href="#i-bookmark"/></svg>${esc(T('Enregistrer'))}</button>` : ''}</div>` : '';
  box.__chips = chips;
  box.innerHTML = saved + row; box.hidden = !(saved || row);
}
function srchBarBind(box) {
  const fire = () => { const api = box.__api; if (api) api.fire(); };
  let t = 0, sx = 0, sy = 0;
  const stop = () => { clearTimeout(t); t = 0; };
  box.addEventListener('pointerdown', e => {      // appui long sur une recherche enregistrée : renommer, supprimer
    const b = e.target.closest('.srch-pill'); if (!b || (e.pointerType === 'mouse' && e.button !== 0)) return;
    stop(); sx = e.clientX; sy = e.clientY;
    t = setTimeout(() => { t = 0; SRCH.lp = b.dataset.sid; SRCH.lpAt = Date.now(); haptic('tap'); srchEditSheet(b.dataset.sid); }, 550);
  });
  box.addEventListener('pointermove', e => { if (t && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) stop(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) box.addEventListener(ev, stop);
  box.addEventListener('scroll', stop, true);
  box.addEventListener('contextmenu', e => {      // clic droit (ordinateur) ; appui long d'Android : déjà ouvert par le minuteur
    const b = e.target.closest('.srch-pill'); if (!b) return; e.preventDefault(); stop();
    if (Date.now() - SRCH.lpAt < 900) return;
    SRCH.lp = b.dataset.sid; SRCH.lpAt = Date.now(); srchEditSheet(b.dataset.sid);
  });
  box.addEventListener('click', e => {
    const f = box.__f; if (!f) return;
    const pill = e.target.closest('.srch-pill'), more = e.target.closest('[data-smore]'), chip = e.target.closest('.srch-chip');
    if (pill) {
      if (SRCH.lp === pill.dataset.sid && Date.now() - SRCH.lpAt < 1500) { SRCH.lp = 0; return; }      // le clic qui suit un appui long
      const s = srchRead().find(x => x.id === pill.dataset.sid); if (!s) return;
      haptic('tap');
      if (pill.getAttribute('aria-pressed') === 'true') { f.q = ''; fltClear(f); } else srchLoad(f, s.f);      // re-toucher : la recherche est retirée
      fire(); return;
    }
    if (more) { haptic('tap'); srchEditSheet(more.dataset.smore); return; }
    if (chip) { const c = (box.__chips || [])[Number(chip.dataset.ci)]; if (!c) return; haptic('tap'); srchDrop(f, c.k, c.v); fire(); return; }
    if (e.target.closest('[data-ssave]')) { haptic('tap'); srchSaveSheet(f, fire); }
  });
}
/** Feuille « Nom » commune : enregistrer une recherche, la renommer (avec « Supprimer »). */
function srchNameSheet(title, sub, name, onOk, onDel) {
  openSheet(title, sub, api => {
    api.wrap.classList.add('srch-sheet');
    api.body.innerHTML = `<div class="field-in"><label class="label" for="srchName">${T('Nom')}</label><input type="text" id="srchName" maxlength="${SRCH_NAME_MAX}" autocomplete="off" enterkeyhint="done" value="${esc(name)}"></div>`;
    api.setFoot(`${onDel ? `<button class="btn ghost danger-txt" type="button" data-del>${T('Supprimer')}</button>` : `<button class="btn ghost" type="button" data-close>${T('Annuler')}</button>`}<button class="btn" type="button" data-ok>${T('Enregistrer')}</button>`);
    const inp = $('#srchName', api.body);
    const ok = () => { const n = inp.value.replace(/\s+/g, ' ').trim().slice(0, SRCH_NAME_MAX); if (!n) { inp.focus(); return; } api.close(); onOk(n); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
    api.foot.addEventListener('click', e => { if (e.target.closest('[data-ok]')) ok(); else if (e.target.closest('[data-del]')) { api.close(); onDel(); } });
    setTimeout(() => { try { inp.focus(); inp.select(); } catch (e) { /* ignore */ } }, 80);
  });
}
function srchSaveSheet(f, fire) {
  const list = srchRead();
  if (list.length >= SRCH_MAX) { toast(T('{n} recherches enregistrées au plus : supprimes-en une d\'abord (appui long sur son nom)', { n: SRCH_MAX })); return; }
  const o = srchSer(f);
  srchNameSheet(T('Enregistrer cette recherche'), srchChips(f, true).map(c => c.t).join(' · '), srchAutoName(f), n => {
    let id = ''; do id = Math.random().toString(36).slice(2, 10); while (srchRead().some(x => x.id === id));
    srchWrite([...srchRead(), { id, n, f: o }]); haptic('ok'); toast(T('Recherche « {name} » enregistrée', { name: n })); fire();
  });
}
function srchEditSheet(id) {
  const s = srchRead().find(x => x.id === id); if (!s) return;
  const repaint = () => srchSync();
  srchNameSheet(T('Recherche enregistrée'), srchChips(srchLoad(newFilter(), s.f), true).map(c => c.t).join(' · '), s.n, n => {
    srchWrite(srchRead().map(x => (x.id === id ? { ...x, n } : x))); haptic('ok'); repaint();
  }, () => {
    const before = srchRead(), i = before.findIndex(x => x.id === id); if (i < 0) return;
    srchWrite(before.filter(x => x.id !== id)); haptic('ok'); repaint();
    toast(T('Recherche « {name} » supprimée', { name: s.n }), { label: T('Annuler'), fn: () => { const l = srchRead().slice(); l.splice(Math.min(i, l.length), 0, s); srchWrite(l.slice(0, SRCH_MAX)); repaint(); } });
  });
}

/** Branchement dans mountFilters (collection seulement : opts.ext). */
function srchExt() {
  return {
    id: 'srchMore', sig: srchGroupsSig, groups: srchGroupsHtml, paint: srchBarPaint,
    open(o) { try { localStorage.setItem(SRCH_MORE_KEY, o ? '1' : '0'); } catch (e) { /* ignore */ } },
    moreOpen() { try { return localStorage.getItem(SRCH_MORE_KEY) === '1'; } catch (e) { return false; } },
  };
}
/* « Réessayer » la lecture des raretés (groupe Rareté). */
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-srch="rar"]'); if (!b) return; SRCH.rarErr = ''; haptic('tap'); srchRarLoad(); });
