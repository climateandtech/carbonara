import CoreLocation

class LocationManagerHandler {
    func disableLocationUpdatesPauseNonCompliant() {
        let manager = CLLocationManager()
    // ruleid: gci533-swift-location-updates-pause-disabled
        manager.pausesLocationUpdatesAutomatically = false
    }

    // ok: gci533-swift-location-updates-pause-disabled
    func enableLocationUpdatesPauseCompliant() {
        let manager = CLLocationManager()
        manager.pausesLocationUpdatesAutomatically = true // Default behavior
    }
}
