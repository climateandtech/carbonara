import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

class LoopHandler {
    Connection conn;

    public void nonCompliantLoop() throws SQLException {
        String baseQuery = "SELECT name FROM users where id = ";

        for (int i = 0; i < 20; i++) {
            String query  = baseQuery.concat("" + i);
            Statement st = conn.createStatement();
    // ruleid: gci72-java-avoid-sql-request-in-loop
            ResultSet rs = st.executeQuery(query); // Noncompliant

            while (rs.next()) {
                String name = rs.getString("name");
                System.out.println(name);
            }
            st.close();
        }
    }

    // ok: gci72-java-avoid-sql-request-in-loop
    public void compliantLoop() throws SQLException {
        StringBuilder queryBuilder = new StringBuilder("SELECT name FROM users WHERE id IN (");
        for (int i = 0; i < 20; i++) {
            if (i > 0) {
                queryBuilder.append(",");
            }
            queryBuilder.append("?");
        }
        queryBuilder.append(")");

        String query = queryBuilder.toString();

        try (Connection conn = DriverManager.getConnection("your-database-url");
             PreparedStatement pst = conn.prepareStatement(query)) {

            for (int i = 0; i < 20; i++) {
                pst.setInt(i + 1, i);
            }

            try (ResultSet rs = pst.executeQuery()) { // compliant
                while (rs.next()) {
                    String name = rs.getString("name");
                    System.out.println(name);
                }
            }
        } catch (SQLException e) {
            e.printStackTrace();
        }
    }
}
