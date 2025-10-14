city = "New York"
street = "5th Avenue"
zip_code = "10001"
address = ""
# ruleid: gci105-python-python-string-concatenation-use-join-instead-or-f-strings-instead-of-plus-equals
address += city + ", " + street + ", " + zip_code

# ok: gci105-python-python-string-concatenation-use-join-instead-or-f-strings-instead-of-plus-equals
city_f = "New York"
street_f = "5th Avenue"
zip_code_f = "10001"
address_f = f"{city_f}, {street_f}, {zip_code_f}"

# ok: gci105-python-python-string-concatenation-use-join-instead-or-f-strings-instead-of-plus-equals
parts = ["New York", "5th Avenue", "10001"]
address_join = ", ".join(parts)
