/* ── nav.js : barre du bas (Accueil · Collection · Scanner · Échange · Decks) et onglets de la section Decks ───────────────────────────────
   Sections : l'accueil (vue « home »), « Ma collection » (écran coll, onglets Cartes · Stats), « Échange » (même écran, liste d'échange seule),
   « Decks » : Mes decks (écran dks) · À monter (écran coll, decks EDHREC) · Prix d'une liste (vue « input », l'ancien « Nouveau panier »).
   La barre se montre sur l'accueil, la saisie et ces écrans ; elle se cache dès qu'un autre écran passe devant (scan, viewer, éditeur, page
   d'une extension, ajout de cartes, liste publique), pendant le premier lancement et sur les résultats d'une recherche. Le scan s'ouvre par le
   bouton foil du milieu. Passer d'une section à l'autre ne rejoue pas l'animation d'ouverture (classe .inst) et ferme la section quittée. */
const NAV = { raf: 0, inst: false, mo: null, cur: null };
const NAV_TABS = [['home', 'Accueil', 'i-home'], ['coll', 'Collection', 'i-cards'], ['scan', 'Scanner', ''], ['trade', 'Échange', 'i-swap'], ['decks', 'Decks', 'i-layers']];
/** Icône du bouton Scanner (« Carte visée ») : viseur rond, carte, rayon de lecture. */
const NAV_SCAN_SVG = '<svg class="nav-sc" viewBox="0 0 48 48" aria-hidden="true"><path d="M5.49 19.73A19 19 0 0 1 19.73 5.49M28.27 5.49A19 19 0 0 1 42.51 19.73M42.51 28.27A19 19 0 0 1 28.27 42.51M19.73 42.51A19 19 0 0 1 5.49 28.27" fill="none" stroke="#0b0f1c" stroke-width="3.2" stroke-linecap="round"/><g transform="rotate(-8 24 24)"><rect x="15.5" y="12" width="17" height="24" rx="3" fill="#0b0f1c"/><rect x="18" y="14.8" width="12" height="8.5" rx="1.4" fill="#fff" fill-opacity=".92"/><path d="M18 23.3l3.4-3.6 2.6 2.4 2.5-2.9 3.5 4.1z" fill="#7fb0ff"/><rect x="18" y="26.2" width="12" height="1.8" rx=".9" fill="#fff" fill-opacity=".55"/><rect x="18" y="29.8" width="8" height="1.8" rx=".9" fill="#fff" fill-opacity=".55"/></g><rect x="8" y="21.4" width="32" height="5.2" rx="2.6" fill="#fff" fill-opacity=".28"/><rect x="8" y="22.7" width="32" height="2.6" rx="1.3" fill="#fff"/></svg>';
function navHtml() {
  return NAV_TABS.map(([v, l, ic]) => v === 'scan'
    ? `<button type="button" class="nav-b nav-scan" data-nav="scan" aria-label="${T('Scanner des cartes')}"><span class="nav-foil">${NAV_SCAN_SVG}</span><span class="nav-l">${T(l)}</span></button>`
    : `<button type="button" class="nav-b" data-nav="${v}"${v === 'decks' ? ' id="btnDecks"' : ''}><span class="nav-i"><svg class="i" aria-hidden="true"><use href="#${ic}"/></svg></span><span class="nav-l">${T(l)}</span></button>`).join('');
}
/** Écran du dessus (ouvert, pas en train de se fermer). */
const navTopDv = () => { const l = $$('body > .dv.on'); return l[l.length - 1] || null; };
/** Section affichée ('' : la barre se cache). */
function navCur() {
  if ((typeof OB !== 'undefined' && OB.el) || document.getElementById('splash')) return '';
  const top = navTopDv();
  if (top) {
    if (top.classList.contains('dks')) return 'decks';
    if (top.classList.contains('coll') && !top.classList.contains('pubv')) return top.classList.contains('m-trade') ? 'trade' : top.classList.contains('m-decks') ? 'decks' : 'coll';
    return '';
  }
  return S.view === 'home' ? 'home' : S.view === 'input' ? 'decks' : '';
}
function navSync() {
  NAV.raf = 0;
  const el = $('#nav'); if (!el) return;
  const cur = navCur(), on = !!cur, it = $('#inTabs');
  if (it) { const want = S.view === 'input'; if (want && !it.firstChild) it.innerHTML = dkTabsHtml('price'); if (it.hidden === want) it.hidden = !want; }      // « Prix d'une liste » : les onglets de la section Decks en haut
  if (cur === NAV.cur) return; NAV.cur = cur;      // rien n'a changé : on ne touche pas au DOM (l'observateur ne se relance pas)
  el.classList.toggle('off', !on); el.setAttribute('aria-hidden', String(!on)); el.inert = !on;
  document.body.classList.toggle('nav-on', on);
  for (const b of $$('.nav-b', el)) { if (b.dataset.nav === cur) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
}
const navSoon = () => { if (!NAV.raf) NAV.raf = requestAnimationFrame(navSync); };
/* Ordinateur (souris, écran large : la même requête que css/zz-desktop.css) : « / » met le curseur dans la recherche de l'écran affiché. */
const NAV_DESK = typeof matchMedia === 'function' ? matchMedia('(min-width:1100px) and (hover:hover) and (pointer:fine)') : null;
if (typeof document !== 'undefined') document.addEventListener('keydown', e => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || !NAV_DESK || !NAV_DESK.matches || (typeof sheets !== 'undefined' && sheets.length)) return;
  const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  const scope = navTopDv() || document.getElementById('app'), inp = scope && [...scope.querySelectorAll('.fsearch input[type="search"]')].find(i => i.offsetParent);
  if (!inp) return; e.preventDefault(); inp.focus(); if (inp.select) inp.select();
});

/** Ferme les écrans de section (collection, échange, decks) ; les autres écrans restent (ils ferment la barre de toute façon). */
function navCloseSections(keep) {
  if (typeof COLL !== 'undefined' && COLL.el && COLL.el !== keep) COLL.el.__close();
  if (typeof DKS !== 'undefined' && DKS.el && DKS.el !== keep) DKS.el.__close();
}
/** Ouvre une section sans animation d'ouverture et ferme celle qu'on quitte. */
function navOpen(fn) {
  if (S.view !== 'home') showView('home');      // « Prix d'une liste » quitté : l'accueil revient dessous
  NAV.inst = true; try { fn(); } finally { NAV.inst = false; }
  const keep = navTopAdded(); requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => navCloseSections(keep))));      // la section quittée se ferme une fois la nouvelle affichée (pas d'accueil entre les deux)
}
const navTopAdded = () => { const l = $$('body > .dv'); return l[l.length - 1] || null; };
function navGo(t) {
  if (t === 'scan') { openScan(); return; }
  const cur = navCur();
  if (t === cur) { const top = navTopDv(), sc = top ? $('.dv-scroll', top) : null; if (sc) sc.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' }); else window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' }); if (t !== 'decks' || S.view !== 'input') return; }
  haptic('tap');
  if (t === 'home') { navCloseSections(); if (S.view !== 'home') showView('home'); return; }
  if (t === 'coll') navOpen(() => openCollection(COLL.ctab || 'list'));
  else if (t === 'trade') navOpen(() => openCollection('trade'));
  else if (t === 'decks') navOpen(() => openDecks());
}

/* ── Onglets de la section Decks ─────────────────────────────────────────────────────────────────── */
function dkTabsHtml(cur) {
  const n = typeof allDecks === 'function' ? allDecks().length : 0;
  return `<nav class="dk-tabs" aria-label="${T('Decks')}">${[['mine', T('Mes decks'), n], ['build', T('À monter'), 0], ['price', T('Prix d\'une liste'), 0]].map(([v, l, c]) => `<button type="button" class="dk-tab" data-dtab="${v}"${v === cur ? ' aria-current="page"' : ''}>${esc(l)}${c ? ` <em>${nf0(c)}</em>` : ''}</button>`).join('')}</nav>`;
}
function dkTabGo(v) {
  haptic('tap');
  if (v === 'mine') { if (!DKS.el) navOpen(() => openDecks()); }
  else if (v === 'build') { if (!(COLL.el && COLL.mode === 'decks')) navOpen(() => openCollection('decks')); }
  else if (v === 'price') { navCloseSections(); if (S.view !== 'input') showView('input'); }
}
/** Nombre de decks dans les onglets ouverts (un deck créé, supprimé, synchronisé). */
function dkTabsCount() { const n = typeof allDecks === 'function' ? allDecks().length : 0; for (const t of $$('.dk-tab[data-dtab="mine"]')) t.innerHTML = esc(T('Mes decks')) + (n ? ` <em>${nf0(n)}</em>` : ''); }

function navInit() {
  const el = $('#nav'); if (!el) return;
  el.innerHTML = navHtml();
  el.addEventListener('click', e => { const b = e.target.closest('[data-nav]'); if (b) navGo(b.dataset.nav); });
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-dtab]'); if (b) dkTabGo(b.dataset.dtab); });
  // écrans ajoutés ou retirés à la racine, ouverts (.on) ou fermés, vue changée : la barre suit (une fois par image)
  NAV.mo = new MutationObserver(rs => { if (rs.some(r => (r.type === 'childList' && r.target === document.body) || r.attributeName === 'data-view' || (r.target.parentNode === document.body && r.target.classList && r.target.classList.contains('dv')))) navSoon(); });
  NAV.mo.observe(document.body, { childList: true, attributes: true, attributeFilter: ['class'], subtree: true });
  const app = $('#app'); if (app) NAV.mo.observe(app, { attributes: true, attributeFilter: ['data-view'] });
  NAV.cur = null; navSync();
}
