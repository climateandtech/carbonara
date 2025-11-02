import android.content.Context;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;

class LocationHandler implements LocationListener {
    LocationManager locationManager;

    public void requestLocationUpdatesNonCompliant(Context context) {
        locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
    // ruleid: gci523-java-sobriety-thrifty-geolocation-mintime
        locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER,
            0,
            0,
            this);
    }

    // ok: gci523-java-sobriety-thrifty-geolocation-mintime
    public void requestLocationUpdatesCompliant(Context context) {
        locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER,
            60000L,  // refresh location at least each 60000ms
            10.0f,   // refresh location at least each 10 meters
            this);
    }

    @Override
    public void onLocationChanged(android.location.Location location) {}
    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {}
    @Override
    public void onProviderEnabled(String provider) {}
    @Override
    public void onProviderDisabled(String provider) {}
}
