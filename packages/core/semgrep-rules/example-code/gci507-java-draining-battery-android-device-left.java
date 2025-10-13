// Non-compliant examples
PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
WakeLock manager = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "TAG");
