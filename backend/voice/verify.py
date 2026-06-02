import os

import numpy as np
from numpy.linalg import norm

from db.biometric_store import is_enrolled, load_biometric, log_verification, save_biometric

from .config import BASE_DIR, LEGACY_THRESHOLD, THRESHOLD
from .features import (
    LEGACY_CURRENT_VOICE_FEATURE_DIM,
    LEGACY_VOICE_FEATURE_DIM,
    VOICE_FEATURE_VERSION,
    extract_legacy_current_voice_features,
    extract_legacy_voice_features,
    extract_voice_features,
)
from .qnv import QNV_PROFILE_VERSION, create_voice_profile, decode_profile, encode_profile, verify_against_profile

MODALITY = "voice"


def _qnv_meta(profile: dict) -> dict:
    return {
        "engine": profile["version"],
        "feature_version": profile["feature_version"],
        "sample_count": profile["sample_count"],
        "feature_dim": profile["feature_dim"],
        "qnv_dim": profile["qnv_dim"],
        "quality_rating": profile["quality"]["rating"],
    }


def _saved_enrollment_paths(user_id: int) -> list[str]:
    enroll_dir = os.path.join(BASE_DIR, "audio", "enroll", str(user_id))
    paths = [os.path.join(enroll_dir, f"enroll_{index}.wav") for index in range(1, 4)]
    return [path for path in paths if os.path.exists(path)]


def _upgrade_qnv_profile_if_needed(user_id: int, profile: dict) -> dict:
    current = (
        profile.get("version") == QNV_PROFILE_VERSION
        and profile.get("feature_version") == VOICE_FEATURE_VERSION
    )
    if current:
        return profile

    paths = _saved_enrollment_paths(user_id)
    if len(paths) < 3:
        return profile

    upgraded = create_voice_profile(user_id, paths)
    save_biometric(user_id, MODALITY, encode_profile(upgraded), meta=_qnv_meta(upgraded))
    return upgraded


def _legacy_result(user_id: int, VF_enroll: np.ndarray, VF_test: np.ndarray, audio_path: str = None) -> dict:
    threshold = THRESHOLD
    feature_version = "legacy-current-vector"
    if VF_enroll.shape != VF_test.shape:
        if VF_enroll.size == LEGACY_CURRENT_VOICE_FEATURE_DIM and audio_path:
            VF_test = extract_legacy_current_voice_features(audio_path)
            threshold = THRESHOLD
            feature_version = "legacy-mfcc-rms"
        elif VF_enroll.size == LEGACY_VOICE_FEATURE_DIM and audio_path:
            VF_test = extract_legacy_voice_features(audio_path)
            threshold = LEGACY_THRESHOLD
            feature_version = "legacy-with-pitch"
        else:
            detail = f"feature_dim_mismatch enroll={VF_enroll.size} live={VF_test.size}"
            log_verification(user_id, MODALITY, False, detail)
            return {"success": False, "verified": False, "distance": -1, "confidence": 0.0, "error": detail}

    if feature_version == "legacy-with-pitch":
        compare_enroll = VF_enroll[:-1]
        compare_test = VF_test[:-1]
    else:
        compare_enroll = VF_enroll
        compare_test = VF_test

    distance = float(norm(compare_enroll - compare_test))
    verified = distance < threshold
    confidence = max(0.0, min(1.0, 1.0 - (distance / max(threshold, 1e-9))))
    log_verification(user_id, MODALITY, verified, f"distance={distance:.4f} feature={feature_version}")
    return {
        "success": True,
        "verified": bool(verified),
        "distance": round(distance, 4),
        "confidence": round(confidence, 4),
        "engine": feature_version,
        "message": "Voice verified!" if verified else "Voice mismatch",
    }


def verify_voice(user_id: int, VF_test=None, audio_path: str = None) -> dict:
    if not is_enrolled(user_id, MODALITY):
        return {"success": False, "verified": False, "distance": -1, "confidence": 0.0, "error": "Voice not enrolled for this user."}

    data = load_biometric(user_id, MODALITY)
    if data is None:
        return {"success": False, "verified": False, "distance": -1, "confidence": 0.0, "error": "Could not load voice template."}

    profile = decode_profile(data)
    if profile is not None:
        if not audio_path:
            return {"success": False, "verified": False, "distance": -1, "confidence": 0.0, "error": "Live audio path required for QNV voice verification."}
        profile = _upgrade_qnv_profile_if_needed(user_id, profile)
        result = verify_against_profile(profile, user_id, audio_path)
        detail = (
            f"fusion={result['distance']:.4f} confidence={result['confidence']:.4f} "
            f"qnv={result['qnv_score']:.4f} acoustic={result['acoustic_score']:.4f} "
            f"quality={result['quality_penalty']:.4f} replay={result['replay_detected']}"
        )
        log_verification(user_id, MODALITY, result["verified"], detail)
        return result

    if VF_test is None and audio_path:
        VF_test = extract_voice_features(audio_path)
    if VF_test is None:
        return {"success": False, "verified": False, "distance": -1, "confidence": 0.0, "error": "Live voice features required for legacy verification."}

    VF_enroll = np.frombuffer(data, dtype=np.float64).copy()
    return _legacy_result(user_id, VF_enroll, np.asarray(VF_test, dtype=np.float64), audio_path)


def check_voice_enrolled(user_id: int) -> bool:
    return is_enrolled(user_id, MODALITY)
