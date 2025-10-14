import android.content.Context;
import android.os.PowerManager;

class CpuHandler {
    public void acquireWakeLockNonCompliant(Context context) {
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
    // ruleid: gci507-java-idleness-keep-cpu-on
        PowerManager.WakeLock manager = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "TAG");
        manager.acquire(); // Acquire the lock
    }

    // ok: gci507-java-idleness-keep-cpu-on
    public void acquireWakeLockCompliant(Context context) {
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock manager = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "TAG");
        manager.acquire(); // Acquire the lock
        manager.release(); // Release the lock
    }
}
