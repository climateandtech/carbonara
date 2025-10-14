# ruleid: gci74-python-dont-use-the-query-select-star-from
baseQuery = "SELECT * FROM users"

# ok: gci74-python-dont-use-the-query-select-star-from
query = "SELECT id, name, address FROM users"
