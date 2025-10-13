# Non-compliant examples
def foo():
    ...
    results = []
    for id in range(20):
      results.append(cursor.execute("SELECT name FROM users where id = ?", (id)).fetchone()) # Noncompliant {{Avoid performing SQL queries within a loop}}
    ...


# Compliant solutions
def foo():
    ...
    ids = range(20)
    results = cursor.execute("SELECT name FROM users where id IN ({0})".format(', '.join("?" * len(ids))), ids).fetchmany() # Compliant
    ...
