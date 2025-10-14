import torch
import numpy as np

def non_compliant_random_rand():
# ruleid: gci104-python-data-ai-pytorch-create-tensors-directly-from-torch
    tensor = torch.tensor(np.random.rand(1000, 1000))

# ok: gci104-python-data-ai-pytorch-create-tensors-directly-from-torch
def compliant_random_rand():
    tensor = torch.rand([1000, 1000])
