# Test file for CPU profiling
# This file contains intentionally slow functions for profiling

def slow_function():
    """A function that uses significant CPU"""
    result = 0
    for i in range(1000000):
        result += i * 2
    return result

def another_function():
    """Another CPU-intensive function"""
    data = []
    for i in range(500000):
        data.append(i ** 2)
    return sum(data)

def helper_function():
    """Helper function that also uses CPU"""
    total = 0
    for i in range(100000):
        total += i
    return total

if __name__ == '__main__':
    slow_function()
    another_function()
    helper_function()

