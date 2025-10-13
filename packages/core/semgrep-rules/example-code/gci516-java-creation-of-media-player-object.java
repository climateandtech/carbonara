// Non-compliant examples
MediaPlayer mp = new MediaPlayer();


// Compliant solutions
MediaPlayer mp = new MediaPlayer();
mp.release();
