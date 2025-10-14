// == Non compliant Code Example

// ruleid: gci24-javascript-returned-sql-results-should-be-limited
const query_noncompliant = "SELECT * FROM customers";

// == Compliant Solution

// ok: gci24-javascript-returned-sql-results-should-be-limited
const query_compliant_fetch = "SELECT id,name,email FROM customers FETCH FIRST 10 ROWS ONLY";

// ok: gci24-javascript-returned-sql-results-should-be-limited
const query_compliant_limit = "SELECT id,name,email FROM customers LIMIT 10";
