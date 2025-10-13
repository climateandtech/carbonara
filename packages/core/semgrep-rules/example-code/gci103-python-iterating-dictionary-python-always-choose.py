# Non-compliant examples
my_dict = {'a': 1, 'b': 2, 'c': 3}

# Only keys needed, but using items()
for k, v in my_dict.items():
    print(k)


# Compliant solutions
my_dict = {'a': 1, 'b': 2, 'c': 3}

# Proper use of keys()
for k in my_dict.keys():
    print(k)
