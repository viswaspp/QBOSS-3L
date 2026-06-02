import numpy as np

stored = np.load("models/gesture_sequence.npy", allow_pickle=True)

print("Stored gesture sequence:", stored.tolist())