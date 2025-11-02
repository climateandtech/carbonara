import android.service.voice.VoiceInteractionSession;
import android.content.Context;

class VoiceInteractionHandler {
    public void createSessionNonCompliantImplicit(Context context) {
    // ruleid: gci511-java-idleness-keep-voice-awake
        VoiceInteractionSession voiceSession = new VoiceInteractionSession(context);
    }

    public void createSessionNonCompliantExplicit(Context context) {
    // ruleid: gci511-java-idleness-keep-voice-awake
        VoiceInteractionSession voiceSession = new VoiceInteractionSession(context);
        voiceSession.setKeepAwake(true);
    }

    // ok: gci511-java-idleness-keep-voice-awake
    public void createSessionCompliant(Context context) {
        VoiceInteractionSession voiceSession = new VoiceInteractionSession(context);
        voiceSession.setKeepAwake(false);
    }
}
