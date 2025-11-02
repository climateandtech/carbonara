import torch.utils.data

# Dummy dataset for example
class MyDataset(torch.utils.data.Dataset):
    def __len__(self):
        return 10
    def __getitem__(self, idx):
        return idx

def non_compliant_dataloader():
    dataset = MyDataset()
# ruleid: gci102-python-ai-use-pinned-memory-on-dataloader-when-using-gpu
    train_loader = torch.utils.data.DataLoader(
        dataset,
        batch_size=64,
        shuffle=True,
        pin_memory=False  # Not using pinned memory
    )

# ok: gci102-python-ai-use-pinned-memory-on-dataloader-when-using-gpu
def compliant_dataloader():
    dataset = MyDataset()
    train_loader = torch.utils.data.DataLoader(
        dataset,
        batch_size=64,
        shuffle=True,
        pin_memory=True  # Enables faster transfer to GPU
    )
