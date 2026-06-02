import numpy as np
from numpy.linalg import norm
from utils.config import THRESHOLD, ENROLL_PATH

def verify_voice(VF_test):
    VF_enroll = np.load(ENROLL_PATH)

    distance = norm(VF_enroll - VF_test)
    print("Distance:", distance)

    return distance < THRESHOLD
