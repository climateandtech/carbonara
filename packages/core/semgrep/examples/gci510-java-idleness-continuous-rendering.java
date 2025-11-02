import android.opengl.GLSurfaceView;
import android.content.Context;

class MyGLSurfaceView extends GLSurfaceView {
    public MyGLSurfaceView(Context context) {
        super(context);
    }
}

class RendererHandler {
    public void setContinuousRendering(Context context) {
        GLSurfaceView surfaceView = new MyGLSurfaceView(context);
    // ruleid: gci510-java-idleness-continuous-rendering
        surfaceView.setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);
    }

    // ok: gci510-java-idleness-continuous-rendering
    public void setWhenDirtyRendering(Context context) {
        GLSurfaceView surfaceView = new MyGLSurfaceView(context);
        surfaceView.setRenderMode(GLSurfaceView.RENDERMODE_WHEN_DIRTY);
    }
}
