// Non-compliant examples
public void foo() {
    // ...
    String baseQuery = "SELECT * FROM users"; // Noncompliant
    // ...
}


// Compliant solutions
public void foo() {
    // ...
    String query = "SELECT id, name, address FROM users";
    // ...
}
