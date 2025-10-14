// == Non compliant Code Example

// ruleid: gci24-java-returned-sql-results-should-be-limited
String query_noncompliant = "SELECT * FROM customers";

// == Compliant Solution

// ok: gci24-java-returned-sql-results-should-be-limited
String query_compliant_fetch = "SELECT id,name,email FROM customers FETCH FIRST 10 ROWS ONLY";

// ok: gci24-java-returned-sql-results-should-be-limited
String query_compliant_limit = "SELECT id,name,email FROM customers LIMIT 10";
