import android.content.Context;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

class VibrationHandler {
    public void vibrateApi26NonCompliant(Context context) {
        Vibrator v = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
    // ruleid: gci528-java-sobriety-vibration-free
        v.vibrate(400);
    }

    public void vibrateApi31NonCompliant(Context context) {
        VibratorManager vm = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
    // ruleid: gci528-java-sobriety-vibration-free
        vm.getDefaultVibrator().vibrate(VibrationEffect.createOneShot(500, VibrationEffect.DEFAULT_AMPLITUDE));
    }

    // ok: gci528-java-sobriety-vibration-free
    public void noVibrationCompliant() {
        // No vibration calls
    }
}
