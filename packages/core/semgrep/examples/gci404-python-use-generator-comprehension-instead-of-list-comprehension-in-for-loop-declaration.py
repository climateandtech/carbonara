# == Non compliant Code Example

# ruleid: gci404-python-use-generator-comprehension-instead-of-list-comprehension-in-for-loop-declaration
for var in [var2 for var2 in range(100)]:
    pass

# == Compliant Solution

# ok: gci404-python-use-generator-comprehension-instead-of-list-comprehension-in-for-loop-declaration
for var in (var2 for var2 in range(100)):
    pass
