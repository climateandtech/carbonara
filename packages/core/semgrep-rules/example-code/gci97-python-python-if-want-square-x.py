# Non-compliant examples
x = x**2
# or
x = math.pow(x,2)


# Compliant solutions
x = x*x

0 LOAD_FAST                0 (x)
2 LOAD_FAST                0 (x)
4 BINARY_MULTIPLY
6 RETURN_VALUE

0 LOAD_GLOBAL              0 (math)
2 LOAD_ATTR                1 (pow)
4 LOAD_FAST                0 (x)
6 LOAD_CONST               1 (2)
8 CALL_FUNCTION            2
10 RETURN_VALUE

0 LOAD_FAST                0 (x)
2 LOAD_CONST               1 (2)
4 BINARY_POWER
6 RETURN_VALUE
