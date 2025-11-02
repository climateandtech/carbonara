import CoreLocation

class LocationHandler {

    // Note: This case is hard to detect with static analysis
    // but ideally should set desiredAccuracy
    // ok: gci524-swift-sobriety-thrifty-geolocation-criteria
    func implicitDefaultAccuracy() {
        let manager = CLLocationManager()
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingLocation()
    }

    func nonCompliantBestAccuracy() {
        let manager = CLLocationManager()
        // ruleid: gci524-swift-sobriety-thrifty-geolocation-criteria
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingLocation()
    }

    func nonCompliantBestForNavigation() {
        let manager = CLLocationManager()
        // ruleid: gci524-swift-sobriety-thrifty-geolocation-criteria
        manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingLocation()
    }

    // ok: gci524-swift-sobriety-thrifty-geolocation-criteria
    func compliantWithNumericValue() {
        let manager = CLLocationManager()
        manager.desiredAccuracy = 2
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingLocation()
    }

    // ok: gci524-swift-sobriety-thrifty-geolocation-criteria
    func compliantWithHundredMeters() {
        let manager = CLLocationManager()
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingLocation()
    }

    // ok: gci524-swift-sobriety-thrifty-geolocation-criteria
    func compliantWithKilometer() {
        let manager = CLLocationManager()
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingLocation()
    }

    // ok: gci524-swift-sobriety-thrifty-geolocation-criteria
    func compliantWithNearestTenMeters() {
        let manager = CLLocationManager()
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingLocation()
    }
}
