# If we are using too many conditional IF, ELSEIF or ELSE statements it will impact performance.
# We can think of using a switch statement instead of multiple if-else if possible, or refactor code
# to reduce number of IF, ELSEIF and ELSE statements. Sometimes called "complexity cyclomatic".
# MATCH-CASE statement has a performance advantage over if – else.

# == Non compliant Code Example

# [source,python]
# ----
index = 1
nb = 2
#...
# ruleid: gci2-python-avoid-multiple-if-else-statement
if nb == 0:
    nb = index
elif nb == 1:
    nb = index * 2
elif nb == 2:
    nb = index * 3
else:
    nb = -1
# ----

# == Compliant Code Example

# [source,python]
# ----
# ok: gci2-python-avoid-multiple-if-else-statement
index = 1
nb = 2
#...
match nb:
    case 0:
        nb = index * (nb + 1)
    case 1:
        nb = index * (nb + 1)
    case 2:
        nb = index * (nb + 1)
    case _:
        nb = -1
# ----
