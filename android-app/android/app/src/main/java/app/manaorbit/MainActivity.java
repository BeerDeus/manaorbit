package app.manaorbit;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebSettings;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins locaux (pas de paquet npm) : à déclarer avant super.onCreate, qui crée le pont avec la liste des plugins.
        registerPlugin(ManaOrbitPlugin.class);
        // Activité recréée (processus tué en arrière-plan) ou rouverte depuis les applis récentes : getIntent() est encore celle du lancement (widget,
        // raccourci, partage, lien https://manaorbit.app), que super.onCreate rejouerait (collection rouverte, liste partagée recollée par-dessus la saisie
        // en cours, liste d'un autre joueur rouverte par App.getLaunchUrl et « appUrlOpen »).
        Intent launch = getIntent();
        if (savedInstanceState != null || (launch != null && (launch.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0)) ManaOrbitPlugin.forget(launch);
        super.onCreate(savedInstanceState);
        // Interface fixe, comme une appli : ni pincer ni toucher deux fois pour zoomer dans le WebView (le site le coupe aussi par son viewport,
        // ce qui suffit aux APK plus anciennes une fois le site à jour).
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebSettings ws = getBridge().getWebView().getSettings();
            ws.setSupportZoom(false); ws.setBuiltInZoomControls(false); ws.setDisplayZoomControls(false);
        }
        // Plein écran (barre d'état cachée par le site, SystemBars) : la page dessine aussi sur la ligne de la caméra frontale, sans bande noire
        // (Android 9 à 14 ; Android 15 et plus le font déjà pour une appli bord à bord). Le site lit la découpe (ManaOrbit.cutout) pour l'éviter.
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= 30
                ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        // Barre d'état cachée : un glissé du haut (ou le volet des notifications) ne la montre qu'en passant, elle se recache seule ensuite
        // (sans ça elle restait affichée une fois le volet refermé ; le site la recache aussi, pour les APK 1.0.2 et moins).
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
            .setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
