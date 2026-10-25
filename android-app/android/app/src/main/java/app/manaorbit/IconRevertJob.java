package app.manaorbit;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

/**
 * Retour à l'icône normale à la fin de la fête (IconSwitch), même si l'appli n'est pas rouverte. Tâche unique (JobScheduler), non conservée au
 * redémarrage du téléphone (pas d'autorisation RECEIVE_BOOT_COMPLETED) : ManaOrbitPlugin.load la reprogramme à chaque lancement.
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
