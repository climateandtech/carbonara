import java.io.IOException;
import java.net.InetAddress;
import java.net.Socket;
import java.nio.channels.UnresolvedAddressException;
import java.util.ArrayList;
import java.util.List;

class ExceptionHandler {
    Object obj;
    String str = "hello";
    List<String> list = new ArrayList<>();
    int divisor = 0;

    // ruleid: gci98-java-avoid-raising-runtime-exceptions-when-a-check-is-possible
    public void nonCompliantNullPointerException() {
        try {
            obj.toString();
        } catch (NullPointerException e) {
            System.out.println("Object is null");
        }
    }

    // ok: gci98-java-avoid-raising-runtime-exceptions-when-a-check-is-possible
    public void compliantNullPointerException() {
        if (obj != null) {
            System.out.println(obj.toString());
        } else {
            System.out.println("Object is null");
        }
    }

    // ruleid: gci98-java-avoid-raising-runtime-exceptions-when-a-check-is-possible
    public void nonCompliantStringIndexOutOfBoundsException() {
        try {
            String part = str.substring(5);
            System.out.println(part);
        } catch (StringIndexOutOfBoundsException e) {
            System.out.println("String too short");
        }
    }

    // ok: gci98-java-avoid-raising-runtime-exceptions-when-a-check-is-possible
    public void compliantStringIndexOutOfBoundsException() {
        if (str.length() >= 5) {
            String part = str.substring(5);
            System.out.println(part);
        } else {
            System.out.println("String too short");
        }
    }

    // ruleid: gci98-java-avoid-raising-runtime-exceptions-when-a-check-is-possible
    public void nonCompliantArrayIndexOutOfBoundsException() {
        try {
            String value = list.get(3);
            System.out.println(value);
        } catch (ArrayIndexOutOfBoundsException e) {
            System.out.println("List does not have enough elements");
        }
    }

    // ok: gci98-java-avoid-raising-runtime-exceptions-when-a-check-is-possible
    public void compliantArrayIndexOutOfBoundsException() {
        if (list.size() > 3) {
            String value = list.get(3);
            System.out.println(value);
        } else {
            System.out.println("List does not have enough elements");
        }
    }

    // ruleid: gci98-java-avoid-raising-runtime-exceptions-when-a-check-is-possible
    public void nonCompliantArithmeticException() {
        try {
            int result = 10 / divisor;
            System.out.println(result);
        } catch (ArithmeticException e) {
            System.out.println("Division by zero");
        }
    }

    // ok: gci98-java-avoid-raising-runtime-exceptions-when-a-check-is-possible
    public void compliantArithmeticException() {
        if (divisor != 0) {
            int result = 10 / divisor;
            System.out.println(result);
        } else {
            System.out.println("Division by zero");
        }
    }

    // ok: gci98-java-avoid-raising-runtime-exceptions-when-a-check-is-possible
    public void exceptionNumberFormatException() {
        try {
            int result = Integer.parseInt("aString");
        } catch (NumberFormatException e) {
            System.out.println("String is not parseable as a Integer");
        }
    }

    // ok: gci98-java-avoid-raising-runtime-exceptions-when-a-check-is-possible
    public void exceptionUnresolvedAddressException() throws IOException {
        try {
            InetAddress address = InetAddress.getByName("invalidhostname");
            Socket socket = new Socket(address, 8080);
        } catch (UnresolvedAddressException e) {
            System.out.println("Invalid hostname or IP address");
        }
    }
}
