import Foundation

class TimerHandler {
    func setupTimerNonCompliant() {
    // ruleid: gci509-swift-idleness-rigid-alarm
        let timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in }
    }

    // ok: gci509-swift-idleness-rigid-alarm
    func setupTimerCompliant() {
        let timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in }
        timer.tolerance = 0.5
    }
}
