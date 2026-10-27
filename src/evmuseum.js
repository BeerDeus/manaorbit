/* ── evmuseum.js : le musée de Magic (pack.museum, anniversaire de Magic), côté appli ─────────────────────────────────────────────────────────
   La chasse habituelle (event.js) : {per} reliques cachées par jour dans l'appli. Chaque relique trouvée prend sa place sur la frise de l'histoire de Magic,
   dans l'ordre (la n-ième trouvée est museum.relics[n − 1], de 1993 à aujourd'hui) ; {museum.per} reliques remplissent une salle du musée, la dernière
   l'inaugure (5 salles en tout). Les badges comptent les salles inaugurées (pack.badge.tiers), pas les reliques.
   · Accueil : la carte de la fête devient le musée (les 5 façades des salles, la frise de la salle en cours : reliques exposées, places vides avec leur année).
   · Trouvaille : un cartel (nom, année) à la place du message habituel ; toucher : la fiche de la relique (dessin en grand, histoire).
   · Inauguration : plein écran (la façade s'illumine, le ruban est coupé, les 6 reliques de la salle, le badge gagné) ; la dernière : puis la célébration.
   · Lotus d'or (pack.museum.gold) : 1 chance sur 100 qu'une cachette soit en or (tirage du serveur : spots › g, comme l'œuf d'or de Pâques) ; trouvé : plein
     écran et la couleur de classeur rare « Lotus d'or » pour de bon (dr ; evadvent.js › advRewards). Il compte comme une relique de la frise.
   · Jour J (pack.museum.day, evpacks.js › evBday) : le 5 août, Magic fête ses {âge} ans : gâteau en plein écran une fois et {extra} reliques de plus ce jour-là.
   Dessins : evart.js (relic, relicArt, museumHall, ribbonCut, cake, curator), css/event-museum.css (mise en page), css/ev-magic.css (couleurs, ambiance). */
const MUS = { bdT: 0 };

/** Musée d'une édition : { e, p, n (reliques), per, age, halls: [{ i, name, from, to, got (0…per), done, relics: [{ i, k, y, t, d, have }] }], open (salles
 *  inaugurées), cur (salle en cours ou null), dr (couleurs rares : { jour: couverture }) } ; null : pas un musée. */
function musOf(id) {
  const e = typeof evById === 'function' ? evById(id) : null, p = e && evPack(e.pack); if (!p || !p.museum) return null;
  const m = p.museum, per = m.per, n = Math.min(e.total, evCount(id));
  const rel = m.relics.map((r, i) => ({ i, k: r.k, y: r.y || e.year, t: r.t, d: r.d, have: i < n }));
  const halls = m.halls.map((name, i) => { const relics = rel.slice(i * per, (i + 1) * per), got = relics.filter(r => r.have).length; return { i, name, from: relics[0].y, to: relics[per - 1].y, got, done: got >= per, relics }; });
  const st = EV.st, dr = evDrops(evMine(id).dr, EV.doc && EV.doc[id] && EV.doc[id].dr, st && st.ev && st.ev.id === id && st.me ? st.me.dr : null);
  return { e, p, n, per, age: e.year - m.born, halls, open: halls.filter(h => h.done).length, cur: halls.find(h => !h.done) || null, dr };
}
const musNow = () => (EV.st && EV.st.ev && evPackOf() && evPackOf().museum ? musOf(EV.st.ev.id) : null);
const musArt = (n, o = {}) => (typeof EV_ART !== 'undefined' && EV_ART[n] ? EV_ART[n](o) : '');
/** Années d'une salle : « 1993 », « 1993 – 1994 ». */
const musYears = h => (h.from === h.to ? String(h.from) : h.from + ' – ' + h.to);
/** Lotus d'or trouvé (couleur rare acquise) ? */
const musGold = s => !!(s.p.museum.gold && Object.values(s.dr).includes(s.p.museum.gold.cover));

/* ── Accueil : le musée ───────────────────────────────────────────────────────────────────────────────────── */
/** Contenu de la carte de la fête (event.js › evHomePaint). */
function musCardHtml(s, me) {
  const p = s.p, e = s.e, tiers = p.badge.tiers, nx = tiers.find(t => t > s.open), c = s.cur;
  const sub = me.left > 0 ? TN(me.left, 'Encore {n} relique à dénicher aujourd\'hui', 'Encore {n} reliques à dénicher aujourd\'hui')
    : !c ? evTx('allDone') : T('Toutes les reliques du jour sont au musée : reviens demain');
  const halls = s.halls.map(h => `<figure class="mus-h${h.done ? ' done' : ''}${h === c ? ' cur' : ''}" data-i="${h.i}">${musArt('museumHall', { k: h.i, n: h.got, lit: h.done, cls: 'evo-still' })}<figcaption>${h.done ? esc(T('Ouverte')) : `${h.got} / ${s.per}`}</figcaption></figure>`).join('');
  return `<button class="hm-tr-h hm-ev-h" type="button" data-ev="open"><span class="hm-ev-ic" aria-hidden="true">${musArt(p.obj.art, { cls: 'evo-still' })}</span>
      <span class="hm-tr-t"><b id="hmEvT">${esc(evTx('short'))} ${esc(String(e.year))}</b><span>${esc(sub)}</span></span>
      <span class="hm-ev-n"><b>${nf0(s.n)}</b><small>/ ${nf0(e.total)}</small></span></button>
    <div class="mus-halls" role="img" aria-label="${esc(TN(s.open, '{n} salle inaugurée sur {t}', '{n} salles inaugurées sur {t}', { t: s.halls.length }))}">${halls}</div>
    ${c ? musFrise(c, s) : ''}
    ${musNote(s)}
    <div class="hm-ev-ft"><span class="hm-ev-bdg" aria-hidden="true">${tiers.map((t, i) => `<span class="${s.open >= t ? 'ok' : ''}">${evBadgeHtml(e.id, i, s.open >= t)}</span>`).join('')}</span>
      <span class="hm-ev-d">${EV.st.ev.left > 0 ? esc(TN(EV.st.ev.left, 'Encore {n} jour', 'Encore {n} jours')) : esc(T('Dernier jour'))}${nx ? ' · ' + esc(TN(nx, 'prochain badge à {n} salle', 'prochain badge à {n} salles')) : ''}</span>
      <button class="link-btn" type="button" data-ev="open">${T('Indices')}</button></div>`;
}
/** Frise d'une salle : ses reliques dans l'ordre, exposées (touchées : leur fiche) ou à venir (silhouette et année). */
function musFrise(h, s) {
  const r = h.relics.map(x => (x.have
    ? `<button class="mus-r on" type="button" data-mus="${x.i}" aria-label="${esc(x.y + ' · ' + T(x.t))}">${musArt('relicArt', { k: x.k, cls: 'evo-still' })}<b>${x.y}</b></button>`
    : `<span class="mus-r" aria-hidden="true">${musArt('relicArt', { k: x.k, cls: 'evo-still' })}<b>${x.y}</b></span>`)).join('');
  return `<div class="mus-cur"><span class="mus-cur-t">${esc(T('Salle {i} sur {t}', { i: h.i + 1, t: s.halls.length }))} · <b>${esc(T(h.name))}</b></span><span class="mus-cur-y">${esc(musYears(h))}</span></div>
    <div class="mus-frise" aria-label="${esc(TN(h.got, '{n} relique exposée sur {t}', '{n} reliques exposées sur {t}', { t: s.per }))}">${r}</div>`;
}
/** Mots de la carte : jour J, lotus d'or trouvé. */
function musNote(s) {
  const bd = typeof evBday === 'function' && EV.st && evBday(s.e, EV.st.ev.day);
  return (bd ? `<p class="mus-note mus-n-bday"><span aria-hidden="true">${musArt('rwHall', { cls: 'evo-still' })}</span>${esc(T('Magic a {a} ans aujourd\'hui : {n} reliques de plus se cachent dans l\'appli.', { a: s.age, n: s.p.museum.extra }))}</p>` : '')
    + (musGold(s) ? `<p class="mus-note mus-n-gold"><span aria-hidden="true">${musArt('rwLotus', { cls: 'evo-still' })}</span>${esc(T('Tu as trouvé le lotus d\'or : la couleur « Lotus d\'or » est à toi.'))}</p>` : '');
}
/** Toucher sur la carte du musée : une relique exposée → sa fiche. Vrai si traité. */
function musTap(ev) {
  const b = ev.target.closest('[data-mus]'); if (!b) return false;
  haptic('tap'); musRelic(Number(b.dataset.mus)); return true;
}

/* ── Fiche d'une relique (cartel du musée) ───────────────────────────────────────────────────────────────────── */
function musRelic(i) {
  const s = musNow(); if (!s) return;
  const h = s.halls[Math.floor(i / s.per)], r = h && h.relics[i % s.per]; if (!r || !r.have) return;
  openSheet(T(r.t), String(r.y), api => {
    api.wrap.classList.add('mus-sheet');
    api.body.innerHTML = `<div class="mus-card"><div class="mus-card-art" aria-hidden="true">${musArt('relicArt', { k: r.k, lit: true })}</div>
      <p class="mus-card-k">${esc(T('Relique {i} sur {t}', { i: i + 1, t: s.e.total }))} · ${esc(T(h.name))}</p>
      <p class="mus-card-d">${esc(T(r.d))}</p></div>`;
  });
}
/** Galerie complète (feuille de la fête, event.js › evSheetOpen) : chaque salle, ses reliques exposées ou à venir. */
function musSheetHtml(s) {
  return `<p class="prg-h">${T('Le musée')}</p>` + s.halls.map(h => `<section class="mus-g${h.done ? ' done' : ''}"><p class="mus-g-t"><b>${esc(T(h.name))}</b><span>${esc(musYears(h))} · ${h.got} / ${s.per}</span></p>
    <div class="mus-g-l">${h.relics.map(x => (x.have
      ? `<button class="mus-gr on" type="button" data-mus="${x.i}">${musArt('relicArt', { k: x.k, cls: 'evo-still' })}<b>${x.y}</b><small>${esc(T(x.t))}</small></button>`
      : `<span class="mus-gr"><span class="mus-gr-a" aria-hidden="true">${musArt('relicArt', { k: x.k, cls: 'evo-still' })}</span><b>${x.y}</b><small>${esc(T('À trouver'))}</small></span>`)).join('')}</div></section>`).join('');
}

/* ── Après une trouvaille ─────────────────────────────────────────────────────────────────────────────────────── */
/** Après une trouvaille (event.js › evTap) : une salle vient de se remplir → inauguration ; lotus d'or → sa couleur rare ; sinon le cartel de la relique.
 *  Toujours vrai pour un musée (le message habituel est remplacé). n0 : reliques avant la trouvaille ; dr0 : couleurs rares d'avant. */
function musAfterFind(n0, dr0, me) {
  const s = musNow(); if (!s || me.n <= n0) return false;
  const per = s.per, h = !(me.n % per) && Math.floor(me.n / per) > Math.floor(n0 / per) ? s.halls[me.n / per - 1] : null;
  const gold = Object.keys(s.dr).some(i => !(dr0 && dr0[i]));
  if (h || gold) musInaug(s, h, { gold, then: !s.cur && h ? evParty : null });
  else musMsg(s, me);
  return true;
}
/** Cartel de la relique trouvée (à la place du message habituel, event.js › evMsg) : dessin, année, nom ; toucher : sa fiche (sans compte : se connecter). */
function musMsg(s, me) {
  const st = EV.st, i = me.n - 1, r = s.halls[Math.floor(i / s.per)].relics[i % s.per];
  document.querySelectorAll('.ev-msg').forEach(x => x.remove());
  const el = document.createElement('div'); el.className = 'ev-msg mus-msg'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
  const day = me.left <= 0, line = day ? esc(evTx('dayDone')) : TN(me.left, s.p.txt.left[0], s.p.txt.left[1]);
  el.innerHTML = `<span class="mus-msg-ic" aria-hidden="true">${musArt('relicArt', { k: r.k, lit: true })}</span><span class="ev-msg-t"><b>${esc(r.y + ' · ' + T(r.t))}</b><span>${line}</span>${!st.acct && me.n === 1 ? `<small>${esc(evTx('join'))}</small>` : `<small>${esc(T('Toucher pour lire son histoire'))}</small>`}</span>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
  const t = setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 400); }, day ? 6000 : 4800);
  el.addEventListener('click', () => { clearTimeout(t); el.classList.remove('on'); setTimeout(() => el.remove(), 300); if (!st.acct && me.n === 1 && typeof openAccount === 'function') openAccount(); else musRelic(i); });
}
/** Plein écran : la salle h est inaugurée (la façade s'illumine, le ruban est coupé), et/ou le lotus d'or vient d'être trouvé (o.gold). o.then : à la fermeture. */
function musInaug(s, h, o = {}) {
  if ((!h && !o.gold) || document.querySelector('.adv-open')) return;
  const p = s.p, i = h ? p.badge.tiers.indexOf(s.open) : -1, li = [];
  if (o.gold) li.push(`<li class="rare"><span class="adv-rw-ic" aria-hidden="true">${musArt('rwLotus')}</span><span><b>${esc(T('Couleur rare : « {c} »', { c: T('Lotus d\'or') }))}</b><small>${esc(T('1 chance sur 100 par relique cachée. Dans les réglages de ton classeur, section Échange.'))}</small></span></li>`);
  if (i >= 0) li.push(`<li><span class="adv-rw-ic" aria-hidden="true">${evBadgeHtml(s.e.id, i, true)}</span><span><b>${esc(T('Badge « {b} »', { b: T(p.badge.names[i]) }))}</b><small>${esc(TN(s.open, '{n} salle inaugurée', '{n} salles inaugurées'))}</small></span></li>`);
  const rw = li.length ? `<ul class="adv-rw">${li.join('')}</ul>` : '';
  const el = document.createElement('div'); el.className = 'adv-open mus-open' + (o.gold ? ' mus-goldo' : ''); el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'musT');
  const big = h ? `<span class="mus-st mus-st0">${musArt('museumHall', { k: h.i, n: s.per - 1 })}</span><span class="mus-st mus-st1">${musArt('museumHall', { k: h.i, n: s.per, lit: true })}</span><span class="mus-rib" aria-hidden="true">${musArt('ribbonCut')}</span>`
    : `<span class="mus-st mus-st1">${musArt('relicArt', { k: 'lotus', lit: true })}</span>`;
  const row = h ? `<div class="mus-open-r" aria-hidden="true">${h.relics.map((x, j) => `<span style="--j:${j}">${musArt('relicArt', { k: x.k, cls: 'evo-still' })}</span>`).join('')}</div>` : '';
  el.innerHTML = `<div class="adv-bg" aria-hidden="true"></div>
    <div class="adv-in">
      <div class="mus-big${h ? '' : ' gold'}${reduceMotion() ? ' out' : ''}" aria-hidden="true">${big}</div>
      <div class="adv-tx">
        <small>${esc(h ? T('Salle {i} sur {t}', { i: h.i + 1, t: s.halls.length }) + ' · ' + musYears(h) : T('Relique légendaire'))}</small>
        <h2 id="musT">${esc(h ? (o.gold ? T('Le lotus d\'or, et une salle inaugurée !') : T('La salle « {s} » est inaugurée !', { s: T(h.name) })) : T('Le lotus d\'or !'))}</h2>
        ${row}
        <p class="adv-have">${esc(!h ? T('La relique la plus précieuse du musée : elle rejoint la frise, et ton classeur se pare d\'or.') : s.cur ? T('{n} sur {t} : la salle suivante t\'attend.', { n: s.open, t: s.halls.length }) : T('Les {n} salles sont ouvertes : le musée est complet.', { n: s.halls.length }))}</p>
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
    const bg = el.querySelector('.mus-big'), bx = bg.getBoundingClientRect();
    if (!reduceMotion() && h) setTimeout(() => { if (!el.isConnected) return; bg.classList.add('out'); haptic('ok'); if (typeof evSparks === 'function') evSparks(el, bx.left + bx.width / 2, bx.top + bx.height / 2, bx.width); }, 1100);
    el.querySelector('[data-adv-close]').focus({ preventScroll: true });
  }));
  if (typeof ADV !== 'undefined') ADV.rw = null;      // la couleur rare vient peut-être d'arriver
  if (typeof prgSoon === 'function') prgSoon('event');
}

/* ── Jour J (5 août) : le gâteau d'anniversaire, plein écran une fois par jour ── */
function musBdaySoon(s) {
  const st = EV.st; if (!st || !(typeof evBday === 'function' && evBday(s.e, st.ev.day)) || (evLs().bd || {})[st.ev.day] || EV_EXT) return;
  if (!EV_FORCE_UI && typeof navigator !== 'undefined' && navigator.webdriver) return;      // navigateurs pilotés par les tests : seulement avec ?event
  clearTimeout(MUS.bdT); MUS.bdT = setTimeout(musBdayTry, 2200);
}
function musBdayTry() {
  const st = EV.st; if (!st || !evOn()) return;
  const calm = !document.hidden && !!(evLs().seen || {})[st.ev.id] && !evSheetTop() && !navTopDv() && S.view === 'home' && !document.getElementById('splash') && !document.querySelector('.ev-intro, .adv-open, .ev-party, .mus-bday') && !(typeof OB !== 'undefined' && OB.el) && !(typeof TOUR !== 'undefined' && (TOUR.on || TOUR.pill)) && !(typeof streamOn === 'function' && streamOn()) && !EV.fly;
  if (!calm) { MUS.bdT = setTimeout(musBdayTry, 4000); return; }
  musBday();
}
/** Joyeux anniversaire, Magic : gâteau aux bougies allumées, l'âge fêté (plein écran). */
function musBday() {
  const st = EV.st, s = musNow(); if (!st || !s || document.querySelector('.mus-bday')) return;
  evLsSet({ bd: { ...(evLs().bd || {}), [st.ev.day]: Date.now() } });
  const el = document.createElement('div'); el.className = 'mus-bday'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'musBT');
  el.innerHTML = `<div class="mus-bday-bg" aria-hidden="true"></div>
    <div class="mus-bday-art" aria-hidden="true">${musArt('cake', { lit: true })}<b class="mus-bday-age">${s.age}</b></div>
    <div class="mus-bday-in"><small>${esc(T('5 août {y}', { y: s.e.year }))}</small><h2 id="musBT">${esc(T('Joyeux anniversaire, Magic !'))}</h2>
      <p>${esc(T('Le 5 août 1993 sortait Alpha. {a} ans plus tard, le musée fête ça : {n} reliques de plus se cachent dans l\'appli aujourd\'hui.', { a: s.age, n: s.p.museum.extra }))}</p>
      <div class="mus-bday-acts"><button class="btn" type="button" data-mb="go">${T('À la chasse !')}</button></div></div>`;
  document.body.appendChild(el); haptic('ok');
  const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), reduceMotion() ? 0 : 420); document.removeEventListener('keydown', key, true); evScan(); };
  const key = e => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); close(); } };
  document.addEventListener('keydown', key, true);
  el.querySelector('[data-mb="go"]').onclick = () => { haptic('ok'); close(); };
  requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('on'); el.querySelector('[data-mb="go"]').focus({ preventScroll: true }); }));
}
