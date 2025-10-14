import android.bluetooth.le.AdvertiseSettings;

class BluetoothHandler {
    public void setAdvertiseModeNonCompliant() {
        AdvertiseSettings.Builder builder = new AdvertiseSettings.Builder();
    // ruleid: gci525-java-sobriety-thrifty-bluetooth-low-energy-setadvertisemode
        builder.setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY);
    }

    // ok: gci525-java-sobriety-thrifty-bluetooth-low-energy-setadvertisemode
    public void setAdvertiseModeCompliant() {
        AdvertiseSettings.Builder builder = new AdvertiseSettings.Builder();
        builder.setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_POWER);
    }
}
