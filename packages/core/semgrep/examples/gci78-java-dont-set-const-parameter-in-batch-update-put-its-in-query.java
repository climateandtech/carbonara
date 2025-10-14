import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;

class DummyClass {
    String name;
    double price;

    public String getName() { return name; }
    public double getPrice() { return price; }
}

class BatchUpdateHandler {
    PreparedStatement stmt;

    public void nonCompliantBatchUpdate(List<DummyClass> list) throws SQLException {
        String query = "insert into mytable values(?,?,?)";
        for(DummyClass o : list) {
    // ruleid: gci78-java-dont-set-const-parameter-in-batch-update-put-its-in-query
            stmt.setInt(1, 123);  // Noncompliant
            stmt.setString(2, o.getName());
            stmt.setDouble(3, o.getPrice());
            stmt.addBatch();
        }
    }

    // ok: gci78-java-dont-set-const-parameter-in-batch-update-put-its-in-query
    public void compliantBatchUpdate(List<DummyClass> list) throws SQLException {
        String query = "insert into mytable values(123,?,?)";
        for(DummyClass o : list) {
            stmt.setString(1, o.getName());
            stmt.setDouble(2, o.getPrice());
            stmt.addBatch();
        }
    }
}
