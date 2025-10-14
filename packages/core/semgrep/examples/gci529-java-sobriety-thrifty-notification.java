import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.RingtoneManager;

class NotificationHandler {
    public void createNotificationApi26NonCompliant(Context context) {
        Notification.Builder notificationBuilder = new Notification.Builder(context, "42");
    // ruleid: gci529-java-sobriety-thrifty-notification
        notificationBuilder.setVibrate(new long[] {1000, 1000, 1000, 1000, 1000});
        notificationBuilder.setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
            Notification.AUDIO_ATTRIBUTES_DEFAULT
        );
    }

    public void createNotificationApi31NonCompliant() {
        NotificationChannel notification = new NotificationChannel("42",
            "test",
            NotificationManager.IMPORTANCE_DEFAULT
        );
    // ruleid: gci529-java-sobriety-thrifty-notification
        notification.setVibrationPattern(new long[]{1000, 1000, 1000, 1000, 1000});
        notification.setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
            Notification.AUDIO_ATTRIBUTES_DEFAULT
        );
    }

    // ok: gci529-java-sobriety-thrifty-notification
    public void createNotificationCompliant(Context context) {
        Notification.Builder notificationBuilder = new Notification.Builder(context, "42");
        // No vibrate or sound settings
    }
}
