import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Statement;

class Dao {
    private Connection connection;

    public void select_noncompliant() throws java.sql.SQLException {
    // ruleid: gci5-java-use-preparedstatement-instead-of-statement
        Statement statement = connection.createStatement();
        statement.executeUpdate("INSERT INTO persons(id, name) VALUES(2, 'John DOE')");
    }

    // ok: gci5-java-use-preparedstatement-instead-of-statement
    public void select_compliant() throws java.sql.SQLException {
        PreparedStatement statement = connection.prepareStatement("INSERT INTO persons(id, name) VALUES(?, ?)");
        statement.setInt(1, 2);
        statement.setString(2, "John DOE");
        statement.executeQuery();
    }
}
