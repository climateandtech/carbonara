// Non-compliant examples
SensorManager sManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
Sensor accelerometer = sManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
sManager.registerListener(this,accelerometer,SensorManager.SENSOR_DELAY_NORMAL);

SensorManager sManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
Sensor accelerometer = sManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
sManager.registerListener(this,accelerometer,SensorManager.SENSOR_DELAY_NORMAL);
sManager.unregisterListener(this);
