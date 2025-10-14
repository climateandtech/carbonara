import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorManager;

class SensorHandler {
    SensorManager sManager;

    public void getRotationVectorSensorNonCompliant(Context context) {
        sManager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
    // ruleid: gci521-java-sobriety-thrifty-motion-sensor
        sManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
    }

    // ok: gci521-java-sobriety-thrifty-motion-sensor
    public void getGeomagneticRotationVectorSensorCompliant(Context context) {
        sManager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        sManager.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR);
    }
}
