# Non-compliant examples
city = "New York"
street = "5th Avenue"
zip_code = "10001"
address = ""
address += city + ", " + street + ", " + zip_code  # Noncompliant: inefficient string concatenation


# Compliant solutions
# Using f-string for readability and performance
city = "New York"
street = "5th Avenue"
zip_code = "10001"
address = f"{city}, {street}, {zip_code}"  
# or using str.join() for multiple string concatenations
parts = ["New York", "5th Avenue", "10001"]
address = ", ".join(parts)
