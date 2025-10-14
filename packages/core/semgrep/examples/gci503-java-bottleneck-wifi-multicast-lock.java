import android.content.Context;
import android.net.wifi.WifiManager;

class WifiHandler {
    public void acquireLockNonCompliant(Context context) {
        WifiManager wifiManager = (WifiManager) context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        WifiManager.MulticastLock lock = wifiManager.createMulticastLock("tag");
    // ruleid: gci503-java-bottleneck-wifi-multicast-lock
        lock.acquire();
    }

    // ok: gci503-java-bottleneck-wifi-multicast-lock
    public void acquireLockCompliant(Context context) {
        WifiManager wifiManager = (WifiManager) context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        WifiManager.MulticastLock lock = wifiManager.createMulticastLock("tag");
        lock.acquire();
        lock.release();
    }
}
