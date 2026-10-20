# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ── Mana Orbit (APK 1.0.7 : R8 allumé) ─────────────────────────────────────────────────────────────
# Plugins Capacitor (ManaOrbitPlugin compris : @CapacitorPlugin, extends Plugin), pont JavaScript (@JavascriptInterface), widgets, service et activités
# du manifeste : gardés par les règles de capacitor-android, de proguard-android-optimize.txt et d'AAPT.
# ManaOrbitPlugin.hasFirebase lit FirebaseApp.getApps par réflexion (Firebase n'est visible qu'à l'exécution).
-keep class com.google.firebase.FirebaseApp { public static java.util.List getApps(android.content.Context); }
# @capacitor-firebase/authentication : connexion Facebook compilée sans le SDK Facebook (compileOnly, rgcfaIncludeFacebook absent) ; jamais chargée,
# capacitor.config.json n'active que google.com (« Missing classes detected while running R8 » sans cette ligne).
-dontwarn com.facebook.**
# Traces de plantage de la Play Console : fichiers et lignes (avec le fichier de correspondance de l'.aab).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
