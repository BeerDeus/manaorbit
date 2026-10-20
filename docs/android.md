# Mana Orbit sur Android : guide pas à pas

Le dossier `android-app/` contient l'appli Android. C'est une coque native (Capacitor) qui ouvre https://manaorbit.app et ajoute ce qu'un navigateur ne sait pas faire :

- l'appareil photo natif et la lecture ML Kit pour le scan, fluides comme Snapchat ;
- la connexion Google native, les notifications Firebase, le bandeau AdMob, le widget d'écran d'accueil et le bouton Retour d'Android.

Toute mise à jour du site arrive tout de suite dans l'appli. Il ne faut refaire l'appli que si la partie native change (plugins, icônes, permissions).

Les boutons d'Android Studio sont écrits **en anglais, tels qu'ils apparaissent à l'écran**, avec la traduction entre parenthèses.

---

## 1. Installer les outils (une seule fois)

1. **Node.js** (version 22 ou plus récente) : https://nodejs.org. Clique sur le bouton « LTS » et garde les options par défaut pendant l'installation. Si Android Studio était ouvert, redémarre-le ensuite : sinon son terminal ne trouve pas `npm`.
2. **Git** : https://git-scm.com/download/win. Options par défaut.
3. **Android Studio** : déjà installé. Au premier lancement, accepte le téléchargement du SDK proposé par l'assistant : **Next** (suivant) puis **Finish** (terminer).

Pour vérifier, ouvre un terminal : sous Windows, tape « PowerShell » dans le menu Démarrer. Puis :

```bash
node -v        # doit afficher v22 ou plus récent
git --version  # doit afficher une version
```

Si PowerShell répond « l'exécution de scripts est désactivée sur ce système » quand tu lances `npm`, tape une fois `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, réponds `O` (oui), puis relance la commande.

---

## 2. Récupérer le projet

Dans le terminal, place-toi dans le dossier de ton choix (par exemple `cd Documents`), puis :

```bash
git clone https://github.com/BeerDeus/mtgcardshop.git
cd mtgcardshop/android-app
npm run setup
npm run open
```

- `npm run setup` installe Capacitor et ses plugins, puis prépare le projet Android. Compte 1 à 2 minutes.
- `npm run open` ouvre le projet dans Android Studio.
- Plus tard, après chaque `git pull` : `npm run setup` depuis `android-app`, avant de refaire l'appli.

**Variante sans terminal externe, depuis Android Studio :**
1. Sur l'écran d'accueil, clique **Clone Repository** (cloner un dépôt).
2. Dans **URL**, mets `https://github.com/BeerDeus/mtgcardshop.git`. Dans **Directory** (dossier), choisis l'emplacement, puis **Clone** (cloner).
3. Ouvre l'onglet **Terminal** en bas de la fenêtre, puis tape :
   ```bash
   cd android-app
   npm run setup
   ```
4. **File › Open…** (Fichier › Ouvrir) : choisis `mtgcardshop/android-app/android`, puis **OK**. Le projet Android est dans ce sous-dossier, pas à la racine du dépôt.

Si `npm run open` ne trouve pas Android Studio, ouvre le projet à la main :
1. Dans Android Studio : **File › Open…** (Fichier › Ouvrir).
2. Choisis le dossier `mtgcardshop/android-app/android`.
3. Clique **OK**.

Si Android Studio demande s'il doit faire confiance au projet, clique **Trust Project** (faire confiance au projet).

À la première ouverture, Android Studio lance une **Gradle Sync** (synchronisation Gradle) : une barre de progression en bas à droite. Elle télécharge ce qu'il faut et dure quelques minutes. Attends qu'elle soit finie avant la suite.

---

## 2 bis. Firebase : le fichier `google-services.json` (obligatoire)

La connexion Google et les notifications de l'appli passent par Firebase. Sans le fichier `google-services.json`, Android Studio refuse de compiler, avec un message clair. C'est voulu : sans lui, l'appli se fermerait au lancement.

1. Va sur https://console.firebase.google.com et ouvre le projet **m2s-mtg**.
2. **Paramètres du projet** (roue dentée) › onglet **Général** › **Vos applications** › **Ajouter une application** › icône **Android**.
3. **Nom du package Android** : `app.manaorbit`. Surnom : « Mana Orbit Android ».
4. **Certificat de signature SHA-1** (nécessaire pour la connexion Google). Pour l'obtenir, dans Android Studio :
   - appuie deux fois sur **Ctrl** : la fenêtre **Run Anything** (tout exécuter) s'ouvre ;
   - tape `gradle signingReport`, puis Entrée ;
   - dans le panneau qui s'ouvre en bas, copie la ligne **SHA1** de la variante **debug**.

   À défaut, dans l'onglet **Terminal** en bas (il s'ouvre déjà dans `android-app/android`) :
   ```powershell
   $env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
   .\gradlew signingReport
   ```
   Sur Mac ou Linux : `./gradlew signingReport`.

   `signingReport` marche avant d'avoir `google-services.json`. Une empreinte s'ajoute aussi plus tard : **Paramètres du projet** › ton appli Android › **Ajouter une empreinte**.
5. **Enregistrer l'application**, puis **Télécharger google-services.json**.
6. Place ce fichier dans `mtgcardshop/android-app/android/app/`, à côté de `build.gradle`.
7. Dans Android Studio : l'icône éléphant **Sync Project with Gradle Files** (synchroniser le projet avec Gradle).

Pour la publication sur le Play Store, une étape de plus : Play Console › ton appli › **Tester et publier › Configuration › Intégrité de l'application** (Test and release › Setup › App integrity). Copie le **SHA-1 du certificat de la clé de signature de l'application** (App signing key certificate), ajoute-le comme empreinte dans Firebase, puis retélécharge `google-services.json`.

La connexion Google utilise le compte Google du téléphone : un sélecteur natif, sans fenêtre de navigateur. Elle n'ouvre jamais le navigateur : si l'APK a été construit sans le plugin, l'appli demande de la mettre à jour (voir § 6). La connexion par e-mail et mot de passe marche aussi.

## 3. Essayer sur ton téléphone (Xiaomi 14)

### Sur le téléphone

1. **Paramètres › À propos du téléphone** : touche **Version de l'OS** 7 fois de suite. Le message « Vous êtes maintenant développeur » apparaît.
2. **Paramètres › Paramètres supplémentaires › Options pour les développeurs**, puis active :
   - **Débogage USB** ;
   - **Installer via USB**. Xiaomi demande de te connecter à ton compte Mi pour celle-ci.
3. Branche le téléphone en USB au PC. À la question « Autoriser le débogage USB ? », coche « Toujours autoriser » puis **OK**.

### Dans Android Studio

1. En haut de la fenêtre, dans la liste des appareils (**Device Manager**, gestionnaire d'appareils, ou la liste déroulante à côté de « app »), choisis ton Xiaomi.
2. Clique le bouton vert **Run ▶** (exécuter), ou **Run › Run 'app'**.
3. L'appli s'installe et s'ouvre sur le téléphone.

**Pour tester le scan :** dans Ma collection, l'icône appareil photo **Scanner des cartes**, ou **Prix rapide** sur l'accueil. L'aperçu de l'appareil photo est natif. Le nom de la carte est lu sur le téléphone par ML Kit (Google), dont le modèle arrive avec les services Google Play à l'installation de l'appli. Cartes chinoises, japonaises, coréennes : voir « Scan des cartes chinoises, japonaises, coréennes » plus bas (APK 1.0.6).

**En ligne de commande**, depuis `android-app` (Windows, Mac ou Linux) : `npm run apk` fabrique le même APK de test sans Android Studio ; sous Windows, définis d'abord `JAVA_HOME` comme au 2 bis. Pour le Play Store, passe par l'étape 4.1 (fichier signé).

### Raccourcis et partage

- **Appui long sur l'icône** : Scanner, Prix rapide, Échange, Nouveau panier (un raccourci peut être épinglé sur l'écran d'accueil). Ils passent par `ShortcutActivity`, une tâche à part : sans elle, Android relancerait l'appli de zéro (recherche ou scan en cours perdus).
- **Partager vers Mana Orbit** : depuis Chrome (page d'un deck EDHREC ou Archidekt ; un lien Moxfield n'est pas lu, il faut coller la liste exportée) ou une appli de notes, « Partager » › Mana Orbit ouvre « Nouveau panier » avec la liste.
- Si toucher un raccourci ne fait rien du tout : mets `android:exported="true"` sur `ShortcutActivity` dans `AndroidManifest.xml` (il ne transmet que ces 4 actions), puis reconstruis.

### Widget

Le widget « Ma collection » affiche la valeur de ta collection, sa variation (sur 7 jours, ou celle du marché seul si tu as ajouté des cartes, avec sa durée), le nombre de cartes et, en 4 × 2, la courbe des 30 derniers jours. Au-delà de 36 h sans nouvelles données, « il y a 3 j » s'affiche en gris.

1. Appui long sur un espace vide de l'écran d'accueil › **Widgets** › **Mana Orbit** › « Valeur de la collection » (4 × 2 par défaut, redimensionnable jusqu'à 2 × 1).
2. Ouvre l'appli une fois : le widget se remplit, puis se met à jour à chaque changement dans l'appli.
3. Appli fermée, il estime la valeur chaque jour d'après les prix Cardmarket du serveur (Wi-Fi de préférence ; en données mobiles, toutes les 44 h au plus) : « ≈ » et « estimée » jusqu'à la prochaine ouverture.
4. Toucher le widget ouvre ta collection ; son bouton ouvre le scan ou le prix rapide, au choix dans l'appli : **Réglages › Widget**.

Le widget prend la langue choisie dans l'appli. Pour couper l'estimation appli fermée : `ValueRefreshJob.ENABLED = false` (Java), puis reconstruire l'APK.

### Widget « QR code d'échange »

Un deuxième widget, à part : le QR code du lien public de ta liste d'échange, en grand, avec ton pseudo et « Liste d'échange » dessous. L'autre joueur le scanne depuis ton écran d'accueil, sans que tu ouvres l'appli.

1. Appui long sur un espace vide de l'écran d'accueil › **Widgets** › **Mana Orbit** › « QR code d'échange » (2 × 2 par défaut, agrandissable : le code suit la taille).
2. Ouvre l'appli une fois, connecté : le code apparaît. Il change tout seul quand tu crées, arrêtes ou renouvelles le lien, ou quand tu changes de pseudo.
3. Sans lien d'échange (pas encore créé, arrêté, compte déconnecté) : « Crée ton lien d'échange ». Toucher le widget ouvre l'onglet Échange dans tous les cas.

Fond blanc même en thème sombre : un lecteur de QR code attend du foncé sur clair. Le code est calculé par le site (`src/qr.js`) et dessiné par `TradeWidget.java` ; rien n'est lu sur le réseau.

### Liens manaorbit.app ouverts dans l'appli (App Links, APK 1.0.5)

Le QR code d'un autre joueur scanné avec l'appareil photo du téléphone (liste d'échange `https://manaorbit.app/?p=…`, échange en direct `?troc=…`, table d'une partie de Commander `?table=…`, résultat `?partie=…`), ou ce lien touché dans WhatsApp ou Messages, s'ouvre **dans l'appli**, directement sur la bonne page, au lieu du navigateur. Il faut deux choses : la variable `ASSETLINKS_SHA256` sur Hostinger et l'APK **1.0.5 (versionCode 6)**.

**1. Les empreintes SHA-256 (une seule fois)**

1. Play Console › Mana Orbit › **Test et publication › Intégrité de l'appli** › onglet **Signature de l'application** (Test and release › App integrity › App signing ; selon la version de la console : « Tester et publier › Configuration › Intégrité de l'application »).
2. Copie les deux lignes **Empreinte du certificat SHA-256** (SHA-256 certificate fingerprint), de la forme `14:6D:E9:…:E5` :
   - **Certificat de la clé de signature de l'application** (App signing key certificate) : la clé de Google, celle de l'appli installée depuis le Play Store (test interne, test fermé, production) ;
   - **Certificat de la clé d'importation** (Upload key certificate) : ta clé `.jks`, celle d'une APK que tu construis toi-même en **release**.
3. Facultatif, pour l'appli lancée par **Run ▶** (clé de debug de ton PC) : la ligne **SHA-256** de la variante **debug** de `gradle signingReport` (voir § 2 bis, étape 4).
4. **Fait le 15 octobre 2026** : les deux empreintes sont écrites dans `proxy.mjs` (`ASSETLINKS_DEF`), aucune variable à créer. Seulement si la clé change (ou pour ajouter la clé de debug) : Hostinger › ton site Node.js › **Variables d'environnement** : `ASSETLINKS_SHA256` = les empreintes séparées par des virgules, par exemple `14:6D:E9:…:E5,FA:C6:17:…:9C` (les « : » sont facultatifs, majuscules ou minuscules). Enregistre, puis redéploie.
5. Vérifie dans un navigateur : https://manaorbit.app/.well-known/assetlinks.json affiche `app.manaorbit` et tes empreintes (avec `ASSETLINKS_SHA256=0` : `{"error":"not_found"}`). Le journal du serveur dit « App Links Android : … 2 empreintes SHA-256 » ; une empreinte mal copiée y est signalée (« empreinte ignorée »).

Ces empreintes ne sont pas secrètes (n'importe qui peut les lire dans ce fichier) ; la variable évite seulement de les écrire dans le dépôt. Le serveur écrit lui-même le fichier `assetlinks.json` (`Content-Type: application/json`, sans redirection) : rien d'autre à copier.

**2. La nouvelle APK 1.0.5 (versionCode 6)**

`git pull`, puis `npm run setup` depuis `android-app`, puis un `.aab` signé (§ 4.1) envoyé dans la Play Console (§ 4.3) ; pour un essai direct sur ton téléphone : **Run ▶**. Seuls changements natifs : le filtre de liens de `MainActivity` (`AndroidManifest.xml`) et un lien qui n'est plus rejoué quand l'appli est rouverte depuis les applis récentes (`MainActivity.java`, `ManaOrbitPlugin.forget`).

Android vérifie le site **à l'installation et à chaque mise à jour** de l'appli : mets la variable **avant** d'installer la 1.0.5. Appli déjà installée avant ? Téléphone branché : `adb shell pm verify-app-links --re-verify app.manaorbit`, ou désinstalle puis réinstalle l'appli.

**3. Vérifier sur le téléphone**

- **Paramètres › Applications › Mana Orbit › Ouvrir par défaut** (le nom varie selon le téléphone) : « Ouvrir les liens compatibles » activé, `manaorbit.app` parmi les liens vérifiés.
- Téléphone branché : `adb shell pm get-app-links app.manaorbit` affiche `manaorbit.app: verified`.
- Essai : sur un autre téléphone, Échange › **QR code** (ou le widget « QR code d'échange ») ; scanne-le avec l'appareil photo ou Google Lens : Mana Orbit s'ouvre sur la liste d'échange.

**Ce que fait l'appli** (`src/applink.js`) :

- appli fermée : elle démarre directement sur la page du lien (écran de lancement court, comme dans le navigateur) ;
- appli ouverte : la page du lien s'ouvre sans recharger l'appli (un scan ou une saisie en cours restent là) ;
- seule la page de l'appli (`https://manaorbit.app/` et ses paramètres) est prise : `/privacy`, `/legal` et `/admin` restent dans le navigateur, et aucune autre adresse ne s'ouvre jamais dans l'appli ;
- Capacitor seul ouvrirait toujours l'accueil (`server.url`) : c'est le site qui lit le lien, par `@capacitor/app` (`App.getLaunchUrl()` au lancement, événement `appUrlOpen` appli ouverte) ;
- appli rouverte depuis les applis récentes, ou relancée par Android après avoir été fermée en arrière-plan : le dernier lien n'est pas rejoué.

**Sans vérification** (variable absente ou fausse, APK 1.0.4 ou plus ancienne, lecteur de QR code qui ouvre lui-même les liens dans son propre navigateur) : le lien s'ouvre dans le navigateur. Sur Android, le site y affiche en bas une petite barre **« Ouvrir dans l'appli Mana Orbit »** (une adresse `intent://` qui vise l'appli par son nom de paquet : elle ouvre la 1.0.5 même sans vérification ; sans l'appli, ou avec une APK plus ancienne, elle mène à la fiche Play) et **« Pas encore l'appli ? L'installer »**. ✕ la ferme jusqu'à la fin de la session de l'onglet ; jamais dans l'appli, sur iPhone ou sur ordinateur. Adresse de la fiche : `PLAY_URL` dans `src/help.js` (pendant le test fermé, la fiche n'est visible que des testeurs : remplace-la au besoin par le lien d'inscription au test).

### Scan des cartes chinoises, japonaises, coréennes (ML Kit, APK 1.0.6)

**Le problème (19 octobre 2026)** : dans l'appli, une carte chinoise n'était jamais reconnue. Le scan lit le nom avec ML Kit « latin », qui ne connaît que l'alphabet latin : sur « 阳光戒 » (Sol Ring), il rend « BEE » ou rien. Le moteur chinois (Tesseract) n'était lancé que si la langue était imposée dans les réglages du scan, ou après 3 cartes chinoises déjà reconnues : en pratique, jamais. Seule une carte récente, avec « DSK • CS » en bas, passait par sa ligne du bas. Japonais et coréen : pareil. Russe aussi (ML Kit lit « Conneunoe Konno » pour « Солнечное Кольцо »), et une carte russe récente restait « à vérifier ».

**Corrigé côté site (toutes les APK, rien à refaire)** : quand ML Kit ne lit rien de sûr, l'appli essaie les moteurs des autres écritures (chinois, japonais, coréen, russe), un après l'autre. D'abord ceux qu'on attend : langue des cartes choisie dans l'appli, cartes de ces langues déjà scannées, langue du téléphone. La première carte chinoise trouvée fait passer le moteur chinois devant pour la suite du scan. Une carte latine bien lue ne change rien : pas plus lent qu'avant. Avec l'APK 1.0.5, ces moteurs sont ceux de Tesseract : ≈ 0,3 s chacun sur le téléphone, un modèle de 1,6 à 2,7 Mo téléchargé la première fois, et le chinois se trompe plus souvent (sur des cartes de test, ≈ 3 noms sur 4 lus sûrement, les autres « à vérifier »).

**APK 1.0.6 (versionCode 7)** : ML Kit chinois, japonais et coréen, directement sur le téléphone (≈ 0,1 s, bien plus fiable que Tesseract). Le plugin local `ManaOrbit` a une méthode `detectText` qui prend l'écriture : `latin`, `chinese` (simplifié et traditionnel), `japanese`, `korean` ; chacun de ces modèles lit aussi l'alphabet latin. Le site s'en sert dès qu'elle est là ; une APK plus ancienne garde Tesseract. Le russe reste sur Tesseract : ML Kit ne lit pas le cyrillique.

**Choix : les modèles des services Google Play, pas les modèles embarqués.** La taille de l'appli compte :

| | Modèles embarqués (`com.google.mlkit:text-recognition-chinese`…) | Services Google Play (`com.google.android.gms:play-services-mlkit-text-recognition-chinese`…), **choisi** |
| --- | --- | --- |
| Taille de l'appli | ≈ 4 Mo de plus par écriture : ≈ 12 Mo pour les trois | ≈ 260 Ko par écriture : moins de 1 Mo pour les trois |
| Premier scan d'une écriture | prêt tout de suite | le téléphone télécharge le modèle (quelques secondes en Wi-Fi) ; en attendant, Tesseract lit la carte |
| Mises à jour du modèle | avec l'appli | par Google, sans nouvelle version |

La plupart des utilisateurs ne scanneront jamais de carte d'Asie : ils ne téléchargent rien de plus. C'est aussi ce que fait déjà le plugin ML Kit latin. Option (non activée) pour que le Play Store télécharge les trois modèles dès l'installation, au prix de la place sur tous les téléphones : dans `AndroidManifest.xml`, sous `<application>`, `<meta-data android:name="com.google.mlkit.vision.DEPENDENCIES" android:value="ocr,ocr_chinese,ocr_japanese,ocr_korean" />`.

**À faire :**

1. Mettre le projet à jour (`git pull`), puis `npm run setup` depuis `android-app`, puis dans Android Studio l'icône éléphant **Sync Project with Gradle Files** : elle télécharge les nouvelles bibliothèques (ML Kit chinois, japonais, coréen, Play In-App Review). Le code Java a été vérifié ici à la compilation avec des bouchons (le dépôt Maven de Google n'était pas joignable) : si la synchronisation ne trouve pas une version, elle le dit (versions dans `android-app/android/app/build.gradle`).
2. Essai sur le Xiaomi : **Run ▶**. En bas de **Réglages**, la ligne « APK : » montre **1.0.6 (7)**.
3. **Scan d'une carte chinoise**, sans rien changer aux réglages du scan, en Wi-Fi : la première fois, le téléphone télécharge le modèle chinois et la carte peut être lue par Tesseract (un peu plus lent) ; les suivantes par ML Kit. Puis une japonaise et une coréenne. Une carte russe passe par Tesseract.
4. Une carte pas reconnue : **Signaler ce scan** sur sa ligne (la photo, le texte lu et le moteur partent avec, voir `/admin`).
5. Puis un `.aab` signé (§ 4.1, même fichier `.jks`), envoyé dans la Play Console (§ 4.3). **Une fois la 1.0.6 en ligne** : `APK_LATEST` à 7 dans `proxy.mjs` (ou la variable sur Hostinger) ; les 1.0.5 verront alors « Mise à jour de l'appli ».

### Demande de note dans l'appli (In-App Review, APK 1.0.6)

Au bon moment (5 cartes ou plus ajoutées d'un scan, deck tout juste complet ; appli utilisée depuis 4 jours, aucune erreur dans la session, au plus tous les 120 jours et 3 fois en tout), l'APK 1.0.6 ouvre la **carte de note de Google Play** par-dessus l'appli, au lieu de notre feuille « Noter Mana Orbit » qui ouvrait la fiche : on note sans quitter l'appli. Plugin local `ManaOrbit` (`requestReview`), bibliothèque `com.google.android.play:review` (quelques dizaines de Ko).

- Google décide seul de l'afficher (nombre limité par compte) et ne dit jamais si une note a été laissée : la demande compte quand même dans les limites ci-dessus, sans « plus jamais » ni badge.
- Jamais depuis un bouton (Google le déconseille : si son quota est atteint, rien ne s'afficherait) : **Réglages › Aide et avis › Noter sur le Play Store** reste un lien vers la fiche.
- Le Play Store refuse (appli installée hors du Play Store, Play Store absent) : notre feuille, comme avant. Avec **Run ▶**, la carte de Google peut ne rien afficher : c'est normal, elle ne marche que pour une appli installée depuis le Play Store (test interne ou fermé compris).
- **Tout reste coupé tant que `RATE_ASK` vaut `false`** dans `src/help.js` (ni demande, ni bouton) : à passer à `true` à la mise en production.

### APK 1.0.7 (versionCode 8) : R8 et bord à bord (demandés par la Play Console, 20 octobre 2026)

Prête dans le code, **à construire après la mise en production** (rien ne presse : échéance février 2027 ; la 1.0.6 part en production telle quelle).

- **Optimisation du code DEX** (« Obscurcissement 1 % », seuil 25 %, catégorie Utilisation de mémoire) : **R8 allumé** pour la version release (`minifyEnabled true`, `proguard-android-optimize.txt`). Les plugins Capacitor, le pont JavaScript, les widgets et le service du manifeste sont gardés par les règles des bibliothèques ; `proguard-rules.pro` garde en plus `FirebaseApp.getApps` (lu par réflexion) et les numéros de ligne des plantages. `shrinkResources` reste éteint. Le fichier de correspondance part tout seul dans l'`.aab` : les plantages de la Play Console restent lisibles.
- **Bord à bord** : `EdgeToEdge.enable(this)` dans `MainActivity` : Android 7 à 14 s'affichent comme Android 15 et plus (déjà bord à bord, cible SDK 36), les marges des barres passent au site par SystemBars de Capacitor. La constante de découpe `SHORT_EDGES` (obsolète) n'est plus dans notre code.
- **« API obsolètes pour le bord à bord »** : notre code n'en appelle plus ; ni Capacitor 8 ni ses plugins n'appellent `setStatusBarColor` / `setNavigationBarColor`. Si l'alerte reste avec la 1.0.7, ouvre son détail dans la Play Console : il nomme la bibliothèque (souvent une bibliothèque Google, rien à faire de notre côté).
  **Vu le 20 octobre sur la 1.0.7** : seul reste `LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES` dans `a2.a.t` (nom raccourci par R8). C'est `EdgeToEdge` d'androidx.activity 1.11.0, la fonction même que la Play Console conseille d'appeler : elle ne pose `SHORT_EDGES` que sur Android 9 et 10, où la constante n'est pas obsolète (Android 11 et plus : `ALWAYS`, posé aussi par `MainActivity`). **On garde tel quel** : simple recommandation, sans effet sur l'examen ni la production. Le retirer obligerait à refaire le bord à bord à la main et ramènerait une bande noire sous la caméra sur Android 9 et 10. Vérification possible : `app/build/outputs/mapping/release/mapping.txt`, chercher ` -> a2.a:`. L'alerte « bord à bord pas disponible pour tous » est générale (toute appli qui cible le SDK 35) : déjà traitée (`EdgeToEdge.enable`, marges des barres données au site).
- **Picture-in-picture** : pour les applis vidéo, sans objet ici.

**À faire (après la production) :**

1. `git pull`, `npm run setup` dans `android-app`, Android Studio › **Sync Project with Gradle Files**.
2. **Run ▶** n'essaie que la version debug, **sans R8** : la vraie vérification se fait sur la version release. `.aab` signé (§ 4.1), envoyé sur le **test interne** (§ 4.3), installé depuis le Play Store sur le Xiaomi.
3. À vérifier sur cette version : lancement, connexion Google, synchro, scan (latin et une carte japonaise), widget « Valeur de la collection » et widget QR, notification (une alerte de prix ou « Partie enregistrée »), raccourcis de l'icône, partage d'une liste vers l'appli, lien `https://manaorbit.app/?p=…` touché dans une messagerie, bandeau AdMob, demande de note. En bas de **Réglages** : « APK : 1.0.7 (8) ».
4. Tout va bien : passer la même version du test interne à la production (Play Console › Production › « Promouvoir la version »), puis `APK_LATEST` à 8.

---

## 4. Publier sur le Play Store

### 4.1. Créer le fichier à envoyer à Google (.aab)

1. Dans Android Studio : **Build › Generate Signed App Bundle or APK…** (générer un App Bundle ou un APK signé).
2. Choisis **Android App Bundle**, puis **Next** (suivant).
3. **Key store path** (emplacement de la clé) : clique **Create new…** (créer). Ensuite :
   - choisis où enregistrer le fichier `.jks`, par exemple `mana-orbit.jks` ;
   - mets un mot de passe dans **Password** et **Confirm** (confirmer) ;
   - dans **Key** (clé) : **Alias** `mana-orbit`, un mot de passe, et **Validity (years)** (validité en années) à 25 ;
   - dans **Certificate** (certificat), remplis au moins **First and Last Name** (prénom et nom) ;
   - clique **OK**.
4. **Garde précieusement le fichier `.jks` et ses deux mots de passe** (gestionnaire de mots de passe et copie de sauvegarde). Sans eux, tu ne pourras plus jamais mettre l'appli à jour.
5. Clique **Next**, choisis **release** (version de publication), puis **Create** (créer).
6. Le fichier `app-release.aab` est créé dans `android-app/android/app/release/`. Android Studio affiche une notification avec un lien **locate** (afficher dans le dossier).

### 4.2. Play Console (play.google.com/console)

1. **Créer une application** :
   - nom « Mana Orbit » ;
   - Application (pas Jeu) ;
   - Gratuite.
2. **Fiche Play Store principale** et **Contenu de l'appli** : copie tout depuis `docs/store/fiche.md` : textes (§1-4), classification (§6), public cible (§7), sécurité des données (§8) et visuels (§9, déjà prêts dans `docs/store/`).
3. Les adresses à donner :
   - Règles de confidentialité : `https://manaorbit.app/privacy`
   - Suppression de compte : `https://manaorbit.app/?delete-account`
4. **Tests › Tests internes** : envoie le fichier `.aab` et ajoute ton adresse e-mail comme testeur. Tu installes la version de test depuis le lien donné par Google.
   Juste après ce premier envoi, ajoute dans Firebase le SHA-1 de la clé de signature Play (**Intégrité de l'application**, voir la fin du 2 bis). Sinon « Continuer avec Google » échoue pour les testeurs.
5. Si ton compte développeur est un **compte personnel créé après novembre 2023**, Google impose un **test fermé avec au moins 12 testeurs pendant 14 jours** avant la mise en production. Les testeurs s'inscrivent via un lien.

**À ne publier qu'une fois l'accord d'EDHREC et d'Archidekt obtenu** (voir `docs/mails-partenaires.md`).

### 4.3. Mises à jour

- **Le site** (la plupart des changements) : push sur `main`, puis **Redéployer** dans Hostinger (sauf si le déploiement automatique est activé). L'appli se met à jour d'elle-même : au lancement ou au retour sur l'appli (après plus d'une minute ailleurs), elle se recharge si tu es sur l'accueil sans rien en cours ; sinon un toast « Recharger » le propose.
- **La partie native** (plugins, icônes, permissions) :
  1. Dans `android-app/android/app/build.gradle`, augmente `versionCode` de 1 (par exemple 1 → 2) et change `versionName` (par exemple "1.1").
  2. Dans le terminal, depuis `android-app` : `npm run setup`. À faire aussi après chaque `git pull` : il installe les plugins ajoutés entre-temps, sinon l'appli serait construite sans eux.
  3. Refais un fichier `.aab` signé (étape 4.1) avec le même fichier `.jks`.
  4. Envoie-le dans la Play Console : **Créer une release** dans la piste de test ou de production.

---

## Publicité (AdMob)

Un petit bandeau Google AdMob, en haut de l'écran, paie l'hébergement :
- seulement dans l'appli Android, jamais sur le site ni la PWA ;
- jamais pour les comptes de `ALLOWED_UIDS` (le tien) quand le serveur a `CARDTRADER_TOKEN` : connecté avec ton compte, tu ne vois aucune pub ;
- seulement sur les écrans de consultation : accueil, collection, Mes decks, liste d'échange d'un autre joueur. Jamais pendant la saisie d'une liste, la recherche et ses résultats, l'éditeur de deck, le scan, la carte en grand ni l'accueil du premier lancement (choix du 9 octobre, `adsBusy` dans `src/ads.js`) ;
- il arrive quelques secondes après l'ouverture puis reste en place sur ces écrans. La page descend de sa hauteur : rien n'est caché dessous.

Tant que rien n'est configuré, l'appli affiche le bandeau de **test** de Google : aucun revenu, aucun risque pour ton compte.

### 1. Créer le compte et déclarer l'appli
1. https://admob.google.com : connecte-toi avec ton compte Google, accepte les conditions, puis remplis **Paiements** (pays, adresse) pour être payé.
2. **Applis › Ajouter une application** : plateforme **Android** ; « L'appli est-elle publiée sur un store compatible ? » : **Non** tant qu'elle n'est pas sur le Play Store ; nom « Mana Orbit ».
3. **Applis › Mana Orbit › Paramètres de l'application** : copie l'**ID d'application**. Il ressemble à `ca-app-pub-1234567890123456~1234567890` (avec un tilde `~`).

### 2. Mettre l'ID d'application dans l'appli (nouvelle version)
Fait le 12 octobre : `admob_app_id` = `ca-app-pub-9859793504995886~7202291377` dans `android-app/android/app/src/main/res/values/strings.xml` ; le serveur sert aussi `https://manaorbit.app/app-ads.txt` avec cet éditeur. Pour le changer :
1. Ouvre `android-app/android/app/src/main/res/values/strings.xml`.
2. Remplace la valeur de `admob_app_id` par l'ID d'application.
3. Refais l'appli comme au § 4.3 : `versionCode` + 1, `npm run setup`, nouveau `.aab`. C'est la seule étape qui demande une nouvelle version.

### 3. Créer le bloc d'annonces (bannière)
1. **Applis › Mana Orbit › Blocs d'annonces › Ajouter un bloc d'annonces › Bannière**. Nom : « Bandeau haut ». Garde les réglages proposés (actualisation choisie par Google).
2. Copie l'**ID du bloc d'annonces**. Il ressemble à `ca-app-pub-1234567890123456/1234567890` (avec une barre `/`).
3. Hostinger › variables d'environnement : `ADMOB_BANNER_ID=<cet ID>` › redéployer. L'appli le lit à chaque lancement : rien à republier.

Mets `ADMOB_BANNER_ID` une fois la version avec ton ID d'application installée : avec l'ID d'application de test, les vraies annonces ne se chargent pas (rien ne s'affiche, sans autre conséquence). Sans la variable : bandeau de test.

**Ne touche jamais tes propres annonces réelles** (Google peut suspendre le compte). Pour voir le bandeau réel sur ton téléphone, déclare-le comme appareil de test : AdMob › **Paramètres › Appareils de test › Ajouter un appareil de test** (l'identifiant publicitaire est dans les paramètres Android, Google › Annonces).

### 4. Message de consentement (Europe)
1. AdMob › **Confidentialité et messages** › **RGPD** (Règlement européen) › **Créer un message**.
2. Choisis l'appli Mana Orbit, les langues français et anglais, et l'adresse de la politique de confidentialité : `https://manaorbit.app/privacy`.
3. Garde les boutons proposés (« Autoriser », « Gérer les options » ; ajoute « Ne pas autoriser » si on te le propose), puis **Publier**.

L'appli affiche ce message de Google avant la première annonce, aux utilisateurs concernés. Sans message publié, Google ne recueille pas le consentement en Europe et y limite fortement les annonces (souvent aucune). Quand Google l'exige, Réglages › Confidentialité propose aussi « Choix publicitaires » pour changer d'avis.

### 5. Play Console
- **Contenu de l'appli › Annonces** : « Contient des annonces : Oui ».
- **Contenu de l'appli › Identifiant publicitaire** : « Oui », utilisé pour la **publicité ou le marketing**.
- **Sécurité des données** : ajoute ce que collecte le SDK Google Mobile Ads, partagé avec Google pour la publicité : identifiants de l'appareil (identifiant publicitaire), interactions avec l'appli, diagnostics (plantages, performances), position approximative (adresse IP). Liste à jour : https://developers.google.com/admob/android/privacy/play-data-disclosure
- Une fois l'appli publiée : AdMob › **Applis › Mana Orbit › Paramètres › Infos sur le store**, relie l'appli à sa fiche Play Store. AdMob vérifie ensuite `app-ads.txt` sur le site indiqué dans la fiche : `https://manaorbit.app/app-ads.txt` est déjà servi (éditeur `pub-9859793504995886`).

## Notifications (Firebase Cloud Messaging)

Dans l'appli, les notifications « recherche terminée » et les alertes de prix passent par **Firebase Cloud Messaging** (FCM). La WebView d'Android ne reçoit pas les notifications Web Push du site. Le site, le navigateur et l'appli installée depuis le navigateur (PWA) gardent Web Push (clés VAPID), sans changement.

Le serveur envoie les notifications de l'appli avec un **compte de service** Firebase. À faire une seule fois :

1. Ouvre la **console Firebase** (console.firebase.google.com) et choisis le projet de l'appli, celui du fichier `google-services.json`.
2. Clique la roue dentée en haut à gauche, puis **Paramètres du projet**, onglet **Comptes de service**.
3. Clique **Générer une nouvelle clé privée**, puis **Générer la clé**. Un fichier `.json` est téléchargé.
4. Garde ce fichier en lieu sûr : c'est un secret. Il permet d'envoyer des notifications au nom de ton projet. Ne le mets jamais dans GitHub.
5. Sur **Hostinger**, ouvre ton site Node.js, puis **Variables d'environnement**. Ajoute `FCM_SERVICE_ACCOUNT`. Comme valeur, mets le contenu du fichier, de l'une de ces deux façons :
   - **le JSON sur une seule ligne** : ouvre le fichier dans le Bloc-notes et supprime les retours à la ligne entre les champs. Les `\n` écrits dans `private_key` restent tels quels.
   - **le JSON en base64**, plus sûr si l'interface coupe ou abîme le texte. Dans PowerShell :
     ```powershell
     [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Users\<toi>\Downloads\<fichier>.json")) | Set-Clipboard
     ```
     Le résultat est copié : colle-le comme valeur. Sur Mac : `base64 -i fichier.json | pbcopy`.
6. Enregistre, puis redéploie ou redémarre le site.
7. Vérifie : `https://manaorbit.app/__ping` doit afficher `"fcm":true`. Sinon, le journal du serveur dit pourquoi : « Notifications de l'appli (FCM) désactivées : … ».
8. Dans l'appli : **Réglages › Notifications › Prévenir quand la recherche est finie**, et/ou **Réglages › Alertes de prix**. Android 13 et plus demande alors l'autorisation d'envoyer des notifications.

Sur un serveur à toi, tu peux plutôt donner le chemin du fichier : `FCM_SERVICE_ACCOUNT_FILE=/chemin/vers/fichier.json`.

Bon à savoir :

- Le compte de service doit venir du **même projet** que `google-services.json`. Sinon FCM refuse les jetons (SENDER_ID_MISMATCH) et l'appareil est retiré.
- L'**API Firebase Cloud Messaging (V1)** doit être active : **Paramètres du projet › Cloud Messaging**. Elle l'est d'office sur les projets récents. Si elle est marquée « Désactivée », clique **⋮ › Gérer l'API dans Google Cloud Console**, puis **Activer**.
- Toucher une notification ouvre la bonne page : la recherche reprend (« recherche terminée »), ou la feuille des alertes s'ouvre. Si l'appli est déjà ouverte, un message s'affiche en bas de l'écran avec **Voir**.
- L'appli redemande son jeton FCM à chaque lancement. S'il a changé, les alertes repartent avec le nouveau et l'ancien est effacé du serveur.
- Un jeton refusé par FCM (appli désinstallée, données effacées) est retiré du serveur, comme un abonnement Web Push expiré.
- Si les notifications ont été refusées sur le téléphone : **Paramètres › Applications › Mana Orbit › Notifications**.
- Aucune dépendance côté serveur : `proxy.mjs` signe lui-même la demande de jeton Google (RS256) et garde ce jeton jusqu'à 5 minutes avant son expiration (1 h).

---

## 5. Fonctions natives

| Fonction | Plugin | Remarque |
| --- | --- | --- |
| Scan natif | `@capacitor-community/camera-preview` + `@pantrist/capacitor-plugin-ml-kit-text-recognition` | fait ; le site détecte l'appli Android (`Capacitor.isNativePlatform()`) |
| Scan chinois, japonais, coréen | plugin local `ManaOrbit` (`detectText`, ML Kit des services Google Play) | APK 1.0.6 ; plus ancienne : Tesseract (voir « Scan des cartes chinoises, japonaises, coréennes ») |
| Demande de note dans l'appli | plugin local `ManaOrbit` (`requestReview`, Play In-App Review) | APK 1.0.6 ; coupée tant que `RATE_ASK` est faux (voir « Demande de note dans l'appli ») |
| Bandeau de pub | `@capacitor-community/admob` | fait : voir « Publicité (AdMob) » ; reste le compte AdMob et l'identifiant de l'appli |
| Notifications | `@capacitor/push-notifications` | fait : Firebase Cloud Messaging (voir « Notifications ») |
| Connexion Google | `@capacitor-firebase/authentication` | fait : sélecteur de compte natif, jamais le navigateur (voir 2 bis pour Firebase) |
| Widget (valeur de la collection) | plugin local `ManaOrbit` (Java, dans `android/app`) | fait : lit la valeur que l'appli lui laisse (voir « Widget », étape 3) |
| Widget « QR code d'échange » | plugin local `ManaOrbit` (`TradeWidget.java`) | fait : QR code du lien d'échange envoyé par le site (voir « Widget « QR code d'échange » ») |
| Liens manaorbit.app (App Links) | `@capacitor/app` + filtre `autoVerify` de `MainActivity` | APK 1.0.5 : liens `?p=`, `?troc=`, `?table=`, `?partie=` ouverts dans l'appli (voir « Liens manaorbit.app ouverts dans l'appli » ; variable `ASSETLINKS_SHA256`) |
| Bouton Retour | `@capacitor/app` | fait : ferme l'écran ouvert ; sur l'accueil, deux appuis mettent l'appli en arrière-plan |
| Page hors ligne | `android-app/www/index.html` | fait : si le site ne répond pas au lancement (sans réseau), la page relance d'elle-même le site une fois (la copie gardée par le service worker répond alors, comme avec « Réessayer ») ; le message « Mana Orbit a besoin d'Internet… » ne s'affiche que si cette relance échoue aussi (aucune copie : vrai premier lancement). APK 1.0.5 |
| Diagnostic | plugin local `ManaOrbit` (Firebase, version) | en bas de **Réglages**, la ligne « Version … · APK : » montre ✓ ou ✗ pour chaque plugin (caméra, ML Kit, Google, pub, notif, widget, retour), Firebase et la version de l'APK |

---

## 6. Problèmes fréquents

- **Android Studio propose de passer à Gradle 9 ou AGP 9** (« Upgrade », Mettre à jour) : refuse pour l'instant (**Don't ask again for this project**, ne plus demander pour ce projet). Plusieurs plugins ne sont pas encore compatibles, et la compilation casserait.

- **« Incompatible Gradle JVM version… Gradle 8.14.3 supports Java versions between 1.8 and 24 »** (version de Java incompatible) : Android Studio lance Gradle avec Java 25, trop récent. Pour choisir Java 21 :
  1. **File › Settings…** (Fichier › Paramètres).
  2. **Build, Execution, Deployment › Build Tools › Gradle** (Compilation › Outils de compilation › Gradle).
  3. **Gradle JDK** : choisis **jbr-21** (le Java 21 fourni avec Android Studio). S'il n'est pas dans la liste : **Download JDK…** (télécharger un JDK), version **21**, fournisseur **JetBrains Runtime** ou **Eclipse Temurin**, puis **Download**.
  4. **OK**, puis l'icône éléphant **Sync Project with Gradle Files** (synchroniser le projet avec Gradle).

- **« SDK location not found »** (emplacement du SDK introuvable) : **File › Project Structure… › SDK Location** (Fichier › Structure du projet › Emplacement du SDK), puis indique le dossier du SDK. Par défaut : `C:\Users\<toi>\AppData\Local\Android\Sdk`.
- **Le téléphone n'apparaît pas** :
  - débranche et rebranche le câble ;
  - sur le téléphone, choisis le mode USB « Transfert de fichiers » ;
  - vérifie que « Débogage USB » est bien activé.
- **Gradle Sync échoue** : **File › Invalidate Caches… › Invalidate and Restart** (vider les caches et redémarrer), puis relance la synchronisation avec l'icône éléphant **Sync Project with Gradle Files** (synchroniser le projet avec Gradle).
- **« l'exécution de scripts est désactivée sur ce système »** en lançant `npm` : `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, réponds `O` (voir § 1). **`npm` introuvable** dans le terminal d'Android Studio : redémarre Android Studio après avoir installé Node.
- **« google-services.json manquant dans android/app/ »** à la compilation : le fichier Firebase n'est pas en place, voir § 2 bis.
- **« Continuer avec Google » ouvre le navigateur, ou affiche « Connexion Google indisponible dans cette version »** : l'appli installée a été construite sans le plugin de connexion Google.
  1. Depuis `android-app` : `git pull`, puis `npm run setup`, puis refais l'appli (**Run ▶**).
  2. En bas de **Réglages**, la ligne « APK : » doit montrer **✓Google**, et ✓ pour Firebase. Firebase ✗ : `google-services.json` manque ou est vide (§ 2 bis).
  3. Le sélecteur s'ouvre mais la connexion échoue : dans Firebase, **Paramètres du projet** › ton appli Android doit avoir le SHA-1 de chaque clé qui signe l'appli : debug (ton PC, § 2 bis étape 4), ta clé `.jks` et la clé de signature Play (les deux dans Play Console › **Intégrité de l'application**). Attends quelques minutes après un ajout.
  4. Pour lire l'erreur exacte : onglet **Logcat** en bas d'Android Studio, filtre `package:mine`, puis cherche `FirebaseAuthentication` ou `Capacitor/Console`.
- **Un lien manaorbit.app (QR code d'échange) s'ouvre dans le navigateur, pas dans l'appli** :
  1. En bas de **Réglages**, la ligne « APK : » doit montrer la version **1.0.5** ou plus.
  2. https://manaorbit.app/.well-known/assetlinks.json doit afficher tes empreintes : sinon, `ASSETLINKS_SHA256` manque ou est mal copiée sur Hostinger (le journal du serveur le dit).
  3. Empreintes ajoutées après l'installation : `adb shell pm verify-app-links --re-verify app.manaorbit`, ou réinstalle l'appli. Puis **Paramètres › Applications › Mana Orbit › Ouvrir par défaut** : « Ouvrir les liens compatibles » activé.
  4. En attendant, la barre « Ouvrir dans l'appli Mana Orbit » en bas de la page du navigateur ouvre l'appli.
- **Une carte chinoise, japonaise, coréenne ou russe n'est pas reconnue** :
  1. En bas de **Réglages**, la ligne « APK : » : avec la **1.0.6** ou plus, ML Kit lit le chinois, le japonais et le coréen ; avant, c'est Tesseract, plus lent et moins sûr.
  2. Première carte d'une écriture : le téléphone télécharge son modèle (ML Kit) ou celui de Tesseract ; en Wi-Fi, réessaie la carte une fois le téléchargement fini.
  3. Un paquet d'une seule langue : **réglages du scan › Langue des cartes › Autre…** (chinois, japonais, coréen, russe) : son moteur lit d'abord, plus rapide.
  4. En scan automatique avec l'APK 1.0.5 : prends d'abord une carte au cercle (ou impose la langue) ; ensuite le moteur de cette écriture lit les suivantes.
  5. Toujours rien : **Signaler ce scan** sur la ligne « Nom non reconnu ».
- **L'appli affiche « Mana Orbit a besoin d'Internet »** : le téléphone n'avait pas de réseau au lancement. Reconnecte-toi puis rouvre l'appli.

---

## Option : laisser Claude faire sur ton PC

Claude Code peut travailler directement sur ton ordinateur : l'appli de bureau (claude.ai/download), ou le terminal (`npm install -g @anthropic-ai/claude-code`, puis `claude` dans le dossier `mtgcardshop`).

Une session ouverte là-bas peut lancer elle-même toutes les commandes ci-dessus (npm, Gradle, émulateur). Tu n'as qu'à valider chaque action. Le branchement du téléphone (débogage USB) et la connexion à la Play Console restent à faire par toi.
