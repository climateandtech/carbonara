import UIKit

class BrightnessHandler {
    func overrideBrightnessNonCompliant() {
    // ruleid: gci522-swift-sobriety-brightness-override
        UIScreen.main.brightness = CGFloat(0.3)
    }

    // ok: gci522-swift-sobriety-brightness-override
    func overrideBrightnessCompliant() {
        UIScreen.main.brightness = UIScreen.main.brightness // No override
    }
}
