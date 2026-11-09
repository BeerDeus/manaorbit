/* ── filters.js : recherche + filtres couleur / famille / coût (deck viewer et collection) ───────────────────── */
const COLOR_DEF = [['W', T('Blanc')], ['U', T('Bleu')], ['B', T('Noir')], ['R', T('Rouge')], ['G', T('Vert')], ['C', T('Incolore')]];      // noms traduits (affichage seulement : la lettre sert de valeur)
/* set : code d'extension, '-' : lignes sans édition. Filtres avancés de la collection (search.js, core.js › FLT_ADV) : lang (langues), foil ('f' | 'n'), rar (raretés),
   px (tranche de prix à l'unité), place (emplacement, '-' : non rangées), dup (doublons ; dupN : exemplaires au moins, 2 par défaut), dk ('in' | 'out' : dans un deck ou non), tr (à l'échange), add ('7' | '30' : ajoutées depuis n jours). */
const newFilter = () => ({ q: '', colors: new Set(), type: '', cmc: '', cmdr: '', set: '', lang: new Set(), foil: '', rar: new Set(), sty: new Set(), px: '', place: '', dup: false, dupN: 2, dk: '', tr: false, add: '', fmt: '' });
const filterCount = f => (f.colors.size ? 1 : 0) + (f.type ? 1 : 0) + (f.cmc !== '' && f.cmc != null ? 1 : 0) + (f.cmdr ? 1 : 0) + (f.set ? 1 : 0) + fltAdvCount(f);
/** Remet tous les filtres à zéro, sur place (la recherche texte reste : son champ a son propre ✕). keepPlace : l'emplacement ouvert reste (« Effacer les filtres » :
 *  on reste dans le classeur ouvert depuis Rangement, son bandeau a son propre ✕). */
function fltClear(f, keepPlace) {
  f.colors.clear(); f.type = ''; f.cmc = ''; f.cmdr = ''; f.set = '';
  for (const k of FLT_ADV) { if (keepPlace && k === 'place') continue; if (f[k] instanceof Set) f[k].clear(); else if (k in f) f[k] = typeof f[k] === 'boolean' ? false : ''; }
  if ('dupN' in f) f.dupN = 2;
}

/** Sens des pastilles de couleur, dit à l'écran (core.js › colorFit) : commandants d'À monter et du coach, 'in' (identité incluse dans la sélection) ou exactement (eq) ; cartes : au moins une. */
const colorRuleText = eq => (eq ? T('Commandants exactement de ces couleurs.') : T('Commandants jouables avec ces couleurs : identité incluse dans la sélection (une ou plusieurs de ces couleurs, ou incolore).'));
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
      <div class="fgrp"><span class="fgl">${T('Couleur')}</span><div class="fcols" role="group" aria-label="${T('Couleurs')}">${COLOR_DEF.map(([c, n]) => `<button type="button" class="fcol mc-${c.toLowerCase()}" data-c="${c}" aria-pressed="false" aria-label="${n}" title="${n}">${c}</button>`).join('')}</div><p class="hint fcol-rule" hidden>${T('Cartes d\'au moins une de ces couleurs.')}</p></div>
      <div class="fgrp"><span class="fgl">${T('Famille')}</span><div class="fopts" role="group" aria-label="${T('Familles')}">${TYPE_ORDER.map(t => `<button type="button" class="fopt" data-t="${esc(t)}" aria-pressed="false">${esc(T(t))}</button>`).join('')}</div></div>
      <div class="fgrp"><span class="fgl">${T('Coût de mana')}</span><div class="fopts cmcs" role="group" aria-label="${T('Coût converti')}">${[0, 1, 2, 3, 4, 5, 6, 7].map(m => `<button type="button" class="fopt" data-m="${m}" aria-pressed="false">${m === 7 ? '7+' : m}</button>`).join('')}</div></div>
      ${opts.sets ? `<div class="fgrp"><span class="fgl">${T('Extension')}</span><button type="button" class="sortsel fset" aria-haspopup="dialog"><span class="fset-ic"></span><b></b></button></div>` : ''}
      ${ext ? `<button type="button" class="fmore" aria-expanded="false" aria-controls="${ext.id}"><span>${T('Plus de filtres')}</span><b hidden></b><svg class="i" aria-hidden="true"><use href="#i-chev"/></svg></button><div class="fmore-box" id="${ext.id}" hidden></div>` : ''}
      <div class="fpanel-foot"><button class="link-btn link-inline freset" type="button">${T('Effacer les filtres')}</button>${opts.see ? `<button class="btn small fsee" type="button">${T('Voir les cartes')}</button>` : ''}</div></div>${ext ? '<div class="fext"></div>' : ''}`;      // opts.see : « Voir N cartes » ferme le panneau (collection : le nombre suit, api.count)
  const inp = root.querySelector('input'), clr = root.querySelector('.fclear'), btn = root.querySelector('.fbtn'), panel = root.querySelector('.fpanel'), badge = btn.querySelector('b'), sel = root.querySelector('.fset');
  const more = root.querySelector('.fmore'), mbox = root.querySelector('.fmore-box'), xbox = root.querySelector('.fext');
  let msig = null, icH = null;
  // repeint à chaque filtre (deux fois dans la collection : ici puis collPaintBody) : seules les valeurs qui changent sont écrites. Réécrire textes, attributs et
  // symbole à l'identique salissait la mise en page de tout le panneau, refaite aussitôt (collPaintBody lit le défilement) puis encore après la liste.
  const txt = (el, v) => { v = String(v); if (el.textContent !== v) el.textContent = v; }, att = (el, k, v) => { v = String(v); if (el.getAttribute(k) !== v) el.setAttribute(k, v); }, hid = (el, h) => { h = !!h; if (el.hidden !== h) el.hidden = h; };
  const moreFill = () => { if (!ext || mbox.hidden) return; const s = ext.sig(); if (s === msig) return; msig = s; mbox.innerHTML = ext.groups(f); };      // groupes avancés (langues présentes, emplacements…) : repeints quand ils changent
  const moreSet = open => { if (!ext) return; mbox.hidden = !open; more.setAttribute('aria-expanded', String(open)); if (open) moreFill(); if (ext.open) ext.open(open); };
  const setOpts = () => {      // bouton « Extension » : celle choisie (symbole, nom) ; la fiche des extensions s'ouvre au toucher (fsetSheet)
    if (!sel) return; const c = f.set || '';
    const ic = c && c !== '-' && typeof setIcHtml === 'function' ? setIcHtml(c) : ''; if (ic !== icH) { icH = ic; $('.fset-ic', sel).innerHTML = ic; }
    txt($('b', sel), !c ? T('Toutes') : c === '-' ? T('Sans édition') : (typeof setName === 'function' && setName(c)) || c.toUpperCase());
    att(sel, 'aria-label', T('Extension : {name}', { name: $('b', sel).textContent }));
  };
  let t = 0;
  const paint = () => {
    const n = filterCount(f);
    hid(badge, !n); txt(badge, n); btn.classList.toggle('on', n > 0);
    hid(clr, !inp.value);
    for (const b of root.querySelectorAll('.fcol')) att(b, 'aria-pressed', f.colors.has(b.dataset.c));
    hid(root.querySelector('.fcol-rule'), f.colors.size < 2);      // sens du filtre des cartes (core.js › filterItems : au moins une couleur), dit dès deux couleurs cochées
    for (const b of root.querySelectorAll('[data-t]')) att(b, 'aria-pressed', f.type === b.dataset.t);
    for (const b of root.querySelectorAll('[data-x]')) att(b, 'aria-pressed', f.cmdr === b.dataset.x);
    for (const b of root.querySelectorAll('[data-m]')) att(b, 'aria-pressed', f.cmc !== '' && f.cmc != null && Number(b.dataset.m) === f.cmc);
    hid(root.querySelector('.freset'), !(n - (f.place ? 1 : 0)));      // l'emplacement seul : son bandeau a son ✕
    setOpts();
    if (ext) {
      if (inp.value !== (f.q || '') && document.activeElement !== inp) { inp.value = f.q || ''; clr.hidden = !inp.value; }      // recherche enregistrée appliquée : son texte dans le champ
      moreFill();
      for (const b of mbox.querySelectorAll('[data-fk]')) { const v = f[b.dataset.fk]; att(b, 'aria-pressed', v instanceof Set ? v.has(b.dataset.fv) : typeof v === 'boolean' ? v : v === b.dataset.fv); }
      for (const el of mbox.querySelectorAll('[data-fshow]')) hid(el, !fltOn(f[el.dataset.fshow]));      // réglage d'un filtre (« 2 exemplaires et + ») : montré quand le filtre est choisi
      for (const el of mbox.querySelectorAll('input[data-fnum]')) if (document.activeElement !== el && el.value !== String(f[el.dataset.fnum])) el.value = f[el.dataset.fnum];
      const na = fltAdvCount(f), mb = more.querySelector('b'); hid(mb, !na); txt(mb, na);
      ext.paint(xbox, f, api);
    }
  };
  const fire = () => { paint(); onChange(); };
  const cnAgain = () => { if (root.isConnected && f.q) onChange(); };      // index des noms de la langue de l'appli arrivé après la frappe : la liste se refait (cardnames.js)
  inp.addEventListener('input', () => { f.q = inp.value; clr.hidden = !inp.value; clearTimeout(t); t = setTimeout(onChange, 120); if (f.q && typeof cnWhen === 'function') cnWhen(cnAgain); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  if (ext) {      // nombre d'un filtre (data-fnum : « au moins N exemplaires ») : entier de data-min à 9999, appliqué pendant la frappe ; illisible : la dernière valeur revient en quittant le champ
    let nt = 0;
    const num = el => { const v = Number(el.value), lo = Number(el.dataset.min) || 0; return Number.isInteger(v) && v >= lo && v <= 9999 ? v : null; };
    mbox.addEventListener('input', e => { const el = e.target.closest('input[data-fnum]'); if (!el) return; const v = num(el); if (v == null || v === f[el.dataset.fnum]) return; f[el.dataset.fnum] = v; clearTimeout(nt); nt = setTimeout(fire, 250); });
    mbox.addEventListener('change', e => { const el = e.target.closest('input[data-fnum]'); if (!el) return; clearTimeout(nt); if (num(el) == null) el.value = f[el.dataset.fnum]; fire(); });
    mbox.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input[data-fnum]')) e.target.blur(); });
  }
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
      if (k === 'dup' && !f.dup) f.dupN = 2;      // « Doublons » rechoisi : 2 exemplaires et +
    }
    else if (b === more) { moreSet(mbox.hidden); haptic('tap'); return; }
    else if (b.classList.contains('freset')) fltClear(f, true);
    else if (b.classList.contains('fsee')) { btn.onclick(); btn.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' }); return; }
    else return;
    haptic('tap'); fire();
  });
  inp.value = f.q || '';      // écran rouvert : la recherche en cours reste écrite (elle filtre toujours la liste)
  if (ext && ext.moreOpen && ext.moreOpen()) moreSet(true);      // « Plus de filtres » ouvert la dernière fois : il le reste
  const see = root.querySelector('.fsee');
  const api = { paint, fire, reset() { f.q = ''; fltClear(f); inp.value = ''; paint(); }, count(n) { if (see) see.textContent = TN(n, 'Voir {n} carte', 'Voir {n} cartes'); } };
  paint();
  fltWarmSoon(root, panel);
  return api;
}
/** Préchauffage du panneau des filtres, une fois par page, au repos : à la première ouverture, le style de ses ~200 boutons se calculait à froid et les symboles
 *  de mana (SVG en fond, style.css › .fcol.mc-*) se créaient au toucher (~0,15 – 0,2 s sur un téléphone moyen, CPU ×4 : tests/perf-e2e.mjs). Groupe par groupe
 *  (une tâche courte chacun), une copie invisible et hors du flux est stylée et mise en page puis retirée dans la même tâche : jamais peinte, rien ne bouge.
 *  La copie garde l'attribut hidden (sinon densite.css › .coll-controls:has(.fpanel:not([hidden])) décollerait la barre le temps du calcul).
 *  Panneau ouvert entre-temps : le reste se calcule à l'ouverture, comme avant ; écran fermé avant la fin : le prochain panneau monté reprend. */
let fltWarm = 0;      // 0 : à faire · 1 : en cours · 2 : fait
function fltWarmSoon(root, panel) {
  if (fltWarm) return; fltWarm = 1;
  const idle = fn => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 1500));
  const parts = [...panel.children].flatMap(c => (!c.classList.contains('fmore-box') ? [[null, c]] : c.hidden ? [] : [...c.children].map(g => [c, g])));      // « Plus de filtres » fermé : vide
  let i = 0;
  const step = () => {
    if (!root.isConnected) { fltWarm = 0; return; }
    if (!panel.hidden || i >= parts.length) { fltWarm = 2; return; }
    const [box, g] = parts[i++];
    try {
      const shell = panel.cloneNode(false), part = g.cloneNode(true);
      if (box) { const b = box.cloneNode(false); b.hidden = false; b.appendChild(part); shell.appendChild(b); } else shell.appendChild(part);
      for (const e of [shell, ...shell.querySelectorAll('[id]')]) e.removeAttribute('id');
      shell.setAttribute('aria-hidden', 'true'); shell.inert = true;
      shell.style.cssText = 'display:flex!important;position:absolute!important;left:0;right:0;top:0;visibility:hidden!important;pointer-events:none;animation:none!important';
      root.appendChild(shell); void shell.offsetHeight; shell.remove();
    } catch (e) { /* préchauffage seulement : sans effet sur le panneau */ }
    idle(step);
  };
  idle(step);
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
