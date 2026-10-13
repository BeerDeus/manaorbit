package app.manaorbit;

import android.content.ClipData;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.DisplayCutout;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.List;
import java.util.Locale;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Plugin local « ManaOrbit » : ce que le site demande à la coque Android et qu'aucun plugin npm ne fait.
 * Côté site : natPlugin('ManaOrbit') (src/native.js), null dans un navigateur ou dans une APK plus ancienne sans ce plugin.
 * - info() → { firebase, version, build, installed, widgets, widgetRefresh, tradeWidgets } : Firebase initialisé (google-services.json présent), versionName
 *   et versionCode de l'APK, date de la première installation sur ce téléphone (ms ; src/migrate.js : pas de détour par l'ancienne adresse pour une appli
 *   installée après le déménagement), nombre de widgets de valeur posés, estimation appli fermée possible (ValueRefreshJob.ENABLED), nombre de widgets
 *   « QR code d'échange » posés (absent : APK sans ce widget).
 * - setWidget({ data, coll? }) : chiffres du widget d'écran d'accueil (JSON, voir src/widget.js), gardés pour quand l'appli est fermée ;
 *   coll : cartes et prix de référence pour l'estimation appli fermée (absent : plus d'estimation jusqu'au prochain envoi).
 * - setTradeWidget({ data }) : QR code du lien de la liste d'échange pour TradeWidget (JSON { u, n, m, by, lang }, voir src/widget.js), gardé pour quand
 *   l'appli est fermée ; u vide : pas de lien (« Crée ton lien d'échange »).
 * - share({ title, text, url, chooser }) → { ok: true } : menu « Partager » d'Android pour un lien (liste d'échange, deck) ; une APK plus ancienne
 *   n'a pas la méthode et le site copie le lien.
 * - cutout() → { w, h, rects: [{ l, t, r, b }] } en dp (= px CSS de la page) : découpes de l'écran (caméra frontale) vues par la fenêtre ; rects vide : aucune
 *   (ou Android < 9). Barre d'état cachée (SystemBars), le site pose son en-tête sur la ligne de la caméra quand elle est au milieu (src/native.js, natFullscreen).
 * - brightness({ full }) : écran à pleine luminosité (QR code d'échange affiché) ou rendu au réglage du téléphone ; seulement pour la fenêtre de l'appli
 *   (Android rend la luminosité habituelle dès qu'on en sort, et la remet au retour). APK 1.0.4 et plus ; plus ancienne : pas de méthode, rien ne change.
 * - shareImage({ data, name, text, title, chooser }) → { ok: true } : image à partager (src/simg.js : collection, deck, liste d'échange, session d'ouverture),
 *   PNG en base64 (data), écrite dans le cache (dossier share/, vidé des images de plus d'une heure) puis offerte au menu « Partager » d'Android par le
 *   FileProvider du manifeste (${applicationId}.fileprovider, res/xml/file_paths.xml) avec le message text. APK 1.0.4 et plus ; plus ancienne : pas de
 *   méthode, le site partage le lien ou montre l'image en grand (appui long pour l'enregistrer).
 * - saveImage({ data, name }) → { ok: true, uri } : la même image enregistrée dans Photos (Pictures/Mana Orbit, MediaStore, sans autorisation),
 *   Android 10 et plus (avant : refusé, le site montre l'image en grand). APK 1.0.4 et plus.
 * - événement « open », gardé jusqu'à ce que la page l'écoute (lancement à froid) : { view: 'collection' | 'scan' | 'quick' } le widget ou son bouton a été
 *   touché ; { view: 'trade' } le widget « QR code d'échange » ; { view: 'scan' | 'quick' | 'trade' | 'paste' } un raccourci de l'icône (ShortcutActivity) ; { view: 'share', text, title } du texte partagé
 *   par une autre appli (menu « Partager » : decklist, lien EDHREC, Archidekt, Moxfield…).
 */
@CapacitorPlugin(name = "ManaOrbit")
public class ManaOrbitPlugin extends Plugin {

    @PluginMethod
    public void cutout(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject ret = new JSObject();
            JSArray rects = new JSArray();
            float d = getContext().getResources().getDisplayMetrics().density;
            View v = getActivity().getWindow().getDecorView();
            ret.put("w", Math.round(v.getWidth() / d));
            ret.put("h", Math.round(v.getHeight() / d));
            if (Build.VERSION.SDK_INT >= 28) {
                WindowInsets wi = v.getRootWindowInsets();
                DisplayCutout dc = wi != null ? wi.getDisplayCutout() : null;
                if (dc != null) {
                    for (Rect r : dc.getBoundingRects()) {
                        JSObject o = new JSObject();
                        o.put("l", Math.round(r.left / d));
                        o.put("t", Math.round(r.top / d));
                        o.put("r", Math.round(r.right / d));
                        o.put("b", Math.round(r.bottom / d));
                        rects.put(o);
                    }
                }
            }
            ret.put("rects", rects);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void info(PluginCall call) {
        Context ctx = getContext();
        JSObject ret = new JSObject();
        ret.put("firebase", hasFirebase(ctx));
        String version = "";
        long build = 0, installed = 0;
        try {
            PackageInfo pi = packageInfo(ctx);
            if (pi.versionName != null) version = pi.versionName;
            build = versionCode(pi);
            installed = pi.firstInstallTime;
        } catch (PackageManager.NameNotFoundException e) {
            // notre propre paquet : n'arrive pas
        }
        ret.put("version", version);
        ret.put("build", build);
        ret.put("installed", installed);
        ret.put("widgets", ValueWidget.count(ctx));
        ret.put("widgetRefresh", ValueRefreshJob.ENABLED);
        ret.put("tradeWidgets", TradeWidget.count(ctx));
        call.resolve(ret);
    }

    @PluginMethod
    public void setWidget(PluginCall call) {
        String data = call.getString("data");
        Context ctx = getContext();
        if (data == null || data.isEmpty()) {
            // rien à afficher : le widget revient à « Ouvre Mana Orbit… »
            ctx.getSharedPreferences(ValueWidget.PREFS, Context.MODE_PRIVATE).edit().remove(ValueWidget.KEY).remove(ValueWidget.KEY_EST).apply();
        } else {
            try {
                new JSONObject(data);
            } catch (JSONException e) {
                call.reject("data : JSON illisible");
                return;
            }
            // chiffres frais de l'appli : l'estimation appli fermée n'a plus lieu d'être
            ctx.getSharedPreferences(ValueWidget.PREFS, Context.MODE_PRIVATE).edit().putString(ValueWidget.KEY, data).remove(ValueWidget.KEY_EST).apply();
        }
        ValueRefreshJob.store(ctx, data == null || data.isEmpty() ? null : call.getString("coll"));
        ValueWidget.refreshAll(ctx);
        ValueRefreshJob.sync(ctx);
        call.resolve();
    }

    @PluginMethod
    public void setTradeWidget(PluginCall call) {
        String data = call.getString("data");
        Context ctx = getContext();
        SharedPreferences.Editor e = ctx.getSharedPreferences(ValueWidget.PREFS, Context.MODE_PRIVATE).edit();
        if (data == null || data.isEmpty()) {
            e.remove(TradeWidget.KEY); // rien reçu : « Ouvre Mana Orbit… »
        } else {
            try {
                new JSONObject(data);
            } catch (JSONException ex) {
                call.reject("data : JSON illisible");
                return;
            }
            e.putString(TradeWidget.KEY, data);
        }
        e.apply();
        TradeWidget.refreshAll(ctx);
        call.resolve();
    }

    /**
     * Menu « Partager » d'Android (WhatsApp, Messages, Messenger…) : la WebView n'a pas navigator.share. EXTRA_TEXT « message lien » sur une ligne
     * (la conversation montre le message puis l'aperçu du lien), EXTRA_SUBJECT pour un e-mail, EXTRA_TITLE en tête du menu (Android 10 et plus).
     * Mana Orbit retiré de la liste : il reçoit lui-même les partages text/plain (manifeste). Résolu dès le menu ouvert : Android ne dit ni l'appli choisie, ni l'abandon.
     */
    @PluginMethod
    public void share(PluginCall call) {
        String title = call.getString("title", "");
        String text = call.getString("text", "");
        String url = call.getString("url", "");
        String body = text.isEmpty() ? url : url.isEmpty() ? text : text + " " + url;
        if (body.isEmpty()) {
            call.reject("share : rien à partager");
            return;
        }
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TEXT, body);
        if (!title.isEmpty()) {
            send.putExtra(Intent.EXTRA_SUBJECT, title);
            send.putExtra(Intent.EXTRA_TITLE, title);
        }
        Intent chooser = Intent.createChooser(send, call.getString("chooser", "Partager"));
        chooser.putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS, new ComponentName[] {new ComponentName(getContext(), MainActivity.class)});
        try {
            getActivity().startActivity(chooser); // depuis l'activité du pont : même tâche, FLAG_ACTIVITY_NEW_TASK inutile
        } catch (RuntimeException e) {
            call.reject("share : " + e.getMessage()); // le site copie le lien à la place
            return;
        }
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    /** Sous-dossier du cache des images partagées : couvert par res/xml/file_paths.xml (cache-path « share_images ») pour le FileProvider. */
    static final String SHARE_DIR = "share";
    /** Image reçue au plus (base64) : une image 1080 × 1350 fait 1 à 3 Mo en PNG, ≈ 4 Mo en base64. */
    static final int IMAGE_MAX = 16000000;

    /**
     * Menu « Partager » d'Android pour une image (src/simg.js) : PNG écrit dans le cache, passé par le FileProvider (lecture accordée à l'appli choisie,
     * ClipData : aperçu de l'image en tête du menu). Mana Orbit retiré de la liste, comme pour share. Résolu dès le menu ouvert.
     */
    @PluginMethod
    public void shareImage(PluginCall call) {
        byte[] png = pngOf(call);
        if (png == null) return; // déjà refusé
        String text = call.getString("text", "");
        String title = call.getString("title", "");
        Uri uri;
        try {
            File dir = new File(getContext().getCacheDir(), SHARE_DIR);
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("dossier du cache");
            File[] old = dir.listFiles();
            long now = System.currentTimeMillis();
            if (old != null) for (File f : old) if (now - f.lastModified() > 3600000L) f.delete(); // images partagées il y a plus d'une heure
            File file = new File(dir, safeName(call.getString("name", "")));
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(png);
            }
            uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
        } catch (IOException | IllegalArgumentException e) {
            call.reject("shareImage : " + e.getMessage());
            return;
        }
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("image/png");
        send.putExtra(Intent.EXTRA_STREAM, uri);
        if (text != null && !text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
        if (title != null && !title.isEmpty()) {
            send.putExtra(Intent.EXTRA_SUBJECT, title);
            send.putExtra(Intent.EXTRA_TITLE, title);
        }
        send.setClipData(ClipData.newRawUri(title == null ? "" : title, uri));
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(send, call.getString("chooser", "Partager"));
        chooser.putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS, new ComponentName[] {new ComponentName(getContext(), MainActivity.class)});
        chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            getActivity().startActivity(chooser);
        } catch (RuntimeException e) {
            call.reject("shareImage : " + e.getMessage()); // le site montre l'image en grand à la place
            return;
        }
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    /** Image enregistrée dans Photos (Pictures/Mana Orbit) par le MediaStore : aucune autorisation à partir d'Android 10 ; avant, refusé (le site montre l'image en grand). */
    @PluginMethod
    public void saveImage(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("saveImage : Android 10 et plus");
            return;
        }
        byte[] png = pngOf(call);
        if (png == null) return; // déjà refusé
        ContentResolver cr = getContext().getContentResolver();
        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName(call.getString("name", "")));
        v.put(MediaStore.MediaColumns.MIME_TYPE, "image/png");
        v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Mana Orbit");
        v.put(MediaStore.MediaColumns.IS_PENDING, 1); // invisible des autres applis tant qu'elle s'écrit
        Uri uri = null;
        try {
            uri = cr.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
            if (uri == null) throw new IOException("MediaStore refuse l'image");
            try (OutputStream out = cr.openOutputStream(uri)) {
                if (out == null) throw new IOException("écriture impossible");
                out.write(png);
            }
            ContentValues ready = new ContentValues();
            ready.put(MediaStore.MediaColumns.IS_PENDING, 0);
            cr.update(uri, ready, null, null);
        } catch (IOException | RuntimeException e) {
            if (uri != null) {
                try {
                    cr.delete(uri, null, null); // pas d'image à moitié écrite dans Photos
                } catch (RuntimeException ignored) {
                    // rien de plus à faire
                }
            }
            call.reject("saveImage : " + e.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("ok", true);
        ret.put("uri", uri.toString());
        call.resolve(ret);
    }

    /** PNG reçu en base64 (data) ; null après avoir refusé l'appel s'il manque, s'il est trop gros ou si ce n'est pas un PNG. */
    private static byte[] pngOf(PluginCall call) {
        String data = call.getString("data", "");
        if (data == null || data.isEmpty() || data.length() > IMAGE_MAX) {
            call.reject("image : data manquante ou trop grosse");
            return null;
        }
        byte[] png;
        try {
            png = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("image : base64 illisible");
            return null;
        }
        if (png.length < 8 || (png[0] & 0xFF) != 0x89 || png[1] != 'P' || png[2] != 'N' || png[3] != 'G') {
            call.reject("image : pas un PNG");
            return null;
        }
        return png;
    }

    /** Nom de fichier sûr (lettres, chiffres, « . _ - »), terminé par .png, 80 caractères au plus. */
    static String safeName(String n) {
        String s = (n == null ? "" : n).replaceAll("[^A-Za-z0-9._-]", "_");
        if (s.isEmpty() || s.startsWith(".")) s = "mana-orbit" + s;
        if (!s.toLowerCase(Locale.ROOT).endsWith(".png")) s = s + ".png";
        return s.length() > 80 ? s.substring(s.length() - 80) : s;
    }

    /** Texte partagé gardé au plus : une decklist de 250 lignes fait moins de 10 000 caractères ; au-delà, ce n'est pas une liste et le pont n'a pas à le porter. */
    static final int SHARE_MAX = 100000;

    /** Widget ou raccourci touché, texte partagé : l'activité est lancée (ou ramenée devant) avec cette intention ; à froid, Capacitor passe ici l'intention de lancement. */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        String[] t = target(intent);
        if (t == null) return;
        JSObject ev = new JSObject();
        ev.put("view", t[0]);
        if (t.length > 2) {
            ev.put("text", t[1]);
            ev.put("title", t[2]);
        }
        notifyListeners("open", ev, true);
    }

    /**
     * Ce que l'intention demande d'ouvrir : [vue] (widget, raccourci : extra EXTRA_OPEN) ou ['share', texte, titre] (ACTION_SEND text/plain) ; null sinon.
     * Lue une seule fois : l'intention est ensuite vidée (forget), un nouvel appel avec la même intention ne rouvre rien.
     */
    static String[] target(Intent intent) {
        if (intent == null) return null;
        String[] t = null;
        try {
            if (Intent.ACTION_SEND.equals(intent.getAction())) {
                t = new String[] {"share", clip(intent.getCharSequenceExtra(Intent.EXTRA_TEXT), SHARE_MAX), clip(intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT), 300)};
            } else {
                String view = intent.getStringExtra(ValueWidget.EXTRA_OPEN);
                if (view != null) t = new String[] {view};
            }
        } catch (RuntimeException e) {
            return null; // extras illisibles (objet inconnu glissé par une autre appli) : intention ignorée plutôt que l'appli arrêtée
        }
        // Rouverte depuis les applis récentes : Android rejoue l'ancienne intention ; ce n'est ni un nouveau toucher ni un nouveau partage.
        if (t == null || (intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return null;
        forget(intent);
        return t;
    }

    /** Intention lue, ou à ne pas rejouer (activité recréée, voir MainActivity) : plus de cible ni de texte partagé. */
    static void forget(Intent intent) {
        if (intent == null) return;
        try {
            if (Intent.ACTION_SEND.equals(intent.getAction())) {
                intent.setAction(Intent.ACTION_MAIN); // d'abord : même si les extras sont illisibles, plus de partage à rejouer
                intent.removeExtra(Intent.EXTRA_TEXT);
                intent.removeExtra(Intent.EXTRA_SUBJECT);
            }
            intent.removeExtra(ValueWidget.EXTRA_OPEN);
        } catch (RuntimeException e) {
            // extras illisibles : target() les ignore déjà
        }
    }

    private static String clip(CharSequence s, int max) {
        if (s == null) return "";
        String v = s.toString();
        return v.length() > max ? v.substring(0, max) : v;
    }

    /** FirebaseApp.getApps(context) non vide. Firebase n'est visible des plugins qu'à l'exécution (dépendance « implementation ») : appel par réflexion,
     *  et à défaut la ressource google_app_id que le plugin google-services génère depuis google-services.json. */
    private static boolean hasFirebase(Context ctx) {
        try {
            Class<?> app = Class.forName("com.google.firebase.FirebaseApp");
            Object apps = app.getMethod("getApps", Context.class).invoke(null, ctx);
            return apps instanceof List && !((List<?>) apps).isEmpty();
        } catch (Throwable t) {
            return ctx.getResources().getIdentifier("google_app_id", "string", ctx.getPackageName()) != 0;
        }
    }

    @SuppressWarnings("deprecation")
    private static PackageInfo packageInfo(Context ctx) throws PackageManager.NameNotFoundException {
        return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
    }

    @SuppressWarnings("deprecation")
    private static long versionCode(PackageInfo pi) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? pi.getLongVersionCode() : pi.versionCode;
    }

    /** Luminosité de la fenêtre : pleine (QR code à scanner par un autre téléphone, même au soleil) ou celle du téléphone. Aucune autorisation demandée. */
    @PluginMethod
    public void brightness(PluginCall call) {
        boolean full = Boolean.TRUE.equals(call.getBoolean("full", false));
        getActivity().runOnUiThread(() -> {
            WindowManager.LayoutParams lp = getActivity().getWindow().getAttributes();
            lp.screenBrightness = full ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL : WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
            getActivity().getWindow().setAttributes(lp);
            JSObject ret = new JSObject();
            ret.put("full", full);
            call.resolve(ret);
        });
    }
}
