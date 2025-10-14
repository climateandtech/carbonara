import android.view.Window;
import static android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON;

class ScreenHandler {
    Window window;

    public void keepScreenOnNonCompliant() {
    // ruleid: gci506-java-idleness-keep-screen-on-setflags
        window.setFlags(FLAG_KEEP_SCREEN_ON, FLAG_KEEP_SCREEN_ON);
    }

    // ok: gci506-java-idleness-keep-screen-on-setflags
    public void keepScreenOnCompliant() {
        // Do nothing, or use a more appropriate method
    }
}
