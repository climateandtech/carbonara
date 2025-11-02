import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.util.logging.Logger;

class FileHandler {
    private static final Logger logger = Logger.getLogger(FileHandler.class.getName());

    // ruleid: gci28-java-optimize-read-file-exceptions
    public void readPreferencesNonCompliant(String filename) {
        InputStream in = null;
        try {
            in = new FileInputStream(filename);
        } catch (FileNotFoundException e) {
            logger.log(e.getMessage()); // Simplified logging for example
        }
        // This will throw NullPointerException if file not found
        try {
            in.read();
        } catch (IOException e) {
            logger.log(e.getMessage());
        }
    }

    // ok: gci28-java-optimize-read-file-exceptions
    public void readPreferencesCompliant(String filename) throws IllegalArgumentException, FileNotFoundException, IOException {
        if (filename == null) {
            throw new IllegalArgumentException ("filename is null");
        }
        InputStream in = new FileInputStream(filename);
        in.read();
    }
}
