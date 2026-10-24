# Audit : compteur de vie, parties et statistiques

Périmètre : `src/partie.js`, `src/partie-ui.js`, `src/partie-qr.js`, `src/css/partie.css`, `src/css/partieqr.css`, « Mes parties » et les statistiques. J'ai lu en entier la section du README (l. 415-483).
Méthode : vrai `proxy.mjs`, faux Firebase (`amis-fakes`) et Playwright, sur les ports 19600 à 19609.

- Les illustrations de fond sont **synthétiques** : `cards.scryfall.io` est bloqué par le proxy. Ce sont des images claires et chargées, donc un cas difficile pour la lisibilité.
- Je n'ai modifié aucun fichier du dépôt.

Dossier des captures : `/tmp/claude-0/-home-user-manaorbit/15f70d1d-7785-5c9d-9985-8c1381d82b88/scratchpad/partie/`, noté `P/` ci-dessous.

- **630 dispositions** : 3 formats × 2 à 8 joueurs × affichages A, B, C × 5 appareils × portrait et paysage. Fichiers dans `P/raw/<appareil>-<orientation>/<format>-<n>-<affichage>.jpg`, une planche par appareil et par format dans `P/planches/disp-<appareil>-<orientation>-<format>.jpg`.
- **Métriques** pour chaque disposition : taille des PV, du nom, des cibles, chevauchements, noms coupés. Fichiers `P/metrics.txt` et `P/layouts-all-*.json`.
- **170 écrans hors compteur** : préparation, fiche, menu, proposition d'élimination, fin, Mes parties, statistiques, QR joueur, rejoindre. Fichiers dans `P/screens/<appareil>-<orientation>/`, planches `P/planches/screens-*.jpg` et `P/s393-{a,b,c}.jpg`.
- **Plusieurs téléphones** (5 contextes de navigateur) : `P/multi/*.png`, planches `P/planches/multi-{a..e}.jpg`. Mode sombre : `P/planches/dark.jpg`.
- **Tests fonctionnels** : `P/func.txt` (appui simultané avec plusieurs doigts via CDP, appui long, annulation, clavier, rechargement), `P/multi.txt` (temps de réponse, cibles), `P/apkwake.mjs` (WebView Android simulée).
- **Scripts** : `P/layouts.mjs`, `P/screens.mjs`, `P/func.mjs`, `P/multi.mjs`, `P/dark.mjs`, `P/navcheck.mjs`, `P/apkwake.mjs`.
- **Erreurs console** : aucune dans les 630 dispositions, les écrans, le scénario à 5 téléphones et le mode sombre.

---

## 1. Bilan des dispositions (PV, cibles, noms)

Abréviations : PV = taille de police des points de vie (en px CSS ; 1 px vaut environ 0,18 mm sur un téléphone de 393 px), « cible ± » = moitié de tuile vue par son joueur, « coupés » = noms tronqués. Dispositions : A = tourné vers chacun, B = liste, C = table.

| Appareil | A, PV min (n = 2→8) | B, PV min | C, PV min | Remarques |
|---|---|---|---|---|
| 360 portrait | 182 124 86 120 69 79 69 | 182→61 | 182 puis 52 | A : cibles ≥ 94×171. B : commandant masqué dès 5 joueurs. C : colonnes latérales à 52 px, noms coupés à 3, 5, 6, 7 et 8 joueurs |
| 393 portrait | 200 143 105 136 105 91 88 | 200→68 | 61 | Bon. Capture de référence : `P/raw/393-portrait/commander-8-A.jpg` |
| 412 portrait | 200→98 | 200→73 | 67 | Bon |
| Tablette 820×1180 | 200 (plafond)→143 | 200→97 | 191→140 | Nom plafonné à **18 px** et « Fin du tour » à 15 px : petits à 1 m sur tablette (`P/multi/24-duo8-ecran2-820x1180.png`) |
| PC 1280×800 | 200→82 | 200→63 | 200→97 | A (tuiles tournées) est l'affichage par défaut sur PC, alors qu'un écran d'ordinateur n'est pas posé au milieu de la table |
| **360 paysage** | **50 50 68 31 31 26 26** | 106→**26** | 83→40 | **A illisible** : noms réduits à « H… », « M… » (8 sur 8 coupés à 8 joueurs), cibles de 41 px, PV à 26 px. B : cibles de 32 à 38 px de haut, nom qui sort de la tuile à 7 et 8 joueurs. Captures `P/planches/360-paysage-commander-A.jpg`, `P/raw/360-paysage/commander-6-A.jpg` |
| 393 et 412 paysage | 69 à 80 puis 26 | 118 puis 26 à 28 | 95 à 101 puis 44 à 47 | Mêmes défauts qu'à 360 |
| Tablette et PC paysage | 200 puis 82 à 85 | 200 puis 63 à 65 | 200 puis 97 à 106 | Correct |

- **Les formats changent peu la mise en page.** Standard et Libre ont la même grille que Commander. Seules 8 dispositions sur 420 ont des PV de taille différente, à cause des pastilles absentes (pas de blessures de commandant).
- **Aucun chevauchement** et aucun bouton rond posé sur un nom ou des PV, sur aucune des 630 dispositions : la vérification par boîtes englobantes tient partout.
- **La taille des PV dépend du tour.** La tuile qui joue perd environ 30 % de PV à cause de « Fin du tour » : à 360 px et 4 joueurs en A, elle affiche 86 px, les autres 120 px. Les PV changent de taille à chaque tour (`P/raw/360-portrait/commander-4-A.jpg`).
- **Les PV touchent le bord de la tuile** en A à 3 et 4 joueurs en portrait : les chiffres « 40 » sont collés au bord (cas `lOut` dans les métriques). Le coefficient `.64` de `.pu-life` est un peu fort.
- **Orientation vers chaque joueur.** Seul A oriente les tuiles vers les joueurs (0°, 90°, 180°, 270°).
  - B et C sont droits pour tout le monde : les joueurs d'en face lisent à l'envers.
  - C ressemble à une table mais ne tourne rien. Sa colonne du milieu (« Tour 1 / Martin ») prend 13 % de la largeur pour presque rien.
- **Signes − et + peu visibles** : blanc à 55 %, graisse 300. Sur une illustration claire, on les distingue à peine (toutes les planches A). Rien n'indique non plus l'appui long ±10.
- **Ordre des joueurs différent selon l'affichage** : en B, la liste commence par la place 1 (« moi ») en haut ; en A et C, « moi » est en bas.

## 2. Bugs (a)

| # | Constat | Repro / preuve | Proposition | Impact | Effort |
|---|---|---|---|---|---|
| B1 | **Deux joueurs qui touchent en même temps : un appui est perdu, ou mis sur la mauvaise tuile.** `PU.hold` ne garde qu'un seul appui à la fois (`partie-ui.js:397-406`). Le `pointerdown` du 2e doigt appelle `puCancel()` et efface celui du 1er. Au relâché du 1er, `puUp` applique le geste du 2e. | `P/func.txt` : A appuie, B appuie, A relâche → seul B −1 compte. 4 doigts presque ensemble (balayage de plateau, chacun retire sa vie) : 40,40,40,40 → 40,40,40,**39**. B qui touche pendant l'appui long de A : l'appui long de A est annulé. | Garder un appui par `pointerId` (`Map`), pour le ±1 comme pour la répétition. | **Fort** (Commander : tout le monde compte en même temps) | S |
| B2 | **L'écran n'est pas gardé allumé dans l'appli Android.** Le compteur (`partie-ui.js:96-100`), la table en direct et l'écran 2 (`:808`), et « Mon QR joueur » (`partie-qr.js:85`) n'utilisent que `navigator.wakeLock`. D'après `native.js:20-33`, le WebView n'a pas cette API ; il faut passer par `natAwake` (plugin `keepAwake`). | `P/apkwake.mjs` (WebView simulée sans `wakeLock`, plugin présent) : compteur ouvert → **0 appel à `keepAwake`**. Le README promet « écran gardé allumé ». | Remplacer `puWake` et les verrous de `puJoin` et `puMyQr` par `natAwake(true/false)`. | **Fort** (le téléphone posé au milieu se met en veille) | S |
| B3 | **Paysage non géré.** Aucun verrou d'orientation : pas de `screenOrientation` dans le manifeste Android, aucun `screen.orientation.lock`. Un téléphone posé à plat peut basculer, et A devient illisible (§1). | `P/planches/360-paysage-commander-A.jpg`, `P/multi/23-duo8-hote-852x393.png` | Verrouiller le portrait pendant le compteur : plugin natif `setRequestedOrientation`, et `screen.orientation.lock` en plein écran pour la PWA. Ou un A « transposé » en paysage, avec les joueurs sur les grands côtés (rangées 0° / 180°). | Fort | S (verrou) / M (A paysage) |
| B4 | **Le bandeau d'élimination proposée** (`.pu-prop`, `partie.css:215`) couvre le **« Fin du tour »** et les zones ± des tuiles du bas tant qu'on n'y a pas répondu. Il est tourné vers le seul hôte : le joueur concerné, en haut, ne le lit pas. | `P/func-extremes.png` ; `P/func.txt` : il couvre « 1 hit p, 4 hit m ». | Placer la proposition **dans la tuile concernée**, tournée vers son joueur, avec « Éliminer / Pas encore ». À défaut, la mettre en haut et réduire la grille. | Moyen | S-M |
| B5 | **4 chiffres de PV qui débordent.** `partieLife` borne à 9999 (`partie.js:198`) mais `.pu-life.l3` (`partie.css:185`) ne réduit qu'à 0,7. À 1000, le nombre passe sur le « − » et sort de la tuile. | `P/func-extremes.png` | Un `l4` à environ 0,5, ou un plafond à 999 comme les points de départ en Libre. | Faible | S |
| B6 | **Clavier : le focus est perdu après chaque ±1.** `puPaintTile` remplace l'élément (`:390-395`) et le focus revient à `<body>`. Aucun raccourci (flèches, N pour le tour suivant, Ctrl+Z) sur ordinateur. | `P/func.txt` (Entrée puis Espace : un seul +1), `P/dark.mjs` → `focus après Entrée : BODY` | Remettre le focus sur la nouvelle `.pu-hit` ; ajouter des raccourcis sur PC. | Faible (PC, accessibilité) | S |
| B7 | **PC : la barre latérale passe par-dessus le compteur** pendant 0,5 à 2,5 s quand on le rouvre (« Reprendre », `body.nav-on`). | `P/navcheck.mjs` : élément sous le pointeur = `nav-b` ; capture `P/raw/pc-paysage/commander-4-C.jpg` | Retirer `nav-on` dans `holdApp()` sans délai, ou donner un `z-index` à `.pu` au-dessus de la barre. | Faible | S |
| B8 | **Place des joueurs non modifiable** en préparation. Le moteur et le serveur ont `partieMovePlace` / `move` (et le README dit « déplace »), mais l'interface n'a que « × Retirer ». L'ordre d'ajout fixe l'ordre du tour et la position dans A. | `P/screens/393-portrait/03-preparation-bas.jpg` | Glisser-déposer, ou flèches ↑/↓ sur chaque place, et un **plan de la table** cliquable (comme `puDuoMapSheet`). | **Fort** (une erreur d'ordre se paie toute la partie) | M |
| B9 | **L'hôte sans pseudo s'appelle « Moi »** (`puMe`, `partie-ui.js:40`). Ce nom part dans le résultat, le QR du résultat et l'historique des autres (« Moi, Léa, Anne-Charlotte… »). | `P/screens/393-portrait/13-mes-parties.jpg` | Demander un prénom à la 1re partie, ou écrire « Hôte ». | Faible | S |
| B10 | **Thème qui change pendant que la table en direct est ouverte** : les boutons fantômes restent clairs avec un texte clair, illisibles. Au lancement en sombre, tout est correct ; c'est probablement une transition. | `P/multi/16-bob-direct-sombre-360.png` contre `P/dark/03-direct-sombre.png` | Vérifier la `transition` des `.btn.ghost` au changement de thème. | Faible | S |

## 3. UI/UX (b)

1. **La fiche et le menu ne sont lisibles que par l'hôte.** Les feuilles sont droites, en bas : un joueur assis à 90° ou 180° doit se tordre le cou. Proposition : ouvrir la fiche **dans la tuile**, tournée de `--r` (comme Lifetap). Impact fort, effort M.
2. **Blessures de commandant trop longues à saisir.** Il faut 9 touchers pour 7 blessures : ouvrir la fiche, 7 × « + », fermer. Les « − / + » font **30×36 px**, et 28×36 px à 360 px (`style.css:281,824`), sans appui long.
   - Ajouter ±5 et l'appui long à la fiche.
   - Ajouter un **mode « attaque »** : toucher l'attaquant, puis ±1 sur chaque défenseur, avec les PV et les blessures en même temps (TurnZero : glisser).
   - Impact fort, effort M.
3. **Cibles < 44 px** (relevé dans `P/screens-all.json`) : steppers de la fiche (28 à 30 × 36), puces Monarque / Initiative (34 px), « Premier joueur » (34), places de la salle (34), « Ma fiche » sur la table en direct (199×**26**), « Fin du tour » (32 px d'épaisseur), × Retirer (34). Les ± du compteur sont larges partout sauf en paysage. Impact moyen, effort S.
4. **Signes ± : plus d'opacité et de graisse**, avec un léger halo, et une indication de l'appui long à la 1re partie (« Maintiens : ±10 »). L'appui long accélère vite (−10 / 0,5 s : 3 s = −60). Un compteur « −13 » pendant l'appui aiderait. Impact moyen, effort S.
5. **Taille des PV stable.** Laisser la place de « Fin du tour » à toutes les tuiles, ou mettre ce bouton dans la tuile en surimpression. Les PV ne doivent pas rétrécir à chaque tour (§1). Impact moyen, effort S.
6. **C « table » réellement tourné** (tuiles du haut à 180°, colonnes à 90° / 270°), ou C retiré : il fait double emploi avec A sans orienter. Colonne du milieu plus fine. Impact moyen, effort S.
7. **Préparation**
   - En portrait, le QR de la table est en 3e carte et ne fait que **132 px** (`P/multi/01-hote-preparation-qr.png`) : le toucher pour l'agrandir en plein écran, avec pleine luminosité.
   - En paysage sur téléphone, le pied « Lancer la partie » prend un tiers de la hauteur (`P/planches/screens-360-paysage.jpg`).
   - Sur PC, le pied s'étire sur 1 250 px (`P/screens/pc-paysage/11-fin.jpg`).
   - Impact faible à moyen, effort S.
8. **Rejoindre.** Le choix de la place « 1 à 8 » est sans plan de la table (`P/multi/02-bob-rejoindre-360.png`) ; seul un texte explique « à ta gauche ». Proposition : un plan circulaire avec l'hôte placé. Sur la table en direct à 360 px, le nom est coupé par « Co-hôte » (« Ca… »). Impact moyen, effort M.
9. **PC et tablette**
   - Affichage par défaut B ou C sur PC (pas de tuiles tournées).
   - Nom de la tuile plafonné à 18 px : à mettre à l'échelle sur tablette.
   - Raccourcis clavier (B6).
   - Impact faible, effort S.
10. **Fin de partie**
    - « Aucun vainqueur » termine sans confirmation et sans retour possible (`puEndSheet`). Proposer « Annuler » quelques secondes (toast), ou garder la partie terminée réouvrable.
    - Le classement ne montre ni les PV finaux ni la cause d'élimination.
    - Impact moyen, effort S.
11. **Relance de l'appli** : la partie en cours ne se rouvre pas d'elle-même (`P/func.txt`, il faut « Reprendre »). Android tue souvent une appli en arrière-plan pendant une partie de 2 h. L'option est déjà prévue côté téléphones qui rejoignent (`a-faire.md:72`) ; l'étendre à l'hôte. Impact moyen, effort S.
12. **Table en direct** : délai de 1,4 à 2,4 s (relevé toutes les 2 s, `P/multi.txt`). Acceptable, mais des Server-Sent Events rendraient la table « vivante ». Impact faible, effort M.

## 4. Fonctions à améliorer (c)

- **Historique des PV.** Le journal (5 000 entrées) sert à l'annulation, puis il est jeté à la fin. Le garder dans le résultat permettrait : courbe des PV par joueur, « qui a infligé quoi », tour par tour (Lifetap, avec export CSV ou JSON). Dans la partie : une vue « Journal » qui annule une action précise, pas seulement la dernière. Impact fort, effort M.
- **Statistiques.**
  - Existent déjà : chiffres clés, Mes decks avec **taux de victoire par deck** (« Vampires 22 %, 2 sur 9 »), adversaires, commandants vus. Le comparatif (`concurrence.md` § 3.5, ❌ « prévu ») est donc à corriger.
  - Manquent : un graphe dans le temps, les résultats par nombre de joueurs et par place de départ (avantage du premier joueur), la durée moyenne par format, un classement du groupe (playgroup), l'export CSV.
  - Impact moyen, effort M.
- **Premier joueur au hasard** : seulement un toast, et dans le menu uniquement au tour 1. Ajouter une animation de tirage sur la table (roulette, tuile qui s'allume), tournée vers tous. Impact faible, effort S.
- **Compteurs libres.** Le moteur accepte 8 compteurs libres par place (`partie.js:212-219`, `PRT_FREE_MAX`), mais la fiche n'a que poison, impôt, énergie, expérience (`PU_CNT`, `partie-ui.js:20`). Il suffit d'un « + Compteur » (nom libre) pour couvrir trésors, tempête, Vitesse, l'Anneau, etc. Impact fort, effort S.
- **Monarque et initiative** : seulement dans la fiche. Proposer un raccourci depuis le menu (« Donner le monarque à… »). L'initiative ne suit pas la salle du **donjon** (Undercity). Impact faible, effort S.
- **« Mon QR joueur »** : choisir le deck sous le QR oblige à faire défiler, alors que le deck est dans le QR (`P/multi/26-bob-mon-qr-joueur.png`). Mettre le choix du deck avant le QR. Impact faible, effort S.

## 5. Nouvelles fonctions (d), comparées aux références

| Fonction | MO aujourd'hui | Références | Proposition | Impact / effort |
|---|---|---|---|---|
| Dés (D4 à D20), pile ou face | ❌ (aucun code) | Lifetap, Lotus | Bouton « Dés » dans le menu « … », résultat affiché tourné vers chacun | Fort / S |
| Chrono de partie, horloge de tour, pendule BO3 | ❌ (durée seulement enregistrée) | Mythic Tools, Lotus | Durée du tour sur le bouton rond, alerte facultative, pendule en 1 contre 1 | Moyen / S-M |
| Jour / nuit, bénédiction de la cité | ❌ | Lifetap, Life Counter Magic | Pastilles d'état de la partie (globales), basculées depuis le menu | Moyen / S |
| Trésors, tempête, l'Anneau, donjon, Vitesse, mana flottant | ❌ (énergie, expérience ✅) | Lifetap, Lotus, Life Counter Magic, TurnZero | Compteurs libres (§4) avec des préréglages + une pastille d'état globale | Fort / S-M |
| Planechase, Archenemy | ❌ | Lifetap, Lotus, Mythic Tools | Mode plan : pioche du plan, dé planaire (images Scryfall) | Faible à moyen / M |
| Historique des PV, export | 🟡 annulation seule | Lifetap | §4 | Fort / M |
| Thèmes du compteur | ❌ (toujours sombre, couleur et illustration du joueur) | Mythic Tools (fonds, polices) | Choix de couleur par joueur, contraste élevé, police plus grande | Faible / S |
| Écran toujours allumé | 🟡 navigateur seulement (B2) | tous | B2 | Fort / S |
| BO3 en 1 contre 1, tournoi | ❌ (prévu, `a-faire.md:131,143`) | Mythic Tools, Companion | déjà prévu | — |
| Table en direct sans réseau (Bluetooth) | ❌ (prévu, `a-faire.md:73`) | — | déjà prévu | — |

**Points forts à garder** (sans équivalent chez les références)

- QR de table, compte ou invité, avec le résultat rangé chez chaque compte.
- Table en direct avec co-hôtes.
- Deux téléphones (écran 2), qui marche à 8 joueurs (`P/multi/21-22`).
- Partie sans réseau avec carte joueur signée, vérifiée hors ligne (`P/multi/26-30`).
- QR du résultat.
- Illustration du deck en fond, sans clignotement.
- Annulation qui dit ce qu'elle défait.
- Élimination proposée, jamais faite d'office.
- Aucune erreur console.

## 6. Ce qui a été vérifié et fonctionne

- **Préparation**
  - Formats en un appui (gardés pour la fois suivante).
  - Standard agrandi à 3 joueurs (20/20/20).
  - Libre de 1 à 999.
  - Invités ; place partenaire (Thrasios + Tymna : deux lignes de blessures).
  - Premier joueur au hasard ou choisi.
- **Compteur**
  - ±1, avec la moitié touchée qui s'allume.
  - Appui long : 450 ms → −10, puis −10 toutes les 0,5 s.
  - Écart en exposant, regroupé sur 2,5 s (10 tapes = +10, annulées en une fois).
  - Annulation sur plusieurs niveaux, tour suivant compris.
  - Tour suivant qui saute les éliminés.
  - PV négatifs affichés.
  - Pause et reprise ; rechargement (partie gardée).
- **Fin de partie**
  - Proposition d'élimination, élimination (causes Standard sans blessures), tuile grisée avec tête de mort.
  - Vainqueurs, classement ex aequo, QR du résultat, « Rejouer avec les mêmes ».
  - Mes parties (détail, Standard marqué), statistiques par format.
- **Plusieurs téléphones**
  - QR de table : Bob en compte (360), Carol en invitée (412). Places, deck gardé, « Range ton téléphone ».
  - Lancement vu en 1,6 s ; −1 de Bob vu par l'hôte en 1,4 s ; −5 de l'hôte vu en 2,4 s.
  - Co-hôte : demande, acceptation, puis Carol compte toute la table ; menu « Téléphones de la table ».
  - Résultat chez Bob.
  - Deux téléphones à 8 (répartition automatique, attente de l'écran 2, moitiés, menu « Ma moitié / L'autre moitié / Toute la table »).
  - Hors ligne : carte joueur (166 caractères, QR de 308 px), lecteur de QR, Bob ajouté en compte.
