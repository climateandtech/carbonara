// Non-compliant examples
public void foo() {
    // ...
    String query = "insert into mytable values(?,?,?)";
    // ...
    for(DummyClass o : list) {
        stmt.setInt(1, 123);  // Noncompliant
        stmt.setString(2, o.getName());
        stmt.setDouble(3, o.getPrice());
        stmt.addBatch();
    }
    // ...
}


// Compliant solutions
public void foo() {
    // ...
    String query = "insert into mytable values(123,?,?)";
    // ...
    for(DummyClass o : list) {
        stmt.setString(1, o.getName());
        stmt.setDouble(2, o.getPrice());
        stmt.addBatch();
    }
    // ...
}
