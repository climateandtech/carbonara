import UIKit
import SwiftUI
import AVFoundation // For CABasicAnimation, CAKeyframeAnimation, CATransition

// == Non compliant Code Example UIKit

// ruleid: gci603-swift-animation-free
func animateUIKit() {
    UIView.animate(withDuration: 0.5, animations: {})
    UIView.animate(withDuration: 0.5, animations: {}, completion: nil)
    UIView.animate(withDuration: 0.5, delay: 0, options: [], animations: {}, completion: nil)
    UIView.animateKeyframes(withDuration: 0.5, delay: 0, options: [], animations: {}, completion: nil)
    UIView.transition(with: UIView(), duration: 0.5, options: [], animations: {}, completion: nil)
    let basicAnimation = CABasicAnimation()
    let keyframeAnimation = CAKeyframeAnimation()
    let transition = CATransition()
}

// == Non compliant Code Example SwiftUI

// ruleid: gci603-swift-animation-free
struct ContentView: View {
    @State private var showDetails = false

    var body: some View {
        VStack {
            Button("Toggle Details") {
                withAnimation { // Noncompliant
                    showDetails.toggle()
                }
            }
            if showDetails {
                Text("Details here")
                    .animation(.default) // Noncompliant
                    .transition(.opacity) // Noncompliant
                    .onAppear { // Noncompliant
                        print("Appeared")
                    }
                    .onDisappear { // Noncompliant
                        print("Disappeared")
                    }
            }
        }
    }
}

// == Compliant Code Example

// ok: gci603-swift-animation-free
func noAnimation() {
    // No animation calls
}

// ok: gci603-swift-animation-free
struct CompliantView: View {
    @State private var showDetails = false

    var body: some View {
        VStack {
            Button("Toggle Details") {
                showDetails.toggle()
            }
            if showDetails {
                Text("Details here")
            }
        }
    }
}
