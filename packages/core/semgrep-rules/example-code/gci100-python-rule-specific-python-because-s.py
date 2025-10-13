# Non-compliant examples
model.eval()
for inputs in dataloader:
    outputs = model(inputs)


# Compliant solutions
model.eval()
with torch.no_grad():
    for inputs in dataloader:
        outputs = model(inputs)
