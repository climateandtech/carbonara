import android.content.Context;
import android.location.Criteria;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;

class LocationHandler implements LocationListener {
    LocationManager locationManager;

    public void requestLocationUpdatesNonCompliant(Context context) {
        locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
    // ruleid: gci524-java-sobriety-thrifty-geolocation-criteria
        locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER,
            1000L,
            1.0f,
            this);
    }

    // ok: gci524-java-sobriety-thrifty-geolocation-criteria
    public void requestLocationUpdatesCompliant(Context context) {
        locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        Criteria criteria = new Criteria();
        criteria.setPowerRequirement(Criteria.POWER_LOW);
        locationManager.requestLocationUpdates(locationManager.getBestProvider(criteria,true),
            1000L,
            1.0f,
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
