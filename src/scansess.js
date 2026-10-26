/* ── scansess.js : scan en cours gardé sur le téléphone, confirmation avant de le quitter ──────────────────────────────────────────
   Les cartes du scan (et la liste « Prix ») sont enregistrées sur l'appareil à chaque changement (localStorage, une session par contexte : collection,
   lot, deck, session d'ouverture) : appli fermée par Android, plantage, page rechargée ou scan quitté par erreur, rien n'est perdu. Rouvrir le scan dans
   le même contexte reprend la session, avec un bandeau « Scan repris » (« Nouvelle session » l'efface, « Annuler » la rend). Effacée après « Ajouter »,
   « Tout effacer et quitter », ou au bout de 7 jours sans y toucher.
   Rangement du scan (« Ranger dans », places.js › SCD, scan de la collection) : gardé avec la session et repris avec elle ; nouvelle séance : remis à vide.
   Quitter le scan (←, Retour du téléphone, Échap) avec des cartes pas encore ajoutées : « Quitter le scan ? » (Continuer le scan, Quitter en les gardant,
   Tout effacer). Un 2e Retour ferme la question et reste dans le scan. Scan mobile (chaque carte part au PC tout de suite) : ni sauvegarde ni question.
   Jamais enregistré : les photos (cartes « à vérifier », non reconnues), les cartes encore en lecture. */
const SSS_KEY = 'deckdeal:scansess:', SSS_TTL = 7 * 864e5;
const SSS = { t: 0 };
/** Champs d'une ligne du scan gardés (scan.js › scanAdd, scaned.js) ; photo (shot), empreinte d'illustration (sig, sym) : jamais. */
const SSS_IT = ['id', 'key', 'name', 'q', 'fq', 'score', 'raw', 'maybe', 'l', 'via', 'e', 'es', 'pk', 'nx', 'later', 'ft', 'lot', 'ambBy', 'alts', 'artg', 'dp', 'pa'];      // dp, pa : mise à part par l'alerte de prix (scan.js)
/** Contexte du scan (où iront ses cartes) ; '' : rien à garder (scan mobile). */
function sssCtx() {
  if (SC.remote) return '';
  if (SC.deck) return 'deck:' + ((typeof BD !== 'undefined' && BD.id) || '');
  if (SC.lot) return 'lot';
  return typeof opnOn === 'function' && opnOn() ? 'opn' : 'coll';
}
/** État du scan ouvert à garder ; null s'il est vide. */
function sssSnap() {
  const items = [...SC.items.values()].map(x => { const o = {}; for (const k of SSS_IT) if (x[k] != null && x[k] !== '' && x[k] !== false) o[k] = x[k]; return o; });
  const done = v => v === null || v === 'off' || Number.isFinite(v) || (v && typeof v === 'object');      // prix lu (ou absent) : gardé ; en cours ou en erreur : relu à la reprise
  const pq = SC.pq.map(e => ({ key: e.key, name: e.name, l: e.l, n: e.n, maybe: e.maybe, raw: e.raw, im: e.im, t: e.t, cm: done(e.cm) ? e.cm : undefined, ct: done(e.ct) ? e.ct : undefined }));
  if (!items.length && !pq.length) return null;
  return { v: 1, ctx: SC.ctx, at: Date.now(), items, pq, sets: [...SC.sets], setN: SC.setN, stick: SC.stick, mid: SC.mid, dest: SC.ctx === 'coll' ? { x: SCD.x, p: SCD.p } : null };
}
function sssPut(s) { try { localStorage.setItem(SSS_KEY + s.ctx, JSON.stringify(s)); } catch (e) { /* stockage plein ou bloqué : la session reste en mémoire */ } }
function sssDrop(ctx) { if (!ctx) return; try { localStorage.removeItem(SSS_KEY + ctx); } catch (e) { /* ignore */ } }
/** Enregistre le scan ouvert tout de suite (vide : la session de ce contexte est effacée). */
function sssSave() {
  clearTimeout(SSS.t); SSS.t = 0;
  if (!SC.el || !SC.ctx) return;
  const s = sssSnap(); if (s) sssPut(s); else sssDrop(SC.ctx);
}
/** Après chaque repeint de la liste (scan.js › scanPaintList) : enregistré un instant plus tard (les repeints arrivent en rafale). */
function sssSoon() { if (SC.el && SC.ctx && !SSS.t) SSS.t = setTimeout(sssSave, 400); }
/** Session gardée de ce contexte (null : aucune, illisible ou trop vieille) ; les sessions de plus de 7 jours de tous les contextes sont effacées au passage. */
function sssLoad(ctx) {
  let out = null;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i); if (!k || !k.startsWith(SSS_KEY)) continue;
      let s = null; try { s = JSON.parse(localStorage.getItem(k)); } catch (e) { s = null; }
      if (!s || s.v !== 1 || !Array.isArray(s.items) || !(Date.now() - s.at < SSS_TTL)) { localStorage.removeItem(k); continue; }
      if (k === SSS_KEY + ctx) out = s;
    }
  } catch (e) { return null; }
  return out;
}
/** Pose une session gardée dans le scan ouvert ; merge : les cartes déjà là s'y ajoutent (« Annuler » après « Nouvelle session »). Éditions et prix pas encore lus : relus. */
function sssApply(s, merge) {
  const cur = merge ? [...SC.items] : [], pq0 = merge ? SC.pq : [];
  SC.items = new Map(s.items.map(x => [x.id, { q: 1, score: 1, raw: '', maybe: false, l: 'en', shot: '', via: '', e: '', es: '', pk: null, nx: false, ft: null, sig: null, sym: null, artq: false, lot: false, ambBy: '', alts: null, ...x }]));
  for (const [id, it] of cur) { const o = SC.items.get(id); if (o) o.q = Math.min(999, o.q + it.q); else SC.items.set(id, it); }
  SC.pq = [...pq0, ...(s.pq || []).filter(e => !pq0.some(x => x.key === e.key))].slice(0, 40);
  SC.sets = new Map([...(s.sets || []), ...(merge ? SC.sets : [])]); SC.setN = Math.max(SC.setN || 0, s.setN || 0, SC.sets.size); if (s.stick) SC.stick = s.stick;
  SC.mid = Math.max(SC.mid, s.mid || 0); SC.lastIt = null;
  for (const it of [...SC.items.values()]) if (!it.e && !it.nx && ['load', 'pend', 'err'].includes(it.es)) scanEdNeed(it);
  for (const e of SC.pq) if (e.cm === undefined || e.ct === undefined) scanPriceFetch(e);
}
/** Ouverture du scan (scan.js › openScan, avant le premier repeint) : reprend la session gardée de ce contexte. */
function sssResume() {
  SC.ctx = sssCtx(); SC.resume = null; clearTimeout(SSS.t); SSS.t = 0;
  if (!SC.ctx) return;
  const s = sssLoad(SC.ctx); if (!s || (!s.items.length && !(s.pq || []).length)) { if (SC.ctx === 'coll') scdReset(null); return; }      // nouvelle séance : rangement remis à vide
  sssApply(s); if (SC.ctx === 'coll') scdReset(s.dest);      // séance reprise : son rangement
  SC.resume = { n: s.items.reduce((a, x) => a + (x.q || 1), 0), p: (s.pq || []).length, at: s.at };
}
/** Bandeau en tête de la liste après une reprise, jusqu'à la carte suivante. */
function sssBandHtml() {
  const r = SC.resume; if (!r) return '';
  const what = [r.n ? TN(r.n, '{n} carte', '{n} cartes') : '', r.p ? TN(r.p, '{n} prix lu', '{n} prix lus') : '', relTime(r.at)].filter(Boolean).join(' · ');
  return `<section class="sc-resume" role="status"><span class="sc-resume-t"><b>${T('Scan repris')}</b><small>${esc(what)}</small></span><button type="button" class="btn ghost small" data-act="ssnew">${T('Nouvelle session')}</button><button type="button" class="sc-x" data-act="ssok" aria-label="${T('Fermer')}"><svg class="i"><use href="#i-close"/></svg></button></section>`;
}
/** Remet le scan à vide (session du contexte effacée). */
function sssClear() {
  SC.items = new Map(); SC.pq = []; SC.miss = []; SC.lastIt = null; SC.resume = null;
  SC.stick = SC.lot && LOT.set ? LOT.set : ''; SC.sets = new Map(SC.stick ? [[SC.stick, 1]] : []); SC.setN = 1;
  sssDrop(SC.ctx); if (SC.ctx === 'coll') scdReset(null);
  scanPaintTools(); scanPaintList();
}
/** « Nouvelle session » du bandeau : scan vidé, « Annuler » rend les cartes (en plus de celles lues entre-temps). */
function sssNew() {
  const s = sssSnap(); haptic('tap'); sssClear(); if (!s) return;
  toast(T('Scan effacé'), { label: T('Annuler'), fn: () => { if (SC.el && SC.ctx === s.ctx) { sssApply(s, true); if (s.dest && !scdSet()) scdReset(s.dest); scanPaintTools(); scanPaintList(); } else sssPut(s); } });
}
/** Des cartes seraient perdues en quittant : lues (même « à vérifier »), en lecture, ou dans la liste « Prix ». Jamais en scan mobile. */
const sssUnsaved = () => !!SC.el && !SC.remote && (SC.items.size > 0 || SC.pq.length > 0 || SC.pend.length > 0 || SC.queue.length > 0);
/** « Quitter le scan ? » ; end() ferme le scan en gardant la session. */
function sssQuitAsk(end) {
  if (sheets.some(x => x.wrap.classList.contains('sss-sheet'))) return;
  const n = [...SC.items.values()].reduce((a, x) => a + x.q, 0), p = SC.pq.length, w = SC.pend.length + SC.queue.length;
  const what = [n ? TN(n, '{n} carte pas encore ajoutée', '{n} cartes pas encore ajoutées') : '', p ? TN(p, '{n} prix lu', '{n} prix lus') : '', w ? TN(w, '{n} en lecture', '{n} en lecture') : ''].filter(Boolean).join(' · ');
  haptic('tap');
  openSheet(T('Quitter le scan ?'), what, api => {
    api.wrap.classList.add('sss-sheet');
    api.body.innerHTML = `<p class="hint">${T('Elles restent gardées sur ce téléphone : tu les retrouveras en rouvrant le scan.')}</p><button type="button" class="link-btn sss-del" data-ss="del">${T('Tout effacer et quitter')}</button>`;
    api.setFoot(`<button class="btn ghost" type="button" data-ss="quit">${T('Quitter')}</button><button class="btn" type="button" data-close>${T('Continuer le scan')}</button>`);
    api.wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-ss]'); if (!b) return;
      api.close();
      if (b.dataset.ss !== 'del') { end(); return; }
      const s = sssSnap(), ctx = SC.ctx; SC.items = new Map(); SC.pq = []; sssDrop(ctx); end(); sssDrop(ctx);
      toast(T('Scan effacé'), s ? { label: T('Annuler'), fn: () => sssPut(s) } : undefined);
    });
  });
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.hidden) sssSave(); });      // appli passée en arrière-plan : Android peut la fermer sans prévenir
  addEventListener('pagehide', () => sssSave());
}
