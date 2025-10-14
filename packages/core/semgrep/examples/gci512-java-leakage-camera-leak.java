import android.hardware.Camera;

class CameraHandler {
    public void openCameraNonCompliant() {
    // ruleid: gci512-java-leakage-camera-leak
        Camera camera = Camera.open();
    }

    // ok: gci512-java-leakage-camera-leak
    public void openCameraCompliant() {
        Camera camera = Camera.open();
        camera.release();
    }
}
