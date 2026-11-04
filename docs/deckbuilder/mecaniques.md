# Classement des cartes par mécaniques (`data/card-mech.json`)

But : que le coach raisonne sur ce que **fait** chaque carte (ce qu'elle fournit au deck, ce qu'elle veut des autres cartes) et plus seulement sur
sa popularité (EDHREC, Archidekt). Base des synergies, moteurs, combos et decks à thème, y compris atypiques.

## Contenu
- 32 103 cartes légales en Commander (toutes celles des fiches Scryfall de la base du coach, terrains de base exclus), classées le 4 novembre 2026.
- Par carte : `roles` (12 : land, ramp, fixing, draw, tutor, removal, wipe, counter, protect, recursion, wincon, stax), `provides` et `wants`
  (88 mécaniques), `tribes` (types de créature que la carte soutient), `power` (1 à 5, force dans un deck qui veut ce qu'elle fait), `note` (combo
  connu, piège de lecture).
- Taxonomie et règles de classement : `data/card-mech-taxonomy.md` (v2.1). Ce qui se déduit de la ligne de type (artefact, légendaire, type de
  créature…) n'est **pas** étiqueté : le lire depuis le type.
- Format compact, une carte par ligne : `{ v, at, tax, roles, tags, cards: { nom: [roles, provides, wants, tribes, power, note] } }` (indices dans
  `roles` / `tags`). Lecture : `readMech()` de `tools/card-mech-merge.mjs`.

## Comment il a été fait
- Classement par agents IA (expertise Magic), lots de 60 cartes, des plus jouées aux moins jouées : un agent classe, un **arbitre** relit chaque carte
  et corrige (530 lots, 1 060 agents). Les cartes sans texte (340 créatures vanilla) sont ajoutées sans étiquette.
- Deux pilotes de 300 cartes avant : accord entre deux agents indépendants 79 % (taxonomie v1) puis 86 % (v2, règles précisées). L'arbitre a corrigé
  environ 10 % des cartes au grand tour (de 4 % pour les moins jouées à 12 % pour les plus jouées).
- Contrôles de la fusion (`tools/card-mech-merge.mjs`) : nom présent dans le lot envoyé, étiquettes de la taxonomie seulement, power 1-5, cartes
  oubliées signalées. Résultat : 0 lot manquant, 0 carte oubliée, 0 étiquette hors liste. Test : `tests/test-card-mech.mjs`.

## Répartition (repères)
- Mécaniques les plus fréquentes : etb 3 566, tokens-creature 2 925, tribal 2 131, counters-p1 1 652, lifegain 1 440, burn 1 408, self-mill 1 278,
  sacrifice 1 211. Les plus rares : curses 5, token-doubling 30, speed 40, mana-doubling 43.
- Power : 1 → 13 258 · 2 → 12 114 · 3 → 5 570 · 4 → 1 075 · 5 → 86. 2 041 cartes soutiennent un type de créature ; 6 462 n'ont aucune étiquette
  (cartes sans effet notable pour un deck Commander).

## Nouvelles extensions
1. `git show origin/deck-corpus:corpus.json.gz > /tmp/corpus.json.gz` (après le passage nocturne qui a lu les nouvelles cartes).
2. `node tools/card-mech-todo.mjs /tmp/corpus.json.gz <dossier>` : lots des cartes absentes du classement (in/), dossiers draft/ et out/, vanilla.json.
3. Faire classer chaque lot par un agent (consigne : lire `data/card-mech-taxonomy.md`, écrire draft/b-NNNN.json) puis relire par un arbitre (écrire
   out/b-NNNN.json) : même consigne que le grand tour.
4. `node tools/card-mech-merge.mjs <dossier> --vanilla <dossier>/vanilla.json --into data/card-mech.json`, puis `node tests/test-card-mech.mjs`.

Une carte pas encore classée garde l'ancienne méthode du coach (rôles du générateur, popularité).

## Utilisation
Pas encore branché dans l'appli : prochaine étape, `gen-deckdb.mjs` le lit et ajoute des champs compacts à la base du coach (`dkw.json.gz`), puis le
coach (src/deckwiz.js, src/deckopt.js) raisonne dessus (synergies fournit/veut, moteurs, thèmes automatiques du commandant, variété, versions).
