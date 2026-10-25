/* ── evsky.js : nuit des étoiles filantes (pack.sky : Nouvel an), côté appli ─────────────────────────────────────────────────────────────
   La chasse habituelle (event.js) : {per} étoiles filantes cachées par jour dans l'appli. Chaque étoile attrapée allume une étoile du ciel : 5 constellations
   (une par couleur de mana : Soleil, Goutte, Crâne, Flamme, Arbre) de {sky.per} étoiles, allumées dans l'ordre W → U → B → R → G.
   · Accueil : la carte de la fête devient un ciel de nuit (les 5 constellations, compte à rebours jusqu'à minuit le 1er janvier, puis « Bonne année »).
   · Constellation complète : plein écran (la constellation qui s'illumine, le badge gagné) ; la 5e : la couverture unique du classeur, puis la célébration.
   · Minuit : feu d'artifice plein écran, une fois par appareil (à la première ouverture après minuit, ou à minuit pile si l'appli est ouverte).
   · « Ton année Magic » : bilan de l'année (scans, collection, valeur, parties, échanges, ouvertures, niveau, couleur préférée, plus belle carte), en image
     à partager (simg.js › 'year'). Compteurs sans date (scans, jours) : relevés au premier lancement de chaque année (deckdeal:yr) pour l'année suivante.
   · Récompenses (evadvent.js › advRewards) : couverture « Constellations » (les 30 étoiles), couleurs rares (1 chance sur 100 par jour joué : tirage du serveur).
   Dessins : evart.js (étoile filante, constellations EV_CONS, feu d'artifice, planètes de mana), css/event-sky.css (mise en page), css/ev-nouvelan.css (couleurs). */
const SKY = { cdT: 0, fwT: 0, fwAt: 0 };
const SKY_YR_KEY = 'deckdeal:yr';      // relevés de début d'année : { "2026": { sc, days, t } } (compteurs sans date)
const SKY_NAMES = { W: 'Soleil', U: 'Goutte', B: 'Crâne', R: 'Flamme', G: 'Arbre' };
const SKY_MANA = { W: 'Blanc', U: 'Bleu', B: 'Noir', R: 'Rouge', G: 'Vert' };
const SKY_FULL = { W: 'Constellation du Soleil', U: 'Constellation de la Goutte', B: 'Constellation du Crâne', R: 'Constellation de la Flamme', G: 'Constellation de l\'Arbre' };

/** Ciel d'une édition : { e, p, n (étoiles), cons: [{ k, lit (0…per), done }], done (constellations complètes), dr (couleurs rares : { jour: couleur }) } ; null : pas un ciel. */
function skyOf(id) {
  const e = typeof evById === 'function' ? evById(id) : null, p = e && evPack(e.pack); if (!p || !p.sky) return null;
  const st = EV.st, n = Math.min(e.total, evCount(id)), per = p.sky.per;
  const cons = p.sky.cons.map((k, i) => { const lit = Math.max(0, Math.min(per, n - i * per)); return { k, lit, done: lit >= per }; });
  const dr = evDrops(evMine(id).dr, EV.doc && EV.doc[id] && EV.doc[id].dr, st && st.ev && st.ev.id === id && st.me ? st.me.dr : null);
  return { e, p, n, cons, done: cons.filter(c => c.done).length, dr };
}
const skyNow = () => (EV.st && EV.st.ev && evPackOf() && evPackOf().sky ? skyOf(EV.st.ev.id) : null);
/** Minuit (Paris) du 1er janvier qui suit l'édition (ms). */
const skyMidnight = e => evNextMidnight(Date.parse(`${e.year || e.id.slice(-4)}-12-31T12:00:00Z`));
const skyName = k => T(SKY_FULL[k]);
const skyArt = (k, o) => (typeof EV_ART !== 'undefined' && EV_ART.constellation ? EV_ART.constellation({ k, ...o }) : '');

/* ── Accueil : le ciel ──────────────────────────────────────────────────────────────────────────────────────── */
/** Compte à rebours : [jours, heures, minutes, secondes] jusqu'à t. */
function skyLeft(t) { const s = Math.max(0, Math.floor((t - Date.now()) / 1000)); return [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60]; }
const SKY_CD = [['jour', 'jours'], ['heure', 'heures'], ['min', 'min'], ['sec', 'sec']];
/** Contenu de la carte de la fête (event.js › evHomePaint). */
function skyCardHtml(s, me) {
  const p = s.p, e = s.e, y = e.year, mid = skyMidnight(e), after = Date.now() >= mid, tiers = p.badge.tiers, nx = tiers.find(t => t > s.done);
  const cur = s.cons.find(c => !c.done);
  const sub = me.left > 0 ? TN(me.left, 'Encore {n} étoile filante à attraper aujourd\'hui', 'Encore {n} étoiles filantes à attraper aujourd\'hui')
    : s.n >= e.total ? evTx('allDone') : T('Toutes les étoiles du jour sont attrapées : reviens demain');
  const cons = s.cons.map(c => `<figure class="sky-c${c.done ? ' done' : ''}${c === cur ? ' cur' : ''}" data-k="${c.k}">${skyArt(c.k, { lit: c.lit, done: c.done })}<figcaption>${esc(T(SKY_NAMES[c.k]))}<small>${c.lit} / ${p.sky.per}</small></figcaption></figure>`).join('');
  const cd = skyLeft(mid);
  const clock = after ? `<div class="sky-ny"><b>${esc(T('Bonne année {y} !', { y: y + 1 }))}</b><button class="btn sky-yr" type="button" data-sky="year">${esc(T('Ton année Magic {y}', { y }))}</button></div>`
    : `<div class="sky-cd" role="timer" aria-label="${esc(T('Avant minuit, le 1er janvier'))}">${cd.map((v, i) => `<span><b>${String(v).padStart(i ? 2 : 1, '0')}</b><small>${esc(T(SKY_CD[i][v > 1 ? 1 : 0]))}</small></span>`).join('')}</div>
      <p class="sky-cd-l">${esc(T('avant minuit'))} · <button class="link-btn" type="button" data-sky="year">${esc(T('Ton année Magic {y}', { y }))}</button></p>`;
  return `<button class="hm-tr-h hm-ev-h" type="button" data-ev="open"><span class="hm-ev-ic" aria-hidden="true">${EV_ART[p.obj.art]({ cls: 'evo-still' })}</span>
      <span class="hm-tr-t"><b id="hmEvT">${esc(evTx('short'))} ${esc(String(y))}</b><span>${esc(sub)}</span></span>
      <span class="hm-ev-n"><b>${nf0(s.n)}</b><small>/ ${nf0(e.total)}</small></span></button>
    <div class="sky-cons" role="img" aria-label="${esc(TN(s.done, '{n} constellation complète sur 5', '{n} constellations complètes sur 5'))}">${cons}</div>
    ${clock}
    <div class="hm-ev-ft"><span class="hm-ev-bdg" aria-hidden="true">${tiers.map((t, i) => `<span class="${s.done >= t ? 'ok' : ''}">${evBadgeHtml(e.id, i, s.done >= t)}</span>`).join('')}</span>
      <span class="hm-ev-d">${EV.st.ev.left > 0 ? esc(TN(EV.st.ev.left, 'Encore {n} jour', 'Encore {n} jours')) : esc(T('Dernier jour'))}${nx ? ' · ' + esc(T('prochain badge à {n}', { n: nx })) : ''}</span>
      <button class="link-btn" type="button" data-ev="open">${T('Indices')}</button></div>`;
}
/** Après le dessin de la carte : compte à rebours (chaque seconde, carte visible), feu d'artifice de minuit. */
function skyMount(s) {
  clearInterval(SKY.cdT); SKY.cdT = 0;
  const mid = skyMidnight(s.e);
  if (Date.now() < mid) SKY.cdT = setInterval(() => {
    const box = document.getElementById('hmEvent'), cd = box && box.querySelector('.sky-cd');
    if (!cd) { clearInterval(SKY.cdT); SKY.cdT = 0; return; }
    if (document.hidden) return;
    if (Date.now() >= mid) { clearInterval(SKY.cdT); SKY.cdT = 0; box.dataset.sig = ''; evHomePaint(); return; }
    skyLeft(mid).forEach((v, i) => { const sp = cd.children[i]; if (!sp) return; const t = String(v).padStart(i ? 2 : 1, '0'); if (sp.firstChild.textContent !== t) { sp.firstChild.textContent = t; sp.lastChild.textContent = T(SKY_CD[i][v > 1 ? 1 : 0]); } });
  }, 1000);
  skyFwSoon(s);
}
/** Clic dans la carte du ciel (« Ton année »). */
function skyTap(e) { const b = e.target.closest('[data-sky]'); if (!b) return false; haptic('tap'); if (b.dataset.sky === 'year') skyYear(); return true; }

/* ── Constellation complète, couleur rare : plein écran ────────────────────────────────────────────────────────── */
/** Après une trouvaille (event.js › evTap) : une constellation vient de se compléter, ou une couleur rare vient d'être tirée → plein écran ; vrai si montré.
 *  n0 : étoiles avant la trouvaille ; dr0 : couleurs rares d'avant. */
function skyAfterFind(n0, dr0, me) {
  const s = skyNow(); if (!s) return false;
  const per = s.p.sky.per, k = Math.floor(me.n / per) > Math.floor(n0 / per) && me.n % per === 0 ? s.cons[me.n / per - 1] : null;
  const fresh = Object.keys(s.dr).filter(i => !(dr0 && dr0[i])).map(i => s.dr[i]);
  if (!k && !fresh.length) return false;
  skyReveal(s, k, fresh, { then: me.n >= EV.st.ev.total ? evParty : null });
  return true;
}
/** Plein écran : constellation (c) illuminée et/ou couleurs rares (rare : [ids]). o.then : à la fermeture. */
function skyReveal(s, c, rare, o = {}) {
  if (document.querySelector('.adv-open')) return;
  const p = s.p, icon = n => (typeof EV_ART !== 'undefined' && EV_ART[n] ? EV_ART[n]() : ''), covName = id => { const x = typeof BND_COVERS !== 'undefined' ? BND_COVERS.find(z => z[0] === id) : null; return T(x ? x[1] : id); };
  const rw = [], all = s.n >= s.e.total;
  for (const r of rare || []) rw.push(['rwCover', T('Couleur rare : « {c} »', { c: covName(r) }), T('1 chance sur 100 par jour de chasse. Dans les réglages de ton classeur, section Échange.'), 'rare']);
  if (c) { const i = p.badge.tiers.indexOf(s.done); if (i >= 0) rw.push(['rwSky', T('Badge « {b} »', { b: T(p.badge.names[i]) }), TN(s.done, '{n} constellation complète', '{n} constellations complètes')]); }
  if (c && all) rw.push(['rwCover', T('Couverture « {c} »', { c: covName(p.sky.done.cover) }), T('Le ciel étoilé sur ton classeur, rien que pour ceux qui ont tout trouvé. Dans ses réglages, section Échange.'), 'anim']);
  const el = document.createElement('div'); el.className = 'adv-open sky-open'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'skyT');
  const head = c ? T('Constellation {i} sur 5', { i: s.cons.indexOf(c) + 1 }) : T('Étoile porte-bonheur');
  el.innerHTML = `<div class="adv-bg" aria-hidden="true"></div>
    <div class="adv-in">
      <div class="sky-big${c ? '' : ' rare'}" aria-hidden="true">${c ? skyArt(c.k, { lit: p.sky.per, done: true }) : icon('rwStar')}</div>
      <div class="adv-tx">
        <small>${esc(head)}</small>
        <h2 id="skyT">${esc(c ? skyName(c.k) : T('Une couleur rare !'))}</h2>
        <p class="adv-have">${esc(c ? T('Le {m} brille dans ton ciel.', { m: T(SKY_MANA[c.k]) }) : T('Une étoile pas comme les autres : ton classeur change de ciel.'))}</p>
        ${rw.length ? `<ul class="adv-rw">${rw.map(([ic, t, d, cl]) => `<li${cl ? ` class="${cl}"` : ''}><span class="adv-rw-ic" aria-hidden="true">${icon(ic)}</span><span><b>${esc(t)}</b><small>${esc(d)}</small></span></li>`).join('')}</ul>` : ''}
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
    const b = el.querySelector('.sky-big').getBoundingClientRect();
    if (!reduceMotion() && typeof evSparks === 'function') setTimeout(() => { if (el.isConnected) evSparks(el, b.left + b.width / 2, b.top + b.height / 2, b.width); }, 500);
    el.querySelector('[data-adv-close]').focus({ preventScroll: true });
  }));
  if (typeof ADV !== 'undefined') ADV.rw = null;      // une couleur vient peut-être d'arriver
  if (typeof prgSoon === 'function') prgSoon('event');
}

/* ── Minuit : feu d'artifice ──────────────────────────────────────────────────────────────────────────────── */
/** Programme le feu d'artifice : passé minuit (et pendant l'édition) → dès que l'appli est au calme ; minuit dans moins de 6 h → à minuit pile. Une fois par appareil. */
function skyFwSoon(s) {
  const id = s.e.id, mid = skyMidnight(s.e), now = Date.now();
  if ((evLs().fw || {})[id] || EV_EXT || (!EV_FORCE_UI && typeof navigator !== 'undefined' && navigator.webdriver)) return;
  const at = now >= mid ? now + 1800 : mid - now < 6 * 3600e3 ? mid + 300 : 0;
  if (!at || (SKY.fwT && SKY.fwAt === at)) return;
  clearTimeout(SKY.fwT); SKY.fwAt = at; SKY.fwT = setTimeout(skyFwTry, at - now);
}
function skyFwTry() {
  SKY.fwT = 0; const st = EV.st;
  if (!st || !evOn() || !evPackOf() || !evPackOf().sky || (evLs().fw || {})[st.ev.id]) return;
  const calm = !document.hidden && !!(evLs().seen || {})[st.ev.id] && !evSheetTop() && !navTopDv() && S.view === 'home' && !document.getElementById('splash') && !document.querySelector('.ev-intro, .adv-open, .ev-party') && !(typeof OB !== 'undefined' && OB.el) && !(typeof TOUR !== 'undefined' && (TOUR.on || TOUR.pill)) && !(typeof streamOn === 'function' && streamOn()) && !EV.fly;
  if (!calm) { SKY.fwT = setTimeout(skyFwTry, 4000); return; }
  skyFireworks();
}
/** Le feu d'artifice plein écran, « Bonne année ». */
function skyFireworks() {
  const st = EV.st; if (!st || document.querySelector('.sky-fw')) return;
  const y = Number(st.ev.id.slice(-4));
  evLsSet({ fw: { ...(evLs().fw || {}), [st.ev.id]: Date.now() } });
  const el = document.createElement('div'); el.className = 'sky-fw'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'skyFwT');
  el.innerHTML = `<div class="sky-fw-bg" aria-hidden="true"></div><div class="sky-fw-art" aria-hidden="true">${typeof EV_ART !== 'undefined' && EV_ART.fireworks ? EV_ART.fireworks() : ''}</div>
    <div class="sky-fw-in"><small>${esc(T('Minuit'))}</small><h2 id="skyFwT">${esc(T('Bonne année {y} !', { y: y + 1 }))}</h2>
      <p>${esc(T('Que tes boosters soient généreux et tes pioches parfaites.'))}</p>
      <div class="sky-fw-acts"><button class="btn ghost" type="button" data-fw="close">${T('Fermer')}</button><button class="btn" type="button" data-fw="year">${esc(T('Voir mon année {y}', { y }))}</button></div></div>`;
  document.body.appendChild(el); haptic('ok');
  const close = then => { el.classList.remove('on'); setTimeout(() => el.remove(), reduceMotion() ? 0 : 450); document.removeEventListener('keydown', key, true); if (then) setTimeout(then, reduceMotion() ? 50 : 350); };
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  document.addEventListener('keydown', key, true);
  el.addEventListener('click', e => { const b = e.target.closest('[data-fw]'); if (!b) return; haptic('tap'); close(b.dataset.fw === 'year' ? () => skyYear(y) : null); });
  requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('on'); el.querySelector('[data-fw="year"]').focus({ preventScroll: true }); }));
}

/* ── « Ton année Magic » ────────────────────────────────────────────────────────────────────────────────── */
function skyYrLs() { try { const o = JSON.parse(localStorage.getItem(SKY_YR_KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } }
/** Relevé de début d'année (une fois par année, au premier lancement de janvier) : les compteurs sans date (scans, jours d'utilisation) à ce moment-là. */
function skyYrSnap() {
  if (typeof prgC !== 'function') return;
  const now = new Date(), y = String(now.getFullYear()), o = skyYrLs(); if (o[y] || now.getMonth() > 0) return;      // seulement en janvier : sinon ce ne serait pas le début de l'année
  const c = prgC(); o[y] = { sc: c.sc || 0, days: c.days || 0, t: Date.now() };
  for (const k of Object.keys(o)) if (+k < +y - 3) delete o[k];
  try { localStorage.setItem(SKY_YR_KEY, JSON.stringify(o)); } catch (e) { /* stockage refusé */ }
}
/** Bilan de l'année y : { y, since (compteurs depuis le début, pas de relevé), sc, days, games, wins, trades, opens, copies, cards, value, dv, lv, badges, color, best }. */
function skyYearData(y) {
  const inY = t => new Date(Number(t) || 0).getFullYear() === y, snap = skyYrLs()[String(y)], c = typeof prgC === 'function' ? prgC() : {};
  const out = { y, since: !snap, sc: Math.max(0, (c.sc || 0) - (snap ? snap.sc : 0)), days: Math.max(0, (c.days || 0) - (snap ? snap.days : 0)) };
  const hist = typeof partieHist === 'function' ? partieHist().filter(x => inY(x.date)) : [];
  out.games = hist.length; out.wins = hist.filter(x => { const m = x.places.find(q => q.pos === x.moi); return m && m.vainqueur; }).length;
  out.trades = typeof trocHist === 'function' ? trocHist().filter(x => inY(x.at)).length : 0;
  out.opens = typeof opnHist === 'function' ? opnHist().filter(x => inY(x.at)).length : 0;
  let copies = 0, best = null; const col = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  try {
    for (const k in COLL.map) {
      const q = COLL.map[k].q || 0, m = COLL.meta[k]; copies += q;
      if (m && m.ci) for (const ch of m.ci) if (ch in col) col[ch] += q;
      const eu = typeof collCardEu === 'function' ? collCardEu(k) || 0 : 0;
      if (m && m.im && eu > 0 && (!best || eu > best.eu)) best = { k, eu, im: m.im };
    }
  } catch (e) { /* collection pas encore lue */ }
  out.copies = copies; out.cards = Object.keys(COLL.map || {}).length;
  try { out.value = collValue(); } catch (e) { out.value = 0; }
  const pts = typeof VAL !== 'undefined' && Array.isArray(VAL.hist) ? VAL.hist : [], first = pts.find(h => inY(h.t)), before = pts.filter(h => h.t && new Date(h.t).getFullYear() < y).pop();
  out.dv = first ? out.value - (before ? before.v : first.v) : null;      // depuis la fin de l'année d'avant, sinon depuis le premier relevé de l'année
  const top = Object.entries(col).sort((a, b) => b[1] - a[1])[0]; out.color = top && top[1] > 0 ? top[0] : '';
  out.best = best ? { k: best.k, name: typeof advName === 'function' ? advName(COLL.map[best.k].n || best.k) : best.k, eur: best.eu / 100, img: best.im } : null;
  try { const P = prgNow(); out.lv = P.lv; out.badges = P.bs.filter(b => b.t >= 0).length; } catch (e) { out.lv = 0; out.badges = 0; }
  return out;
}
const skyEur = c => new Intl.NumberFormat(LOC(), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format((Number(c) || 0) / 100);
/** Feuille « Ton année Magic » : tuiles, partage en image. */
function skyYear(y) {
  const st = EV.st; y = y || (st && st.ev ? Number(st.ev.id.slice(-4)) : new Date().getFullYear());
  const d = skyYearData(y), orb = c => (typeof EV_ART !== 'undefined' && EV_ART.manaOrb ? EV_ART.manaOrb({ c }) : '');
  const tile = (v, l, cl) => `<div class="sky-t${cl ? ' ' + cl : ''}"><b>${v}</b><small>${esc(l)}</small></div>`;
  const tiles = [
    tile(nf0(d.sc), d.since ? T('cartes scannées, depuis le début') : TN(d.sc, 'carte scannée', 'cartes scannées')),
    tile(nf0(d.copies), TN(d.cards, 'exemplaires · {n} carte différente', 'exemplaires · {n} cartes différentes')),
    tile(esc(skyEur(d.value)), d.dv != null && Math.abs(d.dv) >= 100 ? T('de valeur · {d} cette année', { d: (d.dv < 0 ? '−' : '+') + skyEur(Math.abs(d.dv)) }) : T('de valeur estimée'), 'big'),
    tile(nf0(d.games), d.games ? TN(d.wins, 'parties · {n} victoire', 'parties · {n} victoires') : T('parties')),
    tile(nf0(d.trades), TN(d.trades, 'échange', 'échanges')),
    tile(nf0(d.opens), TN(d.opens, 'ouverture', 'ouvertures')),
    tile(T('Niv. {n}', { n: d.lv }), TN(d.badges, '{n} badge', '{n} badges'))
  ].join('');
  openSheet(T('Ton année Magic {y}', { y }), null, api => {
    api.wrap.classList.add('sky-sheet');
    api.body.innerHTML = `${d.color ? `<div class="sky-yh"><span class="sky-orb" aria-hidden="true">${orb(d.color)}</span><div><small>${esc(T('Ta couleur de l\'année'))}</small><b>${esc(T(SKY_MANA[d.color]))}</b></div></div>` : ''}
      <div class="sky-ts">${tiles}</div>
      ${d.best ? `<div class="sky-best"><img alt="" loading="lazy" src="${esc(d.best.img)}" onerror="this.remove()"><div><small>${esc(T('Ta plus belle carte'))}</small><b>${esc(d.best.name)}</b><span>${esc(skyEur(d.best.eur * 100))}</span></div></div>` : ''}
      ${d.since ? `<p class="hint">${esc(T('Scans comptés depuis ton arrivée : l\'an prochain, seulement ceux de l\'année.'))}</p>` : ''}`;
    api.setFoot(`<button class="btn" type="button" data-sky="share">${T('Partager en image')}</button>`);
    api.foot.addEventListener('click', e => { if (!e.target.closest('[data-sky="share"]') || typeof simgShare !== 'function') return; haptic('tap'); api.close(); setTimeout(() => simgShare({ kind: 'year', ...d, value: d.value / 100, dv: d.dv == null ? null : d.dv / 100 }), 250); });
  });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') setTimeout(() => { try { skyYrSnap(); } catch (e) { /* compteurs pas encore lus */ } }, 4000);
