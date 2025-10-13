// Non-compliant examples
getWindow().getAttributes().screenBrightness = BRIGHTNESS_OVERRIDE_FULL;


// Compliant solutions
// Use default system brightness
getWindow().getAttributes().screenBrightness = BRIGHTNESS_OVERRIDE_NONE;
