package app.manaorbit;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins locaux (pas de paquet npm) : à déclarer avant super.onCreate, qui crée le pont avec la liste des plugins.
        registerPlugin(ManaOrbitPlugin.class);
        // Activité recréée (processus tué en arrière-plan) : getIntent() est encore celle du lancement (widget, raccourci, partage), que super.onCreate
        // rejouerait (collection rouverte, liste partagée recollée par-dessus la saisie en cours).
        if (savedInstanceState != null) ManaOrbitPlugin.forget(getIntent());
        super.onCreate(savedInstanceState);
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
