// Non-compliant examples
SensorEventListener sensorEventListener;
SensorManager sensorManager;
Sensor sensor;

sensorManager.registerListener(sensorEventListener, sensor, SensorManager.SENSOR_DELAY_NORMAL);

SensorEventListener sensorEventListener;
SensorManager sensorManager;
Sensor sensor;

sensorManager.registerListener(sensorEventListener, sensor, SensorManager.SENSOR_DELAY_NORMAL, 200000);
