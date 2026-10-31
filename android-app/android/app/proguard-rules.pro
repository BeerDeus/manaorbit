# Règles R8 de Mana Orbit (version release). APK 1.1.1 (versionCode 17) : R8 rallumé, en mode prudent.
# Voir docs/android.md › « APK 1.1.1 (versionCode 17) : R8 » (cause probable de la caméra cassée en 1.0.7 / 1.0.8, test interne obligatoire).
#
# Principe : tout ce qui est lu par son nom ou par réflexion est gardé EN ENTIER (pont Capacitor, chaque plugin, notre code) ; ce sont de petits
# paquets (quelques centaines de classes). R8 obscurcit le reste (androidx, Kotlin, services Google Play, Firebase, ML Kit, AdMob : plusieurs milliers de classes),
# qui suit les règles livrées par chaque bibliothèque. C'est ce reste qui fait le pourcentage d'obscurcissement de la Play Console (seuil 25 %).
# Les bibliothèques sans règles (tous les plugins sauf capacitor-android) n'en ont plus besoin : leurs paquets sont gardés ici.

# ── Mode prudent ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
# Pas d'optimisation (ni inlining, ni fusion de classes, ni « type jamais instancié ») : seulement retrait du code mort et noms raccourcis.
# Cause probable de la caméra cassée en 1.0.7 : l'optimisation du mode full sur les annotations lues à l'exécution (@CapacitorPlugin › permissions).
-dontoptimize
# Annotations (lues par Capacitor à l'exécution), génériques et classes internes gardés ; fichiers et numéros de ligne pour les traces de plantage
# de la Play Console (lisibles avec le mapping.txt envoyé dans l'.aab), nom de fichier source remplacé par « SourceFile ».
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,Exceptions,SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ── Pont Capacitor (capacitor-android) et Cordova ─────────────────────────────────────────────────────────────────────────────
# Bridge, PluginHandle (annotations @CapacitorPlugin, @Permission, @PluginMethod, @PermissionCallback, @ActivityCallback lues par réflexion),
# PluginManager (classes de capacitor.plugins.json chargées par Class.forName), plugins internes (SystemBars, CapacitorHttp, CapacitorCookies).
-keep class com.getcapacitor.** { *; }
-keep @interface com.getcapacitor.** { *; }
# Cordova (embarqué par Capacitor) : PluginManager instancie ses plugins par leur nom (CoreAndroid).
-keep class org.apache.cordova.** { *; }

# ── Plugins Capacitor de l'appli (capacitor.settings.gradle) : chacun gardé en entier ──────────────────────────────────────────
# @capacitor-community/camera-preview : caméra du scan (plugin CameraPreview, fragment CameraActivity, aperçu Camera1, ressources lues par leur nom).
-keep class com.ahm.capacitor.camera.preview.** { *; }
# @capacitor-community/admob (Kotlin) : bandeau de pub, consentement (paquet com.getcapacitor.community.admob, déjà couvert par com.getcapacitor.**).
-keep class com.getcapacitor.community.** { *; }
# @capacitor-firebase/authentication : connexion Google.
-keep class io.capawesome.capacitorjs.plugins.** { *; }
# @capacitor/app (retour, liens appUrlOpen) et @capacitor/push-notifications (notifications FCM, service du manifeste).
-keep class com.capacitorjs.plugins.** { *; }
# @pantrist/capacitor-plugin-ml-kit-text-recognition (Kotlin) : lecture du texte latin par ML Kit.
-keep class com.pantrist.ml.** { *; }

# ── Notre code (app.manaorbit) ────────────────────────────────────────────────────────────────────────────────────────────────
# MainActivity, ManaOrbitPlugin (plugin local), widgets ValueWidget et TradeWidget, tâches IconRevertJob et ValueRefreshJob, ShortcutActivity,
# activity-alias du lanceur (IconSwitch les nomme), classe R (lue par son nom par AndroidProtocolHandler de Capacitor).
-keep class app.manaorbit.** { *; }

# ── Pont JavaScript ───────────────────────────────────────────────────────────────────────────────────────────────────────────
# Méthodes appelées depuis la page (androidBridge.postMessage, CapacitorHttp, CapacitorCookies) : jamais renommées, où qu'elles soient.
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }
# androidx.webkit (WebViewCompat.addWebMessageListener, chemin principal du pont) parle au WebView par ces interfaces, par réflexion.
-keep class org.chromium.support_lib_boundary.** { *; }

# ── Bibliothèques lues par réflexion ou par nom ───────────────────────────────────────────────────────────────────────────────
# ManaOrbitPlugin.hasFirebase lit FirebaseApp.getApps par réflexion (Firebase n'est visible qu'à l'exécution).
-keep class com.google.firebase.FirebaseApp { public static java.util.List getApps(android.content.Context); }
# Connexion Google par Credential Manager : le fournisseur des services Google Play est chargé par son nom (règle conseillée par Android).
-if class androidx.credentials.CredentialManager
-keep class androidx.credentials.playservices.** { *; }
-keep class com.google.android.libraries.identity.googleid.** { *; }
# Demande de note (In-App Review) : petit paquet, gardé par prudence en plus des règles de la bibliothèque.
-keep class com.google.android.play.core.review.** { *; }

# ── Avertissements ────────────────────────────────────────────────────────────────────────────────────────────────────────────
# @capacitor-firebase/authentication : connexion Facebook compilée sans le SDK Facebook (compileOnly, rgcfaIncludeFacebook absent) ; jamais chargée,
# capacitor.config.json n'active que google.com (« Missing classes detected while running R8 » sans cette ligne, vu en 1.0.7).
-dontwarn com.facebook.**
