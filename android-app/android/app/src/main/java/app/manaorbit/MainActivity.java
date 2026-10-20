package app.manaorbit;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.activity.EdgeToEdge;
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
        // Bord à bord sur toutes les versions (APK 1.0.7, demandé par la Play Console) : Android 15 et plus l'imposent déjà (cible SDK 35+) ; Android 7 à 14
        // s'affichent pareil (barres transparentes ; SystemBars de Capacitor donne les marges au site). Sur Android 9 et 10, EdgeToEdge dessine aussi sur
        // la ligne de la caméra frontale (SHORT_EDGES, réglé par la bibliothèque : plus de constante obsolète ici).
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        // Plein écran (barre d'état cachée par le site, SystemBars) : la page dessine aussi sur la ligne de la caméra frontale, sans bande noire, même en paysage
        // (Android 11 et plus). Le site lit la découpe (ManaOrbit.cutout) pour l'éviter.
        if (Build.VERSION.SDK_INT >= 30) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            getWindow().setAttributes(lp);
        }
        // Barre d'état cachée : un glissé du haut (ou le volet des notifications) ne la montre qu'en passant, elle se recache seule ensuite
        // (sans ça elle restait affichée une fois le volet refermé ; le site la recache aussi, pour les APK 1.0.2 et moins).
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
            .setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
