import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;

class Alarm {
    void setAlarmNonCompliant(Context context) {
        AlarmManager alarmManager = (AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(context, Alarm.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(context, 0, intent, 0);
    // ruleid: gci501-java-batch-job-coalesce
        alarmManager.setRepeating(AlarmManager.RTC_WAKEUP, SystemClock.elapsedRealtime(), 1000 * 60 * 10, pendingIntent);
    }

    // ok: gci501-java-batch-job-coalesce
    void setAlarmCompliant(Context context) {
        ComponentName COMPONENT_NAME = new ComponentName(context, Alarm.class);
        JobInfo info = new JobInfo.Builder(123, COMPONENT_NAME)
                                  .setRequiresCharging(true)
                                  .setRequiredNetworkType(JobInfo.NETWORK_TYPE_UNMETERED)
                                  .setPersisted(true)
                                  .setPeriodic(10 * 60 * 1000)
                                  .build();
        JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        scheduler.schedule(info);
    }
}
