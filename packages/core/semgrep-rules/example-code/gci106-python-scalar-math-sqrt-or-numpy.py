# Non-compliant examples
import math
data = [1, 4, 9, 16]
results = []

for value in data:
    results.append(math.sqrt(value))  # Noncompliant: scalar sqrt in a loop


# Compliant solutions
import numpy as np
data = np.array([1, 4, 9, 16])
results = np.sqrt(data)  # Compliant: vectorized sqrt
