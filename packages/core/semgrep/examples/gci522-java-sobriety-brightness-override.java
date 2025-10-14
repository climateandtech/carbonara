import android.view.Window;
import android.view.WindowManager;

class BrightnessHandler {
    Window window;

    public void overrideBrightnessNonCompliant() {
    // ruleid: gci522-java-sobriety-brightness-override
        window.getAttributes().screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL;
    }

    // ok: gci522-java-sobriety-brightness-override
    public void overrideBrightnessCompliant() {
        window.getAttributes().screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
    }
}
