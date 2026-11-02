/* ── labs.js : « Fonctionnalités en test » (Compte et réglages › Préférences, compte de l'éditeur seulement) ─────────────────────────────
   Chaque fonctionnalité encore en essai est cachée derrière un interrupteur. Allumé, il vaut jusqu'au prochain démarrage de l'appli : le choix est gardé dans
   sessionStorage (survit à un rechargement de la page, une mise à jour ou le service worker ; oublié quand l'appli est fermée ou l'onglet refermé).
   La ligne ne s'affiche que pour le compte de l'éditeur (event.js › evAdmOn, même vérification que « Aperçu d'une fête ») ; labOn() ne regarde que le stockage :
   une fonctionnalité en test ne fait jamais rien tant que personne ne l'a allumée. */
const LABS = [
  { id: 'deckwiz', name: 'Assistant de deck Commander', desc: 'Nouveau deck : « J\'ai déjà ce deck » ou « Deck à construire » ; onglet Coach de l\'éditeur (jauges, suggestions, bracket, budget)' },
];
const LAB_KEY = 'deckdeal:labs';
const labMem = {};      // stockage refusé (navigation privée stricte) : le choix vaut pour cette page seulement
function labAll() {
  try { const o = JSON.parse(sessionStorage.getItem(LAB_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return labMem; }
}
/** Fonctionnalité en test allumée ? */
const labOn = id => !!labAll()[id];
function labSet(id, on) {
  if (!LABS.some(l => l.id === id)) return;
  const o = { ...labAll() }; if (on) o[id] = 1; else delete o[id];
  try { sessionStorage.setItem(LAB_KEY, JSON.stringify(o)); } catch (e) { if (on) labMem[id] = 1; else delete labMem[id]; }
  if (typeof haptic === 'function') haptic('ok');
  if (typeof toast === 'function') toast(on ? T('Fonctionnalité en test allumée jusqu\'au prochain démarrage') : T('Fonctionnalité en test éteinte'));
  if (typeof renderDecks === 'function') { try { renderDecks(); } catch (e) { /* écran pas encore prêt */ } }
}
/** Lignes de Préférences : un interrupteur par fonctionnalité (compte de l'éditeur seulement). */
function labsRow() {
  if (typeof evAdmOn !== 'function' || !evAdmOn()) return '';
  return `<div class="me-row lab-h"><span class="me-t">${T('Fonctionnalités en test')}<small>${T('Admin · ton compte seulement, jusqu\'au prochain démarrage de l\'appli')}</small></span></div>`
    + LABS.map(l => `<label class="me-row switch-row" for="setLab-${l.id}"><span class="me-t">${T(l.name)}<small>${T(l.desc)}</small></span><span class="switch"><input type="checkbox" id="setLab-${l.id}" data-lab="${l.id}" ${labOn(l.id) ? 'checked' : ''}><i></i></span></label>`).join('');
}
if (typeof document !== 'undefined') document.addEventListener('change', e => { const t = e.target; if (t && t.dataset && t.dataset.lab) labSet(t.dataset.lab, t.checked); });
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { LABS, labOn, labSet });
