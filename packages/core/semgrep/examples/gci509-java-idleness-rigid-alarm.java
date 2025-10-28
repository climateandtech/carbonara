import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;

class AlarmHandler {
    public void setRepeatingAlarmNonCompliant(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(context, AlarmHandler.class);
        PendingIntent operation = PendingIntent.getBroadcast(context, 0, intent, 0);
    // ruleid: gci509-java-idleness-rigid-alarm
        alarmManager.setRepeating(AlarmManager.RTC_WAKEUP, SystemClock.elapsedRealtime(), 1000 * 60 * 10, operation);
    }

    public void setExactAlarmNonCompliant(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(context, AlarmHandler.class);
        PendingIntent operation = PendingIntent.getBroadcast(context, 0, intent, 0);
    // ruleid: gci509-java-idleness-rigid-alarm
        alarmManager.setExact(AlarmManager.RTC_WAKEUP, SystemClock.elapsedRealtime() + 10000, operation);
    }

    public void setExactAndAllowWhileIdleAlarmNonCompliant(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(context, AlarmHandler.class);
        PendingIntent operation = PendingIntent.getBroadcast(context, 0, intent, 0);
    // ruleid: gci509-java-idleness-rigid-alarm
        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, SystemClock.elapsedRealtime() + 10000, operation);
    }

    // ok: gci509-java-idleness-rigid-alarm
    public void setInexactRepeatingAlarmCompliant(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(context, AlarmHandler.class);
        PendingIntent operation = PendingIntent.getBroadcast(context, 0, intent, 0);
        alarmManager.setInexactRepeating(AlarmManager.RTC_WAKEUP, SystemClock.elapsedRealtime(), 1000 * 60 * 10, operation);
    }
}
