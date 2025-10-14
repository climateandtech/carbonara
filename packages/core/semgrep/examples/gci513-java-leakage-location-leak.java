import android.content.Context;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;

class LocationHandler implements LocationListener {
    LocationManager locationManager;

    public void requestLocationUpdatesNonCompliant(Context context) {
        locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
    // ruleid: gci513-java-leakage-location-leak
        locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 1.0f, this);
    }

    // ok: gci513-java-leakage-location-leak
    public void requestLocationUpdatesCompliant(Context context) {
        locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 1.0f, this);
        locationManager.removeUpdates(this);
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
