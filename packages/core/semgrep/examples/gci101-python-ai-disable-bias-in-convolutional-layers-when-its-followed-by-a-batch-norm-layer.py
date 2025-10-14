import torch.nn as nn

class NonCompliantModel(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size):
        super().__init__()
        self.layer = nn.Sequential(
# ruleid: gci101-python-ai-disable-bias-in-convolutional-layers-when-its-followed-by-a-batch-norm-layer
            nn.Conv2d(in_channels, out_channels, kernel_size, bias=True),
            nn.BatchNorm2d(out_channels),
            nn.ReLU()
        )

# ok: gci101-python-ai-disable-bias-in-convolutional-layers-when-its-followed-by-a-batch-norm-layer
class CompliantModel(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size):
        super().__init__()
        self.layer = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, kernel_size, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU()
        )
