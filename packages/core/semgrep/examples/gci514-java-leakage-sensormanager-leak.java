import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

class SensorHandler implements SensorEventListener {
    SensorManager sManager;

    public void registerSensorNonCompliant(Context context) {
        sManager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        Sensor accelerometer = sManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
    // ruleid: gci514-java-leakage-sensormanager-leak
        sManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_NORMAL);
    }

    // ok: gci514-java-leakage-sensormanager-leak
    public void registerSensorCompliant(Context context) {
        sManager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        Sensor accelerometer = sManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        sManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_NORMAL);
        sManager.unregisterListener(this);
    }

    @Override
    public void onSensorChanged(SensorEvent event) {}
    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}
}
