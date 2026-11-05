/* ── deckux.js : confort du coach (pour tout le monde depuis le 2 novembre 2026) ─────────────────────────────────────
   - « Prochaines étapes » : en haut du Coach, les 1 à 3 actions les plus utiles, chacune avec son bouton (compléter, retirer, ajouter une catégorie,
     règles du bracket, terrains, sources de couleur) ; « Deck équilibré » et le rapport quand tout va bien.
   - « À retirer » : dès que le deck dépasse 100 cartes (une suggestion ajoutée à un deck plein…), les cartes à enlever d'abord, avec la raison.
   - « Améliorer le deck » : les échanges conseillés de l'analyse (deckana.js › dwSwaps) dans le Coach, appliqués d'un toucher (annulable).
   - « Pourquoi ? » sous chaque échange (Coach et analyse) : rôles, part des decks du commandant, synergie, prix des deux cartes, effet sur les jauges
     et sur la valeur du deck. */
const DX = { why: new Set() };
/** Noms des rôles d'une carte (bits), dans l'ordre des jauges. */
const dwRoleNames = bits => DW_GAUGES.filter(([r]) => r !== 'land' && bits & DW_RB[r]).map(([, l]) => T(l));

/** Cartes à retirer d'abord : les moins utiles du deck pour ce commandant, en tenant compte des rôles en surplus ou en manque, du bracket et du budget.
 *  → [{ k, name, why, s }] (s : plus bas = à retirer d'abord). Terrains de base proposés quand il y a trop de terrains. */
function dwCuts(X, cmd, pack, prof, tgt, n) {
  const set = X.wiz || dwDefaults(), info = dwInfo(pack, set), b = DW_BRACKETS.find(x => x[0] === set.br) || DW_BRACKETS[2], nm = cmd ? cmd.names[0].split(',')[0] : '';
  const R = DWB.brRule(b[0]), gcOver = prof.gc.length > R.gc, xtOver = prof.xt.length > R.xt, over = set.bud > 0 && prof.cents > set.bud, out = [];
  for (const c of X.main.values()) {
    if (BASIC_NAMES.has(c.key)) continue;
    const x = dwCard(c.key); if (!x || x.roles & DW_RB.land) continue;
    const o = info.get(c.key) || {}; let s = dwVal(o), why = '', hard = true;
    const low = DW_GAUGES.find(([r]) => r !== 'land' && x.roles & DW_RB[r] && prof[r] <= tgt[r][0]);
    const sur = DW_GAUGES.find(([r]) => r !== 'land' && x.roles & DW_RB[r] && prof[r] > tgt[r][1]);
    if (low) s += 0.5; if (sur) s -= 0.15;
    const price = dwPrice(c.key, x, true);      // carte du deck : son prix dans la valeur du deck (dwProfile)
    if (dwGC(c.key, x) && gcOver) { s -= 0.6; why = T('Game Changer en trop pour le bracket {b}', { b: b[0] }); }      // règles du bracket : brackets.js
    else if (x.fl & 4 && !R.mld) { s -= 1; why = T('Destruction massive de terrains : interdite en bracket {b}', { b: b[0] }); }
    else if (x.fl & 2 && xtOver) { s -= 0.6; why = T('Tour supplémentaire en trop pour le bracket {b}', { b: b[0] }); }
    else if (over && price > 500 && ownFree(c.key, X.id != null ? X.id : null) < 1) { s -= Math.min(0.5, price / Math.max(1, set.bud) * 2); why = T('Chère ({p}) alors que le deck dépasse le budget', { p: fmt(price, mkCur()) }); }
    else if ((hard = false) || sur) why = T('{r} en surplus ({n} pour {m} conseillées)', { r: T(sur[1]), n: prof[sur[0]], m: tgt[sur[0]][1] });
    else if (o.incl || o.syn) why = T('Peu jouée avec {name} ({p} % des decks)', { name: nm, p: o.incl || 0 });
    else why = T('Absente des decks de {name} étudiés', { name: nm });
    if (low && !hard) why += ' · ' + T('mais elle compte en {r}', { r: T(low[1]) });
    out.push({ k: c.key, name: c.name, why, s });
  }
  if (prof.land > tgt.land[1]) {      // trop de terrains : le terrain de base de la couleur la moins demandée
    const BK = { W: 'plains', U: 'island', B: 'swamp', R: 'mountain', G: 'forest' }, cols = [...(cmd ? cmd.ci : '')].filter(c => X.main.has(BK[c]));
    const c = cols.sort((a, b) => ((prof.pips[a] || 0) / ((X.main.get(BK[a]) || {}).qty || 1)) - ((prof.pips[b] || 0) / ((X.main.get(BK[b]) || {}).qty || 1)))[0];
    if (c) { const bc = X.main.get(BK[c]); out.push({ k: bc.key, name: bc.name, why: T('Terrains : {n} pour {m} conseillés', { n: prof.land, m: tgt.land[1] }), s: 0.02 }); }
  }
  return out.sort((a, b) => a.s - b.s).slice(0, n);
}
/** Prochaines étapes (3 au plus) : [{ t: texte, b: bouton, act, v, ok }]. */
function dwNextSteps(prof, tgt, cmd, set) {
  const st = [], b = DW_BRACKETS.find(x => x[0] === set.br) || DW_BRACKETS[2], n = prof.n, R = DWB.brRule(b[0]), bad = DWB.bracketBreaks(b[0], dwBrFacts(prof)).filter(x => x.lv === 'bad');      // règles du bracket : brackets.js
  if (n > 100) st.push({ t: TN(n - 100, '{n} carte de trop', '{n} cartes de trop'), b: T('Que retirer ?'), act: 'dw-goto', v: 'cuts' });
  if (bad.some(x => x.k === 'gc')) st.push({ t: T('{n} Game Changers pour {max} permis en bracket {b}', { n: prof.gc.length, max: R.gc, b: b[0] }), b: T('Voir'), act: 'dw-goto', v: 'bracket' });
  if (bad.some(x => x.k !== 'gc')) st.push({ t: T('Une carte enfreint les règles du bracket {b}', { b: b[0] }), b: T('Voir'), act: 'dw-goto', v: 'bracket' });
  if (set.bud > 0 && prof.cents > set.bud && n >= 60) st.push({ t: T('Au-dessus du budget : {a} pour {b}', { a: fmt(prof.cents, mkCur()), b: fmt(set.bud, mkCur()) }), b: T('Voir les échanges'), act: 'dw-goto', v: 'swaps' });
  if (n < 100) st.push({ t: TN(100 - n, 'Il manque {n} carte', 'Il manque {n} cartes'), b: n <= BD.cmdr.length ? T('Générer le deck') : T('Compléter'), act: 'dw-auto' });
  const def = DW_GAUGES.filter(([r]) => r !== 'land' && (r !== 'counter' || cmd.ci.includes('U')) && prof[r] < tgt[r][0]).map(([r, l]) => ({ r, l, miss: tgt[r][1] - prof[r], k: (tgt[r][1] - prof[r]) / Math.max(1, tgt[r][1]) })).sort((a, b) => b.k - a.k);
  for (const d of def.slice(0, 2)) st.push({ t: T('{r} : il en manque {n}', { r: T(d.l), n: d.miss }), b: T('Voir les suggestions'), act: 'dw-goto', v: 'gauge:' + d.r });
  if (n >= 90 && (prof.land < tgt.land[0] || prof.land > tgt.land[2])) st.push({ t: T('Terrains : {n} pour {m} conseillés', { n: prof.land, m: tgt.land[1] }), b: prof.land < tgt.land[0] ? T('Ajouter des terrains de base') : T('Que retirer ?'), act: prof.land < tgt.land[0] ? 'dw-basics' : 'dw-goto', v: 'cuts' });
  for (const c of cmd.ci) if (n >= 90 && prof.need && prof.need[c] && (prof.src[c] || 0) < prof.need[c] - 3) { st.push({ t: T('Sources de {c} : {n} pour {m} conseillées', { c, n: Math.round(prof.src[c] || 0), m: prof.need[c] }), b: T('Voir'), act: 'dw-goto', v: 'mana' }); break; }
  if (!st.length) st.push({ t: T('Deck équilibré : rien d\'urgent'), b: T('Rapport du coach'), act: 'dw-report', ok: true });
  return st.slice(0, 3);
}
/** Carte « Prochaines étapes » (en haut du Coach). */
function dwNextHtml(prof, tgt, cmd, set) {
  const gs = DW_GAUGES.filter(([r]) => r !== 'counter' || cmd.ci.includes('U')), ok = gs.filter(([r]) => prof[r] >= tgt[r][0] && prof[r] <= tgt[r][2] + (r === 'land' ? 0 : 3)).length, pct = Math.round(ok / gs.length * 100);
  const steps = dwNextSteps(prof, tgt, cmd, set);
  return `<div class="dx-next"><div class="dx-score"><span>${T('Équilibre')}</span><b>${esc(T('{a} / {b} catégories', { a: ok, b: gs.length }))}</b><span class="dw-bar" aria-hidden="true"><i class="dw-val" style="width:${pct}%"></i></span></div>
    <p class="dx-h">${T('Prochaines étapes')}</p><ol class="dx-steps">${steps.map(s => `<li class="${s.ok ? 'ok' : ''}"><span>${esc(s.t)}</span><button class="btn small ${s.ok ? 'ghost' : ''}" type="button" data-act="${s.act}"${s.v ? ` data-v="${esc(s.v)}"` : ''}>${esc(s.b)}</button></li>`).join('')}</ol></div>`;
}
/** Section « À retirer » : deck de plus de 100 cartes. */
function dwCutsHtml(prof, tgt, cmd, pack) {
  const over = prof.n - 100; if (over <= 0) return '';
  const l = dwCuts(BD, cmd, pack, prof, tgt, Math.max(3, over + 2));
  return `<div class="sec-title" id="dwCuts">${esc(TN(over, 'À retirer : {n} carte de trop', 'À retirer : {n} cartes de trop'))}</div><p class="hint">${T('Les moins utiles d\'abord pour ce commandant ; celles qui tiennent une catégorie juste sont gardées pour la fin.')}</p><div class="dw-sug">${l.map(c => {
    const k = c.k, m = bdMeta(k), x = COLL.map[k], nm = bdLabel(k, c.name), img = m && m.im ? collImage(k, x ? x.l : '', m.im).src : BASIC_NAMES.has(k) ? '' : zoomUrl(c.name, 'small');
    return `<div class="crow bd-row dw-row dx-cut" data-k="${esc(k)}" data-n="${esc(c.name)}" data-t="main"><span class="thumb" style="--h:${hash32(k) % 360}"${zoomAt('bd', nm)}>${esc((nm.trim()[0] || '?').toUpperCase())}${img ? `<img alt="" loading="lazy" decoding="async" ${cardImgA(k, c.name, img, x ? x.l || '' : '')}>` : ''}</span>
      <span class="row-main"><span class="row-top"><span class="row-name">${esc(nm)}</span></span><span class="dw-why">${esc(c.why)}</span></span>
      <span class="qstep dw-add"><button type="button" data-d="-1" aria-label="${T('Retirer un exemplaire de {name}', { name: esc(nm) })}">−</button></span></div>`;
  }).join('')}</div>`;
}
/** Explication d'un échange (sw : dwSwaps) : les deux cartes, l'effet sur les jauges et la valeur. */
function dwSwapWhyHtml(sw, prof, tgt, cmd, did = BD.id) {      // did : le deck (éditeur, ou Mes decks pour l'analyse) dont les exemplaires réservés restent à lui
  const cur = mkCur(), nm = cmd ? cmd.names[0].split(',')[0] : '', card = (c, o, x, price, own) => {
    const r = dwRoleNames((x && x.roles) || 0), bits = [];
    bits.push(r.length ? T('rôle : {r}', { r: r.join(', ') }) : T('rôle : plan de jeu'));
    bits.push(o && o.incl ? T('{p} % des decks de {name}', { p: o.incl, name: nm }) : T('absente des decks de {name} étudiés', { name: nm }));
    if (o && o.syn >= 5) bits.push(T('synergie +{p} %', { p: o.syn }));
    if (price > 0) bits.push(fmt(price, cur));
    if (own) bits.push(T('dans ta collection'));
    return bits.join(' · ');
  };
  const eff = [];
  for (const [r, l] of DW_GAUGES) {
    if (r === 'land') continue; const a = sw.out.roles & DW_RB[r] ? 1 : 0, b = sw.in.x && sw.in.x.roles & DW_RB[r] ? 1 : 0; if (a === b) continue;
    eff.push(T('{r} : {a} → {b} (repère {m})', { r: T(l), a: prof[r], b: prof[r] - a + b, m: tgt[r][1] }));
  }
  const d = sw.in.price - sw.out.price;
  if (d) eff.push(T('Valeur du deck : {a} → {b}', { a: fmt(prof.cents, cur), b: fmt(prof.cents + d, cur) }));
  return `<dl class="dx-why"><div><dt>${T('Retirer')} ${esc(bdLabel(sw.out.k, sw.out.name))}</dt><dd>${esc(card(sw.out, sw.out.o, sw.out.x, sw.out.price, ownFree(sw.out.k, did) > 0))}</dd></div>
    <div><dt>${T('Ajouter')} ${esc(bdLabel(sw.in.k, sw.in.name))}</dt><dd>${esc(card(sw.in, sw.in.o, sw.in.x, sw.in.price, sw.in.own))}</dd></div>
    ${eff.length ? `<div><dt>${T('Effet')}</dt><dd>${eff.map(esc).join('<br>')}</dd></div>` : ''}</dl>`;
}
/** Section « Améliorer le deck » du Coach : échanges conseillés appliqués d'un toucher. */
function dwImproveHtml(prof, tgt, cmd, pack) {
  if (typeof dwSwaps !== 'function' || prof.n < 60) return '';
  const open = DW.open === 'swaps';
  let h = `<div class="sec-title">${T('Améliorer le deck')}</div><div class="dw-g${open ? ' open' : ''}"><button type="button" class="dw-gh" data-act="dw-g" data-r="swaps" aria-expanded="${open}"><span class="dw-gl"><b>${T('Échanges conseillés')}</b><small>${esc(T('une carte faible contre une meilleure, même rôle, dans tes réglages'))}</small></span><span class="me-v">${open ? '−' : '+'}</span></button>`;
  if (open) {
    const sws = DX.swaps = dwSwaps(BD, cmd, pack, prof, tgt, 8);
    h += `<div class="dw-gb">${sws.length ? sws.map((s, i) => `<div class="dx-sw">${typeof daSwapPair === 'function' ? daSwapPair(s) : ''}<span class="da-why">${esc(daWhy(s, cmd))}</span>
      <div class="dx-acts"><button class="link-btn" type="button" data-act="dw-why" data-v="${esc(s.out.k + '>' + s.in.k)}" aria-expanded="${DX.why.has(s.out.k + '>' + s.in.k)}">${T('Pourquoi ?')}</button><button class="btn small" type="button" data-act="dw-swap" data-v="${i}">${T('Échanger')}</button></div>
      ${DX.why.has(s.out.k + '>' + s.in.k) ? dwSwapWhyHtml(s, prof, tgt, cmd) : ''}</div>`).join('') : `<p class="hint">${T('Rien à changer : les cartes du deck sont bien jouées avec ce commandant.')}</p>`}</div>`;
  }
  return h + '</div>';
}
/** Actions du confort (dwClick les lui passe) : vrai si l'action était la sienne. */
function dxClick(b, act) {
  if (act === 'dw-open') { $('#bdSeg', BD.el).setValue('coach'); bdTab('coach'); haptic('tap'); return true; }      // bannière du coach
  if (act === 'dw-goto') {
    const v = b.dataset.v || ''; haptic('tap');
    if (v.startsWith('gauge:')) { DW.open = v.slice(6); DW.shown = 8; bdList(); }
    if (v === 'swaps') { DW.open = 'swaps'; bdList(); }
    const sel = v.startsWith('gauge:') || v === 'swaps' ? `.dw-g.open` : v === 'cuts' ? '#dwCuts' : v === 'bracket' ? '.dw-br' : v === 'mana' ? '.dw-mana' : '';
    const el = sel && BD.el && $(sel, BD.el); if (el) el.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    return true;
  }
  if (act === 'dw-why') { const v = b.dataset.v; if (DX.why.has(v)) DX.why.delete(v); else DX.why.add(v); haptic('tap'); bdList(); return true; }
  if (act === 'dw-swap') {
    const s = (DX.swaps || [])[Number(b.dataset.v)]; if (!s) return true;
    const before = new Map([...BD.main].map(([k, c]) => [k, { ...c }])), c = BD.main.get(s.out.k);
    if (c) { if (c.qty > 1) c.qty--; else BD.main.delete(s.out.k); }
    BD.main.set(s.in.k, { key: s.in.k, name: s.in.name, qty: 1 }); BD.dirty = true; haptic('ok'); bdPaint(); bdMetaSoon();
    toast(T('{a} → {b}', { a: bdLabel(s.out.k, s.out.name), b: bdLabel(s.in.k, s.in.name) }), { label: T('Annuler'), fn: () => { BD.main = before; BD.dirty = true; bdPaint(); haptic('tap'); } });
    return true;
  }
  return false;
}
/** Bannière sous le compteur de l'éditeur (hors onglet Coach) : la prochaine étape du coach ; un toucher ouvre le Coach. */
function dwBannerHtml() {
  if (!dwOn() || BD.fmt !== 'commander' || BD.tab === 'coach' || !DW.core || !BD.cmdr.length) return '';
  const cmd = dwCmdOf(); if (!cmd) return '';
  const pack = DW.cmd.get(cmd.slug) || null, prof = dwProfile(), tgt = dwTargets(prof, cmd, pack), st = dwNextSteps(prof, tgt, cmd, BD.wiz || dwDefaults())[0];
  return st ? `<button class="dx-banner${st.ok ? ' ok' : ''}" type="button" data-act="dw-open"><span><b>${T('Coach')}</b> · ${esc(st.t)}</span><span class="me-v">›</span></button>` : '';
}
