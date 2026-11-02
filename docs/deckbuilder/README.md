# Assistant de deck Commander (« coach ») : architecture

Pour tout le monde depuis le 2 novembre 2026 (d'abord fonctionnalité en test, `src/labs.js`, qui reste pour les prochaines). Dans l'aperçu d'un deck Commander, le bouton **Coach** (toute la ligne, en tête des actions) ouvre l'analyse : note, échanges conseillés, rapport et simulation de parties.

Recherche (Karsten, Command Zone, EDHREC, brackets Wizards, étiquettes du Tagger) : [`recherche.md`](recherche.md). Étiquettes Scryfall Tagger par rôle : [`tagger-tags.json`](tagger-tags.json) (référence ; la liste retenue, sans les racines trop larges, est dans `gen-deckdb.mjs` › `TAG_RULES` et `taggerRoles`).

## Ce que voit le joueur

1. **Mes decks › +** : nom et format, puis
   - **J'ai déjà ce deck** : *Scanner le deck* (le scan propose ensuite « Les prendre dans ma collection » / « Les ajouter » / « Seulement celles qui manquent », choisi d'office d'après la collection : rien en double), *Coller la liste* (Moxfield, Archidekt, MTGA… ; bloc `Commander` reconnu), *À la main* (éditeur habituel) ;
   - **Deck à construire** (Commander) : assistant en 2 étapes : commandant (recherche par nom, ou par style de jeu et couleurs, ceux de la collection en tête), puis nom, thèmes (3 au plus), bracket (1 à 5) et budget global du deck, « Priorité à ma collection ». L'éditeur s'ouvre sur l'onglet **Coach**.
2. **Onglet Coach** de l'éditeur (decks Commander, nouveaux ou existants) :
   - réglages (thèmes, bracket, budget, priorité collection), gardés par deck sur l'appareil (`localStorage` `deckdeal:dw:<id>`) ;
   - **jauges** : terrains, rampe, pioche, retraits ciblés, balayages, contresorts (si bleu), protection, tuteurs, récursion : compte du deck, cible et plage normale (quartiles) ; un appui ouvre les **suggestions** de ce rôle ;
   - **mana** : coût moyen, courbe, sources de chaque couleur face au besoin (Karsten) ;
   - **bracket** : Game Changers (0, 0, 3, illimité), destruction massive de terrains, tours supplémentaires, **combos à 2 cartes** (les 4 000 plus joués de Commander Spellbook, infinis ou gagnants : interdits en 1-2, pas avant le tour 6 en 3) ;
   - **budget** : valeur du deck face au plafond, part à acheter ; au-dessus, seules les cartes possédées sont proposées ;
   - **cartes clés du commandant** (inclusion et synergie EDHREC, thèmes choisis) ;
   - **Compléter avec des terrains de base** : jusqu'à la cible, répartis selon les symboles de mana.

3. **Générer le deck** (Coach, ou option de l'assistant) : complète jusqu'à 100 cartes (cartes présentes gardées) : conditions de victoire d'abord (même à petit budget), puis rôles jusqu'aux cibles, plan du commandant ; si la cible de terrains monte (deck plus cher en mana), les cartes ajoutées les moins utiles cèdent leur place ; terrains : Karsten, non-base les plus joués et ceux qui comblent les couleurs en manque (25 % à 60 % des terrains selon le nombre de couleurs, cherchés dans toutes les cartes jouées dans ces couleurs), base répartie d'abord vers les couleurs sous leur repère de sources (Wastes pour un commandant incolore) ; places restantes : plan, puis cartes très jouées dans les couleurs. Budget : une part gardée pour les terrains (4 % à 25 %), dépenses étalées sur les places restantes (`BD.pace`), la première condition de victoire passe avant ; annulable (`deckwiz.js` › `dwAutoBuild`).
   - **Construction en plusieurs passes** (`deckopt.js` › `dsBuild`, depuis le 2 novembre 2026) : fenêtre « Le coach construit ton deck » avec barre de progression et étapes (prix du jour, cartes conseillées, chaque version, vérification) ; deck vide : 4 versions (équilibrée, plus agressive, plus contrôle, moins chère ≈ 55 % de la valeur de l'équilibrée), chacune construite (`dwAutoBuild`) puis **améliorée** (`dsOptimize` : la carte ajoutée la plus faible est échangée contre la meilleure candidate tant que la note monte ; courbe trop haute : les gros sorts peu utiles cèdent la place à des sorts à 3 mana ou moins ; puis terrains de base contre terrains qui comblent une couleur en manque). Le joueur choisit sa version (note, valeur, coût moyen, terrains, rôles ; meilleure note signalée) ; fermer sans choisir garde l'équilibrée ; le style choisi (`wiz.arch` : aggro, control) règle ensuite les cibles du coach. Deck déjà commencé (« Compléter ») : une seule version, améliorée plus longtemps. Annulable. Environ 2 s pour les 4 versions.
   - **Note du coach** sur 100 (`dsScore`) : rôles 30 (de 0,75 au minimum à 1 à la cible, moins au-delà du maximum), mana 25 (terrains face à Karsten, sources de chaque couleur au carré du ratio face au repère), courbe 10, synergie 25 (qualité de chaque sort pour ce commandant : `dwVal`, ou sa popularité en Commander), règles et budget 10 (bracket, budget, 100 cartes). Pistes « Pour gagner des points » classées par gain. Affichée dans le Coach, l'analyse (avant → après les échanges cochés) et le rapport. Étalonnée sur les decks de l'appli : 129 decks Archidekt de joueurs, médiane 76 (p10 55, p90 88) ; 131 decks moyens EDHREC, médiane 87 ; decks générés (45 commandants × 4 versions, 177 decks) : médiane 96 (80 au moins), aucune anomalie (100 cartes, couleurs, doublons, cartes interdites, bracket, budget, terrains, condition de victoire).
   - **Simulation de 1 000 parties** (`decksim.js`, rapport du coach) : 8 tours joués seul, mulligan « London » (2 à 5 terrains), un terrain par tour (celui qui apporte une couleur qui manque), commandant dès que payable, rampe (source dès le tour suivant), puis les sorts les plus chers payables ; paiement par couleur (symbole hybride = générique). Résultats : mains de 7 gardées, commandant à temps, terrains manqués, mains bloquées par les couleurs au tour 4, mana utilisé, sorts lancés, cartes souvent bloquées, conseils. Graine fixe (même deck, mêmes résultats), par paquets de 100 (barre de progression), gardée pour le deck tant qu'il ne change pas.
   - **Entraînement** (depuis le 2 novembre 2026) :
     - *Corpus massif* : « Base du coach » tourne toutes les 6 h (passages de 5 h 20, dépôt public : Actions gratuites) ; après la première recherche de chaque commandant (40 decks), les pages suivantes des plus joués (10 pages de 60 au plus) : environ 15 000 decks Archidekt de plus par passage. Decks rangés à part (`decks-<n>.json.gz`, 60 000 par fichier) pour rester loin de la limite de 100 Mo de GitHub. File d'attente « archidekt » partagée avec « Commandants EDHREC » : jamais deux lectures d'Archidekt en même temps.
     - *Paires de cartes* (`pairsOf`) : cartes bien plus souvent dans les mêmes decks que le hasard (lift ≥ 3, 8 decks au moins ; ni terrains ni cartes présentes dans plus de 8 % des decks) ; 8 partenaires au plus par carte (`dkw.pairs`). Les suggestions remontent les cartes qui vont avec celles du deck (« va avec Exquisite Blood »).
     - *Banc d'essai et réglage automatique* (`bench-coach.mjs`) : 5 % des decks (identifiant % 20 = 7) ne servent jamais à apprendre ; pour chacun, 10 sorts retirés au hasard (graine fixe) puis les 40 premières suggestions du vrai code du coach (`src/deckwiz.js` chargé dans une vm) ; rappel à 10, 20 et 40 suggestions. Les poids de `dwVal` (synergie, decks Archidekt, popularité) et des paires sont réglés un par un sur la moitié des decks, entre le quart et 4 fois leur valeur d'origine, et gardés seulement s'ils font mieux sur l'autre moitié (`dkw.w`, `dkw.bench`, lus par l'appli ; le Coach affiche le résultat). Premier essai (15 544 decks, 726 au banc) : 29,2 % des cartes retirées retrouvées dans les 20 premières suggestions, 30,9 % après réglage.
   - Règles toujours appliquées aux suggestions : identité de couleur (duo de commandants : réunion des deux, `dwCiOf`), cartes interdites en Commander (drapeau 16), Game Changers du bracket, destruction massive de terrains (brackets 1-3), tours supplémentaires (1-2), **combos à 2 cartes en brackets 1-2** (la 2e carte d'un combo Commander Spellbook n'est jamais proposée).
   - Prix : relevé du jour de l'appli (`prices.tsv`, impression la moins chère, marché choisi : euros ou dollars), puis la fiche, puis la base. Un contresort n'est jamais compté comme retrait ciblé.
   - Vérifié le 2 novembre 2026 sur 240 decks générés avec la vraie base (90 + 150 commandants : les plus joués, au hasard, duos, incolores ; brackets 1 à 5 ; budgets de 25 € à 500 € ; 0,4 s par deck) : 100 cartes, aucune carte hors couleurs, doublon, carte interdite ni règle de bracket enfreinte, budget tenu, terrains dans la cible, au moins une condition de victoire ; sources de couleur au repère de Karsten à une demi-source près (3 decks sur 240). Seule exception : un commandant qui coûte presque tout le budget (Zhulodok 41,84 € pour 25 €) : deck incomplet, signalé dans l'assistant et la section Budget.
4. **Analyser** (`deckana.js`) : réglages d'abord (bracket visé = estimé, limite de prix, thèmes, collection), puis échanges conseillés ; vignettes agrandies au toucher (`zoom.js` › liste `da`).

## Cibles

- Plusieurs sources pondérées (médiane et quartiles des decks réels) : le commandant lui-même (≥ 8 decks, poids 3), chaque thème choisi (1,5), le bracket choisi (1,5), le nombre de couleurs (0,7), tous les decks récents (1). Sans la base : modèle de base `DW_BASE` (`src/deckwiz.js`), ajusté par bracket (`DW_BR_ADJ`).
- **Terrains** : formule de Frank Karsten `31,42 + 3,13 × coût moyen − 0,28 × (rampe + pioche de coût ≤ 2)`, sur le deck en cours dès 25 sorts, bornée par ce que jouent les decks semblables ; cEDH : − 3.
- Les rôles des decks du corpus sont calculés avec **le même classement** que les jauges : cibles et comptes parlent la même langue (une carte peut avoir plusieurs rôles ; un balayage n'est pas compté en retrait ciblé).

## Rôle de chaque carte (sans IA)

Par ordre de confiance (`gen-deckdb.mjs` › `cardRoles`) :
1. catégorie par défaut d'Archidekt (`oracleCard.defaultCategory` : Ramp, Draw, Removal, Protection, Recursion, Tutor, Finisher…) ;
2. étiquettes du **Scryfall Tagger** (`oracleCard.oTags` dans chaque deck Archidekt, et recherches `otag:` de Scryfall pour les cartes jamais vues dans un deck) ;
3. catégories écrites par les auteurs des decks (« Ramp & Reduction », « Board Wipes »…) : rôle retenu à partir de 30 % des decks qui catégorisent la carte (4 votes au moins) ;
4. texte de la carte (Scryfall), pour une carte qu'aucune autre source ne classe (nouvelle extension).

## Données

| Étape | Où | Quoi |
|---|---|---|
| `gen-deckdb.mjs` | GitHub Actions `deckdb.yml`, chaque nuit à 1 h 13 UTC, ~3 h | Scryfall (fichier oracle-cards, recherches Tagger), Commander Spellbook (combos à 2 cartes, chaque semaine), EDHREC (page de chaque commandant + ses 3 thèmes principaux, pages des thèmes généraux), Archidekt (1 000 decks les plus vus + 12 par commandant pour 1 500 commandants), incrémental |
| Branche **`deck-corpus`** | GitHub (un seul commit, réécrit) | `corpus.json.gz` (base brute : reste sur GitHub, jamais envoyée à l'appli), `dkw.json.gz` (agrégats), `log.txt` |
| `server/dkw-srv.mjs` | serveur (proxy) | relit `dkw.json.gz` au démarrage puis toutes les 6 h (ETag), copie dans `.data/` ; `GET /api/dkw` (cœur : table des cartes, cibles), `?c=<commandant>`, `?t=<thème>` ; gzip, ETag |
| `src/deckwiz.js` | appli | cœur gardé 1 jour (copie plus ancienne hors ligne), paquets commandant / thème 7 jours (`Cache`) |

`dkw.json.gz` : `{ v: 1, at, roles, combos: [[carte A, carte B, résultat, étiquette Spellbook]], cards: [[nom, identité, coût, types (bits), rôles (bits), prix € (centimes), drapeaux (1 Game Changer · 2 tour supplémentaire · 4 destruction massive de terrains · 8 tuteur · 16 interdite en Commander), couleurs produites, rang EDHREC, coût de mana]], tg: { all, recent, br: {1..5}, th: {thème}, nc: {couleurs} }, cmd: { slug: { n, land, curve, br, thl, cards: [[nom, inclusion %, synergie %]], th: { thème: { n, land, cards } }, nd, xc: [[nom, % des decks Archidekt]], tg } }, themes: { slug: { n, cards, cmds } }, src }` ; statistiques : `{ n, <rôle | mv | cheap | gc>: [p25, médiane, p75] }`.

Lancement manuel : GitHub › Actions › **Base du coach** › Run workflow (budget en minutes). En local : `NODE_USE_ENV_PROXY=1 DECKDB_MIN=10 DECKDB_CMDS=12 DECKDB_SMALL=1 node gen-deckdb.mjs deckdb-out` (voir l'en-tête du fichier pour les variables).

## Limites connues (à suivre pendant le test)

- Combos : seulement ceux à 2 cartes nommées (sans pièce « n'importe quelle créature »), les 4 000 plus joués de Commander Spellbook.
- Moxfield refuse les robots : corpus Archidekt + EDHREC seulement.
- Prix : marché de l'appli si la carte est connue (fiche), sinon prix Cardmarket de la base (marché européen seulement).
- Le premier passage ne couvre qu'une partie des commandants (budget de temps) ; la couverture se complète nuit après nuit.
