import librosa
import numpy as np
from utils.config import SAMPLE_RATE

def extract_voice_features(path):
    y, sr = librosa.load(path, sr=SAMPLE_RATE)

    # MFCC
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    mfcc_mean = mfcc.mean(axis=1)

    # Delta
    delta = librosa.feature.delta(mfcc)
    delta_mean = delta.mean(axis=1)

    # RMS
    rms = librosa.feature.rms(y=y).mean()

    # Pitch
    pitches, _ = librosa.piptrack(y=y, sr=sr)
    pitch = pitches[pitches > 0].mean() if pitches[pitches > 0].any() else 0

    # Final vector
    VF = np.concatenate([mfcc_mean, delta_mean, [rms, pitch]])
    return VF