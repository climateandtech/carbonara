import AVFoundation

class TorchHandler {
    func turnOnTorchNonCompliant() {
        guard let videoDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else { return }
        guard videoDevice.hasTorch else { return }

        do {
            try videoDevice.lockForConfiguration()
    // ruleid: gci530-swift-sobriety-torch-free
            videoDevice.torchMode = .on
            videoDevice.setTorchModeOn(level: 1.0)
            videoDevice.unlockForConfiguration()
        } catch {
            // Handle error
        }
    }

    // ok: gci530-swift-sobriety-torch-free
    func turnOffTorchCompliant() {
        guard let videoDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else { return }
        guard videoDevice.hasTorch else { return }

        do {
            try videoDevice.lockForConfiguration()
            videoDevice.torchMode = .off
            videoDevice.unlockForConfiguration()
        } catch {
            // Handle error
        }
    }
}
