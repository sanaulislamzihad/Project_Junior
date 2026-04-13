import torch
import sys

print("="*40)
print("PROJECT_JUNIOR GPU ACCELERATION CHECK")
print("="*40)
print(f"Python version: {sys.version}")
print(f"PyTorch version: {torch.__version__}")
print(f"CUDA Available: {torch.cuda.is_available()}")

if torch.cuda.is_available():
    print(f"GPU Device Count: {torch.cuda.device_count()}")
    print(f"GPU Model: {torch.cuda.get_device_name(0)}")
    print(f"Current CUDA device: {torch.cuda.current_device()}")
    
    # Run a small tensor operation on GPU to be 100% sure
    try:
        x = torch.randn(1, 4).cuda()
        print("Success: Able to allocate tensors on CUDA.")
    except Exception as e:
        print(f"Error allocating on CUDA: {e}")
else:
    print("WARNING: CUDA not detected. System is still running on CPU.")

try:
    import faiss
    print(f"FAISS version: {faiss.__version__}")
    # Note: on windows faiss-gpu is hard to install via pip for python 3.14
    # so we often stick to faiss-cpu + GPU torch for max performance
    print("FAISS Status: Installed")
except ImportError:
    print("FAISS Status: Missing")

print("="*40)
