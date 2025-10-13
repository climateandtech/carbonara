// Non-compliant examples
SensorManager sManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
sManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);


// Compliant solutions
SensorManager sManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
sManager.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR);
