# Fiche d'un commandant (coach Commander de Mana Orbit) : consigne des agents

But : écrire, pour chaque commandant, ce qu'un joueur expérimenté de CE commandant sait, pour que le coach construise des decks forts et cohérents
sans copier les decks populaires. Tu es expert Magic (Commander multijoueur, 40 PV, 4 joueurs). Lis le texte du commandant et ses candidates ; fie-toi à ta
connaissance des cartes (règles exactes), pas à leur popularité.

## Entrée (in/c-NNNN.json) : tableau de commandants
- `slug`, `names` (1 ou 2 commandants : duo partenaire), `ci` (identité de couleur), `cards` (texte, coût, type, mécaniques du classement du coach :
  `p:` ce qu'il fournit, `w:` ce qu'il veut, `t:` types de créature soutenus, `pw` force 1-5), `themes` (thèmes EDHREC, peut être vide), `decks` (decks EDHREC).
- `cands` : candidates `[nom, coût, type, mécaniques, % des decks EDHREC du commandant (0 = jamais vu avec lui)]`. Les premières viennent de sa page EDHREC,
  les suivantes (0 %) des cartes de ses couleurs qui servent son plan d'après le classement.

## Sortie (out/c-NNNN.json) : tableau, un objet par commandant, MÊME ORDRE, JSON strict
```json
{ "slug": "…",
  "plan": "2 à 3 phrases en français : comment ce deck gagne et ce qui le fait tourner (tu, sans jargon inutile).",
  "tags": ["étiquettes de mécaniques du plan, 2 à 6, vocabulaire de data/card-mech-taxonomy.md (ex. tokens-creature, sacrifice-outlet, landfall)"],
  "tribes": ["types de créature au cœur du deck, anglais singulier, souvent vide"],
  "win": ["2 à 6 cartes (des candidates ou d'autres) qui finissent réellement la partie dans CE deck"],
  "engines": [{ "label": "moteur en 2 à 5 mots, français", "cards": ["2 à 4 cartes qui forment le moteur avec le commandant"] }],
  "traps": ["cartes qui semblent aller avec le commandant mais marchent mal avec lui (anti-synergie, règle mal lue), 0 à 8"],
  "syn": [["nom de carte", 3]],
  "extra": ["0 à 12 cartes absentes des candidates qui sont excellentes pour CE commandant (pas des staples génériques)"] }
```
- `syn` : note les candidates qui comptent vraiment pour ce commandant (30 à 80 cartes) : **3** = cœur du plan (le deck est nettement moins bon
  sans), **2** = très bonne dans ce deck, **1** = bonne, **0** = presque inutile ici malgré les apparences (populaire mais hors plan). Ne note pas les
  cartes génériques que tout deck joue (Sol Ring, Arcane Signet, Command Tower…) : le coach les gère déjà. Une carte jamais vue (0 %) mais excellente
  ici mérite sa note : c'est précisément ce qu'on cherche (trouvailles).
- Noms : EXACTEMENT comme dans `cands` (ou le nom anglais officiel complet pour `win`, `engines`, `traps`, `extra`). Pas de terrain de base.
- Plusieurs plans possibles (ex. Atraxa : marqueurs, superfriends, infect) : décris le plan principal, cite les autres en une phrase dans `plan`,
  et mets dans `tags` celles du plan principal d'abord.
- Ne mets que des cartes légales en Commander et dans l'identité de couleur `ci`.

Écris le fichier de sortie d'un coup (JSON valide, sans commentaire), puis vérifie qu'il se relit (`node -e "JSON.parse(require('fs').readFileSync(...))"`).
