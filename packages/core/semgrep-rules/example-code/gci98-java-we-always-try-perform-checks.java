// Non-compliant examples
try {
    obj.toString(); // Noncompliant
} catch (NullPointerException e) {
    System.out.println("Object is null");
}

try {
    String part = str.substring(5); // Noncompliant
    System.out.println(part);
} catch (StringIndexOutOfBoundsException e) {
    System.out.println("String too short");
}

try {
    String value = list.get(3); // Noncompliant
    System.out.println(value);
} catch (ArrayIndexOutOfBoundsException e) {
    System.out.println("List does not have enough elements");
}

try {
    int result = 10 / divisor; // Noncompliant
    System.out.println(result);
} catch (ArithmeticException e) {
    System.out.println("Division by zero");
}


// Compliant solutions
if (obj != null) {
    System.out.println(obj.toString());
} else {
    System.out.println("Object is null");
}

if (str.length() >= 5) {
    String part = str.substring(5);
    System.out.println(part);
} else {
    System.out.println("String too short");
}

if (list.size() > 3) {
    String value = list.get(3);
    System.out.println(value);
} else {
    System.out.println("List does not have enough elements");
}

if (divisor != 0) {
    int result = 10 / divisor;
    System.out.println(result);
} else {
    System.out.println("Division by zero");
}

try {
    int result = Integer.parseInt(aString);
} catch (NumberFormatException e) {
    System.out.println("String is not parseable as a Integer");
}

try {
    InetAddress address = InetAddress.getByName("invalidhostname");
    Socket socket = new Socket(address, 8080);
} catch (UnresolvedAddressException e) {
    System.out.println("Invalid hostname or IP address");
}
