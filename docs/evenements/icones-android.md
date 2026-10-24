# Icône de l'appli Android aux couleurs des fêtes

> **À livrer dans une prochaine APK, pas maintenant.** Changer l'icône de l'appli installée demande du code natif (un `<activity-alias>` par icône et une méthode du plugin `ManaOrbit`) : il faut une nouvelle APK publiée sur le Play Store. Pour Halloween 2026, seuls le logo de l'en-tête, l'écran de lancement et le favicon du site changent (`src/evlogo.js`, `pwa/icons/events/<pack>/`).
>
> Conseil : publie la structure (alias + méthode) **bien avant la première fête** qui doit en profiter, dans une APK ordinaire. La 1re mise à jour qui déplace l'entrée du lanceur peut replacer l'icône de l'écran d'accueil sur certains lanceurs (voir « Pièges ») : mieux vaut que ça arrive un jour sans fête.

## Ce qui est déjà prêt

- Les icônes de chaque fête, générées par `node tools/make-event-logos.mjs` (dessins de `src/evlogo.js`), dans `docs/evenements/logos/<pack>/android/` :
  - `mipmap-mdpi` → `mipmap-xxxhdpi` : `ic_launcher_<pack>.png` (carré arrondi, avant Android 8), `ic_launcher_<pack>_round.png`, `ic_launcher_<pack>_foreground.png` et `ic_launcher_<pack>_background.png` (icône adaptative : dessin dans la zone sûre de 66 dp sur 108) ;
  - `mipmap-anydpi-v26/ic_launcher_<pack>.xml` et `ic_launcher_<pack>_round.xml` (icône adaptative d'Android 8 et plus).
- Packs : `halloween`, `noel`, `nouvelan`, `paques`, `magic` (identifiants de `src/evpacks.js`).
- Les noms sont tous préfixés `ic_launcher_<pack>` : ils ne remplacent jamais l'icône normale (`ic_launcher`).

## Marche à suivre

### 1. Copier les mipmaps

Depuis la racine du dépôt :

```bash
for p in halloween noel nouvelan paques magic; do
  cp -r docs/evenements/logos/$p/android/. android-app/android/app/src/main/res/
done
```

Poids : environ 0,55 Mo de PNG par fête (toutes densités). Avec un `.aab`, le Play Store n'envoie au téléphone que sa densité : environ 0,1 Mo par fête. Ne copie que les fêtes que tu comptes activer.

### 2. `AndroidManifest.xml` : l'entrée du lanceur passe sur des alias

Principe : **une seule** entrée du lanceur (`MAIN` + `LAUNCHER`) activée à la fois. L'activité principale `MainActivity` n'est **jamais** désactivée : elle garde ses filtres de partage (`SEND`) et d'App Links (`VIEW` `autoVerify`). Seul son filtre `MAIN` / `LAUNCHER` (et les raccourcis de l'icône, liés à l'entrée du lanceur) part sur les alias.

a) Dans `<activity android:name=".MainActivity" …>`, **supprime** ce bloc et la balise `<meta-data android:name="android.app.shortcuts" …/>` :

```xml
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
```

b) Juste après `</activity>` de `MainActivity`, colle les alias (l'icône normale activée, les fêtes désactivées) :

```xml
        <!-- Entrées du lanceur : une seule activée à la fois (ManaOrbitPlugin.setIcon, IconSwitch.java). Toutes ouvrent MainActivity, qui garde
             le partage et les App Links. Icône normale par défaut ; icônes de fête désactivées jusqu'à ce que le site en demande une. -->
        <activity-alias
            android:name=".LauncherDefault"
            android:targetActivity=".MainActivity"
            android:label="@string/app_name"
            android:icon="@mipmap/ic_launcher"
            android:roundIcon="@mipmap/ic_launcher_round"
            android:enabled="true"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
            <meta-data android:name="android.app.shortcuts" android:resource="@xml/shortcuts" />
        </activity-alias>

        <activity-alias
            android:name=".LauncherHalloween"
            android:targetActivity=".MainActivity"
            android:label="@string/app_name"
            android:icon="@mipmap/ic_launcher_halloween"
            android:roundIcon="@mipmap/ic_launcher_halloween_round"
            android:enabled="false"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
            <meta-data android:name="android.app.shortcuts" android:resource="@xml/shortcuts" />
        </activity-alias>

        <activity-alias
            android:name=".LauncherNoel"
            android:targetActivity=".MainActivity"
            android:label="@string/app_name"
            android:icon="@mipmap/ic_launcher_noel"
            android:roundIcon="@mipmap/ic_launcher_noel_round"
            android:enabled="false"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
            <meta-data android:name="android.app.shortcuts" android:resource="@xml/shortcuts" />
        </activity-alias>

        <activity-alias
            android:name=".LauncherNouvelan"
            android:targetActivity=".MainActivity"
            android:label="@string/app_name"
            android:icon="@mipmap/ic_launcher_nouvelan"
            android:roundIcon="@mipmap/ic_launcher_nouvelan_round"
            android:enabled="false"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
            <meta-data android:name="android.app.shortcuts" android:resource="@xml/shortcuts" />
        </activity-alias>

        <activity-alias
            android:name=".LauncherPaques"
            android:targetActivity=".MainActivity"
            android:label="@string/app_name"
            android:icon="@mipmap/ic_launcher_paques"
            android:roundIcon="@mipmap/ic_launcher_paques_round"
            android:enabled="false"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
            <meta-data android:name="android.app.shortcuts" android:resource="@xml/shortcuts" />
        </activity-alias>

        <activity-alias
            android:name=".LauncherMagic"
            android:targetActivity=".MainActivity"
            android:label="@string/app_name"
            android:icon="@mipmap/ic_launcher_magic"
            android:roundIcon="@mipmap/ic_launcher_magic_round"
            android:enabled="false"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
            <meta-data android:name="android.app.shortcuts" android:resource="@xml/shortcuts" />
        </activity-alias>

        <!-- Retour à l'icône normale à la fin de la fête, même appli fermée (IconRevertJob.java). Seul le système peut la lancer. -->
        <service
            android:name=".IconRevertJob"
            android:exported="false"
            android:permission="android.permission.BIND_JOB_SERVICE" />
```

Remarques :
- Les commentaires XML ne doivent jamais contenir deux tirets de suite (`tests/test-android-xml.mjs` le vérifie : Gradle refuse le fichier).
- `android:exported="true"` est obligatoire (Android 12 et plus) sur un composant qui a un `intent-filter`.
- `android:name` des alias se résout avec le `namespace` (`app.manaorbit`) : composants `app.manaorbit.LauncherDefault`, `app.manaorbit.LauncherHalloween`…
- `res/xml/shortcuts.xml` ne change pas (ses raccourcis visent `ShortcutActivity`).
- `ShortcutActivity` et les widgets (`ValueWidget.open`) ouvrent `MainActivity` par un intent explicite : ils marchent sans filtre `LAUNCHER` sur `MainActivity`.

### 3. Code natif : `IconSwitch.java`, `IconRevertJob.java`, deux méthodes du plugin

`android-app/android/app/src/main/java/app/manaorbit/IconSwitch.java` :

```java
package app.manaorbit;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;

/**
 * Icône de l'appli aux couleurs d'une fête : un <activity-alias> lanceur par icône (AndroidManifest.xml), un seul activé à la fois.
 * L'icône voulue est gardée (préférences) puis appliquée quand l'appli passe en arrière-plan (ManaOrbitPlugin.handleOnStop) : basculer pendant que
 * l'appli est à l'écran peut la fermer sur certains téléphones. Jamais zéro entrée : la nouvelle est activée avant que les autres soient éteintes.
 */
final class IconSwitch {
    static final String[] PACKS = { "halloween", "noel", "nouvelan", "paques", "magic" };
    private static final String PREFS = "mo_icon", K_WANT = "want", K_UNTIL = "until";

    private IconSwitch() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean known(String pack) {
        if (pack == null) return true;
        for (String p : PACKS) if (p.equals(pack)) return true;
        return false;
    }

    /** Alias lanceur d'une icône (null : icône normale). Classe : namespace app.manaorbit (pas l'applicationId). */
    static ComponentName alias(Context ctx, String pack) {
        String cls = pack == null ? "Default" : Character.toUpperCase(pack.charAt(0)) + pack.substring(1);
        return new ComponentName(ctx.getPackageName(), "app.manaorbit.Launcher" + cls);
    }

    private static boolean enabled(PackageManager pm, ComponentName cn, boolean byDefault) {
        int s = pm.getComponentEnabledSetting(cn);
        return s == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT ? byDefault : s == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
    }

    /** Garde l'icône voulue ; until (ms, 0 : sans fin) : passé ce moment, retour à l'icône normale (IconRevertJob, même appli fermée). */
    static void request(Context ctx, String pack, long until) {
        prefs(ctx).edit().putString(K_WANT, pack).putLong(K_UNTIL, pack == null ? 0 : until).apply();
        if (pack != null && until > 0) IconRevertJob.schedule(ctx, until);
    }

    /** Icône voulue maintenant : null (normale) si rien n'est demandé, si la fête est finie ou inconnue de cette APK. */
    static String wanted(Context ctx) {
        SharedPreferences sp = prefs(ctx);
        String w = sp.getString(K_WANT, null);
        long until = sp.getLong(K_UNTIL, 0);
        if (w == null || !known(w) || (until > 0 && System.currentTimeMillis() >= until)) return null;
        return w;
    }

    /** Fin de la fête demandée (ms), 0 : aucune. */
    static long until(Context ctx) {
        return prefs(ctx).getLong(K_UNTIL, 0);
    }

    /** Icône montrée par le lanceur : la fête dont l'alias est activé, null pour l'icône normale. */
    static String current(Context ctx) {
        PackageManager pm = ctx.getPackageManager();
        for (String p : PACKS) if (enabled(pm, alias(ctx, p), false)) return p;
        return null;
    }

    /** Bascule vers l'icône voulue si elle a changé (DONT_KILL_APP). true : un alias a changé d'état. */
    static boolean apply(Context ctx) {
        PackageManager pm = ctx.getPackageManager();
        String want = wanted(ctx);
        boolean changed = false;
        try {
            ComponentName on = alias(ctx, want);
            if (!enabled(pm, on, want == null)) {
                pm.setComponentEnabledSetting(on, want == null ? PackageManager.COMPONENT_ENABLED_STATE_DEFAULT : PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
                changed = true;
            }
            String[] all = new String[PACKS.length + 1];
            System.arraycopy(PACKS, 0, all, 1, PACKS.length);   // all[0] = null : icône normale
            for (String p : all) {
                if (p == null ? want == null : p.equals(want)) continue;
                ComponentName cn = alias(ctx, p);
                if (enabled(pm, cn, p == null)) {
                    pm.setComponentEnabledSetting(cn, p == null ? PackageManager.COMPONENT_ENABLED_STATE_DISABLED : PackageManager.COMPONENT_ENABLED_STATE_DEFAULT, PackageManager.DONT_KILL_APP);
                    changed = true;
                }
            }
        } catch (IllegalArgumentException e) {
            // alias absent du manifeste (APK construite sans) : rien ne change
        }
        return changed;
    }
}
```

`android-app/android/app/src/main/java/app/manaorbit/IconRevertJob.java` :

```java
package app.manaorbit;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

/**
 * Retour à l'icône normale à la fin de la fête, même si l'appli n'est pas rouverte. Tâche unique (JobScheduler), non conservée au redémarrage
 * du téléphone (pas d'autorisation RECEIVE_BOOT_COMPLETED) : ManaOrbitPlugin.load la reprogramme à chaque lancement.
 */
public class IconRevertJob extends JobService {
    static final int JOB_ID = 0x4D6F4943;   // « MoIC », différent de ValueRefreshJob.JOB_ID

    static void schedule(Context ctx, long until) {
        JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        long wait = Math.max(0, until - System.currentTimeMillis()) + 60_000L;
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(ctx, IconRevertJob.class))
            .setMinimumLatency(wait)
            .setOverrideDeadline(wait + 6 * 3600_000L)
            .build();
        try {
            js.schedule(job);
        } catch (RuntimeException e) {
            // trop de tâches en attente : le retour se fera au prochain passage en arrière-plan
        }
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        try {
            IconSwitch.apply(this);
        } catch (RuntimeException e) {
            // réessayé au prochain passage en arrière-plan de l'appli
        }
        return false;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return false;
    }
}
```

Dans `ManaOrbitPlugin.java` : ajoute la ligne de description dans le commentaire de la classe, puis les deux méthodes et les deux points d'accroche (`load`, `handleOnStop`). Si la classe a déjà un `load()`, ajoute seulement son contenu.

```java
 * - setIcon({ pack, until, now }) → { want, current, applied } : icône de l'appli aux couleurs d'une fête (activity-alias, IconSwitch.java) ;
 *   pack : halloween | noel | nouvelan | paques | magic, null ou absent : icône normale ; until (ms) : retour automatique à l'icône normale ;
 *   appliquée quand l'appli passe en arrière-plan (now : tout de suite, essais). APK 1.0.12 et plus ; plus ancienne : pas de méthode.
 * - iconState() → { want, current, packs } : icône voulue, icône montrée, fêtes connues de cette APK.
```

```java
    @PluginMethod
    public void setIcon(PluginCall call) {
        String pack = call.getString("pack", null);
        if (pack != null && pack.isEmpty()) pack = null;
        if (!IconSwitch.known(pack)) {
            call.reject("setIcon : fête inconnue de cette APK");
            return;
        }
        Double until = call.getDouble("until", 0.0);
        Context ctx = getContext();
        IconSwitch.request(ctx, pack, until == null ? 0 : until.longValue());
        boolean applied = Boolean.TRUE.equals(call.getBoolean("now", false)) && IconSwitch.apply(ctx);
        JSObject ret = new JSObject();
        String want = IconSwitch.wanted(ctx), cur = IconSwitch.current(ctx);
        ret.put("want", want == null ? JSONObject.NULL : want);
        ret.put("current", cur == null ? JSONObject.NULL : cur);
        ret.put("applied", applied);
        call.resolve(ret);
    }

    @PluginMethod
    public void iconState(PluginCall call) {
        Context ctx = getContext();
        JSObject ret = new JSObject();
        String want = IconSwitch.wanted(ctx), cur = IconSwitch.current(ctx);
        ret.put("want", want == null ? JSONObject.NULL : want);
        ret.put("current", cur == null ? JSONObject.NULL : cur);
        JSArray packs = new JSArray();
        for (String p : IconSwitch.PACKS) packs.put(p);
        ret.put("packs", packs);
        call.resolve(ret);
    }

    /** Au lancement : retour automatique reprogrammé (les tâches ne survivent pas à un redémarrage du téléphone). */
    @Override
    public void load() {
        super.load();
        Context ctx = getContext();
        long until = IconSwitch.until(ctx);
        if (IconSwitch.wanted(ctx) != null && until > 0) IconRevertJob.schedule(ctx, until);
    }

    /** L'appli passe en arrière-plan : c'est là qu'on bascule l'icône (le lanceur se met à jour sans fermer l'appli à l'écran). */
    @Override
    protected void handleOnStop() {
        super.handleOnStop();
        try {
            IconSwitch.apply(getContext());
        } catch (RuntimeException e) {
            // réessayé au prochain passage en arrière-plan
        }
    }
```

`JSArray`, `JSObject`, `JSONObject` et `Context` sont déjà importés par `ManaOrbitPlugin.java`.

### 4. Côté site

Dans le moteur d'événements (`src/event.js`), après avoir reçu le calendrier du serveur (et quand l'interrupteur « Décorations de fête » change) :

```js
/** Icône de l'appli Android aux couleurs de la fête (APK 1.0.12 et plus : ManaOrbit.setIcon). Navigateur, PWA, APK plus ancienne : rien.
    Décorations coupées ou pas de fête : icône normale. until : minuit (Paris) après le dernier jour, retour automatique même appli fermée. */
function evNatIcon(ev, deco) {
  const mo = natPlugin('ManaOrbit'); if (!mo || typeof mo.setIcon !== 'function') return;
  const pack = ev && deco && EV_LOGO[ev.pack] ? ev.pack : null;
  const until = pack ? evNextMidnight(Date.parse(ev.to + 'T12:00:00Z')) : 0;
  let last = null; try { last = localStorage.getItem('deckdeal:evicon'); } catch (e) { /* stockage bloqué */ }
  if (last === (pack || '') + '|' + until) return;                 // déjà demandé : pas d'appel à chaque lancement
  Promise.resolve().then(() => mo.setIcon({ pack, until })).then(() => { try { localStorage.setItem('deckdeal:evicon', (pack || '') + '|' + until); } catch (e) { /* stockage bloqué */ } }).catch(() => {});
}
```

- `natPlugin` vient de `src/native.js`, `evNextMidnight` de `src/evpacks.js`, `EV_LOGO` de `src/evlogo.js`.
- `EVENT_FORCE` (essai sur `/test`) : n'appelle pas `setIcon` avec une fête forcée sur l'appli de production, ou passe un `until` court.
- La bascule a lieu au prochain passage en arrière-plan : l'utilisateur voit la nouvelle icône en revenant sur l'écran d'accueil.
- Pense à une ligne dans Réglages › À propos (« Icône : Halloween ») et au test `tests/test-android-xml.mjs` (alias présents, `exported="true"`, un seul `enabled="true"`, `targetActivity=".MainActivity"`, mipmaps existants, App Links et `SEND` toujours sur `MainActivity`, aucun `LAUNCHER` sur `MainActivity`).

### 5. APK

- `versionCode` + 1 et `versionName` dans `android-app/android/app/build.gradle`, ligne dans `docs/android.md` (tableau des fonctions, nouveautés de la version).
- `npm run setup` depuis `android-app`, puis `.aab` signé (voir `docs/android.md` § 4).

## Pièges

- **Le lanceur peut mettre du temps** : de quelques secondes à un redémarrage du lanceur (certains n'actualisent qu'au prochain affichage de l'écran d'accueil). Ne pas basculer plusieurs fois de suite.
- **L'appli peut être fermée** au moment de la bascule malgré `DONT_KILL_APP` (Android 10 sur certains Xiaomi et Samsung, tâche lancée par l'alias qu'on désactive) : c'est pourquoi la bascule se fait en arrière-plan (`handleOnStop`) et jamais pendant un scan ou une partie.
- **Raccourcis épinglés** (appui long › glisser « Scanner » sur l'écran d'accueil) : liés à l'alias qui les a publiés, ils sont **grisés ou supprimés** sur certains lanceurs (Pixel, One UI) quand cet alias est désactivé, et ne reviennent pas toujours avec l'icône normale. Le prévenir dans les notes de version ; les raccourcis de l'appui long, eux, suivent l'alias activé.
- **Icône de l'écran d'accueil** : à la 1re mise à jour avec les alias, l'entrée du lanceur passe de `.MainActivity` à `.LauncherDefault`. Le lanceur de Google remplace l'icône tout seul ; d'autres peuvent la retirer de l'écran d'accueil (elle reste dans le tiroir d'applis). D'où le conseil de livrer cette structure hors fête. Variante sans ce risque, plus lourde : renommer la classe `MainActivity` (par exemple `AppActivity`, avec toutes ses références : `ShortcutActivity`, `ValueWidget.open`, `ManaOrbitPlugin` et ses `EXTRA_EXCLUDE_COMPONENTS`, `test-android-xml.mjs`) et appeler l'alias de l'icône normale `.MainActivity`.
- **Les App Links et le partage restent sur `MainActivity`** : ne mets jamais l'`intent-filter` `autoVerify` ni `SEND` sur un alias, sinon les liens `https://manaorbit.app/?p=…` retombent dans le navigateur (et doivent être revérifiés) pendant que cet alias est désactivé. `MainActivity` elle-même n'est jamais désactivée.
- **Jamais zéro entrée du lanceur** : depuis Android 10, une appli sans entrée activée reçoit une icône générique « détails de l'appli ». `IconSwitch.apply` active la nouvelle avant d'éteindre l'ancienne.
- **Retour à l'icône normale après la fête** : `until` (fin de la fête) + `IconRevertJob`, reprogrammé à chaque lancement ; le site envoie aussi `pack: null` dès qu'aucune fête n'est active. Une APK qui ne connaît pas une fête future la refuse (`known`) : l'icône reste normale.
- **Politique Google Play** : changer d'icône est permis tant qu'elle reste celle de Mana Orbit (même dessin, habillé : pas d'imitation d'une autre appli ni d'icône système) et qu'elle ne cache pas l'appli. L'icône de la fiche Play Store (512 px, Play Console) ne change pas : rien à déclarer. Laisse l'utilisateur revenir à l'icône normale (« Décorations de fête » coupé).
- **Icônes à thème d'Android 13** (icônes monochromes) : les icônes de fête n'ont pas de calque `monochrome` ; avec les icônes à thème activées, le lanceur montre l'icône en couleur (comme l'icône normale aujourd'hui).
- **Tester sur plusieurs lanceurs** : Pixel Launcher, Samsung One UI, Xiaomi HyperOS / MIUI, Nova, Microsoft Launcher. À vérifier à chaque fois : la nouvelle icône apparaît (tiroir et écran d'accueil), l'appli n'est pas fermée, appui long (raccourcis), raccourci épinglé, widgets, lien `https://manaorbit.app/?p=…` touché dans une messagerie, partage d'une liste vers l'appli, toucher d'une notification, retour à l'icône normale (`until` dans 5 minutes).
  - Essai sans attendre une fête : `chrome://inspect` sur l'appli, puis `Capacitor.Plugins.ManaOrbit.setIcon({ pack: 'halloween', until: Date.now() + 300000, now: true })`.
  - État des alias : `adb shell dumpsys package app.manaorbit | grep -A8 -E "enabledComponents|disabledComponents"`.
  - App Links toujours vérifiés : `adb shell pm get-app-links app.manaorbit`.

## Et l'icône de la PWA installée ?

On ne la change pas : rien ne garantit qu'elle suive.
- **Android (Chrome)** : l'icône de l'écran d'accueil vient d'une WebAPK fabriquée à l'installation. Chrome ne vérifie le manifeste qu'à son rythme (au plus une fois par jour, appli lancée), refait la WebAPK quand il le décide, et demande parfois à l'utilisateur d'accepter le changement d'icône. L'icône d'Halloween pourrait arriver après la fête et rester en novembre.
- **iPhone, iPad** : l'icône (`apple-touch-icon`) est copiée une fois pour toutes à « Sur l'écran d'accueil ». Elle ne change jamais.
- **Ordinateur (Chrome, Edge)** : mise à jour différée, parfois avec une fenêtre de confirmation.
- Le manifeste (`pwa/manifest.webmanifest`) garde donc les icônes normales. Pendant une fête, ce qui change dans la PWA et le site : le logo de l'en-tête, l'écran de lancement (`src/evlogo.js`) et le favicon de l'onglet (`pwa/icons/events/<pack>/favicon-32.png`, `icon.svg`), servis par le service worker.
