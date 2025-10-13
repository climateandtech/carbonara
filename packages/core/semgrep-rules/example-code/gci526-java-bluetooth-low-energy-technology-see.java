// Non-compliant examples
BluetoothGatt gatt = new BluetoothGatt();
gatt.requestConnectionPriority(CONNECTION_PRIORITY_HIGH);


// Compliant solutions
BluetoothGatt gatt = new BluetoothGatt();
gatt.requestConnectionPriority(CONNECTION_PRIORITY_LOW_POWER);
