/* ── evadvent.js : calendrier de l'Avent (pack.advent : Noël), côté appli ───────────────────────────────────────────────────────────────────
   Une porte par jour (un booster), du 1er au 24 : elle s'ouvre quand les {per} objets cachés du jour sont trouvés (moteur : event.js, serveur :
   event-srv.mjs, quotas : evpacks.js › evQuota). Le 25 et le 26, rattrapage : les objets trouvés ouvrent les portes manquées dans l'ordre (evDoors).
   · Accueil : la carte de la fête devient le calendrier (24 boosters : ouverts avec leur carte, celui du jour, manqués, à venir) ; 24 lumières autour
     de l'orbe « Ma collection » (.adv-orbit) ; guirlande en haut de la carte (evart.js › evGarland).
   · Ouverture : plein écran, le booster se déchire, la carte du jour se retourne (reflet foil), puis la récompense : XP, couleur de classeur, orbe de
     Noël, ou anecdote (« Le saviez-vous ? »). Une porte ouverte se revoit en la touchant.
   · Récompenses acquises pour de bon (rien ne se perd après la fête) : XP en plus (progress.js › prgXp → evXp), couleurs de classeur (binder.js
     › evCoverOk), orbe de Noël sur l'accueil jusqu'au 6 janvier (interrupteur dans Compte et réglages › Préférences). Elles se déduisent de la
     progression (jours joués), gardée sur l'appareil et dans le compte : aucun stockage en plus.
   Dessins : evart.js (booster, cadeau, étoile, icônes de récompense), css/event-advent.css (mise en page), css/ev-noel.css (couleurs, ambiance). */
const ADV = { rw: null, rwSig: '', orbT: 0 };
const ADV_ORB_KEY = 'deckdeal:ev:orb';      // interrupteur « Orbe de Noël » (absent : allumé)

/** Calendrier d'une édition d'après ses jours joués : { e, p, doors, open, dr (couleurs rares : { porte: couleur }) } ; null : pas un calendrier. */
function advOf(id, jours) {
  const e = typeof evById === 'function' ? evById(id) : null, p = e && evPack(e.pack); if (!p || !p.advent) return null;
  const doors = evDoors(e, jours || advJours(id)), st = EV.st;
  const dr = evDrops(evMine(id).dr, EV.doc && EV.doc[id] && EV.doc[id].dr, st && st.ev && st.ev.id === id && st.me ? st.me.dr : null);
  return { e, p, doors, open: doors.filter(d => d.open).length, dr };
}
/** Jours joués d'une édition : ceux du serveur (édition en cours), sinon les plus complets de l'appareil et du compte. */
function advJours(id) {
  const st = EV.st; if (st && st.ev && st.ev.id === id && st.me && st.me.jours) return st.me.jours;
  const a = evMine(id), b = EV.doc && EV.doc[id], cnt = x => Object.values((x && x.jours) || {}).reduce((s, l) => s + (Array.isArray(l) ? l.length : 0), 0);
  const ok = [a, b].filter(x => x && evFresh(id, x)); ok.sort((x, y) => cnt(y) - cnt(x));
  return (ok[0] && ok[0].jours) || {};
}
/** Calendrier de l'édition en cours (ou null). */
const advNow = () => (EV.st && EV.st.ev && evPackOf() && evPackOf().advent ? advOf(EV.st.ev.id) : null);
/** Numéro de la porte du jour (1…doors), 0 : jour de rattrapage. */
const advToday = a => { const k = evDiff(a.e.from, EV.st.me ? EV.st.me.day : EV.st.ev.day) + 1; return k <= a.p.advent.doors ? k : 0; };

/* ── Récompenses ─────────────────────────────────────────────────────────────────────────────────────────────── */
/** Récompenses acquises (toutes les éditions de calendrier connues) : { xp, covers: Set, orbs: [années] }. Mises en cache tant que rien ne change. */
function advRewards() {
  const ids = new Set([...Object.keys(evLs().p || {}), ...Object.keys(EV.doc || {})]); if (EV.st && EV.st.ev) ids.add(EV.st.ev.id);
  const list = [...ids].filter(id => { const p = evPack(id); return p && p.advent; }).sort();
  const sig = list.map(id => id + ':' + Object.values(advJours(id)).reduce((s, l) => s + (Array.isArray(l) ? l.length : 0), 0) + ':' + Object.keys((advOf(id) || {}).dr || {}).join('.')).join(',');
  if (ADV.rw && ADV.rwSig === sig) return ADV.rw;
  const rw = { xp: 0, covers: new Set(), orbs: [] };
  for (const id of list) {
    const a = advOf(id); if (!a) continue;
    for (const c of Object.values(a.dr)) rw.covers.add(c);      // couleurs rares (tirage du serveur)
    for (const d of a.doors) {
      const r = d.open && a.p.advent.list[d.i - 1] && a.p.advent.list[d.i - 1].r; if (!r) continue;
      if (r.xp) rw.xp += r.xp; if (r.cover) rw.covers.add(r.cover); if (r.orb) rw.orbs.push(a.e.year);
    }
  }
  ADV.rw = rw; ADV.rwSig = sig; return rw;
}
/** XP des récompenses du calendrier (progress.js › prgXp). */
const evXp = () => { try { return advRewards().xp; } catch (e) { return 0; } };
/** Couleur de classeur de fête débloquée (binder.js) ? */
const evCoverOk = id => { try { return advRewards().covers.has(id); } catch (e) { return false; } };
/** Orbe de Noël disponible (gagné, jusqu'au 6 janvier qui suit) ; on : et allumé. */
function advOrb(on) {
  let y = 0; try { y = Math.max(0, ...advRewards().orbs); } catch (e) { return false; }
  if (!y || typeof evDay !== 'function' || evDay(Date.now()) > `${y + 1}-01-06`) return false;
  if (!on) return true;
  try { return localStorage.getItem(ADV_ORB_KEY) !== '0'; } catch (e) { return true; }
}
function advOrbApply() { if (typeof document !== 'undefined') document.documentElement.classList.toggle('ev-orb-noel', advOrb(true)); }
/** Ligne « Orbe de Noël » de Compte et réglages › Préférences (event.js › evPrefRow), seulement quand il est gagné. */
const advOrbRow = () => (advOrb() ? `<label class="me-row switch-row" for="setEvOrb"><span class="me-t">${T('Orbe de Noël')}<small>${esc(T('Des boules de Noël autour de ta collection, jusqu\'au 6 janvier'))}</small></span><span class="switch"><input type="checkbox" id="setEvOrb" ${advOrb(true) ? 'checked' : ''}><i></i></span></label>` : '');
function advOrbPref(on) { try { localStorage.setItem(ADV_ORB_KEY, on ? '1' : '0'); } catch (e) { /* stockage refusé */ } advOrbApply(); haptic('ok'); }

/* ── Accueil : le calendrier et les lumières autour de l'orbe ─────────────────────────────────────────────────────── */
/** Image d'une carte par son nom (Scryfall) ; petite (vignette d'une porte) ou normale (ouverture). */
const advImg = (c, big) => 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(c) + '&format=image&version=' + (big ? 'normal' : 'small');
/** Variante de couleur de mana d'une porte (blanc, bleu, noir, rouge, vert, puis on recommence). */
const advV = i => (i - 1) % 5;
const ADV_MANA = ['#e9dcae', '#3d8ad6', '#7a5a9e', '#d7263d', '#1f8a4c'];
/** Contenu de la carte de la fête (event.js › evHomePaint). */
function advCardHtml(a, me) {
  const st = EV.st, k = advToday(a), y = a.e.year, catchN = a.doors.filter(d => !d.open && d.day < me.day).length;
  const sub = k ? (a.doors[k - 1].open ? T('Booster du jour ouvert : reviens demain') : TN(Math.max(1, me.left), 'Encore {n} cadeau pour ouvrir le booster du jour', 'Encore {n} cadeaux pour ouvrir le booster du jour'))
    : a.open >= a.p.advent.doors ? T('Les 24 boosters sont ouverts : bravo !') : me.left > 0 ? TN(catchN, 'Rattrapage : {n} booster à rattraper', 'Rattrapage : {n} boosters à rattraper') : T('Rattrapage terminé pour aujourd\'hui');
  const doors = a.doors.map(d => {
    const v = advV(d.i), it = a.p.advent.list[d.i - 1] || {}, dt = new Date(d.day + 'T12:00:00').toLocaleDateString(LOC(), { day: 'numeric', month: 'long' });
    if (d.open) return `<button type="button" class="adv-d open" data-adv="${d.i}" aria-label="${esc(T('Jour {n} : ouvert', { n: d.i }) + ' · ' + advName(it.c))}"><span class="adv-cb" aria-hidden="true">${typeof EV_ART !== 'undefined' && EV_ART.rwCard ? EV_ART.rwCard() : ''}</span><img alt="" loading="lazy" decoding="async" src="${esc(advImg(it.c))}" onerror="this.remove()"><span class="adv-ok" aria-hidden="true"></span></button>`;
    const state = d.i === k ? 'today' : d.day < me.day ? 'miss' : 'lock';
    const lab = state === 'today' ? T('Jour {n} : le booster du jour', { n: d.i }) : state === 'miss' ? T('Jour {n} : manqué', { n: d.i }) : T('Jour {n} : s\'ouvre le {d}', { n: d.i, d: dt });
    return `<button type="button" class="adv-d ${state}" data-adv="${d.i}" aria-label="${esc(lab)}">${typeof EV_ART !== 'undefined' && EV_ART.booster ? EV_ART.booster({ v, frost: state === 'lock', today: state === 'today' }) : ''}<b>${d.i}</b></button>`;
  }).join('');
  const tiers = a.p.badge.tiers, nx = tiers.find(t => t > a.open);
  return `<button class="hm-tr-h hm-ev-h" type="button" data-ev="open"><span class="hm-ev-ic" aria-hidden="true">${EV_ART[a.p.obj.art]({ cls: 'evo-still', v: 3 })}</span>
      <span class="hm-tr-t"><b id="hmEvT">${esc(evTx('short'))} ${esc(String(y))}</b><span>${esc(sub)}</span></span>
      <span class="hm-ev-n"><b>${nf0(a.open)}</b><small>/ ${nf0(a.p.advent.doors)}</small></span></button>
    <div class="adv-grid" role="group" aria-label="${esc(evTx('short'))}">${doors}</div>
    <div class="hm-ev-ft"><span class="hm-ev-bdg" aria-hidden="true">${tiers.map((t, i) => `<span class="${a.open >= t ? 'ok' : ''}">${evBadgeHtml(a.e.id, i, a.open >= t)}</span>`).join('')}</span>
      <span class="hm-ev-d">${nx ? esc(T('prochain badge à {n}', { n: nx })) : esc(T('Tous les badges'))}</span>
      <button class="link-btn" type="button" data-ev="open">${T('Indices')}</button></div>`;
}
/** Toucher d'une porte de l'accueil : ouverte → la revoir ; celle du jour ou manquée → ce qu'il reste à trouver ; à venir → sa date. */
function advDoorTap(i) {
  const a = advNow(); if (!a) return;
  const d = a.doors[i - 1]; if (!d) return;
  if (d.open) { advReveal(a, i, { again: true }); return; }
  const me = EV.st.me || { left: 0, day: EV.st.ev.day }, k = advToday(a);
  if (d.i === k || (!k && d.day < me.day)) toast(me.left > 0 ? TN(me.left, 'Encore {n} cadeau caché dans l\'appli aujourd\'hui : les indices sont dans la carte.', 'Encore {n} cadeaux cachés dans l\'appli aujourd\'hui : les indices sont dans la carte.') : T('Plus de cadeau à trouver aujourd\'hui : reviens demain.'));
  else if (d.day < me.day) toast(T('Booster manqué : le 25 et le 26, les cadeaux trouvés le rattrapent.'));
  else toast(T('Patience : ce booster s\'ouvre le {d}.', { d: new Date(d.day + 'T12:00:00').toLocaleDateString(LOC(), { day: 'numeric', month: 'long' }) }));
}
/** 24 lumières autour de l'orbe de l'accueil (décorations allumées, calendrier en cours) ; retirées sinon. */
function advRing(a) {
  const stage = document.querySelector('#viewHome .hm-stage'); if (!stage) return;
  let el = stage.querySelector('.adv-orbit');
  if (!a || !evDeco() || !document.documentElement.classList.contains('ev-deco')) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.className = 'adv-orbit'; el.setAttribute('aria-hidden', 'true'); stage.insertBefore(el, stage.firstChild); }
  const k = advToday(a), me = EV.st.me || { day: EV.st.ev.day }, n = a.p.advent.doors;
  const html = a.doors.map(d => `<i class="${d.open ? 'on' : d.i === k ? 'now' : d.day < me.day ? 'miss' : ''}" style="--a:${((d.i - 1) * 360 / n).toFixed(1)}deg;--c:${ADV_MANA[advV(d.i)]}"></i>`).join('');
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
}

/* ── Ouverture d'un booster ──────────────────────────────────────────────────────────────────────────────────── */
/** Nom affiché d'une carte : français si connu (catalogue des noms), sinon anglais. */
const advName = c => { const k = String(c || '').toLowerCase(); return (typeof frName === 'function' && frName(k, I18N.lang === 'fr' ? 'fr' : '')) || c; };
/** Après une trouvaille (event.js › evTap) : une porte vient de s'ouvrir → son ouverture ; vrai si elle est montrée. j0 : jours avant la trouvaille. */
function advAfterFind(j0, me) {
  const a = advNow(); if (!a) return false;
  const was = new Set(evDoors(a.e, j0).filter(d => d.open).map(d => d.i)), fresh = a.doors.filter(d => d.open && !was.has(d.i));
  if (!fresh.length) return false;
  advReveal(a, fresh[0].i, { late: fresh[0].late, then: me.n >= EV.st.ev.total ? evParty : null });
  return true;
}
/** Plein écran : booster qui se déchire, carte du jour retournée, récompense. o.again : revue depuis l'accueil ; o.late : rattrapée ; o.then : à la fermeture. */
function advReveal(a, i, o = {}) {
  if (document.querySelector('.adv-open')) return;
  const it = a.p.advent.list[i - 1] || {}, r = it.r || {}, k = String(it.c || '').toLowerCase(), nm = advName(it.c), have = typeof collQty === 'function' ? collQty(k) : 0;
  const rw = [], rare = a.dr[i], covName = id => { const c = typeof BND_COVERS !== 'undefined' ? BND_COVERS.find(x => x[0] === id) : null; return T(c ? c[1] : id); };
  if (rare) rw.push(['rwCover', T('Couleur rare : « {c} »', { c: covName(rare) }), T('1 chance sur 100 par booster. Dans les réglages de ton classeur, section Échange.'), 'rare']);
  if (r.cover) { const c = typeof BND_COVERS !== 'undefined' ? BND_COVERS.find(x => x[0] === r.cover) : null; rw.push(['rwCover', T('Décoration de classeur « {c} »', { c: T(c ? c[1] : r.cover) }), T('Une guirlande qui s\'allume sur ton classeur. Dans ses réglages, section Échange.'), 'anim']); }
  if (r.orb) rw.push(['rwOrb', T('Orbe de Noël'), T('Des boules de Noël autour de ta collection, jusqu\'au 6 janvier.')]);
  if (r.xp) rw.push(['rwXp', T('+{n} XP', { n: nf0(r.xp) }), T('Pour ton niveau.')]);
  const icon = n => (typeof EV_ART !== 'undefined' && EV_ART[n] ? EV_ART[n]() : '');
  const el = document.createElement('div'); el.className = 'adv-open'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'advT');
  const head = o.again ? T('Jour {n}', { n: i }) : o.late ? T('Jour {n} · booster rattrapé', { n: i }) : T('Jour {n} · booster ouvert', { n: i });
  el.innerHTML = `<div class="adv-bg" aria-hidden="true"></div>
    <div class="adv-in">
      <div class="adv-pack" aria-hidden="true"><span class="adv-pk-top">${typeof EV_ART !== 'undefined' && EV_ART.booster ? EV_ART.booster({ v: advV(i) }) : ''}</span><span class="adv-pk-bot">${typeof EV_ART !== 'undefined' && EV_ART.booster ? EV_ART.booster({ v: advV(i) }) : ''}</span></div>
      <button class="adv-card" type="button" data-adv-card aria-label="${esc(T('Voir la carte {c}', { c: nm }))}"><span class="adv-flip"><span class="adv-back">${icon('rwCard')}</span><span class="adv-front"><img alt="" src="${esc(advImg(it.c, true))}" onerror="this.parentNode.classList.add('noimg')"><span class="adv-foil" aria-hidden="true"></span><em>${esc(nm)}</em></span></span></button>
      <div class="adv-tx">
        <small>${esc(head)}</small>
        <h2 id="advT">${esc(nm)}</h2>
        <p class="adv-have">${have ? esc(TN(have, 'Tu l\'as déjà en {n} exemplaire.', 'Tu l\'as déjà en {n} exemplaires.')) : esc(T('Pas encore dans ta collection.'))}</p>
        ${rw.length ? `<ul class="adv-rw">${rw.map(([ic, t, s, cl]) => `<li${cl ? ` class="${cl}"` : ''}><span class="adv-rw-ic" aria-hidden="true">${icon(ic)}</span><span><b>${esc(t)}</b><small>${esc(s)}</small></span></li>`).join('')}</ul>` : ''}
        ${r.fact ? `<div class="adv-fact"><span class="adv-rw-ic" aria-hidden="true">${icon('rwFact')}</span><span><b>${esc(T('Le saviez-vous ?'))}</b><span>${esc(T(r.fact))}</span></span></div>` : ''}
        <div class="adv-acts"><button class="btn ghost" type="button" data-adv-card>${T('Voir la carte')}</button><button class="btn" type="button" data-adv-close>${o.again ? T('Fermer') : T('Super !')}</button></div>
      </div>
    </div>`;
  document.body.appendChild(el); haptic('ok');
  const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), reduceMotion() ? 0 : 380); document.removeEventListener('keydown', key, true); if (o.then) setTimeout(o.then, reduceMotion() ? 50 : 500); };
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  document.addEventListener('keydown', key, true);
  el.addEventListener('click', e => {
    if (e.target.closest('[data-adv-close]')) { haptic('tap'); close(); return; }
    if (e.target.closest('[data-adv-card]') && typeof openCardSheet === 'function') { haptic('tap'); close(); setTimeout(() => openCardSheet(k, { n: it.c }), 300); }
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.classList.add('on'); if (!o.again) el.classList.add('tear');
    const c = el.querySelector('.adv-card'), b = c.getBoundingClientRect();
    if (!o.again && !reduceMotion() && typeof evSparks === 'function') setTimeout(() => { if (el.isConnected) evSparks(el, b.left + b.width / 2, b.top + b.height / 2, b.width); }, 700);
    el.querySelector('[data-adv-close]').focus({ preventScroll: true });
  }));
  advOrbApply(); ADV.rw = null;      // une récompense vient peut-être d'arriver (orbe, couleur, XP)
  if (typeof prgSoon === 'function') prgSoon('event');
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  document.addEventListener('change', e => { if (e.target && e.target.id === 'setEvOrb') advOrbPref(e.target.checked); });
  setTimeout(advOrbApply, 0);
}
