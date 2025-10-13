# Non-compliant examples
import torch
import numpy as np

def non_compliant_random_rand():
    tensor = torch.tensor(np.random.rand(1000, 1000))


# Compliant solutions
import torch

def compliant_random_rand():
    tensor = torch.rand([1000, 1000])
