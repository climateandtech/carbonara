// Non-compliant examples
SensorManager sManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
sManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);

SensorManager sManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
sManager.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR);
