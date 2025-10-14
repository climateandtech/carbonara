import CoreMotion

class MotionHandler {
    let motionManager = CMMotionManager()

    func startAccelerometer() {
    // ruleid: gci534-swift-motion-sensor-update-rate
        motionManager.startAccelerometerUpdates()
    }

    func startGyro() {
    // ruleid: gci534-swift-motion-sensor-update-rate
        motionManager.startGyroUpdates()
    }

    func startDeviceMotion() {
    // ruleid: gci534-swift-motion-sensor-update-rate
        motionManager.startDeviceMotionUpdates()
    }

    func startMagnetometer() {
    // ruleid: gci534-swift-motion-sensor-update-rate
        motionManager.startMagnetometerUpdates()
    }

    func startAccelerometerWithInterval() {
        motionManager.accelerometerUpdateInterval = 1.0
    // ruleid: gci534-swift-motion-sensor-update-rate
        motionManager.startAccelerometerUpdates()
    }

    func startGyroWithInterval() {
        motionManager.gyroUpdateInterval = 1.0
    // ruleid: gci534-swift-motion-sensor-update-rate
        motionManager.startGyroUpdates()
    }

    func startDeviceMotionWithInterval() {
        motionManager.deviceMotionUpdateInterval = 1.0
    // ruleid: gci534-swift-motion-sensor-update-rate
        motionManager.startDeviceMotionUpdates()
    }

    func startMagnetometerWithInterval() {
        motionManager.magnetometerUpdateInterval = 1.0
    // ruleid: gci534-swift-motion-sensor-update-rate
        motionManager.startMagnetometerUpdates()
    }

    func startWithCallback() {
        motionManager.accelerometerUpdateInterval = 0.5
    // ruleid: gci534-swift-motion-sensor-update-rate
        motionManager.startAccelerometerUpdates(to: OperationQueue.main) { (data, error) in
            // Handle accelerometer data
        }
    }
}
