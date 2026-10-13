/* ── switch.js : « Passer de ManaBox en 2 minutes » (venir d'une autre appli) ──────────────────────────────────────────────────────
   Feuille-guide, ouverte depuis : Collection › Importer (« Tu viens de ManaBox ? »), la collection vide (onglet Cartes), le 2e écran du premier
   lancement (onboard.js), l'aide (help.js : « Je viens de ManaBox… »). Trois étapes pour ManaBox (menu de l'appli → CSV → Importer › Choisir un fichier),
   ce qui suit et ce qui ne suit pas (d'après parseCollection, core.js : quantités, éditions, langues ; ni foil, ni état, ni classeurs ; les listes
   ManaBox laissées de côté), puis les autres applis (Moxfield, Archidekt, Deckbox, Dragon Shield, Delver Lens) et les decks, repliés.
   Chemins des menus vérifiés sur les guides des applis (ManaBox : menu en haut à droite de l'onglet Collection › Export) ; leurs libellés restent
   en anglais (ces applis et sites ne sont qu'en anglais). Même contenu en page web publique : pwa/passer-de-manabox.html (/passer-de-manabox, référencée).
   Rien au démarrage : la feuille est construite à l'ouverture. */
const SWG_WEB = 'passer-de-manabox';      // page web du guide (servie par proxy.mjs), relative à l'appli

/** Autres applis : [nom, comment exporter]. Textes français, traduits par T. */
const SWG_APPS = [
  ['Moxfield', 'Sur le site : <b>Collection</b> › <b>More</b> › <b>Export CSV</b>. Quantités, éditions et langues suivent.'],
  ['Archidekt', 'Sur le site : ta collection › <b>Export</b> › CSV. Garde au moins les colonnes de la quantité, du nom, du code d\'extension, du numéro de collection et de la langue.'],
  ['Deckbox', 'Sur le site : ton <b>Inventory</b> › <b>Export</b> (CSV). Deckbox écrit le nom de l\'extension, pas son code : quantités et langues suivent, l\'édition se choisit ensuite si tu y tiens.'],
  ['Dragon Shield', 'Dans l\'appli : ouvre un dossier (ou toute la collection), puis son menu › <b>Export</b> › <b>CSV</b>, et enregistre ou partage le fichier. Les dossiers d\'un même fichier s\'additionnent.'],
  ['Delver Lens', 'Ouvre la liste, icône <b>Export</b> en haut › <b>Create CSV file</b> › <b>Download</b> : le fichier arrive dans Téléchargements. Pour les éditions et les langues, ajoute aussi les colonnes du code d\'extension, du numéro de collection et de la langue.'],
];

/** Ouvre le guide. o.from : 'import' (feuille d'import ouverte dessous : « Choisir mon fichier » ouvre directement son sélecteur), 'empty', 'onboard', 'help'. */
function swgOpen(o) {
  const from = (o && o.from) || '';
  openSheet(T('Passer de ManaBox en 2 minutes'), T('Ou de Moxfield, Delver Lens, Dragon Shield…'), api => {
    api.wrap.classList.add('swg-sheet');
    const step = (n, title, text, more) => `<li class="swg-step"><i aria-hidden="true">${n}</i><div><b>${title}</b><p>${text}</p>${more ? `<small>${more}</small>` : ''}</div></li>`;
    const keep = (ok, text) => `<li class="${ok ? 'ok' : 'no'}"><svg class="i" aria-hidden="true"><use href="#i-${ok ? 'check' : 'close'}"/></svg><span>${text}</span></li>`;
    const det = (title, html, cls) => `<details class="hp-q swg-q${cls ? ' ' + cls : ''}"><summary><span>${title}</span><svg class="i" aria-hidden="true"><use href="#i-chev"/></svg></summary>${html}</details>`;
    api.body.innerHTML = `<p class="swg-lead">${helpNb(T('Ta collection te suit : exporte-la en CSV depuis ManaBox, puis importe le fichier ici.'))}</p>
      <ol class="swg-steps">
        ${step(1, T('Dans ManaBox'), helpNb(T('Onglet <b>Collection</b> : menu en haut à droite › <b>Export</b>. Choisis <b>CSV</b> si l\'appli le demande, confirme avec <b>Export</b>, puis enregistre le fichier (Fichiers, Drive…) ou envoie-le-toi.')), helpNb(T('Un seul classeur ? Le même menu, depuis le classeur.')))}
        ${step(2, T('Dans Mana Orbit'), helpNb(T('<b>Collection</b> › <b>Importer</b> (la flèche en haut) › <b>Choisir un fichier</b>, puis le fichier CSV.')))}
        ${step(3, T('Vérifie et importe'), helpNb(T('L\'aperçu compte tes cartes et signale les noms inconnus. <b>Ajouter</b> ou <b>Remplacer ma collection</b>, puis <b>Importer</b> : images et prix arrivent tout seuls.')))}
      </ol>
      <h3 class="cs-h">${T('Ce qui suit')}</h3>
      <ul class="swg-keep">
        ${keep(true, helpNb(T('Les quantités : une carte présente dans plusieurs éditions s\'additionne')))}
        ${keep(true, helpNb(T('Les éditions : code d\'extension et numéro de collection')))}
        ${keep(true, helpNb(T('La langue de chaque exemplaire')))}
        ${keep(false, helpNb(T('Le foil et l\'état : pas encore (la valeur suit le prix tendance)')))}
        ${keep(false, helpNb(T('Les classeurs et les prix d\'achat ; les listes ManaBox (souhaits) ne sont pas importées')))}
      </ul>
      <h3 class="cs-h">${T('Depuis une autre appli')}</h3>
      <div class="hp-list">${SWG_APPS.map(([n, a]) => det(esc(n), `<p>${helpNb(T(a))}</p>`)).join('')}
        ${det(T('Une autre appli'), `<p>${helpNb(T('Tout CSV avec une colonne <b>Name</b> (ou <b>Nom</b>) se lit, avec <b>Quantity</b> ou <b>Count</b> pour les quantités. Sinon, colle une liste « 3 Sol Ring » dans l\'import.'))}</p>`)}</div>
      <h3 class="cs-h">${T('Tes decks')}</h3>
      <div class="hp-list">${det('Moxfield, Archidekt, ManaBox…', `<p>${helpNb(T('Copie la liste du deck en texte (Moxfield : <b>Export</b> › copier en texte ; ManaBox : menu du deck › export en texte), puis Decks › <b>Prix d\'une liste</b> : colle-la et touche <b>Enregistrer</b>.'))}</p>
        <p>${helpNb(T('Dans l\'appli Android, <b>Partager</b> un lien de deck Archidekt ou EDHREC vers Mana Orbit le lit tout seul. Les liens Moxfield ne se lisent pas (pas d\'accès public) : copie la liste.'))}</p>`, 'swg-decks')}</div>
      <p class="hint swg-web">${T('Ce guide existe aussi en page web, à envoyer à un ami : {link}', { link: `<a href="${SWG_WEB}" target="_blank" rel="noopener">manaorbit.app/${SWG_WEB}</a>` })}</p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Fermer')}</button><button class="btn" type="button" data-swg="go"><svg class="i" aria-hidden="true"><use href="#i-upload"/></svg>${from === 'import' ? T('Choisir mon fichier') : T('Importer mon fichier')}</button>`);
    // une section ouverte referme les autres de son groupe : la feuille reste courte
    api.body.addEventListener('toggle', e => { const d = e.target; if (d.open) $$('.swg-q[open]', d.parentNode).forEach(x => { if (x !== d) x.open = false; }); }, true);
    $('[data-swg="go"]', api.foot).onclick = () => {
      haptic('tap'); api.close();
      const pick = from === 'import' && $('#ciFile');      // import ouvert dessous : son sélecteur de fichier, dans le même geste (sinon le navigateur le refuse)
      if (pick) { try { pick.click(); } catch (e) { /* sélecteur refusé : l'import reste ouvert */ } }
      else setTimeout(() => openCollImport(), reduceMotion() ? 0 : 200);
    };
  });
}
