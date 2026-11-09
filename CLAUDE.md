# Mana Orbit : notes pour Claude

Doc produit : `README.md` · code, build, tests : `DEV.md`. Réponses en français, courtes.

## « Il y a de nouveaux signalements » (scans signalés depuis l'appli)

1. `node tools/scan-reports.mjs` : récupère les nouveaux signalements (photo `.jpg` + fiche `.json`) dans `.data/scan-pull/` et affiche un résumé (lu, ligne du bas, carte retenue, commentaire). `--last 20`, `--since <id>`, `--id <id>` au besoin.
   - Accès : `GET https://manaorbit.app/api/agent/scans` en lecture seule, clé `SCAN_REPORTS_AGENT_KEY` du serveur. En session cloud, la clé est un secret réseau de l'environnement pour `manaorbit.app` (en-tête `Authorization`, préfixe `Bearer`), posé par le proxy : rien à mettre dans la commande. 401 : secret absent ou faux ; 404 : clé pas réglée sur le serveur ; hôte bloqué : réseau de l'environnement.
2. Regarder les photos (outil Read sur `.data/scan-pull/<id>.jpg`) et noter la bonne carte dans `.data/scan-pull/expect.json` : `{ "<id>": "Nom anglais" }` ou `{ "<id>": { "name", "set", "num" } }`.
3. Chercher la cause : catalogue des noms (`pwa/fr-names.tsv`, `pwa/names-*.tsv` ; trous de Scryfall → `data/names-fixes.tsv`), ligne du bas (`src/scanfoot.js`, `tests/test-scanfoot.mjs`), lecture (`src/scan.js` › `readCard`, `footIdentify`, `readTurned`), édition (`src/scaned.js`).
4. Corriger, `node build.mjs`, puis `node tools/scan-replay.mjs` (ou `--ids a,b`) : chaque photo repasse dans le vrai scan du dépôt (Tesseract ; l'appli Android lit avec ML Kit, qui lit aussi le texte couché). ✓ sûre · ≈ proposée / à vérifier · ✗ ratée.
5. Tests du scan (`DEV.md`), commit, push sur la branche demandée.

Les photos et fiches restent dans `.data/` (hors dépôt) : jamais dans un commit, une issue ou un message public.
