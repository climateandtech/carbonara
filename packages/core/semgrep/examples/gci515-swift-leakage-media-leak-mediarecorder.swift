import AVFoundation

class AudioRecorderHandler: NSObject {
    var audioRecorder: AVAudioRecorder?

    // Helper function for example
    func getDocumentsDirectory() -> URL {
        let paths = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
        return paths[0]
    }

    // ruleid: gci515-swift-leakage-media-leak-mediarecorder
    func startRecordingNonCompliant() {
        let settings = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 12000,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        do {
            audioRecorder = try AVAudioRecorder(url: getDocumentsDirectory().appendingPathComponent("recording.m4a"), settings: settings)
            audioRecorder?.record()
        } catch {
            // Handle error
        }
    }

    // ok: gci515-swift-leakage-media-leak-mediarecorder
    func startRecordingCompliant() {
        let settings = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 12000,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        do {
            audioRecorder = try AVAudioRecorder(url: getDocumentsDirectory().appendingPathComponent("recording.m4a"), settings: settings)
            audioRecorder?.record()
        } catch {
            // Handle error
        }
    }

    func stopRecordingCompliant() {
        if let recorder = audioRecorder, recorder.isRecording {
            recorder.stop()
            audioRecorder = nil
        }
    }
}
