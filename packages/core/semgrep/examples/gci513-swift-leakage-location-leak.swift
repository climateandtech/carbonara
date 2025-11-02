import CoreLocation

class LocationTracker: NSObject, CLLocationManagerDelegate {
    var locationManager: CLLocationManager?

    override init() {
        super.init()
        locationManager = CLLocationManager()
        locationManager?.delegate = self
        locationManager?.requestAlwaysAuthorization() // Request appropriate authorization
    // ruleid: gci513-swift-leakage-location-leak
        locationManager?.startUpdatingLocation() // Start location updates
    }

    // ok: gci513-swift-leakage-location-leak
    func compliantInit() {
        locationManager = CLLocationManager()
        locationManager?.delegate = self
        locationManager?.requestAlwaysAuthorization() // Request appropriate authorization
        locationManager?.startUpdatingLocation() // Start location updates only when needed
        locationManager?.stopUpdatingLocation()
    }

    // LocationManager Delegate Methods
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        // Process new locations
    }
}
