import hashlib
from typing import Any

import librosa
import numpy as np

from .config import SAMPLE_RATE

N_MFCC = 24
LEGACY_N_MFCC = 13
VOICE_FEATURE_VERSION = "qnv-acoustic-v3"
VOICE_FEATURE_DIM = 194
LEGACY_CURRENT_VOICE_FEATURE_DIM = 2 * 20 + 1
LEGACY_VOICE_FEATURE_DIM = 2 * LEGACY_N_MFCC + 2


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        value = float(value)
    except (TypeError, ValueError):
        return default
    return value if np.isfinite(value) else default


def _load_voice(path: str) -> tuple[np.ndarray, int]:
    y, sr = librosa.load(path, sr=SAMPLE_RATE, mono=True)
    if y.size == 0:
        y = np.zeros(SAMPLE_RATE, dtype=np.float32)

    y = np.asarray(y, dtype=np.float32)
    y = np.nan_to_num(y)

    min_samples = int(sr * 1.2)
    if len(y) < min_samples:
        y = np.pad(y, (0, min_samples - len(y)))

    trimmed, _ = librosa.effects.trim(y, top_db=28)
    if len(trimmed) >= int(sr * 0.6):
        y = trimmed

    peak = float(np.max(np.abs(y))) if y.size else 0.0
    if peak > 1e-5:
        y = np.clip(y / peak, -1.0, 1.0)

    return y.astype(np.float32), sr


def _summarize(values: np.ndarray) -> list[float]:
    values = np.asarray(values, dtype=np.float64)
    if values.size == 0:
        return [0.0, 0.0]
    return [_safe_float(values.mean()), _safe_float(values.std())]


def _pitch_stats(y: np.ndarray, sr: int) -> tuple[list[float], float]:
    try:
        f0, voiced_flag, voiced_prob = librosa.pyin(
            y,
            fmin=librosa.note_to_hz("C2"),
            fmax=librosa.note_to_hz("C7"),
            sr=sr,
            frame_length=1024,
            hop_length=256,
        )
        voiced = f0[np.isfinite(f0)]
        voiced_ratio = float(np.mean(voiced_flag)) if voiced_flag is not None and len(voiced_flag) else 0.0
        prob_mean = float(np.nanmean(voiced_prob)) if voiced_prob is not None and len(voiced_prob) else 0.0
        if voiced.size == 0:
            return [0.0] * 6, voiced_ratio

        log_f0 = np.log(voiced + 1e-6)
        diffs = np.diff(log_f0)
        stats = [
            _safe_float(log_f0.mean()),
            _safe_float(log_f0.std()),
            _safe_float(np.percentile(log_f0, 10)),
            _safe_float(np.percentile(log_f0, 90)),
            _safe_float(np.mean(np.abs(diffs))) if diffs.size else 0.0,
            _safe_float(prob_mean),
        ]
        return stats, voiced_ratio
    except Exception:
        return [0.0] * 6, 0.0


def _audio_fingerprint(y: np.ndarray) -> str:
    if y.size == 0:
        return hashlib.sha256(b"").hexdigest()
    resampled = librosa.resample(y, orig_sr=SAMPLE_RATE, target_sr=2000)
    if resampled.size == 0:
        return hashlib.sha256(b"").hexdigest()
    resampled = resampled / (np.max(np.abs(resampled)) + 1e-9)
    quantized = np.clip(np.round(resampled * 127), -128, 127).astype(np.int8)
    return hashlib.sha256(quantized.tobytes()).hexdigest()


def extract_voice_biometrics(path: str) -> dict:
    """Extract a modern voice biometric vector plus quality/liveness indicators.

    The vector combines cepstral, dynamics, spectral-shape, mel-energy, and pitch
    statistics. It is deterministic and normalised so it can be protected by the
    quantum-inspired stochastic projection in voice.qnv.
    """
    y, sr = _load_voice(path)
    y_pre = np.append(y[0], y[1:] - 0.97 * y[:-1]).astype(np.float32)

    mfcc = librosa.feature.mfcc(y=y_pre, sr=sr, n_mfcc=N_MFCC, n_fft=512, hop_length=160, win_length=400)
    delta = librosa.feature.delta(mfcc)
    delta2 = librosa.feature.delta(mfcc, order=2)

    mel = librosa.feature.melspectrogram(y=y_pre, sr=sr, n_mels=16, n_fft=512, hop_length=160)
    log_mel = librosa.power_to_db(mel, ref=np.max)

    spectral_series = [
        librosa.feature.spectral_centroid(y=y_pre, sr=sr, n_fft=512, hop_length=160)[0],
        librosa.feature.spectral_bandwidth(y=y_pre, sr=sr, n_fft=512, hop_length=160)[0],
        librosa.feature.spectral_rolloff(y=y_pre, sr=sr, n_fft=512, hop_length=160)[0],
        librosa.feature.spectral_flatness(y=y_pre, n_fft=512, hop_length=160)[0],
        librosa.feature.zero_crossing_rate(y_pre, frame_length=512, hop_length=160)[0],
        librosa.feature.rms(y=y_pre, frame_length=512, hop_length=160)[0],
    ]
    pitch_features, voiced_ratio = _pitch_stats(y_pre, sr)

    vector = np.concatenate([
        mfcc.mean(axis=1), mfcc.std(axis=1),
        delta.mean(axis=1), delta.std(axis=1),
        delta2.mean(axis=1), delta2.std(axis=1),
        log_mel.mean(axis=1), log_mel.std(axis=1),
        np.array([v for series in spectral_series for v in _summarize(series)], dtype=np.float64),
        np.array(pitch_features, dtype=np.float64),
    ])

    if vector.size != VOICE_FEATURE_DIM:
        raise RuntimeError(f"voice feature dimension mismatch: got {vector.size}, expected {VOICE_FEATURE_DIM}")

    vector = np.nan_to_num(vector.astype(np.float64))
    median = np.median(vector)
    iqr = np.percentile(vector, 75) - np.percentile(vector, 25)
    vector = (vector - median) / (iqr + 1e-6)
    vector = np.tanh(vector / 3.0)

    duration = len(y) / float(sr)
    rms = float(np.sqrt(np.mean(np.square(y)))) if y.size else 0.0
    clipping_ratio = float(np.mean(np.abs(y) > 0.98)) if y.size else 0.0
    silence_ratio = float(np.mean(np.abs(y) < 0.01)) if y.size else 1.0
    spectral_flatness = float(np.mean(spectral_series[3])) if len(spectral_series[3]) else 1.0
    zcr = float(np.mean(spectral_series[4])) if len(spectral_series[4]) else 0.0

    quality = {
        "duration_sec": round(_safe_float(duration), 3),
        "rms": round(_safe_float(rms), 6),
        "clipping_ratio": round(_safe_float(clipping_ratio), 5),
        "silence_ratio": round(_safe_float(silence_ratio), 5),
        "voiced_ratio": round(_safe_float(voiced_ratio), 5),
        "spectral_flatness": round(_safe_float(spectral_flatness), 6),
        "zero_crossing_rate": round(_safe_float(zcr), 6),
    }

    return {
        "vector": vector.astype(np.float64),
        "quality": quality,
        "fingerprint": _audio_fingerprint(y),
        "feature_version": VOICE_FEATURE_VERSION,
    }


def extract_voice_features(path):
    """Compatibility wrapper returning only the current acoustic vector."""
    return extract_voice_biometrics(path)["vector"]


def extract_legacy_current_voice_features(path):
    """Extract the 41-dim MFCC+delta+RMS vector used before QNV profiles."""
    y, sr = librosa.load(path, sr=SAMPLE_RATE)

    min_samples = sr
    if len(y) < min_samples:
        y = np.pad(y, (0, min_samples - len(y)))

    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20)
    mfcc_mean = mfcc.mean(axis=1)

    delta = librosa.feature.delta(mfcc)
    delta_mean = delta.mean(axis=1)

    rms = librosa.feature.rms(y=y).mean()
    log_rms = np.log1p(float(rms) * 1000)

    vf = np.concatenate([mfcc_mean, delta_mean, [log_rms]])
    std = vf.std()
    if std > 1e-8:
        vf = (vf - vf.mean()) / std

    return vf.astype(np.float64)


def extract_legacy_voice_features(path):
    """Extract the older 28-dim voice vector used by existing enrollments."""
    y, sr = librosa.load(path, sr=SAMPLE_RATE)

    min_samples = sr
    if len(y) < min_samples:
        y = np.pad(y, (0, min_samples - len(y)))

    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=LEGACY_N_MFCC)
    mfcc_mean = mfcc.mean(axis=1)

    delta = librosa.feature.delta(mfcc)
    delta_mean = delta.mean(axis=1)

    rms = librosa.feature.rms(y=y).mean()

    pitches, _ = librosa.piptrack(y=y, sr=sr)
    pitch = pitches[pitches > 0].mean() if pitches[pitches > 0].any() else 0

    VF = np.concatenate([mfcc_mean, delta_mean, [rms, pitch]])
    return VF.astype(np.float64)
