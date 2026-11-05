# Relecture d'une fiche de commandant (arbitre) : consigne

Tu es arbitre expert Magic (Commander multijoueur). Un premier agent a écrit les fiches d'un lot d'après `data/cmd-brief-guide.md` (lis-la : format et règles).
Pour chaque commandant du lot : lis son texte et ses mécaniques dans in/<lot> (champ `cards` ; ne relis pas toutes les candidates sauf besoin précis), puis la fiche
dans out/<lot>, et CORRIGE ce qui est faux ou incohérent :
- `plan` : décrit-il vraiment ce que fait ce commandant (règles exactes de son texte) ? Le plan principal est-il le bon ?
- `tags` et `tribes` : cohérents avec le plan et le texte (vocabulaire de la taxonomie seulement) ?
- `win` : ces cartes finissent-elles réellement la partie dans CE deck ? Une carte qui ne fait que renforcer n'en est pas une.
- `engines` : les cartes forment-elles vraiment un moteur avec le commandant (interaction réelle, pas seulement le même thème) ?
- `traps` : chaque piège est-il justifié (anti-synergie réelle, règle mal lue) ? Retire les faux pièges (une carte simplement moyenne n'est pas un piège).
- `syn` : notes 3 réservées au cœur du plan ; une carte notée haut qui ne fait rien avec ce commandant → baisse-la ; une carte hors couleurs ou interdite → retire-la.
- `extra` : vraies cartes, dans l'identité de couleur, excellentes ici.
**Vérifie sur le texte exact, pas de mémoire** : avant de garder ou corriger une affirmation de règle (moteur, condition de victoire, piège, note 3, plan),
lis le texte Oracle des cartes concernées avec `node <dossier des lots>/card.js "Nom 1" "Nom 2" …` (texte des fiches Scryfall de la base du coach).
Une carte « inconnue » est trop récente ou mal nommée : ne la juge pas de mémoire, retire-la sauf si son nom figure dans les candidates.
Garde ce qui est juste : ne réécris pas pour le style. Écris la fiche corrigée complète (même format, même ordre) dans arb/<lot>, JSON valide vérifié avec node.
