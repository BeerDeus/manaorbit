/* ── filters.js : recherche + filtres couleur / famille / coût (deck viewer et collection) ───────────────────── */
const COLOR_DEF = [['W', T('Blanc')], ['U', T('Bleu')], ['B', T('Noir')], ['R', T('Rouge')], ['G', T('Vert')], ['C', T('Incolore')]];      // noms traduits (affichage seulement : la lettre sert de valeur)
/* set : code d'extension, '-' : lignes sans édition. Filtres avancés de la collection (search.js, core.js › FLT_ADV) : lang (langues), foil ('f' | 'n'), rar (raretés),
   px (tranche de prix à l'unité), place (emplacement, '-' : non rangées), dup (doublons), dk ('in' | 'out' : dans un deck ou non), tr (à l'échange), add ('7' | '30' : ajoutées depuis n jours). */
const newFilter = () => ({ q: '', colors: new Set(), type: '', cmc: '', cmdr: '', set: '', lang: new Set(), foil: '', rar: new Set(), px: '', place: '', dup: false, dk: '', tr: false, add: '' });
const filterCount = f => (f.colors.size ? 1 : 0) + (f.type ? 1 : 0) + (f.cmc !== '' && f.cmc != null ? 1 : 0) + (f.cmdr ? 1 : 0) + (f.set ? 1 : 0) + fltAdvCount(f);
/** Remet tous les filtres à zéro, sur place (la recherche texte reste : son champ a son propre ✕). keepPlace : l'emplacement ouvert reste (« Effacer les filtres » :
 *  on reste dans le classeur ouvert depuis Rangement, son bandeau a son propre ✕). */
function fltClear(f, keepPlace) {
  f.colors.clear(); f.type = ''; f.cmc = ''; f.cmdr = ''; f.set = '';
  for (const k of FLT_ADV) { if (keepPlace && k === 'place') continue; if (f[k] instanceof Set) f[k].clear(); else if (k in f) f[k] = typeof f[k] === 'boolean' ? false : ''; }
}

/** Symboles de mana « {2}{W}{U} » → pastilles colorées (hybride : première couleur, Phyrexian et X : lettre). */
function manaHtml(mc) {
  const out = [];
  for (const m of String(mc || '').matchAll(/\{([^}]+)\}/g)) {
    const t = m[1].toUpperCase(), c = (t.match(/[WUBRG]/) || [])[0];
    out.push(`<i class="mc mc-${t === 'C' ? 'c' : /^\d+$/.test(t) || t === 'X' || t === 'S' ? 'n' : (c || 'n').toLowerCase()}">${esc(/^\d+$/.test(t) || t === 'X' ? t : (c || t[0] || ''))}</i>`);
  }
  return out.join('');
}

/**
 * Monte la barre dans root : champ de recherche, bouton « Filtres » (pastille = nombre de filtres actifs) et panneau
 * (couleurs, familles, coût ; opts.commander : « Commander » ; opts.sets() : extensions présentes [[code, nom, cartes]], avec « Sans édition » en tête si n'importe quelle carte en manque). f est modifié en place ; onChange() suit chaque changement (la saisie est lissée à 120 ms).
 * Retourne { paint, reset }.
 */
function mountFilters(root, f, onChange, opts = {}) {
  const ext = opts.ext || null;      // collection (search.js › srchExt) : « Plus de filtres » (groupes avancés), pastilles des filtres actifs et recherches enregistrées sous la barre
  root.className = 'fbar';
  root.innerHTML = `<div class="fbar-row">
      <label class="fsearch"><svg class="i" aria-hidden="true"><use href="#i-search"/></svg><input type="search" inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(opts.placeholder || T('Rechercher une carte'))}" aria-label="${T('Rechercher une carte')}"><button type="button" class="fclear" aria-label="${T('Effacer la recherche')}" hidden><svg class="i"><use href="#i-close"/></svg></button></label>
      <button class="fbtn" type="button" aria-expanded="false"><svg class="i" aria-hidden="true"><use href="#i-sliders"/></svg><span>${T('Filtres')}</span><b hidden></b></button></div>
    <div class="fpanel" hidden>
      ${opts.commander ? `<div class="fgrp"><span class="fgl">Commander</span><div class="fopts" role="group" aria-label="Commander"><button type="button" class="fopt" data-x="can" aria-pressed="false">${T('Peuvent l\'être')}</button>${typeof edhOff === 'function' && edhOff('edhrec') ? '' : `<button type="button" class="fopt" data-x="played" aria-pressed="false">${T('Joués en commandant')}</button>`}</div></div>` : ''}
      <div class="fgrp"><span class="fgl">${T('Couleur')}</span><div class="fcols" role="group" aria-label="${T('Couleurs')}">${COLOR_DEF.map(([c, n]) => `<button type="button" class="fcol mc-${c.toLowerCase()}" data-c="${c}" aria-pressed="false" aria-label="${n}" title="${n}">${c}</button>`).join('')}</div></div>
      <div class="fgrp"><span class="fgl">${T('Famille')}</span><div class="fopts" role="group" aria-label="${T('Familles')}">${TYPE_ORDER.map(t => `<button type="button" class="fopt" data-t="${esc(t)}" aria-pressed="false">${esc(T(t))}</button>`).join('')}</div></div>
      <div class="fgrp"><span class="fgl">${T('Coût de mana')}</span><div class="fopts cmcs" role="group" aria-label="${T('Coût converti')}">${[0, 1, 2, 3, 4, 5, 6, 7].map(m => `<button type="button" class="fopt" data-m="${m}" aria-pressed="false">${m === 7 ? '7+' : m}</button>`).join('')}</div></div>
      ${opts.sets ? `<div class="fgrp"><span class="fgl">${T('Extension')}</span><button type="button" class="sortsel fset" aria-haspopup="dialog"><span class="fset-ic"></span><b></b></button></div>` : ''}
      ${ext ? `<button type="button" class="fmore" aria-expanded="false" aria-controls="${ext.id}"><span>${T('Plus de filtres')}</span><b hidden></b><svg class="i" aria-hidden="true"><use href="#i-chev"/></svg></button><div class="fmore-box" id="${ext.id}" hidden></div>` : ''}
      <button class="link-btn link-inline freset" type="button">${T('Effacer les filtres')}</button></div>${ext ? '<div class="fext"></div>' : ''}`;
  const inp = root.querySelector('input'), clr = root.querySelector('.fclear'), btn = root.querySelector('.fbtn'), panel = root.querySelector('.fpanel'), badge = btn.querySelector('b'), sel = root.querySelector('.fset');
  const more = root.querySelector('.fmore'), mbox = root.querySelector('.fmore-box'), xbox = root.querySelector('.fext');
  let msig = null;
  const moreFill = () => { if (!ext || mbox.hidden) return; const s = ext.sig(); if (s === msig) return; msig = s; mbox.innerHTML = ext.groups(f); };      // groupes avancés (langues présentes, emplacements…) : repeints quand ils changent
  const moreSet = open => { if (!ext) return; mbox.hidden = !open; more.setAttribute('aria-expanded', String(open)); if (open) moreFill(); if (ext.open) ext.open(open); };
  const setOpts = () => {      // bouton « Extension » : celle choisie (symbole, nom) ; la fiche des extensions s'ouvre au toucher (fsetSheet)
    if (!sel) return; const c = f.set || '';
    $('.fset-ic', sel).innerHTML = c && c !== '-' && typeof setIcHtml === 'function' ? setIcHtml(c) : '';
    $('b', sel).textContent = !c ? T('Toutes') : c === '-' ? T('Sans édition') : (typeof setName === 'function' && setName(c)) || c.toUpperCase();
    sel.setAttribute('aria-label', T('Extension : {name}', { name: $('b', sel).textContent }));
  };
  let t = 0;
  const paint = () => {
    const n = filterCount(f);
    badge.hidden = !n; badge.textContent = n; btn.classList.toggle('on', n > 0);
    clr.hidden = !inp.value;
    for (const b of root.querySelectorAll('.fcol')) b.setAttribute('aria-pressed', String(f.colors.has(b.dataset.c)));
    for (const b of root.querySelectorAll('[data-t]')) b.setAttribute('aria-pressed', String(f.type === b.dataset.t));
    for (const b of root.querySelectorAll('[data-x]')) b.setAttribute('aria-pressed', String(f.cmdr === b.dataset.x));
    for (const b of root.querySelectorAll('[data-m]')) b.setAttribute('aria-pressed', String(f.cmc !== '' && f.cmc != null && Number(b.dataset.m) === f.cmc));
    root.querySelector('.freset').hidden = !(n - (f.place ? 1 : 0));      // l'emplacement seul : son bandeau a son ✕
    setOpts();
    if (ext) {
      if (inp.value !== (f.q || '') && document.activeElement !== inp) { inp.value = f.q || ''; clr.hidden = !inp.value; }      // recherche enregistrée appliquée : son texte dans le champ
      moreFill();
      for (const b of mbox.querySelectorAll('[data-fk]')) { const v = f[b.dataset.fk]; b.setAttribute('aria-pressed', String(v instanceof Set ? v.has(b.dataset.fv) : typeof v === 'boolean' ? v : v === b.dataset.fv)); }
      const na = fltAdvCount(f), mb = more.querySelector('b'); mb.hidden = !na; mb.textContent = na;
      ext.paint(xbox, f, api);
    }
  };
  const fire = () => { paint(); onChange(); };
  inp.addEventListener('input', () => { f.q = inp.value; clr.hidden = !inp.value; clearTimeout(t); t = setTimeout(onChange, 120); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  clr.onclick = () => { inp.value = ''; f.q = ''; fire(); inp.focus(); };
  btn.onclick = () => {
    const open = panel.hidden; if (open) { setOpts(); if (ext && fltAdvCount(f) && mbox.hidden) moreSet(true); }      // un filtre avancé actif : ses groupes s'ouvrent avec le panneau
    panel.hidden = !open; btn.setAttribute('aria-expanded', String(open)); haptic('tap'); if (open && sel && typeof tipSoon === 'function') tipSoon(400);      // astuce (tour.js) : le filtre Extension
  };
  if (sel) sel.addEventListener('click', () => { haptic('tap'); fsetSheet(opts.sets() || [], f.set || '', c => { f.set = c; fire(); }, opts.setsSub); });
  panel.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.c) { if (f.colors.has(b.dataset.c)) f.colors.delete(b.dataset.c); else f.colors.add(b.dataset.c); }
    else if (b.dataset.t) f.type = f.type === b.dataset.t ? '' : b.dataset.t;
    else if (b.dataset.m) { const m = Number(b.dataset.m); f.cmc = f.cmc === m ? '' : m; }
    else if (b.dataset.x) f.cmdr = f.cmdr === b.dataset.x ? '' : b.dataset.x;
    else if (b.dataset.fk && b.dataset.fk in f) {      // groupes avancés : Set → plusieurs valeurs (ou) ; booléen → bascule ; texte → une valeur, re-toucher l'enlève
      const k = b.dataset.fk, v = b.dataset.fv, cur = f[k];
      if (cur instanceof Set) { if (cur.has(v)) cur.delete(v); else cur.add(v); } else if (typeof cur === 'boolean') f[k] = !cur; else f[k] = cur === v ? '' : v;
    }
    else if (b === more) { moreSet(mbox.hidden); haptic('tap'); return; }
    else if (b.classList.contains('freset')) fltClear(f, true);
    else return;
    haptic('tap'); fire();
  });
  inp.value = f.q || '';      // écran rouvert : la recherche en cours reste écrite (elle filtre toujours la liste)
  if (ext && ext.moreOpen && ext.moreOpen()) moreSet(true);      // « Plus de filtres » ouvert la dernière fois : il le reste
  const api = { paint, fire, reset() { f.q = ''; fltClear(f); inp.value = ''; paint(); } };
  paint();
  return api;
}
/** Fiche « Extension » (filtre) : recherche en haut (nom, code, année), « Toutes », « Sans édition », puis chaque extension avec son symbole, son code, son année
 *  et son nombre de cartes, de la plus récente à la plus ancienne. list : [[code, nom, cartes]] (« - » : sans édition) ; onPick(code) ('' : toutes) ; sub(n) : sous-titre. */
function fsetSheet(list, cur, onPick, sub) {
  const n = list.filter(x => x[0] !== '-').length;
  openSheet(T('Extension'), sub ? sub(n) : TN(n, '{n} extension dans ta collection', '{n} extensions dans ta collection'), api => {
    api.wrap.classList.add('fset-sheet');
    const t = esc(T('Chercher une extension'));
    api.body.innerHTML = `<label class="fsearch fs-q"><svg class="i" aria-hidden="true"><use href="#i-search"/></svg><input type="search" inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${t}" aria-label="${t}"></label><div class="fs-list" role="radiogroup" aria-label="${esc(T('Extension'))}"></div>`;
    const inp = $('input', api.body), box = $('.fs-list', api.body), all = list.reduce((a, x) => a + x[2], 0);
    const has = list.some(x => x[0] === cur), rows = cur && !has ? [[cur, '', 0], ...list] : list;      // celle choisie reste proposée même si ses cartes sont parties
    const row = (c, name, sub, n, ic) => `<button type="button" class="fs-row" role="radio" data-c="${esc(c)}" aria-checked="${c === cur}"><span class="fs-ic">${ic || ''}</span><span class="fs-n"><b>${esc(name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${n ? `<em>${nf0(n)}</em>` : ''}</button>`;
    const paint = () => {
      const q = inp.value.trim(), hit = c => !q || (typeof edHit === 'function' ? edHit({ sn: (typeof setName === 'function' && setName(c)) || '', set: c, y: (typeof setDate === 'function' ? setDate(c) : '').slice(0, 4), num: '' }, q) : c.includes(q.toLowerCase()));
      const sd = c => (typeof setDate === 'function' ? setDate(c) : ''), sn = (c, n) => (typeof setName === 'function' && setName(c)) || n || c;
      const sets = rows.filter(([c]) => c !== '-' && hit(c)).sort((a, b) => sd(b[0]).localeCompare(sd(a[0])) || sn(a[0], a[1]).localeCompare(sn(b[0], b[1])));      // retriées à chaque repeint : dates des extensions arrivées après l'ouverture (setIcLoad)
      box.innerHTML = (q ? '' : row('', T('Toutes les extensions'), '', all, '<i class="fs-all" aria-hidden="true"></i>') + (rows.some(x => x[0] === '-') ? row('-', T('Sans édition'), '', (rows.find(x => x[0] === '-') || [])[2], '<i class="fs-none" aria-hidden="true"></i>') : ''))
        + sets.map(([c, n, k]) => { const y = typeof setDate === 'function' ? setDate(c).slice(0, 4) : ''; return row(c, (typeof setName === 'function' && setName(c)) || n || c.toUpperCase(), [c.toUpperCase(), y].filter(Boolean).join(' · '), k, typeof setIcHtml === 'function' ? setIcHtml(c) : ''); }).join('')
        + (q && !sets.length ? `<p class="hint listempty">${T('Aucune extension ne correspond.')}</p>` : '');
    };
    box.addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; haptic('tap'); api.close(); onPick(b.dataset.c); });
    inp.addEventListener('input', paint); inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
    paint();
    if (typeof SETIC !== 'undefined' && !SETIC.m && typeof setIcLoad === 'function') setIcLoad(() => { if (sheets.includes(api)) paint(); });      // symboles et noms pas encore lus
    requestAnimationFrame(() => { const on = $('[aria-checked="true"]', box); if (on && cur) on.scrollIntoView({ block: 'center' }); });
  });
}
