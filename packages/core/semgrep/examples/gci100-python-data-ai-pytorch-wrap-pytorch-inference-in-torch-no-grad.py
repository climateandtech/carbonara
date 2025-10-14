import torch

class Model:
    def eval(self):
        pass
    def __call__(self, inputs):
        return inputs

# ruleid: gci100-python-data-ai-pytorch-wrap-pytorch-inference-in-torch-no-grad
def non_compliant_inference():
    model = Model()
    model.eval()
    for inputs in range(10):
        outputs = model(inputs)

# ok: gci100-python-data-ai-pytorch-wrap-pytorch-inference-in-torch-no-grad
def compliant_inference():
    model = Model()
    model.eval()
    with torch.no_grad():
        for inputs in range(10):
            outputs = model(inputs)
