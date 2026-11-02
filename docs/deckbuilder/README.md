# Assistant de deck Commander (« coach ») : architecture

Fonctionnalité **en test** depuis le 2 novembre 2026 : invisible tant qu'elle n'est pas allumée dans **Compte et réglages › Préférences › Fonctionnalités en test** (compte de l'éditeur seulement, `src/labs.js`), et seulement jusqu'au prochain démarrage de l'appli.

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

3. **Générer le deck** (Coach, ou option de l'assistant) : complète jusqu'à 100 cartes (cartes présentes gardées) : rôles jusqu'aux cibles, plan du commandant, terrains (Karsten, non-base les plus joués jusqu'à un tiers, base selon les symboles), places restantes pour le plan ; budget réparti sur les places restantes (`BD.pace`) ; annulable (`deckwiz.js` › `dwAutoBuild`).
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

`dkw.json.gz` : `{ v: 1, at, roles, combos: [[carte A, carte B, résultat, étiquette Spellbook]], cards: [[nom, identité, coût, types (bits), rôles (bits), prix € (centimes), drapeaux (1 Game Changer · 2 tour supplémentaire · 4 destruction massive de terrains · 8 tuteur), couleurs produites, rang EDHREC]], tg: { all, recent, br: {1..5}, th: {thème}, nc: {couleurs} }, cmd: { slug: { n, land, curve, br, thl, cards: [[nom, inclusion %, synergie %]], th: { thème: { n, land, cards } }, nd, xc: [[nom, % des decks Archidekt]], tg } }, themes: { slug: { n, cards, cmds } }, src }` ; statistiques : `{ n, <rôle | mv | cheap | gc>: [p25, médiane, p75] }`.

Lancement manuel : GitHub › Actions › **Base du coach** › Run workflow (budget en minutes). En local : `NODE_USE_ENV_PROXY=1 DECKDB_MIN=10 DECKDB_CMDS=12 DECKDB_SMALL=1 node gen-deckdb.mjs deckdb-out` (voir l'en-tête du fichier pour les variables).

## Limites connues (à suivre pendant le test)

- Combos : seulement ceux à 2 cartes nommées (sans pièce « n'importe quelle créature »), les 4 000 plus joués de Commander Spellbook.
- Moxfield refuse les robots : corpus Archidekt + EDHREC seulement.
- Prix : marché de l'appli si la carte est connue (fiche), sinon prix Cardmarket de la base (marché européen seulement).
- Le premier passage ne couvre qu'une partie des commandants (budget de temps) ; la couverture se complète nuit après nuit.
