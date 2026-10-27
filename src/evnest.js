/* ── evnest.js : le nid de Pâques (pack.nest), côté appli ─────────────────────────────────────────────────────────────────────────────
   La chasse habituelle (event.js) : {per} œufs cachés par jour dans l'appli. Chaque œuf trouvé rejoint le nid : une couvée de {nest.per} œufs, un par couleur
   du mana (W → U → B → R → G). Plus la couvée se remplit, plus son œuf se fêle ; au dernier œuf, il éclot : un poussin de plus dans le nid ({total} / {per}
   poussins en tout). Les badges comptent les poussins éclos (pack.badge.tiers), pas les œufs.
   · Accueil : la carte de la fête devient le nid (une case par couvée : poussin éclos, couvée en cours et ses œufs du mana, couvées à venir).
   · Éclosion : plein écran (l'œuf se fend, le poussin sort, le badge gagné) ; la dernière : puis la célébration (event.js › evParty).
   Dessins : evart.js (œuf, œufs du mana, hatch : éclosion par étapes, poussin), css/event-nest.css (mise en page), css/ev-paques.css (couleurs). */
const NEST_MANA = { W: 'blanc', U: 'bleu', B: 'noir', R: 'rouge', G: 'vert' };

/** Nid d'une édition : { e, p, n (œufs), per, broods: [{ i, got (0…per), done }], hatched, cur (couvée en cours ou null) } ; null : pas un nid. */
function nestOf(id) {
  const e = typeof evById === 'function' ? evById(id) : null, p = e && evPack(e.pack); if (!p || !p.nest) return null;
  const per = p.nest.per, n = Math.min(e.total, evCount(id));
  const broods = Array.from({ length: Math.round(e.total / per) }, (_, i) => { const got = Math.max(0, Math.min(per, n - i * per)); return { i, got, done: got >= per }; });
  return { e, p, n, per, broods, hatched: broods.filter(b => b.done).length, cur: broods.find(b => !b.done) || null };
}
const nestNow = () => (EV.st && EV.st.ev && evPackOf() && evPackOf().nest ? nestOf(EV.st.ev.id) : null);
/** Étape d'éclosion d'une couvée (EV_ART.hatch) : 0 intact, 1 fêlé, 2 le poussin regarde, 3 éclos. */
const nestStage = (b, per) => (b.done ? 3 : b.got >= per - 1 ? 2 : b.got >= Math.ceil(per / 2) ? 1 : 0);
const nestArt = (b, s, o = {}) => (typeof EV_ART !== 'undefined' && EV_ART.hatch ? EV_ART.hatch({ stage: nestStage(b, s.per), v: b.i % 5, ...o }) : '');
/** Œufs du mana d'une couvée : trouvés en couleur, les autres en creux. */
const nestEggs = (b, s) => s.p.nest.mana.map((k, j) => `<i class="nest-egg${j < b.got ? ' on' : ''}" title="${esc(T(NEST_MANA[k]))}">${EV_ART.egg({ mana: k, cls: 'evo-still' })}</i>`).join('');

/* ── Accueil : le nid ──────────────────────────────────────────────────────────────────────────────────────── */
/** Contenu de la carte de la fête (event.js › evHomePaint). */
function nestCardHtml(s, me) {
  const p = s.p, e = s.e, y = e.year || e.id.slice(-4), tiers = p.badge.tiers, nx = tiers.find(t => t > s.hatched), c = s.cur;
  const sub = me.left > 0 ? TN(me.left, 'Encore {n} œuf à dénicher aujourd\'hui', 'Encore {n} œufs à dénicher aujourd\'hui')
    : !c ? evTx('allDone', { total: s.broods.length }) : T('Tous les œufs du jour sont au nid : reviens demain');
  const slots = s.broods.map(b => `<figure class="nest-b${b.done ? ' done' : ''}${b === c ? ' cur' : ''}" data-i="${b.i}">${nestArt(b, s, { cls: 'evo-still' })}<figcaption>${b.done ? esc(T('Éclos')) : `${b.got} / ${s.per}`}</figcaption></figure>`).join('');
  return `<button class="hm-tr-h hm-ev-h" type="button" data-ev="open"><span class="hm-ev-ic" aria-hidden="true">${EV_ART[p.obj.art]({ cls: 'evo-still' })}</span>
      <span class="hm-tr-t"><b id="hmEvT">${esc(evTx('short'))} ${esc(String(y))}</b><span>${esc(sub)}</span></span>
      <span class="hm-ev-n"><b>${nf0(s.hatched)}</b><small>/ ${nf0(s.broods.length)}</small></span></button>
    <div class="nest-row" role="img" aria-label="${esc(TN(s.hatched, '{n} poussin éclos sur {t}', '{n} poussins éclos sur {t}', { t: s.broods.length }))}">${slots}</div>
    ${c ? `<div class="nest-cur"><span class="nest-cur-t">${esc(T('Couvée {i} sur {t}', { i: c.i + 1, t: s.broods.length }))}</span><span class="nest-eggs" aria-label="${esc(TN(c.got, '{n} œuf sur {t}', '{n} œufs sur {t}', { t: s.per }))}">${nestEggs(c, s)}</span></div>` : ''}
    <div class="hm-ev-ft"><span class="hm-ev-bdg" aria-hidden="true">${tiers.map((t, i) => `<span class="${s.hatched >= t ? 'ok' : ''}">${evBadgeHtml(e.id, i, s.hatched >= t)}</span>`).join('')}</span>
      <span class="hm-ev-d">${EV.st.ev.left > 0 ? esc(TN(EV.st.ev.left, 'Encore {n} jour', 'Encore {n} jours')) : esc(T('Dernier jour'))}${nx ? ' · ' + esc(TN(nx, 'prochain badge à {n} poussin', 'prochain badge à {n} poussins')) : ''}</span>
      <button class="link-btn" type="button" data-ev="open">${T('Indices')}</button></div>`;
}

/* ── Éclosion : plein écran ─────────────────────────────────────────────────────────────────────────────────── */
/** Après une trouvaille (event.js › evTap) : une couvée vient de se compléter → éclosion ; vrai si montrée. n0 : œufs avant la trouvaille. */
function nestAfterFind(n0, me) {
  const s = nestNow(); if (!s) return false;
  const per = s.per; if (Math.floor(me.n / per) <= Math.floor(n0 / per) || me.n % per) return false;
  nestHatch(s, s.broods[me.n / per - 1], { then: !s.cur ? evParty : null });
  return true;
}
/** Plein écran : la couvée b éclot (l'œuf se fend, puis le poussin sort). o.then : à la fermeture. */
function nestHatch(s, b, o = {}) {
  if (!b || document.querySelector('.adv-open')) return;
  const p = s.p, icon = n => (typeof EV_ART !== 'undefined' && EV_ART[n] ? EV_ART[n]() : ''), i = p.badge.tiers.indexOf(s.hatched);
  const rw = i >= 0 ? `<ul class="adv-rw"><li><span class="adv-rw-ic" aria-hidden="true">${evBadgeHtml(s.e.id, i, true)}</span><span><b>${esc(T('Badge « {b} »', { b: T(p.badge.names[i]) }))}</b><small>${esc(TN(s.hatched, '{n} poussin éclos', '{n} poussins éclos'))}</small></span></li></ul>` : '';
  const el = document.createElement('div'); el.className = 'adv-open nest-open'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'nestT');
  const art = st => `<span class="nest-st nest-st${st}">${EV_ART.hatch({ stage: st, v: b.i % 5, lit: st === 3 })}</span>`;
  el.innerHTML = `<div class="adv-bg" aria-hidden="true"></div>
    <div class="adv-in">
      <div class="nest-big" aria-hidden="true">${reduceMotion() ? art(3) : art(2) + art(3)}</div>
      <div class="adv-tx">
        <small>${esc(T('Couvée {i} sur {t}', { i: b.i + 1, t: s.broods.length }))}</small>
        <h2 id="nestT">${esc(T('Un poussin est né !'))}</h2>
        <p class="adv-have">${esc(s.cur ? TN(s.hatched, '{n} poussin dans ton nid. Une nouvelle couvée commence.', '{n} poussins dans ton nid. Une nouvelle couvée commence.') : T('Les {n} poussins sont nés : ton nid est complet.', { n: s.broods.length }))}</p>
        ${rw}
        <div class="adv-acts"><button class="btn" type="button" data-adv-close>${T('Super !')}</button></div>
      </div>
    </div>`;
  document.body.appendChild(el); haptic('ok');
  const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), reduceMotion() ? 0 : 380); document.removeEventListener('keydown', key, true); if (o.then) setTimeout(o.then, reduceMotion() ? 50 : 500); };
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  document.addEventListener('keydown', key, true);
  el.addEventListener('click', e => { if (e.target.closest('[data-adv-close]')) { haptic('tap'); close(); } });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.classList.add('on');
    const big = el.querySelector('.nest-big'), bx = big.getBoundingClientRect();
    if (!reduceMotion()) setTimeout(() => { if (!el.isConnected) return; big.classList.add('out'); haptic('ok'); if (typeof evSparks === 'function') evSparks(el, bx.left + bx.width / 2, bx.top + bx.height / 2, bx.width); }, 1100);
    el.querySelector('[data-adv-close]').focus({ preventScroll: true });
  }));
  if (typeof prgSoon === 'function') prgSoon('event');
}
