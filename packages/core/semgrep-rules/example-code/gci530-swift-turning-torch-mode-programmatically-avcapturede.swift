// Non-compliant examples
guard let videoDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else { return }
guard videoDevice.hasTorch else { return }

videoDevice.lockForConfiguration()
videoDevice.torchMode = .on // Noncompliant
videoDevice.setTorchModeOn(level: 1.0) // Noncompliant
videoDevice.unlockForConfiguration()


// Compliant solutions
guard let videoDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else { return }
guard videoDevice.hasTorch else { return }

videoDevice.lockForConfiguration()
videoDevice.torchMode = .on
// Use torch only when needed, then turn off
videoDevice.torchMode = .off
videoDevice.unlockForConfiguration()
