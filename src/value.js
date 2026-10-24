/* ── value.js : valeur de la collection dans le temps et variations de prix (Cardmarket) ─────────────────────────
   Une fois par jour (au plus), l'appli relit sur Scryfall le prix tendance Cardmarket de toutes les cartes et garde :
   - un relevé de la valeur totale par jour (localStorage + compte si connecté, 400 jours au plus) → courbe et variations à 7 / 30 jours ;
   - sur CET appareil, les prix carte par carte de la semaine (IndexedDB) → cartes dont le prix a bougé de plus du seuil (10 / 25 / 50 %), bannière et pastilles ▲▼.
   L'historique de valeur est synchronisé avec le compte (extras.js, document meta/history) ; les prix carte par carte restent locaux. Lecture au lancement, au retour sur l'appli et à l'ouverture de la collection (pas en arrière-plan, appli fermée). */
const VAL_HIST_KEY = 'deckdeal:coll:hist', VAL_RESET_KEY = 'deckdeal:coll:histreset', VAL_AT_KEY = 'deckdeal:coll:pxat', VAL_THR_KEY = 'deckdeal:coll:alert', VAL_SEEN_KEY = 'deckdeal:coll:alertseen', VAL_BASE_KEY = 'coll:base';
const VAL_EVERY = 20 * 3600e3, VAL_THRS = [10, 25, 50];
const VAL = { hist: [], reset: 0, base: null, at: 0, thr: 25, seen: -1, run: null, err: '', loaded: null, memo: null, topN: 8, ro: null };      // ro : suit la largeur de la courbe des Stats (valFit)

function valRead() {
  try {
    const h = JSON.parse(localStorage.getItem(VAL_HIST_KEY) || 'null');
    VAL.reset = Number(localStorage.getItem(VAL_RESET_KEY)) || 0;
    if (Array.isArray(h)) VAL.hist = h.filter(x => x && Number.isFinite(x.t) && Number.isFinite(x.v) && x.t >= VAL.reset).sort((a, b) => a.t - b.t).slice(-VAL_MAX);
    VAL.at = Number(localStorage.getItem(VAL_AT_KEY)) || 0;
    const t = Number(localStorage.getItem(VAL_THR_KEY)); if (VAL_THRS.includes(t)) VAL.thr = t;
    const s = localStorage.getItem(VAL_SEEN_KEY); VAL.seen = s == null ? -1 : Number(s);
  } catch (e) { /* illisible ou indisponible : on repart de zéro */ }
}
/** Prix de référence (IndexedDB), chargés une fois. */
function valLoad() {
  if (!VAL.loaded) VAL.loaded = Cache.get(VAL_BASE_KEY, 400 * DAY).then(b => { if (b && b.cur && b.cur.p && !VAL.base) { VAL.base = b; VAL.memo = null; paintCollSection(); if (COLL.el) collPaintHead(); } }).catch(() => { /* cache absent */ });
  return VAL.loaded;
}
function valSave(base) {
  try { localStorage.setItem(VAL_HIST_KEY, JSON.stringify(VAL.hist)); localStorage.setItem(VAL_AT_KEY, String(VAL.at)); if (VAL.reset) localStorage.setItem(VAL_RESET_KEY, String(VAL.reset)); } catch (e) { /* stockage plein : l'historique reste en mémoire */ }
  if (base) Cache.set(VAL_BASE_KEY, VAL.base);
}
/* ── Prix du jour partagés entre les appareils du compte (users/{uid}/meta/prices, extras.js › xsRemote) ─────────────────────────────────────
   Avant, chaque appareil relisait lui-même les prix (une fois par jour, à son heure) : le PC et le téléphone montraient deux valeurs pour la même
   collection, et la courbe (un relevé par jour, le dernier gagne) sautait de l'un à l'autre. Le relevé du jour part dans le compte : prix de référence
   (eu, ef) des cartes et prix des éditions des lignes ; un appareil qui reçoit des prix plus récents que les siens les prend tels quels (VAL.at :
   pas de relecture Scryfall avant 20 h). Cartes ou éditions encore inconnues ici : prises à leur lecture (leurs infos d'abord). */
function prcPushSoon() { if (typeof xsPushSoon === 'function' && D.user) xsPushSoon('prices'); }
/** Document des prix (null : rien à envoyer, ou trop gros pour le compte). */
function prcDoc() {
  const p = {}, e = {}, two = (a, b) => [a > 0 ? a : 0, b > 0 ? b : 0];
  for (const k in COLL.map) { const m = COLL.meta[k]; if (m && (m.eu > 0 || m.ef > 0)) p[k] = two(m.eu, m.ef); }
  for (const ed of collEds()) { const x = COLL.ed[ed]; if (x && !x.none && (x.eu > 0 || x.ef > 0)) e[ed] = two(x.eu, x.ef); }
  if (!VAL.at || !Object.keys(p).length || JSON.stringify(p).length + JSON.stringify(e).length > 800000) return null;
  return { at: VAL.at, p, e, updatedAt: Date.now() };
}
/** Prix plus récents venus du compte : appliqués (true), ou pas plus récents que ceux d'ici (false). */
function prcApply(data) {
  const at = Number(data && data.at) || 0; if (!(at > VAL.at) || at > Date.now() + 864e5) return false;
  const num = v => (Number.isFinite(v) && v > 0 ? Math.round(v) : null), pair = v => Array.isArray(v) && v.length === 2;
  const p = data.p && typeof data.p === 'object' ? data.p : {}, e = data.e && typeof data.e === 'object' ? data.e : {};
  for (const k in p) { const m = COLL.meta[k], v = p[k]; if (m && pair(v)) COLL.meta[k] = { ...m, eu: num(v[0]), ef: num(v[1]) }; }
  for (const ed in e) { const x = COLL.ed[ed], v = e[ed]; if (x && !x.none && pair(v)) COLL.ed[ed] = { ...x, eu: num(v[0]), ef: num(v[1]) }; }
  VAL.at = at; VAL.shared = { p, e }; VAL.memo = null; valSave(false); collMetaSave(); paintCollSection(); if (typeof homeSoon === 'function') homeSoon(); if (COLL.el) collPaintBody(true);
  return true;
}
/** Prix partagés pour une carte (k) ou une édition (ed) lue après eux sur cet appareil : ceux du relevé du compte, pas ceux du moment. */
function prcOver(k, ed) {
  const s = VAL.shared; if (!s) return;
  const num = v => (Number.isFinite(v) && v > 0 ? Math.round(v) : null), pair = v => Array.isArray(v) && v.length === 2;
  if (k && COLL.meta[k] && pair(s.p[k])) COLL.meta[k] = { ...COLL.meta[k], eu: num(s.p[k][0]), ef: num(s.p[k][1]) };
  if (ed && COLL.ed[ed] && !COLL.ed[ed].none && pair(s.e[ed])) COLL.ed[ed] = { ...COLL.ed[ed], eu: num(s.e[ed][0]), ef: num(s.e[ed][1]) };
}
const valSetSeen = d => { VAL.seen = d; try { localStorage.setItem(VAL_SEEN_KEY, String(d)); } catch (e) { /* stockage indisponible */ } };

/** Enregistre le relevé du jour et les prix de référence, d'après les prix Cardmarket (eu) déjà lus dans COLL.meta. */
async function valCommit() {
  await valLoad();
  const items = collItems(), now = Date.now(), p = {}; let v = 0, n = 0, q = 0;
  for (const i of items) if (i.eu > 0) { v += collCardVal(i.k) || i.eu * i.q; n++; q += i.q; const r = (COLL.meta[i.k] || {}).eu; p[i.k] = r > 0 ? r : i.eu; }      // valeur : éditions comprises ; variations : prix de référence de la carte (changer d'édition n'est pas une variation du marché)
  if (!n) return false;
  VAL.hist = histPush(VAL.hist, { t: now, v, n, q });
  const nb = baseRoll(VAL.base, p, now), chg = nb !== VAL.base; VAL.base = nb;
  VAL.at = now; VAL.memo = null; VAL.err = '';
  valSave(chg); xsPushSoon('history'); return true;
}
/** « Recommencer la courbe » (Stats) : les relevés d'avant disparaissent, ici et dans le compte. reset (date) part avec l'historique (meta/history) :
 *  un autre appareil ou une copie plus ancienne ne fait jamais revenir un relevé d'avant (extras.js › xsRemote). Le relevé du jour est refait aussitôt. */
function valResetHist() {
  VAL.reset = Date.now(); VAL.hist = []; VAL.memo = null;
  valSave(false); xsPushSoon('history');
  valCommit().then(() => { paintCollSection(); if (COLL.el) collPaintBody(true); }, () => {});
  paintCollSection(); if (COLL.el) collPaintBody(true);
}
function valResetAsk() {
  openSheet(T('Recommencer la courbe ?'), '', api => {
    api.body.innerHTML = `<p class="cf-msg">${T('Les relevés d\'avant aujourd\'hui sont effacés, sur cet appareil et sur ton compte. La courbe et les variations à 7 et 30 jours repartent de la valeur d\'aujourd\'hui. Tes cartes ne changent pas.')}</p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn danger" type="button" data-ok>${T('Recommencer')}</button>`);
    api.foot.addEventListener('click', e => { if (e.target.closest('[data-ok]')) { api.close(); haptic('ok'); valResetHist(); toast(T('Courbe remise à zéro')); } });
  });
}
/** Relit les prix de toutes les cartes (si le dernier relevé a plus de 20 h, ou sur demande), puis enregistre le relevé. Silencieux en cas d'échec. */
async function valRefresh(opts) {
  opts = opts || {};
  if (VAL.run) return VAL.run.p;
  if (!collCount() || collMissing().length || COLL.enrich) return;
  if (!opts.force && Date.now() - VAL.at < VAL_EVERY) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { if (opts.force) { VAL.err = T('Hors ligne : réessaie avec du réseau.'); collPaint(); } return; }
  if (scryLeft() > 0) { if (opts.force) { VAL.err = T('Scryfall demande une pause : réessaie dans {s} s.', { s: Math.ceil(scryLeft() / 1000) }); collPaint(); } return; }
  await valLoad();
  if (!opts.force && COLL.freshAt && Date.now() - COLL.freshAt < 15 * 60e3) { await valCommit(); prcPushSoon(); collPaint(); paintCollSection(); return; }      // la collection vient d'être lue en entier : prix déjà à jour
  const keys = Object.keys(COLL.map), run = VAL.run = { done: 0, total: keys.length, ctrl: new AbortController() };
  VAL.err = '';
  run.p = (async () => {
    try {
      const got = await scryCollection(keys.map(k => COLL.map[k].n), run.ctrl.signal, n => { run.done = n; collPaintHead(); });
      for (const k of keys) { const g = got.get(k), old = COLL.meta[k]; if (g && old && (g.eu > 0 || g.ef > 0)) COLL.meta[k] = { ...old, ...(g.eu > 0 ? { eu: g.eu } : {}), ...(g.ef > 0 ? { ef: g.ef } : {}) }; }      // prix foil aussi (avant : jamais relu)
      await edRefresh(true, run.ctrl.signal);      // prix des éditions des lignes, relus avec le reste
      COLL.freshAt = Date.now(); collMetaSave(); await valCommit(); prcPushSoon();      // prix du jour : partagés avec les autres appareils du compte
    } catch (e) { if (e.name !== 'AbortError') VAL.err = e.code === 'rate' ? T('Scryfall limite les requêtes : réessaie dans une minute.') : T('Prix Cardmarket injoignables pour l\'instant.'); }
    finally { VAL.run = null; collPaint(); paintCollSection(); }
  })();
  collPaintHead();
  return run.p;
}
const valMaybe = () => { valRefresh().catch(() => {}); };

/** Cartes dont le prix a bougé depuis la référence (null sans référence). Mémorisé tant que rien ne change. */
function valMovers() {
  const ref = baseRef(VAL.base); if (!ref) return null;
  const sig = [VAL.at, VAL.thr, collCount(), COLL.u, ref.t].join('|');
  if (VAL.memo && VAL.memo.sig === sig) return VAL.memo.mv;
  const mv = pxMovers(Object.entries(COLL.map).map(([k, x]) => ({ k, n: x.n, q: x.q, eu: (COLL.meta[k] || {}).eu })), ref, VAL.thr);
  mv.since = ref.t; mv.by = new Map(mv.list.map(x => [x.k, x])); mv.ready = VAL.at - ref.t >= VAL_EVERY;      // moins de 20 h d'écart : rien n'a pu bouger, on n'affiche pas de variation
  VAL.memo = { sig, mv }; return mv;
}
/** Variation d'une carte à signaler (pastille ▲▼ de la liste), ou null. */
const valMove = k => { const mv = valMovers(); return mv && mv.ready ? mv.by.get(k) || null : null; };
/** Nombre de prix en mouvement à signaler et pas encore écartés (accueil, bannière). */
const valAlertN = () => { const mv = valMovers(); return mv && mv.ready && VAL.seen !== dayOf(VAL.at) ? mv.list.length : 0; };

const valPct = p => (p > 0 ? '+' : p < 0 ? '−' : '') + T('{n} %', { n: nf0(Math.round(Math.abs(p))) });
const valEur = c => (c > 0 ? '+' : c < 0 ? '−' : '') + fmt(Math.abs(c), 'EUR');
const valCls = x => (x > 0 ? 'vu' : x < 0 ? 'vd' : '');
const valDate = t => new Date(t).toLocaleDateString(LOC(), { day: 'numeric', month: 'short' });
const valTag = m => `<span class="tag vm ${valCls(m.d)}" title="${T('Cardmarket : {a} → {b}', { a: esc(fmt(m.u0, 'EUR')), b: esc(fmt(m.u1, 'EUR')) })}">${m.d > 0 ? '▲' : '▼'} ${valPct(m.pct)}</span>`;

/** Courbe de la valeur (SVG à l'échelle : axes min/max réels, temps proportionnel). W, H : taille du dessin (l'accueil sur ordinateur la prend de sa case). */
function valChartHtml(h, W = 320, H = 132) {
  const pl = 8, pr = 8, pt = 16, pb = 20, vs = h.map(x => x.v), min = Math.min(...vs), max = Math.max(...vs);
  const pad = (max - min) * 0.14 || max * 0.03 || 1, lo = min - pad, hi = max + pad, t0 = h[0].t, t1 = h[h.length - 1].t;
  const X = t => pl + (W - pl - pr) * (t1 > t0 ? (t - t0) / (t1 - t0) : 1), Y = v => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo)), f = n => n.toFixed(1);
  const pts = h.map(x => f(X(x.t)) + ',' + f(Y(x.v))), last = h[h.length - 1];
  const area = `M${f(X(t0))},${f(H - pb)} L${pts.join(' L')} L${f(X(t1))},${f(H - pb)} Z`;
  const grid = max === min ? [max] : [max, min];
  return `<svg class="vl-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${T('Valeur de la collection du {d0} au {d1} : de {v0} à {v1}', { d0: esc(valDate(t0)), d1: esc(valDate(t1)), v0: esc(fmt(h[0].v, 'EUR')), v1: esc(fmt(last.v, 'EUR')) })}">
    ${grid.map((v, i) => `<line x1="${pl}" x2="${W - pr}" y1="${f(Y(v))}" y2="${f(Y(v))}" class="vl-grid"/><text x="${pl}" y="${f(Y(v) + (i ? 11 : -4))}" class="vl-txt">${esc(fmt(v, 'EUR'))}</text>`).join('')}
    <path d="${area}" class="vl-area"/><polyline points="${pts.join(' ')}" class="vl-line" fill="none"/>
    <circle cx="${f(X(last.t))}" cy="${f(Y(last.v))}" r="3.4" class="vl-dot"/>
    <text x="${pl}" y="${H - 5}" class="vl-txt">${esc(valDate(t0))}</text><text x="${W - pr}" y="${H - 5}" class="vl-txt" text-anchor="end">${esc(valDate(t1))}</text></svg>`;
}
/** Courbe de l'onglet Stats à la taille de sa case. Téléphone : le dessin de 320 × 132 mis à la largeur de l'écran, comme toujours. Ordinateur : redessinée
 *  à sa largeur réelle (un pixel du dessin = un pixel de l'écran : textes à leur taille, trait fin), hauteur proportionnelle bornée à 150–230 px ; elle n'est
 *  plus étirée sur 1 000 px de large et plus d'un écran de haut. Suit la largeur de sa case (fenêtre redimensionnée, passage téléphone ↔ ordinateur). */
function valFit(host) {
  if (VAL.ro) { VAL.ro.disconnect(); VAL.ro = null; }
  const box = host && $('.vl-box', host);
  if (!box || !$('.vl-svg', box) || typeof ResizeObserver !== 'function') return;
  const draw = () => {
    const s = $('.vl-svg', box); if (!s || !box.isConnected || VAL.hist.length < 2) return;
    const desk = typeof NAV_DESK !== 'undefined' && !!NAV_DESK && NAV_DESK.matches, cw = Math.round(s.getBoundingClientRect().width);
    if (!cw) return;      // collection cachée
    const W = desk ? cw : 320, H = desk ? Math.max(150, Math.min(230, Math.round(W * 0.36))) : 132, vb = (s.getAttribute('viewBox') || '').split(' ');
    if (Math.abs(Number(vb[2]) - W) < 2 && Number(vb[3]) === H) return;
    s.outerHTML = valChartHtml(VAL.hist, W, H);
  };
  draw();      // tout de suite : jamais une image de la courbe étirée
  let raf = 0;
  VAL.ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); });
  VAL.ro.observe(box);
}
const valDeltaHtml = (lab, d) => `<div class="vl-d"><span>${lab}</span>${d ? `<b class="${valCls(d.d)}">${valEur(d.d)}</b><small>${(d.pct == null ? '' : valPct(d.pct) + ' · ') + T('depuis le {d}', { d: esc(valDate(d.from.t)) })}</small>` : '<b>—</b><small>' + T('pas encore de recul') + '</small>'}</div>`;

/** Rangée d'une carte qui a bougé (Stats). */
function valMoveRow(m) {
  const meta = COLL.meta[m.k] || {}, im = collImage(m.k, (COLL.map[m.k] || {}).l, meta.im).src;
  return `<div class="crow ro" data-k="${esc(m.k)}"><span class="thumb" style="--h:${hash32(m.k) % 360}"${zoomAt('coll', m.n)}>${esc((m.n.trim()[0] || '?').toUpperCase())}${im ? `<img alt="" loading="lazy" decoding="async" src="${esc(im)}">` : ''}</span>
    <span class="row-main"><span class="row-name">${esc(m.n)}</span><span class="row-meta">${m.q > 1 ? `<span class="tag accent">× ${nf0(m.q)}</span>` : ''}${valTag(m)}</span></span>
    <span class="row-price vl-mp"><b class="${valCls(m.lot)}">${valEur(m.lot)}</b><small>${esc(fmt(m.u0, 'EUR'))} → ${esc(fmt(m.u1, 'EUR'))}${m.q > 1 ? ' × ' + nf0(m.q) : ''}</small></span></div>`;
}
/** Sections « Valeur dans le temps » et « Variations des prix » de l'onglet Stats. */
function valStatsHtml() {
  const h = VAL.hist, run = VAL.run;
  const ago = VAL.at ? pxAgo(VAL.at) : '', status = run ? T('Lecture des prix · {a} / {b}', { a: nf0(run.done), b: nf0(run.total) }) : VAL.err ? esc(VAL.err) : VAL.at ? T('Dernier relevé : {ago}', { ago }) : T('Aucun relevé pour l\'instant');
  const act = run ? '' : `<button class="link-btn" type="button" data-act="valnow">${T('Actualiser')}</button>`;
  let chart;
  if (h.length >= 2) chart = `${valChartHtml(h)}<div class="vl-ds">${valDeltaHtml(T('7 jours'), histDelta(h, 7))}${valDeltaHtml(T('30 jours'), histDelta(h, 30))}</div>`;
  else if (h.length === 1) chart = `<p class="hint vl-first">${T('Premier relevé : <b>{v}</b>. La courbe apparaît dès demain.', { v: esc(fmt(h[0].v, 'EUR')) })}</p>`;
  else chart = `<p class="hint vl-first">${VAL.err || run ? T('Relevé en cours…') : collMissing().length ? T('Le premier relevé aura lieu quand toutes les cartes auront leurs infos.') : T('Le premier relevé va être enregistré.')}</p>`;
  const val = `<h3 class="cs-h">${T('Valeur dans le temps')} <small>${T('tendance Cardmarket')}</small></h3><div class="vl-box">${chart}<div class="vl-foot"><span>${status}</span>${act}</div></div>
    <p class="hint">${T('Un relevé par jour, gardé sur cet appareil (et sur ton compte si tu es connecté). La valeur varie aussi quand tu ajoutes ou retires des cartes.')}${h.length ? ` <button class="link-btn" type="button" data-act="valreset">${T('Recommencer la courbe')}</button>` : ''}</p>`;
  const mv = valMovers();
  const thr = `<span class="cs-sw" role="group" aria-label="${T('Seuil de variation')}">${VAL_THRS.map(t => `<button type="button" data-act="valthr" data-v="${t}" aria-pressed="${VAL.thr === t}" class="${VAL.thr === t ? 'on' : ''}">${T('{n} %', { n: t })}</button>`).join('')}</span>`;
  let body;
  if (!mv || !mv.ready) body = `<p class="hint">${VAL.base ? T('Suivi commencé le {d} : les variations s\'affichent dès qu\'un jour a passé.', { d: esc(valDate(VAL.base.cur.t)) }) : T('Les variations s\'affichent après le premier relevé et un jour d\'écart.')}</p>`;
  else {
    const shown = mv.list.slice(0, VAL.topN), more = mv.list.length - shown.length;
    body = `<div class="vl-sum"><span>${T('Marché sur ta collection depuis le {d}', { d: esc(valDate(mv.since)) })}</span><b class="${valCls(mv.total)}">${valEur(mv.total)}</b></div>
      <p class="hint cs-topnote">${T('Prix Cardmarket carte par carte, hors cartes ajoutées depuis. Seules comptent les hausses et baisses d\'au moins {t} % et 0,20 € par exemplaire.', { t: VAL.thr })}</p>
      ${shown.length ? `<div class="cs-top vl-top">${shown.map(valMoveRow).join('')}</div>${more > 0 ? `<button class="btn ghost block coll-more" type="button" data-act="valmore">${T('Afficher {a} de plus · {b} restantes', { a: nf0(Math.min(8, more)), b: nf0(more) })}</button>` : ''}` : `<p class="hint listempty">${T('Aucune carte n\'a bougé de plus de {t} %.', { t: VAL.thr })}</p>`}`;
  }
  return `${val}<h3 class="cs-h" id="valMv">${T('Variations des prix')} ${thr}</h3>${body}`;
}

/** Bannière d'alerte en haut de l'écran de la collection (onglets Cartes et Decks). */
function valPaintAlert() {
  const el = COLL.el, host = el && $('.coll-alert', el); if (!host) return;
  const n = COLL.tab === 'stats' ? 0 : valAlertN();
  if (!n) { host.hidden = true; return; }
  const mv = valMovers(), top = mv.list.slice(0, 2).map(m => `${m.d > 0 ? '▲' : '▼'} ${esc(m.n.split(' // ')[0])} ${valPct(m.pct)}`).join(' · ');
  host.hidden = false; host.innerHTML = `<span class="al-t">${TN(n, '<b>{n} prix a bougé de plus de {t} %</b> depuis le {d}', '<b>{n} prix ont bougé de plus de {t} %</b> depuis le {d}', { t: VAL.thr, d: esc(valDate(mv.since)) })}${top ? ' · ' + top : ''}</span><button class="link-btn" type="button" data-act="valsee">${T('Voir')}</button><button class="link-btn" type="button" data-act="valhide">${T('Ignorer')}</button>`;
}
/** Clics des Stats « valeur » et de la bannière (appelé depuis l'écran de la collection). Retourne true si le clic était pour lui. */
function valClick(e) {
  const b = e.target.closest('button[data-act]'); if (!b) return false;
  const act = b.dataset.act;
  if (act === 'valnow') { haptic('tap'); valRefresh({ force: true }); }
  else if (act === 'valreset') { haptic('tap'); valResetAsk(); }
  else if (act === 'valthr') { const t = Number(b.dataset.v); if (VAL_THRS.includes(t) && t !== VAL.thr) { VAL.thr = t; VAL.memo = null; VAL.topN = 8; try { localStorage.setItem(VAL_THR_KEY, String(t)); } catch (x) { /* stockage indisponible */ } haptic('tap'); collPaintBody(true); paintCollSection(); } }
  else if (act === 'valmore') { VAL.topN += 8; collPaintBody(true); }
  else if (act === 'valhide') { valSetSeen(dayOf(VAL.at)); haptic('tap'); valPaintAlert(); paintCollSection(); }
  else if (act === 'valsee') {
    valSetSeen(dayOf(VAL.at)); COLL.tab = COLL.ctab = 'stats'; COLL.shown = COLL_PAGE; haptic('tap');
    const sg = $('#collSeg', COLL.el); if (sg && sg.setValue) sg.setValue('stats');
    collPaintBody(false); paintCollSection();
    const t = $('#valMv', COLL.el); if (t) t.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
  } else return false;
  return true;
}
function valInit() {
  valRead(); valLoad();
  setTimeout(valMaybe, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(valMaybe, 1500); });
}
