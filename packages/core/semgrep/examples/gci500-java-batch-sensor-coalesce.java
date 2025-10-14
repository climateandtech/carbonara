import android.hardware.Sensor;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

class SensorHandler {
    SensorEventListener sensorEventListener;
    SensorManager sensorManager;
    Sensor sensor;

    public void registerNonCompliant() {
    // ruleid: gci500-java-batch-sensor-coalesce
        sensorManager.registerListener(sensorEventListener, sensor, SensorManager.SENSOR_DELAY_NORMAL);
    }

    // ok: gci500-java-batch-sensor-coalesce
    public void registerCompliant() {
        sensorManager.registerListener(sensorEventListener, sensor, SensorManager.SENSOR_DELAY_NORMAL, 200000);
    }
}
