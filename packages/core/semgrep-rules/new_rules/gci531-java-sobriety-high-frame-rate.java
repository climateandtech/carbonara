import android.view.Surface;
import static android.view.Surface.FRAME_RATE_COMPATIBILITY_DEFAULT;

class FrameRateHandler {
    Surface surface;

    public void setHighFrameRateNonCompliant() {
    // ruleid: gci531-java-sobriety-high-frame-rate
        surface.setFrameRate(120f, FRAME_RATE_COMPATIBILITY_DEFAULT);
    }

    // ok: gci531-java-sobriety-high-frame-rate
    public void setNormalFrameRateCompliant() {
        surface.setFrameRate(60f, FRAME_RATE_COMPATIBILITY_DEFAULT);
    }
}
