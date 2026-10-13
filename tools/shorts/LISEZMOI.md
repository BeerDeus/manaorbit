# Vidéos courtes (Reels / Shorts) : générateur

Tout est en code, rendu déterministe : une page HTML animée par vidéo, capturée image par image, assemblée avec la voix off en MP4. Format 1080 × 1920, 30 i/s, 10 à 20 s. Les fichiers produits (`voix/`, `rendu/`) ne vont pas dans le dépôt.

## Fichiers
- `voix.json` : modèle, voix, température, consigne de style, textes (`id`, `titre`, `texte`, `ton` facultatif).
- `voix.mjs` : voix off par Gemini TTS → `voix/<id>.wav` (clé `GEMINI_API_KEY` dans l'environnement).
- `phrases.mjs` : instants de chaque phrase d'une voix (silences), pour caler l'animation.
- `base.css` + `base.js` : socle commun (polices, couleurs, fond à orbites, composants, animations, logo, `seek`).
- `<id>.html` : la vidéo elle-même (éléments + instants). `s0-v3.html` sert de modèle.
- `rendu.mjs` : page → images (Playwright) → `rendu/<id>.mp4` + `rendu/<id>.png` (couverture).

## Faire une vidéo
1. Ajouter le texte dans `voix.json`, puis `node tools/shorts/voix.mjs <id>`.
2. `node tools/shorts/phrases.mjs <id>` : début et fin de chaque phrase (décalage de 0,4 s compris).
3. Copier `s0-v3.html` en `<id>.html` ; régler `window.DUREE` (fin de la voix + 2 à 3 s) et `window.DECALAGE_VOIX`.
4. Composer les écrans : chaque élément porte ses instants en secondes dans `style`, `--in` (entrée) et, pour les `.ecran` et le téléphone, `--out` (sortie). Les enfants héritent du `--in` du parent s'ils n'en ont pas.
5. `node tools/shorts/rendu.mjs <id>` (option `--garder-images` pour inspecter les images dans `rendu/<id>-images/`).

## Composants de `base.css`
- Fond : `.bg`, `.orbit` (+ `.orbit.b`).
- `.ecran` : bloc plein écran (entre en montant, sort vers le haut ; `.ecran.fondu` sort en fondu) ; dedans `.num`, `h1`/`h2` (`<em>` = accent), `.ill` (zone d'illustration sous le titre).
- Entrées utilitaires : `.monte`, `.pop`, `.glisse`, `.leve` (téléphone, avec `--out`).
- Illustrations : `.carte` (`--c1`/`--c2` dégradé), `.etiquette`, `.ligne-deck` (`--p` = barre), `.joueur` (+ `.ami`), `.doublon.vers-droite` / `.vers-gauche`, `.fleches`, `.ligne` + `.coche`.
- Aperçu de l'appli : `.tel > .app` avec `.entete` et des `.tuile` (`b.a` accent, `b.o` vert).
- Fin : `.marque` (`.logo`, `h1`, `p`) et `.cta` (`span` bouton, `small` sous-titre). Le logo est le symbole SVG `#logo` injecté par `base.js`.
- Couleurs : `--accent`, `--ok`, `--warm`, `--rose`, `--violet`, `--corail`, `--menthe`, `--bleu`.

Zones sûres : rien d'important sous y = 1536 (20 % du bas) ni à droite de x ≈ 900 (boutons des applis).
