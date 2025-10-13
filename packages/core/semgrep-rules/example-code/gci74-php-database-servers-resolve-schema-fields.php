# Non-compliant examples
public function foo() {
    ...
    $baseQuery = "SELECT * FROM users"; // Noncompliant
    ...
}


# Compliant solutions
public function foo() {
    ...
    $baseQuery = "SELECT id,name, address FROM users ";
    ...
}
