# Non-compliant examples
class Client():

    def __init__(self, age):
        self.age = age

    def get_age(self):
        return self.age

    def set_age(self, age):
        self.age = age

client = Client(25)
client.get_age() # Getter inutile
client.set_age(25) # Setter inutile


# Compliant solutions
class Client():

    def __init__(self, age):
        self.age = age

client = Client(25)
client.age # Récupérer l'attribut age
client.age = 26 # Modifier l'attribut age

class Direct():
    def __init__(self, age):
        self.age = age  


class WithGetter():
    def __init__(self, age):
        self._age = age

    def get_age(self):
        return self._age
