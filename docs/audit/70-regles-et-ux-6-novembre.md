# Audit du 6 novembre : logiciel et UI / UX (lecture seule)

Audit en lecture seule, puis lots A et B faits le 6 novembre (voir `docs/a-faire.md`). Captures remises au propriétaire, non versionnées (ui1 = premiers pas, ajout, collection : FR clair, FR sombre, EN ; ui2 = decks, coach, échange, alertes : FR clair, FR sombre, DE).
Limites du monde de test (pas comptées comme défauts) : images de cartes grises, noms français non servis, pas de compte Firebase (« Compte indisponible »).
Vérifié à la main dans le code ou sur capture : marqué ✔.

---

# Partie 1 : logiciel

## Top 10 (nécessaire)

### L1. Je recherche / cartes gardées : un appareil efface les souhaits de l'autre ✔
- `share.js:45` (`trChanged` : `TR.u = Date.now()`, horloge de l'appareil), `share.js:56-62` (date la plus récente gagne sur tout le document), `share.js:66` (`trPush`).
- Avant : PC ajoute 5 souhaits à 14 h ; téléphone hors ligne en ajoute 3 à 15 h ; au retour du réseau, les 5 du PC disparaissent partout. Même chose en ligne si une horloge avance de quelques minutes.
- Après : fusion à trois clé par clé (`merge3`, comme la collection) pour `wish` et `kept`.
- M · risque moyen · tests : `trade-e2e`, `widget-e2e`, `sync-e2e` (+ cas deux appareils).

### L2. Synchro qui ne revient jamais après une erreur Firestore (quota du jour)
- `collection.js:563-565`, `decks.js:798-806`, `share.js:56-62`, `masterset.js:467-472`, `extras.js:170-173/184` : à l'erreur, plus d'écoute ; réabonnement seulement au changement de compte (`decks.js:756/810`).
- Avant : le jour où le quota de 50 000 lectures saute (lancement Play Store), une appli restée ouverte ne reçoit plus rien (decks, échange, badges, masterset) jusqu'à un rechargement.
- Après : réabonnement avec attente croissante, aussi sur `online` / retour au premier plan.
- S-M · tests : `sync-e2e`, `test-cloud`, `lectures-e2e`.

### L3. Appels au serveur Mana Orbit sans délai maximal ✔
- `data.js:89` : délai pour Scryfall seulement ; `troc.js:79`, `trocPoll` (129-144), `partie.js:615`, `friends.js:67`, `daily.js:62`, `event.js:300`, `cardsheet.js:143`, `deckwiz.js:77`, `edh.js:101`, `cloud.js` › `shareFetch`, `scan.js:699/718`.
- Avant : échange en direct en Wi-Fi faible, un relevé reste pendu : plus aucun changement de l'autre joueur, pas de bandeau hors ligne. Scan : `/api/names/find` pendu bloque toute la file (« 12 cartes déjà en attente »).
- Après : un `fetch` commun avec `AbortController` (8-15 s) → `code:'net'` (messages déjà prêts).
- S · tests : `troc-e2e`, `test-troc`, `partie-ui-e2e`, `scan-e2e`, `scanapk-e2e`, `amis-e2e`.

### L4. Calendrier de l'Avent : 8 cartes sur 39 « pas encore dans ta collection » alors qu'elles y sont ✔
- `evadvent.js:134` (`advName`), `evadvent.js:146` (`collQty(k)` avec `k = toLowerCase()` au lieu de `ownKey`), `evsky.js:184`. Nom traduit en français seulement (`I18N.lang === 'fr'`).
- Avant : Wayfarer's Bauble ×4 possédée → « Pas encore dans ta collection ». Touche aussi Mishra's Factory, Arcum's Sleigh, les doubles faces…
- Après : `ownKey` + nom affiché commun (L8).
- S · échéance 1er décembre · tests : `advent-e2e`, `sky-e2e`.

### L5. Prix : devise et foil divergents selon l'écran
- « Les plus chères » en € sur des montants en dollars (marché TCGplayer) ✔ : `collection.js:1226` (`cur = … 'EUR'`), alors que la tuile au-dessus fait `fmt(st.value, mkCur())`. Avant : « $1,234.00 » puis « €45.00 » juste dessous.
- Exemplaire foil d'une édition sans prix foil : collection et valeur = prix normal (`collection.js:85/91` `edEu`/`collLineEu`, copie `scaned.js:19`) ; échange, classeur, troc = prix foil de la fiche (`share.js:98-102` `trLinePx`, `binder.js:340`, `troc.js:64`). Avant : 3 € dans la collection, 15 € dans la liste d'échange.
- Tuiles d'édition : foil compté dans le choix d'édition (`collection.js:231`), pas dans Illustrations (`viewer.js:136`), ni sur les tuiles du lot (`lot.js:108` vs `lotEu` 31-35), ni sur la page d'extension (`setview.js:121`, foil seul = sans prix) ; Master Set oui (`masterset.js:112/194`).
- Après : une fonction « prix d'un exemplaire (édition, finition) → montant + devise ».
- Décision : foil sans prix foil → afficher le prix normal (faux) ou rien ?
- S/M · tests : `coll-e2e`, `prix-e2e`, `market-e2e`, `trade-e2e`, `binder-e2e`, `troc-e2e`, `edition-e2e`, `art-e2e`, `lot-e2e`, `masterset-e2e`, `content-e2e`.

### L6. Alertes de prix : le serveur lit une autre impression que l'appli
- `server/proxy.mjs:644-660` (`alFetch` : impression par défaut de Scryfall) ; l'appli : relevé du jour, impression la moins chère (`builder.js:101`, `data.js:890`) ; le serveur a déjà ce relevé (`PX_LIVE`, `proxy.mjs:167`, utilisé par l'échange).
- Avant : fiche de Sol Ring « 1,20 € » puis « Relevé des alertes : 1,89 € » ; une réimpression sans prix Cardmarket = « pas encore de prix », jamais d'alerte.
- Après : alertes sur le même relevé (Scryfall en repli) ; remettre les médianes `AL.px` à zéro (sinon fausse baisse).
- M (serveur) · tests : `test-alerts`, `alerts-e2e`, `alerts-dm-e2e`, `cardsheet-e2e`.

### L7. « Je recherche » / « À échanger » ne suivent pas la règle R2
- `core.js:2571-2632` (`deckUse` : tous les decks additionnés, réserve comprise ; `tradeLists`, `tradeWant`), `share.js:74-92`, `home.js:70-71` ; R2 : `extras.js:70-74` ; alertes : `alerts.js:63-70` (sans la réserve).
- Avant : 1 Sol Ring dans les decks A et B, aucun monté : viewer « Possédée », pas d'alerte, mais Je recherche « Sol Ring × 1 » et accueil « 1 recherchée ». 3 Duress en réserve : à acheter dans le viewer, cherchées par l'échange, pas surveillées par les alertes.
- Décision du propriétaire : quelle règle pour l'échange (R2 = decks montés, ou tous les decks) ? Réserve dans les alertes ?
- M · tests : `test-trade`, `test`, `alerts-e2e`, `cardsheet-e2e`, `dklist-e2e`.

### L8. Nom affiché d'une carte : encore plusieurs règles
- Collection : `frName(k, l)` (`collection.js:874`, ≈ 40 appels) traduit seulement si langue = langue des cartes ; la suggestion `sugOwned` (`collection.js:811`) prend aussi la langue de l'appli. Avant : appli en allemand, cartes en français, Lightning Bolt allemande : suggestion « 🇩🇪 Blitzschlag », puis ligne, fiche, échange « Lightning Bolt 🇩🇪 ». S.
- Decks : éditeur `bdLabel` (`builder.js:177`) = langue de l'exemplaire ; viewer vignettes et commandant = anglais brut (`viewer.js:536/541/556/571`) ; viewer en grand = nom tapé (`viewer.js:780-797`) ; image partagée = nom tapé (`simg.js:438`). Avant : « Foudre » dans l'éditeur, « Lightning Bolt » en vignette, « Foudre » agrandie. M. Décision : carte non possédée → langue de l'appli ou nom tapé ?
- Variations de prix et alertes en anglais (`value.js:149/201-205/236`, `alerts.js:231/239`) alors que le toast d'alerte dit « Anneau solaire ». S.
- Tests : `cardnames-e2e`, `names-de-e2e`, `frnames-e2e`, `zoom-e2e`, `viewer-e2e`, `builder-e2e`, `fiche-e2e`, `value-e2e`, `alerts-e2e`, `homedesk-e2e`.

### L9. Ajouts qui perdent ou doublent des données
- Souhait ajouté depuis Échange : `TR.wish[k] = { n, q }` écrase l'illustration, l'édition et la langue choisies (`share.js:454`) ✔. S.
- « Ajouter ses cartes à ma collection » (`decks.js:367/399-404`) : toutes les quantités, sans langue, sans regarder ce qui est déjà possédé → la collection double sans avertir ; le scan d'un deck propose « seulement ce qui manque » (`builder.js:332-340`). S-M.
- Suppression d'un deck : deux appuis, sans « Annuler » (`decks.js:411-415`) ✔, et `removeDeck` coupe aussi le lien partagé, la copie publique et la réservation. Les « − » de carte ont « Annuler ». M.
- Tests : `trade-e2e`, `test-trade`, `builder-e2e`, `e2e-account`, `pubdecks-e2e`, `sharedeck-e2e`, `lectures-e2e`.

### L10. Petits bugs visibles (lot rapide, S chacun)
- « 1 exemplaires » sur l'accueil : `home.js:159` (`T` au lieu de `TN`) ✔. Test : `homedesk-e2e`.
- Aide du format « Nouveau deck » restée en français dans les 5 autres langues : `core.js:1048-1049` (`T()` évalué au chargement, avant la langue) ✔. Capture : `shots/ui2/a03-nouveau-deck-rempli-de-light.png`. Chercher les autres constantes traduites au chargement.
- Budget du coach « 50 € » ou « 1 000 » → remis à 0 sans message : `deckwiz.js:943` (`Number()`) ✔ ; 7 lectures de montant différentes (`alerts.js:45-48`, `opnbilan.js:10-13`, `scanset.js:80`, `app.js:344`, `deckana.js:407`, `deckopt.js:341`) ; frais de port affichés « 4,90 » en anglais (`app.js:1373`, `decks.js:132`). Tests : `deckwiz-e2e`.
- Bandeau « Chargement du catalogue (une seule fois)… » jamais retiré quand le catalogue arrive (`lot.js:290`, `lotSuggest` ne l'efface pas) ✔ ; affiché à côté de « Aucune carte de ce nom » ; Scryfall coupé : chargement sans fin, ni erreur ni « Réessayer » (même chose dans l'éditeur, `builder.js:538/550`). Captures : `shots/ui1/b-fr-l-03-lot-sugg.png`, `shots/ui1/e-fr-l-05-lot-scryfall-down.png`, `shots/ui2/h03-recherche-catalogue-horsligne-fr-light.png`.
- Point orange (alerte) sur un message de réussite : `style.css:270` vise `.sy-d` au lieu de `.dot`.

## Reste, nécessaire (liste courte)
- Deux onglets (PWA + lien ouvert dans Chrome) : aucune écoute `storage`, la copie gardée en mémoire réécrit celle de l'autre onglet (`collection.js:22-33`, `decks.js:11-19`, `share.js:40`) ; hors ligne, perte définitive. M.
- Collection au-delà d'environ 22 000 lignes : plafond de 900 000 caractères (`collection.js:518`), message sans issue, chaque « + » relance un envoi voué à l'échec (1 lecture Firestore + analyse de 900 Ko). S (prévenir, ne plus relancer) / L (découper le document). Décision.
- Codes de langue Scryfall (« ja », « zhs ») passés au viewer (`setview.js:113`, `masterset.js:278` → `scryImage`) : image japonaise en vignette, anglaise agrandie ; 5 conversions inverses (`scanfoot.js:10`, `viewer.js:180`, `data.js:308`, `lot.js:120`, `core.js:222`). S.

## Bien d'avoir (liste courte)
- Valeur de la collection : deux calculs (`collValue` vs `collStats`) : accueil « 4 812 € », Stats « 1 230 € » pendant un import ou hors ligne. M.
- Perf : chaque « + » re-sérialise toute la collection (≈ 135 ms à 5 000 cartes, 460 ms à 20 000, avant CPU ×4) ; démarrage : collection analysée deux fois (≈ 0,4 s à 5 000 cartes, CPU ×4) ; Master Set reconstruit à chaque « + » ; « Prix rapide » du scan repeint toute la liste. S-M.
- Stockage plein : souhaits, scan en cours, lot, alertes, profil écrits sans prévenir ; caches de prix jamais purgés (≈ 1,8 M caractères à 20 000 cartes). S-M.
- « Compte indisponible » au démarrage jamais réessayé seul (`decks.js:820-831`). S.
- Aucune remontée des erreurs JS en production (`help.js:474`). M.
- Dates : 4 « il y a » (`relTime`, `agoDay`, `pxAgo`, `app.js:793`), deux styles dans la même fiche ; `dateShort` = `valDate` ; fichiers d'export datés en UTC. S.
- Tris : `localeCompare` sans locale à 9 endroits au lieu de `NAME_CMP`. S.
- Formats : `LG_FMT` (7) vs `CS_FMT` (10) : la fiche montre « Brawl : Légale », aucun filtre Brawl. S.
- Recherche « Dans ta collection » de l'éditeur (`bdadd.js:51-58`) hors de la règle `cnRank`. S.
- Formatage en double : 6 formateurs d'euros entiers, 6 tables de noms de couleurs, 4 ordres WUBRG, ≈ 15 URL d'images Scryfall faites à la main, nom d'extension avec 2 replis, 2 clés de carte côté serveur. S-M.
- Code mort : 9 fonctions (≈ 28 lignes : `bdCollHtml`, `dwAuditHtml`, `evmRib`, `frToEn`, `enToFr`, `ocrStop`, `scanFail`, `COLOR_ORDER`, `PRG_TIERS`) ; 153 clés i18n orphelines × 5 langues = 765 entrées (≈ 110 Ko, ≈ 22 Ko lus au démarrage), liste : `(liste remise au propriétaire)` ; ≈ 60 lignes de CSS de l'ancien accueil. Aucun fichier mort.

---

# Partie 2 : UI / UX (téléphone 393 × 852)

## Top 10

### U1. Les feuilles laissent voir l'écran du dessous (P1, S) ✔
- `style.css:1516` : fond à 96 % (flou retiré pour la perf). Le texte du dessous se lit à travers (« Scanner », « Importer » derrière Prix et CardTrader ; « 20 à acheter » derrière les filtres d'À monter) ; en sombre, la barre du bas traverse ; 3 feuilles empilées (Compte › Notifications › Alertes) se mélangent.
- Proposition : fond opaque (aucun coût de perf).
- Captures : `shots/chk-sheet-3s.png` (3 s après l'ouverture), `shots/ui2/c03-a-monter-filtres-fr-light.png`, `shots/ui2/e03-alertes-vide-fr-light.png`, `shots/ui2/b09-rapport-coach-fr-light.png`.

### U2. Ajouter une carte à la main : caché, 4 appuis, « + » trompeur (P1, M)
- Ni l'accueil « Pour commencer » ni l'étape 2 de bienvenue ne proposent la saisie ; il faut passer par Collection › « Ajouter à la main » › suggestion › « + Ajouter ». Le « + » d'une suggestion ouvre un panneau au lieu d'ajouter.
- Proposition : « Ajouter une carte » sur l'accueil vide et à l'étape 2 ; « + » = ajoute 1 exemplaire (toast « Ajoutée · Modifier / Annuler »), le nom ouvre le détail. Objectif 2 appuis.
- Captures : `shots/ui1/a-fr-l-06-home-after-tour.png`, `shots/ui1/b-fr-l-03-lot-sugg.png`, `shots/ui1/b-fr-l-04-lot-card.png`.

### U3. Créer un deck : 15 appuis et 3 feuilles avant l'éditeur (P1, M)
- Commander de 3 cartes : Decks, +, nom, Commander, Créer, « J'ai déjà ce deck », « À la main », « Choisir un commandant », + Edgar, cible « Deck », recherche, +×3, Enregistrer. L'éditeur s'ouvre sur l'onglet Deck vide ; après le commandant, la cible reste « Commandant » (risque d'ajouter la carte suivante comme commandant).
- Proposition : une seule feuille (nom, format, 4 départs : Scanner, Coller, À la main, Assistant) ; éditeur ouvert sur « Ajouter » ; cible qui passe seule sur Deck. Objectif ≈ 9 appuis.
- Captures : `shots/ui2/a02-nouveau-deck-fr-light.png`, `shots/ui2/a04-choix-have-build-fr-light.png`, `shots/ui2/a05-choix-scan-coller-main-fr-light.png`, `shots/ui2/h01-apres-commandant-fr-light.png`.

### U4. États vides et erreurs sans issue (P1, S-M)
- Collection : « Aucune carte ne correspond. » seul, sans « Effacer les filtres / la recherche » ni « Ajouter "xxx" » ; ne dit pas si ce sont les filtres actifs.
- À monter : « le fichier edh.bin.gz n'est pas encore généré ou le site est injoignable » (nom technique, même texte hors ligne et en panne).
- Catalogue hors ligne : chargement sans fin (L10).
- Modèle à suivre : l'échange en direct (« Hors ligne : l'échange en direct a besoin d'internet »).
- Captures : `shots/ui1/d-fr-l-03-search-none.png`, `shots/ui1/e-fr-l-04-filters-closed-active.png`, `shots/ui2/c07-a-monter-erreur-fr-light.png`, `shots/ui2/c08-a-monter-horsligne-fr-light.png`.

### U5. Barre d'icônes de la collection ambiguë (P1, S)
- 8 icônes sans texte ; 4 carrés = Masterset (lu comme « vue en grille », à côté du vrai bouton d'affichage) ; Importer ↓ / Exporter ↑ ; « € » = prix réels CardTrader. Le guide ManaBox dit « Importer (la flèche en haut) » : il y en a deux, et celle d'Importer pointe vers le bas.
- Proposition : vraie icône Masterset ; Importer / Exporter dans un « … » avec libellés ; libellé « Prix réels » ; corriger le guide.
- Captures : `shots/ui1/d-fr-l-01-coll-list-default.png`, `shots/ui1/c-fr-l-06-swg-guide.png`.

### U6. Même action, plusieurs noms ; même nom, plusieurs actions (P2, M)
- 3 « Modifier » : « Modifier le deck » (nom, image, format, tags), « Modifier les cartes » (éditeur), « Modifier la liste » (écran Prix d'une liste).
- « Monter » : À monter (idées EDHREC), deck monté (cartes réservées), « monter le deck » ; le toast « 4 cartes réservées · incomplet » marque le deck monté sans qu'on le demande.
- Cartes manquantes : 7 noms (Suivre les cartes manquantes, Ajouter les manquantes à Je recherche, Chercher les manquantes, Chercher les offres, Manquantes · Cardmarket, Copier pour Cardmarket, Suivre le prix). Coach = « Analyser » dans À monter.
- Ajout : « Ajouter à la main / des cartes / une carte / + » ; Importer : 4 libellés ; Scanner : 3 ; ManaBox : 4. « Pas encore de cartes pour l'instant » (pléonasme).
- Proposition : un petit lexique fixe, le même titre pour le bouton et l'écran qu'il ouvre.
- Captures : `shots/ui2/a15-feuille-deck-fr-light.png`, `shots/ui2/h04-viewer-commander-fr-light.png`, `shots/ui2/c01-a-monter-liste-fr-light.png`, `shots/ui1/b-fr-l-01-coll-empty.png`.

### U7. Coach : deux notes et trois valeurs pour le même deck (P2, M) ✔
- Version « Équilibrée » 58/100 (carte, toast), onglet Coach 51/100 juste après ; valeur 49,80 € (toast), ≈ 10,55 €+ (en-tête), 49,85 € (rapport). Toast de 3-4 lignes qui cache le contenu ; DE : « Abbrechen » au lieu de « Rückgängig » ; trois boutons pleins de même poids ; pas de bouton « Choisir » sur les versions.
- À creuser côté logiciel (même chiffre, deux calculs ?).
- Captures : `shots/ui2/b05-versions-fr-light.png`, `shots/ui2/b06-coach-apres-generation-fr-light.png`, `shots/ui2/b09-rapport-coach-fr-light.png`.

### U8. Alertes de prix enfouies (P2, S)
- Compte › Notifications › interrupteur › « Cartes surveillées et réglages » : 4 appuis, 3 feuilles empilées ; rien depuis Je recherche ni Mes decks ; « Couper » ambigu.
- Proposition : entrée « Alertes de prix (N) » dans Je recherche ; « Désactiver les alertes ».
- Captures : `shots/ui2/e01-compte-fr-light.png`, `shots/ui2/e03-alertes-vide-fr-light.png`, `shots/ui2/e05-alertes-feuille-fr-light.png`.

### U9. Cibles tactiles et contraste (P2, S)
- Sous 44 px : Retour / Fermer 36×36 (32×36 si titre long), « … » d'un deck et « + Créer » 34×34, − / + 30×36, Foil 46×28, Trier 28×32, Liste / Classeur 41×32, « Garder » 53×26, liens « Dupliquer » et « Ajouter ses cartes » 17 px de haut, point de synchro 9×9.
- Contraste : texte indicatif des champs = gris du navigateur `rgb(117,117,117)`, ≈ 4,1:1 en clair, 3,9:1 en sombre (< 4,5:1) ; le reste passe (5,3:1 / 6,5:1). Aucun bouton sans nom accessible, aucun débordement en EN / DE.
- Captures : `shots/ui1/d-fr-l-01-coll-list-default.png`, `shots/ui2/a14-mesdecks-liste-fr-light.png`, `shots/ui2/a15-feuille-deck-fr-light.png`.

### U10. « Non sauvegardée » = un point rouge de 9 px (P2, S)
- Le seul signal du risque principal (cartes seulement sur l'appareil) ; le sens n'est que dans l'`aria-label`.
- Proposition : pastille avec texte « Non sauvegardée · Se connecter » (≥ 44 px), orange sans compte, rouge si la synchro échoue.
- Captures : `shots/ui1/c-fr-l-05-coll-after-import.png`, `shots/ui1/d-fr-d-01-coll-list-default.png`.

## Reste (liste courte)
- P2 : filtres de la collection : panneau dans la page qui pousse le résultat sous la barre ; pas de « Voir N cartes » ni « Tout effacer » ; « Plus de filtres » de 0 px de haut ; « Rituels » remplace « Créatures » en silence (`shots/ui1/e-fr-l-03-filters-selected.png`). Le panneau d'À monter fait déjà bien (« Voir 2 decks », « Tout effacer »).
- P2 : import : CSV brut affiché dans la zone de texte ; « Choisir un fichier » en bouton secondaire ; choix de langue affiché alors que le fichier la donne ; « Remplacer ma collection » présélectionné sur une collection vide (`shots/ui1/c-fr-l-02-import-csv.png`).
- P2 : scan : « Ajouter | Prix » et bouton « Ajouter » sur le même écran ; « Éditions : comme la 1re » obscur ; sans caméra, le cercle reste actif, pas de « Taper un nom » (`shots/ui1/c-fr-l-07-scan.png`).
- P2 : premier lancement : « Passer » et « Plus tard » se ressemblent mais font deux choses ; étape 3 hors ligne sans « Continuer » ; la pastille de visite recouvre « Je viens de ManaBox » ; la dernière étape montre une decklist d'exemple de 75 cartes prise pour la sienne (`shots/ui1/a-fr-l-02-ob2.png`, `shots/ui1/a-fr-l-05-tour-5.png`).
- P2 : échange en direct invisible sans compte, ligne discrète avec compte ; « ⚙ Garde 1 ex. » cryptique (`shots/ui2/d01-echange-liste-fr-light.png`).
- P2 : éditeur : « Ajouter la carte listée » en gros bouton pour un seul résultat, resté après l'ajout (`shots/ui2/a11-editeur-3cartes-fr-light.png`).
- P3 : viewer : 6 boutons de même poids + « Modifier la liste » ; Coach absent sans section Commandant ; partage mal aligné (`shots/ui2/h04-viewer-commander-fr-light.png`).
- P3 : feuille d'un deck : « Dupliquer » et « Ajouter ses cartes » en liens de 12 px ; « Supprimer » au même poids qu'« Ouvrir ».
- P3 : brackets de l'assistant en anglais (« 3 · Upgraded ») en FR et DE.
- P3 : anglais maladroit : « 17 cop. », « Edition » au lieu de « Printing », « The card's own », « Storage ».
- P3 : « Ajouter des cartes » : bouton appareil photo qui se déplace de 67 px ; triple retour après un ajout ; « lot » pas expliqué.
- P3 : appuis longs non signalés (renommer une recherche enregistrée, « Prix rapide » sur le rond central) ; puce « Enregistrer » sans complément.
- P3 : « 7 cartes » (viewer) vs « 7/100 cartes » (feuille, liste) ; Mes decks vide ne dit pas où coller une liste ; bouton Retour du viewer focalisé (anneau bleu) à l'ouverture.

---

# Lots proposés pour le go

| Lot | Contenu | Taille | Décision avant ? |
|---|---|---|---|
| A, corrections rapides | L4 Avent, L10 (« 1 exemplaires », aide du format, budget, bandeau catalogue, point orange), devise US (L5), illustration du souhait (L9), U1 feuilles opaques, guide ManaBox (U5), contraste des champs (U9) | S | non |
| B, synchro et réseau | L1 fusion des souhaits, L2 réabonnement, L3 délai des appels, deux onglets | M | non |
| C, prix et noms | L5 foil, L6 alertes serveur, L8 noms affichés | M | oui : foil sans prix foil ; nom d'une carte non possédée dans un deck |
| D, règles | L7 échange vs R2, L9 « Ajouter ses cartes » + annulation de la suppression d'un deck | M | oui : règle de l'échange, réserve dans les alertes |
| E, parcours | U2 ajout d'une carte, U3 création d'un deck, U4 états vides, U6 lexique, U8 alertes | M-L | oui : lexique (2-3 versions à choisir), maquettes avant code |
| F, bien d'avoir | valeur à deux calculs, perf du « + », stockage plein, dates, tris, formats, code mort et i18n orphelines | S-M | non |
