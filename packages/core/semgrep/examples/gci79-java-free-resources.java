import java.io.FileInputStream;
import java.io.IOException;

class ResourceHandler {
    private static void printFileJava7NonCompliant() throws IOException {
    // ruleid: gci79-java-free-resources
        FileInputStream input = new FileInputStream("file.txt");
        int data = input.read();
        while(data != -1){
            System.out.print((char) data);
            data = input.read();
        }
    }

    // ok: gci79-java-free-resources
    private static void printFileJava7Compliant() throws IOException {
        try(FileInputStream input = new FileInputStream("file.txt")) {
            int data = input.read();
            while(data != -1){
                System.out.print((char) data);
                data = input.read();
            }
        }
    }
}
