# Vidéos courtes (Reels / Shorts / TikTok) : générateur

Tout est en code, rendu déterministe : une page HTML animée par vidéo, capturée image par image, assemblée avec la voix off en MP4. Format 1080 × 1920, 30 i/s, 10 à 20 s. Les voix (`voix/`) sont versionnées (une voix Gemini ne se refait jamais à l'identique) ; les rendus (`rendu/`) non, la copie à publier va dans `docs/videos/`. Publication (bios, calendrier, descriptions, son) : `publication.md`.

## Fichiers
- `voix.json` : modèle, voix, température, coupe de fin (0,2 s : le souffle final), consigne de style, textes (`id`, `titre`, `texte`, `ton` facultatif).
- `voix.mjs` : voix off par Gemini TTS → `voix/<id>.wav` (clé `GEMINI_API_KEY` dans l'environnement).
- `ma-voix.mjs` : une voix enregistrée (mémo vocal, n'importe quel format) à la place de la voix Gemini → `voix/<id>.wav` nettoyé (Gemini gardée en `voix/<id>.gemini.wav`) ; la vidéo se recale seule au rendu. Textes et conseils d'enregistrement : `docs/videos/textes-a-enregistrer.md`.
- `ecoute.mjs` : contrôle d'une voix par transcription Gemini (mots en trop ou sautés, prononciation, souffle de fin) → OK / À REFAIRE. Refaire avec `voix.mjs <id>` tant que ce n'est pas OK.
- `mots.mjs` : instant de chaque mot d'une voix (énergie du WAV + ponctuation du texte), pour les sous-titres et les apparitions calées sur la voix.
- `phrases.mjs` : instants de chaque phrase (silences mesurés par ffmpeg).
- `base.css` + `base.js` : socle commun (polices, couleurs, fond, animations, logo, `seek`).
- `lancement.css` + `lancement.js` : série de lancement (téléphone avec les vrais écrans, sous-titres, loupes, compteurs, orbites de mana, carte de fin).
- `<id>.html` : la vidéo elle-même. Série de lancement : `l1-lancement` à `l8-manabox`.
- `rendu.mjs` : page → images (Playwright, JPEG) → `rendu/<id>.mp4` + `rendu/<id>.png` (couverture).

## Écrans de l'appli
`node tools/store-assets.mjs video fr [étapes]` → `shots/video/fr-<écran>.png` (984 × 1584, non versionnés) : accueil, scan-0 à scan-6 (une carte de plus à chaque fois, langues différentes), classeur, echange, qr (lien fixe des flyers), liste (la liste d'échange vue par le pote), decks, deck, partie, valeur, collection, manabox, masterset, mystere-0 à mystere-5. `étapes` (facultatif, séparées par des virgules : `liste,qr`) : seulement celles-là.

## Faire une vidéo
1. Ajouter le texte dans `voix.json`, puis `node tools/shorts/voix.mjs <id>` et `node tools/shorts/ecoute.mjs <id>`.
2. `node tools/shorts/mots.mjs <id> --decalage=0.3` : instant de chaque mot dans la vidéo.
3. Partir d'une page de la série (`l2-classeur.html` est la plus simple) ; régler `window.APRES_VOIX` (secondes après le dernier mot, 2,5 à 4 s pour la carte de fin : la durée en découle ; sans voix, `window.DUREE`), `window.DECALAGE_VOIX`, `window.COUVERTURE` (mot ou secondes de la couverture, page en classe `couv` : titre `.couvt` à la place des sous-titres).
4. Instants : `data-in` / `data-out` (et `data-zin` / `data-zout` pour un zoom) valent un nombre de secondes ou un **mot de la voix** : `scannes`, `tu#2` (2e « tu »), `valent>` (fin du mot), `doublons+0.2` (décalage). Sans voix : `window.SOUS_TITRES = [[début, fin, 'texte <em>accent</em>'], …]` et des `--in` en secondes.
5. Aperçu de quelques instants : `node tools/shorts/rendu.mjs <id> --apercu=1,3.5,7` (images dans `rendu/`). Puis le rendu complet : `node tools/shorts/rendu.mjs <id>` (environ 1 min 30) ; `--couverture` refait la couverture seule, `--son` le son seul (images gardées).

## Composants de `lancement.css`
- `.tel2` (téléphone, `--top`, `.flotte` = léger mouvement 3D) > `.vue` > `.ecr` (`data-src="<écran>"` ; l'écran suivant recouvre le précédent) : `.pousse` (arrive par la droite), `.monte2` (par le bas), `.zoom` (`--z`, `--ox`, `--oy`, `data-zin`, `data-zout`). Un `.ecr` sans `data-src` regroupe des écrans sous un même zoom.
- `.tap` (toucher, `--x` / `--y` en % de l'écran, non zoomé) ; `.loupe` (`data-src`, `data-crop="x,y,l,h"` en pixels de la capture, `style="width"`).
- `.compte` (`data-de`, `data-a`, `data-in`, `data-duree`, `data-dec`, `data-suffixe`) ; `.pastille` (`b` en couleur ; `.ok`, `.a`) ; `.titre`.
- `.orbite` (`data-rx`, `data-ry`, `data-mana="WUBRG"`, `--y`, `--deg`, `--tour`) : symboles de mana qui passent devant puis derrière ; `[data-mana-sym="R"]` : un symbole seul.
- `.fin` : carte de fin (logo en orbite, nom, « Gratuit sur Google Play », site, « Lien en bio ») ; `data-gp` / `data-plus` / `data-h1` / `data-logo2` : instant propre d'un de ses éléments.

Zones sûres : rien d'important sous y = 1536 (20 % du bas) ni à droite de x ≈ 900 (boutons des applis) ; sous-titres entre y = 250 et 580.
