# Non-compliant examples
nn.Sequential(
    nn.Conv2d(in_channels, out_channels, kernel_size, bias=True),
    nn.BatchNorm2d(out_channels),
    nn.ReLU()
)


# Compliant solutions
nn.Sequential(
    nn.Conv2d(in_channels, out_channels, kernel_size, bias=False),
    nn.BatchNorm2d(out_channels),
    nn.ReLU()
)
