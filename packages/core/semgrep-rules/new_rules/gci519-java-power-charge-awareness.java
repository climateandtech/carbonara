import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;

class PowerAwarenessHandler {

    public void nonCompliantJob(Context context) {
        ComponentName componentName = new ComponentName(context, MyJobService.class);
        // ruleid: gci519-java-power-charge-awareness
        JobInfo jobInfo = new JobInfo.Builder(123, componentName)
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPeriodic(15 * 60 * 1000)
            .build();

        JobScheduler jobScheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        jobScheduler.schedule(jobInfo);
    }

    // ok: gci519-java-power-charge-awareness
    public void compliantJobWithCharging(Context context) {
        ComponentName componentName = new ComponentName(context, MyJobService.class);
        JobInfo jobInfo = new JobInfo.Builder(123, componentName)
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPeriodic(15 * 60 * 1000)
            .setRequiresCharging(true)
            .build();

        JobScheduler jobScheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        jobScheduler.schedule(jobInfo);
    }

    // ok: gci519-java-power-charge-awareness
    public void compliantIntentFilterRegistration(Context context) {
        IntentFilter filter = new IntentFilter(Intent.ACTION_POWER_CONNECTED);
        context.registerReceiver(null, filter);
    }

    // ok: gci519-java-power-charge-awareness
    public void compliantPowerDisconnectedFilter(Context context) {
        IntentFilter filter = new IntentFilter(Intent.ACTION_POWER_DISCONNECTED);
        context.registerReceiver(null, filter);
    }
}
