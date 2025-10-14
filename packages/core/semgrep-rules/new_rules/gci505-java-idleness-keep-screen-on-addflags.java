import android.view.Window;
import static android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON;

class ScreenHandler {
    Window window;

    public void keepScreenOnNonCompliant() {
    // ruleid: gci505-java-idleness-keep-screen-on-addflags
        window.addFlags(FLAG_KEEP_SCREEN_ON);
    }

    // ok: gci505-java-idleness-keep-screen-on-addflags
    public void keepScreenOnCompliant() {
        // Do nothing, or use a more appropriate method
    }
}
