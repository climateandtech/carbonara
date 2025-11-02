import java.net.URL;
import java.net.URLConnection;

class NetworkHandler {
    public void processData(int[] myArray) throws Exception {
        for (int val : myArray) {
            URL url = new URL("http://example.com/" + val);
        // ruleid: gci502-java-bottleneck-internet-in-the-loop
            URLConnection connection = url.openConnection();
            // ... process connection
        }
    }

    // ok: gci502-java-bottleneck-internet-in-the-loop
    public void processDataCompliant(int[] myArray) throws Exception {
        URL url = new URL("http://example.com/");
        URLConnection connection = url.openConnection();
        for (int val : myArray) {
            // ... process connection
        }
    }
}
