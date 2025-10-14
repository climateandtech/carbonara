import CoreMotion

class MotionHandler {
    let motionManager = CMMotionManager()

    // ruleid: gci514-swift-leakage-sensormanager-leak
    func startMotionUpdatesNonCompliant() {
        if motionManager.isAccelerometerAvailable {
            motionManager.startAccelerometerUpdates(to: .main) { data, error in
                // Handle accelerometer updates
            }
        }
    }

    // ok: gci514-swift-leakage-sensormanager-leak
    func startMotionUpdatesCompliant() {
        if motionManager.isAccelerometerAvailable {
            motionManager.startAccelerometerUpdates(to: .main) { data, error in
                // Handle accelerometer updates
            }
        }
    }

    func stopMotionUpdatesCompliant() {
        if motionManager.isAccelerometerActive {
            motionManager.stopAccelerometerUpdates()
        }
    }
}
