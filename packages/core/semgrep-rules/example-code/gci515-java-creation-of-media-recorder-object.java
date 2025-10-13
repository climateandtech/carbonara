// Non-compliant examples
MediaRecorder mr = new MediaRecorder();


// Compliant solutions
MediaRecorder mr = new MediaRecorder();
mr.release();
