// Non-compliant examples
PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
WakeLock manager = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "TAG");


// Compliant solutions
PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
WakeLock manager = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "TAG");
manager.acquire(10*60*1000L); // 10 minutes timeout
manager.release(); // Release when done
