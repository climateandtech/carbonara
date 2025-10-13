// Non-compliant examples
locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER,
    1000L,
    1.0f,
    this);


// Compliant solutions
Criteria criteria = new Criteria();
criteria.setPowerRequirement(Criteria.POWER_LOW);
locationManager.requestLocationUpdates(locationManager.getBestProvider(criteria,true),
    1000L,
    1.0f,
    this);
