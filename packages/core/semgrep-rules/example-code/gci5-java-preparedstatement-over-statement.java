// Non compliant Code Example

public void select() {
    Statement statement = connection.createStatement();
    statement.executeUpdate("INSERT INTO persons(id, name) VALUES(2, 'John DOE')");  // Noncompliant
}


// Compliant Solution


public void select() {
    PreparedStatement statement = connection.prepareStatement("INSERT INTO persons(id, name) VALUES(?, ?)");

    statement.setInt(1, 2);
    statement.setString(2, "John DOE");
    statement.executeQuery();
}
