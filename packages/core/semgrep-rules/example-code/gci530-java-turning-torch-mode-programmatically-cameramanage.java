// Non-compliant examples
CameraManager camManager = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
String cameraId = null;
try {
    cameraId = camManager.getCameraIdList()[0];
    camManager.setTorchMode(cameraId, true);
} catch (CameraAccessException e) {
    e.printStackTrace();
}
