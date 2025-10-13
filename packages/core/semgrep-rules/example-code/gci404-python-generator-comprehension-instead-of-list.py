# Non-compliant examples
for var in [var2 for var2 in range(100)]:
    ...


# Compliant solutions
for var in (var2 for var2 in range(100)):
    ...
