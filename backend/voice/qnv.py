import base64
import hashlib
import json
import secrets
from datetime import datetime, timezone
from typing import Iterable

import numpy as np

from .features import VOICE_FEATURE_DIM, VOICE_FEATURE_VERSION, extract_voice_biometrics

QNV_PROFILE_VERSION = "qnv-voice-profile-v3"
SUPPORTED_QNV_PROFILE_VERSIONS = {QNV_PROFILE_VERSION, "qnv-voice-profile-v2"}
QNV_DIM = 160


def _seed_from(*parts: object) -> int:
    h = hashlib.blake2b(digest_size=16)
    for part in parts:
        h.update(str(part).encode("utf-8"))
        h.update(b"\0")
    return int.from_bytes(h.digest(), "little")


def _matrix_for(salt: str, user_id: int, input_dim: int, output_dim: int = QNV_DIM) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(_seed_from("qnv-matrix", salt, user_id, input_dim, output_dim))
    matrix = rng.normal(0.0, 1.0 / np.sqrt(input_dim), size=(output_dim, input_dim))
    phase = rng.uniform(-np.pi, np.pi, size=output_dim)
    return matrix.astype(np.float64), phase.astype(np.float64)


def qnv_project(vector: np.ndarray, salt: str, user_id: int) -> np.ndarray:
    vector = np.asarray(vector, dtype=np.float64)
    matrix, phase = _matrix_for(salt, user_id, vector.size)
    projected = matrix @ vector
    # Quantum-inspired phase mixing: deterministic random phase, nonlinear bounded output.
    mixed = np.sin(projected + phase) * np.cos(projected * 0.5 - phase)
    norm = np.linalg.norm(mixed)
    return (mixed / (norm + 1e-9)).astype(np.float64)


def _quality_penalty(quality: dict) -> float:
    duration = float(quality.get("duration_sec", 0.0))
    rms = float(quality.get("rms", 0.0))
    clipping = float(quality.get("clipping_ratio", 0.0))
    silence = float(quality.get("silence_ratio", 1.0))
    voiced = float(quality.get("voiced_ratio", 0.0))
    flatness = float(quality.get("spectral_flatness", 1.0))

    penalty = 0.0
    if duration < 2.2:
        penalty += min(0.30, (2.2 - duration) * 0.12)
    if rms < 0.012:
        penalty += 0.18
    if clipping > 0.02:
        penalty += min(0.25, clipping * 5.0)
    if silence > 0.72:
        penalty += min(0.25, (silence - 0.72) * 0.7)
    if voiced < 0.16:
        penalty += min(0.25, (0.16 - voiced) * 1.2)
    if flatness > 0.45:
        penalty += min(0.20, (flatness - 0.45) * 0.35)
    return float(min(1.0, penalty))


def _cosine_distance(a: np.ndarray, b: np.ndarray) -> float:
    return float(1.0 - np.dot(a, b) / ((np.linalg.norm(a) * np.linalg.norm(b)) + 1e-9))


def _z_distance(value: np.ndarray, mean: np.ndarray, std: np.ndarray, floor: float) -> float:
    z = (value - mean) / (std + floor)
    return float(np.sqrt(np.mean(np.square(z))))


def _to_jsonable(values: np.ndarray) -> list[float]:
    return [float(v) for v in np.asarray(values, dtype=np.float64)]


def create_voice_profile(user_id: int, audio_paths: Iterable[str]) -> dict:
    biometrics = [extract_voice_biometrics(path) for path in audio_paths]
    if len(biometrics) < 3:
        raise ValueError("Need at least 3 voice samples for QNV enrollment.")

    vectors = np.vstack([b["vector"] for b in biometrics])
    if vectors.shape[1] != VOICE_FEATURE_DIM:
        raise ValueError("Voice feature dimension mismatch during enrollment.")

    salt = base64.urlsafe_b64encode(secrets.token_bytes(24)).decode("ascii")
    qnv_vectors = np.vstack([qnv_project(v, salt, user_id) for v in vectors])

    qualities = [b["quality"] for b in biometrics]
    fingerprints = [b["fingerprint"] for b in biometrics]
    spread = float(np.sqrt(np.mean(np.var(vectors, axis=0))))
    qnv_spread = float(np.sqrt(np.mean(np.var(qnv_vectors, axis=0))))
    avg_quality_penalty = float(np.mean([_quality_penalty(q) for q in qualities]))

    return {
        "version": QNV_PROFILE_VERSION,
        "feature_version": VOICE_FEATURE_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_id": int(user_id),
        "sample_count": len(biometrics),
        "feature_dim": int(vectors.shape[1]),
        "qnv_dim": QNV_DIM,
        "salt": salt,
        "mean": _to_jsonable(vectors.mean(axis=0)),
        "std": _to_jsonable(np.maximum(vectors.std(axis=0), 1e-4)),
        "qnv_mean": _to_jsonable(qnv_vectors.mean(axis=0)),
        "qnv_std": _to_jsonable(np.maximum(qnv_vectors.std(axis=0), 1e-4)),
        "sample_fingerprints": fingerprints,
        "quality": {
            "rating": "Excellent" if avg_quality_penalty < 0.08 and spread < 0.32 else "Good" if avg_quality_penalty < 0.18 else "Fair",
            "acoustic_spread": round(spread, 6),
            "qnv_spread": round(qnv_spread, 6),
            "quality_penalty": round(avg_quality_penalty, 6),
            "samples": qualities,
        },
    }


def encode_profile(profile: dict) -> bytes:
    return json.dumps(profile, separators=(",", ":"), sort_keys=True).encode("utf-8")


def decode_profile(data: bytes) -> dict | None:
    try:
        profile = json.loads(data.decode("utf-8"))
    except Exception:
        return None
    if profile.get("version") not in SUPPORTED_QNV_PROFILE_VERSIONS:
        return None
    return profile


def verify_against_profile(profile: dict, user_id: int, audio_path: str) -> dict:
    live = extract_voice_biometrics(audio_path)
    vector = live["vector"]
    qnv_vector = qnv_project(vector, profile["salt"], user_id)

    mean = np.array(profile["mean"], dtype=np.float64)
    std = np.array(profile["std"], dtype=np.float64)
    qnv_mean = np.array(profile["qnv_mean"], dtype=np.float64)
    qnv_std = np.array(profile["qnv_std"], dtype=np.float64)

    acoustic_z = _z_distance(vector, mean, std, floor=0.18)
    qnv_z = _z_distance(qnv_vector, qnv_mean, qnv_std, floor=0.08)
    qnv_cosine = _cosine_distance(qnv_vector, qnv_mean)
    replay_match = live["fingerprint"] in set(profile.get("sample_fingerprints", []))
    quality_penalty = _quality_penalty(live["quality"])

    acoustic_score = min(1.0, acoustic_z / 3.4)
    qnv_score = min(1.0, (0.58 * qnv_z / 3.2) + (0.42 * qnv_cosine / 0.42))
    replay_penalty = 0.35 if replay_match else 0.0
    fusion_score = float(min(1.0, 0.42 * acoustic_score + 0.38 * qnv_score + 0.20 * quality_penalty + replay_penalty))

    verified = (
        fusion_score <= 0.62
        and acoustic_z <= 3.75
        and qnv_z <= 3.65
        and qnv_cosine <= 0.46
        and quality_penalty <= 0.62
        and not replay_match
    )

    confidence = float(max(0.0, min(1.0, 1.0 - fusion_score)))

    return {
        "success": True,
        "verified": bool(verified),
        "confidence": round(confidence, 4),
        "distance": round(fusion_score * 100, 4),
        "qnv_score": round(float(qnv_score), 4),
        "acoustic_score": round(float(acoustic_score), 4),
        "quality_penalty": round(float(quality_penalty), 4),
        "acoustic_z": round(float(acoustic_z), 4),
        "qnv_z": round(float(qnv_z), 4),
        "qnv_cosine": round(float(qnv_cosine), 4),
        "replay_detected": bool(replay_match),
        "quality": live["quality"],
        "engine": QNV_PROFILE_VERSION,
        "message": "Quantum Noise Voice verified!" if verified else "Quantum Noise Voice mismatch",
    }


def generate_qnv(size):
    """Legacy helper retained for older imports."""
    rng = np.random.default_rng()
    qnv = rng.normal(0, 1, size)
    qnv += rng.uniform(-1, 1, size)
    rng.shuffle(qnv)
    return qnv
