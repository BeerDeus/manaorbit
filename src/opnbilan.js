/* ── opnbilan.js : bilan d'une ouverture de boosters (partie « booster » de la session d'ouverture, opening.js) ───────────────────────────
   · « Prix payé » (facultatif) : au début de la session, modifiable dans le bilan ; gardé avec la session (cur.paid, centimes).
   · Bilan (« Terminer ») : valeur obtenue (tendance Cardmarket, cartes gardées) face au prix payé → gain ou perte, et le rapport (× 1,45) ;
     les 5 meilleures cartes (prix d'un exemplaire) en grand ; « Partager » : image à partager (simgShare, autre module), seulement s'il existe.
   · Mes ouvertures : le gain ou la perte de chaque session, et dans son détail.
   Retirer cette partie seule : ôter 'opnbilan.js' de build.mjs. La session garde alors son récapitulatif simple (cartes, valeur, cartes à écarter,
   « Ajouter »), sans prix payé ni meilleures cartes ; les crochets d'opening.js sont gardés par typeof. */

/** « 120 », « 89,90 € » → centimes ; null si vide ou illisible. */
function opnbParse(s) {
  const t = String(s == null ? '' : s).replace(/[\s€]/g, '').replace(',', '.'); if (!t) return null;
  const n = parseFloat(t); return Number.isFinite(n) && n >= 0 && n < 1e6 ? Math.round(n * 100) : null;
}
const opnbIn = (id, paid) => `<div class="field-in opnb-paid"><label class="label" for="${id}">${T('Prix payé (facultatif)')}</label><span class="opnb-eur"><input type="text" id="${id}" inputmode="decimal" autocomplete="off" placeholder="${esc(T('ex. {p}', { p: '120' }))}" value="${paid != null ? esc((paid / 100).toLocaleString(LOC(), { minimumFractionDigits: paid % 100 ? 2 : 0, maximumFractionDigits: 2, useGrouping: false })) : ''}"><i aria-hidden="true">€</i></span></div>`;
/** Champ du prix payé dans « Commencer une session ». */
function opnbPaidHtml(paid) { return opnbIn('opnPaid', paid); }
function opnbPaidRead(root) { const i = $('#opnPaid', root); return i ? opnbParse(i.value) : null; }
/** Gain ou perte : valeur v face au prix payé (centimes). */
function opnbResHtml(v, paid) {
  if (paid == null) return `<p class="hint opnb-none">${T('Indique le prix payé pour voir ton gain ou ta perte.')}</p>`;
  const d = v - paid, k = d > 0 ? 'up' : d < 0 ? 'down' : 'eq', x = paid > 0 ? (v / paid).toLocaleString(LOC(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
  return `<div class="opnb-r ${k}"><span class="opnb-rl">${d > 0 ? T('Gain') : d < 0 ? T('Perte') : T('À l\'équilibre')}</span><b>${d > 0 ? '+' : d < 0 ? '−' : ''}${esc(fmt(Math.abs(d), 'EUR'))}</b><small>${esc(T('{v} de cartes pour {p} payés', { v: fmt(v, 'EUR'), p: fmt(paid, 'EUR') }))}${x ? ' · × ' + esc(x) : ''}</small></div>`;
}
/** Les 5 meilleures cartes (prix d'un exemplaire) : la première en grand, les autres à côté. */
const opnbBest = rows => rows.map(r => ({ r, u: opnEu(r) || 0 })).filter(x => x.u > 0).sort((a, b) => b.u - a.u || b.r.t - a.r.t).slice(0, 5);
function opnbTopHtml(rows) {
  const best = opnbBest(rows); if (!best.length) return '';
  const card = ({ r, u }, i) => `<figure class="opnb-c${i ? '' : ' opnb-hero'}"><span class="opnb-im" style="--h:${hash32(r.k) % 360}"><img alt="" loading="lazy" decoding="async" src="${esc(opnBig(r))}"></span><figcaption><b>${esc(fmt(u, 'EUR'))}</b><span>${esc(opnName(r))}</span></figcaption></figure>`;
  return `<h3 class="cs-h">${T('Meilleures cartes')}</h3><div class="opnb-top${best.length > 1 ? '' : ' one'}">${card(best[0], 0)}${best.length > 1 ? `<div class="opnb-rest">${best.slice(1).map(card).join('')}</div>` : ''}</div>`;
}
/** Bloc du bilan (feuille « Terminer » d'opening.js) : prix payé, gain ou perte, meilleures cartes. */
function opnbHtml(c, rows, t) {
  return `<div class="opnb">${opnbIn('opnbPaid', c.paid)}<div class="opnb-res">${opnbResHtml(t.v, c.paid)}</div>${opnbTopHtml(rows)}</div>`;
}
/** Résultat seul (prix payé en cours de saisie, prix lus pendant ce temps). */
function opnbRes(api, c, rows) { const r = $('.opnb-res', api.body); if (r) r.innerHTML = opnbResHtml(opnTotals(rows).v, c.paid); }
/** Saisie du prix payé dans le bilan : gardée avec la session, résultat mis à jour à chaque chiffre. */
function opnbBind(api, c, kept) {
  api.body.addEventListener('input', e => { if (e.target.id !== 'opnbPaid' || OPN.cur !== c) return; c.paid = opnbParse(e.target.value); opnSave(); opnbRes(api, c, kept()); });
}
/** Image à partager (simgShare : autre module, présent ou non) : nom, date, cartes, valeur et prix payé en euros, 5 meilleures cartes (image « normal »). */
function opnbShare(c, rows) {
  if (typeof simgShare !== 'function') return;
  const t = opnTotals(rows);
  try { simgShare({ kind: 'opening', name: c.name, date: c.at, n: t.n, value: t.v / 100, paid: c.paid != null ? c.paid / 100 : null, best: opnbBest(rows).map(({ r, u }) => ({ name: opnName(r), img: opnBig(r), eur: u / 100 })) }); }
  catch (e) { toast(T('Partage impossible pour l\'instant')); }
}
/** Mes ouvertures : gain ou perte d'une session ('' sans prix payé). */
function opnbHistTag(rec) {
  if (rec.paid == null) return '';
  const d = (rec.v || 0) - rec.paid;
  return `<small class="opnb-d ${d > 0 ? 'up' : d < 0 ? 'down' : 'eq'}">${d > 0 ? '+' : d < 0 ? '−' : ''}${esc(fmt(Math.abs(d), 'EUR'))}</small>`;
}
function opnbHistHtml(rec) { return rec.paid == null ? '' : `<div class="opnb">${opnbResHtml(rec.v || 0, rec.paid)}</div>`; }
