import android.media.MediaRecorder;

class MediaHandler {
    public void createMediaRecorderNonCompliant() {
    // ruleid: gci515-java-leakage-media-leak-mediarecorder
        MediaRecorder mr = new MediaRecorder();
    }

    // ok: gci515-java-leakage-media-leak-mediarecorder
    public void createMediaRecorderCompliant() {
        MediaRecorder mr = new MediaRecorder();
        mr.release();
    }
}
