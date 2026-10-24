# Audit Scanner : scan, prix rapide, scan mobile, session d'ouverture

Périmètre : `src/scan.js`, `scanauto.js`, `scaned.js`, `scanset.js`, `scansess.js`, `scanreport.js`, `mobscan.js`, `opening.js`, `opnbilan.js`, `places.js` (« Ranger dans ») et la CSS associée.
Méthode : monde de test (`tests/e2e-world.mjs`), ports 19540 à 19549, Tesseract servi depuis `tests/node_modules`, fausse caméra Chromium, appli Android simulée (aperçu natif et ML Kit factices, comme `tests/scanauto-e2e.mjs`), faux cloud pour le scan mobile (comme `tests/mobscan-e2e.mjs`).
Appareils : 360×780 et 393×852 (tactile, clair et sombre) ; 1280×800 (souris).
Scripts : `scratchpad/scanjs/` (s1 à s7, bench). Captures : `scratchpad/scan/` (≈ 90 PNG).

> **Mesures sous forte charge.** La machine avait 4 cœurs et une charge moyenne de 20 à 46 (d'autres agents tournaient en même temps). Les durées en valeur absolue sont donc pessimistes. Les rapports entre elles restent valables.

---

## 1. Mesures

### Justesse et vitesse du mode « Photos » (Tesseract, navigateur, cadrage « Nom seulement »)
54 images : les 14 fixtures d'origine et 40 variantes que j'ai fabriquées à partir de 8 cartes, avec 5 dégradations chacune (rotation de 8°, flou gaussien de 2,5, luminosité × 0,4, réduction à 35 %, reflet blanc sur le titre). Le banc est dans `scanjs/bench.mjs`, les résultats dans `scan/bench.json`.

| Cas | Résultat |
|---|---|
| Fixtures nettes (FR et EN, dont `blurry`) | 13/13 reconnues « sûres » et justes |
| Rotation, flou, sombre, petite image | **32/32 justes** (score de 87 à 100 %) |
| Reflet sur le nom (foil) | **0/8** : « Nom non reconnu » |
| `nonsense.jpg` | rien d'ajouté (correct) |
| `zorn.jpg` (allemand) | non reconnue : le catalogue `names-all.tsv` n'est pas servi dans ce monde de test, ce n'est donc pas une preuve |
| **Faux positifs « sûrs »** | **0** |
| Durée d'une lecture réussie | médiane **0,79 s** dans la page (le README annonce 0,15 à 0,5 s, hors charge) |
| Durée d'un échec | **5 à 9 s** : tous les moteurs sont essayés, et la file d'attente reste bloquée pendant ce temps |

- 10 photos de suite (scan à froid, préparation du moteur comprise) : 68 à 76 s. Le moteur est prêt 4,6 à 5,5 s après l'ouverture du scan.
- Caméra du navigateur prête en ≈ 0,94 s.

### Scan automatique (appli Android simulée, ML Kit factice à 120 ms)
- 8 cartes posées 1,2 s chacune, séparées de 0,4 s de bande vide : **8/8 ajoutées**, en 0,9 à 1,5 s après la pose, soit **≈ 33 cartes/min au rythme imposé**. Avec le délai de 0,25 s, sans bande vide entre deux cartes : 0,46 à 1,06 s par carte.
- La même carte reposée affiche « Encore X ? (+1 / Non) » (`apk-p393-04-encore.png`) ; ce comportement est correct.
- Mode manuel (appareil simulé) : la carte est ajoutée 0,9 à 1,3 s après l'appui.

### Nombre de gestes
| Action | Mana Orbit | Remarque |
|---|---|---|
| Une carte | 1 appui sur le cercle (0 en Auto) | équivalent à Delver Lens et ManaBox en continu |
| Édition de la 1re carte (réglage par défaut) | 1 appui, ou « Plus tard » | le bandeau occupe ≈ 300 px de la liste tant qu'on n'a pas répondu |
| Corriger une édition | 2 (symbole, puis illustration) | sous les 3 gestes visés ✔ |
| Corriger la langue | 2 (drapeau, puis liste) | ✔ |
| **Marquer un foil** | **3** (symbole d'édition › interrupteur Foil › fermer) | **impossible** avec le réglage « Sans édition » et en prix rapide |
| Mauvaise carte reconnue « sûre » | ✕ puis scanner à nouveau | aucune action « Remplacer par… » ; « Plutôt X » n'existe que pour les homonymes |
| Retirer un exemplaire (−) | **2** : une feuille de confirmation à chaque « − » | lourd ; ailleurs, c'est immédiat avec « Annuler » |
| **Fin du lot, de « Ajouter » à l'ajout réel** | **2 à 4** : Ajouter › Ajouter N cartes › « Ajouter quand même » (éditions) › « Ajouter quand même » (rangement) | deux confirmations à la suite dans la même feuille (`fin-p393-02…05`) |

---

## 2. Bugs (a)

| # | Constat | Reproduction et preuve | Proposition | Impact | Effort |
|---|---|---|---|---|---|
| B1 | **« Saisir » ajoute la carte directement à la collection du téléphone**, sans passer par le scan. Pas d'édition, pas de « Ranger dans », rien dans le récap. **En scan mobile, la carte reste sur le téléphone et n'arrive jamais au PC.** En mode deck ou lot, elle ne va pas non plus au deck ni au lot. La ligne « non reconnue » reste affichée. | `scan.js:1309` appelle `openCollAdd()`, puis `collection.js:1474` appelle `collBump`. Test s3 : Sol Ring passe de 0 à 1 sur le téléphone et reste à 0 sur le PC. Test s7 : `edgar markov` arrive sans emplacement. Capture `p393-04-saisir-apres.png` | « Saisir » remplit la ligne du scan (`scanAdd` avec un score de 1), puis le chemin normal s'applique : édition, rangement, récap, envoi au PC. | fort | S |
| B2 | **Le « + » du prix rapide ignore « Ranger dans »**, et aussi l'édition et le foil lus. | `scan.js:1291` appelle `collBump(k, name, n, { lang })`. Test s7 : `wrath of god` arrive sans emplacement alors que la pastille affiche « Classeur bleu ». | Passer par `scdLine` et `collAdd`, comme le récap. | moyen | S |
| B3 | **Le foil est valorisé au prix non foil** : en-tête du scan, récap et session d'ouverture (gain ou perte). | `scaned.js:18` : `pkEu` lit `eu`, et `ef` seulement si `eu` manque. `scan.js:231` et `scan.js:269` ignorent `x.f` et `fq`. `opening.js:64` fait la même chose. La collection, elle, utilise le prix foil (README › Foil par ligne). | `pkEu(p, foil)`, pondéré par le nombre de foils de la ligne. | moyen (fort pour les ouvertures : le foil est le gros lot) | S |
| B4 | **Vibration coupée si le téléphone demande de réduire les animations**, même avec Réglages du scan › Vibration activée. | `app.js:153` : `if (!S.haptic \|\| reduceMotion()) return`. Test s5 avec `reducedMotion: 'reduce'` : 0 vibration (contre 18 sans). | Ne pas lier `haptic()` à `reduceMotion` ; garder seulement `S.haptic` et `SCS.vib`. | moyen (accessibilité) | S |
| B5 | **Noms coupés au milieu d'un mot à 360 px** : « Llanowa / r Elves », « Craterh / oof… », « Sword / s to… » (prix rapide). | `style.css:1040` : `.sc-n b{overflow-wrap:anywhere; line-clamp:2}`. Captures `dark-s360-11-liste-bas.png`, `s360-02-prix-liste.png` | `overflow-wrap:break-word` et `hyphens:auto`. Sous 380 px, passer le pas-à-pas `− n +` sous le nom, ou faire de ✕ un glissement. | moyen | S |
| B6 | **L'aide « ? » s'affiche sur deux colonnes de ≈ 160 px** et pousse la barre du bas hors de l'écran (cercle et « Auto » coupés). Le paragraphe « Carte entière… » s'affiche même en cadrage « Nom seulement ». | `style.css:1019` : `.sc-note{display:flex}` avec deux `.hint`. Capture `p393-04-aide.png` | `flex-direction:column` ; masquer `.sc-note-full` hors de `.scan.full` ; limiter la hauteur et faire défiler. | moyen | S |
| B7 | **Messages coupés sur une seule ligne** en cadrage « Nom seulement » : « …n'a pas pu être téléchargé. … », « La caméra du navigateur est lente sur cet appareil : util… », « …appuie sur le … » à 360 px. | `scan.css:13` : `white-space:nowrap; text-overflow:ellipsis`. Captures `off2-p393-01-cdn-coupe.png`, `dark-s360-03-scan-vide.png` | Autoriser 2 lignes pour les messages `bad` et `busy`, comme en cadrage carte entière (`scan.css:163`). | moyen | S |
| B8 | **Hors ligne, moteur jamais téléchargé** : le bandeau dit « Hors ligne. Les cartes françaises restent lues », ce qui est faux (rien n'est lu). La photo devient « Nom non reconnu » avec un lien « Signaler ce scan ». Si la bibliothèque principale est en cache mais pas le worker ou le modèle, l'erreur n'est même pas affichée et la page lève 3 `pageerror importScripts`. | s4b et s4c. Captures `off-p393-02-photo.png`, `off2-p393-01-cdn-coupe.png`. `scan.js:985` ne reconnaît que `e.code === 'cdn'` venant de `ocrLib()` ; les erreurs de `createWorker` ne sont pas étiquetées. | Étiqueter `cdn` toutes les erreurs de `ocrWorker`. Bandeau « Lecture indisponible hors ligne tant que le moteur n'a pas été téléchargé une fois (≈ 3 Mo) ». Garder les photos en file pour les relire au retour du réseau. Ne pas proposer « Signaler » dans ce cas. | moyen (le cas « en boutique sans réseau » cité par Scrytics) | M |
| B9 | **Aucun moyen de marquer un foil avec le réglage « Sans édition »** : il n'y a plus de bouton d'édition, donc plus d'accès à l'interrupteur Foil. C'est pourtant le mode « le plus rapide », celui qu'on choisit pour le vrac. | `scaned.js:207` : `es === 'off'` renvoie un `span` vide. Test s7 : temps dépassé sur `.sc-ed` | Puce « ✦ » toujours présente sur la ligne (voir U2). | moyen | S |
| B10 | **Même retour pour « à vérifier » que pour une carte sûre, rien pour un échec** : `scsCue()` (vibration [14,50,14], son 880 Hz) part dès 72 %, et une carte non reconnue est silencieuse. `HAP.warn` et `HAP.bad` existent mais ne servent pas au scan. | `scan.js:991` | Trois retours distincts : sûr (ok), à vérifier (warn, son grave), échec (bad). | moyen | S |
| B11 | **Documentation en écart avec le code** : délais Auto « 0,5 / 1 / 1,5 s » dans le README, mais 0,25 / 0,5 / 1 s dans le code (`scanset.js:8`) ; « Prix rapide… depuis l'accueil (bouton sous Ma collection) » (README:329), alors que ce bouton n'existe plus (`home.js:9`) ; « cercle foil » (README:671) ; la puce « Niveau et badges » est rangée dans la section Scan (README:660) ; « l'appli n'a pas de foil par carte » dans la session (README:689), alors que c'est faux depuis le 18 octobre. | lecture | Corriger le README. | faible | S |
| B12 | Typographie : « Cache ta collection pendant la session / : seules… » et « « / Photos » » sont coupés en début de ligne (espace insécable manquant avant « : » et dans les guillemets). | `s360-09-session-en-cours.png`, `p393-04-aide.png` | Espaces insécables dans `T()` ou dans les JSON i18n français. | faible | S |
| B13 | Cibles tactiles sous 44 px : segment Ajouter/Prix **88×28** ; ✕ de ligne 30×38 ; `− +` 30×36 ; bouton d'édition 34×34 ; drapeau 43×32 ; « Signaler ce scan » 100×23 ; « +1 » de « Encore X ? » 41×38 ; « Plus tard » 68×30 ; ✕ des feuilles 32 à 36 px ; icônes du haut 40×40. | `small()` dans s1 et s5 | Hauteur minimale de 44 px (zone de toucher invisible si besoin). | moyen | S |

Aucune erreur console de l'appli en fonctionnement normal. Hors ligne seulement, 3 `pageerror` (B8).

---

## 3. UI et UX (b)

| # | Constat | Proposition | Impact | Effort |
|---|---|---|---|---|
| U1 | **Le bandeau « Édition de la 1re carte » cache la liste pendant toute une rafale** : en Auto, 9 cartes ajoutées et seul le bandeau est visible, avec « 9 éditions à choisir » qui s'accumule (`apk-p393-03-auto-rafale.png`, `p393-10-liste.png`). | Bandeau sur une ligne (« Édition de la 1re carte : Sol Ring · Choisir ») qui s'ouvre en feuille ; les dernières cartes restent visibles. Ou bien « extension du lot » demandée **avant** de scanner (« Je scanne : Bloomburrow / Plusieurs / Je ne sais pas »). | fort | M |
| U2 | Le foil n'est accessible que dans la feuille d'édition (3 gestes). | (1) Interrupteur **« Foil »** sur l'écran de scan, à côté d'Auto, qui marque les cartes suivantes (Delver Lens et ManaBox ont un réglage de ce genre ?) ; (2) puce ✦ sur chaque ligne (1 appui) ; (3) Foil sur l'écran « Éditions à choisir ». | fort | S à M |
| U3 | **Fin de lot en 2 à 4 appuis**, avec deux confirmations successives qui repeignent la même feuille (`fin-p393-03/04`). « Ranger dans » n'apparaît sur l'écran qu'**une fois choisi**, et revient à vide à chaque nouvelle séance. | Une seule feuille : rangement et éditions manquantes en lignes cliquables, un seul bouton « Ajouter ». Pastille « Ranger dans : Ma collection » toujours visible, avec le dernier choix proposé. | fort | M |
| U4 | **« − » demande une confirmation à chaque fois** (`scan.js:1318`). | Retrait immédiat avec un toast « Annuler » ; garder la confirmation pour ✕ quand q > 1. | moyen | S |
| U5 | **Aucun prix sur les lignes en mode Ajouter** : seulement un total (« ≈ 6,00 € ») dans l'en-tête. Le prix rapide affiche les prix mais pas l'édition. | Petit prix sur chaque ligne (celui de l'édition, ou le foil) ; une carte au-dessus d'un seuil (ex. 10 €) est mise en avant, avec un son « jackpot » en session d'ouverture. | fort (ouvertures, tri du vrac) | S |
| U6 | **Une carte reconnue de façon sûre mais fausse** ne se corrige pas : il faut ✕ puis scanner à nouveau. | « Pas cette carte ? » dans la carte en grand et par appui long sur la ligne : les 3 autres candidates de la lecture, puis une recherche. | moyen | M |
| U7 | **Ligne « non reconnue » encombrante** : « Ta photo » en grand **et** la même photo en vignette, sur ≈ 200 px (`p393-16-quitter.png`, `s360-02-prix-liste.png`). | Une seule image ; la photo en grand seulement au toucher. | moyen | S |
| U8 | **Caméra refusée ou absente** : le grand cercle reste au centre et ne mène qu'à un toast ; « Photos » reste un petit bouton ; aucun « Réessayer » (`err-p393-02-camera-refusee-appui.png`). | Sans caméra, le cercle devient « Choisir des photos » ; ajouter un bouton « Réessayer la caméra » et un lien vers les réglages de l'appli (Android). | moyen | S |
| U9 | **Ordinateur** : « Scanner » (barre du bas) ouvre la webcam dans une mise en page de téléphone étirée (pastille des éditions de 1 064 px, aperçu de 230 px de haut, grand vide ; `pc-02-scan-webcam.png`). Le scan mobile est caché dans « Ajouter des cartes » et exige **le même compte sur les deux appareils** (aucun QR). | Sur ordinateur, « Scanner » ouvre d'abord **« Scanner avec ton téléphone »** : un QR à usage unique qui associe un téléphone sans compte (ou avec un autre compte), plus « Activer » pour le même compte, et en second choix la webcam. Mise en page à 2 colonnes : dernière carte en grand et liste. | fort pour les ordinateurs | M à L |
| U10 | Réception sur le PC : liste simple sans total ni dernière carte en grand (`pc-06-pc-recu.png`). | Compteur et total en direct, dernière carte en grand, son à chaque carte reçue. | moyen | S |
| U11 | **Session d'ouverture** : entrée seulement par Scan › Réglages (et Compte), ce que la visite guidée doit rattraper ; chaque paquet repasse par « Ajouter » puis le récap (2 appuis de plus par paquet), alors que la session est déjà un récap. | Pendant une session, les cartes reconnues vont **directement** dans la session (le bandeau compte en direct) ; ajouter une entrée « Ouvrir des boosters » dans la barre du scan (segment Ajouter / Prix / **Ouverture**). | moyen | S |
| U12 | Pastille « Éditions : comme la 1… » tronquée à 393 et 360 px, illisible. | Libellé court (« Éd. : 1re carte ») ou icône seule, comme quand « Ranger dans » est affiché. | faible | S |
| U13 | Prix rapide : « × 2 − » est un bouton qui **retire** un exemplaire, ce qui ne se devine pas. La liste est limitée à 40 cartes sans le dire. | Pas-à-pas `− 2 +` explicite ; afficher « 40 dernières ». | faible | S |
| U14 | Échec de lecture lent (5 à 9 s) qui bloque la file en mode Photos et manuel. | Abandon plus tôt (moteurs d'autres écritures seulement si l'image ressemble à leur écriture), ou mise de côté pour relecture en fin de file. | moyen | M |

Points positifs : 0 faux positif « sûr » ; très bonne tolérance au flou, à la rotation, au sombre et aux petites images ; aperçu qui ne fige pas pendant la lecture ; file d'attente visible (« Lecture… · 2 avant ») ; reprise après rechargement (« Scan repris », `fin-p393-09-reprise.png`) ; « Quitter le scan ? » qui garde les cartes ; toast « Annuler » après l'ajout ; mode streamer complet ; bilan d'ouverture clair (`s360-10-bilan.png`) ; vrai « hors ligne » une fois le moteur et le catalogue préparés (3/3 lues, `off-p393-02-prepare-liste.png`) ; thème sombre cohérent.

---

## 4. Fonctionnalités à améliorer (c)

| # | Proposition | Pourquoi | Impact | Effort |
|---|---|---|---|---|
| C1 | **Prix rapide fidèle** : édition lue sur la ligne du bas, foil (interrupteur), prix de la langue ; « + » qui garde ces données (voir B2). | Aujourd'hui, c'est le prix générique : un foil ou une promo est mal estimé, justement en bourse ou en échange. | fort | M |
| C2 | **Reflet et foil** : quand le titre est surexposé (0/8 dans le banc), conseil immédiat « Reflet : incline la carte », puis relecture par la ligne du bas, l'illustration ou le symbole, même en cadrage « Nom seulement ». | Le foil est la faiblesse connue de ManaBox et de TCGplayer (`concurrence.md`) : c'est l'occasion de faire mieux. | fort | M |
| C3 | **Session d'ouverture** : valeur foil (B3), meilleure carte affichée en direct, tri par valeur, « Mes ouvertures » synchronisé (aujourd'hui sur l'appareil seulement). | C'est la fonction sans équivalent chez les concurrents (`concurrence.md` § 4). | moyen | M |
| C4 | **État (NM, EX…) par ligne et par défaut dans les réglages du scan.** *Déjà prévu* (a-faire : « État par ligne : à voir plus tard »). | Moxfield et ManaBox l'ont ; c'est nécessaire pour vendre ou échanger. | moyen | M |
| C5 | Réglages du scan : **foil par défaut**, **seuil de « carte de valeur »** (son et mise en avant), **son activé** dans les sessions d'ouverture. | Rafales de vrac et ouvertures. | moyen | S |
| C6 | Scan mobile : signal « téléphone parti en veille » côté PC, et reprise automatique. | Remarque du a-faire « téléphone qui se met en veille pendant le scan ». | faible | S |

## 5. Nouvelles fonctionnalités (d)

| # | Proposition | Référence | Impact | Effort |
|---|---|---|---|---|
| N1 | **Appairage par QR sans compte** (PC ↔ téléphone, ou téléphone d'un ami qui scanne pour toi), code à usage unique. | Le brief parle de « scan mobile via QR » : ce n'est pas implémenté, et le compte reste obligatoire. | fort | M |
| N2 | **Mode « tri du vrac »** : seuils de prix, piles (≥ 2 € / rare / commune), annonce vocale ou couleur plein écran par pile. *Déjà prévu* (idées du comparatif, a-faire:81). | Delver Lens : tri rapide ; usage majeur du scan en rafale. | fort | M |
| N3 | **Vue streamer pour OBS** : URL en lecture seule (dernière carte en grand, total, gain ou perte en direct), utilisable comme source navigateur. | Complète le mode streamer sans équivalent ailleurs. | moyen | M |
| N4 | **Valeur attendue d'un booster** (EV) affichée au départ de la session, puis comparée au bilan. *Déjà prévu* (a-faire:81, 235). | Bilan « × 1,45 » plus parlant. | moyen | M |
| N5 | **Scan d'une page de classeur (9 cartes)**. *Déjà évalué comme effort élevé* (concurrence § 20). | Collectr. | moyen | L |
| N6 | **Historique des scans** (dernières sessions, scans annulés récupérables 24 h). | Filet de sécurité après « Tout effacer et quitter » ou un « Annuler » manqué. | faible | S |

---

## 6. Comparaison avec les références

| Critère | Mana Orbit | Delver Lens | ManaBox | Dragon Shield | Collectr |
|---|---|---|---|---|---|
| Rafale en continu | ✅ Auto (≈ 33 cartes/min simulées, « Encore X ? ») | ✅ réputé le plus rapide | ✅ | ? | ? |
| Confirmation | « à vérifier » entre 72 et 84 % avec ta photo ✅ ; mauvaise carte sûre : ✕ seulement | ? | liste modifiable | ? | ? |
| Foil | 3 gestes, rien en « Sans édition » ni en prix rapide ❌ | interrupteur ? | réglage ? (critiqué sur la lecture des foils) | ? | ? |
| Édition | ligne du bas, illustration, symbole, 1re carte ✅ (le plus complet) | ? | ? | ? | ? |
| Son et vibration | ✅ mais même retour pour « à vérifier », aucun pour l'échec, vibration coupée avec la réduction des animations | son ? | ? | ? | ? |
| Liste de session | ✅ reprise après rechargement ; cachée par le bandeau d'édition en rafale | ✅ | ✅ | ? | ? |
| Annulation | toast « Annuler » ✅ ; « − » avec confirmation | ? | ? | ? | ? |
| Prix par carte au scan | prix rapide seulement (générique) | ✅ | ✅ | ✅ 4 sources | ✅ |
| Langues, Asie | 11 langues, sur l'appareil ✅✅ | ? | toutes ? | toutes ✅ | ? |
| Téléphone vers PC | ✅ même compte ; ❌ QR | ? | ? | ? | ? |
| Ouverture, streamer | ✅ unique | ❌ | ❌ | ❌ | ❌ |

« ? » : non vérifié. Les pages des concurrents n'ont pas pu être ouvertes (voir `concurrence.md`).

## 7. Captures utiles (`scratchpad/scan/`)
- Écran : `p393-03-scan-vide.png`, `dark-s360-03-scan-vide.png`, `apk-p393-01-ecran-carte-entiere.png`, `pc-02-scan-webcam.png`
- Liste et bandeau : `p393-10-liste.png`, `apk-p393-03-auto-rafale.png`, `dark-s360-11-liste-bas.png` (B5)
- Aide : `p393-04-aide.png` (B6) ; réglages : `p393-05-reglages.png`, `p393-07-reglages-auto.png`
- Édition et foil : `p393-12-edition-feuille.png`, `rg-p393-04-ligne-foil.png`, `fin-p393-07-editions-a-choisir.png`
- Récap : `p393-15-recap-2.png`, `fin-p393-04-fin-3.png` ; quitter : `p393-16-quitter.png` ; reprise : `fin-p393-09-reprise.png`
- Prix rapide : `s360-02-prix-liste.png` (B5)
- Erreurs : `err-p393-02-camera-refusee-appui.png`, `off-p393-02-photo.png`, `off2-p393-01-cdn-coupe.png` (B7, B8), `off-p393-03-prepare-recap.png`
- Scan mobile : `pc-05-mob-active.png`, `p393-01-bandeau-pc.png`, `p393-02-scan-distant.png`, `pc-06-pc-recu.png`, `p393-04-saisir-apres.png` (B1)
- Ouverture : `s360-04-ouverture-depart.png`, `s360-05-ouverture-scan.png`, `s360-08-accueil-streamer.png`, `s360-09-session-en-cours.png`, `s360-10-bilan.png`
- « Encore X ? » : `apk-p393-04-encore.png`, `apk-rm-s360-04-encore.png`
