package app.manaorbit;

import android.content.ClipData;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.DisplayCutout;
import android.view.MotionEvent;
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
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;
import com.google.mlkit.common.MlKitException;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;
import com.google.mlkit.vision.text.japanese.JapaneseTextRecognizerOptions;
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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
 * - detectText({ base64Image, rotation, script }) → { text, blocks: [{ text, lines: [{ text }] }], script } : texte lu par ML Kit sur le téléphone (scan des cartes,
 *   src/scan.js › natLines), écriture script = latin | chinese | japanese | korean (chacun de ces modèles lit aussi l'alphabet latin ; chinese : simplifié et
 *   traditionnel). Mêmes champs que detectText du plugin ML Kit (latin), qui reste utilisé pour le latin. Modèles des services Google Play (non embarqués :
 *   ≈ 260 Ko par écriture dans l'APK au lieu de ≈ 4 Mo), téléchargés à la première lecture d'une écriture ; tant qu'il n'est pas là : refusé, code « wait »
 *   (le site lit avec Tesseract en attendant). APK 1.0.6 et plus ; plus ancienne : pas de méthode, chinois, japonais, coréen par Tesseract.
 * - keepAwake({ on }) → { on } : écran gardé allumé pendant le scan (FLAG_KEEP_SCREEN_ON de la fenêtre), sans quoi la mise en veille automatique du téléphone
 *   l'éteint en plein cadrage ; le WebView n'a pas navigator.wakeLock. APK 1.0.10 et plus ; plus ancienne : pas de méthode, l'écran s'éteint comme d'habitude.
 * - camTouch({ l, t, r, b, k }) → { ok } : zone de l'aperçu du scan (px CSS, k = devicePixelRatio) où un toucher va à la caméra native (mise au point, pincer
 *   pour zoomer) ; ailleurs (boutons, liste, déclencheur) il reste à la page. Le plugin CameraPreview envoie sinon TOUS les touchers du WebView à la caméra :
 *   chaque bouton touché refaisait la mise au point à cet endroit. ok false : caméra pas démarrée. APK 1.0.11 et plus ; plus ancienne : comme le plugin.
 * - orientation({ lock }) → { lock } : orientation gardée pendant une partie du compteur de vie (vrai : celle du moment, faux : rendue au capteur).
 *   APK 1.0.12 et plus ; plus ancienne : le site garde ses mises en page paysage.
 * - setIcon({ pack, until, now }) → { want, current, applied } : icône de l'appli aux couleurs d'une fête (activity-alias, IconSwitch.java) ;
 *   pack : halloween | noel | nouvelan | paques | magic, null ou absent : icône normale ; until (ms) : retour automatique à l'icône normale (IconRevertJob) ;
 *   appliquée quand l'appli passe en arrière-plan (now : tout de suite, essais). Fête inconnue de cette APK : refusé. APK 1.0.13 et plus ; plus ancienne : pas
 *   de méthode, l'icône reste normale (src/event.js › evNatIcon).
 * - iconState() → { want, current, packs } : icône voulue, icône montrée, fêtes connues de cette APK.
 * - requestReview() → { ok: true } : demande de note Google Play dans l'appli (In-App Review), voir requestReview. APK 1.0.6 et plus ; plus ancienne : le site
 *   montre sa propre demande, qui ouvre la fiche Play Store.
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

    /** Intention lue, ou à ne pas rejouer (activité recréée, voir MainActivity) : plus de cible, de texte partagé ni de lien. */
    static void forget(Intent intent) {
        if (intent == null) return;
        try {
            if (Intent.ACTION_VIEW.equals(intent.getAction())) {
                intent.setAction(Intent.ACTION_MAIN); // lien https://manaorbit.app (App Links) : ni App.getLaunchUrl ni « appUrlOpen » ne le rejouent
                intent.setData(null);
            }
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

    /** Écran gardé allumé (FLAG_KEEP_SCREEN_ON, scan ouvert) ou rendu à la mise en veille du téléphone. Seulement tant que la fenêtre de l'appli est visible ; aucune autorisation. */
    @PluginMethod
    public void keepAwake(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            JSObject ret = new JSObject();
            ret.put("on", on);
            call.resolve(ret);
        });
    }

    /** Orientation gardée pendant une partie du compteur de vie (partie-jeu.js › puOrient) : lock = vrai, l'écran reste dans son orientation du moment
     *  (SCREEN_ORIENTATION_LOCKED, même téléphone posé à plat qui bascule) ; faux, rendue au capteur (l'activité n'impose aucune orientation). Aucune autorisation. */
    @PluginMethod
    public void orientation(PluginCall call) {
        boolean lock = Boolean.TRUE.equals(call.getBoolean("lock", false));
        getActivity().runOnUiThread(() -> {
            getActivity().setRequestedOrientation(lock ? ActivityInfo.SCREEN_ORIENTATION_LOCKED : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            JSObject ret = new JSObject();
            ret.put("lock", lock);
            call.resolve(ret);
        });
    }

    /** Icône d'une fête demandée par le site (src/event.js › evNatIcon) : gardée, appliquée au prochain passage en arrière-plan (handleOnStop). */
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

    /** Au lancement : retour automatique à l'icône normale reprogrammé (les tâches ne survivent pas à un redémarrage du téléphone). */
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

    /**
     * Touchers du WebView rendus à la caméra native (CameraPreview, toBack) seulement s'ils commencent dans la zone donnée : remplace l'écouteur que le plugin pose
     * au démarrage (tout envoyer), qui faisait la mise au point sur chaque bouton touché. Les coordonnées sont ramenées à l'aperçu (le plugin les laissait relatives
     * au WebView : mise au point décalée de la hauteur au-dessus de l'aperçu). Le plugin retire l'écouteur à l'arrêt de la caméra ; à redemander après chaque démarrage.
     */
    @PluginMethod
    public void camTouch(PluginCall call) {
        double k = call.getDouble("k", 1.0);
        final RectF zone = new RectF((float) (call.getDouble("l", 0.0) * k), (float) (call.getDouble("t", 0.0) * k), (float) (call.getDouble("r", 0.0) * k), (float) (call.getDouble("b", 0.0) * k));
        getActivity().runOnUiThread(() -> {
            final View wv = getBridge().getWebView();
            final int fid = getActivity().getResources().getIdentifier("frame_container", "id", getActivity().getPackageName());
            boolean on = fid != 0 && getActivity().findViewById(fid) != null;
            if (on) {
                wv.setOnTouchListener(new View.OnTouchListener() {
                    private boolean cam;      // geste commencé dans la zone : tous ses événements (2e doigt du pincement compris) vont à la caméra
                    @Override
                    public boolean onTouch(View v, MotionEvent e) {
                        if (e.getActionMasked() == MotionEvent.ACTION_DOWN) cam = zone.contains(e.getX(), e.getY());
                        View f = cam ? getActivity().findViewById(fid) : null;
                        if (f != null) {
                            int[] a = new int[2], b = new int[2];
                            v.getLocationOnScreen(a); f.getLocationOnScreen(b);
                            MotionEvent c = MotionEvent.obtain(e);
                            c.offsetLocation(a[0] - b[0], a[1] - b[1]);
                            f.dispatchTouchEvent(c);
                            c.recycle();
                        }
                        return false;      // la page reçoit toujours le toucher
                    }
                });
            }
            JSObject ret = new JSObject();
            ret.put("ok", on);
            call.resolve(ret);
        });
    }

    /** Lecteurs ML Kit par écriture, créés à la première lecture puis gardés (modèle chargé une fois) ; fermés avec l'activité. */
    private final Map<String, TextRecognizer> recognizers = new HashMap<>();

    /** Lecteur ML Kit de l'écriture script ; null si l'écriture est inconnue. */
    private TextRecognizer recognizer(String script) {
        synchronized (recognizers) {
            TextRecognizer r = recognizers.get(script);
            if (r != null) return r;
            switch (script) {
                case "latin":
                    r = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
                    break;
                case "chinese":
                    r = TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
                    break;
                case "japanese":
                    r = TextRecognition.getClient(new JapaneseTextRecognizerOptions.Builder().build());
                    break;
                case "korean":
                    r = TextRecognition.getClient(new KoreanTextRecognizerOptions.Builder().build());
                    break;
                default:
                    return null;
            }
            recognizers.put(script, r);
            return r;
        }
    }

    /**
     * Texte d'une image (bande du nom d'une carte, ligne du bas) lu par ML Kit dans l'écriture demandée. Modèle pas encore téléchargé par les services Google Play
     * (première carte de cette écriture, téléphone hors ligne) : refusé avec le code « wait », le téléchargement est lancé ; le site relit avec Tesseract en attendant.
     */
    @PluginMethod
    public void detectText(PluginCall call) {
        String script = call.getString("script", "latin");
        TextRecognizer rec = recognizer(script == null ? "latin" : script);
        if (rec == null) {
            call.reject("detectText : écriture inconnue (" + script + ")", "script");
            return;
        }
        String data = call.getString("base64Image", "");
        if (data == null || data.isEmpty() || data.length() > IMAGE_MAX) {
            call.reject("detectText : image manquante ou trop grosse", "image");
            return;
        }
        Bitmap bmp;
        try {
            byte[] raw = Base64.decode(data, Base64.DEFAULT);
            bmp = BitmapFactory.decodeByteArray(raw, 0, raw.length);
        } catch (IllegalArgumentException e) {
            bmp = null;
        }
        if (bmp == null) {
            call.reject("detectText : image illisible", "image");
            return;
        }
        Integer rot = call.getInt("rotation", 0);
        int r = rot == null ? 0 : rot;
        final Bitmap img = bmp;
        rec.process(InputImage.fromBitmap(img, r == 90 || r == 180 || r == 270 ? r : 0))
            .addOnSuccessListener(text -> {
                JSObject ret = new JSObject();
                JSArray blocks = new JSArray();
                for (Text.TextBlock b : text.getTextBlocks()) {
                    JSArray lines = new JSArray();
                    for (Text.Line l : b.getLines()) {
                        JSObject lo = new JSObject();
                        lo.put("text", l.getText());
                        lines.put(lo);
                    }
                    JSObject bo = new JSObject();
                    bo.put("text", b.getText());
                    bo.put("lines", lines);
                    blocks.put(bo);
                }
                ret.put("text", text.getText());
                ret.put("blocks", blocks);
                ret.put("script", script);
                call.resolve(ret);
            })
            .addOnFailureListener(e -> {
                boolean wait = e instanceof MlKitException && ((MlKitException) e).getErrorCode() == MlKitException.UNAVAILABLE;      // « Waiting for the text optional module to be downloaded »
                call.reject("detectText : " + e.getMessage(), wait ? "wait" : "ocr", e);
            })
            .addOnCompleteListener(t -> img.recycle());
    }

    /**
     * Demande de note Google Play dans l'appli (In-App Review) : la carte de Google s'affiche par-dessus l'appli, sans la quitter. Google décide seul de l'afficher
     * (quota par utilisateur) et ne dit jamais si une note a été laissée : résolu { ok: true } une fois le parcours fini, affiché ou non. Refusé si le Play Store
     * manque ou refuse (appli installée hors du Play Store) : le site montre alors sa propre demande, qui ouvre la fiche. Appelé seulement par src/help.js › rateShow,
     * à un bon moment et dans les limites de la demande (jamais depuis un bouton : Google le déconseille, le quota pouvant être atteint).
     */
    @PluginMethod
    public void requestReview(PluginCall call) {
        ReviewManager rm = ReviewManagerFactory.create(getContext());
        rm.requestReviewFlow().addOnCompleteListener(req -> {
            if (!req.isSuccessful() || getActivity() == null) {
                Exception e = req.isSuccessful() ? null : req.getException();
                call.reject("requestReview : " + (e != null ? e.getMessage() : "pas d'activité"), "review");
                return;
            }
            ReviewInfo info = req.getResult();
            rm.launchReviewFlow(getActivity(), info).addOnCompleteListener(flow -> {
                JSObject ret = new JSObject();
                ret.put("ok", true);
                call.resolve(ret);
            });
        });
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (recognizers) {
            for (TextRecognizer r : recognizers.values()) {
                try {
                    r.close();
                } catch (Exception e) {
                    // déjà fermé : rien de plus à faire
                }
            }
            recognizers.clear();
        }
        super.handleOnDestroy();
    }
}
