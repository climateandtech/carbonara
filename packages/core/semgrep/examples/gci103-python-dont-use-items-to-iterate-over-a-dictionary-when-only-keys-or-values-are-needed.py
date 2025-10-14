my_dict = {'a': 1, 'b': 2, 'c': 3}

# ruleid: gci103-python-dont-use-items-to-iterate-over-a-dictionary-when-only-keys-or-values-are-needed
# Only keys needed, but using items()
for k, v in my_dict.items():
    print(k)

# ok: gci103-python-dont-use-items-to-iterate-over-a-dictionary-when-only-keys-or-values-are-needed
# Proper use of keys()
for k in my_dict.keys():
    print(k)

# ok: gci103-python-dont-use-items-to-iterate-over-a-dictionary-when-only-keys-or-values-are-needed
# Proper use of items()
for k, v in my_dict.items():
    print(k, v)
