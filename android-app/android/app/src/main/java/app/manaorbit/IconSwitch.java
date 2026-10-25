package app.manaorbit;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;

/**
 * Icône de l'appli aux couleurs d'une fête (APK 1.0.13) : un activity-alias lanceur par icône (AndroidManifest.xml), un seul activé à la fois.
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

    /** Fête connue de cette APK (null : icône normale, toujours connue). */
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
        try {
            for (String p : PACKS) if (enabled(pm, alias(ctx, p), false)) return p;
        } catch (IllegalArgumentException e) {
            // alias absent du manifeste : icône normale
        }
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
            // alias absent du manifeste : rien ne change
        }
        return changed;
    }
}
