using System;
using System.Data.SqlClient;
using System.Linq;

class LoopHandler {
    const string MyConnectionString = "Data Source=server;Initial Catalog=database;Integrated Security=True";

    public void nonCompliantLoop() {
        const string baseQuery = "SELECT name FROM users WHERE id = ";

        using var conn = new SqlConnection(MyConnectionString);
        using var cmd = conn.CreateCommand();
        for (int i = 0; i < 20; i++) {
            cmd.CommandText = $"{baseQuery}{i}";
    // ruleid: gci72-csharp-avoid-sql-request-in-loop
            using var reader = cmd.ExecuteReader(); // Noncompliant
            while (reader.Read())
                Console.WriteLine(reader.GetString(0));
            // cmd.Close(); // Removed as it's not in the original example and causes issues
        }
    }

    // ok: gci72-csharp-avoid-sql-request-in-loop
    public void compliantLoop() {
        string query = $"SELECT name FROM users WHERE id IN ({string.Join(",", Enumerable.Range(0, 20))})";

        using var conn = new SqlConnection(MyConnectionString);
        using var cmd = new SqlCommand(query, conn);
        using var reader = cmd.ExecuteReader(); // Compliant
        while (reader.Read())
            Console.WriteLine(reader.GetString(0));
    }
}
