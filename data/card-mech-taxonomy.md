# Taxonomie des mécaniques v2.1 (coach Commander de Mana Orbit)

But : dire à un programme (le coach) ce que chaque carte FAIT pour un deck Commander et ce qu'elle VEUT, pour qu'il assemble des synergies,
des moteurs et des combos sans copier les decks populaires. Classe la carte telle qu'elle est jouée en Commander (multijoueur, 40 PV).

## Format de sortie par carte
- `name` : nom exact tel que fourni.
- `roles` : fonction(s) dans un deck (liste ci-dessous). 0 à 3 en général.
- `provides` : ce que la carte PRODUIT ou FAIT ARRIVER pour le reste du deck.
- `wants` : ce qui la REND MEILLEURE quand le reste du deck le fournit (ses récompenses, ses conditions).
- `tribes` : types de créature que la carte RÉCOMPENSE ou SOUTIENT (seigneur, « chaque fois qu'un Elfe… », « les sorts de Dragon coûtent moins »).
- `power` : 1 à 5, force de la carte dans un deck qui veut ce qu'elle fait (1 = faible/remplissage, 3 = solide, 5 = parmi les meilleures du format).
- `notes` : une phrase courte, seulement si utile (combo infini connu avec telle carte, piège de lecture). Sinon chaîne vide.

## Règles (lire attentivement : ce sont les causes de désaccord du premier pilote)
1. **N'étiquette PAS ce qui se déduit de la ligne de type** : être un artefact, un enchantement, légendaire, un planeswalker, un équipement, une aura,
   un véhicule, une saga, un éphémère/rituel, incolore, ou avoir tel type de créature. Le programme le lit déjà. Exemple : Sol Ring ne reçoit PAS
   `provides: artifacts`. Une créature Ninja ne reçoit PAS `tribes: Ninja` si elle ne récompense pas les Ninjas.
2. **provides = effet produit pour le deck ; wants = ce qu'elle récompense chez les autres cartes.** Jamais la même étiquette dans les deux, sauf vrai
   moteur double sens (rare : préciser en note).
   - Carte avec un effet d'arrivée en jeu utile (le sien) → `provides: etb` (elle fournit une cible de blink/réanimation). Elle ne « veut » pas etb.
   - Carte qui fait entrer/ressortir des permanents (flicker) → `provides: blink`, `wants: etb`.
   - Carte qui récompense l'arrivée d'AUTRES créatures (Soul Warden, Impact Tremors) → `wants: etb` (et `wants: tokens-creature` si les jetons sont l'usage évident).
   - Déclencheur d'attaque/de blessures qui ne concerne QUE cette créature → rien en attack/combat-damage (c'est sa propre valeur : power en tient compte) ;
     s'il récompense les attaques/blessures de N'IMPORTE QUELLE créature → `wants: attack` / `wants: combat-damage`.
3. **Les rôles ne vont JAMAIS dans provides/wants.** ramp, draw, removal… sont uniquement dans `roles`.
4. **Ignorer le marginal** : effet minuscule ou unique (regard 1 à l'arrivée, 1 blessure aux volants, se sacrifier soi-même en fin de vie, vol/évasion qui ne
   profite qu'à elle-même). Une étiquette = quelque chose qu'un joueur citerait pour dire pourquoi la carte est dans son deck.
5. **removal** = vrai retrait d'une menace (détruire, exiler, renvoyer, faire sacrifier, -X/-X important, combat forcé fiable). Pas un ping de 1.
   **wipe** = retrait de masse. **counter** = contresort. **protect** = protège ses permanents/son commandant (hexproof, indestructible, phasing, contre-ciblage).
   **ramp** = mana en plus de façon durable ou terrains en plus ; **fixing** = trouve/produit les couleurs manquantes. **tutor** = cherche une carte précise
   (pas un terrain de base). **recursion** = ramène des cartes du cimetière (main ou jeu). **wincon** = peut réellement finir la partie ou en est le plan
   principal. **stax** = ralentit/verrouille tous les joueurs de façon importante. **land** = terrain.
6. **tribes** : nom de type au singulier en anglais (« Elf », « Dragon », « Zombie »). Créer des jetons Zombie ne veut pas dire soutenir les Zombies.
7. **Cas fréquents tranchés** :
   - Sort ou permanent qui met des terrains en jeu depuis la bibliothèque (Cultivate, Nissa's Pilgrimage, Navigation Orb) → `roles: ramp` (+ `fixing` s'il peut
     chercher des couleurs différentes) et `provides: landfall`. Un terrain qui produit plusieurs couleurs → `roles: land, fixing`. Un terrain qui produit du
     mana en plus ou accélère (Gemstone Caverns, Ancient Tomb) → `roles: land, ramp`.
   - Gain de vie produit par un drain (Blood Artist gagne aussi) → `provides: drain, lifegain`.
   - `wincon` : seulement si la carte gagne réellement la partie ou en est le finisseur évident (Craterhoof, Approach, Thassa's Oracle, gros drain répété).
     Une carte qui ne fait que renforcer → pas wincon.
   - `group-hug` : les adversaires reçoivent une ressource utile (cartes, mana, terrains, jetons). Forcer à attaquer ailleurs = `politics`.
   - Un payoff évident d'une ressource → wants de cette ressource (Gaea's Anthem : wants go-wide ; tokens-creature seulement si les jetons sont l'usage
     évident). Ne pas empiler les wants par simple compatibilité.
8. Utiliser UNIQUEMENT les étiquettes ci-dessous. Une mécanique importante absente → `missing_tags` (rare désormais).

## roles
land, ramp, fixing, draw, tutor, removal, wipe, counter, protect, recursion, wincon, stax

## provides / wants (même vocabulaire)
### Jetons et ressources
- tokens-creature : crée des jetons créature (provides) / récompense leur création ou leur nombre (wants)
- treasure : Trésors
- food : Nourriture
- clue : Indices
- tokens-other : autres jetons non-créature (Sang, Carte, Pouvoir, Roche…)
- token-doubling : double ou augmente les jetons créés (Doubling Season, Parallel Lives)
- energy : énergie
- the-ring : l'Anneau vous tente
- initiative-monarch : initiative, monarque, donjons
### Mort, sacrifice, cimetière
- sacrifice-outlet : sacrifier à volonté pour un coût faible ou nul
- sacrifice : sacrifie ou fait sacrifier (y compris les adversaires) / récompense les sacrifices
- dies-trigger : effet quand des créatures meurent
- self-mill : met ses propres cartes au cimetière
- graveyard-cast : lance/joue depuis le cimetière (flashback, escape, rebond…)
- reanimation : remet des créatures du cimetière sur le champ de bataille
- graveyard-hate : exile les cimetières
- discard-outlet : défausse comme coût ou moteur (récompense la défausse : madness, Archon of Cruelty non)
- loot : pioche puis défausse (loot, rummage, connive)
- wheel : chacun défausse sa main et pioche
### Arrivée et blink
- etb : (provides) a un effet d'arrivée utile ; (wants) récompense l'arrivée d'autres permanents
- blink : exile puis renvoie des permanents
- landfall : (wants) récompense l'arrivée de terrains ; (provides) fait arriver des terrains en plus de la pose normale
- extra-lands : poses de terrain supplémentaires, jouer des terrains du cimetière ou du dessus
- lands-graveyard : terrains au cimetière / sacrifier des terrains (fetchs, Crucible)
### Marqueurs
- counters-p1 : marqueurs +1/+1
- counters-m1 : marqueurs -1/-1
- counters-other : autres marqueurs significatifs (charge, temps, loyauté)
- proliferate : prolifération
### Vie
- lifegain : gain de vie
- drain : chaque adversaire perd des PV (drain, Blood Artist)
- burn : blessures directes à un joueur ou une cible (hors combat)
- pay-life : payer des PV comme ressource / récompense sa propre perte de vie
### Types de cartes qui comptent (wants surtout : la carte RÉCOMPENSE ce type)
- artifacts : récompense les artefacts (Urza, Improvise, affinité)
- enchantments : récompense les enchantements (constellation)
- equipment : récompense ou réduit les équipements
- auras : récompense les auras
- vehicles : récompense les véhicules / équipage
- spells : récompense les éphémères et rituels (magecraft, prowess)
- superfriends : récompense les planeswalkers
- legendary : récompense les légendaires / historiques
- colorless : récompense les sorts incolores
- curses : récompense les malédictions
- sagas-classes : récompense les sagas, classes, affaires (Case), rooms
- commander-matters : se réfère au commandant (lieutenant, coût du commandant)
- activated-abilities : récompense ou copie les capacités activées (Rings of Brighthearth, Necrotic Ooze)
- keyword-matters : récompense des mots-clés (vol, contact mortel…) sur ses créatures
### Créatures et combat
- go-wide : récompense le nombre de créatures (anthems, « pour chaque créature »)
- big-creatures : récompense la force élevée ou les gros coûts
- toughness-defender : endurance qui compte, murs, défenseur
- attack : récompense les attaques
- combat-damage : récompense les blessures de combat infligées aux joueurs
- extra-combat : combats supplémentaires
- evasion : donne l'évasion à d'autres créatures (vol, imblocable, menace, piétinement d'équipe)
- haste : donne la célérité à d'autres créatures
- double-strike : donne la double initiative / double les blessures
- ninjutsu : ninjutsu, renvoyer des attaquants non bloqués
- voltron : renforce massivement une seule créature (+X/+X, protections, équipements lourds)
- tribal : soutient un type de créature (préciser `tribes`)
### Sorts et pile
- copy : copie des sorts ou des permanents
- cast-trigger : récompense le fait de lancer des sorts (tous types)
- storm : nombre de sorts lancés dans le tour
- cascade : cascade, découverte, lancer gratuitement du dessus
- x-spells : sorts à X
- cost-reduction : réduction de coût
- alt-cost : lancer sans payer le coût de mana (coûts alternatifs, sorts gratuits)
- flash : donne le flash / jouer au tour adverse
- cycling : cyclage, cyclage de terrain
- mutate-modify : mutation, créatures modifiées (marqueurs, équipements, auras)
### Bibliothèque et cartes
- draw-trigger : récompense la pioche (« chaque fois que vous piochez »)
- top-library : regarde ou joue depuis le dessus de sa bibliothèque
- impulse : exile du dessus et peut jouer jusqu'à…
- cast-others : lance les cartes des adversaires ou des cartes exilées d'eux
- mill : meule les adversaires
### Interaction avec les autres joueurs
- steal : prend le contrôle de permanents adverses
- group-hug : donne des ressources aux adversaires
- politics : goad, vote, pactes, offrandes aux adversaires
- hatebear : taxe ou restreint les adversaires (sans verrouiller tout le monde : sinon rôle stax)
- poison : poison, infect, toxique
- discard-opponents : fait défausser les adversaires
- pillowfort : décourage ou empêche les attaques contre soi (Propaganda, Ghostly Prison)
- coin-flip : pile ou face, dés
- face-down : cartes face cachée (morph, déguisement, manifestation, cloak)
### Mana et tours
- untap : dégage des permanents ou des terrains
- mana-doubling : double ou multiplie la production de mana
- extra-turn : tours supplémentaires
- trigger-doubling : double les déclencheurs (Panharmonicon, Teysa, Strionic Resonator)
- speed : vitesse / Start your engines
- manland : terrain qui devient une créature
