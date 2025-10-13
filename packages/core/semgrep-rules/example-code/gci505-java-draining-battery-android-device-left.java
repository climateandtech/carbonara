// Non-compliant examples
getWindow().addFlags(FLAG_KEEP_SCREEN_ON);


// Compliant solutions
// Only keep screen on when necessary, and clear flag when done
getWindow().clearFlags(FLAG_KEEP_SCREEN_ON);
