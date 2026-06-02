import numpy as np


def fuse_voice_qnv(VF, QNV):
    """Legacy helper: bounded feature/noise fusion for old callers."""
    fused = np.asarray(VF, dtype=np.float64) + 0.15 * np.asarray(QNV, dtype=np.float64)
    norm = np.linalg.norm(fused)
    return fused / (norm + 1e-9)
