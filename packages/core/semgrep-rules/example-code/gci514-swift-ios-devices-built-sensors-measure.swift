// Non-compliant examples
import CoreMotion

let motionManager = CMMotionManager()

func startMotionUpdates() {
    if motionManager.isAccelerometerAvailable {
        motionManager.startAccelerometerUpdates(to: .main) { data, error in
            // Handle accelerometer updates
        }
    }
}

import CoreMotion

let motionManager = CMMotionManager()

func startMotionUpdates() {
    if motionManager.isAccelerometerAvailable {
        motionManager.startAccelerometerUpdates(to: .main) { data, error in
            // Handle accelerometer updates
        }
    }
}

func stopMotionUpdates() {
    if motionManager.isAccelerometerActive {
        motionManager.stopAccelerometerUpdates()
    }
}
