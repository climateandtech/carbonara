// Non-compliant examples
WifiManager wifiManager = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
WifiManager.MulticastLock lock = wifiManager.createMulticastLock("tag");
lock.acquire();

WifiManager wifiManager = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
WifiManager.MulticastLock lock = wifiManager.createMulticastLock("tag");
lock.acquire();
lock.release()
