// Non-compliant examples
let timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in }

let timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in }
timer.tolerance = 0.5
