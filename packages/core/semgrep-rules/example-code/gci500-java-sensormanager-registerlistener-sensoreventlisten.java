// Non-compliant examples
SensorEventListener sensorEventListener;
SensorManager sensorManager;
Sensor sensor;

sensorManager.registerListener(sensorEventListener, sensor, SensorManager.SENSOR_DELAY_NORMAL);

SensorEventListener sensorEventListener;
SensorManager sensorManager;
Sensor sensor;

sensorManager.registerListener(sensorEventListener, sensor, SensorManager.SENSOR_DELAY_NORMAL, 200000);


// Compliant solutions
SensorEventListener sensorEventListener;
SensorManager sensorManager;
Sensor sensor;

sensorManager.registerListener(sensorEventListener, sensor, SensorManager.SENSOR_DELAY_NORMAL);
// Remember to unregister when done
sensorManager.unregisterListener(sensorEventListener);
