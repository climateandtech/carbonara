import android.bluetooth.BluetoothGatt;
import static android.bluetooth.BluetoothGatt.CONNECTION_PRIORITY_HIGH;
import static android.bluetooth.BluetoothGatt.CONNECTION_PRIORITY_LOW_POWER;

class BluetoothHandler {
    public void setConnectionPriorityNonCompliant() {
        BluetoothGatt gatt = new BluetoothGatt();
    // ruleid: gci526-java-sobriety-thrifty-bluetooth-low-energy-requestconnectionpriority
        gatt.requestConnectionPriority(CONNECTION_PRIORITY_HIGH);
    }

    // ok: gci526-java-sobriety-thrifty-bluetooth-low-energy-requestconnectionpriority
    public void setConnectionPriorityCompliant() {
        BluetoothGatt gatt = new BluetoothGatt();
        gatt.requestConnectionPriority(CONNECTION_PRIORITY_LOW_POWER);
    }
}
