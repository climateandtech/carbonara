import sqlite3

class LoopHandler:
    def nonCompliantLoop(self):
        conn = sqlite3.connect(':memory:')
        cursor = conn.cursor()
        cursor.execute("CREATE TABLE users (id INTEGER, name TEXT)")

        results = []
        for id in range(20):
        # ruleid: gci72-python-avoid-sql-request-in-loop
            results.append(cursor.execute("SELECT name FROM users where id = ?", (id,)).fetchone()) # Noncompliant
        conn.close()

    def compliantLoop(self):
        conn = sqlite3.connect(':memory:')
        cursor = conn.cursor()
        cursor.execute("CREATE TABLE users (id INTEGER, name TEXT)")

        # ok: gci72-python-avoid-sql-request-in-loop
        ids = range(20)
        results = cursor.execute("SELECT name FROM users where id IN ({0})".format(', '.join("?" * len(ids))), ids).fetchmany() # Compliant
        conn.close()
