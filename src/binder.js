/* ── binder.js : classeur d'échange visuel (pages de 3 × 3 pochettes, comme un vrai classeur de cartes) ─────────────────────────────
   · Interrupteur « Liste | Classeur » (deux icônes) juste au-dessus de la liste : section Échange du propriétaire (ligne Trier / prix) et page publique
     d'une liste (visiteur, aperçu du propriétaire : ligne « n cartes »). Choix gardé sur l'appareil (deckdeal:bndview:v1 : o = section, p = page publique) ;
     sans choix, la page publique s'ouvre en classeur si son propriétaire a réglé le sien, en liste sinon.
   · Classeur : couverture de la couleur choisie, anneaux, pochettes avec reflet ; page « 2 / 7 », glisser, flèches, clavier (← →, Début, Fin) ; deux pages côte à côte sur grand écran.
     « 2 / 7 » touché : « Aller à la page » (une tuile par page avec sa 1re carte, un curseur au-delà de BND_PKMAX pages), la page affichée marquée.
     Foil : les exemplaires foil d'une langue ont leur pochette, juste après les autres (voile irisé du masterset, pastille ✦) ; partagés en fo (trPayload).
     Édition : une pochette par langue ET par édition (lignes « fr|cmm|400 »), avec l'image de cette impression exacte (edImage : dans la langue de la ligne si Scryfall l'a,
     sinon l'anglaise de cette impression ; lue par l'extension et le numéro, bndEdLoad), jamais celle d'une autre impression du même nom ; partagée en e (« cmm/400 »)
     avec son image, relue chez le visiteur (shareCard › edUnshare). Lignes sans édition : l'image de la carte dans sa langue, comme avant.
     Seules la vue affichée et ses deux voisines existent (3 feuilles recyclées, pochettes repeintes une à une si elles changent) : 1 carte comme 2 000.
     Images Scryfall « normal » (celles du viewer de deck) chargées à l'affichage, les voisines juste après. Pastilles : × exemplaires, prix à l'unité de
     l'appareil qui regarde (comme la liste), épingle. Toucher une carte : la carte en grand (viewer.js), les voisines du classeur à portée de glissement.
   · « Mon classeur » (Personnaliser, section Échange en mode classeur) : couleur (8 teintes), cartes épinglées en tête (18 au plus, ordre réglable),
     tri des autres (valeur, couleur, extension, nom). Réglages sur l'appareil (deckdeal:binder:v1, par compte) et publiés DANS le champ d du partage
     (bd : { c, s, k, u }) : ni nouvelle clé de document, ni règle Firestore à changer. Le document du compte meta/trade n'accepte aucun autre champ
     (règles) : un autre appareil du même compte relit donc le classeur sur son lien publié, une fois par session, avant d'y écrire (bndPrep).
   · Classeur réglé : doublons et recherchées publiés dans l'ordre du classeur (épinglées, puis tri) ; la liste du visiteur les remet par nom (bndTake).
     Jamais réglé : le partage ne change pas d'un octet, le classeur du visiteur trie par nom affiché.
   · Rien au lancement : tout se calcule à l'ouverture d'un écran. */
const BND_KEY = 'deckdeal:binder:v1', BND_VKEY = 'deckdeal:bndview:v1', BND_PER = 9, BND_PINS = 18, BND_GAP = 28, BND_SPREAD = 760, BND_PKMAX = 40;      // BND_GAP : écart entre deux feuilles qui glissent (px) ; BND_SPREAD : largeur dès laquelle deux pages se font face ; BND_PKMAX : tuiles d'« Aller à la page » (au-delà : curseur)
const BND_SORTS = [['value', 'Valeur'], ['color', 'Couleur'], ['set', 'Extension'], ['name', 'Nom']];
const BND_COVERS = [['nuit', 'Nuit'], ['cuir', 'Cuir'], ['bordeaux', 'Bordeaux'], ['foret', 'Forêt'], ['ocean', 'Océan'], ['amethyste', 'Améthyste'], ['ardoise', 'Ardoise'], ['sable', 'Sable']];
const BND = { cfg: null, view: null, chk: '', pg: {}, own: null, live: new Set(), rt: 0, ed: null, edAt: 0, noIm: new Set() };      // pg : vue affichée par classeur (section, onglet) le temps de la session ; own : classeur de la section (gardé entre deux peintures) ; ed, edAt, noIm : lecture des images d'éditions (bndEdLoad)
const BND_IC = {
  list: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6.5h10M9.5 12h10M9.5 17.5h10"/><path d="M4.6 6.5h.01M4.6 12h.01M4.6 17.5h.01" stroke-width="2.8"/></svg>',
  binder: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" stroke="none">' + [4, 9.7, 15.4].flatMap(y => [3.6, 9.6, 15.6].map(x => `<rect x="${x}" y="${y}" width="4.8" height="4.9" rx="1"/>`)).join('') + '</svg>',
  pin: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3.5h6l-.8 5.2 3.3 3.3v2H6.5v-2l3.3-3.3z"/><path d="M12 14v6.5"/></svg>',
};

/* ── Ordre du classeur (fonctions pures, testées sous Node : tests/test-trade.mjs) ─────────────────────────── */
const bndLand = tl => /\bland\b/i.test(String(tl || '').split('//')[0]);
/** Rang de couleur : blanc, bleu, noir, rouge, vert, multicolore, incolore, terrain ; fiche inconnue à la fin. */
function bndColorRank(e) {
  if (e.tl == null && e.cl == null) return 9;
  if (bndLand(e.tl)) return 7;
  const c = String(e.cl || ''); if (!c) return 6;
  return c.length > 1 ? 5 : ('WUBRG'.indexOf(c) < 0 ? 8 : 'WUBRG'.indexOf(c));
}
const bndCombo = cl => [...String(cl || '')].map(c => 'WUBRG'.indexOf(c)).sort().join('');
/**
 * Entrées du classeur dans l'ordre : épinglées d'abord (ordre des épingles ; plusieurs langues d'une carte restent ensemble), puis le tri s.
 * list : [{ k, nm (nom affiché), u (prix à l'unité, centimes | null), cl, tl, cm, sk (extension, '' inconnue), num (numéro) }] · pins : clés · cmp : comparaison des noms.
 * Copie triée ; à égalité, l'ordre reçu.
 */
function bndArrange(list, s, pins, cmp) {
  const nc = cmp || ((a, b) => String(a).localeCompare(String(b))), pi = new Map((pins || []).map((k, i) => [k, i])), NO = 1e9;
  const byNm = (a, b) => nc(a.nm || '', b.nm || '');
  const by = {
    value: (a, b) => (b.u > 0 ? b.u : -1) - (a.u > 0 ? a.u : -1) || byNm(a, b),
    color: (a, b) => bndColorRank(a) - bndColorRank(b) || bndCombo(a.cl).localeCompare(bndCombo(b.cl)) || (a.cm ?? 99) - (b.cm ?? 99) || byNm(a, b),
    set: (a, b) => (a.sk ? 0 : 1) - (b.sk ? 0 : 1) || nc(a.sk || '', b.sk || '') || String(a.num || '').localeCompare(String(b.num || ''), 'en', { numeric: true }) || byNm(a, b),
    name: byNm,
  }[s] || byNm;
  return (list || []).map((e, i) => [e, i, pi.has(e.k) ? pi.get(e.k) : NO]).sort((a, b) => a[2] - b[2] || (a[2] < NO ? 0 : by(a[0], b[0])) || a[1] - b[1]).map(x => x[0]);
}
/** Exemplaires foil dans leur propre pochette, juste après les autres de la même langue (fo : combien sont foil) ; sans foil, l'entrée telle quelle. */
const bndFoil = list => (list || []).flatMap(({ fo, ...x }) => { const f = Math.min(x.q, fo > 0 ? fo : 0); return !f ? [x] : f >= x.q ? [{ ...x, foil: true }] : [{ ...x, q: x.q - f }, { ...x, q: f, foil: true }]; });
/** Réglages lus (appareil ou partage) : couverture, tri, épingles (18), date ; valeurs inconnues → par défaut. */
const bndClean = j => ({ who: j && typeof j.who === 'string' ? j.who : '', c: BND_COVERS.some(x => x[0] === (j && j.c)) ? j.c : 'nuit', s: BND_SORTS.some(x => x[0] === (j && j.s)) ? j.s : 'name',
  k: j && Array.isArray(j.k) ? [...new Set(j.k.filter(x => typeof x === 'string' && x && x.length <= 160))].slice(0, BND_PINS) : [], u: Math.max(0, Number(j && j.u) || 0) });

/* ── Réglages (propriétaire) et choix d'affichage (tout appareil) ────────────────────────────────────────── */
function bndCfg() {
  if (!BND.cfg) { let j = {}; try { j = JSON.parse(localStorage.getItem(BND_KEY) || '{}') || {}; } catch (e) { /* neuf */ } BND.cfg = bndClean(j); }
  return D.uid && BND.cfg.who && BND.cfg.who !== D.uid ? bndClean({}) : BND.cfg;      // autre compte sur cet appareil : le classeur par défaut, pas celui de l'autre
}
function bndSave(p) {
  const c = bndCfg(); BND.cfg = bndClean({ ...c, ...p, who: D.uid || c.who, u: p.u || Date.now() });
  try { localStorage.setItem(BND_KEY, JSON.stringify(BND.cfg)); } catch (e) { /* stockage plein : réglé pour cette session */ }
}
/** Un réglage a changé : enregistré, lien mis à jour, section repeinte. */
function bndChanged(p) { bndSave(p); trSoon(800); trRepaint(); }
/** Avant d'écrire la liste (trPrep) : un autre appareil du compte a peut-être réglé le classeur plus récemment ; relu sur le lien publié, une fois par session. */
async function bndPrep() {
  if (!TR.share || BND.chk === TR.share || typeof shareFetch !== 'function') return;
  BND.chk = TR.share;
  try { const r = (await shareFetch(TR.share)).bd; if (r && r.u > bndCfg().u) bndSave(r); } catch (e) { /* lien illisible ou hors ligne : réglages de cet appareil */ }
}
function bndView(ctx, def) {
  if (!BND.view) { try { const o = JSON.parse(localStorage.getItem(BND_VKEY) || '{}'); BND.view = o && typeof o === 'object' ? o : {}; } catch (e) { BND.view = {}; } }
  const v = BND.view[ctx]; return v === 'binder' || v === 'list' ? v : def || 'list';
}
function bndSetView(ctx, v) { bndView(ctx); BND.view[ctx] = v; try { localStorage.setItem(BND_VKEY, JSON.stringify(BND.view)); } catch (e) { /* choix pour cette session */ } }
/** Interrupteur Liste | Classeur (icônes ; libellés lus par les lecteurs d'écran). */
const bndSwitchHtml = id => `<div class="seg bnd-sw" id="${id}" role="radiogroup" aria-label="${T('Affichage')}"></div>`;
function bndSwitchMount(el, ctx, cur, onChange) {
  if (!el) return;
  mountSeg(el, [{ v: 'list', label: T('Liste') }, { v: 'binder', label: T('Classeur') }], cur, v => { bndSetView(ctx, v); onChange(v); });
  for (const b of $$('.seg-opt', el)) { const lab = b.textContent.trim(); b.setAttribute('aria-label', lab); b.title = lab; $('span', b).innerHTML = BND_IC[b.dataset.v]; }
}

/* ── Images des impressions exactes (lignes avec édition) ──────────────────────────────────────── */
/** Image de l'impression exacte (edImage) ; édition relue sans image cette session : null, comme une édition inconnue de Scryfall. */
const bndEdImg = (k, l, e) => { const u = edImage(k, l, e); return u === '' && BND.noIm.has(e) ? null : u; };
/** Image d'une pochette (et d'une vignette de la liste) : l'impression exacte de l'édition e ('' en attendant sa lecture), sinon (sans édition, édition inconnue) la carte dans sa langue. */
const bndImg = (k, l, e, en) => { const u = e ? bndEdImg(k, l, e) : null; return u != null ? u : collImage(k, l, en).src; };
/** Vignette d'une carte de la liste (une ligne par carte) : l'impression de sa 1re ligne dans la langue l, comme sa 1re pochette. { src, e (édition, '' sans) } */
function bndThumb(x, l, en) { const e = lineEd(((x.lines || []).find(([g]) => lineLang(g) === (l || '')) || [''])[0]); return { src: bndImg(x.k, l, e, en), e }; }
/** Éditions des doublons (tradeLists) : [[clé, langue, édition]], pour bndEdLoad. */
const bndEdOf = have => (have || []).flatMap(x => (x.lines || []).map(([g]) => [x.k, lineLang(g), lineEd(g)]).filter(y => y[2]));
/**
 * Images d'impressions exactes qui manquent sur l'appareil (list : [[clé, langue, édition]]) : éditions jamais lues (Scryfall /cards/collection par code et numéro, 75 par requête),
 * puis leur image dans la langue de la ligne (scryEdLangImages, 25 par recherche ; '' gardé si Scryfall n'a pas cette langue : l'anglaise de l'impression). Gardées avec celles
 * de la collection (COLL.ed, COLL.li). Une lecture à la fois, par la file Scryfall ; échec (hors ligne, pause) : pas de nouvel essai avant une minute. Résout true si une image a été lue.
 */
function bndEdLoad(list) {
  if (BND.ed) return BND.ed.then(() => bndEdLoad(list), () => false);      // une lecture en cours (autre liste) : celle-ci ensuite, pour ce qui manque encore
  const todo = () => {
    const eds = new Set(), by = {};
    for (const [k, l, e] of list || []) {
      const x = e && COLL.ed[e]; if (!e) continue;
      if (!x || (!x.im && !x.none && !BND.noIm.has(e))) { eds.add(e); continue; }
      if (x.none || !l || l === 'en' || !SCRY_LANG[l] || (liKey(l, k + '|' + e) in COLL.li)) continue;
      const m = by[l] || (by[l] = new Map()); m.set(e, [...(m.get(e) || []), k]);
    }
    return { eds: [...eds], by: Object.entries(by) };
  };
  let t = todo();
  if ((!t.eds.length && !t.by.length) || Date.now() - BND.edAt < 60000 || scryLeft() > 0 || collOffline()) return Promise.resolve(false);
  return BND.ed = (async () => {
    let got = false;
    try {
      if (COLL.edRun) { await COLL.edRun; t = todo(); }      // prix des éditions de la collection déjà en lecture (edRefresh) : rien lu deux fois
      if (t.eds.length) { for (const [e, x] of await scryEditions(t.eds)) { edPut(e, x); if (x && !x.im) BND.noIm.add(e); } got = true; t = todo(); }
      for (const [l, m] of t.by) { for (const [e, u] of await scryEdLangImages([...m.keys()], l)) for (const k of m.get(e) || []) COLL.li[liKey(l, k + '|' + e)] = u; got = true; }
    } catch (e) { BND.edAt = Date.now(); }
    finally { BND.ed = null; if (got) collMetaSave(); }
    return got;
  })();
}
/** Section Échange (liste ou classeur) : images d'impressions qui manquent lues en arrière-plan, puis section repeinte et lien mis à jour (le visiteur voit les mêmes). */
function bndEdSoon() { bndEdLoad(bndEdOf((TR.st || trState()).have)).then(ch => { if (ch) { trRepaint(); trSoon(); } }, () => {}); }

/* ── Composant : le classeur ─────────────────────────────────────────────────────────────────────── */
const bndBig = u => String(u || '').replace('/small/', '/normal/');
const bndCov = c => (BND_COVERS.some(x => x[0] === c) ? c : 'nuit');
/** Pochette d'une carte : image (lettre et nom en attendant), pastilles ; foil : voile irisé sur l'image (binder.css) et pastille ✦ ; édition lue (« CMM 400 ») par les lecteurs d'écran. */
function bndCardHtml(x, i, mini) {
  const hue = hash32(x.k) % 360, nm = x.nm || x.n || '', im = mini ? x.sm || x.im : x.im;
  const lab = [nm, x.e ? edLabel(x.e) : '', x.foil ? T('Foil') : '', x.q > 1 ? '× ' + x.q : '', x.u > 0 ? fmt(x.u, 'EUR') : '', x.pin ? T('Épinglée') : ''].filter(Boolean).join(', ');
  return `<button type="button" class="bnd-card${x.foil ? ' foil' : ''}" data-i="${i}" data-k="${esc(x.k)}" aria-label="${esc(lab)}"${mini ? ' tabindex="-1"' : ''}><span class="bnd-art" style="--h:${hue}"><b>${esc((nm.trim()[0] || '?').toUpperCase())}</b><i>${esc(nm)}</i>${im ? `<img alt="" loading="lazy" decoding="async" draggable="false" src="${esc(im)}">` : ''}</span>`
    + (mini ? '' : `${x.pin || x.foil || x.q > 1 ? `<span class="bnd-tags">${x.pin ? `<span class="bnd-pin" title="${T('Épinglée')}">${BND_IC.pin}</span>` : ''}${x.foil ? `<span class="bnd-fo" title="${T('Foil')}"></span>` : ''}${x.q > 1 ? `<span class="bnd-q">×${x.q}</span>` : ''}</span>` : ''}${x.u > 0 ? `<span class="bnd-p">${esc(fmt(x.u, 'EUR'))}</span>` : ''}`) + '</button>';      // en haut à droite (sur le coût de mana, jamais sur le nom)
}
/**
 * Classeur dans un élément neuf, à placer dans la page. o : { open(i, items) : carte touchée, mini : aperçu des réglages (1re page, sans navigation) }.
 * api : { el, set(items, cover, ctx), fit() } ; items : [{ k, n, nm, im (normal), sm (petite), q, u, pin, l, e (édition 'cmm|400', '' sans), x (légende du viewer), big?, fix (illustration recherchée : telle quelle) }].
 */
function bndMake(o) {
  const el = document.createElement('div'); el.className = 'bnd' + (o.mini ? ' mini' : '');
  el.innerHTML = `<div class="bnd-cover"><div class="bnd-view"${o.mini ? ' aria-hidden="true"' : ` tabindex="0" role="group" aria-roledescription="${T('classeur')}" aria-label="${T('Classeur')}"`}><div class="bnd-track">${[-1, 0, 1].map(p => `<div class="bnd-sheet" data-pos="${p}"></div>`).join('')}</div></div></div>
    ${o.mini ? '' : `<div class="bnd-nav"><button type="button" class="icon-btn bnd-go" data-d="-1" aria-label="${T('Page précédente')}"><svg class="i"><use href="#i-back"/></svg></button><button type="button" class="bnd-ind" aria-haspopup="dialog" title="${T('Aller à une page')}"><span></span><svg class="i" aria-hidden="true"><use href="#i-chev"/></svg></button><button type="button" class="icon-btn bnd-go nx" data-d="1" aria-label="${T('Page suivante')}"><svg class="i"><use href="#i-back"/></svg></button><span class="bnd-sr" aria-live="polite"></span></div>`}`;
  const view = $('.bnd-view', el), track = $('.bnd-track', el), ind = $('.bnd-ind', el), sr = $('.bnd-sr', el);
  let sh = $$('.bnd-sheet', el), items = [], per = 1, v = 0, busy = null, drag = null, moved = false, warmT = 0, ctx = o.ctx || '';
  const pages = () => Math.max(1, Math.ceil(items.length / BND_PER)), views = () => Math.ceil(pages() / per);
  /** Une feuille = per pages de 9 pochettes ; seules les pochettes changées sont repeintes (pas d'image rechargée). */
  const fill = (s, vi) => {
    const none = vi < 0 || vi >= views(); s.hidden = none; if (none) return;
    while (s.children.length < per) s.insertAdjacentHTML('beforeend', `<div class="bnd-page" role="group">${'<div class="bnd-slot"></div>'.repeat(BND_PER)}</div>`);
    while (s.children.length > per) s.lastElementChild.remove();
    [...s.children].forEach((pg, pi) => {
      const p0 = (vi * per + pi) * BND_PER; pg.setAttribute('aria-label', T('Page {i} sur {n}', { i: vi * per + pi + 1, n: pages() }));
      [...pg.children].forEach((slot, j) => {
        const x = items[p0 + j], sig = x ? [x.k, x.l, x.e, x.im, x.q, x.u, x.pin ? 1 : 0, x.foil ? 1 : 0, x.nm, p0 + j].join('|') : '';
        if (slot.dataset.sig === sig) return;
        slot.dataset.sig = sig; slot.classList.toggle('empty', !x); slot.innerHTML = x ? bndCardHtml(x, p0 + j, o.mini) : '';
      });
    });
  };
  /** Images de la vue tout de suite, celles des voisines juste après (glisser sans attendre). */
  const warm = () => {
    clearTimeout(warmT); for (const im of $$('img', sh[1])) im.loading = 'eager';
    warmT = setTimeout(() => { for (const s of [sh[0], sh[2]]) for (const im of $$('img', s)) im.loading = 'eager'; }, 350);
  };
  const paint = () => {
    sh.forEach((s, i) => { s.dataset.pos = String(i - 1); s.inert = i !== 1; fill(s, v + i - 1); });      // inert : les pages voisines (hors écran) ne prennent ni le focus ni le lecteur d'écran
    if (ind) {
      const P = pages(), a = v * per + 1, b = Math.min(P, a + per - 1), say = a === b ? T('Page {i} sur {n}', { i: a, n: P }) : T('Pages {a} et {b} sur {n}', { a, b, n: P });
      ind.firstChild.textContent = a === b ? `${a} / ${P}` : `${a}–${b} / ${P}`; ind.setAttribute('aria-label', say + ' · ' + T('Aller à une page')); if (sr.textContent !== say) sr.textContent = say;      // lu une fois par page (glisser, flèches)
      el.classList.toggle('one', views() <= 1); for (const b2 of $$('.bnd-go', el)) b2.disabled = Number(b2.dataset.d) < 0 ? v <= 0 : v >= views() - 1;
    }
    if (ctx) BND.pg[ctx] = v * per;
    if (!o.mini) warm();
  };
  /** Deux pages face à face si la place le permet (re-calculé quand la fenêtre change). */
  const fit = () => {
    const w = (el.parentElement || el).clientWidth, np = !o.mini && w >= BND_SPREAD ? 2 : 1;
    if (np === per && el.style.getPropertyValue('--per')) return false;
    const first = v * per; per = np; el.style.setProperty('--per', per); el.classList.toggle('spread', per > 1); v = Math.floor(first / per);
    sh.forEach(s => { s.textContent = ''; }); return true;
  };
  const motion = () => !(typeof reduceMotion === 'function' && reduceMotion());
  /** Vue d'à côté (d = ±1) : la feuille voisine glisse en place, puis les trois feuilles tournent (une seule est repeinte). */
  const go = d => {
    if (busy) busy();
    const nv = Math.max(0, Math.min(views() - 1, v + d));
    if (nv === v) { track.style.transform = ''; return; }
    haptic('tap');
    const shift = () => {
      busy = null; track.classList.remove('anim'); track.style.transform = '';
      sh = d > 0 ? [sh[1], sh[2], sh[0]] : [sh[2], sh[0], sh[1]]; v = nv; paint();
    };
    if (!motion()) { shift(); return; }
    track.classList.add('anim'); track.style.transform = `translateX(${-d * (view.clientWidth + BND_GAP)}px)`;
    let t = 0; const done = () => { if (busy !== done) return; track.removeEventListener('transitionend', end); clearTimeout(t); shift(); }, end = e => { if (e.target === track) done(); };
    busy = done; track.addEventListener('transitionend', end); t = setTimeout(done, 480);
  };
  /** Page p (0 : la première) : la vue d'à côté glisse comme d'habitude ; plus loin, repeinte d'un coup (fondu court dans le sens du saut). */
  const jump = p => {
    if (busy) busy();      // page qui tournait : posée d'abord
    const nv = Math.max(0, Math.min(views() - 1, Math.floor(p / per)));
    if (nv === v) return;
    if (Math.abs(nv - v) === 1) { go(nv - v); return; }
    const d = nv > v ? 1 : -1; haptic('tap'); v = nv; track.style.transform = ''; paint();
    if (motion()) { const s = sh[1]; s.style.setProperty('--jd', d); s.classList.remove('jin'); void s.offsetWidth; s.classList.add('jin'); }
  };
  /** « Aller à la page » : une tuile par page (numéro, 1re carte), ou un curseur au-delà de BND_PKMAX pages (1re et dernière carte de la page visée) ; page affichée marquée. */
  const pick = () => {
    const P = pages(), a = v * per, nm = p => (items[p * BND_PER] || {}).nm || '', say = p => T('Page {i} sur {n}', { i: p + 1, n: P }) + (nm(p) ? ' · ' + nm(p) : '');
    haptic('tap');
    openSheet(T('Aller à la page'), TN(P, '{n} page', '{n} pages'), api => {
      api.wrap.classList.add('bnd-pk-w');
      const to = p => { api.close(); jump(p); };
      let first = null;
      if (P <= BND_PKMAX) {
        api.body.innerHTML = `<div class="bnd-pks">${Array.from({ length: P }, (_, p) => `<button type="button" class="bnd-pk" data-p="${p}" aria-label="${esc(say(p))}"${p >= a && p < a + per ? ' aria-current="page"' : ''}><b>${p + 1}</b><small>${esc(nm(p))}</small></button>`).join('')}</div>`;
        const ts = $$('.bnd-pk', api.body); first = ts[a];
        api.body.addEventListener('click', e => { const t = e.target.closest('.bnd-pk'); if (t) to(Number(t.dataset.p)); });
        api.body.addEventListener('keydown', e => {      // flèches : tuile voisine (haut, bas : même colonne) ; Début, Fin
          const i = ts.indexOf(document.activeElement); if (i < 0) return;
          const cols = Math.max(1, ts.filter(t => t.offsetTop === ts[0].offsetTop).length), j = { ArrowLeft: i - 1, ArrowRight: i + 1, ArrowUp: i - cols, ArrowDown: i + cols, Home: 0, End: ts.length - 1 }[e.key];
          if (j == null) return; e.preventDefault(); if (ts[j]) ts[j].focus();
        });
      } else {
        api.body.innerHTML = `<div class="bnd-pkr"><p class="bnd-pkv" aria-hidden="true"><b></b><span>/ ${P}</span></p><p class="bnd-pkn"></p>
          <div class="bnd-pkc"><button type="button" class="icon-btn" data-st="-1" aria-label="${T('Page précédente')}"><svg class="i"><use href="#i-back"/></svg></button><input type="range" class="bnd-rg" min="1" max="${P}" step="1" value="${a + 1}" aria-label="${T('Page')}"><button type="button" class="icon-btn nx" data-st="1" aria-label="${T('Page suivante')}"><svg class="i"><use href="#i-back"/></svg></button></div>
          <button type="button" class="btn block bnd-pkgo"></button></div>`;
        const rg = $('.bnd-rg', api.body), btn = $('.bnd-pkgo', api.body);
        const show = () => {
          const p = Number(rg.value) - 1, z = items[Math.min(items.length, (p + 1) * BND_PER) - 1];
          $('.bnd-pkv b', api.body).textContent = p + 1; $('.bnd-pkn', api.body).textContent = [nm(p), z && z.nm !== nm(p) ? z.nm : ''].filter(Boolean).join(' → ');
          rg.setAttribute('aria-valuetext', say(p)); btn.textContent = T('Aller à la page {i}', { i: p + 1 }); btn.classList.toggle('ghost', p >= a && p < a + per);      // la page affichée : bouton discret
        };
        rg.addEventListener('input', show);
        rg.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); to(Number(rg.value) - 1); } });
        api.body.addEventListener('click', e => { const st = e.target.closest('[data-st]'); if (st) { rg.value = String(Number(rg.value) + Number(st.dataset.st)); show(); } else if (e.target.closest('.bnd-pkgo')) to(Number(rg.value) - 1); });
        show(); first = rg;
      }
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => { if (first && first.isConnected) { first.focus({ preventScroll: true }); first.scrollIntoView({ block: 'nearest' }); } })));      // après le focus de la feuille (bouton Fermer)
    });
  };
  const snap = () => { if (!motion()) { track.style.transform = ''; return; } track.classList.add('anim'); track.style.transform = ''; setTimeout(() => { if (!busy) track.classList.remove('anim'); }, 360); };
  if (!o.mini) {
    // Glisser : la feuille suit le doigt à l'horizontale ; un geste vertical reste un défilement de la page (touch-action: pan-y).
    view.addEventListener('pointerdown', e => {
      moved = false; if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (busy) busy();
      drag = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId, h: false, dx: 0 };
      const art = e.target.closest && e.target.closest('.bnd-art'); if (art && typeof MO === 'object') { MO.press = art; MO.at = performance.now(); }      // la carte en grand part de cette pochette (motion.js)
    });
    view.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.h) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) { drag.h = true; track.classList.remove('anim'); try { view.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } }
        else { if (Math.abs(dy) > 10) drag = null; return; }
      }
      moved = true; const edge = (dx > 0 && v <= 0) || (dx < 0 && v >= views() - 1);
      drag.dx = edge ? dx / 3 : dx; track.style.transform = `translateX(${drag.dx}px)`;      // bord du classeur : la feuille résiste
    });
    const up = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const g = drag; drag = null; if (!g.h) return;
      const vel = g.dx / Math.max(1, e.timeStamp - g.t);
      if (e.type === 'pointerup' && (Math.abs(g.dx) > view.clientWidth * 0.18 || Math.abs(vel) > 0.45)) go(g.dx < 0 ? 1 : -1); else snap();
    };
    view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
    view.addEventListener('dragstart', e => e.preventDefault());      // souris : ni glisser-déposer d'une image, ni pointercancel au milieu du geste
    el.addEventListener('click', e => {
      if (moved) { moved = false; e.preventDefault(); e.stopPropagation(); return; }      // fin d'un glissement : pas une carte touchée
      if (e.target.closest('.bnd-ind')) { e.stopPropagation(); pick(); return; }
      const b = e.target.closest('.bnd-go'); if (b) { e.stopPropagation(); go(Number(b.dataset.d)); return; }
      const c = e.target.closest('.bnd-card'); if (c && o.open) { e.stopPropagation(); o.open(Number(c.dataset.i), items); }
    });
    view.addEventListener('keydown', e => {
      const d = { ArrowLeft: -1, ArrowRight: 1 }[e.key], end = { Home: 0, End: pages() - 1 }[e.key];
      if (!d && end == null) return;
      e.preventDefault(); e.stopPropagation(); if (e.target !== view) view.focus({ preventScroll: true });      // le focus ne reste pas sur une carte de la page qui s'en va
      if (d) go(d); else jump(end);
    });
    track.addEventListener('animationend', e => { if (e.animationName === 'bndjump') e.target.classList.remove('jin'); });
  }
  // images : chargées (fondu) ou en échec (la lettre et le nom restent) ; les écrans qui accueillent le classeur font pareil, ceci couvre la feuille des réglages
  el.addEventListener('load', e => { if (e.target.tagName === 'IMG') e.target.classList.add('ok'); }, true);
  el.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.remove(); }, true);
  const api = {
    el,
    /** cx : mémoire de la vue (« o:have », « p:want »…) ; un autre onglet reprend là où il en était. */
    set(list, cover, cx) {
      items = o.mini ? (list || []).slice(0, BND_PER) : list || []; el.dataset.cover = bndCov(cover);
      BND.live.add(api); fit();
      if (cx != null && cx !== ctx) { ctx = cx; v = Math.floor((BND.pg[ctx] || 0) / per); }
      v = Math.max(0, Math.min(views() - 1, v));
      paint();
    },
    fit() { if (fit()) paint(); },
  };
  return api;
}
// fenêtre redimensionnée : une ou deux pages par vue (classeurs encore affichés seulement)
if (typeof addEventListener === 'function') addEventListener('resize', () => { clearTimeout(BND.rt); if (!BND.live.size) return; BND.rt = setTimeout(() => { for (const b of [...BND.live]) { if (b.el.isConnected) b.fit(); else BND.live.delete(b); } }, 150); });
/** Carte touchée : la carte en grand, avec ses voisines du classeur (60 de chaque côté) ; une pochette foil s'y montre foil ; une pochette avec édition, son impression exacte (zoomEd). */
function bndOpen(i, items) {
  const a = Math.max(0, i - 60), list = items.slice(a, i + 61).map(x => ({ ...(x.e && !x.fix ? zoomEd(x.k, x.nm, x.n, x.l, x.e, x.sm || x.im, x.x)
    : x.sm || x.im ? { key: x.k, name: x.nm, ln: x.n, wl: !x.fix && x.l && x.l !== 'en' ? x.l : '', small: x.sm || x.im, ...(x.big ? { big: x.big } : {}), lang: x.l || 'en', plain: true, extra: x.x || '' }
    : zoomNamed(x.k, x.nm, x.n, x.l, x.x)), ...(x.foil ? { foil: true } : {}) }));      // foil : étincelles de la carte en grand
  openCardViewer(list, i - a);
}

/* ── Section Échange du propriétaire ─────────────────────────────────────────────────────────────── */
/** Clés de tri d'une entrée : nom affiché, prix, couleurs et type (fiche Scryfall), extension (son édition e, sinon une édition de la carte dans cette langue, ou l'illustration recherchée). */
function bndKey(k, n, l, lines, u, p, ed) {
  const m = dmOf(k) || {}; let sk = '', num = '';
  if (lines) {
    const e = ed || lineEd((lines.find(([x]) => lineLang(x) === (l || '') && lineEd(x)) || lines.find(([x]) => lineEd(x)) || [''])[0]);
    if (e) { const s = edSet(e); sk = (typeof setName === 'function' && setName(s)) || (COLL.ed[e] || {}).sn || s.toUpperCase(); num = edNum(e); }
  } else if (p && p.w) { const r = /^(.*?)\s*·\s*([A-Za-z0-9]{2,6})\s+(\S+)$/.exec(p.w); if (r) { sk = r[1] || r[2].toUpperCase(); num = r[3]; } }      // « Extension · CODE 123 »
  return { k, n, nm: (l && frName(k, l)) || n, u, cl: m.cl, tl: m.tl, cm: m.cm, sk, num };
}
/** Lignes de l'onglet (tradeView : u = prix à l'unité) → pochettes dans l'ordre du classeur ; une pochette par langue et par édition pour les doublons, comme le lien (ses foil à part, juste après). */
function bndOwnItems(rows, want) {
  const c = bndCfg(), NC = typeof NAME_CMP === 'function' ? NAME_CMP : null;
  if (want) {
    const es = rows.map(x => { const it = trItem(x.k, x.n, x.q, ''), sm = x.p ? scrySmall(x.p.i) : it.im || ''; return { ...bndKey(x.k, x.n, '', null, x.u, x.p), nm: it.n, q: x.q, l: x.p && x.p.l || '', sm, im: bndBig(sm), ...(x.p ? { big: x.p.i, fix: true } : {}) }; });
    return bndArrange(es, c.s, [], NC);
  }
  const es = rows.flatMap(x => langEdLines(x.lines).map(([l, e, q, fo]) => { const it = trItem(x.k, x.n, q, l), sm = bndImg(x.k, l, e, it.im); return { ...bndKey(x.k, x.n, l, x.lines, x.u, null, e), q, fo, l, e, sm, im: bndBig(sm), pin: c.k.includes(x.k) }; }));
  return bndFoil(bndArrange(es, c.s, c.k, NC));      // rangées par langue et édition (l'ordre du lien), les foil séparées ensuite : le même classeur chez le visiteur
}
/**
 * Partage de la liste (trPayload) : classeur réglé → cartes du partage réordonnées SUR PLACE (doublons : épinglées puis tri ; recherchées : tri), réglages
 * renvoyés (bd, écrits dans d) ; jamais réglé → null, partage inchangé. have / want : cartes de trCard, dans l'ordre de st.have (une par langue et édition) / st.want.
 */
function bndPayload(st, have, want) {
  const c = bndCfg(); if (!c.u) return null;
  const NC = typeof NAME_CMP === 'function' ? NAME_CMP : null;
  const put = (arr, keys, pins) => { if (keys.length !== arr.length) return; const was = arr.slice(); bndArrange(keys.map((e, i) => ({ ...e, i })), c.s, pins, NC).forEach((e, j) => { arr[j] = was[e.i]; }); };
  put(have, st.have.flatMap(x => langEdLines(x.lines).map(([l, e]) => bndKey(x.k, x.n, l, x.lines, trPrice(x.k), null, e))), c.k);
  put(want, st.want.map(x => bndKey(x.k, x.n, '', null, trPrice(x.k), x.p)), []);
  return { c: c.c, s: c.s, k: c.k, u: c.u };
}
/** Ligne des outils en mode classeur : « Personnaliser » (le tri et « ≥ X € » de la liste n'y servent pas). */
const bndToolsHtml = () => `<button class="btn ghost small bnd-cust" type="button" data-act="bndset"><svg class="i"><use href="#i-edit"/></svg>${T('Personnaliser')}</button>`;
/** Classeur de la section (après chaque peinture, trMount) : interrupteur, classeur gardé d'une peinture à l'autre (les images ne clignotent pas). */
function bndOwnMount(host) {
  bndSwitchMount($('#trView', host), 'o', bndView('o'), () => collPaintBody(true));
  bndEdSoon();      // images des impressions exactes (pochettes, vignettes de la liste) qui manquent
  const spot = $('#trBnd', host), V = TR.bv; if (!spot || !V) return;
  const b = BND.own || (BND.own = bndMake({ open: bndOpen }));
  spot.replaceWith(b.el);
  b.set(bndOwnItems(V.list, V.want), bndCfg().c, 'o:' + (V.want ? 'want' : 'have'));
}

/* ── « Mon classeur » : couleur, tri, cartes épinglées ───────────────────────────────────────────── */
function bndOpenSettings() {
  const st = TR.st || trState();
  const cards = st.have.map(x => { const ll = langLines(x.lines), l = ll[0] ? ll[0][0] : '', it = trItem(x.k, x.n, x.q, l); return { k: x.k, n: x.n, nm: it.dn || it.n, fn: it.fn || '', sm: bndThumb(x, l, it.im).src, u: trPrice(x.k) }; });
  const byK = new Map(cards.map(c => [c.k, c]));
  openSheet(T('Mon classeur'), T('Ce que voient les visiteurs de ton lien en mode classeur'), api => {
    api.wrap.classList.add('bnd-sheet-w');
    api.body.innerHTML = `<div class="bnd-set-top"><div class="bnd-mini-host"></div>
        <div class="bnd-set-cov"><span class="label">${T('Couleur du classeur')}</span><div class="bnd-covers" role="radiogroup" aria-label="${T('Couleur du classeur')}">${BND_COVERS.map(([id, nm]) => `<button type="button" class="bnd-cv" data-c="${id}" role="radio" aria-checked="false" aria-label="${esc(T(nm))}" title="${esc(T(nm))}"></button>`).join('')}</div><b class="bnd-cvn"></b></div></div>
      <div class="bnd-set-sec"><span class="label">${T('Trier les autres cartes')}</span><div class="seg bnd-sorts" id="bndSort" role="radiogroup" aria-label="${T('Trier les autres cartes')}"></div></div>
      <div class="bnd-set-sec"><span class="label bnd-pin-h"></span><div class="bnd-pins"></div>
        <label class="fsearch bnd-find"><svg class="i" aria-hidden="true"><use href="#i-search"/></svg><input type="search" id="bndQ" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" placeholder="${T('Épingler une carte de ta liste')}" aria-label="${T('Épingler une carte de ta liste')}"></label>
        <p class="hint bnd-sug-h"></p><div class="ca-list bnd-sug" role="listbox" aria-label="${T('Suggestions')}"></div></div>
      <p class="hint bnd-note">${TR.share ? T('Visible par tous ceux qui ont ton lien, en mode classeur.') : T('Crée le lien public pour montrer ton classeur à tes amis.')}</p>`;
    const mini = bndMake({ mini: true }), q = $('#bndQ', api.body);
    $('.bnd-mini-host', api.body).appendChild(mini.el);
    const thumb = c => `<span class="thumb" style="--h:${hash32(c.k) % 360}">${esc((c.nm.trim()[0] || '?').toUpperCase())}${c.sm ? `<img alt="" loading="lazy" decoding="async" src="${esc(c.sm)}">` : ''}</span>`;
    const paint = () => {
      const c = bndCfg();
      mini.set(bndOwnItems(tradeView(st.have, { price: trPrice }).rows, false), c.c);
      for (const b of $$('.bnd-cv', api.body)) b.setAttribute('aria-checked', String(b.dataset.c === c.c));
      $('.bnd-cvn', api.body).textContent = T((BND_COVERS.find(x => x[0] === c.c) || BND_COVERS[0])[1]);
      $('.bnd-pin-h', api.body).textContent = T('Cartes épinglées en tête') + ' · ' + c.k.length + '/' + BND_PINS;
      $('.bnd-pins', api.body).innerHTML = c.k.map((k, i) => { const x = byK.get(k), nm = x ? x.nm : k;
        return `<div class="crow bnd-pinr${x ? '' : ' gone'}" data-k="${esc(k)}">${thumb(x || { k, nm, sm: '' })}<span class="row-main"><span class="row-name">${esc(nm)}</span>${x ? (x.u > 0 ? `<span class="row-meta"><span class="tag">${esc(fmt(x.u, 'EUR'))}</span></span>` : '') : `<span class="row-meta"><span class="tag warn">${T('plus dans ta liste')}</span></span>`}</span>
          <span class="bnd-pina"><button type="button" class="icon-btn" data-pa="up" aria-label="${esc(T('Monter {name}', { name: nm }))}"${i ? '' : ' disabled'}><svg class="i up"><use href="#i-chev"/></svg></button><button type="button" class="icon-btn" data-pa="down" aria-label="${esc(T('Descendre {name}', { name: nm }))}"${i < c.k.length - 1 ? '' : ' disabled'}><svg class="i dn"><use href="#i-chev"/></svg></button><button type="button" class="icon-btn" data-pa="del" aria-label="${esc(T('Désépingler {name}', { name: nm }))}"><svg class="i"><use href="#i-close"/></svg></button></span></div>`; }).join('');
      sug();
    };
    /** Suggestions : les cartes de la liste qui correspondent à la recherche (nom affiché, anglais ou français), sinon les plus chères ; jamais celles déjà épinglées. */
    const sug = () => {
      const c = bndCfg(), qq = normPart(q.value || ''), full = c.k.length >= BND_PINS, h = $('.bnd-sug-h', api.body), box = $('.bnd-sug', api.body);
      let list = cards.filter(x => !c.k.includes(x.k));
      if (qq) list = list.filter(x => normPart(x.nm).includes(qq) || normPart(x.n).includes(qq) || (x.fn && normPart(x.fn).includes(qq)));
      else list = list.slice().sort((a, b) => (b.u || 0) - (a.u || 0));
      list = list.slice(0, 6);
      h.textContent = !cards.length ? T('Rien à épingler : aucune carte à échanger pour l\'instant.') : full ? T('{max} cartes épinglées au plus (deux pages).', { max: BND_PINS }) : qq ? (list.length ? '' : T('Aucune carte de ta liste ne correspond.')) : list.length ? T('Tes cartes les plus chères :') : '';
      h.hidden = !h.textContent; q.disabled = full || !cards.length;
      box.innerHTML = full ? '' : list.map(x => `<button type="button" class="ca-opt bnd-opt" role="option" data-k="${esc(x.k)}" aria-label="${esc(T('Épingler {name}', { name: x.nm }))}">${thumb(x)}<span class="bnd-opt-n">${esc(x.nm)}${x.u > 0 ? `<small>${esc(fmt(x.u, 'EUR'))}</small>` : ''}</span><i>${BND_IC.pin}</i></button>`).join('');
    };
    mountSeg($('#bndSort', api.body), BND_SORTS.map(([v, l]) => ({ v, label: T(l) })), bndCfg().s, v => { bndChanged({ s: v }); paint(); });
    q.addEventListener('input', sug);
    api.body.addEventListener('load', e => { if (e.target.tagName === 'IMG') e.target.classList.add('ok'); }, true);
    api.body.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.remove(); }, true);
    api.body.addEventListener('click', e => {
      const cv = e.target.closest('.bnd-cv'); if (cv) { haptic('tap'); bndChanged({ c: cv.dataset.c }); paint(); return; }
      const op = e.target.closest('.bnd-opt'); if (op) { const k = bndCfg().k; if (k.length < BND_PINS && !k.includes(op.dataset.k)) { haptic('ok'); bndChanged({ k: [...k, op.dataset.k] }); q.value = ''; paint(); } return; }
      const pa = e.target.closest('[data-pa]'); if (!pa) return;
      const k = bndCfg().k.slice(), i = k.indexOf(pa.closest('.bnd-pinr').dataset.k); if (i < 0) return;
      if (pa.dataset.pa === 'del') k.splice(i, 1);
      else { const j = pa.dataset.pa === 'up' ? i - 1 : i + 1; if (j < 0 || j >= k.length) return; [k[i], k[j]] = [k[j], k[i]]; }
      const key = pa.closest('.bnd-pinr').dataset.k, how = pa.dataset.pa;
      haptic('tap'); bndChanged({ k }); paint();
      const r = how !== 'del' && $$('.bnd-pinr', api.body).find(x => x.dataset.k === key), f = r && ($(`[data-pa="${how}"]:not([disabled])`, r) || $('[data-pa]:not([disabled])', r));
      if (f) f.focus({ preventScroll: true });      // flèches : le clavier suit la carte déplacée
    });
    paint();
  });
}

/* ── Page publique (visiteur, aperçu du propriétaire) ───────────────────────────────────────────── */
/** À l'ouverture : ordre du classeur gardé à part (sh.bo) ; liste du visiteur remise par nom anglais si le propriétaire a publié son classeur (comme avant). */
function bndTake(sh) {
  if (!sh || sh.bo) return sh;
  const NC = typeof NAME_CMP === 'function' ? NAME_CMP : null, pins = sh.bd ? sh.bd.k : [];
  if (sh.bd) {
    sh.bo = { have: sh.have, want: sh.want };
    const by = (a, b) => a.n.localeCompare(b.n, 'en') || lineRank(a.l) - lineRank(b.l);
    sh.have = sh.have.slice().sort(by); sh.want = sh.want.slice().sort(by);
  } else {
    const ord = a => bndArrange(a.map((x, i) => ({ k: x.k, nm: x.dn || x.n, i })), 'name', [], NC).map(e => a[e.i]);
    sh.bo = { have: ord(sh.have), want: ord(sh.want) };
  }
  sh.bpin = new Set(pins);
  return sh;
}
/**
 * Peinture d'un onglet complet (paint de openPublicTrade) : barre « n cartes » + interrupteur, puis le classeur s'il est choisi.
 * all : cartes de l'onglet (pubItem), list : après filtres. Retourne true si le classeur est affiché (la liste ne l'est pas). all null : onglet « Pour toi » (barre cachée).
 */
function bndPub(P, wrap, all, list) {
  const bar = $('#pubBar', wrap); if (!bar) return false;
  bar.hidden = !all; if (!all) return false;
  bndTake(P.sh);
  if (!bar.firstChild) {
    bar.innerHTML = `<span class="bnd-cnt"></span>${bndSwitchHtml('pubView')}`;
    bndSwitchMount($('#pubView', bar), 'p', bndView('p', P.sh.bd && P.sh.bd.u ? 'binder' : 'list'), () => { P.shown = TR_PAGE; P.paint(true); });      // la page ne remonte pas
  }
  const q = list.reduce((a, x) => a + x.q, 0), n = pubN(list);      // cartes par langue : une carte en deux éditions compte une fois, comme avant
  $('.bnd-cnt', bar).textContent = (filterActive(P.f) ? TN(n, '{n} carte sur {total}', '{n} cartes sur {total}', { total: nf0(pubN(all)) }) : TN(n, '{n} carte', '{n} cartes')) + ' · ' + TN(q, '{n} exemplaire', '{n} exemplaires');
  if (bndView('p', P.sh.bd && P.sh.bd.u ? 'binder' : 'list') !== 'binder' || !list.length) return false;
  const want = P.sub === 'want', items = bndFoil(filterItems(P.sh.bo[want ? 'want' : 'have'].map(pubItem), P.f).map(it => ({      // mêmes filtres que la liste, dans l'ordre du classeur ; foil à part
    k: it.k, n: it.n, nm: it.dn || it.n, l: it.l || '', e: want ? '' : it.e || '', q: it.q, fo: want ? 0 : it.fo, u: trPrice(it.k), sm: it.im || '', im: bndBig(it.im), pin: !want && P.sh.bpin.has(it.k), fix: !!it.pw, pw: it.pw || '' })))
    .map(it => ({ ...it, x: TN(it.q, '{n} exemplaire', '{n} exemplaires') + (it.l ? ' · ' + (LANGS[it.l] || it.l) : '') + (it.foil ? ' · ' + T('Foil') + ' ✦' : '') + (it.pw ? ' · ' + T('illustration {name}', { name: it.pw }) : '') }));
  const b = P.bnd || (P.bnd = bndMake({ open: bndOpen })), main = $('.pub-main', wrap);
  if (b.el.parentElement !== main) { main.textContent = ''; main.appendChild(b.el); } else for (const n of [...main.children]) if (n !== b.el) n.remove();
  b.set(items, P.sh.bd ? P.sh.bd.c : 'nuit', 'p:' + P.sub);
  if (items.some(x => x.u > 0)) main.insertAdjacentHTML('beforeend', pubNote());
  return true;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { bndArrange, bndClean, bndColorRank, bndFoil, BND_COVERS, BND_SORTS, BND_PINS };
