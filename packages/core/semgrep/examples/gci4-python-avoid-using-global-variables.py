a = 1
def my_func():
# ruleid: gci4-python-avoid-using-global-variables
    global a
    a = 2

# ok: gci4-python-avoid-using-global-variables
b = 1
def my_other_func(b_arg):
    b_arg = 2
