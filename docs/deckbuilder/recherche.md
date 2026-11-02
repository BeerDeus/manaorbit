# Coach de deck Commander : recherche chiffrée pour un algorithme sans IA

Recherche faite le 2 novembre 2026 pour Mana Orbit. Elle donne des cibles par catégorie (terrains, rampe, pioche, retraits ciblés, balayages, contresorts, tuteurs, protection, conditions de victoire…) et des règles de comptage utilisables directement dans le code. Elle se termine par la section 8, « Cibles recommandées pour l'algorithme ».

Fichier compagnon : `docs/deckbuilder/tagger-tags.json` (les tags Scryfall exacts par rôle, avec leurs totaux).

---

## 0. Comment lire ce document

### 0.1 Nature de chaque chiffre

Chaque chiffre est classé selon sa nature :

| Code | Nature | Exemple |
|---|---|---|
| **[M]** | Mathématiques ou simulation (modèle, hypothèses explicites) | Frank Karsten |
| **[D]** | Données observées (médianes de decks réels ou agrégés) | EDHREC, notre analyse de la section 3.5 |
| **[E]** | Avis d'experts (gabarits, règles empiriques) | The Command Zone, MTGGoldfish, Draftsim |
| **[O]** | Règle officielle | Wizards of the Coast (brackets) |

### 0.2 Niveau de vérification

- **VÉRIFIÉ** : lu dans le texte original ou dans les données brutes (JSON ou API) pendant cette recherche.
- **INDIRECT** : non lu directement, mais obtenu par extraits de l'article original indexés par le moteur de recherche. Ces extraits sont concordants entre plusieurs requêtes et vérifiés par recalcul quand c'est possible.
- **NON VÉRIFIÉ** : source secondaire seulement, ou contradictions non résolues.

### 0.3 Limite d'accès importante

Les articles de Frank Karsten sont aujourd'hui hébergés sur TCGplayer Infinite (`infinite.tcgplayer.com`, `www.tcgplayer.com/content/article/...`, anciens liens ChannelFireball redirigés).

- Ce sont des applications JavaScript. Le texte est chargé depuis `infinite-api.tcgplayer.com`, que le proxy de cette session refuse (HTTP 403).
- WebFetch ne résout pas `infinite.tcgplayer.com` ni `www.tcgplayer.com`.

Tous les chiffres Karsten ci-dessous sont donc **INDIRECTS** : extraits du texte original via l'index du moteur de recherche, avec plusieurs requêtes croisées et un recalcul des coefficients.

**Pour passer en VÉRIFIÉ**, il faut autoriser `infinite-api.tcgplayer.com` (ou `www.tcgplayer.com`) dans les réglages réseau de la session et relire les trois articles.

Les vidéos de The Command Zone (YouTube) n'étaient pas accessibles non plus : leurs chiffres viennent de transcriptions publiées sur Archidekt.

---

## 1. Frank Karsten (mathématiques) [M]

### 1.1 Formule du nombre de terrains (régression)

**Source** : Frank Karsten, [« How Many Lands Do You Need in Your Deck? An Updated Analysis »](https://infinite.tcgplayer.com/article/How-Many-Lands-Do-You-Need-in-Your-Deck-An-Updated-Analysis/cd1c1a24-d439-4a8e-b369-b936edb0b38a/).

- Publié sur ChannelFireball. EDHREC le cite comme « Karsten (2024) » dans [Commander Cookout – Are YOU Playing Enough Lands?](https://edhrec.com/articles/commander-cookout-are-you-playing-enough-lands) (EDHREC, 3 janv. 2025) **VÉRIFIÉ**.
- La page TCGplayer porte la mention « updated Feb 13, 2025 ».

**Correction de date.** La consigne parlait d'un article « 2022 ». L'article de 2022 est celui sur les **sources de couleur** (section 1.3). La régression sur les terrains vient de cette « Updated Analysis » postérieure. Elle cite d'ailleurs l'optimum à 42 terrains de l'article sur la courbe (2023), donc elle est forcément plus tardive.

**Méthode** (INDIRECT) : il ne s'agit **pas** d'une simulation.

- Régression linéaire multiple, par moindres carrés, sur **plus de 95 000 decks de tournoi à 60 cartes**.
- Decks à bilan positif uniquement, sans les listes aberrantes, et après le changement de règle des compagnons.
- Qualité d'ajustement à 60 cartes : R² = 0,395, erreur quadratique moyenne = 2,75 terrains.

**Formules :**

```
60 cartes : terrains = 19,59 + 1,90 × MV_moyen − 0,28 × N_cheap + 0,27 × [compagnon]
99 cartes : terrains = 31,42 + 3,13 × MV_moyen − 0,28 × N_cheap
```

Les coefficients 31,42 / 3,13 / 0,28 sont confirmés par plusieurs extraits indépendants (INDIRECT). Ils sont aussi **reconstruits par le calcul**, ce qui les rend cohérents :

- Le commandant est traité comme un « pseudo-compagnon » et le deck est mis à l'échelle 99/60.
- Ordonnée à l'origine : (19,59 + 0,27) × 99/60 = 32,77, puis 32,77 − 1,35 = **31,42**.
- Pente : 1,90 × 99/60 = 3,135, soit **3,13**.
- Le coefficient −0,28 n'est pas mis à l'échelle : c'est un effet par carte.

**L'ajustement de −1,35 terrain** (INDIRECT) correspond au mulligan gratuit et à la pioche gratuite du Commander (règle 103.4c pour le mulligan). Karsten le présente lui-même comme une estimation « de coin de table ». Il le cale ainsi : 26 terrains à 60 cartes donnent, une fois transposés, 43,35 terrains à 99 cartes, alors que ses decks optimaux pour commandants bon marché (section 1.2) en contiennent 42.

**Définitions (INDIRECT) :**

- **`MV_moyen`** : valeur de mana moyenne des **sorts**, c'est-à-dire des cartes non-terrain.
  - Les MDFC sort//terrain sont comptés par leur face avant.
  - Dans le décompte des terrains, Karsten compte un MDFC non-mythique comme **0,38 terrain** et un MDFC mythique comme **0,74 terrain** (l'ancienne règle empirique disait 0,5 et 0,75).
  - Le commandant étant traité comme un compagnon, il est **exclu** de la moyenne. C'est une déduction de la construction de la formule, pas une citation.
- **« Cheap »** signifie **valeur de mana ≤ 2**.
  - **Pioche bon marché** : carte non-terrain de MV ≤ 2 dont le texte contient « draw a card » / « draws … cards », ce qui inclut les cantrips à 1 mana. Sont exclues les cartes dont le texte contient « {4} », « Blood token » ou « investigate ».
  - **Rampe bon marché** : carte non-terrain de MV ≤ 2, pas déjà comptée comme pioche, dont le texte contient « add » (production de mana). Les créatures dont le texte contient « dies » sont exclues. Les cartes qui cherchent des terrains ou mettent des créatures en jeu comptent aussi, via d'autres filtres de texte.
- Interprétation de Karsten : chaque pioche ou rampe bon marché vaut environ 0,28 terrain, donc **on retire 1 terrain toutes les 3 à 4 cartes de ce type**. Ponder et Consider sont cités comme efficaces.

**Grille précalculée** (formule à 99 cartes) :

| MV moyen \ N_cheap | 0 | 4 | 8 | 12 | 16 |
|---|---|---|---|---|---|
| 2,0 | 37,7 | 36,6 | 35,4 | 34,3 | 33,2 |
| 2,5 | 39,2 | 38,1 | 37,0 | 35,9 | 34,8 |
| 3,0 | 40,8 | 39,7 | 38,6 | 37,5 | 36,3 |
| 3,5 | 42,4 | 41,3 | 40,1 | 39,0 | 37,9 |
| 4,0 | 43,9 | 42,8 | 41,7 | 40,6 | 39,5 |
| 4,5 | 45,5 | 44,4 | 43,3 | 42,1 | 41,0 |

**Limites** (INDIRECT) :

- Karsten dit qu'il a moins de données hors 60 cartes et que la formule est un **point de départ**.
- Comparée aux decks cEDH observés (section 3.5), elle **surestime** les terrains d'environ 3 à 4. L'accélération rapide (Mox, Sol Ring, rituels à 0–1 mana) n'est pas modélisée.

### 1.2 Courbe optimale et terrains / rampe en Commander (simulation)

**Source** : Frank Karsten, [« What's an Optimal Mana Curve and Land/Ramp Count for Commander? »](https://infinite.tcgplayer.com/article/What-s-an-Optimal-Mana-Curve-and-Land-Ramp-Count-for-Commander/e22caad1-b04b-4f8a-951b-a41e9f08da14/). ChannelFireball, 2023 selon la citation d'EDHREC. Mis à jour sur TCGplayer (un extrait indique août 2025). **INDIRECT.**

**Méthode :**

- Simulation de Monte-Carlo plus recherche locale. L'optimalité n'est donc pas garantie, ce que Karsten dit lui-même.
- **Objectif optimisé** : l'espérance du mana « composé » dépensé sur les tours 1 à 7. Exemple donné : 72,465 pour l'optimum d'un commandant à 4 mana.
- **Hypothèses simplificatrices** : tous les terrains se comportent comme une Command Tower (ni couleurs, ni terrains engagés). La pioche est sous-valorisée. Les 6-drops comptent pour 6,2 mana.

**Règles de mulligan simulées :**

| Main | Règle |
|---|---|
| 7 cartes | Garder avec 3 à 5 terrains, Signets compris, et au plus 5 terrains + Signets au total |
| 6 et 5 cartes | Garder avec 2 à 4 terrains, ou 1 terrain + Sol Ring |
| 4 cartes | Toujours garder |

La façon exacte dont le mulligan gratuit est modélisé n'apparaît pas dans les extraits (**NON VÉRIFIÉ**).

**Résultats (decks optimaux à 99 cartes)** :

| MV du commandant | Terrains | Sol Ring | Signets (rocks à 2) |
|---|---|---|---|
| 2 ou 3 | **42** | 1 | 0 |
| 4 | **39** | 1 | 7 |
| 5 | **39** | 1 | 8 |
| 6 | **38** | 1 | 9 |

**Règles pratiques de l'article :**

- Partir de **42 terrains + Sol Ring**.
- Retirer **1 terrain pour 2 à 3 mana rocks supplémentaires**.
- Retirer **1 terrain pour 3 à 4 cantrips bon marché** (Ponder, Brainstorm).
- Retirer **1 terrain pour 3 à 4 mana dorks** (Llanowar Elves, Birds of Paradise).
- **Ne pas descendre sous 37 terrains** pour un deck midrange de puissance moyenne.
- Pour un commandant à N mana, le modèle optimal contient **0 carte à N mana**. Une version ultérieure nuance : la plupart des decks réels ne devraient pas aller jusqu'à exactement zéro.

**Comparaison avec la pratique** : Karsten note que le deck EDHREC typique joue environ 36 terrains et que ses propres chiffres sont plus élevés qu'attendu. Les données observées vont dans le même sens : l'analyse de MtGDS sur EDHREC (2022) montre que les joueurs ne réduisent **pas** le nombre de cartes au coût de leur commandant (section 3.2).

### 1.3 Nombre de sources de couleur (2022)

**Source** : Frank Karsten, [« How Many Sources Do You Need to Consistently Cast Your Spells? A 2022 Update »](https://infinite.tcgplayer.com/article/How-Many-Sources-Do-You-Need-to-Consistently-Cast-Your-Spells-A-2022-Update/dc23a7d2-0a16-4c0b-ad36-586fcca03ad8/). ChannelFireball, 2022, mis à jour sur TCGplayer le 13 fév. 2025. **INDIRECT.**

**Méthode :**

- **Seuil de réussite glissant** : (89 + MV) %. Cela donne 90 % pour un sort à 1 mana, 91 % pour 2 mana, et ainsi de suite jusqu'à 96 % pour 7 mana, pour lancer le sort **au tour égal à sa MV**.
- **En Commander** : mulligan gratuit et pioche gratuite pris en compte (règle 103.4c). Cela fait baisser les besoins, jusqu'à 3 ou 4 sources de moins pour les 1- et 2-drops par rapport à l'ancienne version.
- **Hypothèse de terrains** : 41 terrains pour 99 cartes (35 pour 80 cartes, 25 pour 60 cartes).

**Tableau** : sources de la couleur C nécessaires. La colonne 99 cartes est celle à utiliser en Commander.

| Coût | Exemple de Karsten | Tour | 60 c. | 80 c. | **99 c.** | 40 c. |
|---|---|---|---|---|---|---|
| C | Monastery Swiftspear | 1 | 14 | 19 | **19** | 9 |
| 1C | Ledger Shredder | 2 | 13 | 18 | **19** | 9 |
| 2C | Reckless Stormseeker | 3 | 12 | 16 | **18** | 8 |
| 3C | Collected Company | 4 | 10 | 15 | **16** | 7 |
| 4C | Doubling Season | 5 | 9 | 14 | **15** | 6 |
| 5C | Drowner of Hope | 6 | 9 | 12 | **14** | 6 |
| CC | Lord of Atlantis | 2 | 21 | 28 | **30** | 14 |
| 1CC | Narset, Parter of Veils | 3 | 18 | 25 | **28** | 12 |
| 2CC | Wrath of God | 4 | – | – | **26** | – |
| 3CC | Baneslayer Angel | 5 | – | – | **23** | – |
| CCC | Goblin Chainwhirler | 3 | 23 | 32 | **36** | 16 |
| 1CCC | Cryptic Command | 4 | – | – | **33** | – |
| 2CCC | Garruk, Primal Hunter | 5 | – | – | **30** | – |
| CCCC | Dawn Elemental | 4 | – | – | **39** | – |

Ces valeurs sont extraites ligne par ligne via le moteur de recherche.

- Les lignes C, 1C, 2C, 3C, 4C, 5C, CC, 1CC et CCC ont été obtenues avec leurs 4 colonnes, et 3C, 4C, 5C ont été confirmées deux fois.
- Les lignes 2CC, 3CC, 1CCC, 2CCC et CCCC (colonne 99 seulement) n'ont été vues qu'une fois.
- Le tableau est cohérent : il décroît de façon monotone avec le tour, et 1CC à 60 cartes vaut 18, ce qui correspond aux « 18 sources bleues pour Narset » cités dans le texte.
- Une réponse du moteur citait « 9 et 10 » pour Drowner of Hope et Collected Company à 99 cartes. C'est manifestement la colonne 60 cartes mal attribuée.
- **À revérifier sur l'original avant de figer dans le code.**

**Comment compter une source (INDIRECT, article 2022) :**

- **Fetchland** : 1 source pour chaque couleur qu'il peut aller chercher. Dans un deck de 3 couleurs ou plus aux exigences lourdes, ou quand les fetchs ne peuvent pas trouver de bi-terrains, environ **2/3 de source** par couleur.
- **Terrains qui arrivent engagés** : ils comptent pleinement **à partir du tour 2**. Pour un sort au tour 1, seules les sources dégagées comptent.
- **Mana dork fragile** (Llanowar Elves, Birds of Paradise, Noble Hierarch) : **1/2 source** de chaque couleur produite, pour les sorts de MV ≥ 2 seulement, à condition de pouvoir lancer le dork de façon fiable.
- **Rampe au tour 3 type Cultivate** : ne compte que pour les sorts de MV ≥ 4. Elle vaut environ **1/2 source** des couleurs qu'elle peut trouver (pour MV ≥ 5 selon un extrait).
- **Exotic Orchard et Fellwar Stone** : extraits **contradictoires**.
  - Version 1 : Orchard = 3/4 de source de toute couleur, Stone = 1/2.
  - Version 2 : si l'on sait qu'un adversaire joue la couleur, Orchard = 1 et Stone = 3/4.
  - → **NON VÉRIFIÉ**.
- **Générateurs de Trésors** (Dockside Extortionist) : compter la valeur de X la plus probable.
- **Incolore et neige** : traités comme des couleurs à part entière.
- **Signets, Talismans, Arcane Signet, Command Tower** : **non trouvés** dans les extraits.
  - Command Tower est un terrain qui produit toutes les couleurs, donc 1 source par couleur par définition.
  - Pour les rocks colorés, la section 8.3 propose **notre extrapolation** de la règle des dorks (1/2 source, sorts de MV ≥ 3). Elle n'est **pas** de Karsten.

### 1.4 Autres équivalences Karsten (rocks, dorks, cantrips)

| Effet | Équivalence | Source |
|---|---|---|
| Régression | 1 carte de rampe ou pioche à MV ≤ 2 ≈ **0,28 terrain** (1 terrain pour 3,6 cartes) | Section 1.1 |
| Simulation | **2 à 3 rocks ≈ 1 terrain** | Section 1.2 |
| Simulation | **3 à 4 cantrips ≈ 1 terrain** | Section 1.2 |
| Simulation | **3 à 4 dorks ≈ 1 terrain** | Section 1.2 |
| Commandant cher (5–6) | L'optimum remplace 3 à 4 terrains par 8 ou 9 rocks à 2 mana (39 ou 38 terrains au lieu de 42) | Section 1.2 |

Aucun autre article Karsten spécifique au Commander (par exemple sur la valeur de Sol Ring) n'a été trouvé.

---

## 2. The Command Zone (gabarit d'experts) [E]

### 2.1 Gabarit « historique » (vidéo 2020-2021)

**Source primaire** : la vidéo The Command Zone (Jimmy Wong, Josh Lee Kwai) [youtube.com/watch?v=3K9PEeLG_6M](https://www.youtube.com/watch?v=3K9PEeLG_6M). Elle n'était pas accessible.

**Transcription** : deck Archidekt [« Commander Deck Template »](https://archidekt.com/decks/1432712) de Jazzelo, créé le 15 mai 2021, qui cite la vidéo. **VÉRIFIÉ** (lu via l'API Archidekt).

| Catégorie | Chiffre |
|---|---|
| Rampe | 10–12 |
| Pioche | 10 |
| Retraits ciblés (« counterspell, graveyard hate » inclus) | 10–12 |
| Balayages | 3–4 (« plutôt 3 ») |
| Terrains | 35–38 |
| « Meat » (plan de jeu) | ~30 |

**Variante contradictoire** (NON VÉRIFIÉ) : un dépôt GitHub tiers et un blog cités par le moteur de recherche attribuent à l'« épisode 379 » une autre répartition. Elle est donnée ici pour mémoire, sans pouvoir être tranchée.

| Catégorie | Chiffre |
|---|---|
| Terrains | 35–38 |
| Rampe | 10 |
| Pioche | 10 |
| Retraits ciblés | 5 |
| Balayages | 5 |
| « Standalone » | 25 |
| « Enhancers » | 10–12 |
| « Enablers » | 7–8 |

### 2.2 Gabarit 2025 (« Commander Deckbuilding Template for the New Era », épisode 658)

**Source** : épisode avec Rachel Weeks, membre du Commander Format Panel.

**Transcription** : deck Archidekt [« Commander Deck Template »](https://archidekt.com/decks/11526451) de ZeroWr, créé le 21 fév. 2025, qui remercie « The Command Zone Podcast and Rachel Weeks ». **VÉRIFIÉ** pour la transcription. Les mêmes chiffres apparaissent dans trois autres résumés secondaires (GitHub, Farseek, note.com).

| Catégorie | Cartes | Ce qu'on y compte | Ce qu'on n'y compte pas |
|---|---|---|---|
| Terrains | **38** | Bases, bi-terrains, terrains utilitaires. Un MDFC seulement si on le compte comme terrain. | – |
| Rampe | **10** | Sources permanentes : terrains supplémentaires, rocks, réducteurs de coût, doubleurs de mana | Rituels, cartes qui fixent les couleurs sans augmenter le mana |
| Avantage de cartes | **12** | Pioche répétable, pioche en rafale (2 cartes ou plus), pioche impulsive si le deck exploite l'exil | « Replace » (pioche 1 / défausse 1). Tuteurs (rangés en « Plan ») |
| Perturbation ciblée | **12** | Retrait à cible unique, contresort, défausse ciblée, protection à cible unique (hexproof/indestructible en réponse) | – |
| Perturbation de masse | **6** | Balayages, sorts à X multi-cibles, protection de masse (phasing, prévention), retrait de 2 permanents ou plus | « On ne cherche pas 6 balayages » |
| Plan | **30** | Payoffs du thème, conditions de victoire, **tuteurs** | – |

**Règles de comptage explicites :**

- **Total = 108 > 99, c'est voulu.** Une carte peut compter dans plusieurs catégories. Exemple : un balayage qui pioche compte en Perturbation de masse **et** en Avantage de cartes.
- Si une carte remplit plusieurs rôles, on l'affecte d'abord au rôle le plus important pour la stratégie.
- Une carte modale va dans la catégorie de son mode le plus fort.
- Un MDFC avec une face terrain compte comme terrain d'abord.
- « Lands are strictly 38 » : on ajuste les terrains selon le MV moyen du deck.
- Le gabarit vise surtout les brackets 2 à 4. Le cEDH (bracket 5) ne le suit pas.

Les numéros d'épisode (379 et 658) viennent de sources secondaires et sont **NON VÉRIFIÉS**. La date de 2025 est cohérente avec la création du deck Archidekt.

---

## 3. EDHREC (données) [D]

### 3.1 Série « Superior Numbers » (Dana Roach)

Les éditions sont listées sur la page tag [edhrec.com/articles/tag/superior-numbers](https://edhrec.com/articles/tag/superior-numbers).

**Éditions trouvées** : Land Counts, Breaking Down the Top 100, I Played 352 EDH Games in 2019, Crucible of Worlds, Power Begets Power, War of the Stats, Cascading Changes and Vestigial Cards, The Anatomy of an Upgrade, The Truth Behind Three Truisms, Brewing Around Tunnel Vision, The Rise of the Supercommanders, Wondering What Wipes Wreck What, Flash in Fashion, The Big Turn, et la série Cards Caring About Colors (blue, green, black).

**Mentionnées par le moteur, non revérifiées** : In the Margins Redux (2021), Slot-Blockers (2021), Your Favorite Card Sucks (2020), Eternal Sunshine… (2021), Taking Your Deck from Alpha to Revised (2021).

**Seules les éditions ci-dessous contiennent des chiffres de composition** (toutes **VÉRIFIÉES**) :

- [**Land Counts**](https://edhrec.com/articles/superior-numbers-land-counts) (D. Roach, 20 fév. 2019) :
  - Deck EDHREC moyen : **un peu plus de 29 terrains** ; **31** pour les decks ajoutés l'année précédente ; **4,15 mana rocks**.
  - Les mana dorks ne sont pas comptés.
  - Une note de la rédaction ajoutée ensuite dit que les données ont été refiltrées (avec un renvoi vers une vidéo).
  - Goldfish de 100 decks au hasard : **26 %** manquent leur 3e terrain au tour 3 sans aucune autre source de mana ; **21 %** le manquent mais ont une source (rock, dork, rampe).
  - Formule de Nate Burgess : **terrains = 31 + nombre de couleurs + MV du commandant**, les rocks à 0 mana comptant comme terrains. Cela donne 37 pour un tricolore à 3 mana.
  - Les precons jouaient en moyenne **plus de 37 terrains**.
  - Les 4 listes cEDH citées : 28 à 33 terrains, 33 à 43 sources de mana au total, MV moyen 1,68 à 2,04.
- [**The Truth Behind Three Truisms**](https://edhrec.com/articles/superior-numbers-the-truth-behind-three-truisms) (D. Roach, 19 fév. 2020) :
  - La rampe devrait coûter **≤ 2**, parce que **9 des 20 commandants les plus joués coûtent 4** (45 %).
  - La moitié du top 10 des commandants exploite le cimetière, d'où la recommandation d'avoir de quoi le gérer.
- [**Wondering What Wipes Wreck What**](https://edhrec.com/articles/superior-numbers-wondering-what-wipes-wreck-what) (D. Roach, 12 août 2020) :
  - Nombre de decks par balayage : Blasphemous Act 44 062, Wrath of God 28 081, Merciless Eviction 27 821, Toxic Deluge 27 264, etc.
  - Conclusion : « en jouer quelques-uns dans les couleurs qui le permettent ».
- [Breaking Down the Top 100](https://edhrec.com/articles/superior-numbers-breaking-down-the-top-100) (4 déc. 2019) et [The Anatomy of an Upgrade](https://edhrec.com/articles/superior-numbers-the-anatomy-of-an-upgrade) (29 janv. 2020) : pas de cible de composition.

### 3.2 Autres articles EDHREC utiles

- [**Paradigm Shift – How Your Commander's Mana Value Alters Your Curve**](https://edhrec.com/articles/paradigm-shift-how-your-commanders-mana-value-alters-your-curve) (MtGDS, 14 avr. 2022) [D] **VÉRIFIÉ** :
  - Courbe moyenne agrégée (hors terrains) : mode à 2 MV ; **15,7** cartes à 2 MV, **15,4** à 3 MV, **9,5** à 4 MV, environ **1,5** à 8 MV ou plus.
  - Les commandants à 4 MV ont 9,7 cartes à 4 MV : les joueurs **ne suivent pas** le conseil « moins de cartes au coût du commandant » de The Command Zone (épisode 453).
  - Les commandants chers sont entourés de plus de cartes chères.
- [How to Build a Commander Deck](https://edhrec.com/articles/how-to-build-a-commander-deck) (Brian Cain, 25 nov. 2024) [E] : **36 à 38 terrains**, plus pour un commandant à 5 MV ou plus ; rampe et interaction plutôt à 2–4 mana.
- [The EDHREC Guide to Ramp in Commander](https://edhrec.com/guides/the-edhrec-guide-to-ramp-in-commander) (John Sherwood, 26 janv. 2026) [D] : environ **85 %** des decks étiquetés « Ramp » sur EDHREC sont verts.
- [Should You Run More Removal in Commander?](https://edhrec.com/articles/should-you-run-more-removal-in-commander) (Cas Hinds, 8 sept. 2025) [E] : opinion, sans chiffre de cible.

### 3.3 Synergy, lift, « Top Cards », « High Synergy / High Lift » (formules VÉRIFIÉES sur le JSON)

Chaque carte d'une page commandant (ou thème) contient `num_decks`, `potential_decks`, `synergy`, `lift` (et `trend_zscore`).

```
inclusion = num_decks / potential_decks      # part des decks de CE commandant qui jouent la carte
                                              # (potential_decks = decks qui pouvaient la jouer, ex. après sa sortie)
base      = taux d'inclusion de la carte dans l'ensemble des decks de la même identité de couleur
synergy   = inclusion − base                  # vérifié : base = inclusion − synergy
lift      = inclusion / base                  # vérifié : inclusion/base = lift à 1e-3 près (Ur-Dragon, Atraxa)
```

Exemple : Miirym pour The Ur-Dragon : inclusion 0,787, synergy 0,701, donc base 0,087 et lift 9,10. La définition « % commandant − % identité de couleur » est confirmée par l'[EDHWiki](http://wiki.edhrec.com/wiki/EDHREC) et un article EDHREC (exemple Miirym 81 % − 11 % = 70 %).

**Listes du JSON (observées) :**

- « **Top Cards** » : triées par inclusion décroissante.
- Listes par type (« Creatures », « Instants »… « Lands », « Mana Artifacts », « Utility Lands ») : triées par inclusion décroissante, sans les cartes déjà présentes plus haut.
- En novembre 2026, le JSON ne contient plus de liste « High Synergy Cards ». Il contient « **High Lift Cards** » (`tag: highliftcards`), triée par lift décroissant, et pas sur toutes les pages (absente pour Atraxa). Pour notre coach, recalculer soi-même un score à partir de `synergy` et `lift`.

### 3.4 JSON EDHREC : URLs testées le 2 nov. 2026 et structure utile

| URL (`https://json.edhrec.com/…`) | Statut | Contenu utile |
|---|---|---|
| `pages/commanders/<slug>.json` | 200 | Voir la liste détaillée ci-dessous |
| `pages/commanders/<slug>/<bracket>.json` (`exhibition`, `core`, `upgraded`, `optimized`, `cedh` = B1…B5), `/budget.json` | 200 | Même structure, restreinte au bracket ou au budget |
| `pages/commanders/<slug>/<theme>.json` (slug pris dans `tag_counts`) | 200 | Même structure, restreinte au thème |
| `pages/commanders/<slug>/<theme>/<bracket>.json` | **403** | Combinaison non disponible |
| `pages/average-decks/<slug>.json` et `…/<slug>/<bracket ou theme>.json` | 200 | Mêmes compteurs de types + `deck.cards` = `{Type: [[nom, qté], …]}` + `archidekt` = `[{u: scryfall_id, q: qté, c: 'c' commandant / 'm' main}]` (100 cartes) + `panels.mana_curve` du deck moyen (99 cartes, commandant exclu) |
| `pages/themes/<slug>.json` | **403** | Remplacé par la ligne suivante |
| `pages/tags/<slug>.json` (ex. `landfall`, `voltron`, `spellslinger`, `tokens`, `aggro`, `control`, `combo`, `stax`, `storm`, `aristocrats`, `ramp`, `group-hug`, `big-mana`) | 200 (`lands` : 403) | `topcommanders` (24, avec `num_decks`), cartes du thème avec synergy/lift, `budget_counts` |
| `pages/commanders/year.json` (pagination `commanders/year-past2years-N.json`), `month.json` | 200 | Top 100 commandants sur 2 ans + `bracket_counts` global |
| `pages/commanders.json` | **403** | – |
| `pages/cards/<slug>.json` | 200 | Fiche carte : `num_decks`, `potential_decks`, `salt`, top commandants, cartes associées |
| `pages/combos/<couleurs>.json` | 200 | Combos avec `count`, `percentage`, `results` et `comboVote.bracket` (données Commander Spellbook) |
| `pages/top/year.json` | 200 | Top 100 sur 2 ans |

**Contenu d'une page commandant** (`pages/commanders/<slug>.json`) :

- Compteurs moyens par type : `creature`, `instant`, `sorcery`, `artifact`, `enchantment`, `battle`, `planeswalker`, `land`, `basic`, `nonbasic`.
- `bracket_counts` : nombre de decks par bracket ; `budget_counts`.
- `tag_counts` : thèmes avec leur nombre de decks.
- `panels.mana_curve` : courbe moyenne des sorts ; `panels.piechart`.
- `container.json_dict.cardlists[]` : listes avec `header`, `tag` et `cardviews[]`. Chaque carte contient `id`, `name`, `slug`, `synergy`, `lift`, `num_decks`, `potential_decks`, `trend_zscore`.
- `container.json_dict.card` : `num_decks`, `rank`, `salt`, `cmc`, `color_identity`, `prices`, `precon`.

**Répartition globale par bracket** (fichier `pages/commanders/year.json`, 2 ans) : B1 44 953 (1,9 %), B2 907 684 (38,0 %), B3 911 227 (38,2 %), B4 379 940 (15,9 %), B5 142 949 (6,0 %). [D] VÉRIFIÉ. Le bracket est celui déclaré ou estimé sur le site d'origine du deck.

### 3.5 Notre analyse : composition par rôle, par bracket et par thème [D] (VÉRIFIÉE, reproductible)

**Méthode :**

1. **Échantillon par bracket** : les **100 commandants les plus joués sur 2 ans** sur EDHREC. Pour chacun, le « deck moyen » global et par bracket (`average-decks/<slug>[/<bracket>].json`), soit 600 decks.
2. **Échantillon par thème** : pour 13 thèmes, les 24 commandants les plus associés à ce thème. Pour chacun, le deck moyen du thème (`average-decks/<slug>/<theme>.json`), soit 312 decks.
3. **Classement des cartes** : par les oracle tags Scryfall (section 6). Toutes les cartes légales en Commander de chaque tag ont été téléchargées via `otag:<tag> legal:commander`.
   - `ramp-core` = mana-rock ∪ mana-dork ∪ land-ramp ∪ mana-increaser ∪ extra-land ∪ ritual, sans les cartes taguées removal.
   - `cheap-ramp` = `ramp-core` avec MV ≤ 2.
   - `spot-removal` = removal sans les sweepers.
   - `tutor` = tutor sans les cartes qui ne cherchent que des terrains.
   - `wincon-tagged` = alternate-win-condition ∪ overrun ∪ extra-combat-phase ∪ extra-turn.
4. **Terrains** : champ `land` d'EDHREC. **MV moyen** : `mana_curve` du deck (99 cartes, commandant exclu).

**Limites :**

- Le « deck moyen » EDHREC est un deck synthétique : les cartes les plus jouées, dans la répartition moyenne par type. Il reflète **les choix majoritaires**, pas la dispersion des decks réels.
- Les tags Tagger sont larges : `draw` inclut cantrips, loot et wheel ; `removal` inclut les brûlures « any target ». Les compteurs sont donc des **ordres de grandeur**.
- Médiane (Q1–Q3) entre parenthèses.

| Groupe | Terrains | Rampe (core) | Rampe ≤ 2 | Pioche (tag `draw`) | Avantage de cartes | Retrait ciblé | Balayages | Contresorts | Tuteurs | Protection | Récursion | Wincon taguée | MV moyen |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Tous (n=100) | 35 (34–36) | 12 (9–16) | 8 (7–10) | 9 (7–13) | 13 (10–17) | 8 (6–10) | 2 (1–4) | 1 (0–4) | 2 (0–3) | 4 (2–6) | 3 (1–6) | 0,5 (0–1) | 3,00 (2,79–3,27) |
| **B1** (n=100) | 36 (35–37) | 12 (9–16) | 7 (6–9) | 10 (7–14) | 14 (10–18) | 8 (6–11) | 2 (1–3) | 1 (0–3) | 1 (0–2) | 3 (2–5) | 3 (2–5) | 0 (0–1) | 3,02 |
| **B2** (n=100) | 36 (35–37) | 12 (8–16) | 7 (6–9) | 10 (8–14) | 15 (11–18) | 8 (6–11) | 2 (2–4) | 1 (0–3) | 1 (0–2) | 3,5 (2–5,5) | 3 (2–6) | 0,5 (0–1) | 3,12 |
| **B3** (n=100) | 35 (35–36) | 12 (9–16) | 8 (6–10) | 10 (7–13) | 13 (11–17) | 8 (6–10) | 2 (1–4) | 1 (0–4) | 1 (0–2) | 4 (2–6) | 3 (1–7) | 1 (0–1) | 3,03 |
| **B4** (n=100) | 34,5 (34–35) | 13 (9–16) | 9 (7–10) | 9 (7–12) | 12 (9–15) | 7 (5–9) | 3 (1–3) | 2 (0–5) | 4 (3–5) | 4 (2–6) | 3 (1–5) | 1 (0–2) | 2,86 |
| **B5 cEDH** (n=100) | **30 (29–32)** | 15 (12–17) | **13 (10–15)** | 8 (6–11) | 13 (10–15) | 6 (4–9) | 1 (1–2) | 5 (2–9) | **10 (7–12)** | 3 (2–4) | 3 (2–6) | 1 (0–1) | **2,33** |
| aggro (n=24) | 35 (34–35) | 9,5 (7–14,5) | 7 | 8 (7–11) | 11,5 | 8,5 | 2 (1–4) | 0 | 1 | 5,5 (2–9) | 1,5 | 1 (0–2) | 2,88 |
| control | 34 (32–35) | 9,5 (8–12) | 8,5 | **13 (10–17)** | 15 | 8 | **3,5 (2–5)** | **8 (5–10)** | 3 | 3 | 1,5 | 1 | 2,68 |
| combo | **31,5 (29–33)** | 13 (10–18) | 10 | 8,5 | 14 | 7 | 1,5 | 5,5 (2–11) | **7 (6–10)** | 2 | 3,5 | 0,5 | 2,37 |
| landfall | **39 (38–40)** | **24,5 (20–28)** | 10 | 8 | 12 | 5 (3–7) | 1 | 0 | 1,5 | 2 | **7,5 (4–11)** | 0,5 | 3,26 |
| spellslinger | 34 (34–35) | 9 (8–12) | 7 | **18,5 (15–21)** | **22** | 9,5 | 3 | 4 (2–6) | 1 | 2 | 2,5 | 0 | 2,61 |
| voltron | 35 (34–36) | 8,5 (7–11) | 7 | 8 | 10,5 | 7 | 2 | 0 | 3,5 (1–6) | **12 (10–14)** | 3 | 0 | 2,63 |
| tokens | 35 (34–36) | 11 (7–15) | 7 | 9 | 11 | 7 | 2 | 0 | 1 | 4 (2–5) | 1,5 | 1 | 2,99 |
| aristocrats | 35 (34–35) | 8,5 (7–12) | 5,5 | 11 | 12 | 9 | 3,5 (2–4) | 0 | 1,5 | 1 | 4,5 (1,5–8) | 0 | 2,81 |
| stax | 33 (31–34) | 10 | 8,5 | 9 | 10 | 7 | 2,5 | 4,5 | 5 (3–8) | 3 | 1 | 0 | 2,53 |
| storm | 32 (29–34) | 12,5 | 10 | 17 (13–21) | 23 | 8 | 1 | 4,5 | 3 | 1 | 3 | 0 | 2,28 |
| ramp | 37 (35–39) | 23 (16–29) | 9,5 | 8,5 | 13 | 6 | 1,5 | 1 | 2 | 3 | 4 | 1 | 3,32 |
| group-hug | 35 (34–36) | 11 | 7 | 21,5 | 23 | 6 | 2 | 3,5 | 0 | 3 | 1 | 1 | 2,95 |
| big-mana | 35 (35–36) | 16,5 (11–24) | 8 | 12 | 16 | 10 | 3 | 1 | 1 | 4 | 4 | 1 | **4,67** |

**Constats complémentaires :**

- **Contresorts dans les decks avec du bleu seulement** (57 commandants sur 100) : médiane B2 = 2 (Q1–Q3 1–4), B3 = 3 (2–5), B4 = 4 (3–6), B5 = 9 (7–10). Médiane hors bleu : 0.
- **Terrains selon le nombre de couleurs** (B2) : 1 couleur 35, 2 couleurs 35, 3 couleurs 36, 5 couleurs 37. L'effet est faible, contrairement à la formule de Burgess (+1 par couleur).
- **Game Changers dans les decks moyens** (liste officielle de 53 cartes) : médiane B1 0, B2 0, **B3 1** (max 4), **B4 6,5**, **B5 15**. Cela confirme que les brackets EDHREC respectent la règle de 0 / 3 maximum / illimité.
- **Régression observée** sur 500 decks (5 brackets × 100) : `terrains = 33,05 + 1,51 × MV_moyen − 0,24 × N_cheap` (R² = 0,36). Le coefficient pour les cartes bon marché est proche de celui de Karsten (−0,24 contre −0,28). En revanche, les joueurs ne montent que de **1,5 terrain par point de MV**, contre **3,13** pour Karsten.
- **Écart à la formule** : appliquée aux decks moyens, la formule de Karsten donne une médiane de **38,3** terrains en B2, contre **36** observés. Les joueurs jouent environ **2 terrains de moins** que ce que recommande la régression. C'est cohérent avec les mises en garde de Karsten, de Dana Roach et de Bennie Smith.

---

## 4. Wizards of the Coast : brackets et Game Changers [O]

### 4.1 Sources et versions (VÉRIFIÉES)

- [Introducing Commander Brackets Beta](https://magic.wizards.com/en/news/announcements/introducing-commander-brackets-beta) (Gavin Verhey, 11 fév. 2025) : création du système, 40 Game Changers.
- [Commander Brackets Beta Update – April 22, 2025](https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-april-22-2025) : ajout de nombreux Game Changers.
- [Commander Brackets Beta Update – October 21, 2025](https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-october-21-2025) :
  - « Players expect… » et **nombre minimal de tours attendus** par bracket.
  - **Suppression des restrictions sur les tuteurs** ; seuls les tuteurs Game Changers restent encadrés.
  - B2 n'est plus lié aux precons.
  - Retrait de 10 Game Changers (Expropriate, Jin-Gitaxias, Sway of the Stars, Vorinclex, Kinnan, Urza, Winota, Yuriko, Deflecting Swat, Food Chain).
- [Commander Brackets Beta Update – February 9, 2026](https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-february-9-2026) : **dernière mise à jour des brackets trouvée**.
  - Aucun changement de bracket.
  - **Farewell** et **Biorhythm** ajoutés aux Game Changers ; Lutri volontairement exclu.
  - Le Panel annonce ne plus toucher aux brackets avant au moins une MagicCon 2026.
- [Page format Commander](https://magic.wizards.com/en/formats/commander) : contenu des brackets mis à jour le 5 nov. 2025 ; entrée Game Changers le 24 avr. 2026, liste blanche le 9 fév. 2026 (dates internes de la page).
- [Banned & Restricted du 12 oct. 2026](https://magic.wizards.com/en/news/announcements/banned-and-restricted-october-12-2026) : Yuriko, the Tiger's Shadow et Spider-Man 2099 bannis **comme commandants seulement**. Rien sur les brackets.

Aucune annonce de bracket postérieure à février 2026 n'a été trouvée au 2 nov. 2026. Le système est toujours en « beta ».

### 4.2 Critères par bracket (état actuel)

| | B1 Exhibition | B2 Core | B3 Upgraded | B4 Optimized | B5 cEDH |
|---|---|---|---|---|---|
| Intention (WotC) | Thème avant puissance ; victoires thématiques ou sous-optimales ; souplesse sur la légalité | Decks non optimisés ; victoires incrémentales, visibles et interactives | Synergie forte, cartes de qualité, perturbation efficace ; victoire possible en un gros tour | Létal, constant, rapide ; victoires efficaces et instantanées | Méta cEDH ; victoire avant tout |
| Tours minimum attendus avant de gagner ou perdre [O] | **9** | **8** | **6** | **4** | n'importe quel tour |
| Game Changers [O] | **0** (exception thématique possible) | **0** | **≤ 3** | illimité | illimité |
| Destruction massive de terrains [O] | non | non | non | oui | oui |
| Tours supplémentaires | **non** | pas d'enchaînement (« low quantities ») | pas d'enchaînement | oui | oui |
| Combos infinis à 2 cartes | **non** | **non** | **pas avant le tour 6 environ** | oui | oui |
| Tuteurs | sans limite depuis oct. 2025 (« sparse » avant) | idem | idem | « tutors » attendus | idem |

**Sources du tableau :**

- Intention et nombre de tours : page format et annonce d'octobre 2025, VÉRIFIÉ.
- Game Changers : page format, VÉRIFIÉ.
- Destruction de terrains, tours supplémentaires et combos : formulation de février 2025, VÉRIFIÉE. Sa reprise dans l'infographie d'octobre 2025 de Rachel Weeks est rapportée par [mtg.wiki – Commander Brackets](https://mtg.wiki/page/Commander_Brackets) (VÉRIFIÉ sur mtg.wiki ; infographie non vue). L'article d'octobre 2025 confirme que « les brackets restreignent déjà bien les combos » et que la règle des 6 tours remplace « no early-game combos ».

**Définition de la destruction massive de terrains** : cartes qui détruisent, exilent ou renvoient régulièrement d'autres terrains, les gardent engagés ou changent le mana produit par **4 terrains ou plus**. C'est la description du tag Tagger `mass-land-denial` ; Wizards n'a pas publié de liste exhaustive.

### 4.3 Liste des Game Changers (53 cartes, page officielle, VÉRIFIÉE le 2 nov. 2026)

- **Blanc** : Drannith Magistrate, Enlightened Tutor, Farewell, Humility, Serra's Sanctum, Smothering Tithe, Teferi's Protection.
- **Bleu** : Consecrated Sphinx, Cyclonic Rift, Force of Will, Fierce Guardianship, Gifts Ungiven, Intuition, Mystical Tutor, Narset, Parter of Veils, Rhystic Study, Thassa's Oracle.
- **Noir** : Ad Nauseam, Bolas's Citadel, Braids, Cabal Minion, Demonic Tutor, Imperial Seal, Necropotence, Opposition Agent, Orcish Bowmasters, Tergrid, God of Fright, Vampiric Tutor.
- **Rouge** : Gamble, Jeska's Will, Underworld Breach.
- **Vert** : Biorhythm, Crop Rotation, Gaea's Cradle, Natural Order, Seedborn Muse, Survival of the Fittest, Worldly Tutor.
- **Multicolore** : Aura Shards, Coalition Victory, Grand Arbiter Augustin IV, Notion Thief.
- **Incolore** : Ancient Tomb, Chrome Mox, Field of the Dead, Glacial Chasm, Grim Monolith, Lion's Eye Diamond, Mana Vault, Mishra's Workshop, Mox Diamond, Panoptic Mirror, The One Ring, The Tabernacle at Pendrell Vale.

### 4.4 Outil pour détecter automatiquement les combos

L'API **Commander Spellbook** (`backend.commanderspellbook.com`, testée le 2 nov. 2026, VÉRIFIÉ) :

- `POST /estimate-bracket` avec `{"commanders":[{"card":…}],"main":[{"card":…}]}` renvoie :
  - un `bracketTag` (codes : E Exhibition, C Core, O Oddball, P Powerful, S Spicy, R Ruthless, B Banned) ;
  - pour chaque carte, les indicateurs `gameChanger`, `massLandDenial`, `extraTurn` ;
  - la liste des `combos` du deck.
- `POST /find-my-combos` renvoie les combos inclus ou presque inclus.
- `GET /variants/?q=…` permet une recherche.

Ce sont des estimations de Commander Spellbook, pas des règles officielles. Elles évitent toutefois de coder à la main la détection des combos à 2 cartes.

---

## 5. Autres sources sérieuses (auteur, date, nature)

| Source | Nature | Chiffres |
|---|---|---|
| Tomer Abramovici, [« The Power of a Deckbuilding Checklist »](https://www.mtggoldfish.com/articles/the-power-of-a-deckbuilding-checklist-commander-quickie), MTGGoldfish, 11 mars 2020. VÉRIFIÉ | [E] + calcul hypergéométrique | Voir le détail ci-dessous |
| A.L. Walser, [« How Many Board Wipes Should You Really Play in Commander? »](https://draftsim.com/edh-how-many-board-wipes/), Draftsim, 11 juil. 2025. VÉRIFIÉ | [E] | **3 à 5 balayages** ; moins en deck de créatures, plus en contrôle ; favoriser les balayages synergiques ou unilatéraux |
| A.L. Walser, [« How Much Removal Should You Really Play in Commander? »](https://draftsim.com/edh-how-much-removal/), Draftsim, 22 fév. 2024. VÉRIFIÉ | [E] | **8 à 10 retraits** au sein de **15 à 20 cartes d'interaction**, dont **3 à 5 retraits ciblés** ; diversifier les types ; la défausse ciblée est déconseillée |
| Kristen Gregory, [« You Should Be Playing More Board Wipes »](https://blog.cardkingdom.com/you-should-be-playing-more-board-wipes/), Card Kingdom, 13 juin 2022. VÉRIFIÉ | [E] | Les gabarits historiques montaient à **5–7** balayages ; le consensus de l'époque était **3–4** ; l'autrice défend **au moins 5** |
| Bennie Smith, [« Let's Talk About Lands Again »](https://articles.starcitygames.com/magic-the-gathering/select/lets-talk-about-lands-again/), StarCityGames, 27 mars 2021. VÉRIFIÉ | [E] + [D] EDHREC | 22 terrains sur 60 (36 %) = minimum absolu, soit **36** en Commander ; les decks EDHREC populaires (Atraxa, Alela, 34–35 terrains) en jouent trop peu ; Gavin Verhey joue **39–40** terrains au minimum |
| Commander's Herald (articles divers, moteur de recherche). NON VÉRIFIÉ | [E] | « 10 cartes de rampe ou plus » ; pas de gabarit global trouvé |
| EDHTuner (10 794 decks Moxfield). Domaine inaccessible, NON VÉRIFIÉ | [D] | Médianes de terrains rapportées : B1/B2 36, B3 35, B4 33, cEDH 28. Proche de nos chiffres EDHREC (36 / 36 / 35 / 34,5 / 30) |

**Détail de la liste MTGGoldfish (Tomer Abramovici)** :

- **50 sources de mana**, en général 37 terrains + 13 rampes.
- **10** cartes de pioche.
- **6** retraits ciblés (créature, artefact, enchantement).
- **3** balayages : +1 si le deck a peu de créatures, −1 s'il en a beaucoup.
- **2** récursions.
- **2** tuteurs (davantage si le budget le permet, « 10 is fine »).
- **1** carte anti-cimetière.
- **1** carte « I win ».
- **Calcul** : avec **14** cartes de rampe, il y a 80 % de chances d'en avoir au moins une sur les 3 premiers tours (sans mulligan) ; il en faut 20 pour atteindre 90 %.
- **Cible de terrains** : 36 à 39 pour faire 4 drops de terrain sur 4 tours.
- **cEDH** : environ 30 terrains et 16 à 20 rampes.

**Synthèse des natures de chiffres :**

- **[M] Karsten** : 37 à 42 terrains selon la courbe ; formule à la section 1.1 ; sources de couleur à la section 1.3.
- **[D] EDHREC** : médianes de 35–36 terrains (B1–B3), 34,5 (B4), 30 (B5) ; rampe core 12 ; pioche 10 ; retraits ciblés 8 ; balayages 2 ; tuteurs 1–2 (B2–B3).
- **[E] Experts** : 36–40 terrains, 10–13 rampes, 10–12 pioches, 6–12 retraits ciblés, 3–5 balayages (6 en « masse » au sens large chez The Command Zone).

---

## 6. Scryfall Tagger : tags de fonction pour classer les cartes par rôle

**Sources** (VÉRIFIÉES le 2 nov. 2026) :

- [scryfall.com/docs/tagger-tags](https://scryfall.com/docs/tagger-tags) : 5 447 oracle tags listés. Syntaxe `otag:`, `function:` ou `oracletag:`.
- [scryfall.com/docs/api/tags](https://scryfall.com/docs/api/tags) : bulk « Oracle Tags » quotidien, avec UUID stables, `parent_ids`/`child_ids`, `aliases` et poids `very_strong`/`strong`/`median`/`weak`.
- `total_cards` via `https://api.scryfall.com/cards/search?q=otag:<tag>`, avec 120 ms entre requêtes.
- Slug canonique et parent via la GraphQL de tagger.scryfall.com (`tagBySlug`, `aliasing:true`).

**Points importants :**

1. **La recherche `otag:X` inclut les tags descendants.** Vérifié : `otag:mana-rock -otag:ramp` et `otag:removal-creature -otag:removal` renvoient 0 résultat.
2. **Les alias donnent le même résultat.**
   - `board-wipe`, `boardwipe`, `wipe`, `wrath-of-god` et `mass-removal` → **`sweeper`** (952).
   - `creature-removal` → `removal-creature`.
   - `win-condition` et `automatic-win` → `alternate-win-condition`.
   - `impulse-draw` → `impulsive-draw`.
   - `mana-doubler` → `mana-increaser`.
   - `edict` → `removal-sacrifice`.
   - `rampant-growth` → `land-ramp`.
   - `blink` → `flicker`.
   - `graveyard-hate` → `hate-graveyard`.
   - `extra-combat` → `extra-combat-phase`.
   - `sac-outlet` → `sacrifice-outlet`.
   - `tutor-any` → `tutor-card`.
   - `self-mill` → `mill-self`.
3. **Ne sont pas des tags** (HTTP 404) : `wincon`, `stax`, `card-draw`, `treasure`.
4. Le bulk n'était pas téléchargeable dans cette session : `data.scryfall.io` est refusé par le proxy.

**Tableau par rôle** : totaux `otag:<tag>`, toutes légalités, le 2 nov. 2026 ; entre parenthèses, avec `legal:commander`.

| Rôle | Tag(s) exact(s) | Total | Pièges |
|---|---|---|---|
| Rampe (racine) | `ramp` | 2 326 (2 155) | Trop large : inclut des cas comme Path to Exile ; préférer l'union ci-dessous |
| Producteur de mana non-terrain | `mana-producer` (enfants : `mana-rock`, `mana-dork`, `mana-dork-egg`) | 973 | – |
| Mana rock | `mana-rock` | 390 (357) ; MV ≤ 2 : 95 | – |
| Mana dork | `mana-dork` | 449 (420) ; MV ≤ 2 : 222 | – |
| Rampe par terrains | `land-ramp` | 638 (584) ; MV ≤ 2 : 159 | – |
| Terrain supplémentaire par tour | `extra-land` | 164 | – |
| Doubleur de mana | `mana-increaser` | 57 | – |
| Rituel | `ritual` | 69 | Mana temporaire : à exclure de la « rampe » au sens The Command Zone |
| Réducteur de coût | `cost-reducer` | 351 | Pas enfant de `ramp` |
| Pioche (textuelle) | `draw` | 4 337 (4 081) ; MV ≤ 2 : 1 452 | Inclut `cantrip` (659), `loot` (424), `wheel` (150) |
| Pioche en rafale / répétable | `burst-draw`, `repeatable-draw`, `draw-engine` | 652 / 1 958 / 1 618 | – |
| Avantage de cartes (racine) | `card-advantage` | 6 334 (5 820) | Inclut `regrowth`, `impulse` (581), `impulsive-draw` (268) |
| Retrait (racine) | `removal` | 6 489 (6 198) | Inclut les sweepers et les brûlures |
| Retrait ciblé | `spot-removal` | 5 433 | – |
| Retrait multi-cibles | `multi-removal` | 680 | – |
| Retrait par type de permanent | `removal-creature` 5 545, `removal-artifact` 1 198, `removal-enchantment` 1 043, `removal-planeswalker` 1 965, `removal-land` 510 | – | `removal-creature` inclut `burn-creature` (2 270) |
| Retrait par mode | `removal-exile` 589, `removal-bounce` 442, `removal-sacrifice` 437, `disenchant-naturalize` 237 | – | – |
| Balayage | **`sweeper`** | 952 (910) | Enfant : `sweeper-one-sided` (240) |
| Contresort | `counterspell` | 553 (522) | Enfants : `counterspell-soft` (141), `counterspell-free` (13) |
| Tuteur | `tutor` | 1 177 (1 120) | Inclut `tutor-land` (602) ; vrai tuteur = `otag:tutor -otag:tutor-land` (575) ; `tutor-card` (101) = tuteur universel |
| Protection | `protection` | 1 229 (1 185) | Enfants : `protects-creature` 980, `protects-all` 303, `gives-hexproof` 164, `gives-indestructible` 276, `gives-protection` 121, `gives-player-hexproof` 23, `gives-shroud` 48 ; voir aussi `phasing` 70, `fog` 94 |
| Récursion | `recursion` | 2 283 (2 153) | Enfants : `reanimate` 1 082, `regrowth` 681, `restock` 230, `mass-reanimation` 75 |
| Anti-cimetière | `hate-graveyard` | 428 | – |
| Condition de victoire | `alternate-win-condition` | 70 | Ne couvre **pas** les finishers (Craterhoof…) ; compléter avec `overrun` 87, `extra-combat-phase` 46, `extra-turn` 59, `bottomless-mana-sink` 791, `drain-life` 428, `burn-player` 1 832 |
| Brackets / stax | `mass-land-denial` 111, `extra-turn` 59, `hatebear` 66, `tax` 475, `pillowfort` 63, `hand-disruption` 715, `theft` 741 | – | – |

Le détail complet (alias, parents, totaux légaux en Commander) est dans `docs/deckbuilder/tagger-tags.json`.

**Règle de classement conseillée pour le coach :**

- Combiner les tags.
- Exclure les cartes de type Terrain des rôles « sorts ».
- Calculer la MV depuis Scryfall.
- Une carte peut avoir plusieurs rôles (section 8.7).

---

## 7. Comparaison des chiffres par catégorie

Lecture : [M] maths, [D] données, [E] experts.

| Catégorie | Karsten [M] | EDHREC observé B2–B3 [D] | The Command Zone 2025 [E] | The Command Zone 2021 [E] | MTGGoldfish 2020 [E] | Draftsim / Card Kingdom / SCG [E] |
|---|---|---|---|---|---|---|
| Terrains | 37–42 (formule) | 35–36 | 38 | 35–38 | 37 (36–39) | ≥ 36 (SCG) ; 39–40 (G. Verhey) |
| Rampe | 0–9 rocks selon MV du commandant ; 1 terrain pour 2–3 rocks | 12 (core), dont 7–8 à MV ≤ 2 | 10 | 10–12 | 13 (10–15) | ≥ 10 (Commander's Herald) |
| Terrains + rampe | 42–47 | 47–48 | 48 | 45–50 | **50** | – |
| Pioche / avantage de cartes | – | 10 (`draw`) / 13–15 (avantage) | 12 | 10 | 10 | – |
| Retraits ciblés | – | 8 | 12 (avec contresorts et protection ciblée) | 10–12 | 6 | 3–5 ciblés, 8–10 retraits au total (Draftsim) |
| Balayages | – | 2 | 6 (« masse » au sens large) | 3–4 | 3 | 3–5 (Draftsim) ; 3–4 consensus, ≥ 5 selon l'autrice (Card Kingdom) |
| Contresorts (decks bleus) | – | 2–3 | dans les 12 ciblés | dans les 10–12 | – | – |
| Tuteurs | – | 1–2 | dans « Plan » | – | 2 (10 si gros budget) | – |
| Protection | – | 3,5–4 | dans ciblé / masse | – | – | – |
| Récursion | – | 3 | – | – | 2 | – |
| Anti-cimetière | – | 1 | – | – | 1 | – |
| Conditions de victoire | – | non mesurable par tags | dans « Plan » (30) | – | 1 « I win » | – |

---

## 8. Cibles recommandées pour l'algorithme

### 8.0 Principes

- **Terrains** : la cible vient de la **formule de Karsten** [M], bornée par les données observées [D] et les gabarits [E].
- **Autres catégories** :
  - **min** = valeur sous laquelle on alerte. C'est en gros le quartile bas observé, ou la valeur basse des experts.
  - **cible** = point de convergence entre experts et médiane observée.
  - **max** = valeur au-delà de laquelle on signale un excès (cartes « mortes », parties qui traînent).
- **Une carte peut compter dans plusieurs catégories** (règle de The Command Zone). Les seuils s'appliquent à chaque catégorie séparément, pas à une somme qui devrait faire 99.

### 8.1 Formule des terrains (prête à coder)

```js
// Karsten, version 99 cartes (INDIRECT, coefficients recalculés : (19.59+0.27)*99/60 - 1.35 = 31.42 ; 1.90*99/60 = 3.13)
// avgMV : MV moyenne des 99 cartes hors terrains (commandant exclu ; MDFC sort//terrain = MV de la face avant)
// nCheap : nb de cartes non-terrain MV <= 2 qui sont de la rampe (ajoute du mana / cherche un terrain / met un terrain)
//          ou de la pioche (« draw ») — chaque carte comptée une seule fois
function karstenLands(avgMV, nCheap) {
  return 31.42 + 3.13 * avgMV - 0.28 * nCheap;
}
// Compte des terrains existants : terrain = 1 ; MDFC non-mythique = 0.38 ; MDFC mythique = 0.74 (Karsten, INDIRECT)
function landTargets(avgMV, nCheap, bracket) {
  const raw = karstenLands(avgMV, nCheap);
  if (bracket === 5) {                       // cEDH : la formule surestime (~ +3 à +4) ; observé 29–32, médiane 30 [D]
    return { min: 27, target: Math.round(Math.min(raw - 3.5, 32)), max: 33 };
  }
  const target = Math.round(Math.min(Math.max(raw, 34), 42)); // 42 = optimum Karsten commandants 2–3 MV sans rampe
  return {
    min: Math.max(bracket === 4 ? 32 : 34, target - 3), // alerte en dessous ; 34 = Q1 observé B2–B3 [D]
    target,
    max: Math.min(target + 3, 44),
  };
}
```

**Garde-fous de comptage :**

- Additionner les sources de mana totales, soit terrains + `ramp-core` (sans les rituels), et alerter sous **45** en B2–B3. Repères : MTGGoldfish 50, The Command Zone 48, médiane observée 47–48.
- Ne pas descendre sous **37** terrains pour un midrange « moyen » (Karsten) sans au moins 8 rampes MV ≤ 2.
- Pour un **commandant de MV ≥ 5**, Karsten recommande des rocks à 2 mana : 7 à 9 rocks pour 38–39 terrains.

### 8.2 Tableau des sources de couleur (prêt à coder)

```js
// Karsten 2022, colonne 99 cartes (INDIRECT ; lignes marquées * vues une seule fois). Probabilité visée : (89 + MV) %.
// clé = motif de coût réduit à UNE couleur : nombre de mana générique (ou d'autres couleurs) + nombre de symboles de la couleur
// turn = MV (on veut lancer le sort au tour égal à sa MV)
const KARSTEN_SOURCES_99 = {
  // 1 symbole
  'C':     { turn: 1, sources: 19 },
  '1C':    { turn: 2, sources: 19 },
  '2C':    { turn: 3, sources: 18 },
  '3C':    { turn: 4, sources: 16 },
  '4C':    { turn: 5, sources: 15 },
  '5C':    { turn: 6, sources: 14 },
  // 2 symboles
  'CC':    { turn: 2, sources: 30 },
  '1CC':   { turn: 3, sources: 28 },
  '2CC':   { turn: 4, sources: 26 }, // *
  '3CC':   { turn: 5, sources: 23 }, // *
  // 3 symboles
  'CCC':   { turn: 3, sources: 36 },
  '1CCC':  { turn: 4, sources: 33 }, // *
  '2CCC':  { turn: 5, sources: 30 }, // *
  // 4 symboles
  'CCCC':  { turn: 4, sources: 39 }, // *
};
// Au-delà (MV 7+ avec 1 symbole) : extrapoler en conservant 14 (borne basse prudente).
// Pour chaque couleur X : besoin = max sur les cartes « importantes » (commandant inclus) de KARSTEN_SOURCES_99[motif(X)].
// Ces cibles supposent 41 terrains ; avec moins de terrains, les rocks et dorks deviennent indispensables pour les atteindre.
```

**Pondération d'une carte comme source de la couleur X :**

| Carte | Poids | Statut |
|---|---|---|
| Terrain dégagé qui produit X ; Command Tower | 1 | Règle de base |
| Terrain engagé qui produit X | 1 pour les sorts MV ≥ 2, 0 pour les sorts au tour 1 | Karsten, INDIRECT |
| Fetchland qui peut trouver X | 1 en bicolore ; 0,67 par couleur en 3 couleurs ou plus | Karsten, INDIRECT |
| Mana dork qui produit X | 0,5 pour les sorts MV ≥ 2 | Karsten, INDIRECT |
| Rock coloré à MV ≤ 2 (Signet, Talisman, Arcane Signet) | 0,5 pour les sorts MV ≥ 3 | **Extrapolation Mana Orbit**, pas Karsten |
| Rampe à 3 mana (Cultivate, Kodama's Reach) | 0,5 pour les sorts MV ≥ 4 | Karsten, INDIRECT |
| Exotic Orchard | 0,75 de toute couleur | Valeur prudente, sources contradictoires, NON VÉRIFIÉ |
| Fellwar Stone | 0,5 de toute couleur, sorts MV ≥ 3 | Valeur prudente, sources contradictoires, NON VÉRIFIÉ |

### 8.3 Cibles par catégorie : deck « casual », brackets 2–3

Les tags Scryfall de chaque catégorie sont dans `tagger-tags.json`.

| Catégorie | Définition (tags) | min | **cible** | max | Justification |
|---|---|---|---|---|---|
| **Terrains** | type Land ; MDFC à 0,38 ou 0,74 | formule − 3 (≥ 34) | **formule de Karsten** (≈ 38 pour MV 3,0 et 8 cartes bon marché) | formule + 3 (≤ 44) | [M] Karsten ; [D] médiane 35–36 ; [E] The Command Zone 38, MTGGoldfish 37, Brian Cain 36–38 |
| **Sources de mana totales** | terrains + rampe core | 45 | **48** | 53 | [E] MTGGoldfish 50, The Command Zone 38 + 10 ; [D] 47–48 |
| **Rampe** (permanente) | `mana-rock` ∪ `mana-dork` ∪ `land-ramp` ∪ `extra-land` ∪ `mana-increaser`, sans `removal` ni rituels | 8 | **10** | 15 | [E] The Command Zone 10 (2025), 10–12 (2021) ; MTGGoldfish 10–15 ; [D] médiane 12 (Q1 9) |
| dont rampe MV ≤ 2 | idem, avec MV ≤ 2 | 5 | **7** | – | [D] médiane 7–8 ; [E] Dana Roach (rampe ≤ 2) ; [M] chaque carte vaut 0,28 terrain |
| **Pioche / avantage de cartes** | `draw` sans `cantrip` seul, plus `impulsive-draw` et `impulse` si le deck exploite l'exil | 8 | **10–12** | 18 | [E] The Command Zone 12 (2025) / 10 (2021), MTGGoldfish 10 ; [D] `draw` 10, avantage 13–15 |
| **Retraits ciblés** | `removal` sans `sweeper`, contresorts exclus | 5 | **8** | 12 | [D] médiane 8 (Q1 6) ; [E] Draftsim 8–10, MTGGoldfish 6, The Command Zone 2021 10–12 |
| **Balayages** | `sweeper` | 1 | **3** | 5 | [E] MTGGoldfish 3, Draftsim 3–5, Card Kingdom 3–4 ; [D] médiane 2 (Q3 4) |
| **Interaction totale** | ciblés + balayages + contresorts | 10 | **12–15** | 20 | [D] médiane 12 (10–15) ; [E] Draftsim 15–20 ; The Command Zone 12 + 6 au sens large |
| **Contresorts** | `counterspell` ; seulement si du bleu est dans l'identité | 0 | **2–3** | 6 | [D] decks bleus : B2 2, B3 3 (Q3 5) |
| **Tuteurs** | `tutor` sans `tutor-land` | 0 | **1–2** | 3 (B2), 5 (B3) | [D] médiane 1 (Q3 2) ; [E] MTGGoldfish 2 ; [O] plus de limite officielle, mais les tuteurs Game Changers comptent dans le quota |
| **Protection** | `protection` (gives-hexproof, gives-indestructible, protects-all, phasing…) | 2 | **4** | 8 | [D] médiane 3,5–4 (Q1 2) ; [E] The Command Zone la range en ciblé ou masse |
| **Récursion** | `recursion` | 1 | **2–3** | 6 | [D] médiane 3 ; [E] MTGGoldfish 2 |
| **Anti-cimetière** | `hate-graveyard` | 0 | **1** | 3 | [E] MTGGoldfish 1, Dana Roach ; [D] médiane 1 |
| **Conditions de victoire** | `alternate-win-condition` ∪ `overrun` ∪ `extra-combat-phase` + heuristiques maison (drain, gros finishers) | 1 | **2–4** | – | [E] MTGGoldfish « 1 I win », The Command Zone « Plan » ; [D] les tags n'en captent que 0–1 : ne pas sur-alerter |
| **Plan / synergie** | cartes à forte `synergy` ou `lift` EDHREC pour ce commandant ou thème | 20 | **25–30** | – | [E] The Command Zone 30 (2025), « ~30 » (2021) |
| **Game Changers** | liste officielle (53) | – | – | **B2 : 0 ; B3 : 3** | [O] |
| **Destruction massive de terrains** | `mass-land-denial` | – | – | **0** | [O] interdit en B1–B3 |
| **Tours supplémentaires** | `extra-turn` | – | – | B2–B3 : 1–2, sans enchaînement ; B1 : 0 | [O] |
| **Combos à 2 cartes** | API Commander Spellbook | – | – | B2 : 0 ; B3 : aucun combo rapide avant le tour 6 | [O] |
| **Courbe** | MV moyen hors terrains | – | **2,8–3,3** | 3,6 | [D] médiane B2–B3 3,0–3,1 (Q1–Q3 2,8–3,3) ; MtGDS : 15–16 cartes à 2 MV et 15 à 3 MV |

### 8.4 Ajustements par bracket

Les écarts sont exprimés par rapport à la colonne « cible » ci-dessus.

| Catégorie | **B1 Exhibition** | **B4 Optimized** | **B5 cEDH** |
|---|---|---|---|
| Terrains | +0 à +1 (médiane 36–36,5) [D] | −1 (médiane 34,5) ; min 32 [D] | **28–32, cible 30** ; formule − 3,5 [D] ; MTGGoldfish « ~30 » [E] |
| Rampe | idem | +1 à +2, dont MV ≤ 2 ≥ 9 [D] | **15–20, dont MV ≤ 2 ≥ 12** (médiane 13) [D] ; MTGGoldfish 16–20 [E] |
| Pioche | idem | −1 | 8–10 de pioche efficace, souvent à MV ≤ 2 [D] |
| Retraits ciblés | idem | 7 (−1) | 6 (4–9) [D], interaction bon marché |
| Balayages | 2 | 3 [D] | 1–2 [D] |
| Contresorts (bleu) | 1–2 | **4 (3–6)** [D] | **9 (7–10)** [D], dont gratuits (Force of Will, Fierce Guardianship) |
| Tuteurs | 0–1 [D] | **3–5** (médiane 4) [D] | **7–12** (médiane 10) [D] |
| Protection | 3 | 4 | 3 |
| MV moyen | ≈ 3,0 | **≈ 2,85** (2,6–3,1) [D] | **≈ 2,3** (2,1–2,5) [D] |
| Game Changers | 0 (exception thématique) [O] | illimité ; médiane observée 6–7 [D] | illimité ; médiane 15 [D] |
| Combos, destruction de terrains, tours supplémentaires | **aucun** [O] | autorisés [O] | autorisés [O] |
| Tours avant de gagner ou perdre | ≥ 9 [O] | ≥ 4 [O] | n'importe lequel [O] |

### 8.5 Ajustements selon le coût moyen du deck

| MV moyen hors terrains | Terrains | Rampe | Autres |
|---|---|---|---|
| ≤ 2,4 | formule (≈ 35–37 avec 8–12 cartes bon marché) ; jusqu'à −3 si la rampe rapide est massive (cEDH) | 8–12, à MV ≤ 2 | Profil combo, stax ou storm [D] : plus de tuteurs et de contresorts |
| 2,5 – 3,4 (standard) | formule (≈ 37–40) | 10 | Tableau 8.3 tel quel |
| 3,5 – 3,9 | formule (≈ 39–41) | **12–15**, dont rocks à 2 et rampe à 3 mana qui en produit 2 ou plus | Karsten : commandant à 5–6 MV = 38–39 terrains + 8–9 rocks à 2 [M] ; profil big-mana [D] : rampe 16,5 |
| ≥ 4,0 | formule plafonnée à 42–44 ; alerter sur la courbe | 15 ou plus | Le coach doit d'abord suggérer de **baisser la courbe** : la médiane observée est de 3,0, et un MV moyen ≥ 4 dépasse le Q3 de tous les thèmes sauf big-mana |

**Ajustement par la MV du commandant** (Karsten, [M]) :

- Commandant à 2–3 MV : 42 terrains sans rocks, puis −1 terrain pour 2–3 rocks.
- Commandant à 4 MV : 39 terrains + Sol Ring + 7 rocks.
- Commandant à 5 MV : 39 terrains + Sol Ring + 8 rocks.
- Commandant à 6 MV : 38 terrains + Sol Ring + 9 rocks.
- Prévoir aussi peu de cartes au coût exact du commandant ; la pratique observée ne le fait pas (MtGDS).

### 8.6 Ajustements par archétype

Les chiffres [D] sont les médianes des decks moyens des 24 commandants les plus associés à chaque thème EDHREC (section 3.5). Les autres valeurs restent celles du tableau 8.3.

| Archétype (tag EDHREC) | Terrains | Rampe | Pioche | Retraits ciblés | Balayages | Contresorts | Tuteurs | Protection | Autres | Justification |
|---|---|---|---|---|---|---|---|---|---|---|
| **Aggro** (`aggro`) | −1 à −2 (34–35) | 8–10 | 8 | 8 | **0–2** | 0–1 | 1–2 | **5–6** | MV ≤ 2,9 ; 2 finishers (`overrun`, `extra-combat-phase`) | [D] aggro : 35 terrains, rampe 9,5, protection 5,5, balayages 2 ; [E] Draftsim : moins de balayages en deck de créatures |
| **Contrôle** (`control`) | −1 (34) | 9–10 | **13–15** | 8 | **3–5** | **6–10** (si bleu) | 3 | 3 | – | [D] control : pioche 13, balayages 3,5, contresorts 8, terrains 34 ; [E] MTGGoldfish +1 balayage si peu de créatures ; Draftsim : plus de balayages en contrôle |
| **Combo** (`combo`) | **−3 à −4 (31–33)** | 12–15, dont MV ≤ 2 ≥ 10 | 9 | 7 | 1–2 | 4–8 (si bleu) | **6–10** | 2–3 | MV ≈ 2,4 ; **combos interdits en B1–B2, pas de combo rapide en B3** [O] | [D] combo : 31,5 terrains, tuteurs 7, contresorts 5,5, MV 2,37 |
| **Terrains / landfall** (`landfall`) | **+2 à +4 (38–40)** | **18–25**, rampe par terrains surtout | 8 | 5–6 | 1–2 | – | 1–2 | 2 | Récursion de terrains 4–10 (`recursion-land`, `extra-land`) ; fetchlands bienvenues | [D] landfall : 39 terrains, rampe core 24,5, récursion 7,5 ; [E] gabarits : plus de terrains pour landfall |
| **Spellslinger** (`spellslinger`) | −1 à −2 (34) | 8–10, plutôt rocks et réducteurs de coût | **15–20** (cantrips compris) | 9–10 | 3 | 3–5 (si bleu) | 1 | 2 | Rituels autorisés en plus de la rampe ; MV ≈ 2,6 ; viser 30 rituels / instants / sorcery ou plus | [D] spellslinger : `draw` 18,5, avantage 22, terrains 34, MV 2,61 |
| **Voltron** (`voltron`) | 35 | 8–10 | 8 | 7 | 2 | 0–2 | **3–6** (tuteurs d'équipement et d'aura) | **10–14** | 10–15 équipements ou auras ; MV ≈ 2,6 | [D] voltron : protection 12, tuteurs 3,5 (Q3 6), rampe 8,5, MV 2,63 |
| **Tokens** (`tokens`) | 35–36 | 10–11 | 9–10 | 7 | 2, de préférence unilatéraux (`sweeper-one-sided`) | 0–2 | 1–2 | 4 | `repeatable-token-generator` ≥ 10 ; 2–3 `anthem` ou `overrun` | [D] tokens : rampe 11, protection 4, balayages 2 ; [E] Draftsim : balayages synergiques (Hour of Reckoning) |
| *Aristocrats* (bonus) | 35 | 8–10 | 11 | 9 | 3–4 | – | 2 | 1–2 | `sacrifice-outlet` ≥ 3 ; récursion 4–8 ; `drain-life` | [D] aristocrats : récursion 4,5, balayages 3,5 |
| *Stax* (bonus) | 33 | 10 | 9 | 7 | 2–3 | 4–6 | 5 | 3 | `hatebear`, `tax` ; **destruction massive de terrains interdite en B1–B3** [O] | [D] stax |

### 8.7 Règles de comptage (pour le code)

1. **Multi-catégorie** : une carte compte dans **toutes** les catégories où elle apparaît (The Command Zone 2025 : total 108 pour 99 cartes). Pour l'affichage « rôle principal », retenir la catégorie la plus déficitaire du deck, ou à défaut l'ordre de priorité ci-dessous.
2. **Ordre de priorité du rôle principal** : terrain > rampe > retrait ou balayage > contresort > pioche > tuteur > protection > récursion > plan.
3. **Les terrains ne comptent jamais comme « sorts »**, même tagués `ramp` (bouncelands) ou `removal` (Maze of Ith). Les MDFC comptent comme terrain avec les poids 0,38 ou 0,74, et leur face sort compte aussi dans son rôle.
4. **Exclusions** :
   - `cantrip` seul ne compte pas comme pioche (« replace effect », The Command Zone).
   - `ritual` ne compte pas comme rampe permanente.
   - `tutor-land` sans autre tag `tutor` compte en rampe, pas en tuteur.
   - Une carte `ramp` qui est aussi `removal` (Path to Exile) n'est pas de la rampe pour soi.
5. **« Cheap » pour la formule des terrains** : MV ≤ 2, non-terrain, rampe (production de mana ou terrain) **ou** pioche, sans double comptage (Karsten).
6. **Couleurs** : ne compter que les cartes jouables dans l'identité du commandant. Les contresorts ne sont attendus que si U ∈ identité. Balayages : W, B, R (+ incolore) en priorité ; un deck mono-vert à 0–1 balayage est normal.
7. **Brackets** :
   - Compter les Game Changers (liste 4.3), `mass-land-denial` et `extra-turn`.
   - Faire appel à l'API Commander Spellbook (`estimate-bracket`) pour les combos.
   - En B1–B2 : 0 Game Changer, 0 combo à 2 cartes. En B3 : au plus 3 Game Changers.

### 8.8 Pseudo-code de synthèse

```js
function coach(deck, bracket, archetype) {
  const s = stats(deck);  // avgMV, nCheap, comptes par rôle (tags Scryfall, règles 8.7), sources par couleur
  const T = baseTargets();                 // tableau 8.3
  applyBracket(T, bracket);                // tableau 8.4
  applyCurve(T, s.avgMV);                  // tableau 8.5
  applyArchetype(T, archetype);            // tableau 8.6 (archétype déduit des tags EDHREC du commandant si absent)
  T.lands = landTargets(s.avgMV, s.nCheap, bracket);   // 8.1
  const issues = [];
  for (const [role, t] of Object.entries(T)) {
    if (s[role] < t.min) issues.push({ role, kind: 'manque', delta: t.target - s[role] });
    else if (t.max != null && s[role] > t.max) issues.push({ role, kind: 'excès', delta: s[role] - t.max });
  }
  for (const color of deck.identity) {      // 8.2
    const need = maxNeed(deck, color);      // max KARSTEN_SOURCES_99 sur commandant + sorts clés
    if (s.sources[color] < need) issues.push({ role: 'sources-' + color, kind: 'manque', delta: need - s.sources[color] });
  }
  checkBracketRules(deck, bracket, issues); // 4.2 + Commander Spellbook
  // Suggestions : pour chaque manque, proposer les cartes du rôle triées par synergy/lift EDHREC du commandant
  // (pages/commanders/<slug>[/<bracket>].json), filtrées par identité, budget et Game Changers autorisés.
  return issues.sort(byPriority);
}
```

---

## 9. Bibliographie (par date)

- 2019-02-20 – Dana Roach, [Superior Numbers – Land Counts](https://edhrec.com/articles/superior-numbers-land-counts), EDHREC.
- 2019-12-04 – Dana Roach, [Superior Numbers – Breaking Down the Top 100](https://edhrec.com/articles/superior-numbers-breaking-down-the-top-100), EDHREC.
- 2020-01-29 – Dana Roach, [Superior Numbers – The Anatomy of an Upgrade](https://edhrec.com/articles/superior-numbers-the-anatomy-of-an-upgrade), EDHREC.
- 2020-02-19 – Dana Roach, [Superior Numbers – The Truth Behind Three Truisms](https://edhrec.com/articles/superior-numbers-the-truth-behind-three-truisms), EDHREC.
- 2020-03-11 – Tomer Abramovici, [The Power of a Deckbuilding Checklist](https://www.mtggoldfish.com/articles/the-power-of-a-deckbuilding-checklist-commander-quickie), MTGGoldfish.
- 2020-08-12 – Dana Roach, [Superior Numbers – Wondering What Wipes Wreck What](https://edhrec.com/articles/superior-numbers-wondering-what-wipes-wreck-what), EDHREC.
- 2021-03-27 – Bennie Smith, [Let's Talk About Lands Again](https://articles.starcitygames.com/magic-the-gathering/select/lets-talk-about-lands-again/), StarCityGames.
- 2021-05-15 – Jazzelo (transcription The Command Zone), [Commander Deck Template](https://archidekt.com/decks/1432712), Archidekt.
- 2022 – Frank Karsten, [How Many Sources Do You Need to Consistently Cast Your Spells? A 2022 Update](https://infinite.tcgplayer.com/article/How-Many-Sources-Do-You-Need-to-Consistently-Cast-Your-Spells-A-2022-Update/dc23a7d2-0a16-4c0b-ad36-586fcca03ad8/), ChannelFireball → TCGplayer (maj 13 fév. 2025).
- 2022-04-14 – MtGDS, [Paradigm Shift – How Your Commander's Mana Value Alters Your Curve](https://edhrec.com/articles/paradigm-shift-how-your-commanders-mana-value-alters-your-curve), EDHREC.
- 2022-06-13 – Kristen Gregory, [You Should Be Playing More Board Wipes](https://blog.cardkingdom.com/you-should-be-playing-more-board-wipes/), Card Kingdom.
- 2023 – Frank Karsten, [What's an Optimal Mana Curve and Land/Ramp Count for Commander?](https://infinite.tcgplayer.com/article/What-s-an-Optimal-Mana-Curve-and-Land-Ramp-Count-for-Commander/e22caad1-b04b-4f8a-951b-a41e9f08da14/), ChannelFireball → TCGplayer (maj 2025).
- 2024 – Frank Karsten, [How Many Lands Do You Need in Your Deck? An Updated Analysis](https://infinite.tcgplayer.com/article/How-Many-Lands-Do-You-Need-in-Your-Deck-An-Updated-Analysis/cd1c1a24-d439-4a8e-b369-b936edb0b38a/), ChannelFireball → TCGplayer (maj 13 fév. 2025).
- 2024-02-22 – A.L. Walser, [How Much Removal Should You Really Play in Commander?](https://draftsim.com/edh-how-much-removal/), Draftsim.
- 2024-11-25 – Brian Cain, [How to Build a Commander Deck](https://edhrec.com/articles/how-to-build-a-commander-deck), EDHREC.
- 2025-01-03 – EDHREC (Commander Cookout), [Are YOU Playing Enough Lands?](https://edhrec.com/articles/commander-cookout-are-you-playing-enough-lands), avec les références datées des articles de Karsten.
- 2025-02-11 – Gavin Verhey, [Introducing Commander Brackets Beta](https://magic.wizards.com/en/news/announcements/introducing-commander-brackets-beta), Wizards.
- 2025-02-21 – ZeroWr (transcription The Command Zone et Rachel Weeks), [Commander Deck Template](https://archidekt.com/decks/11526451), Archidekt.
- 2025-04-22 – Gavin Verhey, [Commander Brackets Beta Update](https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-april-22-2025), Wizards.
- 2025-07-11 – A.L. Walser, [How Many Board Wipes Should You Really Play in Commander?](https://draftsim.com/edh-how-many-board-wipes/), Draftsim.
- 2025-09-08 – Cas Hinds, [Should You Run More Removal in Commander?](https://edhrec.com/articles/should-you-run-more-removal-in-commander), EDHREC.
- 2025-10-21 – Gavin Verhey, [Commander Brackets Beta Update](https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-october-21-2025), Wizards.
- 2026-01-26 – John Sherwood, [The EDHREC Guide to Ramp in Commander](https://edhrec.com/guides/the-edhrec-guide-to-ramp-in-commander), EDHREC.
- 2026-02-09 – Gavin Verhey, [Commander Brackets Beta Update](https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-february-9-2026), Wizards.
- Consultée le 2026-11-02 – Wizards, [Commander format page (brackets, Game Changers)](https://magic.wizards.com/en/formats/commander) ; [mtg.wiki – Commander Brackets](https://mtg.wiki/page/Commander_Brackets) ; [Scryfall Tagger tags](https://scryfall.com/docs/tagger-tags) ; [Scryfall Tags API](https://scryfall.com/docs/api/tags) ; JSON `json.edhrec.com` ; API `backend.commanderspellbook.com`.
