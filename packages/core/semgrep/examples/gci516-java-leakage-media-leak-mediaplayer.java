import android.media.MediaPlayer;

class MediaPlayerHandler {
    public void createMediaPlayerNonCompliant() {
    // ruleid: gci516-java-leakage-media-leak-mediaplayer
        MediaPlayer mp = new MediaPlayer();
    }

    // ok: gci516-java-leakage-media-leak-mediaplayer
    public void createMediaPlayerCompliant() {
        MediaPlayer mp = new MediaPlayer();
        mp.release();
    }
}
