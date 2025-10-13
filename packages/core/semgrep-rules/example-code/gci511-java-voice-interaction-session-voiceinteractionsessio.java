// Non-compliant examples
VoiceInteractionSession voiceSession = new VoiceInteractionSession(this);

VoiceInteractionSession voiceSession = new VoiceInteractionSession(this);
voiceSession.setKeepAwake(true);


// Compliant solutions
VoiceInteractionSession voiceSession = new VoiceInteractionSession(this);
voiceSession.setKeepAwake(false);
