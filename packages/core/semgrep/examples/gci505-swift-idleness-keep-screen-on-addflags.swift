import UIKit

class ViewController: UIViewController {

    func enableKeepScreenOnNonCompliant() {
    // ruleid: gci505-swift-idleness-keep-screen-on-addflags
        UIApplication.shared.isIdleTimerDisabled = true
    }

    // ok: gci505-swift-idleness-keep-screen-on-addflags
    func enableKeepScreenOnCompliant() {
        UIApplication.shared.isIdleTimerDisabled = false
    }
}
