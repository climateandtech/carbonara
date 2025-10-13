# Non-compliant examples
train_loader = torch.utils.data.DataLoader(
    dataset,
    batch_size=64,
    shuffle=True,
    pin_memory=False  # Not using pinned memory
)


# Compliant solutions
train_loader = torch.utils.data.DataLoader(
    dataset,
    batch_size=64,
    shuffle=True,
    pin_memory=True  # Enables faster transfer to GPU
)
