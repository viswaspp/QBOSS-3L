import numpy as np

def generate_qnv(size):
    qnv = np.random.normal(0, 1, size)
    qnv += np.random.uniform(-1, 1, size)
    np.random.shuffle(qnv)
    return qnv