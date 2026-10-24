# Audit « Ma collection » (Mana Orbit), 24 octobre 2026

Périmètre : liste des cartes (`collection.js`, `filters.js`), Stats (`value.js`, `simg.js`), import et export, « Ajouter des cartes » (`lot.js`), carte en grand (`zoom.js`, `viewer.js`), édition et foil, Masterset (`masterset.js`), page d'extension (`setview.js`), Rangement et proxys (`places.js`), alertes de prix côté collection (`alerts.js`), migration ManaBox (`switch.js`, `pwa/passer-de-manabox.html`).

## Méthode

- Monde de test e2e (faux Scryfall et CardTrader), ports 19520 à 19528. Scripts : `$SCRATCH/collection/js/` (`tour.mjs` : 28 écrans par appareil ; `func.mjs` : import, export, aller-retour ; `perf.mjs` et `perf2.mjs` : 5 000 cartes ; `contrast.mjs`).
- Trois collections : vide ; petite (9 cartes, 3 emplacements, FR, EN, foil, éditions, une carte sans langue, historique de 41 jours) ; grande (5 000 cartes, éditions, emplacements, 6 langues).
- Appareils : 360×780 clair (petite) et sombre (vide) ; 393×852 clair et sombre (tactile) ; 1280×800 clair et sombre ; 1890×900 clair (souris).
- Captures : `$SCRATCH/collection/shots/<appareil>-<thème>-<collection>-<écran>.png`. Journal : `$SCRATCH/collection/log.txt`.
- Résultat : aucune erreur JavaScript ni console sur les 7 passes, aucun débordement horizontal ni texte coupé (vérifications reprises de menus-e2e).
- Limites :
  - Images, symboles et noms d'extensions sont factices (rectangles gris, ronds noirs). Les écarts de progression du masterset avec mes fausses cartes ne sont donc pas retenus comme bugs.
  - Le compte Firebase est injoignable dans le monde de test, d'où le bandeau rouge « Compte indisponible » sur toutes les captures.
  - **Mesures de performance faussées** : la machine (4 cœurs) était partagée avec d'autres agents, charge de 10 à 48. Seules les valeurs relatives sont fiables (voir § Perf).

---

## (a) Bugs

| # | Constat | Repro / preuve | Proposition | Impact | Effort |
|---|---|---|---|---|---|
| A1 | **Tri « Édition » : une ligne est rangée sous une extension qui n'est pas la sienne.** `collBySet` (`collection.js:986`) classe la carte sous l'extension la plus récente de *toutes* ses lignes. Toutes les lignes de la carte s'affichent ensuite sous cet intertitre, y compris une ligne sans édition ou d'une autre édition. | Sol Ring : 4 FR sans édition (Classeur rouge) et 1 EN CMM 400. Trier › Édition : la ligne FR sans édition apparaît sous « Commander Masters », avec son rond « sans édition ». Captures : `i393-light-small-tri-edition.png`, `pc1280-light-small-tri-edition.png`. | Classer **par ligne** (langue + édition), pas par carte : chaque ligne sous sa propre extension, les lignes sans édition dans « Sans édition ». | moyen | S |
| A2 | **Ordinateur, tri « Édition » : les intertitres cassent la grille à 2 colonnes.** `zz-desktop.css:114` met `.coll-list` en grille de 2 colonnes, et les `h3.coll-sethd` deviennent des cases de la grille. | « Commander Masters » occupe une case, avec Sol Ring à côté ; « Sans édition » partage une rangée avec Arcane Signet ; les bordures `nth-child(odd)` sont décalées. Capture : `pc1280-light-small-tri-edition.png`. | `.coll-list > .coll-sethd { grid-column: 1 / -1 }`, et bordures calculées sans `nth-child`. | moyen (PC) | S |
| A3 | **Ordinateur, Stats › « Valeur dans le temps » : courbe géante.** `.vl-svg { width:100%; height:auto }` (`style.css:1054`) étire le SVG de 320×132 sur 1 000 px et plus. Le texte de l'axe passe à environ 28 px, le trait devient épais, et le graphique fait plus d'un écran de haut. Les étiquettes min et max chevauchent la courbe. | `pc1280-light-small-stats.png`, `pc1280-light-small-stats-s1.png`. | Hauteur fixe (par exemple 180 à 220 px) et `preserveAspectRatio="none"` pour le tracé ; textes en HTML ou en `vector-effect`. Ou bien `valChartHtml(h, largeur réelle)`, comme sur l'accueil d'ordinateur. | moyen (PC) | S |
| A4 | **Bandeau « N cartes sans langue » faux dans un emplacement ou avec un filtre.** `collNoLangHtml(v)` (`collection.js:1200` et `1444`) compte toute la collection. | Rangement › Classeur rouge (2 cartes, toutes deux avec une langue) : le bandeau dit « 1 carte sans langue → Français ». Le bouton change Llanowar Elves, qui n'est pas affichée. Capture : `i393-light-small-emplacement.png`. | Compter et appliquer seulement les cartes affichées (`plcShownLines`), ou masquer le bandeau quand un emplacement ou un filtre est actif. | moyen (action invisible sur d'autres cartes) | S |
| A5 | **Textes d'import et de migration périmés ou faux.** (1) La feuille Importer (`collection.js:1495`) dit « Les quantités d'une même carte (éditions différentes) s'additionnent », alors que les éditions sont gardées quand le fichier a un numéro de collection. (2) Le guide dans l'appli (`switch.js:36-40`) et la page publique (`pwa/passer-de-manabox.html:123-127`) disent « Le foil et l'état : pas encore » et « Les classeurs… ne sont pas importés ». Or foil, état et classeurs ManaBox (devenus emplacements) sont importés depuis le 15 octobre (vérifié : `func.mjs`, aperçu « 2 classeurs rangés en emplacements »). | — | Remettre les textes à jour. C'est un argument de migration perdu sur une page publique référencée. | fort (acquisition) | S |
| A6 | **« Remplacer ma collection » sans confirmation.** `go.onclick` (`collection.js:1533`) remplace aussitôt ; seul un toast « Annuler » de quelques secondes permet de revenir en arrière (le « coup d'œil » aussi, mais seulement à partir de 10 cartes). | — | Feuille de confirmation « Remplacer 2 400 cartes par 1 980 ? » (même modèle que « Retirer… »). | fort si erreur | S |
| A7 | **Réimporter le même fichier double toutes les quantités, sans avertissement.** | Aller-retour export CSV puis import en mode « Ajouter » (par défaut) : 1 → 2, 2 → 4, et les emplacements sont perdus sur les nouvelles lignes (`func.mjs`, `log.txt`). C'est le cas typique de qui réexporte ManaBox pour mettre à jour. | Détecter quand 80 % ou plus des lignes existent déjà à quantité égale : « Ce fichier semble déjà importé : Ajouter quand même / Mettre à jour les quantités ». Ajouter un 3e mode **« Synchroniser »** : quantités du fichier, sans toucher aux emplacements. | fort | M |
| A8 | **Page d'une extension : « × N » compte toutes les impressions.** `setvTile` (`setview.js:117`) utilise `collQty(x.k)`. Une Sol Ring CMM affiche « × 5 » alors qu'on n'a qu'un exemplaire CMM 400. Le masterset, lui, compte l'impression exacte. | — | Afficher « × 1 ici · 5 en tout », ou compter seulement l'impression exacte (`collEdQty`). | faible | S |
| A9 | **Rangement : « 5 cartes » désigne en fait des exemplaires.** `plcTabHtml` (`places.js:166`) : Classeur rouge « 5 cartes » pour 2 cartes et 5 exemplaires. L'en-tête de la collection dit pourtant « 9 cartes · 19 exemplaires ». | `i393-light-small-rangement.png`. | « 2 cartes · 5 exemplaires · 11,00 € », ou « 5 exemplaires ». | faible | S |
| A10 | **Le focus à l'ouverture tombe sur le titre, pas sur l'onglet.** Le sélecteur de `collection.js:1344` (`'.dk-tab[aria-current], #collSeg [aria-checked="true"], .coll-tools .icon-btn, .dv-title'`) suit l'ordre du document : `.dv-title` passe en premier. Un contour de focus entoure « Ma collection » sur toutes les captures (à confirmer sur un vrai téléphone). | `pc1890-light-small-cartes.png`. | Chercher les candidats un par un, dans l'ordre voulu. | faible (a11y) | S |
| A11 | Le filtre d'emplacement reste actif après fermeture puis réouverture de la collection (`COLL.place` n'est jamais remis à zéro). Le bandeau le montre, mais la liste « disparaît » à moitié sans qu'on comprenne pourquoi. | — | Remettre à zéro à la fermeture, ou mémoriser volontairement (avec une pastille dans l'onglet). | faible | S |
| A12 | Valeur arrondie (« 29 € » dans la carte du haut) et valeur exacte (« 29,15 € » dans Stats), côte à côte. | `i393-light-small-stats.png`. | Même format partout dans la collection. | faible | S |

Hors domaine, à signaler au propriétaire de menus-e2e : dans `tests/menus-e2e.mjs`, `initFn`, l'écriture de l'historique de valeur est dans un commentaire (`// centimes … localStorage.setItem(...)`). Les captures « Stats » de menus-e2e n'ont donc jamais de courbe.

## (b) UI / UX

| # | Constat | Proposition | Impact | Effort |
|---|---|---|---|---|
| B1 | **Densité de la liste sur téléphone.** À 393 px, la première carte commence à y = 470 (55 % de l'écran pour l'en-tête, la valeur, le bandeau, les onglets, la recherche, le tri et le bandeau de langue) : 3 cartes visibles. À 360 px, une carte prend environ 130 px (drapeau seul sur sa ligne, une étiquette par ligne) : 2 cartes visibles (`a360-light-small-cartes.png`). Avec 5 000 cartes, c'est rédhibitoire face à ManaBox (8 à 10 lignes). | (1) Replier la carte de valeur et la barre de recherche dans un en-tête qui se réduit au défilement. (2) Une **vue compacte** au choix (une ligne de 56 px : vignette, nom, drapeau, édition, prix, quantité ; étiquettes Coût et Famille masquées, elles sont déjà dans les filtres). (3) Une **vue grille d'images** (3 ou 4 par ligne, comme le masterset). | fort | M |
| B2 | **Cibles tactiles < 44 px** (393 px) : « − / + » de quantité 30×36, puce langue 35×20, étiquettes « Ranger » ou emplacement 20 px de haut, boutons d'en-tête 36×36, € 36×36, point de synchro 9×9 (zone agrandie), « Trier » 28×32. | Passer les boutons de quantité à 40×44, la puce langue et les étiquettes cliquables à 32 px avec une zone de toucher élargie (`::before`). | moyen | S |
| B3 | **Le « − » demande une confirmation à chaque fois.** Retirer 3 exemplaires = 6 gestes. | Confirmer seulement au dernier exemplaire ; sinon toast « Annuler ». Appui long ou toucher le chiffre : saisie directe de la quantité (aujourd'hui impossible ; 40 Forêts = 40 « + »). | moyen | S |
| B4 | **Aucune fiche de carte.** Toucher le nom ne fait rien ; seule la vignette ouvre une image. La carte en grand montre l'image, la langue, « N exemplaires · réf. Cardmarket », Liste de souhaits, Illustrations, Ranger. Il n'y a ni +/−, ni lignes par langue et édition, ni prix CT, ni courbe de prix, ni texte, ni alerte de prix. | Une **fiche carte** (toucher la ligne) : exemplaires par langue, édition, foil et emplacement avec +/− ; prix CM et CT ; mini-courbe ; decks qui l'utilisent ; « Suivre le prix » ; texte Oracle et légalités (voir concurrence n° 1). | fort | M |
| B5 | **Bulk** : pas de sélection multiple dans la liste (ranger, changer de langue, d'édition, retirer, mettre en échange). « Ranger ces cartes… » passe par un emplacement filtré, donc on ne le trouve pas. | Mode sélection (appui long, ou cases à cocher sur PC) avec une barre d'actions. | moyen | M |
| B6 | **Ordinateur** : la liste est en 2 colonnes, limitée à environ 1 070 px et centrée, alors que l'en-tête occupe toute la largeur (titre à gauche, icônes collées à droite : `pc1890-light-small-cartes.png`). Il n'y a pas de vue tableau (colonnes triables : nom, extension, n°, langue, foil, état, emplacement, prix, quantité), pas de raccourcis clavier. Masterset à 4 par ligne par défaut à 1 890 px : cartes de 260 px (`pc1890-light-small-masterset.png`). Stats sur une seule colonne. | Vue tableau sur PC (type Moxfield), en-tête aligné sur la colonne de contenu, masterset « auto » (largeur minimale de 140 px), Stats en tableau de bord à 2 colonnes. Dans « Ajouter des cartes » : Entrée choisit la carte puis Entrée l'ajoute. | moyen (PC) | M |
| B7 | **Icônes Importer / Exporter ambiguës** : flèche vers le bas pour importer, vers le haut pour exporter, sans libellé (titre au survol seulement). Sur une collection vide, Exporter reste affiché et répond par un toast. | Un seul bouton « ⋯ » avec un menu libellé (Ajouter, Importer, Exporter, Prix réels, Partager en image), ou des libellés sur PC. Masquer Exporter quand la collection est vide. | moyen | S |
| B8 | **Stats ignorent le filtre et l'emplacement** (`collStatsHtml(all)`, `collection.js:1190`). On ne peut pas voir la valeur ni la répartition d'un classeur, d'une extension ou d'une couleur. | Stats sur les cartes affichées, avec une pastille « Classeur rouge · 2 cartes » et × pour revenir au total. | moyen | S |
| B9 | Étiquette « Ranger » en pointillés sur **chaque** ligne non rangée dès qu'un seul emplacement existe : beaucoup de bruit avec 5 000 cartes. | La garder seulement dans l'onglet ou l'emplacement « Non rangé », ou au survol sur PC. | faible | S |
| B10 | **Import** : le mode Ajouter / Remplacer est en bas de la feuille, sous le pli. L'aperçu dit « Fichier CSV » sans nommer le format reconnu ni ce qui est gardé. | Mode en haut. Aperçu riche : « Format ManaBox · 1 980 cartes · 312 foil · 27 éditions · 3 classeurs → emplacements · état gardé · prix d'achat ignorés ». | moyen | S |
| B11 | Le filtre « Commander » est en tête du panneau Filtres, avant Couleur ; pour une collection, couleur et famille servent plus souvent. | Ordre Couleur, Famille, Coût, Extension, puis Commander. | faible | S |
| B12 | Courbe de valeur : ni survol ni toucher sur un point (valeur à une date), pas de période au choix (30 j, 90 j, 1 an, tout). | Repère au toucher et sélecteur de période. | faible | S |

## (c) Fonctionnalités à améliorer

| # | Constat | Proposition | Impact | Effort |
|---|---|---|---|---|
| C1 | **Recherche limitée au nom** (`filterItems`, `core.js:1349`). Filtres : couleur (OU), une seule famille, un seul coût, extension, Commander. Il n'y a ni rareté, ni langue, ni foil, ni état, ni emplacement, ni fourchette de prix, ni « doublons (q ≥ 2) », ni « dans un deck », ni texte ou type. Taper « cmm » ou « elfe » ne trouve rien. | (1) Filtres Langue, Foil, Rareté (champ Scryfall `rarity` à garder dans `COLL.meta`), Prix min et max, Doublons, Emplacement, « Dans un deck monté ». (2) Plusieurs familles à la fois. (3) Mini-syntaxe façon Scryfall dans le champ : `t:elf`, `e:cmm`, `r:mythic`, `lang:fr`, `is:foil`, `usd>5`, `q>1`. Les données sont déjà sur l'appareil (`tl`, `cm`, `cl`, `eds`, langue et foil des lignes). | fort | M |
| C2 | **Export pauvre et non réversible.** CSV Moxfield seulement (`core.js:1195`) : emplacement, signée, altérée, erreur d'impression, prix, proxys et date d'ajout sont perdus. L'export texte regroupe les emplacements. Toujours toute la collection, jamais la vue filtrée. Vérifié : export puis réimport = emplacements perdus. | (1) **Sauvegarde Mana Orbit complète** (le texte interne `collToText(…, true)` avec `//@L`, `//@P`, détails et dates), réimportable sans perte. (2) Formats ManaBox (`Binder Name`), Deckbox, Archidekt, CSV de prix (pour l'assurance, avec les prix CM et CT). (3) « Exporter les cartes affichées » (emplacement ou filtre). | fort | S à M |
| C3 | **Import incomplet** (`core.js:1133-1160`) : Dragon Shield `Folder Name` n'est pas converti en emplacements (ManaBox seul) ; Moxfield `Proxy=True` n'entre pas dans Mes proxys ; `Alter` et `Misprint` (ManaBox, Moxfield) sont ignorés alors que l'appli a altérée et erreur d'impression ; `Trade Quantity` est ignoré ; `Purchase price`, `Price Bought` et `Date Bought` sont jetés. | Brancher ces colonnes sur l'existant ; garder le prix d'achat dès maintenant (même sans interface) pour C5. | moyen | S |
| C4 | **Historique de prix par carte : 7 à 14 jours, sur l'appareil seulement** (IndexedDB `coll:base`). Il n'y a pas de courbe par carte. | Courbe de 30 à 90 jours par carte depuis le relevé serveur (déjà fait pour les alertes : 12 relevés par carte côté `.data/alerts.json`), dans la fiche carte (B4). Dragon Shield affiche 30 jours. | moyen | M |
| C5 | **Prix d'achat et plus-value** : écarté le 15 octobre (« pas sûr », `docs/a-faire.md:79`, `:224`). Moxfield, Collectr et MTGGoldfish l'ont. Les données arrivent déjà : prix d'achat ManaBox et Dragon Shield, « J'ai acheté » CardTrader, prix payé de la session d'ouverture. | Facultatif et replié dans « Détails » de l'exemplaire ; tuile Stats « Payé 812 € · vaut 1 034 € · +222 € » seulement si au moins un prix est connu (respecte « rien ne s'affiche tant qu'on ne s'en sert pas »). | moyen | M |
| C6 | **Alertes de prix seulement à la baisse, seulement pour les cartes qui manquent.** On ne peut pas suivre une carte qu'on possède depuis la carte en grand (`alWatchBtn` n'existe que dans les feuilles d'offres, `app.js:864-899`). La bannière locale « prix ont bougé » n'existe que dans l'appli. | « Suivre le prix » dans la fiche carte ; alertes **à la hausse** sur les cartes possédées (« ta Sheoldred +40 % : c'est le moment de l'échanger ou de la vendre ») ; seuil sur la valeur d'un emplacement « À vendre ». | moyen | S à M |
| C7 | **Masterset** : partage de la progression en image (déjà prévu, `a-faire.md:78`) ; pas d'accès depuis la page d'une extension, et la page d'extension n'est accessible que depuis l'accueil (sorties à venir). | Unifier : une seule page « Extension » (cartes, × possédées exactes, progression, Masterset) ouverte depuis le filtre Extension, le tri Édition, l'accueil et le masterset. | moyen | M |
| C8 | Perf de la recherche avec 5 000 cartes : chaque frappe renormalise 3 noms × 5 000 (`normPart` dans `filterItems`) puis repeint (mesure hors bridage ≈ 270 ms au-delà du délai de 120 ms ; tri Édition ≈ 480 ms ; ouverture ≈ 1,2 s). | Garder les noms normalisés dans `collAll()` (une fois par version) ; virtualiser la liste au-delà de 1 000 lignes. | moyen (grosses collections) | S |

## (d) Nouvelles fonctionnalités (classées par valeur)

| # | Idée | Référence | Impact | Effort |
|---|---|---|---|---|
| D1 | **Fiche carte complète** (B4 + Oracle FR et EN, légalités, rulings, prix CM, CT et foil, courbe 30 à 90 j, exemplaires détaillés, decks, échange, suivre le prix). | ManaBox, Dragon Shield, Delver Lens (concurrence n° 1) | fort | M |
| D2 | **Recherche avancée** (C1) avec recherches enregistrées (« Mythiques FR non rangées », « Doublons > 2 € »). | Moxfield, Delver Lens, Scryfall | fort | M |
| D3 | **Étiquettes (tags) libres par carte ou par exemplaire** (« à grader », « pour cube », « prêtée à Léo »), filtrables et exportées (colonne `Tags` de Moxfield). Les emplacements couvrent le « où », pas le « pourquoi ». | Moxfield | moyen | M |
| D4 | **Plus-value et tableau de bord « portefeuille »** (C5) : payé ou vaut, meilleures et pires plus-values, valeur par emplacement et par extension dans le temps. | Collectr, MTGGoldfish | moyen | M |
| D5 | **Vue grille et vue tableau** de la collection (B1, B6), plus la sélection multiple (B5). | ManaBox (grille), Moxfield (tableau) | moyen | M |
| D6 | **Liste « À vendre »** : un emplacement de type « À vendre » existe déjà. Y ajouter la valeur CM et CT, le prix net après frais, l'export en stock Cardmarket ou CardTrader, et une alerte de hausse. | Delver Lens (Card Kingdom), concurrence n° 15 | moyen | M |
| D7 | **Prêts** : « prêtée à … » avec date, rappel, et « mes cartes chez les autres » (complète les amis et les decks montés). | (aucun concurrent) | faible à moyen | S |
| D8 | **Wishlist dans la collection** : aujourd'hui « Je recherche » vit dans Échange. Ajouter un filtre « Souhaitées » (et leur prix total) dans Ma collection, et des alertes de baisse automatiques sur les souhaits. | Moxfield, Dragon Shield, Deckbox | faible à moyen | S |
| D9 | **Statistiques de collection plus riches** : par extension (top 10 en valeur), par rareté, par langue, par emplacement, « cartes jamais dans un deck », les 10 plus fortes hausses et baisses du mois (Dragon Shield). | Dragon Shield, Collectr | faible à moyen | S |
| D10 | **Scellé et gradées** : hors cible joueur (concurrence n° 24), à ne pas faire maintenant. | Collectr | faible | M |

---

## Perf : 5 000 cartes (`perf.mjs`, `perf-5000-*.png`)

- **Sans bridage du processeur**, machine chargée (charge d'environ 10 sur 4 cœurs), en ms :

  | Geste | ms |
  |---|---|
  | Ouverture de la collection | 1 221 |
  | Recherche « sol » (délai de 120 ms compris) | 393 |
  | Effacer la recherche | 109 |
  | Filtre couleur | 117 |
  | Filtre famille | 28 |
  | Tri prix | 151 |
  | Tri édition | 476 |
  | Tri date | 239 |
  | « Afficher plus » | 90 |
  | « + » | 139 |
  | Stats | 180 |
  | Rangement | 110 |
  | Ouvrir un emplacement | 159 |
  | Fiche Extension | 179 |
  | Export CSV (250 Ko) | 179 |
  | Aperçu d'import de 5 000 lignes | 781 |
  | Masterset | 80 |

- **Avec bridage ×4** (consigne de perf-e2e) et une charge de 40 à 48, tout est 10 à 20 fois plus lent : ouverture 20 s, frappe 2,7 s. Même la collection du test officiel s'ouvre en 3,6 s contre 1,2 s au budget. **Ces chiffres ne sont pas exploitables** : il faut relancer `tests/perf-e2e.mjs` sur une machine au repos.
- Ce qui ressort en relatif : ouverture, frappe dans la recherche, tri Édition et aperçu d'import sont les gestes les plus coûteux (C8). La lecture « Images dans la langue des cartes » de 3 333 cartes (lots de 12) occupe Scryfall longtemps, mais l'écran reste utilisable.
- Stockage : texte de la collection de 190 Ko dans `localStorage` pour 5 000 cartes, ce qui laisse de la marge.

## Comparaison rapide

| Point | Mana Orbit | Références |
|---|---|---|
| Historique de prix par carte | 7 à 14 j local, pas de courbe | Dragon Shield 30 j, Collectr 5 ans |
| Prix d'achat et plus-value | non | Moxfield, Collectr, MTGGoldfish |
| Wishlist | oui (Échange › Je recherche, masterset « Souhaiter ») | partout |
| Tags | non | Moxfield |
| Recherche avancée | nom seul et 5 filtres | Scryfall, Moxfield, Delver Lens |
| Exports | CSV Moxfield et texte, avec pertes | Moxfield et ManaBox : plusieurs formats |
| Emplacements, decks montés, « À aller chercher », masterset, proxys à part, éditions et langues par ligne, synchro fusionnée hors ligne | oui | MO en avance |

## Points forts constatés

- Import ManaBox réellement fidèle : classeurs → emplacements, listes de souhaits écartées et annoncées, état et foil gardés, noms inconnus signalés avant l'import et corrigeables après (`i393-light-small-inconnus.png`).
- Confirmations et « Annuler » presque partout.
- Clair et sombre propres, sans débordement de 360 à 1 890 px, aucune erreur JavaScript.
- Feuille d'édition (foil compté, « Répartir entre plusieurs éditions ») et masterset (⚠ « C'est celle-ci : poser l'édition ») : rien d'équivalent chez les concurrents.
- Image à partager de la collection soignée (`i393-light-small-partage-image.png`).
