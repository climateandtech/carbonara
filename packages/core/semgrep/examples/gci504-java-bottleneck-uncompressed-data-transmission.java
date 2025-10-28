import java.io.IOException;
import java.io.OutputStream;
import java.net.URL;
import java.net.URLConnection;
import java.util.zip.GZIPOutputStream;
import javax.net.ssl.HttpsURLConnection;

class NetworkClient {
    // ruleid: gci504-java-bottleneck-uncompressed-data-transmission
    public void sendDataNonCompliant() throws IOException {
        URL url = new URL("https://www.green-code-initiative.io/");
        HttpsURLConnection con = (HttpsURLConnection) url.openConnection();
        OutputStream stream = con.getOutputStream();
        stream.write("uncompressed data".getBytes());
        stream.close();
    }

    // ok: gci504-java-bottleneck-uncompressed-data-transmission
    public void sendDataCompliant() throws IOException {
        URL url = new URL("https://www.green-code-initiative.io/");
        HttpsURLConnection con = (HttpsURLConnection) url.openConnection();
        OutputStream stream = new GZIPOutputStream(con.getOutputStream());
        stream.write("compressed data".getBytes());
        stream.close();
    }
}
