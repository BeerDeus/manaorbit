/* ── labs.js : « Fonctionnalités en test » (Compte et réglages › Préférences, compte de l'éditeur seulement) ─────────────────────────────
   Chaque fonctionnalité encore en essai est cachée derrière un interrupteur. Allumé, il le reste jusqu'à ce qu'on l'éteigne : le choix est gardé dans
   localStorage (survit à la fermeture de l'appli ; l'ancien choix gardé dans sessionStorage est repris une fois).
   La ligne ne s'affiche que pour le compte de l'éditeur (event.js › evAdmOn, même vérification que « Aperçu d'une fête ») ; labOn() ne regarde que le stockage :
   une fonctionnalité en test ne fait jamais rien tant que personne ne l'a allumée. */
const LABS = [
];
const LAB_KEY = 'deckdeal:labs';
const labMem = {};      // stockage refusé (navigation privée stricte) : le choix vaut pour cette page seulement
function labAll() {
  try {
    let v = localStorage.getItem(LAB_KEY);
    if (v == null && typeof sessionStorage !== 'undefined') { v = sessionStorage.getItem(LAB_KEY); if (v) localStorage.setItem(LAB_KEY, v); }      // choix d'avant (gardé pour la session seulement) : repris
    const o = JSON.parse(v || '{}'); return o && typeof o === 'object' ? o : {};
  } catch (e) { return labMem; }
}
/** Fonctionnalité en test allumée ? */
const labOn = id => !!labAll()[id];
function labSet(id, on) {
  if (!LABS.some(l => l.id === id)) return;
  const o = { ...labAll() }; if (on) o[id] = 1; else delete o[id];
  try { localStorage.setItem(LAB_KEY, JSON.stringify(o)); } catch (e) { if (on) labMem[id] = 1; else delete labMem[id]; }
  if (typeof haptic === 'function') haptic('ok');
  if (typeof toast === 'function') toast(on ? T('Fonctionnalité en test allumée') : T('Fonctionnalité en test éteinte'));
  if (typeof renderDecks === 'function') { try { renderDecks(); } catch (e) { /* écran pas encore prêt */ } }
}
/** Lignes de Préférences : un interrupteur par fonctionnalité (compte de l'éditeur seulement). */
function labsRow() {
  if (!LABS.length || typeof evAdmOn !== 'function' || !evAdmOn()) return '';
  return `<div class="me-row lab-h"><span class="me-t">${T('Fonctionnalités en test')}<small>${T('Admin · ton compte seulement')}</small></span></div>`
    + LABS.map(l => `<label class="me-row switch-row" for="setLab-${l.id}"><span class="me-t">${T(l.name)}<small>${T(l.desc)}</small></span><span class="switch"><input type="checkbox" id="setLab-${l.id}" data-lab="${l.id}" ${labOn(l.id) ? 'checked' : ''}><i></i></span></label>`).join('');
}
if (typeof document !== 'undefined') document.addEventListener('change', e => { const t = e.target; if (t && t.dataset && t.dataset.lab) labSet(t.dataset.lab, t.checked); });
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { LABS, labOn, labSet });
