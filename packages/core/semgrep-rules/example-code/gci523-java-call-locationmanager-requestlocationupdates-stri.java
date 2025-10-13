// Non-compliant examples
locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER,
    0,
    0,
    this);

locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER,
    60000L,  // refresh location at least each 60000ms
    10.0f,   // refresh location at least each 10 meters
    this);
