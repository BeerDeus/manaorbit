/* ── densite.js : densité sur téléphone (crochets de collection.js et share.js) ───────────────────────────────────────────────────
   · Collection, onglet Cartes : trois vues de la liste, choix gardé sur l'appareil (CVW_KEY) — Compacte (par défaut : une ligne de 64 px par carte,
     vignette, nom et drapeau, édition et emplacement en petit, prix, « ×3 » ; ni pastilles Famille / Coût ni − / + : un toucher ouvre la fiche de la carte,
     openCardSheet quand elle existe, sinon la ligne se déplie sur place en vue détaillée), Détaillée (la ligne de toujours : collection.js › crowHtml),
     Grille (images, 3 par ligne sur téléphone ; nom, ×n et prix en surimpression ; toucher = même chose que la vue compacte).
   · En-tête : la valeur passe dans le sous-titre (« 8 cartes · 17 ex. · 28 € »), la grande carte de valeur reste dans Stats ; onglets et recherche
     collés en haut au défilement (CSS), titre resserré une fois la liste défilée. Tri et Masterset deviennent deux boutons-icônes dans la rangée de la
     recherche, avec le choix de la vue : une rangée de moins. Sauvegarde : le point à côté du titre (touché : feuille « Sauvegarde de la collection »).
   · Échange : la carte « Partager ta liste » devient une barre d'une ligne (lien actif : « Lien actif › · QR · Partager », le reste dans la feuille du lien) ;
     réserve « Garder 0–4 » et « Mes rangements » dans la feuille « Réglages de l'échange » (roue à côté de Filtres, qui rappelle le réglage) ;
     sous-onglets et total sur une ligne (share.js › trPanelHtml). Aucun calcul de prix ici : seulement le gabarit. ── */
const CVW_KEY = 'deckdeal:coll:view', CVW_VIEWS = ['compact', 'detail', 'grid'];
const CVW = { v: '', open: new Set() };      // open : lignes dépliées sur place (vue compacte ou grille sans fiche carte), « clé|ligne »
const CVW_IC = {
  compact: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16M4 10h16M4 14.5h16M4 19h16"/></svg>',
  detail: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="5" height="7" rx="1"/><rect x="3.5" y="13.5" width="5" height="7" rx="1"/><path d="M11.5 5.5h9M11.5 9h6M11.5 15.5h9M11.5 19h6"/></svg>',
  grid: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + [3, 13].flatMap(y => [2.5, 9.5, 16.5].map(x => `<rect x="${x}" y="${y}" width="5" height="8" rx="1"/>`)).join('') + '</svg>',
};
const CVW_SORT_IC = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 4v16M4 16.5 7.5 20l3.5-3.5M16.5 20V4M13 7.5 16.5 4 20 7.5"/></svg>';
const TR_LINK_IC = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>';
const cvwName = v => ({ compact: T('Compacte'), detail: T('Détaillée'), grid: T('Grille') })[v];

/** Vue de la liste (lue une fois sur l'appareil ; stockage indisponible : compacte). */
function cvwView() {
  if (!CVW.v) { let v = ''; try { v = localStorage.getItem(CVW_KEY) || ''; } catch (e) { /* stockage indisponible */ } CVW.v = CVW_VIEWS.includes(v) ? v : 'compact'; }
  return CVW.v;
}
function cvwSet(v) {
  if (!CVW_VIEWS.includes(v) || v === cvwView()) return;
  CVW.v = v; CVW.open.clear(); haptic('tap');
  try { localStorage.setItem(CVW_KEY, v); } catch (e) { /* choix pour cette session */ }
  if (COLL.el) collPaintBody(false);
}
/** Classe de la liste de l'onglet Cartes. */
const cvwCls = () => ' cvw-' + cvwView();

/** Fiche de la carte (autre module) si elle existe ; sinon la ligne se déplie sur place. */
const cvwSheetOk = () => typeof openCardSheet === 'function';
/** Prix affiché d'une ligne : Cardmarket (estimation), sinon l'offre CardTrader lue. */
function cvwPrice(it) {
  if (Number.isFinite(it.eu)) return fmt(it.eu, 'EUR');
  if (Number.isFinite(it.rp)) return fmt(it.rp, it.rc || 'EUR');
  return '';
}
/** Une ligne de la liste selon la vue (collection.js › collRowsHtml). */
function cvwRow(it) {
  const v = cvwView(), g = it.g ?? it.l, id = it.k + '|' + g;
  if (v === 'detail') return crowHtml(it);
  if (CVW.open.has(id)) return `<div class="cvw-x">${crowHtml(it)}<button type="button" class="link-btn cvw-fold" data-act="cvwfold" aria-expanded="true">${T('Replier')}</button></div>`;
  const nm = it.dn || it.n, img = collLineImage(it.k, g, it.im).src, letter = esc((nm.trim()[0] || '?').toUpperCase()), hue = hash32(it.k) % 360, px = cvwPrice(it), sub = it.li > 0;
  const lab = esc(T(cvwSheetOk() ? 'Ouvrir la fiche de {name}' : 'Afficher le détail de {name}', { name: nm }) + ' · × ' + it.q + (px ? ' · ' + px : ''));
  const hit = `<button type="button" class="cvw-hit" data-act="cvwopen" aria-label="${lab}"${cvwSheetOk() ? ' aria-haspopup="dialog"' : ' aria-expanded="false"'}></button>`;
  const data = `data-k="${esc(it.k)}" data-ln="${esc(it.l)}"${g !== it.l ? ` data-g="${esc(g)}"` : ''}`;
  if (v === 'grid') {
    return `<div class="crow cvw-g${it.f ? ' foil' : ''}" ${data} style="--h:${hue}"><span class="cvw-art">${letter}${img ? `<img alt="" loading="lazy" decoding="async" src="${esc(img)}">` : ''}</span>
      <span class="cvw-ov"><span class="row-name">${esc(nm)}</span><span class="cvw-gm">${it.q > 1 ? `<b>×${it.q}</b>` : ''}${px ? `<i>${esc(px)}</i>` : ''}</span></span>${it.l ? `<span class="cvw-fl">${flag(it.l)}</span>` : ''}${it.f ? '<span class="cvw-fo" aria-hidden="true">✦</span>' : ''}${hit}</div>`;
  }
  const p = plcOf(g), e = it.e || '';
  const meta = [it.f ? `<span class="cvw-fo">✦ ${T('Foil')}</span>` : '', e ? `<span class="cvw-ed">${esc(edSet(e).toUpperCase())}</span>` : '', p ? `<span class="cvw-plc"><i style="--c:${plcColor(p)}"></i>${esc(plcName(p))}</span>` : '', !it.l ? `<span class="cvw-nl">${T('Langue ?')}</span>` : ''].filter(Boolean).join('');
  return `<div class="crow cvw-c${sub ? ' sub' : ''}${it.nl > 1 ? ' ml' : ''}" ${data}><span class="thumb" style="--h:${hue}"${zoomAt('coll', nm)}>${letter}${img ? `<img alt="" loading="lazy" decoding="async" src="${esc(img)}">` : ''}</span>
    <span class="row-main"><span class="row-top"><span class="row-name">${esc(nm)}</span>${it.l ? flag(it.l) : ''}</span>${meta ? `<span class="cvw-sub">${meta}</span>` : ''}</span>
    <span class="cvw-r">${px ? `<b class="cvw-p">${esc(px)}</b>` : ''}<b class="cvw-q">×${it.q}</b></span>${hit}</div>`;
}
/** Item d'une rangée affichée (liste peinte) : pour la déplier sur place. */
function cvwItemOf(row) {
  const k = row.dataset.k, g = rowG(row), it = (COLL.painted || []).find(x => x.k === k);
  return it ? collRowItems(it).find(r => (r.g ?? r.l) === g) || null : null;
}
/** Clics de densite.js dans l'écran de la collection ; true : clic traité. */
function dnsClick(e) {
  const b = e.target.closest('button[data-act]'); if (!b || !COLL.el || !COLL.el.contains(b)) return false;
  const act = b.dataset.act;
  if (act === 'cvwopen') {
    const row = b.closest('.crow'); if (!row) return true;
    if (cvwSheetOk()) { haptic('tap'); openCardSheet(row.dataset.k, { l: row.dataset.ln || '', g: rowG(row) }); return true; }      // fiche de la carte (autre module) : − / + et le reste
    const it = cvwItemOf(row); if (!it) return true;
    CVW.open.add(it.k + '|' + (it.g ?? it.l)); haptic('tap');
    const tmp = document.createElement('div'); tmp.innerHTML = cvwRow(it); const x = tmp.firstElementChild; row.replaceWith(x);
    const f = $('.cvw-fold', x); if (f) f.focus({ preventScroll: true });
    return true;
  }
  if (act === 'cvwfold') {
    const x = b.closest('.cvw-x'), row = x && $('.crow', x); if (!row) return true;
    const it = cvwItemOf(row); CVW.open.delete(row.dataset.k + '|' + rowG(row)); haptic('tap');
    if (!it) { collPaintBody(true); return true; }
    const tmp = document.createElement('div'); tmp.innerHTML = cvwRow(it); const n = tmp.firstElementChild; x.replaceWith(n);
    const h = $('.cvw-hit', n); if (h) h.focus({ preventScroll: true });
    return true;
  }
  if (act === 'cvwmenu') { haptic('tap'); cvwSheet(); return true; }
  if (act === 'trset') { haptic('tap'); trSetSheet(); return true; }
  if (act === 'trlink') { haptic('tap'); trLinkSheet(); return true; }
  return false;
}
/** Feuille « Affichage de la liste » : les trois vues (même dessin que l'interrupteur Liste | Classeur de l'Échange). */
function cvwSheet() {
  openSheet(T('Affichage de la liste'), T('Gardé sur cet appareil'), api => {
    const cur = cvwView(), sub = { compact: T('Une ligne par carte : nom, prix, quantité'), detail: T('Familles, coût, édition et − / + sur la ligne'), grid: T('Les images, 3 par ligne') };
    api.body.innerHTML = `<div class="cvw-opts" role="radiogroup" aria-label="${T('Affichage de la liste')}">${CVW_VIEWS.map(v => `<button type="button" class="cvw-opt" role="radio" aria-checked="${v === cur}" data-v="${v}">${CVW_IC[v]}<span><b>${cvwName(v)}</b><small>${sub[v]}</small></span></button>`).join('')}</div>`;
    api.body.addEventListener('click', e => { const o = e.target.closest('.cvw-opt'); if (!o) return; cvwSet(o.dataset.v); api.close(); });
    api.body.addEventListener('keydown', e => {      // flèches : d'une vue à l'autre (groupe de boutons radio)
      const o = e.target.closest('.cvw-opt'); if (!o || !/^Arrow(Up|Down|Left|Right)$/.test(e.key)) return; e.preventDefault();
      const l = $$('.cvw-opt', api.body), i = l.indexOf(o), n = l[(i + (/Down|Right/.test(e.key) ? 1 : l.length - 1)) % l.length]; n.focus();
    });
  });
}

/* ── Outils de la collection : tri, masterset et vue en icônes dans la rangée de la recherche ── */
/** Une fois l'écran monté (collection.js › openCollection, après mountFilters) : boutons déplacés dans la rangée de la recherche, défilement suivi. */
function cvwMount(wrap, md) {
  const row = $('#collF .fbar-row', wrap), srow = $('.coll-srow', wrap);
  if (row && srow) {
    const box = document.createElement('div'); box.className = 'coll-ibar';
    const sort = $('.coll-sort', srow), ms = $('.coll-ms', srow);
    if (sort) { sort.classList.add('ib'); sort.insertAdjacentHTML('afterbegin', CVW_SORT_IC); box.appendChild(sort); }
    if (ms) { ms.classList.add('ib'); ms.setAttribute('aria-label', T('Masterset')); ms.title = T('Masterset'); box.appendChild(ms); }
    if (md === 'coll') box.insertAdjacentHTML('beforeend', `<button type="button" class="icon-btn cvw-btn" data-act="cvwmenu" aria-haspopup="dialog"></button>`);
    if (md === 'trade') box.insertAdjacentHTML('beforeend', `<button type="button" class="tr-setb" data-act="trset" aria-haspopup="dialog"><svg class="i" aria-hidden="true"><use href="#i-gear"/></svg><span></span><b hidden></b></button>`);
    row.appendChild(box);
  }
  const sc = $('.dv-scroll', wrap); let on = false;
  if (sc) sc.addEventListener('scroll', () => {      // titre resserré une fois la liste défilée (écart : pas d'aller-retour au bord)
    const t = sc.scrollTop, room = sc.scrollHeight - sc.clientHeight > 96, nx = room && (on ? t > 6 : t > 28);
    if (nx !== on) { on = nx; wrap.classList.toggle('scrolled', on); }
  }, { passive: true });
}
/** Après chaque peinture du corps : état des boutons (collection.js › collPaintBody). */
function cvwPaint(el, none) {
  const srow = $('.coll-srow', el); if (srow) srow.hidden = ![...srow.children].some(c => !c.hidden);
  const sort = $('.coll-sort', el), sel = $('#collSort', el);
  if (sort && sel) { const o = sel.options[sel.selectedIndex], t = T('Trier : {by}', { by: o ? o.textContent : '' }); sort.title = t; sort.classList.toggle('on', COLL.sort !== 'name'); }
  const vb = $('.cvw-btn', el);
  if (vb) {
    const v = cvwView(), show = COLL.mode === 'coll' && COLL.tab === 'list' && !none && !(typeof msActive === 'function' && msActive());
    vb.hidden = !show; vb.innerHTML = CVW_IC[v]; const t = T('Affichage : {v}', { v: cvwName(v) }); vb.setAttribute('aria-label', t); vb.title = t;
  }
  if (COLL.mode === 'trade') trSetPaint();
}
/** En-tête : la grande carte de valeur seulement dans Stats (mode streamer : celle de la session, opening.js, partout). */
function cvwHead() {
  if (typeof streamOn === 'function' && streamOn()) return;
  collValPaint();
}

/* ── Sauvegarde : feuille du point à côté du titre ── */
function collSyncSheet(si) {
  openSheet(T('Sauvegarde de la collection'), '', api => {
    const acts = si.acts.slice(); if (!D.user && collCount()) acts.push(['export', T('Exporter une copie')]);
    api.body.innerHTML = `<div class="sync-sheet" data-k="${esc(si.k)}"><span class="sy-d" aria-hidden="true"></span><p>${esc(si.t)}</p></div>`;
    api.setFoot(acts.map(([a, l], i) => `<button class="btn${i ? ' ghost' : ''}" type="button" data-sy="${a}">${esc(l)}</button>`).join('') || `<button class="btn" type="button" data-close>${T('Fermer')}</button>`);
    api.foot.addEventListener('click', e => {
      const b = e.target.closest('[data-sy]'); if (!b) return; api.close();
      const a = b.dataset.sy; if (a === 'login') openAccount(); else if (a === 'resync') collSyncNow(); else if (a === 'export') collExport();
    });
  });
}

/* ── Échange : barre du lien, feuille du lien, réglages ── */
/** Barre d'une ligne à la place de la carte « Partager ta liste » (share.js › trPanelHtml). */
function trBarHtml(st) {
  const warn = TR.err === 'rules' ? T('Règles Firestore à publier pour le partage (voir README) : le lien ne peut pas être mis à jour.') : TR.err === 'big' ? T('Liste trop longue : le lien ne peut plus être mis à jour (trop de cartes recherchées).') : '';
  const w = warn ? `<p class="hint warn tr-bar-w">${esc(warn)}</p>` : '';
  const chev = '<svg class="i tr-bar-chev" aria-hidden="true"><use href="#i-chev"/></svg>';
  if (!D.user) return `<div class="tr-box tr-bar"><button class="tr-bar-main" type="button" data-act="login">${TR_LINK_IC}<span><b>${T('Connecte-toi pour partager')}</b><small>${T('Un lien public pour tes amis, en lecture seule')}</small></span>${chev}</button></div>`;
  const lv = typeof trocBoxHtml === 'function' ? trocBoxHtml() : '', live = lv ? lv.replace('class="trc-entry"', `class="trc-entry tr-bar-live" aria-label="${esc(T('Échange en direct'))}" title="${esc(T('Échange en direct'))}"`) : '';      // « Échange en direct » (troc.js) : sa ligne, en icône au bout de la barre (son texte reste dans le bouton)
  if (!TR.share) return `<div class="tr-box tr-bar"><span class="tr-bar-main">${TR_LINK_IC}<span><b>${T('Partager ta liste')}</b><small>${T('Lien public · lecture seule')}</small></span></span><button class="btn small tr-bar-go" type="button" data-act="tron">${T('Créer mon lien')}</button>${live}${w}</div>`;
  const net = TR.err === 'net' ? `<small class="warn">${T('Mise à jour en attente')}</small>` : `<small>${T('Toujours à jour')}</small>`;
  return `<div class="tr-box tr-bar on"><button class="tr-bar-main" type="button" data-act="trlink" aria-haspopup="dialog" aria-label="${esc(T('Lien actif : copier, aperçu, image, arrêter…'))}">${TR_LINK_IC}<span><b>${T('Lien actif')}</b>${net}</span>${chev}</button>
    <button class="btn ghost small tr-bar-b" type="button" data-act="trqr" aria-label="${T('QR code')}" title="${T('QR code')}">${QR_ICON}<span>QR</span></button>
    <button class="btn ghost small tr-bar-b" type="button" data-act="trsend"><svg class="i" aria-hidden="true"><use href="#i-share"/></svg><span>${T('Partager')}</span></button>${live}${w}</div>`;
}
/** Feuille du lien : tout ce que montrait la carte (adresse, Copier, Partager, Aperçu, QR, image, Nouveau lien, Arrêter, Échange en direct). */
function trLinkSheet() {
  if (!TR.share) return;
  openSheet(T('Lien public actif'), T('Lien public · lecture seule'), api => {
    api.body.classList.add('trl-sheet');
    const paint = () => { api.body.innerHTML = trShareBoxHtml(TR.st || trState()); const inp = $('.tr-link input', api.body); if (inp) inp.onfocus = e => e.target.select(); };
    paint();
    api.body.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (['troff', 'trnew', 'trview', 'trqr', 'trimg', 'trlive', 'tron'].includes(b.dataset.act)) api.close();      // une autre feuille, un autre écran, ou le lien qui change
      trClick(e);
    });
  });
}
/** Feuille « Réglages de l'échange » : réserve (0–4) et « Mes rangements ». */
function trSetSheet() {
  openSheet(T('Réglages de l\'échange'), T('Ce que ta liste propose'), api => {
    api.body.classList.add('trs-sheet');
    api.body.innerHTML = `<div class="tr-keep"><span class="label">${T('Garder en plus de mes decks : 0–4 exemplaires')}</span><div class="seg" id="trKeep" role="radiogroup" aria-label="${T('Garder en plus de mes decks')}"></div><p class="hint">${T('Tu proposes seulement ce que tu as en trop.')}</p></div>
      <div class="trs-plc"></div>`;
    mountSeg($('#trKeep', api.body), TR_KEEPS.map(v => ({ v: String(v), label: String(v) })), String(TR.keep), v => { TR.keep = Number(v); trChanged(); });
    api.body.addEventListener('click', e => { if (e.target.closest('[data-act="trplc"]')) { haptic('tap'); trPlacesSheet(); } });
    api.setFoot('<button class="btn" type="button" data-close>' + T('Fermer') + '</button>');
    trSetPaint();
  });
}
/** Roue des réglages (« Garde 1 ex. », nombre de règles de rangement) et feuille ouverte tenues à jour. */
function trSetPaint() {
  const el = COLL.el, b = el && $('.tr-setb', el);
  const ps = typeof trPlcPlaces === 'function' ? trPlcPlaces() : [], n = ps.filter(x => placeTrade(COLL.places, x.id)).length;
  if (b) {
    $('span', b).textContent = T('Garde {n} ex.', { n: TR.keep }); const c = $('b', b); c.hidden = !n; c.textContent = n;
    const t = T('Réglages de l\'échange') + ' · ' + T('Garde {n} ex.', { n: TR.keep }) + (n ? ' · ' + TN(n, '{n} règle de rangement', '{n} règles de rangement') : '');
    b.setAttribute('aria-label', t); b.title = t;
  }
  const box = $('.sheet-wrap .trs-plc');
  if (box) box.innerHTML = `<p class="hint">${T('Ce qui part dans l\'échange, rangement par rangement')}</p>${trPlcBtnHtml() || `<p class="hint">${T('Aucun rangement pour l\'instant : ouvre une carte, puis « Ranger dans ».')}</p>`}`;
}
