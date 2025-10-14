import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.PowerManager;

class PowerSaveModeAwarenessHandler {

    public void nonCompliantJob(Context context) {
        ComponentName componentName = new ComponentName(context, MyJobService.class);
        // ruleid: gci520-java-power-save-mode-awareness
        JobInfo jobInfo = new JobInfo.Builder(123, componentName)
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPeriodic(15 * 60 * 1000)
            .build();

        JobScheduler jobScheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        jobScheduler.schedule(jobInfo);
    }

    // ok: gci520-java-power-save-mode-awareness
    public void compliantJobWithIntentFilter(Context context) {
        IntentFilter filter = new IntentFilter(Intent.ACTION_POWER_SAVE_MODE_CHANGED);
        context.registerReceiver(null, filter);

        ComponentName componentName = new ComponentName(context, MyJobService.class);
        JobInfo jobInfo = new JobInfo.Builder(123, componentName)
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPeriodic(15 * 60 * 1000)
            .build();

        JobScheduler jobScheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        jobScheduler.schedule(jobInfo);
    }

    // ok: gci520-java-power-save-mode-awareness
    public void compliantJobWithAddAction(Context context) {
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_POWER_SAVE_MODE_CHANGED);
        context.registerReceiver(null, filter);

        ComponentName componentName = new ComponentName(context, MyJobService.class);
        JobInfo jobInfo = new JobInfo.Builder(123, componentName)
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPeriodic(15 * 60 * 1000)
            .build();

        JobScheduler jobScheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        jobScheduler.schedule(jobInfo);
    }

    // ok: gci520-java-power-save-mode-awareness
    public void compliantJobWithPowerManagerCheck(Context context) {
        PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        boolean isPowerSaveMode = powerManager.isPowerSaveMode();

        ComponentName componentName = new ComponentName(context, MyJobService.class);
        JobInfo jobInfo = new JobInfo.Builder(123, componentName)
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPeriodic(15 * 60 * 1000)
            .build();

        JobScheduler jobScheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        jobScheduler.schedule(jobInfo);
    }
}
