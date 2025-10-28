class QueryHandler {
    public void nonCompliantQuery() {
    // ruleid: gci74-java-dont-use-the-query-select-star-from
        String baseQuery = "SELECT * FROM users";
    }

    // ok: gci74-java-dont-use-the-query-select-star-from
    public void compliantQuery() {
        String query = "SELECT id, name, address FROM users";
    }
}
