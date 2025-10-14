import android.content.Context;
import android.os.PowerManager;

class WakeLockHandler {
    PowerManager.WakeLock manager;

    public void acquireWakeLockNonCompliant() {
    // ruleid: gci508-java-idleness-durable-wake-lock
        manager.acquire();
    }

    // ok: gci508-java-idleness-durable-wake-lock
    public void acquireWakeLockCompliant() {
        manager.acquire(10000L); // 10 seconds timeout
    }
}
