// Non-compliant examples
AdvertiseSettings.Builder builder = new AdvertiseSettings.Builder();
builder.setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY);


// Compliant solutions
AdvertiseSettings.Builder builder = new AdvertiseSettings.Builder();
builder.setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_POWER);
