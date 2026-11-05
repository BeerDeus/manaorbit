/* ── deckrep.js : « Rapport du coach » d'un deck Commander (pour tout le monde depuis le 2 novembre 2026) ─────────────────────────────
   Pour quelqu'un qui découvre le deck : ce que fait le commandant, comment le deck gagne (thèmes, combos, conditions de victoire, pièces maîtresses),
   comment le jouer (main de départ, début, commandant, milieu, fin de partie), l'interaction, les points faibles, les combos à une carte près et le rôle
   de chaque carte. Tout vient du deck lui-même (rôles, coûts, synergies du commandant, combos de Commander Spellbook, cibles du coach) : rien d'écrit à
   la main pour un deck donné, aucune IA. Depuis l'onglet Coach (deck en cours) et l'analyse d'un deck (deckana.js). Noms de cartes touchables : carte en grand. */
const DR = { api: null, X: null, name: '', ctext: new Map() };

/** Texte du commandant (Scryfall) : imprimé dans la langue de l'appli s'il existe, sinon oracle anglais ; gardé pour la session. */
async function drCmdText(name) {
  const l = I18N.lang, key = l + '|' + name; if (DR.ctext.has(key)) return DR.ctext.get(key);
  let out = '';
  const face = c => (Array.isArray(c.card_faces) && c.card_faces.length ? c.card_faces.map(f => (l !== 'en' && f.printed_text) || f.oracle_text || '').filter(Boolean).join('\n—\n') : (l !== 'en' && c.printed_text) || c.oracle_text || '');
  try {
    if (l !== 'en' && SCRY_LANG[l]) { const j = await httpJson(limScry, 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent('!"' + name + '" lang:' + l) + '&unique=prints', { headers: { Accept: 'application/json' } }); const c = j && j.data && j.data[0]; if (c) out = face(c); }
    if (!out) { const c = await httpJson(limScry, 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(name), { headers: { Accept: 'application/json' } }); if (c) out = face(c); }
  } catch (e) { /* hors ligne : rapport sans le texte */ }
  DR.ctext.set(key, out); return out;
}
/** Nom de carte touchable (carte en grand). */
const drCard = (k, n) => `<span class="dr-c" data-k="${esc(k)}" data-n="${esc(n)}"${zoomAt('dr', bdLabel(k, n))}>${esc(bdLabel(k, n))}</span>`;
const drList = l => l.map(c => drCard(c.k, c.name)).join(', ');
if (typeof ZOOM_LISTS !== 'undefined') ZOOM_LISTS.dr = el => {
  const box = el.closest('.dr-body'); if (!box) return null;
  const seen = new Set(), rows = $$('.dr-c', box).filter(r => (r === el || !seen.has(r.dataset.k)) && seen.add(r.dataset.k));
  return zoomFrom(rows, el, r => zoomNamed(r.dataset.k, bdLabel(r.dataset.k, r.dataset.n), r.dataset.n, viewLang(r.dataset.k, true)));
};

/** Contenu du rapport (HTML) pour le deck X ({ main, cmdr, wiz }). */
function drReportHtml(X) {
  const cmd = dwCmdOf(X), pack = cmd ? DW.cmd.get(cmd.slug) || null : null, set = X.wiz || dwDefaults();
  const prof = dwProfile(X), tgt = dwTargets(prof, cmd, pack, set), est = typeof dwBracketOf === 'function' ? dwBracketOf(prof) : set.br, cur = mkCur();
  const info = dwInfo(pack, set), cards = [...X.main.values()].filter(c => !BASIC_NAMES.has(c.key)).map(c => { const x = dwCard(c.key) || {}, o = info.get(c.key) || {}; return { k: c.key, name: c.name, x, o, roles: x.roles || 0, cmc: x.cmc || 0, land: !!(x.roles & DW_RB.land), v: dwVal(o) }; });
  const spells = cards.filter(c => !c.land), has = r => c => c.roles & DW_RB[r];
  const cm = X.cmdr.map(c => ({ k: c.key, name: c.name, x: dwCard(c.key) || {} })), cmv = Math.max(...cm.map(c => c.x.cmc || (dmOf(c.k) || {}).cm || 0), 0);
  const cheapRamp = spells.filter(c => has('ramp')(c) && c.cmc <= 2), bName = b => (DW_BRACKETS.find(x => x[0] === b) || DW_BRACKETS[2])[1];
  let h = '';
  // En-tête
  const themes = (set.th.length ? set.th : ((pack && pack.thl) || (cmd && cmd.th) || []).slice(0, 2).map(t => t[0])).slice(0, 3);
  const thChoices = dwThemeChoices(cmd, pack, { th: themes });
  h += `<div class="da-sum"><p class="dw-line"><span>${T('Commandant')}</span><b>${cm.map(c => drCard(c.k, c.name)).join(' + ')}</b></p>
    <p class="dw-line"><span>${T('Couleurs')}</span><b>${[...(cmd.ci || 'C')].map(x => `<i class="pip ${x}" aria-hidden="true"></i>`).join('')}</b></p>
    <p class="dw-line"><span>${T('Bracket estimé')}</span><b>${est} · ${esc(bName(est))}</b></p>
    ${themes.length ? `<p class="dw-line"><span>${T('Thèmes')}</span><b>${esc(themes.map(t => dwThemeLabel(t, thChoices)).join(', '))}</b></p>` : ''}
    <p class="dw-line"><span>${T('Valeur du deck')}</span><b>${esc(fmt(prof.cents, cur))}</b></p></div>`;
  if (typeof dsScore === 'function') h += dsScoreHtml(dsScore(X, { cmd, pack }), { open: true });      // note du coach (deckopt.js), détail ouvert
  // Le commandant
  h += `<div class="sec-title">${T('Ce que fait ton commandant')}</div><div class="dr-cmd" id="drCmdTxt">${T('Lecture du texte de la carte…')}</div>`;
  // Comment le deck gagne
  h += `<div class="sec-title">${T('Comment le deck gagne')}</div>`;
  for (const t of themes) { const lbl = dwThemeLabel(t, thChoices), inf = typeof edhThemeInfo === 'function' ? edhThemeInfo({ label: ((pack && pack.thl) || []).concat((cmd && cmd.th) || []).find(x => x[0] === t)?.[1] || t }) : ''; if (inf) h += `<p class="dr-p"><b>${esc(lbl)} :</b> ${edhInfoHtml(inf)}</p>`; }
  const combos = prof.combos || [];
  if (combos.length) h += `<p class="dr-h">${TN(combos.length, '{n} combo à 2 cartes dans le deck', '{n} combos à 2 cartes dans le deck')}</p><ul class="dr-ul">${combos.slice(0, 8).map(c => `<li>${drCard(ownKey(c[0]), c[0])} + ${drCard(ownKey(c[1]), c[1])} : <i>${esc(c[2])}</i></li>`).join('')}</ul>${est <= 2 || set.br <= 2 ? `<p class="hint">${T('Attention : les combos à 2 cartes sont interdits en bracket 1 et 2, et pas avant le tour 6 en bracket 3.')}</p>` : ''}`;
  const win = spells.filter(has('wincon'));
  if (win.length) h += `<p class="dr-h">${T('Conditions de victoire')}</p><p class="dr-p">${drList(win.slice(0, 8))}</p>`;
  if (!combos.length && !win.length) h += `<p class="hint">${T('Aucun combo ni condition de victoire identifiés : le deck gagne surtout au combat, grâce à son commandant et ses pièces maîtresses.')}</p>`;
  const key = spells.filter(c => (c.o.syn || 0) >= 10 || (c.o.incl || 0) >= 45).sort((a, b) => b.v - a.v).slice(0, 8);
  if (key.length) h += `<p class="dr-h">${T('Pièces maîtresses')}</p><ul class="dr-ul">${key.map(c => `<li>${drCard(c.k, c.name)}${c.o.syn >= 10 ? ` <small>${esc(T('synergie +{p} %', { p: c.o.syn }))}</small>` : c.o.incl ? ` <small>${esc(T('{p} % des decks', { p: c.o.incl }))}</small>` : ''}</li>`).join('')}</ul>`;
  // Comment le jouer
  h += `<div class="sec-title">${T('Comment le jouer')}</div>`;
  const avg7 = (prof.land * 7 / 99).toFixed(1).replace('.', I18N.lang === 'en' ? '.' : ',');
  h += `<p class="dr-p"><b>${T('Main de départ')} :</b> ${esc(T('{l} terrains : {a} en moyenne sur 7 cartes. Garde une main avec 3 ou 4 terrains, ou 2 terrains et une rampe à 2 mana ou moins ; sinon, mulligan.', { l: prof.land, a: avg7 }))}</p>`;
  const early = spells.filter(c => c.cmc <= 2 && (has('ramp')(c) || has('draw')(c))).sort((a, b) => b.v - a.v).slice(0, 6);
  if (early.length) h += `<p class="dr-p"><b>${T('Tours 1 à 3')} :</b> ${esc(T('pose tes terrains et accélère avec'))} ${drList(early)}.</p>`;
  const turn = Math.max(1, Math.round(cmv) - (cheapRamp.length >= 8 ? 1 : 0)), prot = spells.filter(has('protect')).sort((a, b) => b.v - a.v).slice(0, 5);
  if (cmv) h += `<p class="dr-p"><b>${T('Ton commandant')} :</b> ${esc(T('{m} mana : vise le tour {t}', { m: cmv, t: turn }))}${cheapRamp.length >= 8 ? esc(' ' + T('(ta rampe à 2 mana ou moins l\'avance d\'un tour)')) : ''}. ${prot.length ? esc(T('Garde de quoi le protéger :')) + ' ' + drList(prot) + '.' : esc(T('Peu de protection : attends que la table ait dépensé ses retraits avant de le reposer.'))}</p>`;
  const engines = spells.filter(c => has('draw')(c) && c.cmc >= 2).sort((a, b) => b.v - a.v).slice(0, 5);
  if (engines.length) h += `<p class="dr-p"><b>${T('Milieu de partie')} :</b> ${esc(T('installe tes moteurs de pioche'))} (${drList(engines)}) ${esc(T('et ton plan de jeu.'))}</p>`;
  const late = (win.length ? win : spells.filter(c => c.cmc >= 5).sort((a, b) => b.v - a.v)).slice(0, 5);
  if (late.length) h += `<p class="dr-p"><b>${T('Fin de partie')} :</b> ${esc(T('conclus avec'))} ${drList(late)}${combos.length ? esc(' ' + T('ou un de tes combos')) : ''}.</p>`;
  // Interaction
  const rem = spells.filter(c => has('removal')(c) && !has('counter')(c)), wipes = spells.filter(has('wipe')), counters = spells.filter(has('counter'));
  h += `<div class="sec-title">${T('Interaction')}</div>`;
  h += `<p class="dr-p"><b>${esc(TN(rem.length, '{n} retrait ciblé', '{n} retraits ciblés'))} :</b> ${rem.length ? drList(rem.slice(0, 10)) + '. ' + esc(T('Garde-les pour les menaces qui te visent ou qui vont gagner.')) : esc(T('aucun : le deck subit les menaces adverses.'))}</p>`;
  h += `<p class="dr-p"><b>${esc(TN(wipes.length, '{n} balayage', '{n} balayages'))} :</b> ${wipes.length ? drList(wipes) + '. ' + esc(T('Lance-les quand tu es en retard sur la table, de préférence après avoir protégé ou rangé tes propres pièces.')) : esc(T('aucun : difficile de se relever si un adversaire prend de l\'avance.'))}</p>`;
  if (cmd.ci.includes('U') || counters.length) h += `<p class="dr-p"><b>${esc(TN(counters.length, '{n} contresort', '{n} contresorts'))} :</b> ${counters.length ? drList(counters) + '. ' + esc(T('Garde du mana ouvert pour eux pendant le tour des autres.')) : esc(T('aucun.'))}</p>`;
  // Points faibles
  const weak = [];
  for (const [r, label] of DW_GAUGES) { if (r === 'counter' && !cmd.ci.includes('U')) continue; const [lo, mid] = tgt[r]; if (prof[r] < lo) weak.push(T('{r} : {n} pour un repère de {m}', { r: T(label), n: prof[r], m: mid })); }
  for (const c of cmd.ci) { const need = prof.need && prof.need[c]; if (need && (prof.src[c] || 0) < need - 2) weak.push(T('Sources de {c} : {n} pour {m} conseillées', { c, n: Math.round(prof.src[c] || 0), m: need })); }
  if (prof.mv > 3.5) weak.push(T('Courbe haute (coût moyen {v}) : départs lents', { v: prof.mv.toFixed(2) }));
  h += `<div class="sec-title">${T('Points faibles')}</div>${weak.length ? `<ul class="bd-issues">${weak.map(w => `<li class="warn">${esc(w)}</li>`).join('')}</ul>` : `<p class="hint">${T('Rien d\'alarmant : le deck est dans la norme de chaque catégorie.')}</p>`}`;
  // Simulation de 10 000 parties face à 3 adversaires (decksim.js) : résultat gardé pour ce deck, sinon barre de progression pendant le calcul
  if (typeof dsimHtml === 'function') h += `<div id="drSim">${DSIM.sig === dsimSig(X) && DSIM.res ? (DSIM.res.none ? '' : dsimHtml(DSIM.res)) : dsimHtml(null, DSIM.prog)}</div>`;
  // Combos à une carte près
  if (DW.core && Array.isArray(DW.core.combos)) {
    const inDeck = k => X.main.has(k) || X.cmdr.some(c => c.key === k), ci = new Set([...cmd.ci]), all = [];
    DW.core.combos.forEach((c, i) => {
      const a = ownKey(c[0]), b = ownKey(c[1]), ia = inDeck(a), ib = inDeck(b); if (ia === ib) return;
      const miss = ia ? c[1] : c[0], mk = ownKey(miss), m = dwCard(mk); if (!m || [...String(m.ci || '')].some(x => !ci.has(x))) return;
      const o = info.get(mk); all.push({ have: ia ? c[0] : c[1], miss, res: c[2], s: (o ? dwVal(o) * 3 : 0) + (inDeck(ownKey(ia ? c[0] : c[1])) && (info.get(ownKey(ia ? c[0] : c[1])) || {}).syn > 10 ? 0.3 : 0) - i / 4000 });
    });
    const near = all.sort((a, b) => b.s - a.s).slice(0, 5);      // la carte qui manque est-elle jouée avec ce commandant ? d'abord celles-là, puis les combos les plus joués
    if (near.length) h += `<div class="sec-title">${T('Combos à une carte près')}</div><ul class="dr-ul">${near.map(n => `<li>${esc(T('Tu as'))} ${drCard(ownKey(n.have), n.have)} : ${esc(T('avec'))} ${drCard(ownKey(n.miss), n.miss)}, <i>${esc(n.res)}</i></li>`).join('')}</ul>${set.br <= 2 ? `<p class="hint">${T('À éviter en bracket 1 et 2 (combos à 2 cartes interdits).')}</p>` : ''}`;
  }
  // Rôle de chaque carte
  h += `<details class="dr-roles"><summary>${T('Rôle de chaque carte')}</summary>`;
  for (const [r, label] of DW_GAUGES) { if (r === 'land') continue; const l = spells.filter(has(r)); if (l.length) h += `<p class="dr-p"><b>${esc(T(label))} (${l.length}) :</b> ${drList(l)}</p>`; }
  const other = spells.filter(c => !DW_GAUGES.some(([r]) => r !== 'land' && c.roles & DW_RB[r]));
  if (other.length) h += `<p class="dr-p"><b>${esc(T('Plan de jeu'))} (${other.length}) :</b> ${drList(other)}</p>`;
  const lands = cards.filter(c => c.land); h += `<p class="dr-p"><b>${esc(T('Terrains'))} (${prof.land}) :</b> ${drList(lands)}${prof.land > lands.length ? esc(' + ' + T('{n} terrains de base', { n: prof.land - lands.length })) : ''}</p></details>`;
  return h;
}
/** Ouvre le rapport du deck X (éditeur : BD ; analyse : DA.X). */
function openDeckReport(X, name) {
  if (!dwOn() || !X || !X.cmdr || !X.cmdr.length) { toast(T('Choisis d\'abord ton commandant')); return; }
  DR.X = X; DR.name = name || '';
  if (!DW.core) dwLoad().then(() => drPaint()).catch(() => drPaint());
  DR.api = openSheet(T('Rapport du coach'), DR.name || null, api => {
    api.wrap.classList.add('dr-sheet'); dwImgs(api.wrap); api.body.classList.add('dr-body');
    api.setFoot(`<button class="btn ghost" type="button" id="drCopy">${T('Copier le rapport')}</button><button class="btn" type="button" data-close>${T('Fermer')}</button>`);
    $('#drCopy', api.foot).onclick = () => { const b = $('.dr-roles', api.body); if (b) b.open = true; copyText(DR.name + '\n\n' + api.body.innerText.replace(/\n{3,}/g, '\n\n')).then(() => toast(T('Rapport copié'))).catch(() => {}); haptic('tap'); };
  });
  drPaint();
  const cmd = dwCmdOf(X); if (cmd && !DW.cmd.has(cmd.slug) && DW.core) dwPack('c', cmd.slug).then(drPaint);
  dmFetch([...X.main.values(), ...X.cmdr]).then(n => { if (n) drPaint(); }).catch(() => {});
}
function drPaint() {
  if (!DR.api || !sheets.includes(DR.api)) return;
  const b = DR.api.body, cmd = dwCmdOf(DR.X);
  if (!DW.core && DW.p) { b.innerHTML = `<div class="status" data-ok="0"><span class="dot"></span><span>${T('Chargement de la base du coach…')}</span></div>`; return; }
  const open = $('.dr-roles', b) && $('.dr-roles', b).open, keep = b.scrollTop;
  b.innerHTML = drReportHtml(DR.X); b.scrollTop = keep; if (open) $('.dr-roles', b).open = true;
  if (typeof dsimEnsure === 'function' && DW.core) dsimEnsure(DR.X, () => { const el = DR.api && sheets.includes(DR.api) && $('#drSim', DR.api.body); if (el) el.innerHTML = DSIM.res ? (DSIM.res.none ? '' : dsimHtml(DSIM.res)) : dsimHtml(null, DSIM.prog); });
  Promise.all(DR.X.cmdr.map(c => drCmdText(c.name))).then(txts => {
    const el = $('#drCmdTxt', b); if (!el) return;
    el.innerHTML = txts.some(Boolean) ? txts.map((t, i) => `${DR.X.cmdr.length > 1 ? `<b>${esc(DR.X.cmdr[i].name)}</b><br>` : ''}${esc(t || '—').replace(/\n/g, '<br>')}`).join('<br><br>') : esc(T('Texte de la carte indisponible (hors ligne).'));
  });
  void cmd;
}
