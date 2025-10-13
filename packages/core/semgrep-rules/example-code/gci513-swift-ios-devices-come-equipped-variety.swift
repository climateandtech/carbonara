// Non-compliant examples
import CoreLocation

class LocationTracker: NSObject, CLLocationManagerDelegate {
    var locationManager: CLLocationManager?

    override init() {
        super.init()
        locationManager = CLLocationManager()
        locationManager?.delegate = self
        locationManager?.requestAlwaysAuthorization() // Request appropriate authorization
        locationManager?.startUpdatingLocation() // Start location updates
    }

    // LocationManager Delegate Methods
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        // Process new locations
    }
}

import CoreLocation

class LocationTracker: NSObject, CLLocationManagerDelegate {
    var locationManager: CLLocationManager?

    override init() {
        super.init()
        locationManager = CLLocationManager()
        locationManager?.delegate = self
        locationManager?.requestAlwaysAuthorization() // Request appropriate authorization
        locationManager?.startUpdatingLocation() // Start location updates only when needed
    }

    // LocationManager Delegate Methods
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        // Process new locations
        // Possibly stop updates if they are no longer needed
        locationManager?.stopUpdatingLocation()
    }
}
