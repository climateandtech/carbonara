# Non-compliant examples
results = [[0 for _ in range(cols_B)] for _ in range(rows_A)]


for i in range(len(A)):
    for j in range(len(B[0])):
        for k in range(len(B)):
            results[i][j] += A[i][k] * B[k][j]


# Compliant solutions
results = np.dot(A, B)
# np stands for NumPy, the Python library used to manipulate data series.

def iterative_dot_product(x,y):
    total = 0
    for i in range(len(x)):
        total += x[i] * y[i]
    return total

def vectorized_dot_product(x,y):
    return np.dot(x,y)

def iterative_outer_product(x, y):
    o = np.zeros((len(x), len(y)))
    for i in range(len(x)):
        for j in range(len(y)):
            o[i][j] = x[i] * y[j]
    return o

def vectorized_outer_product(x, y):
    return np.outer(x, y)

def iterative_matrix_product(A, B):
    for i in range(len(A)):
        for j in range(len(B[0])):
            for k in range(len(B)):
                results[i][j] += A[i][k] * B[k][j]
    return results

def vectorized_outer_product(A, B):
    return np.dot(A, B)
