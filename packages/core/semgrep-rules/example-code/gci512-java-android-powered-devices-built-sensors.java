// Non-compliant examples
Camera camera = Camera.open();


// Compliant solutions
Camera camera = Camera.open();
// Use camera
camera.release();
