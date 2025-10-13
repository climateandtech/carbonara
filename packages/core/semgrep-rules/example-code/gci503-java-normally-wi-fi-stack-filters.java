// Non-compliant examples
WifiManager wifiManager = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
WifiManager.MulticastLock lock = wifiManager.createMulticastLock("tag");
lock.acquire();


// Compliant solutions
WifiManager wifiManager = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
WifiManager.MulticastLock lock = wifiManager.createMulticastLock("tag");
lock.acquire();
// Use the lock only when needed
lock.release();
