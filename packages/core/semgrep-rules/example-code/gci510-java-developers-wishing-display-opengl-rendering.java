// Non-compliant examples
GLSurfaceView surfaceView = new GLSurfaceView(this);
surfaceView.setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);


// Compliant solutions
GLSurfaceView surfaceView = new GLSurfaceView(this);
surfaceView.setRenderMode(GLSurfaceView.RENDERMODE_WHEN_DIRTY);
