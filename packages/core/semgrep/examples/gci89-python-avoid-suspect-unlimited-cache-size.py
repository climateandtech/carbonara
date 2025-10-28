from functools import lru_cache, cache

# ruleid: gci89-python-avoid-suspect-unlimited-cache-size
@cache
def cached_function_noncompliant1():
    pass

# ruleid: gci89-python-avoid-suspect-unlimited-cache-size
@lru_cache(maxsize=None)
def cached_function_noncompliant2():
    pass

# ok: gci89-python-avoid-suspect-unlimited-cache-size
@lru_cache()
def cached_function_compliant1():
    pass

# ok: gci89-python-avoid-suspect-unlimited-cache-size
@lru_cache(maxsize=16)
def cached_function_compliant2():
    pass
