# ruleid: gci7-python-avoid-creating-getter-and-setter-methods-in-classes
class Client_noncompliant():
    def __init__(self, age):
        self.age = age

    def get_age(self):
        return self.age

    def set_age(self, age):
        self.age = age

# ok: gci7-python-avoid-creating-getter-and-setter-methods-in-classes
class Client_compliant():
    def __init__(self, age):
        self.age = age
