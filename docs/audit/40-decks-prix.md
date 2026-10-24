# Audit Mana Orbit : Decks et prix

*24 octobre 2026. Branche `claude/magic-app-audit-6rdtm4`, aucun fichier du dépôt modifié.*

**Périmètre.** Section Decks : Mes decks, À monter (EDHREC, Archidekt, Communauté), Prix d'une liste. Couvre aussi l'éditeur de deck, le viewer, la main de départ, le partage, la publication, « À aller chercher », les achats (« J'ai acheté »), les alertes de prix et les notifications.

**Méthode.** Monde de test (`tests/e2e-world.mjs` : faux CardTrader et faux Scryfall, faux `edh.tsv`, compte simulé), ports 19560 à 19569.
- **Appareils** : 360×780 et 393×852 (tactile), 1280×800 et 1890×900 (souris), chacun en clair et en sombre.
- **Scripts** (`$SCRATCH/decks/js/`) :
  - `tour.mjs` : 20 écrans × 8 combinaisons, avec les contrôles de `menus-e2e`.
  - `prix.mjs` : saisie, recherche, vendeurs, livraison, panier, arrêt, hors ligne, Cardmarket, liste de 254 cartes.
  - `deck.mjs` : création, éditeur, viewer, zoom, partage, publication.
  - `misc.mjs` : À monter, achats, alertes, notifications.
  - Autres : `hand.mjs`, `parse.mjs`, `comm.mjs`, `offline.mjs`, `perf.mjs`.
- **Captures** : `$SCRATCH/decks/shots/<appareil>-<thème>/`, `prix-*`, `deck-*`, `misc-*`, `hand/`, `comm/`, `offline/`.

**Bilan rapide.**
- **Ce qui marche** :
  - aucune erreur JS ni console sur tous les parcours ;
  - aucun débordement horizontal sur les 8 combinaisons ;
  - le thème sombre est cohérent ;
  - c'est rapide : `openDecks` avec 40 decks prend 2 ms, le viewer de 100 cartes 46 ms, l'éditeur 49 ms.
- **Points forts** (en avance sur la concurrence) :
  - À monter : possédées, à acheter, coût, tier, Game Changers, « Chercher par carte » ;
  - probabilités de terrains de la main de départ ;
  - « À aller chercher » par emplacement ;
  - panier CardTrader ;
  - Wants list Cardmarket découpée par 150 lignes ;
  - « J'ai acheté ».
- **Faiblesses** :
  - les règles du jeu : sections d'import, bannies, cartes « en nombre quelconque », formats ;
  - quelques libellés trompeurs : « Ouvrir », « Modifier la liste », « Chercher les manquantes » ;
  - la mise en page sur ordinateur, en une seule colonne ;
  - il manque les standards des builders : texte Oracle, export Arena, mulligan, statistiques de couleurs.

---

## (a) Bugs

| # | Constat (repro · preuve) | Proposition | Impact | Effort |
|---|---|---|---|---|
| A1 | **Les sections d'un export ne sont pas lues par `parseDeck`**. Le Maybeboard, le Considering et les Tokens d'un export Moxfield ou Archidekt sont comptés, chiffrés et cherchés. La section « Sideboard » est chiffrée, alors que les lignes `SB:` ne le sont pas. Seul `dkParse` (éditeur) saute le maybeboard. Repro : `Deck\n1 Sol Ring\n\nMaybeboard\n1 Arcane Signet` donne 2 cartes à chercher (`parse.mjs`). Code : `core.js:173-195` contre `core.js:897`. | Suivre la section courante dans `parseDeck`. Ignorer maybeboard, considering et tokens. Traiter sideboard et companion comme `SB:`, ou les proposer en option « inclure la réserve ». | Fort (achat de cartes en trop, compteurs faux dans Mes decks) | S |
| A2 | **L'éditeur refuse les cartes « en nombre quelconque »** : Relentless Rats, Shadowborn Apostle, Persistent Petitioners, Rat Colony, Dragon's Approach, Slime Against Humanity, Hare Apparent. Seven Dwarves et Nazgûl ont aussi leur plafond propre (7 et 9). `bdChange` affiche « un seul exemplaire » (`builder.js:157`), `dkCheck` marque « bad » (`core.js:939`), et le scan vers un deck refuse aussi. | Lire `oracle_text` (« A deck can have any number of cards named » / « up to seven ») dans la fiche Scryfall déjà chargée, et appliquer l'exception dans `bdChange` et `dkCheck`. | Moyen (decks thématiques impossibles) | S |
| A3 | **La fiche d'une carte possédée dans les résultats** affiche « Aucune offre ne correspond à tes critères » avec un gros bouton **Chercher en anglais**. Repro : liste où Edgar est possédé › recherche › toucher la ligne Edgar. Capture `shots/prix-i393-light/08-fiche-carte.png`. Code : `app.js:870` (cas `need0 === 0` non traité). | Pour une carte entière possédée : « Dans ta collection (emplacement…) », bouton « Chercher quand même », et l'image en grand. | Moyen | S |
| A4 | **« Toutes possédées » et « 54 manquantes » se contredisent** pour le même deck. L'en-tête du viewer ignore les terrains de base (`viewer.js:478`), alors que « À aller chercher » les compte (`places.js:365`). Capture `shots/deck-i393-light/17-aller-chercher.png` (« 100 cartes · toutes possédées » derrière « 46 / 100 possédées · 54 manquantes »). | Une seule règle. Proposé : « toutes possédées (hors 31 terrains de base) » dans le viewer, et les terrains de base repliés dans « À aller chercher ». | Moyen | S |
| A5 | **Publier dans la communauté ne vérifie que 100 cartes, le commandant, les vraies cartes et les mots refusés** (`pubdecks.js:115-124`). Un deck de 100 cartes avec 4 Sol Ring ou des cartes hors identité part dans « À monter » chez tout le monde. | Réutiliser `dkCheck` (copies, identité de couleur) côté appli et serveur (`pubClean`). Bloquer ce qui est « bad ». | Moyen (qualité de la communauté) | S |
| A6 | **Échec réseau d'une recherche** (`app.js:538-539`, capture `prix-i393-light/13-hors-ligne.png`) : 4 défauts. | Erreur dans la carte de progression, bouton **Réessayer** (relance `startRun`), arrêt des spinners, message du proxy local réservé au mode dev. | Moyen | S |
| | 1. L'action proposée est « Réglages » au lieu de « Réessayer ». | | | |
| | 2. Hors proxy, le joueur lit « Lance le proxy local (node proxy.mjs)… localhost:8787 ». | | | |
| | 3. L'étape « Offres en français » tourne encore, et « Démarrage… » reste figé sous « Recherche interrompue ». | | | |
| | 4. Le message est sous le dock, hors de l'écran à 393 px. | | | |
| A7 | **« Chercher les manquantes »** (bouton principal de la feuille d'un deck EDHREC) **ne lance rien** : il charge le deck dans Prix d'une liste, et il faut toucher « Chercher les offres » (`edh.js:490`, `495-499`). Capture `misc-i393-light/06-manquantes-lancees.png`. | Lancer `startRun()` après `putDeckText`, ou renommer le bouton « Préparer la recherche ». | Moyen | S |
| A8 | **« Exemple » et « Vider » écrasent la liste collée** sans confirmation ni annulation (`app.js:1318-1319`). Le Ctrl+Z natif ne marche pas, car la valeur est posée par le script. Les deux boutons sont collés à « Coller » et « Enregistrer ». | Toast « Liste vidée · Annuler », avec l'ancien texte gardé. « Exemple » demande confirmation si la zone n'est pas vide. | Moyen (une liste de 100 cartes perdue) | S |
| A9 | **Format incohérent d'une liste collée sans en-tête** : le viewer la traite en Commander (Edgar en commandant, `commandersOf`). Mes decks n'affiche pas de format, le filtre « Commander » l'exclut et « Publier » est absent (`dkFmtOf`, `core.js:830`). Captures `i393-light/08-viewer-import.png` et `01-mes-decks.png`. | Une seule détection : `dkFmtOf` reprend la règle du viewer (1re carte légendaire et ~100 cartes), ou propose « C'est un deck Commander ? ». | Faible à moyen | S |
| A10 | **Les couleurs d'un deck ne viennent que des terrains de base** (`core.js:922`). Un deck Commander sans terrain de base n'a aucune couleur ; le deck « illégal » d'Edgar (RWB) s'affiche blanc seulement. Le filtre couleur de Mes decks se trompe. | Identité du commandant d'abord, sinon couleurs des cartes (meta `ci`, déjà en cache), sinon les terrains de base. | Moyen | S |
| A11 | **Liste avec beaucoup de noms inconnus : ~1,2 s par nom** (recherche exacte puis fuzzy, à 1,8 req/s : `data.js:51`, `191-199`). 250 noms inconnus : plus de 3 min, à 8 % (`prix-i393-light/17-longue.png`), avec « Démarrage… » figé. | Écarter d'abord les noms absents du catalogue (`/catalog/card-names` est déjà utilisé par `pubdecks`) et ne demander le fuzzy que pour les noms proches. Afficher « N noms à vérifier » tout de suite. | Faible à moyen | M |
| A12 | **Lecture des formats** (`parse.mjs`) : la réserve MTGO `.txt` (après une ligne vide, sans en-tête) est fusionnée au deck ; « 4 Lightning Bolt [M10] » garde « [M10] » dans le nom. | Lire `[SET]` comme édition. Option « la partie après la ligne vide est la réserve » pour les listes de 60 + 15. | Faible | S |
| A13 | **Messages techniques montrés au joueur** : 2 cas. | Messages joueur (« Tu es hors ligne : les decks EDHREC reviendront à la connexion »). Détail technique réservé à `/admin`. | Faible | S |
| | 1. À monter hors ligne : « le fichier edh.bin.gz n'est pas encore généré » (`edh.js:159`, `offline/a-monter.png`), et non « hors ligne ». | | | |
| | 2. Notifications : « Le serveur n'a pas de clés… VAPID_PUBLIC_KEY… » (`push.js:165`, `alerts.js:175`). | | | |
| A14 | **Libellés tronqués** : « Copier pour Car… » (dock Cardmarket, 360 et 393 px, `app.js:655`, `prix-a360-dark/15-cm-resultats.png`) ; « Monter le deck · range dans « Deck : Edgar arist… » (`deck-i393-light/17`). | « Copier (Cardmarket) », ou une icône et « Copier » ; sous-libellé sur 2 lignes. | Faible | S |
| A15 | **Feuille EDHREC** : « couleurs WBR » en lettres brutes (`edh.js:462`) au lieu des pastilles de mana utilisées partout ailleurs. | Utiliser `manaHtml`. | Faible | S |

## (b) UI/UX : menus et parcours

| # | Constat | Proposition | Impact | Effort |
|---|---|---|---|---|
| B1 | **Les verbes trompent** (`decks.js:347`, `viewer.js`). Voir le détail ci-dessous. | Un seul sens par verbe. « Modifier » ouvre toujours l'éditeur. « Chercher les prix » (ou « Voir dans Prix d'une liste ») charge la liste. « Ouvrir » ouvre le viewer. | Fort | S |
| | 1. Toucher un deck ouvre le viewer, mais **« Ouvrir »** dans sa feuille le charge dans Prix d'une liste. | | | |
| | 2. Le viewer a **« Modifier les cartes »** (éditeur) et **« Modifier la liste »** (pied de page, charge le texte dans Prix d'une liste). | | | |
| B2 | **Viewer : 8 actions au même niveau** : Partager (en-tête) ; À aller chercher, Modifier les cartes, Main de départ, Publier, Manquantes · Cardmarket (grille) ; Modifier la liste, Chercher les offres (pied). À 360 px, la grille passe sur 2 lignes par bouton (`a360-dark/05-viewer-edgar.png`). | Pied : « Chercher les offres » (principal) et « Main de départ ». Le reste dans un menu « ⋯ » ou une barre d'icônes avec libellés courts. | Moyen | S |
| B3 | **Mes decks est peu dense** : à 360 px, la 1re rangée commence à ~280 px (en-tête, onglets, « Synchronisé », format, 5 couleurs), avec des vignettes 2:3 de 240 px. On voit 2 decks par écran (`a360-dark/01-mes-decks.png`). | Statut de synchro dans l'en-tête ; format et couleurs sur une seule ligne de puces ; option « liste compacte » (vignette 48 px, nom, format, 41/100, valeur). | Moyen | S-M |
| B4 | **Ordinateur : le viewer et l'éditeur tiennent en une colonne** (~1 066 px max). À 1 890 px : tuiles de 140 px, bouton de pied large de 1 860 px, courbe en barres géantes. L'éditeur montre une carte par ligne de 80 px, soit ~8 000 px pour 100 cartes (`pc1890-light/05`, `pc1280-light/11`). | Deux colonnes à partir de 1 100 px : à gauche, résumé, courbe et actions collantes ; à droite, la grille de cartes (6 à 8 colonnes). Pour l'éditeur : liste du deck groupée par type à gauche, recherche et collection à droite (modèle Moxfield). | Fort sur PC | M |
| B5 | **En-tête incohérent dans la section Decks** : « Decks » et « + » sur Mes decks et À monter ; « Mana Orbit » et l'avatar sur Prix d'une liste (mobile) ; aucun titre sur PC (`pc1280-light/18`). | Même en-tête « Decks » (avec « + ») sur les 3 onglets. | Faible | S |
| B6 | **Résultats : la liste arrive tard**. À 360 px, total, récap, livraison et 2 alertes occupent ~600 px avant la 1re carte (`prix-a360-dark/04`). | Fusionner le récap dans le total (puces), replier les alertes en une ligne « 3 points à voir », coller les onglets Cartes et Vendeurs. | Moyen | S |
| B7 | **Nouveau deck** : Standard par défaut, alors que l'appli est tournée vers Commander. Un nom vide est accepté (« Nouveau deck »). | Commander par défaut, ou dernier format utilisé ; nom suggéré d'après le commandant. | Faible | S |
| B8 | **Éditeur › Chercher : nom anglais seulement**. « anneau » répond « Vérifie l'orthographe (nom anglais) », alors que la promesse est « en français ». | Brancher l'index des noms français (FRX) déjà utilisé par la saisie. | Moyen | S-M |
| B9 | **Cibles tactiles sous 40 px** (393 px). | Zone tactile de 44 px (`::after`, comme `.rx`). | Moyen | S |
| | 1. Liste des decks : « + » (34) ; « ⋯ » des decks (34) ; puces de couleur (38) ; « Synchronisé » (29). | | | |
| | 2. Éditeur : « − » et « + » (30×36). | | | |
| | 3. À monter : « Classer » et « Chercher par » (32 de haut) ; options des filtres (34). | | | |
| | 4. Prix d'une liste : Coller, Exemple, Vider, Enregistrer (30). | | | |
| B10 | **Supprimer un deck** : 2e toucher pour confirmer, mais aucun « Annuler » par toast (Dupliquer et « Ajouter à ma collection » en ont un). Le bouton est à côté d'« Ouvrir ». | Toast « Deck supprimé · Annuler » (10 s), ou corbeille. | Moyen | S |
| B11 | **À monter : jusqu'à 3 lignes par commandant** (Moyen, Archidekt, Communauté) qui se ressemblent. « prix inconnu » est en couleur de lien sans en être un (`pc1280-light/14`, `comm/`). | Regrouper par commandant (variantes dépliables) ; « prix inconnu » en gris. | Moyen | M |
| B12 | **Langues mélangées** : lignes de type en anglais (« Legendary Creature — Vampire Knight ») dans l'interface française ; terrains de base en français dans l'éditeur (« Plaine »), en anglais dans le viewer (« Forest ×20 »). | `printed_type_line` de Scryfall ; même nom de terrain de base partout. | Faible | S |

## (c) Fonctions à améliorer

| # | Constat | Proposition | Impact | Effort |
|---|---|---|---|---|
| C1 | **Légalité limitée** aux copies, à l'identité de couleur et à la taille. Aucune liste de bannies (Commander : Mana Crypt, Dockside, Jeweled Lotus…). Pas de légalité Standard : 4 Sol Ring et Craterhoof passent dans le deck « Standard » (`dkStd`). Partenaires : 2 commandants acceptés sans vérifier Partner, Background ou Friends forever (`builder.js:149`). | Utiliser `legalities` de Scryfall (déjà lu dans `canBeCommander`) : pastille « Légal · Commander » ou « 2 cartes interdites » sur le deck, dans l'éditeur et sur la carte. Vérifier les mots-clés de partenaire. | Fort | S-M |
| C2 | **Alertes de règles absentes du viewer et de Mes decks.** Un deck illégal ne se signale que dans l'éditeur (`i393-light/06` contre `12`). | Badge « ⚠ 3 problèmes » sur la carte du deck et dans le viewer, avec un lien vers l'éditeur. | Moyen | S |
| C3 | **Statistiques du viewer réduites à la courbe 0 à 7+.** | Ajouter couleurs des coûts face aux sources de mana, nombre de terrains, coût moyen, courbe empilée par type. Archidekt sert de référence. | Moyen | M |
| C4 | **Main de départ** : ni mulligan, ni pioche, et les terrains ne sont pas mis en avant. | Mulligan de Londres (repiocher, remettre N cartes dessous), « Piocher » tours 2 à 5, « au moins 1 X au tour N » (le moteur hypergéométrique est déjà là). | Moyen | M |
| C5 | **Partage** : lien et image seulement (`deck-i393-light/14-partager.png`) ; la seule façon d'exporter est « Modifier la liste ». | « Copier la liste » : Arena (`1 Sol Ring (CMM) 400`), MTGO, Moxfield ou texte, et `.txt`. | Moyen | S |
| C6 | **Carte en grand** : prix et illustrations seulement (`deck-i393-light/13-illustrations.png`). | Texte Oracle (et `printed_text` FR), légalités par format, rulings repliés. | Fort | S |
| C7 | **Notification « recherche terminée »** : elle ne s'active que dans Réglages › Notifications, alors qu'une recherche CardTrader peut durer 80 s. | Bouton « Me prévenir à la fin » dans la carte de progression quand le serveur lit les offres. | Moyen | S |
| C8 | **Bracket** limité aux decks EDHREC. | L'étendre à Mes decks, avec les Game Changers responsables. **Déjà prévu** (`a-faire.md:81`, « bracket d'un deck »). | Fort | S |
| C9 | **« J'ai acheté »** ajoute à la collection sans lien avec le deck d'origine. Pas de prix payé. | Proposer « Monter le deck X et ranger dans « Deck : X » » ; retenir le prix payé (déjà connu par l'offre). Le prix d'achat est noté « pas sûr » dans `a-faire.md:79`. | Moyen | S-M |
| C10 | **Éditeur** : pas de regroupement par type ni de courbe, et le maybeboard d'un import est jeté (README). | Groupes Créatures, Rituels, Terrains… avec compteurs ; mini-courbe dans le résumé ; zone « Peut-être ». | Moyen | M |
| C11 | **Recherche de l'éditeur** par nom seulement. | Filtres couleur, type, coût, texte, et champ « syntaxe Scryfall ». | Moyen | M |
| C12 | **Alertes de prix : baisse seulement.** | Hausse sur la collection, utile pour vendre ou échanger. | Faible | S |

## (d) Nouvelles fonctions (références : Moxfield, Archidekt, EDHREC, ManaBox, MTGGoldfish)

| # | Proposition | Référence | Impact | Effort |
|---|---|---|---|---|
| D1 | Formats Pauper, Modern, Pioneer, Duel Commander, Brawl et Oathbreaker (taille, copies, `legalities`). Les formats ne sont prévus que pour le mode organisateur (`a-faire.md:130`). | Moxfield, ManaBox | Fort (le Pauper et le Duel Commander sont populaires en France) | M |
| D2 | « Les cartes de ta collection qui iraient dans ce deck » : synergie EDHREC croisée avec la collection. Ce serait unique et gratuit. | EDHREC, Mythic+ | Fort | M |
| D3 | Combos repérés (API Commander Spellbook) dans le viewer, qui alimentent le bracket. | Archidekt, EDHREC | Moyen | M |
| D4 | Tags et catégories personnalisés, packages de cartes. | Moxfield, Archidekt | Moyen | M-L |
| D5 | Playtest « goldfish » (champ de bataille simple, tours, jetons). | Archidekt, ManaBox | Moyen | L |
| D6 | Comparer deux decks, ou deux versions d'un même deck (diff des cartes et de la valeur). | Archidekt | Faible | M |
| D7 | Proxys imprimables des manquantes (PDF 3×3, mention « proxy de test »). | Moxfield « Get Proxies » | Moyen | M |
| D8 | Prix en USD (TCGplayer) selon la région. | MTGGoldfish, ManaBox | Moyen hors UE | S |
| D9 | Taux de victoire par deck. **Déjà prévu** (`a-faire.md:72`). | Mythic Tools | Fort | S-M |

## Comparaison rapide (domaine Decks et prix)

| Point | Mana Orbit | Moxfield | Archidekt | EDHREC | ManaBox | MTGGoldfish |
|---|---|---|---|---|---|---|
| Formats | Standard, Commander | tous | tous | Commander | tous | tous |
| Légalité et bannies | copies et identité seulement | ✅ | ✅ | ❌ | ✅ | ✅ |
| Maybeboard, tags | ❌ (maybeboard même chiffré, A1) | ✅ | ✅ | ❌ | ? | ❌ |
| Statistiques | courbe | courbe et couleurs | très fines, probabilités | courbe | ✅ | ✅ |
| Main de départ, mulligan | probabilités ✅, mulligan ❌ | sans mulligan | playtester | ❌ | ✅ | ❌ |
| Recommandations, combos | ❌ | ❌ | EDHREC, Spellbook | ✅ | ? | ❌ |
| Export Arena, MTGO | ❌ (lien, image) | ✅ | ✅ | ❌ | ? | ✅ |
| Oracle et rulings sur la carte | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Decks à monter selon la collection | ✅ (le meilleur) | 🟡 | 🟡 | ❌ | ? | ✅ payant |
| Panier le moins cher, port compris | ✅ CardTrader | 🟡 Mana Pool | ❌ | ❌ | ❌ | ❌ |
| Historique de prix | par deck | ? | ? | ❌ | ? | par carte ✅ |

## Captures utiles (`$SCRATCH/decks/shots/`)

- **Bugs** :
  - `prix-i393-light/08-fiche-carte.png` (A3) ;
  - `deck-i393-light/17-aller-chercher.png` (A4) ;
  - `prix-i393-light/13-hors-ligne.png` (A6) ;
  - `misc-i393-light/06-manquantes-lancees.png` (A7) ;
  - `i393-light/08-viewer-import.png` (A9) ;
  - `prix-i393-light/17-longue.png` (A11) ;
  - `offline/a-monter.png` (A13) ;
  - `prix-a360-dark/15-cm-resultats.png` (A14).
- **UI** :
  - `a360-dark/01-mes-decks.png` (B3) ;
  - `a360-dark/05-viewer-edgar.png` (B2) ;
  - `pc1890-light/05-viewer-edgar.png` et `pc1280-light/11-builder-deck.png` (B4) ;
  - `pc1280-light/18-prix-liste.png` (B5) ;
  - `prix-a360-dark/04-resultats.png` (B6) ;
  - `pc1280-light/14-a-monter.png` et `comm/i393-light-a-monter.png` (B11).
- **Bonnes pratiques à garder** :
  - `i393-light/14-a-monter.png`, `misc-i393-light/03-a-monter-par-carte.png` ;
  - `hand/a360-dark-main.png` ;
  - `misc-i393-light/07-banniere-achat.png` ;
  - `prix-i393-light/09-panier.png`.

## Limites de l'audit

- Monde de test : images factices, pas de catalogue français (la recherche FR dans l'onglet Collection de l'éditeur est à revérifier en production), pas de clés VAPID ni de compte de service pour la communauté (simulée par une route).
- La notification « recherche terminée » et les alertes de prix n'ont été vues que dans leurs écrans. Le prix rapide au scan n'a pas été rejoué (c'est le domaine du scan).
- Une capture d'ordinateur a montré une fois le contenu décalé de ~110 px après un `scrollIntoView` piloté par script. Je ne l'ai pas reproduit avec les gestes d'un joueur, donc ce n'est pas compté comme bug.
